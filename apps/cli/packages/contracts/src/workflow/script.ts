// SPDX-License-Identifier: Apache-2.0
// 脚本工作流的公开入口：只做再导出。
// 声明在 script-declarations.ts，唯一的实现逻辑在 script-validation.ts；
// 兼容面名字见 contracts-02 的 interface.md。
export {
  SCRIPT_WORKFLOW_ACTIVITY_STATUSES,
  SCRIPT_WORKFLOW_DEFINITION_SCOPES,
  SCRIPT_WORKFLOW_RUN_STATUSES,
  ScriptWorkflowRunStatsSchema,
  WorkflowAgentCallInputSchema,
  WorkflowAgentIsolationSchema,
  WorkflowAgentOptionsSchema,
  WorkflowScriptMetaSchema,
  WorkflowScriptPhaseMetaSchema,
} from "./script-declarations.js";

export type {
  CreateScriptWorkflowActivityInput,
  CreateScriptWorkflowRunInput,
  CreateSessionTaskLinkInput,
  ScriptWorkflowActivityRecord,
  ScriptWorkflowActivityStatus,
  ScriptWorkflowDefinitionRecord,
  ScriptWorkflowDefinitionScope,
  ScriptWorkflowEventRecord,
  ScriptWorkflowRunRecord,
  ScriptWorkflowRunStats,
  ScriptWorkflowRunStatus,
  ScriptWorkflowSource,
  ScriptWorkflowStorePort,
  SessionTaskLinkRecord,
  UpdateScriptWorkflowActivityInput,
  UpdateScriptWorkflowRunInput,
  UpsertScriptWorkflowDefinitionInput,
  WorkflowAgentCallInput,
  WorkflowAgentIsolation,
  WorkflowAgentOptions,
  WorkflowScriptMeta,
  WorkflowScriptPhaseMeta,
} from "./script-declarations.js";
