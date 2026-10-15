# shared-02 接口附录（机器生成，勿手改）

由 `build-interface-appendix.mjs` 生成（生成器按 shared-01 先例留在执行工作区，不入库）：
每个继承文件的导出名，
「运行时值」列经 tsx 实际 import 核对，「纯类型」列为 `export type/interface` 声明。
这是相似度声明模式（`--declaration --interface`）的剔除依据，也是 B49/B50 公开入口导出面的 oracle。

## `account-provider-state.ts`

运行时值（1）：`accountProviderUnavailableReasonSchema`

纯类型（1）：`AccountProviderUnavailableReason`

## `api.ts`

运行时值（1）：`ApiError`

纯类型（3）：`ApiClient`、`ApiErrorOptions`、`ApiRequestInit`

## `automation-types.ts`

运行时值（4）：`AUTOMATION_CREATE_LIMIT`、`AUTOMATION_CREATE_LIMIT_ERROR_CODE`、`isAutomationCreateLimitError`、`parseAutomationRunId`

纯类型（13）：`KnorviaAutomation`、`KnorviaAutomationCreateParams`、`KnorviaAutomationDispatchStatus`、`KnorviaAutomationIntervalUnit`、`KnorviaAutomationLifecycleStatus`、`KnorviaAutomationLocationKind`、`KnorviaAutomationRun`、`KnorviaAutomationRunDispatchStatus`、`KnorviaAutomationRunIdParts`、`KnorviaAutomationRunOutcome`、`KnorviaAutomationScheduleRule`、`KnorviaAutomationTrigger`、`KnorviaAutomationUpdateParams`

## `channels.ts`

运行时值（9）：`CodingPlanWebviewChannels`、`EmbeddedBrowserWebviewChannels`、`HostMessageTypes`、`HostResponseTypes`、`InternalChannels`、`KNORVIA_RPC_CLIENT_MODE_HEADER`、`KNORVIA_RPC_HOST_CAPABILITY_HEADER`、`PlatformChannels`、`ServiceChannels`

纯类型（7）：`CodingPlanPurchaseCompletePayload`、`CodingPlanWebviewLangChangeDetail`、`CodingPlanWebviewLocale`、`EmbeddedBrowserWheelBoundaryPayload`、`PlatformChannelMap`、`PlatformChannelName`、`ServiceChannelName`

## `command-types.ts`

运行时值（2）：`isPluginCommand`、`isUserCommand`

纯类型（14）：`CommandAgentSource`、`CommandConfig`、`CommandCreateParams`、`CommandDeleteParams`、`CommandInfo`、`CommandSetEnabledParams`、`CommandSource`、`CommandStorageLevel`、`CommandUpdateParams`、`CommandsCapability`、`CommandsListResult`、`KnorviaCommand`、`PluginCommand`、`UserCommand`

## `config-schema.ts`

运行时值（1）：`sparseShape`

## `cuaAccessibilitySettings.ts`

运行时值：无（纯类型模块）

纯类型（4）：`CuaAccessibilitySettingsResult`、`CuaPermissionKind`、`OpenCuaPermissionOnboardingOptions`、`PrepareCuaHelperPermissionDragResult`

## `custom-model-value.ts`

运行时值（3）：`CUSTOM_MODEL_VALUE_PREFIX`、`decodeCustomModelValue`、`encodeCustomModelValue`

纯类型（1）：`DecodedCustomModelValue`

## `env.ts`

运行时值（11）：`KNORVIA_APP_VERSION_ENV`、`KNORVIA_ARMS_RUM_ENDPOINT`、`KNORVIA_BUILD_COMMIT_ID_ENV`、`KNORVIA_ENV`、`KNORVIA_PRODUCT_FLAVOR`、`KNORVIA_TELEMETRY_ENABLED`、`KNORVIA_TELEMETRY_REPORT_ENDPOINT`、`RUNTIME_KNORVIA_DEBUG`、`mapKnorviaEnvToArmsRumEnv`、`normalizeKnorviaEnv`、`normalizeKnorviaProductFlavor`

纯类型（3）：`ArmsRumEnv`、`KnorviaEnv`、`KnorviaProductFlavor`

## `errors.ts`

运行时值（4）：`KNORVIA_FILE_LOCK_TIMEOUT_ERROR_CODE`、`isKnorviaFileLockTimeoutError`、`normalizeUnknownError`、`stringifyUnknownValue`

纯类型（1）：`NormalizedUnknownError`

## `forceUpdate.ts`

运行时值（2）：`compareSemverVersions`、`resolveForceUpdateRequirement`

纯类型（2）：`ForceUpdateConfig`、`ForceUpdateRequirement`

## `git.ts`

运行时值：无（纯类型模块）

纯类型（54）：`GitBranchComparison`、`GitBranchMutationAction`、`GitBranchMutationIssue`、`GitBranchMutationIssueCode`、`GitBranchMutationResult`、`GitChangeKind`、`GitChangeSectionId`、`GitChangeSourceId`、`GitChangesRequest`、`GitCheckpointConflict`、`GitCheckpointConflictReason`、`GitCheckpointDiff`、`GitCheckpointDiffQuery`、`GitCheckpointFileDiff`、`GitCheckpointMeta`、`GitCheckpointRequest`、`GitCheckpointRestoreQuery`、`GitCheckpointRestoreResult`、`GitCheckpointScope`、`GitCommitGraphCommit`、`GitCommitGraphRef`、`GitCommitGraphRefKind`、`GitCommitGraphRequest`、`GitCommitGraphResult`、`GitCommitMessageConversationContext`、`GitCommitMessageConversationMessage`、`GitCommitRequest`、`GitCommitResult`、`GitCreateBranchRequest`、`GitDiffAvailability`、`GitDiffQuery`、`GitDiffRequest`、`GitDiffResult`、`GitDiscardPathsRequest`、`GitFileChange`、`GitGenerateCommitMessageRequest`、`GitGenerateCommitMessageResult`、`GitHeadRefType`、`GitIdentity`、`GitIgnoredPathsRequest`、`GitLocalBranch`、`GitLocalBranchListResult`、`GitPathMutationRequest`、`GitPushRequest`、`GitPushResult`、`GitRefreshRequest`、`GitRefreshResult`、`GitRepositoryAutoRefreshWatchPath`、`GitRepositoryChangeSourceId`、`GitRepositoryRequest`、`GitRepositorySummary`、`GitSwitchBranchRequest`、`GitWorkspaceRepositoryInfo`、`GitWorkspaceRepositoryKind`

## `handshake.ts`

运行时值：无（纯类型模块）

纯类型（2）：`HelloAckMessage`、`HelloMessage`

## `hooks.ts`

运行时值：无（纯类型模块）

纯类型（7）：`Hook`、`HookConfig`、`HookConfiguredState`、`HookEvent`、`HookType`、`ToolCallHookMeta`、`WorkspaceHookDiscoveryState`

## `legacy-model-provider-identity.ts`

运行时值（2）：`migrateLegacyModelProviderId`、`migrateLegacyOfficialGlmModelId`

## `log-format.ts`

运行时值（2）：`formatLogPrefix`、`formatTimestamp`

## `mcp-sync.ts`

运行时值：无（纯类型模块）

纯类型（10）：`McpSyncCandidate`、`McpSyncCandidateListResult`、`McpSyncExportResult`、`McpSyncExportedServer`、`McpSyncImportResult`、`McpSyncImportResultItem`、`McpSyncImportStatus`、`McpSyncRemoteStatus`、`McpSyncRemoteStatusResult`、`McpSyncSource`

## `media-preview.ts`

运行时值（2）：`MEDIA_PREVIEW_FORMATS`、`getMediaPreviewFormat`

纯类型（2）：`MediaPreviewFormat`、`MediaPreviewKind`

## `model-provider-family.ts`

运行时值（12）：`MODEL_PROVIDER_FAMILY_SPECS`、`getModelProviderFamilySpec`、`normalizeProviderFamilyDomain`、`resolveModelProviderFamilyIdByBaseURL`、`resolveModelProviderFamilyIdByProviderId`、`resolveModelProviderFamilyLabelByProviderId`、`resolveModelProviderFamilySpecByProviderId`、`resolveProviderFamilyDomainFromOAuthProvider`、`shouldShowBuiltinModelProviderForActiveOAuth`、`shouldShowBuiltinModelProviderForDomain`、`shouldShowModelProviderFamilyForActiveOAuth`、`shouldShowModelProviderFamilyForDomain`

纯类型（3）：`ModelProviderFamilyId`、`ModelProviderFamilySpec`、`ProviderFamilyDomain`

## `model-provider-types.ts`

运行时值（8）：`BUILTIN_MODEL_PROVIDER_IDS`、`BUILTIN_PROVIDER_TEMPLATE_IDS`、`isBigModelStartPlanProviderId`、`isBuiltinModelProviderId`、`isCodingPlanModelProviderId`、`isIndividualCodingPlanModelProviderId`、`isStartPlanModelProviderId`、`isZaiCodingPlanProviderId`

纯类型（3）：`BuiltinModelProviderId`、`BuiltinOAuthProviderId`、`ModelConnectivityResult`

## `model-selection-key.ts`

运行时值（9）：`CUSTOM_SUPPLIER_KEY_PREFIX`、`GHOST_SUPPLIER_KEY_PREFIX`、`NATIVE_SUPPLIER_KEY_PREFIX`、`buildCustomSupplierKey`、`buildGhostSupplierIdentity`、`buildGhostSupplierKey`、`buildNativeSupplierKey`、`normalizeSupplierBaseUrl`、`resolveSupplierKeyFromModelDisplayValue`

## `model-selection-types.ts`

运行时值（2）：`KNORVIA_AGENT_PROVIDER_NOT_READY_CODE`、`KNORVIA_AGENT_PROVIDER_NOT_READY_REASON`

纯类型（4）：`ModelSelectionGhostReason`、`ModelSelectionResolution`、`ModelSelectionUiError`、`ModelSelectionUiErrorCode`

## `model-selection.ts`

运行时值（4）：`KNORVIA_MODEL_REASONING_SEPARATOR`、`formatModelPickerValue`、`modelSelectionSchema`、`parseModelPickerValue`

纯类型（2）：`EffectiveModelSelectionResult`、`ModelSelection`

## `off-peak-types.ts`

运行时值（6）：`OFF_PEAK_PROVIDER_IDS`、`OFF_PEAK_TERMINAL_STATUSES`、`OFF_PEAK_TICKET_EXPIRED_MARKER`、`isOffPeakTerminalStatus`、`isOffPeakTicketExpiredError`、`resolveOffPeakProviderId`

纯类型（11）：`KnorviaOffPeakTask`、`KnorviaOffPeakTaskCreateParams`、`KnorviaOffPeakTaskStatus`、`OffPeakCodingPlanKind`、`OffPeakCodingPlanSupport`、`OffPeakCodingPlanUnsupportedReason`、`OffPeakTakeNumberAvailability`、`OffPeakTaskCreateErrorCategory`、`OffPeakTaskCreateFailureStage`、`OffPeakTaskCreateResult`、`OffPeakTaskTicketInitialState`

## `official-glm-model-id.ts`

运行时值（2）：`OFFICIAL_GLM_MODEL_IDS`、`normalizeOfficialGlmModelId`

## `platform.ts`

运行时值（6）：`BROWSER_SCREENSHOT_SURFACE_PREPARE_TIMEOUT_MS`、`BROWSER_VIEW_RESTORE_BOOTSTRAP_URL`、`DesktopCommandIds`、`LOCAL_MEDIA_PREVIEW_SCHEME`、`buildLocalMediaPreviewUrl`、`createOpenInEditorRemoteTarget`

纯类型（51）：`ApplicationIconInfo`、`ApplicationIconLocator`、`ApplicationIconRequest`、`BindRemoteWorkspaceSessionContextRequest`、`BrowserGuestAttachRejectReason`、`BrowserGuestAttachResult`、`BrowserTabResidencyState`、`BrowserViewCloseTabNotification`、`BrowserViewCloseTabRequest`、`BrowserViewOperationPayload`、`BrowserViewResidencyReportPayload`、`BrowserViewResidencyTransitionPayload`、`BrowserViewRestoreTabsRequest`、`BrowserViewRestoredTabShell`、`BrowserViewScreenshotSurfacePreparePayload`、`BrowserViewScreenshotSurfaceReadyPayload`、`BrowserViewScreenshotSurfaceReleasePayload`、`BrowserViewSurfaceScaleMode`、`BrowserViewViewportChangedPayload`、`CancelPendingRemoteConnectionRequest`、`ChromeBrowserDataImportError`、`ChromeBrowserDataImportOptions`、`ChromeBrowserDataImportResult`、`ConnectRemoteRequest`、`CreateTempTextAttachmentRequest`、`CreateTempTextAttachmentResult`、`CuaOsSupport`、`DesktopCommandId`、`DesktopTitleBarTheme`、`DesktopWindowChromeState`、`DesktopZoomState`、`DockerContainerInfo`、`EditorInfo`、`EmbeddedBrowserDataClearResult`、`EmbeddedBrowserOpenUrlRequest`、`IPlatformService`、`KnorviaStdioTapDevState`、`OpenInEditorOptions`、`OpenInEditorRemoteTarget`、`PrintPageToPdfResult`、`RemoteConnectionRuntimeLog`、`RemoteServiceSession`、`RemoteSessionClosedEvent`、`SSHConfigAliasOption`、`SaveFileRequest`、`SaveFileResult`、`TaskNotificationPayload`、`WSLDistro`、`WindowControlsOverlayMetrics`、`WindowControlsOverlayReadyPayload`、`WindowScreenshotResult`

## `plugin-sync.ts`

运行时值：无（纯类型模块）

纯类型（11）：`PluginSyncArchiveExportResult`、`PluginSyncCandidate`、`PluginSyncCandidateListResult`、`PluginSyncComponentType`、`PluginSyncImportResult`、`PluginSyncImportResultItem`、`PluginSyncImportStatus`、`PluginSyncMarketplaceSourceArchiveExportResult`、`PluginSyncMarketplaceSourceImportResult`、`PluginSyncRemoteStatus`、`PluginSyncRemoteStatusResult`

## `plugin-types.ts`

运行时值：无（纯类型模块）

纯类型（8）：`AvailablePluginSummary`、`InstalledPluginSummary`、`PluginComponentType`、`PluginHookDetail`、`PluginMarketplaceSummary`、`PluginScope`、`PluginsCapability`、`PluginsOverviewResult`

## `protocol.ts`

运行时值（1）：`DEFAULT_LOCALE`

纯类型（31）：`AppSettings`、`DockerRemoteTargetSnapshot`、`ElectronReleaseChannel`、`FileBinaryPreview`、`FileEntry`、`FileMediaPreview`、`FileStat`、`FileTextSlice`、`FileWatchEvent`、`HostResourceUsageProcess`、`IntegratedTerminalShellDialect`、`IntegratedTerminalShellOption`、`IntegratedTerminalShellSelection`、`KnorviaInteractionBehavior`、`LocalWorkspaceSessionEntry`、`Locale`、`LocalePreference`、`PersistedWorkspaceSessionEntry`、`RemoteTargetSnapshot`、`RemoteWorkspaceSessionEntry`、`RemoteWorkspaceSessionSnapshot`、`ResourceUsageBaseGroupKey`、`ResourceUsageCategory`、`ResourceUsageProcess`、`ResourceUsageSnapshot`、`SSHRemoteTargetSnapshot`、`SystemInfo`、`TabId`、`TabState`、`WSLRemoteTargetSnapshot`、`WorkspaceFileEntry`

## `provider-family-connection-selection.ts`

运行时值（2）：`providerFamilyConnectionSelectionSchema`、`providerFamilyConnectionSelectionSettingsSchema`

纯类型（2）：`ProviderFamilyConnectionSelection`、`ProviderFamilyConnectionSelectionSettings`

## `providers.ts`

运行时值（1）：`knorviaProviderSchema`

纯类型（1）：`KnorviaProvider`

## `remoteAssetInstallMode.ts`

运行时值（3）：`DEFAULT_REMOTE_ASSET_INSTALL_MODE`、`REMOTE_ASSET_INSTALL_MODES`、`normalizeRemoteAssetInstallMode`

纯类型（1）：`RemoteAssetInstallMode`

## `remoteEnvironmentKey.ts`

运行时值（1）：`buildRemoteEnvironmentKey`

## `remoteResourcePackages.ts`

运行时值（11）：`ACTIVE_REMOTE_RESOURCE_PACKAGE_IDS`、`OPTIONAL_REMOTE_RESOURCE_PACKAGE_IDS`、`REMOTE_RESOURCE_PACKAGE_DEPENDENCIES`、`REMOTE_RESOURCE_PACKAGE_IDS`、`REQUIRED_REMOTE_RESOURCE_PACKAGE_IDS`、`getRemoteResourcePackageDependencies`、`isActiveRemoteResourcePackage`、`isKnownRemoteResourcePackageId`、`isRemoteResourcePackageSelectedAsDependency`、`isRequiredRemoteResourcePackage`、`normalizeRemoteResourcePackageSelection`

纯类型（2）：`RemoteResourcePackageId`、`RemoteResourcePackageSelection`

## `remoteSshHostKey.ts`

运行时值（1）：`buildSshRemoteHostKey`

## `remoteTarget.ts`

运行时值（1）：`stripRemoteTargetSecrets`

纯类型（4）：`DockerConnectOptions`、`RemoteTarget`、`SSHConnectOptions`、`WSLConnectOptions`

## `runtimeEnv.ts`

运行时值（29）：`KNORVIA_AGENT_CA_CERT_ENV_KEY`、`KNORVIA_CUA_BROKER_SOCKET_ENV_KEY`、`KNORVIA_CUA_DEV_MODE_ENV_KEY`、`KNORVIA_CUA_NODE_REPL_HOST_ENV_KEY`、`KNORVIA_CUA_PLUGIN_AUTHORITY_ENV_KEY`、`KNORVIA_CUA_PRODUCT_HELPER_ENV_KEY`、`KNORVIA_DESKTOP_CONTEXT_PROMPT_ENABLED_ENV`、`KNORVIA_HTTP_PROXY_ENV_KEY`、`KNORVIA_NO_PROXY_ENV_KEY`、`KNORVIA_REMOTE_HTTP_PROXY_ENV_KEY`、`KNORVIA_REMOTE_NO_PROXY_ENV_KEY`、`KNORVIA_REMOTE_RUNTIME_NETWORK_AUTHORITY_ENV_KEY`、`KNORVIA_RUNTIME_ENV_KEY`、`KNORVIA_TOOL_ENV_PASSTHROUGH_ENV_KEY`、`buildKnorviaToolEnvPassthroughEnv`、`getCapturedKnorviaAgentTelemetryEnv`、`getCapturedKnorviaCuaBrokerCredentials`、`isCuaDevModeRequested`、`isKnorviaCuaInternalFeatureEnabled`、`normalizeKnorviaRuntimeEnv`、`readKnorviaAgentTelemetryEnv`、`readKnorviaToolEnvPassthroughEnv`、`resetCapturedKnorviaAgentTelemetryEnvForTest`、`resetCapturedKnorviaCuaBrokerCredentialsForTest`、`resolveKnorviaRuntimeEnv`、`sanitizeKnorviaRuntimeEnv`、`sanitizeKnorviaRuntimeEnvInPlace`、`shouldCaptureKnorviaToolEnvPassthroughKey`、`shouldSanitizeKnorviaRuntimeEnvKey`

纯类型（1）：`KnorviaRuntimeEnv`

## `sessionCreateSource.ts`

运行时值：无（纯类型模块）

纯类型（1）：`SessionCreateSource`

## `settings-errors.ts`

运行时值（2）：`DATA_BASE_DIR_FORBIDDEN_WINDOWS_INSTALL_DIR_ERROR_CODE`、`isDataBaseDirForbiddenWindowsInstallDirError`

## `settings-source.ts`

运行时值：无（纯类型模块）

纯类型（3）：`SettingsDirectoryLocation`、`SettingsDirectoryScope`、`SettingsDirectorySource`

## `settings-sync.ts`

运行时值：无（纯类型模块）

纯类型（31）：`SettingsSyncAgent`、`SettingsSyncAgentSummary`、`SettingsSyncCategory`、`SettingsSyncCategorySummary`、`SettingsSyncClaudeAgentsFileCopyResult`、`SettingsSyncClaudeAgentsFileMigrationStatus`、`SettingsSyncCommandImportResult`、`SettingsSyncCommandImportStatus`、`SettingsSyncCommandSkipReason`、`SettingsSyncDiscoveryResult`、`SettingsSyncFirstRunPromptState`、`SettingsSyncImportMode`、`SettingsSyncImportResult`、`SettingsSyncMcpServerImportResult`、`SettingsSyncMcpServerImportStatus`、`SettingsSyncMcpServerSkipReason`、`SettingsSyncPluginImportResult`、`SettingsSyncPluginImportStatus`、`SettingsSyncPluginSkipReason`、`SettingsSyncProgressEvent`、`SettingsSyncSelection`、`SettingsSyncSkillImportResult`、`SettingsSyncSkillImportStatus`、`SettingsSyncSkillSkipReason`、`SettingsSyncSourceCommandSummary`、`SettingsSyncSourceMcpServerSummary`、`SettingsSyncSourcePluginSummary`、`SettingsSyncSourceRootSummary`、`SettingsSyncSourceScope`、`SettingsSyncSourceSkillSummary`、`SettingsSyncTaskImportResult`

## `shortcutCommands.ts`

运行时值（6）：`SHORTCUT_COMMANDS`、`getDefaultShortcutBindings`、`isValidShortcutBinding`、`normalizeShortcutKey`、`parseShortcutBinding`、`serializeShortcutBinding`

纯类型（5）：`ParsedShortcutBinding`、`ShortcutChannel`、`ShortcutCommandEntry`、`ShortcutCommandId`、`ShortcutScope`

## `skill-sync.ts`

运行时值（1）：`SKILL_SYNC_SIZE_LIMIT_ERROR_CODE`

纯类型（10）：`SkillSyncArchiveExportResult`、`SkillSyncCandidate`、`SkillSyncCandidateListResult`、`SkillSyncImportResult`、`SkillSyncImportResultItem`、`SkillSyncImportStatus`、`SkillSyncRemoteStatus`、`SkillSyncRemoteStatusResult`、`SkillSyncSizeLimitErrorData`、`SkillSyncSizeLimitPhase`

## `skills-types.ts`

运行时值：无（纯类型模块）

纯类型（9）：`SkillDiagnostic`、`SkillDiagnosticCode`、`SkillDiagnosticSeverity`、`SkillMetadata`、`SkillScope`、`SkillSummary`、`SkillsCapability`、`SkillsListResult`、`SkillsPromptContext`

## `storage.ts`

运行时值（3）：`STORAGE_CATEGORY_IDS`、`STORAGE_MORE_ENTRIES_PATH`、`groupStorageRootsByVolume`

纯类型（16）：`StorageCategoryId`、`StorageCategoryUsage`、`StorageCleanRequest`、`StorageCleanResult`、`StorageCleanability`、`StorageEntryUsage`、`StorageManagementApi`、`StorageManagementBridge`、`StoragePathError`、`StorageRootId`、`StorageRootSpec`、`StorageRootUsage`、`StorageScanStatus`、`StorageUsageSnapshot`、`StorageVolume`、`StorageVolumeGroup`

## `subagents-types.ts`

运行时值（3）：`createAgentStateId`、`createPluginAgentStateId`、`parsePluginSubagentModelSelectionOverrides`

纯类型（18）：`AgentColor`、`AgentCreateParams`、`AgentDeleteParams`、`AgentDiagnostic`、`AgentPermissionMode`、`AgentScope`、`AgentSource`、`AgentSummary`、`AgentUpdateParams`、`AgentsCapability`、`AgentsListResult`、`BuiltInSubagentModelOverrideParams`、`BuiltInSubagentModelSelectionOverrides`、`BuiltInSubagentName`、`PluginSubagentModelOverrideParams`、`PluginSubagentModelSelectionOverrides`、`SubAgentConfig`、`SubagentsListMode`

## `task-realtime.ts`

运行时值：无（纯类型模块）

纯类型（18）：`TaskOwnerCommandDelivery`、`TaskOwnerCommandErrorCode`、`TaskOwnerCommandRequest`、`TaskOwnerCommandResult`、`TaskRealtimeDeliveredEvent`、`TaskRealtimeDeliveryPurpose`、`TaskRealtimeEnvelope`、`TaskRealtimeEvent`、`TaskRealtimeHostDeliveryKind`、`TaskRealtimeInvalidationBaseEvent`、`TaskRunLeaseAcquireRequest`、`TaskRunLeaseResult`、`TaskRunLeaseTarget`、`TaskSnapshotInvalidatedEvent`、`TaskStreamMirrorBatchEvent`、`TaskStreamMirrorPublishOp`、`TaskStreamMirrorTarget`、`WorkspaceTaskListInvalidatedEvent`

## `telemetry.ts`

运行时值（4）：`collectTelemetryRendererContext`、`resolveSafeTelemetryHostname`、`sanitizeTelemetryErrorMessage`、`sanitizeTelemetryEventDetail`

纯类型（7）：`ArmsCustomEventPayload`、`ConfigureFinalArmsCustomEventE2ERequest`、`FinalArmsCustomEventE2EEntry`、`FinalArmsCustomEventPayload`、`RendererTelemetryEventPayload`、`TelemetryEventPayload`、`TelemetryRendererContext`

## `telemetryRedaction.ts`

运行时值（7）：`TELEMETRY_SAFE_BUILTIN_MODEL_IDS`、`TELEMETRY_TEXT_MAX_LENGTH`、`redactTelemetryText`、`redactTelemetryUrl`、`resolveTelemetryModelId`、`resolveTelemetryProviderScope`、`sanitizeTelemetryModelValue`

纯类型（3）：`RedactTelemetryTextOptions`、`TelemetryProviderIdentity`、`TelemetryProviderScope`

## `test-ids-workflow.ts`

运行时值（37）：`TID_AUTOMATIONS_PAGE_TAB`、`TID_CHAT_WORKFLOW_ARTIFACT_CHIP`、`TID_CHAT_WORKFLOW_RUN_DIGEST`、`TID_WORKFLOWS_CREATE_VIA_CHAT`、`TID_WORKFLOWS_EMPTY`、`TID_WORKFLOWS_LIST`、`TID_WORKFLOWS_REFRESH`、`TID_WORKFLOW_ACTION_DELETE`、`TID_WORKFLOW_ACTION_MOVE`、`TID_WORKFLOW_ARTIFACTS_SECTION`、`TID_WORKFLOW_ARTIFACTS_TOGGLE`、`TID_WORKFLOW_ARTIFACT_CARD`、`TID_WORKFLOW_ARTIFACT_CHIP`、`TID_WORKFLOW_ARTIFACT_PANE`、`TID_WORKFLOW_CARD`、`TID_WORKFLOW_CARD_MENU`、`TID_WORKFLOW_CARD_RUN`、`TID_WORKFLOW_DETAIL`、`TID_WORKFLOW_DETAIL_DESCRIPTION`、`TID_WORKFLOW_DETAIL_MENU`、`TID_WORKFLOW_DETAIL_RUN`、`TID_WORKFLOW_DETAIL_SCRIPT`、`TID_WORKFLOW_DETAIL_TAB`、`TID_WORKFLOW_DETAIL_WHEN_TO_USE`、`TID_WORKFLOW_GLOBAL_GROUP`、`TID_WORKFLOW_LAUNCH_ARG`、`TID_WORKFLOW_LAUNCH_DIALOG`、`TID_WORKFLOW_LAUNCH_ERROR`、`TID_WORKFLOW_LAUNCH_SUBMIT`、`TID_WORKFLOW_LAUNCH_TARGET`、`TID_WORKFLOW_META_DISCARD`、`TID_WORKFLOW_META_SAVE`、`TID_WORKFLOW_MOVE_DIALOG`、`TID_WORKFLOW_MOVE_DIALOG_SUBMIT`、`TID_WORKFLOW_MOVE_DIALOG_TARGET`、`TID_WORKFLOW_PROJECT_GROUP`、`TID_WORKFLOW_RUN_ROW`

## `test-ids.ts`

运行时值（362）：`TID_APP_HEADER`、`TID_AUTOMATIONS_LIST`、`TID_AUTOMATIONS_OPEN`、`TID_AUTOMATIONS_STATUS_FILTER`、`TID_AUTOMATION_ACTION_DELETE`、`TID_AUTOMATION_ACTION_TOGGLE`、`TID_AUTOMATION_CARD`、`TID_AUTOMATION_CARD_MENU`、`TID_AUTOMATION_CREATE_MANUALLY`、`TID_AUTOMATION_CREATE_MENU`、`TID_AUTOMATION_CUSTOM_CONFIRM`、`TID_AUTOMATION_CUSTOM_INTERVAL_DECREMENT`、`TID_AUTOMATION_CUSTOM_INTERVAL_INCREMENT`、`TID_AUTOMATION_CUSTOM_INTERVAL_OPTION`、`TID_AUTOMATION_CUSTOM_INTERVAL_SELECT`、`TID_AUTOMATION_CUSTOM_REPEAT_EDIT`、`TID_AUTOMATION_CUSTOM_UNIT_OPTION`、`TID_AUTOMATION_CUSTOM_UNIT_SELECT`、`TID_AUTOMATION_EDIT_BACK`、`TID_AUTOMATION_FORM_PROMPT`、`TID_AUTOMATION_FORM_SUBMIT`、`TID_AUTOMATION_FORM_TITLE`、`TID_AUTOMATION_FREQUENCY_OPTION`、`TID_AUTOMATION_FREQUENCY_SELECT`、`TID_AUTOMATION_RUN_NOW`、`TID_AUTOMATION_SCHEDULE_ADD`、`TID_AUTOMATION_SCHEDULE_DELETE`、`TID_AUTOMATION_SCHEDULE_PREVIEW`、`TID_AUTOMATION_YEAR_DAY_OPTION`、`TID_AUTOMATION_YEAR_MONTHDAY`、`TID_AUTOMATION_YEAR_MONTH_OPTION`、`TID_BROWSER_ADDRESS_INPUT`、`TID_BROWSER_BACK_BUTTON`、`TID_BROWSER_CLOSE_BUTTON`、`TID_BROWSER_DEVTOOLS_BUTTON`、`TID_BROWSER_ELEMENT_PICKER_BUTTON`、`TID_BROWSER_FORWARD_BUTTON`、`TID_BROWSER_LOAD_ERROR`、`TID_BROWSER_LOAD_ERROR_CERT_HINT`、`TID_BROWSER_MORE_BUTTON`、`TID_BROWSER_OPEN_EXTERNAL_ITEM`、`TID_BROWSER_PANE`、`TID_BROWSER_REFRESH_BUTTON`、`TID_BROWSER_RESPONSIVE_BUTTON`、`TID_BROWSER_RESPONSIVE_HEIGHT_INPUT`、`TID_BROWSER_RESPONSIVE_RESIZE_CORNER`、`TID_BROWSER_RESPONSIVE_RESIZE_CORNER_BOTTOM_LEFT`、`TID_BROWSER_RESPONSIVE_RESIZE_CORNER_TOP_LEFT`、`TID_BROWSER_RESPONSIVE_RESIZE_CORNER_TOP_RIGHT`、`TID_BROWSER_RESPONSIVE_RESIZE_HEIGHT`、`TID_BROWSER_RESPONSIVE_RESIZE_LEFT`、`TID_BROWSER_RESPONSIVE_RESIZE_TOP`、`TID_BROWSER_RESPONSIVE_RESIZE_WIDTH`、`TID_BROWSER_RESPONSIVE_SCALED_FRAME`、`TID_BROWSER_RESPONSIVE_TOOLBAR`、`TID_BROWSER_RESPONSIVE_VIEWPORT`、`TID_BROWSER_RESPONSIVE_WIDTH_INPUT`、`TID_BROWSER_RESPONSIVE_ZOOM_OPTION`、`TID_BROWSER_RESPONSIVE_ZOOM_SELECT`、`TID_BROWSER_TOGGLE`、`TID_BROWSER_WEBVIEW`、`TID_CHAT_ASSISTANT_HISTORY_CONTENT`、`TID_CHAT_ASSISTANT_HISTORY_TRIGGER`、`TID_CHAT_ASSISTANT_MESSAGE`、`TID_CHAT_ATTACHMENT_BUTTON`、`TID_CHAT_ATTACHMENT_MENU_ITEM`、`TID_CHAT_BACKGROUND_RESULT_TITLE`、`TID_CHAT_CHANGE_SUMMARY_TOGGLE_FILES_BUTTON`、`TID_CHAT_COMPACT_MARKER`、`TID_CHAT_COMPACT_RETRY_BUTTON`、`TID_CHAT_CONTEXT_USAGE_TRIGGER`、`TID_CHAT_EMPTY`、`TID_CHAT_ERROR_BANNER`、`TID_CHAT_ERROR_DETAILS_BUTTON`、`TID_CHAT_ERROR_HOOK_ICON`、`TID_CHAT_GOAL_VERIFICATION_MARKER`、`TID_CHAT_INPUT`、`TID_CHAT_LOADING`、`TID_CHAT_MESSAGES`、`TID_CHAT_MESSAGE_EDIT_BUTTON`、`TID_CHAT_MESSAGE_EDIT_CANCEL`、`TID_CHAT_MESSAGE_EDIT_INPUT`、`TID_CHAT_MESSAGE_EDIT_SUBMIT`、`TID_CHAT_MESSAGE_FORK_BUTTON`、`TID_CHAT_MODEL_SELECT_GROUP`、`TID_CHAT_MODEL_SELECT_ITEM`、`TID_CHAT_MODEL_SELECT_TRIGGER`、`TID_CHAT_MODE_SELECT_ITEM`、`TID_CHAT_MODE_SELECT_TRIGGER`、`TID_CHAT_QUEUE_DRAG_HANDLE`、`TID_CHAT_QUEUE_EDIT_BUTTON`、`TID_CHAT_QUEUE_EDIT_CANCEL_BUTTON`、`TID_CHAT_QUEUE_EDIT_INPUT`、`TID_CHAT_QUEUE_EDIT_SAVE_BUTTON`、`TID_CHAT_QUEUE_ITEM`、`TID_CHAT_QUEUE_ITEM_CONTENT`、`TID_CHAT_QUEUE_PANEL`、`TID_CHAT_QUEUE_REMOVE_BUTTON`、`TID_CHAT_QUEUE_SEND_NOW_BUTTON`、`TID_CHAT_REASONING_CONTENT`、`TID_CHAT_REASONING_TRIGGER`、`TID_CHAT_SEND_BUTTON`、`TID_CHAT_STOP_BUTTON`、`TID_CHAT_SUMMARY_PANEL`、`TID_CHAT_THOUGHT_LEVEL_SELECT_ITEM`、`TID_CHAT_THOUGHT_LEVEL_SELECT_TRIGGER`、`TID_CHAT_TOOL_CALL_BLOCK`、`TID_CHAT_USER_MESSAGE`、`TID_CHAT_VIEW`、`TID_COMPOSER_PROJECT_DETACH`、`TID_COMPOSER_REMOTE_CONNECTION`、`TID_COMPOSER_WORKSPACE_TRIGGER`、`TID_COMPOSER_WORK_OUTSIDE_PROJECT`、`TID_CONFIRM_DIALOG_CONFIRM`、`TID_CONVERSATION_NEW_TASK`、`TID_CONVERSATION_SECTION`、`TID_CRON_CREATE_CARD`、`TID_CRON_CREATE_OPEN`、`TID_DOCKER_CONTAINER_INPUT`、`TID_DOCKER_CONTAINER_SELECT`、`TID_FEEDBACK_LOGS_OPT_IN`、`TID_GIT_ACTION_TRIGGER`、`TID_GIT_CLOSE_BUTTON`、`TID_GIT_COMMIT_ACTION_COMMAND`、`TID_GIT_COMMIT_ACTION_ITEM`、`TID_GIT_COMMIT_DIALOG`、`TID_GIT_COMMIT_GENERATE_BUTTON`、`TID_GIT_COMMIT_INCLUDE_UNSTAGED`、`TID_GIT_COMMIT_MESSAGE_INPUT`、`TID_GIT_PANE`、`TID_GIT_TOGGLE`、`TID_LOCALE_TOGGLE`、`TID_LOGIN_API_KEY_CANCEL_BUTTON`、`TID_LOGIN_API_KEY_CONTINUE_BUTTON`、`TID_LOGIN_API_KEY_ERROR`、`TID_LOGIN_API_KEY_INPUT`、`TID_LOGIN_API_KEY_PROVIDER_ITEM`、`TID_LOGIN_API_KEY_PROVIDER_TRIGGER`、`TID_LOGIN_API_KEY_SKIP_BUTTON`、`TID_LOGIN_MENU_ITEM`、`TID_LOGIN_TRIGGER`、`TID_LOGIN_USE_API_KEY_BUTTON`、`TID_LOGOUT_BUTTON`、`TID_MCP_OPEN_AUTHORIZATION_BUTTON`、`TID_MCP_SERVER_ROW`、`TID_MODEL_PROVIDER_ADD_MODEL_BUTTON`、`TID_MODEL_PROVIDER_ADD_PROVIDER_BUTTON`、`TID_MODEL_PROVIDER_API_FORMAT_ITEM`、`TID_MODEL_PROVIDER_API_FORMAT_TRIGGER`、`TID_MODEL_PROVIDER_API_KEY_INPUT`、`TID_MODEL_PROVIDER_BASE_URL_INPUT`、`TID_MODEL_PROVIDER_CONNECTION_MODE_ITEM`、`TID_MODEL_PROVIDER_CONNECTION_MODE_TRIGGER`、`TID_MODEL_PROVIDER_MODEL_DELETE_BUTTON`、`TID_MODEL_PROVIDER_MODEL_INPUT`、`TID_MODEL_PROVIDER_NAME_EDIT_BUTTON`、`TID_MODEL_PROVIDER_NAME_INPUT`、`TID_MODEL_PROVIDER_NAV_ITEM`、`TID_MODEL_PROVIDER_START_PLAN_COUNT_SHORTCUT`、`TID_MODEL_PROVIDER_START_PLAN_SWITCH_PREFIX`、`TID_MODEL_PROVIDER_TEMPLATE_BACK_BUTTON`、`TID_MODEL_PROVIDER_TEMPLATE_ITEM`、`TID_MODEL_PROVIDER_TEMPLATE_PICKER`、`TID_OAUTH_CANCEL`、`TID_OAUTH_ERROR`、`TID_OAUTH_LOGIN_BUTTON`、`TID_OFFPEAK_ACTION_CONTINUE`、`TID_OFFPEAK_ACTION_DELETE`、`TID_OFFPEAK_ACTION_PAUSE`、`TID_OFFPEAK_CARD`、`TID_OFFPEAK_CARD_MENU`、`TID_OFFPEAK_CARD_SESSION`、`TID_OFFPEAK_CREATE_BUTTON`、`TID_OFFPEAK_CREATE_CARD`、`TID_OFFPEAK_CREATE_OPEN`、`TID_OFFPEAK_EDIT_SUBMIT`、`TID_OFFPEAK_EDIT_VIEW`、`TID_OFFPEAK_FORM_INSTRUCTIONS`、`TID_OFFPEAK_FORM_TITLE`、`TID_OFFPEAK_TAB`、`TID_PLUGIN_MCP_SERVER_ROW`、`TID_PLUGIN_STORE_BROWSE`、`TID_PREVIEW_CLOSE_BUTTON`、`TID_PREVIEW_NEXT_BUTTON`、`TID_PREVIEW_PANE`、`TID_PREVIEW_PREV_BUTTON`、`TID_PROJECT_ADD`、`TID_PROJECT_SECTION`、`TID_PROMPT_SUGGESTION_OPTION`、`TID_PROMPT_SUGGESTION_PANEL`、`TID_PROMPT_SUGGESTION_SECTION`、`TID_PROMPT_SUGGESTION_STATUS`、`TID_REMOTE_KIND_DOCKER`、`TID_REMOTE_KIND_SSH`、`TID_REMOTE_KIND_WSL`、`TID_RESOURCE_MANAGER_STORAGE_CATEGORY_CLEAN`、`TID_RESOURCE_MANAGER_STORAGE_CATEGORY_ROW`、`TID_RESOURCE_MANAGER_STORAGE_CATEGORY_SIZE`、`TID_RESOURCE_MANAGER_STORAGE_CONFIRM_ACCEPT`、`TID_RESOURCE_MANAGER_STORAGE_CONFIRM_CANCEL`、`TID_RESOURCE_MANAGER_STORAGE_CONFIRM_DIALOG`、`TID_RESOURCE_MANAGER_STORAGE_DETAIL`、`TID_RESOURCE_MANAGER_STORAGE_DETAIL_BACK`、`TID_RESOURCE_MANAGER_STORAGE_DETAIL_ENTRY`、`TID_RESOURCE_MANAGER_STORAGE_DISK_CARD`、`TID_RESOURCE_MANAGER_STORAGE_RESCAN`、`TID_RESOURCE_MANAGER_STORAGE_ROOT`、`TID_RESOURCE_MANAGER_STORAGE_SECTION`、`TID_RESOURCE_MANAGER_STORAGE_STATUS`、`TID_RESOURCE_MANAGER_STORAGE_TOTAL`、`TID_RESOURCE_MANAGER_TAB`、`TID_SETTINGS_ASK_USER_QUESTION_AUTO_RESOLUTION_SWITCH`、`TID_SETTINGS_BACK_BUTTON`、`TID_SETTINGS_DATA_BASE_DIR_BROWSE`、`TID_SETTINGS_DATA_BASE_DIR_INPUT`、`TID_SETTINGS_DATA_BASE_DIR_SAVE`、`TID_SETTINGS_DATA_BASE_DIR_STATUS`、`TID_SETTINGS_LOCALE_SELECT_ITEM`、`TID_SETTINGS_LOCALE_SELECT_TRIGGER`、`TID_SETTINGS_MEMORY_BACK_MEMORIES`、`TID_SETTINGS_MEMORY_BACK_PROJECTS`、`TID_SETTINGS_MEMORY_COUNT`、`TID_SETTINGS_MEMORY_FILE`、`TID_SETTINGS_MEMORY_FILE_EDITOR_ACTIONS`、`TID_SETTINGS_MEMORY_FILE_ICON`、`TID_SETTINGS_MEMORY_FILE_NAME`、`TID_SETTINGS_MEMORY_FILE_UPDATED_AT`、`TID_SETTINGS_MEMORY_PREVIEW`、`TID_SETTINGS_MEMORY_REFRESH`、`TID_SETTINGS_MEMORY_SCOPE_ICON`、`TID_SETTINGS_MEMORY_SCOPE_TRIGGER`、`TID_SETTINGS_MEMORY_SEARCH_CLEAR`、`TID_SETTINGS_MEMORY_SEARCH_INPUT`、`TID_SETTINGS_MEMORY_SWITCH`、`TID_SETTINGS_MEMORY_WORKSPACE`、`TID_SETTINGS_NATIVE_SEARCH_SWITCH`、`TID_SETTINGS_PAGE`、`TID_SETTINGS_SECTION_NAV`、`TID_SETTINGS_USAGE_TAB`、`TID_SIDEBAR`、`TID_SIDEBAR_CODING_PLAN_USAGE_BUTTON`、`TID_SIDEBAR_USAGE_REMAINING_TRIGGER`、`TID_SIDE_PANE_TOGGLE`、`TID_SSH_AUTH_PASSWORD`、`TID_SSH_AUTH_PRIVATE_KEY`、`TID_SSH_CANCEL_BUTTON`、`TID_SSH_CONFIG_ALIAS_SELECT`、`TID_SSH_CONNECT_BUTTON`、`TID_SSH_CONNECT_TRIGGER`、`TID_SSH_DIALOG`、`TID_SSH_ERROR`、`TID_SSH_HOST_INPUT`、`TID_SSH_PASSWORD_INPUT`、`TID_SSH_PORT_INPUT`、`TID_SSH_PRIVATE_KEY_INPUT`、`TID_SSH_SUCCESS`、`TID_SSH_USERNAME_INPUT`、`TID_START_PLAN_RECOMMENDATION_DIALOG`、`TID_SUBAGENT_BUILT_IN_MODEL_TRIGGER`、`TID_SUBAGENT_ROW`、`TID_TASK_ARCHIVE`、`TID_TASK_EMPTY`、`TID_TASK_ITEM`、`TID_TASK_LIST`、`TID_TASK_NEW_BUTTON`、`TID_TASK_SETTINGS_BUTTON`、`TID_TERMINAL`、`TID_TERMINAL_CLOSE_BUTTON`、`TID_TERMINAL_TOGGLE`、`TID_THEME_TOGGLE`、`TID_TOOL_CODE_VIEWER_BUTTON`、`TID_TOOL_SUMMARY_TRIGGER`、`TID_V4_ATTACHMENT`、`TID_V4_ATTACHMENT_UPLOAD_PROGRESS`、`TID_V4_ATTACHMENT_UPLOAD_RETRY`、`TID_V4_AUTODRAIN_TOGGLE`、`TID_V4_BACKGROUND_WORKS`、`TID_V4_BACKGROUND_WORK_CANCEL`、`TID_V4_BACKGROUND_WORK_ITEM`、`TID_V4_COMPOSER`、`TID_V4_COMPOSER_BACKGROUND_WORK_TRIGGER`、`TID_V4_COMPOSER_CLEAR_QUEUE_SEND`、`TID_V4_COMPOSER_CUA_ENTRY`、`TID_V4_COMPOSER_INPUT`、`TID_V4_COMPOSER_KEEP_QUEUE_SEND`、`TID_V4_COMPOSER_SEND`、`TID_V4_DELETE_SESSION`、`TID_V4_EDIT`、`TID_V4_EDIT_ATTACHMENT_REMOVE`、`TID_V4_EDIT_CANCEL`、`TID_V4_EDIT_INPUT`、`TID_V4_EDIT_REWIND_WORKSPACE`、`TID_V4_EDIT_SUBMIT`、`TID_V4_EDIT_WORKSPACE_CONFLICT_CONVERSATION_ONLY`、`TID_V4_EDIT_WORKSPACE_CONFLICT_DIALOG`、`TID_V4_FEEDBACK_DISLIKE`、`TID_V4_FEEDBACK_LIKE`、`TID_V4_FOLLOWUP_TOGGLE`、`TID_V4_FORK`、`TID_V4_GOAL_BANNER`、`TID_V4_HOOK_DETAILS_CONTENT`、`TID_V4_HOOK_DETAILS_TRIGGER`、`TID_V4_MODEL_CONFIG`、`TID_V4_PANE_SHELL`、`TID_V4_PANE_WORKSPACE_BADGE`、`TID_V4_PAUSED_QUEUE_SEND_DIALOG`、`TID_V4_QUEUE`、`TID_V4_QUEUE_ITEM`、`TID_V4_QUEUE_ITEM_DELETE`、`TID_V4_QUEUE_ITEM_EDIT`、`TID_V4_QUEUE_ITEM_SEND_NOW`、`TID_V4_QUEUE_ITEM_UP`、`TID_V4_QUEUE_PAUSED_BANNER`、`TID_V4_QUEUE_RESUME`、`TID_V4_RENAME_INPUT`、`TID_V4_RENAME_SUBMIT`、`TID_V4_RETRY`、`TID_V4_RETRY_SUBSCRIBE`、`TID_V4_ROW`、`TID_V4_ROW_ATTACHMENTS`、`TID_V4_SESSION_PANE`、`TID_V4_SESSION_TITLE`、`TID_V4_SPLIT_CLOSE`、`TID_V4_SPLIT_DIVIDER`、`TID_V4_SPLIT_DOWN`、`TID_V4_SPLIT_OPEN`、`TID_V4_STOP`、`TID_V4_SUBAGENT_DRILLDOWN`、`TID_V4_SUBAGENT_OPEN_SIDE_PANE`、`TID_V4_SUBAGENT_OPEN_SPLIT`、`TID_V4_SUBAGENT_TOGGLE`、`TID_V4_TASK_OPEN_IN_SPLIT`、`TID_V4_TIMELINE`、`TID_V4_TIMELINE_BOTTOM`、`TID_V4_TIMELINE_EMPTY`、`TID_V4_TIMELINE_LOAD_OLDER`、`TID_V4_TURN_NAVIGATOR`、`TID_V4_TURN_NAVIGATOR_ITEM`、`TID_V4_TURN_NAVIGATOR_TOOLTIP`、`TID_V4_USER_INPUT_DIALOG`、`TID_V4_USER_INPUT_OPTION`、`TID_V4_USER_INPUT_TEXT`、`TID_V4_WORKSPACE_HOOK_PENDING_BANNER`、`TID_V4_WORKSPACE_HOOK_PENDING_DISMISS`、`TID_V4_WORKSPACE_HOOK_PENDING_REVIEW`、`TID_WORKSPACE_CLOSE`、`TID_WORKSPACE_FILE_TREE_BUTTON`、`TID_WORKSPACE_FILE_TREE_PANEL`、`TID_WORKSPACE_FILE_TREE_REFRESH_BUTTON`、`TID_WORKSPACE_FILE_TREE_ROW`、`TID_WORKSPACE_HEADER`、`TID_WORKSPACE_HELP_MENU_RESOURCE_MANAGER`、`TID_WORKSPACE_HELP_MENU_TRIGGER`、`TID_WORKSPACE_ITEM`、`TID_WORKSPACE_LIST`、`TID_WORKSPACE_MORE_BUTTON`、`TID_WORKSPACE_OPEN_BUTTON`、`TID_WORKSPACE_PATH`、`TID_WORKSPACE_TITLE`、`TID_WSL_DISTRO_SELECT`、`TID_WSL_USER_INPUT`、`testId`

## `usage-quota.ts`

运行时值（1）：`MCP_USAGE_QUOTA_LIMIT_TYPE`

纯类型（5）：`UsageMcpQuotaScope`、`UsageMcpQuotaSnapshot`、`UsageQuotaLimit`、`UsageQuotaSnapshot`、`UsageQuotaUsageDetail`

## `usage-stats.ts`

运行时值（13）：`APP_USAGE_RANGES`、`ESTIMATED_TOKEN_CHAR_DIVISOR`、`MCP_USAGE_QUOTA_LIMIT_TYPE`、`appUsageDailyModelItemSchema`、`appUsageDailyModelUsageSchema`、`appUsageFavoriteModelSchema`、`appUsageHeatmapCellSchema`、`appUsageHeatmapSchema`、`appUsageHeatmapWeekSchema`、`appUsageModelUsageSchema`、`appUsageSnapshotSchema`、`appUsageSummarySchema`、`appUsageToolUsageSchema`

纯类型（51）：`AppUsageDailyModelItem`、`AppUsageDailyModelUsage`、`AppUsageFavoriteModel`、`AppUsageHeatmap`、`AppUsageHeatmapCell`、`AppUsageHeatmapWeek`、`AppUsageModelUsage`、`AppUsageRange`、`AppUsageRequest`、`AppUsageSnapshot`、`AppUsageSummary`、`AppUsageToolUsage`、`CodingPlanActivitySnapshot`、`CodingPlanActivitySummary`、`CodingPlanHealthSnapshot`、`CodingPlanModelData`、`CodingPlanModelSummary`、`CodingPlanModelUsageSnapshot`、`CodingPlanToolData`、`CodingPlanToolSummary`、`CodingPlanToolUsageSnapshot`、`CodingPlanUsageDetailMetric`、`CodingPlanUsageDetailSnapshot`、`CodingPlanUsageDetailSubject`、`CodingPlanUsageDetailSummary`、`CodingPlanUsageGranularity`、`CodingPlanUsageRange`、`CodingPlanUsageRequest`、`CodingPlanUsageSnapshot`、`PlanIdentitySnapshot`、`PlanIdentityStatus`、`UsageEntitlementContext`、`UsageEntitlementProviderInfo`、`UsageEntitlementRemaining`、`UsageEntitlementRequest`、`UsageEntitlementSnapshot`、`UsageEntitlementSubscription`、`UsageEntitlementSubscriptionDetail`、`UsageStatsDaySummary`、`UsageStatsFavoriteModel`、`UsageStatsHeatmap`、`UsageStatsHeatmapCell`、`UsageStatsHeatmapMonthLabel`、`UsageStatsHeatmapWeek`、`UsageStatsModelUsage`、`UsageStatsPeakHour`、`UsageStatsRange`、`UsageStatsRequest`、`UsageStatsSnapshot`、`UsageStatsSummary`、`UsageStatsToolUsage`

`export *` ← `./usage-quota.js`

## `uuid.ts`

运行时值（2）：`createUuid`、`uuidv7`

## `validation.ts`

运行时值（126）：`WSL_USER_MAX_LENGTH`、`agentLaneResourceSampleSchema`、`appSettingsOccupationEnum`、`appSettingsPatchSchema`、`appSettingsSchema`、`armsCustomEventPayloadSchema`、`broadcastMessageSchema`、`credentialKeySchema`、`credentialRecordSchema`、`credentialValueSchema`、`dockerConnectOptionsSchema`、`formatZodError`、`helloAckMessageSchema`、`helloMessageSchema`、`hostAgentProcessErrorResponseSchema`、`hostAgentProcessExceptionResponseSchema`、`hostAgentProcessExitedResponseSchema`、`hostAgentProcessReadyResponseSchema`、`hostAgentProcessSpawnedResponseSchema`、`hostAgentResourceSampleResponseSchema`、`hostAgentRunningTaskCountChangedResponseSchema`、`hostAttachServicePortMessageSchema`、`hostBindRemoteWorkspaceContextMessageSchema`、`hostBroadcastClaimCommitResponseSchema`、`hostBroadcastClaimReleaseResponseSchema`、`hostBroadcastClaimRequestResponseSchema`、`hostBroadcastClaimResultMessageSchema`、`hostBroadcastEnvelopeSchema`、`hostBrowserExecuteRequestResponseSchema`、`hostBrowserExecuteResultMessageSchema`、`hostCancelRemoteWorkspaceConnectMessageSchema`、`hostConnectRemoteWorkspaceMessageSchema`、`hostCronRunMessageSchema`、`hostCronRunResultResponseSchema`、`hostCronSchedulerWakeRequestResponseSchema`、`hostCuaOperationStateResponseSchema`、`hostCuaPipFocusChangedMessageSchema`、`hostDetachServicePortMessageSchema`、`hostDisposeMessageSchema`、`hostDisposeRemoteWorkspaceSessionMessageSchema`、`hostFeedbackLogArchiveRequestResponseSchema`、`hostFeedbackLogArchiveResultMessageSchema`、`hostIncomingMessageSchema`、`hostInitLocalMessageSchema`、`hostLocalMediaPreviewPathAuthorizeRequestResponseSchema`、`hostLocalMediaPreviewPathAuthorizeResultMessageSchema`、`hostLogResponseSchema`、`hostMcpResourceSamplesResponseSchema`、`hostMcpTelemetryResponseSchema`、`hostNetworkTelemetryBatchResponseSchema`、`hostOffPeakRunMessageSchema`、`hostOffPeakRunResultResponseSchema`、`hostOffPeakSchedulerWakeRequestResponseSchema`、`hostRemoteWorkspaceClosedResponseSchema`、`hostRemoteWorkspaceConnectFailedResponseSchema`、`hostRemoteWorkspaceConnectedResponseSchema`、`hostRemoteWorkspaceConnectionLogResponseSchema`、`hostResourceSampleResponseSchema`、`hostResourceUsageProcessSchema`、`hostResourceUsageSnapshotRequestMessageSchema`、`hostResourceUsageSnapshotResultResponseSchema`、`hostResponseMessageSchema`、`hostSessionCreateTelemetryResponseSchema`、`hostSessionMessageDeliverMessageSchema`、`hostSessionMessageDeliverResultResponseSchema`、`hostSessionMessageDeliveryResultMessageSchema`、`hostSessionMessageSendRequestedResponseSchema`、`hostSessionRouteAnnounceResponseSchema`、`hostTaskOwnerCommandDeliverMessageSchema`、`hostTaskOwnerCommandRequestResponseSchema`、`hostTaskOwnerCommandResultMessageSchema`、`hostTaskOwnerCommandResultResponseSchema`、`hostTaskRealtimeDeliverMessageSchema`、`hostTaskRealtimePublishResponseSchema`、`hostTaskRunLeaseAcquireResponseSchema`、`hostTaskRunLeaseReleaseResponseSchema`、`hostTaskRunLeaseResultMessageSchema`、`hostTaskStreamOpPublishResponseSchema`、`hostToolExecResourceResponseSchema`、`hostWorkspaceRunningTaskCountChangedResponseSchema`、`isValidWslUser`、`knorviaPersistedMessageSchema`、`knorviaPersistedToolCallSchema`、`knorviaPinnedTasksFileSchema`、`knorviaPromptAttachmentSchema`、`knorviaPromptFileAttachmentSchema`、`knorviaPromptImageAttachmentSchema`、`knorviaPromptPdfAttachmentSchema`、`knorviaPromptVideoAttachmentSchema`、`knorviaProviderSchema`、`knorviaTaskGoalChangedPatchSchema`、`knorviaTaskGoalSchema`、`knorviaTaskGoalStatusSchema`、`knorviaTaskIndexEntrySchema`、`knorviaTaskMetaSchema`、`knorviaTaskMigrationSourceSchema`、`knorviaTaskModeSchema`、`knorviaTaskPersistStatusSchema`、`knorviaTaskTargetChangedActionSchema`、`knorviaTaskTargetChangedPatchSchema`、`knorviaTaskTargetChangedSourceSchema`、`knorviaTaskTargetSchema`、`knorviaTaskTargetStatusSchema`、`localeSchema`、`networkObservationSchema`、`nodeSelfResourceSampleSchema`、`nonEmptyStringSchema`、`postUpdateReleaseNotesPayloadSchema`、`processResourceCliLaneSchema`、`remoteAssetDirsSchema`、`remoteTargetSchema`、`rendererHeapSampleSchema`、`rendererLogPayloadSchema`、`rendererTelemetryEventPayloadSchema`、`sessionFileSchema`、`sessionMessageDeliveryResultSchema`、`sessionMessageRequestSchema`、`sessionRouteSchema`、`sshConnectOptionsSchema`、`stringArraySchema`、`taskNotificationPayloadSchema`、`telemetryRendererContextSchema`、`windowHostAttachmentScopeSchema`、`windowHostRemoteWorkspaceDescriptorSchema`、`wslConnectOptionsSchema`、`wslUserSchema`

纯类型（19）：`AgentLaneResourceSample`、`HostAgentProcessErrorResponse`、`HostAgentProcessExceptionResponse`、`HostAgentProcessExitedResponse`、`HostAgentProcessReadyResponse`、`HostAgentProcessSpawnedResponse`、`HostAgentResourceSampleResponse`、`HostCuaOperationStateResponse`、`HostMcpResourceSamplesResponse`、`HostMcpTelemetryResponse`、`HostResourceSampleResponse`、`HostResourceUsageSnapshotRequestMessage`、`HostResourceUsageSnapshotResultResponse`、`HostSessionCreateTelemetryResponse`、`HostToolExecResourceResponse`、`NodeSelfResourceSample`、`RendererHeapSample`、`WindowHostAttachmentScope`、`WindowHostRemoteWorkspaceDescriptor`

具名再导出（9）：`WSL_USER_MAX_LENGTH`、`appSettingsOccupationEnum`、`appSettingsPatchSchema`、`appSettingsSchema`、`isValidWslUser`、`knorviaTaskModeSchema`、`localeSchema`、`postUpdateReleaseNotesPayloadSchema`、`wslUserSchema`

## `validationAppSettings.ts`

运行时值（6）：`appSettingsOccupationEnum`、`appSettingsPatchSchema`、`appSettingsSchema`、`integratedTerminalShellSelectionSchema`、`localeSchema`、`postUpdateReleaseNotesPayloadSchema`

## `version.ts`

运行时值（3）：`KNORVIA_BUILD_TIME`、`KNORVIA_COMMIT`、`KNORVIA_VERSION`

## `workspacePurpose.ts`

运行时值：无（纯类型模块）

纯类型（1）：`WorkspacePurpose`

---

合计：58 个文件，运行时值 719 个，纯类型 456 个。
