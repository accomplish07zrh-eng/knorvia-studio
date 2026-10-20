// SPDX-License-Identifier: Apache-2.0
// 网络观测装饰器：给 channel 的每次调用记一条观测记录。
//
// 结构：
//   · network-telemetry-sink.ts        —— 记录形状 + 模块级 sink 装配点（进程级唯一可变状态）
//   · network-telemetry-observation.ts —— 失败分类 + 记录构造（纯函数）
//   · 本文件                            —— 计时包装 + 两个装饰类
// 三段分开的理由是生命周期与变更频率不同：sink 是装配期一次性的，分类是纯函数，
// 包装则随观测指标演进频繁改动。
import type { IChannel, IChannelClient, IChannelServer, IServerChannel } from "./channels.js";
import type { CancellationToken, Event } from "./foundation.js";
import { buildObservation } from "./network-telemetry-observation.js";
import {
  emitNetworkTelemetryObservation,
  setNetworkTelemetrySink,
  type NetworkObservation,
  type NetworkTelemetrySink,
  type NetworkTransportKind,
} from "./network-telemetry-sink.js";

// 再导出 sink 装配面：`network-telemetry-middleware` 是冻结的模块路径，
// 拆模块后 B18 的装配与发出仍要从这里可达。
export {
  emitNetworkTelemetryObservation,
  setNetworkTelemetrySink,
  type NetworkObservation,
  type NetworkTelemetrySink,
  type NetworkTransportKind,
};

/** 本中间件产出记录的固定传输种类。 */
const RPC_TRANSPORT: NetworkTransportKind = "rpc";

/**
 * 计时并上报一次调用。
 *
 * 上报分两个出口：成功先上报再返回；失败先上报再原样抛出。
 * 失败时**不包装错误**——调用方依赖原始错误身份与类型做分类。
 */
async function measured<T>(
  channelName: string,
  command: string,
  invoke: () => Promise<T>,
): Promise<T> {
  const startedAt = performance.now();
  try {
    const result = await invoke();
    emitNetworkTelemetryObservation(
      buildObservation({ transport: RPC_TRANSPORT, channelName, command, startedAt }),
    );
    return result;
  } catch (failure) {
    emitNetworkTelemetryObservation(
      buildObservation({ transport: RPC_TRANSPORT, channelName, command, startedAt, failure }),
    );
    throw failure;
  }
}

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
      return measured(channelName, command, () => target.call<T>(ctx, command, arg, token));
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
      return measured(channelName, command, () => target.call<T>(command, arg, token));
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
