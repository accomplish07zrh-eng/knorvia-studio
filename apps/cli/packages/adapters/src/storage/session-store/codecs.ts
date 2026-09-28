// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Knorvia Studio contributors

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
  return typeof value === "string" && COLLABORATION_MODES.includes(value as CollaborationMode);
}

export function decodeSessionRow(row: SessionRow): SessionInfo {
  return {
    id: row.id as SessionInfo["id"],
    projectID: row.project_id as SessionInfo["projectID"],
    workspaceID: (row.workspace_id || undefined) as SessionInfo["workspaceID"],
    parentID: (row.parent_id || undefined) as SessionInfo["parentID"],
    traceID: (row.trace_id || undefined) as SessionInfo["traceID"],
    taskType: SESSION_TASK_TYPES.includes(row.task_type as SessionTaskType)
      ? (row.task_type as SessionTaskType)
      : DEFAULT_TASK_TYPE,
    slug: row.slug,
    directory: row.directory,
    path: row.path ?? undefined,
    title: row.title,
    titleSource: SESSION_TITLE_SOURCES.includes(row.title_source as SessionTitleSource)
      ? (row.title_source as SessionTitleSource)
      : DEFAULT_TITLE_SOURCE,
    titleMessageID: (row.title_message_id || undefined) as SessionInfo["titleMessageID"],
    version: row.version,
    shareURL: row.share_url ?? undefined,
    summaryAdditions: row.summary_additions ?? undefined,
    summaryDeletions: row.summary_deletions ?? undefined,
    summaryFiles: row.summary_files ?? undefined,
    summaryDiffs: decodeJson<SessionInfo["summaryDiffs"]>(row.summary_diffs),
    revert: decodeJson<SessionInfo["revert"]>(row.revert),
    permission: decodeJson<SessionInfo["permission"]>(row.permission),
    time: {
      created: row.time_created,
      updated: row.time_updated,
      titleUpdated: row.time_title_updated ?? undefined,
      compacting: row.time_compacting ?? undefined,
      archived: row.time_archived ?? undefined,
    },
  };
}

function messageDocument(document: Record<string, unknown>): Record<string, unknown> {
  if (document.role === "user") {
    const modelSelection = parseModelSelectionValue(document.modelSelection);
    return projectRecord(
      document,
      ["model", "modelSelection"],
      modelSelection ? { modelSelection } : {},
    );
  }
  if (document.role === "assistant") {
    return projectRecord(document, ["providerID", "modelID", "variant"]);
  }
  return document;
}

function timelineSelection(value: unknown): TimelineModelSelection | undefined {
  if (!isJsonRecord(value)) return undefined;
  const selection = parseModelSelectionValue(projectRecord(value, ["label"]));
  if (!selection) return undefined;
  return typeof value.label === "string" ? { ...selection, label: value.label } : selection;
}

function partDocument(document: Record<string, unknown>): Record<string, unknown> {
  if (document.type === "timeline" && document.timelineType === "model_change") {
    const fromModel = timelineSelection(document.fromModelSelection);
    const toModel = timelineSelection(document.toModelSelection);
    return projectRecord(
      document,
      ["fromModel", "toModel", "fromModelSelection", "toModelSelection"],
      { ...(fromModel ? { fromModel } : {}), ...(toModel ? { toModel } : {}) },
    );
  }
  if (document.type === "subtask") {
    const model = parseModelSelectionValue(document.modelSelection);
    return projectRecord(document, ["model", "modelSelection"], model ? { model } : {});
  }
  return document;
}

export function decodeMessageRow(row: MessageRow): MessageInfo {
  const decoded: unknown = JSON.parse(row.data);
  const document = messageDocument(isJsonRecord(decoded) ? decoded : {});
  return projectRecord(document, [], {
    id: row.id,
    sessionID: row.session_id,
  }) as unknown as MessageInfo;
}

export function decodePartRow(row: PartRow): MessagePart {
  const decoded: unknown = JSON.parse(row.data);
  const document = partDocument(isJsonRecord(decoded) ? decoded : {});
  return projectRecord(document, [], {
    id: row.id,
    sessionID: row.session_id,
    messageID: row.message_id,
  }) as unknown as MessagePart;
}

function modelSelectionEntry(document: unknown): unknown {
  const value = isJsonRecord(document) ? document.modelSelection : undefined;
  return parseModelSelectionValue(value) ?? value;
}

export function decodeSessionEntryRow(row: SessionEntryRow): SessionEntryInfo {
  const decoded: unknown = JSON.parse(row.data);
  return {
    id: row.id,
    sessionID: row.session_id as SessionEntryInfo["sessionID"],
    type: row.type,
    time: { created: row.time_created, updated: row.time_updated },
    data: row.type === SESSION_ENTRY_MODEL_SELECTION ? modelSelectionEntry(decoded) : decoded,
  };
}

export function decodeTodoRow(row: TodoRow): TodoItem {
  return {
    content: row.content,
    status: row.status as TodoItem["status"],
    priority: row.priority as TodoItem["priority"],
  };
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
