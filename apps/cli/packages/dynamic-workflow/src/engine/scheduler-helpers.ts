/**
 * 调度器的纯辅助函数（拆分原因：oxlint max-lines 上限 400 行）。hashMismatch 仍经 scheduler.ts 再导出，导入路径不变。
 */

import type { InstanceRef } from "./types.js";
import { INSTRUCTIONS_HEAD_MAX_CHARS, refToString, WorkflowError } from "./types.js";

/** replay 命中但 inputHash 不一致——纯度契约被破坏，run 大声失败。 */
export function hashMismatch(instance: InstanceRef, expected: string, got: string): WorkflowError {
  return new WorkflowError(
    "InputHashMismatch",
    `Replay hit at ${refToString(instance)} but inputHash differs (expected ${expected}, got ` +
      `${got}): the script is not deterministic, so the journal cannot be replayed.`,
    // 结构化 mismatch 与 ScriptHashMismatch 对齐：两个哈希不一致错误共用同一个字段，
    // 读端不必再从 message 文本里抠哈希。
    { mismatch: { expected, got } },
  );
}

/** cause → 一行有界文本（Error 取 message，其余 String()；空则给占位）。 */
export function describeCause(cause: unknown): string {
  const text = cause instanceof Error ? cause.message : String(cause);
  const trimmed = text.trim();
  if (trimmed.length === 0) return "unknown error";
  return trimmed.length > 300 ? `${trimmed.slice(0, 300)}…` : trimmed;
}

/**
 * 作者指令的开头（{@link INSTRUCTIONS_HEAD_MAX_CHARS} 个字符，去两端空白，**不加省略号**）。
 * 空指令返回 undefined：缺席的键比一个空串诚实——读面据此退回「不知道它被交代了什么」。
 */
export function headOfInstructions(instructions: string): string | undefined {
  const trimmed = instructions.trim();
  if (trimmed.length === 0) return undefined;
  return trimmed.length <= INSTRUCTIONS_HEAD_MAX_CHARS
    ? trimmed
    : trimmed.slice(0, INSTRUCTIONS_HEAD_MAX_CHARS);
}
