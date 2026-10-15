// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Knorvia Studio contributors
//
// dwf journal 的解码器：行 → 契约记录。行形状见 dwf-journal-rows.ts，本文件原样再导出。
//
// 解码约定：
// 一、可空列一律「有值才赋值」，产出的对象不带 null；调用方只需判 undefined。
// 二、JSON 列统一走 decodeJson（容错解析），只有明确需要抛出时才用 JSON.parse。
// 三、运行行的状态与失败信息必须由 decodeRunState 统一映射，不要在这里另写判断。
// 四、列名到字段名的映射是契约的一部分：签名与字段名不得随意调整。

import type { ActorRecord, NodeRecord, RunRecord, StoredEvent } from "@knorvia/dynamic-workflow";
import { decodeJson } from "../json.js";
import { decodeRunState } from "./dwf-journal-run-state.js";
import type {
  DwfActorRow,
  DwfEventRow,
  DwfNodeRow,
  DwfRunDetailRow,
  DwfRunListItem,
  DwfRunMetadataRow,
  DwfRunRow,
  DwfRunSessionListItem,
  DwfRunSessionRow,
} from "./dwf-journal-rows.js";

export { encodeRunSettlement, encodeRunStatusPredicate } from "./dwf-journal-run-state.js";
export type {
  DwfActorRow,
  DwfEventRow,
  DwfNodeRow,
  DwfRunDetailRow,
  DwfRunListItem,
  DwfRunMetadataRow,
  DwfRunPhysicalStatus,
  DwfRunRow,
  DwfRunSessionListItem,
  DwfRunSessionRow,
  DwfRunTimestamps,
  DwfWorldNodeRow,
} from "./dwf-journal-rows.js";

export function encodeResultJson(value: unknown): string | null {
  if (value === undefined) return null;
  return JSON.stringify(value) ?? null;
}

/** 运行元数据：只填必需字段与有值字段，活动字段缺失即不出现。 */
function runMetadata(row: DwfRunMetadataRow): RunRecord {
  const state = decodeRunState(row);
  const run = {} as RunRecord;
  run.runId = row.id;
  run.caps = { maxConcurrency: row.caps_max_concurrency };
  run.spentTokens = row.spent_tokens;
  run.status = state.status;
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
  const item = {} as DwfRunListItem;
  Object.assign(item, runMetadata(row));
  item.timeCreated = row.time_created;
  item.timeUpdated = row.time_updated;
  return item;
}

export function decodeRunDetailRow(row: DwfRunRow): DwfRunDetailRow {
  const detail = {} as DwfRunDetailRow;
  Object.assign(detail, decodeRun(row));
  detail.timeCreated = row.time_created;
  detail.timeUpdated = row.time_updated;
  return detail;
}

export function decodeRunSessionListItem(row: DwfRunSessionRow): DwfRunSessionListItem {
  const item: DwfRunSessionListItem = decodeRunListItem(row);
  const { failure } = decodeRunState(row);
  if (failure !== undefined) item.failure = failure;
  return item;
}

export function decodeActor(row: DwfActorRow): ActorRecord {
  const actor = {} as ActorRecord;
  actor.runId = row.run_id;
  actor.siteId = row.site_id;
  actor.ordinal = row.ordinal;
  if (row.name !== null) actor.name = row.name;
  const persona = decodeJson<ActorRecord["persona"]>(row.persona_json);
  if (persona !== undefined) actor.persona = persona;
  if (row.session_id !== null) actor.sessionId = row.session_id;
  if (row.resolved_model !== null) actor.resolvedModel = row.resolved_model;
  return actor;
}

export function decodeNode(row: DwfNodeRow): NodeRecord {
  const node = {} as NodeRecord;
  node.runId = row.run_id;
  node.siteId = row.site_id;
  node.ordinal = row.ordinal;
  node.kind = row.kind;
  node.inputHash = row.input_hash;
  node.status = row.status;
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
  const event = {} as StoredEvent;
  event.sequence = row.sequence;
  event.event = JSON.parse(row.payload_json);
  event.timeCreated = row.time_created;
  return event;
}
