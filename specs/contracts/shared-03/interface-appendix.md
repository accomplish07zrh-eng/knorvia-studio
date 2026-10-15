# shared-03 导出附录（机器生成）

运行时导出 195 项 / 纯类型 90 项；来源：ts-morph 按 `tsconfig.base.json` 解析。

## packages/shared/src/workspace-hook-config.ts

- 运行时（15）：`DEFAULT_WORKSPACE_HOOK_MAX_OUTPUT_BYTES`、`DEFAULT_WORKSPACE_HOOK_TIMEOUT_MS`、`WORKSPACE_HOOK_DIGEST_SCHEMA_VERSION`、`WORKSPACE_HOOK_EVENT_NAMES`、`createWorkspaceHookSourceInput`、`discoverWorkspaceHookConfigPaths`、`readWorkspaceHookProjectSources`、`resolveWorkspaceHookConfiguredGates`、`resolveWorkspaceHookMaxOutputBytes`、`resolveWorkspaceHookRuntimeRoot`、`resolveWorkspaceHookTimeoutMs`、`workspaceHookCommandConfigSchema`、`workspaceHookMatcherConfigSchema`、`workspaceHookProcessConfigSchema`、`workspaceHooksConfigSchema`
- 纯类型（8）：`WorkspaceHookConfigFileKind`、`WorkspaceHookConfigPathRef`、`WorkspaceHookDefinition`、`WorkspaceHookEventName`、`WorkspaceHookRuntimeRoot`、`WorkspaceHookSourceInput`、`WorkspaceHookSourceReadError`、`WorkspaceHooksConfig`
- 具名再导出：无
- 星再导出：无

## packages/shared/src/workspace-hook-digest.ts

- 运行时（3）：`buildWorkspaceHookBundleSnapshot`、`createWorkspaceHookDeclarationDigest`、`resolveWorkspaceHookEntries`
- 纯类型（2）：`CanonicalWorkspaceHookEntryData`、`WorkspaceHookBundleSnapshotData`
- 具名再导出：无
- 星再导出：无

## packages/shared/src/workspace-hook-discovery.ts

- 运行时（18）：`DEFAULT_WORKSPACE_HOOK_MAX_OUTPUT_BYTES`、`DEFAULT_WORKSPACE_HOOK_TIMEOUT_MS`、`WORKSPACE_HOOK_DIGEST_SCHEMA_VERSION`、`WORKSPACE_HOOK_EVENT_NAMES`、`buildWorkspaceHookBundleSnapshot`、`createWorkspaceHookDeclarationDigest`、`createWorkspaceHookSourceInput`、`discoverWorkspaceHookConfigPaths`、`readWorkspaceHookProjectSources`、`resolveWorkspaceHookConfiguredGates`、`resolveWorkspaceHookEntries`、`resolveWorkspaceHookMaxOutputBytes`、`resolveWorkspaceHookRuntimeRoot`、`resolveWorkspaceHookTimeoutMs`、`workspaceHookCommandConfigSchema`、`workspaceHookMatcherConfigSchema`、`workspaceHookProcessConfigSchema`、`workspaceHooksConfigSchema`
- 纯类型（10）：`CanonicalWorkspaceHookEntryData`、`WorkspaceHookBundleSnapshotData`、`WorkspaceHookConfigFileKind`、`WorkspaceHookConfigPathRef`、`WorkspaceHookDefinition`、`WorkspaceHookEventName`、`WorkspaceHookRuntimeRoot`、`WorkspaceHookSourceInput`、`WorkspaceHookSourceReadError`、`WorkspaceHooksConfig`
- 具名再导出：无
- 星再导出：./workspace-hook-config.js、./workspace-hook-digest.js

## packages/shared/src/workspace-hook-mutation.ts

- 运行时（3）：`WorkspaceHookMutationError`、`atomicWriteWorkspaceHookConfig`、`writeWorkspaceHookConfiguredToggle`
- 纯类型（1）：`AtomicWorkspaceHookConfigWriteOptions`
- 具名再导出：无
- 星再导出：无

## packages/shared/src/workspace-hook-review-monotonicity.ts

- 运行时（1）：`verdictWorkspaceHookReviewRequest`
- 纯类型（2）：`WorkspaceHookReviewIdentity`、`WorkspaceHookReviewMonotonicityVerdict`
- 具名再导出：无
- 星再导出：无

## packages/shared/src/workspace-hook-trust-store-file.ts

- 运行时（4）：`WORKSPACE_HOOK_TRUST_STORE_SCHEMA_VERSION`、`parseWorkspaceHookTrustStoreContent`、`workspaceHookTrustRecordSchema`、`workspaceHookTrustStoreFileSchema`
- 纯类型（3）：`WorkspaceHookTrustRecord`、`WorkspaceHookTrustStoreFile`、`WorkspaceHookTrustStoreParseResult`
- 具名再导出：无
- 星再导出：无

## packages/shared/src/background-task-controls.ts

- 运行时（5）：`collectVisibleKnorviaBackgroundTaskControlItems`、`getKnorviaBackgroundTaskControlItemElapsedMs`、`isActiveKnorviaBackgroundTaskControlItem`、`parseKnorviaBackgroundTaskControlItems`、`resolveKnorviaBackgroundTaskControlKind`
- 纯类型（2）：`KnorviaBackgroundTaskControlItem`、`KnorviaBackgroundTaskControlStatus`
- 具名再导出：无
- 星再导出：无

## packages/shared/src/background-task-notifications.ts

- 运行时（4）：`attachKnorviaBackgroundTaskNotificationToRaw`、`collectKnorviaBackgroundTaskNotificationsByToolUseId`、`knorviaBackgroundTaskNotificationToolUpdateStatus`、`parseKnorviaBackgroundTaskNotificationText`
- 纯类型（1）：`KnorviaBackgroundTaskNotificationInfo`
- 具名再导出：无
- 星再导出：无

## packages/shared/src/background-task-control-merge.ts

- 运行时（1）：`mergeKnorviaBackgroundTaskControlItems`
- 纯类型（0）：无
- 具名再导出：无
- 星再导出：无

## packages/shared/src/background-bash-jobs.ts

- 运行时（4）：`collectVisibleKnorviaBackgroundBashJobs`、`getKnorviaBackgroundBashJobElapsedMs`、`isActiveKnorviaBackgroundBashJob`、`parseKnorviaBackgroundBashJobs`
- 纯类型（2）：`KnorviaBackgroundBashJob`、`KnorviaBackgroundBashJobStatus`
- 具名再导出：无
- 星再导出：无

## packages/shared/src/background-bash-output.ts

- 运行时（3）：`BACKGROUND_BASH_OUTPUT_MAX_BYTES`、`backgroundBashOutputResultSchema`、`backgroundBashOutputSchema`
- 纯类型（2）：`BackgroundBashOutput`、`BackgroundBashOutputResult`
- 具名再导出：无
- 星再导出：无

## packages/shared/src/bash-output-display.ts

- 运行时（1）：`bashOutputDisplaySchema`
- 纯类型（0）：无
- 具名再导出：无
- 星再导出：无

## packages/shared/src/conversation-message-projection-policy.ts

- 运行时（6）：`getConversationMessageProjectionPolicy`、`getConversationModelOnlyTurnTriggerSource`、`isConversationHiddenSyntheticMessage`、`isConversationProviderContextOnlyMessage`、`isConversationRealUserTurnStarter`、`isConversationTimelineOnlyMessage`
- 纯类型（4）：`ConversationMessageProjectionPolicy`、`ConversationProjectionMessage`、`ConversationProjectionMessageSemantics`、`ConversationProjectionPart`
- 具名再导出：无
- 星再导出：无

## packages/shared/src/conversation-preview-artifacts.ts

- 运行时（8）：`CONVERSATION_PREVIEW_CARD_CANDIDATE_LIMIT`、`CONVERSATION_PREVIEW_CARD_VISIBLE_LIMIT`、`buildConversationPreviewArtifactCandidates`、`buildConversationPreviewArtifactCandidatesFromReferences`、`conversationArtifactTypeSchema`、`extractConversationPreviewFileReferences`、`getConversationPreviewFileType`、`resolveConversationPreviewPath`
- 纯类型（5）：`ConversationPreviewArtifactCandidate`、`ConversationPreviewArtifactType`、`ConversationPreviewFileChange`、`ConversationPreviewFileKind`、`ConversationPreviewFileReference`
- 具名再导出（1）：`conversationArtifactTypeSchema` ←
- 星再导出：无

## packages/shared/src/conversation-share.ts

- 运行时（26）：`CONVERSATION_SHARE_SCHEMA_VERSION`、`conversationShareAccessModeSchema`、`conversationShareArtifactDescriptorSchema`、`conversationShareArtifactUploadDataSchema`、`conversationShareCapabilitiesDataSchema`、`conversationShareCapabilitiesWireSchema`、`conversationShareConfirmDataSchema`、`conversationShareConfirmRequestSchema`、`conversationShareContinuationArtifactSchema`、`conversationShareContinuationDataSchema`、`conversationShareContinuationRequestSchema`、`conversationShareErrorEnvelopeSchema`、`conversationShareInboundArtifactDescriptorSchema`、`conversationShareIntegritySchema`、`conversationShareKnownErrorCodeSchema`、`conversationSharePreparationDataSchema`、`conversationSharePreparationRequestSchema`、`conversationSharePreviewArtifactSchema`、`conversationSharePreviewDataSchema`、`conversationShareSha256Schema`、`createConversationShareSuccessEnvelopeSchema`、`decodeConversationShareRows`、`isConversationShareSchemaVersionSupported`、`localizeConversationShareUrl`、`narrowConversationShareCapabilities`、`parseConversationSharePathname`
- 纯类型（17）：`ConversationShareAccessMode`、`ConversationShareApiErrorCode`、`ConversationShareArtifactDescriptor`、`ConversationShareArtifactUpload`、`ConversationShareCapabilities`、`ConversationShareCapabilitiesWire`、`ConversationShareConfirmRequest`、`ConversationShareContinuation`、`ConversationShareContinuationRequest`、`ConversationShareContinuationWire`、`ConversationShareErrorEnvelope`、`ConversationShareIntegrity`、`ConversationSharePreparation`、`ConversationSharePreparationRequest`、`ConversationSharePreview`、`ConversationSharePreviewWire`、`ConversationShareRecord`
- 具名再导出：无
- 星再导出：无

## packages/shared/src/assistant-message-parts.ts

- 运行时（3）：`appendAssistantMessagePart`、`getLatestAssistantContentPart`、`getLatestAssistantContentText`
- 纯类型（1）：`KnorviaAssistantMessagePart`
- 具名再导出：无
- 星再导出：无

## packages/shared/src/assistant-presentation.ts

- 运行时（1）：`buildKnorviaAssistantPresentation`
- 纯类型（4）：`BuildKnorviaAssistantPresentationOptions`、`KnorviaAssistantPresentation`、`KnorviaAssistantPresentationBlock`、`KnorviaAssistantPresentationToolCall`
- 具名再导出：无
- 星再导出：无

## packages/shared/src/workspaceFileEntriesCodec.ts

- 运行时（3）：`WORKSPACE_FILE_ENTRIES_CHUNK_SIZE`、`packWorkspaceFileEntries`、`unpackWorkspaceFileEntries`
- 纯类型（0）：无
- 具名再导出：无
- 星再导出：无

## packages/shared/src/workspaceFileSearch.ts

- 运行时（6）：`WORKSPACE_FILE_SEARCH_DISPLAY_CAP`、`filterWorkspaceFileSearchCandidates`、`getWorkspaceFileSearchCandidateScore`、`hasWorkspaceFileSearchQuery`、`mapWorkspaceFileEntriesToSearchCandidates`、`scoreWorkspaceFileFuzzyMatch`
- 纯类型（2）：`FilterWorkspaceFileSearchCandidatesOptions`、`WorkspaceFileSearchCandidate`
- 具名再导出：无
- 星再导出：无

## packages/shared/src/workspaceSessionRestore.ts

- 运行时（1）：`resolveStartupLocalWorkspaceSessionIndex`
- 纯类型（0）：无
- 具名再导出：无
- 星再导出：无

## packages/shared/src/tool-call-summary.ts

- 运行时（4）：`getCompactToolCallStatusMessageId`、`getCompactToolCallSummary`、`isCompactToolCallFinishedState`、`isCompactToolCallRunningState`
- 纯类型（4）：`CompactToolCallState`、`ToolCallChangeStat`、`ToolCallSummary`、`ToolCallSummarySource`
- 具名再导出：无
- 星再导出：无

## packages/shared/src/tool-identity.ts

- 运行时（5）：`KNORVIA_KNOWN_TOOL_NAMES`、`getKnorviaToolFamilyForName`、`isKnorviaFileContentWriteToolName`、`isKnorviaToolFamily`、`normalizeKnorviaToolName`
- 纯类型（2）：`KnorviaKnownToolName`、`KnorviaToolFamily`
- 具名再导出：无
- 星再导出：无

## packages/shared/src/tool-plan-adapter.ts

- 运行时（4）：`extractPlanStepsFromToolInput`、`extractPlanStepsFromToolOutput`、`isMainAgentToolProjectionSource`、`isTodoPlanToolName`
- 纯类型（0）：无
- 具名再导出：无
- 星再导出：无

## packages/shared/src/streaming-tool-input-preview.ts

- 运行时（10）：`KNORVIA_ACTIVE_STREAMING_TOOL_INPUT_EAGER_DELTA_COUNT`、`KNORVIA_ACTIVE_STREAMING_TOOL_INPUT_PREVIEW_MIN_INTERVAL_MS`、`KNORVIA_ACTIVE_STREAMING_TOOL_INPUT_PREVIEW_MIN_RAW_GROWTH`、`KNORVIA_ACTIVE_STREAMING_TOOL_INPUT_TIME_BUDGET_MAX_RAW_INPUT`、`KNORVIA_FILE_STREAMING_TOOL_INPUT_PREVIEW_MIN_INTERVAL_MS`、`appendKnorviaStreamingToolInputDelta`、`buildKnorviaStreamingToolInputPreview`、`isKnorviaFileStreamingToolInputPreviewTool`、`markKnorviaStreamingToolInputPreviewMaterialized`、`shouldMaterializeKnorviaStreamingToolInputPreview`
- 纯类型（3）：`KnorviaStreamingToolInputPreview`、`KnorviaStreamingToolInputPreviewMode`、`KnorviaStreamingToolInputState`
- 具名再导出：无
- 星再导出：无

## packages/shared/src/execution-output-preview.ts

- 运行时（1）：`executionOutputPreviewSchema`
- 纯类型（1）：`ExecutionOutputPreview`
- 具名再导出：无
- 星再导出：无

## packages/shared/src/execution-state.ts

- 运行时（3）：`executionPermissionModeSchema`、`executionStateSchema`、`resolveExecutionState`
- 纯类型（1）：`ExecutionState`
- 具名再导出：无
- 星再导出：无

## packages/shared/src/permission-request-preview.ts

- 运行时（1）：`getPermissionRequestPreview`
- 纯类型（3）：`PermissionRequestFileChange`、`PermissionRequestPreview`、`PermissionRequestScope`
- 具名再导出：无
- 星再导出：无

## packages/shared/src/runtime-tool-runtime.ts

- 运行时（4）：`REMOTE_RUNTIME_TOOL_RUNTIME`、`RUNTIME_TOOL_RUNTIME`、`getRemoteRuntimeToolsForPlatform`、`getRuntimeToolRuntime`
- 纯类型（4）：`RemoteRuntimeToolDescriptor`、`ResolvedRemoteRuntimeTool`、`RuntimeToolId`、`RuntimeToolRuntimeDescriptor`
- 具名再导出：无
- 星再导出：无

## packages/shared/src/process-diagnostic.ts

- 运行时（8）：`KNORVIA_AGENT_LIFECYCLE_LOG_MARKER`、`KNORVIA_PROCESS_DIAGNOSTIC_MAX_LINE_CHARS`、`KNORVIA_PROCESS_DIAGNOSTIC_MESSAGE_MAX_CHARS`、`KNORVIA_PROCESS_DIAGNOSTIC_NAME_MAX_CHARS`、`KNORVIA_PROCESS_DIAGNOSTIC_PREFIX`、`KNORVIA_PROCESS_DIAGNOSTIC_STACK_MAX_CHARS`、`knorviaProcessDiagnosticSchema`、`parseKnorviaProcessDiagnostic`
- 纯类型（1）：`KnorviaProcessDiagnostic`
- 具名再导出：无
- 星再导出：无

## packages/shared/src/process-names.ts

- 运行时（6）：`formatKnorviaAgentProcessName`、`formatKnorviaGpuProcessName`、`formatKnorviaHostProcessName`、`formatKnorviaMainProcessName`、`formatKnorviaRendererProcessName`、`formatKnorviaUtilityProcessName`
- 纯类型（0）：无
- 具名再导出：无
- 星再导出：无

## packages/shared/src/processResourceTelemetry.ts

- 运行时（11）：`ARMS_CUSTOM_EVENT_PROPERTY_LIMIT`、`KNORVIA_CLI_RESOURCE_SAMPLE_INTERVAL_MS`、`PERF_PROCESS_WINDOW_PROPERTY_KEYS`、`PERF_SYSTEM_WINDOW_PROPERTY_KEYS`、`PERF_TOOL_EXEC_RESOURCE_PROPERTY_KEYS`、`PROCESS_RESOURCE_CLI_LANES`、`PROCESS_RESOURCE_EVENT_NAMES`、`PROCESS_RESOURCE_FORBIDDEN_PROPERTY_KEY_PATTERN`、`PROCESS_RESOURCE_ROLES`、`checkProcessResourceEventProperties`、`resolveCliProcessResourceRole`
- 纯类型（5）：`ProcessResourceCliLane`、`ProcessResourceEventName`、`ProcessResourceEventPropertyCheck`、`ProcessResourceRole`、`ProcessResourceRuntimeSurface`
- 具名再导出：无
- 星再导出：无

## packages/shared/src/subagent-markdown-selection.ts

- 运行时（3）：`formatSubagentMarkdownModel`、`migrateSubagentMarkdownProvider`、`parseSubagentMarkdownSelection`
- 纯类型（0）：无
- 具名再导出：无
- 星再导出：无

## packages/shared/src/subagent-state-migration.ts

- 运行时（1）：`importSubagentStateSelections`
- 纯类型（0）：无
- 具名再导出：无
- 星再导出：无

## packages/shared/src/task-realtime-core.ts

- 运行时（18）：`resolveWorkspaceKey`、`taskOwnerCommandDeliverySchema`、`taskOwnerCommandErrorCodeSchema`、`taskOwnerCommandRequestSchema`、`taskOwnerCommandResultSchema`、`taskRealtimeDeliveredEventSchema`、`taskRealtimeDeliveryPurposeSchema`、`taskRealtimeEventSchema`、`taskRealtimeHostDeliveryKindSchema`、`taskRealtimeReasonSchema`、`taskRunLeaseAcquireRequestSchema`、`taskRunLeaseResultSchema`、`taskRunLeaseTargetSchema`、`taskSnapshotInvalidatedEventSchema`、`taskStreamMirrorOpSchema`、`taskStreamMirrorPublishOpSchema`、`taskStreamMirrorTargetSchema`、`workspaceTaskListInvalidatedEventSchema`
- 纯类型（0）：无
- 具名再导出：无
- 星再导出：无
