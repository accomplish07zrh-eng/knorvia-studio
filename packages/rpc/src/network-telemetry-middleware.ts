// SPDX-License-Identifier: Apache-2.0
// 网络观测装饰器：给 channel 的每次调用记一条结构化观测。
//
// 为什么三段写在同一文件：`middleware-owner-safety` 测试把中间件的 `./` 依赖限定为
// `channels` 与 `foundation`，任何新模块都会破坏该边界。因此「sink 装配」「失败分类」
// 「计时上报」都就近声明在本文件内，按注释分段，不拆模块。
import type { IChannel, IChannelClient, IChannelServer, IServerChannel } from "./channels.js";
import type { CancellationToken, Event } from "./foundation.js";

// ---- 记录形状与 sink 装配点 ---------------------------------------------------

// 记录形状与 sink 类型集中在 network-telemetry-declarations.ts（纯类型）。
// 只用 `import type` 引用：type-only 导入被打包器擦除，不触发
// `middleware-owner-safety` 的依赖白名单断言。
import type {
  NetworkObservation,
  NetworkTelemetrySink,
  NetworkTransportKind,
} from "./network-telemetry-declarations.js";

export type { NetworkObservation, NetworkTelemetrySink, NetworkTransportKind };
/** 当前 sink；`null` 表示未装配（此时记录被丢弃，不缓存）。 */
let activeSink: NetworkTelemetrySink | null = null;

/** 装配 sink；传 `null` 表示摘除，重复调用以后者为准。 */
export function setNetworkTelemetrySink(sink: NetworkTelemetrySink | null): void {
  activeSink = sink;
}

/**
 * 把记录交给当前 sink。
 *
 * **发出时读取**而不是构造时捕获：这样后装配的 sink 对已构造好的中间件同样生效。
 * 未装配时静默丢弃——观测是旁路能力，不该因为没有接收方而影响调用路径。
 */
export function emitNetworkTelemetryObservation(observation: NetworkObservation): void {
  activeSink?.(observation);
}

// ---- 失败分类（规则表驱动）----------------------------------------------------

/**
 * 失败种类判定表：按顺序取第一个命中的规则。
 *
 * 用文本特征而非错误码，因为底层传输可能来自 fetch、WebSocket 或 Node net，
 * 三者给出的错误形态不统一；文本是不依赖实现的唯一稳定判据。
 */
const FAILURE_SIGNATURES: ReadonlyArray<{ kind: string; needles: readonly string[] }> = [
  { kind: "timeout", needles: ["timeout", "timed out"] },
  { kind: "dns_failure", needles: ["dns", "getaddrinfo", "enotfound"] },
  { kind: "connection_reset", needles: ["econnreset", "connection reset", "econnrefused"] },
];

/** 兜底种类：不属于上面任何一类的失败。 */
const UNCLASSIFIED_FAILURE = "other";

function classifyFailure(failure: unknown): string {
  const haystack = (failure instanceof Error ? failure.message : String(failure)).toLowerCase();
  for (const signature of FAILURE_SIGNATURES) {
    if (signature.needles.some((needle) => haystack.includes(needle))) {
      return signature.kind;
    }
  }
  return UNCLASSIFIED_FAILURE;
}

// ---- 计时与上报 ---------------------------------------------------------------

/** 本中间件产出记录的固定传输种类。 */
const RPC_TRANSPORT: NetworkTransportKind = "rpc";

/** 一次调用要报告的字段；失败时 `failure` 非 undefined。 */
interface InvocationReport {
  readonly channelName: string;
  readonly command: string;
  readonly startedAt: number;
  readonly failure?: unknown;
}

/**
 * 装配一条观测记录。
 *
 * 一次构造、不做后续赋值：记录会被 sink 拿走后可能异步处理，就地修改会引入
 * 跨时序的读写竞争。接口名固定为 `<channel>.<command>`，那是 sink 侧聚合分组的键。
 *
 * `errorKind` 在成功时**显式写成 `undefined`**（而不是省略该键）：订阅方按
 * 「键是否存在」区分「没有错误」与「字段未提供」时的行为不同，且既有测试
 * 以 `deepStrictEqual` 锁定了「成功时该键在、值为 undefined」。省略键会改变
 * 记录形状，属对外可观察差异。
 */
function buildObservation(report: InvocationReport): NetworkObservation {
  const succeeded = report.failure === undefined;
  return {
    transport: RPC_TRANSPORT,
    interface: `${report.channelName}.${report.command}`,
    durationMs: Math.max(0, Math.round(performance.now() - report.startedAt)),
    ok: succeeded,
    errorKind: succeeded ? undefined : classifyFailure(report.failure),
    attempt: 1,
  };
}

/**
 * 计时并上报一次调用。
 *
 * 成功与失败共用同一个计时窗口；失败时先上报再**原样抛出**——调用方依赖原始
 * 错误身份与类型做分类，装饰器不得包装或替换它。用 promise 链的两个出口表达：
 * 这里没有必须执行的清理，只有「两条出口各上报一次」。
 */
function measureInvocation<T>(
  channelName: string,
  command: string,
  invoke: () => Promise<T>,
): Promise<T> {
  const startedAt = performance.now();
  return invoke().then(
    (value) => {
      emitNetworkTelemetryObservation(buildObservation({ channelName, command, startedAt }));
      return value;
    },
    (failure: unknown) => {
      emitNetworkTelemetryObservation(
        buildObservation({ channelName, command, startedAt, failure }),
      );
      throw failure;
    },
  );
}

// ---- 两个装饰类 ---------------------------------------------------------------

/**
 * 包一层服务端 channel。
 *
 * 只观测 `call`：`listen` 是订阅动作，没有「一次调用的耗时」这一概念，
 * 强行记录会把订阅生命周期误报成调用时长。
 */
function observedServerChannel<TContext>(
  target: IServerChannel<TContext>,
  channelName: string,
): IServerChannel<TContext> {
  return {
    call<T>(ctx: TContext, command: string, arg?: unknown, token?: CancellationToken): Promise<T> {
      return measureInvocation(channelName, command, () =>
        target.call<T>(ctx, command, arg, token),
      );
    },
    listen<T>(ctx: TContext, event: string, arg?: unknown): Event<T> {
      return target.listen<T>(ctx, event, arg);
    },
  };
}

/** 包一层客户端 channel 句柄；同样只观测 `call`。 */
function observedClientChannel(target: IChannel, channelName: string): IChannel {
  return {
    call<T>(command: string, arg?: unknown, token?: CancellationToken): Promise<T> {
      return measureInvocation(channelName, command, () => target.call<T>(command, arg, token));
    },
    listen<T>(event: string, arg?: unknown): Event<T> {
      return target.listen<T>(event, arg);
    },
  };
}

export class NetworkTelemetryChannelServer<TContext = string> implements IChannelServer<TContext> {
  readonly #inner: IChannelServer<TContext>;

  constructor(inner: IChannelServer<TContext>) {
    this.#inner = inner;
  }

  registerChannel(channelName: string, channel: IServerChannel<TContext>): void {
    // 注册时就把 channelName 绑进包装实例：下游调用拿不到它，也不能再传一次。
    this.#inner.registerChannel(channelName, observedServerChannel(channel, channelName));
  }

  ready(): void {
    this.#inner.ready?.();
  }
}

export class NetworkTelemetryChannelClient implements IChannelClient {
  readonly #inner: IChannelClient;

  constructor(inner: IChannelClient) {
    this.#inner = inner;
  }

  getChannel<T extends IChannel>(channelName: string): T {
    const delegate = this.#inner.getChannel<T>(channelName);
    return observedClientChannel(delegate as IChannel, channelName) as unknown as T;
  }
}
