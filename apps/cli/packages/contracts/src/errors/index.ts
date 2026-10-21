// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Knorvia Studio contributors
// 错误构造与识别的运行时实现。
//
// 契约（错误码表与错误对象形状）集中在 ./types.js，本文件原样 re-export，
// 因此 `from "@knorvia/contracts/errors"` 的导入面对调用方完全不变。
//
// 行为契约由 test/core-errors.test.ts 逐字保护，重写时不可变更的几点：
//   1. `code` 必须是错误码键名的**大写形式**（UnknownError 对应 UNKNOWN_ERROR）；
//   2. recoverable / retryable 的缺省必须是 false（undefined 与 null 都落到 false）；
//   3. timestamp 每次构造都是新对象（不可共享）；
//   4. 逃逸到错误对象上的字段**顺序固定**：type、code、cause、context、recoverable、
//      retryable、timestamp（测试用 Object.keys 逐字断言）；
//   5. 选项字段的**读取顺序固定**：cause、context、recoverable、retryable
//      （测试用 getter 记录读取次序断言）；
//   6. 错误对象是普通可变 Error（原型必须是 Error.prototype，字段可写可枚举）。

// CoreErrorType 既是类型也是值（策略表要用它的成员），因此不能用 import type。
import { CoreErrorType } from "./types.js";
import type { CoreError, CoreErrorOptions } from "./types.js";

/**
 * 显式转发 `types.js` 的导出面，**不用 `export *`**。
 *
 * 为什么不能用 `export *`：`types.js` 同时导出同名的 `const CoreErrorType`（值）
 * 与 `type CoreErrorType`（类型）。实测 `export *` 在生成的 `.d.ts` 里会退化成
 * 「仅类型转发」，于是下游把 `CoreErrorType.Xxx` 当值使用时报
 * `TS1362: cannot be used as a value because it was exported using 'export type'`
 * （`@knorvia/core` 有 19 处这样的用法，`build:cli-packages` 会红）。
 *
 * 逐条写出值转发与类型转发，两类视图都能正确到达下游。
 */
export { CoreErrorType } from "./types.js";
export type { CoreError, CoreErrorOptions } from "./types.js";

/**
 * 把错误码键名转成线协议上的大写形式。
 *
 * 单独成函数的原因：这是 code 字段唯一的推导规则，独立出来让「大写化」这件事
 * 在代码里有一个明确位置，而不是散落在对象字面量中。
 */
function wireCodeOf(type: CoreErrorType): string {
  return type.toUpperCase();
}

/**
 * 构造一个携带元数据的普通 Error。
 *
 * 为什么保留 Object.assign 而不是逐字段赋值：逐字段赋值会改变字段插入顺序
 * （Object.keys 顺序是测试断言的观测契约）。这里改为**分两批 assign**——
 * 固有标识（type 与 code）与扩展元数据（cause 起算）——顺序与原来完全一致，
 * 但取值路径已经不同（选项先在局部变量里按契约顺序读定）。
 */
export function createCoreError(
  type: CoreErrorType,
  message: string,
  options?: CoreErrorOptions,
): CoreError {
  const error = new Error(message);

  // 选项字段按契约顺序读取：cause → context → recoverable → retryable。
  const cause = options?.cause;
  const context = options?.context;
  const recoverable = options?.recoverable ?? false;
  const retryable = options?.retryable ?? false;

  // 两批 assign 保持字段顺序：先固有标识，再扩展元数据。
  Object.assign(error, { type, code: wireCodeOf(type) });
  Object.assign(error, { cause, context, recoverable, retryable, timestamp: new Date() });

  return error as CoreError;
}

/**
 * 识别一个值是否是本模块构造的错误。
 *
 * 判据是**属性存在性**而不是构造器身份：错误可能来自别的 realm（测试用
 * runInNewContext 构造过这类对象），此时 instanceof Error 会失败，
 * 但元数据仍然可信。继承来的属性也算（原型链上的元数据同样可信）。
 */
export function isCoreError(error: unknown): error is CoreError {
  if (!(error instanceof Error)) return false;
  return "type" in error && "code" in error;
}

/** 该错误声明过「可重试」吗。 */
export function isRetryable(error: CoreError): boolean {
  return error.retryable === true;
}

/** 该错误声明过「可恢复」吗。 */
export function isRecoverable(error: CoreError): boolean {
  return error.recoverable === true;
}

/**
 * 命名错误的策略表：错误码、前缀文案、主体键名与两个恢复标志。
 *
 * 用元组而不是对象：元组让「这五项是一组固定搭配」在类型上就成立，
 * 也避免字段名与 CoreError 的字段名混淆。
 */
const NAMED_ERROR_POLICY = {
  session: [CoreErrorType.SessionNotFound, "Session not found", "sessionId", true, false],
  phase: [CoreErrorType.InvalidTurnPhase, "Invalid turn phase", "current", true, false],
  tool: [CoreErrorType.ToolNotFound, "Tool not found", "toolName", false, false],
  execution: [CoreErrorType.ToolExecutionFailed, "Tool execution failed", "toolName", true, true],
  permission: [CoreErrorType.PermissionDenied, "Permission denied", "toolName", true, false],
} as const;

/** 策略表的键。 */
type NamedErrorKind = keyof typeof NAMED_ERROR_POLICY;

/**
 * 按策略表造一个命名错误。
 *
 * 上下文对象里主体键在前、附加键在后——顺序同样被测试断言
 * （permissionDenied("t") 的上下文必须是 toolName 在前、reason 在后）。
 */
function namedError(
  kind: NamedErrorKind,
  subject: string,
  extra: Record<string, unknown> = {},
  cause?: Error,
): CoreError {
  const [type, prefix, subjectKey, recoverable, retryable] = NAMED_ERROR_POLICY[kind];
  return createCoreError(type, `${prefix}: ${subject}`, {
    cause,
    context: { [subjectKey]: subject, ...extra },
    recoverable,
    retryable,
  });
}

/** 会话不存在。 */
export function sessionNotFound(sessionId: string): CoreError {
  return namedError("session", sessionId);
}

/** 回合阶段不合法。 */
export function invalidTurnPhase(current: string, expected: string[]): CoreError {
  return namedError("phase", current, { expected });
}

/** 工具未找到。 */
export function toolNotFound(toolName: string): CoreError {
  return namedError("tool", toolName);
}

/** 工具执行失败。 */
export function toolExecutionFailed(toolName: string, cause?: Error): CoreError {
  return namedError("execution", toolName, {}, cause);
}

/** 权限不足（可附理由）。 */
export function permissionDenied(toolName: string, reason?: string): CoreError {
  return namedError("permission", toolName, { reason });
}
