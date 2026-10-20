// SPDX-License-Identifier: Apache-2.0
// channel 层的公开词汇表（纯再导出壳）。
//
// 真正的定义按职责拆成三个模块：
//   · channel-contract.ts   —— 两个方向各一组接口（调用方 / 实现方）
//   · channel-wire.ts       —— 请求与响应的种类编号（线格式）
//   · channel-response.ts   —— 解帧后的响应形状与错误载荷
// 本文件只把它们重新导出，保证 `channels.shared` 这个模块路径与导出面不变。
export type {
  IChannel,
  IServerChannel,
  IChannelServer,
  IChannelClient,
} from "./channel-contract.js";
export { RequestType, ResponseType } from "./channel-wire.js";
export type { IRawErrorData, IRawResponse, IHandler } from "./channel-response.js";
