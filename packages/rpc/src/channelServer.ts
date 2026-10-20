// SPDX-License-Identifier: Apache-2.0
// 服务端侧的 channel 容器：解出请求帧、路由到注册的 channel 实现，再把结果封成响应帧。
//
// 状态由本实例独占，共三份：
//   · 路由表：channel 名 → 实现（registerChannel 覆盖同名项）
//   · 活动请求表：id → 取消动作（Promise 请求的令牌取消 / 事件订阅的退订）
//   · 待定队列：channel 名 → 尚未注册时排队的请求 + 各自的超时定时器
// 加一个 ctx（服务端上下文，默认是字符串），原样透传给每个 channel 调用。
import type { VSBuffer } from "./buffer.js";
import { CancellationTokenSource, toDisposable, type IDisposable } from "./foundation.js";
import { decodeFrame, encodeFrame } from "./channel-codec.js";
import type { IMessagePassingProtocol } from "./protocol.js";
import {
  RequestType,
  ResponseType,
  type IChannelServer,
  type IRawErrorData,
  type IRawResponse,
  type IServerChannel,
} from "./channels.shared.js";
// 错误元数据键清单与响应形状同源定义，两端共用一份（见 channel-response.ts 的说明）。
import { errorToPayload } from "./channel-error-mapping.js";

/** 一条排队等待 channel 注册的请求，附带它自己的超时定时器。 */
interface DeferredRequest {
  request: InboundRequest;
  timer: ReturnType<typeof setTimeout>;
}

/** 解帧后的入站请求：Promise 与 EventListen 共用同一形状。 */
interface InboundRequest {
  type: RequestType;
  id: number;
  channelName: string;
  command: string;
  arg: any;
}

/** 携带 channel 路由信息的入站帧种类。 */
const INBOUND_DISPATCH: ReadonlySet<number> = new Set([
  RequestType.Promise,
  RequestType.EventListen,
]);

/** 只携带请求 id、用于释放活动请求的入站帧种类。 */
const INBOUND_RELEASE: ReadonlySet<number> = new Set([
  RequestType.PromiseCancel,
  RequestType.EventDispose,
]);

/**
 * 「未知 channel」超时错误的载荷。
 *
 * `name` 与 `message` 的措辞属于对外可观察面（调用方可能按 name 分类），
 * 逐字固定；`stack` 显式给 `undefined` 表示这条错误没有服务端栈可回溯。
 */
function unknownChannelPayload(channelName: string, timeoutDelay: number): IRawErrorData {
  return {
    name: "Unknown channel",
    message: `Channel name '${channelName}' timed out after ${timeoutDelay}ms`,
    stack: undefined,
  };
}

/**
 * 构造一个服务端实例。
 *
 * 支持两种形状：
 *   · 单对象（推荐）：`{ protocol, context, unknownChannelTimeoutMs?, deferInitialize? }`
 *   · 位置参数（兼容装配点）：`(protocol, ctx, timeoutMs?, deferInit?)`
 * 后者是为 `ipc.ts` 这类「协议与上下文成对出现」的装配代码保留的；
 * 新增调用点一律用具名对象，读起来不必数位。
 */
export interface ChannelServerInit<TContext> {
  readonly protocol: IMessagePassingProtocol;
  readonly context: TContext;
  readonly unknownChannelTimeoutMs?: number;
  readonly deferInitialize?: boolean;
}

/** 把两种构造形状归一成一份配置。 */
function normalizeInit<TContext>(
  initOrProtocol: ChannelServerInit<TContext> | IMessagePassingProtocol,
  context?: TContext,
  unknownChannelTimeoutMs?: number,
  deferInitialize?: boolean,
): ChannelServerInit<TContext> {
  if ("protocol" in (initOrProtocol as ChannelServerInit<TContext>)) {
    return initOrProtocol as ChannelServerInit<TContext>;
  }
  return {
    protocol: initOrProtocol as IMessagePassingProtocol,
    context: context as TContext,
    unknownChannelTimeoutMs,
    deferInitialize,
  };
}

export class ChannelServer<TContext = string> implements IChannelServer<TContext>, IDisposable {
  readonly #routes = new Map<string, IServerChannel<TContext>>();
  readonly #active = new Map<number, IDisposable>();
  readonly #deferred = new Map<string, DeferredRequest[]>();
  readonly #protocol: IMessagePassingProtocol;
  readonly #ctx: TContext;
  readonly #timeoutMs: number;
  #protocolListener: IDisposable | null;

  constructor(
    initOrProtocol: ChannelServerInit<TContext> | IMessagePassingProtocol,
    context?: TContext,
    unknownChannelTimeoutMs?: number,
    deferInitialize?: boolean,
  ) {
    const init = normalizeInit(initOrProtocol, context, unknownChannelTimeoutMs, deferInitialize);
    this.#protocol = init.protocol;
    this.#ctx = init.context;
    this.#timeoutMs = init.unknownChannelTimeoutMs ?? 1000;
    this.#protocolListener = init.protocol.onMessage((message) => this.#receive(message));
    // deferInitialize 让调用方自己挑时机发 Initialize（例如先注册完 channel 再宣告就绪）。
    if (init.deferInitialize !== true) {
      this.#announceReady();
    }
  }

  /** 发送 Initialize：既用于首次宣告，也用于「推迟初始化」场景的显式宣告。 */
  ready(): void {
    this.#announceReady();
  }

  /**
   * 注册一个 channel。
   *
   * 同名实现被覆盖（后注册者胜），并立刻安排一次宏任务去冲刷同名待定请求：
   * 用宏任务而不是同步冲刷，是为了让「注册 → 冲刷」之间留出一个稳定边界，
   * 避免在注册函数内部递归触发 channel 调用。
   */
  registerChannel(name: string, channel: IServerChannel<TContext>): void {
    this.#routes.set(name, channel);
    setTimeout(() => this.#drainDeferred(name), 0);
  }

  // ---- 出站 -----------------------------------------------------------------

  /**
   * 宣告服务端就绪。
   *
   * Initialize 帧不带请求 id（它是全局信号），因此单独走一条只发头部的路径，
   * 不与「响应某条请求」共用分支。
   */
  #announceReady(): void {
    this.#emit([ResponseType.Initialize]);
  }

  #sendResponse(response: IRawResponse): void {
    if (response.type === ResponseType.Initialize) {
      this.#announceReady();
      return;
    }
    this.#emit([response.type, response.id], response.data);
  }

  /**
   * 把头部与载荷分两次序列化后发出。
   *
   * 发送失败被**有意吞掉**：服务端不该因为对端已断开就把异常抛回 channel 实现，
   * 那会让业务逻辑看到与自身无关的传输错误。
   */
  #emit(header: unknown[], body: any = undefined): void {
    try {
      this.#protocol.send(encodeFrame(header, body));
    } catch {
      /* 见方法注释：传输错误不影响服务端状态。 */
    }
  }

  // ---- 入站 -----------------------------------------------------------------

  #receive(message: VSBuffer): void {
    const { header, payload: body } = decodeFrame(message);
    const kind: number = header[0];
    const id: number = header[1];

    // 四类入站帧按「是否携带 channel 路由信息」分成两组，用集合判别而不是 switch 分支：
    // Promise / EventListen 带 (channel, command, arg)，Cancel / Dispose 只带 id。
    if (INBOUND_DISPATCH.has(kind)) {
      this.#route({
        type: kind as RequestType,
        id,
        channelName: header[2],
        command: header[3],
        arg: body,
      });
      return;
    }
    if (INBOUND_RELEASE.has(kind)) {
      // 取消与退订走同一条路：按 id 找到活动请求并释放它；未知 id 静默忽略。
      this.#cancel(id);
    }
  }

  /** 有实现就直接处理，没有就排队等注册。 */
  #route(request: InboundRequest): void {
    const channel = this.#routes.get(request.channelName);
    if (channel === undefined) {
      this.#defer(request);
      return;
    }
    if (request.type === RequestType.Promise) {
      this.#invokePromise(channel, request);
    } else {
      this.#invokeEventListen(channel, request);
    }
  }

  // ---- Promise 请求 ---------------------------------------------------------

  #invokePromise(channel: IServerChannel<TContext>, request: InboundRequest): void {
    // 每个请求独立的取消源：一个请求被取消不该影响同 channel 上的其它请求。
    const cancellation = new CancellationTokenSource();
    // 同步抛错也归入「拒绝」：统一收敛成 rejected promise，结算路径只写一遍。
    const invocation = ((): Promise<any> => {
      try {
        return channel.call(this.#ctx, request.command, request.arg, cancellation.token);
      } catch (error) {
        return Promise.reject(error);
      }
    })();

    const release = toDisposable(() => cancellation.cancel());
    this.#active.set(request.id, release);

    const settle = (data: any): void => {
      this.#sendResponse({ type: ResponseType.PromiseSuccess, id: request.id, data });
    };
    const fail = (error: unknown): void => {
      this.#sendRejection(request.id, error);
    };
    invocation.then(settle, fail).finally(() => {
      release.dispose();
      this.#active.delete(request.id);
    });
  }

  /**
   * 结算一次拒绝。
   *
   * `Error` 走结构化载荷（message/name/stack 数组 + 可选元数据），
   * 非 `Error` 走 PromiseErrorObj 原值透传——这个区分是契约的一部分：
   * 调用方据此判断能不能从错误里取 `code` 之类的字段。
   */
  #sendRejection(id: number, error: unknown): void {
    if (!(error instanceof Error)) {
      this.#sendResponse({ type: ResponseType.PromiseErrorObj, id, data: error });
      return;
    }
    this.#sendResponse({ type: ResponseType.PromiseError, id, data: errorToPayload(error) });
  }

  // ---- 事件订阅 -------------------------------------------------------------

  #invokeEventListen(channel: IServerChannel<TContext>, request: InboundRequest): void {
    const forward = (data: any): void => {
      this.#sendResponse({ type: ResponseType.EventFire, id: request.id, data });
    };
    this.#active.set(request.id, channel.listen(this.#ctx, request.command, request.arg)(forward));
  }

  #cancel(id: number): void {
    const release = this.#active.get(id);
    if (release === undefined) {
      // 未知 id 静默忽略：对端可能已经结算过，重复取消不是错误。
      return;
    }
    release.dispose();
    this.#active.delete(id);
  }

  // ---- 待定队列 -------------------------------------------------------------

  /**
   * 把请求排进待定队列，并起一个 `timeoutDelay` 的定时器。
   *
   * 超时后的行为按请求种类分化（契约要求）：
   *   · 两种都记一条 `Unknown channel: <name>` 到 stderr；
   *   · 只有 Promise 请求额外回一条 PromiseError，让调用方的 promise 能结算；
   *   · EventListen 只记日志、不回包（事件订阅没有可回的错误通道）。
   */
  #defer(request: InboundRequest): void {
    const queue = this.#deferred.get(request.channelName) ?? [];
    if (queue.length === 0) {
      this.#deferred.set(request.channelName, queue);
    }

    const timer = setTimeout(() => {
      console.error(`Unknown channel: ${request.channelName}`);
      if (request.type !== RequestType.Promise) {
        return;
      }
      // 错误载荷交给工厂构造：它同时把「未知 channel」的文案与 stack 缺省规则
      // 收在一处，避免这段字面量在文件里散开。
      this.#sendResponse({
        type: ResponseType.PromiseError,
        id: request.id,
        data: unknownChannelPayload(request.channelName, this.#timeoutMs),
      });
    }, this.#timeoutMs);

    queue.push({ request, timer });
  }

  /** channel 注册后冲刷它的待定请求：先清定时器，再按原种类重放。 */
  #drainDeferred(name: string): void {
    const queue = this.#deferred.get(name);
    if (queue === undefined) {
      return;
    }
    this.#deferred.delete(name);
    for (const { request, timer } of queue) {
      clearTimeout(timer);
      this.#route(request);
    }
  }

  // ---- 清理 -----------------------------------------------------------------

  /**
   * 关闭服务端：停止收帧并释放全部活动请求。
   *
   * 待定队列里的定时器**不主动清**（旧行为，契约 B9 明确保留）：它们到期后只会打日志、
   * 或在 Promise 请求上回一条错误帧，不影响本实例已经关闭的状态。
   */
  dispose(): void {
    this.#protocolListener?.dispose();
    this.#protocolListener = null;
    for (const release of this.#active.values()) {
      release.dispose();
    }
    this.#active.clear();
  }
}
