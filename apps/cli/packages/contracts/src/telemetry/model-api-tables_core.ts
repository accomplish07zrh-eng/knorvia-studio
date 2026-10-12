// SPDX-License-Identifier: Apache-2.0
// 模型 API 侧的冻结取值表与恒等映射。公开面（telemetry/index.ts）只做再导出，
// 键名与线上取值是兼容面：调用方、导出器与 ARMS 属性都按字符串对齐。

const MODEL_API_OPERATION_PAIRS = [
  ["AgentStep", "agent_step"],
  ["ContextCompaction", "context_compaction"],
  ["GoalTitle", "goal_title_generation"],
  ["GoalVerification", "goal_completion_verification"],
  ["GitCommitMessage", "workspace_git_commit_message"],
  ["ProjectMemoryExtract", "project_memory_extract"],
  ["ReadSessionContextExtract", "read_session_context_extract"],
  ["ReadSessionContextSynthesize", "read_session_context_synthesize"],
  ["SessionTitle", "session_title_generation"],
  ["ToolInternalModelCall", "tool_internal_model_call"],
  ["WebFetch", "web_fetch_processing"],
  ["WebSearch", "web_search"],
  ["WorkspaceGenerateText", "workspace_generate_text"],
] as const;

const MODEL_API_ACTOR_PAIRS = [
  ["MainAgent", "main"],
  ["Subagent", "subagent"],
  ["WorkflowChild", "workflow_child"],
  ["System", "system"],
  ["Tool", "tool"],
] as const;

const MODEL_FAILURE_EXCEPTION_PAIRS = [
  ["ApiCall", "api_call"],
  ["Generic", "generic"],
  ["Protocol", "protocol"],
  ["ProviderBusiness", "provider_business"],
  ["Transport", "transport"],
  ["TypeError", "type_error"],
  ["Validation", "validation"],
] as const;

/** 把键值对列表折叠成"键 → 字面量取值"的只读表类型。 */
type FoldPairs<P extends readonly (readonly [string, string])[]> = {
  readonly [K in P[number][0]]: Extract<P[number], readonly [K, string]>[1];
};

export const ModelApiOperation = Object.fromEntries(MODEL_API_OPERATION_PAIRS) as FoldPairs<
  typeof MODEL_API_OPERATION_PAIRS
>;

export type ModelApiOperation = (typeof ModelApiOperation)[keyof typeof ModelApiOperation];

export const ModelApiActorKind = Object.fromEntries(MODEL_API_ACTOR_PAIRS) as FoldPairs<
  typeof MODEL_API_ACTOR_PAIRS
>;

export type ModelApiActorKind = (typeof ModelApiActorKind)[keyof typeof ModelApiActorKind];

export const ModelFailureExceptionKind = Object.fromEntries(
  MODEL_FAILURE_EXCEPTION_PAIRS,
) as FoldPairs<typeof MODEL_FAILURE_EXCEPTION_PAIRS>;

export type ModelFailureExceptionKind =
  (typeof ModelFailureExceptionKind)[keyof typeof ModelFailureExceptionKind];

/** 恒等映射：两张表的语义一一对应、取值相同，因此直接返回入参。 */
export const mapModelApiOperationToAgentOperation = (
  operation: ModelApiOperation,
): import("./agent-execution.js").AgentTelemetryOperation => operation;
