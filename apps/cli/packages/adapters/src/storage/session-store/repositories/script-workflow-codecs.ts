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

/** 定义行的可空列：脚本路径与 meta 文档。 */
function applyDefinitionOptionals(
  target: ScriptWorkflowDefinitionRecord,
  record: WorkflowDefinitionRow,
): void {
  if (record.script_path !== null) target.scriptPath = record.script_path;
  target.meta = JSON.parse(record.meta_json) as ScriptWorkflowDefinitionRecord["meta"];
}

export function decodeDefinition(record: WorkflowDefinitionRow): ScriptWorkflowDefinitionRecord {
  const definition = {} as ScriptWorkflowDefinitionRecord;
  definition.id = record.id;
  definition.name = record.name;
  definition.source = record.source;
  definition.scope = record.scope;
  definition.enabled = record.enabled === 1;
  definition.trusted = record.trusted === 1;
  definition.scriptHash = record.script_hash;
  definition.timeCreated = record.time_created;
  definition.timeUpdated = record.time_updated;
  applyDefinitionOptionals(definition, record);
  return definition;
}

/** 运行行的可空列：父会话、预算、阶段、起止时间与两个 JSON 文档。 */
function applyRunOptionals(target: ScriptWorkflowRunRecord, record: WorkflowRunRow): void {
  if (record.args_hash !== null) target.argsHash = record.args_hash;
  if (record.budget_total !== null) target.budgetTotal = record.budget_total;
  if (record.current_phase !== null) target.currentPhase = record.current_phase;
  if (record.definition_id !== null) target.definitionId = record.definition_id;
  if (record.parent_session_id !== null) target.parentSessionId = record.parent_session_id;
  if (record.script_path !== null) target.scriptPath = record.script_path;
  if (record.time_completed !== null) target.completedAt = record.time_completed;
  if (record.time_started !== null) target.startedAt = record.time_started;
  target.args = decodeJson<ScriptWorkflowRunRecord["args"]>(record.args_json);
  target.stats = decodeJson<ScriptWorkflowRunRecord["stats"]>(record.stats_json);
  target.failure = decodeJson<ScriptWorkflowRunRecord["failure"]>(record.failure_json);
}

export function decodeRun(record: WorkflowRunRow): ScriptWorkflowRunRecord {
  const run = {} as ScriptWorkflowRunRecord;
  run.id = record.id;
  run.name = record.name;
  run.kind = record.kind;
  run.cwd = record.cwd;
  run.scriptHash = record.script_hash;
  run.budgetSpent = record.budget_spent;
  run.status = record.status as ScriptWorkflowRunStatus;
  run.createdAt = record.time_created;
  run.updatedAt = record.time_updated;
  applyRunOptionals(run, record);
  return run;
}

/** 活动行的可空列：父子 id、阶段/标签/提示词与三个 JSON 文档。 */
function applyActivityOptionals(
  target: ScriptWorkflowActivityRecord,
  record: WorkflowActivityRow,
): void {
  if (record.child_session_id !== null) target.childSessionId = record.child_session_id;
  if (record.label !== null) target.label = record.label;
  if (record.parent_activity_id !== null) target.parentActivityId = record.parent_activity_id;
  if (record.phase !== null) target.phase = record.phase;
  if (record.prompt !== null) target.prompt = record.prompt;
  if (record.time_completed !== null) target.completedAt = record.time_completed;
  if (record.time_started !== null) target.startedAt = record.time_started;
  target.opts = decodeJson<ScriptWorkflowActivityRecord["opts"]>(record.opts_json);
  target.error = decodeJson<ScriptWorkflowActivityRecord["error"]>(record.error_json);
  target.result = decodeJson<ScriptWorkflowActivityRecord["result"]>(record.result_json);
}

export function decodeActivity(record: WorkflowActivityRow): ScriptWorkflowActivityRecord {
  const activity = {} as ScriptWorkflowActivityRecord;
  activity.id = record.id;
  activity.runId = record.run_id;
  activity.callIndex = record.call_index;
  activity.callPath = record.call_path;
  activity.attempt = record.attempt;
  activity.type = record.type;
  activity.inputHash = record.input_hash;
  activity.status = record.status as ScriptWorkflowActivityStatus;
  activity.createdAt = record.time_created;
  activity.updatedAt = record.time_updated;
  applyActivityOptionals(activity, record);
  return activity;
}

/** 事件行的可空列：来源活动 id 与阶段。 */
function applyEventOptionals(target: ScriptWorkflowEventRecord, record: WorkflowEventRow): void {
  if (record.activity_id !== null) target.activityId = record.activity_id;
  if (record.phase !== null) target.phase = record.phase;
  target.payload = decodeJson<ScriptWorkflowEventRecord["payload"]>(record.payload_json);
}

export function decodeEvent(record: WorkflowEventRow): ScriptWorkflowEventRecord {
  const event = {} as ScriptWorkflowEventRecord;
  event.id = record.id;
  event.runId = record.run_id;
  event.sequence = record.sequence;
  event.type = record.type;
  event.createdAt = record.time_created;
  applyEventOptionals(event, record);
  return event;
}

/** 任务链接行的可空列：活动、模型、标签、父链接与阶段。 */
function applyTaskLinkOptionals(target: SessionTaskLinkRecord, record: SessionTaskLinkRow): void {
  if (record.activity_id !== null) target.activityId = record.activity_id;
  if (record.agent_type !== null) target.agentType = record.agent_type;
  if (record.label !== null) target.label = record.label;
  if (record.model !== null) target.model = record.model;
  if (record.parent_link_id !== null) target.parentLinkId = record.parent_link_id;
  if (record.parent_session_id !== null) target.parentSessionId = record.parent_session_id;
  if (record.phase !== null) target.phase = record.phase;
  if (record.root_workflow_run_id !== null) target.rootWorkflowRunId = record.root_workflow_run_id;
}

export function decodeTaskLink(record: SessionTaskLinkRow): SessionTaskLinkRecord {
  const link = {} as SessionTaskLinkRecord;
  link.id = record.id;
  link.childSessionId = record.child_session_id as SessionId;
  link.role = record.role;
  link.depth = record.depth;
  link.path = record.path;
  link.status = record.status;
  link.createdAt = record.time_created;
  link.updatedAt = record.time_updated;
  applyTaskLinkOptionals(link, record);
  return link;
}
