import type { StudioMessage } from "@knorvia/services";
import {
  PROTOCOL_V4_LIMITS,
  type ConversationRow,
  type V4ConversationRowsRangeParams,
  type V4ConversationRowsRangeResult,
} from "@knorvia/shared/protocol-v4";
import { formatHandoffMarkdown } from "../studio/agents/sessionHandoff.js";

const EXPORT_ROW_LIMIT = 10_000;

/** The V4 projection owns the branch; only its visible user/assistant/tool rows are transferable. */
export function nativeVisibleMessages(
  rows: readonly ConversationRow[],
  sessionId: string,
): StudioMessage[] {
  return rows.flatMap((row): StudioMessage[] => {
    if (row.kind !== "userInput" && row.kind !== "assistantText" && row.kind !== "toolCall")
      return [];
    if (row.kind === "userInput" && row.origin !== "realUser") return [];
    const kind = row.kind === "toolCall" ? "tool" : "text";
    const text =
      row.kind === "toolCall"
        ? ""
        : row.kind === "userInput" && row.epilogueStart !== undefined
          ? row.text.slice(0, row.epilogueStart)
          : row.text;
    return [
      {
        id: String(row.rowId),
        sequence: row.rowId,
        targetId: sessionId,
        runId: row.turnId,
        sender: row.kind === "userInput" ? "user" : "knorvia",
        kind,
        text,
        ...(row.kind === "toolCall" ? { name: row.toolName, state: row.status } : {}),
        createdAt: row.createdAt,
        updatedAt: row.createdAt,
      },
    ];
  });
}

/** Read the authoritative branch in bounded pages; reject a changing epoch/revision. */
export async function exportNativeConversationMarkdown(
  rowsRange: (params: V4ConversationRowsRangeParams) => Promise<V4ConversationRowsRangeResult>,
  sessionId: string,
  snapshot: { logEpoch: string; rows: { window: readonly ConversationRow[] } },
  title: string,
): Promise<string> {
  const lastRowId = snapshot.rows.window.at(-1)?.rowId;
  if (lastRowId === undefined) throw new Error("会话尚无可导出记录");
  const collected: ConversationRow[] = [];
  let beforeRowId = lastRowId + 1;
  let firstRevision: number | undefined;
  for (;;) {
    const page = await rowsRange({
      sessionId,
      beforeRowId,
      limit: PROTOCOL_V4_LIMITS.rowsRangeMaxLimit,
    });
    if (
      page.atLogEpoch !== snapshot.logEpoch ||
      (firstRevision !== undefined && page.atRevision !== firstRevision)
    )
      throw new Error("会话历史在导出期间发生变化，请重试");
    firstRevision = page.atRevision;
    if (page.rows.length === 0 || page.rows.some((row) => row.rowId >= beforeRowId))
      throw new Error("会话历史分页无法继续，未导出不完整内容");
    collected.push(...page.rows);
    if (collected.length > EXPORT_ROW_LIMIT) throw new Error("会话超出导出条数上限");
    const next = page.rows[0]?.rowId;
    if (next === undefined || next >= beforeRowId)
      throw new Error("会话历史分页无法继续，未导出不完整内容");
    beforeRowId = next;
    if (!page.hasMore) break;
  }
  const ordered = collected.sort((a, b) => a.rowId - b.rowId);
  return formatHandoffMarkdown(nativeVisibleMessages(ordered, sessionId), title, "Knorvia");
}
