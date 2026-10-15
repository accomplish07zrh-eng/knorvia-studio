// SPDX-License-Identifier: Apache-2.0
// rewind/fork 的检查点选择与提示文本（B43）。检查点候选只认工作区/双域 scope，给 id 精确
// 匹配、不给取最后一个，按消息匹配认 messageId/targetMessageId/toolMessageId 任一；
// 工作区检查点产物 JSON 的 kind/version/内容类型常量逐字冻结；文件变更候选要求 filePath
// 非空、structuredPatch 全是合法 hunk、originalFile 为 null 或字符串；评估项从事件（检查点 +
// 压缩边界）或消息（含压缩边界的部件）生成；各类提示正文逐行拼接后过系统提醒净化，不可用
// 原因映射固定英文句子。同步纯计算，解析失败的载荷被过滤掉，不抛异常。
import {
  RewindScope,
  SessionEventType,
  parseCheckpointCreatedPayload,
  parseCompactBoundaryPayload,
} from "../../deps.js";
import type {
  CompactBoundaryPayload,
  MessageId,
  MessageWithParts,
  SessionEvent,
  SessionId,
  DiffHunk,
  CheckpointCreatedPayload,
  RewindTargetEvaluation,
  WorkspaceCheckpointArtifact,
  ToolExecutionResult,
} from "../../deps.js";
import type { WorkspaceRewindRestoredFile } from "../../types.js";
import { isPlainRecord, isRuntimeDiffHunk } from "./identity-and-guards.js";
import { sanitizeSystemReminderBody } from "../../../system-reminder/source.js";

// 工作区检查点产物的三件套常量（值逐字冻结）。
export const WORKSPACE_CHECKPOINT_CONTENT_TYPE =
  "application/vnd.knorvia-studio.workspace-checkpoint+json";
const CHECKPOINT_ARTIFACT_KIND = "workspace_file_before_change";
const CHECKPOINT_ARTIFACT_VERSION = 1;
const JSON_INDENT = 2;

// 预览截断参数：超 140 字符截 137 加省略号。
const PREVIEW_MAX_CHARS = 140;
const PREVIEW_KEEP_CHARS = 137;
const PREVIEW_ELLIPSIS = "...";

// 压缩边界评估项的 id 前缀。
const BOUNDARY_ITEM_PREFIX = "compact_boundary";

// 空行占位（提示正文按行拼接时保留空行）。
const BLANK_LINE = "";

// 工作区/双域检查点的 scope 白名单。
const WORKSPACE_SCOPES: ReadonlySet<string> = new Set<string>([
  RewindScope.Workspace,
  RewindScope.Both,
]);

// 文件变更检查点候选：来自工具输出的文件写入记录。
export interface FileMutationCheckpointCandidate {
  content?: string; // 写入后的文件内容
  filePath: string; // 变更文件路径
  originalFile: string | null; // 写入前内容，null 表示新建
  structuredPatch: DiffHunk[]; // 全部合法的 diff hunk
  type?: string; // 变更类型标记
}

// 回退评估项：消息 id + 可选的压缩边界载荷。
export interface RewindEvaluationItem {
  compactBoundary?: CompactBoundaryPayload; // 压缩边界（如有）
  id: string; // 评估项标识
}

// 工作区回退提醒的装配参数。
export interface WorkspaceRewindNoticeOptions {
  checkpoint: CheckpointCreatedPayload; // 命中的检查点
  evaluation: RewindTargetEvaluation; // 目标评估结论
  restoredFiles: WorkspaceRewindRestoredFile[]; // 恢复的文件清单
  rewindId: string; // 本次回退标识
}

// 检查点分叉提醒的装配参数。
export interface WorkspaceForkNoticeOptions {
  checkpoint: CheckpointCreatedPayload; // 命中的检查点
  parentSessionId: SessionId; // 父会话标识
  restoredFiles: WorkspaceRewindRestoredFile[]; // 恢复的文件清单
}

// 按消息分叉提醒的装配参数。
export interface ForkAtMessageNoticeOptions {
  parentSessionId: SessionId; // 父会话标识
  restoredFiles: WorkspaceRewindRestoredFile[]; // 恢复的文件清单
  targetMessageId: MessageId; // 分叉目标消息
  undoneCheckpointCount: number; // 被撤销的检查点数量
}

// 无工作区分叉提醒的装配参数。
export interface ConversationForkNoticeOptions {
  parentSessionId: SessionId; // 父会话标识
  targetMessageId: MessageId; // 分叉目标消息
}

// 从工具输出里认领文件变更检查点候选；任一条件不符整条拒绝。
export const getFileMutationCheckpointCandidate = (
  fields: unknown,
): FileMutationCheckpointCandidate | undefined => {
  if (!isPlainRecord(fields)) return undefined;
  const filePath = fields.filePath;
  if (typeof filePath !== "string" || filePath.length === 0) return undefined;
  const rawPatch = fields.structuredPatch;
  if (!Array.isArray(rawPatch)) return undefined;
  const before = fields.originalFile;
  if (before !== null && typeof before !== "string") return undefined;
  const hunks = rawPatch.filter(isRuntimeDiffHunk);
  if (hunks.length !== rawPatch.length) return undefined; // 有一条不合法就整条拒绝

  const candidate: FileMutationCheckpointCandidate = {
    content: typeof fields.content === "string" ? fields.content : undefined,
    filePath,
    originalFile: before,
    structuredPatch: hunks,
    type: typeof fields.type === "string" ? fields.type : undefined,
  };
  return candidate;
};

// 产物创建时间戳（ISO 8601）。
const buildArtifactTimestamp = (): string => new Date().toISOString();

// 把候选序列化成工作区检查点产物 JSON（缩进 2 空格）。
export const stringifyWorkspaceCheckpointArtifact = (
  snapshotFile: FileMutationCheckpointCandidate,
  toolCall: ToolExecutionResult,
): string => {
  const fileRecord: WorkspaceCheckpointArtifact["files"][number] = {
    ...(snapshotFile.content !== undefined ? { afterContent: snapshotFile.content } : {}),
    afterContentLength: snapshotFile.content?.length,
    beforeContent: snapshotFile.originalFile,
    existedBefore: snapshotFile.originalFile !== null,
    path: snapshotFile.filePath,
    structuredPatch: snapshotFile.structuredPatch,
  };
  const payload: WorkspaceCheckpointArtifact = {
    createdAt: buildArtifactTimestamp(),
    files: [fileRecord],
    kind: CHECKPOINT_ARTIFACT_KIND,
    toolCallId: toolCall.toolCallId,
    toolName: toolCall.toolName,
    version: CHECKPOINT_ARTIFACT_VERSION,
  };
  return JSON.stringify(payload, null, JSON_INDENT);
};

// 收集事件流里全部工作区/双域检查点（按事件顺序）。
const collectWorkspaceCheckpoints = (
  events: readonly SessionEvent[],
): CheckpointCreatedPayload[] => {
  const found: CheckpointCreatedPayload[] = [];
  for (const event of events) {
    if (event.type !== SessionEventType.CheckpointCreated) continue;
    const checkpoint = parseCheckpointCreatedPayload(event.payload);
    if (WORKSPACE_SCOPES.has(checkpoint.scope)) found.push(checkpoint);
  }
  return found;
};

// 检查点关联消息判定：三个 id 任一命中即可。
const checkpointMatchesMessage = (
  checkpoint: CheckpointCreatedPayload,
  targetMessageId: MessageId,
): boolean => {
  const linked = new Set([
    checkpoint.messageId,
    checkpoint.targetMessageId,
    checkpoint.toolMessageId,
  ]);
  return linked.has(targetMessageId);
};

// 选工作区回退检查点：给 id 精确匹配，不给取最后一个。
export const selectCheckpointForRewind = (
  events: readonly SessionEvent[],
  checkpointId?: string,
): CheckpointCreatedPayload | undefined => {
  const all = collectWorkspaceCheckpoints(events);
  if (!checkpointId) return all.at(-1);
  return all.find((checkpoint) => checkpoint.checkpointId === checkpointId);
};

// 选一条消息关联的检查点（取最后一个命中）。
export const selectCheckpointForMessage = (
  events: readonly SessionEvent[],
  targetMessageId: MessageId,
): CheckpointCreatedPayload | undefined =>
  selectCheckpointsForMessages(events, [targetMessageId]).at(-1);

// 选一组消息关联的全部检查点；目标集为空直接给空数组。
export const selectCheckpointsForMessages = (
  events: readonly SessionEvent[],
  targetMessageIds: Iterable<MessageId>,
): CheckpointCreatedPayload[] => {
  const wanted = new Set(targetMessageIds);
  if (wanted.size === 0) return [];
  return collectWorkspaceCheckpoints(events).filter((checkpoint) => {
    for (const target of wanted) {
      if (checkpointMatchesMessage(checkpoint, target)) return true;
    }
    return false;
  });
};

// 从目标消息起到分支结尾的后缀 id 列表；目标缺席给空数组。
export const activeSuffixMessageIdsForRewind = (
  entries: readonly MessageWithParts[],
  targetMessageId: MessageId,
): MessageId[] => {
  const start = entries.findIndex((entry) => entry.info.id === targetMessageId);
  if (start < 0) return []; // 目标不在分支里
  const suffix: MessageId[] = [];
  let cursor = start;
  while (cursor < entries.length) {
    suffix.push(entries[cursor].info.id as MessageId);
    cursor += 1;
  }
  return suffix;
};

// 消息预览：优先非合成文本部件，空白压成单空格，超长截断加省略号。
export const previewTextFromMessage = (message: MessageWithParts): string | undefined => {
  const preferred = message.parts.find((part) => part.type === "text" && !part.synthetic);
  const fallback = message.parts.find((part) => part.type === "text");
  const chosen = preferred ?? fallback;
  if (!chosen || chosen.type !== "text") return undefined;
  const flat = chosen.text.replace(/\s+/g, " ").trim();
  if (flat.length === 0) return undefined; // 全空白没有预览
  return flat.length > PREVIEW_MAX_CHARS
    ? `${flat.slice(0, PREVIEW_KEEP_CHARS)}${PREVIEW_ELLIPSIS}`
    : flat;
};

// 从消息数组生成评估项：含压缩部件的消息带上边界载荷。
export const buildMessageRewindEvaluationItems = (
  entries: readonly MessageWithParts[],
): RewindEvaluationItem[] => {
  const items: RewindEvaluationItem[] = [];
  let cursor = 0;
  while (cursor < entries.length) {
    const message = entries[cursor];
    const boundaryPart = message.parts.find(
      (part) => part.type === "compaction" && part.compactBoundary,
    );
    if (boundaryPart?.type === "compaction" && boundaryPart.compactBoundary) {
      items.push({
        compactBoundary: parseCompactBoundaryPayload(boundaryPart.compactBoundary),
        id: message.info.id,
      });
    } else {
      items.push({ id: message.info.id });
    }
    cursor += 1;
  }
  return items;
};

// 事件 → 评估项的映射：检查点取目标消息 id，压缩边界带载荷，其余事件跳过。
const evaluationItemOf = (sessionEvent: SessionEvent): RewindEvaluationItem | undefined => {
  if (sessionEvent.type === SessionEventType.CheckpointCreated) {
    const parsed = parseCheckpointCreatedPayload(sessionEvent.payload);
    return { id: parsed.targetMessageId ?? parsed.messageId };
  }
  if (sessionEvent.type !== SessionEventType.CompactBoundary) return undefined;
  const compactBoundary = parseCompactBoundaryPayload(sessionEvent.payload);
  return {
    compactBoundary,
    id: [BOUNDARY_ITEM_PREFIX, compactBoundary.boundaryId].join(":"),
  };
};

// 逐事件收拢评估项，保持事件顺序。
export const buildRewindEvaluationItems = (
  sessionEvents: readonly SessionEvent[],
): RewindEvaluationItem[] => {
  const collected: RewindEvaluationItem[] = [];
  let cursor = 0;
  while (cursor < sessionEvents.length) {
    const item = evaluationItemOf(sessionEvents[cursor]);
    if (item) collected.push(item);
    cursor += 1;
  }
  return collected;
};

// 恢复文件行：`动作 路径`，逐行拼接。
const restoredFileRows = (files: WorkspaceRewindRestoredFile[]): string[] =>
  files.map((file) => `${file.action} ${file.path}`);

// 提示正文装配：过滤空行后过系统提醒净化。
const renderNoticeBody = (rows: string[]): string =>
  sanitizeSystemReminderBody(rows.filter((row) => row.length > 0));

// `键: 值` 形式的提示行。
const noticePair = (key: string, value: string | number): string => `${key}: ${value}`;

// 工作区回退提示正文。
export const formatWorkspaceRewindNoticeBody = (options: WorkspaceRewindNoticeOptions): string =>
  renderNoticeBody(
    [
      ["Workspace rewind applied."],
      [noticePair("rewindId", options.rewindId)],
      [noticePair("checkpointId", options.checkpoint.checkpointId)],
      [noticePair("strategy", options.evaluation.strategy)],
      [noticePair("restoredFiles", options.restoredFiles.length)],
      restoredFileRows(options.restoredFiles),
      ["Conversation history was not rewritten by this file restore."],
    ].flat(),
  );

// 检查点分叉提示正文。
export const formatWorkspaceForkNoticeBody = (options: WorkspaceForkNoticeOptions): string =>
  renderNoticeBody(
    [
      ["This session was forked from a previous session checkpoint."],
      [noticePair("parentSessionId", options.parentSessionId)],
      [noticePair("checkpointId", options.checkpoint.checkpointId)],
      [noticePair("targetMessageId", options.checkpoint.messageId)],
      [noticePair("restoredSnapshotRef", options.checkpoint.snapshotRef)],
      [noticePair("restoredFiles", options.restoredFiles.length)],
      restoredFileRows(options.restoredFiles),
      [
        "Continue from this fork. Do not assume messages after the fork point happened in this session.",
      ],
    ].flat(),
  );

// 按消息分叉提示正文（带工作区恢复说明）。
export const formatWorkspaceForkAtMessageNoticeBody = (
  options: ForkAtMessageNoticeOptions,
): string =>
  renderNoticeBody(
    [
      ["This session was forked from a previous session message."],
      [noticePair("parentSessionId", options.parentSessionId)],
      [noticePair("targetMessageId", options.targetMessageId)],
      [noticePair("undoneCheckpointCount", options.undoneCheckpointCount)],
      [noticePair("restoredFiles", options.restoredFiles.length)],
      restoredFileRows(options.restoredFiles),
      [
        "Workspace files changed after the fork point were restored to their state at the fork point.",
      ],
      [
        "Continue from this fork. Do not assume messages after the fork point happened in this session.",
      ],
    ].flat(),
  );

// 无工作区分叉提示正文。
export const formatConversationForkNoticeBody = (options: ConversationForkNoticeOptions): string =>
  renderNoticeBody(
    [
      ["This session was forked from a previous session message."],
      [noticePair("parentSessionId", options.parentSessionId)],
      [noticePair("targetMessageId", options.targetMessageId)],
      ["No workspace checkpoint was restored for this fork."],
      [
        "Continue from this fork. Do not assume messages after the fork point happened in this session.",
      ],
    ].flat(),
  );

// 不可用原因 → 固定句式渲染器；参数是检查点后缀与消息后缀（含前导空格或空串）。
const UNAVAILABLE_SENTENCE_BUILDERS: Record<
  string,
  (checkpointSuffix: string, messageSuffix: string) => string
> = {
  no_checkpoint_available: () => "No workspace checkpoint is available yet.",
  target_checkpoint_not_found: (checkpointSuffix, messageSuffix) =>
    messageSuffix
      ? ["No workspace checkpoint was found for message", messageSuffix, "."].join("")
      : ["Checkpoint", checkpointSuffix, " was not found."].join(""),
  target_message_not_found: (_checkpointSuffix, messageSuffix) =>
    ["Message", messageSuffix, " is not available in the active conversation branch."].join(""),
  target_message_is_not_user_prompt: (_checkpointSuffix, messageSuffix) =>
    ["Message", messageSuffix, " is not a rewindable user prompt."].join(""),
  conversation_rewind_requires_session_store: () =>
    "Conversation rewind is unavailable because session storage is not configured.",
  artifact_store_not_configured: () =>
    "Workspace rewind is unavailable because artifact storage is not configured.",
  file_system_port_not_configured: () =>
    "Workspace rewind is unavailable because file-system access is not configured.",
  checkpoint_snapshot_unavailable: (checkpointSuffix) =>
    [
      "Checkpoint",
      checkpointSuffix,
      " cannot be restored because its snapshot artifact is unavailable.",
    ].join(""),
  target_covered_by_compact_requires_fork: (checkpointSuffix, messageSuffix) =>
    [
      "Message",
      messageSuffix || checkpointSuffix,
      " is covered by compact for conversation rewind; create a fork to rewind conversation history.",
    ].join(""),
};

// 不可用原因的兜底句式（未知原因带原因串）。
const unavailableFallback = (reason: string): string =>
  ["Workspace rewind is unavailable: ", reason, "."].join("");

// 把不可用原因渲染成固定英文提示。
export const formatUnavailableRewindResponse = (
  reason: string,
  checkpointId?: string,
  targetMessageId?: MessageId,
): string => {
  const checkpointSuffix = checkpointId ? ` ${checkpointId}` : "";
  const messageSuffix = targetMessageId ? ` ${targetMessageId}` : "";
  const builder = UNAVAILABLE_SENTENCE_BUILDERS[reason];
  return builder ? builder(checkpointSuffix, messageSuffix) : unavailableFallback(reason);
};
