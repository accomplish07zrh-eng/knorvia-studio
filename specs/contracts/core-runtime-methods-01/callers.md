# core-runtime-methods-01 调用方（v1）

数据来源：`scripts/dep-refs.mjs` 同源的静态引用分析（ts-morph），对 21 个继承文件的 **49 个导出**
逐个查询工作区（`packages/*`、`apps/*`、`apps/cli/packages/*`、`harness/**`）内的全部引用点。
静态分析不覆盖 `import()` 动态导入与字符串路径引用；导出签名与种类另见 `interface.md`。

## 概览

| 指标 | 数值 |
| --- | --- |
| 继承文件 | 21 |
| 导出合计 | 49 |
| 有包外引用的导出 | 27 |
| 包外引用点 | 110 |
| 仅包内使用的导出 | 22 |

## 跨包/跨目录边界（按引用点计）

| 引用方区域 | 引用点 |
| --- | --- |
| `apps/cli/packages/core` | 110 |

> 本包 21 个文件内部的相互引用不计入（包内自洽）；同目录的范围外文件（`turn-model-step-*`/`turn-model.ts` 等）
> 也是调用方并计入引用点，它们属后续分包；`apps/cli/packages/core` 其余装配文件同理。
> 这些调用方的接口默认不可变。

## 逐模块明细

### `model.ts`（1 个导出）

| 导出 | 种类 | 包外引用点 | 引用位置 |
| --- | --- | --- | --- |
| `runModelTextRequest` | function | 2 | apps/cli/packages/core/src/runtime/methods/index.ts:89<br>apps/cli/packages/core/src/runtime/methods/index.ts:291 |

### `model-request-session-type.ts`（2 个导出）

| 导出 | 种类 | 包外引用点 | 引用位置 |
| --- | --- | --- | --- |
| `resolveModelRequestSessionTypeFromTaskType` | function | 4 | apps/cli/packages/core/src/runtime/methods/compact-active.ts:20<br>apps/cli/packages/core/src/runtime/methods/compact-active.ts:389<br>apps/cli/packages/core/src/runtime/methods/target-completion-verification.ts:24<br>apps/cli/packages/core/src/runtime/methods/target-completion-verification.ts:323 |

### `model-request-stream-state.ts`（2 个导出）

包外无引用（仅包内使用）。

### `model-runtime-headers.ts`（1 个导出）

| 导出 | 种类 | 包外引用点 | 引用位置 |
| --- | --- | --- | --- |
| `createRefreshRuntimeHeadersBeforeModelAttempt` | function | 13 | apps/cli/packages/core/src/runtime/helpers/memory/memory-agent-context.ts:21<br>apps/cli/packages/core/src/runtime/helpers/memory/memory-agent-context.ts:65<br>apps/cli/packages/core/src/runtime/methods/compact-active.ts:64<br>apps/cli/packages/core/src/runtime/methods/compact-active.ts:404<br>apps/cli/packages/core/src/runtime/methods/target-completion-verification.ts:23<br>apps/cli/packages/core/src/runtime/methods/target-completion-verification.ts:329<br>apps/cli/packages/core/src/runtime/methods/title-generation-sidecar.ts:14<br>apps/cli/packages/core/src/runtime/methods/title-generation-sidecar.ts:147<br>apps/cli/packages/core/src/runtime/methods/turn-model.ts:11<br>apps/cli/packages/core/src/runtime/methods/turn-model.ts:28<br>apps/cli/packages/core/src/runtime/methods/workspace-generate-text.ts:18<br>apps/cli/packages/core/src/runtime/methods/workspace-generate-text.ts:119<br>…另 1 处 |

### `model-status.ts`（2 个导出）

| 导出 | 种类 | 包外引用点 | 引用位置 |
| --- | --- | --- | --- |
| `createModelStatusSink` | function | 2 | apps/cli/packages/core/src/runtime/methods/index.ts:91<br>apps/cli/packages/core/src/runtime/methods/index.ts:293 |
| `logModelNetworkStatus` | function | 2 | apps/cli/packages/core/src/runtime/methods/index.ts:92<br>apps/cli/packages/core/src/runtime/methods/index.ts:294 |

### `model-streaming-event-queue.ts`（1 个导出）

包外无引用（仅包内使用）。

### `model-streaming-event.ts`（1 个导出）

| 导出 | 种类 | 包外引用点 | 引用位置 |
| --- | --- | --- | --- |
| `emitModelStreamingEvent` | function | 2 | apps/cli/packages/core/src/runtime/methods/index.ts:90<br>apps/cli/packages/core/src/runtime/methods/index.ts:292 |

### `model-token-limits.ts`（3 个导出）

| 导出 | 种类 | 包外引用点 | 引用位置 |
| --- | --- | --- | --- |
| `resolveNormalRequestMaxOutputTokens` | function | 8 | apps/cli/packages/core/src/runtime/methods/compact-active.ts:63<br>apps/cli/packages/core/src/runtime/methods/compact-active.ts:719<br>apps/cli/packages/core/src/runtime/methods/compact.ts:35<br>apps/cli/packages/core/src/runtime/methods/compact.ts:196<br>apps/cli/packages/core/src/runtime/methods/microcompact.ts:17<br>apps/cli/packages/core/src/runtime/methods/microcompact.ts:42<br>apps/cli/packages/core/src/runtime/methods/turn-model-step-operation.ts:21<br>apps/cli/packages/core/src/runtime/methods/turn-model-step-operation.ts:96 |
| `resolveModelStepMaxOutputTokens` | function | 2 | apps/cli/packages/core/src/runtime/methods/turn-model-step-fields.ts:16<br>apps/cli/packages/core/src/runtime/methods/turn-model-step-fields.ts:59 |

### `reasoning-stream.ts`（1 个导出）

包外无引用（仅包内使用）。

### `runtime-model.ts`（2 个导出）

| 导出 | 种类 | 包外引用点 | 引用位置 |
| --- | --- | --- | --- |
| `createRuntimeModel` | function | 15 | apps/cli/packages/core/src/runtime/helpers/memory/memory-agent-context.ts:22<br>apps/cli/packages/core/src/runtime/helpers/memory/memory-agent-context.ts:85<br>apps/cli/packages/core/src/runtime/methods/compact-active.ts:66<br>apps/cli/packages/core/src/runtime/methods/compact-active.ts:176<br>apps/cli/packages/core/src/runtime/methods/steering-configuration.ts:9<br>apps/cli/packages/core/src/runtime/methods/steering-configuration.ts:57<br>apps/cli/packages/core/src/runtime/methods/target-completion-verification.ts:25<br>apps/cli/packages/core/src/runtime/methods/target-completion-verification.ts:124<br>apps/cli/packages/core/src/runtime/methods/title-generation-sidecar.ts:15<br>apps/cli/packages/core/src/runtime/methods/title-generation-sidecar.ts:103<br>apps/cli/packages/core/src/runtime/methods/turn-model.ts:12<br>apps/cli/packages/core/src/runtime/methods/turn-model.ts:23<br>…另 3 处 |
| `withModelInvocationContext` | function | 6 | apps/cli/packages/core/src/runtime/helpers/memory/memory-agent-context.ts:22<br>apps/cli/packages/core/src/runtime/helpers/memory/memory-agent-context.ts:61<br>apps/cli/packages/core/src/runtime/methods/turn-model.ts:12<br>apps/cli/packages/core/src/runtime/methods/turn-model.ts:27<br>apps/cli/packages/core/src/tool/executor/model-status-sink.ts:16<br>apps/cli/packages/core/src/tool/executor/model-status-sink.ts:67 |

### `cancelled-stream-persistence.ts`（1 个导出）

| 导出 | 种类 | 包外引用点 | 引用位置 |
| --- | --- | --- | --- |
| `persistCancelledStreamSnapshot` | function | 2 | apps/cli/packages/core/src/runtime/methods/turn-model-step-operation.ts:23<br>apps/cli/packages/core/src/runtime/methods/turn-model-step-operation.ts:195 |

### `streaming-recovery.ts`（10 个导出）

| 导出 | 种类 | 包外引用点 | 引用位置 |
| --- | --- | --- | --- |
| `beginStartPlanBusyAdmissionRetryAttempt` | function | 3 | apps/cli/packages/core/src/runtime/methods/turn-model-step-fields.ts:25<br>apps/cli/packages/core/src/runtime/methods/turn-model-step-fields.ts:165<br>apps/cli/packages/core/src/runtime/methods/turn-model-step-operation.ts:145 |
| `isStartPlanBusyStreamRecoveryFailure` | function | 3 | apps/cli/packages/core/src/runtime/methods/target-completion-verification.ts:26<br>apps/cli/packages/core/src/runtime/methods/target-completion-verification.ts:371<br>apps/cli/packages/core/src/runtime/methods/turn-model-step-operation.ts:186 |
| `createStartPlanBusyAutoRetryExhaustedError` | function | 1 | apps/cli/packages/core/src/runtime/methods/turn-model-step-operation.ts:188 |
| `getStartPlanBusyAdmissionRetryDelayMs` | function | 1 | apps/cli/packages/core/src/runtime/methods/turn-model-step-operation.ts:137 |
| `emitStreamRecoveryStarted` | function | 1 | apps/cli/packages/core/src/runtime/methods/turn-model-step-operation.ts:152 |
| `emitStreamRecoveryRetryEvents` | function | 1 | apps/cli/packages/core/src/runtime/methods/turn-model-step-operation.ts:166 |

### `streaming-tool-coordinator.ts`（1 个导出）

| 导出 | 种类 | 包外引用点 | 引用位置 |
| --- | --- | --- | --- |
| `createStreamingToolCoordinator` | function | 4 | apps/cli/packages/core/src/runtime/methods/turn-model-step-fields.ts:18<br>apps/cli/packages/core/src/runtime/methods/turn-model-step-fields.ts:45<br>apps/cli/packages/core/src/runtime/methods/turn-model-step-operation.ts:14<br>apps/cli/packages/core/src/runtime/methods/turn-model-step-operation.ts:76 |

### `streaming-tool-execution.ts`（1 个导出）

包外无引用（仅包内使用）。

### `streaming-tool-synthetic-result.ts`（2 个导出）

| 导出 | 种类 | 包外引用点 | 引用位置 |
| --- | --- | --- | --- |
| `emitSyntheticStreamedToolError` | function | 2 | apps/cli/packages/core/src/runtime/methods/turn-tools.ts:23<br>apps/cli/packages/core/src/runtime/methods/turn-tools.ts:107 |

### `events.ts`（5 个导出）

| 导出 | 种类 | 包外引用点 | 引用位置 |
| --- | --- | --- | --- |
| `ensureSessionPersisted` | function | 2 | apps/cli/packages/core/src/runtime/methods/index.ts:171<br>apps/cli/packages/core/src/runtime/methods/index.ts:370 |
| `createEvent` | function | 2 | apps/cli/packages/core/src/runtime/methods/index.ts:168<br>apps/cli/packages/core/src/runtime/methods/index.ts:367 |
| `isSessionPersisted` | function | 2 | apps/cli/packages/core/src/runtime/methods/index.ts:171<br>apps/cli/packages/core/src/runtime/methods/index.ts:371 |
| `appendEvent` | function | 2 | apps/cli/packages/core/src/runtime/methods/index.ts:169<br>apps/cli/packages/core/src/runtime/methods/index.ts:368 |
| `notifyEventSinks` | function | 2 | apps/cli/packages/core/src/runtime/methods/index.ts:170<br>apps/cli/packages/core/src/runtime/methods/index.ts:369 |

### `events-durable.ts`（1 个导出）

包外无引用（仅包内使用）。

### `events-session.ts`（1 个导出）

| 导出 | 种类 | 包外引用点 | 引用位置 |
| --- | --- | --- | --- |
| `ensureSessionPersisted` | function | 2 | apps/cli/packages/core/src/runtime/methods/index.ts:171<br>apps/cli/packages/core/src/runtime/methods/index.ts:370 |

### `events-summary.ts`（2 个导出）

包外无引用（仅包内使用）。

### `usage-observability.ts`（3 个导出）

| 导出 | 种类 | 包外引用点 | 引用位置 |
| --- | --- | --- | --- |
| `recordModelUsageFact` | function | 14 | apps/cli/packages/core/src/runtime/methods/compact-active.ts:65<br>apps/cli/packages/core/src/runtime/methods/compact-active.ts:418<br>apps/cli/packages/core/src/runtime/methods/compact-active.ts:457<br>apps/cli/packages/core/src/runtime/methods/target-completion-verification.ts:27<br>apps/cli/packages/core/src/runtime/methods/target-completion-verification.ts:213<br>apps/cli/packages/core/src/runtime/methods/target-completion-verification.ts:248<br>apps/cli/packages/core/src/runtime/methods/title-generation-sidecar.ts:16<br>apps/cli/packages/core/src/runtime/methods/title-generation-sidecar.ts:156<br>apps/cli/packages/core/src/runtime/methods/title-generation-sidecar.ts:183<br>apps/cli/packages/core/src/runtime/methods/turn-model-step-usage.ts:10<br>apps/cli/packages/core/src/runtime/methods/turn-model-step-usage.ts:29<br>apps/cli/packages/core/src/runtime/methods/workspace-generate-text.ts:20<br>…另 2 处 |
| `recordTurnUsageFact` | function | 10 | apps/cli/packages/core/src/runtime/methods/compact.ts:42<br>apps/cli/packages/core/src/runtime/methods/compact.ts:118<br>apps/cli/packages/core/src/runtime/methods/compact.ts:167<br>apps/cli/packages/core/src/runtime/methods/rewind.ts:33<br>apps/cli/packages/core/src/runtime/methods/rewind.ts:129<br>apps/cli/packages/core/src/runtime/methods/rewind.ts:160<br>apps/cli/packages/core/src/runtime/methods/turn-command-operation.ts:26<br>apps/cli/packages/core/src/runtime/methods/turn-command-operation.ts:183<br>apps/cli/packages/core/src/runtime/methods/turn-command-operation.ts:291<br>apps/cli/packages/core/src/runtime/methods/turn-command-operation.ts:371 |

### `usage-observability-projection.ts`（6 个导出）

包外无引用（仅包内使用）。

## 仅包内使用的导出（包外无静态引用）

这些导出构成 `methods` 内部协作面；通过模块路径仍可被后续包导入，接口默认不可变：

- model-request-session-type.ts :: resolveModelRetryBudgetFromTaskType
- model-request-stream-state.ts :: createModelRequestStreamState
- model-request-stream-state.ts :: inspectModelRequestStreamResult
- model-streaming-event-queue.ts :: createModelStreamingEventQueue
- model-token-limits.ts :: modelRequestTokenLimitLogContext
- reasoning-stream.ts :: getOrCreateReasoningBlock
- streaming-recovery.ts :: START_PLAN_BUSY_AUTO_RETRY_EXHAUSTED_MESSAGE
- streaming-recovery.ts :: hasStreamRecoveryBudget
- streaming-recovery.ts :: beginStreamRecoveryAttempt
- streaming-recovery.ts :: recoverPartialAssistantOutputFailure
- streaming-tool-execution.ts :: executeStreamingTool
- streaming-tool-synthetic-result.ts :: createSyntheticStreamedToolResult
- events-durable.ts :: persistDurableEvent
- events-summary.ts :: admitAppendSummary
- events-summary.ts :: flushAppendSummaries
- usage-observability.ts :: recordToolUsageFromEvent
- usage-observability-projection.ts :: ToolUsagePayload
- usage-observability-projection.ts :: modelNetworkObservations
- usage-observability-projection.ts :: firstModelTokenAt
- usage-observability-projection.ts :: usageErrorInfo
- usage-observability-projection.ts :: nonemptyString
- usage-observability-projection.ts :: usageCount

## 只被再导出的导出（无直接调用点）

这些名字没有独立的调用点，但经再导出（含 `methods/index.ts` 桶；桶不入包）可达，属于必须保持的导出面：


