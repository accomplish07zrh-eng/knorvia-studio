// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2026 Knorvia Studio contributors
//
// Hook 输出解析：把子进程的 stdout / 退出码变成裁决（B8 + B9）。
//
// 依据：`specs/contracts/core-hooks/behavior.md` B8（执行结果解析）+ B9（stdout 与退出码 2 语义）。
//
// 设计要点：
//   ① **Hook 打印日志不得让动作失败**：stdout 不是 JSON 或 JSON 解析失败都只是「没输出」，
//      不是错误。只有「看起来像 JSON 但 schema 不符」才是配置错误。
//   ② **exitCode === 2 是「阻断」的专用约定**（旧 Hook 生态）：要合成对应事件的阻断输出，
//      而不是当普通失败处理。
//   ③ 预览有 **4000 字符上限**：避免把整份 stderr 塞进错误消息。
import type { HookExecutionOutcome } from "./hook-exec.js";

/** 预览上限（B8.5）：超过就截断并追加省略号。 */
const PREVIEW_MAX_CHARS = 4000;

/** 截断后缀（B8.5）。 */
const PREVIEW_ELLIPSIS = "...";

/** schema 校验失败时最多报多少条（B9.1）。 */
const MAX_SCHEMA_ERRORS = 20;

/** 退出码 2 的默认阻断原因（B9.2）。 */
const DEFAULT_BLOCK_REASON = "Hook blocked execution";

/**
 * 一次解析的结果。
 *
 * `output` 是 Hook 的 JSON 输出（可能 undefined：Hook 没输出 / 只打印了日志）。
 * `diagnostics` 只在「有 stderr 预览」时出现（B8.4）。
 */
export interface HookParseResult {
  readonly output: HookJsonOutputLike | undefined;
  readonly diagnostics?: {
    readonly stderrPreview: string;
    readonly errorMessage: string;
    readonly stdoutPreview?: string;
  };
}

/** Hook 输出的形状（只列本包消费的字段）。 */
export interface HookJsonOutputLike {
  readonly continue?: boolean;
  readonly reason?: string;
  readonly decision?: "block";
  readonly hookSpecificOutput?: {
    readonly hookEventName: string;
    readonly permissionDecision?: "allow" | "deny" | "ask";
    readonly permissionDecisionReason?: string;
    readonly decision?: { readonly behavior: "deny"; readonly message: string };
  };
}

/** Hook 执行失败的分类（对应 `CoreError(type=ToolExecutionFailed)`）。 */
export class HookExecutionFailedError extends Error {
  readonly code = "hook_execution_failed";
  readonly recoverable = true;
  constructor(
    message: string,
    readonly context: {
      readonly exitCode: number | undefined;
      readonly hookEventName: string;
      readonly status: string;
      readonly stderrPreview: string;
      readonly stdoutPreview: string;
    },
  ) {
    super(message);
    this.name = "HookExecutionFailedError";
  }
}

/** Hook 输出 schema 不符（对应 `CoreError(type=ToolExecutionFailed)`）。 */
export class HookOutputSchemaError extends Error {
  readonly code = "hook_output_schema_invalid";
  readonly recoverable = true;
  constructor(
    readonly errors: readonly string[],
    readonly hookEventName: string,
  ) {
    super(`Hook output does not match schema: ${errors.slice(0, MAX_SCHEMA_ERRORS).join("; ")}`);
    this.name = "HookOutputSchemaError";
  }
}

/**
 * 把预览规整成可展示的短文本（B8.5）。
 *
 * 空串（或只有空白）→ `undefined`（视为「没有预览」）。
 * 超长 → 截断到 4000 字符并追加 `...`。
 */
export function toPreview(value: string | undefined): string | undefined {
  if (value === undefined) return undefined;
  const trimmed = value.trim();
  if (trimmed.length === 0) return undefined;
  if (trimmed.length <= PREVIEW_MAX_CHARS) return trimmed;
  return `${trimmed.slice(0, PREVIEW_MAX_CHARS)}${PREVIEW_ELLIPSIS}`;
}

/**
 * 解析 stdout（B9.1）。
 *
 * 三条「不算错」的路径都返回 `undefined`：
 *   · 去空白后为空
 *   · 不以 `{` 开头（Hook 打印了日志）
 *   · 以 `{` 开头但 JSON 解析失败（日志恰好以 `{` 开头）
 *
 * 只有「解析成功但形状不符」才抛 `HookOutputSchemaError`。
 */
export function parseHookStdout(
  stdout: string,
  hookEventName: string,
): HookJsonOutputLike | undefined {
  const trimmed = stdout.trim();
  if (trimmed.length === 0 || !trimmed.startsWith("{")) return undefined;

  let parsed: unknown;
  try {
    parsed = JSON.parse(trimmed);
  } catch {
    // Hook 打印了以 `{` 开头的日志行：不能因此让动作失败（B9.1）。
    return undefined;
  }

  // 形状校验：只接受对象，且已知字段类型正确。
  const errors = validateHookOutput(parsed);
  if (errors.length > 0) throw new HookOutputSchemaError(errors, hookEventName);

  return parsed as HookJsonOutputLike;
}

/**
 * 最小形状校验（B9.1 的「不符合 schema」）。
 *
 * 只校验本包**实际消费**的字段：`continue` / `reason` / `decision` / `hookSpecificOutput`。
 * 不引入完整 JSON Schema 依赖 —— 因为「scheme 校验」的语义在这里是
 * 「别把字符串当对象用」，而不是「穷举所有可能字段」。
 */
function validateHookOutput(parsed: unknown): string[] {
  const errors: string[] = [];
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    return ["root must be an object"];
  }
  const record = parsed as Record<string, unknown>;
  if ("continue" in record && typeof record.continue !== "boolean") {
    errors.push("continue must be a boolean");
  }
  if ("reason" in record && typeof record.reason !== "string") {
    errors.push("reason must be a string");
  }
  if ("decision" in record && record.decision !== "block") {
    errors.push('decision must be "block" when present');
  }
  if ("hookSpecificOutput" in record) {
    const specific = record.hookSpecificOutput;
    if (typeof specific !== "object" || specific === null) {
      errors.push("hookSpecificOutput must be an object");
    } else {
      const s = specific as Record<string, unknown>;
      if (typeof s.hookEventName !== "string") {
        errors.push("hookSpecificOutput.hookEventName must be a string");
      }
      if (
        "permissionDecision" in s &&
        s.permissionDecision !== "allow" &&
        s.permissionDecision !== "deny" &&
        s.permissionDecision !== "ask"
      ) {
        errors.push("permissionDecision must be allow|deny|ask");
      }
    }
  }
  return errors;
}

/**
 * 合成 exitCode === 2 的阻断输出（B9.2）。
 *
 * 四个事件分支各有不同形状 —— 这是旧 Hook 生态的约定，必须逐个照做。
 */
export function synthesizeBlockedOutput(hookEventName: string, reason: string): HookJsonOutputLike {
  const blockReason = reason.length > 0 ? reason : DEFAULT_BLOCK_REASON;

  switch (hookEventName) {
    case "PreToolUse":
      return {
        continue: false,
        reason: blockReason,
        hookSpecificOutput: {
          hookEventName: "PreToolUse",
          permissionDecision: "deny",
          permissionDecisionReason: blockReason,
        },
      };
    case "PermissionRequest":
      return {
        continue: false,
        reason: blockReason,
        hookSpecificOutput: {
          hookEventName: "PermissionRequest",
          decision: { behavior: "deny", message: blockReason },
        },
      };
    case "Stop":
      return { decision: "block", reason: blockReason };
    default:
      return { continue: false, reason: blockReason };
  }
}

/**
 * 解析一次 Hook 执行结果（B8）。
 *
 * 分支：
 *   ① `completed` 且 `exitCode ?? 0 === 0` → 解析 stdout（B9.1）
 *   ② `exitCode === 2` → 合成阻断输出（B9.2）
 *   ③ 其他 → 抛 `HookExecutionFailedError`（recoverable）
 */
export function parseHookOutcome(
  outcome: HookExecutionOutcome,
  hookEventName: string,
): HookParseResult {
  const stderrPreview = toPreview(outcome.stderr);
  const stdoutPreview = toPreview(outcome.stdout);

  // ① 成功：解析 stdout。
  if (outcome.status === "completed" && (outcome.exitCode ?? 0) === 0) {
    const output = parseHookStdout(outcome.stdout, hookEventName);
    return stderrPreview === undefined
      ? { output }
      : { output, diagnostics: { stderrPreview, errorMessage: stderrPreview } };
  }

  // ② exitCode === 2：阻断（B9.2）。
  if (outcome.exitCode === 2) {
    const reason = stderrPreview ?? stdoutPreview ?? DEFAULT_BLOCK_REASON;
    const output = synthesizeBlockedOutput(hookEventName, reason);
    // B8.4：exit 2 时 stdout 预览也要带上。
    const diagnostics =
      stderrPreview === undefined && stdoutPreview === undefined
        ? undefined
        : {
            stderrPreview: stderrPreview ?? "",
            errorMessage: stderrPreview ?? "",
            ...(stdoutPreview === undefined ? {} : { stdoutPreview }),
          };
    return diagnostics === undefined ? { output } : { output, diagnostics };
  }

  // ③ 其他：执行失败（B8.3）。
  //    B8.3 的「其他状态/退出码」覆盖全部非成功情形 ——
  //    含 failed / timed_out / cancelled / spawn_error（合同原文「其他状态/退出码」）。
  const message =
    stderrPreview ?? stdoutPreview ?? `Hook process exited with status ${outcome.status}`;
  throw new HookExecutionFailedError(message, {
    exitCode: outcome.exitCode,
    hookEventName,
    status: outcome.status,
    stderrPreview: stderrPreview ?? "",
    stdoutPreview: stdoutPreview ?? "",
  });
}
