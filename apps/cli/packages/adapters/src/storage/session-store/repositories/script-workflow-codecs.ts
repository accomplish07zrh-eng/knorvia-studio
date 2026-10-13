// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Knorvia Studio contributors
//
// script workflow 的解码器：行 → 契约记录。行形状见 script-workflow-rows.ts，本文件原样再导出。
// 解码约定：可空列「有值才赋值」（产出对象不带 null）；JSON 列走 decodeJson 容错；
// 列名到字段名的映射是契约的一部分，签名与字段名不得随意调整。

// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Knorvia Studio contributors

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
  return {
    enabled: record.enabled === 1,
    id: record.id,
    meta: JSON.parse(record.meta_json) as ScriptWorkflowDefinitionRecord["meta"],
    name: record.name,
    scope: record.scope,
    scriptHash: record.script_hash,
    scriptPath: record.script_path ?? undefined,
    source: record.source,
    timeCreated: record.time_created,
    timeUpdated: record.time_updated,
    trusted: record.trusted === 1,
  };
}

export function decodeRun(record: WorkflowRunRow): ScriptWorkflowRunRecord {
  return {
    args: decodeJson(record.args_json),
    argsHash: record.args_hash ?? undefined,
    budgetSpent: record.budget_spent,
    budgetTotal: record.budget_total ?? undefined,
    completedAt: record.time_completed ?? undefined,
    createdAt: record.time_created,
    currentPhase: record.current_phase ?? undefined,
    cwd: record.cwd,
    definitionId: record.definition_id ?? undefined,
    failure: decodeJson(record.failure_json),
    id: record.id,
    kind: record.kind,
    name: record.name,
    parentSessionId: record.parent_session_id ?? undefined,
    scriptHash: record.script_hash,
    scriptPath: record.script_path ?? undefined,
    startedAt: record.time_started ?? undefined,
    stats: decodeJson<ScriptWorkflowRunRecord["stats"]>(record.stats_json),
    status: record.status,
    updatedAt: record.time_updated,
  };
}

export function decodeActivity(record: WorkflowActivityRow): ScriptWorkflowActivityRecord {
  return {
    attempt: record.attempt,
    callIndex: record.call_index,
    callPath: record.call_path,
    childSessionId: record.child_session_id ?? undefined,
    completedAt: record.time_completed ?? undefined,
    createdAt: record.time_created,
    error: decodeJson(record.error_json),
    id: record.id,
    inputHash: record.input_hash,
    label: record.label ?? undefined,
    opts: decodeJson<ScriptWorkflowActivityRecord["opts"]>(record.opts_json),
    parentActivityId: record.parent_activity_id ?? undefined,
    phase: record.phase ?? undefined,
    prompt: record.prompt ?? undefined,
    result: decodeJson(record.result_json),
    runId: record.run_id,
    startedAt: record.time_started ?? undefined,
    status: record.status,
    type: record.type,
    updatedAt: record.time_updated,
  };
}

export function decodeEvent(record: WorkflowEventRow): ScriptWorkflowEventRecord {
  return {
    activityId: record.activity_id ?? undefined,
    createdAt: record.time_created,
    id: record.id,
    payload: decodeJson(record.payload_json),
    phase: record.phase ?? undefined,
    runId: record.run_id,
    sequence: record.sequence,
    type: record.type,
  };
}

export function decodeTaskLink(record: SessionTaskLinkRow): SessionTaskLinkRecord {
  return {
    activityId: record.activity_id ?? undefined,
    agentType: record.agent_type ?? undefined,
    childSessionId: record.child_session_id,
    createdAt: record.time_created,
    depth: record.depth,
    id: record.id,
    label: record.label ?? undefined,
    model: record.model ?? undefined,
    parentLinkId: record.parent_link_id ?? undefined,
    parentSessionId: record.parent_session_id ?? undefined,
    path: record.path,
    phase: record.phase ?? undefined,
    role: record.role,
    rootWorkflowRunId: record.root_workflow_run_id ?? undefined,
    status: record.status,
    updatedAt: record.time_updated,
  };
}
