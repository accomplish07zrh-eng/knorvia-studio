// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2026 Knorvia Studio contributors
// kernel-bridge-legacy：协议错误码与结果整形。
// 只使用既有错误码族，不新增码（合同 L6 / behavior B5、B7、B10）。

import type { LegacyMethodOutcome } from "./types.js";

/** JSON-RPC 族：入口外壳与参数校验。 */
export const JSONRPC_PARSE_ERROR = -32700;
export const JSONRPC_INVALID_REQUEST = -32600;
export const JSONRPC_METHOD_NOT_FOUND = -32601;
export const JSONRPC_INVALID_PARAMS = -32602;
export const JSONRPC_INTERNAL_ERROR = -32603;

/** 旧协议业务错误码（既有词表，逐码对齐默认引擎实测行为）。 */
export const LEGACY_ERROR_CODES = {
  /** 会话不可写/导入前置缺失。 */
  sessionUnavailable: -32003,
  /** 会话未激活或不存在。 */
  sessionNotActive: -32004,
  /** 会话状态 revision 不匹配（CAS）。 */
  sessionRevisionMismatch: -32009,
  /** 回合准入被拒 / 子 Agent 会话只读。 */
  turnRejected: -32010,
  /** Account Provider Config 运行时未配置。 */
  accountProviderNotConfigured: -32018,
  /** 反向请求无客户端连接。 */
  clientRequestUnavailable: -32020,
  /** 反向请求被取消。 */
  clientRequestCancelled: -32021,
  /** 反向请求超时。 */
  clientRequestTimeout: -32022,
  /** 能力缺席（既有 fault 词表；端口未注册与 headersApplied:false 共用）。 */
  capabilityUnsupported: -32031,
} as const;

/** 既有 capability 缺席词表（不新增 reasonCode）。 */
export const CAPABILITY_UNSUPPORTED_FAULT = "fault.command.capabilityUnsupported";

export function result(value: unknown): LegacyMethodOutcome {
  return { kind: "result", result: value };
}

export function protocolError(code: number, message: string, data?: unknown): LegacyMethodOutcome {
  return data === undefined
    ? { kind: "error", code, message }
    : { kind: "error", code, message, data };
}

/**
 * capability 缺席：端口未注册（B10）与 `headersApplied:false`（B12）共用。
 * `data.reasonCode` 固定为既有 fault 词表，Host 侧按该词识别能力缺席。
 */
export function capabilityAbsent(method: string, detail?: string): LegacyMethodOutcome {
  return protocolError(
    LEGACY_ERROR_CODES.capabilityUnsupported,
    detail ?? `${method} is not available on this engine yet`,
    { reasonCode: CAPABILITY_UNSUPPORTED_FAULT, method },
  );
}

/** 会话不存在（B7 / D3）：错误码冻结，文案可自写（不透出 DSH 字样）。 */
export function sessionNotActive(sessionId: string): LegacyMethodOutcome {
  return protocolError(LEGACY_ERROR_CODES.sessionNotActive, `Session is not active: ${sessionId}`);
}

/** 会话记录不存在但方法族用「not found」语义（D3：`session/subagents` 用此文案）。 */
export function sessionNotFound(sessionId: string): LegacyMethodOutcome {
  return protocolError(LEGACY_ERROR_CODES.sessionNotActive, `Session not found: ${sessionId}`);
}
