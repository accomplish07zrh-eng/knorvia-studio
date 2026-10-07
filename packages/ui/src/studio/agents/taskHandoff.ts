import type { IFileService, StudioMessage } from "@knorvia/services";
import {
  HANDOFF_FIELD_KEYS,
  HANDOFF_TEXT_LIMIT,
  createHandoffField,
  emptyHandoffRecord,
  handoffPathInside,
  handoffRelativePath,
  sameHandoffScope,
  sanitizeHandoffText,
  type HandoffScope,
  type SessionHandoffRecord,
} from "@knorvia/shared";

export const HANDOFF_FIELD_LABELS = {
  goal: ["任务目标", "Task goal"],
  constraints: ["约束", "Constraints"],
  decisions: ["决策", "Decisions"],
  progress: ["当前进展", "Current progress"],
  failedAttempts: ["失败尝试", "Failed attempts"],
  remainingSteps: ["剩余步骤", "Remaining steps"],
  acceptanceCriteria: ["验收标准", "Acceptance criteria"],
  uncertainty: ["不确定事项", "Uncertainty"],
} as const;

export interface HandoffContext {
  scope: HandoffScope;
  record?: SessionHandoffRecord;
  historyStartKnown: boolean;
  /** Total rows may include hidden records; this is not a visible message count. */
  totalRecordCount?: number;
  /** Rows excluded by the native visible-row adapter before this builder receives them. */
  excludedRecordCount?: number;
  verifiedReferences?: readonly string[];
}
function selectedMessages(messages: readonly StudioMessage[], scope?: HandoffScope) {
  return messages.filter(
    (m) =>
      !scope ||
      (m.targetId === scope.sessionId && (m.sender === "user" || m.sender === scope.kernelId)),
  );
}
function visible(message: StudioMessage) {
  return message.sender !== "system" && (message.kind === "text" || message.kind === "tool");
}
function ordered(messages: readonly StudioMessage[]) {
  return [...messages].sort((a, b) => (a.sequence ?? a.createdAt) - (b.sequence ?? b.createdAt));
}
/** A partial tail can never identify the original objective. User edits, including clear, win. */
export function captureHandoffGoal(
  context: HandoffContext,
  messages: readonly StudioMessage[],
): SessionHandoffRecord {
  const previous =
    context.record && sameHandoffScope(context.record.scope, context.scope)
      ? context.record
      : emptyHandoffRecord(context.scope);
  if (previous.fields.goal || !context.historyStartKnown) return previous;
  const first = ordered(selectedMessages(messages, context.scope)).find(
    (m) => m.sender === "user" && m.kind === "text" && m.text.trim(),
  );
  return first
    ? {
        ...previous,
        fields: {
          ...previous.fields,
          goal: createHandoffField("goal", first.text, "visible-message", first.id),
        },
      }
    : previous;
}

/** Metadata checks only, on the selected workspace. Saved existence is never trusted. */
export async function verifyHandoffReferences(
  fileService: Pick<IFileService, "resolvePath" | "stat"> | undefined,
  record: SessionHandoffRecord,
): Promise<string[]> {
  if (!fileService || record.references.length === 0) return [];
  let root: string;
  try {
    root = await fileService.resolvePath({ path: record.scope.workspacePath });
  } catch {
    return [];
  }
  const results = await Promise.allSettled(
    record.references.map(async (reference) => {
      const relative = handoffRelativePath(reference);
      if (!relative) return null;
      const resolved = await fileService.resolvePath({
        path: `${record.scope.workspacePath.replace(/[\\/]+$/, "")}/${relative}`,
      });
      if (!handoffPathInside(root, resolved)) return null;
      const stat = await fileService.stat({ path: resolved });
      return stat.type === "file" ? relative : null;
    }),
  );
  return results.flatMap((r) => (r.status === "fulfilled" && r.value ? [r.value] : []));
}

export function buildTaskHandoffDraft(
  messages: readonly StudioMessage[],
  sourceName: string,
  zh: boolean,
  context?: HandoffContext,
) {
  const record = context ? captureHandoffGoal(context, messages) : undefined;
  const selected = selectedMessages(messages, context?.scope);
  const allVisible = ordered(selected.filter(visible));
  const recent = allVisible.slice(-24);
  const verified = (context?.verifiedReferences ?? []).filter(
    (ref) => record?.references.includes(ref) && handoffRelativePath(ref) === ref,
  );
  const sections = HANDOFF_FIELD_KEYS.map((key) => {
    const field = record?.fields[key];
    const label = HANDOFF_FIELD_LABELS[key][zh ? 0 : 1];
    const source =
      field?.origin === "visible-message"
        ? zh
          ? `可见用户消息 #${field.sourceMessageId} 摘录，未独立核验`
          : `Visible user message #${field.sourceMessageId} excerpt; not independently verified`
        : zh
          ? "用户编辑"
          : "User edited";
    return `## ${label}\n${field?.text ? `[${source}]\n${field.text}` : zh ? "缺失：请用户补充" : "Missing: ask the user"}`;
  });
  sections.push(
    `## ${zh ? "相关文件／成果引用" : "Relevant files / artifacts"}\n${
      verified.length
        ? `[${zh ? "用户填写；仅核验本次预览时文件在所选项目内存在，未读正文" : "User supplied; existence in selected project checked for this preview, contents unread"}]\n${verified.map((ref) => `- ${ref}`).join("\n")}`
        : zh
          ? "缺失：无已核验引用"
          : "Missing: no verified references"
    }`,
  );
  const structured = sections.join("\n\n");
  let omittedChars = Object.values(record?.fields ?? {}).reduce(
    (sum, f) => sum + f.omittedChars,
    0,
  );
  let remaining = HANDOFF_TEXT_LIMIT - structured.length - 1800;
  const lines: string[] = [];
  // 保留最晚记录且按时序呈现；目标先占预算，不能被长尾覆盖。
  for (const message of [...recent].reverse()) {
    const raw = sanitizeHandoffText(
      message.kind === "tool"
        ? `${message.name || "tool"} (${message.state || "unknown"})`
        : message.text,
    )
      .replace(/\s+/g, " ")
      .trim();
    const excerpt = raw.slice(0, 700);
    omittedChars += Math.max(0, raw.length - excerpt.length);
    const role =
      message.kind === "tool"
        ? zh
          ? "工具"
          : "Tool"
        : message.sender === "user"
          ? zh
            ? "用户"
            : "User"
          : sanitizeHandoffText(sourceName).slice(0, 80);
    const line = `- ${role}: ${excerpt}`;
    if (!excerpt || line.length > remaining) continue;
    lines.unshift(line);
    remaining -= line.length + 1;
  }
  const omittedCount = allVisible.length - lines.length;
  const omittedReferences = (record?.references.length ?? 0) - verified.length;
  const unknownHistory = !context?.historyStartKnown;
  const excludedCount = messages.length - allVisible.length + (context?.excludedRecordCount ?? 0);
  const stats = zh
    ? `已加载可见 ${allVisible.length}；摘录纳入 ${lines.length}；条数／预算省略 ${omittedCount}；非可见／其他会话排除 ${excludedCount}；字段／摘录截断 ${omittedChars} 字符；引用省略 ${omittedReferences}。${unknownHistory ? "更早历史未加载，省略数量未知。" : "已到历史开头。"}`
    : `Loaded visible ${allVisible.length}; excerpts included ${lines.length}; count/budget omitted ${omittedCount}; non-visible/other conversation excluded ${excludedCount}; field/excerpt truncated ${omittedChars} characters; references omitted ${omittedReferences}. ${unknownHistory ? "Earlier history is unloaded; omitted count unknown." : "History start loaded."}`;
  const total =
    context?.totalRecordCount === undefined
      ? ""
      : zh
        ? ` 总记录数（含非可见）：${context.totalRecordCount}。`
        : ` Total records (including non-visible): ${context.totalRecordCount}.`;
  const heading = zh
    ? "请在此基础上继续当前项目的工作。这是新会话接力，不是模型私有状态转换。以下结构化记录和可见摘录由用户审核，全文修改属于用户提供的上下文；缺失与未核验项需确认。"
    : "Continue the current project from this reviewed context. This handoff starts a new conversation; it does not convert private model state. Structured notes and visible excerpts are user reviewed; full-text edits are user supplied. Confirm missing and unverified context.";
  const text = `${heading}\n\n${stats}${total}\n\n${structured}\n\n## ${zh ? "最近可见摘录（陈述未独立核验）" : "Recent visible excerpts (claims not independently verified)"}\n${lines.join("\n")}`;
  return { text, includedCount: lines.length, omittedCount, omittedChars, omittedReferences };
}
