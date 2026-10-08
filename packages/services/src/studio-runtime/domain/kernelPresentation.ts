import type { StudioQuestion, StudioToolState } from "../kernelTypes.js";
import { list, record, safeDetail, text } from "./kernelPolicy.js";

/** 决策所需元数据先展示，再放可能超长的输入；路由 ID 不属于审批内容。 */
export function nativeApprovalDetail(value: Record<string, unknown>): string {
  const ordered: Record<string, unknown> = {};
  for (const key of ["cwd", "reason", "kind", "context", "title", "tool_name"]) {
    if (value[key] !== undefined) ordered[key] = value[key];
  }
  for (const [key, field] of Object.entries(value)) {
    if (!["threadId", "turnId", "sessionId", "availableDecisions"].includes(key))
      ordered[key] = field;
  }
  return safeDetail(ordered);
}

/** 选项描述只用于展示；提交值始终保留原 label，兼容历史 string 选项。 */
export function nativeQuestionOptions(value: unknown): StudioQuestion["options"] {
  return list(value).flatMap<StudioQuestion["options"][number]>((option) => {
    if (typeof option === "string") return [option];
    const { label, description } = record(option);
    return typeof label === "string"
      ? [{ label, ...(typeof description === "string" ? { description } : {}) }]
      : [];
  });
}

/** 未知或缺失原生状态不是成功，也不是仍在运行。 */
export function nativeToolState(value: unknown): StudioToolState {
  switch (value) {
    case "pending":
    case "in_progress":
    case "inProgress":
    case "running":
      return "running";
    case "completed":
    case "succeeded":
      return "succeeded";
    case "failed":
    case "declined":
      return "failed";
    case "cancelled":
    case "canceled":
      return "cancelled";
    case "interrupted":
      return "interrupted";
    default:
      return "unknown";
  }
}

/** ACP 的 typed content 与 rawOutput 不能互相覆盖；缺省键不能变成空字符串。 */
export function acpToolUpdate(update: Record<string, unknown>) {
  return {
    id: text(update.toolCallId),
    ...(update.title !== undefined || update.kind !== undefined
      ? { name: text(update.title) || text(update.kind) }
      : {}),
    ...(update.status !== undefined
      ? { state: nativeToolState(update.status), statusDetail: safeDetail(update.status) }
      : {}),
    ...(update.rawInput !== undefined ? { input: safeDetail(update.rawInput) } : {}),
    ...(update.rawOutput !== undefined ? { output: safeDetail(update.rawOutput) } : {}),
    ...(update.content !== undefined ? { content: safeDetail(update.content) } : {}),
  };
}
