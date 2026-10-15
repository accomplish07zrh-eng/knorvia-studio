# core-runtime-methods-01 兼容接口面（v1）

只列兼容所需的模块路径、导出名、种类与签名；内部怎么拆文件由替换实现自定。
导出清单由 `scripts/dep-refs.mjs` 的 `--list-exports` 同源算法（ts-morph `getExportedDeclarations`）批量生成，
覆盖 `apps/cli/packages/core/src/runtime/methods` 下全部 21 个继承文件；签名（参数/返回类型）同样机器提取，不含函数体。

## 范围

- **21 个继承文件**（`apps/cli/packages/core/src/runtime/methods/**`，继承口径 `licensing/current-files.json`：`upstream-modified` 12、`unreviewed` 6、`upstream-unchanged` 3）。
- **不在范围的相邻文件**（本包不改，接口默认不可变）：
  - 同目录其余 113 个文件——`turn-model-step-*` 与 `turn-model.ts`（回合模型步编排，属 `core-runtime-methods-02` 种子）、
    `compact*`/`context*`/`message-persistence*`/`steering*`/`session-fork*`/`rewind*`/`subagent*`/`target*`/`turn-*`、
    `tools.ts`/`hooks.ts`/`mcp.ts`/`config.ts`/`resume.ts` 等，按 M1 复盘规则逐片重切（methods-02/03 与 runtime-01 后续分包）；
  - `index.ts`（21KB 桶，聚合全目录）**不入包**——等各子包完成后统一处理（对照 helpers-01「index.ts 桶暂不动」先例）；
  - `runtime/helpers/**` 已由 `core-runtime-helpers-01` 覆盖；`runtime/` 其余装配文件（`runtime.ts`、`session-mode-port.ts`、
    `types.ts`、`deps.ts`、`internal.ts`）以及 `agent/**`、`compact/**`、`permission/**`、`subagent/**`、`tool/**` 等属其他包。
- 同样不碰：core-01/02/03、试点 1（hooks）、adapters 与 tool 包。

## 黑盒入口

- **模块路径入口**：表中 21 个模块按相对路径直接导入（本包调用方与测试都这么用），构成兼容面。
- **无桶入口**：`methods/index.ts` 不在本包范围，测试与调用方都不经它。
- 两种运行方式都要过：**源码入口**（tsx 加载 `src/**/*.ts`）与 **dist 入口**（`dist/**/*.js`），由环境变量
  `KNORVIA_CORE_RUNTIME_METHODS_01_ENTRY=dist` 切换。

## 导出统计

| 项                                        | 数量 |
| ----------------------------------------- | ---- |
| 模块数                                    | 21   |
| 导出合计                                  | 49   |
| 运行时值导出（function/const/class/enum） | 48   |
| 类型导出（interface/type）                | 1    |

> 「运行时值」在源码与 dist 里都存在可取到的绑定；纯类型只在类型层可见，相似度比较时按
> 计划书「纯声明文件」口径剔除兼容名后再算。

## 模块路径 × 导出名

| 模块路径                             | 导出名                                          | 种类      | 运行时值 |
| ------------------------------------ | ----------------------------------------------- | --------- | -------- |
| `model.ts`                           | `runModelTextRequest`                           | function  | 是       |
| `model-request-session-type.ts`      | `resolveModelRequestSessionTypeFromTaskType`    | function  | 是       |
| `model-request-session-type.ts`      | `resolveModelRetryBudgetFromTaskType`           | function  | 是       |
| `model-request-stream-state.ts`      | `createModelRequestStreamState`                 | function  | 是       |
| `model-request-stream-state.ts`      | `inspectModelRequestStreamResult`               | function  | 是       |
| `model-runtime-headers.ts`           | `createRefreshRuntimeHeadersBeforeModelAttempt` | function  | 是       |
| `model-status.ts`                    | `createModelStatusSink`                         | function  | 是       |
| `model-status.ts`                    | `logModelNetworkStatus`                         | function  | 是       |
| `model-streaming-event-queue.ts`     | `createModelStreamingEventQueue`                | function  | 是       |
| `model-streaming-event.ts`           | `emitModelStreamingEvent`                       | function  | 是       |
| `model-token-limits.ts`              | `resolveNormalRequestMaxOutputTokens`           | function  | 是       |
| `model-token-limits.ts`              | `resolveModelStepMaxOutputTokens`               | function  | 是       |
| `model-token-limits.ts`              | `modelRequestTokenLimitLogContext`              | function  | 是       |
| `reasoning-stream.ts`                | `getOrCreateReasoningBlock`                     | function  | 是       |
| `runtime-model.ts`                   | `createRuntimeModel`                            | function  | 是       |
| `runtime-model.ts`                   | `withModelInvocationContext`                    | function  | 是       |
| `cancelled-stream-persistence.ts`    | `persistCancelledStreamSnapshot`                | function  | 是       |
| `streaming-recovery.ts`              | `START_PLAN_BUSY_AUTO_RETRY_EXHAUSTED_MESSAGE`  | const     | 是       |
| `streaming-recovery.ts`              | `hasStreamRecoveryBudget`                       | function  | 是       |
| `streaming-recovery.ts`              | `beginStreamRecoveryAttempt`                    | function  | 是       |
| `streaming-recovery.ts`              | `beginStartPlanBusyAdmissionRetryAttempt`       | function  | 是       |
| `streaming-recovery.ts`              | `isStartPlanBusyStreamRecoveryFailure`          | function  | 是       |
| `streaming-recovery.ts`              | `createStartPlanBusyAutoRetryExhaustedError`    | function  | 是       |
| `streaming-recovery.ts`              | `getStartPlanBusyAdmissionRetryDelayMs`         | function  | 是       |
| `streaming-recovery.ts`              | `emitStreamRecoveryStarted`                     | function  | 是       |
| `streaming-recovery.ts`              | `emitStreamRecoveryRetryEvents`                 | function  | 是       |
| `streaming-recovery.ts`              | `recoverPartialAssistantOutputFailure`          | function  | 是       |
| `streaming-tool-coordinator.ts`      | `createStreamingToolCoordinator`                | function  | 是       |
| `streaming-tool-execution.ts`        | `executeStreamingTool`                          | function  | 是       |
| `streaming-tool-synthetic-result.ts` | `createSyntheticStreamedToolResult`             | function  | 是       |
| `streaming-tool-synthetic-result.ts` | `emitSyntheticStreamedToolError`                | function  | 是       |
| `events.ts`                          | `ensureSessionPersisted`                        | function  | 是       |
| `events.ts`                          | `createEvent`                                   | function  | 是       |
| `events.ts`                          | `isSessionPersisted`                            | function  | 是       |
| `events.ts`                          | `appendEvent`                                   | function  | 是       |
| `events.ts`                          | `notifyEventSinks`                              | function  | 是       |
| `events-durable.ts`                  | `persistDurableEvent`                           | function  | 是       |
| `events-session.ts`                  | `ensureSessionPersisted`                        | function  | 是       |
| `events-summary.ts`                  | `admitAppendSummary`                            | function  | 是       |
| `events-summary.ts`                  | `flushAppendSummaries`                          | function  | 是       |
| `usage-observability.ts`             | `recordModelUsageFact`                          | function  | 是       |
| `usage-observability.ts`             | `recordTurnUsageFact`                           | function  | 是       |
| `usage-observability.ts`             | `recordToolUsageFromEvent`                      | function  | 是       |
| `usage-observability-projection.ts`  | `ToolUsagePayload`                              | interface | 否       |
| `usage-observability-projection.ts`  | `modelNetworkObservations`                      | function  | 是       |
| `usage-observability-projection.ts`  | `firstModelTokenAt`                             | function  | 是       |
| `usage-observability-projection.ts`  | `usageErrorInfo`                                | function  | 是       |
| `usage-observability-projection.ts`  | `nonemptyString`                                | function  | 是       |
| `usage-observability-projection.ts`  | `usageCount`                                    | function  | 是       |

> 模块路径列相对 `apps/cli/packages/core/src/runtime/methods/`。

## 签名（机器提取，兼容声明块集中于此）

每导出一行签名（函数给参数与返回类型；纯类型给完整声明）。不含函数体与实现细节。

### `model.ts`

```ts
async function runModelTextRequest(
  this: AgentRuntimeInternal,
  options: RunModelTextRequestOptions,
): Promise<RuntimeModelTextResult>;
```

### `model-request-session-type.ts`

```ts
function resolveModelRequestSessionTypeFromTaskType(
  taskType: SessionTaskType | undefined,
): ModelRequestSessionType;
function resolveModelRetryBudgetFromTaskType(
  taskType: SessionTaskType | undefined,
): ModelRetryBudget;
```

### `model-request-stream-state.ts`

```ts
function createModelRequestStreamState(
  runtime: AgentRuntimeInternal,
  options: RunModelTextRequestOptions,
): {
  queue: ReturnType<typeof createModelStreamingEventQueue>;
  reasoning: ModelReasoningContentBlock[];
  reasoningById: Map<string, ModelReasoningContentBlock>;
  toolCalls: ModelToolCall[];
  finalToolCallIds: Set<string>;
  toolInputBuffers: Map<string, string>;
  enqueue(
    payload: Parameters<ReturnType<typeof createModelStreamingEventQueue>["enqueue"]>[0],
  ): Promise<void>;
  enqueueTerminal(
    payload: Parameters<ReturnType<typeof createModelStreamingEventQueue>["enqueue"]>[0],
  ): Promise<void>;
  flushToolInput(toolCallId: string): Promise<void>;
  bufferToolInput(toolCallId: string, delta: string): Promise<void>;
  flushAllToolInputs(): Promise<void>;
};
function inspectModelRequestStreamResult(
  runtime: AgentRuntimeInternal,
  result: ModelRequestStreamResult,
  modelSelection: { providerId: string; modelId: string },
  options: RunModelTextRequestOptions,
): void;
```

### `model-runtime-headers.ts`

```ts
function createRefreshRuntimeHeadersBeforeModelAttempt(
  runtime: AgentRuntimeInternal,
  input: {
    abortSignal?: AbortSignal;
    model: Model;
    traceContext: TraceContext;
  },
):
  | ((attemptInput: {
      accountAccess?: KnorviaProviderAccountAccess;
      attempt: number;
      reason?: "model-request";
      abortSignal?: AbortSignal;
    }) => Promise<{
      headersApplied: boolean;
      requestAuth?: ModelRequestAuth;
    }>)
  | undefined;
```

### `model-status.ts`

```ts
function createModelStatusSink(
  this: AgentRuntimeInternal,
  traceContext: TraceContext,
  events: SessionEvent[],
  options: ModelStatusSinkOptions = {},
): ModelStatusSink;
function logModelNetworkStatus(
  this: AgentRuntimeInternal,
  statusEvent: ModelNetworkStatusEvent,
  traceContext: TraceContext,
): void;
```

### `model-streaming-event-queue.ts`

```ts
function createModelStreamingEventQueue(params: {
  events: SessionEvent[];
  highWaterMark?: number;
  runtime: AgentRuntimeInternal;
  traceContext: TraceContext;
}): ModelStreamingEventQueue;
```

### `model-streaming-event.ts`

```ts
async function emitModelStreamingEvent(
  this: AgentRuntimeInternal,
  payload: ModelStreamingPayload,
  traceContext: TraceContext,
  events: SessionEvent[],
): Promise<void>;
```

### `model-token-limits.ts`

```ts
function resolveNormalRequestMaxOutputTokens(input: {
  modelMaxOutputTokens: number | undefined;
}): number;
function resolveModelStepMaxOutputTokens(input: {
  baselineMaxOutputTokens: number;
  contextWindow: number | undefined;
  estimatedCurrentUsage: number;
  modelContextBudgetStrategy: "legacy" | "preflight-v1" | undefined;
}): number;
function modelRequestTokenLimitLogContext(input: {
  contextWindow: number | undefined;
  maxOutputTokens: number | undefined;
  modelContextBudgetStrategy: "legacy" | "preflight-v1" | undefined;
  traceContext: TraceContext;
}): any;
```

### `reasoning-stream.ts`

```ts
function getOrCreateReasoningBlock(input: {
  id?: string;
  providerMetadata?: Record<string, unknown>;
  reasoning: ModelReasoningContentBlock[];
  reasoningById: Map<string, ModelReasoningContentBlock>;
}): ModelReasoningContentBlock;
```

### `runtime-model.ts`

```ts
function createRuntimeModel(
  runtime: AgentRuntimeInternal,
  input: Omit<RuntimeModelFactoryInput, "selection"> & {
    selection: RuntimeModelFactoryInput["selection"] | undefined;
  },
): Model;
function withModelInvocationContext(
  model: Model,
  createContext: (request: ModelRequest) => ModelInvocationContext,
): Model;
```

### `cancelled-stream-persistence.ts`

```ts
async function persistCancelledStreamSnapshot(
  runtime: AgentRuntimeInternal,
  options: {
    assistantCreatedAt: number;
    assistantMessageId: MessageId;
    snapshot: RuntimeModelStreamSnapshot;
    traceContext: TraceContext;
  },
): Promise<void>;
```

### `streaming-recovery.ts`

```ts
const START_PLAN_BUSY_AUTO_RETRY_EXHAUSTED_MESSAGE: "Start Plan is busy and automatic model stream recovery reached the maximum retry count.";
function hasStreamRecoveryBudget(state: RegularTurnLoopState): boolean;
function beginStreamRecoveryAttempt(state: RegularTurnLoopState): StreamRecoveryAttempt;
function beginStartPlanBusyAdmissionRetryAttempt(
  state: RegularTurnLoopState,
): StreamRecoveryAttempt;
function isStartPlanBusyStreamRecoveryFailure(error: unknown): boolean;
function createStartPlanBusyAutoRetryExhaustedError(error: unknown): Error;
function getStartPlanBusyAdmissionRetryDelayMs(input: {
  error: unknown;
  providerId: string;
  state: RegularTurnLoopState;
  turnNumber: number;
}): number | undefined;
async function emitStreamRecoveryStarted(
  runtime: AgentRuntimeInternal,
  state: RegularTurnLoopState,
  options: { assistantMessageId: MessageId; failedRequestId?: string; traceContext: TraceContext },
  error: unknown,
  recoveryAttempt: StreamRecoveryAttempt,
): Promise<void>;
async function emitStreamRecoveryRetryEvents(
  runtime: AgentRuntimeInternal,
  state: RegularTurnLoopState,
  options: { assistantMessageId: MessageId; failedRequestId?: string; traceContext: TraceContext },
  recovery: StreamRecoveryAttempt & {
    discardedReasoningBytes: number;
    discardedTextBytes: number;
    reason: "latest_committed_tool_result" | "no_tool_committed";
    toolCallIds: ToolCallId[];
  },
): Promise<void>;
async function recoverPartialAssistantOutputFailure(input: {
  abortController: AbortController;
  assistantCreatedAt: number;
  discardedReasoningBytes: number;
  discardedTextBytes: number;
  error: unknown;
  options: {
    assistantMessageId: MessageId;
    failedRequestId?: string;
    model: Model;
    traceContext: TraceContext;
  };
  runtime: AgentRuntimeInternal;
  state: RegularTurnLoopState;
  turnAbortListener: () => void;
}): Promise<boolean>;
```

### `streaming-tool-coordinator.ts`

```ts
function createStreamingToolCoordinator(
  runtime: AgentRuntimeInternal,
  state: RegularTurnLoopState,
  options: {
    assistantMessageId: MessageId;
    model: Model;
    traceContext: TraceContext;
  },
): StreamingToolCoordinator;
```

### `streaming-tool-execution.ts`

```ts
async function executeStreamingTool(
  runtime: AgentRuntimeInternal,
  state: RegularTurnLoopState,
  declaration: ModelToolCall,
  options: {
    assistantMessageId: MessageId;
    declarationIndex: number;
    model: Model;
    signal: AbortSignal;
    traceContext: TraceContext;
  },
): Promise<StreamedToolExecutionResult | undefined>;
```

### `streaming-tool-synthetic-result.ts`

```ts
function createSyntheticStreamedToolResult(
  toolCall: ModelToolCall,
  reason: SyntheticStreamedToolReason,
): StreamedToolExecutionResult;
async function emitSyntheticStreamedToolError(
  runtime: AgentRuntimeInternal,
  events: SessionEvent[],
  traceContext: TraceContext,
  result: ToolExecutionResult,
): Promise<void>;
```

### `events.ts`

```ts
async function ensureSessionPersisted(
  this: AgentRuntimeInternal,
  input: string,
  traceContext: TraceContext,
): Promise<void>;
function createEvent(
  this: AgentRuntimeInternal,
  type: SessionEventType,
  payload: unknown,
  traceContext: TraceContext,
): SessionEvent;
function isSessionPersisted(this: AgentRuntimeInternal): boolean;
async function appendEvent(
  this: AgentRuntimeInternal,
  event: SessionEvent,
  traceContext: TraceContext,
): Promise<void>;
async function notifyEventSinks(
  this: AgentRuntimeInternal,
  event: SessionEvent,
  traceContext: TraceContext,
): Promise<void>;
```

### `events-durable.ts`

```ts
async function persistDurableEvent(
  runtime: AgentRuntimeInternal,
  event: SessionEvent,
  traceContext: TraceContext,
): Promise<void>;
```

### `events-session.ts`

```ts
async function ensureSessionPersisted(
  this: AgentRuntimeInternal,
  input: string,
  traceContext: TraceContext,
): Promise<void>;
```

### `events-summary.ts`

```ts
function admitAppendSummary(
  runtime: AgentRuntimeInternal,
  event: SessionEvent,
  traceContext: TraceContext,
): boolean;
function flushAppendSummaries(
  runtime: AgentRuntimeInternal,
  traceContext: TraceContext,
  flushReason: string,
): void;
```

### `usage-observability.ts`

```ts
async function recordModelUsageFact(
  runtime: AgentRuntimeInternal,
  input: RecordModelUsageInput,
): Promise<void>;
async function recordTurnUsageFact(
  runtime: AgentRuntimeInternal,
  input: RecordTurnUsageInput,
): Promise<void>;
async function recordToolUsageFromEvent(
  runtime: AgentRuntimeInternal,
  event: SessionEvent,
  traceContext: TraceContext,
): Promise<void>;
```

### `usage-observability-projection.ts`

```ts
export interface ToolUsagePayload {
  toolCallId?: unknown;
  toolName?: unknown;
  decision?: unknown;
  startedAt?: unknown;
  outputBytes?: unknown;
  stdoutBytes?: unknown;
  stderrBytes?: unknown;
  duration?: unknown;
  result?: {
    perf?: { detail?: { kind?: string; command?: { exitCode?: unknown } } };
    returnedBytes?: unknown;
    originalBytes?: unknown;
    truncated?: unknown;
  };
  error?: { type?: unknown; code?: unknown; message?: unknown };
}
function modelNetworkObservations(events: readonly SessionEvent[]): ModelNetworkObservation[];
function firstModelTokenAt(events: readonly SessionEvent[], startIndex: number): number | undefined;
function usageErrorInfo(
  error: unknown,
  failed: ModelNetworkObservation | undefined,
): UsageErrorInfo;
function nonemptyString(value: unknown): string | undefined;
function usageCount(value: unknown): number;
```
