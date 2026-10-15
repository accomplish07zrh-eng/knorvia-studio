// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2026 Knorvia Studio contributors
// 历史快照投影：把会话里已完成的 Read/Write/Edit 工具结果还原成文件读取状态表。
import type { MessageId, MessagePart, MessageWithParts } from "@knorvia/contracts";
import {
  parseReadFileStateMetadata,
  type PersistedReadFileStateMetadata,
} from "../tool/read-file-state-metadata.js";
import { createReadFileStateKey, normalizeReadFileStateMtimeMs } from "../tool/read-file-state.js";
import type { ReadFileStateMap } from "../tool/types.js";
import { activeSessionMessages } from "./session-history-hydrator.js";

export interface ReadFileStateHydrationResult {
  restoredCount: number; // 成功投影的文件数
  skippedRangeReadCount: number; // 因范围读被跳过的 part 数
  skippedUnreadableEditCount: number; // 不可读编辑数（本投影恒为 0）
}

/** 能产出快照的工具；其余工具的历史结果不参与投影。 */
const SNAPSHOT_SOURCE_TOOLS = new Set(["Read", "Write", "Edit"]);

const RANGE_READ_MARKER = "range-read";

type Admission = PersistedReadFileStateMetadata | typeof RANGE_READ_MARKER | undefined;

/** 状态表的值类型。 */
type ReadFileStateEntry = ReadFileStateMap extends Map<string, infer Entry> ? Entry : never;

/** 投影入参：消息、目标状态表与三个 rewind / 分支剪切定位。 */
interface ReadFileStateHydrationInput {
  branchCutAfterMessageId?: MessageId; // 分支剪切点，其后的历史不参与
  messages: MessageWithParts[]; // 待投影的活跃会话消息
  readFileState: ReadFileStateMap; // 目标状态表，投影前先清空
  rewindCreatedMessageId?: MessageId; // rewind 新建的消息
  rewindKeptMessageIds?: readonly MessageId[]; // rewind 期间保留的消息
  rewindTargetMessageId?: MessageId; // rewind 目标消息
  workingDirectory: string; // 工作目录
  workspaceRoot: string; // 工作区根目录
}

/** 全量窗口 = offset 缺省或不大于 1，且没有 limit。 */
function coversWholeFile(window: { offset?: number; limit?: number }): boolean {
  const startsAtTop = (window.offset ?? 1) <= 1;
  return startsAtTop && window.limit === undefined;
}

/** 单个 part 的接纳判定：返回快照、范围读标记或 undefined（忽略）。 */
function admitPart(part: MessagePart): Admission {
  if (part.type !== "tool") return undefined;
  if (part.state.status !== "completed") return undefined;
  if (!("output" in part.state)) return undefined;
  if (!SNAPSHOT_SOURCE_TOOLS.has(part.tool)) return undefined;

  const fromRead = part.tool === "Read";
  if (fromRead) {
    const window = part.state.input;
    if (!window || typeof window !== "object" || Array.isArray(window)) return undefined;
    // 范围 Read 的跳过计数先于 metadata 校验，保持既有日志统计与恢复边界。
    if (!coversWholeFile(window)) return RANGE_READ_MARKER;
  }

  const snapshot = parseReadFileStateMetadata(part.state.metadata);
  return snapshot?.tool === part.tool && coversWholeFile(snapshot) ? snapshot : undefined;
}

/** 落一条状态：只取持久化事实，同一路径按遍历顺序覆盖。 */
function projectSnapshot(states: ReadFileStateMap, snapshot: PersistedReadFileStateMetadata): void {
  const entry = {} as ReadFileStateEntry;
  entry.path = snapshot.path;
  entry.content = snapshot.content;
  entry.offset = undefined;
  entry.limit = undefined;
  entry.isPartialView = snapshot.isPartialView;
  entry.readAt = new Date(snapshot.readAtMs);
  entry.sourceTool = snapshot.tool;
  entry.revisionId = snapshot.revisionId;
  entry.mtimeMs = normalizeReadFileStateMtimeMs(snapshot.mtimeMs);
  entry.sizeBytes = snapshot.sizeBytes;
  states.set(createReadFileStateKey(snapshot.path, 1, undefined), entry);
}

/** 选择活跃消息的选项：刻意显式给全，避免调用方误以为有别的默认值。 */
function selectionOptions(input: ReadFileStateHydrationInput) {
  const selection = {} as NonNullable<Parameters<typeof activeSessionMessages>[1]>;
  selection.includeCompactPreservedSegment = false;
  selection.branchCutAfterMessageId = input.branchCutAfterMessageId;
  selection.rewindCreatedMessageId = input.rewindCreatedMessageId;
  selection.rewindKeptMessageIds = input.rewindKeptMessageIds;
  selection.rewindTargetMessageId = input.rewindTargetMessageId;
  return selection;
}

/**
 * 先清空状态表，再按活跃历史顺序投影助手消息里的快照；part 先按 id 去重（后者胜）。
 * 不重新读取磁盘，也不把工具显示输出当作已读内容。
 */
export const hydrateReadFileStateFromSession = async (
  input: ReadFileStateHydrationInput,
): Promise<ReadFileStateHydrationResult> => {
  const states = input.readFileState;
  states.clear();
  const selected = activeSessionMessages(input.messages, selectionOptions(input));
  const tally = {} as ReadFileStateHydrationResult;
  tally.restoredCount = 0;
  tally.skippedRangeReadCount = 0;
  tally.skippedUnreadableEditCount = 0;

  for (const message of selected) {
    const isAssistantTurn = message.info.role === "assistant";
    if (!isAssistantTurn) {
      continue;
    }
    const uniqueParts = new Map(message.parts.map((part) => [part.id, part]));
    for (const part of uniqueParts.values()) {
      const admission = admitPart(part);
      if (admission === RANGE_READ_MARKER) {
        tally.skippedRangeReadCount += 1;
      } else if (admission !== undefined) {
        projectSnapshot(states, admission);
        tally.restoredCount += 1;
      }
    }
  }
  return tally;
};
