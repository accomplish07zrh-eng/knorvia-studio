// Historical snapshot projection: specs/knorvia-read-state-snapshots.md.
// Existing repository licence remains applicable pending source review.
import type { MessageId, MessagePart, MessageWithParts } from "@knorvia/contracts";
import {
  parseReadFileStateMetadata,
  type PersistedReadFileStateMetadata,
} from "../tool/read-file-state-metadata.js";
import { createReadFileStateKey, normalizeReadFileStateMtimeMs } from "../tool/read-file-state.js";
import type { ReadFileStateMap } from "../tool/types.js";
import { activeSessionMessages } from "./session-history-hydrator.js";

export interface ReadFileStateHydrationResult {
  restoredCount: number;
  skippedRangeReadCount: number;
  skippedUnreadableEditCount: number;
}

const SNAPSHOT_TOOLS = new Set(["Read", "Write", "Edit"]);
const RANGE_READ = "range-read";
type Admission = PersistedReadFileStateMetadata | typeof RANGE_READ | undefined;

function fullWindow(window: { offset?: number; limit?: number }): boolean {
  return (window.offset ?? 1) <= 1 && window.limit === undefined;
}

function admit(part: MessagePart): Admission {
  if (part.type !== "tool" || part.state.status !== "completed" || !("output" in part.state)) {
    return undefined;
  }
  if (!SNAPSHOT_TOOLS.has(part.tool)) return undefined;
  if (part.tool === "Read") {
    const window = part.state.input;
    if (!window || typeof window !== "object" || Array.isArray(window)) return undefined;
    // 范围 Read 的跳过计数发生在 metadata 校验前，保持旧日志统计与恢复边界。
    if (!fullWindow(window)) return RANGE_READ;
  }
  const snapshot = parseReadFileStateMetadata(part.state.metadata);
  return snapshot?.tool === part.tool && fullWindow(snapshot) ? snapshot : undefined;
}

export async function hydrateReadFileStateFromSession(input: {
  branchCutAfterMessageId?: MessageId;
  messages: MessageWithParts[];
  readFileState: ReadFileStateMap;
  rewindCreatedMessageId?: MessageId;
  rewindKeptMessageIds?: readonly MessageId[];
  rewindTargetMessageId?: MessageId;
  workingDirectory: string;
  workspaceRoot: string;
}): Promise<ReadFileStateHydrationResult> {
  const states = input.readFileState;
  states.clear();
  const selected = activeSessionMessages(input.messages, {
    includeCompactPreservedSegment: false,
    branchCutAfterMessageId: input.branchCutAfterMessageId,
    rewindCreatedMessageId: input.rewindCreatedMessageId,
    rewindKeptMessageIds: input.rewindKeptMessageIds,
    rewindTargetMessageId: input.rewindTargetMessageId,
  });
  const result: ReadFileStateHydrationResult = {
    restoredCount: 0,
    skippedRangeReadCount: 0,
    skippedUnreadableEditCount: 0,
  };
  for (const message of selected) {
    if (message.info.role !== "assistant") continue;
    const uniqueParts = new Map(message.parts.map((part) => [part.id, part]));
    for (const part of uniqueParts.values()) {
      const snapshot = admit(part);
      if (snapshot === RANGE_READ) {
        result.skippedRangeReadCount++;
      } else if (snapshot) {
        // 只从持久化事实投影：不重新读取磁盘，也不把显示输出认证为已读内容。
        // 同一路径按活跃历史的处理顺序覆盖，不能按持久化时钟重新排序。
        states.set(createReadFileStateKey(snapshot.path, 1, undefined), {
          path: snapshot.path,
          content: snapshot.content,
          offset: undefined,
          limit: undefined,
          isPartialView: snapshot.isPartialView,
          readAt: new Date(snapshot.readAtMs),
          sourceTool: snapshot.tool,
          revisionId: snapshot.revisionId,
          mtimeMs: normalizeReadFileStateMtimeMs(snapshot.mtimeMs),
          sizeBytes: snapshot.sizeBytes,
        });
        result.restoredCount++;
      }
    }
  }
  return result;
}
