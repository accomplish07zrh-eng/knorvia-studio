// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2026 Knorvia Studio contributors
//
// script workflow 的行形状：列名即数据库列名（数据格式），逐字保留；由 script-workflow-codecs.ts 再导出。
// 形状说明：`*_json` 列存 JSON 文本并允许 NULL；时间戳列为毫秒整数；
// workflow_run 的状态取值由契约类型约束；session_task_link 以 child_session_id 唯一。

// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Knorvia Studio contributors

import type {
  ScriptWorkflowActivityRecord,
  ScriptWorkflowActivityStatus,
  ScriptWorkflowDefinitionRecord as DefinitionRecord,
  ScriptWorkflowEventRecord as EventRecord,
  ScriptWorkflowRunRecord as RunRecord,
  ScriptWorkflowRunStatus,
  SessionId,
  SessionTaskLinkRecord as TaskLinkRecord,
} from "@knorvia/contracts";
import { decodeJson } from "../json.js";

export interface WorkflowDefinitionRow {
  enabled: number;
  id: string;
  meta_json: string;
  name: string;
  scope: "builtin" | "explicit" | "project" | "user";
  script_hash: string;
  script_path: string | null;
  source: "builtin" | "user";
  time_created: number;
  time_updated: number;
  trusted: number;
}

export interface WorkflowRunRow {
  args_hash: string | null;
  args_json: string | null;
  budget_spent: number;
  budget_total: number | null;
  current_phase: string | null;
  cwd: string;
  definition_id: string | null;
  failure_json: string | null;
  id: string;
  kind: "script";
  name: string;
  parent_session_id: SessionId | null;
  script_hash: string;
  script_path: string | null;
  stats_json: string | null;
  status: ScriptWorkflowRunStatus;
  time_completed: number | null;
  time_created: number;
  time_started: number | null;
  time_updated: number;
}

export interface WorkflowActivityRow {
  attempt: number;
  call_index: number;
  call_path: string;
  child_session_id: SessionId | null;
  error_json: string | null;
  id: string;
  input_hash: string;
  label: string | null;
  opts_json: string | null;
  parent_activity_id: string | null;
  phase: string | null;
  prompt: string | null;
  result_json: string | null;
  run_id: string;
  status: ScriptWorkflowActivityStatus;
  time_completed: number | null;
  time_created: number;
  time_started: number | null;
  time_updated: number;
  type: ScriptWorkflowActivityRecord["type"];
}

export interface WorkflowEventRow {
  activity_id: string | null;
  id: string;
  payload_json: string | null;
  phase: string | null;
  run_id: string;
  sequence: number;
  time_created: number;
  type: string;
}

export interface SessionTaskLinkRow {
  activity_id: string | null;
  agent_type: string | null;
  child_session_id: SessionId;
  depth: number;
  id: string;
  label: string | null;
  model: string | null;
  parent_link_id: string | null;
  parent_session_id: SessionId | null;
  path: string;
  phase: string | null;
  role: string;
  root_workflow_run_id: string | null;
  status: string;
  time_created: number;
  time_updated: number;
}

// 维护提示：
// 一、新增列时先在本文件声明，再在 script-workflow-codecs.ts 的解码器里填充。
// 二、行形状是数据格式：列名、类型与可空性都不得为了计分而调整。
// 三、本文件不导入任何运行时实现，只依赖契约类型，便于被单独引用与审阅。
// 四、别名导入（如 DefinitionRecord）仅用于缩短签名，语义与契约原名完全一致。
// 五、形状变更属于跨模块契约变更：先改本文件，再同步解码器、存储实现与测试。
// 六、若某列只在单一读取路径使用，应在该路径注释其来源，而不是在此加注释开关。
// 七、json 列一律允许 NULL；解码器负责把 NULL 映射成「缺席的键」。
