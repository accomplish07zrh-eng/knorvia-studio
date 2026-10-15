// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Knorvia Studio contributors
//
// 行 → 契约对象的解码：DB 列名、投影字段表与空串抹平规则都是对外可观察契约，逐字保留。

import {
  parseModelSelectionValue,
  SESSION_ENTRY_MODEL_SELECTION,
  SESSION_TASK_TYPES,
  SESSION_TITLE_SOURCES,
  type CollaborationMode,
  type MessageInfo,
  type MessagePart,
  type SessionEntryInfo,
  type SessionInfo,
  type SessionTaskType,
  type SessionTitleSource,
  type TimelineModelSelection,
  type TodoItem,
} from "@knorvia/contracts";
import { decodeJson } from "./json.js";
import { isJsonRecord, projectRecord } from "./record-projection.js";
import type { MessageRow, PartRow, SessionEntryRow, SessionRow, TodoRow } from "./rows.js";

const COLLABORATION_MODES: readonly CollaborationMode[] = ["plan", "build", "edit", "yolo", "auto"];
const DEFAULT_TASK_TYPE: SessionTaskType = "interactive";
const DEFAULT_TITLE_SOURCE: SessionTitleSource = "first_input";

export function isCollaborationMode(value: unknown): value is CollaborationMode {
  if (typeof value !== "string") return false;
  return COLLABORATION_MODES.includes(value as CollaborationMode);
}

/** 枚举列回落：不在允许集合内的值一律用默认值，避免脏数据穿透到契约层。 */
function taskTypeOf(raw: unknown): SessionTaskType {
  const taskType = raw as SessionTaskType;
  return SESSION_TASK_TYPES.includes(taskType) ? taskType : DEFAULT_TASK_TYPE;
}

function titleSourceOf(raw: unknown): SessionTitleSource {
  const titleSource = raw as SessionTitleSource;
  return SESSION_TITLE_SOURCES.includes(titleSource) ? titleSource : DEFAULT_TITLE_SOURCE;
}

export function decodeSessionRow(row: SessionRow): SessionInfo {
  const info = {} as SessionInfo;
  info.id = row.id as SessionInfo["id"];
  info.projectID = row.project_id as SessionInfo["projectID"];
  info.workspaceID = (row.workspace_id || undefined) as SessionInfo["workspaceID"];
  info.parentID = (row.parent_id || undefined) as SessionInfo["parentID"];
  info.traceID = (row.trace_id || undefined) as SessionInfo["traceID"];
  info.taskType = taskTypeOf(row.task_type);
  info.slug = row.slug;
  info.directory = row.directory;
  info.path = row.path ?? undefined;
  info.title = row.title;
  info.titleSource = titleSourceOf(row.title_source);
  info.titleMessageID = (row.title_message_id || undefined) as SessionInfo["titleMessageID"];
  info.version = row.version;
  info.shareURL = row.share_url ?? undefined;
  info.summaryAdditions = row.summary_additions ?? undefined;
  info.summaryDeletions = row.summary_deletions ?? undefined;
  info.summaryFiles = row.summary_files ?? undefined;
  info.summaryDiffs = decodeJson<SessionInfo["summaryDiffs"]>(row.summary_diffs);
  info.revert = decodeJson<SessionInfo["revert"]>(row.revert);
  info.permission = decodeJson<SessionInfo["permission"]>(row.permission);
  info.time = {
    created: row.time_created,
    updated: row.time_updated,
    titleUpdated: row.time_title_updated ?? undefined,
    compacting: row.time_compacting ?? undefined,
    archived: row.time_archived ?? undefined,
  };
  return info;
}

/** 消息体投影：user 行把模型选择收敛成一份文档，assistant 行只留三个身份字段。 */
function messageDocument(document: Record<string, unknown>): Record<string, unknown> {
  if (document.role === "user") {
    const modelSelection = parseModelSelectionValue(document.modelSelection);
    const extra = modelSelection ? { modelSelection } : {};
    return projectRecord(document, ["model", "modelSelection"], extra);
  }
  if (document.role === "assistant") {
    return projectRecord(document, ["providerID", "modelID", "variant"]);
  }
  return document;
}

/** 时间线里的模型切换：只保留 label，其余沿用解析结果。 */
function timelineSelection(value: unknown): TimelineModelSelection | undefined {
  if (!isJsonRecord(value)) return undefined;
  const selection = parseModelSelectionValue(projectRecord(value, ["label"]));
  if (!selection) return undefined;
  if (typeof value.label !== "string") return selection;
  return { ...selection, label: value.label };
}

/** 分片体投影：时间线切换与子任务各自把模型字段提升为顶层。 */
function partDocument(document: Record<string, unknown>): Record<string, unknown> {
  if (document.type === "timeline" && document.timelineType === "model_change") {
    const fromModel = timelineSelection(document.fromModelSelection);
    const toModel = timelineSelection(document.toModelSelection);
    const extra = { ...(fromModel ? { fromModel } : {}), ...(toModel ? { toModel } : {}) };
    return projectRecord(
      document,
      ["fromModel", "toModel", "fromModelSelection", "toModelSelection"],
      extra,
    );
  }
  if (document.type === "subtask") {
    const model = parseModelSelectionValue(document.modelSelection);
    return projectRecord(document, ["model", "modelSelection"], model ? { model } : {});
  }
  return document;
}

/** 行内联身份：message/part 的 id 与 sessionID 由调用方提供，不取自 JSON 文档。 */
function identityOf(row: MessageRow | PartRow): { id: string; sessionID: string } {
  const identity = {} as { id: string; sessionID: string };
  identity.id = row.id;
  identity.sessionID = row.session_id;
  return identity;
}

export function decodeMessageRow(row: MessageRow): MessageInfo {
  const parsed: unknown = JSON.parse(row.data);
  const document = messageDocument(isJsonRecord(parsed) ? parsed : {});
  return projectRecord(document, [], identityOf(row)) as unknown as MessageInfo;
}

export function decodePartRow(row: PartRow): MessagePart {
  const parsed: unknown = JSON.parse(row.data);
  const document = partDocument(isJsonRecord(parsed) ? parsed : {});
  const identity = identityOf(row);
  const inline = { id: identity.id, sessionID: identity.sessionID, messageID: row.message_id };
  return projectRecord(document, [], inline) as unknown as MessagePart;
}

function modelSelectionEntry(parsed: unknown): unknown {
  const value = isJsonRecord(parsed) ? parsed.modelSelection : undefined;
  return parseModelSelectionValue(value) ?? value;
}

export function decodeSessionEntryRow(row: SessionEntryRow): SessionEntryInfo {
  const parsed: unknown = JSON.parse(row.data);
  const entry = {} as SessionEntryInfo;
  entry.id = row.id;
  entry.sessionID = row.session_id as SessionEntryInfo["sessionID"];
  entry.type = row.type;
  entry.time = { created: row.time_created, updated: row.time_updated };
  entry.data = row.type === SESSION_ENTRY_MODEL_SELECTION ? modelSelectionEntry(parsed) : parsed;
  return entry;
}

export function decodeTodoRow(row: TodoRow): TodoItem {
  const todo = {} as TodoItem;
  todo.content = row.content;
  todo.status = row.status as TodoItem["status"];
  todo.priority = row.priority as TodoItem["priority"];
  return todo;
}

export function partCreatedAt(part: MessagePart, fallback: number): number {
  switch (part.type) {
    case "text":
    case "reasoning":
    case "compaction":
    case "timeline":
      return part.time?.start ?? fallback;
    case "tool":
      switch (part.state.status) {
        case "running":
        case "completed":
        case "error":
          return part.state.time.start;
        default:
          return fallback;
      }
    case "retry":
      return part.time.created;
    default:
      return fallback;
  }
}
