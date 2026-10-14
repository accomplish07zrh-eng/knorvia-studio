# core-02 接口（兼容面）

范围：`apps/cli/packages/core/src` 下 `memory`（10 继承，含 recall 3）、`model`（1）、`permission`（3）、`plugin-reference`（4）、`runtime-task`（5）、`session-context`（4），共 27 个继承文件。
本文件只列兼容所需的模块路径、导出名与类型；行为规格见 `behavior.md`，调用方见 `callers.md`。
纯声明文件按本文件列出的名字剔除兼容行后再算相似度门槛（工具从本文件的反引号片段与代码块提取名字，排除语言关键字）。

## 包入口与子路径（本包范围）

`@knorvia/core` 的公开入口在本包范围之外（包根 `src/index.ts` 属 core-03）；本合同的兼容面是上列 27 个模块路径与其导出名。core-02 的契约测试只经**区域桶**与模块入口加载（`memory/index.ts`、`permission/index.ts`、`plugin-reference/index.ts`、`runtime-task/index.ts`、`session-context/*`），不使用包根入口——包根在 tsx 源码入口下不可加载（`src/index.ts:21` 把类型 `ToolExecutor` 当值再导出）。

### `memory/directory.ts`

- `ensureMemoryDirectoryExists` (FunctionDeclaration) — `(fileSystemPort: FileSystemPort, rootDir: string, traceContext?: TraceContext, logger?: Logger) => Promise<void>`

### `memory/extraction.ts`

- `buildMemoryExtractionPrompt` (FunctionDeclaration) — `(input: { manifest: readonly MemoryManifestEntry[]; messageCount: number; }) => string`
- `createMemoryExtractionScheduler` (FunctionDeclaration) — `<TSnapshot extends MemoryExtractionSnapshot = MemoryExtractionSnapshot>(execute: (input: Omit<MemoryExtractionExecutionInput, "snapshot"> & { snapshot: TSnapshot; }) => Promise<MemoryExtractionExecutionStatus>) => Memo`
- `MemoryExtractionScheduler` (InterfaceDeclaration) — `MemoryExtractionScheduler<TSnapshot>`
- `MemoryExtractionSnapshot` (InterfaceDeclaration) — `MemoryExtractionSnapshot`

### `memory/index-content.ts`

- `formatMemoryIndexContent` (FunctionDeclaration) — `(content: string) => string`
- `formatProjectMemoryIndexContent` (FunctionDeclaration) — `(content: string) => string`

### `memory/memory-agent-loop.ts`

- `runMemoryAgentLoop` (FunctionDeclaration) — `(input: LoopInput) => Promise<MemoryAgentLoopResult>`

### `memory/memory-file-path.ts`

- `memoryFileRelativePath` (FunctionDeclaration) — `(rootDir: string, filePath: string) => string | undefined`
- `resolveContainedMemoryFilePath` (FunctionDeclaration) — `(input: { filePath: string; rootDir: string; workingDirectory: string; workspaceRoot: string; }) => string | undefined`
- `resolveSafeMemoryFilePath` (FunctionDeclaration) — `(input: { filePath: string; rootDir: string; workingDirectory: string; workspaceRoot: string; }) => string | undefined`

### `memory/origin-session.ts`

- `stampMemoryOriginSessionId` (FunctionDeclaration) — `(input: { content: string; filePath: string; memoryRoot: string | undefined; sessionId: string; }) => string`

### `memory/project-root.ts`

- `resolveProjectMemoryRoot` (FunctionDeclaration) — `(input: ProjectMemoryRootInput) => string`

### `memory/recall/index.ts`

- `formatMemoryManifest` (FunctionDeclaration) — `(manifest: readonly MemoryManifestEntry[]) => string`
- `MemoryManifestEntry` (InterfaceDeclaration) — `MemoryManifestEntry`
- `MemoryRecallType` (TypeAliasDeclaration) — `"user" | "feedback" | "project" | "reference"`
- `scanMemoryManifest` (FunctionDeclaration) — `(input: { fileSystem: FileSystemPort; rootDir: string; signal?: AbortSignal; }) => Promise<MemoryManifestEntry[]>`

### `memory/recall/manifest.ts`

- `formatMemoryManifest` (FunctionDeclaration) — `(manifest: readonly MemoryManifestEntry[]) => string`
- `scanMemoryManifest` (FunctionDeclaration) — `(input: { fileSystem: FileSystemPort; rootDir: string; signal?: AbortSignal; }) => Promise<MemoryManifestEntry[]>`

### `memory/recall/types.ts`

- `MEMORY_RECALL_TYPES` (VariableDeclaration) — `readonly ["user", "feedback", "project", "reference"]`
- `MemoryManifestEntry` (InterfaceDeclaration) — `MemoryManifestEntry`
- `MemoryRecallType` (TypeAliasDeclaration) — `"user" | "feedback" | "project" | "reference"`

### `model/auxiliary-model-options.ts`

- `auxiliaryModelOptions` (FunctionDeclaration) — `(model: Model) => Required<ModelOptions>`

### `permission/index.ts`

- `createDenyPermissionBroker` (VariableDeclaration) — `() => PermissionBrokerPort`
- `createManualPermissionBroker` (VariableDeclaration) — `(options?: ManualPermissionBrokerOptions) => ManualPermissionBroker`
- `defaultPermissionConfig` (VariableDeclaration) — `PermissionConfig`
- `DenyPermissionBroker` (ClassDeclaration) — `DenyPermissionBroker`
- `ManualPermissionBroker` (ClassDeclaration) — `ManualPermissionBroker`
- `ManualPermissionBrokerOptions` (InterfaceDeclaration) — `ManualPermissionBrokerOptions`
- `PermissionBehavior` (TypeAliasDeclaration) — `PermissionBehavior`
- `PermissionConfig` (InterfaceDeclaration) — `PermissionConfig`
- `PermissionContext` (InterfaceDeclaration) — `PermissionContext`
- `PermissionDecisionResult` (InterfaceDeclaration) — `PermissionDecisionResult`
- `PermissionService` (ClassDeclaration) — `PermissionService`
- `PermissionToolCapability` (InterfaceDeclaration) — `PermissionToolCapability`

### `permission/types.ts`

- `defaultPermissionConfig` (VariableDeclaration) — `PermissionConfig`
- `PermissionBehavior` (TypeAliasDeclaration) — `PermissionBehavior`
- `PermissionConfig` (InterfaceDeclaration) — `PermissionConfig`
- `PermissionContext` (InterfaceDeclaration) — `PermissionContext`
- `PermissionDecisionResult` (InterfaceDeclaration) — `PermissionDecisionResult`
- `PermissionToolCapability` (InterfaceDeclaration) — `PermissionToolCapability`
- `ResolvedPermissionCapability` (InterfaceDeclaration) — `ResolvedPermissionCapability`

### `permission/workflow-draft-path.ts`

- `isPreapprovedWorkflowDraftWrite` (FunctionDeclaration) — `(input: WorkflowDraftWriteInput) => boolean`

### `plugin-reference/catalog.ts`

- `buildPluginReferenceCatalog` (FunctionDeclaration) — `(plugins: readonly PluginMetadata[]) => PluginReferenceCatalog`
- `findPluginReferenceCatalogEntry` (FunctionDeclaration) — `(catalog: PluginReferenceCatalog | undefined, pluginId: string) => PluginReferenceCatalogEntry | undefined`

### `plugin-reference/index.ts`

- `buildPluginReferenceCatalog` (FunctionDeclaration) — `(plugins: readonly PluginMetadata[]) => PluginReferenceCatalog`
- `buildPluginReferenceReminderBody` (FunctionDeclaration) — `(input: BuildPluginReferenceReminderInput) => BuildPluginReferenceReminderResult`
- `BuildPluginReferenceReminderInput` (InterfaceDeclaration) — `BuildPluginReferenceReminderInput`
- `BuildPluginReferenceReminderResult` (InterfaceDeclaration) — `BuildPluginReferenceReminderResult`
- `extractPluginReferences` (FunctionDeclaration) — `(input: string) => ExtractPluginReferencesResult`
- `ExtractPluginReferencesResult` (InterfaceDeclaration) — `ExtractPluginReferencesResult`
- `findPluginReferenceCatalogEntry` (FunctionDeclaration) — `(catalog: PluginReferenceCatalog | undefined, pluginId: string) => PluginReferenceCatalogEntry | undefined`
- `isValidPluginStableId` (FunctionDeclaration) — `(candidate: string) => boolean`
- `LivePluginMcpServer` (InterfaceDeclaration) — `LivePluginMcpServer`
- `LivePluginSkill` (InterfaceDeclaration) — `LivePluginSkill`
- `LivePluginSubagent` (InterfaceDeclaration) — `LivePluginSubagent`
- `MAX_PLUGIN_REFERENCE_MCP_SERVERS` (VariableDeclaration) — `16`
- `MAX_PLUGIN_REFERENCE_REMINDER_BYTES` (VariableDeclaration) — `number`
- `MAX_PLUGIN_REFERENCE_SKILLS` (VariableDeclaration) — `32`
- `MAX_PLUGIN_REFERENCE_SUBAGENTS` (VariableDeclaration) — `16`
- `MAX_PLUGIN_REFERENCES_PER_TURN` (VariableDeclaration) — `8`
- `PluginReferenceReminderDiagnostics` (InterfaceDeclaration) — `PluginReferenceReminderDiagnostics`
- `PluginReferenceSkipReason` (TypeAliasDeclaration) — `PluginReferenceSkipReason`

### `plugin-reference/references.ts`

- `extractPluginReferences` (FunctionDeclaration) — `(input: string) => ExtractPluginReferencesResult`
- `ExtractPluginReferencesResult` (InterfaceDeclaration) — `ExtractPluginReferencesResult`
- `isValidPluginStableId` (FunctionDeclaration) — `(candidate: string) => boolean`
- `MAX_PLUGIN_REFERENCES_PER_TURN` (VariableDeclaration) — `8`

### `plugin-reference/reminder.ts`

- `buildPluginReferenceReminderBody` (FunctionDeclaration) — `(input: BuildPluginReferenceReminderInput) => BuildPluginReferenceReminderResult`
- `BuildPluginReferenceReminderInput` (InterfaceDeclaration) — `BuildPluginReferenceReminderInput`
- `BuildPluginReferenceReminderResult` (InterfaceDeclaration) — `BuildPluginReferenceReminderResult`
- `LivePluginMcpServer` (InterfaceDeclaration) — `LivePluginMcpServer`
- `LivePluginSkill` (InterfaceDeclaration) — `LivePluginSkill`
- `LivePluginSubagent` (InterfaceDeclaration) — `LivePluginSubagent`
- `MAX_PLUGIN_REFERENCE_MCP_SERVERS` (VariableDeclaration) — `16`
- `MAX_PLUGIN_REFERENCE_REMINDER_BYTES` (VariableDeclaration) — `number`
- `MAX_PLUGIN_REFERENCE_SKILLS` (VariableDeclaration) — `32`
- `MAX_PLUGIN_REFERENCE_SUBAGENTS` (VariableDeclaration) — `16`
- `PluginReferenceReminderDiagnostics` (InterfaceDeclaration) — `PluginReferenceReminderDiagnostics`
- `PluginReferenceSkipReason` (TypeAliasDeclaration) — `PluginReferenceSkipReason`

### `runtime-task/index.ts`

- `escapeXml` (FunctionDeclaration) — `(value: string) => string`
- `formatTaskNotification` (FunctionDeclaration) — `(input: TaskNotificationInput) => string`
- `formatWorkflowEscalationNotification` (FunctionDeclaration) — `(input: WorkflowEscalationNotificationInput) => string`
- `formatWorkflowProviderStopError` (FunctionDeclaration) — `(failure: DynamicWorkflowRunError, runId: string) => string`
- `formatWorkflowStallNotification` (FunctionDeclaration) — `(input: WorkflowStallNotificationInput) => string`
- `hasRunningBackgroundRuntimeTask` (FunctionDeclaration) — `(registry: RuntimeTaskRegistry) => boolean`
- `InMemoryRuntimeTaskRegistry` (ClassDeclaration) — `InMemoryRuntimeTaskRegistry`
- `isTerminalRuntimeTask` (FunctionDeclaration) — `(task: Pick<RuntimeTaskSnapshot, "status">) => boolean`
- `RuntimeTaskMessageSink` (InterfaceDeclaration) — `RuntimeTaskMessageSink`
- `RuntimeTaskPendingMessage` (InterfaceDeclaration) — `RuntimeTaskPendingMessage`
- `RuntimeTaskRegistry` (InterfaceDeclaration) — `RuntimeTaskRegistry`
- `RuntimeTaskSnapshot` (InterfaceDeclaration) — `RuntimeTaskSnapshot`
- `RuntimeTaskType` (TypeAliasDeclaration) — `RuntimeTaskType`
- `RuntimeTaskUsageSnapshot` (InterfaceDeclaration) — `RuntimeTaskUsageSnapshot`
- `TaskNotificationInput` (InterfaceDeclaration) — `TaskNotificationInput`
- `truncateTaskNotification` (FunctionDeclaration) — `(value: string) => string`
- `WorkflowEscalationNotificationInput` (InterfaceDeclaration) — `WorkflowEscalationNotificationInput`
- `WorkflowStallNotificationInput` (InterfaceDeclaration) — `WorkflowStallNotificationInput`

### `runtime-task/notification-policy.ts`

- `shouldSuppressSealedSubagentBashNotification` (FunctionDeclaration) — `(input: { isSubagentChildRuntime: boolean; notificationSealed: boolean; registryTask?: Pick<RuntimeTaskSnapshot, "taskType" | "type">; toolName?: string; }) => boolean`

### `runtime-task/notification.ts`

- `escapeXml` (FunctionDeclaration) — `(value: string) => string`
- `formatTaskNotification` (FunctionDeclaration) — `(input: TaskNotificationInput) => string`
- `formatWorkflowEscalationNotification` (FunctionDeclaration) — `(input: WorkflowEscalationNotificationInput) => string`
- `formatWorkflowProviderStopError` (FunctionDeclaration) — `(failure: DynamicWorkflowRunError, runId: string) => string`
- `formatWorkflowStallNotification` (FunctionDeclaration) — `(input: WorkflowStallNotificationInput) => string`
- `TaskNotificationInput` (InterfaceDeclaration) — `TaskNotificationInput`
- `truncateTaskNotification` (FunctionDeclaration) — `(value: string) => string`
- `WorkflowEscalationNotificationInput` (InterfaceDeclaration) — `WorkflowEscalationNotificationInput`
- `WorkflowStallNotificationInput` (InterfaceDeclaration) — `WorkflowStallNotificationInput`

### `runtime-task/registry.ts`

- `hasRunningBackgroundRuntimeTask` (FunctionDeclaration) — `(registry: RuntimeTaskRegistry) => boolean`
- `InMemoryRuntimeTaskRegistry` (ClassDeclaration) — `InMemoryRuntimeTaskRegistry`
- `isTerminalRuntimeTask` (FunctionDeclaration) — `(task: Pick<RuntimeTaskSnapshot, "status">) => boolean`
- `RuntimeTaskMessageSink` (InterfaceDeclaration) — `RuntimeTaskMessageSink`
- `RuntimeTaskPendingMessage` (InterfaceDeclaration) — `RuntimeTaskPendingMessage`
- `RuntimeTaskRegistry` (InterfaceDeclaration) — `RuntimeTaskRegistry`
- `RuntimeTaskSnapshot` (InterfaceDeclaration) — `RuntimeTaskSnapshot`
- `RuntimeTaskType` (TypeAliasDeclaration) — `RuntimeTaskType`
- `RuntimeTaskUsageSnapshot` (InterfaceDeclaration) — `RuntimeTaskUsageSnapshot`

### `runtime-task/workflow-notification-copy.ts`

- `formatWorkflowEscalationNotification` (FunctionDeclaration) — `(input: WorkflowEscalationNotificationInput) => string`
- `formatWorkflowProviderStopError` (FunctionDeclaration) — `(failure: DynamicWorkflowRunError, runId: string) => string`
- `formatWorkflowStallNotification` (FunctionDeclaration) — `(input: WorkflowStallNotificationInput) => string`
- `WorkflowEscalationNotificationInput` (InterfaceDeclaration) — `WorkflowEscalationNotificationInput`
- `WorkflowStallNotificationInput` (InterfaceDeclaration) — `WorkflowStallNotificationInput`

### `session-context/parts.ts`

- `dedupeParts` (FunctionDeclaration) — `(parts: MessagePart[]) => MessagePart[]`
- `formatPartForContext` (FunctionDeclaration) — `(part: MessagePart) => string | null`

### `session-context/read-session-context.ts`

- `buildReferencedSessionContextReminderBody` (FunctionDeclaration) — `(input: string) => string | null`
- `buildSessionContextMaterial` (FunctionDeclaration) — `(input: { messages: MessageWithParts[]; query: string; session: SessionInfo; strategy: ReadSessionContextInput["strategy"]; outputCharBudget?: number; }) => SessionContextMaterial`
- `extractSessionReferences` (FunctionDeclaration) — `(input: string) => SessionId[]`
- `formatLocalSessionNotFound` (FunctionDeclaration) — `(input: { query: string; sessionId: string; strategy: ReadSessionContextInput["strategy"]; }) => ReadSessionContextOutput`
- `formatReadSessionContextModelContent` (FunctionDeclaration) — `(output: ReadSessionContextOutput) => string`
- `liteInputCharBudget` (FunctionDeclaration) — `() => number`
- `maxLiteChunks` (FunctionDeclaration) — `() => number`
- `outputCharBudgetFromMaxTokens` (FunctionDeclaration) — `(maxTokens: number | undefined) => number`
- `SessionContextMaterial` (InterfaceDeclaration) — `SessionContextMaterial`
- `TranscriptChunk` (InterfaceDeclaration) — `TranscriptChunk`

### `session-context/references.ts`

- `buildReferencedSessionContextReminderBody` (FunctionDeclaration) — `(input: string) => string | null`
- `extractSessionReferences` (FunctionDeclaration) — `(input: string) => SessionId[]`

### `session-context/utils.ts`

- `safeJson` (FunctionDeclaration) — `(value: unknown) => string`
- `truncateText` (FunctionDeclaration) — `(text: string, maxChars: number) => string`

### `subagent/borrowed-mcp-port.ts`

- `createBorrowedSubagentMcpAccess` (FunctionDeclaration) — `(parentPort: McpPort, parentStartupSnapshot: McpConnectionSnapshot, scopedServerNames?: readonly string[], deniedServerNames?: ReadonlySet<string>) => BorrowedSubagentMcpAccess`

### `subagent/completion-notification.ts`

- `formatLocalAgentTaskNotification` (FunctionDeclaration) — `(input: LocalAgentTaskNotificationInput) => string`

### `subagent/computer-use-policy.ts`

- `createOfficialCuaPolicy` (FunctionDeclaration) — `(officialServerNames: ReadonlySet<string>, descriptors: readonly McpToolDescriptor[], catalog: PluginReferenceCatalog | undefined) => OfficialCuaPolicy`
- `OfficialCuaPolicy` (InterfaceDeclaration) — `OfficialCuaPolicy`
- `SUBAGENT_COMPUTER_USE_UNAVAILABLE_CODE` (VariableDeclaration) — `"SUBAGENT_COMPUTER_USE_UNAVAILABLE"`
- `SUBAGENT_COMPUTER_USE_UNAVAILABLE_MESSAGE` (VariableDeclaration) — `"Computer Use is not available in subagent"`

### `subagent/context-builder.ts`

- `createSubagentContextBuilder` (FunctionDeclaration) — `(config: SubagentContextBuilderConfig) => SubagentContextBuilder`
- `SubagentContextBuilder` (ClassDeclaration) — `SubagentContextBuilder`
- `SubagentContextBuilderConfig` (InterfaceDeclaration) — `SubagentContextBuilderConfig`

### `subagent/coordinator-response.ts`

- `createCoordinatorResponsePort` (FunctionDeclaration) — `(options: CreateCoordinatorResponsePortOptions) => CoordinatorResponsePort`

### `subagent/explore-tools.ts`

- `buildExploreAllowedTools` (FunctionDeclaration) — `(options?: { embeddedSearchEnabled?: boolean; }) => readonly ExploreAgentAllowedTool[]`
- `EXPLORE_AGENT_ALLOWED_TOOLS` (VariableDeclaration) — `readonly ["Bash", "Glob", "Grep", "Read", "WebFetch", "WebSearch", "TodoWrite"]`
- `EXPLORE_AGENT_EMBEDDED_SEARCH_ALLOWED_TOOLS` (VariableDeclaration) — `readonly ["Bash", "Read", "WebFetch", "WebSearch", "TodoWrite"]`
- `ExploreAgentAllowedTool` (TypeAliasDeclaration) — `"Bash" | "Glob" | "Grep" | "Read" | "WebFetch" | "WebSearch" | "TodoWrite"`
- `formatExploreAllowedToolsForAgentDescription` (FunctionDeclaration) — `(options?: { embeddedSearchEnabled?: boolean; }) => string`

### `subagent/explore.ts`

- `buildExploreAgentPrompt` (FunctionDeclaration) — `(options: ExploreAgentPromptOptions) => string`
- `buildExploreSystemPrompt` (FunctionDeclaration) — `(options: LegacyExploreSystemPromptOptions) => string`
- `EXPLORE_AGENT_TYPE` (VariableDeclaration) — `"Explore"`
- `ExploreAgentPromptOptions` (InterfaceDeclaration) — `ExploreAgentPromptOptions`
- `LegacyExploreSystemPromptOptions` (InterfaceDeclaration) — `LegacyExploreSystemPromptOptions`

### `subagent/general-purpose.ts`

- `buildGeneralPurposeSystemPrompt` (FunctionDeclaration) — `() => string`
- `GENERAL_PURPOSE_AGENT_TYPE` (VariableDeclaration) — `"general-purpose"`

### `subagent/index.ts`

- `AgentMemoryScope` (TypeAliasDeclaration) — `AgentMemoryScope`
- `AgentPermissionMode` (TypeAliasDeclaration) — `AgentPermissionMode`
- `AgentProfile` (InterfaceDeclaration) — `AgentProfile`
- `agentProfileDisplayName` (FunctionDeclaration) — `(profile: AgentProfile) => string`
- `AgentProfileLoadResult` (InterfaceDeclaration) — `AgentProfileLoadResult`
- `AgentProfileParseDiagnostic` (InterfaceDeclaration) — `AgentProfileParseDiagnostic`
- `AgentProfileSource` (TypeAliasDeclaration) — `AgentProfileSource`
- `buildExploreAgentPrompt` (FunctionDeclaration) — `(options: ExploreAgentPromptOptions) => string`
- `buildExploreAllowedTools` (FunctionDeclaration) — `(options?: { embeddedSearchEnabled?: boolean; }) => readonly ExploreAgentAllowedTool[]`
- `buildExploreSystemPrompt` (FunctionDeclaration) — `(options: LegacyExploreSystemPromptOptions) => string`
- `buildGeneralPurposeSystemPrompt` (FunctionDeclaration) — `() => string`
- `buildSubagentCommonNotes` (FunctionDeclaration) — `() => string`
- `buildSubagentEnvironmentContext` (FunctionDeclaration) — `(options: SubagentEnvironmentContextOptions) => string`
- `BuiltInSubagentModelSelectionOverrides` (TypeAliasDeclaration) — `Partial<Record<"Explore" | "general-purpose", { providerId: string; modelId: string; options?: { reasoningLevel?: string | undefined; } | undefined; }>>`
- `createBuiltInExploreAgentProfile` (FunctionDeclaration) — `(options?: { modelSelection?: ModelSelection; }) => AgentProfile`
- `createBuiltInGeneralPurposeAgentProfile` (FunctionDeclaration) — `(options?: { modelSelection?: ModelSelection; }) => AgentProfile`
- `createExploreSubagentPort` (FunctionDeclaration) — `(options: ExploreSubagentPortOptions) => SubagentPort`
- `createSubagentContextBuilder` (FunctionDeclaration) — `(config: SubagentContextBuilderConfig) => SubagentContextBuilder`
- `DEFAULT_SUBAGENT_TYPE` (VariableDeclaration) — `"general-purpose"`
- `EnqueueParentTaskNotification` (TypeAliasDeclaration) — `EnqueueParentTaskNotification`
- `EXPLORE_AGENT_ALLOWED_TOOLS` (VariableDeclaration) — `readonly ["Bash", "Glob", "Grep", "Read", "WebFetch", "WebSearch", "TodoWrite"]`
- `EXPLORE_AGENT_EMBEDDED_SEARCH_ALLOWED_TOOLS` (VariableDeclaration) — `readonly ["Bash", "Read", "WebFetch", "WebSearch", "TodoWrite"]`
- `EXPLORE_AGENT_TYPE` (VariableDeclaration) — `"Explore"`
- `ExploreAgentAllowedTool` (TypeAliasDeclaration) — `"Bash" | "Glob" | "Grep" | "Read" | "WebFetch" | "WebSearch" | "TodoWrite"`
- `ExploreAgentPromptOptions` (InterfaceDeclaration) — `ExploreAgentPromptOptions`
- `ExploreSubagentPortOptions` (InterfaceDeclaration) — `ExploreSubagentPortOptions`
- `ExploreSubagentRuntimeRequest` (InterfaceDeclaration) — `ExploreSubagentRuntimeRequest`
- `ExploreSubagentRuntimeResult` (InterfaceDeclaration) — `ExploreSubagentRuntimeResult`
- `formatAgentProfilesForPrompt` (FunctionDeclaration) — `(profiles: readonly AgentProfile[], options?: { embeddedSearchEnabled?: boolean; }) => string | null`
- `formatExploreAllowedToolsForAgentDescription` (FunctionDeclaration) — `(options?: { embeddedSearchEnabled?: boolean; }) => string`
- `GENERAL_PURPOSE_AGENT_TYPE` (VariableDeclaration) — `"general-purpose"`
- `hasRunningBackgroundRuntimeTask` (FunctionDeclaration) — `(registry: RuntimeTaskRegistry) => boolean`
- `InMemoryRuntimeTaskRegistry` (ClassDeclaration) — `InMemoryRuntimeTaskRegistry`
- `isBuiltInExploreAgentProfile` (FunctionDeclaration) — `(profile: Pick<AgentProfile, "name" | "source">) => boolean`
- `isTerminalRuntimeTask` (FunctionDeclaration) — `(task: Pick<RuntimeTaskSnapshot, "status">) => boolean`
- `LegacyExploreSystemPromptOptions` (InterfaceDeclaration) — `LegacyExploreSystemPromptOptions`
- `normalizeAgentProfiles` (FunctionDeclaration) — `(profiles: readonly AgentProfile[], options?: { builtInModelSelectionOverrides?: BuiltInSubagentModelSelectionOverrides; }) => AgentProfile[]`
- `ParentTaskNotificationCommand` (InterfaceDeclaration) — `ParentTaskNotificationCommand`
- `parseAgentProfileFromMarkdown` (FunctionDeclaration) — `(input: { content: string; path?: string; source: AgentProfileSource; }) => { diagnostic?: AgentProfileParseDiagnostic; profile?: AgentProfile; }`
- `RuntimeTaskMessageSink` (InterfaceDeclaration) — `RuntimeTaskMessageSink`
- `RuntimeTaskPendingMessage` (InterfaceDeclaration) — `RuntimeTaskPendingMessage`
- `RuntimeTaskRegistry` (InterfaceDeclaration) — `RuntimeTaskRegistry`
- `RuntimeTaskSnapshot` (InterfaceDeclaration) — `RuntimeTaskSnapshot`
- `RuntimeTaskType` (TypeAliasDeclaration) — `RuntimeTaskType`
- `RuntimeTaskUsageSnapshot` (InterfaceDeclaration) — `RuntimeTaskUsageSnapshot`
- `SubagentContextBuilder` (ClassDeclaration) — `SubagentContextBuilder`
- `SubagentContextBuilderConfig` (InterfaceDeclaration) — `SubagentContextBuilderConfig`
- `SubagentEnvironmentContextOptions` (InterfaceDeclaration) — `SubagentEnvironmentContextOptions`

### `subagent/interaction-origin.ts`

- `buildSubagentInteractionOrigin` (FunctionDeclaration) — `(context: SubagentInteractionOriginContext, childTurnId?: TurnId) => InteractionRequestOrigin`
- `SubagentInteractionOriginContext` (InterfaceDeclaration) — `SubagentInteractionOriginContext`

### `subagent/mcp-config.ts`

- `extractRequiredMcpServerNames` (FunctionDeclaration) — `(allowedTools: readonly string[]) => string[]`
- `matchesRequiredMcpServer` (FunctionDeclaration) — `(requiredName: string, statuses: Record<string, McpServerStatus>) => boolean`

### `subagent/message-steering.ts`

- `createSubagentMessageSink` (FunctionDeclaration) — `(runtime: SteerableRuntime, request: { traceContext: TraceContext; }) => RuntimeTaskMessageSink`

### `subagent/persistent-memory-prompt.ts`

- `buildPersistentAgentMemoryPrompt` (FunctionDeclaration) — `(input: { indexContent: string; rootDir: string; scope: AgentMemoryScope; }) => string`

### `subagent/persistent-memory.ts`

- `loadPersistentAgentMemory` (FunctionDeclaration) — `(input: { fileSystemPort: FileSystemPort | undefined; memory: MemoryRuntimeConfig | undefined; logger?: Logger; profile: AgentProfile; traceContext?: TraceContext; workspaceRoot: string; }) => Promise<PersistentAgentMemory |`
- `projectPersistentAgentMemoryTools` (FunctionDeclaration) — `(config: AgentRuntimeConfig) => AgentRuntimeConfig`

### `subagent/profile-frontmatter.ts`

- `parseAgentFrontmatter` (FunctionDeclaration) — `(frontmatter: string) => ParsedAgentFrontmatter`
- `splitMarkdownFrontmatter` (FunctionDeclaration) — `(content: string) => { body: string; frontmatter?: string; }`

### `subagent/profile-model-selection.ts`

- `resolveProfileModelSelection` (FunctionDeclaration) — `(frontmatter: Record<string, unknown>) => ModelSelection | undefined`

### `subagent/profile.ts`

- `AgentMemoryScope` (TypeAliasDeclaration) — `AgentMemoryScope`
- `AgentPermissionMode` (TypeAliasDeclaration) — `AgentPermissionMode`
- `AgentProfile` (InterfaceDeclaration) — `AgentProfile`
- `agentProfileDisplayName` (FunctionDeclaration) — `(profile: AgentProfile) => string`
- `AgentProfileLoadResult` (InterfaceDeclaration) — `AgentProfileLoadResult`
- `AgentProfileParseDiagnostic` (InterfaceDeclaration) — `AgentProfileParseDiagnostic`
- `AgentProfileSource` (TypeAliasDeclaration) — `AgentProfileSource`
- `BuiltInSubagentModelSelectionOverrides` (TypeAliasDeclaration) — `Partial<Record<"Explore" | "general-purpose", { providerId: string; modelId: string; options?: { reasoningLevel?: string | undefined; } | undefined; }>>`
- `createBuiltInExploreAgentProfile` (FunctionDeclaration) — `(options?: { modelSelection?: ModelSelection; }) => AgentProfile`
- `createBuiltInGeneralPurposeAgentProfile` (FunctionDeclaration) — `(options?: { modelSelection?: ModelSelection; }) => AgentProfile`
- `DEFAULT_SUBAGENT_TYPE` (VariableDeclaration) — `"general-purpose"`
- `formatAgentProfilesForPrompt` (FunctionDeclaration) — `(profiles: readonly AgentProfile[], options?: { embeddedSearchEnabled?: boolean; }) => string | null`
- `isBuiltInExploreAgentProfile` (FunctionDeclaration) — `(profile: Pick<AgentProfile, "name" | "source">) => boolean`
- `normalizeAgentProfiles` (FunctionDeclaration) — `(profiles: readonly AgentProfile[], options?: { builtInModelSelectionOverrides?: BuiltInSubagentModelSelectionOverrides; }) => AgentProfile[]`
- `parseAgentProfileFromMarkdown` (FunctionDeclaration) — `(input: { content: string; path?: string; source: AgentProfileSource; }) => { diagnostic?: AgentProfileParseDiagnostic; profile?: AgentProfile; }`

### `subagent/runner-artifacts.ts`

- `writeCompleted` (FunctionDeclaration) — `(execution: Execution, output: AgentCompletedOutput) => Promise<void>`
- `writeFailed` (FunctionDeclaration) — `(execution: Execution, error: string) => Promise<void>`
- `writeMetadata` (FunctionDeclaration) — `(execution: Execution, status: string, extra?: Record<string, unknown>) => Promise<void>`
- `writeStopped` (FunctionDeclaration) — `(task: RuntimeTaskSnapshot, message: string) => Promise<void>`
- `writeText` (FunctionDeclaration) — `(path: string, text: string) => Promise<void>`

### `subagent/runner-background.ts`

- `backgroundWorker` (FunctionDeclaration) — `(state: RunnerState, execution: Execution, options: SubagentRunOptions, onReady: () => Promise<void>, onSetupFailure?: (error: unknown) => void, onSettled?: () => void, resumeFromStore?: boolean) => Promise<void>`
- `startMethod` (FunctionDeclaration) — `(state: RunnerState) => NonNullable<SubagentPort["start"]>`

### `subagent/runner-cancellation.ts`

- `abortGuard` (FunctionDeclaration) — `<T>(promise: Promise<T>, signal: AbortSignal | undefined, execution: Execution) => Promise<T>`
- `autoBackground` (FunctionDeclaration) — `(state: RunnerState, execution: Execution, signal: AbortSignal) => { promise: Promise<{ kind: "backgrounded" | "ignored"; }>; cancel: () => void; }`
- `controllerFor` (FunctionDeclaration) — `(state: RunnerState, execution: Execution, signal?: AbortSignal, linked?: boolean) => { controller: AbortController; detach: () => void; dispose: () => void; }`
- `readinessGate` (FunctionDeclaration) — `() => { promise: Promise<void>; resolve: () => void; reject: (error: unknown) => void; }`
- `watchdog` (FunctionDeclaration) — `(state: RunnerState, execution: Execution, controller: AbortController) => { start(): void; reportActivity(): void; stop(): void; }`

### `subagent/runner-child.ts`

- `ChildResult` (InterfaceDeclaration) — `ChildResult`
- `runChild` (FunctionDeclaration) — `(state: RunnerState, execution: Execution, runOptions: SubagentRunOptions, onReady?: () => Promise<void>, reportActivity?: () => void, resumeFromStore?: boolean) => Promise<ChildResult>`

### `subagent/runner-foreground.ts`

- `runMethod` (FunctionDeclaration) — `(state: RunnerState) => SubagentPort["run"]`

### `subagent/runner-message.ts`

- `messageMethod` (FunctionDeclaration) — `(state: RunnerState) => NonNullable<SubagentPort["sendMessage"]>`

### `subagent/runner-publication.ts`

- `completedTask` (FunctionDeclaration) — `(task: RuntimeTaskSnapshot, output: AgentCompletedOutput, completedAt?: Date) => RuntimeTaskSnapshot`
- `emit` (FunctionDeclaration) — `(state: RunnerState, execution: Execution, type: SessionEventType, payload: unknown) => Promise<void>`
- `emitExecutionCompleted` (FunctionDeclaration) — `(state: RunnerState, execution: Execution, task: RuntimeTaskSnapshot) => Promise<void>`
- `enqueueNotification` (FunctionDeclaration) — `(state: RunnerState, taskId: string, text: string, traceContext: TraceContext) => boolean`
- `failBackground` (FunctionDeclaration) — `(state: RunnerState, execution: Execution, error: unknown) => Promise<void>`
- `finishBackground` (FunctionDeclaration) — `(state: RunnerState, execution: Execution, output: AgentCompletedOutput) => Promise<void>`

### `subagent/runner-state.ts`

- `allowedTools` (FunctionDeclaration) — `(state: RunnerState, profile: AgentProfile) => readonly string[]`
- `backgroundOutput` (FunctionDeclaration) — `(execution: Execution) => AgentBackgroundedOutput`
- `createExecution` (FunctionDeclaration) — `(state: RunnerState, request: SubagentRunRequest, profile: AgentProfile, previous?: RuntimeTaskSnapshot) => Execution`
- `createState` (FunctionDeclaration) — `(options: ExploreSubagentPortOptions) => RunnerState`
- `errorText` (VariableDeclaration) — `(error: unknown) => string`
- `Execution` (InterfaceDeclaration) — `Execution`
- `registerExecution` (FunctionDeclaration) — `(state: RunnerState, execution: Execution, background: boolean) => void`
- `resolveProfile` (FunctionDeclaration) — `(state: RunnerState, request: SubagentRunRequest) => { profile: AgentProfile; request: SubagentRunRequest; }`
- `RunnerState` (InterfaceDeclaration) — `RunnerState`
- `withoutMessages` (FunctionDeclaration) — `(task: RuntimeTaskSnapshot) => RuntimeTaskSnapshot`

### `subagent/runner-stop.ts`

- `stopMethod` (FunctionDeclaration) — `(state: RunnerState) => NonNullable<SubagentPort["stopTask"]>`

### `subagent/runner.ts`

- `createExploreSubagentPort` (FunctionDeclaration) — `(options: ExploreSubagentPortOptions) => SubagentPort`
- `EnqueueParentTaskNotification` (TypeAliasDeclaration) — `EnqueueParentTaskNotification`
- `ExploreSubagentPortOptions` (InterfaceDeclaration) — `ExploreSubagentPortOptions`
- `ExploreSubagentRuntimeRequest` (InterfaceDeclaration) — `ExploreSubagentRuntimeRequest`
- `ExploreSubagentRuntimeResult` (InterfaceDeclaration) — `ExploreSubagentRuntimeResult`
- `ParentTaskNotificationCommand` (InterfaceDeclaration) — `ParentTaskNotificationCommand`

### `subagent/runtime-task-registry.ts`

- `hasRunningBackgroundRuntimeTask` (FunctionDeclaration) — `(registry: RuntimeTaskRegistry) => boolean`
- `InMemoryRuntimeTaskRegistry` (ClassDeclaration) — `InMemoryRuntimeTaskRegistry`
- `isTerminalRuntimeTask` (FunctionDeclaration) — `(task: Pick<RuntimeTaskSnapshot, "status">) => boolean`
- `RuntimeTaskMessageSink` (InterfaceDeclaration) — `RuntimeTaskMessageSink`
- `RuntimeTaskPendingMessage` (InterfaceDeclaration) — `RuntimeTaskPendingMessage`
- `RuntimeTaskRegistry` (InterfaceDeclaration) — `RuntimeTaskRegistry`
- `RuntimeTaskSnapshot` (InterfaceDeclaration) — `RuntimeTaskSnapshot`
- `RuntimeTaskType` (TypeAliasDeclaration) — `RuntimeTaskType`
- `RuntimeTaskUsageSnapshot` (InterfaceDeclaration) — `RuntimeTaskUsageSnapshot`

### `subagent/system-prompt.ts`

- `buildSubagentCommonNotes` (FunctionDeclaration) — `() => string`
- `buildSubagentEnvironmentContext` (FunctionDeclaration) — `(options: SubagentEnvironmentContextOptions) => string`
- `SubagentEnvironmentContextOptions` (InterfaceDeclaration) — `SubagentEnvironmentContextOptions`

### `subagent/tool-event-mirror.ts`

- `mirrorSubagentToolEvent` (FunctionDeclaration) — `(event: SessionEvent, context: SubagentToolEventMirrorContext) => SessionEvent | undefined`

### `subagent/tool-policy.ts`

- `buildSubagentChildDisallowRules` (FunctionDeclaration) — `(disallowedTools: readonly string[] | undefined) => readonly string[]`
- `filterSubagentChildToolNames` (FunctionDeclaration) — `(toolNames: readonly string[], disallowedTools: readonly string[] | undefined) => readonly string[]`
