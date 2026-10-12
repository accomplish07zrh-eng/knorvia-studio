# contracts-03 接口（兼容面）

范围：`apps/cli/packages/contracts/src` 下 `skills`（1 继承）、`telemetry`（2）、`time`（1）与包根 `index.ts`（1），共 5 个继承文件。
本文件只列兼容所需的模块路径、导出名、参数与返回类型；行为规格见 `behavior.md`，调用方见 `callers.md`。
纯声明文件按本文件列出的名字剔除兼容行后再算相似度门槛（工具从本文件的反引号片段与代码块提取名字，排除语言关键字）。

## 包入口与子路径（本包范围）

| 子路径                         | 入口文件                 |
| ------------------------------ | ------------------------ |
| `@knorvia/contracts`           | `src/index.ts`           |
| `@knorvia/contracts/skills`    | `src/skills/index.ts`    |
| `@knorvia/contracts/telemetry` | `src/telemetry/index.ts` |

`time/local-date.ts` 与 `telemetry/agent-execution.ts` 没有独立子路径：前者经包根入口再导出，后者经 `./telemetry` 再导出（`telemetry/index.ts` 里 `export * from "./agent-execution.js"`）。

## 导出清单（按文件）

### `index.ts`

- `./interfaces/shared.js` (ExportDeclaration) — `export * from "./interfaces/shared.js"`
- `./interfaces/execution.port.js` (ExportDeclaration) — `export * from "./interfaces/execution.port.js"`
- `./interfaces/browser-control.port.js` (ExportDeclaration) — `export * from "./interfaces/browser-control.port.js"`
- `./interfaces/file-system.port.js` (ExportDeclaration) — `export * from "./interfaces/file-system.port.js"`
- `./interfaces/context-source.port.js` (ExportDeclaration) — `export * from "./interfaces/context-source.port.js"`
- `./interfaces/http-client.port.js` (ExportDeclaration) — `export * from "./interfaces/http-client.port.js"`
- `./interfaces/image-processor.port.js` (ExportDeclaration) — `export * from "./interfaces/image-processor.port.js"`
- `./interfaces/pdf-document.port.js` (ExportDeclaration) — `export * from "./interfaces/pdf-document.port.js"`
- `./interfaces/permission.port.js` (ExportDeclaration) — `export * from "./interfaces/permission.port.js"`
- `./interfaces/project-permission-update.port.js` (ExportDeclaration) — `export * from "./interfaces/project-permission-update.port.js"`
- `./interfaces/session.port.js` (ExportDeclaration) — `export * from "./interfaces/session.port.js"`
- `./interfaces/session-mailbox.port.js` (ExportDeclaration) — `export * from "./interfaces/session-mailbox.port.js"`
- `./interfaces/session-store.port.js` (ExportDeclaration) — `export * from "./interfaces/session-store.port.js"`
- `./interfaces/input-history.port.js` (ExportDeclaration) — `export * from "./interfaces/input-history.port.js"`
- `./interfaces/tool-artifact-store.port.js` (ExportDeclaration) — `export * from "./interfaces/tool-artifact-store.port.js"`
- `./interfaces/subagent.port.js` (ExportDeclaration) — `export * from "./interfaces/subagent.port.js"`
- `./interfaces/coordinator-response.port.js` (ExportDeclaration) — `export * from "./interfaces/coordinator-response.port.js"`
- `./interfaces/workflow.port.js` (ExportDeclaration) — `export * from "./interfaces/workflow.port.js"`
- `./interfaces/workflow-submit.port.js` (ExportDeclaration) — `export * from "./interfaces/workflow-submit.port.js"`
- `./interfaces/workflow-escalate.port.js` (ExportDeclaration) — `export * from "./interfaces/workflow-escalate.port.js"`
- `./interfaces/dynamic-workflow-run.port.js` (ExportDeclaration) — `export * from "./interfaces/dynamic-workflow-run.port.js"`
- `./interfaces/dynamic-workflow-snippet.port.js` (ExportDeclaration) — `export * from "./interfaces/dynamic-workflow-snippet.port.js"`
- `./interfaces/model-catalog.port.js` (ExportDeclaration) — `export * from "./interfaces/model-catalog.port.js"`
- `./interfaces/automation.port.js` (ExportDeclaration) — `export * from "./interfaces/automation.port.js"`
- `./interfaces/off-peak.port.js` (ExportDeclaration) — `export * from "./interfaces/off-peak.port.js"`
- `./interfaces/mcp.port.js` (ExportDeclaration) — `export * from "./interfaces/mcp.port.js"`
- `./interfaces/runtime-input-presentation.js` (ExportDeclaration) — `export * from "./interfaces/runtime-input-presentation.js"`
- `./events/session.events.js` (ExportDeclaration) — `export * from "./events/session.events.js"`
- `./events/stream-recovery.events.js` (ExportDeclaration) — `export * from "./events/stream-recovery.events.js"`
- `./events/event-reducer.js` (ExportDeclaration) — `export * from "./events/event-reducer.js"`
- `./events/session-event-retention.js` (ExportDeclaration) — `export * from "./events/session-event-retention.js"`
- `./events/in-memory-session-event-store.js` (ExportDeclaration) — `export * from "./events/in-memory-session-event-store.js"`
- `./compact/index.js` (ExportDeclaration) — `export * from "./compact/index.js"`
- `./rewind/index.js` (ExportDeclaration) — `export * from "./rewind/index.js"`
- `./model/index.js` (ExportDeclaration) — `export * from "./model/index.js"`
- `./model/image-media.js` (ExportDeclaration) — `export * from "./model/image-media.js"`
- `./model/media-policy.js` (ExportDeclaration) — `export * from "./model/media-policy.js"`
- `./telemetry/index.js` (ExportDeclaration) — `export * from "./telemetry/index.js"`
- `./errors/index.js` (ExportDeclaration) — `export * from "./errors/index.js"`
- `./config/index.js` (ExportDeclaration) — `export * from "./config/index.js"`
- `./hooks/index.js` (ExportDeclaration) — `export * from "./hooks/index.js"`
- `./skills/index.js` (ExportDeclaration) — `export * from "./skills/index.js"`
- `./commands/index.js` (ExportDeclaration) — `export * from "./commands/index.js"`
- `./plugins/index.js` (ExportDeclaration) — `export * from "./plugins/index.js"`
- `./workflow/index.js` (ExportDeclaration) — `export * from "./workflow/index.js"`
- `./logging/logger.js` (ExportDeclaration) — `export * from "./logging/logger.js"`
- `./tracing/tracer.js` (ExportDeclaration) — `export * from "./tracing/tracer.js"`
- `./time/local-date.js` (ExportDeclaration) — `export * from "./time/local-date.js"`
- `./path/index.js` (ExportDeclaration) — `export * from "./path/index.js"`
- `./network/public-egress-ip.js` (ExportDeclaration) — `export * from "./network/public-egress-ip.js"`
- `./tools/index.js` (ExportDeclaration) — `export * from "./tools/index.js"`
- `./tools/websearch.js` (ExportDeclaration) — `export * from "./tools/websearch.js"`
- `MEDIA_BUDGET_CURRENT_ATTACHMENT_TOO_LARGE_ERROR_CODE` (ExportDeclaration) — `export { MEDIA_BUDGET_CURRENT_ATTACHMENT_TOO_LARGE_ERROR_CODE, MEDIA_BUDGET_CURRENT_IMAGE_TOO_LARGE_ERROR_CODE, MEDIA_BUDGET_CURRENT_VIDEO_TOO_LARGE_ERROR_CODE, VIDEO_INPUT_MAX_BYTES, } from "@knorvia/shared";`
- `MEDIA_BUDGET_CURRENT_IMAGE_TOO_LARGE_ERROR_CODE` (ExportDeclaration) — `export { MEDIA_BUDGET_CURRENT_ATTACHMENT_TOO_LARGE_ERROR_CODE, MEDIA_BUDGET_CURRENT_IMAGE_TOO_LARGE_ERROR_CODE, MEDIA_BUDGET_CURRENT_VIDEO_TOO_LARGE_ERROR_CODE, VIDEO_INPUT_MAX_BYTES, } from "@knorvia/shared";`
- `MEDIA_BUDGET_CURRENT_VIDEO_TOO_LARGE_ERROR_CODE` (ExportDeclaration) — `export { MEDIA_BUDGET_CURRENT_ATTACHMENT_TOO_LARGE_ERROR_CODE, MEDIA_BUDGET_CURRENT_IMAGE_TOO_LARGE_ERROR_CODE, MEDIA_BUDGET_CURRENT_VIDEO_TOO_LARGE_ERROR_CODE, VIDEO_INPUT_MAX_BYTES, } from "@knorvia/shared";`
- `VIDEO_INPUT_MAX_BYTES` (ExportDeclaration) — `export { MEDIA_BUDGET_CURRENT_ATTACHMENT_TOO_LARGE_ERROR_CODE, MEDIA_BUDGET_CURRENT_IMAGE_TOO_LARGE_ERROR_CODE, MEDIA_BUDGET_CURRENT_VIDEO_TOO_LARGE_ERROR_CODE, VIDEO_INPUT_MAX_BYTES, } from "@knorvia/shared";`
- `./tracing/local-turn-preparation.js` (ExportDeclaration) — `export * from "./tracing/local-turn-preparation.js"`
- `LocalTtftDetail` (ExportDeclaration) — `export type { LocalTtftDetail } from "@knorvia/shared";`
- `./interfaces/permission-full-access.js` (ExportDeclaration) — `export * from "./interfaces/permission-full-access.js"`

### `skills/index.ts`

- `SkillScope` (TypeAliasDeclaration) — `SkillScope`
- `SkillSource` (TypeAliasDeclaration) — `SkillSource`
- `SkillDiagnosticSeverity` (TypeAliasDeclaration) — `SkillDiagnosticSeverity`
- `SkillDiagnosticCode` (TypeAliasDeclaration) — `SkillDiagnosticCode`
- `SkillRoot` (InterfaceDeclaration) — `SkillRoot`
- `SkillPolicy` (InterfaceDeclaration) — `SkillPolicy`
- `SkillMetadata` (InterfaceDeclaration) — `SkillMetadata`
- `SkillTelemetryMetadata` (InterfaceDeclaration) — `SkillTelemetryMetadata`
- `SkillDiagnostic` (InterfaceDeclaration) — `SkillDiagnostic`
- `SkillLoadOutcome` (InterfaceDeclaration) — `SkillLoadOutcome`
- `SkillContent` (InterfaceDeclaration) — `SkillContent`
- `SkillDiscoverRequest` (InterfaceDeclaration) — `SkillDiscoverRequest`
- `SkillLoadRequest` (InterfaceDeclaration) — `SkillLoadRequest`
- `SkillOperationOptions` (InterfaceDeclaration) — `SkillOperationOptions`
- `SkillPort` (InterfaceDeclaration) — `SkillPort`
- `SkillConfig` (InterfaceDeclaration) — `SkillConfig`

### `telemetry/agent-execution.ts`

- `TELEMETRY_SCHEMA_VERSION` (VariableDeclaration) — `export const TELEMETRY_SCHEMA_VERSION = 6 as const;`
- `AgentTelemetryOperation` (VariableDeclaration) — `export const AgentTelemetryOperation = { AgentStep: "agent_step", ContextCompaction: "context_compaction", GoalCompletionVerification: "goal_completion_verification", GoalTitleGeneration: "goal_title_generation", ProjectMemoryExtract: "p...`
- `AgentTelemetryOperation` (TypeAliasDeclaration) — `AgentTelemetryOperation`
- `AgentTelemetryActorKind` (TypeAliasDeclaration) — `AgentTelemetryActorKind`
- `AgentTelemetryLaunchSurface` (TypeAliasDeclaration) — `AgentTelemetryLaunchSurface`
- `AgentTelemetryInputSource` (TypeAliasDeclaration) — `AgentTelemetryInputSource`
- `AgentTelemetryIdentityState` (TypeAliasDeclaration) — `AgentTelemetryIdentityState`
- `AgentTelemetryRuntimeSurface` (TypeAliasDeclaration) — `AgentTelemetryRuntimeSurface`
- `AgentTelemetryErrorCategory` (TypeAliasDeclaration) — `AgentTelemetryErrorCategory`
- `AgentTelemetryCancellationReason` (TypeAliasDeclaration) — `AgentTelemetryCancellationReason`
- `AgentTelemetryAbandonReason` (TypeAliasDeclaration) — `AgentTelemetryAbandonReason`
- `AgentTelemetryExecutionContext` (InterfaceDeclaration) — `AgentTelemetryExecutionContext`
- `AgentTelemetryCausation` (InterfaceDeclaration) — `AgentTelemetryCausation`
- `AgentTelemetryScope` (InterfaceDeclaration) — `AgentTelemetryScope`
- `AgentTurnTraceStart` (InterfaceDeclaration) — `AgentTurnTraceStart`
- `AgentStepTraceStart` (InterfaceDeclaration) — `AgentStepTraceStart`
- `ToolTraceStart` (InterfaceDeclaration) — `ToolTraceStart`
- `CommandCategory` (TypeAliasDeclaration) — `CommandCategory`
- `CommandShellKind` (TypeAliasDeclaration) — `CommandShellKind`
- `CommandTraceStart` (InterfaceDeclaration) — `CommandTraceStart`
- `CompactionTraceStart` (InterfaceDeclaration) — `CompactionTraceStart`
- `DetachedExecutionKind` (TypeAliasDeclaration) — `DetachedExecutionKind`
- `DetachedTrigger` (TypeAliasDeclaration) — `DetachedTrigger`
- `DetachedTargetKind` (TypeAliasDeclaration) — `DetachedTargetKind`
- `DetachedOperationTraceStart` (InterfaceDeclaration) — `DetachedOperationTraceStart`
- `TurnFailureStage` (TypeAliasDeclaration) — `TurnFailureStage`
- `StepFailureStage` (TypeAliasDeclaration) — `StepFailureStage`
- `ToolFailureStage` (TypeAliasDeclaration) — `ToolFailureStage`
- `CommandFailureStage` (TypeAliasDeclaration) — `CommandFailureStage`
- `CompactionFailureStage` (TypeAliasDeclaration) — `CompactionFailureStage`
- `DetachedFailureStage` (TypeAliasDeclaration) — `DetachedFailureStage`
- `AgentTurnSpanWriter` (InterfaceDeclaration) — `AgentTurnSpanWriter`
- `AgentStepSpanWriter` (InterfaceDeclaration) — `AgentStepSpanWriter`
- `ToolExecutionSpanWriter` (InterfaceDeclaration) — `ToolExecutionSpanWriter`
- `CommandExecutionSpanWriter` (InterfaceDeclaration) — `CommandExecutionSpanWriter`
- `ContextCompactionSpanWriter` (InterfaceDeclaration) — `ContextCompactionSpanWriter`
- `DetachedOperationSpanWriter` (InterfaceDeclaration) — `DetachedOperationSpanWriter`
- `AgentExecutionTelemetryPort` (InterfaceDeclaration) — `AgentExecutionTelemetryPort`

### `telemetry/index.ts`

- `./agent-execution.js` (ExportDeclaration) — `export * from "./agent-execution.js"`
- `ModelApiOperation` (VariableDeclaration) — `export const ModelApiOperation = { AgentStep: "agent_step", ContextCompaction: "context_compaction", GoalTitle: "goal_title_generation", GoalVerification: "goal_completion_verification", GitCommitMessage: "workspace_git_commit_message", ...`
- `ModelApiOperation` (TypeAliasDeclaration) — `ModelApiOperation`
- `mapModelApiOperationToAgentOperation` (FunctionDeclaration) — `export function mapModelApiOperationToAgentOperation( operation: ModelApiOperation, ): AgentTelemetryOperation`
- `ModelApiActorKind` (VariableDeclaration) — `export const ModelApiActorKind = { MainAgent: "main", Subagent: "subagent", WorkflowChild: "workflow_child", System: "system", Tool: "tool", } as const;`
- `ModelApiActorKind` (TypeAliasDeclaration) — `ModelApiActorKind`
- `ModelApiCallCause` (TypeAliasDeclaration) — `ModelApiCallCause`
- `ModelApiRuntimeSurface` (TypeAliasDeclaration) — `ModelApiRuntimeSurface`
- `ModelApiErrorPhase` (TypeAliasDeclaration) — `ModelApiErrorPhase`
- `ModelFailureExceptionKind` (VariableDeclaration) — `export const ModelFailureExceptionKind = { ApiCall: "api_call", Generic: "generic", Protocol: "protocol", ProviderBusiness: "provider_business", Transport: "transport", TypeError: "type_error", Validation: "validation", } as const;`
- `ModelFailureExceptionKind` (TypeAliasDeclaration) — `ModelFailureExceptionKind`
- `ModelReasoningCapabilityStatus` (TypeAliasDeclaration) — `ModelReasoningCapabilityStatus`
- `ModelReasoningState` (TypeAliasDeclaration) — `ModelReasoningState`
- `ModelReasoningControlType` (TypeAliasDeclaration) — `ModelReasoningControlType`
- `ModelReasoningCallHint` (InterfaceDeclaration) — `ModelReasoningCallHint`
- `ModelReasoningObservation` (InterfaceDeclaration) — `ModelReasoningObservation`
- `ModelApiCustomAttributes` (InterfaceDeclaration) — `ModelApiCustomAttributes`
- `ModelApiCallObservation` (InterfaceDeclaration) — `ModelApiCallObservation`
- `ResolvedModelApiCallObservation` (TypeAliasDeclaration) — `ResolvedModelApiCallObservation`
- `resolveModelApiCallObservation` (FunctionDeclaration) — `export function resolveModelApiCallObservation( querySource: string | undefined, observation: ModelApiCallObservation | undefined, ): Required<Pick<ModelApiCallObservation, "operation" | "actorKind" | "logicalCallId">> & ModelApiCallObservation`
- `ProviderEndpointIdentity` (InterfaceDeclaration) — `ProviderEndpointIdentity`
- `TelemetryIdentitySnapshot` (InterfaceDeclaration) — `TelemetryIdentitySnapshot`
- `TelemetryResourceContext` (InterfaceDeclaration) — `TelemetryResourceContext`
- `ModelApiOperationKind` (TypeAliasDeclaration) — `ModelApiOperationKind`
- `ModelCallFailureStage` (TypeAliasDeclaration) — `ModelCallFailureStage`
- `ModelAttemptFailureStage` (TypeAliasDeclaration) — `ModelAttemptFailureStage`
- `ModelFinishReason` (TypeAliasDeclaration) — `ModelFinishReason`
- `ResolvedModelTelemetryDescriptor` (InterfaceDeclaration) — `ResolvedModelTelemetryDescriptor`
- `ResponseModelTelemetryDescriptor` (InterfaceDeclaration) — `ResponseModelTelemetryDescriptor`
- `ModelCallTraceStart` (TypeAliasDeclaration) — `ModelCallTraceStart`
- `ModelAttemptTraceStart` (TypeAliasDeclaration) — `ModelAttemptTraceStart`
- `ModelCallSpanWriter` (InterfaceDeclaration) — `ModelCallSpanWriter`
- `ModelAttemptSpanWriter` (InterfaceDeclaration) — `ModelAttemptSpanWriter`
- `ModelExecutionTelemetryPort` (InterfaceDeclaration) — `ModelExecutionTelemetryPort`
- `AgentTelemetryRuntimeOwner` (InterfaceDeclaration) — `AgentTelemetryRuntimeOwner`
- `ModelApiCallDescriptor` (InterfaceDeclaration) — `ModelApiCallDescriptor`

### `time/local-date.ts`

- `formatLocalIsoDate` (FunctionDeclaration) — `export function formatLocalIsoDate(date: Date): string`
