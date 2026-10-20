// SPDX-License-Identifier: Apache-2.0
// channel 协议的纯数据常量表（声明模式计分）。
//
// 本文件只放**键名与形状都由协议规定、不含逻辑**的内容：
//   1. 九个错误元数据键名（跨进程搬运白名单）；
//   2. 五种响应的判别式与载荷形状（类型声明，不是运行期构造函数）。
//
// 依据：计划书「合同写死的纯数据常量表 → 在 interface.md 逐条列名、集中放进声明文件、
// 用声明模式计分」。见 `specs/contracts/packages-02/interface.md` §1.4 的逐条列名。
//
// 为什么集中在一处：两份实现（客户端/服务端）共用同一份清单与同一套响应形状，
// 任何一边单独抄一份都会在协议演进时漂移——这正是把它们从实现文件里抽出来的理由。
import type { ResponseType } from "./channel-wire.js";

/**
 * 允许跨进程搬运的错误元数据键（九个，键名由线格式规定）。
 *
 * 服务端按它挑出写进帧的键，客户端按它挑出还原到 Error 上的键。
 * 顺序不影响语义，按字母序排列便于核对。
 */
export const TRANSFERABLE_ERROR_KEYS: readonly string[] = [
  "code",
  "data",
  "detail",
  "details",
  "kind",
  "retryAfterMs",
  "status",
  "taskId",
  "traceId",
];

/**
 * 结构化错误载荷的形状。
 *
 * 必备三项是 `message` / `name` / `stack`；`stack` 以**行数组**传输
 * （跨进程传整串会被序列化层转义）。其余键由 `TRANSFERABLE_ERROR_KEYS` 定义，
 * 因此用索引签名覆盖、不逐个重复声明。
 */
export interface IRawErrorData {
  readonly message: string;
  readonly name: string;
  readonly stack: string[] | undefined;
  [metadataKey: string]: unknown;
}

/**
 * 五种响应的判别式与载荷形状。
 *
 * 只有 `Initialize` 不带 id：它是「服务端就绪」的全局信号，不是某条请求的答复。
 * 其余四种都带 id，客户端据此找回落点。
 */
export type IRawResponse =
  | { type: ResponseType.Initialize }
  | { type: ResponseType.PromiseSuccess; id: number; data: any }
  | { type: ResponseType.PromiseError; id: number; data: IRawErrorData }
  | { type: ResponseType.PromiseErrorObj; id: number; data: any }
  | { type: ResponseType.EventFire; id: number; data: any };

/** 按请求 id 分派一条响应。 */
export type IHandler = (response: IRawResponse) => void;
