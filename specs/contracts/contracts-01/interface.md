# contracts-01 接口（兼容面）

本文件只列兼容所需的模块路径、导出名、参数与返回类型；行为规格见 `behavior.md`，调用方见 `callers.md`。
纯声明文件按本文件列出的名字剔除兼容行后再算相似度门槛（工具会自动从本文件提取反引号片段与代码块里的标识符，排除语言关键字）。

## 包入口与子路径

| 子路径                            | 入口文件                    |
| --------------------------------- | --------------------------- |
| `@knorvia/contracts`              | `src/index.ts`              |
| `@knorvia/contracts/capabilities` | `src/capabilities/index.ts` |
| `@knorvia/contracts/commands`     | `src/commands/index.ts`     |
| `@knorvia/contracts/compact`      | `src/compact/index.ts`      |
| `@knorvia/contracts/config`       | `src/config/index.ts`       |
| `@knorvia/contracts/events`       | `src/events/index.ts`       |
| `@knorvia/contracts/hooks`        | `src/hooks/index.ts`        |
| `@knorvia/contracts/interfaces`   | `src/interfaces/index.ts`   |
| `@knorvia/contracts/model`        | `src/model/index.ts`        |
| `@knorvia/contracts/plugins`      | `src/plugins/index.ts`      |

`logging/logger.ts`、`network/public-egress-ip.ts`、`path/*`、`interfaces/shared.ts` 不是独立子路径，经包根入口或包内相对路径使用；它们的兼容面同样按下面的清单保留。

## 导出清单（按文件）

### `capabilities/index.ts`

- 无导出（空 barrel 或仅注释）

### `commands/index.ts`

- `CustomCommandContent` (InterfaceDeclaration) — `CustomCommandContent`
- `CustomCommandDiagnostic` (InterfaceDeclaration) — `CustomCommandDiagnostic`
- `CustomCommandDiagnosticCode` (TypeAliasDeclaration) — `"custom_command_duplicate_name" | "custom_command_invalid_frontmatter" | "custom_command_invalid_name" | "custom_command_read_failed" | "custom_command_root_not_found" | "custom_command_scan_failed" |`
- `CustomCommandDiagnosticSeverity` (TypeAliasDeclaration) — `"warning" | "error"`
- `CustomCommandDiscoverRequest` (InterfaceDeclaration) — `CustomCommandDiscoverRequest`
- `CustomCommandExpansion` (InterfaceDeclaration) — `CustomCommandExpansion`
- `CustomCommandLoadOutcome` (InterfaceDeclaration) — `CustomCommandLoadOutcome`
- `CustomCommandLoadRequest` (InterfaceDeclaration) — `CustomCommandLoadRequest`
- `CustomCommandMetadata` (InterfaceDeclaration) — `CustomCommandMetadata`
- `CustomCommandOperationOptions` (InterfaceDeclaration) — `CustomCommandOperationOptions`
- `CustomCommandPort` (InterfaceDeclaration) — `CustomCommandPort`
- `CustomCommandRoot` (InterfaceDeclaration) — `CustomCommandRoot`
- `CustomCommandScope` (TypeAliasDeclaration) — `"project" | "user" | "system" | "admin"`
- `CustomCommandSource` (TypeAliasDeclaration) — `"agents" | "knorvia" | "plugin"`
- `CustomCommandTemplateExpansion` (InterfaceDeclaration) — `CustomCommandTemplateExpansion`
- `detectUnsupportedDynamicSyntax` (FunctionDeclaration) — `export function detectUnsupportedDynamicSyntax(content: string): "shell" | undefined { if (INLINE_SHELL_PATTERN.test(content) || FENCED_SHELL_PATTERN.test(content)) { return "shell"; } return undefine`
- `expandCustomCommandPrompt` (FunctionDeclaration) — `export function expandCustomCommandPrompt(input: { args: string; command: CustomCommandContent; }): CustomCommandExpansion { const expanded = expandCustomCommandTemplate(input); const dynamicSyntax = `
- `expandCustomCommandTemplate` (FunctionDeclaration) — `export function expandCustomCommandTemplate(input: { args: string; command: CustomCommandContent; }): CustomCommandTemplateExpansion { const args = input.args.trim(); const positional = splitCustomCom`
- `formatCustomCommandPrompt` (FunctionDeclaration) — `export function formatCustomCommandPrompt(input: { argumentCount: number; body: string; command: CustomCommandContent; usedArgumentsPlaceholder: boolean; }): CustomCommandExpansion { return { argument`
- `splitCustomCommandArguments` (FunctionDeclaration) — `export function splitCustomCommandArguments(input: string): string[] { const args: string[] = []; let current = ""; let quote: "'" | '"' | null = null; let escaping = false; for (const char of input) `

### `compact/index.ts`

- `annotateBoundaryWithPreservedSegment` (FunctionDeclaration) — `export function annotateBoundaryWithPreservedSegment<T extends CompactContextItem>( boundary: T, preservedSegment: CompactPreservedSegment, ): T { if (!boundary.compactBoundary) { throw new Error("Can`
- `buildPostCompactItems` (FunctionDeclaration) — `export function buildPostCompactItems<T>(postContext: CompactPostContext<T>): T[] { return [ postContext.boundaryMarker, ...postContext.summaryMessages, ...(postContext.messagesToKeep ?? []), ...(post`
- `CompactBoundaryPayload` (TypeAliasDeclaration) — `Omit<{ boundaryId: string; trigger: "manual" | "auto" | "partial" | "reactive" | "session_memory"; preCompactTokenCount: number; summarizedMessageCount: number; summaryMessageIds: string[]; traceId: s`
- `compactBoundaryPayloadSchema` (VariableDeclaration) — `z.ZodObject<{ boundaryId: z.ZodString; trigger: z.ZodEnum<["manual", "auto", "partial", "reactive", "session_memory"]>; phase: z.ZodOptional<z.ZodEnum<["standalone_turn", "pre_request", "mid_turn", "r`
- `CompactContextItem` (InterfaceDeclaration) — `CompactContextItem`
- `CompactFailureReason` (VariableDeclaration | TypeAliasDeclaration) — `{ readonly NotEnoughMessages: "not_enough_messages"; readonly PromptTooLong: "prompt_too_long"; readonly NoSummary: "no_summary"; readonly ApiError: "api_error"; readonly Cancelled: "cancelled"; reado`
- `CompactPhase` (VariableDeclaration | TypeAliasDeclaration) — `{ readonly StandaloneTurn: "standalone_turn"; readonly PreRequest: "pre_request"; readonly MidTurn: "mid_turn"; readonly Reactive: "reactive"; }`
- `CompactPostContext` (InterfaceDeclaration) — `CompactPostContext<T>`
- `CompactPreservedSegment` (TypeAliasDeclaration) — `{ headMessageId: MessageId; anchorMessageId: MessageId; tailMessageId: MessageId; }`
- `compactPreservedSegmentSchema` (VariableDeclaration) — `z.ZodObject<{ headMessageId: z.ZodString; anchorMessageId: z.ZodString; tailMessageId: z.ZodString; }, "strict", z.ZodTypeAny, { headMessageId: string; anchorMessageId: string; tailMessageId: string; `
- `CompactProjectionInfo` (InterfaceDeclaration) — `CompactProjectionInfo`
- `CompactReason` (VariableDeclaration | TypeAliasDeclaration) — `{ readonly UserRequested: "user_requested"; readonly ContextLimit: "context_limit"; readonly ModelDownshift: "model_downshift"; readonly ProviderOverflow: "provider_overflow"; }`
- `CompactStatus` (VariableDeclaration | TypeAliasDeclaration) — `{ readonly Started: "started"; readonly BoundaryCreated: "boundary_created"; readonly SummaryCreated: "summary_created"; readonly Completed: "completed"; readonly Failed: "failed"; }`
- `CompactSummaryPayload` (InterfaceDeclaration) — `CompactSummaryPayload`
- `CompactTimelineDisplay` (VariableDeclaration | TypeAliasDeclaration) — `{ readonly Separator: "separator"; }`
- `CompactTimelinePayload` (TypeAliasDeclaration) — `Omit<{ trigger: "manual" | "auto" | "partial" | "reactive" | "session_memory"; status: "started" | "completed" | "failed" | "retrying" | "skipped" | "interrupted"; operationId: string; messageId: stri`
- `compactTimelinePayloadSchema` (VariableDeclaration) — `z.ZodEffects<z.ZodObject<{ operationId: z.ZodString; messageId: z.ZodString; partId: z.ZodOptional<z.ZodString>; status: z.ZodEnum<["started", "retrying", "skipped", "completed", "failed", "interrupte`
- `CompactTimelineStatus` (VariableDeclaration | TypeAliasDeclaration) — `{ readonly Started: "started"; readonly Retrying: "retrying"; readonly Skipped: "skipped"; readonly Completed: "completed"; readonly Failed: "failed"; readonly Interrupted: "interrupted"; }`
- `CompactTrigger` (VariableDeclaration | TypeAliasDeclaration) — `{ readonly Manual: "manual"; readonly Auto: "auto"; readonly Partial: "partial"; readonly Reactive: "reactive"; readonly SessionMemory: "session_memory"; }`
- `getItemsAfterLastCompactBoundary` (FunctionDeclaration) — `export function getItemsAfterLastCompactBoundary<T>( items: readonly T[], isBoundary: (item: T) => boolean = (item) => isCompactBoundaryItem(item), ): T[] { const boundaryIndex = items.findLastIndex(i`
- `isCompactBoundaryItem` (FunctionDeclaration) — `export function isCompactBoundaryItem(item: unknown): item is CompactContextItem & { compactBoundary: CompactBoundaryPayload; } { if (typeof item !== "object" || item === null || !("compactBoundary" i`
- `MicrocompactBoundaryPayload` (TypeAliasDeclaration) — `Omit<{ trigger: "time_based" | "token_pressure"; traceId: string; strategy: "local_tool_result_clear"; preMicrocompactTokenCount: number; postMicrocompactTokenCount: number; tokensSaved: number; clear`
- `microcompactBoundaryPayloadSchema` (VariableDeclaration) — `z.ZodObject<{ trigger: z.ZodEnum<["time_based", "token_pressure"]>; strategy: z.ZodEnum<["local_tool_result_clear"]>; preMicrocompactTokenCount: z.ZodNumber; postMicrocompactTokenCount: z.ZodNumber; t`
- `MicrocompactStrategy` (VariableDeclaration | TypeAliasDeclaration) — `{ readonly LocalToolResultClear: "local_tool_result_clear"; }`
- `MicrocompactTrigger` (VariableDeclaration | TypeAliasDeclaration) — `{ readonly TimeBased: "time_based"; readonly TokenPressure: "token_pressure"; }`
- `parseCompactBoundaryPayload` (FunctionDeclaration) — `export function parseCompactBoundaryPayload(input: unknown): CompactBoundaryPayload { return compactBoundaryPayloadSchema.parse(input) as CompactBoundaryPayload; }`
- `parseCompactTimelinePayload` (FunctionDeclaration) — `export function parseCompactTimelinePayload(input: unknown): CompactTimelinePayload { return compactTimelinePayloadSchema.parse(input) as CompactTimelinePayload; }`
- `parseMicrocompactBoundaryPayload` (FunctionDeclaration) — `export function parseMicrocompactBoundaryPayload(input: unknown): MicrocompactBoundaryPayload { return microcompactBoundaryPayloadSchema.parse(input) as MicrocompactBoundaryPayload; }`

### `config/index.ts`

- `ConfigKey` (VariableDeclaration | TypeAliasDeclaration) — `{ readonly ModelStreamIdleTimeout: "modelStream.idleTimeoutMs"; readonly PermissionMode: "permission.mode"; readonly PermissionAllowedTools: "permission.allowedTools"; readonly PermissionDisallowedToo`
- `ConfigObserver` (InterfaceDeclaration) — `ConfigObserver`
- `ConfigPort` (InterfaceDeclaration) — `ConfigPort`
- `ConfigScope` (VariableDeclaration | TypeAliasDeclaration) — `{ readonly System: "system"; readonly User: "user"; readonly Project: "project"; readonly Session: "session"; readonly Env: "env"; readonly Cli: "cli"; }`
- `ConfigScopePriority` (VariableDeclaration) — `Record<ConfigScope, number>`
- `ConfigSource` (InterfaceDeclaration) — `ConfigSource`
- `ConfigValue` (TypeAliasDeclaration) — `K extends "modelStream.idleTimeoutMs" ? number : K extends "permission.mode" ? CollaborationMode : K extends "permission.allowedTools" | "permission.disallowedTools" ? string[] : K extends "permission`
- `DEFAULT_MODEL_STREAM_IDLE_TIMEOUT_MS` (VariableDeclaration) — `600000`
- `DefaultRuntimeConfig` (VariableDeclaration) — `RuntimeConfig`
- `ModelAnomalyGuardConfig` (InterfaceDeclaration) — `ModelAnomalyGuardConfig`
- `ModelStreamConfig` (InterfaceDeclaration) — `ModelStreamConfig`
- `RuntimeConfig` (InterfaceDeclaration) — `RuntimeConfig`
- `RuntimeConfigPatch` (InterfaceDeclaration) — `RuntimeConfigPatch`
- `SkillCommandOverride` (InterfaceDeclaration) — `SkillCommandOverride`
- `SupportedLocale` (TypeAliasDeclaration) — `"en-US" | "zh-CN"`
- `ToolConcurrencyConfig` (InterfaceDeclaration) — `ToolConcurrencyConfig`
- `UiLocale` (TypeAliasDeclaration) — `"auto" | SupportedLocale`
- `UiThemeMode` (TypeAliasDeclaration) — `"dark" | "light"`
- `UiThemePreference` (TypeAliasDeclaration) — `"auto" | UiThemeMode`
- `Unsubscribe` (InterfaceDeclaration) — `Unsubscribe`

### `events/event-reducer-helpers.ts`

- `applyBackgroundTaskCompleted` (FunctionDeclaration) — `export function applyBackgroundTaskCompleted( projection: SessionProjection, payload: BackgroundTaskCompletedPayload, timestamp: Date, ): SessionProjection { return commitSessionProjection( projection`
- `applyBackgroundTaskStarted` (FunctionDeclaration) — `export function applyBackgroundTaskStarted( projection: SessionProjection, payload: BackgroundTaskStartedPayload, timestamp: Date, ): SessionProjection { return commitSessionProjection( projection, ba`
- `applyBackgroundTaskUpdated` (FunctionDeclaration) — `export function applyBackgroundTaskUpdated( projection: SessionProjection, payload: BackgroundTaskUpdatedPayload, timestamp: Date, ): SessionProjection { return commitSessionProjection( projection, ba`
- `applyCompactBoundary` (FunctionDeclaration) — `export function applyCompactBoundary( projection: SessionProjection, payload: unknown, timestamp: Date, ): SessionProjection { return commitSessionProjection( projection, compactProjectionChanges(proj`
- `applyStreamingToolLedgerUpdate` (FunctionDeclaration) — `export function applyStreamingToolLedgerUpdate( projection: SessionProjection, payload: StreamingToolLedgerPayload, timestamp: Date, ): SessionProjection { return commitSessionProjection( projection, `
- `applyStreamRecoveryAnchorCreated` (FunctionDeclaration) — `export function applyStreamRecoveryAnchorCreated( projection: SessionProjection, payload: StreamRecoveryAnchorPayload, timestamp: Date, ): SessionProjection { return commitSessionProjection(projection`
- `initialSessionProjection` (VariableDeclaration) — `{ createdAt: Date; updatedAt: Date; mode: CollaborationMode; status: SessionStatus; turnCount: number; totalTokenCount: number; contextUsed: number; contextWindow: number; pendingPermissions: PendingP`
- `positiveInteger` (FunctionDeclaration) — `export function positiveInteger(value: unknown): number | undefined { if (typeof value !== "number" || !Number.isFinite(value)) { return undefined; } const integer = Math.trunc(value); return integer `

### `events/event-reducer.ts`

- `apply` (FunctionDeclaration) — `export function apply(projection: SessionProjection, event: SessionEvent): SessionProjection { return new EventReducer().apply(projection, event); }`
- `EventReducer` (ClassDeclaration) — `EventReducer`
- `reduce` (FunctionDeclaration) — `export function reduce(events: SessionEvent[]): SessionProjection { return new EventReducer().reduce(events); }`

### `events/in-memory-session-event-store.ts`

- `createInMemorySessionEventStore` (FunctionDeclaration) — `export function createInMemorySessionEventStore( options?: InMemorySessionEventStoreOptions, ): InMemorySessionEventStore { return new InMemorySessionEventStore(options); }`
- `InMemorySessionEventStore` (ClassDeclaration) — `InMemorySessionEventStore`
- `InMemorySessionEventStoreOptions` (InterfaceDeclaration) — `InMemorySessionEventStoreOptions`

### `events/index.ts`

- `apply` (FunctionDeclaration) — `export function apply(projection: SessionProjection, event: SessionEvent): SessionProjection { return new EventReducer().apply(projection, event); }`
- `AssistantFeedbackUpdatedPayload` (InterfaceDeclaration) — `AssistantFeedbackUpdatedPayload`
- `AssistantMessagePayload` (InterfaceDeclaration) — `AssistantMessagePayload`
- `Attachment` (InterfaceDeclaration) — `Attachment`
- `BackgroundResultOriginMeta` (InterfaceDeclaration) — `BackgroundResultOriginMeta`
- `BackgroundTaskCompletedPayload` (TypeAliasDeclaration) — `BackgroundTaskPayloadBase & { status: Exclude<BackgroundTaskStatus, "running">; }`
- `BackgroundTaskPayloadBase` (InterfaceDeclaration) — `BackgroundTaskPayloadBase`
- `BackgroundTaskStartedPayload` (TypeAliasDeclaration) — `BackgroundTaskPayloadBase & { status: "running"; }`
- `BackgroundTaskStatus` (TypeAliasDeclaration) — `"cancelled" | "completed" | "failed" | "running" | "timed_out" | "spawn_error" | "lost"`
- `BackgroundTaskUpdatedPayload` (TypeAliasDeclaration) — `BackgroundTaskPayloadBase`
- `boundWorkflowLaunchMeta` (FunctionDeclaration) — `export function boundWorkflowLaunchMeta(input: WorkflowLaunchMeta): WorkflowLaunchMeta { const bounded: WorkflowLaunchMeta = { runId: input.runId, toolCallId: input.toolCallId, ...(input.name === unde`
- `CollaborationMode` (TypeAliasDeclaration) — `"auto" | "plan" | "build" | "edit" | "yolo"`
- `CompactLifecyclePayload` (TypeAliasDeclaration) — `Omit<{ trigger: "manual" | "auto" | "partial" | "reactive" | "session_memory"; status: "started" | "completed" | "failed" | "retrying" | "skipped" | "interrupted"; operationId: string; messageId: stri`
- `ContextUsageBreakdownItem` (InterfaceDeclaration) — `ContextUsageBreakdownItem`
- `ContextUsageBreakdownSource` (TypeAliasDeclaration) — `"system_prompt" | "meta_user_context" | "skills" | "tool_prompt" | "system_tool_schemas" | "mcp_tool_schemas" | "messages"`
- `createInMemorySessionEventStore` (FunctionDeclaration) — `export function createInMemorySessionEventStore( options?: InMemorySessionEventStoreOptions, ): InMemorySessionEventStore { return new InMemorySessionEventStore(options); }`
- `createModelUsageSummaryFromEvents` (FunctionDeclaration) — `export function createModelUsageSummaryFromEvents( events: readonly SessionEvent[], ): ModelUsageSummary | undefined { const usages: ModelUsage[] = []; for (const event of events) { if (event.type !==`
- `createSessionEvent` (FunctionDeclaration) — `export function createSessionEvent<T>( type: SessionEventType, sessionId: SessionId, payload: T, options?: { turnId?: TurnId; traceId?: TraceId; sequenceNumber?: number; }, ): SessionEvent { return { `
- `createSessionEventRetentionPolicy` (FunctionDeclaration) — `export function createSessionEventRetentionPolicy( mode: SessionEventRetentionMode, ): SessionEventRetentionPolicy { if (mode === "unbounded") { return { onAppend: () => NO_EVICTION, collectExpired: (`
- `DynamicWorkflowRunProgressPayload` (InterfaceDeclaration) — `DynamicWorkflowRunProgressPayload`
- `ErrorAttribution` (InterfaceDeclaration) — `ErrorAttribution`
- `ErrorPayload` (InterfaceDeclaration) — `ErrorPayload`
- `EventReducer` (ClassDeclaration) — `EventReducer`
- `FollowupModeChangedPayload` (InterfaceDeclaration) — `FollowupModeChangedPayload`
- `InMemorySessionEventStore` (ClassDeclaration) — `InMemorySessionEventStore`
- `InMemorySessionEventStoreOptions` (InterfaceDeclaration) — `InMemorySessionEventStoreOptions`
- `isTransientSessionEvent` (FunctionDeclaration) — `export function isTransientSessionEvent(event: Pick<SessionEvent, "type">): boolean { return TRANSIENT_SESSION_EVENT_TYPES.has(event.type); }`
- `MicrocompactBoundaryEventPayload` (TypeAliasDeclaration) — `Omit<{ trigger: "time_based" | "token_pressure"; traceId: string; strategy: "local_tool_result_clear"; preMicrocompactTokenCount: number; postMicrocompactTokenCount: number; tokensSaved: number; clear`
- `ModelAnomalyWarningCategory` (TypeAliasDeclaration) — `"tool_call_budget" | "repeated_tool_call" | "provider_finish_mismatch" | "malformed_tool_call"`
- `ModelAnomalyWarningPayload` (InterfaceDeclaration) — `ModelAnomalyWarningPayload`
- `ModelAnomalyWarningSeverity` (TypeAliasDeclaration) — `"warning" | "info"`
- `ModelCompletePayload` (InterfaceDeclaration) — `ModelCompletePayload`
- `ModelErrorPayload` (InterfaceDeclaration) — `ModelErrorPayload`
- `ModelMessage` (InterfaceDeclaration) — `ModelMessage`
- `ModelNetworkStatusPayload` (TypeAliasDeclaration) — `import("../model/index.js").ModelRequestQueuedStatusEvent | import("../model/index.js").ModelRequestAdmittedStatusEvent | import("../model/index.js").ModelRequestStartedStatusEvent | import("../model/`
- `ModelRequestPayload` (InterfaceDeclaration) — `ModelRequestPayload`
- `ModelSelectedPayload` (InterfaceDeclaration) — `ModelSelectedPayload`
- `ModelSelectionOrigin` (TypeAliasDeclaration) — `"registryFallback"`
- `ModelStreamingKind` (TypeAliasDeclaration) — `"error" | "start" | "text_start" | "text_delta" | "text_end" | "reasoning_start" | "reasoning_delta" | "reasoning_end" | "tool_input_start" | "tool_input_delta" | "tool_input_end" | "tool_call" | "fin`
- `ModelStreamingPayload` (InterfaceDeclaration) — `ModelStreamingPayload`
- `NetworkRequestLifecycleStatus` (TypeAliasDeclaration) — `"error" | "pending" | "complete"`
- `NetworkRequestSource` (TypeAliasDeclaration) — `"plugin" | "unknown" | "model" | "http_client" | "tool" | "mcp"`
- `NetworkRequestStatusPayload` (InterfaceDeclaration) — `NetworkRequestStatusPayload`
- `OffPeakRunType` (TypeAliasDeclaration) — `"init" | "resume"`
- `PermissionDecision` (TypeAliasDeclaration) — `"allow" | "deny" | "escalate" | "modify"`
- `PermissionDeniedPayload` (InterfaceDeclaration) — `PermissionDeniedPayload`
- `PermissionRequestedPayload` (InterfaceDeclaration) — `PermissionRequestedPayload`
- `PermissionResolvedPayload` (InterfaceDeclaration) — `PermissionResolvedPayload`
- `QueueAutoDrainChangedPayload` (InterfaceDeclaration) — `QueueAutoDrainChangedPayload`
- `reduce` (FunctionDeclaration) — `export function reduce(events: SessionEvent[]): SessionProjection { return new EventReducer().reduce(events); }`
- `RiskLevel` (TypeAliasDeclaration) — `"low" | "medium" | "high" | "critical"`
- `SEALED_TURN_TRANSIENT_GRACE_MS` (VariableDeclaration) — `120000`
- `SessionCompactedPayload` (InterfaceDeclaration) — `SessionCompactedPayload`
- `SessionCreatedPayload` (InterfaceDeclaration) — `SessionCreatedPayload`
- `SessionEvent` (InterfaceDeclaration) — `SessionEvent`
- `SessionEventPayload` (TypeAliasDeclaration) — `CompactBoundaryPayload | CompactTimelinePayload | MicrocompactBoundaryPayload | AssistantMessagePayload | BackgroundTaskPayloadBase | BackgroundTaskCompletedPayload | BackgroundTaskStartedPayload | Dy`
- `SessionEventRetentionMode` (TypeAliasDeclaration) — `"unbounded" | "turn-window"`
- `SessionEventRetentionPolicy` (InterfaceDeclaration) — `SessionEventRetentionPolicy`
- `SessionEventType` (VariableDeclaration | TypeAliasDeclaration) — `{ readonly SessionCreated: "session_created"; readonly SessionResumed: "session_resumed"; readonly SessionForked: "session_forked"; readonly SessionCompacted: "session_compacted"; readonly SessionTitl`
- `SessionForkedPayload` (InterfaceDeclaration) — `SessionForkedPayload`
- `SessionInputPromotedPayload` (InterfaceDeclaration) — `SessionInputPromotedPayload`
- `SessionModeChangedPayload` (InterfaceDeclaration) — `SessionModeChangedPayload`
- `SessionResumedPayload` (InterfaceDeclaration) — `SessionResumedPayload`
- `SessionTitleUpdatedPayload` (InterfaceDeclaration) — `SessionTitleUpdatedPayload`
- `STREAM_RECOVERY_DISCARDED_ERROR_NAME` (VariableDeclaration) — `"StreamRecoveryDiscarded"`
- `STREAM_RECOVERY_DISCARDED_FINISH` (VariableDeclaration) — `"stream_recovery_discarded"`
- `StreamingToolExecutionTiming` (TypeAliasDeclaration) — `"end_of_stream" | "during_stream"`
- `StreamingToolLedgerPayload` (InterfaceDeclaration) — `StreamingToolLedgerPayload`
- `StreamingToolLedgerProjectionInfo` (InterfaceDeclaration) — `StreamingToolLedgerProjectionInfo`
- `StreamingToolLedgerStatus` (TypeAliasDeclaration) — `"tool_input_streaming" | "tool_call_closed" | "tool_queued" | "tool_started" | "tool_result_committed" | "tool_cancelled" | "tool_abandoned" | "recovery_blocked"`
- `StreamRecoveryAnchorKind` (TypeAliasDeclaration) — `"assistant_message" | "tool_cancelled" | "tool_result" | "tool_error"`
- `StreamRecoveryAnchorPayload` (InterfaceDeclaration) — `StreamRecoveryAnchorPayload`
- `StreamRecoveryAnchorProjectionInfo` (InterfaceDeclaration) — `StreamRecoveryAnchorProjectionInfo`
- `StreamRecoveryAnchorSelectedPayload` (InterfaceDeclaration) — `StreamRecoveryAnchorSelectedPayload`
- `StreamRecoveryBlockedPayload` (InterfaceDeclaration) — `StreamRecoveryBlockedPayload`
- `StreamRecoveryFailureKind` (TypeAliasDeclaration) — `"unknown" | "provider_timeout" | "provider_network_error" | "provider_stream_error" | "provider_turn_failed"`
- `StreamRecoveryRetryStartedPayload` (InterfaceDeclaration) — `StreamRecoveryRetryStartedPayload`
- `StreamRecoveryStartedPayload` (InterfaceDeclaration) — `StreamRecoveryStartedPayload`
- `StreamRecoveryTailDiscardedPayload` (InterfaceDeclaration) — `StreamRecoveryTailDiscardedPayload`
- `SystemMessagePayload` (InterfaceDeclaration) — `SystemMessagePayload`
- `TargetChangedAction` (TypeAliasDeclaration) — `"set" | "status_updated" | "cleared" | "usage_accounted" | "run_started" | "run_finished" | "summary_updated"`
- `TargetChangedPayload` (InterfaceDeclaration) — `TargetChangedPayload`
- `TargetChangedSource` (TypeAliasDeclaration) — `"command" | "tool" | "runtime"`
- `TargetCompletionVerificationPayload` (InterfaceDeclaration) — `TargetCompletionVerificationPayload`
- `TargetCompletionVerificationStatus` (TypeAliasDeclaration) — `"cancelled" | "started" | "completed" | "failed_closed"`
- `TokenUsage` (InterfaceDeclaration) — `TokenUsage`
- `ToolBatchCompletePayload` (InterfaceDeclaration) — `ToolBatchCompletePayload`
- `ToolCall` (InterfaceDeclaration) — `ModelToolCall`
- `ToolCallErrorPayload` (InterfaceDeclaration) — `ToolCallErrorPayload`
- `ToolCallPayload` (InterfaceDeclaration) — `ToolCallPayload`
- `ToolCallProgressPayload` (InterfaceDeclaration) — `ToolCallProgressPayload`
- `ToolCallResultPayload` (InterfaceDeclaration) — `ToolCallResultPayload`
- `ToolCallScheduledPayload` (InterfaceDeclaration) — `ToolCallScheduledPayload`
- `ToolCallStartedPayload` (InterfaceDeclaration) — `ToolCallStartedPayload`
- `ToolResultPayload` (InterfaceDeclaration) — `ToolResultPayload`
- `ToolSchedulePayload` (InterfaceDeclaration) — `ToolSchedulePayload`
- `TRANSIENT_SESSION_EVENT_TYPES` (VariableDeclaration) — `ReadonlySet<SessionEventType>`
- `TurnAttachmentMeta` (InterfaceDeclaration) — `TurnAttachmentMeta`
- `TurnBackgroundAttribution` (TypeAliasDeclaration) — `{ automationId: string; offPeakTaskId?: never; offPeakRunType?: never; } | { offPeakTaskId: string; offPeakRunType?: OffPeakRunType; automationId?: never; } | { automationId?: undefined; offPeakTaskId`
- `TurnCompletePayload` (InterfaceDeclaration) — `TurnCompletePayload`
- `TurnErrorPayload` (InterfaceDeclaration) — `TurnErrorPayload`
- `TurnExecutionKind` (TypeAliasDeclaration) — `"agent" | "controlOnly"`
- `TurnFileChangeSummary` (InterfaceDeclaration) — `TurnFileChangeSummary`
- `TurnFileChangeSummaryItem` (InterfaceDeclaration) — `TurnFileChangeSummaryItem`
- `TurnInputReceivedPayload` (InterfaceDeclaration) — `TurnInputReceivedPayload`
- `TurnResultType` (TypeAliasDeclaration) — `"cancelled" | "success" | "error_max_turns" | "error_max_budget" | "error_during_execution" | "error_max_tool_calls"`
- `TurnStartedPayload` (TypeAliasDeclaration) — `TurnStartedPayloadBase & TurnBackgroundAttribution`
- `TurnStartedPayloadBase` (InterfaceDeclaration) — `TurnStartedPayloadBase`
- `TurnSteerDeliveryChangedPayload` (InterfaceDeclaration) — `TurnSteerDeliveryChangedPayload`
- `TurnSteerDiscardedPayload` (InterfaceDeclaration) — `TurnSteerDiscardedPayload`
- `TurnSteerDispatchChangedPayload` (InterfaceDeclaration) — `TurnSteerDispatchChangedPayload`
- `TurnSteerDrainedPayload` (InterfaceDeclaration) — `TurnSteerDrainedPayload`
- `TurnSteerQueuedPayload` (InterfaceDeclaration) — `TurnSteerQueuedPayload`
- `TurnSteerRejectedPayload` (InterfaceDeclaration) — `TurnSteerRejectedPayload`
- `TurnSteerReorderedPayload` (InterfaceDeclaration) — `TurnSteerReorderedPayload`
- `UserInputAutoResolutionState` (TypeAliasDeclaration) — `{ state: "hiddenGrace" | "visibleCountdown"; startedAt: number; visibleAt: number; deadlineAt: number; } | { state: "snoozed"; startedAt: number; snoozedAt: number; }`
- `UserInputAutoResolutionUpdatedPayload` (InterfaceDeclaration) — `UserInputAutoResolutionUpdatedPayload`
- `UserMessagePayload` (InterfaceDeclaration) — `UserMessagePayload`
- `WORKFLOW_LAUNCH_ARGS_MAX_BYTES` (VariableDeclaration) — `4096`
- `WORKFLOW_LAUNCH_ARGS_TRUNCATED_KEY` (VariableDeclaration) — `"…"`
- `WORKFLOW_LAUNCH_DESCRIPTION_MAX_CHARS` (VariableDeclaration) — `500`
- `WORKFLOW_LAUNCH_SCRIPT_MAX_CHARS` (VariableDeclaration) — `256000`
- `WorkflowLaunchDisplay` (TypeAliasDeclaration) — `{ kind: "create_workflow"; ok: boolean; errorCount: number; diagnostics: { code: number; message: string; line: number; column: number; }[]; truncated?: boolean | undefined; causalityGraph?: { lanes: `
- `WorkflowLaunchMeta` (InterfaceDeclaration) — `WorkflowLaunchMeta`
- `WorkflowNotificationMeta` (TypeAliasDeclaration) — `{ kind: "terminal"; status: "completed" | "errored" | "stopped"; stopReason?: "user" | "model" | "provider" | "interrupted" | "superseded"; summary: string; result?: string; resultForm?: "prose" | "js`
- `WorkflowSettingsAmendMeta` (InterfaceDeclaration) — `WorkflowSettingsAmendMeta`
- `WorkspaceHookAdmissionUpdatedPayload` (InterfaceDeclaration) — `WorkspaceHookAdmissionUpdatedPayload`
- `WorkspaceHookReviewRequestedPayload` (InterfaceDeclaration) — `WorkspaceHookReviewRequestedPayload`
- `WorkspaceHookReviewSettledPayload` (InterfaceDeclaration) — `WorkspaceHookReviewSettledPayload`
- `WorkspaceHookReviewSupersededPayload` (InterfaceDeclaration) — `WorkspaceHookReviewSupersededPayload`

### `events/session-event-journal.ts`

- `SessionEventJournal` (ClassDeclaration) — `SessionEventJournal`

### `events/session-event-retention.ts`

- `createSessionEventRetentionPolicy` (FunctionDeclaration) — `export function createSessionEventRetentionPolicy( mode: SessionEventRetentionMode, ): SessionEventRetentionPolicy { if (mode === "unbounded") { return { onAppend: () => NO_EVICTION, collectExpired: (`
- `isTransientSessionEvent` (FunctionDeclaration) — `export function isTransientSessionEvent(event: Pick<SessionEvent, "type">): boolean { return TRANSIENT_SESSION_EVENT_TYPES.has(event.type); }`
- `SEALED_TURN_TRANSIENT_GRACE_MS` (VariableDeclaration) — `120000`
- `SessionEventRetentionMode` (TypeAliasDeclaration) — `"unbounded" | "turn-window"`
- `SessionEventRetentionPolicy` (InterfaceDeclaration) — `SessionEventRetentionPolicy`
- `TRANSIENT_SESSION_EVENT_TYPES` (VariableDeclaration) — `ReadonlySet<SessionEventType>`

### `events/session-projection-ledgers.ts`

- `appendProjectionRow` (FunctionDeclaration) — `export function appendProjectionRow<Row>(rows: Row[], row: Row): Row[] { const next = [...rows]; next.push(row); return next; }`
- `backgroundCompletedChanges` (FunctionDeclaration) — `export function backgroundCompletedChanges( projection: SessionProjection, payload: BackgroundTaskCompletedPayload, timestamp: Date, ): SessionProjectionChanges { const next = backgroundSnapshot(paylo`
- `backgroundStartedChanges` (FunctionDeclaration) — `export function backgroundStartedChanges( projection: SessionProjection, payload: BackgroundTaskStartedPayload, timestamp: Date, ): SessionProjectionChanges { const next = backgroundSnapshot(payload, `
- `backgroundUpdatedChanges` (FunctionDeclaration) — `export function backgroundUpdatedChanges( projection: SessionProjection, payload: BackgroundTaskUpdatedPayload, ): SessionProjectionChanges { return { backgroundTasks: projection.backgroundTasks.map((`
- `commitSessionProjection` (FunctionDeclaration) — `export function commitSessionProjection( projection: SessionProjection, changes: SessionProjectionChanges, timestamp: Date, ): SessionProjection { return { ...projection, ...changes, updatedAt: timest`
- `compactProjectionChanges` (FunctionDeclaration) — `export function compactProjectionChanges( projection: SessionProjection, payload: unknown, timestamp: Date, ): SessionProjectionChanges { const boundary = parseCompactBoundaryPayload(payload); return `
- `recoveryAnchorChanges` (FunctionDeclaration) — `export function recoveryAnchorChanges( payload: StreamRecoveryAnchorPayload, timestamp: Date, ): SessionProjectionChanges { return { lastStreamRecoveryAnchor: { ...payload, updatedAt: timestamp } }; }`
- `SessionProjectionChanges` (TypeAliasDeclaration) — `{ id?: import("../index.js").SessionId | undefined; createdAt?: Date | undefined; updatedAt?: Date | undefined; mode?: import("./session.events.js").CollaborationMode | undefined; planEnabled?: boolea`
- `streamingLedgerChanges` (FunctionDeclaration) — `export function streamingLedgerChanges( projection: SessionProjection, payload: StreamingToolLedgerPayload, timestamp: Date, ): SessionProjectionChanges { const next = { ...payload, updatedAt: timesta`

### `events/session-projection-queue.ts`

- `queueAdmissionChanges` (FunctionDeclaration) — `export function queueAdmissionChanges( projection: SessionProjection, event: SessionEvent, ): SessionProjectionChanges { const payload = event.payload as TurnSteerQueuedPayload; const index = projecti`
- `queueDeliveryChanges` (FunctionDeclaration) — `export function queueDeliveryChanges( projection: SessionProjection, payload: TurnSteerDeliveryChangedPayload, ): SessionProjectionChanges { return { pendingSteerInputs: projection.pendingSteerInputs.`
- `queueOrderChanges` (FunctionDeclaration) — `export function queueOrderChanges( projection: SessionProjection, payload: TurnSteerReorderedPayload, ): SessionProjectionChanges { const rows = projection.pendingSteerInputs; const latestById = new M`
- `queueRemovalChanges` (FunctionDeclaration) — `export function queueRemovalChanges( projection: SessionProjection, pendingInputIds: readonly string[], ): SessionProjectionChanges { return { pendingSteerInputs: projection.pendingSteerInputs.filter(`
- `sessionModeChanges` (FunctionDeclaration) — `export function sessionModeChanges( projection: SessionProjection, payload: SessionModeChangedPayload, ): SessionProjectionChanges { const changes: SessionProjectionChanges = { mode: payload.mode, pla`

### `events/session-projection-transition.ts`

- `applySessionProjectionEvent` (FunctionDeclaration) — `export function applySessionProjectionEvent( projection: SessionProjection, event: SessionEvent, ): SessionProjection { return commitSessionProjection(projection, changesForEvent(projection, event), e`

### `events/session.events.ts`

- `AssistantFeedbackUpdatedPayload` (InterfaceDeclaration) — `AssistantFeedbackUpdatedPayload`
- `AssistantMessagePayload` (InterfaceDeclaration) — `AssistantMessagePayload`
- `Attachment` (InterfaceDeclaration) — `Attachment`
- `BackgroundResultOriginMeta` (InterfaceDeclaration) — `BackgroundResultOriginMeta`
- `BackgroundTaskCompletedPayload` (TypeAliasDeclaration) — `BackgroundTaskPayloadBase & { status: Exclude<BackgroundTaskStatus, "running">; }`
- `BackgroundTaskPayloadBase` (InterfaceDeclaration) — `BackgroundTaskPayloadBase`
- `BackgroundTaskStartedPayload` (TypeAliasDeclaration) — `BackgroundTaskPayloadBase & { status: "running"; }`
- `BackgroundTaskStatus` (TypeAliasDeclaration) — `"cancelled" | "completed" | "failed" | "running" | "timed_out" | "spawn_error" | "lost"`
- `BackgroundTaskUpdatedPayload` (TypeAliasDeclaration) — `BackgroundTaskPayloadBase`
- `boundWorkflowLaunchMeta` (FunctionDeclaration) — `export function boundWorkflowLaunchMeta(input: WorkflowLaunchMeta): WorkflowLaunchMeta { const bounded: WorkflowLaunchMeta = { runId: input.runId, toolCallId: input.toolCallId, ...(input.name === unde`
- `CollaborationMode` (TypeAliasDeclaration) — `"auto" | "plan" | "build" | "edit" | "yolo"`
- `CompactLifecyclePayload` (TypeAliasDeclaration) — `Omit<{ trigger: "manual" | "auto" | "partial" | "reactive" | "session_memory"; status: "started" | "completed" | "failed" | "retrying" | "skipped" | "interrupted"; operationId: string; messageId: stri`
- `ContextUsageBreakdownItem` (InterfaceDeclaration) — `ContextUsageBreakdownItem`
- `ContextUsageBreakdownSource` (TypeAliasDeclaration) — `"system_prompt" | "meta_user_context" | "skills" | "tool_prompt" | "system_tool_schemas" | "mcp_tool_schemas" | "messages"`
- `createModelUsageSummaryFromEvents` (FunctionDeclaration) — `export function createModelUsageSummaryFromEvents( events: readonly SessionEvent[], ): ModelUsageSummary | undefined { const usages: ModelUsage[] = []; for (const event of events) { if (event.type !==`
- `createSessionEvent` (FunctionDeclaration) — `export function createSessionEvent<T>( type: SessionEventType, sessionId: SessionId, payload: T, options?: { turnId?: TurnId; traceId?: TraceId; sequenceNumber?: number; }, ): SessionEvent { return { `
- `DynamicWorkflowRunProgressPayload` (InterfaceDeclaration) — `DynamicWorkflowRunProgressPayload`
- `ErrorAttribution` (InterfaceDeclaration) — `ErrorAttribution`
- `ErrorPayload` (InterfaceDeclaration) — `ErrorPayload`
- `FollowupModeChangedPayload` (InterfaceDeclaration) — `FollowupModeChangedPayload`
- `MicrocompactBoundaryEventPayload` (TypeAliasDeclaration) — `Omit<{ trigger: "time_based" | "token_pressure"; traceId: string; strategy: "local_tool_result_clear"; preMicrocompactTokenCount: number; postMicrocompactTokenCount: number; tokensSaved: number; clear`
- `ModelAnomalyWarningCategory` (TypeAliasDeclaration) — `"tool_call_budget" | "repeated_tool_call" | "provider_finish_mismatch" | "malformed_tool_call"`
- `ModelAnomalyWarningPayload` (InterfaceDeclaration) — `ModelAnomalyWarningPayload`
- `ModelAnomalyWarningSeverity` (TypeAliasDeclaration) — `"warning" | "info"`
- `ModelCompletePayload` (InterfaceDeclaration) — `ModelCompletePayload`
- `ModelErrorPayload` (InterfaceDeclaration) — `ModelErrorPayload`
- `ModelMessage` (InterfaceDeclaration) — `ModelMessage`
- `ModelNetworkStatusPayload` (TypeAliasDeclaration) — `import("../model/index.js").ModelRequestQueuedStatusEvent | import("../model/index.js").ModelRequestAdmittedStatusEvent | import("../model/index.js").ModelRequestStartedStatusEvent | import("../model/`
- `ModelRequestPayload` (InterfaceDeclaration) — `ModelRequestPayload`
- `ModelSelectedPayload` (InterfaceDeclaration) — `ModelSelectedPayload`
- `ModelSelectionOrigin` (TypeAliasDeclaration) — `"registryFallback"`
- `ModelStreamingKind` (TypeAliasDeclaration) — `"error" | "start" | "text_start" | "text_delta" | "text_end" | "reasoning_start" | "reasoning_delta" | "reasoning_end" | "tool_input_start" | "tool_input_delta" | "tool_input_end" | "tool_call" | "fin`
- `ModelStreamingPayload` (InterfaceDeclaration) — `ModelStreamingPayload`
- `NetworkRequestLifecycleStatus` (TypeAliasDeclaration) — `"error" | "pending" | "complete"`
- `NetworkRequestSource` (TypeAliasDeclaration) — `"plugin" | "unknown" | "model" | "http_client" | "tool" | "mcp"`
- `NetworkRequestStatusPayload` (InterfaceDeclaration) — `NetworkRequestStatusPayload`
- `OffPeakRunType` (TypeAliasDeclaration) — `"init" | "resume"`
- `PermissionDecision` (TypeAliasDeclaration) — `"allow" | "deny" | "escalate" | "modify"`
- `PermissionDeniedPayload` (InterfaceDeclaration) — `PermissionDeniedPayload`
- `PermissionRequestedPayload` (InterfaceDeclaration) — `PermissionRequestedPayload`
- `PermissionResolvedPayload` (InterfaceDeclaration) — `PermissionResolvedPayload`
- `QueueAutoDrainChangedPayload` (InterfaceDeclaration) — `QueueAutoDrainChangedPayload`
- `RiskLevel` (TypeAliasDeclaration) — `"low" | "medium" | "high" | "critical"`
- `SessionCompactedPayload` (InterfaceDeclaration) — `SessionCompactedPayload`
- `SessionCreatedPayload` (InterfaceDeclaration) — `SessionCreatedPayload`
- `SessionEvent` (InterfaceDeclaration) — `SessionEvent`
- `SessionEventPayload` (TypeAliasDeclaration) — `CompactBoundaryPayload | CompactTimelinePayload | MicrocompactBoundaryPayload | AssistantMessagePayload | BackgroundTaskPayloadBase | BackgroundTaskCompletedPayload | BackgroundTaskStartedPayload | Dy`
- `SessionEventType` (VariableDeclaration | TypeAliasDeclaration) — `{ readonly SessionCreated: "session_created"; readonly SessionResumed: "session_resumed"; readonly SessionForked: "session_forked"; readonly SessionCompacted: "session_compacted"; readonly SessionTitl`
- `SessionForkedPayload` (InterfaceDeclaration) — `SessionForkedPayload`
- `SessionInputPromotedPayload` (InterfaceDeclaration) — `SessionInputPromotedPayload`
- `SessionModeChangedPayload` (InterfaceDeclaration) — `SessionModeChangedPayload`
- `SessionResumedPayload` (InterfaceDeclaration) — `SessionResumedPayload`
- `SessionTitleUpdatedPayload` (InterfaceDeclaration) — `SessionTitleUpdatedPayload`
- `SystemMessagePayload` (InterfaceDeclaration) — `SystemMessagePayload`
- `TargetChangedAction` (TypeAliasDeclaration) — `"set" | "status_updated" | "cleared" | "usage_accounted" | "run_started" | "run_finished" | "summary_updated"`
- `TargetChangedPayload` (InterfaceDeclaration) — `TargetChangedPayload`
- `TargetChangedSource` (TypeAliasDeclaration) — `"command" | "tool" | "runtime"`
- `TargetCompletionVerificationPayload` (InterfaceDeclaration) — `TargetCompletionVerificationPayload`
- `TargetCompletionVerificationStatus` (TypeAliasDeclaration) — `"cancelled" | "started" | "completed" | "failed_closed"`
- `TokenUsage` (InterfaceDeclaration) — `TokenUsage`
- `ToolBatchCompletePayload` (InterfaceDeclaration) — `ToolBatchCompletePayload`
- `ToolCall` (InterfaceDeclaration) — `ModelToolCall`
- `ToolCallErrorPayload` (InterfaceDeclaration) — `ToolCallErrorPayload`
- `ToolCallPayload` (InterfaceDeclaration) — `ToolCallPayload`
- `ToolCallProgressPayload` (InterfaceDeclaration) — `ToolCallProgressPayload`
- `ToolCallResultPayload` (InterfaceDeclaration) — `ToolCallResultPayload`
- `ToolCallScheduledPayload` (InterfaceDeclaration) — `ToolCallScheduledPayload`
- `ToolCallStartedPayload` (InterfaceDeclaration) — `ToolCallStartedPayload`
- `ToolResultPayload` (InterfaceDeclaration) — `ToolResultPayload`
- `ToolSchedulePayload` (InterfaceDeclaration) — `ToolSchedulePayload`
- `TurnAttachmentMeta` (InterfaceDeclaration) — `TurnAttachmentMeta`
- `TurnBackgroundAttribution` (TypeAliasDeclaration) — `{ automationId: string; offPeakTaskId?: never; offPeakRunType?: never; } | { offPeakTaskId: string; offPeakRunType?: OffPeakRunType; automationId?: never; } | { automationId?: undefined; offPeakTaskId`
- `TurnCompletePayload` (InterfaceDeclaration) — `TurnCompletePayload`
- `TurnErrorPayload` (InterfaceDeclaration) — `TurnErrorPayload`
- `TurnExecutionKind` (TypeAliasDeclaration) — `"agent" | "controlOnly"`
- `TurnFileChangeSummary` (InterfaceDeclaration) — `TurnFileChangeSummary`
- `TurnFileChangeSummaryItem` (InterfaceDeclaration) — `TurnFileChangeSummaryItem`
- `TurnInputReceivedPayload` (InterfaceDeclaration) — `TurnInputReceivedPayload`
- `TurnResultType` (TypeAliasDeclaration) — `"cancelled" | "success" | "error_max_turns" | "error_max_budget" | "error_during_execution" | "error_max_tool_calls"`
- `TurnStartedPayload` (TypeAliasDeclaration) — `TurnStartedPayloadBase & TurnBackgroundAttribution`
- `TurnStartedPayloadBase` (InterfaceDeclaration) — `TurnStartedPayloadBase`
- `TurnSteerDeliveryChangedPayload` (InterfaceDeclaration) — `TurnSteerDeliveryChangedPayload`
- `TurnSteerDiscardedPayload` (InterfaceDeclaration) — `TurnSteerDiscardedPayload`
- `TurnSteerDispatchChangedPayload` (InterfaceDeclaration) — `TurnSteerDispatchChangedPayload`
- `TurnSteerDrainedPayload` (InterfaceDeclaration) — `TurnSteerDrainedPayload`
- `TurnSteerQueuedPayload` (InterfaceDeclaration) — `TurnSteerQueuedPayload`
- `TurnSteerRejectedPayload` (InterfaceDeclaration) — `TurnSteerRejectedPayload`
- `TurnSteerReorderedPayload` (InterfaceDeclaration) — `TurnSteerReorderedPayload`
- `UserInputAutoResolutionState` (TypeAliasDeclaration) — `{ state: "hiddenGrace" | "visibleCountdown"; startedAt: number; visibleAt: number; deadlineAt: number; } | { state: "snoozed"; startedAt: number; snoozedAt: number; }`
- `UserInputAutoResolutionUpdatedPayload` (InterfaceDeclaration) — `UserInputAutoResolutionUpdatedPayload`
- `UserMessagePayload` (InterfaceDeclaration) — `UserMessagePayload`
- `WORKFLOW_LAUNCH_ARGS_MAX_BYTES` (VariableDeclaration) — `4096`
- `WORKFLOW_LAUNCH_ARGS_TRUNCATED_KEY` (VariableDeclaration) — `"…"`
- `WORKFLOW_LAUNCH_DESCRIPTION_MAX_CHARS` (VariableDeclaration) — `500`
- `WORKFLOW_LAUNCH_SCRIPT_MAX_CHARS` (VariableDeclaration) — `256000`
- `WorkflowLaunchDisplay` (TypeAliasDeclaration) — `{ kind: "create_workflow"; ok: boolean; errorCount: number; diagnostics: { code: number; message: string; line: number; column: number; }[]; truncated?: boolean | undefined; causalityGraph?: { lanes: `
- `WorkflowLaunchMeta` (InterfaceDeclaration) — `WorkflowLaunchMeta`
- `WorkflowNotificationMeta` (TypeAliasDeclaration) — `{ kind: "terminal"; status: "completed" | "errored" | "stopped"; stopReason?: "user" | "model" | "provider" | "interrupted" | "superseded"; summary: string; result?: string; resultForm?: "prose" | "js`
- `WorkflowSettingsAmendMeta` (InterfaceDeclaration) — `WorkflowSettingsAmendMeta`
- `WorkspaceHookAdmissionUpdatedPayload` (InterfaceDeclaration) — `WorkspaceHookAdmissionUpdatedPayload`
- `WorkspaceHookReviewRequestedPayload` (InterfaceDeclaration) — `WorkspaceHookReviewRequestedPayload`
- `WorkspaceHookReviewSettledPayload` (InterfaceDeclaration) — `WorkspaceHookReviewSettledPayload`
- `WorkspaceHookReviewSupersededPayload` (InterfaceDeclaration) — `WorkspaceHookReviewSupersededPayload`

### `events/stream-recovery.events.ts`

- `STREAM_RECOVERY_DISCARDED_ERROR_NAME` (VariableDeclaration) — `"StreamRecoveryDiscarded"`
- `STREAM_RECOVERY_DISCARDED_FINISH` (VariableDeclaration) — `"stream_recovery_discarded"`
- `StreamingToolExecutionTiming` (TypeAliasDeclaration) — `"end_of_stream" | "during_stream"`
- `StreamingToolLedgerPayload` (InterfaceDeclaration) — `StreamingToolLedgerPayload`
- `StreamingToolLedgerProjectionInfo` (InterfaceDeclaration) — `StreamingToolLedgerProjectionInfo`
- `StreamingToolLedgerStatus` (TypeAliasDeclaration) — `"tool_input_streaming" | "tool_call_closed" | "tool_queued" | "tool_started" | "tool_result_committed" | "tool_cancelled" | "tool_abandoned" | "recovery_blocked"`
- `StreamRecoveryAnchorKind` (TypeAliasDeclaration) — `"assistant_message" | "tool_cancelled" | "tool_result" | "tool_error"`
- `StreamRecoveryAnchorPayload` (InterfaceDeclaration) — `StreamRecoveryAnchorPayload`
- `StreamRecoveryAnchorProjectionInfo` (InterfaceDeclaration) — `StreamRecoveryAnchorProjectionInfo`
- `StreamRecoveryAnchorSelectedPayload` (InterfaceDeclaration) — `StreamRecoveryAnchorSelectedPayload`
- `StreamRecoveryBlockedPayload` (InterfaceDeclaration) — `StreamRecoveryBlockedPayload`
- `StreamRecoveryFailureKind` (TypeAliasDeclaration) — `"unknown" | "provider_timeout" | "provider_network_error" | "provider_stream_error" | "provider_turn_failed"`
- `StreamRecoveryRetryStartedPayload` (InterfaceDeclaration) — `StreamRecoveryRetryStartedPayload`
- `StreamRecoveryStartedPayload` (InterfaceDeclaration) — `StreamRecoveryStartedPayload`
- `StreamRecoveryTailDiscardedPayload` (InterfaceDeclaration) — `StreamRecoveryTailDiscardedPayload`

### `hooks/index.ts`

- `BaseHookInput` (InterfaceDeclaration) — `BaseHookInput`
- `CanonicalWorkspaceHookEntry` (TypeAliasDeclaration) — `{ type: "command"; command: string; reviewItemId: string; event: "SessionStart" | "UserPromptSubmit" | "PreToolUse" | "PermissionRequest" | "PostToolUse" | "PostToolUseFailure" | "Stop"; matcherIndex:`
- `canonicalWorkspaceHookEntrySchema` (VariableDeclaration) — `z.ZodDiscriminatedUnion<"type", [z.ZodObject<{ type: z.ZodLiteral<"command">; async: z.ZodOptional<z.ZodBoolean>; shell: z.ZodOptional<z.ZodUnion<[z.ZodLiteral<true>, z.ZodString]>>; reviewItemId: z.Z`
- `createWorkspaceHookBundleSnapshot` (FunctionDeclaration) — `export function createWorkspaceHookBundleSnapshot(value: unknown): WorkspaceHookBundleSnapshot { return deepFreeze(workspaceHookBundleSnapshotSchema.parse(value)) as WorkspaceHookBundleSnapshot; }`
- `DefaultHooksRuntimeConfig` (VariableDeclaration) — `HooksRuntimeConfig`
- `HookCommandConfig` (InterfaceDeclaration) — `HookCommandConfig`
- `HookCommandConfigSchema` (VariableDeclaration) — `z.ZodObject<{ type: z.ZodLiteral<"command">; command: z.ZodString; enabled: z.ZodOptional<z.ZodBoolean>; async: z.ZodOptional<z.ZodBoolean>; shell: z.ZodOptional<z.ZodUnion<[z.ZodLiteral<true>, z.ZodS`
- `HookConfig` (TypeAliasDeclaration) — `HookCommandConfig | HookProcessConfig`
- `HookConfigSchema` (VariableDeclaration) — `z.ZodDiscriminatedUnion<"type", [z.ZodObject<{ type: z.ZodLiteral<"process">; command: z.ZodString; enabled: z.ZodOptional<z.ZodBoolean>; args: z.ZodOptional<z.ZodArray<z.ZodString, "many">>; timeoutM`
- `HookConfigSource` (InterfaceDeclaration) — `HookConfigSource`
- `HookEventName` (VariableDeclaration | TypeAliasDeclaration) — `{ readonly SessionStart: "SessionStart"; readonly UserPromptSubmit: "UserPromptSubmit"; readonly PreToolUse: "PreToolUse"; readonly PermissionRequest: "PermissionRequest"; readonly PostToolUse: "PostT`
- `HookExecutionDescriptor` (InterfaceDeclaration) — `HookExecutionDescriptor`
- `HookInput` (TypeAliasDeclaration) — `PreToolUseHookInput | PermissionRequestHookInput | PostToolUseHookInput | PostToolUseFailureHookInput | UserPromptSubmitHookInput | SessionStartHookInput | StopHookInput`
- `HookJSONOutput` (InterfaceDeclaration) — `HookJSONOutput`
- `HookJSONOutputSchema` (VariableDeclaration) — `z.ZodObject<{ additionalContext: z.ZodOptional<z.ZodString>; additional_context: z.ZodOptional<z.ZodString>; continue: z.ZodOptional<z.ZodBoolean>; decision: z.ZodOptional<z.ZodEnum<["approve", "block`
- `HookMatcherConfig` (InterfaceDeclaration) — `HookMatcherConfig`
- `HookMatcherConfigSchema` (VariableDeclaration) — `z.ZodObject<{ matcher: z.ZodOptional<z.ZodString>; hooks: z.ZodArray<z.ZodDiscriminatedUnion<"type", [z.ZodObject<{ type: z.ZodLiteral<"process">; command: z.ZodString; enabled: z.ZodOptional<z.ZodBoo`
- `HookOutcome` (VariableDeclaration | TypeAliasDeclaration) — `{ readonly Success: "success"; readonly Blocked: "blocked"; readonly Failed: "failed"; readonly Cancelled: "cancelled"; readonly TimedOut: "timed_out"; }`
- `HookPermissionDecision` (VariableDeclaration | TypeAliasDeclaration) — `{ readonly Allow: "allow"; readonly Ask: "ask"; readonly Deny: "deny"; }`
- `HookPluginContext` (InterfaceDeclaration) — `HookPluginContext`
- `HookProcessConfig` (InterfaceDeclaration) — `HookProcessConfig`
- `HookProcessConfigSchema` (VariableDeclaration) — `z.ZodObject<{ type: z.ZodLiteral<"process">; command: z.ZodString; enabled: z.ZodOptional<z.ZodBoolean>; args: z.ZodOptional<z.ZodArray<z.ZodString, "many">>; timeoutMs: z.ZodOptional<z.ZodNumber>; st`
- `HookRunLifecyclePayload` (InterfaceDeclaration) — `HookRunLifecyclePayload`
- `HookSourceKind` (VariableDeclaration | TypeAliasDeclaration) — `{ readonly User: "user"; readonly Plugin: "plugin"; readonly Project: "project"; readonly Internal: "internal"; }`
- `HookSpecificOutput` (TypeAliasDeclaration) — `{ additionalContext?: string; hookEventName: typeof HookEventName.PreToolUse; permissionDecision?: HookPermissionDecision; permissionDecisionReason?: string; updatedInput?: unknown; } | { additionalCo`
- `HookSpecificOutputSchema` (VariableDeclaration) — `z.ZodDiscriminatedUnion<"hookEventName", [z.ZodObject<{ additionalContext: z.ZodOptional<z.ZodString>; hookEventName: z.ZodLiteral<"PreToolUse">; permissionDecision: z.ZodOptional<z.ZodEnum<["allow", `
- `HooksRuntimeConfig` (InterfaceDeclaration) — `HooksRuntimeConfig`
- `HooksRuntimeConfigPatch` (InterfaceDeclaration) — `HooksRuntimeConfigPatch`
- `HooksRuntimeConfigPatchSchema` (VariableDeclaration) — `z.ZodObject<{ enabled: z.ZodOptional<z.ZodBoolean>; timeoutMs: z.ZodOptional<z.ZodNumber>; maxOutputBytes: z.ZodOptional<z.ZodNumber>; events: z.ZodOptional<z.ZodObject<{ SessionStart: z.ZodOptional<z`
- `PermissionRequestHookDecision` (TypeAliasDeclaration) — `{ behavior: "allow"; permissionUpdates?: PermissionUpdate[]; updatedPermissions?: PermissionUpdate[]; updatedInput?: unknown; } | { behavior: "deny"; interrupt?: boolean; message?: string; }`
- `PermissionRequestHookInput` (InterfaceDeclaration) — `PermissionRequestHookInput`
- `PostToolUseFailureHookInput` (InterfaceDeclaration) — `PostToolUseFailureHookInput`
- `PostToolUseHookInput` (InterfaceDeclaration) — `PostToolUseHookInput`
- `PreToolUseHookInput` (InterfaceDeclaration) — `PreToolUseHookInput`
- `SessionStartHookInput` (InterfaceDeclaration) — `SessionStartHookInput`
- `StopHookInput` (InterfaceDeclaration) — `StopHookInput`
- `UserPromptSubmitHookInput` (InterfaceDeclaration) — `UserPromptSubmitHookInput`
- `WORKSPACE_HOOK_DIGEST_SCHEMA_VERSION` (VariableDeclaration) — `1`
- `WORKSPACE_HOOK_REVIEW_TIMEOUT_MS` (VariableDeclaration) — `number`
- `WORKSPACE_HOOK_SCHEMA_FIELDS` (VariableDeclaration) — `{ readonly root: readonly ["enabled", "timeoutMs", "maxOutputBytes", "events"]; readonly matcher: readonly ["matcher", "hooks"]; readonly events: readonly ["SessionStart", "UserPromptSubmit", "PreTool`
- `WORKSPACE_HOOK_STATE_ADMISSION_MAP` (VariableDeclaration) — `{ readonly not_applicable: { readonly admissionClass: "not_applicable"; readonly effectiveRunnable: false; readonly reasonCode: "workspace_hooks_not_applicable"; }; readonly pending_trust: { readonly `
- `WORKSPACE_HOOK_TRUST_STORE_SCHEMA_VERSION` (VariableDeclaration) — `1`
- `WorkspaceHookAdmissionClass` (TypeAliasDeclaration) — `"pending" | "blocked" | "not_applicable" | "admitted"`
- `workspaceHookAdmissionClassSchema` (VariableDeclaration) — `z.ZodEnum<["not_applicable", "admitted", "pending", "blocked"]>`
- `WorkspaceHookBundleSnapshot` (TypeAliasDeclaration) — `{ readonly hooks: ({ type: "command"; command: string; reviewItemId: string; event: "SessionStart" | "UserPromptSubmit" | "PreToolUse" | "PermissionRequest" | "PostToolUse" | "PostToolUseFailure" | "S`
- `workspaceHookBundleSnapshotSchema` (VariableDeclaration) — `z.ZodObject<{ schemaVersion: z.ZodLiteral<1>; workspaceIdentity: z.ZodString; discoveredAt: z.ZodString; sourceFiles: z.ZodArray<z.ZodObject<{ canonicalPath: z.ZodString; baseDir: z.ZodString; discove`
- `WorkspaceHookEffectiveState` (TypeAliasDeclaration) — `{ reviewItemId: string; sourceRootEnabled: boolean; declarationEnabled: boolean; runtimeHooksEnabled: boolean; configuredEnabled: boolean; editable: boolean; trustState: "not_applicable" | "pending_tr`
- `workspaceHookEffectiveStateSchema` (VariableDeclaration) — `z.ZodEffects<z.ZodObject<{ reviewItemId: z.ZodString; sourceRootEnabled: z.ZodBoolean; declarationEnabled: z.ZodBoolean; runtimeHooksEnabled: z.ZodBoolean; configuredEnabled: z.ZodBoolean; editable: z`
- `workspaceHookEventNameSchema` (VariableDeclaration) — `z.ZodEnum<["SessionStart", "UserPromptSubmit", "PreToolUse", "PermissionRequest", "PostToolUse", "PostToolUseFailure", "Stop"]>`
- `WorkspaceHookPolicy` (TypeAliasDeclaration) — `{ reason: string; mode: "deny"; policyRevision: string; } | { mode: "user_decides"; policyRevision: string; } | { mode: "allow_trusted_only"; policyRevision: string; reason?: string | undefined; }`
- `workspaceHookPolicySchema` (VariableDeclaration) — `z.ZodDiscriminatedUnion<"mode", [z.ZodObject<{ mode: z.ZodLiteral<"deny">; reason: z.ZodString; policyRevision: z.ZodString; }, "strict", z.ZodTypeAny, { reason: string; mode: "deny"; policyRevision: `
- `WorkspaceHookReasonCode` (TypeAliasDeclaration) — `"workspace_hooks_no_enabled_hooks" | "workspace_hooks_not_applicable" | "workspace_hooks_pending_trust" | "workspace_hooks_trusted_persistent" | "workspace_hooks_blocked_untrusted" | "workspace_hooks_`
- `workspaceHookReasonCodeSchema` (VariableDeclaration) — `z.ZodEnum<["workspace_hooks_no_enabled_hooks", "workspace_hooks_not_applicable", "workspace_hooks_pending_trust", "workspace_hooks_trusted_persistent", "workspace_hooks_blocked_untrusted", "workspace_`
- `WorkspaceHookReviewFlowState` (TypeAliasDeclaration) — `{ state: "cancelled" | "timed_out" | "pending" | "superseded" | "resolved"; createdAt: number; workspaceIdentity: string; bundleDigest: string; reviewFlowId: string; generation: number; interactionId:`
- `workspaceHookReviewFlowStateSchema` (VariableDeclaration) — `z.ZodEffects<z.ZodObject<{ reviewFlowId: z.ZodString; generation: z.ZodNumber; interactionId: z.ZodString; sessionId: z.ZodString; workspaceIdentity: z.ZodString; bundleDigest: z.ZodString; state: z.Z`
- `WorkspaceHookSecurityRevision` (TypeAliasDeclaration) — `{ coordinatorEpoch: string; counter: number; }`
- `workspaceHookSecurityRevisionSchema` (VariableDeclaration) — `z.ZodObject<{ coordinatorEpoch: z.ZodString; counter: z.ZodNumber; }, "strict", z.ZodTypeAny, { coordinatorEpoch: string; counter: number; }, { coordinatorEpoch: string; counter: number; }>`
- `WorkspaceHookTrustRecord` (TypeAliasDeclaration) — `{ workspaceIdentity: string; hookDeclarationDigest: string; digestAlgorithm: "sha256"; decision: "trusted"; grantedAt: string; eventAtGrant: "SessionStart" | "UserPromptSubmit" | "PreToolUse" | "Permi`
- `workspaceHookTrustRecordSchema` (VariableDeclaration) — `z.ZodObject<{ workspaceIdentity: z.ZodString; hookDeclarationDigest: z.ZodString; digestAlgorithm: z.ZodLiteral<"sha256">; decision: z.ZodLiteral<"trusted">; grantedAt: z.ZodString; lastUsedAt: z.ZodO`
- `WorkspaceHookTrustState` (VariableDeclaration | TypeAliasDeclaration) — `{ readonly NotApplicable: "not_applicable"; readonly PendingTrust: "pending_trust"; readonly TrustedPersistent: "trusted_persistent"; readonly BlockedUntrusted: "blocked_untrusted"; readonly BlockedPo`
- `workspaceHookTrustStateSchema` (VariableDeclaration) — `z.ZodEnum<["not_applicable", "pending_trust", "trusted_persistent", "blocked_untrusted", "blocked_policy", "revoked", "stale_digest"]>`
- `WorkspaceHookTrustStoreFile` (TypeAliasDeclaration) — `{ schemaVersion: 1; records: { workspaceIdentity: string; hookDeclarationDigest: string; digestAlgorithm: "sha256"; decision: "trusted"; grantedAt: string; eventAtGrant: "SessionStart" | "UserPromptSu`
- `workspaceHookTrustStoreFileSchema` (VariableDeclaration) — `z.ZodObject<{ schemaVersion: z.ZodLiteral<1>; records: z.ZodArray<z.ZodObject<{ workspaceIdentity: z.ZodString; hookDeclarationDigest: z.ZodString; digestAlgorithm: z.ZodLiteral<"sha256">; decision: z`

### `hooks/workspace-hook-trust-store.ts`

- `WORKSPACE_HOOK_TRUST_STORE_SCHEMA_VERSION` (VariableDeclaration) — `1`
- `WorkspaceHookPolicy` (TypeAliasDeclaration) — `{ reason: string; mode: "deny"; policyRevision: string; } | { mode: "user_decides"; policyRevision: string; } | { mode: "allow_trusted_only"; policyRevision: string; reason?: string | undefined; }`
- `workspaceHookPolicySchema` (VariableDeclaration) — `z.ZodDiscriminatedUnion<"mode", [z.ZodObject<{ mode: z.ZodLiteral<"deny">; reason: z.ZodString; policyRevision: z.ZodString; }, "strict", z.ZodTypeAny, { reason: string; mode: "deny"; policyRevision: `
- `WorkspaceHookTrustRecord` (TypeAliasDeclaration) — `{ workspaceIdentity: string; hookDeclarationDigest: string; digestAlgorithm: "sha256"; decision: "trusted"; grantedAt: string; eventAtGrant: "SessionStart" | "UserPromptSubmit" | "PreToolUse" | "Permi`
- `workspaceHookTrustRecordSchema` (VariableDeclaration) — `z.ZodObject<{ workspaceIdentity: z.ZodString; hookDeclarationDigest: z.ZodString; digestAlgorithm: z.ZodLiteral<"sha256">; decision: z.ZodLiteral<"trusted">; grantedAt: z.ZodString; lastUsedAt: z.ZodO`
- `WorkspaceHookTrustStoreFile` (TypeAliasDeclaration) — `{ schemaVersion: 1; records: { workspaceIdentity: string; hookDeclarationDigest: string; digestAlgorithm: "sha256"; decision: "trusted"; grantedAt: string; eventAtGrant: "SessionStart" | "UserPromptSu`
- `workspaceHookTrustStoreFileSchema` (VariableDeclaration) — `z.ZodObject<{ schemaVersion: z.ZodLiteral<1>; records: z.ZodArray<z.ZodObject<{ workspaceIdentity: z.ZodString; hookDeclarationDigest: z.ZodString; digestAlgorithm: z.ZodLiteral<"sha256">; decision: z`

### `hooks/workspace-hook-trust.ts`

- `CanonicalWorkspaceHookEntry` (TypeAliasDeclaration) — `{ type: "command"; command: string; reviewItemId: string; event: "SessionStart" | "UserPromptSubmit" | "PreToolUse" | "PermissionRequest" | "PostToolUse" | "PostToolUseFailure" | "Stop"; matcherIndex:`
- `canonicalWorkspaceHookEntrySchema` (VariableDeclaration) — `z.ZodDiscriminatedUnion<"type", [z.ZodObject<{ type: z.ZodLiteral<"command">; async: z.ZodOptional<z.ZodBoolean>; shell: z.ZodOptional<z.ZodUnion<[z.ZodLiteral<true>, z.ZodString]>>; reviewItemId: z.Z`
- `createWorkspaceHookBundleSnapshot` (FunctionDeclaration) — `export function createWorkspaceHookBundleSnapshot(value: unknown): WorkspaceHookBundleSnapshot { return deepFreeze(workspaceHookBundleSnapshotSchema.parse(value)) as WorkspaceHookBundleSnapshot; }`
- `WORKSPACE_HOOK_DIGEST_SCHEMA_VERSION` (VariableDeclaration) — `1`
- `WORKSPACE_HOOK_REVIEW_TIMEOUT_MS` (VariableDeclaration) — `number`
- `WORKSPACE_HOOK_SCHEMA_FIELDS` (VariableDeclaration) — `{ readonly root: readonly ["enabled", "timeoutMs", "maxOutputBytes", "events"]; readonly matcher: readonly ["matcher", "hooks"]; readonly events: readonly ["SessionStart", "UserPromptSubmit", "PreTool`
- `WORKSPACE_HOOK_STATE_ADMISSION_MAP` (VariableDeclaration) — `{ readonly not_applicable: { readonly admissionClass: "not_applicable"; readonly effectiveRunnable: false; readonly reasonCode: "workspace_hooks_not_applicable"; }; readonly pending_trust: { readonly `
- `WorkspaceHookAdmissionClass` (TypeAliasDeclaration) — `"pending" | "blocked" | "not_applicable" | "admitted"`
- `workspaceHookAdmissionClassSchema` (VariableDeclaration) — `z.ZodEnum<["not_applicable", "admitted", "pending", "blocked"]>`
- `WorkspaceHookBundleSnapshot` (TypeAliasDeclaration) — `{ readonly hooks: ({ type: "command"; command: string; reviewItemId: string; event: "SessionStart" | "UserPromptSubmit" | "PreToolUse" | "PermissionRequest" | "PostToolUse" | "PostToolUseFailure" | "S`
- `workspaceHookBundleSnapshotSchema` (VariableDeclaration) — `z.ZodObject<{ schemaVersion: z.ZodLiteral<1>; workspaceIdentity: z.ZodString; discoveredAt: z.ZodString; sourceFiles: z.ZodArray<z.ZodObject<{ canonicalPath: z.ZodString; baseDir: z.ZodString; discove`
- `WorkspaceHookEffectiveState` (TypeAliasDeclaration) — `{ reviewItemId: string; sourceRootEnabled: boolean; declarationEnabled: boolean; runtimeHooksEnabled: boolean; configuredEnabled: boolean; editable: boolean; trustState: "not_applicable" | "pending_tr`
- `workspaceHookEffectiveStateSchema` (VariableDeclaration) — `z.ZodEffects<z.ZodObject<{ reviewItemId: z.ZodString; sourceRootEnabled: z.ZodBoolean; declarationEnabled: z.ZodBoolean; runtimeHooksEnabled: z.ZodBoolean; configuredEnabled: z.ZodBoolean; editable: z`
- `workspaceHookEventNameSchema` (VariableDeclaration) — `z.ZodEnum<["SessionStart", "UserPromptSubmit", "PreToolUse", "PermissionRequest", "PostToolUse", "PostToolUseFailure", "Stop"]>`
- `WorkspaceHookReasonCode` (TypeAliasDeclaration) — `"workspace_hooks_no_enabled_hooks" | "workspace_hooks_not_applicable" | "workspace_hooks_pending_trust" | "workspace_hooks_trusted_persistent" | "workspace_hooks_blocked_untrusted" | "workspace_hooks_`
- `workspaceHookReasonCodeSchema` (VariableDeclaration) — `z.ZodEnum<["workspace_hooks_no_enabled_hooks", "workspace_hooks_not_applicable", "workspace_hooks_pending_trust", "workspace_hooks_trusted_persistent", "workspace_hooks_blocked_untrusted", "workspace_`
- `WorkspaceHookReviewFlowState` (TypeAliasDeclaration) — `{ state: "cancelled" | "timed_out" | "pending" | "superseded" | "resolved"; createdAt: number; workspaceIdentity: string; bundleDigest: string; reviewFlowId: string; generation: number; interactionId:`
- `workspaceHookReviewFlowStateSchema` (VariableDeclaration) — `z.ZodEffects<z.ZodObject<{ reviewFlowId: z.ZodString; generation: z.ZodNumber; interactionId: z.ZodString; sessionId: z.ZodString; workspaceIdentity: z.ZodString; bundleDigest: z.ZodString; state: z.Z`
- `WorkspaceHookSecurityRevision` (TypeAliasDeclaration) — `{ coordinatorEpoch: string; counter: number; }`
- `workspaceHookSecurityRevisionSchema` (VariableDeclaration) — `z.ZodObject<{ coordinatorEpoch: z.ZodString; counter: z.ZodNumber; }, "strict", z.ZodTypeAny, { coordinatorEpoch: string; counter: number; }, { coordinatorEpoch: string; counter: number; }>`
- `WorkspaceHookTrustState` (VariableDeclaration | TypeAliasDeclaration) — `{ readonly NotApplicable: "not_applicable"; readonly PendingTrust: "pending_trust"; readonly TrustedPersistent: "trusted_persistent"; readonly BlockedUntrusted: "blocked_untrusted"; readonly BlockedPo`
- `workspaceHookTrustStateSchema` (VariableDeclaration) — `z.ZodEnum<["not_applicable", "pending_trust", "trusted_persistent", "blocked_untrusted", "blocked_policy", "revoked", "stale_digest"]>`

### `interfaces/automation.port.ts`

- `AUTOMATION_CREATE_LIMIT_ERROR_CODE` (VariableDeclaration) — `"AUTOMATION_CREATE_LIMIT_REACHED"`
- `AutomationCreateContext` (InterfaceDeclaration) — `AutomationCreateContext`
- `AutomationCreateLimitError` (ClassDeclaration) — `AutomationCreateLimitError`
- `AutomationPort` (InterfaceDeclaration) — `AutomationPort`
- `isAutomationCreateLimitError` (FunctionDeclaration) — `export function isAutomationCreateLimitError(error: unknown): error is AutomationCreateLimitError { if (error instanceof AutomationCreateLimitError) return true; if (typeof error !== "object" || error`

### `interfaces/context-source.port.ts`

- `ContextSourceDiagnostic` (InterfaceDeclaration) — `ContextSourceDiagnostic`
- `ContextSourcePort` (InterfaceDeclaration) — `ContextSourcePort`
- `ContextSourceRequest` (InterfaceDeclaration) — `ContextSourceRequest`
- `ContextSourceResolveOptions` (InterfaceDeclaration) — `ContextSourceResolveOptions`
- `ContextSourceSnapshot` (InterfaceDeclaration) — `ContextSourceSnapshot`
- `EnvInfo` (InterfaceDeclaration) — `EnvInfo`
- `PackageManager` (TypeAliasDeclaration) — `"npm" | "yarn" | "pnpm" | "bun"`
- `ProjectContext` (InterfaceDeclaration) — `ProjectContext`
- `ProjectType` (TypeAliasDeclaration) — `"unknown" | "node" | "python" | "rust" | "go" | "java"`
- `ResolvedUserInstructions` (InterfaceDeclaration) — `ResolvedUserInstructions`
- `ResolvedUserInstructionSource` (InterfaceDeclaration) — `ResolvedUserInstructionSource`
- `UserInstructionsOptions` (InterfaceDeclaration) — `UserInstructionsOptions`
- `UserInstructionSourceScope` (TypeAliasDeclaration) — `"user" | "workspace"`

### `interfaces/coordinator-response.port.ts`

- `CoordinatorResponsePort` (InterfaceDeclaration) — `CoordinatorResponsePort`
- `CoordinatorResponseRequest` (InterfaceDeclaration) — `CoordinatorResponseRequest`
- `CoordinatorResponseResult` (InterfaceDeclaration) — `CoordinatorResponseResult`

### `interfaces/dynamic-workflow-run-roster.port.ts`

- `DynamicWorkflowRunConcurrencyHealth` (InterfaceDeclaration) — `DynamicWorkflowRunConcurrencyHealth`
- `DynamicWorkflowRunHealth` (InterfaceDeclaration) — `DynamicWorkflowRunHealth`
- `DynamicWorkflowRunPhaseState` (TypeAliasDeclaration) — `"done" | "current" | "ahead" | "unfinished"`
- `DynamicWorkflowRunPhaseView` (InterfaceDeclaration) — `DynamicWorkflowRunPhaseView`
- `DynamicWorkflowRunSubagentAsk` (InterfaceDeclaration) — `DynamicWorkflowRunSubagentAsk`
- `DynamicWorkflowRunSubagentLastTool` (InterfaceDeclaration) — `DynamicWorkflowRunSubagentLastTool`
- `DynamicWorkflowRunSubagentState` (TypeAliasDeclaration) — `"failed" | "idle" | "waiting" | "done" | "unfinished" | "executing" | "parked"`
- `DynamicWorkflowRunSubagentView` (InterfaceDeclaration) — `DynamicWorkflowRunSubagentView`
- `DynamicWorkflowRunSubagentWait` (InterfaceDeclaration) — `DynamicWorkflowRunSubagentWait`

### `interfaces/dynamic-workflow-run.port.ts`

- `boundDynamicWorkflowRunEventPayload` (FunctionDeclaration) — `export function boundDynamicWorkflowRunEventPayload(payload: Record<string, unknown>): { payload: Record<string, unknown>; truncated: boolean; } { let truncated = false; const markTruncated = (): void`
- `DYNAMIC_WORKFLOW_RUN_EVENT_PAYLOAD_LIMITS` (VariableDeclaration) — `{ readonly maxStringLength: 2048; readonly maxArrayItems: 32; readonly maxKeys: 32; readonly maxDepth: 6; }`
- `DynamicWorkflowResolveQuestionRefusalReason` (TypeAliasDeclaration) — `"unknown_question" | "already_resolved" | "run_not_in_flight"`
- `DynamicWorkflowResolveQuestionResult` (TypeAliasDeclaration) — `{ ok: true; qid: string; } | { ok: false; reason: DynamicWorkflowResolveQuestionRefusalReason; message: string; }`
- `DynamicWorkflowRunActor` (InterfaceDeclaration) — `DynamicWorkflowRunActor`
- `DynamicWorkflowRunAmendRefusalReason` (TypeAliasDeclaration) — `"run_not_found" | "missing_boundaries"`
- `DynamicWorkflowRunAmendRequest` (InterfaceDeclaration) — `DynamicWorkflowRunAmendRequest`
- `DynamicWorkflowRunAmendResult` (TypeAliasDeclaration) — `{ ok: true; runId: string; supersededRunId?: string; } | { ok: false; reason: DynamicWorkflowRunAmendRefusalReason; }`
- `DynamicWorkflowRunArtifact` (InterfaceDeclaration) — `DynamicWorkflowRunArtifact`
- `DynamicWorkflowRunArtifactBytes` (InterfaceDeclaration) — `DynamicWorkflowRunArtifactBytes`
- `DynamicWorkflowRunArtifactItem` (InterfaceDeclaration) — `DynamicWorkflowRunArtifactItem`
- `DynamicWorkflowRunArtifactItemPage` (InterfaceDeclaration) — `DynamicWorkflowRunArtifactItemPage`
- `DynamicWorkflowRunArtifactKind` (TypeAliasDeclaration) — `"file" | "markdown" | "chart" | "table" | "metrics" | "board"`
- `DynamicWorkflowRunArtifactVersion` (InterfaceDeclaration) — `DynamicWorkflowRunArtifactVersion`
- `DynamicWorkflowRunCancelInitiator` (TypeAliasDeclaration) — `"user" | "model" | { superseded: string; }`
- `DynamicWorkflowRunConcurrencyHealth` (InterfaceDeclaration) — `DynamicWorkflowRunConcurrencyHealth`
- `DynamicWorkflowRunDetail` (InterfaceDeclaration) — `DynamicWorkflowRunDetail`
- `DynamicWorkflowRunError` (InterfaceDeclaration) — `DynamicWorkflowRunError`
- `DynamicWorkflowRunEvent` (InterfaceDeclaration) — `DynamicWorkflowRunEvent`
- `DynamicWorkflowRunEventPage` (InterfaceDeclaration) — `DynamicWorkflowRunEventPage`
- `DynamicWorkflowRunHealth` (InterfaceDeclaration) — `DynamicWorkflowRunHealth`
- `DynamicWorkflowRunLifecycleStatus` (TypeAliasDeclaration) — `"completed" | "running" | "pending" | "errored" | "stopped"`
- `DynamicWorkflowRunListItem` (InterfaceDeclaration) — `DynamicWorkflowRunListItem`
- `DynamicWorkflowRunListQuery` (InterfaceDeclaration) — `DynamicWorkflowRunListQuery`
- `DynamicWorkflowRunListResult` (InterfaceDeclaration) — `DynamicWorkflowRunListResult`
- `DynamicWorkflowRunLogEntry` (InterfaceDeclaration) — `DynamicWorkflowRunLogEntry`
- `DynamicWorkflowRunPendingQuestion` (InterfaceDeclaration) — `DynamicWorkflowRunPendingQuestion`
- `DynamicWorkflowRunPhaseState` (TypeAliasDeclaration) — `"done" | "current" | "ahead" | "unfinished"`
- `DynamicWorkflowRunPhaseView` (InterfaceDeclaration) — `DynamicWorkflowRunPhaseView`
- `DynamicWorkflowRunPort` (InterfaceDeclaration) — `DynamicWorkflowRunPort`
- `DynamicWorkflowRunProviderStop` (InterfaceDeclaration) — `DynamicWorkflowRunProviderStop`
- `DynamicWorkflowRunResumeErrorReason` (TypeAliasDeclaration) — `"superseded" | "not_found" | "not_resumable" | "already_running" | "script_missing" | "script_mismatch" | "compile_failed"`
- `DynamicWorkflowRunResumeResult` (TypeAliasDeclaration) — `{ ok: true; runId: string; toolCallId?: string; } | { ok: false; reason: DynamicWorkflowRunResumeErrorReason; message?: string; }`
- `DynamicWorkflowRunSessionSummary` (InterfaceDeclaration) — `DynamicWorkflowRunSessionSummary`
- `DynamicWorkflowRunSnapshot` (TypeAliasDeclaration) — `Omit<WorkflowTaskSnapshot, "output"> & { output?: unknown; runStatus?: DynamicWorkflowRunLifecycleStatus; stopReason?: DynamicWorkflowRunStopReason; parentSessionId?: string; resumedFrom?: string; sup`
- `DynamicWorkflowRunStopReason` (TypeAliasDeclaration) — `"user" | "model" | "interrupted" | "provider" | "superseded"`
- `DynamicWorkflowRunSubagentAsk` (InterfaceDeclaration) — `DynamicWorkflowRunSubagentAsk`
- `DynamicWorkflowRunSubagentLastTool` (InterfaceDeclaration) — `DynamicWorkflowRunSubagentLastTool`
- `DynamicWorkflowRunSubagentState` (TypeAliasDeclaration) — `"failed" | "idle" | "waiting" | "done" | "unfinished" | "executing" | "parked"`
- `DynamicWorkflowRunSubagentView` (InterfaceDeclaration) — `DynamicWorkflowRunSubagentView`
- `DynamicWorkflowRunSubagentWait` (InterfaceDeclaration) — `DynamicWorkflowRunSubagentWait`
- `DynamicWorkflowRunSubmitOptions` (InterfaceDeclaration) — `DynamicWorkflowRunSubmitOptions`
- `DynamicWorkflowRunSubmitRequest` (InterfaceDeclaration) — `DynamicWorkflowRunSubmitRequest`
- `DynamicWorkflowRunSubmitResult` (TypeAliasDeclaration) — `{ ok: true; runId: string; }`
- `DynamicWorkflowRunSummary` (InterfaceDeclaration) — `DynamicWorkflowRunSummary`
- `DynamicWorkflowRunUsage` (InterfaceDeclaration) — `DynamicWorkflowRunUsage`
- `DynamicWorkflowRunWaitOptions` (InterfaceDeclaration) — `DynamicWorkflowRunWaitOptions`
- `DynamicWorkflowRunWorkspaceNode` (InterfaceDeclaration) — `DynamicWorkflowRunWorkspaceNode`
- `DynamicWorkflowRunWorkspaceNodeKind` (TypeAliasDeclaration) — `"world-read" | "world-run"`
- `DynamicWorkflowRunWorkspaceNodeResult` (InterfaceDeclaration) — `DynamicWorkflowRunWorkspaceNodeResult`
- `DynamicWorkflowRunWorkspaceNodeResultQuery` (InterfaceDeclaration) — `DynamicWorkflowRunWorkspaceNodeResultQuery`
- `DynamicWorkflowRunWorkspaceNodeStatus` (TypeAliasDeclaration) — `"completed" | "failed" | "running"`
- `DynamicWorkflowRunWorkspaceNodeSummary` (InterfaceDeclaration) — `DynamicWorkflowRunWorkspaceNodeSummary`
- `serializeWorkflowArtifact` (FunctionDeclaration) — `export function serializeWorkflowArtifact(value: unknown): string | undefined { if (value === undefined) return undefined; if (typeof value === "string") return value; try { // JSON.stringify 对 undefi`

### `interfaces/dynamic-workflow-snippet.port.ts`

- `DynamicWorkflowSnippetDiagnostic` (InterfaceDeclaration) — `DynamicWorkflowSnippetDiagnostic`
- `DynamicWorkflowSnippetEvalOptions` (InterfaceDeclaration) — `DynamicWorkflowSnippetEvalOptions`
- `DynamicWorkflowSnippetEvalRequest` (InterfaceDeclaration) — `DynamicWorkflowSnippetEvalRequest`
- `DynamicWorkflowSnippetEvalResult` (TypeAliasDeclaration) — `{ kind: "diagnostics"; diagnostics: DynamicWorkflowSnippetDiagnostic[]; } | { kind: "completed"; artifact?: unknown; logs: string[]; logsTruncated: boolean; } | { kind: "failed"; error: { code: string`
- `DynamicWorkflowSnippetPort` (InterfaceDeclaration) — `DynamicWorkflowSnippetPort`

### `interfaces/execution.port.ts`

- `BackgroundExecutionSnapshot` (InterfaceDeclaration) — `BackgroundExecutionSnapshot`
- `BackgroundExecutionStartResult` (InterfaceDeclaration) — `BackgroundExecutionStartResult`
- `BackgroundExecutionStatus` (TypeAliasDeclaration) — `"running" | ExecutionStatus`
- `EmbeddedSearchArgv0DispatchBackend` (InterfaceDeclaration) — `EmbeddedSearchArgv0DispatchBackend`
- `EmbeddedSearchBackend` (TypeAliasDeclaration) — `EmbeddedSearchArgv0DispatchBackend | EmbeddedSearchInternalCliBackend | EmbeddedSearchNativeBinariesBackend`
- `EmbeddedSearchInternalCliBackend` (InterfaceDeclaration) — `EmbeddedSearchInternalCliBackend`
- `EmbeddedSearchNativeBinariesBackend` (InterfaceDeclaration) — `EmbeddedSearchNativeBinariesBackend`
- `ExecutionCommand` (TypeAliasDeclaration) — `{ mode: "argv"; file: string; args?: string[]; } | { mode: "shell"; command: string; shell?: true | string; shellProfile?: "posix-bash"; shellOverride?: ExecutionShellSelection; }`
- `ExecutionEmbeddedSearchPrelude` (InterfaceDeclaration) — `ExecutionEmbeddedSearchPrelude`
- `ExecutionEnvBase` (TypeAliasDeclaration) — `"inherit" | "empty"`
- `ExecutionEnvOverlay` (InterfaceDeclaration) — `ExecutionEnvOverlay`
- `ExecutionEvent` (TypeAliasDeclaration) — `{ type: "started"; pid?: number; timestamp: Date; } | { type: "stdout" | "stderr"; chunk: Uint8Array; text: string; timestamp: Date; } | { type: "progress"; elapsedMs: number; pid?: number; stdoutByte`
- `ExecutionFailure` (InterfaceDeclaration) — `ExecutionFailure`
- `ExecutionFailureType` (TypeAliasDeclaration) — `"unknown" | "cancelled" | "spawn_error" | "timeout" | "sandbox_violation" | "output_limit"`
- `ExecutionOutputLimit` (InterfaceDeclaration) — `ExecutionOutputLimit`
- `ExecutionOutputPreview` (InterfaceDeclaration) — `ExecutionOutputPreview`
- `ExecutionPort` (InterfaceDeclaration) — `ExecutionPort`
- `ExecutionRequest` (InterfaceDeclaration) — `ExecutionRequest`
- `ExecutionResult` (InterfaceDeclaration) — `ExecutionResult`
- `ExecutionRunOptions` (InterfaceDeclaration) — `ExecutionRunOptions`
- `ExecutionSandboxPolicy` (InterfaceDeclaration) — `ExecutionSandboxPolicy`
- `ExecutionShellDialect` (TypeAliasDeclaration) — `"cmd" | "posix" | "git-bash"`
- `ExecutionShellDisplay` (InterfaceDeclaration) — `ExecutionShellDisplay`
- `ExecutionShellOverride` (TypeAliasDeclaration) — `ExecutionShellSelection`
- `ExecutionShellSelection` (InterfaceDeclaration) — `ExecutionShellSelection`
- `ExecutionShellSource` (TypeAliasDeclaration) — `"auto-detected" | "user-config" | "legacy-fallback"`
- `ExecutionStatus` (TypeAliasDeclaration) — `"cancelled" | "completed" | "failed" | "timed_out" | "spawn_error"`
- `ExecutionStreamResult` (InterfaceDeclaration) — `ExecutionStreamResult`

### `interfaces/file-system.port.ts`

- `createFileSystemError` (FunctionDeclaration) — `export function createFileSystemError(details: FileSystemErrorDetails): FileSystemPortError { return new FileSystemPortError(details); }`
- `FileSystemCreateDirectoryRequest` (InterfaceDeclaration) — `FileSystemCreateDirectoryRequest`
- `FileSystemCreateDirectoryResult` (InterfaceDeclaration) — `FileSystemCreateDirectoryResult`
- `FileSystemErrorCode` (TypeAliasDeclaration) — `"cancelled" | "permission_denied" | "not_found" | "is_directory" | "not_file" | "too_large" | "stale_write" | "invalid_path" | "invalid_pattern" | "unsupported" | "io_error"`
- `FileSystemErrorDetails` (InterfaceDeclaration) — `FileSystemErrorDetails`
- `FileSystemLineEndings` (TypeAliasDeclaration) — `"LF" | "CRLF"`
- `FileSystemListDirectoryEntry` (InterfaceDeclaration) — `FileSystemListDirectoryEntry`
- `FileSystemListDirectoryRequest` (InterfaceDeclaration) — `FileSystemListDirectoryRequest`
- `FileSystemListDirectoryResult` (InterfaceDeclaration) — `FileSystemListDirectoryResult`
- `FileSystemNodeKind` (TypeAliasDeclaration) — `"file" | "directory" | "symlink" | "other" | "missing"`
- `FileSystemOperationOptions` (InterfaceDeclaration) — `FileSystemOperationOptions`
- `FileSystemPort` (InterfaceDeclaration) — `FileSystemPort`
- `FileSystemPortError` (ClassDeclaration) — `FileSystemPortError`
- `FileSystemReadBytesRequest` (InterfaceDeclaration) — `FileSystemReadBytesRequest`
- `FileSystemReadBytesResult` (InterfaceDeclaration) — `FileSystemReadBytesResult`
- `FileSystemReadTextRangeRequest` (InterfaceDeclaration) — `FileSystemReadTextRangeRequest`
- `FileSystemReadTextRangeResult` (InterfaceDeclaration) — `FileSystemReadTextRangeResult`
- `FileSystemReadTextRequest` (InterfaceDeclaration) — `FileSystemReadTextRequest`
- `FileSystemReadTextResult` (InterfaceDeclaration) — `FileSystemReadTextResult`
- `FileSystemRemoveFileRequest` (InterfaceDeclaration) — `FileSystemRemoveFileRequest`
- `FileSystemRemoveFileResult` (InterfaceDeclaration) — `FileSystemRemoveFileResult`
- `FileSystemRevision` (InterfaceDeclaration) — `FileSystemRevision`
- `FileSystemSearchFilesRequest` (InterfaceDeclaration) — `FileSystemSearchFilesRequest`
- `FileSystemSearchFilesResult` (InterfaceDeclaration) — `FileSystemSearchFilesResult`
- `FileSystemSearchTextEntry` (InterfaceDeclaration) — `FileSystemSearchTextEntry`
- `FileSystemSearchTextRequest` (InterfaceDeclaration) — `FileSystemSearchTextRequest`
- `FileSystemSearchTextResult` (InterfaceDeclaration) — `FileSystemSearchTextResult`
- `FileSystemStatRequest` (InterfaceDeclaration) — `FileSystemStatRequest`
- `FileSystemStatResult` (InterfaceDeclaration) — `FileSystemStatResult`
- `FileSystemTextEncoding` (TypeAliasDeclaration) — `BufferEncoding | "gb2312" | "gbk" | "gb18030"`
- `FileSystemTextSearchOutputMode` (TypeAliasDeclaration) — `"content" | "files_with_matches" | "count"`
- `FileSystemWriteTextRequest` (InterfaceDeclaration) — `FileSystemWriteTextRequest`
- `FileSystemWriteTextResult` (InterfaceDeclaration) — `FileSystemWriteTextResult`
- `isFileSystemPortError` (FunctionDeclaration) — `export function isFileSystemPortError(error: unknown): error is FileSystemPortError { return error instanceof FileSystemPortError; }`

### `interfaces/http-client.port.ts`

- `createHttpClientError` (FunctionDeclaration) — `export function createHttpClientError(details: HttpClientErrorDetails): HttpClientPortError { return new HttpClientPortError(details); }`
- `HttpClientEgressInfo` (InterfaceDeclaration) — `HttpClientEgressInfo`
- `HttpClientEgressPolicy` (TypeAliasDeclaration) — `"public"`
- `HttpClientErrorCode` (TypeAliasDeclaration) — `"cancelled" | "timeout" | "too_large" | "invalid_url" | "unsupported_protocol" | "egress_blocked" | "network_error" | "proxy_error"`
- `HttpClientErrorDetails` (InterfaceDeclaration) — `HttpClientErrorDetails`
- `HttpClientMethod` (TypeAliasDeclaration) — `"GET" | "HEAD" | "POST"`
- `HttpClientPort` (InterfaceDeclaration) — `HttpClientPort`
- `HttpClientPortError` (ClassDeclaration) — `HttpClientPortError`
- `HttpClientRedirectPolicy` (TypeAliasDeclaration) — `"manual" | "follow"`
- `HttpClientRequest` (InterfaceDeclaration) — `HttpClientRequest`
- `HttpClientResponse` (InterfaceDeclaration) — `HttpClientResponse`
- `HttpClientRunOptions` (InterfaceDeclaration) — `HttpClientRunOptions`
- `isHttpClientPortError` (FunctionDeclaration) — `export function isHttpClientPortError(error: unknown): error is HttpClientPortError { return error instanceof HttpClientPortError; }`

### `interfaces/image-processor.port.ts`

- `createImageProcessorError` (FunctionDeclaration) — `export function createImageProcessorError( details: ImageProcessorErrorDetails, ): ImageProcessorPortError { return new ImageProcessorPortError(details); }`
- `ImageCompressionStrategy` (TypeAliasDeclaration) — `"original" | "preserve-format" | "png-optimized" | "png-quantized" | "resized" | "jpeg-quality" | "jpeg-fallback"`
- `ImagePrepareForModelRequest` (InterfaceDeclaration) — `ImagePrepareForModelRequest`
- `ImagePrepareForModelResult` (InterfaceDeclaration) — `ImagePrepareForModelResult`
- `ImageProcessorErrorCode` (TypeAliasDeclaration) — `"empty" | "too_large" | "unsupported" | "invalid_request" | "processing_failed"`
- `ImageProcessorErrorDetails` (InterfaceDeclaration) — `ImageProcessorErrorDetails`
- `ImageProcessorPort` (InterfaceDeclaration) — `ImageProcessorPort`
- `ImageProcessorPortError` (ClassDeclaration) — `ImageProcessorPortError`
- `ImageResizeRequest` (InterfaceDeclaration) — `ImageResizeRequest`
- `ImageResizeResult` (InterfaceDeclaration) — `ImageResizeResult`
- `isImageProcessorPortError` (FunctionDeclaration) — `export function isImageProcessorPortError(error: unknown): error is ImageProcessorPortError { return error instanceof ImageProcessorPortError; }`

### `interfaces/index.ts`

- `ActiveToolCall` (InterfaceDeclaration) — `ActiveToolCall`
- `AgentPart` (InterfaceDeclaration) — `AgentPart`
- `AppUsageDayModelRow` (InterfaceDeclaration) — `AppUsageDayModelRow`
- `AppUsageDayRow` (InterfaceDeclaration) — `AppUsageDayRow`
- `AppUsageModelRow` (InterfaceDeclaration) — `AppUsageModelRow`
- `AppUsageQueryInput` (InterfaceDeclaration) — `AppUsageQueryInput`
- `AppUsageQueryResult` (InterfaceDeclaration) — `AppUsageQueryResult`
- `AppUsageToolRow` (InterfaceDeclaration) — `AppUsageToolRow`
- `AppUsageToolTotalsRow` (InterfaceDeclaration) — `AppUsageToolTotalsRow`
- `AppUsageTotalsRow` (InterfaceDeclaration) — `AppUsageTotalsRow`
- `AppUsageTurnTotalsRow` (InterfaceDeclaration) — `AppUsageTurnTotalsRow`
- `AssistantErrorInfo` (InterfaceDeclaration) — `AssistantErrorInfo`
- `AssistantMessageInfo` (InterfaceDeclaration) — `AssistantMessageInfo`
- `AttachmentStorageMetadata` (InterfaceDeclaration) — `AttachmentStorageMetadata`
- `AUTOMATION_CREATE_LIMIT_ERROR_CODE` (VariableDeclaration) — `"AUTOMATION_CREATE_LIMIT_REACHED"`
- `AutomationCreateContext` (InterfaceDeclaration) — `AutomationCreateContext`
- `AutomationCreateLimitError` (ClassDeclaration) — `AutomationCreateLimitError`
- `AutomationPort` (InterfaceDeclaration) — `AutomationPort`
- `BackgroundExecutionSnapshot` (InterfaceDeclaration) — `BackgroundExecutionSnapshot`
- `BackgroundExecutionStartResult` (InterfaceDeclaration) — `BackgroundExecutionStartResult`
- `BackgroundExecutionStatus` (TypeAliasDeclaration) — `"running" | ExecutionStatus`
- `BackgroundTaskCancelResult` (InterfaceDeclaration) — `BackgroundTaskCancelResult`
- `BackgroundTaskInfo` (InterfaceDeclaration) — `BackgroundTaskInfo`
- `BackgroundTaskInfoStatus` (TypeAliasDeclaration) — `"cancelled" | "completed" | "failed" | "running" | "timed_out" | "spawn_error" | "lost"`
- `boundDynamicWorkflowRunEventPayload` (FunctionDeclaration) — `export function boundDynamicWorkflowRunEventPayload(payload: Record<string, unknown>): { payload: Record<string, unknown>; truncated: boolean; } { let truncated = false; const markTruncated = (): void`
- `BROWSER_VIEWPORT_LIMITS` (VariableDeclaration) — `{ readonly minWidth: 320; readonly maxWidth: 3840; readonly minHeight: 320; readonly maxHeight: 2160; }`
- `BrowserBackendDescriptor` (TypeAliasDeclaration) — `{ id: string; generation: number; type: "iab" | "extension" | "cdp"; name: string; capabilities: { browser?: { id: string; description: string; }[] | undefined; tab?: { id: string; description: string`
- `BrowserBackendListResult` (TypeAliasDeclaration) — `{ browsers: { id: string; generation: number; type: "iab" | "extension" | "cdp"; name: string; capabilities: { browser?: { id: string; description: string; }[] | undefined; tab?: { id: string; descrip`
- `BrowserBackendType` (TypeAliasDeclaration) — `"iab" | "extension" | "cdp"`
- `BrowserCapabilityDescriptor` (TypeAliasDeclaration) — `{ id: string; description: string; }`
- `BrowserClientMode` (TypeAliasDeclaration) — `"desktop-continuous" | "web-remote-replayable"`
- `BrowserCommand` (TypeAliasDeclaration) — `{ ref: string; value: string; method: "fill"; tabId?: string | undefined; } | { text: string; method: "type"; tabId?: string | undefined; ref?: string | undefined; } | { method: "back"; tabId?: string`
- `BrowserCommandMethod` (TypeAliasDeclaration) — `"fill" | "type" | "back" | "check" | "capabilities" | "navigate" | "forward" | "reload" | "snapshot" | "click" | "press" | "cuaKeypress" | "scroll" | "cuaScroll" | "domCuaScroll" | "hover" | "select" `
- `BrowserCommandResult` (TypeAliasDeclaration) — `{ ok: boolean; elapsedMs: number; state?: { url: string; title: string; canGoBack: boolean; canGoForward: boolean; scrollX?: number | undefined; scrollY?: number | undefined; viewportWidth?: number | `
- `BrowserControlExecuteInput` (InterfaceDeclaration) — `BrowserControlExecuteInput`
- `BrowserControlListInput` (InterfaceDeclaration) — `BrowserControlListInput`
- `BrowserControlPort` (InterfaceDeclaration) — `BrowserControlPort`
- `BrowserDialog` (TypeAliasDeclaration) — `{ type: "alert" | "confirm" | "prompt" | "beforeunload"; message: string; defaultPrompt?: string | undefined; }`
- `BrowserDiscoveryContext` (TypeAliasDeclaration) — `{ requestId: string; workspaceKey: string; workspacePath: string; sessionId: string; clientMode: "desktop-continuous" | "web-remote-replayable"; sessionContext: "live" | "cached"; workspaceIdentity?: `
- `BrowserErrorCode` (TypeAliasDeclaration) — `"cancelled" | "timeout" | "backend_unavailable" | "capability_unsupported" | "duplicate_request_id" | "ref_not_found" | "navigation_blocked" | "renderer_unreachable" | "execution_error"`
- `BrowserKeyModifier` (TypeAliasDeclaration) — `"Alt" | "Control" | "ControlOrMeta" | "Meta" | "Shift"`
- `BrowserMouseButton` (TypeAliasDeclaration) — `"left" | "right" | "middle"`
- `BrowserPageState` (TypeAliasDeclaration) — `{ url: string; title: string; canGoBack: boolean; canGoForward: boolean; scrollX?: number | undefined; scrollY?: number | undefined; viewportWidth?: number | undefined; viewportHeight?: number | undef`
- `BrowserPlaywrightAction` (TypeAliasDeclaration) — `{ x: number; y: number; name: "elementInfo"; includeNonInteractable?: boolean | undefined; } | { expression: string; expressionKind: "string" | "function"; name: "evaluate"; timeoutMs?: number | undef`
- `BrowserPlaywrightLocatorOperation` (TypeAliasDeclaration) — `"fill" | "count" | "click" | "press" | "evaluate" | "waitFor" | "allTextContents" | "dblclick" | "downloadMedia" | "getAttribute" | "innerText" | "isEnabled" | "isVisible" | "selectOption" | "setCheck`
- `BrowserPlaywrightModifier` (TypeAliasDeclaration) — `"Alt" | "Control" | "ControlOrMeta" | "Meta" | "Shift"`
- `BrowserPoint` (TypeAliasDeclaration) — `{ x: number; y: number; }`
- `BrowserRecordingAction` (TypeAliasDeclaration) — `{ selector: string; text: string; type: "type"; delayAfterMs?: number | undefined; } | { type: "click"; delayAfterMs?: number | undefined; button?: "left" | "right" | "middle" | undefined; doubleClick`
- `BrowserRecordingArtifact` (TypeAliasDeclaration) — `{ fps: number; durationMs: number; frameCount: number; width: number; height: number; path: string; mimeType: "video/webm"; }`
- `BrowserRecordingJob` (TypeAliasDeclaration) — `{ id: string; status: "cancelled" | "completed" | "failed" | "running"; phase: "cancelled" | "completed" | "failed" | "preparing" | "capturing" | "finalizing"; progress: number; startedAt: number; upd`
- `BrowserRecordingOptions` (TypeAliasDeclaration) — `{ viewport?: { width: number; height: number; } | undefined; fps?: number | undefined; jpegQuality?: number | undefined; maxDurationMs?: number | undefined; settleMs?: number | undefined; showCursor?:`
- `BrowserResponseMeta` (TypeAliasDeclaration) — `{ browserUse: true; backendType: "iab" | "extension" | "cdp"; browserId: string; browserGeneration: number; openTabIds: string[]; tabId?: string | undefined; currentUrl?: string | undefined; lifecycle`
- `BrowserSessionContext` (TypeAliasDeclaration) — `{ browserId: string; browserGeneration: number; requestId: string; workspaceKey: string; workspacePath: string; sessionId: string; clientMode: "desktop-continuous" | "web-remote-replayable"; sessionCo`
- `BrowserSessionContextKind` (TypeAliasDeclaration) — `"live" | "cached"`
- `BrowserSnapshot` (TypeAliasDeclaration) — `{ elements: { selector: string; xpath: string; rect: { x: number; y: number; width: number; height: number; }; inViewport: boolean; ref: string; tag: string; value?: string | undefined; disabled?: boo`
- `BrowserSnapshotDomNode` (TypeAliasDeclaration) — `{ tag: string; depth: number; inViewport: boolean; attributes?: Record<string, string> | undefined; role?: string | undefined; name?: string | undefined; text?: string | undefined; ref?: string | unde`
- `BrowserSnapshotElement` (TypeAliasDeclaration) — `{ selector: string; xpath: string; rect: { x: number; y: number; width: number; height: number; }; inViewport: boolean; ref: string; tag: string; value?: string | undefined; disabled?: boolean | undef`
- `BrowserTabSummary` (TypeAliasDeclaration) — `{ tabId: string; url: string; title: string; viewport: { width: number; height: number; }; active?: boolean | undefined; lifecycle?: "handoff" | "deliverable" | "active" | undefined; }`
- `BrowserUserTabInfo` (TypeAliasDeclaration) — `{ id: string; lastOpened?: string | undefined; tabGroup?: string | undefined; title?: string | undefined; url?: string | undefined; }`
- `BrowserViewportSize` (TypeAliasDeclaration) — `{ width: number; height: number; }`
- `ClaimLegacySessionWorkspaceInput` (InterfaceDeclaration) — `ClaimLegacySessionWorkspaceInput`
- `CollaborationMode` (TypeAliasDeclaration) — `"auto" | "plan" | "build" | "edit" | "yolo"`
- `CompactionPart` (InterfaceDeclaration) — `CompactionPart`
- `ContextCompactionTimelinePart` (InterfaceDeclaration) — `ContextCompactionTimelinePart`
- `ContextSourceDiagnostic` (InterfaceDeclaration) — `ContextSourceDiagnostic`
- `ContextSourcePort` (InterfaceDeclaration) — `ContextSourcePort`
- `ContextSourceRequest` (InterfaceDeclaration) — `ContextSourceRequest`
- `ContextSourceResolveOptions` (InterfaceDeclaration) — `ContextSourceResolveOptions`
- `ContextSourceSnapshot` (InterfaceDeclaration) — `ContextSourceSnapshot`
- `createEventId` (FunctionDeclaration) — `export function createEventId(id?: string): EventId { return `evt\_${id ?? crypto.randomUUID()}` as EventId; }`
- `createFileSystemError` (FunctionDeclaration) — `export function createFileSystemError(details: FileSystemErrorDetails): FileSystemPortError { return new FileSystemPortError(details); }`
- `createHttpClientError` (FunctionDeclaration) — `export function createHttpClientError(details: HttpClientErrorDetails): HttpClientPortError { return new HttpClientPortError(details); }`
- `createImageProcessorError` (FunctionDeclaration) — `export function createImageProcessorError( details: ImageProcessorErrorDetails, ): ImageProcessorPortError { return new ImageProcessorPortError(details); }`
- `createInputHistoryId` (FunctionDeclaration) — `export function createInputHistoryId(id?: string): InputHistoryId { return `input\_${id ?? createSortableIdSegment()}` as InputHistoryId; }`
- `createMessageId` (FunctionDeclaration) — `export function createMessageId(id?: string): MessageId { return `msg\_${id ?? createSortableIdSegment()}` as MessageId; }`
- `createPartId` (FunctionDeclaration) — `export function createPartId(id?: string): PartId { return `part\_${id ?? createSortableIdSegment()}` as PartId; }`
- `createProjectId` (FunctionDeclaration) — `export function createProjectId(id?: string): ProjectId { return `proj\_${id ?? crypto.randomUUID()}` as ProjectId; }`
- `createQueryId` (FunctionDeclaration) — `export function createQueryId(id?: string): QueryId { return `query\_${id ?? crypto.randomUUID()}` as QueryId; }`
- `createSessionId` (FunctionDeclaration) — `export function createSessionId(id?: string): SessionId { return `sess\_${id ?? crypto.randomUUID()}` as SessionId; }`
- `CreateSessionInput` (InterfaceDeclaration) — `CreateSessionInput`
- `createToolCallId` (FunctionDeclaration) — `export function createToolCallId(id?: string): ToolCallId { return `tool\_${id ?? crypto.randomUUID()}` as ToolCallId; }`
- `createTraceId` (FunctionDeclaration) — `export function createTraceId(): TraceId { return crypto.randomUUID() as TraceId; }`
- `createTurnId` (FunctionDeclaration) — `export function createTurnId(id?: string): TurnId { return `turn\_${id ?? crypto.randomUUID()}` as TurnId; }`
- `createWorkspaceId` (FunctionDeclaration) — `export function createWorkspaceId(id?: string): WorkspaceId { return `ws\_${id ?? crypto.randomUUID()}` as WorkspaceId; }`
- `DYNAMIC_WORKFLOW_RUN_EVENT_PAYLOAD_LIMITS` (VariableDeclaration) — `{ readonly maxStringLength: 2048; readonly maxArrayItems: 32; readonly maxKeys: 32; readonly maxDepth: 6; }`
- `DynamicWorkflowResolveQuestionRefusalReason` (TypeAliasDeclaration) — `"unknown_question" | "already_resolved" | "run_not_in_flight"`
- `DynamicWorkflowResolveQuestionResult` (TypeAliasDeclaration) — `{ ok: true; qid: string; } | { ok: false; reason: DynamicWorkflowResolveQuestionRefusalReason; message: string; }`
- `DynamicWorkflowRunActor` (InterfaceDeclaration) — `DynamicWorkflowRunActor`
- `DynamicWorkflowRunAmendRefusalReason` (TypeAliasDeclaration) — `"run_not_found" | "missing_boundaries"`
- `DynamicWorkflowRunAmendRequest` (InterfaceDeclaration) — `DynamicWorkflowRunAmendRequest`
- `DynamicWorkflowRunAmendResult` (TypeAliasDeclaration) — `{ ok: true; runId: string; supersededRunId?: string; } | { ok: false; reason: DynamicWorkflowRunAmendRefusalReason; }`
- `DynamicWorkflowRunArtifact` (InterfaceDeclaration) — `DynamicWorkflowRunArtifact`
- `DynamicWorkflowRunArtifactBytes` (InterfaceDeclaration) — `DynamicWorkflowRunArtifactBytes`
- `DynamicWorkflowRunArtifactItem` (InterfaceDeclaration) — `DynamicWorkflowRunArtifactItem`
- `DynamicWorkflowRunArtifactItemPage` (InterfaceDeclaration) — `DynamicWorkflowRunArtifactItemPage`
- `DynamicWorkflowRunArtifactKind` (TypeAliasDeclaration) — `"file" | "markdown" | "chart" | "table" | "metrics" | "board"`
- `DynamicWorkflowRunArtifactVersion` (InterfaceDeclaration) — `DynamicWorkflowRunArtifactVersion`
- `DynamicWorkflowRunCancelInitiator` (TypeAliasDeclaration) — `"user" | "model" | { superseded: string; }`
- `DynamicWorkflowRunConcurrencyHealth` (InterfaceDeclaration) — `DynamicWorkflowRunConcurrencyHealth`
- `DynamicWorkflowRunDetail` (InterfaceDeclaration) — `DynamicWorkflowRunDetail`
- `DynamicWorkflowRunError` (InterfaceDeclaration) — `DynamicWorkflowRunError`
- `DynamicWorkflowRunEvent` (InterfaceDeclaration) — `DynamicWorkflowRunEvent`
- `DynamicWorkflowRunEventPage` (InterfaceDeclaration) — `DynamicWorkflowRunEventPage`
- `DynamicWorkflowRunHealth` (InterfaceDeclaration) — `DynamicWorkflowRunHealth`
- `DynamicWorkflowRunLifecycleStatus` (TypeAliasDeclaration) — `"completed" | "running" | "pending" | "errored" | "stopped"`
- `DynamicWorkflowRunListItem` (InterfaceDeclaration) — `DynamicWorkflowRunListItem`
- `DynamicWorkflowRunListQuery` (InterfaceDeclaration) — `DynamicWorkflowRunListQuery`
- `DynamicWorkflowRunListResult` (InterfaceDeclaration) — `DynamicWorkflowRunListResult`
- `DynamicWorkflowRunLogEntry` (InterfaceDeclaration) — `DynamicWorkflowRunLogEntry`
- `DynamicWorkflowRunPendingQuestion` (InterfaceDeclaration) — `DynamicWorkflowRunPendingQuestion`
- `DynamicWorkflowRunPhaseState` (TypeAliasDeclaration) — `"done" | "current" | "ahead" | "unfinished"`
- `DynamicWorkflowRunPhaseView` (InterfaceDeclaration) — `DynamicWorkflowRunPhaseView`
- `DynamicWorkflowRunPort` (InterfaceDeclaration) — `DynamicWorkflowRunPort`
- `DynamicWorkflowRunProviderStop` (InterfaceDeclaration) — `DynamicWorkflowRunProviderStop`
- `DynamicWorkflowRunResumeErrorReason` (TypeAliasDeclaration) — `"superseded" | "not_found" | "not_resumable" | "already_running" | "script_missing" | "script_mismatch" | "compile_failed"`
- `DynamicWorkflowRunResumeResult` (TypeAliasDeclaration) — `{ ok: true; runId: string; toolCallId?: string; } | { ok: false; reason: DynamicWorkflowRunResumeErrorReason; message?: string; }`
- `DynamicWorkflowRunSessionSummary` (InterfaceDeclaration) — `DynamicWorkflowRunSessionSummary`
- `DynamicWorkflowRunSnapshot` (TypeAliasDeclaration) — `Omit<WorkflowTaskSnapshot, "output"> & { output?: unknown; runStatus?: DynamicWorkflowRunLifecycleStatus; stopReason?: DynamicWorkflowRunStopReason; parentSessionId?: string; resumedFrom?: string; sup`
- `DynamicWorkflowRunStopReason` (TypeAliasDeclaration) — `"user" | "model" | "interrupted" | "provider" | "superseded"`
- `DynamicWorkflowRunSubagentAsk` (InterfaceDeclaration) — `DynamicWorkflowRunSubagentAsk`
- `DynamicWorkflowRunSubagentLastTool` (InterfaceDeclaration) — `DynamicWorkflowRunSubagentLastTool`
- `DynamicWorkflowRunSubagentState` (TypeAliasDeclaration) — `"failed" | "idle" | "waiting" | "done" | "unfinished" | "executing" | "parked"`
- `DynamicWorkflowRunSubagentView` (InterfaceDeclaration) — `DynamicWorkflowRunSubagentView`
- `DynamicWorkflowRunSubagentWait` (InterfaceDeclaration) — `DynamicWorkflowRunSubagentWait`
- `DynamicWorkflowRunSubmitOptions` (InterfaceDeclaration) — `DynamicWorkflowRunSubmitOptions`
- `DynamicWorkflowRunSubmitRequest` (InterfaceDeclaration) — `DynamicWorkflowRunSubmitRequest`
- `DynamicWorkflowRunSubmitResult` (TypeAliasDeclaration) — `{ ok: true; runId: string; }`
- `DynamicWorkflowRunSummary` (InterfaceDeclaration) — `DynamicWorkflowRunSummary`
- `DynamicWorkflowRunUsage` (InterfaceDeclaration) — `DynamicWorkflowRunUsage`
- `DynamicWorkflowRunWaitOptions` (InterfaceDeclaration) — `DynamicWorkflowRunWaitOptions`
- `DynamicWorkflowRunWorkspaceNode` (InterfaceDeclaration) — `DynamicWorkflowRunWorkspaceNode`
- `DynamicWorkflowRunWorkspaceNodeKind` (TypeAliasDeclaration) — `"world-read" | "world-run"`
- `DynamicWorkflowRunWorkspaceNodeResult` (InterfaceDeclaration) — `DynamicWorkflowRunWorkspaceNodeResult`
- `DynamicWorkflowRunWorkspaceNodeResultQuery` (InterfaceDeclaration) — `DynamicWorkflowRunWorkspaceNodeResultQuery`
- `DynamicWorkflowRunWorkspaceNodeStatus` (TypeAliasDeclaration) — `"completed" | "failed" | "running"`
- `DynamicWorkflowRunWorkspaceNodeSummary` (InterfaceDeclaration) — `DynamicWorkflowRunWorkspaceNodeSummary`
- `DynamicWorkflowSnippetDiagnostic` (InterfaceDeclaration) — `DynamicWorkflowSnippetDiagnostic`
- `DynamicWorkflowSnippetEvalOptions` (InterfaceDeclaration) — `DynamicWorkflowSnippetEvalOptions`
- `DynamicWorkflowSnippetEvalRequest` (InterfaceDeclaration) — `DynamicWorkflowSnippetEvalRequest`
- `DynamicWorkflowSnippetEvalResult` (TypeAliasDeclaration) — `{ kind: "diagnostics"; diagnostics: DynamicWorkflowSnippetDiagnostic[]; } | { kind: "completed"; artifact?: unknown; logs: string[]; logsTruncated: boolean; } | { kind: "failed"; error: { code: string`
- `DynamicWorkflowSnippetPort` (InterfaceDeclaration) — `DynamicWorkflowSnippetPort`
- `EmbeddedSearchArgv0DispatchBackend` (InterfaceDeclaration) — `EmbeddedSearchArgv0DispatchBackend`
- `EmbeddedSearchBackend` (TypeAliasDeclaration) — `EmbeddedSearchArgv0DispatchBackend | EmbeddedSearchInternalCliBackend | EmbeddedSearchNativeBinariesBackend`
- `EmbeddedSearchInternalCliBackend` (InterfaceDeclaration) — `EmbeddedSearchInternalCliBackend`
- `EmbeddedSearchNativeBinariesBackend` (InterfaceDeclaration) — `EmbeddedSearchNativeBinariesBackend`
- `EnvInfo` (InterfaceDeclaration) — `EnvInfo`
- `ErrorInfo` (InterfaceDeclaration) — `ErrorInfo`
- `EscalateQuestionRequest` (InterfaceDeclaration) — `EscalateQuestionRequest`
- `EventId` (TypeAliasDeclaration) — `string & { readonly __brand: "EventId"; }`
- `EventReducerPort` (InterfaceDeclaration) — `EventReducerPort`
- `ExecutionCommand` (TypeAliasDeclaration) — `{ mode: "argv"; file: string; args?: string[]; } | { mode: "shell"; command: string; shell?: true | string; shellProfile?: "posix-bash"; shellOverride?: ExecutionShellSelection; }`
- `ExecutionEmbeddedSearchPrelude` (InterfaceDeclaration) — `ExecutionEmbeddedSearchPrelude`
- `ExecutionEnvBase` (TypeAliasDeclaration) — `"inherit" | "empty"`
- `ExecutionEnvOverlay` (InterfaceDeclaration) — `ExecutionEnvOverlay`
- `ExecutionEvent` (TypeAliasDeclaration) — `{ type: "started"; pid?: number; timestamp: Date; } | { type: "stdout" | "stderr"; chunk: Uint8Array; text: string; timestamp: Date; } | { type: "progress"; elapsedMs: number; pid?: number; stdoutByte`
- `ExecutionFailure` (InterfaceDeclaration) — `ExecutionFailure`
- `ExecutionFailureType` (TypeAliasDeclaration) — `"unknown" | "cancelled" | "spawn_error" | "timeout" | "sandbox_violation" | "output_limit"`
- `ExecutionOutputLimit` (InterfaceDeclaration) — `ExecutionOutputLimit`
- `ExecutionOutputPreview` (InterfaceDeclaration) — `ExecutionOutputPreview`
- `ExecutionPort` (InterfaceDeclaration) — `ExecutionPort`
- `ExecutionRequest` (InterfaceDeclaration) — `ExecutionRequest`
- `ExecutionResult` (InterfaceDeclaration) — `ExecutionResult`
- `ExecutionRunOptions` (InterfaceDeclaration) — `ExecutionRunOptions`
- `ExecutionSandboxPolicy` (InterfaceDeclaration) — `ExecutionSandboxPolicy`
- `ExecutionShellDialect` (TypeAliasDeclaration) — `"cmd" | "posix" | "git-bash"`
- `ExecutionShellDisplay` (InterfaceDeclaration) — `ExecutionShellDisplay`
- `ExecutionShellOverride` (TypeAliasDeclaration) — `ExecutionShellSelection`
- `ExecutionShellSelection` (InterfaceDeclaration) — `ExecutionShellSelection`
- `ExecutionShellSource` (TypeAliasDeclaration) — `"auto-detected" | "user-config" | "legacy-fallback"`
- `ExecutionStatus` (TypeAliasDeclaration) — `"cancelled" | "completed" | "failed" | "timed_out" | "spawn_error"`
- `ExecutionStreamResult` (InterfaceDeclaration) — `ExecutionStreamResult`
- `FileDiff` (InterfaceDeclaration) — `FileDiff`
- `FilePart` (InterfaceDeclaration) — `FilePart`
- `FilePartSource` (TypeAliasDeclaration) — `{ type: "file"; path: string; text: { value: string; start: number; end: number; }; } | { type: "symbol"; path: string; range: unknown; name: string; kind: number; text: { value: string; start: number`
- `FileSystemCreateDirectoryRequest` (InterfaceDeclaration) — `FileSystemCreateDirectoryRequest`
- `FileSystemCreateDirectoryResult` (InterfaceDeclaration) — `FileSystemCreateDirectoryResult`
- `FileSystemErrorCode` (TypeAliasDeclaration) — `"cancelled" | "permission_denied" | "not_found" | "is_directory" | "not_file" | "too_large" | "stale_write" | "invalid_path" | "invalid_pattern" | "unsupported" | "io_error"`
- `FileSystemErrorDetails` (InterfaceDeclaration) — `FileSystemErrorDetails`
- `FileSystemLineEndings` (TypeAliasDeclaration) — `"LF" | "CRLF"`
- `FileSystemListDirectoryEntry` (InterfaceDeclaration) — `FileSystemListDirectoryEntry`
- `FileSystemListDirectoryRequest` (InterfaceDeclaration) — `FileSystemListDirectoryRequest`
- `FileSystemListDirectoryResult` (InterfaceDeclaration) — `FileSystemListDirectoryResult`
- `FileSystemNodeKind` (TypeAliasDeclaration) — `"file" | "directory" | "symlink" | "other" | "missing"`
- `FileSystemOperationOptions` (InterfaceDeclaration) — `FileSystemOperationOptions`
- `FileSystemPort` (InterfaceDeclaration) — `FileSystemPort`
- `FileSystemPortError` (ClassDeclaration) — `FileSystemPortError`
- `FileSystemReadBytesRequest` (InterfaceDeclaration) — `FileSystemReadBytesRequest`
- `FileSystemReadBytesResult` (InterfaceDeclaration) — `FileSystemReadBytesResult`
- `FileSystemReadTextRangeRequest` (InterfaceDeclaration) — `FileSystemReadTextRangeRequest`
- `FileSystemReadTextRangeResult` (InterfaceDeclaration) — `FileSystemReadTextRangeResult`
- `FileSystemReadTextRequest` (InterfaceDeclaration) — `FileSystemReadTextRequest`
- `FileSystemReadTextResult` (InterfaceDeclaration) — `FileSystemReadTextResult`
- `FileSystemRemoveFileRequest` (InterfaceDeclaration) — `FileSystemRemoveFileRequest`
- `FileSystemRemoveFileResult` (InterfaceDeclaration) — `FileSystemRemoveFileResult`
- `FileSystemRevision` (InterfaceDeclaration) — `FileSystemRevision`
- `FileSystemSearchFilesRequest` (InterfaceDeclaration) — `FileSystemSearchFilesRequest`
- `FileSystemSearchFilesResult` (InterfaceDeclaration) — `FileSystemSearchFilesResult`
- `FileSystemSearchTextEntry` (InterfaceDeclaration) — `FileSystemSearchTextEntry`
- `FileSystemSearchTextRequest` (InterfaceDeclaration) — `FileSystemSearchTextRequest`
- `FileSystemSearchTextResult` (InterfaceDeclaration) — `FileSystemSearchTextResult`
- `FileSystemStatRequest` (InterfaceDeclaration) — `FileSystemStatRequest`
- `FileSystemStatResult` (InterfaceDeclaration) — `FileSystemStatResult`
- `FileSystemTextEncoding` (TypeAliasDeclaration) — `BufferEncoding | "gb2312" | "gbk" | "gb18030"`
- `FileSystemTextSearchOutputMode` (TypeAliasDeclaration) — `"content" | "files_with_matches" | "count"`
- `FileSystemWriteTextRequest` (InterfaceDeclaration) — `FileSystemWriteTextRequest`
- `FileSystemWriteTextResult` (InterfaceDeclaration) — `FileSystemWriteTextResult`
- `ForkChildSessionMetadata` (InterfaceDeclaration) — `ForkChildSessionMetadata`
- `ForkCommandResult` (TypeAliasDeclaration) — `{ type: "forkAssistant"; sessionId: string; } | { type: "createSelectionSideSession"; sessionId: string; } | { type: "editUserQuery"; disposition: "fork"; sessionId: string; }`
- `ForkCommitBundle` (InterfaceDeclaration) — `ForkCommitBundle`
- `GoalVerificationTimelinePart` (InterfaceDeclaration) — `GoalVerificationTimelinePart`
- `HttpClientEgressInfo` (InterfaceDeclaration) — `HttpClientEgressInfo`
- `HttpClientEgressPolicy` (TypeAliasDeclaration) — `"public"`
- `HttpClientErrorCode` (TypeAliasDeclaration) — `"cancelled" | "timeout" | "too_large" | "invalid_url" | "unsupported_protocol" | "egress_blocked" | "network_error" | "proxy_error"`
- `HttpClientErrorDetails` (InterfaceDeclaration) — `HttpClientErrorDetails`
- `HttpClientMethod` (TypeAliasDeclaration) — `"GET" | "HEAD" | "POST"`
- `HttpClientPort` (InterfaceDeclaration) — `HttpClientPort`
- `HttpClientPortError` (ClassDeclaration) — `HttpClientPortError`
- `HttpClientRedirectPolicy` (TypeAliasDeclaration) — `"manual" | "follow"`
- `HttpClientRequest` (InterfaceDeclaration) — `HttpClientRequest`
- `HttpClientResponse` (InterfaceDeclaration) — `HttpClientResponse`
- `HttpClientRunOptions` (InterfaceDeclaration) — `HttpClientRunOptions`
- `ImageAttachmentPathPrimeRequest` (InterfaceDeclaration) — `ImageAttachmentPathPrimeRequest`
- `ImageCompressionStrategy` (TypeAliasDeclaration) — `"original" | "preserve-format" | "png-optimized" | "png-quantized" | "resized" | "jpeg-quality" | "jpeg-fallback"`
- `ImagePrepareForModelRequest` (InterfaceDeclaration) — `ImagePrepareForModelRequest`
- `ImagePrepareForModelResult` (InterfaceDeclaration) — `ImagePrepareForModelResult`
- `ImageProcessorErrorCode` (TypeAliasDeclaration) — `"empty" | "too_large" | "unsupported" | "invalid_request" | "processing_failed"`
- `ImageProcessorErrorDetails` (InterfaceDeclaration) — `ImageProcessorErrorDetails`
- `ImageProcessorPort` (InterfaceDeclaration) — `ImageProcessorPort`
- `ImageProcessorPortError` (ClassDeclaration) — `ImageProcessorPortError`
- `ImageResizeRequest` (InterfaceDeclaration) — `ImageResizeRequest`
- `ImageResizeResult` (InterfaceDeclaration) — `ImageResizeResult`
- `InputDelivery` (TypeAliasDeclaration) — `"auto" | "start_turn" | "steer_active_turn"`
- `InputHistoryId` (TypeAliasDeclaration) — `string & { readonly __brand: "InputHistoryId"; }`
- `InteractionRequestOrigin` (TypeAliasDeclaration) — `SubagentInteractionRequestOrigin`
- `isAutomationCreateLimitError` (FunctionDeclaration) — `export function isAutomationCreateLimitError(error: unknown): error is AutomationCreateLimitError { if (error instanceof AutomationCreateLimitError) return true; if (typeof error !== "object" || error`
- `isFileSystemPortError` (FunctionDeclaration) — `export function isFileSystemPortError(error: unknown): error is FileSystemPortError { return error instanceof FileSystemPortError; }`
- `isHttpClientPortError` (FunctionDeclaration) — `export function isHttpClientPortError(error: unknown): error is HttpClientPortError { return error instanceof HttpClientPortError; }`
- `isImageProcessorPortError` (FunctionDeclaration) — `export function isImageProcessorPortError(error: unknown): error is ImageProcessorPortError { return error instanceof ImageProcessorPortError; }`
- `KNORVIA_MCP_BROWSER_SCREENSHOT_CONTENT_INDICES_META_KEY` (VariableDeclaration) — `"knorvia/browserScreenshotContentIndices"`
- `KNORVIA_MCP_ERROR_PRESENTATION_MESSAGE_ONLY` (VariableDeclaration) — `"message-only"`
- `KNORVIA_MCP_ERROR_PRESENTATION_META_KEY` (VariableDeclaration) — `"knorvia/errorPresentation"`
- `KNORVIA_MCP_NODE_REPL_CUA_APP_META_KEY` (VariableDeclaration) — `"knorvia/nodeReplCuaApp"`
- `KNORVIA_MCP_SERVER_REQUEST_ID_META_KEY` (VariableDeclaration) — `"knorvia/officialMcpServerRequestId"`
- `KnorviaOfficialMcpAuthConfig` (InterfaceDeclaration) — `KnorviaOfficialMcpAuthConfig`
- `ListSessionsInput` (InterfaceDeclaration) — `ListSessionsInput`
- `LocalSettingStorePort` (InterfaceDeclaration) — `LocalSettingStorePort`
- `McpAuthorizationCodeOAuthConfig` (InterfaceDeclaration) — `McpAuthorizationCodeOAuthConfig`
- `McpCallToolOptions` (InterfaceDeclaration) — `McpCallToolOptions`
- `McpCallToolRequest` (InterfaceDeclaration) — `McpCallToolRequest`
- `McpClientCredentialsOAuthConfig` (InterfaceDeclaration) — `McpClientCredentialsOAuthConfig`
- `McpConnectionSnapshot` (InterfaceDeclaration) — `McpConnectionSnapshot`
- `McpConnectOptions` (InterfaceDeclaration) — `McpConnectOptions`
- `McpContentBlock` (TypeAliasDeclaration) — `{ [x: string]: unknown; }`
- `McpHttpServerConfig` (InterfaceDeclaration) — `McpHttpServerConfig`
- `McpOAuthConfig` (TypeAliasDeclaration) — `McpAuthorizationCodeOAuthConfig | McpClientCredentialsOAuthConfig`
- `McpOfficialProvenance` (InterfaceDeclaration) — `McpOfficialProvenance`
- `McpPort` (InterfaceDeclaration) — `McpPort`
- `McpProtocolVersion` (TypeAliasDeclaration) — `"auto" | "legacy" | "2026-07-28"`
- `McpServerConfig` (TypeAliasDeclaration) — `McpStdioServerConfig | McpHttpServerConfig | McpSseServerConfig`
- `McpServerConfigBase` (InterfaceDeclaration) — `McpServerConfigBase`
- `McpServerIsolation` (TypeAliasDeclaration) — `"session" | "workspace"`
- `McpServerRuntimeSource` (InterfaceDeclaration) — `McpServerRuntimeSource`
- `McpServerStatus` (InterfaceDeclaration) — `McpServerStatus`
- `McpServerStatusKind` (TypeAliasDeclaration) — `"failed" | "disabled" | "connecting" | "connected" | "disconnected" | "untrusted"`
- `McpServerTransportType` (TypeAliasDeclaration) — `"stdio" | "http" | "sse"`
- `McpSseServerConfig` (InterfaceDeclaration) — `McpSseServerConfig`
- `McpStdioServerConfig` (InterfaceDeclaration) — `McpStdioServerConfig`
- `McpToolAnnotations` (InterfaceDeclaration) — `McpToolAnnotations`
- `McpToolCallResult` (InterfaceDeclaration) — `McpToolCallResult`
- `McpToolDescriptor` (InterfaceDeclaration) — `McpToolDescriptor`
- `MediaAttachmentPathEnsureRequest` (InterfaceDeclaration) — `MediaAttachmentPathEnsureRequest`
- `MediaAttachmentPathPrimeRequest` (InterfaceDeclaration) — `MediaAttachmentPathPrimeRequest`
- `MediaAttachmentPathResult` (TypeAliasDeclaration) — `{ status: "ready"; path: string; } | { status: "unsupported"; }`
- `MESSAGE_ANCHOR_ORIGINS` (VariableDeclaration) — `readonly ["realUser", "backgroundResult", "goalContinuation", "mailbox", "synthetic"]`
- `MESSAGE_VISIBILITIES` (VariableDeclaration) — `readonly ["user-visible", "model-only"]`
- `MessageAnchorOrigin` (TypeAliasDeclaration) — `"realUser" | "backgroundResult" | "goalContinuation" | "mailbox" | "synthetic"`
- `MessageContextSnapshot` (InterfaceDeclaration) — `MessageContextSnapshot`
- `MessageId` (TypeAliasDeclaration) — `string & { readonly __brand: "MessageId"; }`
- `MessageInfo` (TypeAliasDeclaration) — `AssistantMessageInfo | UserMessageInfo`
- `MessagePart` (TypeAliasDeclaration) — `AgentPart | CompactionPart | FilePart | TextPart | ReasoningPart | TimelinePart | SubtaskPart | RetryPart | StepStartPart | StepFinishPart | SnapshotPart | PatchPart | ToolPart`
- `MessageProjectionAnchor` (InterfaceDeclaration) — `MessageProjectionAnchor`
- `MessageSemantics` (InterfaceDeclaration) — `MessageSemantics`
- `MessageSemanticsKind` (TypeAliasDeclaration) — `"user_prompt" | "slash_command" | "system_reminder" | "background_notification" | "subagent_notification" | "todo_reminder" | "rewind_notice" | "fork_notice" | "timeline_event" | "compact_summary" | "`
- `MessageSemanticsOrigin` (TypeAliasDeclaration) — `"system" | "real_user" | "agent_runtime" | "migration" | "import"`
- `MessageSummary` (InterfaceDeclaration) — `MessageSummary`
- `MessageVisibility` (TypeAliasDeclaration) — `"user-visible" | "model-only"`
- `MessageWithParts` (InterfaceDeclaration) — `MessageWithParts`
- `ModelCatalogEntry` (InterfaceDeclaration) — `ModelCatalogEntry`
- `ModelCatalogPort` (InterfaceDeclaration) — `ModelCatalogPort`
- `ModelChangeTimelinePart` (InterfaceDeclaration) — `ModelChangeTimelinePart`
- `ModelUsageRecord` (InterfaceDeclaration) — `ModelUsageRecord`
- `OfficialMcpAuthFailureReason` (TypeAliasDeclaration) — `"official_auth_unavailable" | "official_auth_plan_required" | "official_mcp_origin_untrusted"`
- `OfficialMcpAuthHeadersPort` (InterfaceDeclaration) — `OfficialMcpAuthHeadersPort`
- `OfficialMcpAuthHeadersResult` (TypeAliasDeclaration) — `{ ok: true; headers: Record<string, string>; } | { ok: false; reason: OfficialMcpAuthFailureReason; }`
- `OfficialMcpTrustedOriginRegistry` (InterfaceDeclaration) — `OfficialMcpTrustedOriginRegistry`
- `OutputFormat` (TypeAliasDeclaration) — `{ type: "text"; } | { type: "json_schema"; schema: Record<string, unknown>; retryCount?: number; }`
- `PackageManager` (TypeAliasDeclaration) — `"npm" | "yarn" | "pnpm" | "bun"`
- `PartId` (TypeAliasDeclaration) — `string & { readonly __brand: "PartId"; }`
- `PatchPart` (InterfaceDeclaration) — `PatchPart`
- `PdfDocumentErrorCode` (TypeAliasDeclaration) — `"cancelled" | "unavailable" | "permission_denied" | "timeout" | "io_error" | "corrupted" | "page_out_of_range" | "password_protected" | "process_failed"`
- `PdfDocumentPageCountRequest` (InterfaceDeclaration) — `PdfDocumentPageCountRequest`
- `PdfDocumentPort` (InterfaceDeclaration) — `PdfDocumentPort`
- `PdfDocumentPortError` (ClassDeclaration) — `PdfDocumentPortError`
- `PdfDocumentRenderedPage` (InterfaceDeclaration) — `PdfDocumentRenderedPage`
- `PdfDocumentRenderPagesRequest` (InterfaceDeclaration) — `PdfDocumentRenderPagesRequest`
- `PendingPermission` (InterfaceDeclaration) — `PendingPermission`
- `PendingSteerInputInfo` (InterfaceDeclaration) — `PendingSteerInputInfo`
- `PendingTurnAttachment` (InterfaceDeclaration) — `PendingTurnAttachment`
- `PendingTurnInput` (InterfaceDeclaration) — `PendingTurnInput`
- `PERMISSION_FULL_ACCESS_ENTRY` (VariableDeclaration) — `"runtime/permission_full_access"`
- `PermissionBrokerPort` (InterfaceDeclaration) — `PermissionBrokerPort`
- `PermissionBrokerReasonSource` (TypeAliasDeclaration) — `"plan_approval_feedback" | "workflow_refine_feedback"`
- `PermissionBrokerRequest` (InterfaceDeclaration) — `PermissionBrokerRequest`
- `PermissionBrokerRequestOptions` (InterfaceDeclaration) — `PermissionBrokerRequestOptions`
- `PermissionBrokerResult` (InterfaceDeclaration) — `PermissionBrokerResult`
- `PermissionCapabilityGroup` (VariableDeclaration | TypeAliasDeclaration) — `{ readonly OfficialCua: "official_cua"; }`
- `permissionFullAccessReceiptSchema` (VariableDeclaration) — `z.ZodEffects<z.ZodObject<{ interactionId: z.ZodString; event: z.ZodObject<{ id: z.ZodString; sessionId: z.ZodString; traceId: z.ZodString; turnId: z.ZodOptional<z.ZodString>; type: z.ZodLiteral<"sessi`
- `PermissionOptionsPolicy` (TypeAliasDeclaration) — `"no-always-allow" | "session-always-allow"`
- `PermissionRuleBehavior` (TypeAliasDeclaration) — `"allow" | "deny" | "ask"`
- `PermissionRuleset` (InterfaceDeclaration) — `PermissionRuleset`
- `PermissionRuleValue` (InterfaceDeclaration) — `PermissionRuleValue`
- `PermissionUpdate` (TypeAliasDeclaration) — `{ type: "addRules"; behavior: PermissionRuleBehavior; rules: PermissionRuleValue[]; }`
- `PreparedPermissionRequest` (InterfaceDeclaration) — `PreparedPermissionRequest`
- `ProjectContext` (InterfaceDeclaration) — `ProjectContext`
- `ProjectId` (TypeAliasDeclaration) — `string & { readonly __brand: "ProjectId"; }`
- `ProjectPermissionUpdateInput` (InterfaceDeclaration) — `ProjectPermissionUpdateInput`
- `ProjectPermissionUpdatePort` (InterfaceDeclaration) — `ProjectPermissionUpdatePort`
- `ProjectType` (TypeAliasDeclaration) — `"unknown" | "node" | "python" | "rust" | "go" | "java"`
- `QueryId` (TypeAliasDeclaration) — `string & { readonly __brand: "QueryId"; }`
- `ReasoningPart` (InterfaceDeclaration) — `ReasoningPart`
- `RepairLegacyRemoteSessionWorkspaceInput` (InterfaceDeclaration) — `RepairLegacyRemoteSessionWorkspaceInput`
- `RepairRemoteSessionPathsInput` (InterfaceDeclaration) — `RepairRemoteSessionPathsInput`
- `ResolvedUserInstructions` (InterfaceDeclaration) — `ResolvedUserInstructions`
- `ResolvedUserInstructionSource` (InterfaceDeclaration) — `ResolvedUserInstructionSource`
- `RetryPart` (InterfaceDeclaration) — `RetryPart`
- `RiskLevel` (TypeAliasDeclaration) — `"low" | "medium" | "high" | "critical"`
- `serializeWorkflowArtifact` (FunctionDeclaration) — `export function serializeWorkflowArtifact(value: unknown): string | undefined { if (value === undefined) return undefined; if (typeof value === "string") return value; try { // JSON.stringify 对 undefi`
- `Session` (InterfaceDeclaration) — `Session`
- `SESSION_ENTRY_BASH_SHELL_SELECTION` (VariableDeclaration) — `"runtime/bash_shell_selection"`
- `SESSION_ENTRY_EXECUTION_STATE` (VariableDeclaration) — `"runtime/execution_state"`
- `SESSION_ENTRY_MODEL_SELECTION` (VariableDeclaration) — `"runtime/model_selection"`
- `SESSION_ENTRY_TARGET_COMPLETION_VERIFICATION` (VariableDeclaration) — `"target_completion_verification"`
- `SESSION_ENTRY_TYPES` (VariableDeclaration) — `readonly ["target_completion_verification", "runtime/bash_shell_selection", "runtime/model_selection", "runtime/execution_state", "runtime/user_input_auto_resolution", "runtime/workspace_checkpoint", `
- `SESSION_ENTRY_USER_INPUT_AUTO_RESOLUTION` (VariableDeclaration) — `"runtime/user_input_auto_resolution"`
- `SESSION_ENTRY_WORKSPACE_CHECKPOINT` (VariableDeclaration) — `"runtime/workspace_checkpoint"`
- `SESSION_ENTRY_WORKSPACE_FILE_REWIND` (VariableDeclaration) — `"runtime/workspace_file_rewind"`
- `SESSION_TASK_TYPES` (VariableDeclaration) — `readonly ["interactive", "fork", "selection_side_chat", "workflow_parent", "workflow_child", "subagent_child", "nested_workflow_child"]`
- `SESSION_TITLE_SOURCES` (VariableDeclaration) — `readonly ["default", "first_input", "generated", "custom"]`
- `SessionConfig` (InterfaceDeclaration) — `SessionConfig`
- `SessionEntryInfo` (InterfaceDeclaration) — `SessionEntryInfo`
- `SessionEntryType` (TypeAliasDeclaration) — `"target_completion_verification" | "runtime/bash_shell_selection" | "runtime/execution_state" | "runtime/model_selection" | "runtime/user_input_auto_resolution" | "runtime/workspace_checkpoint" | "run`
- `SessionEventSink` (InterfaceDeclaration) — `SessionEventSink`
- `SessionEventStorePort` (InterfaceDeclaration) — `SessionEventStorePort`
- `SessionEventStoreStats` (InterfaceDeclaration) — `SessionEventStoreStats`
- `SessionForkTimelinePart` (InterfaceDeclaration) — `SessionForkTimelinePart`
- `SessionId` (TypeAliasDeclaration) — `string & { readonly __brand: "SessionId"; }`
- `SessionInfo` (InterfaceDeclaration) — `SessionInfo`
- `SessionInputDelivery` (TypeAliasDeclaration) — `"startNow" | "guide" | "queue"`
- `SessionInputRecord` (InterfaceDeclaration) — `SessionInputRecord`
- `SessionInputStatus` (TypeAliasDeclaration) — `"cancelled" | "failed" | "admitted" | "promoted" | "discarded"`
- `SessionMailboxEnvelope` (InterfaceDeclaration) — `SessionMailboxEnvelope`
- `SessionMailboxPort` (InterfaceDeclaration) — `SessionMailboxPort`
- `SessionManagerPort` (InterfaceDeclaration) — `SessionManagerPort`
- `SessionProjection` (InterfaceDeclaration) — `SessionProjection`
- `SessionRevert` (InterfaceDeclaration) — `SessionRevert`
- `SessionStatus` (TypeAliasDeclaration) — `"error" | "completed" | "idle" | "running" | "waiting" | "paused"`
- `SessionStorePort` (InterfaceDeclaration) — `SessionStorePort`
- `SessionSummary` (InterfaceDeclaration) — `SessionSummary`
- `SessionTaskType` (TypeAliasDeclaration) — `"fork" | "interactive" | "selection_side_chat" | "workflow_parent" | "workflow_child" | "subagent_child" | "nested_workflow_child"`
- `SessionTitleSource` (TypeAliasDeclaration) — `"custom" | "default" | "first_input" | "generated"`
- `SharedContextImportCommitBundle` (InterfaceDeclaration) — `SharedContextImportCommitBundle`
- `SharedContextImportStatus` (TypeAliasDeclaration) — `"pending" | "attached" | "discarded" | "reserved"`
- `SharedContextImportTransition` (InterfaceDeclaration) — `SharedContextImportTransition`
- `SnapshotPart` (InterfaceDeclaration) — `SnapshotPart`
- `StableForkGoalBoundaryMetadata` (TypeAliasDeclaration) — `{ kind: "none"; } | { kind: "snapshot"; target: SessionGoal; verificationEntryIds: string[]; }`
- `StableForkTargetMetadata` (InterfaceDeclaration) — `StableForkTargetMetadata`
- `StepFinishPart` (InterfaceDeclaration) — `StepFinishPart`
- `StepStartPart` (InterfaceDeclaration) — `StepStartPart`
- `SubagentInteractionRequestOrigin` (InterfaceDeclaration) — `SubagentInteractionRequestOrigin`
- `SubagentLaunchOptions` (TypeAliasDeclaration) — `SubagentRunOptions`
- `SubagentLaunchRequest` (InterfaceDeclaration) — `SubagentLaunchRequest`
- `SubagentPort` (InterfaceDeclaration) — `SubagentPort`
- `SubagentRunOptions` (InterfaceDeclaration) — `SubagentRunOptions`
- `SubagentRunRequest` (InterfaceDeclaration) — `SubagentRunRequest`
- `SubagentSendMessageDelivery` (TypeAliasDeclaration) — `"queued" | "steered" | "resumed_background"`
- `SubagentSendMessageOptions` (InterfaceDeclaration) — `SubagentSendMessageOptions`
- `SubagentSendMessageRequest` (InterfaceDeclaration) — `SubagentSendMessageRequest`
- `SubagentSendMessageResult` (InterfaceDeclaration) — `SubagentSendMessageResult`
- `SubagentStartOptions` (InterfaceDeclaration) — `SubagentStartOptions`
- `SubagentStartRequest` (TypeAliasDeclaration) — `SubagentRunRequest`
- `SubagentStopOptions` (InterfaceDeclaration) — `SubagentStopOptions`
- `SubagentTaskSnapshot` (InterfaceDeclaration) — `SubagentTaskSnapshot`
- `SubagentTaskStatus` (TypeAliasDeclaration) — `"cancelled" | "completed" | "failed" | "running" | "lost" | "stopped" | "killed"`
- `SubagentWaitOptions` (InterfaceDeclaration) — `SubagentWaitOptions`
- `SubmitAccepted` (InterfaceDeclaration) — `SubmitAccepted`
- `SubmitRejected` (InterfaceDeclaration) — `SubmitRejected`
- `SubmitResultRequest` (InterfaceDeclaration) — `SubmitResultRequest`
- `SubmitVerdict` (TypeAliasDeclaration) — `SubmitAccepted | SubmitRejected`
- `SubmitViolation` (InterfaceDeclaration) — `SubmitViolation`
- `SubtaskPart` (InterfaceDeclaration) — `SubtaskPart`
- `SYNTHETIC_USER_MESSAGE_SOURCES` (VariableDeclaration) — `readonly ["background_task", "fork", "goal_state_change", "goal-continuation", "plugin_reference", "rewind", "selection_side_chat", "subagent", "subagent_message", "todo_reminder", "workflow_launch", `
- `SyntheticUserMessageSource` (TypeAliasDeclaration) — `"subagent_message" | "fork" | "todo_reminder" | "shared_context" | "selection_side_chat" | "background_task" | "goal_state_change" | "goal-continuation" | "plugin_reference" | "rewind" | "subagent" | `
- `TargetCompletionVerificationProjectionInfo` (InterfaceDeclaration) — `TargetCompletionVerificationProjectionInfo`
- `TaskUsageQueryInput` (InterfaceDeclaration) — `TaskUsageQueryInput`
- `TaskUsageQueryResult` (InterfaceDeclaration) — `TaskUsageQueryResult`
- `TextPart` (InterfaceDeclaration) — `TextPart`
- `TimelineModelSelection` (InterfaceDeclaration) — `TimelineModelSelection`
- `TimelinePart` (TypeAliasDeclaration) — `ContextCompactionTimelinePart | GoalVerificationTimelinePart | SessionForkTimelinePart | ModelChangeTimelinePart`
- `TimelinePartBase` (InterfaceDeclaration) — `TimelinePartBase`
- `TimelinePartDisplay` (TypeAliasDeclaration) — `"separator" | "worklog"`
- `TimelinePartDraft` (TypeAliasDeclaration) — `Omit<ContextCompactionTimelinePart, "type" | "id" | "messageID" | "sessionID"> | Omit<GoalVerificationTimelinePart, "type" | "id" | "messageID" | "sessionID"> | Omit<SessionForkTimelinePart, "type" | `
- `TimelinePartStatus` (TypeAliasDeclaration) — `string`
- `TokenUsageInfo` (InterfaceDeclaration) — `TokenUsageInfo`
- `ToolArtifactReadRequest` (InterfaceDeclaration) — `ToolArtifactReadRequest`
- `ToolArtifactReadResult` (InterfaceDeclaration) — `ToolArtifactReadResult`
- `ToolArtifactRetention` (TypeAliasDeclaration) — `"project" | "session" | "temporary"`
- `ToolArtifactStatRequest` (InterfaceDeclaration) — `ToolArtifactStatRequest`
- `ToolArtifactStatResult` (InterfaceDeclaration) — `ToolArtifactStatResult`
- `ToolArtifactStorePort` (InterfaceDeclaration) — `ToolArtifactStorePort`
- `ToolArtifactWriteRequest` (InterfaceDeclaration) — `ToolArtifactWriteRequest`
- `ToolArtifactWriteResult` (InterfaceDeclaration) — `ToolArtifactWriteResult`
- `ToolBinaryArtifactReadResult` (InterfaceDeclaration) — `ToolBinaryArtifactReadResult`
- `ToolBinaryArtifactWriteRequest` (InterfaceDeclaration) — `ToolBinaryArtifactWriteRequest`
- `ToolCallId` (TypeAliasDeclaration) — `string & { readonly __brand: "ToolCallId"; }`
- `ToolCallStatus` (TypeAliasDeclaration) — `"completed" | "failed" | "running" | "pending" | "denied"`
- `ToolPart` (InterfaceDeclaration) — `ToolPart`
- `ToolState` (TypeAliasDeclaration) — `ToolStatePending | ToolStateRunning | ToolStateCompleted | ToolStateError`
- `ToolStateCompleted` (InterfaceDeclaration) — `ToolStateCompleted`
- `ToolStateError` (InterfaceDeclaration) — `ToolStateError`
- `ToolStatePending` (InterfaceDeclaration) — `ToolStatePending`
- `ToolStateRunning` (InterfaceDeclaration) — `ToolStateRunning`
- `ToolUsageRecord` (InterfaceDeclaration) — `ToolUsageRecord`
- `TraceId` (TypeAliasDeclaration) — `string & { readonly __brand: "TraceId"; }`
- `TurnId` (TypeAliasDeclaration) — `string & { readonly __brand: "TurnId"; }`
- `TurnInputIntentMetadata` (InterfaceDeclaration) — `TurnInputIntentMetadata`
- `TurnSteerCommandKind` (TypeAliasDeclaration) — `"sendText" | "sendGoalCommand" | "compact"`
- `TurnSteerDeliveryMode` (TypeAliasDeclaration) — `"guide" | "queue"`
- `TurnSteerInput` (InterfaceDeclaration) — `TurnSteerInput`
- `TurnSteerRejectReason` (TypeAliasDeclaration) — `"no_active_turn" | "expected_turn_mismatch" | "turn_not_steerable" | "empty_input" | "input_too_large"`
- `TurnSteerResult` (TypeAliasDeclaration) — `{ kind: "queued"; pendingInputId: string; queueLength: number; turnId: TurnId; } | { activeTurnId?: TurnId; kind: "rejected"; reason: TurnSteerRejectReason; }`
- `TurnSteerSource` (TypeAliasDeclaration) — `"plan_approval_feedback" | "workflow_refine_feedback"`
- `TurnUsageRecord` (InterfaceDeclaration) — `TurnUsageRecord`
- `UpdateSessionInput` (InterfaceDeclaration) — `UpdateSessionInput`
- `UsageQuerySource` (TypeAliasDeclaration) — `"unknown" | "workflow_child" | "subagent" | "compact" | "main_turn" | "session_title" | "goal_completion_verification"`
- `UsageStatus` (TypeAliasDeclaration) — `"error" | "cancelled" | "completed" | "running"`
- `UsageStorePort` (InterfaceDeclaration) — `UsageStorePort`
- `UserInstructionsOptions` (InterfaceDeclaration) — `UserInstructionsOptions`
- `UserInstructionSourceScope` (TypeAliasDeclaration) — `"user" | "workspace"`
- `UserMessageInfo` (InterfaceDeclaration) — `UserMessageInfo`
- `WorkflowEscalateOutcome` (TypeAliasDeclaration) — `{ kind: "answered"; answer: string; qid: string; } | { kind: "refused"; reason: "budget_exhausted" | "no_active_ask"; message: string; }`
- `WorkflowEscalatePort` (InterfaceDeclaration) — `WorkflowEscalatePort`
- `WorkflowPort` (InterfaceDeclaration) — `WorkflowPort`
- `WorkflowStartOptions` (InterfaceDeclaration) — `WorkflowStartOptions`
- `WorkflowStartRequest` (InterfaceDeclaration) — `WorkflowStartRequest`
- `WorkflowSubmitPort` (InterfaceDeclaration) — `WorkflowSubmitPort`
- `WorkflowTaskSnapshot` (InterfaceDeclaration) — `WorkflowTaskSnapshot`
- `WorkflowTaskStatus` (TypeAliasDeclaration) — `"cancelled" | "completed" | "failed" | "running" | "lost"`
- `WorkspaceId` (TypeAliasDeclaration) — `string & { readonly __brand: "WorkspaceId"; }`

### `interfaces/input-history.port.ts`

- `InputHistoryAttachment` (InterfaceDeclaration) — `InputHistoryAttachment`
- `InputHistoryEntry` (InterfaceDeclaration) — `InputHistoryEntry`
- `InputHistoryKind` (TypeAliasDeclaration) — `"prompt" | "slash_command" | "steered_input"`
- `InputHistoryStorePort` (InterfaceDeclaration) — `InputHistoryStorePort`
- `RecallPreviousInputHistoryInput` (InterfaceDeclaration) — `RecallPreviousInputHistoryInput`
- `RecordInputHistoryInput` (InterfaceDeclaration) — `RecordInputHistoryInput`

### `interfaces/mcp.port.ts`

- `KNORVIA_MCP_BROWSER_SCREENSHOT_CONTENT_INDICES_META_KEY` (VariableDeclaration) — `"knorvia/browserScreenshotContentIndices"`
- `KNORVIA_MCP_ERROR_PRESENTATION_MESSAGE_ONLY` (VariableDeclaration) — `"message-only"`
- `KNORVIA_MCP_ERROR_PRESENTATION_META_KEY` (VariableDeclaration) — `"knorvia/errorPresentation"`
- `KNORVIA_MCP_NODE_REPL_CUA_APP_META_KEY` (VariableDeclaration) — `"knorvia/nodeReplCuaApp"`
- `KNORVIA_MCP_SERVER_REQUEST_ID_META_KEY` (VariableDeclaration) — `"knorvia/officialMcpServerRequestId"`
- `KnorviaOfficialMcpAuthConfig` (InterfaceDeclaration) — `KnorviaOfficialMcpAuthConfig`
- `McpAuthorizationCodeOAuthConfig` (InterfaceDeclaration) — `McpAuthorizationCodeOAuthConfig`
- `McpCallToolOptions` (InterfaceDeclaration) — `McpCallToolOptions`
- `McpCallToolRequest` (InterfaceDeclaration) — `McpCallToolRequest`
- `McpClientCredentialsOAuthConfig` (InterfaceDeclaration) — `McpClientCredentialsOAuthConfig`
- `McpConnectionSnapshot` (InterfaceDeclaration) — `McpConnectionSnapshot`
- `McpConnectOptions` (InterfaceDeclaration) — `McpConnectOptions`
- `McpContentBlock` (TypeAliasDeclaration) — `{ [x: string]: unknown; }`
- `McpHttpServerConfig` (InterfaceDeclaration) — `McpHttpServerConfig`
- `McpOAuthConfig` (TypeAliasDeclaration) — `McpAuthorizationCodeOAuthConfig | McpClientCredentialsOAuthConfig`
- `McpOfficialProvenance` (InterfaceDeclaration) — `McpOfficialProvenance`
- `McpPort` (InterfaceDeclaration) — `McpPort`
- `McpProtocolVersion` (TypeAliasDeclaration) — `"auto" | "legacy" | "2026-07-28"`
- `McpServerConfig` (TypeAliasDeclaration) — `McpStdioServerConfig | McpHttpServerConfig | McpSseServerConfig`
- `McpServerConfigBase` (InterfaceDeclaration) — `McpServerConfigBase`
- `McpServerIsolation` (TypeAliasDeclaration) — `"session" | "workspace"`
- `McpServerRuntimeSource` (InterfaceDeclaration) — `McpServerRuntimeSource`
- `McpServerStatus` (InterfaceDeclaration) — `McpServerStatus`
- `McpServerStatusKind` (TypeAliasDeclaration) — `"failed" | "disabled" | "connecting" | "connected" | "disconnected" | "untrusted"`
- `McpServerTransportType` (TypeAliasDeclaration) — `"stdio" | "http" | "sse"`
- `McpSseServerConfig` (InterfaceDeclaration) — `McpSseServerConfig`
- `McpStdioServerConfig` (InterfaceDeclaration) — `McpStdioServerConfig`
- `McpToolAnnotations` (InterfaceDeclaration) — `McpToolAnnotations`
- `McpToolCallResult` (InterfaceDeclaration) — `McpToolCallResult`
- `McpToolDescriptor` (InterfaceDeclaration) — `McpToolDescriptor`
- `OfficialMcpAuthFailureReason` (TypeAliasDeclaration) — `"official_auth_unavailable" | "official_auth_plan_required" | "official_mcp_origin_untrusted"`
- `OfficialMcpAuthHeadersPort` (InterfaceDeclaration) — `OfficialMcpAuthHeadersPort`
- `OfficialMcpAuthHeadersResult` (TypeAliasDeclaration) — `{ ok: true; headers: Record<string, string>; } | { ok: false; reason: OfficialMcpAuthFailureReason; }`
- `OfficialMcpTrustedOriginRegistry` (InterfaceDeclaration) — `OfficialMcpTrustedOriginRegistry`

### `interfaces/model-catalog.port.ts`

- `ModelCatalogEntry` (InterfaceDeclaration) — `ModelCatalogEntry`
- `ModelCatalogPort` (InterfaceDeclaration) — `ModelCatalogPort`

### `interfaces/off-peak.port.ts`

- `isOffPeakEligibilityFailure` (FunctionDeclaration) — `export function isOffPeakEligibilityFailure( outcome: OffPeakCreateOutcome, ): outcome is Extract<OffPeakCreateOutcome, { ok: false }> { return !outcome.ok && outcome.errorCategory === "eligibility_31`
- `isOffPeakQuotaFailure` (FunctionDeclaration) — `export function isOffPeakQuotaFailure( outcome: OffPeakCreateOutcome, ): outcome is Extract<OffPeakCreateOutcome, { ok: false }> { return !outcome.ok && outcome.errorCategory === "quota_3103"; }`
- `OffPeakCreateContext` (InterfaceDeclaration) — `OffPeakCreateContext`
- `OffPeakCreateErrorCategory` (TypeAliasDeclaration) — `"unknown" | "client_validation" | "eligibility_3101" | "quota_3103" | "network" | "invalid_response" | "local_persist"`
- `OffPeakCreateFailureStage` (TypeAliasDeclaration) — `"client_validation" | "local_persist" | "ticket_request"`
- `OffPeakCreateOutcome` (TypeAliasDeclaration) — `{ ok: true; task: OffPeakTaskSummary; } | { ok: false; failureStage: OffPeakCreateFailureStage; errorCategory: OffPeakCreateErrorCategory; errorCode: string; }`
- `OffPeakPort` (InterfaceDeclaration) — `OffPeakPort`

### `interfaces/pdf-document.port.ts`

- `PdfDocumentErrorCode` (TypeAliasDeclaration) — `"cancelled" | "unavailable" | "permission_denied" | "timeout" | "io_error" | "corrupted" | "page_out_of_range" | "password_protected" | "process_failed"`
- `PdfDocumentPageCountRequest` (InterfaceDeclaration) — `PdfDocumentPageCountRequest`
- `PdfDocumentPort` (InterfaceDeclaration) — `PdfDocumentPort`
- `PdfDocumentPortError` (ClassDeclaration) — `PdfDocumentPortError`
- `PdfDocumentRenderedPage` (InterfaceDeclaration) — `PdfDocumentRenderedPage`
- `PdfDocumentRenderPagesRequest` (InterfaceDeclaration) — `PdfDocumentRenderPagesRequest`

### `interfaces/permission-full-access.ts`

- `PERMISSION_FULL_ACCESS_ENTRY` (VariableDeclaration) — `"runtime/permission_full_access"`
- `permissionFullAccessReceiptSchema` (VariableDeclaration) — `z.ZodEffects<z.ZodObject<{ interactionId: z.ZodString; event: z.ZodObject<{ id: z.ZodString; sessionId: z.ZodString; traceId: z.ZodString; turnId: z.ZodOptional<z.ZodString>; type: z.ZodLiteral<"sessi`

### `interfaces/permission.port.ts`

- `PermissionBrokerPort` (InterfaceDeclaration) — `PermissionBrokerPort`
- `PermissionBrokerReasonSource` (TypeAliasDeclaration) — `"plan_approval_feedback" | "workflow_refine_feedback"`
- `PermissionBrokerRequest` (InterfaceDeclaration) — `PermissionBrokerRequest`
- `PermissionBrokerRequestOptions` (InterfaceDeclaration) — `PermissionBrokerRequestOptions`
- `PermissionBrokerResult` (InterfaceDeclaration) — `PermissionBrokerResult`
- `PermissionCapabilityGroup` (VariableDeclaration | TypeAliasDeclaration) — `{ readonly OfficialCua: "official_cua"; }`
- `PermissionOptionsPolicy` (TypeAliasDeclaration) — `"no-always-allow" | "session-always-allow"`
- `PermissionRuleBehavior` (TypeAliasDeclaration) — `"allow" | "deny" | "ask"`
- `PermissionRuleset` (InterfaceDeclaration) — `PermissionRuleset`
- `PermissionRuleValue` (InterfaceDeclaration) — `PermissionRuleValue`
- `PermissionUpdate` (TypeAliasDeclaration) — `{ type: "addRules"; behavior: PermissionRuleBehavior; rules: PermissionRuleValue[]; }`
- `PreparedPermissionRequest` (InterfaceDeclaration) — `PreparedPermissionRequest`

### `interfaces/runtime-input-presentation.ts`

- `parseRuntimeInputPresentation` (FunctionDeclaration) — `export function parseRuntimeInputPresentation( value: unknown, ): RuntimeInputPresentation | undefined { const result = RuntimeInputPresentationSchema.safeParse(value); return result.success ? result.`
- `RuntimeInputPresentation` (TypeAliasDeclaration) — `"user_steer" | "coordinator_steer" | "coordinator_input" | "subagent_reply_steer" | "subagent_reply" | "task_notification_steer" | "task_notification"`
- `RuntimeInputPresentationSchema` (VariableDeclaration) — `z.ZodEnum<["user_steer", "coordinator_steer", "coordinator_input", "subagent_reply_steer", "subagent_reply", "task_notification_steer", "task_notification"]>`

### `interfaces/session-mailbox.port.ts`

- `SessionMailboxEnvelope` (InterfaceDeclaration) — `SessionMailboxEnvelope`
- `SessionMailboxPort` (InterfaceDeclaration) — `SessionMailboxPort`

### `interfaces/session-store.port.ts`

- `AgentPart` (InterfaceDeclaration) — `AgentPart`
- `AppUsageDayModelRow` (InterfaceDeclaration) — `AppUsageDayModelRow`
- `AppUsageDayRow` (InterfaceDeclaration) — `AppUsageDayRow`
- `AppUsageModelRow` (InterfaceDeclaration) — `AppUsageModelRow`
- `AppUsageQueryInput` (InterfaceDeclaration) — `AppUsageQueryInput`
- `AppUsageQueryResult` (InterfaceDeclaration) — `AppUsageQueryResult`
- `AppUsageToolRow` (InterfaceDeclaration) — `AppUsageToolRow`
- `AppUsageToolTotalsRow` (InterfaceDeclaration) — `AppUsageToolTotalsRow`
- `AppUsageTotalsRow` (InterfaceDeclaration) — `AppUsageTotalsRow`
- `AppUsageTurnTotalsRow` (InterfaceDeclaration) — `AppUsageTurnTotalsRow`
- `AssistantErrorInfo` (InterfaceDeclaration) — `AssistantErrorInfo`
- `AssistantMessageInfo` (InterfaceDeclaration) — `AssistantMessageInfo`
- `AttachmentStorageMetadata` (InterfaceDeclaration) — `AttachmentStorageMetadata`
- `ClaimLegacySessionWorkspaceInput` (InterfaceDeclaration) — `ClaimLegacySessionWorkspaceInput`
- `CompactionPart` (InterfaceDeclaration) — `CompactionPart`
- `ContextCompactionTimelinePart` (InterfaceDeclaration) — `ContextCompactionTimelinePart`
- `CreateSessionInput` (InterfaceDeclaration) — `CreateSessionInput`
- `FileDiff` (InterfaceDeclaration) — `FileDiff`
- `FilePart` (InterfaceDeclaration) — `FilePart`
- `FilePartSource` (TypeAliasDeclaration) — `{ type: "file"; path: string; text: { value: string; start: number; end: number; }; } | { type: "symbol"; path: string; range: unknown; name: string; kind: number; text: { value: string; start: number`
- `ForkChildSessionMetadata` (InterfaceDeclaration) — `ForkChildSessionMetadata`
- `ForkCommandResult` (TypeAliasDeclaration) — `{ type: "forkAssistant"; sessionId: string; } | { type: "createSelectionSideSession"; sessionId: string; } | { type: "editUserQuery"; disposition: "fork"; sessionId: string; }`
- `ForkCommitBundle` (InterfaceDeclaration) — `ForkCommitBundle`
- `GoalVerificationTimelinePart` (InterfaceDeclaration) — `GoalVerificationTimelinePart`
- `ListSessionsInput` (InterfaceDeclaration) — `ListSessionsInput`
- `LocalSettingStorePort` (InterfaceDeclaration) — `LocalSettingStorePort`
- `MESSAGE_ANCHOR_ORIGINS` (VariableDeclaration) — `readonly ["realUser", "backgroundResult", "goalContinuation", "mailbox", "synthetic"]`
- `MESSAGE_VISIBILITIES` (VariableDeclaration) — `readonly ["user-visible", "model-only"]`
- `MessageAnchorOrigin` (TypeAliasDeclaration) — `"realUser" | "backgroundResult" | "goalContinuation" | "mailbox" | "synthetic"`
- `MessageContextSnapshot` (InterfaceDeclaration) — `MessageContextSnapshot`
- `MessageInfo` (TypeAliasDeclaration) — `AssistantMessageInfo | UserMessageInfo`
- `MessagePart` (TypeAliasDeclaration) — `AgentPart | CompactionPart | FilePart | TextPart | ReasoningPart | TimelinePart | SubtaskPart | RetryPart | StepStartPart | StepFinishPart | SnapshotPart | PatchPart | ToolPart`
- `MessageProjectionAnchor` (InterfaceDeclaration) — `MessageProjectionAnchor`
- `MessageSemantics` (InterfaceDeclaration) — `MessageSemantics`
- `MessageSemanticsKind` (TypeAliasDeclaration) — `"user_prompt" | "slash_command" | "system_reminder" | "background_notification" | "subagent_notification" | "todo_reminder" | "rewind_notice" | "fork_notice" | "timeline_event" | "compact_summary" | "`
- `MessageSemanticsOrigin` (TypeAliasDeclaration) — `"system" | "real_user" | "agent_runtime" | "migration" | "import"`
- `MessageSummary` (InterfaceDeclaration) — `MessageSummary`
- `MessageVisibility` (TypeAliasDeclaration) — `"user-visible" | "model-only"`
- `MessageWithParts` (InterfaceDeclaration) — `MessageWithParts`
- `ModelChangeTimelinePart` (InterfaceDeclaration) — `ModelChangeTimelinePart`
- `ModelUsageRecord` (InterfaceDeclaration) — `ModelUsageRecord`
- `OutputFormat` (TypeAliasDeclaration) — `{ type: "text"; } | { type: "json_schema"; schema: Record<string, unknown>; retryCount?: number; }`
- `PatchPart` (InterfaceDeclaration) — `PatchPart`
- `ReasoningPart` (InterfaceDeclaration) — `ReasoningPart`
- `RepairLegacyRemoteSessionWorkspaceInput` (InterfaceDeclaration) — `RepairLegacyRemoteSessionWorkspaceInput`
- `RepairRemoteSessionPathsInput` (InterfaceDeclaration) — `RepairRemoteSessionPathsInput`
- `RetryPart` (InterfaceDeclaration) — `RetryPart`
- `SESSION_ENTRY_BASH_SHELL_SELECTION` (VariableDeclaration) — `"runtime/bash_shell_selection"`
- `SESSION_ENTRY_EXECUTION_STATE` (VariableDeclaration) — `"runtime/execution_state"`
- `SESSION_ENTRY_MODEL_SELECTION` (VariableDeclaration) — `"runtime/model_selection"`
- `SESSION_ENTRY_TARGET_COMPLETION_VERIFICATION` (VariableDeclaration) — `"target_completion_verification"`
- `SESSION_ENTRY_TYPES` (VariableDeclaration) — `readonly ["target_completion_verification", "runtime/bash_shell_selection", "runtime/model_selection", "runtime/execution_state", "runtime/user_input_auto_resolution", "runtime/workspace_checkpoint", `
- `SESSION_ENTRY_USER_INPUT_AUTO_RESOLUTION` (VariableDeclaration) — `"runtime/user_input_auto_resolution"`
- `SESSION_ENTRY_WORKSPACE_CHECKPOINT` (VariableDeclaration) — `"runtime/workspace_checkpoint"`
- `SESSION_ENTRY_WORKSPACE_FILE_REWIND` (VariableDeclaration) — `"runtime/workspace_file_rewind"`
- `SESSION_TASK_TYPES` (VariableDeclaration) — `readonly ["interactive", "fork", "selection_side_chat", "workflow_parent", "workflow_child", "subagent_child", "nested_workflow_child"]`
- `SESSION_TITLE_SOURCES` (VariableDeclaration) — `readonly ["default", "first_input", "generated", "custom"]`
- `SessionEntryInfo` (InterfaceDeclaration) — `SessionEntryInfo`
- `SessionEntryType` (TypeAliasDeclaration) — `"target_completion_verification" | "runtime/bash_shell_selection" | "runtime/execution_state" | "runtime/model_selection" | "runtime/user_input_auto_resolution" | "runtime/workspace_checkpoint" | "run`
- `SessionForkTimelinePart` (InterfaceDeclaration) — `SessionForkTimelinePart`
- `SessionInfo` (InterfaceDeclaration) — `SessionInfo`
- `SessionInputDelivery` (TypeAliasDeclaration) — `"startNow" | "guide" | "queue"`
- `SessionInputRecord` (InterfaceDeclaration) — `SessionInputRecord`
- `SessionInputStatus` (TypeAliasDeclaration) — `"cancelled" | "failed" | "admitted" | "promoted" | "discarded"`
- `SessionRevert` (InterfaceDeclaration) — `SessionRevert`
- `SessionStorePort` (InterfaceDeclaration) — `SessionStorePort`
- `SessionTaskType` (TypeAliasDeclaration) — `"fork" | "interactive" | "selection_side_chat" | "workflow_parent" | "workflow_child" | "subagent_child" | "nested_workflow_child"`
- `SessionTitleSource` (TypeAliasDeclaration) — `"custom" | "default" | "first_input" | "generated"`
- `SharedContextImportCommitBundle` (InterfaceDeclaration) — `SharedContextImportCommitBundle`
- `SharedContextImportStatus` (TypeAliasDeclaration) — `"pending" | "attached" | "discarded" | "reserved"`
- `SharedContextImportTransition` (InterfaceDeclaration) — `SharedContextImportTransition`
- `SnapshotPart` (InterfaceDeclaration) — `SnapshotPart`
- `StableForkGoalBoundaryMetadata` (TypeAliasDeclaration) — `{ kind: "none"; } | { kind: "snapshot"; target: SessionGoal; verificationEntryIds: string[]; }`
- `StableForkTargetMetadata` (InterfaceDeclaration) — `StableForkTargetMetadata`
- `StepFinishPart` (InterfaceDeclaration) — `StepFinishPart`
- `StepStartPart` (InterfaceDeclaration) — `StepStartPart`
- `SubtaskPart` (InterfaceDeclaration) — `SubtaskPart`
- `SYNTHETIC_USER_MESSAGE_SOURCES` (VariableDeclaration) — `readonly ["background_task", "fork", "goal_state_change", "goal-continuation", "plugin_reference", "rewind", "selection_side_chat", "subagent", "subagent_message", "todo_reminder", "workflow_launch", `
- `SyntheticUserMessageSource` (TypeAliasDeclaration) — `"subagent_message" | "fork" | "todo_reminder" | "shared_context" | "selection_side_chat" | "background_task" | "goal_state_change" | "goal-continuation" | "plugin_reference" | "rewind" | "subagent" | `
- `TaskUsageQueryInput` (InterfaceDeclaration) — `TaskUsageQueryInput`
- `TaskUsageQueryResult` (InterfaceDeclaration) — `TaskUsageQueryResult`
- `TextPart` (InterfaceDeclaration) — `TextPart`
- `TimelineModelSelection` (InterfaceDeclaration) — `TimelineModelSelection`
- `TimelinePart` (TypeAliasDeclaration) — `ContextCompactionTimelinePart | GoalVerificationTimelinePart | SessionForkTimelinePart | ModelChangeTimelinePart`
- `TimelinePartBase` (InterfaceDeclaration) — `TimelinePartBase`
- `TimelinePartDisplay` (TypeAliasDeclaration) — `"separator" | "worklog"`
- `TimelinePartDraft` (TypeAliasDeclaration) — `Omit<ContextCompactionTimelinePart, "type" | "id" | "messageID" | "sessionID"> | Omit<GoalVerificationTimelinePart, "type" | "id" | "messageID" | "sessionID"> | Omit<SessionForkTimelinePart, "type" | `
- `TimelinePartStatus` (TypeAliasDeclaration) — `string`
- `TokenUsageInfo` (InterfaceDeclaration) — `TokenUsageInfo`
- `ToolPart` (InterfaceDeclaration) — `ToolPart`
- `ToolState` (TypeAliasDeclaration) — `ToolStatePending | ToolStateRunning | ToolStateCompleted | ToolStateError`
- `ToolStateCompleted` (InterfaceDeclaration) — `ToolStateCompleted`
- `ToolStateError` (InterfaceDeclaration) — `ToolStateError`
- `ToolStatePending` (InterfaceDeclaration) — `ToolStatePending`
- `ToolStateRunning` (InterfaceDeclaration) — `ToolStateRunning`
- `ToolUsageRecord` (InterfaceDeclaration) — `ToolUsageRecord`
- `TurnUsageRecord` (InterfaceDeclaration) — `TurnUsageRecord`
- `UpdateSessionInput` (InterfaceDeclaration) — `UpdateSessionInput`
- `UsageQuerySource` (TypeAliasDeclaration) — `"unknown" | "workflow_child" | "subagent" | "compact" | "main_turn" | "session_title" | "goal_completion_verification"`
- `UsageStatus` (TypeAliasDeclaration) — `"error" | "cancelled" | "completed" | "running"`
- `UsageStorePort` (InterfaceDeclaration) — `UsageStorePort`
- `UserMessageInfo` (InterfaceDeclaration) — `UserMessageInfo`

### `interfaces/session.port.ts`

- `ActiveToolCall` (InterfaceDeclaration) — `ActiveToolCall`
- `BackgroundTaskCancelResult` (InterfaceDeclaration) — `BackgroundTaskCancelResult`
- `BackgroundTaskInfo` (InterfaceDeclaration) — `BackgroundTaskInfo`
- `BackgroundTaskInfoStatus` (TypeAliasDeclaration) — `"cancelled" | "completed" | "failed" | "running" | "timed_out" | "spawn_error" | "lost"`
- `CollaborationMode` (TypeAliasDeclaration) — `"auto" | "plan" | "build" | "edit" | "yolo"`
- `ErrorInfo` (InterfaceDeclaration) — `ErrorInfo`
- `EventReducerPort` (InterfaceDeclaration) — `EventReducerPort`
- `InputDelivery` (TypeAliasDeclaration) — `"auto" | "start_turn" | "steer_active_turn"`
- `PendingPermission` (InterfaceDeclaration) — `PendingPermission`
- `PendingSteerInputInfo` (InterfaceDeclaration) — `PendingSteerInputInfo`
- `PendingTurnAttachment` (InterfaceDeclaration) — `PendingTurnAttachment`
- `PendingTurnInput` (InterfaceDeclaration) — `PendingTurnInput`
- `RiskLevel` (TypeAliasDeclaration) — `"low" | "medium" | "high" | "critical"`
- `Session` (InterfaceDeclaration) — `Session`
- `SessionConfig` (InterfaceDeclaration) — `SessionConfig`
- `SessionEventSink` (InterfaceDeclaration) — `SessionEventSink`
- `SessionEventStorePort` (InterfaceDeclaration) — `SessionEventStorePort`
- `SessionEventStoreStats` (InterfaceDeclaration) — `SessionEventStoreStats`
- `SessionManagerPort` (InterfaceDeclaration) — `SessionManagerPort`
- `SessionProjection` (InterfaceDeclaration) — `SessionProjection`
- `SessionStatus` (TypeAliasDeclaration) — `"error" | "completed" | "idle" | "running" | "waiting" | "paused"`
- `SessionSummary` (InterfaceDeclaration) — `SessionSummary`
- `TargetCompletionVerificationProjectionInfo` (InterfaceDeclaration) — `TargetCompletionVerificationProjectionInfo`
- `ToolCallStatus` (TypeAliasDeclaration) — `"completed" | "failed" | "running" | "pending" | "denied"`
- `TurnInputIntentMetadata` (InterfaceDeclaration) — `TurnInputIntentMetadata`
- `TurnSteerCommandKind` (TypeAliasDeclaration) — `"sendText" | "sendGoalCommand" | "compact"`
- `TurnSteerDeliveryMode` (TypeAliasDeclaration) — `"guide" | "queue"`
- `TurnSteerInput` (InterfaceDeclaration) — `TurnSteerInput`
- `TurnSteerRejectReason` (TypeAliasDeclaration) — `"no_active_turn" | "expected_turn_mismatch" | "turn_not_steerable" | "empty_input" | "input_too_large"`
- `TurnSteerResult` (TypeAliasDeclaration) — `{ kind: "queued"; pendingInputId: string; queueLength: number; turnId: TurnId; } | { activeTurnId?: TurnId; kind: "rejected"; reason: TurnSteerRejectReason; }`
- `TurnSteerSource` (TypeAliasDeclaration) — `"plan_approval_feedback" | "workflow_refine_feedback"`

### `interfaces/shared.ts`

- `createEventId` (FunctionDeclaration) — `export function createEventId(id?: string): EventId { return `evt\_${id ?? crypto.randomUUID()}` as EventId; }`
- `createInputHistoryId` (FunctionDeclaration) — `export function createInputHistoryId(id?: string): InputHistoryId { return `input\_${id ?? createSortableIdSegment()}` as InputHistoryId; }`
- `createMessageId` (FunctionDeclaration) — `export function createMessageId(id?: string): MessageId { return `msg\_${id ?? createSortableIdSegment()}` as MessageId; }`
- `createPartId` (FunctionDeclaration) — `export function createPartId(id?: string): PartId { return `part\_${id ?? createSortableIdSegment()}` as PartId; }`
- `createProjectId` (FunctionDeclaration) — `export function createProjectId(id?: string): ProjectId { return `proj\_${id ?? crypto.randomUUID()}` as ProjectId; }`
- `createQueryId` (FunctionDeclaration) — `export function createQueryId(id?: string): QueryId { return `query\_${id ?? crypto.randomUUID()}` as QueryId; }`
- `createSessionId` (FunctionDeclaration) — `export function createSessionId(id?: string): SessionId { return `sess\_${id ?? crypto.randomUUID()}` as SessionId; }`
- `createToolCallId` (FunctionDeclaration) — `export function createToolCallId(id?: string): ToolCallId { return `tool\_${id ?? crypto.randomUUID()}` as ToolCallId; }`
- `createTraceId` (FunctionDeclaration) — `export function createTraceId(): TraceId { return crypto.randomUUID() as TraceId; }`
- `createTurnId` (FunctionDeclaration) — `export function createTurnId(id?: string): TurnId { return `turn\_${id ?? crypto.randomUUID()}` as TurnId; }`
- `createWorkspaceId` (FunctionDeclaration) — `export function createWorkspaceId(id?: string): WorkspaceId { return `ws\_${id ?? crypto.randomUUID()}` as WorkspaceId; }`
- `EventId` (TypeAliasDeclaration) — `string & { readonly __brand: "EventId"; }`
- `InputHistoryId` (TypeAliasDeclaration) — `string & { readonly __brand: "InputHistoryId"; }`
- `InteractionRequestOrigin` (TypeAliasDeclaration) — `SubagentInteractionRequestOrigin`
- `MessageId` (TypeAliasDeclaration) — `string & { readonly __brand: "MessageId"; }`
- `PartId` (TypeAliasDeclaration) — `string & { readonly __brand: "PartId"; }`
- `ProjectId` (TypeAliasDeclaration) — `string & { readonly __brand: "ProjectId"; }`
- `QueryId` (TypeAliasDeclaration) — `string & { readonly __brand: "QueryId"; }`
- `SessionId` (TypeAliasDeclaration) — `string & { readonly __brand: "SessionId"; }`
- `SubagentInteractionRequestOrigin` (InterfaceDeclaration) — `SubagentInteractionRequestOrigin`
- `ToolCallId` (TypeAliasDeclaration) — `string & { readonly __brand: "ToolCallId"; }`
- `TraceId` (TypeAliasDeclaration) — `string & { readonly __brand: "TraceId"; }`
- `TurnId` (TypeAliasDeclaration) — `string & { readonly __brand: "TurnId"; }`
- `WorkspaceId` (TypeAliasDeclaration) — `string & { readonly __brand: "WorkspaceId"; }`

### `interfaces/subagent.port.ts`

- `SubagentLaunchOptions` (TypeAliasDeclaration) — `SubagentRunOptions`
- `SubagentLaunchRequest` (InterfaceDeclaration) — `SubagentLaunchRequest`
- `SubagentPort` (InterfaceDeclaration) — `SubagentPort`
- `SubagentRunOptions` (InterfaceDeclaration) — `SubagentRunOptions`
- `SubagentRunRequest` (InterfaceDeclaration) — `SubagentRunRequest`
- `SubagentSendMessageDelivery` (TypeAliasDeclaration) — `"queued" | "steered" | "resumed_background"`
- `SubagentSendMessageOptions` (InterfaceDeclaration) — `SubagentSendMessageOptions`
- `SubagentSendMessageRequest` (InterfaceDeclaration) — `SubagentSendMessageRequest`
- `SubagentSendMessageResult` (InterfaceDeclaration) — `SubagentSendMessageResult`
- `SubagentStartOptions` (InterfaceDeclaration) — `SubagentStartOptions`
- `SubagentStartRequest` (TypeAliasDeclaration) — `SubagentRunRequest`
- `SubagentStopOptions` (InterfaceDeclaration) — `SubagentStopOptions`
- `SubagentTaskSnapshot` (InterfaceDeclaration) — `SubagentTaskSnapshot`
- `SubagentTaskStatus` (TypeAliasDeclaration) — `"cancelled" | "completed" | "failed" | "running" | "lost" | "stopped" | "killed"`
- `SubagentWaitOptions` (InterfaceDeclaration) — `SubagentWaitOptions`

### `interfaces/tool-artifact-store.port.ts`

- `ImageAttachmentPathPrimeRequest` (InterfaceDeclaration) — `ImageAttachmentPathPrimeRequest`
- `MediaAttachmentPathEnsureRequest` (InterfaceDeclaration) — `MediaAttachmentPathEnsureRequest`
- `MediaAttachmentPathPrimeRequest` (InterfaceDeclaration) — `MediaAttachmentPathPrimeRequest`
- `MediaAttachmentPathResult` (TypeAliasDeclaration) — `{ status: "ready"; path: string; } | { status: "unsupported"; }`
- `ToolArtifactReadRequest` (InterfaceDeclaration) — `ToolArtifactReadRequest`
- `ToolArtifactReadResult` (InterfaceDeclaration) — `ToolArtifactReadResult`
- `ToolArtifactRetention` (TypeAliasDeclaration) — `"project" | "session" | "temporary"`
- `ToolArtifactStatRequest` (InterfaceDeclaration) — `ToolArtifactStatRequest`
- `ToolArtifactStatResult` (InterfaceDeclaration) — `ToolArtifactStatResult`
- `ToolArtifactStorePort` (InterfaceDeclaration) — `ToolArtifactStorePort`
- `ToolArtifactWriteRequest` (InterfaceDeclaration) — `ToolArtifactWriteRequest`
- `ToolArtifactWriteResult` (InterfaceDeclaration) — `ToolArtifactWriteResult`
- `ToolBinaryArtifactReadResult` (InterfaceDeclaration) — `ToolBinaryArtifactReadResult`
- `ToolBinaryArtifactWriteRequest` (InterfaceDeclaration) — `ToolBinaryArtifactWriteRequest`

### `interfaces/workflow-escalate.port.ts`

- `EscalateQuestionRequest` (InterfaceDeclaration) — `EscalateQuestionRequest`
- `WorkflowEscalateOutcome` (TypeAliasDeclaration) — `{ kind: "answered"; answer: string; qid: string; } | { kind: "refused"; reason: "budget_exhausted" | "no_active_ask"; message: string; }`
- `WorkflowEscalatePort` (InterfaceDeclaration) — `WorkflowEscalatePort`

### `interfaces/workflow-submit.port.ts`

- `SubmitAccepted` (InterfaceDeclaration) — `SubmitAccepted`
- `SubmitRejected` (InterfaceDeclaration) — `SubmitRejected`
- `SubmitResultRequest` (InterfaceDeclaration) — `SubmitResultRequest`
- `SubmitVerdict` (TypeAliasDeclaration) — `SubmitAccepted | SubmitRejected`
- `SubmitViolation` (InterfaceDeclaration) — `SubmitViolation`
- `WorkflowSubmitPort` (InterfaceDeclaration) — `WorkflowSubmitPort`

### `interfaces/workflow.port.ts`

- `WorkflowPort` (InterfaceDeclaration) — `WorkflowPort`
- `WorkflowStartOptions` (InterfaceDeclaration) — `WorkflowStartOptions`
- `WorkflowStartRequest` (InterfaceDeclaration) — `WorkflowStartRequest`
- `WorkflowTaskSnapshot` (InterfaceDeclaration) — `WorkflowTaskSnapshot`
- `WorkflowTaskStatus` (TypeAliasDeclaration) — `"cancelled" | "completed" | "failed" | "running" | "lost"`

### `logging/logger.ts`

- `LogContext` (InterfaceDeclaration) — `LogContext`
- `LogEntry` (InterfaceDeclaration) — `LogEntry`
- `LogError` (InterfaceDeclaration) — `LogError`
- `Logger` (InterfaceDeclaration) — `Logger`
- `LoggerFactory` (InterfaceDeclaration) — `LoggerFactory`
- `LogLevel` (VariableDeclaration | TypeAliasDeclaration) — `{ readonly Debug: 0; readonly Info: 1; readonly Warn: 2; readonly Error: 3; }`
- `LogLevelName` (VariableDeclaration) — `{ readonly 0: "DEBUG"; readonly 1: "INFO"; readonly 2: "WARN"; readonly 3: "ERROR"; }`
- `LogRedactor` (InterfaceDeclaration) — `LogRedactor`

### `model/content-protection.ts`

- `ModelContentProtection` (TypeAliasDeclaration) — `{ kind: string; }`

### `model/image-media.ts`

- `DetectedImageMediaType` (TypeAliasDeclaration) — `"image/png" | "image/jpeg" | "image/gif" | "image/webp"`
- `detectImageMediaType` (FunctionDeclaration) — `export function detectImageMediaType(buffer: Uint8Array): DetectedImageMediaType | undefined { if ( buffer.length >= 4 && buffer[0] === 0x89 && buffer[1] === 0x50 && buffer[2] === 0x4e && buffer[3] ==`
- `normalizeImageMediaType` (FunctionDeclaration) — `export function normalizeImageMediaType(value: string): string { const lower = value.toLowerCase(); return lower === "image/jpg" ? "image/jpeg" : lower; }`
- `ParsedImageDataUrl` (InterfaceDeclaration) — `ParsedImageDataUrl`
- `parseImageDataUrl` (FunctionDeclaration) — `export function parseImageDataUrl( value: string, options: ParseImageDataUrlOptions = {}, ): ParsedImageDataUrl | undefined { const dataUrl = value.trim(); const match = /^data:(image\/[a-z0-9.+_-]+);`
- `ParseImageDataUrlOptions` (InterfaceDeclaration) — `ParseImageDataUrlOptions`

### `model/index.ts`

- `AttachmentKind` (TypeAliasDeclaration) — `"resource" | "local_file" | "inline"`
- `AttachmentRef` (InterfaceDeclaration) — `AttachmentRef`
- `createModelId` (FunctionDeclaration) — `export function createModelId(modelId: string): ModelId { const normalized = modelId.trim(); if (normalized.length === 0) { throw new ModelProtocolError(ModelErrorCode.InvalidModelSelection, "Model id`
- `createModelProviderId` (FunctionDeclaration) — `export function createModelProviderId(providerId: string): ModelProviderId { const normalized = providerId.trim(); if (normalized.length === 0) { throw new ModelProtocolError( ModelErrorCode.InvalidMo`
- `createModelUsageSummary` (FunctionDeclaration) — `export function createModelUsageSummary( usages: readonly ModelUsage[], ): ModelUsageSummary | undefined { const realUsages = usages.filter(hasModelUsage); if (realUsages.length === 0) return undefine`
- `DetectedImageMediaType` (TypeAliasDeclaration) — `"image/png" | "image/jpeg" | "image/gif" | "image/webp"`
- `detectImageMediaType` (FunctionDeclaration) — `export function detectImageMediaType(buffer: Uint8Array): DetectedImageMediaType | undefined { if ( buffer.length >= 4 && buffer[0] === 0x89 && buffer[1] === 0x50 && buffer[2] === 0x4e && buffer[3] ==`
- `EnumOptionSpec` (TypeAliasDeclaration) — `{ values: readonly string[]; map: string; }`
- `getCurrentModelInvocationContext` (FunctionDeclaration) — `export function getCurrentModelInvocationContext(): ModelInvocationContext | undefined { return modelInvocationStorage.getStore(); }`
- `getModelUsageContextTokens` (FunctionDeclaration) — `export function getModelUsageContextTokens(usage?: ModelUsage): number | undefined { if (!usage) return undefined; const inputTokens = getModelUsageInputWindowTokens(usage); const outputTokens = nonNe`
- `getModelUsageInputWindowTokens` (FunctionDeclaration) — `export function getModelUsageInputWindowTokens(usage?: ModelUsage): number | undefined { if (!usage) return undefined; const inputTokens = positiveInteger(usage.inputTokens); if (inputTokens !== undef`
- `getModelUsageTotalTokens` (FunctionDeclaration) — `export function getModelUsageTotalTokens(usage?: ModelUsage): number { if (!usage) return 0; const inputTokens = usage.inputTokens ?? (usage.cacheReadTokens ?? 0) + (usage.cacheWriteTokens ?? 0); retu`
- `hasModelUsage` (FunctionDeclaration) — `export function hasModelUsage(usage?: ModelUsage): boolean { if (!usage) return false; return ( usage.inputTokens !== undefined || usage.outputTokens !== undefined || usage.totalTokens !== undefined |`
- `JsonSchema` (TypeAliasDeclaration) — `{ [x: string]: unknown; }`
- `LimitOptionSpec` (TypeAliasDeclaration) — `{ max: number; map: string; }`
- `Model` (InterfaceDeclaration) — `Model`
- `ModelCacheControl` (InterfaceDeclaration) — `ModelCacheControl`
- `ModelContentProtection` (TypeAliasDeclaration) — `{ kind: string; }`
- `ModelErrorCode` (VariableDeclaration | TypeAliasDeclaration) — `{ readonly InvalidModelSelection: "invalid_model_selection"; readonly ModelConfigMissing: "model_config_missing"; readonly ProviderNotFound: "provider_not_found"; readonly ProviderNotConfigured: "prov`
- `ModelEvent` (TypeAliasDeclaration) — `{ type: "start"; } | { type: "compact_stream_boundary"; boundary: "provider_response_start" | "inferred_content_block_stop"; } | { type: "compact_stream_boundary"; boundary: "provider_content_block_st`
- `ModelFailureReason` (VariableDeclaration | TypeAliasDeclaration) — `{ readonly AuthFailed: "auth_failed"; readonly Cancelled: "cancelled"; readonly ContextExceeded: "context_exceeded"; readonly InvalidRequest: "invalid_request"; readonly ProviderNotConfigured: "provid`
- `ModelFileContentBlock` (InterfaceDeclaration) — `ModelFileContentBlock`
- `ModelId` (TypeAliasDeclaration) — `string & { readonly __brand: "ModelId"; }`
- `ModelImageContentBlock` (InterfaceDeclaration) — `ModelImageContentBlock`
- `ModelInputFormat` (TypeAliasDeclaration) — `{ supportsText: boolean; supportsImage: boolean; supportsVideo: boolean; supportsAudio: boolean; supportsPdf: boolean; }`
- `ModelInputMessage` (InterfaceDeclaration) — `ModelInputMessage`
- `modelInputMessageJsonSchema` (VariableDeclaration) — `{ type: string; required: string[]; additionalProperties: boolean; properties: { role: { enum: string[]; }; content: { oneOf: ({ type: string; items?: undefined; } | { type: string; items: { oneOf: ({`
- `ModelInvocationContext` (InterfaceDeclaration) — `ModelInvocationContext`
- `ModelMessageContent` (TypeAliasDeclaration) — `string | ModelMessageContentBlock[]`
- `ModelMessageContentBlock` (TypeAliasDeclaration) — `ModelFileContentBlock | ModelImageContentBlock | ModelTextContentBlock | ModelReasoningContentBlock | ModelVideoContentBlock | ModelResourceLinkContentBlock`
- `modelMessageContentBlockToText` (FunctionDeclaration) — `export function modelMessageContentBlockToText(block: ModelMessageContentBlock): string { switch (block.type) { case "text": return block.text; case "reasoning": return ""; case "image": return attach`
- `modelMessageContentToText` (FunctionDeclaration) — `export function modelMessageContentToText(content: ModelMessageContent): string { if (typeof content === "string") return content; return content.map(modelMessageContentBlockToText).filter(Boolean).jo`
- `ModelMessageRole` (TypeAliasDeclaration) — `"user" | "system" | "tool" | "assistant"`
- `ModelNetworkStatusEvent` (TypeAliasDeclaration) — `ModelRequestQueuedStatusEvent | ModelRequestAdmittedStatusEvent | ModelRequestStartedStatusEvent | ModelRequestCompletedStatusEvent | ModelRequestFailedStatusEvent | ModelRetryScheduledStatusEvent | M`
- `modelNetworkStatusEventJsonSchema` (VariableDeclaration) — `{ type: string; required: string[]; additionalProperties: boolean; properties: { type: { enum: string[]; }; timestamp: { type: string; minLength: number; }; traceId: { type: string; minLength: number;`
- `ModelOptions` (InterfaceDeclaration) — `ModelOptions`
- `ModelOptionSpecs` (TypeAliasDeclaration) — `{ reasoningLevel: { values: readonly string[]; map: string; }; maxOutputTokens: { max: number; map: string; }; }`
- `ModelOutputFormat` (TypeAliasDeclaration) — `{ supportsText: boolean; }`
- `ModelProperties` (TypeAliasDeclaration) — `{ requiresMfjsToolSchema: boolean; contextWindow: number; inputFormat: { supportsText: boolean; supportsImage: boolean; supportsVideo: boolean; supportsAudio: boolean; supportsPdf: boolean; }; outputF`
- `ModelPropertiesInput` (TypeAliasDeclaration) — `{ requiresMfjsToolSchema: boolean; contextWindow: number; inputFormat: { supportsText: boolean; supportsImage: boolean; supportsVideo: boolean; supportsAudio: boolean; supportsPdf: boolean; }; outputF`
- `ModelProtocolError` (ClassDeclaration) — `ModelProtocolError`
- `ModelProviderId` (TypeAliasDeclaration) — `string & { readonly __brand: "ModelProviderId"; }`
- `ModelReasoningContentBlock` (InterfaceDeclaration) — `ModelReasoningContentBlock`
- `ModelRequest` (InterfaceDeclaration) — `ModelRequest`
- `ModelRequestAdmission` (InterfaceDeclaration) — `ModelRequestAdmission`
- `ModelRequestAdmissionTicket` (InterfaceDeclaration) — `ModelRequestAdmissionTicket`
- `ModelRequestAdmittedStatusEvent` (InterfaceDeclaration) — `ModelRequestAdmittedStatusEvent`
- `ModelRequestAuth` (InterfaceDeclaration) — `ModelRequestAuth`
- `ModelRequestAuthSource` (InterfaceDeclaration) — `ModelRequestAuthSource`
- `ModelRequestAuthSourceInput` (InterfaceDeclaration) — `ModelRequestAuthSourceInput`
- `ModelRequestCompletedStatusEvent` (InterfaceDeclaration) — `ModelRequestCompletedStatusEvent`
- `ModelRequestDependencies` (InterfaceDeclaration) — `ModelRequestDependencies`
- `ModelRequestFailedStatusEvent` (InterfaceDeclaration) — `ModelRequestFailedStatusEvent`
- `ModelRequestQueuedStatusEvent` (InterfaceDeclaration) — `ModelRequestQueuedStatusEvent`
- `ModelRequestSessionType` (VariableDeclaration | TypeAliasDeclaration) — `{ readonly Main: "main"; readonly Other: "other"; readonly Subagent: "subagent"; }`
- `ModelRequestSettings` (InterfaceDeclaration) — `ModelRequestSettings`
- `ModelRequestStartedStatusEvent` (InterfaceDeclaration) — `ModelRequestStartedStatusEvent`
- `ModelRequestTarget` (InterfaceDeclaration) — `ModelRequestTarget`
- `ModelResourceLinkContentBlock` (InterfaceDeclaration) — `ModelResourceLinkContentBlock`
- `ModelResult` (TypeAliasDeclaration) — `ModelTextResult`
- `ModelRetryBudget` (VariableDeclaration | TypeAliasDeclaration) — `{ readonly Default: "default"; readonly Unbounded: "unbounded"; }`
- `ModelRetryReason` (VariableDeclaration | TypeAliasDeclaration) — `{ readonly RateLimited: "rate_limited"; readonly ProviderOverloaded: "provider_overloaded"; readonly ServerError: "server_error"; readonly NetworkError: "network_error"; readonly Timeout: "timeout"; r`
- `ModelRetryScheduledStatusEvent` (InterfaceDeclaration) — `ModelRetryScheduledStatusEvent`
- `ModelSelection` (TypeAliasDeclaration) — `{ providerId: string; modelId: string; options?: { reasoningLevel?: string | undefined; } | undefined; }`
- `modelSelectionJsonSchema` (VariableDeclaration) — `{ type: string; required: string[]; additionalProperties: boolean; properties: { providerId: { type: string; minLength: number; }; modelId: { type: string; minLength: number; }; options: { type: strin`
- `ModelServerToolUsage` (InterfaceDeclaration) — `ModelServerToolUsage`
- `ModelSource` (InterfaceDeclaration) — `ModelSource`
- `ModelStatusSink` (InterfaceDeclaration) — `ModelStatusSink`
- `ModelStreamEvent` (TypeAliasDeclaration) — `{ type: "start"; } | { type: "compact_stream_boundary"; boundary: "provider_response_start" | "inferred_content_block_stop"; } | { type: "compact_stream_boundary"; boundary: "provider_content_block_st`
- `ModelStreamRecoveryStatus` (InterfaceDeclaration) — `ModelStreamRecoveryStatus`
- `ModelStreamStalledStatusEvent` (InterfaceDeclaration) — `ModelStreamStalledStatusEvent`
- `ModelTelemetryMilestoneStatusEvent` (InterfaceDeclaration) — `ModelTelemetryMilestoneStatusEvent`
- `ModelTextContentBlock` (InterfaceDeclaration) — `ModelTextContentBlock`
- `ModelTextRequest` (InterfaceDeclaration) — `ModelTextRequest`
- `modelTextRequestJsonSchema` (VariableDeclaration) — `{ type: string; required: string[]; additionalProperties: boolean; properties: { messages: { type: string; items: { type: string; required: string[]; additionalProperties: boolean; properties: { role:`
- `ModelTextResult` (InterfaceDeclaration) — `ModelTextResult`
- `ModelToolCall` (InterfaceDeclaration) — `ModelToolCall`
- `ModelToolChoice` (TypeAliasDeclaration) — `"auto" | "none" | "required" | { type: "tool"; toolName: string; }`
- `ModelToolContract` (InterfaceDeclaration) — `ModelToolContract`
- `ModelToolExecutionContext` (InterfaceDeclaration) — `ModelToolExecutionContext`
- `ModelToolResult` (InterfaceDeclaration) — `ModelToolResult`
- `ModelToolSideEffectScope` (TypeAliasDeclaration) — `"system" | "session" | "workspace" | "none" | "network" | "git" | "userInteraction"`
- `ModelTransportKind` (VariableDeclaration | TypeAliasDeclaration) — `{ readonly Http: "http"; readonly Sse: "sse"; readonly WebSocket: "websocket"; }`
- `ModelUsage` (InterfaceDeclaration) — `ModelUsage`
- `ModelUsageSummary` (InterfaceDeclaration) — `ModelUsageSummary`
- `ModelVideoContentBlock` (InterfaceDeclaration) — `ModelVideoContentBlock`
- `normalizeImageMediaType` (FunctionDeclaration) — `export function normalizeImageMediaType(value: string): string { const lower = value.toLowerCase(); return lower === "image/jpg" ? "image/jpeg" : lower; }`
- `ParsedImageDataUrl` (InterfaceDeclaration) — `ParsedImageDataUrl`
- `parseImageDataUrl` (FunctionDeclaration) — `export function parseImageDataUrl( value: string, options: ParseImageDataUrlOptions = {}, ): ParsedImageDataUrl | undefined { const dataUrl = value.trim(); const match = /^data:(image\/[a-z0-9.+_-]+);`
- `ParseImageDataUrlOptions` (InterfaceDeclaration) — `ParseImageDataUrlOptions`
- `parseModelSelectionValue` (FunctionDeclaration) — `export function parseModelSelectionValue(value: unknown): ModelSelection | undefined { const parsed = modelSelectionSchema.safeParse(value); return parsed.success ? parsed.data : undefined; }`
- `runWithModelInvocationContext` (FunctionDeclaration) — `export function runWithModelInvocationContext<T>(context: ModelInvocationContext, run: () => T): T { const result = modelInvocationStorage.run(context, run); if (!isAsyncIterable(result)) return resul`
- `ToolCall` (InterfaceDeclaration) — `ModelToolCall`

### `model/invocation-context.ts`

- `getCurrentModelInvocationContext` (FunctionDeclaration) — `export function getCurrentModelInvocationContext(): ModelInvocationContext | undefined { return modelInvocationStorage.getStore(); }`
- `ModelInvocationContext` (InterfaceDeclaration) — `ModelInvocationContext`
- `ModelRequestAuth` (InterfaceDeclaration) — `ModelRequestAuth`
- `ModelRequestAuthSource` (InterfaceDeclaration) — `ModelRequestAuthSource`
- `ModelRequestAuthSourceInput` (InterfaceDeclaration) — `ModelRequestAuthSourceInput`
- `ModelRequestDependencies` (InterfaceDeclaration) — `ModelRequestDependencies`
- `runWithModelInvocationContext` (FunctionDeclaration) — `export function runWithModelInvocationContext<T>(context: ModelInvocationContext, run: () => T): T { const result = modelInvocationStorage.run(context, run); if (!isAsyncIterable(result)) return resul`

### `model/media-policy.ts`

- `createUnsupportedModelInputMediaText` (FunctionDeclaration) — `export function createUnsupportedModelInputMediaText( block: ModelMessageContentBlock, unsupportedKind: UnsupportedModelInputMediaKind, ): string { const placeholder = modelMessageContentToText([block`
- `getUnsupportedModelInputMediaKind` (FunctionDeclaration) — `export function getUnsupportedModelInputMediaKind( block: ModelMessageContentBlock, inputFormat: ModelInputFormat, ): UnsupportedModelInputMediaKind | undefined { if (block.type === "image" && !inputF`
- `isProviderVisibleModelInputMediaBlock` (FunctionDeclaration) — `export function isProviderVisibleModelInputMediaBlock(block: ModelMessageContentBlock): boolean { return ( block.type === "image" || isProviderVisiblePdfModelInputBlock(block) || isProviderVisibleVide`
- `isProviderVisiblePdfModelInputBlock` (FunctionDeclaration) — `export function isProviderVisiblePdfModelInputBlock(block: ModelMessageContentBlock): boolean { return ( block.type === "file" && block.mediaType.split(";", 1)[0]?.trim().toLowerCase() === "applicatio`
- `isProviderVisibleVideoModelInputBlock` (FunctionDeclaration) — `export function isProviderVisibleVideoModelInputBlock(block: ModelMessageContentBlock): boolean { return ( (block.type === "video" || block.type === "file") && block.mediaType.toLowerCase().startsWith`
- `UnsupportedModelInputMediaKind` (TypeAliasDeclaration) — `"image input" | "PDF input" | "video input"`

### `model/model.ts`

- `EnumOptionSpec` (TypeAliasDeclaration) — `{ values: readonly string[]; map: string; }`
- `LimitOptionSpec` (TypeAliasDeclaration) — `{ max: number; map: string; }`
- `Model` (InterfaceDeclaration) — `Model`
- `ModelEvent` (TypeAliasDeclaration) — `{ type: "start"; } | { type: "compact_stream_boundary"; boundary: "provider_response_start" | "inferred_content_block_stop"; } | { type: "compact_stream_boundary"; boundary: "provider_content_block_st`
- `ModelInputFormat` (TypeAliasDeclaration) — `{ supportsText: boolean; supportsImage: boolean; supportsVideo: boolean; supportsAudio: boolean; supportsPdf: boolean; }`
- `ModelOptions` (InterfaceDeclaration) — `ModelOptions`
- `ModelOptionSpecs` (TypeAliasDeclaration) — `{ reasoningLevel: { values: readonly string[]; map: string; }; maxOutputTokens: { max: number; map: string; }; }`
- `ModelOutputFormat` (TypeAliasDeclaration) — `{ supportsText: boolean; }`
- `ModelProperties` (TypeAliasDeclaration) — `{ requiresMfjsToolSchema: boolean; contextWindow: number; inputFormat: { supportsText: boolean; supportsImage: boolean; supportsVideo: boolean; supportsAudio: boolean; supportsPdf: boolean; }; outputF`
- `ModelPropertiesInput` (TypeAliasDeclaration) — `{ requiresMfjsToolSchema: boolean; contextWindow: number; inputFormat: { supportsText: boolean; supportsImage: boolean; supportsVideo: boolean; supportsAudio: boolean; supportsPdf: boolean; }; outputF`
- `ModelRequest` (InterfaceDeclaration) — `ModelRequest`
- `ModelResult` (TypeAliasDeclaration) — `ModelTextResult`
- `ModelSelection` (TypeAliasDeclaration) — `{ providerId: string; modelId: string; options?: { reasoningLevel?: string | undefined; } | undefined; }`
- `parseModelSelectionValue` (FunctionDeclaration) — `export function parseModelSelectionValue(value: unknown): ModelSelection | undefined { const parsed = modelSelectionSchema.safeParse(value); return parsed.success ? parsed.data : undefined; }`

### `network/public-egress-ip.ts`

- `getIpAddressVersion` (FunctionDeclaration) — `export function getIpAddressVersion(value: string): IpAddressVersion { return isIP(normalizeIpAddressLiteral(value)) as IpAddressVersion; }`
- `getPublicEgressIpBlockReason` (FunctionDeclaration) — `export function getPublicEgressIpBlockReason(value: string): PublicEgressIpBlockReason | undefined { const normalized = normalizeIpAddressLiteral(value); const version = isIP(normalized) as IpAddressV`
- `IpAddressVersion` (TypeAliasDeclaration) — `0 | 4 | 6`
- `normalizeIpAddressLiteral` (FunctionDeclaration) — `export function normalizeIpAddressLiteral(value: string): string { return value .toLowerCase() .replace(/\.$/, "") .replace(/^\[|\]$/g, ""); }`
- `PublicEgressIpBlockReason` (InterfaceDeclaration) — `PublicEgressIpBlockReason`

### `path/git-bash.ts`

- `gitBashPathToWindowsPath` (FunctionDeclaration) — `export function gitBashPathToWindowsPath(value: string): string { if (value.startsWith("//")) return value.replaceAll("/", "\\"); const cygdrive = value.match(/^\/cygdrive\/([A-Za-z])(\/|$)/u); if (cy`
- `windowsPathToGitBashPath` (FunctionDeclaration) — `export function windowsPathToGitBashPath(value: string): string { if (value.startsWith("\\\\")) return value.replaceAll("\\", "/"); const driveMatch = value.match(/^([A-Za-z]):(?:[/\\]|$)/u); if (driv`

### `path/index.ts`

- `gitBashPathToWindowsPath` (FunctionDeclaration) — `export function gitBashPathToWindowsPath(value: string): string { if (value.startsWith("//")) return value.replaceAll("/", "\\"); const cygdrive = value.match(/^\/cygdrive\/([A-Za-z])(\/|$)/u); if (cy`
- `windowsPathToGitBashPath` (FunctionDeclaration) — `export function windowsPathToGitBashPath(value: string): string { if (value.startsWith("\\\\")) return value.replaceAll("\\", "/"); const driveMatch = value.match(/^([A-Za-z]):(?:[/\\]|$)/u); if (driv`

### `plugins/index.ts`

- `isOfficialMarketplaceId` (FunctionDeclaration) — `export function isOfficialMarketplaceId(id: string): boolean { return id === KNORVIA_OFFICIAL_PLUGIN_MARKETPLACE; }`
- `KNORVIA_DWF_CHILD_COMMAND` (VariableDeclaration) — `"__knorvia-dwf-child"`
- `KNORVIA_INLINE_PLUGIN_MARKETPLACE` (VariableDeclaration) — `"inline"`
- `KNORVIA_OFFICIAL_PLUGIN_MARKETPLACE` (VariableDeclaration) — `"knorvia-plugins-bundled"`
- `KNORVIA_PLUGIN_HOST_COMMAND` (VariableDeclaration) — `"__knorvia-plugin-host"`
- `PluginComponentGroup` (InterfaceDeclaration) — `PluginComponentGroup`
- `PluginComponentItem` (InterfaceDeclaration) — `PluginComponentItem`
- `PluginComponentKind` (TypeAliasDeclaration) — `"skill" | "command" | "mcp" | "agent" | "hook"`
- `PluginConfig` (InterfaceDeclaration) — `PluginConfig`
- `PluginDiagnostic` (InterfaceDeclaration) — `PluginDiagnostic`
- `PluginDiagnosticCode` (TypeAliasDeclaration) — `"plugin_root_not_found" | "plugin_manifest_not_found" | "plugin_manifest_invalid" | "plugin_component_path_invalid" | "plugin_unsupported_component" | "plugin_skill_root_empty" | "plugin_mcp_read_fail`
- `PluginDiagnosticSeverity` (TypeAliasDeclaration) — `"warning" | "error"`
- `PluginDiscoverRequest` (InterfaceDeclaration) — `PluginDiscoverRequest`
- `PluginHookDetail` (InterfaceDeclaration) — `PluginHookDetail`
- `PluginLoadOutcome` (InterfaceDeclaration) — `PluginLoadOutcome`
- `PluginManifest` (InterfaceDeclaration) — `PluginManifest`
- `PluginMarketplaceConfig` (InterfaceDeclaration) — `PluginMarketplaceConfig`
- `PluginMarketplaceSourceConfig` (TypeAliasDeclaration) — `{ source: "url"; headers?: Record<string, string>; url: string; } | { path?: string; ref?: string; repo: string; source: "github"; sparsePaths?: string[]; } | { path?: string; ref?: string; source: "g`
- `PluginMetadata` (InterfaceDeclaration) — `PluginMetadata`
- `PluginOperationOptions` (InterfaceDeclaration) — `PluginOperationOptions`
- `PluginOptionValue` (TypeAliasDeclaration) — `string | number | boolean`
- `PluginOptionValues` (TypeAliasDeclaration) — `{ [x: string]: PluginOptionValue; }`
- `PluginPort` (InterfaceDeclaration) — `PluginPort`
- `PluginReferenceCatalog` (InterfaceDeclaration) — `PluginReferenceCatalog`
- `PluginReferenceCatalogEntry` (InterfaceDeclaration) — `PluginReferenceCatalogEntry`
- `PluginSource` (TypeAliasDeclaration) — `"inline" | "official" | "cache"`
- `PluginStoreListing` (InterfaceDeclaration) — `PluginStoreListing`
- `PluginUserConfigOption` (InterfaceDeclaration) — `PluginUserConfigOption`
