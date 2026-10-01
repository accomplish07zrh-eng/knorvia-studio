// Source-exposed outcome projection. Model-facing prose and native violation expressions remain.
import {
  RespondToCoordinatorOutputSchema,
  SendMessageOutputSchema,
  SubmitResultOutputSchema,
  type SubmitResultOutput,
  type SubmitVerdict,
  type SubmitViolation,
} from "@knorvia/contracts";
import type { ToolHandlerFailure } from "../types.js";

const UNKNOWN_RECIPIENT = "unknown";
const UNKNOWN_DELIVERY_ERROR = "unknown error";
const DEFAULT_DELIVERY = "queued";
const CONTINUATION =
  "Continue the current task unless the coordinator explicitly changed or ended it.";
const VIOLATION_HEADER = "The submitted result does not match the required schema:";
const EMPTY_VIOLATIONS = "(no details provided)";
const ACCEPTED_SUBMISSION = "The result was accepted.";
const INVALID_SUBMISSION = "submit_result returned an invalid result.";

export function sendMessageModelContent(output: unknown): string {
  const result = SendMessageOutputSchema.parse(output);
  if (result.message) return result.message;
  const recipient = result.agentId ?? result.taskId ?? UNKNOWN_RECIPIENT;
  const detail =
    result.status === "success"
      ? [`was ${result.delivery || DEFAULT_DELIVERY} for local agent ${recipient}.`]
      : [`failed to send to local agent ${recipient}: ${result.error ?? UNKNOWN_DELIVERY_ERROR}.`];
  return [`Message ${result.messageId}`, ...detail].join(" ");
}

export function coordinatorResponseModelContent(output: unknown): string {
  const result = RespondToCoordinatorOutputSchema.parse(output);
  const status = result.status === "success" ? "was queued" : "failed to queue";
  const segments = [`Response ${result.responseId} ${status} for the coordinator.`, CONTINUATION];
  // 错误详情无长度上限，continuation 必须放在它之前，避免 resultBudget 截断关键指引。
  if (result.status !== "success") segments.push(`Failure: ${result.error ?? result.message}.`);
  return segments.join(" ");
}

// 违规格式与 dynamic-workflow 合成侧一致：一行一条，`<path>: expected <expected>, got <got>`，
// 便于模型逐条对照修复。
function violationText(violations: readonly SubmitViolation[]): string {
  const header = VIOLATION_HEADER;
  if (violations.length === 0) return [header, EMPTY_VIOLATIONS].join("\n");
  // map、lines 与 spread 保留：稀疏数组及非标准 map 的既有求值/原生错误属于冻结合同。
  const lines = violations.map(
    (violation) => `${violation.path}: expected ${violation.expected}, got ${violation.got}`,
  );
  return [header, ...lines].join("\n");
}

export function submissionOutcome(
  verdict: SubmitVerdict,
  errorCode: number,
): SubmitResultOutput | ToolHandlerFailure {
  // reject：以 ToolHandlerFailure 返回，call-runner 将其转成 error tool_result，
  // 违规列表作为 modelContent 存活；不挂 turnControl，循环继续 → 模型在会话内修复重试。
  return verdict.accept
    ? { status: "accepted" }
    : { result: false, errorCode, message: violationText(verdict.violations) };
}

export function submitResultModelContent(output: unknown): string {
  return SubmitResultOutputSchema.safeParse(output).success
    ? ACCEPTED_SUBMISSION
    : INVALID_SUBMISSION;
}
