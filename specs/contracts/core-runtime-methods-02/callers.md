# core-runtime-methods-02 调用方（v1）

数据来源：`scripts/dep-refs.mjs` 同源的静态引用分析（ts-morph），对 24 个继承文件的 **98 个导出**
逐个查询工作区（`packages/*`、`apps/*`、`apps/cli/packages/*`、`harness/**`）内的全部引用点。
静态分析不覆盖 `import()` 动态导入与字符串路径引用；导出签名与种类另见 `interface.md`。

## 概览

| 指标             | 数值 |
| ---------------- | ---- |
| 继承文件         | 24   |
| 导出合计         | 98   |
| 有包外引用的导出 | 36   |
| 包外引用点       | 136  |
| 仅包内使用的导出 | 62   |

## 跨包/跨目录边界（按引用点计）

| 引用方区域               | 引用点 |
| ------------------------ | ------ |
| `apps/cli/packages/core` | 136    |

> 本包 24 个文件内部的相互引用不计入（包内自洽）；同目录的范围外文件（`message-persistence*`/`steering*` 等）
> 也是调用方并计入引用点，它们属后续分包；`apps/cli/packages/core` 其余装配文件同理。
> 这些调用方的接口默认不可变。

## 逐模块明细

### `compact.ts`（4 个导出）

| 导出                                  | 种类     | 包外引用点 | 引用位置                                                                                                           |
| ------------------------------------- | -------- | ---------- | ------------------------------------------------------------------------------------------------------------------ |
| `executeManualCompact`                | function | 2          | apps/cli/packages/core/src/runtime/methods/index.ts:130<br>apps/cli/packages/core/src/runtime/methods/index.ts:332 |
| `autoCompactIfNeeded`                 | function | 2          | apps/cli/packages/core/src/runtime/methods/index.ts:131<br>apps/cli/packages/core/src/runtime/methods/index.ts:333 |
| `reactiveCompactAfterContextExceeded` | function | 2          | apps/cli/packages/core/src/runtime/methods/index.ts:133<br>apps/cli/packages/core/src/runtime/methods/index.ts:335 |

### `compact-log-context.ts`（1 个导出）

包外无引用（仅包内使用）。

### `context-history-entries.ts`（1 个导出）

| 导出                         | 种类     | 包外引用点 | 引用位置                                                                                                              |
| ---------------------------- | -------- | ---------- | --------------------------------------------------------------------------------------------------------------------- |
| `buildContextHistoryEntries` | function | 2          | apps/cli/packages/core/src/runtime/methods/context.ts:25<br>apps/cli/packages/core/src/runtime/methods/context.ts:280 |

### `context-refresh.ts`（1 个导出）

| 导出                   | 种类     | 包外引用点 | 引用位置                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| ---------------------- | -------- | ---------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `rebuildContextPrefix` | function | 9          | apps/cli/packages/core/src/runtime/methods/config.ts:31<br>apps/cli/packages/core/src/runtime/methods/config.ts:62<br>apps/cli/packages/core/src/runtime/methods/config.ts:66<br>apps/cli/packages/core/src/runtime/methods/rewind-conversation-state.ts:21<br>apps/cli/packages/core/src/runtime/methods/rewind-conversation-state.ts:166<br>apps/cli/packages/core/src/runtime/methods/session-shell-environment.ts:11<br>apps/cli/packages/core/src/runtime/methods/session-shell-environment.ts:170<br>apps/cli/packages/core/src/runtime/methods/turn-command-operation.ts:19<br>apps/cli/packages/core/src/runtime/methods/turn-command-operation.ts:87 |

### `tool-part-metadata.ts`（2 个导出）

| 导出                  | 种类     | 包外引用点 | 引用位置                                                                                                                                                  |
| --------------------- | -------- | ---------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `mcpToolPartMetadata` | function | 2          | apps/cli/packages/core/src/runtime/methods/support/during-stream-run.ts:22<br>apps/cli/packages/core/src/runtime/methods/support/during-stream-run.ts:138 |

### `tool-part-persistence.ts`（2 个导出）

| 导出                     | 种类     | 包外引用点 | 引用位置                                                                                                                                                  |
| ------------------------ | -------- | ---------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `persistPendingToolPart` | function | 2          | apps/cli/packages/core/src/runtime/methods/support/during-stream-run.ts:23<br>apps/cli/packages/core/src/runtime/methods/support/during-stream-run.ts:155 |

### `turn-guide-drain.ts`（1 个导出）

包外无引用（仅包内使用）。

### `turn-loop-state.ts`（20 个导出）

| 导出                                 | 种类      | 包外引用点 | 引用位置                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| ------------------------------------ | --------- | ---------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `RAPID_REFILL_TOOL_TURN_THRESHOLD`   | const     | 2          | apps/cli/packages/core/src/runtime/methods/turn-loop.ts:32<br>apps/cli/packages/core/src/runtime/methods/turn-loop.ts:92                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| `MAX_CONSECUTIVE_RAPID_REFILLS`      | const     | 2          | apps/cli/packages/core/src/runtime/methods/turn-loop.ts:30<br>apps/cli/packages/core/src/runtime/methods/turn-loop.ts:91                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| `AUTOMATION_MUTATION_TOOL_NAMES`     | const     | 2          | apps/cli/packages/core/src/runtime/methods/turn-loop.ts:26<br>apps/cli/packages/core/src/runtime/methods/turn-loop.ts:110                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| `OFF_PEAK_MUTATION_TOOL_NAMES`       | const     | 2          | apps/cli/packages/core/src/runtime/methods/turn-loop.ts:31<br>apps/cli/packages/core/src/runtime/methods/turn-loop.ts:113                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| `CompactAttemptOutcome`              | type      | 6          | apps/cli/packages/core/src/runtime/internal-turn-methods.ts:77<br>apps/cli/packages/core/src/runtime/internal-turn-methods.ts:197<br>apps/cli/packages/core/src/runtime/internal-turn-methods.ts:222<br>apps/cli/packages/core/src/runtime/methods/compact-active.ts:49<br>apps/cli/packages/core/src/runtime/methods/compact-active.ts:100<br>apps/cli/packages/core/src/runtime/methods/compact-active.ts:167                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| `AutoCompactOutcome`                 | type      | 2          | apps/cli/packages/core/src/runtime/internal-turn-methods.ts:76<br>apps/cli/packages/core/src/runtime/internal-turn-methods.ts:179                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| `AutoCompactLoopContext`             | interface | 2          | apps/cli/packages/core/src/runtime/internal-turn-methods.ts:75<br>apps/cli/packages/core/src/runtime/internal-turn-methods.ts:178                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| `ReactiveCompactLoopContext`         | interface | 2          | apps/cli/packages/core/src/runtime/internal-turn-methods.ts:78<br>apps/cli/packages/core/src/runtime/internal-turn-methods.ts:196                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| `TurnRequestState`                   | interface | 4          | apps/cli/packages/core/src/runtime/internal-turn-methods.ts:79<br>apps/cli/packages/core/src/runtime/internal-turn-methods.ts:188<br>apps/cli/packages/core/src/runtime/methods/microcompact.ts:18<br>apps/cli/packages/core/src/runtime/methods/microcompact.ts:33                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| `RegularTurnLoopState`               | interface | 30         | apps/cli/packages/core/src/runtime/methods/browser-turn-screenshot.ts:9<br>apps/cli/packages/core/src/runtime/methods/browser-turn-screenshot.ts:26<br>apps/cli/packages/core/src/runtime/methods/browser-turn-screenshot.ts:37<br>apps/cli/packages/core/src/runtime/methods/streaming-recovery.ts:7<br>apps/cli/packages/core/src/runtime/methods/streaming-recovery.ts:35<br>apps/cli/packages/core/src/runtime/methods/streaming-recovery.ts:39<br>apps/cli/packages/core/src/runtime/methods/streaming-recovery.ts:43<br>apps/cli/packages/core/src/runtime/methods/streaming-recovery.ts:58<br>apps/cli/packages/core/src/runtime/methods/streaming-recovery.ts:66<br>apps/cli/packages/core/src/runtime/methods/streaming-recovery.ts:76<br>apps/cli/packages/core/src/runtime/methods/streaming-recovery.ts:103<br>apps/cli/packages/core/src/runtime/methods/streaming-tool-coordinator.ts:7<br>…另 18 处 |
| `isAutomationMutationRestrictedTurn` | function  | 4          | apps/cli/packages/core/src/runtime/methods/support/during-stream-run.ts:25<br>apps/cli/packages/core/src/runtime/methods/support/during-stream-run.ts:118<br>apps/cli/packages/core/src/runtime/methods/turn-loop.ts:28<br>apps/cli/packages/core/src/runtime/methods/turn-loop.ts:109                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| `isOffPeakCreateRestrictedTurn`      | function  | 4          | apps/cli/packages/core/src/runtime/methods/support/during-stream-run.ts:26<br>apps/cli/packages/core/src/runtime/methods/support/during-stream-run.ts:119<br>apps/cli/packages/core/src/runtime/methods/turn-loop.ts:29<br>apps/cli/packages/core/src/runtime/methods/turn-loop.ts:112                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| `evaluateRapidRefill`                | function  | 2          | apps/cli/packages/core/src/runtime/methods/turn-loop.ts:27<br>apps/cli/packages/core/src/runtime/methods/turn-loop.ts:74                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| `recordCompactSuccess`               | function  | 2          | apps/cli/packages/core/src/runtime/methods/turn-loop.ts:34<br>apps/cli/packages/core/src/runtime/methods/turn-loop.ts:97                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| `recordModelHistoryRound`            | function  | 4          | apps/cli/packages/core/src/runtime/methods/support/recover-step.ts:10<br>apps/cli/packages/core/src/runtime/methods/support/recover-step.ts:82<br>apps/cli/packages/core/src/runtime/methods/support/recovery-orchestration.ts:11<br>apps/cli/packages/core/src/runtime/methods/support/recovery-orchestration.ts:134                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| `recordCompactHistoryRound`          | function  | 2          | apps/cli/packages/core/src/runtime/methods/turn-loop.ts:33<br>apps/cli/packages/core/src/runtime/methods/turn-loop.ts:98                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |

### `turn-model.ts`（4 个导出）

| 导出                            | 种类     | 包外引用点 | 引用位置                                                                                                                                                                                                                        |
| ------------------------------- | -------- | ---------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `createTurnModel`               | function | 3          | apps/cli/packages/core/src/runtime/methods/turn-command-operation.ts:18<br>apps/cli/packages/core/src/runtime/methods/turn-command-operation.ts:62<br>apps/cli/packages/core/src/runtime/methods/turn-command-operation.ts:65   |
| `applySubmissionExecutionState` | function | 3          | apps/cli/packages/core/src/runtime/methods/turn-command-operation.ts:18<br>apps/cli/packages/core/src/runtime/methods/turn-command-operation.ts:104<br>apps/cli/packages/core/src/runtime/methods/turn-command-operation.ts:141 |
| `persistRuntimeModelSelection`  | function | 2          | apps/cli/packages/core/src/runtime/methods/support/session-persist.ts:11<br>apps/cli/packages/core/src/runtime/methods/support/session-persist.ts:123                                                                           |

### `turn-model-step.ts`（1 个导出）

| 导出                     | 种类     | 包外引用点 | 引用位置                                                                                                                  |
| ------------------------ | -------- | ---------- | ------------------------------------------------------------------------------------------------------------------------- |
| `runModelBackedTurnStep` | function | 2          | apps/cli/packages/core/src/runtime/methods/turn-loop.ts:24<br>apps/cli/packages/core/src/runtime/methods/turn-loop.ts:203 |

### `turn-model-step-fields.ts`（22 个导出）

包外无引用（仅包内使用）。

### `turn-model-step-operation.ts`（1 个导出）

包外无引用（仅包内使用）。

### `turn-model-step-records.ts`（5 个导出）

包外无引用（仅包内使用）。

### `turn-model-step-recovery.ts`（1 个导出）

包外无引用（仅包内使用）。

### `turn-model-step-usage.ts`（5 个导出）

| 导出                                    | 种类     | 包外引用点 | 引用位置                                                                                                                                                                                                                                                                         |
| --------------------------------------- | -------- | ---------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `mainTurnCacheHitAggregateFromMessages` | function | 4          | apps/cli/packages/core/src/runtime/methods/resume.ts:41<br>apps/cli/packages/core/src/runtime/methods/resume.ts:228<br>apps/cli/packages/core/src/runtime/methods/rewind-conversation-state.ts:22<br>apps/cli/packages/core/src/runtime/methods/rewind-conversation-state.ts:180 |

### `turn-nested-model-usage.ts`（1 个导出）

包外无引用（仅包内使用）。

### `turn-output-token-continuation.ts`（12 个导出）

| 导出                                   | 种类     | 包外引用点 | 引用位置                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| -------------------------------------- | -------- | ---------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `isOutputTokenLimitFinishReason`       | function | 2          | apps/cli/packages/core/src/runtime/methods/support/stream-inspection.ts:13<br>apps/cli/packages/core/src/runtime/methods/support/stream-inspection.ts:47                                                                                                                                                                                                                                                                                                                                                                                   |
| `filterOutputTokenContinuationEntries` | function | 8          | apps/cli/packages/core/src/runtime/methods/compact-active.ts:68<br>apps/cli/packages/core/src/runtime/methods/compact-active.ts:314<br>apps/cli/packages/core/src/runtime/methods/compact-active.ts:522<br>apps/cli/packages/core/src/runtime/methods/compact-active.ts:616<br>apps/cli/packages/core/src/runtime/methods/microcompact.ts:20<br>apps/cli/packages/core/src/runtime/methods/microcompact.ts:73<br>apps/cli/packages/core/src/runtime/methods/turn-loop.ts:40<br>apps/cli/packages/core/src/runtime/methods/turn-loop.ts:179 |
| `preserveCanonicalContextPrefix`       | function | 4          | apps/cli/packages/core/src/runtime/methods/compact-active.ts:69<br>apps/cli/packages/core/src/runtime/methods/compact-active.ts:619<br>apps/cli/packages/core/src/runtime/methods/microcompact.ts:21<br>apps/cli/packages/core/src/runtime/methods/microcompact.ts:75                                                                                                                                                                                                                                                                      |
| `appendTurnRequestEntries`             | function | 2          | apps/cli/packages/core/src/runtime/methods/turn-loop.ts:38<br>apps/cli/packages/core/src/runtime/methods/turn-loop.ts:58                                                                                                                                                                                                                                                                                                                                                                                                                   |
| `commitTurnRequestEntries`             | function | 7          | apps/cli/packages/core/src/runtime/methods/support/recover-step.ts:11<br>apps/cli/packages/core/src/runtime/methods/support/recover-step.ts:84<br>apps/cli/packages/core/src/runtime/methods/turn-loop.ts:39<br>apps/cli/packages/core/src/runtime/methods/turn-loop.ts:125<br>apps/cli/packages/core/src/runtime/methods/turn-loop.ts:137<br>apps/cli/packages/core/src/runtime/methods/turn-loop.ts:149<br>apps/cli/packages/core/src/runtime/methods/turn-loop.ts:167                                                                   |
| `hasAssistantReasoningContent`         | function | 2          | apps/cli/packages/core/src/runtime/methods/support/cancel-snapshot.ts:8<br>apps/cli/packages/core/src/runtime/methods/support/cancel-snapshot.ts:48                                                                                                                                                                                                                                                                                                                                                                                        |
| `finishOutputTokenRecovery`            | function | 2          | apps/cli/packages/core/src/runtime/methods/turn-command-operation.ts:25<br>apps/cli/packages/core/src/runtime/methods/turn-command-operation.ts:268                                                                                                                                                                                                                                                                                                                                                                                        |

### `turn-step-finish.ts`（1 个导出）

包外无引用（仅包内使用）。

### `turn-stop.ts`（4 个导出）

包外无引用（仅包内使用）。

### `turn-tool-batch-follow-up.ts`（1 个导出）

包外无引用（仅包内使用）。

### `turn-tool-batch-parts.ts`（5 个导出）

包外无引用（仅包内使用）。

### `turn-tool-usage.ts`（1 个导出）

包外无引用（仅包内使用）。

### `turn-tool-warnings.ts`（1 个导出）

包外无引用（仅包内使用）。

### `turn-tools.ts`（1 个导出）

| 导出                           | 种类     | 包外引用点 | 引用位置                                                                                                                                       |
| ------------------------------ | -------- | ---------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| `executeToolCallsForModelStep` | function | 2          | apps/cli/packages/core/src/runtime/methods/support/recover-step.ts:12<br>apps/cli/packages/core/src/runtime/methods/support/recover-step.ts:92 |

## 仅包内使用的导出（包外无静态引用）

这些导出构成 `methods` 内部协作面；通过模块路径仍可被后续包导入，接口默认不可变：

- compact.ts :: estimateCurrentModelInputTokens
- compact-log-context.ts :: autoCompactDecisionLogContext
- tool-part-metadata.ts :: completedToolPartMetadata
- tool-part-persistence.ts :: projectToolNameForNonEmptyBoundary
- turn-guide-drain.ts :: drainInlineGuideForNextRequest
- turn-loop-state.ts :: PendingStreamRecoveryRequest
- turn-loop-state.ts :: CompactLoopTracking
- turn-loop-state.ts :: RapidRefillDecision
- turn-loop-state.ts :: recordCompletedToolBatch
- turn-model.ts :: sameModelSelection
- turn-model-step-fields.ts :: ModelStepInputs
- turn-model-step-fields.ts :: buildTurnModelRequest
- turn-model-step-fields.ts :: stepStartPart
- turn-model-step-fields.ts :: reasoningPart
- turn-model-step-fields.ts :: textPart
- turn-model-step-fields.ts :: modelCompletePayload
- turn-model-step-fields.ts :: logModelCompletion
- turn-model-step-fields.ts :: logStartPlanRetry
- turn-model-step-fields.ts :: outputLimitCarrier
- turn-model-step-fields.ts :: automationLimitResponse
- turn-model-step-fields.ts :: modelStepTrace
- turn-model-step-fields.ts :: steeringFields
- turn-model-step-fields.ts :: modelRequestPayload
- turn-model-step-fields.ts :: outputLimitError
- turn-model-step-fields.ts :: UsageFields
- turn-model-step-fields.ts :: failedUsage
- turn-model-step-fields.ts :: completedUsage
- turn-model-step-fields.ts :: suspiciousResultFields
- turn-model-step-fields.ts :: warnAutomationTools
- turn-model-step-fields.ts :: stopFields
- turn-model-step-fields.ts :: completedAssistantFields
- turn-model-step-fields.ts :: recoveryFields
- turn-model-step-operation.ts :: performModelStep
- turn-model-step-records.ts :: logTurnModelDiagnostics
- turn-model-step-records.ts :: logTurnModelSuspiciousEmpty
- turn-model-step-records.ts :: prepareFailureFacts
- turn-model-step-records.ts :: persistedFailure
- turn-model-step-records.ts :: commitCancelledAssistantSnapshot
- turn-model-step-recovery.ts :: recoverTurnModelContext
- turn-model-step-usage.ts :: recordMainTurnModelUsage
- turn-model-step-usage.ts :: querySourceForTask
- turn-model-step-usage.ts :: findLatestCommittedAssistantUsage
- turn-model-step-usage.ts :: recordMainTurnCacheHitUsage
- turn-nested-model-usage.ts :: emitNestedModelUsageEvents
- turn-output-token-continuation.ts :: OUTPUT_TOKEN_LIMIT_ERROR_MESSAGE
- turn-output-token-continuation.ts :: classifyOutputTokenContinuation
- turn-output-token-continuation.ts :: commitAssistantToTurnRequest
- turn-output-token-continuation.ts :: appendOutputTokenContinuation
- turn-output-token-continuation.ts :: completeOutputTokenRecovery
- turn-step-finish.ts :: persistToolModelStepFinish
- turn-stop.ts :: captureAssistantPersistenceAnchor
- turn-stop.ts :: persistCompletedAssistantStep
- turn-stop.ts :: persistOutputTokenLimitErrorCarrier
- turn-stop.ts :: finishModelStepWithoutToolCalls
- turn-tool-batch-follow-up.ts :: steerToolBatchFollowUp
- turn-tool-batch-parts.ts :: ToolBatchPartFacts
- turn-tool-batch-parts.ts :: runningToolBatchState
- turn-tool-batch-parts.ts :: completedToolBatchState
- turn-tool-batch-parts.ts :: failedToolBatchState
- turn-tool-batch-parts.ts :: toolBatchResultDiagnostic
- turn-tool-usage.ts :: recordToolUsageFromResult
- turn-tool-warnings.ts :: handleToolCallAnomalyWarnings

## 只被再导出的导出（无直接调用点）

这些名字没有独立的调用点，但经再导出（含 `methods/index.ts` 桶；桶不入包）可达，属于必须保持的导出面：
