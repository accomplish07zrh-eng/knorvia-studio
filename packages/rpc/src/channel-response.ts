// SPDX-License-Identifier: Apache-2.0
// 解帧后的响应形状：服务端发出的五类响应，以及结构化错误载荷。
//
// 单独成模块的理由：客户端要按这些形状结算 promise 与事件，服务端要按它们编码，
// 测试要按它们断言——三方共享同一份类型，但不该因此共享任何执行代码。
import type { ResponseType } from "./channel-wire.js";

/**
 * 结构化错误载荷。
 *
 * `message` / `name` / `stack` 必备；`stack` 以**行数组**传输，因为跨进程传整串
 * 会被序列化层转义。其余为可选业务元数据，值为 `undefined` 时不写入线上帧。
 *
 * 带索引签名：两端都按「键名字符串」遍历九个可选键来搬运值，
 * 没有索引签名时这类遍历无法通过类型检查。
 */
export interface IRawErrorData {
  message: string;
  name: string;
  stack: string[] | undefined;
  code?: unknown;
  kind?: unknown;
  status?: unknown;
  retryAfterMs?: unknown;
  data?: unknown;
  detail?: unknown;
  details?: unknown;
  taskId?: unknown;
  traceId?: unknown;
  [key: string]: unknown;
}

/**
 * 解帧后的一条响应。
 *
 * `Initialize` 不带 id：它是全局信号（服务端就绪），不是某条请求的答复。
 * 其余四类都带 id，据此找回落点。
 */
export type IRawResponse =
  | { type: ResponseType.Initialize }
  | { type: ResponseType.PromiseSuccess; id: number; data: any }
  | { type: ResponseType.PromiseError; id: number; data: IRawErrorData }
  | { type: ResponseType.PromiseErrorObj; id: number; data: any }
  | { type: ResponseType.EventFire; id: number; data: any };

/** 按请求 id 分派一条响应。 */
export type IHandler = (response: IRawResponse) => void;

/**
 * 错误载荷里允许跨进程搬运的元数据键。
 *
 * 两端共用同一份清单：服务端写、客户端读，任何一边漏掉一个键都会让该元数据
 * 在传输后消失，因此清单只在这里定义一次、由两个实现共同 import。
 * 键名来自线格式约定、无法改名，逐行列出是为了可读与可 diff。
 */
export const TRANSFERABLE_ERROR_KEYS: readonly string[] = [
  "code",
  "kind",
  "status",
  "retryAfterMs",
  "data",
  "detail",
  "details",
  "taskId",
  "traceId",
];
