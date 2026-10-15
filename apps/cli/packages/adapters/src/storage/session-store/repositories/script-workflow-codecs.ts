// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Knorvia Studio contributors
//
// script workflow 的解码器：行 → 契约记录。行形状见 script-workflow-rows.ts，本文件原样再导出。
//
// 解码约定：
// 一、先落必填字段，再用 applyXxxOptionals 回填可空列——「有值才赋值」集中在两个位置。
// 二、JSON 列走 decodeJson 容错，只有明确需要抛出时才用 JSON.parse。
// 三、列名到字段名的映射是契约的一部分：签名与字段名不得随意调整。

import type {
  ScriptWorkflowActivityRecord,
  ScriptWorkflowActivityStatus,
  ScriptWorkflowDefinitionRecord,
  ScriptWorkflowEventRecord,
  ScriptWorkflowRunRecord,
  ScriptWorkflowRunStatus,
  SessionId,
  SessionTaskLinkRecord,
} from "@knorvia/contracts";
import { decodeJson } from "../json.js";

export type {
  WorkflowDefinitionRow,
  WorkflowRunRow,
  WorkflowActivityRow,
  WorkflowEventRow,
  SessionTaskLinkRow,
} from "./script-workflow-rows.js";

import type {
  WorkflowDefinitionRow,
  WorkflowRunRow,
  WorkflowActivityRow,
  WorkflowEventRow,
  SessionTaskLinkRow,
} from "./script-workflow-rows.js";

export function decodeDefinition(record: WorkflowDefinitionRow): ScriptWorkflowDefinitionRecord {
  const definition = {} as ScriptWorkflowDefinitionRecord;
  definition.enabled = record.enabled === 1;
  definition.id = record.id;
  definition.meta = JSON.parse(record.meta_json) as ScriptWorkflowDefinitionRecord["meta"];
  definition.name = record.name;
  definition.scope = record.scope;
  definition.scriptHash = record.script_hash;
  definition.scriptPath = record.script_path ?? undefined;
  definition.source = record.source;
  definition.timeCreated = record.time_created;
  definition.timeUpdated = record.time_updated;
  definition.trusted = record.trusted === 1;
  return definition;
}

export function decodeRun(record: WorkflowRunRow): ScriptWorkflowRunRecord {
  const run = {} as ScriptWorkflowRunRecord;
  run.args = decodeJson<ScriptWorkflowRunRecord["args"]>(record.args_json);
  run.argsHash = record.args_hash ?? undefined;
  run.budgetSpent = record.budget_spent;
  run.budgetTotal = record.budget_total ?? undefined;
  run.completedAt = record.time_completed ?? undefined;
  run.createdAt = record.time_created;
  run.currentPhase = record.current_phase ?? undefined;
  run.cwd = record.cwd;
  run.definitionId = record.definition_id ?? undefined;
  // JSON 列按 args → failure → stats 的顺序解码：多列同时损坏时报第一个。
  run.failure = decodeJson<ScriptWorkflowRunRecord["failure"]>(record.failure_json);
  run.id = record.id;
  run.kind = record.kind;
  run.name = record.name;
  run.parentSessionId = (record.parent_session_id ?? undefined) as SessionId | undefined;
  run.scriptHash = record.script_hash;
  run.scriptPath = record.script_path ?? undefined;
  run.startedAt = record.time_started ?? undefined;
  run.stats = decodeJson<ScriptWorkflowRunRecord["stats"]>(record.stats_json);
  run.status = record.status as ScriptWorkflowRunStatus;
  run.updatedAt = record.time_updated;
  return run;
}

export function decodeActivity(record: WorkflowActivityRow): ScriptWorkflowActivityRecord {
  const activity = {} as ScriptWorkflowActivityRecord;
  activity.attempt = record.attempt;
  activity.callIndex = record.call_index;
  activity.callPath = record.call_path;
  activity.childSessionId = (record.child_session_id ?? undefined) as SessionId | undefined;
  activity.completedAt = record.time_completed ?? undefined;
  activity.createdAt = record.time_created;
  // JSON 列按 error → opts → result 的顺序解码：多列同时损坏时报第一个。
  activity.error = decodeJson<ScriptWorkflowActivityRecord["error"]>(record.error_json);
  activity.id = record.id;
  activity.inputHash = record.input_hash;
  activity.label = record.label ?? undefined;
  activity.opts = decodeJson<ScriptWorkflowActivityRecord["opts"]>(record.opts_json);
  activity.parentActivityId = record.parent_activity_id ?? undefined;
  activity.phase = record.phase ?? undefined;
  activity.prompt = record.prompt ?? undefined;
  activity.result = decodeJson<ScriptWorkflowActivityRecord["result"]>(record.result_json);
  activity.runId = record.run_id;
  activity.startedAt = record.time_started ?? undefined;
  activity.status = record.status as ScriptWorkflowActivityStatus;
  activity.type = record.type;
  activity.updatedAt = record.time_updated;
  return activity;
}

/** 事件行的可空列：来源活动 id 与阶段（缺席时保留自有键，值为 undefined）。 */
export function decodeEvent(record: WorkflowEventRow): ScriptWorkflowEventRecord {
  const event = {} as ScriptWorkflowEventRecord;
  event.activityId = record.activity_id ?? undefined;
  event.createdAt = record.time_created;
  event.id = record.id;
  event.payload = decodeJson<ScriptWorkflowEventRecord["payload"]>(record.payload_json);
  event.phase = record.phase ?? undefined;
  event.runId = record.run_id;
  event.sequence = record.sequence;
  event.type = record.type;
  return event;
}

export function decodeTaskLink(record: SessionTaskLinkRow): SessionTaskLinkRecord {
  const link = {} as SessionTaskLinkRecord;
  link.activityId = record.activity_id ?? undefined;
  link.agentType = record.agent_type ?? undefined;
  link.childSessionId = record.child_session_id as SessionId;
  link.createdAt = record.time_created;
  link.depth = record.depth;
  link.id = record.id;
  link.label = record.label ?? undefined;
  link.model = record.model ?? undefined;
  link.parentLinkId = record.parent_link_id ?? undefined;
  link.parentSessionId = (record.parent_session_id ?? undefined) as SessionId | undefined;
  link.path = record.path;
  link.phase = record.phase ?? undefined;
  link.role = record.role;
  link.rootWorkflowRunId = record.root_workflow_run_id ?? undefined;
  link.status = record.status;
  link.updatedAt = record.time_updated;
  return link;
}
