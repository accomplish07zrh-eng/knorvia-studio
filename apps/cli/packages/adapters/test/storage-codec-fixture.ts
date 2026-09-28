// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Knorvia Studio contributors
import type {
  MessageRow,
  PartRow,
  SessionEntryRow,
  SessionRow,
} from "../src/storage/session-store/rows.js";

export function sessionRow(patch: Partial<SessionRow> = {}): SessionRow {
  return {
    id: "session-codec",
    project_id: "project-codec",
    workspace_id: null,
    parent_id: null,
    trace_id: null,
    task_type: "interactive",
    slug: "fixture",
    directory: ".",
    path: null,
    title: "Fixture",
    title_source: "first_input",
    title_message_id: null,
    version: "1",
    share_url: null,
    summary_additions: null,
    summary_deletions: null,
    summary_files: null,
    summary_diffs: null,
    revert: null,
    permission: null,
    time_created: 0,
    time_updated: 12,
    time_title_updated: null,
    time_compacting: null,
    time_archived: null,
    ...patch,
  };
}

export function messageRow(data: unknown): MessageRow {
  return {
    id: "message-codec",
    session_id: "session-codec",
    sequence: 0,
    time_created: 0,
    time_updated: 1,
    data: JSON.stringify(data),
  };
}

export function partRow(data: unknown): PartRow {
  return {
    id: "part-codec",
    message_id: "message-codec",
    session_id: "session-codec",
    sequence: 0,
    time_created: 0,
    time_updated: 1,
    data: JSON.stringify(data),
  };
}

export function entryRow(data: unknown, type = "fixture/opaque"): SessionEntryRow {
  return {
    id: "entry-codec",
    session_id: "session-codec",
    type,
    time_created: 0,
    time_updated: 1,
    data: JSON.stringify(data),
  };
}

export const rawSelection = {
  providerId: " fixture-provider ",
  modelId: " fixture-model ",
  options: { reasoningLevel: " medium " },
};
export const selectedModel = {
  providerId: "fixture-provider",
  modelId: "fixture-model",
  options: { reasoningLevel: "medium" },
};
