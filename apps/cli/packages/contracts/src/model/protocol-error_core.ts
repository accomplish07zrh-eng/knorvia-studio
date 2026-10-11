// SPDX-License-Identifier: Apache-2.0
// 协议错误类型：承载 provider 协议层失败的结构化错误。
// 本文件由 model/index.ts 的运行时声明拆出；模型面类型仍从 ./index.js 导出。
import { ModelErrorCode } from "./runtime-tables_core.js";

export class ModelProtocolError extends Error {
  readonly code: ModelErrorCode;
  readonly context?: Record<string, unknown>;

  constructor(code: ModelErrorCode, message: string, context?: Record<string, unknown>) {
    super(message);
    this.name = "ModelProtocolError";
    this.code = code;
    this.context = context;
  }
}
