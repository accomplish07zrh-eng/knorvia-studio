# shared-04 导出附录（机器生成）

运行时导出 204 项 / 纯类型 152 项；来源：TypeScript 编译器 API 按 `tsconfig.base.json` 对 packages/shared 解析。

## packages/shared/src/app-runtime-preferences.ts

- 运行时（3）：`APP_RUNTIME_PREFERENCES_CHANGED_BROADCAST_CHANNEL`、`appRuntimePreferencesChangedBroadcastPayloadSchema`、`ASK_USER_QUESTION_E2E_CLOCK_SCALE_ENV`
- 纯类型（1）：`AppRuntimePreferencesChangedBroadcastPayload`
- 具名再导出：无
- 星再导出：无

## packages/shared/src/clientConfig.ts

- 运行时（2）：`clientConfigReadOptionsSchema`、`parseClientConfigSnapshot`
- 纯类型（2）：`ClientConfigReadOptions`、`ClientConfigSnapshot`
- 具名再导出：无
- 星再导出：无

## packages/shared/src/database-startup.ts

- 运行时（12）：`canRetryDatabaseStartup`、`classifyDatabaseStartupError`、`databaseMigrationFactsSchema`、`databaseMigrationIdSchema`、`databaseStartupControlSchema`、`databaseStartupErrorCodeSchema`、`databaseStartupErrorDetails`、`databaseStartupErrorDetailsSchema`、`databaseStartupPhaseSchema`、`databaseStartupPortPayloadSchema`、`databaseStartupStateSchema`、`startupDiskSummarySchema`
- 纯类型（5）：`DatabaseMigrationFacts`、`DatabaseStartupControl`、`DatabaseStartupErrorCode`、`DatabaseStartupState`、`StartupDiskSummary`
- 具名再导出：无
- 星再导出：无

## packages/shared/src/desktopMenu.ts

- 运行时（4）：`desktopMenuMessageIds`、`desktopMenuMessages`、`formatDesktopMenuMessage`、`getDesktopMenuMessage`
- 纯类型（1）：`DesktopMenuMessageId`
- 具名再导出：无
- 星再导出：无

## packages/shared/src/dynamic-workflow-feature.ts

- 运行时（7）：`createDynamicWorkflowClientConfig`、`DEFAULT_DYNAMIC_WORKFLOW_MODE`、`DYNAMIC_WORKFLOW_MODES`、`isDynamicWorkflowModeEnabled`、`KNORVIA_DYNAMIC_WORKFLOW_MODE_ENV`、`normalizeDynamicWorkflowMode`、`resolveDynamicWorkflowClientConfig`
- 纯类型（3）：`DynamicWorkflowClientConfig`、`DynamicWorkflowClientConfigSource`、`DynamicWorkflowMode`
- 具名再导出：无
- 星再导出：无

## packages/shared/src/e2e-test-bridge.ts

- 运行时（1）：`shouldEnableE2ETestBridge`
- 纯类型（1）：`E2ETestBridgeEnvironment`
- 具名再导出：无
- 星再导出：无

## packages/shared/src/endpointHostname.ts

- 运行时（1）：`resolveSafeEndpointHostname`
- 纯类型（0）：无
- 具名再导出：无
- 星再导出：无

## packages/shared/src/feedback.ts

- 运行时（7）：`DEFAULT_FEEDBACK_TICKET_FRAMEWORK`、`FEEDBACK_FRAMEWORK_NONE`、`FEEDBACK_TICKET_FRAMEWORK_OPTIONS`、`FEEDBACK_TICKET_FRAMEWORKS`、`FEEDBACK_TICKET_MODULES`、`FEEDBACK_TICKET_SEVERITIES`、`FEEDBACK_TICKET_TYPES`
- 纯类型（19）：`CreateFeedbackTicketInput`、`FeedbackAttachment`、`FeedbackAttachmentKind`、`FeedbackComment`、`FeedbackCommentAttachment`、`FeedbackDeviceInfo`、`FeedbackListQuery`、`FeedbackListResult`、`FeedbackReporter`、`FeedbackTicketDetail`、`FeedbackTicketEvent`、`FeedbackTicketEventType`、`FeedbackTicketFramework`、`FeedbackTicketFrameworkSelectValue`、`FeedbackTicketModule`、`FeedbackTicketSeverity`、`FeedbackTicketStatus`、`FeedbackTicketSummary`、`FeedbackTicketType`
- 具名再导出：无
- 星再导出：无

## packages/shared/src/feedbackPrivacy.ts

- 运行时（1）：`redactFeedbackText`
- 纯类型（0）：无
- 具名再导出：无
- 星再导出：无

## packages/shared/src/helpAppConfig.ts

- 运行时（1）：`resolveHelpAppConfig`
- 纯类型（1）：`HelpAppConfig`
- 具名再导出：无
- 星再导出：无

## packages/shared/src/intranetDefaults.ts

- 运行时（10）：`DEFAULT_INTRANET_MACHINE_HOST`、`INTRANET_ASSET_BASE_URL`、`INTRANET_ASSET_SERVICE_PORT`、`INTRANET_DEPS_BASE_URL`、`INTRANET_MACHINE_HOST`、`INTRANET_PROBE_SERVICE_PATH`、`INTRANET_PROBE_SERVICE_PORT`、`INTRANET_PROBE_SERVICE_URL`、`resolveIntranetDepsBaseUrl`、`resolveIntranetMachineHost`
- 纯类型（0）：无
- 具名再导出：无
- 星再导出：无

## packages/shared/src/intranetProbe.ts

- 运行时（0）：无
- 纯类型（9）：`IntranetProbeRequest`、`IntranetProbeResult`、`IntranetProbeServiceResponse`、`IntranetProbeServiceTarget`、`IntranetProbeServiceTargetResult`、`IntranetProbeTarget`、`IntranetProbeTargetResult`、`IntranetProbeTcpTarget`、`IntranetProbeTcpTargetResult`
- 具名再导出：无
- 星再导出：无

## packages/shared/src/launchMarks.ts

- 运行时（3）：`LAUNCH_MARKS_QUERY_KEY`、`parseLaunchMarks`、`serializeLaunchMarks`
- 纯类型（1）：`LaunchMarks`
- 具名再导出：无
- 星再导出：无

## packages/shared/src/lineChangeStat.ts

- 运行时（1）：`computeLineChangeStat`
- 纯类型（1）：`LineChangeStat`
- 具名再导出：无
- 星再导出：无

## packages/shared/src/localTtft.ts

- 运行时（18）：`calibrateLocalTtftClock`、`LOCAL_TTFT_BUCKETS_MS`、`LOCAL_TTFT_CLOCK_MAX_ERROR_MS`、`LOCAL_TTFT_CLOCK_TTL_MS`、`LOCAL_TTFT_MAX_DETAILS`、`LOCAL_TTFT_MAX_PENDING`、`LOCAL_TTFT_PREPARATION_STAGES`、`LOCAL_TTFT_STAGES`、`LOCAL_TTFT_TTL_MS`、`localTtftBatchSchema`、`localTtftClockSchema`、`localTtftContextSchema`、`localTtftDetailSchema`、`localTtftFactsSchema`、`localTtftIntervalSchema`、`localTtftNow`、`localTtftOutputKindSchema`、`localTtftRecordSchema`
- 纯类型（8）：`LocalTtftBatch`、`LocalTtftCalibration`、`LocalTtftClock`、`LocalTtftContext`、`LocalTtftDetail`、`LocalTtftFacts`、`LocalTtftOutputKind`、`LocalTtftRecord`
- 具名再导出：无
- 星再导出：无

## packages/shared/src/markdown-artifact-images.ts

- 运行时（3）：`decodeMarkdownArtifactImageSource`、`extractMarkdownArtifactImageRefs`、`rewriteMarkdownArtifactImageSources`
- 纯类型（0）：无
- 具名再导出：无
- 星再导出：无

## packages/shared/src/mcp.ts

- 运行时（7）：`convertToKnorviaAgentMcpServer`、`getMcpServerRequestHeaders`、`isKnorviaCuaMcpCommand`、`isKnorviaCuaMcpPackageArg`、`KNORVIA_CUA_OFFICIAL_MCP_NAMESPACE_NAME`、`KNORVIA_CUA_OFFICIAL_PLUGIN_ID`、`KNORVIA_PLUGIN_ID_ENV_KEY`
- 纯类型（22）：`CliMcpConfig`、`CliMcpSource`、`KnorviaAgentMcpServer`、`KnorviaMcpServer`、`LoadCliMcpFromUserDirectoryRequest`、`LoadCliMcpFromUserDirectoryResult`、`McpAuthorizationCodeOAuthConfig`、`McpClientCredentialsOAuthConfig`、`McpConfig`、`McpFileFormat`、`McpOAuthConfig`、`McpScope`、`McpServerConfig`、`McpServerListItem`、`McpServerStatus`、`McpSource`、`McpTestResult`、`MigrateLegacyCommonMcpRequest`、`MigrateLegacyCommonMcpResult`、`NativeMcpFileReference`、`NativeMcpServerRecord`、`SaveCliMcpToUserDirectoryRequest`
- 具名再导出：无
- 星再导出：无

## packages/shared/src/memoryDiagnostics.ts

- 运行时（9）：`bytesToKb`、`createMemoryDiagnosticsRegistry`、`createMemorySampleWriteGate`、`formatMemorySampleLine`、`MEMORY_SAMPLE_HEAP_DELTA_RATIO`、`MEMORY_SAMPLE_HEARTBEAT_MS`、`MEMORY_SAMPLE_INTERVAL_MS`、`MEMORY_SAMPLE_NATIVE_DELTA_RATIO`、`memoryUsageToSampleFields`
- 纯类型（8）：`MemoryDiagnosticsProvider`、`MemoryDiagnosticsRegistry`、`MemorySample`、`MemorySampleFields`、`MemorySampleRole`、`MemorySampleWriteGate`、`MemorySampleWriteGateOptions`、`MemorySampleWriteReason`
- 具名再导出：无
- 星再导出：无

## packages/shared/src/model-config.ts

- 运行时（14）：`completeEnumOptionSpecDataSchema`、`completeLimitOptionSpecDataSchema`、`completeModelConfigDataSchema`、`completeModelInputFormatDataSchema`、`completeModelOptionSpecsDataSchema`、`completeModelOutputFormatDataSchema`、`completeModelPropertiesDataSchema`、`enumOptionSpecDataSchema`、`limitOptionSpecDataSchema`、`modelConfigDataSchema`、`modelInputFormatDataSchema`、`modelOptionSpecsDataSchema`、`modelOutputFormatDataSchema`、`modelPropertiesDataSchema`
- 纯类型（6）：`EnumOptionSpecData`、`LimitOptionSpecData`、`ModelInputFormatData`、`ModelOptionSpecsData`、`ModelOutputFormatData`、`ModelPropertiesData`
- 具名再导出：无
- 星再导出：无

## packages/shared/src/model-execution.ts

- 运行时（1）：`modelExecutionSchema`
- 纯类型（0）：无
- 具名再导出：无
- 星再导出：无

## packages/shared/src/node.ts

- 运行时（0）：无
- 纯类型（13）：`acquireFileLock`、`atomicWritePrivateTextFile`、`backupCorruptFile`、`createNodeSelfResourceSampler`、`migrateSubagentStateFile`、`migrateUserSubagentMarkdown`、`NODE_SELF_RESOURCE_SAMPLE_INTERVAL_MS`、`NodeSelfResourceSampler`、`NodeSelfResourceSamplerOptions`、`resolveKnorviaDataRoot`、`scanOfficialPluginCacheRoots`、`SharedFileLockOptions`、`withFileLock`
- 具名再导出：./node/atomicFileLock.js（acquireFileLock）、./node/knorviaPaths.js（resolveKnorviaDataRoot）、./node/officialPluginCache.js（scanOfficialPluginCacheRoots）、./node/subagentMarkdownMigration.js（migrateUserSubagentMarkdown, migrateSubagentStateFile）、./node/privateFilePersistence.js（atomicWritePrivateTextFile, backupCorruptFile, withFileLock, type SharedFileLockOptions）、./node/nodeSelfResourceTelemetry.js（createNodeSelfResourceSampler, NODE_SELF_RESOURCE_SAMPLE_INTERVAL_MS, type NodeSelfResourceSampler, type NodeSelfResourceSamplerOptions）
- 星再导出：无

## packages/shared/src/oauth.ts

- 运行时（5）：`BIGMODEL_PROVIDER_ID`、`CREDENTIAL_DECRYPT_ERROR_CODE`、`CREDENTIAL_DECRYPT_ERROR_PREFIX`、`isCredentialDecryptError`、`ZAI_PROVIDER_ID`
- 纯类型（1）：`OAuthProviderId`
- 具名再导出：无
- 星再导出：无

## packages/shared/src/official-mcp-auth.ts

- 运行时（14）：`createOfficialMcpTrustedOriginRegistry`、`findOfficialMcpReservedHeaders`、`isOfficialMcpOriginTrusted`、`isOfficialMcpReservedHeaderName`、`KNORVIA_OFFICIAL_MCP_AUTH_PROVIDER_JWT_TOKEN`、`KNORVIA_OFFICIAL_MCP_AUTH_TYPE`、`KNORVIA_WORKSPACE_IDENTITY_ENV`、`OFFICIAL_MCP_AUTH_FAILURE_REASONS`、`OFFICIAL_MCP_AUTH_HEADER_NAMES`、`OFFICIAL_MCP_AUTH_META_KEY`、`OFFICIAL_MCP_AUTH_PORT_FAILURE_REASONS`、`OFFICIAL_MCP_DEV_TRUSTED_ORIGINS_ENV`、`OFFICIAL_MCP_RESERVED_HEADER_NAMES`、`summarizeOfficialMcpIdentityHeaders`
- 纯类型（8）：`CreateOfficialMcpTrustedOriginRegistryOptions`、`IsOfficialMcpOriginTrustedInput`、`OfficialMcpAuthFailureKind`、`OfficialMcpAuthFailureReason`、`OfficialMcpAuthPortFailureReason`、`OfficialMcpTargetType`、`OfficialMcpTrustedOriginRegistry`、`OfficialMcpTrustResult`
- 具名再导出：无
- 星再导出：无

## packages/shared/src/official-mcp-tool-error.ts

- 运行时（2）：`OFFICIAL_MCP_TOOL_ERROR_CODES`、`parseOfficialMcpToolError`
- 纯类型（2）：`OfficialMcpToolError`、`OfficialMcpToolErrorCode`
- 具名再导出：无
- 星再导出：无

## packages/shared/src/onboardingRecord.ts

- 运行时（4）：`onboardingInterfaceModeSchema`、`onboardingOccupationSchema`、`onboardingRecordEntrySchema`、`onboardingRecordFileSchema`
- 纯类型（3）：`OnboardingRecordEntry`、`OnboardingRecordEntryInput`、`OnboardingRecordFile`
- 具名再导出：无
- 星再导出：无

## packages/shared/src/openrouter-attribution.ts

- 运行时（3）：`isOpenRouterBaseUrl`、`OPENROUTER_ATTRIBUTION_HEADERS`、`withOpenRouterAttributionHeaders`
- 纯类型（0）：无
- 具名再导出：无
- 星再导出：无

## packages/shared/src/plan-identity.ts

- 运行时（1）：`resolvePlanIdentitySnapshot`
- 纯类型（0）：无
- 具名再导出：无
- 星再导出：无

## packages/shared/src/plugin-display-name.ts

- 运行时（3）：`formatCanonicalPluginName`、`resolveLocalizedText`、`resolvePluginDisplayName`
- 纯类型（0）：无
- 具名再导出：无
- 星再导出：无

## packages/shared/src/plugin-marketplaces.ts

- 运行时（5）：`DEFAULT_ENABLED_OFFICIAL_PLUGIN_IDS`、`DEFAULT_PLUGIN_MARKETPLACES`、`isPublicStoreMarketplaceId`、`KNORVIA_OFFICIAL_PLUGIN_MARKETPLACE_ID`、`PUBLIC_STORE_MARKETPLACE_IDS`
- 纯类型（1）：`DefaultPluginMarketplace`
- 具名再导出：无
- 星再导出：无

## packages/shared/src/pluginStoreOrder.ts

- 运行时（1）：`parsePluginStoreOrder`
- 纯类型（2）：`PluginStoreModeOrder`、`PluginStoreOrder`
- 具名再导出：无
- 星再导出：无

## packages/shared/src/pluginStoreOrdering.ts

- 运行时（5）：`compareDocumentPluginPriority`、`FALLBACK_PLUGIN_STORE_CATEGORY`、`PLUGIN_STORE_CATEGORY_ORDER`、`resolvePluginStoreCategory`、`sortPluginStoreEntries`
- 纯类型（0）：无
- 具名再导出：无
- 星再导出：无

## packages/shared/src/provider-provisioning.ts

- 运行时（8）：`isProviderProvisioningAccountCredentialKey`、`providerProvisioningAccountSettingsSchema`、`providerProvisioningCredentialEntrySchema`、`providerProvisioningCredentialScopeSchema`、`providerProvisioningEnvelopeSchema`、`providerProvisioningPersonalConfigSchema`、`providerProvisioningResultSchema`、`providerProvisioningTriggerSchema`
- 纯类型（7）：`ProviderProvisioningAccountSettings`、`ProviderProvisioningCredentialEntry`、`ProviderProvisioningCredentialScope`、`ProviderProvisioningEnvelope`、`ProviderProvisioningPersonalConfig`、`ProviderProvisioningResult`、`ProviderProvisioningTrigger`
- 具名再导出：无
- 星再导出：无

## packages/shared/src/remote-sync.ts

- 运行时（0）：无
- 纯类型（1）：`RemoteSyncWriteAccessResult`
- 具名再导出：无
- 星再导出：无

## packages/shared/src/remote-workspace-identity.ts

- 运行时（3）：`buildRemoteWorkspaceIdentity`、`isRemoteWorkspaceIdentity`、`parseRemoteWorkspaceIdentity`
- 纯类型（2）：`ParsedRemoteWorkspaceIdentity`、`RemoteWorkspaceIdentityKind`
- 具名再导出：无
- 星再导出：无

## packages/shared/src/remoteAppConfig.ts

- 运行时（7）：`getCommunityUrlFromConfig`、`getCommunityUrlFromConfigs`、`getCommunityUrlsFromConfig`、`getFeedbackApiBaseFromConfig`、`getFeedbackUrlFromConfig`、`getFeedbackUseExternalFormFromConfig`、`getForceUpdateMinimalVersionFromConfig`
- 纯类型（0）：无
- 具名再导出：无
- 星再导出：无

## packages/shared/src/remoteUsageTelemetry.ts

- 运行时（3）：`buildRemoteWorkspaceConnectResultTelemetry`、`classifyRemoteUsageError`、`resolveWorkspaceTelemetryDetail`
- 纯类型（5）：`RemoteUsageErrorCategory`、`RemoteUsageRemoteKind`、`RemoteUsageResult`、`RemoteUsageWorkspaceKind`、`RemoteWorkspaceConnectTrigger`
- 具名再导出：无
- 星再导出：无

## packages/shared/src/rendererActionTrace.ts

- 运行时（11）：`DISABLED_RENDERER_ACTION_TRACE_CONFIG`、`RENDERER_ACTION_TRACE_MAX_BATCH_BYTES`、`RENDERER_ACTION_TRACE_MAX_BATCH_SPANS`、`RENDERER_ACTION_TRACE_MAX_SAMPLE_RATIO`、`RENDERER_ACTION_TRACE_SERVICE_NAME`、`rendererActionTraceAttributesSchema`、`rendererActionTraceBatchSchema`、`rendererActionTraceConfigSchema`、`rendererActionTraceGroupSchema`、`rendererActionTraceResourceSchema`、`rendererActionTraceSpanSchema`
- 纯类型（6）：`RendererActionTraceAttributes`、`RendererActionTraceBatchV1`、`RendererActionTraceConfigV1`、`RendererActionTraceGroup`、`RendererActionTraceResourceV1`、`RendererActionTraceSpanV1`
- 具名再导出：无
- 星再导出：无

## packages/shared/src/server-remote.ts

- 运行时（4）：`SERVER_REMOTE_PROTOCOL_VERSION`、`serverRemoteHostCapabilitySchema`、`serverRemoteInfoSchema`、`serverRemoteWorkspaceInfoSchema`
- 纯类型（3）：`ServerRemoteHostCapability`、`ServerRemoteInfo`、`ServerRemoteWorkspaceInfo`
- 具名再导出：无
- 星再导出：无

## packages/shared/src/serviceAuthority.ts

- 运行时（5）：`isServiceAuthorityMode`、`parseServiceAuthorityMode`、`SERVICE_AUTHORITY_MODE_ENV`、`serviceAuthorityModes`、`shouldUseProviderRegistrySourceForAuthorityMode`
- 纯类型（1）：`ServiceAuthorityMode`
- 具名再导出：无
- 星再导出：无

## packages/shared/src/session-debug.ts

- 运行时（6）：`calculateOutputTps`、`SESSION_DEBUG_LIMITS`、`sessionDebugNetworkEntrySchema`、`sessionDebugParamsSchema`、`sessionDebugRoundSchema`、`sessionDebugSnapshotSchema`
- 纯类型（2）：`SessionDebugNetworkEntry`、`SessionDebugSnapshot`
- 具名再导出：无
- 星再导出：无

## packages/shared/src/sessionCreateTelemetry.ts

- 运行时（2）：`automationSessionCreateTelemetrySchema`、`sessionCreateTelemetrySchema`
- 纯类型（4）：`AutomationSessionCreateTelemetry`、`MobileSessionCreateTelemetry`、`SessionCreateClientKind`、`SessionCreateSource`
- 具名再导出：无
- 星再导出：无

## packages/shared/src/skill-scan-policy.ts

- 运行时（4）：`MAX_SKILL_SCAN_DEPTH`、`shouldWalkSkillDirectoryEntry`、`SKILL_FILE_NAME`、`SKILL_SCAN_EXCLUDED_DIRECTORY_NAMES`
- 纯类型（0）：无
- 具名再导出：无
- 星再导出：无

## packages/shared/src/update.ts

- 运行时（0）：无
- 纯类型（3）：`PostUpdateReleaseNotesPayload`、`UpdateCheckResultPayload`、`UpdateStatePayload`
- 具名再导出：无
- 星再导出：无

## packages/shared/src/wslUserValidation.ts

- 运行时（3）：`isValidWslUser`、`WSL_USER_MAX_LENGTH`、`wslUserSchema`
- 纯类型（0）：无
- 具名再导出：无
- 星再导出：无
