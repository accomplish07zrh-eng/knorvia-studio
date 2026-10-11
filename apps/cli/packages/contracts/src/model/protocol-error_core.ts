// SPDX-License-Identifier: Apache-2.0
// 协议错误：provider 协议层失败的结构化错误，带错误码与可选上下文。
// 本文件由 model/index.ts 的运行时声明拆出；模型面类型仍从 ./index.js 导出。

import { ModelErrorCode } from "./runtime-tables_core.js";

/** 协议错误的名字固定，便于调用方按 name 与 code 两条路识别。 */
const PROTOCOL_ERROR_NAME = "ModelProtocolError";

/** provider 协议层的失败：`code` 取自模型错误码表，`context` 放定位用的附加事实。 */
export class ModelProtocolError extends Error {
  constructor(
    readonly code: ModelErrorCode,
    message: string,
    readonly context?: Record<string, unknown>,
  ) {
    super(message);
    this.name = PROTOCOL_ERROR_NAME;
  }
}
