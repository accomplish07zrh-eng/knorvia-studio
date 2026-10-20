// SPDX-License-Identifier: Apache-2.0
// 网络观测装饰器（声明壳）。
//
// 本文件只保留 interface.md 冻结的两类导出（两个装饰类 + sink 装配面），
// 计时逻辑在 network-telemetry-measurement.ts（普通模式计分），
// 记录形状与失败分类在 sink / observation 两个模块。
//
// 这样切分的理由：类声明与 sink 装配面的形状由合同规定、不含逻辑；
// 计时有逻辑但很短。把两者放在同一文件会让「必须逐字一致的声明」与
// 「可以自由改进的逻辑」混在一起，改动一处就同时影响两类计分。
import type { IChannel, IChannelClient, IChannelServer, IServerChannel } from "./channels.js";
import type { CancellationToken, Event } from "./foundation.js";
import { observedClientChannel, observedServerChannel } from "./network-telemetry-measurement.js";
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
