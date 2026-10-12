# core-01 接口（兼容面）

范围：`apps/cli/packages/core/src` 下 `agent`（11 继承）、`compact`（6）、`context`（14，含 `context/sections`）、`embedded-search`（2）、`mcp`（5），共 38 个继承文件（计划书分包总表第 151 行）。
本文件只列兼容所需的模块路径、导出名、参数与返回类型；行为规格见 `behavior.md`，调用方见 `callers.md`。
纯声明文件按本文件列出的名字剔除兼容行后再算相似度门槛（工具从本文件的反引号片段与代码块提取名字，排除语言关键字）。
`embedded-search/*` 没有独立子路径：由 `mcp` 与工具层经包内相对路径使用（见 `callers.md`）。
`agent/turn-tool-projection.ts` 已登记 `independent-replacement`，不在本包替换范围，因此不在下表。

## 公开入口（本包范围）

| 入口 | 文件 |
| --- | --- |
| `@knorvia/core` | `src/index.ts（转出 agent / context / compact / mcp 四个区）` |
| `@knorvia/core/repl` | `src/repl/index.ts（不在本包范围）` |
| `@knorvia/core/browser-client` | `src/browser-client/index.ts（不在本包范围）` |
| `@knorvia/core/create-workflow-graph-bounds` | `src/workflow/create-workflow-graph-bounds.ts（不在本包范围）` |

## 导出清单（按文件）

### `agent/compact-session.ts`

- `compactActiveSessionMessages` (FunctionDeclaration) — `export function compactActiveSessionMessages( messages: MessageWithParts[], boundaryIndex: number, includePreservedSegment: boolean, ): MessageWithParts[]`
- `isCompactPreservableSessionMessage` (FunctionDeclaration) — `export function isCompactPreservableSessionMessage(message: MessageWithParts): boolean`
- `isActiveCompactionBoundaryPart` (FunctionDeclaration) — `export function isActiveCompactionBoundaryPart(part: MessagePart): boolean`

### `agent/file-part-hydration.ts`

- `filePartToContentBlock` (FunctionDeclaration) — `export async function filePartToContentBlock( part: FilePart, artifactStore: ToolArtifactStorePort | undefined, ): Promise<ModelMessageContentBlock>`
- `projectPersistedToolMediaContent` (FunctionDeclaration) — `export function projectPersistedToolMediaContent( value: unknown, attachmentBlocks: ModelMessageContentBlock[], ): ModelMessageContentBlock[] | undefined`

### `agent/index.ts`

- `./turn-state.js` (ExportDeclaration) — `export * from "./turn-state.js"`
- `./turn-machine.js` (ExportDeclaration) — `export * from "./turn-machine.js"`
- `MessageHistoryImpl` (ExportDeclaration) — `export { MessageHistoryImpl, createMessageHistory } from "./message-history.js";`
- `createMessageHistory` (ExportDeclaration) — `export { MessageHistoryImpl, createMessageHistory } from "./message-history.js";`
- `activeSessionMessages` (ExportDeclaration) — `export { activeSessionMessages, hydrateMessageHistoryFromSession, } from "./session-history-hydrator.js";`
- `hydrateMessageHistoryFromSession` (ExportDeclaration) — `export { activeSessionMessages, hydrateMessageHistoryFromSession, } from "./session-history-hydrator.js";`
- `MessageHistory` (ExportDeclaration) — `export type { MessageHistory, ModelInputMessage, ToolCallInput, CacheStats, } from "./message-history.js";`
- `ModelInputMessage` (ExportDeclaration) — `export type { MessageHistory, ModelInputMessage, ToolCallInput, CacheStats, } from "./message-history.js";`
- `ToolCallInput` (ExportDeclaration) — `export type { MessageHistory, ModelInputMessage, ToolCallInput, CacheStats, } from "./message-history.js";`
- `CacheStats` (ExportDeclaration) — `export type { MessageHistory, ModelInputMessage, ToolCallInput, CacheStats, } from "./message-history.js";`
- `SessionHistoryHydrationResult` (ExportDeclaration) — `export type { SessionHistoryHydrationResult } from "./session-history-hydrator.js";`

### `agent/message-history-usage.ts`

- `PersistedTokenUsageBaseline` (InterfaceDeclaration) — `PersistedTokenUsageBaseline`
- `persistedTokenUsageBaseline` (FunctionDeclaration) — `export function persistedTokenUsageBaseline( tokens: TokenUsageInfo | undefined, ): PersistedTokenUsageBaseline | undefined`

### `agent/message-history.ts`

- `ToolCallInput` (InterfaceDeclaration) — `ToolCallInput`
- `ReasoningContentInput` (TypeAliasDeclaration) — `ReasoningContentInput`
- `ModelInputMessage` (InterfaceDeclaration) — `ModelInputMessage`
- `RuntimeMessageSource` (TypeAliasDeclaration) — `RuntimeMessageSource`
- `RuntimeMessageMetadata` (InterfaceDeclaration) — `RuntimeMessageMetadata`
- `RuntimeMessageMessageEntry` (InterfaceDeclaration) — `RuntimeMessageMessageEntry`
- `RuntimeAttachmentEntry` (InterfaceDeclaration) — `RuntimeAttachmentEntry`
- `RuntimeMessageEntry` (TypeAliasDeclaration) — `RuntimeMessageEntry`
- `CacheStats` (InterfaceDeclaration) — `CacheStats`
- `MessageHistory` (InterfaceDeclaration) — `MessageHistory`
- `systemReminderRuntimeMetadata` (FunctionDeclaration) — `export function systemReminderRuntimeMetadata( source: SystemReminderSource, ): RuntimeMessageMetadata`
- `realUserRuntimeMetadata` (FunctionDeclaration) — `export function realUserRuntimeMetadata(): RuntimeMessageMetadata`
- `legacySyntheticRuntimeMetadata` (FunctionDeclaration) — `export function legacySyntheticRuntimeMetadata(): RuntimeMessageMetadata`
- `todoReminderRuntimeMetadata` (FunctionDeclaration) — `export function todoReminderRuntimeMetadata(): RuntimeMessageMetadata`
- `isKnownSystemReminderSource` (FunctionDeclaration) — `export function isKnownSystemReminderSource(value: unknown): value is SystemReminderSource`
- `isRuntimeAttachmentEntry` (FunctionDeclaration) — `export function isRuntimeAttachmentEntry( input: ModelInputMessage | RuntimeMessageEntry, ): input is RuntimeAttachmentEntry`
- `systemReminderAttachmentEntry` (FunctionDeclaration) — `export function systemReminderAttachmentEntry( source: SystemReminderSource, content: string, ): RuntimeAttachmentEntry`
- `createRuntimeUserEntry` (FunctionDeclaration) — `export function createRuntimeUserEntry( content: ModelMessageContent, metadata?: RuntimeMessageMetadata, ): RuntimeMessageMessageEntry`
- `createRuntimeAssistantEntry` (FunctionDeclaration) — `export function createRuntimeAssistantEntry( content: string, toolCalls?: readonly ToolCallInput[], reasoning?: readonly ReasoningContentInput[], model?: Pick<Model, "providerId" | "modelId">, tokens?: TokenUsageInfo, ): RuntimeMessageMessageEntry`
- `createRuntimeToolResultEntry` (FunctionDeclaration) — `export function createRuntimeToolResultEntry( toolCallId: string, toolName: string, content: ModelMessageContent, isError: boolean, ): RuntimeMessageMessageEntry`
- `cloneModelMessageContent` (FunctionDeclaration) — `export function cloneModelMessageContent(content: ModelMessageContent): ModelMessageContent`
- `cloneModelInputMessage` (FunctionDeclaration) — `export function cloneModelInputMessage(message: ModelInputMessage): ModelInputMessage`
- `cloneRuntimeMessageEntry` (FunctionDeclaration) — `export function cloneRuntimeMessageEntry(entry: RuntimeMessageEntry): RuntimeMessageEntry`
- `countContextPrefixMessages` (FunctionDeclaration) — `export function countContextPrefixMessages( messagesOrEntries: readonly (ModelInputMessage | RuntimeMessageEntry)[], ): number`
- `invalidateRuntimeTokenUsage` (FunctionDeclaration) — `export function invalidateRuntimeTokenUsage(tokens: TokenUsageInfo): TokenUsageInfo`
- `MessageHistoryImpl` (ClassDeclaration) — `MessageHistoryImpl`
- `createMessageHistory` (FunctionDeclaration) — `export function createMessageHistory(): MessageHistory`

### `agent/read-file-state-hydrator.ts`

- `ReadFileStateHydrationResult` (InterfaceDeclaration) — `ReadFileStateHydrationResult`
- `hydrateReadFileStateFromSession` (FunctionDeclaration) — `export async function hydrateReadFileStateFromSession(input:`

### `agent/runtime-input-presentation.ts`

- `runtimeInputMetadata` (FunctionDeclaration) — `export function runtimeInputMetadata(value: unknown): RuntimeMessageMetadata | undefined`

### `agent/session-history-hydrator.ts`

- `SessionHistoryHydrationResult` (InterfaceDeclaration) — `SessionHistoryHydrationResult`
- `activeSessionMessages` (FunctionDeclaration) — `export function activeSessionMessages( messages: MessageWithParts[], options:`
- `hydrateMessageHistoryFromSession` (FunctionDeclaration) — `export async function hydrateMessageHistoryFromSession(input:`

### `agent/tool-part-order.ts`

- `selectToolPartsForHistory` (FunctionDeclaration) — `export function selectToolPartsForHistory(parts: ToolPart[]): ToolPart[]`

### `agent/turn-machine.ts`

- `TurnMachine` (InterfaceDeclaration) — `TurnMachine`
- `TurnMachineImpl` (ClassDeclaration) — `TurnMachineImpl`

### `agent/turn-state.ts`

- `ToolCall` (ExportDeclaration) — `export type { ModelToolCall as ToolCall } from "@knorvia/contracts";`
- `TurnPhase` (VariableDeclaration) — `export const TurnPhase = { Idle: "idle", ProcessingInput: "processing_input", AwaitingModelResponse: "awaiting_model_response", Streaming: "streaming", SchedulingTools: "scheduling_tools", ExecutingTools: "executing_tools", AggregatingRe...`
- `TurnPhase` (TypeAliasDeclaration) — `TurnPhase`
- `TurnState` (InterfaceDeclaration) — `TurnState`
- `ModelRequestState` (InterfaceDeclaration) — `ModelRequestState`
- `ModelMessage` (InterfaceDeclaration) — `ModelMessage`
- `TokenUsageState` (InterfaceDeclaration) — `TokenUsageState`
- `ToolCallState` (InterfaceDeclaration) — `ToolCallState`
- `ToolCallStateStatus` (TypeAliasDeclaration) — `ToolCallStateStatus`
- `ToolResultState` (InterfaceDeclaration) — `ToolResultState`
- `ToolScheduleState` (InterfaceDeclaration) — `ToolScheduleState`
- `ToolScheduleItem` (InterfaceDeclaration) — `ToolScheduleItem`
- `PermissionRequestState` (InterfaceDeclaration) — `PermissionRequestState`
- `PermissionResultState` (InterfaceDeclaration) — `PermissionResultState`
- `PermissionDecision` (TypeAliasDeclaration) — `PermissionDecision`
- `TurnResultType` (TypeAliasDeclaration) — `TurnResultType`
- `TurnErrorState` (InterfaceDeclaration) — `TurnErrorState`
- `TurnAttachment` (InterfaceDeclaration) — `TurnAttachment`
- `createTurnState` (FunctionDeclaration) — `export function createTurnState( id: TurnId, sessionId: SessionId, turnNumber: number, traceId: TraceId, input: string, attachments?: TurnAttachment[], ): TurnState`
- `isTerminalPhase` (FunctionDeclaration) — `export function isTerminalPhase(phase: TurnPhase): boolean`
- `isWaitingPhase` (FunctionDeclaration) — `export function isWaitingPhase(phase: TurnPhase): boolean`
- `canTransitionTo` (FunctionDeclaration) — `export function canTransitionTo(current: TurnPhase, next: TurnPhase): boolean`

### `compact/index.ts`

- `buildCompactPrompt` (ExportDeclaration) — `export { buildCompactPrompt, buildCompactSummaryMessage, formatCompactSummary } from "./prompt.js";`
- `buildCompactSummaryMessage` (ExportDeclaration) — `export { buildCompactPrompt, buildCompactSummaryMessage, formatCompactSummary } from "./prompt.js";`
- `formatCompactSummary` (ExportDeclaration) — `export { buildCompactPrompt, buildCompactSummaryMessage, formatCompactSummary } from "./prompt.js";`
- `COMPACT_PROMPT_TOO_LONG_RETRY_MARKER` (ExportDeclaration) — `export { COMPACT_PROMPT_TOO_LONG_RETRY_MARKER, COMPACT_PROMPT_TOO_LONG_USER_MESSAGE, MAX_COMPACT_PROMPT_TOO_LONG_RETRIES, buildManualCompactBoundary, createCompactBoundaryId, estimateMessageTokens, getMessagesToSummarize, getUsageTotalTokens, hasEnoughMessagesToCompact, } from "./manual.js";`
- `COMPACT_PROMPT_TOO_LONG_USER_MESSAGE` (ExportDeclaration) — `export { COMPACT_PROMPT_TOO_LONG_RETRY_MARKER, COMPACT_PROMPT_TOO_LONG_USER_MESSAGE, MAX_COMPACT_PROMPT_TOO_LONG_RETRIES, buildManualCompactBoundary, createCompactBoundaryId, estimateMessageTokens, getMessagesToSummarize, getUsageTotalTokens, hasEnoughMessagesToCompact, } from "./manual.js";`
- `MAX_COMPACT_PROMPT_TOO_LONG_RETRIES` (ExportDeclaration) — `export { COMPACT_PROMPT_TOO_LONG_RETRY_MARKER, COMPACT_PROMPT_TOO_LONG_USER_MESSAGE, MAX_COMPACT_PROMPT_TOO_LONG_RETRIES, buildManualCompactBoundary, createCompactBoundaryId, estimateMessageTokens, getMessagesToSummarize, getUsageTotalTokens, hasEnoughMessagesToCompact, } from "./manual.js";`
- `buildManualCompactBoundary` (ExportDeclaration) — `export { COMPACT_PROMPT_TOO_LONG_RETRY_MARKER, COMPACT_PROMPT_TOO_LONG_USER_MESSAGE, MAX_COMPACT_PROMPT_TOO_LONG_RETRIES, buildManualCompactBoundary, createCompactBoundaryId, estimateMessageTokens, getMessagesToSummarize, getUsageTotalTokens, hasEnoughMessagesToCompact, } from "./manual.js";`
- `createCompactBoundaryId` (ExportDeclaration) — `export { COMPACT_PROMPT_TOO_LONG_RETRY_MARKER, COMPACT_PROMPT_TOO_LONG_USER_MESSAGE, MAX_COMPACT_PROMPT_TOO_LONG_RETRIES, buildManualCompactBoundary, createCompactBoundaryId, estimateMessageTokens, getMessagesToSummarize, getUsageTotalTokens, hasEnoughMessagesToCompact, } from "./manual.js";`
- `estimateMessageTokens` (ExportDeclaration) — `export { COMPACT_PROMPT_TOO_LONG_RETRY_MARKER, COMPACT_PROMPT_TOO_LONG_USER_MESSAGE, MAX_COMPACT_PROMPT_TOO_LONG_RETRIES, buildManualCompactBoundary, createCompactBoundaryId, estimateMessageTokens, getMessagesToSummarize, getUsageTotalTokens, hasEnoughMessagesToCompact, } from "./manual.js";`
- `getMessagesToSummarize` (ExportDeclaration) — `export { COMPACT_PROMPT_TOO_LONG_RETRY_MARKER, COMPACT_PROMPT_TOO_LONG_USER_MESSAGE, MAX_COMPACT_PROMPT_TOO_LONG_RETRIES, buildManualCompactBoundary, createCompactBoundaryId, estimateMessageTokens, getMessagesToSummarize, getUsageTotalTokens, hasEnoughMessagesToCompact, } from "./manual.js";`
- `getUsageTotalTokens` (ExportDeclaration) — `export { COMPACT_PROMPT_TOO_LONG_RETRY_MARKER, COMPACT_PROMPT_TOO_LONG_USER_MESSAGE, MAX_COMPACT_PROMPT_TOO_LONG_RETRIES, buildManualCompactBoundary, createCompactBoundaryId, estimateMessageTokens, getMessagesToSummarize, getUsageTotalTokens, hasEnoughMessagesToCompact, } from "./manual.js";`
- `hasEnoughMessagesToCompact` (ExportDeclaration) — `export { COMPACT_PROMPT_TOO_LONG_RETRY_MARKER, COMPACT_PROMPT_TOO_LONG_USER_MESSAGE, MAX_COMPACT_PROMPT_TOO_LONG_RETRIES, buildManualCompactBoundary, createCompactBoundaryId, estimateMessageTokens, getMessagesToSummarize, getUsageTotalTokens, hasEnoughMessagesToCompact, } from "./manual.js";`
- `AUTOCOMPACT_BUFFER_TOKENS` (ExportDeclaration) — `export { AUTOCOMPACT_BUFFER_TOKENS, DEFAULT_AUTOCOMPACT_THRESHOLD_PERCENT, DEFAULT_AUTOCOMPACT_OUTPUT_RESERVE_TOKENS, DEFAULT_COMPACT_CONTEXT_WINDOW, MAX_CONSECUTIVE_AUTOCOMPACT_FAILURES, MAX_OUTPUT_TOKENS_FOR_SUMMARY, getAutoCompactOutputReserveTokens, getAutoCompactThreshold, getEffectiveContextWindowSize, shouldAutoCompact, } from "./policy.js";`
- `DEFAULT_AUTOCOMPACT_THRESHOLD_PERCENT` (ExportDeclaration) — `export { AUTOCOMPACT_BUFFER_TOKENS, DEFAULT_AUTOCOMPACT_THRESHOLD_PERCENT, DEFAULT_AUTOCOMPACT_OUTPUT_RESERVE_TOKENS, DEFAULT_COMPACT_CONTEXT_WINDOW, MAX_CONSECUTIVE_AUTOCOMPACT_FAILURES, MAX_OUTPUT_TOKENS_FOR_SUMMARY, getAutoCompactOutputReserveTokens, getAutoCompactThreshold, getEffectiveContextWindowSize, shouldAutoCompact, } from "./policy.js";`
- `DEFAULT_AUTOCOMPACT_OUTPUT_RESERVE_TOKENS` (ExportDeclaration) — `export { AUTOCOMPACT_BUFFER_TOKENS, DEFAULT_AUTOCOMPACT_THRESHOLD_PERCENT, DEFAULT_AUTOCOMPACT_OUTPUT_RESERVE_TOKENS, DEFAULT_COMPACT_CONTEXT_WINDOW, MAX_CONSECUTIVE_AUTOCOMPACT_FAILURES, MAX_OUTPUT_TOKENS_FOR_SUMMARY, getAutoCompactOutputReserveTokens, getAutoCompactThreshold, getEffectiveContextWindowSize, shouldAutoCompact, } from "./policy.js";`
- `DEFAULT_COMPACT_CONTEXT_WINDOW` (ExportDeclaration) — `export { AUTOCOMPACT_BUFFER_TOKENS, DEFAULT_AUTOCOMPACT_THRESHOLD_PERCENT, DEFAULT_AUTOCOMPACT_OUTPUT_RESERVE_TOKENS, DEFAULT_COMPACT_CONTEXT_WINDOW, MAX_CONSECUTIVE_AUTOCOMPACT_FAILURES, MAX_OUTPUT_TOKENS_FOR_SUMMARY, getAutoCompactOutputReserveTokens, getAutoCompactThreshold, getEffectiveContextWindowSize, shouldAutoCompact, } from "./policy.js";`
- `MAX_CONSECUTIVE_AUTOCOMPACT_FAILURES` (ExportDeclaration) — `export { AUTOCOMPACT_BUFFER_TOKENS, DEFAULT_AUTOCOMPACT_THRESHOLD_PERCENT, DEFAULT_AUTOCOMPACT_OUTPUT_RESERVE_TOKENS, DEFAULT_COMPACT_CONTEXT_WINDOW, MAX_CONSECUTIVE_AUTOCOMPACT_FAILURES, MAX_OUTPUT_TOKENS_FOR_SUMMARY, getAutoCompactOutputReserveTokens, getAutoCompactThreshold, getEffectiveContextWindowSize, shouldAutoCompact, } from "./policy.js";`
- `MAX_OUTPUT_TOKENS_FOR_SUMMARY` (ExportDeclaration) — `export { AUTOCOMPACT_BUFFER_TOKENS, DEFAULT_AUTOCOMPACT_THRESHOLD_PERCENT, DEFAULT_AUTOCOMPACT_OUTPUT_RESERVE_TOKENS, DEFAULT_COMPACT_CONTEXT_WINDOW, MAX_CONSECUTIVE_AUTOCOMPACT_FAILURES, MAX_OUTPUT_TOKENS_FOR_SUMMARY, getAutoCompactOutputReserveTokens, getAutoCompactThreshold, getEffectiveContextWindowSize, shouldAutoCompact, } from "./policy.js";`
- `getAutoCompactOutputReserveTokens` (ExportDeclaration) — `export { AUTOCOMPACT_BUFFER_TOKENS, DEFAULT_AUTOCOMPACT_THRESHOLD_PERCENT, DEFAULT_AUTOCOMPACT_OUTPUT_RESERVE_TOKENS, DEFAULT_COMPACT_CONTEXT_WINDOW, MAX_CONSECUTIVE_AUTOCOMPACT_FAILURES, MAX_OUTPUT_TOKENS_FOR_SUMMARY, getAutoCompactOutputReserveTokens, getAutoCompactThreshold, getEffectiveContextWindowSize, shouldAutoCompact, } from "./policy.js";`
- `getAutoCompactThreshold` (ExportDeclaration) — `export { AUTOCOMPACT_BUFFER_TOKENS, DEFAULT_AUTOCOMPACT_THRESHOLD_PERCENT, DEFAULT_AUTOCOMPACT_OUTPUT_RESERVE_TOKENS, DEFAULT_COMPACT_CONTEXT_WINDOW, MAX_CONSECUTIVE_AUTOCOMPACT_FAILURES, MAX_OUTPUT_TOKENS_FOR_SUMMARY, getAutoCompactOutputReserveTokens, getAutoCompactThreshold, getEffectiveContextWindowSize, shouldAutoCompact, } from "./policy.js";`
- `getEffectiveContextWindowSize` (ExportDeclaration) — `export { AUTOCOMPACT_BUFFER_TOKENS, DEFAULT_AUTOCOMPACT_THRESHOLD_PERCENT, DEFAULT_AUTOCOMPACT_OUTPUT_RESERVE_TOKENS, DEFAULT_COMPACT_CONTEXT_WINDOW, MAX_CONSECUTIVE_AUTOCOMPACT_FAILURES, MAX_OUTPUT_TOKENS_FOR_SUMMARY, getAutoCompactOutputReserveTokens, getAutoCompactThreshold, getEffectiveContextWindowSize, shouldAutoCompact, } from "./policy.js";`
- `shouldAutoCompact` (ExportDeclaration) — `export { AUTOCOMPACT_BUFFER_TOKENS, DEFAULT_AUTOCOMPACT_THRESHOLD_PERCENT, DEFAULT_AUTOCOMPACT_OUTPUT_RESERVE_TOKENS, DEFAULT_COMPACT_CONTEXT_WINDOW, MAX_CONSECUTIVE_AUTOCOMPACT_FAILURES, MAX_OUTPUT_TOKENS_FOR_SUMMARY, getAutoCompactOutputReserveTokens, getAutoCompactThreshold, getEffectiveContextWindowSize, shouldAutoCompact, } from "./policy.js";`
- `DEFAULT_MICROCOMPACT_COMPACTABLE_TOOLS` (ExportDeclaration) — `export { DEFAULT_MICROCOMPACT_COMPACTABLE_TOOLS, DEFAULT_MICROCOMPACT_KEEP_RECENT_TOOL_RESULTS, DEFAULT_MICROCOMPACT_MIN_TOKEN_SAVINGS, DEFAULT_MICROCOMPACT_THRESHOLD_BUFFER_TOKENS, DEFAULT_MICROCOMPACT_THRESHOLD_RATIO, MICROCOMPACT_CLEARED_TOOL_RESULT_MESSAGE, MICROCOMPACT_CLEARED_TOOL_RESULT_PREFIX, buildDefaultMicrocompactThreshold, maybeLocalMicrocompactMessages, } from "./microcompact.js";`
- `DEFAULT_MICROCOMPACT_KEEP_RECENT_TOOL_RESULTS` (ExportDeclaration) — `export { DEFAULT_MICROCOMPACT_COMPACTABLE_TOOLS, DEFAULT_MICROCOMPACT_KEEP_RECENT_TOOL_RESULTS, DEFAULT_MICROCOMPACT_MIN_TOKEN_SAVINGS, DEFAULT_MICROCOMPACT_THRESHOLD_BUFFER_TOKENS, DEFAULT_MICROCOMPACT_THRESHOLD_RATIO, MICROCOMPACT_CLEARED_TOOL_RESULT_MESSAGE, MICROCOMPACT_CLEARED_TOOL_RESULT_PREFIX, buildDefaultMicrocompactThreshold, maybeLocalMicrocompactMessages, } from "./microcompact.js";`
- `DEFAULT_MICROCOMPACT_MIN_TOKEN_SAVINGS` (ExportDeclaration) — `export { DEFAULT_MICROCOMPACT_COMPACTABLE_TOOLS, DEFAULT_MICROCOMPACT_KEEP_RECENT_TOOL_RESULTS, DEFAULT_MICROCOMPACT_MIN_TOKEN_SAVINGS, DEFAULT_MICROCOMPACT_THRESHOLD_BUFFER_TOKENS, DEFAULT_MICROCOMPACT_THRESHOLD_RATIO, MICROCOMPACT_CLEARED_TOOL_RESULT_MESSAGE, MICROCOMPACT_CLEARED_TOOL_RESULT_PREFIX, buildDefaultMicrocompactThreshold, maybeLocalMicrocompactMessages, } from "./microcompact.js";`
- `DEFAULT_MICROCOMPACT_THRESHOLD_BUFFER_TOKENS` (ExportDeclaration) — `export { DEFAULT_MICROCOMPACT_COMPACTABLE_TOOLS, DEFAULT_MICROCOMPACT_KEEP_RECENT_TOOL_RESULTS, DEFAULT_MICROCOMPACT_MIN_TOKEN_SAVINGS, DEFAULT_MICROCOMPACT_THRESHOLD_BUFFER_TOKENS, DEFAULT_MICROCOMPACT_THRESHOLD_RATIO, MICROCOMPACT_CLEARED_TOOL_RESULT_MESSAGE, MICROCOMPACT_CLEARED_TOOL_RESULT_PREFIX, buildDefaultMicrocompactThreshold, maybeLocalMicrocompactMessages, } from "./microcompact.js";`
- `DEFAULT_MICROCOMPACT_THRESHOLD_RATIO` (ExportDeclaration) — `export { DEFAULT_MICROCOMPACT_COMPACTABLE_TOOLS, DEFAULT_MICROCOMPACT_KEEP_RECENT_TOOL_RESULTS, DEFAULT_MICROCOMPACT_MIN_TOKEN_SAVINGS, DEFAULT_MICROCOMPACT_THRESHOLD_BUFFER_TOKENS, DEFAULT_MICROCOMPACT_THRESHOLD_RATIO, MICROCOMPACT_CLEARED_TOOL_RESULT_MESSAGE, MICROCOMPACT_CLEARED_TOOL_RESULT_PREFIX, buildDefaultMicrocompactThreshold, maybeLocalMicrocompactMessages, } from "./microcompact.js";`
- `MICROCOMPACT_CLEARED_TOOL_RESULT_MESSAGE` (ExportDeclaration) — `export { DEFAULT_MICROCOMPACT_COMPACTABLE_TOOLS, DEFAULT_MICROCOMPACT_KEEP_RECENT_TOOL_RESULTS, DEFAULT_MICROCOMPACT_MIN_TOKEN_SAVINGS, DEFAULT_MICROCOMPACT_THRESHOLD_BUFFER_TOKENS, DEFAULT_MICROCOMPACT_THRESHOLD_RATIO, MICROCOMPACT_CLEARED_TOOL_RESULT_MESSAGE, MICROCOMPACT_CLEARED_TOOL_RESULT_PREFIX, buildDefaultMicrocompactThreshold, maybeLocalMicrocompactMessages, } from "./microcompact.js";`
- `MICROCOMPACT_CLEARED_TOOL_RESULT_PREFIX` (ExportDeclaration) — `export { DEFAULT_MICROCOMPACT_COMPACTABLE_TOOLS, DEFAULT_MICROCOMPACT_KEEP_RECENT_TOOL_RESULTS, DEFAULT_MICROCOMPACT_MIN_TOKEN_SAVINGS, DEFAULT_MICROCOMPACT_THRESHOLD_BUFFER_TOKENS, DEFAULT_MICROCOMPACT_THRESHOLD_RATIO, MICROCOMPACT_CLEARED_TOOL_RESULT_MESSAGE, MICROCOMPACT_CLEARED_TOOL_RESULT_PREFIX, buildDefaultMicrocompactThreshold, maybeLocalMicrocompactMessages, } from "./microcompact.js";`
- `buildDefaultMicrocompactThreshold` (ExportDeclaration) — `export { DEFAULT_MICROCOMPACT_COMPACTABLE_TOOLS, DEFAULT_MICROCOMPACT_KEEP_RECENT_TOOL_RESULTS, DEFAULT_MICROCOMPACT_MIN_TOKEN_SAVINGS, DEFAULT_MICROCOMPACT_THRESHOLD_BUFFER_TOKENS, DEFAULT_MICROCOMPACT_THRESHOLD_RATIO, MICROCOMPACT_CLEARED_TOOL_RESULT_MESSAGE, MICROCOMPACT_CLEARED_TOOL_RESULT_PREFIX, buildDefaultMicrocompactThreshold, maybeLocalMicrocompactMessages, } from "./microcompact.js";`
- `maybeLocalMicrocompactMessages` (ExportDeclaration) — `export { DEFAULT_MICROCOMPACT_COMPACTABLE_TOOLS, DEFAULT_MICROCOMPACT_KEEP_RECENT_TOOL_RESULTS, DEFAULT_MICROCOMPACT_MIN_TOKEN_SAVINGS, DEFAULT_MICROCOMPACT_THRESHOLD_BUFFER_TOKENS, DEFAULT_MICROCOMPACT_THRESHOLD_RATIO, MICROCOMPACT_CLEARED_TOOL_RESULT_MESSAGE, MICROCOMPACT_CLEARED_TOOL_RESULT_PREFIX, buildDefaultMicrocompactThreshold, maybeLocalMicrocompactMessages, } from "./microcompact.js";`
- `BuildManualCompactBoundaryInput` (ExportDeclaration) — `export type { BuildManualCompactBoundaryInput, CompactModelMessage, TokenUsageLike, } from "./manual.js";`
- `CompactModelMessage` (ExportDeclaration) — `export type { BuildManualCompactBoundaryInput, CompactModelMessage, TokenUsageLike, } from "./manual.js";`
- `TokenUsageLike` (ExportDeclaration) — `export type { BuildManualCompactBoundaryInput, CompactModelMessage, TokenUsageLike, } from "./manual.js";`
- `AutoCompactDecision` (ExportDeclaration) — `export type { AutoCompactDecision, AutoCompactPolicyConfig } from "./policy.js";`
- `AutoCompactPolicyConfig` (ExportDeclaration) — `export type { AutoCompactDecision, AutoCompactPolicyConfig } from "./policy.js";`
- `AutoCompactTokenOverride` (ExportDeclaration) — `export type { AutoCompactTokenOverride, AutoCompactTokenSource } from "./policy.js";`
- `AutoCompactTokenSource` (ExportDeclaration) — `export type { AutoCompactTokenOverride, AutoCompactTokenSource } from "./policy.js";`
- `LocalMicrocompactBoundaryPayload` (ExportDeclaration) — `export type { LocalMicrocompactBoundaryPayload, LocalMicrocompactDecision, LocalMicrocompactMessage, LocalMicrocompactPolicyConfig, LocalMicrocompactResult, } from "./microcompact.js";`
- `LocalMicrocompactDecision` (ExportDeclaration) — `export type { LocalMicrocompactBoundaryPayload, LocalMicrocompactDecision, LocalMicrocompactMessage, LocalMicrocompactPolicyConfig, LocalMicrocompactResult, } from "./microcompact.js";`
- `LocalMicrocompactMessage` (ExportDeclaration) — `export type { LocalMicrocompactBoundaryPayload, LocalMicrocompactDecision, LocalMicrocompactMessage, LocalMicrocompactPolicyConfig, LocalMicrocompactResult, } from "./microcompact.js";`
- `LocalMicrocompactPolicyConfig` (ExportDeclaration) — `export type { LocalMicrocompactBoundaryPayload, LocalMicrocompactDecision, LocalMicrocompactMessage, LocalMicrocompactPolicyConfig, LocalMicrocompactResult, } from "./microcompact.js";`
- `LocalMicrocompactResult` (ExportDeclaration) — `export type { LocalMicrocompactBoundaryPayload, LocalMicrocompactDecision, LocalMicrocompactMessage, LocalMicrocompactPolicyConfig, LocalMicrocompactResult, } from "./microcompact.js";`

### `compact/manual.ts`

- `CompactModelMessage` (InterfaceDeclaration) — `CompactModelMessage`
- `TokenUsageLike` (InterfaceDeclaration) — `TokenUsageLike`
- `BuildManualCompactBoundaryInput` (InterfaceDeclaration) — `BuildManualCompactBoundaryInput`
- `MAX_COMPACT_PROMPT_TOO_LONG_RETRIES` (VariableDeclaration) — `export const MAX_COMPACT_PROMPT_TOO_LONG_RETRIES = 3;`
- `COMPACT_PROMPT_TOO_LONG_RETRY_MARKER` (VariableDeclaration) — `export const COMPACT_PROMPT_TOO_LONG_RETRY_MARKER = "[earlier conversation truncated for compaction retry]";`
- `COMPACT_PROMPT_TOO_LONG_USER_MESSAGE` (VariableDeclaration) — `export const COMPACT_PROMPT_TOO_LONG_USER_MESSAGE = "Conversation too long to compact automatically. Try /compact again after narrowing the active context.";`
- `getMessagesToSummarize` (FunctionDeclaration) — `export function getMessagesToSummarize( messages: readonly CompactModelMessage[], ): CompactModelMessage[]`
- `hasEnoughMessagesToCompact` (FunctionDeclaration) — `export function hasEnoughMessagesToCompact(messages: readonly CompactModelMessage[]): boolean`
- `buildManualCompactBoundary` (FunctionDeclaration) — `export function buildManualCompactBoundary( input: BuildManualCompactBoundaryInput, ): CompactBoundaryPayload`
- `estimateMessageTokens` (FunctionDeclaration) — `export function estimateMessageTokens(messages: readonly CompactModelMessage[]): number`
- `getUsageTotalTokens` (FunctionDeclaration) — `export function getUsageTotalTokens(usage?: TokenUsageLike): number`
- `createCompactBoundaryId` (FunctionDeclaration) — `export function createCompactBoundaryId( randomUUID: () => string = () => crypto.randomUUID(), ): string`

### `compact/microcompact.ts`

- `MICROCOMPACT_CLEARED_TOOL_RESULT_PREFIX` (VariableDeclaration) — `export const MICROCOMPACT_CLEARED_TOOL_RESULT_PREFIX = "[Old tool result content cleared]";`
- `MICROCOMPACT_CLEARED_TOOL_RESULT_MESSAGE` (VariableDeclaration) — `export const MICROCOMPACT_CLEARED_TOOL_RESULT_MESSAGE = "[Old tool result content cleared]";`
- `DEFAULT_MICROCOMPACT_KEEP_RECENT_TOOL_RESULTS` (VariableDeclaration) — `export const DEFAULT_MICROCOMPACT_KEEP_RECENT_TOOL_RESULTS = 5;`
- `DEFAULT_MICROCOMPACT_MIN_TOKEN_SAVINGS` (VariableDeclaration) — `export const DEFAULT_MICROCOMPACT_MIN_TOKEN_SAVINGS = 256;`
- `DEFAULT_MICROCOMPACT_THRESHOLD_RATIO` (VariableDeclaration) — `export const DEFAULT_MICROCOMPACT_THRESHOLD_RATIO = 0.9;`
- `DEFAULT_MICROCOMPACT_THRESHOLD_BUFFER_TOKENS` (VariableDeclaration) — `export const DEFAULT_MICROCOMPACT_THRESHOLD_BUFFER_TOKENS = 2000;`
- `DEFAULT_MICROCOMPACT_COMPACTABLE_TOOLS` (VariableDeclaration) — `export const DEFAULT_MICROCOMPACT_COMPACTABLE_TOOLS = [ "Read", "Bash", "Grep", "Glob", "WebFetch", "WebSearch", "Edit", "Write", "ApplyPatch", ] as const;`
- `LocalMicrocompactPolicyConfig` (InterfaceDeclaration) — `LocalMicrocompactPolicyConfig`
- `LocalMicrocompactMessage` (InterfaceDeclaration) — `LocalMicrocompactMessage`
- `LocalMicrocompactBoundaryPayload` (TypeAliasDeclaration) — `LocalMicrocompactBoundaryPayload`
- `LocalMicrocompactDecision` (InterfaceDeclaration) — `LocalMicrocompactDecision`
- `LocalMicrocompactResult` (InterfaceDeclaration) — `LocalMicrocompactResult<T extends LocalMicrocompactMessage>`
- `buildDefaultMicrocompactThreshold` (FunctionDeclaration) — `export function buildDefaultMicrocompactThreshold(autoCompactThreshold: number): number`
- `maybeLocalMicrocompactMessages` (FunctionDeclaration) — `export function maybeLocalMicrocompactMessages<T extends LocalMicrocompactMessage>(input:`

### `compact/policy.ts`

- `DEFAULT_COMPACT_CONTEXT_WINDOW` (VariableDeclaration) — `export const DEFAULT_COMPACT_CONTEXT_WINDOW = 200000;`
- `DEFAULT_AUTOCOMPACT_OUTPUT_RESERVE_TOKENS` (VariableDeclaration) — `export const DEFAULT_AUTOCOMPACT_OUTPUT_RESERVE_TOKENS = 32000;`
- `MAX_OUTPUT_TOKENS_FOR_SUMMARY` (VariableDeclaration) — `export const MAX_OUTPUT_TOKENS_FOR_SUMMARY = 20000;`
- `AUTOCOMPACT_BUFFER_TOKENS` (VariableDeclaration) — `export const AUTOCOMPACT_BUFFER_TOKENS = 13000;`
- `DEFAULT_AUTOCOMPACT_THRESHOLD_PERCENT` (VariableDeclaration) — `export const DEFAULT_AUTOCOMPACT_THRESHOLD_PERCENT = 100;`
- `MAX_CONSECUTIVE_AUTOCOMPACT_FAILURES` (VariableDeclaration) — `export const MAX_CONSECUTIVE_AUTOCOMPACT_FAILURES = 3;`
- `AutoCompactPolicyConfig` (InterfaceDeclaration) — `AutoCompactPolicyConfig`
- `AutoCompactTokenSource` (TypeAliasDeclaration) — `AutoCompactTokenSource`
- `AutoCompactTokenOverride` (InterfaceDeclaration) — `AutoCompactTokenOverride`
- `AutoCompactDecision` (InterfaceDeclaration) — `AutoCompactDecision`
- `getEffectiveContextWindowSize` (FunctionDeclaration) — `export function getEffectiveContextWindowSize(config: AutoCompactPolicyConfig =`
- `getAutoCompactOutputReserveTokens` (FunctionDeclaration) — `export function getAutoCompactOutputReserveTokens(config: AutoCompactPolicyConfig =`
- `getAutoCompactThreshold` (FunctionDeclaration) — `export function getAutoCompactThreshold(config: AutoCompactPolicyConfig =`
- `shouldAutoCompact` (FunctionDeclaration) — `export function shouldAutoCompact(input:`

### `compact/prompt.ts`

- `buildCompactPrompt` (FunctionDeclaration) — `export function buildCompactPrompt(customInstructions: string | undefined): string`
- `formatCompactSummary` (FunctionDeclaration) — `export function formatCompactSummary(text: string | undefined): string`
- `buildCompactSummaryMessage` (FunctionDeclaration) — `export function buildCompactSummaryMessage( summary: string, options:`

### `compact/rounds.ts`

- `groupByAssistantStartedRounds` (FunctionDeclaration) — `export function groupByAssistantStartedRounds<T>( items: readonly T[], roleOf: (item: T) => string | undefined, assistantIdOf?: (item: T) => string | undefined, ): T[][]`

### `context/builder.ts`

- `ContextBuilder` (ClassDeclaration) — `ContextBuilder`
- `buildContextMetaUserBody` (FunctionDeclaration) — `export function buildContextMetaUserBody(sections: ContextSection[]): string | null`
- `buildSkillsMetaUserBody` (FunctionDeclaration) — `export function buildSkillsMetaUserBody(sections: ContextSection[]): string | null`
- `createContextBuilder` (FunctionDeclaration) — `export function createContextBuilder(config: ContextBuilderConfig): ContextBuilder`

### `context/dynamic-sections.ts`

- `buildSessionGuidanceSection` (FunctionDeclaration) — `export function buildSessionGuidanceSection( toolNames: readonly string[], hasSkills = false, ): ContextSection | null`
- `buildDynamicBehaviorSection` (FunctionDeclaration) — `export function buildDynamicBehaviorSection(): ContextSection`
- `buildOutputStyleSection` (FunctionDeclaration) — `export function buildOutputStyleSection( style: ContextBuilderConfig["outputStyle"], ): ContextSection | null`
- `buildContextManagementSection` (FunctionDeclaration) — `export function buildContextManagementSection(): ContextSection`

### `context/index.ts`

- `./types.js` (ExportDeclaration) — `export * from "./types.js"`
- `./builder.js` (ExportDeclaration) — `export * from "./builder.js"`
- `./utils.js` (ExportDeclaration) — `export * from "./utils.js"`
- `buildCliPrefixSection` (ExportDeclaration) — `export { buildCliPrefixSection } from "./sections/cli-prefix.js";`
- `buildIdentitySection` (ExportDeclaration) — `export { buildIdentitySection } from "./sections/identity.js";`
- `buildWorkflowActorIdentitySection` (ExportDeclaration) — `export { buildWorkflowActorIdentitySection } from "./sections/workflow-actor.js";`
- `buildEnvInfoSection` (ExportDeclaration) — `export { buildEnvInfoSection, buildGitSystemContextSection } from "./sections/env-info.js";`
- `buildGitSystemContextSection` (ExportDeclaration) — `export { buildEnvInfoSection, buildGitSystemContextSection } from "./sections/env-info.js";`
- `buildSkillsSection` (ExportDeclaration) — `export { buildSkillsSection } from "./sections/skills.js";`
- `buildCurrentDateSection` (ExportDeclaration) — `export { buildCurrentDateSection } from "./sections/current-date.js";`
- `buildMemorySection` (ExportDeclaration) — `export { buildMemorySection } from "./sections/memory.js";`
- `buildDesktopContextSection` (ExportDeclaration) — `export { buildDesktopContextSection } from "./sections/desktop.js";`

### `context/sections/cli-prefix.ts`

- `buildCliPrefixSection` (FunctionDeclaration) — `export function buildCliPrefixSection(): ContextSection`

### `context/sections/current-date.ts`

- `buildCurrentDateSection` (FunctionDeclaration) — `export function buildCurrentDateSection(currentDate: string | undefined): ContextSection | null`

### `context/sections/desktop.ts`

- `buildDesktopContextSection` (FunctionDeclaration) — `export function buildDesktopContextSection(): ContextSection`

### `context/sections/env-info.ts`

- `isEnvInfoGitRepository` (FunctionDeclaration) — `export function isEnvInfoGitRepository(info: EnvInfo): boolean`
- `buildEnvInfoSection` (FunctionDeclaration) — `export function buildEnvInfoSection(envInfo: EnvInfo, model?: Model): ContextSection`
- `buildGitSystemContextSection` (FunctionDeclaration) — `export function buildGitSystemContextSection(envInfo: EnvInfo): ContextSection | null`

### `context/sections/identity.ts`

- `buildSecurityNotice` (FunctionDeclaration) — `export function buildSecurityNotice(): string`
- `buildHarnessBlock` (FunctionDeclaration) — `export function buildHarnessBlock(): string`
- `buildIdentitySection` (FunctionDeclaration) — `export function buildIdentitySection(outputStyle?: OutputStylePromptConfig): ContextSection`

### `context/sections/memory.ts`

- `buildMemorySection` (FunctionDeclaration) — `export function buildMemorySection(memoryRoot: string | undefined): ContextSection | null`

### `context/sections/request-user-context.ts`

- `buildRequestUserContextSection` (FunctionDeclaration) — `export function buildRequestUserContextSection(input:`

### `context/sections/skills.ts`

- `buildSkillsSection` (FunctionDeclaration) — `export function buildSkillsSection(options: SkillsSectionOptions): ContextSection | null`

### `context/sections/workflow-actor.ts`

- `buildWorkflowActorIdentitySection` (FunctionDeclaration) — `export function buildWorkflowActorIdentitySection(actor: WorkflowActorContext): ContextSection`

### `context/types.ts`

- `EnvInfo` (ExportDeclaration) — `export type { EnvInfo, PackageManager, ProjectContext, ProjectType, ResolvedUserInstructionSource, ResolvedUserInstructions, UserInstructionsOptions, } from "@knorvia/contracts";`
- `PackageManager` (ExportDeclaration) — `export type { EnvInfo, PackageManager, ProjectContext, ProjectType, ResolvedUserInstructionSource, ResolvedUserInstructions, UserInstructionsOptions, } from "@knorvia/contracts";`
- `ProjectContext` (ExportDeclaration) — `export type { EnvInfo, PackageManager, ProjectContext, ProjectType, ResolvedUserInstructionSource, ResolvedUserInstructions, UserInstructionsOptions, } from "@knorvia/contracts";`
- `ProjectType` (ExportDeclaration) — `export type { EnvInfo, PackageManager, ProjectContext, ProjectType, ResolvedUserInstructionSource, ResolvedUserInstructions, UserInstructionsOptions, } from "@knorvia/contracts";`
- `ResolvedUserInstructionSource` (ExportDeclaration) — `export type { EnvInfo, PackageManager, ProjectContext, ProjectType, ResolvedUserInstructionSource, ResolvedUserInstructions, UserInstructionsOptions, } from "@knorvia/contracts";`
- `ResolvedUserInstructions` (ExportDeclaration) — `export type { EnvInfo, PackageManager, ProjectContext, ProjectType, ResolvedUserInstructionSource, ResolvedUserInstructions, UserInstructionsOptions, } from "@knorvia/contracts";`
- `UserInstructionsOptions` (ExportDeclaration) — `export type { EnvInfo, PackageManager, ProjectContext, ProjectType, ResolvedUserInstructionSource, ResolvedUserInstructions, UserInstructionsOptions, } from "@knorvia/contracts";`
- `ContextSource` (TypeAliasDeclaration) — `ContextSource`
- `ContextInjectionTarget` (TypeAliasDeclaration) — `ContextInjectionTarget`
- `ContextCacheHint` (TypeAliasDeclaration) — `ContextCacheHint`
- `PresentationSurface` (TypeAliasDeclaration) — `PresentationSurface`
- `ContextSection` (InterfaceDeclaration) — `ContextSection`
- `ContextMetaUserAttachmentSource` (TypeAliasDeclaration) — `ContextMetaUserAttachmentSource`
- `ContextMetaUserAttachment` (InterfaceDeclaration) — `ContextMetaUserAttachment`
- `ContextBuildResult` (InterfaceDeclaration) — `ContextBuildResult`
- `OutputStylePromptConfig` (InterfaceDeclaration) — `OutputStylePromptConfig`
- `ContextBuilderConfig` (InterfaceDeclaration) — `ContextBuilderConfig`
- `WorkflowActorContext` (InterfaceDeclaration) — `WorkflowActorContext`
- `ContextUserInstructionsRequest` (TypeAliasDeclaration) — `ContextUserInstructionsRequest`

### `context/utils.ts`

- `countTokenEstimateUnits` (FunctionDeclaration) — `export function countTokenEstimateUnits(text: string): number`
- `tokenEstimatePrefixLength` (FunctionDeclaration) — `export function tokenEstimatePrefixLength(text: string, maximumUnits: number): number`
- `estimateTokens` (FunctionDeclaration) — `export function estimateTokens(text: string): number`

### `embedded-search/capability.ts`

- `resolveEmbeddedSearchBranchCapability` (FunctionDeclaration) — `export function resolveEmbeddedSearchBranchCapability(input:`

### `embedded-search/shell.ts`

- `shouldInjectEmbeddedSearchBashPrelude` (FunctionDeclaration) — `export function shouldInjectEmbeddedSearchBashPrelude(): boolean`
- `supportsEmbeddedSearchShellSelection` (FunctionDeclaration) — `export function supportsEmbeddedSearchShellSelection( selection: ExecutionShellSelection | undefined, ): boolean`

### `mcp/image-normalization.ts`

- `MCP_IMAGE_INLINE_BASE64_BYTES` (VariableDeclaration) — `export const MCP_IMAGE_INLINE_BASE64_BYTES: number = 200 * 1024;`
- `MCP_IMAGE_INLINE_RAW_BYTES` (VariableDeclaration) — `export const MCP_IMAGE_INLINE_RAW_BYTES: number = Math.floor( (MCP_IMAGE_INLINE_BASE64_BYTES * 3) / 4, );`
- `HOST_NODE_REPL_IMAGE_MAX_DIMENSION` (VariableDeclaration) — `export const HOST_NODE_REPL_IMAGE_MAX_DIMENSION = 2048;`
- `normalizeMcpToolResultForModel` (FunctionDeclaration) — `export async function normalizeMcpToolResultForModel(input:`
- `hasOfficialCuaFrameAuthority` (FunctionDeclaration) — `export function hasOfficialCuaFrameAuthority(result: unknown): result is McpToolCallResult`
- `asDataUrl` (FunctionDeclaration) — `export function asDataUrl(data: string, mimeType: string): string`
- `base64PayloadFromMcpImageData` (FunctionDeclaration) — `export function base64PayloadFromMcpImageData(data: string): string`

### `mcp/index.ts`

- `toMcpToolName` (ExportDeclaration) — `export { toMcpToolName } from "./name.js";`
- `HOST_NODE_REPL_IMAGE_MAX_DIMENSION` (ExportDeclaration) — `export { HOST_NODE_REPL_IMAGE_MAX_DIMENSION, MCP_IMAGE_INLINE_BASE64_BYTES, MCP_IMAGE_INLINE_RAW_BYTES, } from "./image-normalization.js";`
- `MCP_IMAGE_INLINE_BASE64_BYTES` (ExportDeclaration) — `export { HOST_NODE_REPL_IMAGE_MAX_DIMENSION, MCP_IMAGE_INLINE_BASE64_BYTES, MCP_IMAGE_INLINE_RAW_BYTES, } from "./image-normalization.js";`
- `MCP_IMAGE_INLINE_RAW_BYTES` (ExportDeclaration) — `export { HOST_NODE_REPL_IMAGE_MAX_DIMENSION, MCP_IMAGE_INLINE_BASE64_BYTES, MCP_IMAGE_INLINE_RAW_BYTES, } from "./image-normalization.js";`
- `RegisterMcpToolsOptions` (InterfaceDeclaration) — `RegisterMcpToolsOptions`
- `registerMcpTools` (FunctionDeclaration) — `export function registerMcpTools( registry: ToolRegistry, mcpPort: McpPort, descriptors: readonly McpToolDescriptor[], options: RegisterMcpToolsOptions =`
- `McpToolOutputJsonSchema` (VariableDeclaration) — `export const McpToolOutputJsonSchema: JsonSchema = { type: "object", required: ["content"], properties: { content: { type: "array", items: { type: "object", additionalProperties: true, }, }, structuredContent: {}, isError: { type: "boole...`

### `mcp/name.ts`

- `toMcpToolName` (FunctionDeclaration) — `export function toMcpToolName( descriptor: Pick<McpToolDescriptor, "name" | "serverName" | "toolName">, ): string`
- `toModelVisibleMcpNamePart` (FunctionDeclaration) — `export function toModelVisibleMcpNamePart(name: string): string`
- `matchesModelVisibleMcpServerName` (FunctionDeclaration) — `export function matchesModelVisibleMcpServerName( requiredName: string, serverName: string, ): boolean`

### `mcp/result-format.ts`

- `formatMcpToolResult` (FunctionDeclaration) — `export function formatMcpToolResult( output: unknown, preserveWindowsFrame = false, ): ModelMessageContent`

### `mcp/windows-computer-use.ts`

- `isTrustedWindowsComputerUseTool` (FunctionDeclaration) — `export function isTrustedWindowsComputerUseTool( descriptor: Pick<McpToolDescriptor, "serverName" | "toolName">, trustedServerNames?: ReadonlySet<string>, ): boolean`
- `restrictBorrowedWindowsComputerUse` (FunctionDeclaration) — `export function restrictBorrowedWindowsComputerUse( borrowed:`
- `preserveWindowsComputerUseFrames` (FunctionDeclaration) — `export function preserveWindowsComputerUseFrames(result: McpToolCallResult): McpToolCallResult`
