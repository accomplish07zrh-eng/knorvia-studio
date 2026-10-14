# core-runtime-helpers-01 兼容接口面（v1）

只列兼容所需的模块路径、导出名与种类；内部怎么拆文件由替换实现自定。
导出清单由 `scripts/dep-refs.mjs` 的 `--list-exports` 同源算法（ts-morph `getExportedDeclarations`）批量生成，
覆盖 `apps/cli/packages/core/src/runtime/helpers` 下全部 60 个继承文件。

## 范围

- **60 个继承文件**（`apps/cli/packages/core/src/runtime/helpers/**`，继承口径 `licensing/current-files.json`，正好到单包 60 上限）。
- **不在范围**：`runtime/methods/**`（模型请求、流式、压缩执行、回合状态机等，后续包 `core-runtime-methods-01/02`）、
  `runtime/` 下其余入口与装配文件（`runtime.ts`、`session-mode-port.ts`、`types.ts`、`deps.ts`、`internal.ts`、`agent/**`、
  `compact/**`、`permission/**`、`subagent/**`、`tool/**` 等，属 `core-runtime-01` 或其他包），以及包根 `src/index.ts`（core-03 已合并）。
- 同样不碰：core-01/02/03、试点 1（hooks）、adapters 与 tool 包。

## 黑盒入口

- **桶入口**：`apps/cli/packages/core/src/runtime/helpers/index.ts`（26 个 export \* ，把下表 26 个模块的导出再导出一遍）。
- **模块路径入口**：表中其余模块通过相对路径直接导入（本包调用方与测试都这么用），同样是兼容面。
- 源码入口（tsx 加载 `src/**/*.ts`）与 dist 入口（`dist/**/*.js`）逐名一致。

## 导出统计

| 项                                        | 数量 |
| ----------------------------------------- | ---- |
| 模块数                                    | 60   |
| 导出合计                                  | 316  |
| 运行时值导出（function/const/class/enum） | 296  |
| 类型导出（interface/type）                | 20   |

> 「运行时值」在源码与 dist 里都存在可取到的绑定；纯类型只在类型层可见，相似度比较时按
> 计划书「纯声明文件」口径剔除兼容名后再算。

## 模块路径 × 导出名

| 模块路径                                    | 导出名                                                   | 种类      | 运行时值 |
| ------------------------------------------- | -------------------------------------------------------- | --------- | -------- |
| `attachment-artifacts.ts`                   | `persistAttachmentDataUrl`                               | function  | 是       |
| `attachment-artifacts.ts`                   | `readInlineAttachmentContent`                            | function  | 是       |
| `attachment-artifacts.ts`                   | `safeAttachmentOriginalRef`                              | function  | 是       |
| `attachment-data-url.ts`                    | `parseDataUrlHeader`                                     | function  | 是       |
| `attachment-data-url.ts`                    | `base64PayloadByteLength`                                | function  | 是       |
| `attachment-data-url.ts`                    | `isStrictBase64Payload`                                  | function  | 是       |
| `attachment-image.ts`                       | `prepareImageDataUrl`                                    | function  | 是       |
| `attachment-image.ts`                       | `inferImageMimeFromPath`                                 | function  | 是       |
| `attachment-media-resolver.ts`              | `resolveInlineMediaAttachment`                           | function  | 是       |
| `attachment-media-resolver.ts`              | `resolveLocalMediaAttachment`                            | function  | 是       |
| `attachment-media-resolver/context.ts`      | `InlineOptions`                                          | type      | 否       |
| `attachment-media-resolver/context.ts`      | `LocalOptions`                                           | type      | 否       |
| `attachment-media-resolver/context.ts`      | `LocalMediaContext`                                      | interface | 否       |
| `attachment-media-resolver/inline.ts`       | `resolveInlineMedia`                                     | function  | 是       |
| `attachment-media-resolver/local-image.ts`  | `resolveLocalImage`                                      | function  | 是       |
| `attachment-media-resolver/local-pdf.ts`    | `resolveLocalPdf`                                        | function  | 是       |
| `attachment-media-resolver/local-video.ts`  | `resolveLocalVideo`                                      | function  | 是       |
| `attachment-media-resolver/local.ts`        | `resolveLocalMedia`                                      | function  | 是       |
| `attachment-media-resolver/read-failure.ts` | `localReadFailed`                                        | function  | 是       |
| `attachment-path-reference.ts`              | `resolvedInlineTextAttachment`                           | function  | 是       |
| `attachment-path-reference.ts`              | `resolvedPathReferenceAttachment`                        | function  | 是       |
| `attachment-path-reference.ts`              | `isDataOrArtifactUrl`                                    | function  | 是       |
| `attachment-path-reference.ts`              | `isTextLikePath`                                         | function  | 是       |
| `attachment-path-reference.ts`              | `inferAttachmentMimeFromPath`                            | function  | 是       |
| `attachment-pdf.ts`                         | `PDF_INPUT_MAX_BYTES`                                    | const     | 是       |
| `attachment-pdf.ts`                         | `parseInlinePdfDataUrl`                                  | function  | 是       |
| `attachment-pdf.ts`                         | `isPdfBytes`                                             | function  | 是       |
| `attachment-placeholder.ts`                 | `resolvedPlaceholderAttachment`                          | function  | 是       |
| `attachment-video.ts`                       | `VideoInputMimeType`                                     | type      | 否       |
| `attachment-video.ts`                       | `inferVideoMimeFromPath`                                 | function  | 是       |
| `attachment-video.ts`                       | `parseInlineVideoDataUrl`                                | function  | 是       |
| `attachments.ts`                            | `summarizeTurnAttachmentsForEvent`                       | function  | 是       |
| `attachments.ts`                            | `resolveTurnAttachments`                                 | function  | 是       |
| `child-client-ports.ts`                     | `ClientFacingPorts`                                      | interface | 否       |
| `child-client-ports.ts`                     | `ChildClientPortsContext`                                | type      | 否       |
| `child-client-ports.ts`                     | `deriveChildClientPorts`                                 | function  | 是       |
| `commands.ts`                               | `parseCompactCommand`                                    | function  | 是       |
| `commands.ts`                               | `parseRewindCommand`                                     | function  | 是       |
| `compact-media.ts`                          | `projectCompactMediaForRetry`                            | function  | 是       |
| `compact-media.ts`                          | `logCompactMediaRetryProjection`                         | function  | 是       |
| `compact-post-reminders.ts`                 | `buildPostCompactReadStateReminderEntries`               | function  | 是       |
| `compact-preservation.ts`                   | `selectPersistedCompactTail`                             | function  | 是       |
| `compact-preservation.ts`                   | `countCompactPreservedRuntimeMessages`                   | function  | 是       |
| `compact-selection.ts`                      | `CompactEntrySelection`                                  | interface | 否       |
| `compact-selection.ts`                      | `selectCompactEntries`                                   | function  | 是       |
| `compact-selection.ts`                      | `getRuntimeEntriesToSummarize`                           | function  | 是       |
| `compact-selection.ts`                      | `hasEnoughRuntimeEntriesToCompact`                       | function  | 是       |
| `compact-selection.ts`                      | `estimateRuntimeEntryTokens`                             | function  | 是       |
| `compact-selection.ts`                      | `selectCompactEntriesAfterPromptTooLong`                 | function  | 是       |
| `compact-selection.ts`                      | `selectCompactEntriesForInitialPromptTooLong`            | function  | 是       |
| `compact-selection.ts`                      | `truncateCompactSummaryRequestEntriesAfterPromptTooLong` | function  | 是       |
| `compact.ts`                                | `buildPostCompactReadStateReminderEntries`               | function  | 是       |
| `compact.ts`                                | `defaultCompactPhaseForTrigger`                          | function  | 是       |
| `compact.ts`                                | `countCompactPreservedRuntimeMessages`                   | function  | 是       |
| `compact.ts`                                | `defaultCompactReasonForTrigger`                         | function  | 是       |
| `compact.ts`                                | `compactFailureReasonFromError`                          | function  | 是       |
| `compact.ts`                                | `buildPostCompactRuntimeEntries`                         | function  | 是       |
| `compact.ts`                                | `selectCompactEntries`                                   | function  | 是       |
| `compact.ts`                                | `maybeLocalMicrocompactRuntimeEntries`                   | function  | 是       |
| `compact.ts`                                | `getRuntimeEntriesToSummarize`                           | function  | 是       |
| `compact.ts`                                | `hasEnoughRuntimeEntriesToCompact`                       | function  | 是       |
| `compact.ts`                                | `estimateRuntimeEntryTokens`                             | function  | 是       |
| `compact.ts`                                | `selectCompactEntriesAfterPromptTooLong`                 | function  | 是       |
| `compact.ts`                                | `selectCompactEntriesForInitialPromptTooLong`            | function  | 是       |
| `compact.ts`                                | `truncateCompactSummaryRequestEntriesAfterPromptTooLong` | function  | 是       |
| `context-usage-breakdown.ts`                | `ContextUsageContributor`                                | interface | 否       |
| `context-usage-breakdown.ts`                | `ContextUsageCategoryBreakdown`                          | interface | 否       |
| `context-usage-breakdown.ts`                | `buildCategoryBreakdown`                                 | function  | 是       |
| `context-usage-breakdown.ts`                | `sectionContributor`                                     | function  | 是       |
| `context-usage-breakdown.ts`                | `toolContributor`                                        | function  | 是       |
| `context-usage-breakdown.ts`                | `skillContributor`                                       | function  | 是       |
| `context-usage-breakdown.ts`                | `messageRoleContributor`                                 | function  | 是       |
| `conversation.ts`                           | `getLatestActiveSessionMessageId`                        | function  | 是       |
| `conversation.ts`                           | `isMetaUserContextMessage`                               | function  | 是       |
| `conversation.ts`                           | `findLatestRealUserMessageIndex`                         | function  | 是       |
| `conversation.ts`                           | `buildUserContentFromTurn`                               | function  | 是       |
| `conversation.ts`                           | `buildRuntimeUserEntriesFromTurn`                        | function  | 是       |
| `data.ts`                                   | `isRuntimeDiffHunk`                                      | function  | 是       |
| `data.ts`                                   | `isPlainRecord`                                          | function  | 是       |
| `data.ts`                                   | `objectKeys`                                             | function  | 是       |
| `data.ts`                                   | `stringProperty`                                         | function  | 是       |
| `index.ts`                                  | `isRuntimeDiffHunk`                                      | function  | 是       |
| `index.ts`                                  | `titleFromInput`                                         | function  | 是       |
| `index.ts`                                  | `parseCompactCommand`                                    | function  | 是       |
| `index.ts`                                  | `logResolvedTurnAttachments`                             | function  | 是       |
| `index.ts`                                  | `buildPostCompactReadStateReminderEntries`               | function  | 是       |
| `index.ts`                                  | `buildRuntimeProviderRequestMessages`                    | function  | 是       |
| `index.ts`                                  | `emptyTokenUsageInfo`                                    | function  | 是       |
| `index.ts`                                  | `slugify`                                                | function  | 是       |
| `index.ts`                                  | `MAX_TURN_STEER_INPUT_BYTES`                             | const     | 是       |
| `index.ts`                                  | `projectCompactMediaForRetry`                            | function  | 是       |
| `index.ts`                                  | `isResolvablePermissionBroker`                           | function  | 是       |
| `index.ts`                                  | `measureUtf8Bytes`                                       | function  | 是       |
| `index.ts`                                  | `isPlainRecord`                                          | function  | 是       |
| `index.ts`                                  | `parseRewindCommand`                                     | function  | 是       |
| `index.ts`                                  | `normalizeModelToolCallsForRuntime`                      | function  | 是       |
| `index.ts`                                  | `projectIdFromDirectory`                                 | function  | 是       |
| `index.ts`                                  | `previewInput`                                           | function  | 是       |
| `index.ts`                                  | `objectKeys`                                             | function  | 是       |
| `index.ts`                                  | `toTokenUsageInfo`                                       | function  | 是       |
| `index.ts`                                  | `isInspectablePermissionBroker`                          | function  | 是       |
| `index.ts`                                  | `projectExecutionErrorPayload`                           | function  | 是       |
| `index.ts`                                  | `MediaCapabilityProjection`                              | interface | 否       |
| `index.ts`                                  | `ClientFacingPorts`                                      | interface | 否       |
| `index.ts`                                  | `WORKSPACE_CHECKPOINT_CONTENT_TYPE`                      | const     | 是       |
| `index.ts`                                  | `stringProperty`                                         | function  | 是       |
| `index.ts`                                  | `findLatestUserMessageFromEnd`                           | function  | 是       |
| `index.ts`                                  | `MediaBudgetProjection`                                  | interface | 否       |
| `index.ts`                                  | `ProviderRequestMessageProjectionResult`                 | interface | 否       |
| `index.ts`                                  | `ChildClientPortsContext`                                | type      | 否       |
| `index.ts`                                  | `getLatestActiveSessionMessageId`                        | function  | 是       |
| `index.ts`                                  | `cloneMessageForFork`                                    | function  | 是       |
| `index.ts`                                  | `writeApprovedPlanFile`                                  | function  | 是       |
| `index.ts`                                  | `requireRuntimeToolCallName`                             | function  | 是       |
| `index.ts`                                  | `defaultCompactPhaseForTrigger`                          | function  | 是       |
| `index.ts`                                  | `getFileMutationCheckpointCandidate`                     | function  | 是       |
| `index.ts`                                  | `detectRepeatedToolCallWarnings`                         | function  | 是       |
| `index.ts`                                  | `deriveChildClientPorts`                                 | function  | 是       |
| `index.ts`                                  | `createStreamingToolAttemptId`                           | function  | 是       |
| `index.ts`                                  | `projectMessagesForInputFormat`                          | function  | 是       |
| `index.ts`                                  | `recordTurnFileChange`                                   | function  | 是       |
| `index.ts`                                  | `createStreamRecoveryAnchorId`                           | function  | 是       |
| `index.ts`                                  | `countCompactPreservedRuntimeMessages`                   | function  | 是       |
| `index.ts`                                  | `toRecordInput`                                          | function  | 是       |
| `index.ts`                                  | `defaultCompactReasonForTrigger`                         | function  | 是       |
| `index.ts`                                  | `createExternalTurnFaultError`                           | function  | 是       |
| `index.ts`                                  | `summarizeTurnAttachmentsForEvent`                       | function  | 是       |
| `index.ts`                                  | `isMetaUserContextMessage`                               | function  | 是       |
| `index.ts`                                  | `emitStreamingToolLedgerUpdate`                          | function  | 是       |
| `index.ts`                                  | `stringifyToolResultOutput`                              | function  | 是       |
| `index.ts`                                  | `readRawFinishReason`                                    | function  | 是       |
| `index.ts`                                  | `createTurnAbortScope`                                   | function  | 是       |
| `index.ts`                                  | `stringifyWorkspaceCheckpointArtifact`                   | function  | 是       |
| `index.ts`                                  | `logModelRequestMediaSummary`                            | function  | 是       |
| `index.ts`                                  | `findLatestRealUserMessageIndex`                         | function  | 是       |
| `index.ts`                                  | `isContextExceededFinishReason`                          | function  | 是       |
| `index.ts`                                  | `readApprovedPlanFileReferenceEntry`                     | function  | 是       |
| `index.ts`                                  | `compactFailureReasonFromError`                          | function  | 是       |
| `index.ts`                                  | `createModelContextExceededFinishError`                  | function  | 是       |
| `index.ts`                                  | `buildPostCompactRuntimeEntries`                         | function  | 是       |
| `index.ts`                                  | `logCompactMediaRetryProjection`                         | function  | 是       |
| `index.ts`                                  | `modelContentForToolResult`                              | function  | 是       |
| `index.ts`                                  | `buildTurnFileChangeSummary`                             | function  | 是       |
| `index.ts`                                  | `throwIfTurnAborted`                                     | function  | 是       |
| `index.ts`                                  | `detectToolCallBudgetWarning`                            | function  | 是       |
| `index.ts`                                  | `selectCompactEntries`                                   | function  | 是       |
| `index.ts`                                  | `isErrorForToolResult`                                   | function  | 是       |
| `index.ts`                                  | `createTurnFailureError`                                 | function  | 是       |
| `index.ts`                                  | `selectCheckpointForRewind`                              | function  | 是       |
| `index.ts`                                  | `projectMessagesWithMediaAttachmentPaths`                | function  | 是       |
| `index.ts`                                  | `createCompactRapidRefillError`                          | function  | 是       |
| `index.ts`                                  | `resolveTurnAttachments`                                 | function  | 是       |
| `index.ts`                                  | `maybeLocalMicrocompactRuntimeEntries`                   | function  | 是       |
| `index.ts`                                  | `emitStreamRecoveryAnchor`                               | function  | 是       |
| `index.ts`                                  | `selectCheckpointForMessage`                             | function  | 是       |
| `index.ts`                                  | `stringifyForEstimation`                                 | function  | 是       |
| `index.ts`                                  | `getRuntimeEntriesToSummarize`                           | function  | 是       |
| `index.ts`                                  | `buildRepeatedToolCallReminderBody`                      | function  | 是       |
| `index.ts`                                  | `selectCheckpointsForMessages`                           | function  | 是       |
| `index.ts`                                  | `hasEnoughRuntimeEntriesToCompact`                       | function  | 是       |
| `index.ts`                                  | `parseMcpToolName`                                       | function  | 是       |
| `index.ts`                                  | `buildToolCallBudgetReminderBody`                        | function  | 是       |
| `index.ts`                                  | `estimateRuntimeEntryTokens`                             | function  | 是       |
| `index.ts`                                  | `createTurnCancelledError`                               | function  | 是       |
| `index.ts`                                  | `buildDateChangeReminderBody`                            | function  | 是       |
| `index.ts`                                  | `isSuspiciousEmptyModelResult`                           | function  | 是       |
| `index.ts`                                  | `projectMessagesForModelMediaPolicy`                     | function  | 是       |
| `index.ts`                                  | `buildUserContentFromTurn`                               | function  | 是       |
| `index.ts`                                  | `runtimeMetadataForSyntheticUserMessageSource`           | function  | 是       |
| `index.ts`                                  | `findParallelGroupIndex`                                 | function  | 是       |
| `index.ts`                                  | `appendTurnOutcomeEvent`                                 | function  | 是       |
| `index.ts`                                  | `activeSuffixMessageIdsForRewind`                        | function  | 是       |
| `index.ts`                                  | `buildSuspiciousEmptyDiagnostics`                        | function  | 是       |
| `index.ts`                                  | `projectMessagesForMediaBudget`                          | function  | 是       |
| `index.ts`                                  | `logMediaCapabilityProjection`                           | function  | 是       |
| `index.ts`                                  | `clonePartForFork`                                       | function  | 是       |
| `index.ts`                                  | `shouldBuildTodoReminder`                                | function  | 是       |
| `index.ts`                                  | `buildTodoReminderBody`                                  | function  | 是       |
| `index.ts`                                  | `previewTextFromMessage`                                 | function  | 是       |
| `index.ts`                                  | `finalizeSuspiciousEmptyModelResult`                     | function  | 是       |
| `index.ts`                                  | `buildRuntimeModeReminderBody`                           | function  | 是       |
| `index.ts`                                  | `buildMessageRewindEvaluationItems`                      | function  | 是       |
| `index.ts`                                  | `selectCompactEntriesAfterPromptTooLong`                 | function  | 是       |
| `index.ts`                                  | `buildPlanModeExitReminderBody`                          | function  | 是       |
| `index.ts`                                  | `buildRewindEvaluationItems`                             | function  | 是       |
| `index.ts`                                  | `buildRuntimeOutputStyleReminderBody`                    | function  | 是       |
| `index.ts`                                  | `buildRuntimeUserEntriesFromTurn`                        | function  | 是       |
| `index.ts`                                  | `buildProviderRequestMessages`                           | function  | 是       |
| `index.ts`                                  | `isTurnCancellationError`                                | function  | 是       |
| `index.ts`                                  | `normalizeStreamError`                                   | function  | 是       |
| `index.ts`                                  | `formatWorkspaceRewindNoticeBody`                        | function  | 是       |
| `index.ts`                                  | `selectCompactEntriesForInitialPromptTooLong`            | function  | 是       |
| `index.ts`                                  | `isModelContextExceededError`                            | function  | 是       |
| `index.ts`                                  | `formatWorkspaceForkNoticeBody`                          | function  | 是       |
| `index.ts`                                  | `formatWorkspaceForkAtMessageNoticeBody`                 | function  | 是       |
| `index.ts`                                  | `isModelMediaTooLargeError`                              | function  | 是       |
| `index.ts`                                  | `logMediaBudgetProjection`                               | function  | 是       |
| `index.ts`                                  | `formatConversationForkNoticeBody`                       | function  | 是       |
| `index.ts`                                  | `formatUnavailableRewindResponse`                        | function  | 是       |
| `index.ts`                                  | `truncateCompactSummaryRequestEntriesAfterPromptTooLong` | function  | 是       |
| `media-attachment-path.ts`                  | `projectMessagesWithMediaAttachmentPaths`                | function  | 是       |
| `media-budget.ts`                           | `MediaBudgetProjection`                                  | interface | 否       |
| `media-budget.ts`                           | `projectMessagesForModelMediaPolicy`                     | function  | 是       |
| `media-budget.ts`                           | `projectMessagesForMediaBudget`                          | function  | 是       |
| `media-budget.ts`                           | `logMediaBudgetProjection`                               | function  | 是       |
| `media-capability.ts`                       | `MediaCapabilityProjection`                              | interface | 否       |
| `media-capability.ts`                       | `projectMessagesForInputFormat`                          | function  | 是       |
| `media-capability.ts`                       | `logMediaCapabilityProjection`                           | function  | 是       |
| `media-observability.ts`                    | `logResolvedTurnAttachments`                             | function  | 是       |
| `media-observability.ts`                    | `logModelRequestMediaSummary`                            | function  | 是       |
| `model-anomaly.ts`                          | `detectRepeatedToolCallWarnings`                         | function  | 是       |
| `model-anomaly.ts`                          | `detectToolCallBudgetWarning`                            | function  | 是       |
| `model-anomaly.ts`                          | `buildRepeatedToolCallReminderBody`                      | function  | 是       |
| `model-anomaly.ts`                          | `buildToolCallBudgetReminderBody`                        | function  | 是       |
| `model-errors.ts`                           | `readRawFinishReason`                                    | function  | 是       |
| `model-errors.ts`                           | `isContextExceededFinishReason`                          | function  | 是       |
| `model-errors.ts`                           | `createModelContextExceededFinishError`                  | function  | 是       |
| `model-errors.ts`                           | `createCompactRapidRefillError`                          | function  | 是       |
| `model-errors.ts`                           | `isSuspiciousEmptyModelResult`                           | function  | 是       |
| `model-errors.ts`                           | `buildSuspiciousEmptyDiagnostics`                        | function  | 是       |
| `model-errors.ts`                           | `finalizeSuspiciousEmptyModelResult`                     | function  | 是       |
| `model-errors.ts`                           | `normalizeStreamError`                                   | function  | 是       |
| `model-errors.ts`                           | `isModelContextExceededError`                            | function  | 是       |
| `model-errors.ts`                           | `isModelMediaTooLargeError`                              | function  | 是       |
| `model-tool-call-validation.ts`             | `normalizeModelToolCallsForRuntime`                      | function  | 是       |
| `model-tool-call-validation.ts`             | `requireRuntimeToolCallName`                             | function  | 是       |
| `official-cua-media.ts`                     | `officialCuaImageRefIndexesForUnavailableMedia`          | function  | 是       |
| `official-cua-media.ts`                     | `officialCuaRasterUnavailableBlock`                      | function  | 是       |
| `permission-broker.ts`                      | `isResolvablePermissionBroker`                           | function  | 是       |
| `permission-broker.ts`                      | `isInspectablePermissionBroker`                          | function  | 是       |
| `permission-grant-resume.ts`                | `restorePermissionGrantMarker`                           | function  | 是       |
| `persisted-remote-session-path-repair.ts`   | `repairPersistedRemoteSessionPaths`                      | function  | 是       |
| `plan-file-continuity.ts`                   | `writeApprovedPlanFile`                                  | function  | 是       |
| `plan-file-continuity.ts`                   | `readApprovedPlanFileReferenceEntry`                     | function  | 是       |
| `project-memory-agent.ts`                   | `ProjectMemoryAgentContext`                              | interface | 否       |
| `project-memory-agent.ts`                   | `captureProjectMemoryAgentContext`                       | function  | 是       |
| `project-memory-agent.ts`                   | `buildProjectMemoryAgentProviderMessages`                | function  | 是       |
| `project-memory-agent.ts`                   | `createProjectMemoryAgentToolExecutor`                   | function  | 是       |
| `project-memory-extraction.ts`              | `ProjectMemoryExtractionScheduler`                       | type      | 否       |
| `project-memory-extraction.ts`              | `isProjectMemoryEnabled`                                 | function  | 是       |
| `project-memory-extraction.ts`              | `scheduleProjectMemoryExtraction`                        | function  | 是       |
| `project-memory-extraction.ts`              | `drainMemoryExtractions`                                 | function  | 是       |
| `project-memory.ts`                         | `resolveEnabledProjectMemoryRoot`                        | function  | 是       |
| `project.ts`                                | `titleFromInput`                                         | function  | 是       |
| `project.ts`                                | `slugify`                                                | function  | 是       |
| `project.ts`                                | `projectIdFromDirectory`                                 | function  | 是       |
| `provider-business-error.ts`                | `findProviderBusinessFailureInMetadata`                  | function  | 是       |
| `provider-business-error.ts`                | `createCoreErrorFromProviderBusinessLike`                | function  | 是       |
| `provider-entry-origins.ts`                 | `ProviderEntryOrigins`                                   | class     | 是       |
| `provider-entry-origins.ts`                 | `isPresentedInput`                                       | function  | 是       |
| `provider-entry-origins.ts`                 | `projectIncomingMessageEntries`                          | function  | 是       |
| `provider-mid-conversation-system.ts`       | `ProjectedRuntimeMessageEntry`                           | type      | 否       |
| `provider-mid-conversation-system.ts`       | `projectMidConversationSystemEntries`                    | function  | 是       |
| `provider-mid-conversation-system.ts`       | `moveLegacySystemRemindersAfterToolResultRun`            | function  | 是       |
| `provider-mid-conversation-system.ts`       | `isToolResultUserMessage`                                | function  | 是       |
| `provider-request-messages.ts`              | `ProviderRequestMessageProjectionResult`                 | interface | 否       |
| `provider-request-messages.ts`              | `buildProviderRequestMessages`                           | function  | 是       |
| `rewind.ts`                                 | `WORKSPACE_CHECKPOINT_CONTENT_TYPE`                      | const     | 是       |
| `rewind.ts`                                 | `getFileMutationCheckpointCandidate`                     | function  | 是       |
| `rewind.ts`                                 | `stringifyWorkspaceCheckpointArtifact`                   | function  | 是       |
| `rewind.ts`                                 | `selectCheckpointForRewind`                              | function  | 是       |
| `rewind.ts`                                 | `selectCheckpointForMessage`                             | function  | 是       |
| `rewind.ts`                                 | `selectCheckpointsForMessages`                           | function  | 是       |
| `rewind.ts`                                 | `activeSuffixMessageIdsForRewind`                        | function  | 是       |
| `rewind.ts`                                 | `previewTextFromMessage`                                 | function  | 是       |
| `rewind.ts`                                 | `buildMessageRewindEvaluationItems`                      | function  | 是       |
| `rewind.ts`                                 | `buildRewindEvaluationItems`                             | function  | 是       |
| `rewind.ts`                                 | `formatWorkspaceRewindNoticeBody`                        | function  | 是       |
| `rewind.ts`                                 | `formatWorkspaceForkNoticeBody`                          | function  | 是       |
| `rewind.ts`                                 | `formatWorkspaceForkAtMessageNoticeBody`                 | function  | 是       |
| `rewind.ts`                                 | `formatConversationForkNoticeBody`                       | function  | 是       |
| `rewind.ts`                                 | `formatUnavailableRewindResponse`                        | function  | 是       |
| `runtime-provider-request-messages.ts`      | `buildRuntimeProviderRequestMessages`                    | function  | 是       |
| `runtime-reminders.ts`                      | `buildDateChangeReminderBody`                            | function  | 是       |
| `runtime-reminders.ts`                      | `runtimeMetadataForSyntheticUserMessageSource`           | function  | 是       |
| `runtime-reminders.ts`                      | `shouldBuildTodoReminder`                                | function  | 是       |
| `runtime-reminders.ts`                      | `buildTodoReminderBody`                                  | function  | 是       |
| `runtime-reminders.ts`                      | `buildRuntimeModeReminderBody`                           | function  | 是       |
| `runtime-reminders.ts`                      | `buildPlanModeExitReminderBody`                          | function  | 是       |
| `runtime-reminders.ts`                      | `buildRuntimeOutputStyleReminderBody`                    | function  | 是       |
| `runtime-tools.ts`                          | `initializeRuntimeTooling`                               | function  | 是       |
| `steering.ts`                               | `MAX_TURN_STEER_INPUT_BYTES`                             | const     | 是       |
| `steering.ts`                               | `measureUtf8Bytes`                                       | function  | 是       |
| `steering.ts`                               | `previewInput`                                           | function  | 是       |
| `steering.ts`                               | `findLatestUserMessageFromEnd`                           | function  | 是       |
| `steering.ts`                               | `cloneMessageForFork`                                    | function  | 是       |
| `steering.ts`                               | `clonePartForFork`                                       | function  | 是       |
| `streaming-tool-ledger.ts`                  | `createStreamingToolAttemptId`                           | function  | 是       |
| `streaming-tool-ledger.ts`                  | `createStreamRecoveryAnchorId`                           | function  | 是       |
| `streaming-tool-ledger.ts`                  | `emitStreamingToolLedgerUpdate`                          | function  | 是       |
| `streaming-tool-ledger.ts`                  | `emitStreamRecoveryAnchor`                               | function  | 是       |
| `subagent-interaction-broker.ts`            | `createSubagentInteractionBroker`                        | function  | 是       |
| `subagent-selection.ts`                     | `resolveSubagentSelection`                               | function  | 是       |
| `tool-allowlist.ts`                         | `resolveRuntimeDisallowedTools`                          | function  | 是       |
| `tool-allowlist.ts`                         | `resolveRuntimeDynamicWorkflowToolsIncluded`             | function  | 是       |
| `tool-allowlist.ts`                         | `resolveBuiltInToolAllowlist`                            | function  | 是       |
| `tool-result-media-persistence.ts`          | `persistToolResultMediaAttachments`                      | function  | 是       |
| `tool-result.ts`                            | `emptyTokenUsageInfo`                                    | function  | 是       |
| `tool-result.ts`                            | `toTokenUsageInfo`                                       | function  | 是       |
| `tool-result.ts`                            | `toRecordInput`                                          | function  | 是       |
| `tool-result.ts`                            | `stringifyToolResultOutput`                              | function  | 是       |
| `tool-result.ts`                            | `modelContentForToolResult`                              | function  | 是       |
| `tool-result.ts`                            | `isErrorForToolResult`                                   | function  | 是       |
| `tool-result.ts`                            | `stringifyForEstimation`                                 | function  | 是       |
| `tool-result.ts`                            | `parseMcpToolName`                                       | function  | 是       |
| `tool-result.ts`                            | `findParallelGroupIndex`                                 | function  | 是       |
| `turn-errors.ts`                            | `projectExecutionErrorPayload`                           | function  | 是       |
| `turn-errors.ts`                            | `createExternalTurnFaultError`                           | function  | 是       |
| `turn-errors.ts`                            | `createTurnAbortScope`                                   | function  | 是       |
| `turn-errors.ts`                            | `throwIfTurnAborted`                                     | function  | 是       |
| `turn-errors.ts`                            | `createTurnFailureError`                                 | function  | 是       |
| `turn-errors.ts`                            | `createTurnCancelledError`                               | function  | 是       |
| `turn-errors.ts`                            | `appendTurnOutcomeEvent`                                 | function  | 是       |
| `turn-errors.ts`                            | `isTurnCancellationError`                                | function  | 是       |
| `turn-file-changes.ts`                      | `recordTurnFileChange`                                   | function  | 是       |
| `turn-file-changes.ts`                      | `buildTurnFileChangeSummary`                             | function  | 是       |

> 模块路径列相对 `apps/cli/packages/core/src/runtime/helpers/`；`index.ts` 行为桶再导出（扁平化后的名字）。
