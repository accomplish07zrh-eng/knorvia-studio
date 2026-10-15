# core-runtime-methods-01 行为契约（v1）

> 每条 B 编号发布后不重用。九项字段固定为：**输入 / 输出 / 错误语义 / 时序与并发 / 幂等 / 资源释放 /
> 平台差异 / 状态所有者 / 日志级别**。条目与测试的对应关系见 [`README.md`](README.md) 的对照表。
> 范围：`apps/cli/packages/core/src/runtime/methods/` 下 21 个继承文件（模型调用与流式事件）。

## A 模型请求组装与执行

### B1 模型请求组装与投影管线（`model.ts` 的 `runModelTextRequest`）

- **输入**：`this: AgentRuntimeInternal` + `RunModelTextRequestOptions`（messages、tools、model、
  traceContext、abortSignal、assistantMessageId、可选 maxOutputTokens / latestRealUserMessageIndex /
  streamRecovery / onModelNetworkStatus / onStreamSnapshot / onStreamTextDelta /
  onStreamReasoningDelta / onStreamToolCall / events）。
- **输出**：`RuntimeModelTextResult`——请求组装先经三段投影：媒体附件路径物化（artifact 库回填）→
  输入格式能力投影（按 `model.properties.inputFormat`）→ 媒体预算投影（按
  `latestRealUserMessageIndex` 保护最近真实用户消息）；投影未改动消息时 options 保持原对象。
  组装出的请求只含 `messages`、`tools`、`abortSignal`，且仅当 `maxOutputTokens !== undefined` 时
  附加 `options.maxOutputTokens`。返回值在有内容时附加 `contextUsageBreakdown`，流式分支
  `toolCalls`/`reasoning` 为空时省略该键（`undefined`），非流式分支 `toolCalls` 经
  `normalizeModelToolCallsForRuntime` 归一。
- **错误语义**：投影与组装不吞错；模型层异常（含 `normalizeStreamError` 归一后的流错误）原样
  冒泡给调用方，不由本函数转换。
- **时序与并发**：单请求内严格顺序：三段投影 → 打三类媒体/预算日志 → 组装 invocationContext
  （其中 `modelRequestSessionType` 由 `this.config.taskType` 实时解析；`modelCall.operation`
  固定 `"agent_step"`、`operationId` 取 `traceContext.spanId`；有 `streamRecovery` 时
  `callCause: "recovery"` 且 `attributes.streamRecoveryNumber` 取 `retryNumber`）→
  `contextUsageSnapshot`/`contextUsageBreakdown` 计算 → 按 `shouldStreamModelText()` 二分
  `generateText` 或 `streamText`。`beginLocalTurnPreparation(traceContext, "request_assembly")`
  的收尾在流式分支首个事件 await 前调用（`completeAssembly()`），非流式分支由装配器自管。
- **幂等**：函数自身不改共享状态；同输入 + 同模型适配器响应得到结构等价输出。
- **资源释放**：不持有句柄；`abortSignal` 全程透传给模型请求。
- **平台差异**：与平台无关（纯内存投影与调用编排）。
- **状态所有者**：会话事件数组 `options.events` 由调用方持有，本函数只按 B8/B9 追加；
  上下文用量快照由 runtime 的 `buildContextUsageSnapshot` 持有。
- **日志级别**：媒体能力投影 `debug`（`model.request.media_capability_projection`）、媒体预算投影
  `debug`（`model.request.media_projection`）、媒体摘要 `debug`、token 限额 `debug`
  （`model.request.token_limits`，见 B4）；上下文用量快照日志由 runtime 既有通道输出。

### B2 流式分支的事件映射与终止语义（`model.ts`）（事件序列）

- **输入**：模型适配器的 `streamText` 异步事件流（`start`/`text_start`/`text_delta`/`text_end`/
  `reasoning_start`/`reasoning_delta`/`reasoning_end`/`tool_input_start`/`tool_input_delta`/
  `tool_input_end`/`tool_call`/`finish`/`error`）+ B1 的 options。
- **输出**：按事件映射逐条入流式事件队列（kind 与事件一一对应：`start`、`text_start`、
  `text_delta`、`text_end`、`reasoning_start`、`reasoning_delta`、`reasoning_end`、
  `tool_input_start`（带 `providerExecuted`/`toolCallId`/`toolName`）、`tool_input_end`
  （带 `toolCallId`）、`tool_call`（带 `input`/`toolCallId`/`toolName`）、终止事件 `finish`/
  `error`（`done: true`））；`text_delta`/`reasoning_delta` 累积进结果并触发
  `onStreamTextDelta`/`onStreamReasoningDelta` 与 `onStreamSnapshot`（`{reasoning, text}`）。
- **错误语义**：`error` 事件先冲刷全部工具输入缓冲并入终止事件，再抛 `normalizeStreamError`
  归一后的错误；循环内任何异常（含队列写入失败）走 catch：`queue.drain()` 后**原样重抛**。
  `tool_call` 事件经归一化后为空则跳过（不入账）；重复的同一 `toolCallId`（`finalToolCallIds`
  已含）不重复入账。
- **时序与并发**（事件序列 · 流事件消费序列）：事件严格按适配器产生顺序消费；队列写入串行
  （B7）；`finish` 事件先 `flushAllToolInputs()` 再入终止事件；流正常结束后 `queue.drain()`
  等待全部落盘完成才组装返回值。**消费顺序是契约**：同一 `tool_call` 的
  `tool_input_delta` 缓冲冲刷（`flushToolInput`）先于该 `tool_call` 事件入队。
- **幂等**：同一事件流重复消费得到等价输出；`finalToolCallIds` 去重保证工具调用不重复。
- **资源释放**：异常与正常路径都 `drain()` 队列；不持有句柄。
- **平台差异**：与平台无关。
- **状态所有者**：流状态（reasoning/toolCalls/缓冲）由 B10 的 `createModelRequestStreamState`
  持有；事件数组 `options.events` 归调用方。
- **日志级别**：`tool_input_start`（`model.streaming.tool_input_start`）、`tool_input_end`
  （`model.streaming.tool_input_end`）、`tool_call`（`model.streaming.tool_call`，含
  `inputKeys`）为 `debug`；错误不在此处打日志（由上层错误通道负责）。

## B 请求元数据、限额与状态观测

### B3 会话类型与重试预算解析（`model-request-session-type.ts`）

- **输入**：`SessionTaskType | undefined`（`subagent_child` / `workflow_child` /
  `nested_workflow_child` / 其余或缺省）。
- **输出**：`resolveModelRequestSessionTypeFromTaskType`——`subagent_child` →
  `ModelRequestSessionType.Subagent`；`workflow_child` 与 `nested_workflow_child` →
  `ModelRequestSessionType.Other`（workflow child 不是 subagent，服务端统计统一归
  `other`）；其余（含 `undefined`）→ `ModelRequestSessionType.Main`。
  `resolveModelRetryBudgetFromTaskType`——`workflow_child`/`nested_workflow_child` →
  `ModelRetryBudget.Unbounded`（模型错误不是 workflow 错误，runner 最大努力恢复）；
  其余（主会话、subagent、fork 等）→ `ModelRetryBudget.Default`（沿用 adapter 默认预算）。
- **错误语义**：不抛异常；未知取值按「其余」分支归一。
- **时序与并发**：同步纯函数。
- **幂等**：是。
- **资源释放**：无。
- **平台差异**：与平台无关。
- **状态所有者**：无。
- **日志级别**：无日志。

### B4 模型请求 max output token 限额（`model-token-limits.ts`）

- **输入**：`resolveNormalRequestMaxOutputTokens({modelMaxOutputTokens})`；
  `resolveModelStepMaxOutputTokens({baselineMaxOutputTokens, contextWindow,
estimatedCurrentUsage, modelContextBudgetStrategy})`；`modelRequestTokenLimitLogContext`
  （contextWindow / maxOutputTokens / modelContextBudgetStrategy / traceContext）。
- **输出**（语义常量）：normal 两级中的第一级——模型未声明输出预算（`undefined`、非有限数或
  ≤ 0）时默认 **32,000**（`DEFAULT_NORMAL_REQUEST_MAX_OUTPUT_TOKENS`，仅默认值，不是全局上限）；
  已解析到模型值时**原样取 `Math.floor` 后的正数值**（64K 模型不得被裁剪为 32K）。
  第二级 step cap：`contextWindow` 缺失/非有限/≤ 0 或 `estimatedCurrentUsage` 非有限/负数时
  原样返回 `baselineMaxOutputTokens`；否则
  `estimatedAvailable = floor(contextWindow - estimatedCurrentUsage - 1,000)`（**预留 1,000**），
  ≤ 0 时同样回 `baselineMaxOutputTokens`（本地估算不是 provider 权威拒绝，保留既有错误恢复），
  否则返回 `min(baselineMaxOutputTokens, estimatedAvailable)`。`modelContextBudgetStrategy`
  仅作入参兼容（`legacy` 同样按 preflight 口径计算）。
  `modelRequestTokenLimitLogContext` 返回 trace 上下文 + `event: "model.request.token_limits"`、
  `module: "core.runtime"`、`contextWindow`、`maxOutputTokens`、`inputBudgetTokens`
  （`max(0, floor(contextWindow) - floor(maxOutputTokens))`，任一缺失或非法为 `undefined`）、
  `modelContextBudgetStrategy` 恒取 `@knorvia/shared` 的
  `DEFAULT_KNORVIA_MODEL_CONTEXT_BUDGET_STRATEGY`（不透传入参值）。
- **错误语义**：不抛异常；非法数值一律走「回 baseline / 回默认」分支。
- **时序与并发**：同步纯函数。
- **幂等**：是（token 记账口径：入参预算按 floor 取整，剩余窗口扣 1,000 安全垫）。
- **资源释放**：无。
- **平台差异**：与平台无关（数值计算）。
- **状态所有者**：无（限额入参由调用方每步计算）。
- **日志级别**：本模块不打日志；`modelRequestTokenLimitLogContext` 供 `model.ts` 以 `debug`
  记录（B1）。

### B5 模型请求前的运行时请求头刷新（`model-runtime-headers.ts`）

- **输入**：`createRefreshRuntimeHeadersBeforeModelAttempt(runtime, {abortSignal, model,
traceContext})`；返回的刷新函数按 attempt 接收 `{accountAccess?, attempt, reason?,
abortSignal?}`。
- **输出**：`runtime.providerRuntimeHeadersPort` 缺席，或端口的
  `shouldRefreshBeforeModelRequest({providerId, modelId})` 显式返回 `false`（缺省视为 `true`）时
  返回 `undefined`（不装刷新钩子）；否则返回异步刷新函数，结果透传端口的
  `{headersApplied, requestAuth?}`。刷新参数固定：`reason` 缺省 `"model-request"`、
  `sessionId` 取 `runtime.sessionId`（child runtime 经派生端口改写为根会话）、
  `turnId` 取 `traceContext.turnId`、`abortSignal` 优先 attempt 级再回退构造级。
- **错误语义**：端口返回 `headersApplied` 非真时**抛错**
  `Provider runtime headers were not applied before model request attempt.`（每个真实请求
  attempt 发送前必须刷新，不得复用旧鉴权材料）；端口自身异常原样冒泡。
- **时序与并发**：每次 attempt 调用一次（含 adapter 内部重试、WebSearch/native 工具请求、
  标题/compact 等单独模型请求）；单次 await，无内部并发。
- **幂等**：刷新动作幂等性由端口保证；本工厂只保证参数一致。
- **资源释放**：不持有句柄。
- **平台差异**：与平台无关。
- **状态所有者**：鉴权材料状态在 `providerRuntimeHeadersPort`。
- **日志级别**：刷新成功 `debug`（`model.request.runtime_headers_refreshed`，含 `attempt`、
  `providerId`、`headersApplied`）；失败抛错不打日志。

### B6 模型网络状态 sink 与状态日志（`model-status.ts`）

- **输入**：`createModelStatusSink(this, traceContext, events, {onStatus?, streamRecovery?})`
  产出 `ModelStatusSink`；`publish(statusEvent)` 接收 `ModelNetworkStatusEvent`（7 种 type：
  `model_request_queued`、`model_request_admitted`、`model_request_started`、
  `model_request_completed`、`model_request_failed`、`model_retry_scheduled`、
  `model_stream_stalled`）。
- **输出**：`publish` 顺序固定——① 若构造时给了 `streamRecovery`，先把
  `streamRecovery` 字段并入事件载荷；② 调 `options.onStatus?.(载荷)`；③
  `logModelNetworkStatus(载荷, traceContext)`；④ `createEvent(SessionEventType.ModelNetworkStatus,
载荷, traceContext)` + `await appendEvent`；⑤ `events.push(event)`。
  `logModelNetworkStatus` 的公共元数据字段固定：`attempt`、`baseURL`、`maxAttempts`、`modelId`、
  `providerId`、`providerKind`、`requestId`、`transport` 以及
  `streamRecoveryAnchorId`/`streamRecoveryFromRequestId`/`streamRecoveryMaxRetries`/
  `streamRecoveryRetryNumber`（取 `statusEvent.streamRecovery?.anchorId/recoveredFromRequestId/
maxRetries/retryNumber`）+ trace 上下文。
- **错误语义**：`appendEvent` 失败原样冒泡（`onStatus` 与日志已完成——先观测后持久化）；
  未知 `type` 只输出公共元数据、不打类型日志。
- **时序与并发**：`publish` 为异步串行（一次一个状态事件）；日志在事件持久化**之前**。
- **幂等**：同一状态事件重复 publish 会重复记录（调用方去重）；日志内容由事件值决定。
- **资源释放**：无。
- **平台差异**：与平台无关。
- **状态所有者**：`events` 数组归调用方；状态事件持久化进会话事件存储（B22 起）。
- **日志级别**（语义常量 · 每 type 的 level/label/event）：`model_request_queued` → `debug`
  （`Model network request queued for admission` / `model.network.queued`，`status: "waiting"`）；
  `model_request_admitted` → `debug`（`model.network.admitted`，`queuedMs`、
  `status: "started"`）；`model_request_started` → `debug`（`model.network.started`）；
  `model_request_completed` → `info`（`model.network.completed`，`durationMs`、
  `finishReason`、`status: "completed"`）；`model_request_failed` → `warn`
  （`model.network.failed`，`durationMs`、`reason`、`retryable`、`statusCode`、
  `statusMessage`，`status` 为 `reason === "cancelled"` 时 `"cancelled"` 否则 `"failed"`）；
  `model_retry_scheduled` → `warn`（`model.network.retry_scheduled`，`delayMs`、
  `nextAttempt`、`reason`、`statusCode`、`statusMessage`、`status: "waiting"`）；
  `model_stream_stalled` → `warn`（`model.network.stream_stalled`，`idleMs`、`timeoutMs`、
  `statusMessage`、`status: "waiting"`）。

## C 流式事件队列与流状态

### B7 模型流式事件写入队列（`model-streaming-event-queue.ts`）（事件序列）

- **输入**：`createModelStreamingEventQueue({events, runtime, traceContext, highWaterMark?})`；
  `enqueue(payload)` 接收 `ModelStreamingPayload`。
- **输出**：队列把每个 payload 交给 `runtime.emitModelStreamingEvent(payload, traceContext,
events)`（B8），**写入严格串行**（promise 尾链）；`drain()` 等尾链清空；
  `maybeApplyBackpressure()` 在未达高水位时立即返回，否则等尾链。
- **错误语义**：任一写入失败被记为队列级失败（`failure`）：后续 `enqueue`/`drain`/
  `maybeApplyBackpressure` 都抛该首个失败原因；失败后不再执行后续写入（尾链吞掉）。
- **时序与并发**（事件序列 · 进入顺序）：**进入顺序 = `enqueue` 调用顺序**，与完成顺序无关；
  落盘完成顺序与进入顺序一致（串行尾链）。高水位默认
  `MODEL_STREAMING_EVENT_WRITE_HIGH_WATER_MARK = 128`（可注入覆盖）。
- **幂等**：`enqueue` 不去重；同一 payload 重复入队会重复写入。
- **资源释放**：`drain()` 后无悬挂 promise；无句柄。
- **平台差异**：与平台无关。
- **状态所有者**：队列内部持有 pending 计数、失败原因与尾链；事件数组归调用方。
- **日志级别**：无日志（落盘日志在 B8/上层）。

### B8 流式事件落盘（`model-streaming-event.ts` 的 `emitModelStreamingEvent`）

- **输入**：`this: AgentRuntimeInternal` + `ModelStreamingPayload` + `traceContext` +
  `events: SessionEvent[]`。
- **输出**：`createEvent(SessionEventType.ModelStreaming, payload, traceContext)` →
  `await appendEvent(event, traceContext)` → `events.push(event)`（先持久化后入数组）。
- **错误语义**：`appendEvent` 失败原样冒泡（由 B7 队列捕获为队列级失败）。
- **时序与并发**：单事件串行（队列保证）；持久化完成才进 `events` 数组。
- **幂等**：不去重，重复调用重复记录。
- **资源释放**：无。
- **平台差异**：与平台无关。
- **状态所有者**：`events` 数组归调用方；持久化在会话事件存储。
- **日志级别**：无日志。

### B9 推理块的按需创建（`reasoning-stream.ts` 的 `getOrCreateReasoningBlock`）

- **输入**：`{id?, providerMetadata?, reasoning, reasoningById}`（reasoning 数组与按 id 索引的
  Map，两者成对提供）。
- **输出**：按 `id`（缺省 `"__knorvia_default_reasoning__"`，语义常量
  `DEFAULT_REASONING_STREAM_ID`）查 `reasoningById`；命中返回既有块；未命中创建
  `{type: "reasoning", text: "", providerOptions: providerMetadata}` 并**同时**登记进 Map 与
  数组尾部。Anthropic 兼容供应商可只发 reasoning delta 不发 start——同 id 的后续 delta 复用
  该块（text 追加），供 tool_result 重放 assistant thinking。
- **错误语义**：不抛异常。
- **时序与并发**：同步；块的追加顺序 = 首次出现顺序。
- **幂等**：同 id 不重复建块。
- **资源释放**：无。
- **平台差异**：与平台无关。
- **状态所有者**：调用方持有的 `reasoning` 数组与 `reasoningById` Map（B10）。
- **日志级别**：无日志。

### B10 流请求状态与工具输入缓冲（`model-request-stream-state.ts` 的 `createModelRequestStreamState`）

- **输入**：`(runtime, options)`；返回流状态句柄：`queue`（B7）、`reasoning`/
  `reasoningById`（B9）、`toolCalls`、`finalToolCallIds`、`toolInputBuffers` 与
  `enqueue`/`enqueueTerminal`/`bufferToolInput`/`flushToolInput`/`flushAllToolInputs`。
- **输出**：`enqueue` = 入队 + `maybeApplyBackpressure()`（B7）；`enqueueTerminal` = 入队 +
  `drain()`（终止事件后立即排空）；`bufferToolInput(id, delta)` 累积 delta（空 delta 忽略），
  当缓冲含 `\n`、`\r`、`\\n`、`\\r` 之一或长度 ≥ **4,096** 时立即 `flushToolInput(id)`；
  `flushToolInput(id)` 把缓冲作为一条 `tool_input_delta` 事件入队（空缓冲 no-op）并打
  `debug`（`model.streaming.tool_input_delta.flush`，`deltaLength`）；`flushAllToolInputs()`
  按当前缓冲键序逐个 flush。
- **错误语义**：队列失败按 B7 语义从 `enqueue`/`enqueueTerminal`/flush 系列冒泡。
- **时序与并发**（事件序列 · 进入顺序）：工具输入 delta 的入队顺序 = 冲刷顺序 = 缓冲累积顺序；
  冲刷先于同一调用的 `tool_call` 事件（B2）。
- **幂等**：flush 后缓冲清空，重复 flush no-op。
- **资源释放**：无句柄；缓冲在 flush 后删除。
- **平台差异**：换行判定同时覆盖 `\n`/`\r` 与转义串 `\\n`/`\\r`（JSON 流式输入），与平台无关。
- **状态所有者**：流状态由本工厂创建的对象持有（一次性请求生命周期）。
- **日志级别**：冲刷 `debug`（见上）；其余无日志。

### B11 流结果体检：上下文超限与可疑空响应（`model-request-stream-state.ts` 的 `inspectModelRequestStreamResult`）

- **输入**：`(runtime, {finishReason, providerMetadata, usage, text, toolCalls}, modelSelection,
options)`。
- **输出**：`rawFinishReason = readRawFinishReason(providerMetadata)`；
  `outputTokenLimit = isOutputTokenLimitFinishReason(finishReason, rawFinishReason)`；
  `contextExceeded = toolCalls.length === 0 && !outputTokenLimit &&
isContextExceededFinishReason(...)`。命中 contextExceeded 打 `warn`
  （`model.runtime.stream.context_exceeded`，含 `finishReason`、`rawFinishReason`、
  `modelProviderId`、`modelId`、`textLength`、`toolCallCount`）；否则非 outputTokenLimit 且
  `isSuspiciousEmptyModelResult(finishReason, text.length, toolCalls.length, usage)` 命中时打
  `warn`（`model.runtime.stream.suspicious_empty` + `buildSuspiciousEmptyDiagnostics` 诊断字段）
  并调 `finalizeSuspiciousEmptyModelResult` 走既有收尾。
- **错误语义**：不抛异常（收尾转换由 helpers 的 finalize 通道负责）；有工具调用或输出截断时
  不判 contextExceeded。
- **时序与并发**：同步；在流结束、队列 drain 后调用（B2）。
- **幂等**：同一结果重复检查重复打日志，无状态变更（除 finalize 的既有语义）。
- **资源释放**：无。
- **平台差异**：与平台无关。
- **状态所有者**：无（诊断只落日志）。
- **日志级别**：两种命中均 `warn`；无命中不打日志。

## D 模型句柄与调用上下文

### B12 运行时模型句柄与调用上下文合并（`runtime-model.ts`）

- **输入**：`createRuntimeModel(runtime, input)`（`RuntimeModelFactoryInput` 去掉必选
  `selection` 约束，`selection` 可 `undefined`）；`withModelInvocationContext(model,
createContext)`（`createContext: (request) => ModelInvocationContext`）。
- **输出**：`createRuntimeModel`——`selection` 缺失时抛 `createCoreError(
CoreErrorType.ConfigurationError, "Select a model before continuing", {recoverable: true})`
  （仅执行入口拒绝缺失选择）；否则经 `runtime.modelFactory` 造模型并包一层
  `withRuntimeInvocationLayer`：调用上下文在句柄工厂**绑定一次**，含
  `modelRetryBudget: resolveModelRetryBudgetFromTaskType(runtime.config.taskType)`（B3）与
  （仅当 `runtime.modelRequestAdmission !== undefined` 时）`modelRequestAdmission`。
  `withModelInvocationContext` 返回 `Object.freeze` 的包装模型：透传
  `providerId/modelId/displayName/properties/optionSpecs/options`；`bind(options)` 对绑定结果
  **递归再包**同一上下文层；`generateText`/`streamText` 在
  `{...getCurrentModelInvocationContext(), ...createContext(request)}` 合并上下文下调用内层
  （**后写覆盖先写**：runtime 层压过调用层；无逐调用退出口，不想受准入闸门约束的 runtime
  本就不带准入端口）。
- **错误语义**：选择缺失抛上述 `ConfigurationError`（`recoverable: true`）；模型调用错误原样
  冒泡。
- **时序与并发**：同步工厂；上下文合并发生在每次 generateText/streamText 调用的同一异步上下文
  （`runWithModelInvocationContext`），流式期间上下文保持有效。
- **幂等**：同输入重复包装得到结构等价句柄；上下文合并是纯计算。
- **资源释放**：无句柄泄漏；包装对象冻结不可变。
- **平台差异**：与平台无关。
- **状态所有者**：调用上下文在 `runWithModelInvocationContext` 的上下文槽（deps 层）；
  准入与预算在句柄工厂一次性绑定。
- **日志级别**：无日志。

## E 取消与流恢复

### B13 取消流快照持久化（`cancelled-stream-persistence.ts`）（事件序列）

- **输入**：`persistCancelledStreamSnapshot(runtime, {assistantCreatedAt, assistantMessageId,
snapshot, traceContext})`（snapshot 含 `reasoning` 块数组与 `text`）。
- **输出**（持久化记录口径）：`completedAt = Date.now()` 只取一次；先逐块持久化 reasoning——
  仅当 `hasAssistantReasoningContent(reasoning)` 为真（空推理块跳过），每块 `persistPart` 一个
  `type: "reasoning"` 分部（`id: createPartId()`、`sessionID: runtime.sessionId`、
  `messageID: assistantMessageId`、`text`、`metadata: reasoning.providerOptions`、
  `time: {start: assistantCreatedAt, end: completedAt}`）；随后 `snapshot.text` 非空时持久化一条
  `type: "text"` 分部（同样 time 区间，无 metadata）；text 为空则到此为止。
- **错误语义**：`persistPart` 失败原样冒泡，中断后续分部（部分持久化由存储层语义决定）。
- **时序与并发**（事件序列 · 持久化记录序）：**严格顺序**——reasoning 块按数组序逐条 await
  持久化，text 分部在其后；持久化顺序 = 记录顺序，无并发。
- **幂等**：每次调用生成新 `createPartId()`，重复调用重复落盘（去重由调用方负责）。
- **资源释放**：无句柄。
- **平台差异**：与平台无关。
- **状态所有者**：消息分部存储（`runtime.persistPart`）；本函数无状态。
- **日志级别**：无日志。

### B14 流恢复预算与尝试记账（`streaming-recovery.ts` 的预算/尝试三函数）

- **输入**：`RegularTurnLoopState`（持有 `streamRecoveryRetryCount`）。
- **输出**（语义常量）：`STREAM_RECOVERY_MAX_RETRIES = 10`；
  `hasStreamRecoveryBudget(state)` ⟺ `state.streamRecoveryRetryCount < 10`；
  `beginStreamRecoveryAttempt(state)` 先把计数 +1 再返回
  `{retryNumber: 计数, maxRetries: 10}`；`beginStartPlanBusyAdmissionRetryAttempt(state)`
  同样 +1，返回 `{retryNumber: 计数, maxRetries: 2}`（2 = Start Plan 主回合准入退避档数
  `START_PLAN_BUSY_MAIN_TURN_ADMISSION_RETRY_DELAYS_MS.length`）。
- **错误语义**：不抛异常；预算耗尽由调用方据 `hasStreamRecoveryBudget` 判定后走
  `createStartPlanBusyAutoRetryExhaustedError`（B15）或终止。
- **时序与并发**：同步；计数单调递增，调用方串行使用（同一回合状态非并发安全）。
- **幂等**：非幂等（每次调用消耗一次预算）。
- **资源释放**：无。
- **平台差异**：与平台无关。
- **状态所有者**：`RegularTurnLoopState.streamRecoveryRetryCount`（回合循环状态机）。
- **日志级别**：无日志。

### B15 Start Plan busy 判定、退避与耗尽错误（`streaming-recovery.ts`）

- **输入**：错误对象（可含 `cause` 链）；`getStartPlanBusyAdmissionRetryDelayMs({error,
providerId, state, turnNumber})`。
- **输出**（语义常量）：错误 cause 链遍历深度上限 `MAX_ERROR_CAUSE_DEPTH = 6`
  （含环检测；从顶层起至多 7 个记录）；busy 判定 `isStartPlanBusyStreamRecoveryFailure`
  ⟺ 链上任一记录的 `providerCode`/`code`（记录本身或其 `context` 内，字段优先级
  `providerCode` → `context.providerCode` → `code` → `context.code`）命中 busy 码
  **`"3008" | "3009" | "3010"`**。`getStartPlanBusyAdmissionRetryDelayMs` 同时满足
  ① `turnNumber > 0`；② `providerId` 为 **`account:bigmodel-start-plan`** 或
  **`account:zai-start-plan`**；③ 错误命中 busy 判定时，返回退避表
  **`[1_000, 2_000]`**（`START_PLAN_BUSY_MAIN_TURN_ADMISSION_RETRY_DELAYS_MS`）按下标
  `state.streamRecoveryRetryCount` 取值（越界为 `undefined`）；任一条件不满足返回 `undefined`。
  `createStartPlanBusyAutoRetryExhaustedError(error)` 返回错误：
  `message` = 导出常量 **`START_PLAN_BUSY_AUTO_RETRY_EXHAUSTED_MESSAGE`**（
  `"Start Plan is busy and automatic model stream recovery reached the maximum retry count."`）、
  `name = "StartPlanBusyAutoRetryExhaustedError"`、`code = "model_rate_limited"`、
  `context = {providerCode, reason: "rate_limited", retryable: false,
startPlanBusyAutoRetryExhausted: true}`（`providerCode` 取链上首个 busy 码，未命中回默认
  **`"3010"`**）、`cause` 仅当入参是 `Error` 时挂原错误。
- **错误语义**：本组不抛异常（只判定与构造）。
- **时序与并发**：同步纯判定。
- **幂等**：判定幂等；构造的错误对象每次新实例。
- **资源释放**：无。
- **平台差异**：与平台无关（错误码字符串匹配）。
- **状态所有者**：无（退避档位消耗由 B14 的计数体现）。
- **日志级别**：无日志。

### B16 流恢复事件组与锚点选择（`streaming-recovery.ts` 的 emit\* 两函数）（事件序列）

- **输入**：`emitStreamRecoveryStarted(runtime, state, {assistantMessageId, failedRequestId?,
traceContext}, error, recoveryAttempt)`；
  `emitStreamRecoveryRetryEvents(runtime, state, 同 options, recovery)`（recovery =
  尝试信息 + `discardedReasoningBytes`/`discardedTextBytes` + `reason` + `toolCallIds`）。
- **输出**：`emitStreamRecoveryStarted` 发
  `SessionEventType.StreamRecoveryStarted`，载荷字段序：
  `attemptId`（`createStreamingToolAttemptId(assistantMessageId)`，id 后缀规则沿用 helpers
  `streaming-tool-ledger` 的 attempt id 口径）、`assistantMessageId`、
  `failureKind`（`provider_timeout`/`provider_network_error`/`provider_stream_error`/`unknown`，
  判定规则见下）、`message`（Error 取 `error.message`，否则 `String(error)`）、
  `retryNumber`、`maxRetries`，可选 `failedRequestId`。
  `failureKind` 判定（cause 链内任一记录命中）：`reason === "stream_idle_timeout"` 或
  `code === "model_request_timeout"`/`"MODEL_REQUEST_TIMEOUT"` 或
  `name === "ModelStreamIdleTimeoutError"` 或 message 匹配 `timeout|timed out|stalled` →
  `provider_timeout`；`reason === "network_error"` 或 `code === "model_network_error"`/
  `"MODEL_NETWORK_ERROR"` 或 message 匹配 `ECONNRESET|EPIPE|ETIMEDOUT` →
  `provider_network_error`；否则 `Error` 实例 → `provider_stream_error`，非 Error → `unknown`。
  `emitStreamRecoveryRetryEvents` 的锚点：`toolCallIds` 末位存在时
  `anchorId = createStreamRecoveryAnchorId(assistantMessageId, 末位 toolCallId)`，否则
  **`` `${assistantMessageId}:previous-message-anchor` ``**。随后**按序**发三个事件（每个
  `appendEvent` 成功后才 `state.events.push`）：
  ① `StreamRecoveryAnchorSelected`——`{attemptId, anchorId, reason, committedToolCallIds:
toolCallIds}`（`reason` 串取 `"latest_committed_tool_result" | "no_tool_committed"`）；
  ② `StreamRecoveryTailDiscarded`——`{attemptId, anchorId, assistantMessageId,
discardedReasoningBytes, discardedTextBytes, discardedToolCallIds: []}`（固定空数组）；
  ③ `StreamRecoveryRetryStarted`——`{attemptId, anchorId, retryNumber, maxRetries,
streamMode: "sse"}` + 可选 `failedRequestId`。最后写
  `state.pendingStreamRecoveryRequest = {attemptId, anchorId, maxRetries, retryNumber}` +
  可选 `recoveredFromRequestId: failedRequestId`（事件与 pending identity 读取同一 live
  options）。
- **错误语义**：`appendEvent` 失败原样冒泡，中断后续事件（已发事件不回滚）。
- **时序与并发**（事件序列 · 进入顺序）：三事件的**进入顺序 = 完成顺序 = AnchorSelected →
  TailDiscarded → RetryStarted**（逐个 await，无并发交错）；`state.events.push` 在各自
  `appendEvent` 完成后；pending identity 在三事件全部落盘后写。
- **幂等**：不去重，重复调用重复发事件；`attemptId`/`anchorId` 由入参确定性推出。
- **资源释放**：无句柄。
- **平台差异**：与平台无关。
- **状态所有者**：`RegularTurnLoopState.events` 与 `pendingStreamRecoveryRequest`。
- **日志级别**：无日志（观测经事件持久化）。

### B17 部分输出失败的流恢复编排（`streaming-recovery.ts` 的 `recoverPartialAssistantOutputFailure`）

- **输入**：`{abortController, assistantCreatedAt, discardedReasoningBytes, discardedTextBytes,
error, options: {assistantMessageId, failedRequestId?, model, traceContext}, runtime, state,
turnAbortListener}`。
- **输出**：返回 `boolean`。**短路**：`discardedReasoningBytes + discardedTextBytes <= 0` 或
  错误不满足可重试判定（见下）→ `false`（不 abort、不发事件）。否则顺序执行：
  ① `abortController.abort()`；② `beginStreamRecoveryAttempt(state)`（B14）；
  ③ `emitStreamRecoveryStarted`（B16）；④ `persistAssistantMessage(assistantMessageId,
state.currentUserMessageId, assistantCreatedAt, {completed: Date.now(), error: {
name: STREAM_RECOVERY_DISCARDED_ERROR_NAME, data: {message: "Partial assistant output was
discarded before a streaming retry.", retryNumber}, finish: STREAM_RECOVERY_DISCARDED_FINISH},
traceContext, model)`（丢弃标记的持久化记录口径）；⑤ 重置 `state.modelResponse = ""`、
  `state.modelStepCount += 1`、`recordModelHistoryRound(state)`，turnMachine 连续两步
  `receiveModelResponse("")` → `aggregateResults()`（各包一层 `TurnMachineImpl`）；
  ⑥ `emitStreamRecoveryRetryEvents` 固定 `reason: "no_tool_committed"`、`toolCallIds: []`
  （B16）；⑦ `turnAbortSignal.removeEventListener("abort", turnAbortListener)`；
  返回 `true`。可重试判定（`retryableFailure`，cause 链 ≤ 深度 6）：任一记录或其 `context`
  `retryable === true`；或 `code`/`context.code` 命中瞬变码集 `{model_request_timeout,
model_rate_limited, model_server_error, model_network_error, MODEL_REQUEST_TIMEOUT,
MODEL_RATE_LIMITED, MODEL_SERVER_ERROR, MODEL_NETWORK_ERROR}`；或 `reason`/`context.reason`
  命中 `{stream_idle_timeout, rate_limited, server_error, network_error, timeout}`；或
  `name === "ModelStreamIdleTimeoutError"`；或 message 匹配
  `\b(stream idle|stream stalled|timeout|timed out|ECONNRESET|EPIPE|ETIMEDOUT)\b`（忽略大小写）。
- **错误语义**：持久化/事件失败原样冒泡（中途失败不回滚已写记录）；判定本身不抛。
- **时序与并发**：串行编排；abort 先于一切记录；丢弃标记先于恢复事件组。
- **幂等**：非幂等（消耗预算、改 turn 状态）；调用方保证一次失败只恢复一次。
- **资源释放**：⑦ 移除 abort 监听（防悬挂监听泄漏）。
- **平台差异**：与平台无关。
- **状态所有者**：`RegularTurnLoopState`（模型轮计数、turnMachine、pending identity）。
- **日志级别**：无日志（丢弃与重试都以事件持久化体现）。

## F 流式工具协调与执行

### B18 流式工具准入、接受与 delta 记账（`streaming-tool-coordinator.ts`）

- **输入**：`createStreamingToolCoordinator(runtime, state, {assistantMessageId, model,
traceContext})` 产出协调器：`accept(toolCall)`、`abandon(reason)`、`drain(toolCalls)`、
  `recordReasoningDelta(text)`、`recordTextDelta(text)`、`recoverFromModelFailure(...)`。
- **输出**：`accept` 保存声明副本后按准入判定（`permitsStreamingLaunch`，语义常量）决定是否
  **流中启动**执行：`toolCall.providerExecuted` 为真、`name.trim()` 为空、
  `runtime.config.modelStreaming !== "on"`、`runtime.config.streamingToolExecution` 为 `"off"`
  （缺省按 **`"readOnly"`** 即 `STREAMING_TOOL_EXECUTION_MODE`）、registry 无该工具、或工具
  元数据不满足「`readOnly` 且 `concurrentSafe` 且非 `destructive` 且非 `needsApproval` 且非
  `requiresUserInteraction` 且 `sideEffectScope === "none"`」（`permission.sideEffectScope`
  优先于 `metadata.sideEffectScope`）之一 → 不流中启动（留给流末统一执行）。启动时调
  `executeStreamingTool`（B20），`declarationIndex` = 声明登记序（`declarations.size - 1`）；
  同一 `toolCall.id` 不重复启动。`recordReasoningDelta`/`recordTextDelta` 按 **UTF-8 字节数**
  （`TextEncoder().encode().byteLength`）累计 `discardedReasoningBytes`/`discardedTextBytes`。
- **错误语义**：流中执行抛错只 `warn`（`tool.streaming.execution_failed`，`status: "failed"`，
  文案 `Streaming tool execution fell back to end-of-stream execution`）并回 `undefined`——
  **降级为流末执行**，不冒泡；`providerExecuted` 的调用不进声明表。
- **时序与并发**：多个 accept 的执行**并发**进行（各自独立 promise，挂在 `executions` 表）；
  协调器构造时挂 `state.turnAbortSignal` 的一次性 abort 监听转发到内部 `AbortController`。
- **幂等**：同 id 不重复登记/启动；delta 记账只累计。
- **资源释放**：abort 监听在 `abandon`/`drain`/恢复路径移除（各自负责）。
- **平台差异**：字节数按 UTF-8 编码计算，与平台无关。
- **状态所有者**：协调器持有声明表、执行表、abort 控制器与丢弃字节计数；回合状态在
  `RegularTurnLoopState`。
- **日志级别**：流中执行失败 `warn`（见上）；准入拒绝不打日志。

### B19 中途取消与流末收尾（`streaming-tool-coordinator.ts` 的 `abandon`/`drain`）（事件序列）

- **输入**：`abandon(reason: "cancelled" | "model_failed")`；`drain(toolCalls)`（最终工具调用表）。
- **输出**：`abandon`——先 `abortController.abort()`，对**全部声明**并发发账本更新
  （helpers `emitStreamingToolLedgerUpdate`，`status` = `reason === "cancelled"` 时
  `"tool_cancelled"` 否则 `"tool_abandoned"`，`executionTiming: "during_stream"`，
  `blockedReason: reason`），等所有账本更新完成后，对未完成的执行
  `Promise.allSettled` **最多等 250ms**（`STREAMING_TOOL_CANCEL_DRAIN_TIMEOUT_MS`，超时放行），
  最后移除 abort 监听。`drain`——按传入 `toolCalls` **顺序**收集已完成执行结果
  （无执行或结果为空跳过），移除 abort 监听，返回 `StreamedToolExecutionResult[]`。
- **错误语义**：`abandon` 的账本更新失败向 `Promise.all` 冒泡；执行 promise 的失败被
  `allSettled`/`catch` 吸收为「无结果」；`drain` 等待执行时沿用 250ms 上限语义（经
  `collectSettledExecutions` 路径）。
- **时序与并发**（事件序列 · 完成顺序交错）：流中执行**并发完成、完成顺序不保证**——
  启动顺序不等于完成顺序；`drain` 的返回顺序恒按 `toolCalls` 参数序（与完成顺序无关）；
  `abandon` 的账本更新并发发出（顺序不保证，内容各自独立）。测试用 gate 握手制造交错
  （先启动的执行挂起、后启动的先完成），断言返回序与完成序解耦；**无 sleep、无计时断言**。
- **幂等**：重复 `abandon`/`drain` 会重复发账本更新/重复移除监听（移除幂等）；调用方各用一次。
- **资源释放**：两个出口都移除 abort 监听；250ms 竞速的计时器在 finally 清理。
- **平台差异**：与平台无关（`setTimeout` 竞速）。
- **状态所有者**：协调器内部表；账本事件进 `state.events`（helpers 账本通道）。
- **日志级别**：无日志。

### B20 流中工具执行管线（`streaming-tool-execution.ts` 的 `executeStreamingTool`）

- **输入**：`(runtime, state, declaration: ModelToolCall, {assistantMessageId,
declarationIndex, model, signal, traceContext})`。
- **输出**：返回 `StreamedToolExecutionResult | undefined`（执行批次无结果时 `undefined`）。
  管线顺序固定：① `throwIfTurnAborted(state.turnAbortSignal)`；②
  `requireRuntimeToolCallName` 校验工具名（helpers 口径，来源
  `"streamingToolCoordinator.executeDuringStream"`）；③ `createPartId()` 造分部 id、
  `toRecordInput(tool.input)` 归一输入、按 registry 的 `mcpPresentation` 造元数据；
  ④ `persistPendingToolPart` 先落 pending 工具分部；⑤ 账本更新 `status: "tool_call_closed"`
  （`executionTiming: "during_stream"`）；⑥ `runtime.scheduleTools([tool])` 调度 +
  `emitToolScheduledEvents`（事件入 `state.events`）；⑦ 账本更新 `status: "tool_queued"`；
  ⑧ `runtime.executeTools([tool], schedule, {...})` 执行，`onBatchStart` 回调里先把分部改写为
  `state: {status: "running", input, title: toolName, metadata, time: {start}}` 再发账本更新
  `status: "tool_started"`（`startedAt: new Date(start)`，`executionTiming: "during_stream"`）；
  ⑨ 执行完成后 `state.events.push(...execution.events)`，取 `execution.results[0]` 组装
  `{input, ledgerRecorded: true, partID, result, toolCallId}`。
- **错误语义**：取消判定、名字校验、持久化、调度、执行的错误全部原样冒泡（协调器把流中执行
  的冒泡降级为流末执行，见 B18）；无结果返回 `undefined` 不抛。
- **时序与并发**（事件序列 · 进入顺序）：单工具内部严格顺序 ④→⑤→⑥→⑦→⑧（账本与持久化
  交错次序是契约）；不同工具间由协调器并发（B19）。
- **幂等**：单次调用单条执行；`partID` 每次新建。
- **资源释放**：`signal` 透传 `executeTools`；无句柄。
- **平台差异**：与平台无关。
- **状态所有者**：分部存储（persistPart/pending）、账本事件进 `state.events`。
- **日志级别**：无日志（账本事件即观测面）。

### B21 合成工具结果与错误事件（`streaming-tool-synthetic-result.ts`）

- **输入**：`createSyntheticStreamedToolResult(toolCall, reason: "not_executed" |
"unknown_execution_state")`；`emitSyntheticStreamedToolError(runtime, events, traceContext,
result)`。
- **输出**（语义常量）：合成结果 `success: false`、`output: null`、`durationMs: 0`、
  `startedAt === completedAt`（同一 `new Date()`）、`error.type` 固定
  **`"stream_recovery_interrupted_tool"`**；`modelContent`/`error.message` 按 reason 取文案：
  `not_executed` → `"Tool execution was interrupted during streaming recovery before this tool
was executed. Treat this tool call as failed and do not retry blindly."`；
  `unknown_execution_state` → `"Tool execution was interrupted during streaming recovery before
a result was committed. Side effects may be unknown; inspect current state before retrying."`。
  外层 `StreamedToolExecutionResult`：`input: toRecordInput(toolCall.input)`、
  **`ledgerRecorded: false`**、`partID: createPartId()`、`toolCallId`。
  `emitSyntheticStreamedToolError`：`result.error` 缺席直接返回；否则发
  `SessionEventType.ToolCallError` 事件 `{toolCallId, error}`，`appendEvent` 后 `events.push`。
- **错误语义**：构造不抛；`appendEvent` 失败冒泡。
- **时序与并发**：同步构造 / 单事件异步串行。
- **幂等**：构造每次新 `partId`/时间戳；事件不去重。
- **资源释放**：无。
- **平台差异**：与平台无关。
- **状态所有者**：无状态（合成结果交回合循环消费）。
- **日志级别**：无日志。

### B22 模型失败后的流恢复编排（`streaming-tool-coordinator.ts` 的 `recoverFromModelFailure`）（事件序列）

- **输入**：`(error, assistantCreatedAt, {failedRequestId?} = {})`。
- **输出**：返回 `boolean`。**短路**：`state.turnAbortSignal.aborted` 或预算耗尽
  （`hasStreamRecoveryBudget` 为假，B14）→ `false`。无任何声明（`declarations.size === 0`）→
  走 B17 的 `recoverPartialAssistantOutputFailure`（部分输出恢复）。有声明时顺序：
  ① `abortController.abort()`；② `beginStreamRecoveryAttempt`（B14）；③
  `collectSettledExecutions`——按声明序收集执行结果（每个 promise 最多等 **250ms**，
  失败/超时记「无结果」）；④ 未出结果的声明补合成结果（在执行表中 → `"unknown_execution_state"`，
  不在 → `"not_executed"`，B21）；⑤ `emitStreamRecoveryStarted`（B16）；⑥ 重置
  `state.modelResponse = ""`、`modelStepCount += 1`、`recordModelHistoryRound`、
  `toolCallCount += 结果数`、`commitTurnRequestEntries`（空 assistant 文本 + 声明工具表）、
  `turnMachine.receiveModelResponse("")`；⑦ `executeToolCallsForModelStep` 以
  `result: {finishReason: "tool-calls", providerMetadata: {recoveredFromStreamFailure: true},
text: "", toolCalls, usage: {}}` + `streamedToolResults` 补执行（含合成结果）；⑧
  `emitStreamRecoveryRetryEvents`（B16）固定 `reason: "latest_committed_tool_result"`、
  `toolCallIds` = 补执行结果的 toolCallId 序；⑨ 移除 abort 监听；返回 `true`。
- **错误语义**：⑤–⑦ 的持久化/执行错误原样冒泡（⑨ 不执行，由调用方处置）；合成结果兜底保证
  补执行表与声明表**等长同序**。
- **时序与并发**（事件序列 · 持久化与完成交错）：③ 的执行并发进行但收集按声明序；
  恢复事件组（⑤）先于补执行（⑦）的账本/持久化，恢复重试事件组（⑧）最后——
  **恢复事件与工具补执行的持久化记录交错次序是契约**。
- **幂等**：非幂等（消耗预算、改回合状态）；短路判定幂等。
- **资源释放**：⑨ 移除 abort 监听；③ 的计时器在竞速 finally 清理。
- **平台差异**：与平台无关。
- **状态所有者**：`RegularTurnLoopState`；执行与账本经 runtime 端口。
- **日志级别**：无日志（B18 的降级 warn 除外）。

## G 事件持久化与会话落盘

### B23 事件创建与追加管线（`events.ts` 的 `createEvent`/`isSessionPersisted`/`appendEvent`）（事件序列）

- **输入**：`createEvent(this, type, payload, traceContext)`；`appendEvent(this, event,
traceContext)`；`isSessionPersisted(this)`。生命周期类型集（语义常量）：`SessionTitleUpdated`、
  `TurnStarted`、`ModelRequest`、`ModelComplete`、`TurnComplete`、`TurnError`。
- **输出**：`createEvent` = `createSessionEvent(type, this.sessionId, payload, {turnId:
traceContext.turnId, traceId: traceContext.traceId})`；`isSessionPersisted` 读
  `this.sessionPersisted`。`appendEvent` 管线（phase 串用于失败日志）：`eventStore.append`
  （phase `event_store.append`）→ `persistDurableEvent`（`session_event.persist_durable`，B26）
  → `recordToolUsageFromEvent`（`session_event.record_usage`，B30）→ `notifyEventSinks`
  （`session_event.notify_sinks`，B24）→ 生命周期事件打完成 `info` → `admitAppendSummary`
  命中（B27）则**直接返回**（不冲刷汇总、不打 appended debug），否则
  `flushAppendSummaries(runtime, traceContext, "low_frequency_event")` 后打 `debug`
  `Session event appended`（`event: "event_store.appended"`、`sessionEventSequenceNumber`、
  `sessionEventType`）。
- **错误语义**：管线任一步抛错：生命周期事件打 `warn` `Session event persistence failed`
  （`event: "session.event.persistence.failed"`、`durationMs`、`errorMessage`、`phase`、
  `status: "failed"`）后**原样重抛**（`phase` 标记失败发生在哪一步）；非生命周期事件不打失败日志
  也重抛。
- **时序与并发**（事件序列 · 进入顺序 + 日志序列）：单事件管线内部严格顺序
  append → durable → usage → sinks → 汇总/日志；多事件的**进入顺序** = `appendEvent` 调用顺序
  （并发调用方自行串行，如 B7 队列）。日志序列契约（生命周期事件）：
  `info Session event persistence started`（`session.event.persistence.started`、
  `status: "started"`）在管线最前；成功收尾 `info Session event persistence completed`
  （`session.event.persistence.completed`、`durationMs`、`sessionEventSequenceNumber`、
  `status: "completed"`）；失败收尾 `warn`（见上）；非汇总事件的 `debug Session event appended`
  在完成 `info` **之后**；汇总事件（B27）无 appended debug。
- **幂等**：`appendEvent` 每调用一条记录（`eventStore.append` 产生 `sequenceNumber`）；
  `createEvent`/`isSessionPersisted` 纯读/纯构造。
- **资源释放**：无句柄。
- **平台差异**：与平台无关。
- **状态所有者**：`this.sessionPersisted`、`this.eventStore`、`this.eventSinks`、
  runtime 汇总 WeakMap（B27）。
- **日志级别**：见时序项（生命周期 `info`/失败 `warn`，追加 `debug`）。

### B24 事件 sink 通知（`events.ts` 的 `notifyEventSinks`）

- **输入**：`(this, event, traceContext)`；`this.eventSinks` 为有序 sink 表。
- **输出**：按表顺序逐个 `await sink.onSessionEvent(event)`。
- **错误语义**：单个 sink 抛错被吞掉并 `warn` `Session event sink failed`
  （`event: "session_event_sink.failed"`、`sessionEventType`、`errorMessage`、
  `status: "failed"`），**继续**通知后续 sink；本函数不抛。
- **时序与并发**：严格串行（前一 sink 完成才通知下一个）。
- **幂等**：重复调用重复通知；sink 自理幂等。
- **资源释放**：无。
- **平台差异**：与平台无关。
- **状态所有者**：`this.eventSinks`（装配层注入）。
- **日志级别**：失败 `warn`；成功无日志。

### B25 会话持久化（`events-session.ts` 的 `ensureSessionPersisted`）（事件序列 · 日志序列）

- **输入**：`(this, input, traceContext)`（`input` 为首个用户输入，用于标题）。
- **输出**：`sessionStore` 缺席或 `this.sessionPersisted` 已真 → 直接返回。否则顺序落盘：
  ① `createSession`（`id: this.sessionId`、`projectID: projectIdFromDirectory(workingDirectory)`、
  `workspaceID: config.workspaceIdentity ?? trim(memory.workspaceIdentity)`、`parentID:
config.parentSessionId`、`traceID`、`taskType`、`slug: slugify(sessionId)`、
  `directory`/`path` = `config.workspacePath ?? workingDirectory`、`title: titleFromInput(input)`、
  `titleSource: "first_input"`、`version: appVersion`、`permission: {mode: config.mode ??
"build"}`）；② 有模型选择时 `persistRuntimeModelSelection`；③
  `persistSessionShellEnvironmentSnapshot`；④ `saveSessionEntry(buildExecutionStateEntry(...))`；
  ⑤ 置 `this.sessionPersisted = true`；⑥ `appendEvent(SessionTitleUpdated, {previousTitle: "",
source: "first_input", title})`（走 B23 管线）。返回 `void`。
- **错误语义**：任一步抛错打 `warn` `Session persistence failed`（`event:
"session.persistence.failed"`、`phase`、`durationMs`、`errorMessage`）后原样重抛；
  `sessionPersisted` 在 ⑤ 之前保持 `false`（失败可重试整段）。
- **时序与并发**（日志序列）：`info Session persistence started`
  （`session.persistence.started`）→ 落盘 ①–④ → `debug Session persisted`
  （`session.persisted`、`status: "completed"`）→ 标题事件 ⑥ →
  `info Session persistence completed`（`session.persistence.completed`、`durationMs`）。
  phase 串用于失败定位：`session_store.create` → `session_model_selection` →
  `session_shell_snapshot` → `session_execution_state` → `session_title_event`。
- **幂等**：靠 `sessionPersisted` 短路；重复调用不重复建会话。
- **资源释放**：无句柄。
- **平台差异**：`workspacePath` 优先于 `workingDirectory` 作为持久化路径（远程/本地一致）；
  路径解析在 helpers。
- **状态所有者**：`this.sessionPersisted`（本函数是唯一写者）。
- **日志级别**：见时序项（`info`/`debug`/失败 `warn`）。

### B26 持久化事件分派（`events-durable.ts` 的 `persistDurableEvent`）

- **输入**：`(runtime, event, traceContext)`。
- **输出**（按 `event.type` 分派，命中即 return）：无 `sessionStore` 直接返回；
  `CheckpointCreated` → `persistWorkspaceCheckpointEntry`；`RewindTriggered` →
  `persistWorkspaceFileRewindEntry`（两者错误冒泡）；`UserInputAutoResolutionUpdated` →
  `saveSessionEntry`（id `user-input-auto-resolution:<interactionId>`、type
  `SESSION_ENTRY_USER_INPUT_AUTO_RESOLUTION`、time `{created: autoResolution.startedAt,
updated: event.timestamp}`、data 含 `interactionId/toolCallId/autoResolution/eventId/
sequenceNumber/traceId/turnId?`）；`TurnSteerQueued` → `saveSessionInput`（id =
  `pendingInputId`、`kind` = `intent.kind ?? commandKind ?? "sendText"`、`delivery` =
  `payload.delivery ?? "queue"`、payload 含 `text`/`intent?`/`conversationInputIntent?`）；
  `TurnSteerDeliveryChanged` → `updateSessionInputs`（`delivery: admittedDelivery`）；
  `TurnSteerDiscarded` → `reason === "promoted"` 不落盘，否则按 id 逐个 `settleSessionInput`
  （`status` = `reason === "session_resumed"` 时 `"discarded"` 否则 `"cancelled"`）；
  `TargetCompletionVerification` → `saveSessionEntry`（id = `String(event.id)`、type
  `SESSION_ENTRY_TARGET_COMPLETION_VERIFICATION`）+ `persistAssistantTimelinePartForSession`
  （`partID = createPartId("goal_verify_<key>_timeline")`，key =
  `goalIteration !== undefined ? "<targetId>_<goalIteration>" : verificationId`；`messageID =
createMessageId("goal_verify_<key>")`；`parentID = anchorAssistantMessageId`；已有 timeline
  分部时沿用其 `message.info.time.created`/`part.time.start`，否则用事件时间戳；
  `completed`/`time.end` 在 `status === "started"` 时为 `undefined`；`finish: payload.status`；
  timeline 类型 `goal_verification`、`display: "separator"`）。其余类型 no-op。
- **错误语义**：checkpoint/rewind 分派错误**冒泡**；会话账本类（auto-resolution、
  steer 三类、target verification）失败只 `warn`（事件名 `user_input_auto_resolution.
persist_failed`、`session_input.admit_failed`、`session_input.delivery_change_failed`、
  `session_input.settle_failed`、`session_entry.target_completion_verification.persist_failed`）
  并吞掉（持久化尽力而为，不阻塞事件管线）；`TurnSteerDiscarded` 逐 id 失败不中断后续 id。
- **时序与并发**：单事件内顺序执行；`TurnSteerDiscarded` 的多 id settle 串行。
- **幂等**：`saveSessionEntry`/`settleSessionInput` 等以 id 幂等（存储层 upsert 语义）；
  目标验证的 timeline part 沿用既有时间戳避免重复创建。
- **资源释放**：无。
- **平台差异**：与平台无关。
- **状态所有者**：会话存储（`sessionStore`）各账本。
- **日志级别**：失败 `warn`（见上）；成功无日志。

### B27 追加汇总节流（`events-summary.ts` 的 `admitAppendSummary`/`flushAppendSummaries`）

- **输入**：`admitAppendSummary(runtime, event, traceContext)`；
  `flushAppendSummaries(runtime, traceContext, flushReason)`。
- **输出**（语义常量）：汇总类型集 = `ModelStreaming`、`ModelNetworkStatus`、
  `StreamingToolLedgerUpdated`、`ToolCallProgress`（其余类型 `admitAppendSummary` 返回
  `false`）。汇总键 = **`` `${traceContext.turnId ?? "session"}:${event.type}` ``**；
  条目累计 `eventCount`、`first*/last*` 事件 id 与 `sequenceNumber`、`payloadBytes`
  （`Buffer.byteLength(JSON.stringify(payload) ?? "null", "utf8")`，序列化失败记 0）、
  `payloadKinds`（payload 为非数组对象且 `kind` 为非空字符串时取 `kind`，否则
  **`"<missing>"`**）计数。命中类型返回 `true`（appendEvent 据此跳过 appended debug）。
  `flushAppendSummaries` 对**全部键**各冲刷一条 `debug` `Session event append summary`
  （`event: "event_store.appended.summary"`，字段 `eventCount`、`firstEventId`、
  `firstSessionEventSequenceNumber`、`flushReason`、`lastEventId`、
  `lastSessionEventSequenceNumber`、`payloadBytes`、`payloadKinds`、`sessionEventType`）并清条目。
- **错误语义**：不抛异常；JSON 序列化失败降级 0 字节。
- **时序与并发**：条目按 runtime 实例（WeakMap）隔离；**计数阈值 100**——累计到
  `eventCount >= 100` 立即以 `flushReason: "count_threshold"` 冲刷该键；低频事件由 appendEvent
  以 `flushReason: "low_frequency_event"` 全量冲刷（B23）。
- **幂等**：冲刷即清空（同键重新累计）；重复冲刷空表 no-op。
- **资源释放**：WeakMap 随 runtime 回收。
- **平台差异**：`Buffer.byteLength` 跨平台一致。
- **状态所有者**：模块级 WeakMap（keyed by runtime）。
- **日志级别**：冲刷 `debug`（见上）；admit 本身无日志。

## H 用量观测与投影

### B28 模型用量事实（`usage-observability.ts` 的 `recordModelUsageFact`）

- **输入**：`(runtime, RecordModelUsageInput)`——`{assistantMessageId?, attemptIndex?, error?,
events, model, networkEventStartIndex, parentUserMessageId?, querySource, result?, startedAt,
status: "completed" | "error" | "cancelled", toolCallCount?, traceContext}`。
- **输出**：`sessionStore` 需同时具备 `recordModelUsage/upsertTurnUsage/upsertToolUsage/
pruneUsage` 四个方法，缺一**静默返回**（usage 为可选增强面）。写入 `recordModelUsage` 的
  记账口径：`id` = `usage_model_<querySource>_<logical>_<attemptIndex ?? 0>`，`logical` 先冻结为
  `assistantMessageId ?? traceContext.spanId ?? "<querySource>_<startedAt>"`；
  `logicalRequestId` = `assistantMessageId ?? traceContext.spanId ?? "<querySource>:<startedAt>"`
  （两处兜底分隔符不同：`_` 与 `:`，语义常量）；token 映射 `inputTokens/outputTokens/
reasoningTokens` 直取 usage，`cacheCreationInputTokens ← usage.cacheWriteTokens`、
  `cacheReadInputTokens ← usage.cacheReadTokens`、`providerTotalTokens ← usage.totalTokens`、
  `rawUsage: usage`；`retryCount` = 网络观测中 `model_retry_scheduled` 计数；
  `failed` = 最后一条 `model_request_failed`；`firstTokenAt`/`timeToFirstTokenMs` 见 B31；
  `durationMs = Date.now() - startedAt`；`agent` = `config.agentName ?? "agent"`、
  `mode` = `config.mode ?? "build"`、`taskType` = `config.taskType ?? "interactive"`、
  `querySource` 透传（`"main_turn"`/`"compact"`/`"session_title"`/
  `"goal_completion_verification"` 或自由字符串）；`retryable` = `errorInfo.retryable ??
retryCount > 0`；`cancelledByUser` = `status === "cancelled"`；`contextExceeded` =
  `isModelContextExceededError(error) || failed?.reason === "context_exceeded"`；错误三字段取
  B31 的 `usageErrorInfo`。
- **错误语义**：写入失败只 `warn` `Usage model fact write failed`（`event:
"usage.model.write.failed"`）并吞掉（用量观测不阻塞回合）。
- **时序与并发**：单次 await；`completedAt` 与 `durationMs` 在写入前一次性取样。
- **幂等**：`id` 由逻辑身份决定，重复写同一事实 upsert 收敛（存储层）。
- **资源释放**：无。
- **平台差异**：与平台无关。
- **状态所有者**：`UsageStorePort`（sessionStore 扩展面）。
- **日志级别**：失败 `warn`；成功无日志。

### B29 回合用量事实（`usage-observability.ts` 的 `recordTurnUsageFact`）

- **输入**：`(runtime, {completedAt, error?, events, startedAt, status, traceContext, turnId,
userMessageId?})`。
- **输出**：同样的四方法门槛，缺一静默返回。写入 `upsertTurnUsage`：`modelRequestCount` =
  `ModelRequest` 事件数；`firstModelStartAt` = 首个 `ModelRequest` 事件时间；
  `modelRetryCount` = 网络观测中 `model_retry_scheduled` 计数；`toolCallCount` =
  `ToolCallScheduled` 去重 `toolCallId` 数、`toolErrorCount` = `ToolCallError` 去重
  `toolCallId` 数；token 五字段 + `computedTotalTokens` 取
  `createModelUsageSummaryFromEvents(events)` 汇总；`durationMs = completedAt - startedAt`；
  `retryable`/`errorType`/`errorCode` 取 `usageErrorInfo(error, undefined)`；`cancelledByUser`
  与 `contextExceeded`（`isModelContextExceededError`）同 B28 口径。
- **错误语义**：写入失败 `warn` `Usage turn fact write failed`（`usage.turn.write.failed`）并吞掉。
- **时序与并发**：单次 await；事件数组只读。
- **幂等**：`upsertTurnUsage` 以 `sessionID+turnID` 收敛。
- **资源释放**：无。
- **平台差异**：与平台无关。
- **状态所有者**：`UsageStorePort`。
- **日志级别**：失败 `warn`；成功无日志。

### B30 工具用量事实（`usage-observability.ts` 的 `recordToolUsageFromEvent`）

- **输入**：`(runtime, event, traceContext)`（工具类会话事件）。
- **输出**：四方法门槛同上；payload 无非空 `toolCallId` 直接返回；`toolName` 缺省 `"unknown"`；
  基础记录 `id = "usage_tool_<sessionId>_<toolCallId>"`、`toolName`、工具元数据投影
  （`sideEffectScope`/`readOnly`/`destructive`）、`startedAt = event.timestamp`。按事件类型写
  `upsertToolUsage`：`ToolCallScheduled` → `status: "running"`、`approvalStatus: "none"`；
  `PermissionRequested` → `"running"/"requested"`；`PermissionResolved` →
  `decision === "deny"` 时 `"denied"` 否则 `"allowed"`（status `"running"`）；
  `PermissionDenied` → `status: "error"`、`approvalStatus: "denied"`；`ToolCallStarted` →
  `startedAt` 取 payload 的 `startedAt`（Date）否则事件时间，`status: "running"`；
  `ToolCallProgress` → `status: "running"`，`outputBytes/stdoutBytes/stderrBytes` 经
  `usageCount` 归一（B31），任一 > 0 时 `firstOutputAt = event.timestamp`；
  `ToolCallResult` → `status: "completed"`、`completedAt`、`durationMs: usageCount(payload.duration)`、
  `exitCode: usageCount(result.perf.detail.kind === "command" ? detail.command.exitCode : undefined)`、
  `outputBytes: usageCount(result.returnedBytes ?? result.originalBytes)`、
  `truncated: result.truncated === true`；`ToolCallError` → `errorType` = `error.type` 非空串否则
  `CoreErrorType.ToolExecutionFailed`，`status`/`cancelledByUser` 由 `errorType.includes("cancel")`
  决定（`"cancelled"`/`true` 或 `"error"`/`false`），`completedAt`、`errorCode`/`errorMessage`
  取非空串。其余类型 no-op。
- **错误语义**：写入失败 `warn` `Usage tool fact write failed`（`usage.tool.write.failed`，
  含 `toolCallId`）并吞掉。
- **时序与并发**：单次 await；同一 `toolCallId` 的多次事件按到达序 upsert 收敛。
- **幂等**：id 确定性，重复事件覆盖更新。
- **资源释放**：无。
- **平台差异**：与平台无关。
- **状态所有者**：`UsageStorePort`。
- **日志级别**：失败 `warn`；成功无日志。

### B31 用量投影纯函数（`usage-observability-projection.ts`）

- **输入**：`modelNetworkObservations(events)`、`firstModelTokenAt(events, startIndex)`、
  `usageErrorInfo(error, failed)`、`nonemptyString(value)`、`usageCount(value)`、类型
  `ToolUsagePayload`。
- **输出**：`modelNetworkObservations`——取 `ModelNetworkStatus` 事件的 payload，过滤出带
  `type` 字段的对象，按原顺序返回 `{type, message?, retryable?, reason?}`（不做写入）。
  `firstModelTokenAt`——从 `startIndex` 起找第一条 `ModelStreaming` 且 `kind` 为
  `"text_delta"`/`"reasoning_delta"`、`delta` 存在且 **`delta.length > 0`** 的事件，返回其
  `timestamp`（毫秒）；无则 `undefined`。`usageErrorInfo`——`isCoreError(error)` 时返回
  `{code, message, retryable, type: error.type}`；`Error` 实例返回 `{message,
retryable: failed?.retryable, type: failed?.reason ?? error.name}`；无 error 但有 failed 返回
  `{message: failed.message, retryable: failed.retryable, type: failed.reason}`；否则 `{}`。
  `nonemptyString`——字符串且长度 > 0 才返回。`usageCount`——有限数返回
  **`Math.max(0, Math.trunc(value))`**（负数归 0、小数截断），否则 `0`。
- **错误语义**：不抛异常（`ToolUsagePayload` 全 `unknown` 字段、防御式读取）。
- **时序与并发**：同步纯函数。
- **幂等**：是。
- **资源释放**：无。
- **平台差异**：时间戳为毫秒 epoch，与平台无关。
- **状态所有者**：无（「Interpret recorded observations; this module performs no writes」）。
- **日志级别**：无日志。
