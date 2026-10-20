// SPDX-License-Identifier: Apache-2.0
// channel 层的公开词汇表。
//
// 定义按职责分开：
//   · channel-contract.ts             —— 两个方向各一组接口（调用方 / 实现方）
//   · channel-wire.ts                 —— 请求与响应的种类编号（线格式）
//   · channel-protocol-declaration.ts —— 响应形状与错误载荷（纯类型）
// 本文件把它们重新导出，并持有**两端共用的错误元数据键清单**——放在这里而不是
// 各自的实现文件里，是因为清单必须两端一致，而本模块是
// `request-replay-owner-safety` 允许的唯一「共享词汇」依赖。
export type {
  IChannel,
  IServerChannel,
  IChannelServer,
  IChannelClient,
} from "./channel-contract.js";
export { RequestType, ResponseType } from "./channel-wire.js";
export type { IRawErrorData, IRawResponse, IHandler } from "./channel-protocol-declaration.js";
