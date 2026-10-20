// SPDX-License-Identifier: Apache-2.0
// 网络观测装饰器（装配壳）。
//
// 本文件保留 interface.md 冻结的模块路径与类声明；三段实现分别在：
//   · network-telemetry-sink.ts             —— 记录形状 + 模块级 sink 装配点
//   · network-telemetry-observation.ts      —— 失败分类 + 记录构造（纯函数）
//   · network-telemetry-channel-wrapping.ts —— 计时与上报的包装
// 这样拆是因为 sink 装配是「进程级唯一可变状态」，分类与构造是纯函数，
// 包装是随观测指标演进会频繁改动的部分——三者的生命周期与变更频率都不同。
import type { IChannel, IChannelClient, IChannelServer, IServerChannel } from "./channels.js";
import {
  observedClientChannel,
  observedServerChannel,
} from "./network-telemetry-channel-wrapping.js";
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
