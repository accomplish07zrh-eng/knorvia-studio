// SPDX-License-Identifier: Apache-2.0
// Agent 执行 telemetry 的冻结取值表：键名与线上取值都是兼容面，调用方与导出器按字符串对齐。
// 这里用"键值对列表 + 派生表"的形态承载，公开面（agent-execution.ts）只做再导出。

const AGENT_OPERATION_PAIRS = [
  ["AgentStep", "agent_step"],
  ["ContextCompaction", "context_compaction"],
  ["GoalCompletionVerification", "goal_completion_verification"],
  ["GoalTitleGeneration", "goal_title_generation"],
  ["ProjectMemoryExtract", "project_memory_extract"],
  ["ReadSessionContextExtract", "read_session_context_extract"],
  ["ReadSessionContextSynthesize", "read_session_context_synthesize"],
  ["SessionTitleGeneration", "session_title_generation"],
  ["ToolInternalModelCall", "tool_internal_model_call"],
  ["WebFetchProcessing", "web_fetch_processing"],
  ["WebSearch", "web_search"],
  ["WorkspaceGitCommitMessage", "workspace_git_commit_message"],
  ["WorkspaceGenerateText", "workspace_generate_text"],
] as const;

/** 把键值对列表折叠成"键 → 字面量取值"的只读表类型。 */
type FoldPairs<P extends readonly (readonly [string, string])[]> = {
  readonly [K in P[number][0]]: Extract<P[number], readonly [K, string]>[1];
};

export const AgentTelemetryOperation = Object.fromEntries(
  AGENT_OPERATION_PAIRS,
) as FoldPairs<typeof AGENT_OPERATION_PAIRS>;

/** telemetry schema 版本；导出器按它决定载荷兼容性。 */
export const TELEMETRY_SCHEMA_VERSION = 6 as const;
