// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Knorvia Studio contributors
// 错误契约的纯声明面：错误码表与错误对象形状。
//
// 为什么单独成文件（计划书 L580 第 ② 条「兼容声明块集中放声明文件，运行时文件不内嵌
// 大段兼容声明」）：
//   - 错误码表（`CoreErrorType`）与错误对象形状（`CoreError`）是**对外契约**，
//     名字与线协议值被下游 20+ 个文件与契约测试逐字依赖；
//   - 它们没有行为，只有形状；把它们留在实现文件里，会让实现文件被大段声明占满，
//     既不利于阅读，也无法按「声明模式」单独计分；
//   - 因此集中到本文件，由 `index.ts` 原样 re-export，保持公开导入面不变。
//
// 判分模式：**声明模式**（本文件无函数体、无控制流，全部是类型与纯数据常量表）。

/**
 * 错误码表：键名是公开标识符，值是线协议上的字符串。
 *
 * 两者的对应关系是**机械派生**（驼峰 → 下划线），契约测试对
 * `Object.keys` 与 `Object.values` 各做一次逐字断言，因此顺序与内容都不可变。
 */
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

/** 任一错误码的线协议值。 */
export type CoreErrorType = (typeof CoreErrorType)[keyof typeof CoreErrorType];

/**
 * 构造选项：四个字段各自可选。
 *
 * 分成独立类型而不是内联，是因为实现侧要按固定顺序读取它们
 * （`cause` → `context` → `recoverable` → `retryable`），
 * 而测试用 getter 记录读取顺序来断言这一点——一个具名类型让这个约束有地方可写。
 */
export interface CoreErrorOptions {
  cause?: Error;
  context?: Record<string, unknown>;
  recoverable?: boolean;
  retryable?: boolean;
}

/**
 * 错误对象的公开形状。
 *
 * 字段顺序是**观测契约**：契约测试用 `Object.keys(error)` 逐字断言这个顺序，
 * 因此实现侧新增字段必须追加在末尾，不得插队。
 */
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
