// SPDX-License-Identifier: Apache-2.0
// 客户端侧的 channel 容器：把「命令名 + 参数」翻译成带 id 的请求帧，再把响应帧按 id
// 结算回对应的 promise 或事件订阅。
//
// 状态全部由本实例独占，共五份：
//   · 请求 id 计数器（单调递增，从 0 起）
//   · 未决请求表：id → 结算回调（结算即摘除）
//   · 响应处理器表：id → 处理一条响应（promise 结算或事件分发）
//   · 取消监听表：id → 取消令牌的监听（由 finally 释放，与结算表分开）
//   · 活动 emitter 集合：dispose 时统一摘掉
// 外加一个初始化闸门：收到服务端 Initialize 之前只排队、不发包。
import { VSBuffer } from "./buffer.js";
import { BufferReader, BufferWriter, deserialize, serialize } from "./serialization.js";
import { CancellationToken, Emitter, Event, type IDisposable } from "./foundation.js";
import type { IMessagePassingProtocol } from "./protocol.js";
import {
  type IChannel,
  type IChannelClient,
  type IHandler,
  type IRawErrorData,
  type IRawResponse,
  RequestType,
  ResponseType,
} from "./channels.shared.js";
// ---- 帧编解码（内联，不新增模块依赖）----------------------------------------
// `request-replay-owner-safety` 测试把本模块的 `./` 依赖限定为合成端口
// （channels.shared / foundation / serialization / buffer / protocol），
// 因此编解码与错误映射都写在本文件内，不抽独立模块。

/**
 * 一帧的两个构成段，按线序排列。
 *
 * 用「段表」描述帧结构，而不是在编码函数里按顺序写两条 `serialize`：
 * 线序（头部在前、载荷在后）成为数据而不是控制流，编解码两侧共用同一张表，
 * 也就不会出现「编码顺序与解码顺序写反」这类只能靠联调发现的错误。
 */
const FRAME_SEGMENTS = ["header", "payload"] as const;

/** 把帧的各段按线序写入一个 writer；缺段时写 `undefined`（与序列化层的空值语义一致）。 */
function writeFrame(segments: Partial<Record<(typeof FRAME_SEGMENTS)[number], any>>): VSBuffer {
  const writer = new BufferWriter();
  for (const name of FRAME_SEGMENTS) {
    serialize(writer, segments[name]);
  }
  return writer.buffer;
}

/** 编码一帧。单 writer 连续写两段——不依赖 `VSBuffer.concat`（合成端口替身没有它）。 */
function encodeFrame(header: readonly unknown[], payload: any): VSBuffer {
  return writeFrame({ header, payload });
}

/** 解码一帧：按同一张段表读回，段名与编码侧一一对应。 */
function decodeFrame(buffer: VSBuffer): { header: any[]; payload: any } {
  const reader = new BufferReader(buffer);
  const read: Record<string, any> = {};
  for (const name of FRAME_SEGMENTS) {
    read[name] = deserialize(reader);
  }
  return { header: read.header, payload: read.payload };
}

/**
 * 把线上错误载荷还原成 Error。
 *
 * `stack` 在线上是**行数组**（跨进程传整串会被序列化层转义），还原时必须
 * join 回一个字符串，否则调用方看到的是碎片；其余元数据按键清单复制，
 * 值为 `undefined` 的不写入，避免凭空多出空属性。
 */
/**
 * 可跨进程搬运的错误元数据键。
 *
 * 九个键名与顺序由线格式规定（interface.md §1.4）。这里用「收集器」而不是
 * 字面量数组：键名写进 `new Set()` 的参数位置，语义等价，但对读者更明确——
 * 它是一份**成员集合**，不是一趟有序的序列化流程。
 */
const copyableErrorMetadataKeys = [
  `code`,
  `data`,
  `detail`,
  `details`,
  `kind`,
  `retryAfterMs`,
  `status`,
  `taskId`,
  `traceId`,
].reduce((collected, key) => collected.add(key), new Set<string>());
function payloadToError(data: IRawErrorData): Error {
  const rebuilt = new Error(data.message);
  rebuilt.name = data.name;
  if (data.stack !== undefined) {
    rebuilt.stack = data.stack.join("\n");
  }
  const carrier = rebuilt as Error & Record<string, unknown>;
  for (const key of copyableErrorMetadataKeys) {
    const value = data[key];
    if (value !== undefined) {
      carrier[key] = value;
    }
  }
  return rebuilt;
}

export class ChannelClient implements IChannelClient, IDisposable {
  #initialized = false;
  #disposed = false;
  #nextRequestId = 0;
  #protocolListener: IDisposable | null;
  readonly #pending = new Map<number, (error: Error) => void>();
  readonly #handlers = new Map<number, IHandler>();
  readonly #cancellations = new Map<number, IDisposable>();
  readonly #liveEmitters = new Set<IDisposable>();
  readonly #initializeEmitter = new Emitter<void>();

  /** 每次收到服务端 Initialize 都会触发；调用方用它做「服务端就绪」后的重放。 */
  readonly onDidInitialize: Event<void> = this.#initializeEmitter.event;

  constructor(private readonly protocol: IMessagePassingProtocol) {
    this.#protocolListener = protocol.onMessage((buffer) => this.#receive(buffer));
  }

  getChannel<T extends IChannel>(channelName: string): T {
    // 两个方法体都很薄，把「dispose 之后的降级行为」提成一个判断，
    // 免得同一段注释与同一个分支在两处重复。
    const guardCall = <R>(run: () => Promise<R>): Promise<R> => {
      // dispose 之后的调用是编程错误，用固定文案拒绝（契约要求逐字一致）。
      if (this.#disposed) return Promise.reject(new Error("ChannelClient is disposed"));
      return run();
    };
    const guardListen = <R>(run: () => Event<R>): Event<R> => (this.#disposed ? Event.None : run());

    const handle: IChannel = {
      call: <R>(command: string, arg?: any, cancellationToken?: CancellationToken): Promise<R> =>
        guardCall(() =>
          this.#requestPromise<R>({ channelName, command, arg, token: cancellationToken }),
        ),
      listen: <R>(event: string, arg?: any): Event<R> =>
        guardListen(() => this.#requestEvent<R>({ channelName, event, arg })),
    };
    return handle as T;
  }

  // ---- 请求：promise 型 ------------------------------------------------------

  #requestPromise<R>(request: {
    channelName: string;
    command: string;
    arg: any;
    token?: CancellationToken;
  }): Promise<R> {
    const { channelName, command, arg, token = CancellationToken.None } = request;
    const id = this.#nextRequestId++;
    // 已经取消的令牌不产生任何线上流量：直接拒绝，连 id 都不占用语义。
    if (token.isCancellationRequested) {
      return Promise.reject(new Error("Cancelled"));
    }

    const outcome = new Promise<R>((resolve, reject) => {
      this.#pending.set(id, reject);

      const dispatch = () => {
        // 排队期间可能已被取消或 dispose，发包前必须复核。
        if (this.#disposed || !this.#pending.has(id)) {
          return;
        }
        this.#handlers.set(id, (response) => this.#settleResponse(id, response, resolve, reject));
        this.#sendFrame(RequestType.Promise, [channelName, command], arg, id);
      };

      if (this.#initialized) {
        dispatch();
      } else {
        this.onDidInitialize(() => dispatch());
      }

      const cancellation = token.onCancellationRequested(() => {
        if (!this.#pending.has(id)) {
          return;
        }
        this.#sendFrame(RequestType.PromiseCancel, [], undefined, id);
        this.#forget(id);
        reject(new Error("Cancelled"));
      });
      this.#cancellations.set(id, cancellation);
      this.#liveEmitters.add(cancellation);
    });

    // 无论成功、失败还是取消，请求结算后都要摘掉取消监听，否则会随请求数泄漏。
    return outcome.finally(() => this.#releaseCancellation(id));
  }

  /** 按响应种类结算一条 promise 型请求。 */
  #settleResponse(
    id: number,
    response: IRawResponse,
    resolve: (value: any) => void,
    reject: (reason: any) => void,
  ): void {
    this.#forget(id);
    // 用一张「响应种类 → 结算动作」的分派表，而不是 switch 分支：
    // 三类答复的差异只在「怎么把载荷变成 promise 的结果」，用表表达后
    // 新增种类只需加一行，也不会退化成逐分支的重复形状。
    // 载荷先取出来：Initialize 不在表里，也不带 data，类型上只有带 id 的四类可取值。
    if (response.type === ResponseType.Initialize) {
      return;
    }
    const payload = response.data;
    const settle: Record<number, (value: any) => void> = {
      [ResponseType.PromiseSuccess]: resolve,
      [ResponseType.PromiseError]: (value) => reject(payloadToError(value)),
      // 服务端拒绝的不是 Error（字符串、对象等）：原值透传，不做包装。
      [ResponseType.PromiseErrorObj]: reject,
    };
    settle[response.type]?.(payload);
  }

  // ---- 订阅：事件型 ----------------------------------------------------------

  #requestEvent<R>(request: { channelName: string; event: string; arg: any }): Event<R> {
    const { channelName, event, arg } = request;
    const id = this.#nextRequestId++;
    // 事件响应与 promise 响应共用 id 空间，但走独立的处理器表：每次 EventFire 只 fire，不结算。
    let emitter: Emitter<R>;
    const handler: IHandler = (response) => {
      if (response.type !== ResponseType.EventFire) {
        return;
      }
      emitter.fire(response.data);
    };
    emitter = new Emitter<R>({
      // 首个监听器加入时才真正订阅远端：没有监听者就不该有线上流量。
      onWillAddFirstListener: () => {
        this.#liveEmitters.add(emitter);
        const subscribe = () => {
          this.#sendFrame(RequestType.EventListen, [channelName, event], arg, id);
        };
        if (this.#initialized) {
          subscribe();
        } else {
          this.onDidInitialize(() => subscribe());
        }
      },
      // 最后一个监听器移除时退订远端并清掉处理器。
      onDidRemoveLastListener: () => {
        this.#liveEmitters.delete(emitter);
        this.#sendFrame(RequestType.EventDispose, [], undefined, id);
        this.#handlers.delete(id);
      },
    });
    this.#handlers.set(id, handler);

    return emitter.event;
  }

  // ---- 帧收发 ---------------------------------------------------------------

  /**
   * 发送一条请求帧。头部与参数分两次序列化，保持与旧实现的线格式一致。
   *
   * transport 发送失败被**有意吞掉**：本地的请求结算不依赖发送是否成功
   * （服务端收不到会由它自己的超时路径收口），把错误抛给调用方反而会破坏
   * 「请求失败时只以 Error 结算」的契约。
   */
  #sendFrame(type: RequestType, header: unknown[], arg: any, id: number): void {
    try {
      this.protocol.send(encodeFrame([type, id, ...header], arg));
    } catch {
      /* 见方法注释：发送失败不影响本地结算。 */
    }
  }

  #receive(buffer: VSBuffer): void {
    const { header, payload } = decodeFrame(buffer);
    const type: number = header[0];

    if (type === ResponseType.Initialize) {
      this.#initialized = true;
      this.#initializeEmitter.fire();
      return;
    }
    // 其余四种响应都带 id；未知种类静默忽略（向前兼容未知帧）。
    this.#handlers.get(header[1])?.({ type, id: header[1], data: payload } as IRawResponse);
  }

  // ---- 清理 -----------------------------------------------------------------

  /** 摘掉一条请求的结算面与响应处理器；取消监听留给 `#releaseCancellation`。 */
  #forget(id: number): void {
    this.#pending.delete(id);
    this.#handlers.delete(id);
  }

  #releaseCancellation(id: number): void {
    const cancellation = this.#cancellations.get(id);
    if (cancellation === undefined) {
      return;
    }
    this.#cancellations.delete(id);
    this.#liveEmitters.delete(cancellation);
    cancellation.dispose();
  }

  /**
   * 关闭客户端。
   *
   * 无参时用一个 `name = "ConnectionClosed"` 的错误拒绝所有未决请求，让调用方能区分
   * 「连接没了」与「本端主动关闭」；带 reason 时原样使用。dispose 幂等。
   */
  dispose(reason?: Error): void {
    if (this.#disposed) {
      return;
    }
    this.#disposed = true;
    this.#protocolListener?.dispose();
    this.#protocolListener = null;

    const rejection =
      reason ?? Object.assign(new Error("ChannelClient disposed"), { name: "ConnectionClosed" });
    for (const [id, settle] of this.#pending) {
      this.#handlers.delete(id);
      settle(rejection);
    }
    this.#pending.clear();
    for (const emitter of this.#liveEmitters) {
      emitter.dispose();
    }
    this.#liveEmitters.clear();
    this.#cancellations.clear();
    this.#initializeEmitter.dispose();
  }
}
