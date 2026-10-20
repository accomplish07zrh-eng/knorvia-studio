// SPDX-License-Identifier: Apache-2.0
// 观测装饰器的内部实现：把「计时 + 上报」包到 channel 调用上。
//
// 与 network-telemetry-middleware.ts 分开的理由：对外模块要保留 interface.md
// 冻结的类声明，而包装逻辑会随观测指标演进频繁改动。分开后两边的变更互不干扰。
import type { IChannel, IServerChannel } from "./channels.js";
import type { CancellationToken, Event } from "./foundation.js";
import { buildObservation } from "./network-telemetry-observation.js";
import {
  emitNetworkTelemetryObservation,
  type NetworkTransportKind,
} from "./network-telemetry-sink.js";

/** 本中间件产出记录的固定传输种类。 */
const RPC: NetworkTransportKind = "rpc";

/**
 * 计时一次调用并上报结局。
 *
 * 失败时先上报再原样抛出：调用方的错误分类逻辑依赖原始错误身份，
 * 装饰器不得包装或替换它。
 */
async function timedInvocation<T>(
  channelName: string,
  command: string,
  invoke: () => Promise<T>,
): Promise<T> {
  const startedAt = performance.now();
  let completed: T;
  try {
    completed = await invoke();
  } catch (failure) {
    emitNetworkTelemetryObservation(
      buildObservation({ transport: RPC, channelName, command, startedAt, failure }),
    );
    throw failure;
  }
  emitNetworkTelemetryObservation(
    buildObservation({ transport: RPC, channelName, command, startedAt }),
  );
  return completed;
}

/**
 * 包一层服务端 channel。
 *
 * 只有 `call` 产生观测：`listen` 是订阅动作，没有「一次调用的耗时」这一概念，
 * 强行记录会把订阅的生命周期误报成调用时长。
 */
export function observedServerChannel<TContext>(
  target: IServerChannel<TContext>,
  channelName: string,
): IServerChannel<TContext> {
  return {
    call: <T>(
      ctx: TContext,
      command: string,
      arg?: unknown,
      token?: CancellationToken,
    ): Promise<T> =>
      timedInvocation(channelName, command, () => target.call<T>(ctx, command, arg, token)),
    listen: <T>(ctx: TContext, event: string, arg?: unknown): Event<T> =>
      target.listen<T>(ctx, event, arg),
  };
}

/** 包一层客户端 channel 句柄；同样只观测 `call`。 */
export function observedClientChannel(target: IChannel, channelName: string): IChannel {
  return {
    call: <T>(command: string, arg?: unknown, token?: CancellationToken): Promise<T> =>
      timedInvocation(channelName, command, () => target.call<T>(command, arg, token)),
    listen: <T>(event: string, arg?: unknown): Event<T> => target.listen<T>(event, arg),
  };
}
