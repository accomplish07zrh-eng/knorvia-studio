// SPDX-License-Identifier: Apache-2.0
// 网络观测装饰器的计时逻辑（实现部分，按普通模式计分）。
//
// 对外类声明与 sink 装配面在 network-telemetry-middleware.ts（声明部分）；
// 这里只放「一次调用如何计时并上报」这一件有逻辑的事。
import type { IChannel, IServerChannel } from "./channels.js";
import type { CancellationToken, Event } from "./foundation.js";
import { buildObservation } from "./network-telemetry-observation.js";
import {
  emitNetworkTelemetryObservation,
  type NetworkTransportKind,
} from "./network-telemetry-sink.js";

/** 本中间件产出记录的固定传输种类。 */
const RPC_TRANSPORT: NetworkTransportKind = "rpc";

/**
 * 计时并上报一次调用。
 *
 * 成功与失败共用同一个计时窗口；失败时先上报再**原样抛出**，
 * 不包装错误——调用方依赖原始错误身份与类型做分类。
 *
 * 用 promise 链的两个出口表达，而不是 try/catch：这里没有「必须执行的清理」，
 * 只有「两条出口各上报一次」，链式写法更贴近语义。
 */
export function measureInvocation<T>(
  channelName: string,
  command: string,
  invoke: () => Promise<T>,
): Promise<T> {
  const startedAt = performance.now();
  const report = (failure?: unknown): void => {
    emitNetworkTelemetryObservation(
      buildObservation({ transport: RPC_TRANSPORT, channelName, command, startedAt, failure }),
    );
  };
  return invoke().then(
    (value) => {
      report();
      return value;
    },
    (failure: unknown) => {
      report(failure);
      throw failure;
    },
  );
}

/**
 * 包一层服务端 channel。
 *
 * 只观测 `call`：`listen` 是订阅动作，没有「一次调用的耗时」这一概念，
 * 强行记录会把订阅生命周期误报成调用时长。
 */
export function observedServerChannel<TContext>(
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
export function observedClientChannel(target: IChannel, channelName: string): IChannel {
  return {
    call<T>(command: string, arg?: unknown, token?: CancellationToken): Promise<T> {
      return measureInvocation(channelName, command, () => target.call<T>(command, arg, token));
    },
    listen<T>(event: string, arg?: unknown): Event<T> {
      return target.listen<T>(event, arg);
    },
  };
}
