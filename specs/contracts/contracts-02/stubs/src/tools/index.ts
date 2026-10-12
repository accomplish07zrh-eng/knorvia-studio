// SPDX-License-Identifier: MIT
/* eslint-disable max-lines -- 桩文件按 interface.md 的导出清单生成，行数由导出数量决定。 */
// contracts-02 桩：保留 interface.md 列出的导出名与种类；函数体抛 Error，运行时值在首次使用时抛错。
// 精确签名见 interface.md（替换 PR 会用按签名生成的实现替换这些文件并删除旧实现）。

const notImplemented = (): never => {
  throw new Error("not implemented: contracts-02");
};

const _unimplementedValue = (): never => notImplemented();

export type AgentBackgroundedOutput = never;
export const AgentBackgroundedOutputSchema = new Proxy({} as never, { get: _unimplementedValue });
export type AgentCompletedOutput = never;
export const AgentCompletedOutputSchema = new Proxy({} as never, { get: _unimplementedValue });
export type AgentErrorCode = never;
export type AgentInput = never;
export const AgentInputJsonSchema = new Proxy({} as never, { get: _unimplementedValue });
export const AgentInputSchema = new Proxy({} as never, { get: _unimplementedValue });
export type AgentOutput = never;
export const AgentOutputJsonSchema = new Proxy({} as never, { get: _unimplementedValue });
export const AgentOutputSchema = new Proxy({} as never, { get: _unimplementedValue });
export type AgentTextContentBlock = never;
export const AgentTextContentBlockSchema = new Proxy({} as never, { get: _unimplementedValue });
export type AgentToolCall = never;
export type AgentToolResult = never;
export type AgentType = never;
export const AMEND_WORKFLOW_SOURCE_ERROR = new Proxy({} as never, { get: _unimplementedValue });
export const AMEND_WORKFLOW_TOOL_NAME = new Proxy({} as never, { get: _unimplementedValue });
export type AmendWorkflowInput = never;
export const AmendWorkflowInputJsonSchema = new Proxy({} as never, { get: _unimplementedValue });
export const AmendWorkflowInputSchema = new Proxy({} as never, { get: _unimplementedValue });
export type AmendWorkflowPredecessor = never;
export const AmendWorkflowPredecessorSchema = new Proxy({} as never, { get: _unimplementedValue });
export type ApplicationIconLocator = never;
export const applicationIconLocatorSchema = new Proxy({} as never, { get: _unimplementedValue });
export type ApplyPatchErrorCode = never;
export type ApplyPatchFileChange = never;
export const ApplyPatchFileChangeSchema = new Proxy({} as never, { get: _unimplementedValue });
export type ApplyPatchInput = never;
export const ApplyPatchInputJsonSchema = new Proxy({} as never, { get: _unimplementedValue });
export const ApplyPatchInputSchema = new Proxy({} as never, { get: _unimplementedValue });
export type ApplyPatchOutput = never;
export const ApplyPatchOutputJsonSchema = new Proxy({} as never, { get: _unimplementedValue });
export const ApplyPatchOutputSchema = new Proxy({} as never, { get: _unimplementedValue });
export type ApplyPatchToolCall = never;
export type ApplyPatchToolResult = never;
export const ASK_USER_QUESTION_TOOL_CHIP_WIDTH = new Proxy({} as never, {
  get: _unimplementedValue,
});
export const ASK_USER_QUESTION_TOOL_NAME = new Proxy({} as never, { get: _unimplementedValue });
export type AskUserQuestion = never;
export type AskUserQuestionAnnotation = never;
export const AskUserQuestionAnnotationSchema = new Proxy({} as never, { get: _unimplementedValue });
export const AskUserQuestionAnsweredInputSchema = new Proxy({} as never, {
  get: _unimplementedValue,
});
export type AskUserQuestionInput = never;
export const AskUserQuestionInputJsonSchema = new Proxy({} as never, { get: _unimplementedValue });
export const AskUserQuestionInputSchema = new Proxy({} as never, { get: _unimplementedValue });
export type AskUserQuestionOption = never;
export const AskUserQuestionOptionSchema = new Proxy({} as never, { get: _unimplementedValue });
export type AskUserQuestionOutput = never;
export const AskUserQuestionOutputJsonSchema = new Proxy({} as never, { get: _unimplementedValue });
export const AskUserQuestionOutputSchema = new Proxy({} as never, { get: _unimplementedValue });
export const AskUserQuestionSchema = new Proxy({} as never, { get: _unimplementedValue });
export type BackgroundTask = never;
export type BashErrorCode = never;
export type BashInput = never;
export const BashInputJsonSchema = new Proxy({} as never, { get: _unimplementedValue });
export const BashInputSchema = new Proxy({} as never, { get: _unimplementedValue });
export type BashOutput = never;
export const BashOutputJsonSchema = new Proxy({} as never, { get: _unimplementedValue });
export const BashOutputSchema = new Proxy({} as never, { get: _unimplementedValue });
export type BashToolCall = never;
export type BashToolResult = never;
export type CellOutput = never;
export type CommandExecutionTelemetry = never;
export const CommandExecutionTelemetrySchema = new Proxy({} as never, { get: _unimplementedValue });
export const COMPLETED_TOOL_PART_METADATA_SCHEMA_VERSION = new Proxy({} as never, {
  get: _unimplementedValue,
});
export type CompletedToolPartMetadata = never;
export const completedToolPartMetadataSchema = new Proxy({} as never, { get: _unimplementedValue });
export const CREATE_WORKFLOW_ARGS_WITHOUT_PATH_ERROR = new Proxy({} as never, {
  get: _unimplementedValue,
});
export const CREATE_WORKFLOW_DISPLAY_MAX_DIAGNOSTICS = new Proxy({} as never, {
  get: _unimplementedValue,
});
export const CREATE_WORKFLOW_DISPLAY_MAX_MESSAGE_CHARS = new Proxy({} as never, {
  get: _unimplementedValue,
});
export const CREATE_WORKFLOW_GRAPH_MAX_HANDOFF_TYPES = new Proxy({} as never, {
  get: _unimplementedValue,
});
export const CREATE_WORKFLOW_GRAPH_MAX_HANDOFFS = new Proxy({} as never, {
  get: _unimplementedValue,
});
export const CREATE_WORKFLOW_GRAPH_MAX_ID_CHARS = new Proxy({} as never, {
  get: _unimplementedValue,
});
export const CREATE_WORKFLOW_GRAPH_MAX_LANES = new Proxy({} as never, { get: _unimplementedValue });
export const CREATE_WORKFLOW_GRAPH_MAX_NAME_CHARS = new Proxy({} as never, {
  get: _unimplementedValue,
});
export const CREATE_WORKFLOW_GRAPH_MAX_PARTICIPANTS = new Proxy({} as never, {
  get: _unimplementedValue,
});
export const CREATE_WORKFLOW_GRAPH_MAX_PHASE_EDGES = new Proxy({} as never, {
  get: _unimplementedValue,
});
export const CREATE_WORKFLOW_GRAPH_MAX_PHASES = new Proxy({} as never, {
  get: _unimplementedValue,
});
export const CREATE_WORKFLOW_GRAPH_MAX_STEPS = new Proxy({} as never, { get: _unimplementedValue });
export const CREATE_WORKFLOW_SOURCE_ERROR = new Proxy({} as never, { get: _unimplementedValue });
export const CREATE_WORKFLOW_STEP_KINDS = new Proxy({} as never, { get: _unimplementedValue });
export const CREATE_WORKFLOW_TOOL_NAME = new Proxy({} as never, { get: _unimplementedValue });
export type CreateWorkflowCausalityGraph = never;
export const CreateWorkflowCausalityGraphSchema = new Proxy({} as never, {
  get: _unimplementedValue,
});
export type CreateWorkflowDiagnostic = never;
export const CreateWorkflowDiagnosticSchema = new Proxy({} as never, { get: _unimplementedValue });
export type CreateWorkflowEdge = never;
export const CreateWorkflowEdgeSchema = new Proxy({} as never, { get: _unimplementedValue });
export type CreateWorkflowHandoff = never;
export const CreateWorkflowHandoffSchema = new Proxy({} as never, { get: _unimplementedValue });
export type CreateWorkflowInput = never;
export const CreateWorkflowInputJsonSchema = new Proxy({} as never, { get: _unimplementedValue });
export const CreateWorkflowInputSchema = new Proxy({} as never, { get: _unimplementedValue });
export type CreateWorkflowLane = never;
export const CreateWorkflowLaneSchema = new Proxy({} as never, { get: _unimplementedValue });
export type CreateWorkflowNamePattern = never;
export const CreateWorkflowNamePatternSchema = new Proxy({} as never, { get: _unimplementedValue });
export type CreateWorkflowOutput = never;
export const CreateWorkflowOutputJsonSchema = new Proxy({} as never, { get: _unimplementedValue });
export const CreateWorkflowOutputSchema = new Proxy({} as never, { get: _unimplementedValue });
export type CreateWorkflowParticipant = never;
export const CreateWorkflowParticipantSchema = new Proxy({} as never, { get: _unimplementedValue });
export type CreateWorkflowPhase = never;
export function createWorkflowPhaseAlongside(..._args: unknown[]): never {
  return notImplemented();
}
export function createWorkflowPhaseNames(..._args: unknown[]): never {
  return notImplemented();
}
export const CreateWorkflowPhaseSchema = new Proxy({} as never, { get: _unimplementedValue });
export type CreateWorkflowResolvedSavedSource = never;
export const CreateWorkflowResolvedSavedSourceSchema = new Proxy({} as never, {
  get: _unimplementedValue,
});
export type CreateWorkflowSavedSource = never;
export const CreateWorkflowSavedSourceSchema = new Proxy({} as never, { get: _unimplementedValue });
export type CreateWorkflowStep = never;
export const CreateWorkflowStepSchema = new Proxy({} as never, { get: _unimplementedValue });
export const createWorkflowToolResultDisplayDiagnosticSchema = new Proxy({} as never, {
  get: _unimplementedValue,
});
export type CreateWorkflowToolResultDisplayPayload = never;
export const createWorkflowToolResultDisplayPayloadSchema = new Proxy({} as never, {
  get: _unimplementedValue,
});
export type CronAutomation = never;
export type CronAutomationScheduleRule = never;
export const CronAutomationScheduleRuleSchema = new Proxy({} as never, {
  get: _unimplementedValue,
});
export const CronAutomationSchema = new Proxy({} as never, { get: _unimplementedValue });
export type CronCreateInput = never;
export const CronCreateInputJsonSchema = new Proxy({} as never, { get: _unimplementedValue });
export const CronCreateInputSchema = new Proxy({} as never, { get: _unimplementedValue });
export type CronCreateOutput = never;
export const CronCreateOutputJsonSchema = new Proxy({} as never, { get: _unimplementedValue });
export const CronCreateOutputSchema = new Proxy({} as never, { get: _unimplementedValue });
export type CronDeleteInput = never;
export const CronDeleteInputJsonSchema = new Proxy({} as never, { get: _unimplementedValue });
export const CronDeleteInputSchema = new Proxy({} as never, { get: _unimplementedValue });
export type CronDeleteOutput = never;
export const CronDeleteOutputJsonSchema = new Proxy({} as never, { get: _unimplementedValue });
export const CronDeleteOutputSchema = new Proxy({} as never, { get: _unimplementedValue });
export type CronListInput = never;
export const CronListInputJsonSchema = new Proxy({} as never, { get: _unimplementedValue });
export const CronListInputSchema = new Proxy({} as never, { get: _unimplementedValue });
export type CronListOutput = never;
export const CronListOutputJsonSchema = new Proxy({} as never, { get: _unimplementedValue });
export const CronListOutputSchema = new Proxy({} as never, { get: _unimplementedValue });
export type CronUpdateInput = never;
export const CronUpdateInputJsonSchema = new Proxy({} as never, { get: _unimplementedValue });
export const CronUpdateInputSchema = new Proxy({} as never, { get: _unimplementedValue });
export type CronUpdateOutput = never;
export const CronUpdateOutputJsonSchema = new Proxy({} as never, { get: _unimplementedValue });
export const CronUpdateOutputSchema = new Proxy({} as never, { get: _unimplementedValue });
export const CUA_TARGET_APP_DISPLAY_META_KEY = new Proxy({} as never, { get: _unimplementedValue });
export type CuaRequestAccessStatusDisplay = never;
export const cuaRequestAccessStatusDisplaySchema = new Proxy({} as never, {
  get: _unimplementedValue,
});
export type CuaTargetAppDisplay = never;
export const cuaTargetAppDisplaySchema = new Proxy({} as never, { get: _unimplementedValue });
export type CuaToolResultDisplayPayload = never;
export const cuaToolResultDisplayPayloadSchema = new Proxy({} as never, {
  get: _unimplementedValue,
});
export type DiffHunk = never;
export const EditDiffHunkSchema = new Proxy({} as never, { get: _unimplementedValue });
export type EditErrorCode = never;
export const EditGitDiffSchema = new Proxy({} as never, { get: _unimplementedValue });
export type EditInput = never;
export const EditInputJsonSchema = new Proxy({} as never, { get: _unimplementedValue });
export const EditInputSchema = new Proxy({} as never, { get: _unimplementedValue });
export type EditOutput = never;
export const EditOutputJsonSchema = new Proxy({} as never, { get: _unimplementedValue });
export const EditOutputSchema = new Proxy({} as never, { get: _unimplementedValue });
export type EditToolCall = never;
export type EditToolResult = never;
export const ENTER_PLAN_MODE_TOOL_NAME = new Proxy({} as never, { get: _unimplementedValue });
export type EnterPlanModeInput = never;
export const EnterPlanModeInputJsonSchema = new Proxy({} as never, { get: _unimplementedValue });
export const EnterPlanModeInputSchema = new Proxy({} as never, { get: _unimplementedValue });
export type EnterPlanModeOutput = never;
export const EnterPlanModeOutputJsonSchema = new Proxy({} as never, { get: _unimplementedValue });
export const EnterPlanModeOutputSchema = new Proxy({} as never, { get: _unimplementedValue });
export type EnterPlanModeTransitionResult = never;
export const ESCALATE_TOOL_NAME = new Proxy({} as never, { get: _unimplementedValue });
export type EscalateInput = never;
export const EscalateInputJsonSchema = new Proxy({} as never, { get: _unimplementedValue });
export const EscalateInputSchema = new Proxy({} as never, { get: _unimplementedValue });
export type EscalateOutput = never;
export const EscalateOutputJsonSchema = new Proxy({} as never, { get: _unimplementedValue });
export const EscalateOutputSchema = new Proxy({} as never, { get: _unimplementedValue });
export function escapeGoalPromptText(..._args: unknown[]): never {
  return notImplemented();
}
export const EVAL_WORKFLOW_SNIPPET_DEFAULT_TIMEOUT_MS = new Proxy({} as never, {
  get: _unimplementedValue,
});
export const EVAL_WORKFLOW_SNIPPET_MAX_ARTIFACT_BYTES = new Proxy({} as never, {
  get: _unimplementedValue,
});
export const EVAL_WORKFLOW_SNIPPET_MAX_LOG_CHARS = new Proxy({} as never, {
  get: _unimplementedValue,
});
export const EVAL_WORKFLOW_SNIPPET_MAX_LOGS = new Proxy({} as never, { get: _unimplementedValue });
export const EVAL_WORKFLOW_SNIPPET_MAX_TIMEOUT_MS = new Proxy({} as never, {
  get: _unimplementedValue,
});
export const EVAL_WORKFLOW_SNIPPET_MIN_TIMEOUT_MS = new Proxy({} as never, {
  get: _unimplementedValue,
});
export const EVAL_WORKFLOW_SNIPPET_SOURCE_ERROR = new Proxy({} as never, {
  get: _unimplementedValue,
});
export const EVAL_WORKFLOW_SNIPPET_TOOL_NAME = new Proxy({} as never, { get: _unimplementedValue });
export type EvalWorkflowSnippetInput = never;
export const EvalWorkflowSnippetInputJsonSchema = new Proxy({} as never, {
  get: _unimplementedValue,
});
export const EvalWorkflowSnippetInputSchema = new Proxy({} as never, { get: _unimplementedValue });
export type EvalWorkflowSnippetOutput = never;
export const EvalWorkflowSnippetOutputJsonSchema = new Proxy({} as never, {
  get: _unimplementedValue,
});
export const EvalWorkflowSnippetOutputSchema = new Proxy({} as never, { get: _unimplementedValue });
export type EvalWorkflowSnippetToolResultDisplayPayload = never;
export const evalWorkflowSnippetToolResultDisplayPayloadSchema = new Proxy({} as never, {
  get: _unimplementedValue,
});
export const EXIT_PLAN_MODE_TOOL_NAME = new Proxy({} as never, { get: _unimplementedValue });
export type ExitPlanModeAllowedPrompt = never;
export const ExitPlanModeAllowedPromptSchema = new Proxy({} as never, { get: _unimplementedValue });
export type ExitPlanModeInput = never;
export const ExitPlanModeInputJsonSchema = new Proxy({} as never, { get: _unimplementedValue });
export const ExitPlanModeInputSchema = new Proxy({} as never, { get: _unimplementedValue });
export type ExitPlanModeOutput = never;
export const ExitPlanModeOutputJsonSchema = new Proxy({} as never, { get: _unimplementedValue });
export const ExitPlanModeOutputSchema = new Proxy({} as never, { get: _unimplementedValue });
export type ExitPlanModeTransitionResult = never;
export function failedGoalCompletionVerification(..._args: unknown[]): never {
  return notImplemented();
}
export function failOpenGoalCompletionVerification(..._args: unknown[]): never {
  return notImplemented();
}
export type FileDiffToolResultDisplayPayload = never;
export const fileDiffToolResultDisplayPayloadSchema = new Proxy({} as never, {
  get: _unimplementedValue,
});
export type FileSystemExecutionTelemetry = never;
export const FileSystemExecutionTelemetrySchema = new Proxy({} as never, {
  get: _unimplementedValue,
});
export function formatGoalCompletionVerificationFailurePrompt(..._args: unknown[]): never {
  return notImplemented();
}
export function formatGoalCompletionVerificationPassedContent(..._args: unknown[]): never {
  return notImplemented();
}
export function formatGoalCompletionVerificationPrompt(..._args: unknown[]): never {
  return notImplemented();
}
export function formatGoalContinuationPrompt(..._args: unknown[]): never {
  return notImplemented();
}
export function formatGoalStateForModel(..._args: unknown[]): never {
  return notImplemented();
}
export function formatTodoStateForModel(..._args: unknown[]): never {
  return notImplemented();
}
export const GET_WORKFLOW_RUN_ROSTER_LIMITS = new Proxy({} as never, { get: _unimplementedValue });
export const GET_WORKFLOW_RUN_SUMMARY_MAX_CHARS = new Proxy({} as never, {
  get: _unimplementedValue,
});
export const GET_WORKFLOW_RUN_TOOL_NAME = new Proxy({} as never, { get: _unimplementedValue });
export function getReadPdfPagesValidationFailure(..._args: unknown[]): never {
  return notImplemented();
}
export const GetWorkflowRunActorSchema = new Proxy({} as never, { get: _unimplementedValue });
export const GetWorkflowRunArtifactSchema = new Proxy({} as never, { get: _unimplementedValue });
export const GetWorkflowRunConcurrencyHealthSchema = new Proxy({} as never, {
  get: _unimplementedValue,
});
export const GetWorkflowRunErrorSchema = new Proxy({} as never, { get: _unimplementedValue });
export type GetWorkflowRunHealth = never;
export const GetWorkflowRunHealthSchema = new Proxy({} as never, { get: _unimplementedValue });
export type GetWorkflowRunInput = never;
export const GetWorkflowRunInputJsonSchema = new Proxy({} as never, { get: _unimplementedValue });
export const GetWorkflowRunInputSchema = new Proxy({} as never, { get: _unimplementedValue });
export const GetWorkflowRunLogEntrySchema = new Proxy({} as never, { get: _unimplementedValue });
export type GetWorkflowRunOutput = never;
export const GetWorkflowRunOutputJsonSchema = new Proxy({} as never, { get: _unimplementedValue });
export const GetWorkflowRunOutputSchema = new Proxy({} as never, { get: _unimplementedValue });
export const GetWorkflowRunPendingQuestionSchema = new Proxy({} as never, {
  get: _unimplementedValue,
});
export type GetWorkflowRunPhase = never;
export const GetWorkflowRunPhaseSchema = new Proxy({} as never, { get: _unimplementedValue });
export type GetWorkflowRunSubagent = never;
export type GetWorkflowRunSubagentAsk = never;
export const GetWorkflowRunSubagentAskSchema = new Proxy({} as never, { get: _unimplementedValue });
export const GetWorkflowRunSubagentLastToolSchema = new Proxy({} as never, {
  get: _unimplementedValue,
});
export const GetWorkflowRunSubagentSchema = new Proxy({} as never, { get: _unimplementedValue });
export const GetWorkflowRunSubagentWaitSchema = new Proxy({} as never, {
  get: _unimplementedValue,
});
export const getWorkflowRunToolResultDisplayErrorSchema = new Proxy({} as never, {
  get: _unimplementedValue,
});
export const getWorkflowRunToolResultDisplayLogEntrySchema = new Proxy({} as never, {
  get: _unimplementedValue,
});
export type GetWorkflowRunToolResultDisplayPayload = never;
export const getWorkflowRunToolResultDisplayPayloadSchema = new Proxy({} as never, {
  get: _unimplementedValue,
});
export const getWorkflowRunToolResultDisplaySubagentSchema = new Proxy({} as never, {
  get: _unimplementedValue,
});
export const GetWorkflowRunUsageSchema = new Proxy({} as never, { get: _unimplementedValue });
export type GitDiff = never;
export type GlobErrorCode = never;
export type GlobInput = never;
export const GlobInputJsonSchema = new Proxy({} as never, { get: _unimplementedValue });
export const GlobInputSchema = new Proxy({} as never, { get: _unimplementedValue });
export type GlobOutput = never;
export const GlobOutputJsonSchema = new Proxy({} as never, { get: _unimplementedValue });
export const GlobOutputSchema = new Proxy({} as never, { get: _unimplementedValue });
export type GlobToolCall = never;
export type GlobToolResult = never;
export const GOAL_COMPLETION_VERIFICATION_FALLBACK_REASON = new Proxy({} as never, {
  get: _unimplementedValue,
});
export const GOAL_COMPLETION_VERIFICATION_QUERY_SOURCE = new Proxy({} as never, {
  get: _unimplementedValue,
});
export type GoalCompletionVerificationOutput = never;
export const GoalCompletionVerificationOutputSchema = new Proxy({} as never, {
  get: _unimplementedValue,
});
export const GoalObjectiveSchema = new Proxy({} as never, { get: _unimplementedValue });
export type GoalReadInput = never;
export const GoalReadInputJsonSchema = new Proxy({} as never, { get: _unimplementedValue });
export const GoalReadInputSchema = new Proxy({} as never, { get: _unimplementedValue });
export type GoalReadOutput = never;
export const GoalReadOutputJsonSchema = new Proxy({} as never, { get: _unimplementedValue });
export const GoalReadOutputSchema = new Proxy({} as never, { get: _unimplementedValue });
export type GoalStatus = never;
export const GoalStatusSchema = new Proxy({} as never, { get: _unimplementedValue });
export const GoalTokenBudgetSchema = new Proxy({} as never, { get: _unimplementedValue });
export type GrepErrorCode = never;
export type GrepInput = never;
export const GrepInputJsonSchema = new Proxy({} as never, { get: _unimplementedValue });
export const GrepInputSchema = new Proxy({} as never, { get: _unimplementedValue });
export type GrepOutput = never;
export const GrepOutputJsonSchema = new Proxy({} as never, { get: _unimplementedValue });
export type GrepOutputMode = never;
export const GrepOutputSchema = new Proxy({} as never, { get: _unimplementedValue });
export type GrepToolCall = never;
export type GrepToolResult = never;
export function hasRelativeDelayMinutes(..._args: unknown[]): never {
  return notImplemented();
}
export function isTodoToolName(..._args: unknown[]): never {
  return notImplemented();
}
export function isValidSavedWorkflowName(..._args: unknown[]): never {
  return notImplemented();
}
export function isWorkspaceMutatingToolCall(..._args: unknown[]): never {
  return notImplemented();
}
export function isWorldTouchingToolCall(..._args: unknown[]): never {
  return notImplemented();
}
export type JsInput = never;
export const JsInputJsonSchema = new Proxy({} as never, { get: _unimplementedValue });
export const JsInputSchema = new Proxy({} as never, { get: _unimplementedValue });
export type JsOutput = never;
export const JsOutputJsonSchema = new Proxy({} as never, { get: _unimplementedValue });
export const JsOutputSchema = new Proxy({} as never, { get: _unimplementedValue });
export type JsRuntimeInput = never;
export const JsRuntimeInputSchema = new Proxy({} as never, { get: _unimplementedValue });
export const LIST_MODELS_TOOL_NAME = new Proxy({} as never, { get: _unimplementedValue });
export const LIST_SAVED_WORKFLOWS_TOOL_NAME = new Proxy({} as never, { get: _unimplementedValue });
export const LIST_WORKFLOW_RUNS_DEFAULT_LIMIT = new Proxy({} as never, {
  get: _unimplementedValue,
});
export const LIST_WORKFLOW_RUNS_MAX_LIMIT = new Proxy({} as never, { get: _unimplementedValue });
export const LIST_WORKFLOW_RUNS_MIN_LIMIT = new Proxy({} as never, { get: _unimplementedValue });
export const LIST_WORKFLOW_RUNS_TOOL_NAME = new Proxy({} as never, { get: _unimplementedValue });
export type ListModelsEntry = never;
export const ListModelsEntrySchema = new Proxy({} as never, { get: _unimplementedValue });
export type ListModelsInput = never;
export const ListModelsInputJsonSchema = new Proxy({} as never, { get: _unimplementedValue });
export const ListModelsInputSchema = new Proxy({} as never, { get: _unimplementedValue });
export type ListModelsOutput = never;
export const ListModelsOutputJsonSchema = new Proxy({} as never, { get: _unimplementedValue });
export const ListModelsOutputSchema = new Proxy({} as never, { get: _unimplementedValue });
export type ListModelsToolResultDisplayPayload = never;
export const listModelsToolResultDisplayPayloadSchema = new Proxy({} as never, {
  get: _unimplementedValue,
});
export type ListSavedWorkflowsInput = never;
export const ListSavedWorkflowsInputJsonSchema = new Proxy({} as never, {
  get: _unimplementedValue,
});
export const ListSavedWorkflowsInputSchema = new Proxy({} as never, { get: _unimplementedValue });
export type ListSavedWorkflowsOutput = never;
export const ListSavedWorkflowsOutputJsonSchema = new Proxy({} as never, {
  get: _unimplementedValue,
});
export const ListSavedWorkflowsOutputSchema = new Proxy({} as never, { get: _unimplementedValue });
export type ListWorkflowRunsInput = never;
export const ListWorkflowRunsInputJsonSchema = new Proxy({} as never, { get: _unimplementedValue });
export const ListWorkflowRunsInputSchema = new Proxy({} as never, { get: _unimplementedValue });
export type ListWorkflowRunsOutput = never;
export const ListWorkflowRunsOutputJsonSchema = new Proxy({} as never, {
  get: _unimplementedValue,
});
export const ListWorkflowRunsOutputSchema = new Proxy({} as never, { get: _unimplementedValue });
export type ListWorkflowRunsRun = never;
export const ListWorkflowRunsRunSchema = new Proxy({} as never, { get: _unimplementedValue });
export type ListWorkflowRunsToolResultDisplayPayload = never;
export const listWorkflowRunsToolResultDisplayPayloadSchema = new Proxy({} as never, {
  get: _unimplementedValue,
});
export type LocalAgentMessageToolResultDisplayPayload = never;
export const localAgentMessageToolResultDisplayPayloadSchema = new Proxy({} as never, {
  get: _unimplementedValue,
});
export const MAX_GOAL_OBJECTIVE_CHARS = new Proxy({} as never, { get: _unimplementedValue });
export const MCP_TOOL_DISPLAY_MAX_DESCRIPTION_CHARS = new Proxy({} as never, {
  get: _unimplementedValue,
});
export const MCP_TOOL_DISPLAY_MAX_NAME_CHARS = new Proxy({} as never, { get: _unimplementedValue });
export type McpToolResultDisplayPayload = never;
export const mcpToolResultDisplayPayloadSchema = new Proxy({} as never, {
  get: _unimplementedValue,
});
export type NodeReplCuaAppDisplay = never;
export const nodeReplCuaAppDisplaySchema = new Proxy({} as never, { get: _unimplementedValue });
export type NodeReplImageToolResultDisplayPayload = never;
export const nodeReplImageToolResultDisplayPayloadSchema = new Proxy({} as never, {
  get: _unimplementedValue,
});
export function normalizeGoalObjective(..._args: unknown[]): never {
  return notImplemented();
}
export function normalizeToolJsonSchema(..._args: unknown[]): never {
  return notImplemented();
}
export type NotebookCell = never;
export type NoToolTimeoutPolicy = never;
export type OffPeakCreateInput = never;
export const OffPeakCreateInputJsonSchema = new Proxy({} as never, { get: _unimplementedValue });
export const OffPeakCreateInputSchema = new Proxy({} as never, { get: _unimplementedValue });
export type OffPeakCreateOutput = never;
export const OffPeakCreateOutputJsonSchema = new Proxy({} as never, { get: _unimplementedValue });
export const OffPeakCreateOutputSchema = new Proxy({} as never, { get: _unimplementedValue });
export type OffPeakListInput = never;
export const OffPeakListInputJsonSchema = new Proxy({} as never, { get: _unimplementedValue });
export const OffPeakListInputSchema = new Proxy({} as never, { get: _unimplementedValue });
export type OffPeakListOutput = never;
export const OffPeakListOutputJsonSchema = new Proxy({} as never, { get: _unimplementedValue });
export const OffPeakListOutputSchema = new Proxy({} as never, { get: _unimplementedValue });
export type OffPeakTaskStatus = never;
export const OffPeakTaskStatusSchema = new Proxy({} as never, { get: _unimplementedValue });
export type OffPeakTaskSummary = never;
export const OffPeakTaskSummarySchema = new Proxy({} as never, { get: _unimplementedValue });
export function parseCompletedToolPartMetadata(..._args: unknown[]): never {
  return notImplemented();
}
export type ParsedTodoReadOutput = never;
export type ParsedTodoWriteOutput = never;
export function parseGoalCompletionVerificationText(..._args: unknown[]): never {
  return notImplemented();
}
export function parseReadPdfPageRange(..._args: unknown[]): never {
  return notImplemented();
}
export function parseToolResultDisplayPayload(..._args: unknown[]): never {
  return notImplemented();
}
export type PatchExecutionTelemetry = never;
export const PatchExecutionTelemetrySchema = new Proxy({} as never, { get: _unimplementedValue });
export const PLAN_MODE_MAX_PLAN_CHARS = new Proxy({} as never, { get: _unimplementedValue });
export type ProviderNativeToolSpec = never;
export const READ_DEFAULT_MAX_LINES = new Proxy({} as never, { get: _unimplementedValue });
export const READ_IMAGE_MAX_BASE64_BYTES = new Proxy({} as never, { get: _unimplementedValue });
export const READ_IMAGE_MAX_DIMENSION = new Proxy({} as never, { get: _unimplementedValue });
export const READ_IMAGE_MAX_INPUT_BYTES = new Proxy({} as never, { get: _unimplementedValue });
export const READ_IMAGE_TARGET_BYTES = new Proxy({} as never, { get: _unimplementedValue });
export const READ_IMAGE_TOKEN_TO_BASE64_CHAR_RATIO = new Proxy({} as never, {
  get: _unimplementedValue,
});
export const READ_MAX_FILE_SIZE_BYTES = new Proxy({} as never, { get: _unimplementedValue });
export const READ_MAX_OUTPUT_TOKENS = new Proxy({} as never, { get: _unimplementedValue });
export const READ_PDF_AVAILABILITY_TIMEOUT_MS = new Proxy({} as never, {
  get: _unimplementedValue,
});
export const READ_PDF_EXTRACT_MAX_INPUT_BYTES = new Proxy({} as never, {
  get: _unimplementedValue,
});
export const READ_PDF_INFO_TIMEOUT_MS = new Proxy({} as never, { get: _unimplementedValue });
export const READ_PDF_MAX_PAGES_PER_REQUEST = new Proxy({} as never, { get: _unimplementedValue });
export const READ_PDF_NATIVE_MAX_INPUT_BYTES = new Proxy({} as never, { get: _unimplementedValue });
export const READ_PDF_NATIVE_MAX_PAGES = new Proxy({} as never, { get: _unimplementedValue });
export const READ_PDF_PAGES_DESCRIPTION = new Proxy({} as never, { get: _unimplementedValue });
export const READ_PDF_RENDER_TIMEOUT_MS = new Proxy({} as never, { get: _unimplementedValue });
export const READ_SESSION_CONTEXT_DEFAULT_MAX_TOKENS = new Proxy({} as never, {
  get: _unimplementedValue,
});
export const READ_SESSION_CONTEXT_MAX_TOKENS = new Proxy({} as never, { get: _unimplementedValue });
export const READ_SESSION_CONTEXT_TOOL_NAME = new Proxy({} as never, { get: _unimplementedValue });
export const READ_VIDEO_MAX_INPUT_BYTES = new Proxy({} as never, { get: _unimplementedValue });
export const ReadCellOutputSchema = new Proxy({} as never, { get: _unimplementedValue });
export type ReadErrorCode = never;
export type ReadFileState = never;
export const ReadImageDimensionsSchema = new Proxy({} as never, { get: _unimplementedValue });
export type ReadImageOutput = never;
export const ReadImageOutputSchema = new Proxy({} as never, { get: _unimplementedValue });
export type ReadInput = never;
export const ReadInputJsonSchema = new Proxy({} as never, { get: _unimplementedValue });
export const ReadInputSchema = new Proxy({} as never, { get: _unimplementedValue });
export const ReadNotebookCellSchema = new Proxy({} as never, { get: _unimplementedValue });
export type ReadNotebookOutput = never;
export const ReadNotebookOutputSchema = new Proxy({} as never, { get: _unimplementedValue });
export type ReadOutput = never;
export const ReadOutputJsonSchema = new Proxy({} as never, { get: _unimplementedValue });
export const ReadOutputSchema = new Proxy({} as never, { get: _unimplementedValue });
export type ReadPartsOutput = never;
export const ReadPartsOutputSchema = new Proxy({} as never, { get: _unimplementedValue });
export const ReadPdfInputJsonSchema = new Proxy({} as never, { get: _unimplementedValue });
export type ReadPdfOutput = never;
export const ReadPdfOutputSchema = new Proxy({} as never, { get: _unimplementedValue });
export type ReadPdfPageRange = never;
export type ReadPdfPagesValidationFailure = never;
export type ReadSessionContextInput = never;
export const ReadSessionContextInputJsonSchema = new Proxy({} as never, {
  get: _unimplementedValue,
});
export const ReadSessionContextInputSchema = new Proxy({} as never, { get: _unimplementedValue });
export type ReadSessionContextOutput = never;
export const ReadSessionContextOutputJsonSchema = new Proxy({} as never, {
  get: _unimplementedValue,
});
export const ReadSessionContextOutputSchema = new Proxy({} as never, { get: _unimplementedValue });
export type ReadSessionContextReference = never;
export const ReadSessionContextReferenceSchema = new Proxy({} as never, {
  get: _unimplementedValue,
});
export const ReadSessionContextStrategySchema = new Proxy({} as never, {
  get: _unimplementedValue,
});
export type ReadTextOutput = never;
export const ReadTextOutputSchema = new Proxy({} as never, { get: _unimplementedValue });
export type ReadToolCall = never;
export type ReadToolResult = never;
export type ReadUnchangedOutput = never;
export const ReadUnchangedOutputSchema = new Proxy({} as never, { get: _unimplementedValue });
export type ReadVideoOutput = never;
export const ReadVideoOutputSchema = new Proxy({} as never, { get: _unimplementedValue });
export const RESOLVE_WORKFLOW_QUESTION_TOOL_NAME = new Proxy({} as never, {
  get: _unimplementedValue,
});
export type ResolveWorkflowQuestionInput = never;
export const ResolveWorkflowQuestionInputJsonSchema = new Proxy({} as never, {
  get: _unimplementedValue,
});
export const ResolveWorkflowQuestionInputSchema = new Proxy({} as never, {
  get: _unimplementedValue,
});
export type ResolveWorkflowQuestionOutput = never;
export const ResolveWorkflowQuestionOutputJsonSchema = new Proxy({} as never, {
  get: _unimplementedValue,
});
export const ResolveWorkflowQuestionOutputSchema = new Proxy({} as never, {
  get: _unimplementedValue,
});
export const RESPOND_TO_COORDINATOR_MAX_CONTENT_CHARS = new Proxy({} as never, {
  get: _unimplementedValue,
});
export const RESPOND_TO_COORDINATOR_TOOL_NAME = new Proxy({} as never, {
  get: _unimplementedValue,
});
export type RespondToCoordinatorInput = never;
export const RespondToCoordinatorInputJsonSchema = new Proxy({} as never, {
  get: _unimplementedValue,
});
export const RespondToCoordinatorInputSchema = new Proxy({} as never, { get: _unimplementedValue });
export type RespondToCoordinatorOutput = never;
export const RespondToCoordinatorOutputSchema = new Proxy({} as never, {
  get: _unimplementedValue,
});
export type RespondToCoordinatorToolResultDisplayPayload = never;
export const respondToCoordinatorToolResultDisplayPayloadSchema = new Proxy({} as never, {
  get: _unimplementedValue,
});
export const RESUME_WORKFLOW_RUN_TOOL_NAME = new Proxy({} as never, { get: _unimplementedValue });
export type ResumeWorkflowRunInput = never;
export const ResumeWorkflowRunInputJsonSchema = new Proxy({} as never, {
  get: _unimplementedValue,
});
export const ResumeWorkflowRunInputSchema = new Proxy({} as never, { get: _unimplementedValue });
export type ResumeWorkflowRunOutput = never;
export const ResumeWorkflowRunOutputJsonSchema = new Proxy({} as never, {
  get: _unimplementedValue,
});
export const ResumeWorkflowRunOutputSchema = new Proxy({} as never, { get: _unimplementedValue });
export type ResumeWorkflowRunToolResultDisplayPayload = never;
export const resumeWorkflowRunToolResultDisplayPayloadSchema = new Proxy({} as never, {
  get: _unimplementedValue,
});
export const SAVE_WORKFLOW_SENTINEL_IN_SCRIPT_ERROR = new Proxy({} as never, {
  get: _unimplementedValue,
});
export const SAVE_WORKFLOW_SOURCE_ERROR = new Proxy({} as never, { get: _unimplementedValue });
export const SAVE_WORKFLOW_TOOL_NAME = new Proxy({} as never, { get: _unimplementedValue });
export const SAVED_WORKFLOW_ARG_TYPES = new Proxy({} as never, { get: _unimplementedValue });
export const SAVED_WORKFLOW_FILE_EXTENSION = new Proxy({} as never, { get: _unimplementedValue });
export const SAVED_WORKFLOW_GLOBAL_DIR = new Proxy({} as never, { get: _unimplementedValue });
export const SAVED_WORKFLOW_MAX_NAME_CHARS = new Proxy({} as never, { get: _unimplementedValue });
export const SAVED_WORKFLOW_NAME_PATTERN = new Proxy({} as never, { get: _unimplementedValue });
export const SAVED_WORKFLOW_PROJECT_DIR = new Proxy({} as never, { get: _unimplementedValue });
export const SAVED_WORKFLOW_SCOPES = new Proxy({} as never, { get: _unimplementedValue });
export const SAVED_WORKFLOW_SHADOWING = new Proxy({} as never, { get: _unimplementedValue });
export type SavedWorkflowArgDeclaration = never;
export const SavedWorkflowArgDeclarationSchema = new Proxy({} as never, {
  get: _unimplementedValue,
});
export type SavedWorkflowArgsDeclaration = never;
export const SavedWorkflowArgsDeclarationSchema = new Proxy({} as never, {
  get: _unimplementedValue,
});
export type SavedWorkflowArgType = never;
export const SavedWorkflowArgTypeSchema = new Proxy({} as never, { get: _unimplementedValue });
export type SavedWorkflowEntry = never;
export const SavedWorkflowEntrySchema = new Proxy({} as never, { get: _unimplementedValue });
export type SavedWorkflowInvalidEntry = never;
export const SavedWorkflowInvalidEntrySchema = new Proxy({} as never, { get: _unimplementedValue });
export type SavedWorkflowListToolResultDisplayPayload = never;
export const savedWorkflowListToolResultDisplayPayloadSchema = new Proxy({} as never, {
  get: _unimplementedValue,
});
export type SavedWorkflowMeta = never;
export const SavedWorkflowMetaSchema = new Proxy({} as never, { get: _unimplementedValue });
export type SavedWorkflowScope = never;
export const SavedWorkflowScopeSchema = new Proxy({} as never, { get: _unimplementedValue });
export type SavedWorkflowShadowing = never;
export const SavedWorkflowShadowingSchema = new Proxy({} as never, { get: _unimplementedValue });
export type SaveWorkflowInput = never;
export const SaveWorkflowInputJsonSchema = new Proxy({} as never, { get: _unimplementedValue });
export const SaveWorkflowInputSchema = new Proxy({} as never, { get: _unimplementedValue });
export type SaveWorkflowOutput = never;
export const SaveWorkflowOutputJsonSchema = new Proxy({} as never, { get: _unimplementedValue });
export const SaveWorkflowOutputSchema = new Proxy({} as never, { get: _unimplementedValue });
export const SEND_MESSAGE_MAX_CONTENT_CHARS = new Proxy({} as never, { get: _unimplementedValue });
export const SEND_MESSAGE_TOOL_NAME = new Proxy({} as never, { get: _unimplementedValue });
export type SendMessageInput = never;
export const SendMessageInputJsonSchema = new Proxy({} as never, { get: _unimplementedValue });
export const SendMessageInputSchema = new Proxy({} as never, { get: _unimplementedValue });
export type SendMessageOutput = never;
export const SendMessageOutputJsonSchema = new Proxy({} as never, { get: _unimplementedValue });
export const SendMessageOutputSchema = new Proxy({} as never, { get: _unimplementedValue });
export type SessionGoal = never;
export const SessionGoalSchema = new Proxy({} as never, { get: _unimplementedValue });
export type SessionModePort = never;
export type SessionModeTransitionInput = never;
export type ShellPermissionPolicy = never;
export type ShellPermissionRule = never;
export type SkillInput = never;
export const SkillInputJsonSchema = new Proxy({} as never, { get: _unimplementedValue });
export const SkillInputSchema = new Proxy({} as never, { get: _unimplementedValue });
export type SkillOutput = never;
export const SkillOutputJsonSchema = new Proxy({} as never, { get: _unimplementedValue });
export const SkillOutputSchema = new Proxy({} as never, { get: _unimplementedValue });
export type SkillRuntimeInput = never;
export type SkillStructuredOutput = never;
export const SkillStructuredOutputSchema = new Proxy({} as never, { get: _unimplementedValue });
export type SkillToolCall = never;
export type SkillToolResult = never;
export const SUBMIT_RESULT_TOOL_NAME = new Proxy({} as never, { get: _unimplementedValue });
export type SubmitResultInput = never;
export const SubmitResultInputJsonSchema = new Proxy({} as never, { get: _unimplementedValue });
export const SubmitResultInputSchema = new Proxy({} as never, { get: _unimplementedValue });
export type SubmitResultOutput = never;
export const SubmitResultOutputJsonSchema = new Proxy({} as never, { get: _unimplementedValue });
export const SubmitResultOutputSchema = new Proxy({} as never, { get: _unimplementedValue });
export const TASK_OUTPUT_ALIASES = new Proxy({} as never, { get: _unimplementedValue });
export const TASK_OUTPUT_DISPLAY_MAX_OUTPUT_CHARS = new Proxy({} as never, {
  get: _unimplementedValue,
});
export const TASK_OUTPUT_DISPLAY_MAX_STATUS_CHARS = new Proxy({} as never, {
  get: _unimplementedValue,
});
export const TASK_OUTPUT_PROVIDER_DESCRIPTION = new Proxy({} as never, {
  get: _unimplementedValue,
});
export const TASK_OUTPUT_TOOL_NAME = new Proxy({} as never, { get: _unimplementedValue });
export const TASK_STOP_TOOL_NAME = new Proxy({} as never, { get: _unimplementedValue });
export type TaskOutputInput = never;
export const TaskOutputInputJsonSchema = new Proxy({} as never, { get: _unimplementedValue });
export const TaskOutputInputSchema = new Proxy({} as never, { get: _unimplementedValue });
export type TaskOutputResult = never;
export const TaskOutputResultJsonSchema = new Proxy({} as never, { get: _unimplementedValue });
export const TaskOutputResultSchema = new Proxy({} as never, { get: _unimplementedValue });
export type TaskOutputTask = never;
export const TaskOutputTaskSchema = new Proxy({} as never, { get: _unimplementedValue });
export type TaskOutputToolResultDisplayPayload = never;
export const taskOutputToolResultDisplayPayloadSchema = new Proxy({} as never, {
  get: _unimplementedValue,
});
export type TaskStopInput = never;
export const TaskStopInputJsonSchema = new Proxy({} as never, { get: _unimplementedValue });
export const TaskStopInputSchema = new Proxy({} as never, { get: _unimplementedValue });
export type TaskStopOutput = never;
export const TaskStopOutputJsonSchema = new Proxy({} as never, { get: _unimplementedValue });
export const TaskStopOutputSchema = new Proxy({} as never, { get: _unimplementedValue });
export type TaskStopToolResultDisplayPayload = never;
export const taskStopToolResultDisplayPayloadSchema = new Proxy({} as never, {
  get: _unimplementedValue,
});
export type TimedToolTimeoutPolicy = never;
export type TodoItem = never;
export const TodoItemSchema = new Proxy({} as never, { get: _unimplementedValue });
export function todoItemsFromToolResultContent(..._args: unknown[]): never {
  return notImplemented();
}
export type TodoPriority = never;
export type TodoReadInput = never;
export const TodoReadInputJsonSchema = new Proxy({} as never, { get: _unimplementedValue });
export const TodoReadInputSchema = new Proxy({} as never, { get: _unimplementedValue });
export type TodoReadOutput = never;
export const TodoReadOutputJsonSchema = new Proxy({} as never, { get: _unimplementedValue });
export const TodoReadOutputSchema = new Proxy({} as never, { get: _unimplementedValue });
export type TodoReadToolCall = never;
export type TodoStatus = never;
export type TodoSummary = never;
export const TodoSummarySchema = new Proxy({} as never, { get: _unimplementedValue });
export type TodoWriteInput = never;
export const TodoWriteInputJsonSchema = new Proxy({} as never, { get: _unimplementedValue });
export const TodoWriteInputSchema = new Proxy({} as never, { get: _unimplementedValue });
export type TodoWriteOutput = never;
export const TodoWriteOutputJsonSchema = new Proxy({} as never, { get: _unimplementedValue });
export const TodoWriteOutputSchema = new Proxy({} as never, { get: _unimplementedValue });
export type TodoWriteToolCall = never;
export const TOOL_JSON_SCHEMA_VERSION = new Proxy({} as never, { get: _unimplementedValue });
export type ToolCancellationPolicy = never;
export type ToolCommandStatus = never;
export const ToolCommandStatusSchema = new Proxy({} as never, { get: _unimplementedValue });
export type ToolContractDeclaration = never;
export type ToolExecutionMode = never;
export type ToolExecutionTelemetry = never;
export type ToolExecutionTelemetryDetail = never;
export const ToolExecutionTelemetryDetailSchema = new Proxy({} as never, {
  get: _unimplementedValue,
});
export const ToolExecutionTelemetrySchema = new Proxy({} as never, { get: _unimplementedValue });
export type ToolPermissionPatternSource = never;
export type ToolPermissionSpec = never;
export type ToolResultBudget = never;
export type ToolResultBudgetStrategy = never;
export const toolResultDisplayDiffHunkSchema = new Proxy({} as never, { get: _unimplementedValue });
export type ToolResultDisplayPayload = never;
export const toolResultDisplayPayloadSchema = new Proxy({} as never, { get: _unimplementedValue });
export type ToolResultSerializationMetadata = never;
export const toolResultSerializationMetadataSchema = new Proxy({} as never, {
  get: _unimplementedValue,
});
export type ToolSideEffectScope = never;
export type ToolTimeoutPolicy = never;
export type ToolTracePolicy = never;
export function toToolJsonSchema(..._args: unknown[]): never {
  return notImplemented();
}
export function toWebSearchProviderNativeArgs(..._args: unknown[]): never {
  return notImplemented();
}
export function typedSubmitResultInputSchema(..._args: unknown[]): never {
  return notImplemented();
}
export type WebFetchErrorCode = never;
export type WebFetchInput = never;
export const WebFetchInputJsonSchema = new Proxy({} as never, { get: _unimplementedValue });
export const WebFetchInputSchema = new Proxy({} as never, { get: _unimplementedValue });
export type WebFetchOutput = never;
export const WebFetchOutputJsonSchema = new Proxy({} as never, { get: _unimplementedValue });
export const WebFetchOutputSchema = new Proxy({} as never, { get: _unimplementedValue });
export type WebFetchRedirect = never;
export const WebFetchRedirectSchema = new Proxy({} as never, { get: _unimplementedValue });
export type WebFetchToolCall = never;
export type WebFetchToolResult = never;
export const WEBSEARCH_PROVIDER_NATIVE_SPEC = new Proxy({} as never, { get: _unimplementedValue });
export const WEBSEARCH_TOOL_CONTRACT = new Proxy({} as never, { get: _unimplementedValue });
export type WebSearchInput = never;
export const WebSearchInputJsonSchema = new Proxy({} as never, { get: _unimplementedValue });
export const WebSearchInputSchema = new Proxy({} as never, { get: _unimplementedValue });
export type WebSearchOutput = never;
export const WebSearchOutputJsonSchema = new Proxy({} as never, { get: _unimplementedValue });
export const WebSearchOutputSchema = new Proxy({} as never, { get: _unimplementedValue });
export type WebSearchProviderNativeArgs = never;
export type WebSearchResultItem = never;
export const WebSearchResultItemSchema = new Proxy({} as never, { get: _unimplementedValue });
export type WebSearchSource = never;
export const WebSearchSourceSchema = new Proxy({} as never, { get: _unimplementedValue });
export const WORKFLOW_DRAFTS_DIR = new Proxy({} as never, { get: _unimplementedValue });
export const WORKFLOW_OBSERVATION_DISPLAY_MAX_ACTORS = new Proxy({} as never, {
  get: _unimplementedValue,
});
export const WORKFLOW_OBSERVATION_DISPLAY_MAX_ARGS = new Proxy({} as never, {
  get: _unimplementedValue,
});
export const WORKFLOW_OBSERVATION_DISPLAY_MAX_LOG_CHARS = new Proxy({} as never, {
  get: _unimplementedValue,
});
export const WORKFLOW_OBSERVATION_DISPLAY_MAX_LOG_ENTRIES = new Proxy({} as never, {
  get: _unimplementedValue,
});
export const WORKFLOW_OBSERVATION_DISPLAY_MAX_META_CHARS = new Proxy({} as never, {
  get: _unimplementedValue,
});
export const WORKFLOW_OBSERVATION_DISPLAY_MAX_MODELS = new Proxy({} as never, {
  get: _unimplementedValue,
});
export const WORKFLOW_OBSERVATION_DISPLAY_MAX_PHASES = new Proxy({} as never, {
  get: _unimplementedValue,
});
export const WORKFLOW_OBSERVATION_DISPLAY_MAX_RESULT_CHARS = new Proxy({} as never, {
  get: _unimplementedValue,
});
export const WORKFLOW_OBSERVATION_DISPLAY_MAX_RUNS = new Proxy({} as never, {
  get: _unimplementedValue,
});
export const WORKFLOW_OBSERVATION_DISPLAY_MAX_SUBAGENTS = new Proxy({} as never, {
  get: _unimplementedValue,
});
export const WORKFLOW_RUN_ID_PATTERN = new Proxy({} as never, { get: _unimplementedValue });
export const WORKFLOW_RUN_LIFECYCLE_STATUSES = new Proxy({} as never, { get: _unimplementedValue });
export const WORKFLOW_RUN_STOP_REASONS = new Proxy({} as never, { get: _unimplementedValue });
export const WORKFLOW_SCRIPT_MAX_LENGTH = new Proxy({} as never, { get: _unimplementedValue });
export type WorkflowInput = never;
export const WorkflowInputJsonSchema = new Proxy({} as never, { get: _unimplementedValue });
export const WorkflowInputSchema = new Proxy({} as never, { get: _unimplementedValue });
export type WorkflowOutput = never;
export const WorkflowOutputJsonSchema = new Proxy({} as never, { get: _unimplementedValue });
export const WorkflowOutputSchema = new Proxy({} as never, { get: _unimplementedValue });
export type WorkflowOutputStatus = never;
export const WorkflowOutputStatusSchema = new Proxy({} as never, { get: _unimplementedValue });
export const WorkflowRunSummarySchema = new Proxy({} as never, { get: _unimplementedValue });
export type WorkflowToolResult = never;
export const WORKSPACE_MUTATING_SIDE_EFFECT_SCOPES = new Proxy({} as never, {
  get: _unimplementedValue,
});
export const WriteDiffHunkSchema = new Proxy({} as never, { get: _unimplementedValue });
export type WriteErrorCode = never;
export const WriteGitDiffSchema = new Proxy({} as never, { get: _unimplementedValue });
export type WriteInput = never;
export const WriteInputJsonSchema = new Proxy({} as never, { get: _unimplementedValue });
export const WriteInputSchema = new Proxy({} as never, { get: _unimplementedValue });
export type WriteOutput = never;
export const WriteOutputJsonSchema = new Proxy({} as never, { get: _unimplementedValue });
export const WriteOutputSchema = new Proxy({} as never, { get: _unimplementedValue });
export type WriteToolCall = never;
export type WriteToolResult = never;
