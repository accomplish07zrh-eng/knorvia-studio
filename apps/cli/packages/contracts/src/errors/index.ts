// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Knorvia Studio contributors

// 公开名称与线协议值是既有兼容契约；不将这些标识声称为新的表达或发明。
export const CoreErrorType = {
  SessionNotFound: "session_not_found",
  SessionAlreadyExists: "session_already_exists",
  SessionCorrupted: "session_corrupted",
  TurnNotFound: "turn_not_found",
  TurnInProgress: "turn_in_progress",
  InvalidTurnPhase: "invalid_turn_phase",
  TurnCancelled: "turn_cancelled",
  ModelError: "model_error",
  ModelTimeout: "model_timeout",
  ModelRateLimited: "model_rate_limited",
  ModelContextExceeded: "model_context_exceeded",
  ToolNotFound: "tool_not_found",
  ToolExecutionFailed: "tool_execution_failed",
  ToolTimeout: "tool_timeout",
  ToolCancelled: "tool_cancelled",
  ToolMaxCalls: "tool_max_calls",
  InvalidInput: "invalid_input",
  PermissionDenied: "permission_denied",
  PermissionEscalation: "permission_escalation",
  PermissionTimeout: "permission_timeout",
  InvalidStateTransition: "invalid_state_transition",
  EventOutOfOrder: "event_out_of_order",
  ProjectionCorrupted: "projection_corrupted",
  StorageError: "storage_error",
  ConfigurationError: "configuration_error",
  Cancelled: "cancelled",
  UnknownError: "unknown_error",
} as const;
export type CoreErrorType = (typeof CoreErrorType)[keyof typeof CoreErrorType];
interface Options {
  cause?: Error;
  context?: Record<string, unknown>;
  recoverable?: boolean;
  retryable?: boolean;
}
export interface CoreError extends Error {
  type: CoreErrorType;
  code: string;
  message: string;
  cause?: Error;
  context?: Record<string, unknown>;
  recoverable: boolean;
  retryable: boolean;
  timestamp: Date;
}

export function createCoreError(
  type: CoreErrorType,
  message: string,
  options?: Options,
): CoreError {
  const error = new Error(message);
  // 必须保留普通 Error 原型和可枚举 cause；原生 Error options 的 cause 不可枚举。
  return Object.assign(error, {
    type,
    code: type.toUpperCase(),
    cause: options?.cause,
    context: options?.context,
    recoverable: options?.recoverable ?? false,
    retryable: options?.retryable ?? false,
    timestamp: new Date(),
  });
}

export function isCoreError(error: unknown): error is CoreError {
  return error instanceof Error && "type" in error && "code" in error;
}
export function isRetryable(error: CoreError): boolean {
  return error.retryable;
}
export function isRecoverable(error: CoreError): boolean {
  return error.recoverable;
}

// 命名错误的消息、主体键和恢复策略只在这张表定义；入口只传调用方数据。
const NAMED = {
  session: [CoreErrorType.SessionNotFound, "Session not found", "sessionId", true, false],
  phase: [CoreErrorType.InvalidTurnPhase, "Invalid turn phase", "current", true, false],
  tool: [CoreErrorType.ToolNotFound, "Tool not found", "toolName", false, false],
  execution: [CoreErrorType.ToolExecutionFailed, "Tool execution failed", "toolName", true, true],
  permission: [CoreErrorType.PermissionDenied, "Permission denied", "toolName", true, false],
} as const;
function named(
  kind: keyof typeof NAMED,
  subject: string,
  extra: Record<string, unknown> = {},
  cause?: Error,
): CoreError {
  const [type, prefix, key, recoverable, retryable] = NAMED[kind];
  return createCoreError(type, `${prefix}: ${subject}`, {
    cause,
    context: { [key]: subject, ...extra },
    recoverable,
    retryable,
  });
}
export function sessionNotFound(sessionId: string): CoreError {
  return named("session", sessionId);
}
export function invalidTurnPhase(current: string, expected: string[]): CoreError {
  return named("phase", current, { expected });
}
export function toolNotFound(toolName: string): CoreError {
  return named("tool", toolName);
}
export function toolExecutionFailed(toolName: string, cause?: Error): CoreError {
  return named("execution", toolName, {}, cause);
}
export function permissionDenied(toolName: string, reason?: string): CoreError {
  return named("permission", toolName, { reason });
}
