# core-runtime-methods-02 行为契约（v1）

> 每条 B 编号发布后不重用。九项字段固定为：**输入 / 输出 / 错误语义 / 时序与并发 / 幂等 / 资源释放 /
> 平台差异 / 状态所有者 / 日志级别**。条目与测试的对应关系见 [`README.md`](README.md) 的对照表。
> 范围：`apps/cli/packages/core/src/runtime/methods/` 下 24 个继承文件（回合模型步编排 + 工具批 +
> 输出续写 + compact/context 侧）。

## 编号规划（B32 起，防重排；已写条目不改号）

| 区 | 编号 | 文件 |
| --- | --- | --- |
| A 回合模型步编排 | B32 | turn-model-step.ts |
| A 回合模型步编排 | B33 | turn-model-step-operation.ts |
| A 回合模型步编排 | B34 | turn-model-step-records.ts |
| A 回合模型步编排 | B35 | turn-model-step-fields.ts |
| A 回合模型步编排 | B36 | turn-model-step-usage.ts |
| A 回合模型步编排 | B37 | turn-model-step-recovery.ts |
| A 回合模型步编排 | B38 | turn-model.ts |
| B 状态与续写 | B39 | turn-loop-state.ts |
| B 状态与续写 | B40 | turn-output-token-continuation.ts |
| B 状态与续写 | B41 | turn-step-finish.ts |
| C 工具批执行 | B42 | turn-tools.ts |
| C 工具批执行 | B43 | turn-tool-batch-parts.ts |
| C 工具批执行 | B44 | turn-tool-batch-follow-up.ts |
| C 工具批执行 | B45 | turn-tool-usage.ts |
| C 工具批执行 | B46 | turn-tool-warnings.ts |
| C 工具批执行 | B47 | tool-part-metadata.ts |
| C 工具批执行 | B48 | tool-part-persistence.ts |
| D 停止与引导 | B49 | turn-stop.ts |
| D 停止与引导 | B50 | turn-guide-drain.ts |
| E 用量与 compact | B51 | turn-nested-model-usage.ts |
| E 用量与 compact | B52 | compact.ts / compact-log-context.ts / context-history-entries.ts / context-refresh.ts（四件一组） |

## A 回合模型步编排

### B32 回合模型步入口与遥测收尾（`turn-model-step.ts` 的 `runModelBackedTurnStep`）

- **输入**：`this: AgentRuntimeInternal` + `RegularTurnLoopState` + `options`（`messages`、
  `recordedMessages`、`requestEntries`、`sourceEntries`、`tools`、可选 `drainedSteerForNextRequest`/
  `latestRealUserMessageIndex`）。
- **输出**：`"continue" | "output_continuation" | "break"`；每个助手消息步以
  `createMessageId()` 生成 `assistantMessageId` 并作为 `stepId` 交给 `agentTelemetry.step`
  （`stepIndex = state.modelStepCount`）。
- **错误语义**：`performModelStep` 抛错时按 `isTurnCancellationError(error, state.turnAbortSignal)`
  分流遥测——命中记 `finishCancelled("abort_signal")`，否则 `finishFailed("unhandled", "unknown", error)`；
  两种都**原样重抛**。
- **时序与并发**：单步严格顺序（telemetry.run 包裹）；步与步之间由回合循环串行。
- **幂等**：不改共享状态（状态变更全在 B33）；同输入同步数遥测。
- **资源释放**：无句柄。
- **平台差异**：无。
- **状态所有者**：`state.modelStepCount` 只读（步计数由 B33 演进）。
- **日志级别**：无（遥测自管）。

### B33 模型步执行主流程（`turn-model-step-operation.ts` 的 `performModelStep`）

- **输入**：`(runtime, state, options: ModelStepInputs, assistantMessageId)`；内部读
  `state.model`（`optionSpecs.maxOutputTokens.max`/`properties.contextWindow`）、
  `state.pendingStreamRecoveryRequest`（读取后**立即清空**）、`runtime.config.taskType`。
- **输出**：`"continue" | "output_continuation" | "break"`。成功路径状态推进：
  `state.modelResponse = result.text`、`modelStepCount += 1`、`tokenCount += getModelUsageTotalTokens(usage)`、
  `cacheReadTokens > 0` 时 `messageHistory.setCacheHit(...)`；结束分支三选一——
  无工具 `finishModelStepWithoutToolCalls`、续写 `"output_continuation"`（含 `exhausted` 抛出分支）、
  有工具 `executeToolCallsForModelStep`（`"continue"|"break"`）。
- **错误语义**（六路，顺序即契约）：
  1. 请求抛错 → 先 `recordMainTurnModelUsage(failedUsage)`；`coordinator.recoverFromModelFailure`
     命中（返回 true）→ 有新工具承诺则 `completeOutputTokenRecovery`，返回 `"continue"`；
  2. Start Plan 准入退避命中（`retryDelayMs !== undefined` 且未取消）→ 记账 + Started 事件 +
     丢弃标记（finish `"start_plan_admission_retry_discarded"`）→ 状态重置（modelResponse 清空、
     step+1、historyRound、machine 两段）→ 锚点三连（no_tool_committed）→ `abandon("model_failed")`
     → **真实等待 `retryDelayMs`**（该 sleep 属契约内退避，测试只断言常量与流程、不计时）→
     `throwIfTurnAborted` → `"continue"`；
  3. busy 耗尽（`streamRecoveryRetryCount > 0` 且未取消且 busy 判定命中）→ `finalError` 换
     `createStartPlanBusyAutoRetryExhaustedError(error)`；
  4. `abandon(aborted ? "cancelled" : "model_failed")`；取消且属取消错误 → `persistCancelledStreamSnapshot`
     + `commitCancelledAssistantSnapshot`；
  5. `persistAssistantMessage({completed, error: persistedFailure(...)})`（失败形状见 B34）；
  6. 上下文超限（`isModelContextExceededError`）且 `recoverContext` 成功 → `"continue"`；否则抛 `finalError`。
- **时序与并发**：持久化序（B33 锚点）= steer 日志 → `persistAssistantMessage` 骨架 → `persistPart`
  step-start 分部 → ModelRequest 事件（`state.events` push）→ `finishPreparation()` →
  建协调器 → 请求；成功侧 = 诊断日志 → 推理分部逐条（数组序）→ 文本分部 → ModelComplete 事件 →
  usage 记账 → machine 接纳 → **drain 流式结果（按声明表序）** → 三选一收尾。同 tick 契约：
  coordinator 的 abort/账本微任务边界不得改变。
- **幂等**：`pendingStreamRecoveryRequest` 读后清空（一次性）；`assistantPersistenceAnchor`
  捕获点固定在进入时（B49 定义）。
- **资源释放**：协调器由 abandon/drain 收口（B42）。
- **平台差异**：无。
- **状态所有者**：`state.modelResponse`/`modelStepCount`/`tokenCount`/`toolCallCount`（本步唯一写者）；
  `state.turnMachine` 一律 `new TurnMachineImpl(...)` 接纳返回值（machine-red 案底）。
- **日志级别**：steering 上下文 `info`（logModelRequestSteeringContext）、诊断 `info`
  （`model.response.diagnostics`，见 B34）、可疑空响应 `warn`、Start Plan 退避 `warn`。

### B34 诊断与失败记录（`turn-model-step-records.ts`）

- **输入**：诊断三件（`logTurnModelDiagnostics`/`logTurnModelSuspiciousEmpty`/
  `prepareFailureFacts`+`persistedFailure`）+ `commitCancelledAssistantSnapshot`。
- **输出**：诊断日志字段表（`event: "model.response.diagnostics"`，含 `providerMetadataKeys`
  （`objectKeys(result.providerMetadata)`——**KD-2 直接观察面**：`recoveredFromStreamFailure`
  在此处可见于 providerMetadata 键表）、`rawFinishReason`、`responseEmpty/responseLength`、
  `toolCallCount`、六项 usage 字段）；可疑空响应 warn（`model.response.suspicious_empty`）；
  持久化失败形状 `{name, data: {message, code?, attribution?, turnResult?}}`（`turnResult: "cancelled"`
  仅取消错误）；取消快照助手条目（文本+推理过滤后提交，`recordModelHistoryRound`）。
- **错误语义**：记录函数不抛；`persistedFailure` 纯函数。
- **时序与并发**：诊断在持久化前（B33 步骤 3）；取消助手提交在 B33 错误路 4。
- **幂等**：纯记录，无状态。
- **资源释放**：无。
- **平台差异**：无。
- **状态所有者**：无（读 state 只取 model 模型选择）。
- **日志级别**：诊断 `info`、可疑空 `warn`。

### B35 请求/分部/收尾字段构造（`turn-model-step-fields.ts`）

- **输入**：纯构造函数族——`buildTurnModelRequest`（`ModelStepInputs` + `RequestFields`）、
  `stepStartPart`/`reasoningPart`（分部形状）、`modelRequestPayload`/`steeringFields`/
  `modelStepTrace`（事件/日志字段）、`stopFields`/`completedAssistantFields`/`errorCarrierFields`/
  `recoveryFields`（收尾参数）。
- **输出**：`buildTurnModelRequest` 返回 `RunModelTextRequestOptions`，**键序即契约**：
  `abortSignal`、`assistantMessageId`、`events`、`maxOutputTokens`、`latestRealUserMessageIndex`、
  `messages`、`sourceEntries`、`model`、`onStreamSnapshot`、`onModelNetworkStatus`、
  `onStreamReasoningDelta`、`onStreamTextDelta`、`onStreamToolCall`、`streamRecovery`、`tools`、
  `traceContext`；其中 `maxOutputTokens = resolveModelStepMaxOutputTokens({baselineMaxOutputTokens:
  normalBudget, contextWindow, estimatedCurrentUsage: estimateCurrentModelInputTokens(messages,
  sourceEntries), modelContextBudgetStrategy})`；三个流回调分别接协调器
  `recordReasoningDelta`/`recordTextDelta`/`accept`。
- **错误语义**：纯构造不抛（预算解析边界行为见 model-token-limits，methods-01 面）。
- **时序与并发**：构造发生在持久化序的相应节点（B33）；分部 id 用 `createPartId()` 全局唯一。
- **幂等**：纯函数；`recoveryFields` 仅在 `failedRequestId` 存在时携带该键。
- **资源释放**：无。
- **平台差异**：无。
- **状态所有者**：无（只读 state/输入）。
- **日志级别**：无。

### B36 主回合用量记账（`turn-model-step-usage.ts`）

- **输入**：`recordMainTurnModelUsage(runtime, state, input)`（`assistantMessageId`、`model`、
  `modelTraceContext`、`networkEventStartIndex`、`result?`、`startedAt`、`status`、`error?`、
  `toolCallCount?`）；`querySourceForTask(taskType)`；`findLatestCommittedAssistantUsage(sourceEntries)`；
  `mainTurnCacheHitAggregateFromMessages({activeMessages, persistedMessages})`。
- **输出**：记账委托 `recordModelUsageFact`（methods-01 面），**model 只消费步开始时的不可变
  快照**（运行中切模不得把旧请求 token 归到新模型——源码注释钉明）；`querySource` 三值映射：
  `subagent_child → "subagent"`、`workflow_child | nested_workflow_child → "workflow_child"`、
  其余 `"main_turn"`；`findLatestCommittedAssistantUsage` **从尾向前**找首个非 attachment 的
  assistant 条目且 `persistedTokenUsageBaseline(entry.tokens)` 命中，返回 `{messageIndex, baseline}`；
  `mainTurnCacheHitAggregateFromMessages` 只聚合「活跃集内、assistant、非 summary」的持久化消息。
- **错误语义**：记账失败按 methods-01 的 warn 吞掉面；本模块不另抛。
- **时序与并发**：记账在 ModelComplete 事件之后（B33 成功序）/请求抛错后第一动作（错误路 1）。
- **幂等**：同一输入只记一次（调用点唯一）。
- **资源释放**：无。
- **平台差异**：无。
- **状态所有者**：只读 `state.events`/`currentUserMessageId`。
- **日志级别**：无（记账面自带 warn）。

### B37 反应式上下文恢复（`turn-model-step-recovery.ts` 的 `recoverTurnModelContext`）

- **输入**：`(runtime, state, contextError, modelStepIndex, requestEntries)`。
- **输出**：`Promise<boolean>`——`true` 仅当 `reactiveCompactAfterContextExceeded(...) === "compacted"`。
  命中后：`recordCompactSuccess(state, decision)` + `recordCompactHistoryRound(state)` +
  **机器重建** `state.turnMachine = new TurnMachineImpl(TurnMachineImpl.create(sessionId,
  turnNumber, state.input, state.traceId, state.turnId).start())`（machine-red 案底口径）。
- **错误语义**：快速回填熔断命中（`evaluateRapidRefill(state.compactTracking).shouldBlock`）→
  `warn("Reactive compact rapid-refill breaker tripped", {event: "compact.rapid_refill_breaker",
  consecutiveRapidRefills, modelStepIndex, toolTurnsSinceCompact, trigger: CompactTrigger.Reactive,
  ...})` 后 **抛 `createCompactRapidRefillError({consecutiveRapidRefills, maxConsecutiveRapidRefills:
  MAX_CONSECUTIVE_RAPID_REFILLS, toolTurnThreshold: RAPID_REFILL_TOOL_TURN_THRESHOLD,
  toolTurnsSinceCompact})`**。
- **时序与并发**：每模型步至多一次（`state.reactiveCompactAttemptedInCurrentModelStep` 命中
  即返回 false，不重复尝试）；机器重建在记录之后。
- **幂等**：上述一次性旗标即幂等边界。
- **资源释放**：无。
- **平台差异**：无。
- **状态所有者**：`reactiveCompactAttemptedInCurrentModelStep`/`compactTracking`/`turnMachine`
  的唯一写者（本函数）。
- **日志级别**：熔断 `warn`。

### B38 回合模型句柄与提交侧模型选择（`turn-model.ts`）

- **输入**：`createTurnModel(runtime, {selection?, requestDependencies?})`（选择缺省取
  `runtime.getSessionModelSelection()`）；`applySubmissionExecutionState(runtime, intent,
  traceContext, modelExecution?, preparedModel?)`；`sameModelSelection(left, right)`；
  `persistRuntimeModelSelection(runtime, selection)`。
- **输出**：`createTurnModel` = `createRuntimeModel`（methods-01 面）再 `withModelInvocationContext`
  追加 `refreshRuntimeHeadersBeforeAttempt`（traceContext 取当前调用上下文 ?? `runtime.rootTraceContext`）。
  `applySubmissionExecutionState`：有 `intent.modelSelection` 时造/复用 preparedModel；**仅当
  `modelExecution?.selectionScope !== "execution"`** 才 `cloneModelSelection` → `setSessionModelSelection`
  → 持久化 → 变化时 `emitModelSelected`（带 `effectiveReasoningLevel`、`supportedThoughtLevels`、
  `previousModelSelection`）；`intent.mode/planEnabled` 有值时 `applyRuntimeExecutionState(..., {source: "command"})`；
  返回模型（可 undefined）。
- **错误语义**：选择持久化**吞错转 warn**（`session.model_selection.persist_failed`，字段含
  `modelId`/`providerId`/`thoughtLevel`）；其余按调用面传播。
- **时序与并发**：选择变更序 = 造模型 → setSessionModelSelection → 持久化 → emit（只在变化时）；
  execution scope 把「本次请求的模型」与「会话常驻选择」隔离。
- **幂等**：`sameModelSelection` 三元比较（providerId、modelId、options.reasoningLevel）保证
  同值不重发 emit；`persistRuntimeModelSelection` 条目 id 固定 `${sessionId}:runtime-model-selection`
  （覆盖写）。
- **资源释放**：无。
- **平台差异**：无。
- **状态所有者**：会话模型选择的唯一写者（setSessionModelSelection + 持久化条目）；
  `modelSelectionScope: "execution"` 时本函数不写。
- **日志级别**：持久化失败 `warn`。

### B39 回合循环状态与紧凑计数（`turn-loop-state.ts`）

- **输入**：`RegularTurnLoopState` 状态形状（60+ 字段，关键：`events`/`turnRequestState`
  （`{entries, outputTokenContinuationCount}`）/`model`（固定句柄，配置变化只影响以后 Loop）/
  `modelSelectionScope?: "execution"`/`pendingStreamRecoveryRequest`/`compactTracking?`）；
  三个判据函数（`isAutomationMutationRestrictedTurn`/`isOffPeakCreateRestrictedTurn`/
  `evaluateRapidRefill`）与四个记录函数（`recordCompactSuccess`/`recordCompletedToolBatch`/
  `recordModelHistoryRound`/`recordCompactHistoryRound`）。
- **输出**：自动化受限判据 = **三重信号**（显式 `automationId` 非空 > `queryId` 前缀
  `automation-` > denylist **三工具全含**（`AUTOMATION_MUTATION_TOOL_NAMES`））；闲时受限判据
  同构（`offPeakTaskId` > 前缀 `offpeak-` > denylist 含哨兵 `OffPeakCreate`——旧 host 可能未带
  新增工具）；`evaluateRapidRefill`：`toolTurnsSinceCompact < RAPID_REFILL_TOOL_TURN_THRESHOLD(3)`
  时 `consecutiveRapidRefills + 1` 否则清 0，`shouldBlock = consecutiveRapidRefills >=
  MAX_CONSECUTIVE_RAPID_REFILLS(3)`；`recordCompactSuccess` 记 `{consecutiveRapidRefills,
  toolTurnsSinceCompact: 0}`；`recordCompletedToolBatch` **复位** `reactiveCompactAttemptedInCurrentModelStep`
  （旧 guard 活满整用户 turn 会挡住后续真实 overflow——修复注释钉明）并 `toolTurnsSinceCompact += 1`；
  两个 historyRound 记录各 `historyRoundCount += 1`（并行工具按数量展开不等于模型写史轮次；
  compact summary 独立计一次）。
- **错误语义**：纯函数/原地计数，不抛。
- **时序与并发**：`recordCompletedToolBatch` 在完整工具批结束时（B42 调用点）；
  `recordCompactHistoryRound` 在 compact 成功后（B37）。
- **幂等**：计数函数单调；判据纯函数。
- **资源释放**：`turnRequestState` 为 provider-local history，Turn 结束释放。
- **平台差异**：无。
- **状态所有者**：`RegularTurnLoopState` 的字段各有唯一写者（见各条）；`toolDisallowlist`
  由 Host admission 注入、本层只读。
- **日志级别**：无。

## 语义常量对照表（v1，随条目滚动补全；逐字钉值）

| 常量 | 值 | 所在 | 条目 |
| --- | --- | --- | --- |
| `RAPID_REFILL_TOOL_TURN_THRESHOLD` | `3` | turn-loop-state | B37/B39 |
| `MAX_CONSECUTIVE_RAPID_REFILLS` | `3` | turn-loop-state | B37/B39 |
| `AUTOMATION_MUTATION_TOOL_NAMES` | `["CronCreate","CronUpdate","CronDelete"]` | turn-loop-state | B39 |
| `AUTOMATION_QUERY_ID_PREFIX` | `"automation-"` | turn-loop-state | B39 |
| `OFF_PEAK_MUTATION_TOOL_NAMES` | `["OffPeakCreate","SendMessage","Workflow"]` | turn-loop-state | B39 |
| `OFF_PEAK_QUERY_ID_PREFIX` | `"offpeak-"` | turn-loop-state | B39 |
| querySource 映射 | `"subagent"` / `"workflow_child"` / `"main_turn"` | turn-model-step-usage | B36 |
| 模型选择条目 id | `` `${sessionId}:runtime-model-selection` `` | turn-model | B38 |
| 模型选择持久化失败事件 | `"session.model_selection.persist_failed"` | turn-model | B38 |
| 诊断/可疑空事件 | `"model.response.diagnostics"` / `"model.response.suspicious_empty"` | turn-model-step-records | B34 |
| 快速回填熔断事件 | `"compact.rapid_refill_breaker"` | turn-model-step-recovery | B37 |
| 输出续写提示词 | `"Output token limit hit. Resume directly — no apology, no recap of what you were doing. Pick up mid-thought if that is where the cut happened. Break remaining work into smaller pieces."` | turn-output-token-continuation | B40 |
| 输出上限错误文案 | `"The model's response exceeded the output token maximum."` | turn-output-token-continuation | B40 |
| `MAX_OUTPUT_TOKEN_CONTINUATIONS` | `3` | turn-output-token-continuation | B40 |
| `OUTPUT_LIMIT_RAW_REASONS` | `{"max_tokens","max_output_tokens","model_context_window_exceeded"}` | turn-output-token-continuation | B40 |
| 续写条目 `queryScope` | `"output_token_continuation"` | turn-output-token-continuation | B40 |
| step-finish 缺模型错误 | `"Model-backed turn step finish requires the loop Model"` | turn-step-finish | B41 |

### B40 输出 token 续写（`turn-output-token-continuation.ts`）

- **输入**：`classifyOutputTokenContinuation({finishReason, rawFinishReason, toolCallCount,
  continuationCount})`；`isOutputTokenLimitFinishReason(finish, raw)`；条目过滤/保留三件
  （`filterOutputTokenContinuationEntries`/`preserveCanonicalContextPrefix`/
  `hasAssistantReasoningContent`）；请求状态四件（`appendTurnRequestEntries`/
  `commitTurnRequestEntries`/`commitAssistantToTurnRequest`/`appendOutputTokenContinuation`+
  `completeOutputTokenRecovery`/`finishOutputTokenRecovery`）。
- **输出**：判定三态 `"continue" | "exhausted" | "none"`——`toolCallCount > 0` 即 `"none"`；
  非输出上限结束（`finishReason === "length"` 或 `OUTPUT_LIMIT_RAW_REASONS` 命中 raw）即 `"none"`；
  `continuationCount < 3 → "continue"` 否则 `"exhausted"`。续写条目 = 用户条目 +
  `queryScope: "output_token_continuation"`（提示词逐字见常量表）。`preserveCanonicalContextPrefix`
  取「当前 canonical 前缀（`countContextPrefixMessages`）+ turn-local 尾」（配置刷新替换 canonical
  前缀、恢复链持旧 prefix 的撤销防护）。`commitAssistantToTurnRequest`：内容非空
  （`modelResponse`/过滤后 reasoning/`toolCalls` 三有其一）才提交；**assistant 归因用 Turn 已绑定
  `state.model`**（provider result metadata 可能报别的模型——恢复链旧身份防护注释钉明）；
  返回是否提交。
- **错误语义**：纯函数/原地状态，不抛。
- **时序与并发**：`appendOutputTokenContinuation`（+1）在截断判定后；`completeOutputTokenRecovery`
  （清 0）在输出续写成功/有工具可执行时（B33 两处）；**压缩与异常重试不追加 Continue 也不重置
  次数**；第四次仍截断按输出上限报错、不再额外尝试 Reactive Compact（源码长注释即契约）。
- **幂等**：过滤/保留纯函数；计数单调（append）/归零（complete）。
- **资源释放**：`TurnRequestState` 随 Turn 结束释放。
- **平台差异**：无。
- **状态所有者**：`turnRequestState.outputTokenContinuationCount` 唯一写者（append/complete）。
- **日志级别**：无。

### B41 工具步收尾持久化（`turn-step-finish.ts` 的 `persistToolModelStepFinish`）

- **输入**：`(runtime, state, {assistantCreatedAt, assistantMessageId, modelTraceContext, result})`；
  `state.model` 缺失时 **抛 `Error("Model-backed turn step finish requires the loop Model")`**。
- **输出**：两段持久化序——① `step-finish` 分部（`reason: result.finishReason`、`cost: 0`、
  `tokens: toTokenUsageInfo(result.usage)`）；② `persistAssistantMessage` 收尾
  （`{completed: Date.now(), finish: result.finishReason, tokens: toTokenUsageInfo(...)}`）。
- **错误语义**：缺模型同步抛（上条）；持久化失败按持久化面传播。
- **时序与并发**：先分部后消息收尾，两段 await 顺序即契约（工具批执行的步收尾点，B42 调用）。
- **幂等**：分部 id `createPartId()` 每次唯一；收尾为覆盖式字段更新。
- **资源释放**：无。
- **平台差异**：无。
- **状态所有者**：只读 state（`model`/`currentUserMessageId`）。
- **日志级别**：无。
