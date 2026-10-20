// SPDX-License-Identifier: Apache-2.0
// 服务对象 ↔ channel 的双向适配（对外的 `ProxyChannel` 命名空间）。
//
// 三段实现分别在：
//   · proxy-event-bridge.ts   —— 带缓冲的事件桥接（上游连接 + 暂存队列）
//   · proxy-server-channel.ts —— 服务对象 → IServerChannel 的成员路由
//   · proxy-service-view.ts   —— 服务对象 Proxy（属性访问 → call/listen）
// 拆开的理由：三者变更原因不同——桥接管生命周期、路由管名字分类、Proxy 管翻译。
//
// 对外只暴露两个入口，参数形状由 interface.md 冻结：
//   `fromService` 的第二个参数是历史调用点留下的占位，实现侧不使用；
//   `toService` 的 `context` 会前置到每次 `call` 的参数前面。
import type { IChannel, IServerChannel } from "./channels.js";
import type { DisposableStore } from "./foundation.js";
import { serverChannelFromService } from "./proxy-server-channel.js";
import { createServiceProxy } from "./proxy-service-view.js";

/** 服务对象 → 服务端 channel；`DisposableStore` 参数仅为兼容旧调用点。 */
const fromService = (service: unknown, _disposables?: DisposableStore): IServerChannel<unknown> =>
  serverChannelFromService(service);

/** channel → 服务对象；`options.context` 前置到每次调用的参数前。 */
const toService = (channel: IChannel, options?: { context?: unknown }): object =>
  createServiceProxy(channel, options);

export const ProxyChannel = { fromService, toService };
