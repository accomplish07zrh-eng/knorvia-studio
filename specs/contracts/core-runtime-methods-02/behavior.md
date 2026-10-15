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

### B42 工具批执行主流程（`turn-tools.ts` 的 `executeToolCallsForModelStep`）

- **输入**：`(this: runtime, state, {assistantCreatedAt, assistantMessageId, modelTraceContext,
  result, streamedToolResults?, toolCalls})`；`state.model` 缺失**抛
  `"Model-backed tool execution requires the loop Model"`**；准入时保留归因字段读取
  （`void {providerId, modelId}`，执行端口在调度 await 后读当前 loop handle——注释钉明）。
- **输出**：`"continue" | "break"`。主序（顺序即契约）：
  1. **声明循环**（`declarationIndex` 计数即契约）：流式已录（`entry.ledgerRecorded !== false`）
     跳过；否则 `persistPendingToolPart`（含 MCP 元数据）→ `emitStreamingToolLedgerUpdate(
     status: "tool_call_closed")`（流式补 `executionTiming: "during_stream"`）→ 流式未录错误
     补 `emitSyntheticStreamedToolError`；
  2. `scheduleTools` → `TurnMachineImpl(scheduleTools(...))` → `startToolExecution()`（两段 machine
     接纳）；非流式 pending 走 `emitToolScheduledEvents` + 逐条 `tool_queued` 账本 + debug
     `"Executing tools"`（streamedToolCallCount/toolCallCount/tools 名单）；
  3. `executeTools` 入参带 `automationTurn`/`offPeakTurn`（B39 三重信号判据）/`signal`/`model`；
     `onBatchStart` 逐 id 写 `tool` 分部（`runningToolBatchState` + 名称边界投影
     `projectToolNameForNonEmptyBoundary`）+ `tool_started` 账本（aborted 则整体跳过）；
  4. **结果收口序**：streamed/pending 结果按**声明序**归并 → `recordBrowserTurnToolResult` 逐条 →
     `emitNestedModelUsageEvents` → 逐条 `completeTool`（success 内容 `modelContentForToolResult`、
     失败 `error?.message ?? stringifyToolResultOutput`）→ `aggregateResults` → 两条 debug
     （`Tools executed`（`toolBatchResultDiagnostic`）、`Injecting tool results`）；
  5. **逐结果持久化序**：`recordToolUsageFromResult` → 成功则 `persistToolResultMediaAttachments`
     → `tool` 分部终态（**facc708 案底：终态选择必须位于记录构造阶段**——端口读取可改 result；
     success=`completedToolBatchState` 否则 `failedToolBatchState`）→ debug `addToolResult` →
     `commitTurnRequestEntries`（`createRuntimeToolResultEntry`，`isError = isErrorForToolResult`）
     → `emitFileMutationCheckpoint`（**取消错误吞入 `checkpointCancellation` 并 continue**，
     其余冒泡）→ `emitStreamRecoveryAnchor`（anchorId=`createStreamRecoveryAnchorId`）+
     `tool_result_committed` 账本（`executionTiming`: 流式 `during_stream`/非流式 `end_of_stream`）
     → `steerToolBatchFollowUp`；
  6. **批收尾**：`checkpointCancellation` 若有最终抛出；`turnControl.stopTurnAfterResult` 命中 →
     `persistToolModelStepFinish` →（`reason === "automation_create_limit"` 时置
     `automationCreateLimitReached` + `recordCompletedToolBatch` + info
     `"automation.create_limit.text_only_continuation"` + 返回 `"continue"`）否则
     `fallbackPendingGuidesToQueue(reasonCode: "guide.noToolBoundary")` + info
     `"tool.turn_control.stop"` + `steerable = false` + `complete(modelResponse, "success")` +
     返回 `"break"`；无停止 → `handleToolCallAnomalyWarnings` → `persistToolModelStepFinish` →
     `drainInlineGuideForNextRequest` → `recordCompletedToolBatch` → debug
     `"After inject, message count"` → `"continue"`。
- **错误语义**：缺模型/取消错误按上文；checkpoint 取消聚合到批末抛出；其余逐层冒泡。
- **时序与并发**：批内工具并行执行（scheduleTools/executeTools 语义），但分部/账本/结果收口
  全部按声明序或结果归并序严格顺序；同 tick 契约由 B43/B44 钉。
- **幂等**：流式已录账本不重录（`ledgerRecorded`）；machine 一律新实例接纳（machine-red）。
- **资源释放**：媒体附件走 artifactStore 持久化；signal 贯穿取消。
- **平台差异**：媒体持久化与工具执行的平台差异在各自适配面（不改本序）。
- **状态所有者**：`turnMachine`（schedule/start/complete/aggregate 四段）、`turnRequestState`
  （结果条目）、`events`（scheduled/push）、`automationCreateLimitReached`、`activeTurn.steerable`
  的写点见主序。
- **日志级别**：`Executing tools`/`Tools executed`/`Injecting tool results`/`addToolResult`/
  `After inject, message count` 为 `debug`；automation 限额与 tool 停止为 `info`。

### B43 工具分部状态构造（`turn-tool-batch-parts.ts`）

- **输入**：`ToolBatchPartFacts`（`declarationIndex`/`partID`/`input`/`startedAt`）+ 三态构造器
  `runningToolBatchState`/`completedToolBatchState`/`failedToolBatchState` + 诊断
  `toolBatchResultDiagnostic`。
- **输出**：三态形状钉值——`running`：`{status, input, title: boundary.toolName, metadata:
  mcpToolPartMetadata(registry mcpPresentation) ?? {}, time: {start: part.startedAt}}`；
  `completed`：`{status, input, output, title, metadata: {…completedToolPartMetadata(result),
  ...(media ? {modelContentLayout} : {})}, time: {start: result.startedAt.getTime(), end:
  result.completedAt.getTime()}, ...(media ? {attachments: media.attachments} : {})}`；
  `error`：`{status, input, error: result.error?.message ?? output, metadata: {…mcp 元数据,
  ...(string modelContent ? {modelContent} : {})}, time: {start, end}}`。
  诊断形状：`{resultCount, results: [{toolName, success, output: string 截 50 或 "[object]"}]}`。
- **错误语义**：纯构造不抛。
- **时序与并发**：构造发生在 B42 的对应记录构造点（终态选择位置 = facc708 案底要求）。
- **幂等**：纯函数。
- **资源释放**：无。
- **平台差异**：无。
- **状态所有者**：无。
- **日志级别**：无（诊断形状供 debug 用）。

### B44 工具结果跟进输入（`turn-tool-batch-follow-up.ts` 的 `steerToolBatchFollowUp`）

- **输入**：`(runtime, state, result, traceContext)`；`result.followUpUserInput`（`{input,
  reasonSource}`）为空或 `input.trim()` 为空时直接返回。
- **输出**：`runtime.steerTurn({delivery: "guide", expectedTurnId: state.activeTurn?.turnId, input,
  source: followUp.reasonSource, traceContext})` 二路：`kind === "queued"` → debug
  `tool.follow_up_user_input.queued`（`pendingInputId`/`reasonSource`/`toolCallId`/`toolName`）；
  否则 **warn** `tool.follow_up_user_input.rejected`（`activeTurnId`/`reason`/`reasonSource`）。
- **错误语义**：steer 失败不抛（以 warn 记录）；其它异常按调用面传播。
- **时序与并发**：在 B42 逐结果持久化序的最后一步（每结果一次）。
- **幂等**：每结果至多一次 steer（调用点唯一）。
- **资源释放**：无。
- **平台差异**：无。
- **状态所有者**：只读 state（`activeTurn.turnId`）。
- **日志级别**：queued `debug`、rejected `warn`。

### B45 结果路径工具用量记账（`turn-tool-usage.ts` 的 `recordToolUsageFromResult`）

- **输入**：`(runtime, result, traceContext)`；usage 四方法门槛（同 methods-01 口径，缺一静默）。
- **输出**：`upsertToolUsage` 记录——`id` = `` `usage_tool_${sessionId}_${toolCallId}` ``、
  `approvalStatus: "none"`、`status: result.success ? "completed" : "error"`、
  `firstOutputAt = completedAt`、`timeToFirstOutputMs = completedAt - startedAt`、
  `exitCode` 仅 `performance.detail.kind === "command"` 时取 `command.exitCode`、
  `outputBytes`（`serialization.returnedBytes` 优先，否则 string 输出 `TextEncoder` 字节长）、
  `truncated: result.serialization?.truncated`、`retryCount: 0`、`retryable: false`、
  `cancelledByUser: errorType?.includes("cancel") ?? false`。
- **错误语义**：写入失败**吞错转 warn** `usage.tool.write.failed`（源码注释钉明：SQLite 磁盘/锁
  异常绝不能阻断后续 Tool Result 持久化与模型续跑）。
- **时序与并发**：B42 逐结果持久化序第一步。
- **幂等**：同 `id` 覆盖写。
- **资源释放**：无。
- **平台差异**：无。
- **状态所有者**：只读 registry 元数据（sideEffectScope/readOnly/destructive）。
- **日志级别**：失败 `warn`。

### B47 工具分部元数据（`tool-part-metadata.ts`）

- **输入**：`mcpToolPartMetadata(presentation)`（`{serverName, toolName, description?}`）；
  `completedToolPartMetadata(result)`。
- **输出**：MCP 元数据 = `createMcpToolDisplay(presentation)` 命中时
  `{schemaVersion: COMPLETED_TOOL_PART_METADATA_SCHEMA_VERSION, display}` 否则 undefined；
  完成元数据 = `{schemaVersion, ...(display), ...(serialization: {truncated, originalBytes,
  returnedBytes, budgetStrategy, ...(artifactPath)}), ...(readFileState: result.readFileStateMetadata)}`
  （**resume 需要模型当时真实读到的文件快照**——只依赖 tool_result 文本会把主路径绑死在 provider
  展示格式上，注释钉明）。
- **错误语义**：纯构造不抛。
- **时序与并发**：分部构造点（B42/B43）。
- **幂等**：纯函数。
- **资源释放**：无。
- **平台差异**：无。
- **状态所有者**：无。
- **日志级别**：无。

### B48 待决工具分部持久化与名称边界（`tool-part-persistence.ts`）

- **输入**：`projectToolNameForNonEmptyBoundary(toolName)`；`persistPendingToolPart(runtime,
  {assistantMessageId, declarationIndex, input, partID, toolCall, traceContext, metadata?, model})`。
- **输出**：名称边界投影——名称 trim 非空原样；**空名投影** `{toolName: "empty_tool_name",
  metadata: {providerToolName: 原名}}`（B42/B43 全部经此）。`persistPendingToolPart`：空名走
  投影、否则 `requireRuntimeToolCallName`（helpers 面）；落 `tool` 分部
  `{status: "pending", input, raw: JSON.stringify({tool, input})}`（`metadata` = 投影 metadata
  与调用方 metadata 合并、调用方在后）。
- **错误语义**：`requireRuntimeToolCallName` 失败按 helpers 面传播；持久化失败冒泡。
- **时序与并发**：B42 声明循环内（declarationIndex 顺序）。
- **幂等**：partID 唯一，同 id 覆盖。
- **资源释放**：无。
- **平台差异**：无。
- **状态所有者**：只读。
- **日志级别**：无（helpers 侧可 warn）。

### B46 工具调用异常告警（`turn-tool-warnings.ts` 的 `handleToolCallAnomalyWarnings`）

- **输入**：`(runtime, state, {modelTraceContext, toolCalls})`；预算告警
  `detectToolCallBudgetWarning(state.toolCallCount, toolCalls.length, state, config.modelAnomalyGuard)`；
  重复告警 `detectRepeatedToolCallWarnings(toolCalls, state, config.modelAnomalyGuard)`。
- **输出**：预算告警命中 → `warningInjected` 时提交 `systemReminderAttachmentEntry("model_anomaly",
  buildToolCallBudgetReminderBody(observedCount))` → `ModelAnomalyWarning` 事件
  `{category: "tool_call_budget", severity: "warning", observedCount, threshold, warningInjected}`
  （append + state.events push）。重复告警逐条 → 注入
  `buildRepeatedToolCallReminderBody(toolName, observedCount)`（同上条件）→ 事件
  `{category: "repeated_tool_call", severity: "warning", observedCount, threshold, toolCallId,
  toolName, warningInjected}`（append + push）。
- **错误语义**：事件/提交失败按持久化面传播。
- **时序与并发**：B42 批收尾无停止分支的**第一步**（step-finish 之前）。
- **幂等**：检测函数的状态推进由 helpers 面定义（`repeatedToolCallSignature/StreakCount`）。
- **资源释放**：无。
- **平台差异**：无。
- **状态所有者**：只读（检测函数可经 state 更新重复签名）。
- **日志级别**：无（告警走事件，不走日志）。

### B50 步边界 guide 排空（`turn-guide-drain.ts` 的 `drainInlineGuideForNextRequest`）

- **输入**：`(runtime, state)`；无 `activeTurn` 或 `hasInlineGuidePendingInput` 不命中即 `false`。
- **输出**：`Promise<boolean>`。序（顺序即契约）：`drainPendingInput`（`pendingInputIds` 空 →
  false）→ 记 `state.drainedSteerForNextRequest` → `appendTurnRequestEntries(runtimeEntries)` →
  **固定执行模型（`modelSelectionScope === "execution"`）只禁切模、不丢 Guide 权限/Plan 意图**
  （intent 走 `applyRuntimeExecutionState({source: "command"})`、guideModel 置 undefined）→
  否则 `applySubmissionExecutionState`；guideModel 有值时比较 **Loop 执行选择**（不是 Session）
  决定 `selectionChanged`，变化才 `rebuildContextPrefix` → `currentUserMessageId = latestMessageId`
  → `queryIds[0]` 存在则覆盖 `turnTraceContext.queryId`（guide 以 user role 续上 active turn）→
  `toolDisallowlist` 并集合并（automation guide 不重新 start turn）→ 重置
  `repeatedToolCallSignature/StreakCount` → `true`。
- **错误语义**：各 apply/drain 失败按对应面传播。
- **时序与并发**：B42 批收尾常规分支的倒数第二步（每 model-step 边界最多消费一条 guide——
  SendMessage 可能在 child model request 中到达，doc 注释钉明）。
- **幂等**：单次调用至多消费一条（drainPendingInput 口径）；重复签名重置即新计数周期。
- **资源释放**：无。
- **平台差异**：无。
- **状态所有者**：`drainedSteerForNextRequest`/`turnRequestState.entries`/`model`/
  `currentUserMessageId`/`turnTraceContext`/`toolDisallowlist`/`repeatedToolCall*` 的写点见主序。
- **日志级别**：无。

### B51 嵌套模型用量事件（`turn-nested-model-usage.ts` 的 `emitNestedModelUsageEvents`）

- **输入**：`(runtime, {events, results, traceContext})`；结果输出需含 `output.modelUsage`
  （record 型）。
- **输出**：逐结果提取 `extractNestedModelUsage(output)`（六 token 字段取有限数值 +
  `serverToolUse: {webFetchRequests, webSearchRequests}` 条件附着；非 record/缺 modelUsage →
  undefined 跳过），命中则造 `ModelComplete` 事件 `{content: "", stopReason: "tool_internal",
  usage, toolCallCount: 0}`（append + state.events push）。
- **错误语义**：事件失败按持久化面传播。
- **时序与并发**：B42 结果收口序（`completeTool` 之前）。
- **幂等**：每结果至多一事件（提取唯一）。
- **资源释放**：无。
- **平台差异**：无。
- **状态所有者**：只读（事件进 state.events）。
- **日志级别**：无。

### B49 停止收尾与助手持久化（`turn-stop.ts`）

- **输入**：`captureAssistantPersistenceAnchor(runtime)`（快照三个指针：`latestAssistantMessageId`/
  `latestAssistantTurnId`/`latestConversationMessageId`）；`persistCompletedAssistantStep(runtime,
  state, {anchor, assistantCreatedAt, assistantMessageId, includeEmptyAssistant, modelTraceContext,
  result})`；`persistOutputTokenLimitErrorCarrier(runtime, state, {error, finishReason, model,
  modelTraceContext})`；`finishModelStepWithoutToolCalls(this, state, options)`。
- **输出**：
  - `persistCompletedAssistantStep` → boolean。`state.model` 缺失**抛
    `"Model-backed assistant persistence requires the loop Model"`**。提交序：
    `commitAssistantToTurnRequest(result, undefined)` → 未提交且 `includeEmptyAssistant` 时补
    空助手条目（`createRuntimeAssistantEntry("", ..., model, tokens)`）→ 仍未提交则 **丢弃路径**：
    `sessionStore.removeMessage` + **只回滚仍属本消息的指针**（`latestConversationMessageId`/
    `latestAssistantMessageId`（连带 `latestAssistantTurnId`）等于 `assistantMessageId` 才还原
    anchor 快照——注释「Restore only pointers still owned by this discarded message」钉明）→
    `false`；已提交则 `step-finish` 分部（`reason: result.finishReason, cost: 0, tokens`）→
    `persistAssistantMessage` 收尾 → `true`。
  - `persistOutputTokenLimitErrorCarrier`：**carrier 有独立消息身份与分段持久化**（注释钉明）：
    `persistAssistantMessage` 骨架 → `step-finish` 分部（空 tokens）→ `persistAssistantMessage`
    收尾（`{completed, error: {name, data}, finish: finishReason, tokens: emptyTokenUsageInfo()}`）。
  - `finishModelStepWithoutToolCalls` → `"continue" | "break"`（`state.model` 缺失**抛
    `"Model-backed turn stop requires the loop Model"`**）：`persistCompletedAssistantStep(
    includeEmptyAssistant: true)`，committed 时 `recordModelHistoryRound`；三分支：
    ① `automationCreateLimitReached` → `fallbackPendingGuidesToQueue("guide.noToolBoundary")` +
    `steerable = false` + 记 `stableProductStartMessageId/stableBoundaryAssistantMessageId` +
    `complete(modelResponse, "success")` → `"break"`；
    ② `drainInlineGuideForNextRequest` 命中 → `aggregateResults()` → `"continue"`；
    ③ `runStopHooks(modelResponse, toolCallCount, trace, signal, stopHookContinuationCount > 0)`
    → `shouldContinueAfterStopHooks` 命中则 `stopHookContinuationCount++` + 注入
    `injectHookAdditionalContextIntoMessageHistory(HookEventName.Stop, additionalContexts)` +
    `aggregateResults()` → `"continue"`；否则 guide 回退 + `steerable = false` + stable 对 +
    `complete(...)` → `"break"`。
- **错误语义**：缺模型两处固定抛错；持久化失败冒泡。
- **时序与并发**：B33 无工具分支（含 `includeEmptyAssistant: true`）；B42 批收尾的 step-finish
  走 `persistToolModelStepFinish`（B41）。stable 对只在确定不再 continue 时赋值。
- **幂等**：锚点快照纯读；`removeMessage`+指针回滚按属主判断不误伤。
- **资源释放**：无。
- **平台差异**：无。
- **状态所有者**：`stableProductStartMessageId`/`stableBoundaryAssistantMessageId`/
  `stopHookContinuationCount`/`turnMachine`/`activeTurn.steerable` 写点见三分支。
- **日志级别**：无（hook 面自管）。

### B52 compact 编排组（`compact.ts` + `compact-log-context.ts` / `context-history-entries.ts` / `context-refresh.ts`）

- **输入**：`executeManualCompact(this, input, customInstructions, turnId, turnTraceContext,
  abortSignal?, inputId?, model?)`；`autoCompactIfNeeded(this, turnTraceContext, events,
  abortSignal, AutoCompactLoopContext)`；`reactiveCompactAfterContextExceeded(this, originalError,
  turnTraceContext, events, abortSignal, ReactiveCompactLoopContext)`；
  `estimateCurrentModelInputTokens(messages, sourceEntries?)`；组内三件
  `autoCompactDecisionLogContext(decision)` / `buildContextHistoryEntries(...)` /
  `rebuildContextPrefix(runtime, {model, turnRequestEntries})`（B50 调用）。
- **输出**：
  - **手动 /compact**：`beginActiveTurn(turnId, ..., "compact", false)` → info
    `compact.started` → `ensureSessionPersisted` → `TurnStarted` 事件（**`inputVisibility:
    "model-only"`**——维护命令不渲染 user bubble，注释钉明）→ `compactActiveConversation(
    {compactReason: UserRequested, phase: StandaloneTurn, sourceCommandId?/model?})` →
    `TurnComplete` 事件（`{response: displayText, tokenCount, usage, toolCallCount: 0,
    historyRoundCount: 1, duration, resultType: "success", cacheStats}`）→ `recordTurnUsageFact`
    → `turnNumber++` → `rebuildProjection()` → info `compact.completed` → `TurnResult`；
    失败路 `createTurnFailureError(error, abortSignal, "Compact failed")`，取消且非
    `preserveQueueAutoDrainOnCancel` 时**队列重暂停**（`queueAutoDrain = false` +
    `queueExternalDrainActive = false`，与 Stop 语义一致注释钉明）→ `appendTurnOutcomeEvent(
    {turnPhase: "compact", fallbackMessage: "Compact failed", logEvent: "compact.failed"})` →
    `recordTurnUsageFact`（cancelled/error）→ 抛 `coreError`；`finally finishActiveTurn`。
  - **autoCompactIfNeeded** → `"skipped" | "compacted" | "failed" | "rapid_refill_blocked"`：
    策略面 `AutoCompactPolicyConfig`（contextWindow + config.compact + `maxOutputTokens:
    resolveNormalRequestMaxOutputTokens({modelMaxOutputTokens})` + modelContextBudgetStrategy）；
    `shouldAutoCompact` 不命中 → debug `compact.auto.skipped` → `"skipped"`；
    `rapidRefill.shouldBlock` → warn `compact.rapid_refill_breaker`（trigger: Auto）→
    `"rapid_refill_blocked"`；命中 → info `compact.auto.started` → 压缩（`compactContextTelemetry:
    {inputTokens: decision.tokenCount, policyContextWindowTokens: decision.contextWindow,
    thresholdTokens, tokenSource}` + `autoCompactThreshold` + trigger Auto）→ skipped 短路 /
    `entries` 回写 `context.turnRequestState.entries` + `autoCompactConsecutiveFailures = 0` +
    info `compact.auto.completed` → `"compacted"`；取消冒泡，其余 `autoCompactConsecutiveFailures++`
    + warn `compact.auto.failed` → `"failed"`。
  - **reactiveCompactAfterContextExceeded** → `"skipped" | "compacted" | "failed"`：
    `config.compact.enabled === false` → warn `compact.reactive.skipped`（reason `"disabled"`）→
    `"skipped"`；`hasEnoughMessagesToCompact` 不足 → warn（reason `"not_enough_messages"`）→
    `"skipped"`；否则 warn `compact.reactive.started` → 压缩（`compactReason: ProviderOverflow`、
    `initialPromptTooLongCause: originalError`、`phase: Reactive`、`trigger: Reactive`、
    `policyContextWindowTokens` **有限正数取 `Math.floor(contextWindow)` 否则
    `DEFAULT_COMPACT_CONTEXT_WINDOW`**、tokenSource `provider_usage`/`estimate`）→ 成功回写
    entries + 复位失败计数 + info `compact.reactive.completed; retrying model request` →
    `"compacted"`；取消冒泡、其余失败计数 +1 + warn `compact.reactive.failed` → `"failed"`。
  - **`buildProviderUsageTokenOverride`**（内部）：`findLatestCommittedAssistantUsage` 命中且
    `messageIndex < messages.length` 才构造——`incrementalStartIndex` 在 `contextUsageTokens`
    存在时为 `messageIndex + 1` 否则 `messageIndex`；`providerBaseTokenCount =
    contextUsageTokens ?? inputTokens`；`tokenCount = base + incremental`（源码注释钉明：usage
    归属已提交 assistant、反向扫描随 history replacement 自然移动、不依赖绝对 cursor）。
    `estimateCurrentModelInputTokens` = override?.tokenCount ?? `estimateMessageTokens(messages)`。
- **错误语义**：见各路；取消一律冒泡。
- **时序与并发**：三路均先 `throwIfTurnAborted`；`compactActiveConversation` outcome
  `"skipped"` 短路不回写；turn-local compact 的 canonical 前缀保护见 B40。
- **幂等**：`autoCompactConsecutiveFailures` 复位/递增口径唯一；entries 回写一次。
- **资源释放**：`finishActiveTurn` 在 finally。
- **平台差异**：无。
- **状态所有者**：`autoCompactConsecutiveFailures`/`queueAutoDrain`/`queueExternalDrainActive`/
  `turnNumber`/`turnRequestState.entries` 写点见各路。
- **日志级别**：手动 started/completed `info`、failed 走 outcome 事件；auto skipped `debug`、
  started/completed `info`、breaker/failed `warn`；reactive skipped/started/failed `warn`、
  completed `info`。

## 事件序列五组（gate 握手样式标注；无 sleep/固定超时，同 tick 断言）

| 组 | 序列 | 载体条目 | 断言样式 |
| --- | --- | --- | --- |
| S1 模型步请求持久化序 | steer 日志 → 助手骨架 → step-start 分部 → ModelRequest 事件（push）→ finishPreparation → 协调器 → 请求 | B33 | gateNextAppend 逐拍握手；同 tick 断 createEvent/append 次序 |
| S2 模型步成功收尾序 | 诊断日志 → 推理分部（数组序）→ 文本分部 → ModelComplete 事件 → usage 记账 → machine 接纳 → drain 流式结果 → 三分支收尾 | B33/B34/B36/B40/B49 | 事件/分部交错顺序逐条；无 sleep |
| S3 工具批执行序 | 声明循环（closed 账本/合成错误）→ schedule 两段 → scheduled 事件 + queued 账本 → onBatchStart（分部+started）→ 结果归并 → nested usage → completeTool/aggregate → 逐结果（usage→媒体→终态→addToolResult→结果条目→checkpoint→anchor+committed→follow-up）→ 批收尾三分支 | B42–B48 | declarationIndex 序 + 账本状态序断言；gate 握手 |
| S4 停止收尾序 | commit 判定 →（丢弃路径 removeMessage+指针回滚）/（step-finish 分部 → 消息收尾）→ historyRound → 三分支（automation/guide/stop hooks） | B41/B49/B50 | stable 对赋值时刻断言（只在 break 前）；无 sleep |
| S5 紧凑恢复序 | 判定（auto/reactive）→ 熔断/跳过分支 → 压缩调用（telemetry 字段）→ entries 回写 + 失败计数 → completed 日志 | B37/B52 | 熔断与跳过分支事件字段逐项；同 tick |

## 语义常量对照表（续：compact/工具批尾批）

| 常量 | 值 | 所在 | 条目 |
| --- | --- | --- | --- |
| 手动 compact 输入可见性 | `"model-only"` | compact | B52 |
| 手动 compact 失败文案/事件 | `"Compact failed"` / `"compact.failed"` | compact | B52 |
| compact 生命周期事件 | `"compact.started"`/`"compact.completed"`/`"compact.auto.skipped"`/`"compact.auto.started"`/`"compact.auto.completed"`/`"compact.auto.failed"`/`"compact.rapid_refill_breaker"`/`"compact.reactive.skipped"`/`"compact.reactive.started"`/`"compact.reactive.completed"`/`"compact.reactive.failed"` | compact/turn-model-step-recovery | B52/B37 |
| `DEFAULT_COMPACT_CONTEXT_WINDOW` | deps 常量（reactive 非有限正 contextWindow 的 fallback） | compact | B52 |
| token override 来源 | `"provider_usage"` / `"estimate"` | compact | B52 |
| reactive 跳过 reason | `"disabled"` / `"not_enough_messages"` | compact | B52 |
| 空工具名投影 | `"empty_tool_name"`（+ `providerToolName` 保留原名） | tool-part-persistence | B48 |
| 工具用量 id 前缀 | `` `usage_tool_${sessionId}_${toolCallId}` `` | turn-tool-usage | B45 |
| 用量写失败事件 | `"usage.tool.write.failed"` | turn-tool-usage | B45 |
| 跟进 steer 事件 | `"tool.follow_up_user_input.queued"` / `"tool.follow_up_user_input.rejected"` | turn-tool-batch-follow-up | B44 |
| tool 停止/automation 限额事件 | `"tool.turn_control.stop"` / `"automation.create_limit.text_only_continuation"` | turn-tools | B42 |
| guide 回退 reasonCode | `"guide.noToolBoundary"` | turn-tools/turn-stop | B42/B49 |
| 嵌套用量 stopReason | `"tool_internal"` | turn-nested-model-usage | B51 |
| 异常告警类别 | `"tool_call_budget"` / `"repeated_tool_call"`（severity `"warning"`） | turn-tool-warnings | B46 |
