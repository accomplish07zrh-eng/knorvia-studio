# core-runtime-methods-02 兼容接口面（v1）

只列兼容所需的模块路径、导出名、种类与签名；内部怎么拆文件由替换实现自定。
导出清单由 `scripts/dep-refs.mjs` 的 `--list-exports` 同源算法（ts-morph `getExportedDeclarations`）批量生成，
覆盖 `apps/cli/packages/core/src/runtime/methods` 下全部 24 个继承文件；签名（参数/返回类型）同样机器提取，不含函数体。

## 范围

- **24 个继承文件**（`apps/cli/packages/core/src/runtime/methods/**`，继承口径 `licensing/current-files.json`：`unreviewed` 6、`upstream-unchanged` 9、`upstream-modified` 9）。
- **不在范围的相邻文件**（本包不改，接口默认不可变）：
  - 同目录其余 89 个文件——`message-persistence*`/`steering*`/`session-fork*`/`rewind*`/`subagent*`/`target*`/
    `turn-*`（不含本包已入的 turn-model/turn-tool/turn-stop/turn-output/turn-step/turn-guide/turn-loop/turn-nested）、
    `tools.ts`/`hooks.ts`/`mcp.ts`/`config.ts`/`resume.ts` 等（methods-03 与 runtime-01 后续分包）；
  - `index.ts`（21KB 桶，聚合全目录）**不入包**——等各子包完成后统一处理（对照 helpers-01「index.ts 桶暂不动」先例）；
  - `runtime/helpers/**` 已由 `core-runtime-helpers-01` 覆盖；`runtime/methods/support/**` 与 methods-01 的
    21 个门面已由 `core-runtime-methods-01` 覆盖；`runtime/` 其余装配文件（`runtime.ts`、`session-mode-port.ts`、
    `types.ts`、`deps.ts`、`internal.ts`）以及 `agent/**`、`compact/**`、`permission/**`、`subagent/**`、`tool/**` 等属其他包。
- 同样不碰：core-01/02/03、试点 1（hooks）、adapters 与 tool 包。

## 黑盒入口

- **模块路径入口**：表中 24 个模块按相对路径直接导入（本包调用方与测试都这么用），构成兼容面。
- **无桶入口**：`methods/index.ts` 不在本包范围，测试与调用方都不经它。
- 两种运行方式都要过：**源码入口**（tsx 加载 `src/**/*.ts`）与 **dist 入口**（`dist/**/*.js`），由环境变量
  `KNORVIA_CORE_RUNTIME_METHODS_02_ENTRY=dist` 切换。

## 导出统计

| 项                                        | 数量 |
| ----------------------------------------- | ---- |
| 模块数                                    | 24   |
| 导出合计                                  | 98   |
| 运行时值导出（function/const/class/enum） | 86   |
| 类型导出（interface/type）                | 12   |

> 「运行时值」在源码与 dist 里都存在可取到的绑定；纯类型只在类型层可见，相似度比较时按
> 计划书「纯声明文件」口径剔除兼容名后再算。

## 模块路径 × 导出名

| 模块路径                            | 导出名                                  | 种类      | 运行时值 |
| ----------------------------------- | --------------------------------------- | --------- | -------- |
| `compact.ts`                        | `executeManualCompact`                  | function  | 是       |
| `compact.ts`                        | `autoCompactIfNeeded`                   | function  | 是       |
| `compact.ts`                        | `estimateCurrentModelInputTokens`       | function  | 是       |
| `compact.ts`                        | `reactiveCompactAfterContextExceeded`   | function  | 是       |
| `compact-log-context.ts`            | `autoCompactDecisionLogContext`         | function  | 是       |
| `context-history-entries.ts`        | `buildContextHistoryEntries`            | function  | 是       |
| `context-refresh.ts`                | `rebuildContextPrefix`                  | function  | 是       |
| `tool-part-metadata.ts`             | `mcpToolPartMetadata`                   | function  | 是       |
| `tool-part-metadata.ts`             | `completedToolPartMetadata`             | function  | 是       |
| `tool-part-persistence.ts`          | `projectToolNameForNonEmptyBoundary`    | function  | 是       |
| `tool-part-persistence.ts`          | `persistPendingToolPart`                | function  | 是       |
| `turn-guide-drain.ts`               | `drainInlineGuideForNextRequest`        | function  | 是       |
| `turn-loop-state.ts`                | `PendingStreamRecoveryRequest`          | type      | 否       |
| `turn-loop-state.ts`                | `RAPID_REFILL_TOOL_TURN_THRESHOLD`      | const     | 是       |
| `turn-loop-state.ts`                | `MAX_CONSECUTIVE_RAPID_REFILLS`         | const     | 是       |
| `turn-loop-state.ts`                | `AUTOMATION_MUTATION_TOOL_NAMES`        | const     | 是       |
| `turn-loop-state.ts`                | `OFF_PEAK_MUTATION_TOOL_NAMES`          | const     | 是       |
| `turn-loop-state.ts`                | `CompactLoopTracking`                   | interface | 否       |
| `turn-loop-state.ts`                | `RapidRefillDecision`                   | interface | 否       |
| `turn-loop-state.ts`                | `CompactAttemptOutcome`                 | type      | 否       |
| `turn-loop-state.ts`                | `AutoCompactOutcome`                    | type      | 否       |
| `turn-loop-state.ts`                | `AutoCompactLoopContext`                | interface | 否       |
| `turn-loop-state.ts`                | `ReactiveCompactLoopContext`            | interface | 否       |
| `turn-loop-state.ts`                | `TurnRequestState`                      | interface | 否       |
| `turn-loop-state.ts`                | `RegularTurnLoopState`                  | interface | 否       |
| `turn-loop-state.ts`                | `isAutomationMutationRestrictedTurn`    | function  | 是       |
| `turn-loop-state.ts`                | `isOffPeakCreateRestrictedTurn`         | function  | 是       |
| `turn-loop-state.ts`                | `evaluateRapidRefill`                   | function  | 是       |
| `turn-loop-state.ts`                | `recordCompactSuccess`                  | function  | 是       |
| `turn-loop-state.ts`                | `recordCompletedToolBatch`              | function  | 是       |
| `turn-loop-state.ts`                | `recordModelHistoryRound`               | function  | 是       |
| `turn-loop-state.ts`                | `recordCompactHistoryRound`             | function  | 是       |
| `turn-model.ts`                     | `createTurnModel`                       | function  | 是       |
| `turn-model.ts`                     | `applySubmissionExecutionState`         | function  | 是       |
| `turn-model.ts`                     | `sameModelSelection`                    | function  | 是       |
| `turn-model.ts`                     | `persistRuntimeModelSelection`          | function  | 是       |
| `turn-model-step.ts`                | `runModelBackedTurnStep`                | function  | 是       |
| `turn-model-step-fields.ts`         | `ModelStepInputs`                       | interface | 否       |
| `turn-model-step-fields.ts`         | `buildTurnModelRequest`                 | function  | 是       |
| `turn-model-step-fields.ts`         | `stepStartPart`                         | function  | 是       |
| `turn-model-step-fields.ts`         | `reasoningPart`                         | function  | 是       |
| `turn-model-step-fields.ts`         | `textPart`                              | function  | 是       |
| `turn-model-step-fields.ts`         | `modelCompletePayload`                  | function  | 是       |
| `turn-model-step-fields.ts`         | `logModelCompletion`                    | function  | 是       |
| `turn-model-step-fields.ts`         | `logStartPlanRetry`                     | function  | 是       |
| `turn-model-step-fields.ts`         | `outputLimitCarrier`                    | function  | 是       |
| `turn-model-step-fields.ts`         | `automationLimitResponse`               | function  | 是       |
| `turn-model-step-fields.ts`         | `modelStepTrace`                        | function  | 是       |
| `turn-model-step-fields.ts`         | `steeringFields`                        | function  | 是       |
| `turn-model-step-fields.ts`         | `modelRequestPayload`                   | function  | 是       |
| `turn-model-step-fields.ts`         | `outputLimitError`                      | function  | 是       |
| `turn-model-step-fields.ts`         | `UsageFields`                           | interface | 否       |
| `turn-model-step-fields.ts`         | `failedUsage`                           | function  | 是       |
| `turn-model-step-fields.ts`         | `completedUsage`                        | function  | 是       |
| `turn-model-step-fields.ts`         | `suspiciousResultFields`                | function  | 是       |
| `turn-model-step-fields.ts`         | `warnAutomationTools`                   | function  | 是       |
| `turn-model-step-fields.ts`         | `stopFields`                            | function  | 是       |
| `turn-model-step-fields.ts`         | `completedAssistantFields`              | function  | 是       |
| `turn-model-step-fields.ts`         | `recoveryFields`                        | function  | 是       |
| `turn-model-step-operation.ts`      | `performModelStep`                      | function  | 是       |
| `turn-model-step-records.ts`        | `logTurnModelDiagnostics`               | function  | 是       |
| `turn-model-step-records.ts`        | `logTurnModelSuspiciousEmpty`           | function  | 是       |
| `turn-model-step-records.ts`        | `prepareFailureFacts`                   | function  | 是       |
| `turn-model-step-records.ts`        | `persistedFailure`                      | function  | 是       |
| `turn-model-step-records.ts`        | `commitCancelledAssistantSnapshot`      | function  | 是       |
| `turn-model-step-recovery.ts`       | `recoverTurnModelContext`               | function  | 是       |
| `turn-model-step-usage.ts`          | `recordMainTurnModelUsage`              | function  | 是       |
| `turn-model-step-usage.ts`          | `querySourceForTask`                    | function  | 是       |
| `turn-model-step-usage.ts`          | `findLatestCommittedAssistantUsage`     | function  | 是       |
| `turn-model-step-usage.ts`          | `mainTurnCacheHitAggregateFromMessages` | function  | 是       |
| `turn-model-step-usage.ts`          | `recordMainTurnCacheHitUsage`           | function  | 是       |
| `turn-nested-model-usage.ts`        | `emitNestedModelUsageEvents`            | function  | 是       |
| `turn-output-token-continuation.ts` | `OUTPUT_TOKEN_LIMIT_ERROR_MESSAGE`      | const     | 是       |
| `turn-output-token-continuation.ts` | `classifyOutputTokenContinuation`       | function  | 是       |
| `turn-output-token-continuation.ts` | `isOutputTokenLimitFinishReason`        | function  | 是       |
| `turn-output-token-continuation.ts` | `filterOutputTokenContinuationEntries`  | function  | 是       |
| `turn-output-token-continuation.ts` | `preserveCanonicalContextPrefix`        | function  | 是       |
| `turn-output-token-continuation.ts` | `appendTurnRequestEntries`              | function  | 是       |
| `turn-output-token-continuation.ts` | `commitTurnRequestEntries`              | function  | 是       |
| `turn-output-token-continuation.ts` | `commitAssistantToTurnRequest`          | function  | 是       |
| `turn-output-token-continuation.ts` | `hasAssistantReasoningContent`          | function  | 是       |
| `turn-output-token-continuation.ts` | `appendOutputTokenContinuation`         | function  | 是       |
| `turn-output-token-continuation.ts` | `completeOutputTokenRecovery`           | function  | 是       |
| `turn-output-token-continuation.ts` | `finishOutputTokenRecovery`             | function  | 是       |
| `turn-step-finish.ts`               | `persistToolModelStepFinish`            | function  | 是       |
| `turn-stop.ts`                      | `captureAssistantPersistenceAnchor`     | function  | 是       |
| `turn-stop.ts`                      | `persistCompletedAssistantStep`         | function  | 是       |
| `turn-stop.ts`                      | `persistOutputTokenLimitErrorCarrier`   | function  | 是       |
| `turn-stop.ts`                      | `finishModelStepWithoutToolCalls`       | function  | 是       |
| `turn-tool-batch-follow-up.ts`      | `steerToolBatchFollowUp`                | function  | 是       |
| `turn-tool-batch-parts.ts`          | `ToolBatchPartFacts`                    | interface | 否       |
| `turn-tool-batch-parts.ts`          | `runningToolBatchState`                 | function  | 是       |
| `turn-tool-batch-parts.ts`          | `completedToolBatchState`               | function  | 是       |
| `turn-tool-batch-parts.ts`          | `failedToolBatchState`                  | function  | 是       |
| `turn-tool-batch-parts.ts`          | `toolBatchResultDiagnostic`             | function  | 是       |
| `turn-tool-usage.ts`                | `recordToolUsageFromResult`             | function  | 是       |
| `turn-tool-warnings.ts`             | `handleToolCallAnomalyWarnings`         | function  | 是       |
| `turn-tools.ts`                     | `executeToolCallsForModelStep`          | function  | 是       |

> 模块路径列相对 `apps/cli/packages/core/src/runtime/methods/`。

## 签名（机器提取，兼容声明块集中于此）

每导出一行签名（函数给参数与返回类型；纯类型给完整声明）。不含函数体与实现细节。

### `compact.ts`

```ts
async function executeManualCompact(
  this: AgentRuntimeInternal,
  input: string,
  customInstructions: string | undefined,
  turnId: TurnId,
  turnTraceContext: TraceContext,
  abortSignal?: AbortSignal,
  inputId?: string,
  model?: Model,
): Promise<TurnResult>;
async function autoCompactIfNeeded(
  this: AgentRuntimeInternal,
  turnTraceContext: TraceContext,
  events: SessionEvent[],
  abortSignal: AbortSignal | undefined,
  context: AutoCompactLoopContext,
): Promise<AutoCompactOutcome>;
function estimateCurrentModelInputTokens(
  messages: RunModelTextRequestOptions["messages"],
  sourceEntries: readonly (RuntimeMessageEntry | undefined)[] = [],
): number;
async function reactiveCompactAfterContextExceeded(
  this: AgentRuntimeInternal,
  originalError: unknown,
  turnTraceContext: TraceContext,
  events: SessionEvent[],
  abortSignal: AbortSignal | undefined,
  context: ReactiveCompactLoopContext,
): Promise<CompactAttemptOutcome>;
```

### `compact-log-context.ts`

```ts
function autoCompactDecisionLogContext(decision: AutoCompactDecision): {
  contextWindow: number;
  effectiveContextWindow: number;
  estimatedTokenCount: number;
  inputBudgetTokens: number;
  maxOutputTokens: number | undefined;
  modelContextBudgetStrategy: "legacy" | "preflight-v1";
  outputReserveTokens: number;
  providerBaseTokenCount: number | undefined;
  providerCacheReadTokens: number | undefined;
  providerCacheWriteTokens: number | undefined;
  providerContextUsageTokenCount: number | undefined;
  providerIncrementalTokenCount: number | undefined;
  providerOutputTokens: number | undefined;
  threshold: number;
  thresholdPercent: number;
  tokenCount: number;
  tokenSource: import("../../compact/policy.js").AutoCompactTokenSource;
};
```

### `context-history-entries.ts`

```ts
function buildContextHistoryEntries(contextResult: ContextBuildResult): RuntimeMessageEntry[];
```

### `context-refresh.ts`

```ts
function rebuildContextPrefix(
  runtime: AgentRuntimeInternal,
  options: { model?: Model; turnRequestEntries?: readonly RuntimeMessageEntry[] } = {},
): readonly RuntimeMessageEntry[];
```

### `tool-part-metadata.ts`

```ts
function mcpToolPartMetadata(
  presentation: { serverName: string; toolName: string; description?: string } | undefined,
): CompletedToolPartMetadata | undefined;
function completedToolPartMetadata(result: ToolExecutionResult): CompletedToolPartMetadata;
```

### `tool-part-persistence.ts`

```ts
function projectToolNameForNonEmptyBoundary(toolName: string): NonEmptyToolNameProjection;
async function persistPendingToolPart(
  runtime: AgentRuntimeInternal,
  options: {
    assistantMessageId: MessageId;
    declarationIndex: number;
    input: Record<string, unknown>;
    partID: PartId;
    toolCall: ToolCall;
    traceContext: TraceContext;
    metadata?: CompletedToolPartMetadata;
    model: Model;
  },
): Promise<void>;
```

### `turn-guide-drain.ts`

```ts
async function drainInlineGuideForNextRequest(
  runtime: AgentRuntimeInternal,
  state: RegularTurnLoopState,
): Promise<boolean>;
```

### `turn-loop-state.ts`

```ts
export type PendingStreamRecoveryRequest = ModelStreamRecoveryStatus;
const RAPID_REFILL_TOOL_TURN_THRESHOLD: 3;
const MAX_CONSECUTIVE_RAPID_REFILLS: 3;
const AUTOMATION_MUTATION_TOOL_NAMES: readonly ["CronCreate", "CronUpdate", "CronDelete"];
const OFF_PEAK_MUTATION_TOOL_NAMES: readonly ["OffPeakCreate", "SendMessage", "Workflow"];
export interface CompactLoopTracking {
  consecutiveRapidRefills: number;
  toolTurnsSinceCompact: number;
}
export interface RapidRefillDecision {
  consecutiveRapidRefills: number;
  shouldBlock: boolean;
  toolTurnsSinceCompact: number;
}
export type CompactAttemptOutcome = "skipped" | "compacted" | "failed";
export type AutoCompactOutcome = CompactAttemptOutcome | "rapid_refill_blocked";
export interface AutoCompactLoopContext {
  compactReason: CompactReason;
  modelStepIndex: number;
  phase: CompactPhase;
  rapidRefill: RapidRefillDecision;
  model: Model;
  turnRequestState: TurnRequestState;
}
export interface ReactiveCompactLoopContext {
  activeEntries?: readonly RuntimeMessageEntry[];
  modelStepIndex: number;
  model: Model;
  rapidRefillCount: number;
  turnRequestState: TurnRequestState;
}
export interface TurnRequestState {
  entries: readonly RuntimeMessageEntry[];
  outputTokenContinuationCount: number;
}
export interface RegularTurnLoopState {
  activeTurn?: ActiveTurnSteeringState;
  /** Host admission 显式传入的本轮 automation 身份；不能从持久 task metadata 推断。 */
  automationId?: string;
  /** Host admission 显式传入的本轮闲时任务身份；与 automationId 互斥，不从持久 meta 推断。 */
  offPeakTaskId?: string;
  /** CronCreate 命中全局上限后，本用户 turn 永久切为纯文本回复，禁止模型自行恢复。 */
  automationCreateLimitReached?: boolean;
  anomalyWarningsInjected: number;
  /** 本轮是否已消费来源为 subagent 的后台结果通知。 */
  backgroundSubagentResultConsumed: boolean;
  /** 本轮是否已消费来源为 workflow（dynamic-workflow run）的后台通知。 */
  workflowResultConsumed: boolean;
  compactTracking?: CompactLoopTracking;
  currentUserMessageId: MessageId;
  drainedSteerForNextRequest?: DrainedPendingInputDiagnostics;
  events: SessionEvent[];
  input: string;
  modelResponse: string;
  /** 本轮固定使用的可调用模型；配置变化只影响以后创建的 Loop。 */
  model: Model;
  /** execution 表示当前 Active Model 不能被同 loop 的 guide 改写。 */
  modelSelectionScope?: "execution";
  /** Core Server 的前台 child Selection override；优先于 profile 与父模型继承。 */
  subagentModelOverride?: SubagentRunOptions["modelOverride"];
  modelStepCount: number;
  /** 当前 query 已成功写入 provider 可见持久历史的 assistant/compact 产物数量。 */
  historyRoundCount: number;
  reactiveCompactAttemptedInCurrentModelStep: boolean;
  repeatedToolCallSignature?: string;
  repeatedToolCallStreakCount: number;
  pendingStreamRecoveryRequest?: PendingStreamRecoveryRequest;
  stopHookContinuationCount: number;
  /** 最终成功 product turn 的 raw transcript 起点；只有确认不再 continue 时才赋值。 */
  stableProductStartMessageId?: MessageId;
  /** 最终成功 assistant boundary；与 stableProductStartMessageId 成对出现。 */
  stableBoundaryAssistantMessageId?: MessageId;
  streamRecoveryRetryCount: number;
  tokenCount: number;
  toolCallCount: number;
  /** 当前 Turn 的 provider-local history；Turn 结束后直接释放。 */
  turnRequestState: TurnRequestState;
  /** 当前 turn 不向 provider 暴露的工具名；registry 仍保留，供执行边界做纵深校验。 */
  toolDisallowlist?: readonly string[];
  traceId: TraceId;
  turnAbortSignal: AbortSignal;
  turnId: TurnId;
  turnMachine: TurnMachineImpl;
  /** 当前 Turn 捕获的 provider-visible output style；不表示显式 subagent model override。 */
  turnOutputStyle?: OutputStylePromptConfig;
  turnTraceContext: TraceContext;
  userMessageId: MessageId;
}
function isAutomationMutationRestrictedTurn(state: RegularTurnLoopState): boolean;
function isOffPeakCreateRestrictedTurn(state: RegularTurnLoopState): boolean;
function evaluateRapidRefill(tracking: CompactLoopTracking | undefined): RapidRefillDecision;
function recordCompactSuccess(state: RegularTurnLoopState, decision: RapidRefillDecision): void;
function recordCompletedToolBatch(state: RegularTurnLoopState): void;
function recordModelHistoryRound(state: RegularTurnLoopState): void;
function recordCompactHistoryRound(state: RegularTurnLoopState): void;
```

### `turn-model.ts`

```ts
function createTurnModel(
  runtime: AgentRuntimeInternal,
  options: {
    selection?: ModelSelection;
    requestDependencies?: import("@knorvia/contracts").ModelRequestDependencies;
  } = {},
): Model;
async function applySubmissionExecutionState(
  runtime: AgentRuntimeInternal,
  intent: TurnInputIntentMetadata | undefined,
  traceContext: TraceContext,
  modelExecution?: import("../types.js").ModelExecutionContext,
  preparedModel?: Model,
): Promise<Model | undefined>;
function sameModelSelection(left: ModelSelection | undefined, right: ModelSelection): boolean;
async function persistRuntimeModelSelection(
  runtime: AgentRuntimeInternal,
  selection: ModelSelection,
): Promise<void>;
```

### `turn-model-step.ts`

```ts
async function runModelBackedTurnStep(
  this: AgentRuntimeInternal,
  state: RegularTurnLoopState,
  options: {
    drainedSteerForNextRequest?: DrainedPendingInputDiagnostics;
    latestRealUserMessageIndex?: number;
    messages: RunModelTextRequestOptions["messages"];
    sourceEntries: readonly (RuntimeMessageEntry | undefined)[];
    recordedMessages: RunModelTextRequestOptions["messages"];
    requestEntries: readonly RuntimeMessageEntry[];
    tools: ModelToolContract[];
  },
): Promise<ModelStepResult>;
```

### `turn-model-step-fields.ts`

```ts
export interface ModelStepInputs {
  drainedSteerForNextRequest?: DrainedPendingInputDiagnostics;
  latestRealUserMessageIndex?: number;
  messages: RunModelTextRequestOptions["messages"];
  sourceEntries: readonly (RuntimeMessageEntry | undefined)[];
  recordedMessages: RunModelTextRequestOptions["messages"];
  requestEntries: readonly RuntimeMessageEntry[];
  tools: ModelToolContract[];
}
function buildTurnModelRequest(
  runtime: AgentRuntimeInternal,
  state: RegularTurnLoopState,
  options: ModelStepInputs,
  fields: RequestFields,
): RunModelTextRequestOptions;
function stepStartPart(
  runtime: AgentRuntimeInternal,
  assistantMessageId: MessageId,
): { id: any; sessionID: SessionId; messageID: MessageId; type: "step-start" };
function reasoningPart(
  runtime: AgentRuntimeInternal,
  assistantMessageId: MessageId,
  startedAt: number,
  reasoning: NonNullable<RuntimeModelTextResult["reasoning"]>[number],
): {
  id: any;
  sessionID: SessionId;
  messageID: MessageId;
  type: "reasoning";
  text: any;
  metadata: any;
  time: { start: number; end: number };
};
function textPart(
  runtime: AgentRuntimeInternal,
  state: RegularTurnLoopState,
  assistantMessageId: MessageId,
  startedAt: number,
): {
  id: any;
  sessionID: SessionId;
  messageID: MessageId;
  type: "text";
  text: string;
  time: { start: number; end: number };
};
function modelCompletePayload(
  state: RegularTurnLoopState,
  result: RuntimeModelTextResult,
  querySource: string,
  contextWindow: number | undefined,
  cacheHit: unknown,
  fileChanges: unknown,
  toolCalls: ReturnType<AgentRuntimeInternal["extractToolCallsFromResult"]>,
): {
  toolCallCount: number;
  contextUsageBreakdown?: ContextUsageBreakdownItem[] | undefined;
  fileChanges?: {} | undefined;
  cacheHit?: {} | undefined;
  querySource: string;
  stopReason: string;
  usage: ModelUsage;
  contextWindow?: number | undefined;
  content: string;
};
function logModelCompletion(
  runtime: AgentRuntimeInternal,
  state: RegularTurnLoopState,
  modelTraceContext: TraceContext,
  startedAt: number,
  toolCalls: ReturnType<AgentRuntimeInternal["extractToolCallsFromResult"]>,
): void;
function logStartPlanRetry(
  runtime: AgentRuntimeInternal,
  modelTraceContext: TraceContext,
  retryDelayMs: number,
  attempt: ReturnType<typeof beginStartPlanBusyAdmissionRetryAttempt>,
): void;
function outputLimitCarrier(
  exhausted: ReturnType<typeof createCoreError>,
  projected: ReturnType<typeof projectExecutionErrorPayload>,
  result: RuntimeModelTextResult,
  model: Model,
  modelTraceContext: TraceContext,
): Parameters<typeof persistOutputTokenLimitErrorCarrier>[2];
function automationLimitResponse(input: string): string;
function modelStepTrace(
  state: RegularTurnLoopState,
  model: Model,
  querySource: string,
): ContractTraceContext;
function steeringFields(
  state: RegularTurnLoopState,
  options: ModelStepInputs,
  traceContext: TraceContext,
): {
  activeTurn: import("../types.js").ActiveTurnSteeringState | undefined;
  drained: DrainedPendingInputDiagnostics | undefined;
  messages: ModelInputMessage[];
  modelStepCount: number;
  traceContext: TraceContext;
};
function modelRequestPayload(
  state: RegularTurnLoopState,
  options: ModelStepInputs,
  model: Model,
  querySource: string,
): {
  messages: ModelInputMessage[];
  providerId: string;
  modelId: string;
  querySource: string;
  toolCount: number;
  iteration: number;
};
function outputLimitError(): any;
export interface UsageFields {
  assistantMessageId: MessageId;
  model: Model;
  modelTraceContext: TraceContext;
  networkEventStartIndex: number;
  startedAt: number;
}
function failedUsage(
  state: RegularTurnLoopState,
  fields: UsageFields,
  error: unknown,
): {
  assistantMessageId: MessageId;
  error: unknown;
  model: Model;
  modelTraceContext: TraceContext;
  networkEventStartIndex: number;
  startedAt: number;
  status: "cancelled" | "error";
};
function completedUsage(
  fields: UsageFields,
  result: RuntimeModelTextResult,
  toolCalls: ReturnType<AgentRuntimeInternal["extractToolCallsFromResult"]>,
): {
  assistantMessageId: MessageId;
  model: Model;
  modelTraceContext: TraceContext;
  networkEventStartIndex: number;
  result: RuntimeModelTextResult;
  startedAt: number;
  status: "completed";
  toolCallCount: number;
};
function suspiciousResultFields(
  result: RuntimeModelTextResult,
  model: { providerId: string; modelId: string },
  rawFinishReason: string | undefined,
): {
  finishReason: string;
  model: { providerId: string; modelId: string };
  providerMetadata: Record<string, unknown> | undefined;
  rawFinishReason: string | undefined;
};
function warnAutomationTools(
  runtime: AgentRuntimeInternal,
  toolCalls: ReturnType<AgentRuntimeInternal["extractToolCallsFromResult"]>,
): void;
function stopFields(
  anchor: ReturnType<typeof captureAssistantPersistenceAnchor>,
  assistantCreatedAt: number,
  assistantMessageId: MessageId,
  modelTraceContext: TraceContext,
  result: RuntimeModelTextResult,
): Parameters<typeof finishModelStepWithoutToolCalls>[1];
function completedAssistantFields(
  anchor: ReturnType<typeof captureAssistantPersistenceAnchor>,
  assistantCreatedAt: number,
  assistantMessageId: MessageId,
  modelTraceContext: TraceContext,
  result: RuntimeModelTextResult,
): Parameters<typeof persistCompletedAssistantStep>[2];
function recoveryFields(
  assistantMessageId: MessageId,
  failedRequestId: string | undefined,
  traceContext: TraceContext,
): {
  traceContext: TraceContext;
  failedRequestId?: string | undefined;
  assistantMessageId: MessageId;
};
```

### `turn-model-step-operation.ts`

```ts
async function performModelStep(
  runtime: AgentRuntimeInternal,
  state: RegularTurnLoopState,
  options: stepFields.ModelStepInputs,
  assistantMessageId: MessageId,
): Promise<ModelStepResult>;
```

### `turn-model-step-records.ts`

```ts
function logTurnModelDiagnostics(
  runtime: AgentRuntimeInternal,
  modelTraceContext: TraceContext,
  result: RuntimeModelTextResult,
  usage: RuntimeModelTextResult["usage"],
  rawFinishReason: string | undefined,
  responseLength: number,
  toolCalls: ToolCalls,
): void;
function logTurnModelSuspiciousEmpty(
  runtime: AgentRuntimeInternal,
  modelTraceContext: TraceContext,
  result: RuntimeModelTextResult,
  usage: RuntimeModelTextResult["usage"],
  rawFinishReason: string | undefined,
  responseLength: number,
  toolCalls: ToolCalls,
): void;
function prepareFailureFacts(
  error: unknown,
  state: RegularTurnLoopState,
): {
  code: string | undefined;
  projection: {
    underlyingErrorDetail?: string | undefined;
    underlyingErrorMessage?: string | undefined;
    detail?: string | undefined;
    message: string;
    code?: string | undefined;
    attribution?: any;
  };
  turnResult: string | undefined;
};
function persistedFailure(
  error: unknown,
  facts: ReturnType<typeof prepareFailureFacts>,
): {
  name: string;
  data: {
    turnResult?: string | undefined;
    attribution?: any;
    code?: string | undefined;
    message: string;
  };
};
function commitCancelledAssistantSnapshot(
  runtime: AgentRuntimeInternal,
  state: RegularTurnLoopState,
  snapshot: RuntimeModelStreamSnapshot,
): void;
```

### `turn-model-step-recovery.ts`

```ts
async function recoverTurnModelContext(
  runtime: AgentRuntimeInternal,
  state: RegularTurnLoopState,
  contextError: unknown,
  modelStepIndex: number,
  requestEntries: readonly RuntimeMessageEntry[],
): Promise<boolean>;
```

### `turn-model-step-usage.ts`

```ts
async function recordMainTurnModelUsage(
  runtime: AgentRuntimeInternal,
  state: RegularTurnLoopState,
  input: RecordMainTurnModelUsageInput,
): Promise<void>;
function querySourceForTask(taskType: AgentRuntimeInternal["config"]["taskType"]): string;
function findLatestCommittedAssistantUsage(
  sourceEntries: readonly (RuntimeMessageEntry | undefined)[],
): { messageIndex: number; baseline: PersistedTokenUsageBaseline } | undefined;
function mainTurnCacheHitAggregateFromMessages(input: {
  activeMessages: readonly MessageWithParts[];
  persistedMessages: readonly MessageWithParts[];
}): MainTurnCacheHitAggregate;
function recordMainTurnCacheHitUsage(
  runtime: AgentRuntimeInternal,
  usage: ModelUsage | undefined,
):
  | {
      cacheReadTokens: number;
      cacheWriteTokens: number;
      hitRate: number | null;
      hitRateRequestCount: number;
      inputTokens: number;
      latestHitRate: number | null;
      totalCacheReadTokens: number;
      totalCacheWriteTokens: number;
      totalInputTokens: number;
    }
  | undefined;
```

### `turn-nested-model-usage.ts`

```ts
async function emitNestedModelUsageEvents(
  runtime: AgentRuntimeInternal,
  input: {
    events: RegularTurnLoopState["events"];
    results: ToolExecutionResult[];
    traceContext: TraceContext;
  },
): Promise<void>;
```

### `turn-output-token-continuation.ts`

```ts
const OUTPUT_TOKEN_LIMIT_ERROR_MESSAGE: "The model's response exceeded the output token maximum.";
function classifyOutputTokenContinuation(input: {
  finishReason: string | undefined;
  rawFinishReason: string | undefined;
  toolCallCount: number;
  continuationCount: number;
}): OutputTokenContinuationDecision;
function isOutputTokenLimitFinishReason(
  finishReason: string | undefined,
  rawFinishReason: string | undefined,
): boolean;
function filterOutputTokenContinuationEntries(
  entries: readonly RuntimeMessageEntry[],
): readonly RuntimeMessageEntry[];
function preserveCanonicalContextPrefix(
  currentCanonicalEntries: readonly RuntimeMessageEntry[],
  turnLocalEntries: readonly RuntimeMessageEntry[],
): readonly RuntimeMessageEntry[];
function appendTurnRequestEntries(
  state: TurnRequestState,
  entries: readonly RuntimeMessageEntry[],
): void;
function commitTurnRequestEntries(
  runtime: AgentRuntimeInternal,
  state: TurnRequestState,
  entries: readonly RuntimeMessageEntry[],
): void;
function commitAssistantToTurnRequest(
  runtime: AgentRuntimeInternal,
  state: RegularTurnLoopState,
  result: RuntimeModelTextResult,
  toolCalls: Parameters<typeof createRuntimeAssistantEntry>[1],
): boolean;
function hasAssistantReasoningContent(
  reasoning: NonNullable<RuntimeModelTextResult["reasoning"]>[number],
): boolean;
function appendOutputTokenContinuation(state: TurnRequestState): void;
function completeOutputTokenRecovery(state: TurnRequestState): void;
function finishOutputTokenRecovery(state: TurnRequestState): void;
```

### `turn-step-finish.ts`

```ts
async function persistToolModelStepFinish(
  runtime: AgentRuntimeInternal,
  state: RegularTurnLoopState,
  options: {
    assistantCreatedAt: number;
    assistantMessageId: MessageId;
    modelTraceContext: TraceContext;
    result: RuntimeModelTextResult;
  },
): Promise<void>;
```

### `turn-stop.ts`

```ts
function captureAssistantPersistenceAnchor(
  runtime: AgentRuntimeInternal,
): AssistantPersistenceAnchor;
async function persistCompletedAssistantStep(
  runtime: AgentRuntimeInternal,
  state: RegularTurnLoopState,
  options: {
    assistantPersistenceAnchor: AssistantPersistenceAnchor;
    assistantCreatedAt: number;
    assistantMessageId: MessageId;
    includeEmptyAssistant: boolean;
    modelTraceContext: TraceContext;
    result: RuntimeModelTextResult;
  },
): Promise<boolean>;
async function persistOutputTokenLimitErrorCarrier(
  runtime: AgentRuntimeInternal,
  state: RegularTurnLoopState,
  options: {
    error: {
      data: Record<string, unknown>;
      name: string;
    };
    finishReason: string;
    model: Model;
    modelTraceContext: TraceContext;
  },
): Promise<void>;
async function finishModelStepWithoutToolCalls(
  this: AgentRuntimeInternal,
  state: RegularTurnLoopState,
  options: {
    assistantPersistenceAnchor: AssistantPersistenceAnchor;
    assistantCreatedAt: number;
    assistantMessageId: MessageId;
    modelTraceContext: TraceContext;
    result: RuntimeModelTextResult;
  },
): Promise<"continue" | "break">;
```

### `turn-tool-batch-follow-up.ts`

```ts
async function steerToolBatchFollowUp(
  runtime: AgentRuntimeInternal,
  state: RegularTurnLoopState,
  result: ToolExecutionResult,
  traceContext: TraceContext,
): Promise<void>;
```

### `turn-tool-batch-parts.ts`

```ts
export interface ToolBatchPartFacts {
  declarationIndex: number;
  partID: ReturnType<typeof createPartId>;
  input: Record<string, unknown>;
  startedAt: number;
}
function runningToolBatchState(
  runtime: AgentRuntimeInternal,
  call: ToolCall,
  part: ToolBatchPartFacts,
  boundary: Boundary,
): {
  status: "running";
  input: Record<string, unknown>;
  title: string;
  metadata: any;
  time: { start: number };
};
function completedToolBatchState(
  result: ToolExecutionResult,
  part: ToolBatchPartFacts,
  output: string,
  boundary: Boundary,
  media: Media,
): {
  attachments?: FilePart[] | undefined;
  status: "completed";
  input: Record<string, unknown>;
  output: string;
  title: string;
  metadata: any;
  time: { start: number; end: number };
};
function failedToolBatchState(
  runtime: AgentRuntimeInternal,
  result: ToolExecutionResult,
  part: ToolBatchPartFacts,
  output: string,
): {
  status: "error";
  input: Record<string, unknown>;
  error: string;
  metadata: any;
  time: { start: number; end: number };
};
function toolBatchResultDiagnostic(results: ToolExecutionResult[]): {
  resultCount: number;
  results: { toolName: string; success: boolean; output: string }[];
};
```

### `turn-tool-usage.ts`

```ts
async function recordToolUsageFromResult(
  runtime: AgentRuntimeInternal,
  result: ToolExecutionResult,
  traceContext: TraceContext,
): Promise<void>;
```

### `turn-tool-warnings.ts`

```ts
async function handleToolCallAnomalyWarnings(
  runtime: AgentRuntimeInternal,
  state: RegularTurnLoopState,
  options: {
    modelTraceContext: TraceContext;
    toolCalls: ModelToolCall[];
  },
): Promise<void>;
```

### `turn-tools.ts`

```ts
async function executeToolCallsForModelStep(
  this: AgentRuntimeInternal,
  state: RegularTurnLoopState,
  options: {
    assistantCreatedAt: number;
    assistantMessageId: MessageId;
    modelTraceContext: TraceContext;
    result: RuntimeModelTextResult;
    streamedToolResults?: StreamedToolExecutionResult[];
    toolCalls: ModelToolCall[];
  },
): Promise<"continue" | "break">;
```
