// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Knorvia Studio contributors

import type {
  ActorRecord,
  NodeKind,
  NodeRecord,
  NodeRecordStatus,
  RunRecord,
  StoredEvent,
} from "@knorvia/dynamic-workflow";
import { decodeJson } from "../json.js";
import { decodeRunState } from "./dwf-journal-run-state.js";

export { encodeRunSettlement, encodeRunStatusPredicate } from "./dwf-journal-run-state.js";

export type DwfRunPhysicalStatus = "pending" | "running" | "completed" | "failed" | "cancelled";
export interface DwfRunRow {
  args_json: string | null;
  caps_max_concurrency: number;
  cwd: string | null;
  failure_json: string | null;
  id: string;
  name: string | null;
  parent_session_id: string | null;
  result_json: string | null;
  resumed_from: string | null;
  script_hash: string | null;
  script_text: string | null;
  spent_tokens: number;
  status: DwfRunPhysicalStatus;
  time_created: number;
  time_updated: number;
  tool_call_id: string | null;
}
export type DwfRunMetadataRow = Omit<DwfRunRow, "result_json">;
export interface DwfRunTimestamps {
  timeCreated: number;
  timeUpdated: number;
}
export type DwfRunListItem = Omit<RunRecord, "failure" | "result"> & DwfRunTimestamps;
export type DwfRunDetailRow = RunRecord & DwfRunTimestamps;
export type DwfRunSessionRow = DwfRunMetadataRow;
export type DwfRunSessionListItem = DwfRunListItem & Pick<RunRecord, "failure">;

export interface DwfActorRow {
  id: number;
  name: string | null;
  ordinal: number;
  persona_json: string | null;
  resolved_model: string | null;
  run_id: string;
  session_id: string | null;
  site_id: string;
  time_created: number;
  time_updated: number;
}
export interface DwfNodeRow {
  actor_ordinal: number | null;
  actor_seq: number | null;
  actor_site_id: string | null;
  artifact_id: string | null;
  error_json: string | null;
  id: number;
  input_hash: string;
  input_json: string | null;
  kind: NodeKind;
  message_boundary: number | null;
  ordinal: number;
  result_json: string | null;
  run_id: string;
  site_id: string;
  stats_json: string | null;
  status: NodeRecordStatus;
  time_created: number;
  time_updated: number;
}
export interface DwfWorldNodeRow extends Omit<NodeRecord, "result">, DwfRunTimestamps {
  resultBytes?: number;
  resultCount?: number;
  exitCode?: number;
  stdoutBytes?: number;
  stderrBytes?: number;
}
export interface DwfEventRow {
  id: number;
  payload_json: string;
  run_id: string;
  sequence: number;
  time_created: number;
  type: string;
}

export function encodeResultJson(value: unknown): string | null {
  return value === undefined ? null : (JSON.stringify(value) ?? null);
}

function runMetadata(row: DwfRunMetadataRow): RunRecord {
  const state = decodeRunState(row);
  const run: RunRecord = {
    runId: row.id,
    caps: { maxConcurrency: row.caps_max_concurrency },
    spentTokens: row.spent_tokens,
    status: state.status,
  };
  if (state.stopReason !== undefined) run.stopReason = state.stopReason;
  if (state.supersededBy !== undefined) run.supersededBy = state.supersededBy;
  if (row.parent_session_id !== null) run.parentSessionId = row.parent_session_id;
  if (row.cwd !== null) run.cwd = row.cwd;
  if (row.name !== null) run.name = row.name;
  if (row.tool_call_id !== null) run.toolCallId = row.tool_call_id;
  if (row.script_text !== null) run.scriptText = row.script_text;
  if (row.script_hash !== null) run.scriptHash = row.script_hash;
  if (row.resumed_from !== null) run.resumedFrom = row.resumed_from;
  if (row.args_json !== null) run.args = JSON.parse(row.args_json) as RunRecord["args"];
  return run;
}

export function decodeRun(row: DwfRunRow): RunRecord {
  const run = runMetadata(row);
  const { failure } = decodeRunState(row);
  if (failure !== undefined) run.failure = failure;
  if (row.result_json !== null) run.result = JSON.parse(row.result_json);
  return run;
}

export function decodeRunListItem(row: DwfRunMetadataRow): DwfRunListItem {
  return { ...runMetadata(row), timeCreated: row.time_created, timeUpdated: row.time_updated };
}

export function decodeRunDetailRow(row: DwfRunRow): DwfRunDetailRow {
  return { ...decodeRun(row), timeCreated: row.time_created, timeUpdated: row.time_updated };
}

export function decodeRunSessionListItem(row: DwfRunSessionRow): DwfRunSessionListItem {
  const run: DwfRunSessionListItem = decodeRunListItem(row);
  const { failure } = decodeRunState(row);
  if (failure !== undefined) run.failure = failure;
  return run;
}

export function decodeActor(row: DwfActorRow): ActorRecord {
  const actor: ActorRecord = { runId: row.run_id, siteId: row.site_id, ordinal: row.ordinal };
  if (row.name !== null) actor.name = row.name;
  const persona = decodeJson<ActorRecord["persona"]>(row.persona_json);
  if (persona !== undefined) actor.persona = persona;
  if (row.session_id !== null) actor.sessionId = row.session_id;
  if (row.resolved_model !== null) actor.resolvedModel = row.resolved_model;
  return actor;
}

export function decodeNode(row: DwfNodeRow): NodeRecord {
  const node: NodeRecord = {
    runId: row.run_id,
    siteId: row.site_id,
    ordinal: row.ordinal,
    kind: row.kind,
    inputHash: row.input_hash,
    status: row.status,
  };
  if (row.actor_site_id !== null) node.actorSiteId = row.actor_site_id;
  if (row.actor_ordinal !== null) node.actorOrdinal = row.actor_ordinal;
  if (row.actor_seq !== null) node.actorSeq = row.actor_seq;
  if (row.result_json !== null) node.result = JSON.parse(row.result_json);
  const error = decodeJson<NodeRecord["error"]>(row.error_json);
  if (error !== undefined) node.error = error;
  const stats = decodeJson<NodeRecord["stats"]>(row.stats_json);
  if (stats !== undefined) node.stats = stats;
  if (row.message_boundary !== null) node.messageBoundary = row.message_boundary;
  if (row.artifact_id !== null) node.artifactId = row.artifact_id;
  const input = decodeJson<NodeRecord["input"]>(row.input_json);
  if (input !== undefined) node.input = input;
  return node;
}

export function decodeEvent(row: DwfEventRow): StoredEvent {
  return {
    sequence: row.sequence,
    event: JSON.parse(row.payload_json),
    timeCreated: row.time_created,
  };
}
