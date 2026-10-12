# core-tool-01 行为规格（behavior.md）

版本 v1 · 2026-10-11 · 基线 `be28a877`（M0-13 开工时的 origin/main）

本文描述 `apps/cli/packages/core/src/tool`（直接子文件）与 `executor/` 下 **32 个继承文件**的可观察行为，是重写依据。编号 B1、B2…发布后不重用。每条都给出黑盒可验证的断言；条目→测试对照见 `README.md` 末尾。

**复用的既有规格**（行为依据，不是实现模板）：`specs/knorvia-tool-invocation.md`（单次调用阶段所有权）、`specs/knorvia-tool-batch-execution.md`（批次与调度续接）、`specs/knorvia-tool-deadline.md`（时钟与单次结算）、`specs/knorvia-tool-dependency-planning.md`（依赖规划）、`specs/knorvia-tool-permission-flow.md`（权限主流程）、`specs/knorvia-tool-validation-boundary.md`（诊断对象与校验边界）、`specs/knorvia-tool-registration.md`（登记与模型合同）、`specs/knorvia-tool-hook-boundary.md`（Hook 边界）、`specs/knorvia-edit-matchers.md`（编辑匹配）、`specs/knorvia-read-state-snapshots.md`（读取状态快照）。

**状态所有者总览：**

- **一次工具调用**：状态归 `call-runner` 的调用所有者（已独立替换）。本包的 `impl.ts` 只做装配，`events.ts` 只是事件出口，都不持业务状态。
- **后台任务**：状态归本包 `BackgroundTaskTracker` 实例（每个执行器一个）。runtime-task registry、session 事件出口、poller 计时器是它调用的端口，不复制其状态。
- **工具执行器实例**：只持两个字段——装配后的 `deps` 快照与一个 `BackgroundTaskTracker` 实例；`execute`/`executeBatch`/`executeSchedule` 每次调用新建自己的运行状态，不在实例上累积。
- **纯函数模块**（`utils`、`path-*`、`edit-*`、`diff`、`compat`、`tool-visibility`、`provider-visible-order`、`bash-timeout-policy`、`read-file-state*`、`webfetch-preapproved`、`workflow-*` 的投影函数）：无状态。

---

## A. 执行器装配（`executor/impl.ts`）

### B1 装配是纯快照，构造后可观察的默认值固定

- 来源：`executor/impl.ts`（`ToolExecutorOptions` → `ToolExecutorDeps`）
- 输入：一个 `ToolExecutorOptions`。
- 输出：`createToolExecutor` 返回的 `ToolExecutor`；内部 `deps` 是**构造时求值**的一份新对象。
- 错误语义：`options` 缺失必填字段（`registry`、`permissionService`、`emitEvent`、`sessionId`）属类型层约束；运行时不额外校验。
- 时序与并发：构造不做 I/O、不注册监听、不发事件。构造后修改传入 options 对象的字段**不影响**已建实例的 `deps`。
- 幂等：无副作用。
- 资源释放：构造不分配可释放资源；`BackgroundTaskTracker` 在构造时创建（见 B34）。
- 平台差异：无。
- 状态所有者：执行器实例。
- 日志级别：无。
- 可测断言：给定 `permissionBroker` 缺席，构造后调用 `execute` 不会因缺 broker 抛错，而是走「拒绝一切」的默认 broker；给定 `defaultTimeoutMs` 缺席，行为与显式传 `300000` 相同；给定 `readFileState` 缺席，两次 `execute` 共享同一个内部 Map（不是每次新建）。

### B2 默认值的求值顺序与回退链

- 来源：`executor/impl.ts`
- 输入：可能缺席的 `workingDirectory` / `workspaceRoot` / `getWorkingDirectory` / `getWorkspaceRoot` / `mode` / `getMode` / `runtimeScope` / `maxConcurrency`。
- 输出：`getWorkingDirectory` 回退为「返回 `options.workingDirectory ?? "."`」；`getWorkspaceRoot` 回退为「`options.workspaceRoot` ?? `options.getWorkingDirectory?.()` ?? `options.workingDirectory` ?? `"."`」；`getMode` 回退为「`options.mode ?? "build"`」；`runtimeScope` 回退 `"main"`；`maxConcurrency` 回退 `10`。
- 错误语义：回退链中的 getter 抛错时，异常在**调用时**（不是构造时）向调用者传播。
- 时序与并发：`getWorkspaceRoot` 的回退在每次调用时重新求值，不缓存。
- 幂等：每次调用结果一致（除非调用方 getter 有状态）。
- 资源释放：无。
- 平台差异：`"."` 依赖进程 cwd，Windows 与 POSIX 语义相同。
- 状态所有者：执行器实例的 `deps`。
- 日志级别：无。
- 可测断言：给定只传 `workingDirectory: "/tmp/x"`，`getWorkspaceRoot()` 返回 `"/tmp/x"`；给定传了 `getWorkingDirectory` 且它返回 `"/a"` 而 `workingDirectory` 为 `"/b"`，`getWorkspaceRoot()` 返回 `"/a"`（getter 优先于字面量）。

### B3 三个执行入口的委托关系

- 来源：`executor/impl.ts`
- 输入：`execute(toolCall, options)` / `executeBatch(toolCalls, options)` / `executeSchedule(toolCalls, schedule, options)`。
- 输出：分别委托给 `executeToolCall(deps, tracker, …)`、`executeToolBatch(deps, 回调, …)`、`executeToolSchedule(deps, 回调, …)`；批次与调度用的 `execute` 回调**就是本实例的 `execute`**（同一 deps 与同一 tracker）。
- 错误语义：被委托方的异常原样向上传播，`impl` 不包装、不吞、不重试。
- 时序与并发：`executeBatch` 与 `executeSchedule` 的并发控制归被委托方（见 `knorvia-tool-batch-execution.md`）；`impl` 不额外串行化。
- 幂等：取决于被委托方；`impl` 自身无状态。
- 资源释放：无（取消由 options.signal 与被委托方处理）。
- 平台差异：无。
- 状态所有者：被委托方。
- 日志级别：无（`impl` 不写日志）。
- 可测断言：给定一个已注入的测试工具，`executeBatch([a, b])` 与两次 `execute` 产生**同一个** `BackgroundTaskTracker` 语义（后台任务 id 不重复注册）；`execute` 抛出时 `executeBatch` 的返回 Promise 原值拒绝。

### B4 外部后台任务的追踪入口与 submit 路径同源

- 来源：`executor/impl.ts`、`executor/types.ts`（`ToolExecutor.trackExternalBackgroundTask`）、`specs/knorvia-tool-invocation.md`
- 输入：调用方合成的 `toolCall`（只读 `id`/`name`/`input`）、`output`、`traceContext`、可选 `turnId`。
- 输出：`Promise<void>`；效果与工具启动路径完全同源（runtime-task 登记、`BackgroundTaskStarted`、轮询/终态 waiter、结算通知）。
- 错误语义：与 `trackBackgroundTask` 相同；异常原样上抛。
- 时序与并发：同一 `taskId` 重复调用由 tracker 的 poller 去重（幂等）。
- 幂等：同 `taskId` 重复调用不产生第二份登记或第二个 poller。
- 资源释放：任务终态后按 B38 释放。
- 平台差异：无。
- 状态所有者：`BackgroundTaskTracker`。
- 日志级别：按被调用路径原有级别。
- 可测断言：对同一 `taskId` 连续调用两次 `trackExternalBackgroundTask`，`emitEvent` 只观察到一次 `BackgroundTaskStarted`。

---

## B. 事件出口（`executor/events.ts`）

事件出口只做「构造事件对象 + 调 `deps.emitEvent`」，不判断业务、不写状态。所有事件的 `id` 是新的 UUID、`sequenceNumber` 为 `0`、`timestamp` 为当前 `Date`、`traceId` 取自传入的 `traceContext`——这些字段的**具体值**不是兼容面，**字段存在性与顺序**是。

### B5 `ToolCallStarted` 的载荷与可选字段省略规则

- 来源：`executor/events.ts`（`emitToolCallStarted`）
- 输入：`deps`、`toolCall`、`traceContext`、`turnId`、`startTime`、可选 `display`、可选 `capability`。
- 输出：一条 `SessionEventType.ToolCallStarted`；`payload.toolCallId`/`toolName` 来自 `toolCall`，`startedAt` 是 `new Date(startTime)`。
- 错误语义：`deps.emitEvent` 拒绝时 `await` 原样抛出。
- 时序与并发：事件在工具动手**之前**发布（订阅者据此知道「要写了」）。
- 幂等：不幂等——每次调用发一条。
- 资源释放：无。
- 平台差异：无。
- 状态所有者：无（纯出口）。
- 日志级别：无。
- 可测断言：`capability.readOnly` 为 `undefined` 时 `payload` **没有** `readOnly` 键；为 `false` 时**有** `readOnly: false`（不能用 truthy 判断省略）；`sideEffectScope` 同理；`display` **总是存在**——未传时该键存在且值为 `undefined`（实测：`display` 是无条件写入的，只有 `readOnly`/`sideEffectScope` 走条件展开）。

### B6 `ToolCallResult` 的载荷

- 来源：`executor/events.ts`（`emitToolCallResult`）
- 输入：`serialization`、`durationMs`、`display`、`perf`、`skillMetadata`。
- 输出：一条 `ToolCallResult`；`payload.result.success` 恒为 `true`，`content`/`display`/`perf`/`truncated`/`originalBytes`/`returnedBytes`/`budgetStrategy`/`artifactPath` 逐项取自 `serialization`（`display` 与 `perf` 直接取自参数），`payload.duration` 为 `durationMs`。
- 错误语义：`emitEvent` 拒绝时原样抛出。
- 时序与并发：由调用方（`call-runner` 成功收尾）在序列化之后发布。
- 幂等：不幂等。
- 资源释放：无。
- 平台差异：无。
- 状态所有者：无。
- 日志级别：无。
- 可测断言：`skillMetadata` 为 `undefined` 时 `payload` 没有 `skillMetadata` 键；给出时键存在且是同一引用。

### B7 `ToolCallError` 与「跳过后的错误」

- 来源：`executor/events.ts`（`emitToolCallError`、`emitSkippedToolError`）
- 输入：`toolCallId`、`traceContext`、`turnId`、`error`、可选 `skillMetadata`。
- 输出：一条 `ToolCallError`，`payload.error` 是同一引用。
- 错误语义：`emitEvent` 拒绝时原样抛出。
- 时序与并发：`emitSkippedToolError` 先发布 `ToolCallError`，**再**写一条 `warn` 日志（`event: "tool.call.skipped"`、`status: "failed"`），顺序不可交换。
- 幂等：不幂等。
- 资源释放：无。
- 平台差异：无。
- 状态所有者：无。
- 日志级别：`warn`。
- 可测断言：给定 `deps.logger` 记录器，调用 `emitSkippedToolError` 后事件先于日志到达（用同一个收集器按到达顺序断言）；`traceContext` 缺席时回退顺序为 `deps.traceContext` → `createRootTraceContext({sessionId, turnId})`，且 `turnId` 取 `eventTraceContext.turnId ?? deps.turnId`。

### B8 `PermissionRequested` 的默认原因与能力位

- 来源：`executor/events.ts`（`emitPermissionRequested`）
- 输入：`toolCall`、`input`、`requestId`、`riskLevel`、可选 `reason`、`suggestedPermissionUpdates`、`traceContext`、可选 `approval`。
- 输出：一条 `PermissionRequested`；`reason` 缺席时填 `Tool ${toolCall.name} requires approval`。
- 错误语义：`emitEvent` 拒绝时原样抛出。
- 时序与并发：`turnId` 取 `traceContext.turnId ?? deps.turnId`。
- 幂等：不幂等。
- 资源释放：无。
- 平台差异：无。
- 状态所有者：无。
- 日志级别：无。
- 可测断言：`deps.sessionModePort.supportsPermissionFullAccess()` 返回真值时才出现 `payload.fullAccessSupported === true`，否则该键不存在（包括返回 `false` 的情况）；`approval.display` / `approval.optionsPolicy` 缺席时不出现对应键。

### B9 `PermissionResolved` 与 `PermissionDenied` 的载荷

- 来源：`executor/events.ts`（`emitPermissionResolved`、`emitPermissionDenied`）
- 输入：`requestId`、`decision`（resolved）；`reason`（denied）。
- 输出：`PermissionResolved.payload.decision/reason/modifiedInput` 逐项取自 `decision`；`PermissionDenied.payload.reason` 缺席时填 `Permission denied for ${toolCall.name}`，并附 `inputSummary = summarizeInput(toolCall.input)`（见 B30）。
- 错误语义：`emitEvent` 拒绝时原样抛出。
- 时序与并发：resolved 先于「应用规则/返回结果」（见 `knorvia-tool-permission-flow.md`）。
- 幂等：不幂等。
- 资源释放：无。
- 平台差异：无。
- 状态所有者：无。
- 日志级别：无。
- 可测断言：`decision.modifiedInput` 为 `undefined` 时该键**存在且为 `undefined`**（这里是显式赋值，不是条件展开）；`PermissionDenied` 的 `inputSummary` 与 `summarizeInput` 的输出逐字段相等。

---

## C. 回合控制（`executor/turn-control.ts`）

四个函数都是**纯结果投影**：输入一个 `ToolExecutionResult`，返回原对象（不满足条件）或一个新对象（满足条件）。都不得修改入参。

### B10 自动化创建上限

- 来源：`executor/turn-control.ts`（`withAutomationCreateLimitTurnStop`）
- 输入：`result`、`{ error, toolName }`。
- 输出：仅当 `result.success` 为假、`toolName === "CronCreate"` 且 `error` 被判定为「自动化创建上限」错误时，返回 `{...result, modelContent: <固定文案>, turnControl: {reason: "automation_create_limit", stopTurnAfterResult: true}}`；否则返回**原对象引用**。
- 错误语义：不抛错；不改 `error` 字段。
- 时序与并发：无状态。
- 幂等：连续应用两次结果相同。
- 资源释放：无。
- 平台差异：无。
- 状态所有者：无。
- 日志级别：无。
- 可测断言：`result.success === true` 时返回同一引用（`===`）；命中时 `modelContent` 与既有文案逐字相同（含「global retained-task limit of 20」），且 `turnControl.stopTurnAfterResult === true`。

### B11 计划模式退出被拒

- 来源：`executor/turn-control.ts`（`withPlanExitDeniedTurnStop`）
- 输入：`result`、`{ mode, planEnabled?, toolName }`。
- 输出：`planEnabled` 取 `planEnabled ?? (mode === "plan")`；不满足「planEnabled、工具是 `ExitPlanMode`、且 `result.success` 为假」时返回原引用。满足时再分两路：错误是 `PermissionDenied` 且 `reasonSource === "plan_approval_feedback"` 且**去掉首尾空白后的消息非空**且消息不等于 `Permission denied for ExitPlanMode` 时，返回带 `followUpUserInput`（`reasonSource: "plan_approval_feedback"`）与固定 `modelContent` 的新对象；否则返回带 `turnControl: {reason: "plan_exit_denied", stopTurnAfterResult: true}` 的新对象。
- 错误语义：不抛错。
- 时序与并发：无状态。
- 幂等：连续应用两次结果相同。
- 资源释放：无。
- 平台差异：无。
- 状态所有者：无。
- 日志级别：无。
- 可测断言：`error.reasonSource` 不是 `plan_approval_feedback` 时走 stop-turn 分支；消息只有空白时也走 stop-turn 分支（`trim()` 后为空视为无反馈）；消息恰好等于默认拒绝文案时同样走 stop-turn 分支。

### B12 工作流精修被拒

- 来源：`executor/turn-control.ts`（`withWorkflowRefineDeniedFollowUp`）
- 输入：`result`、`{ toolName }`。
- 输出：工具名必须是 `CreateWorkflow` 或 `AmendWorkflow` 之一且 `result.success` 为假；再要求 `error` 是 `PermissionDenied` 且 `reasonSource === "workflow_refine_feedback"` 且 `trim()` 后非空，才返回带 `followUpUserInput` 与固定 `modelContent` 的新对象；否则返回原引用。与 B11 不同：**不设** `turnControl`。
- 错误语义：不抛错。
- 时序与并发：无状态。
- 幂等：连续应用两次结果相同。
- 资源释放：无。
- 平台差异：无。
- 状态所有者：无。
- 日志级别：无。
- 可测断言：满足条件时返回对象**没有** `turnControl` 键；不满足时返回同一引用。

### B13 终端工具的回合停止

- 来源：`executor/turn-control.ts`（`withTerminalToolTurnStop`）
- 输入：`result`、`{ entry }`。
- 输出：仅当 `result.success` 为真且 `entry.metadata.stopTurnOnSuccess === true`（严格真值）时，返回带 `turnControl: {reason: "subagent_terminal", stopTurnAfterResult: true}` 的新对象；否则返回原引用。
- 错误语义：不抛错。
- 时序与并发：无状态。
- 幂等：连续应用两次结果相同。
- 资源释放：无。
- 平台差异：无。
- 状态所有者：无。
- 日志级别：无。
- 可测断言：`stopTurnOnSuccess` 为 truthy 但非 `true`（例如 `1`）时不触发；失败结果即使 `stopTurnOnSuccess === true` 也不触发。

---

## D. 遥测与模型状态出口

### B14 工具调用 span 的三种收口

- 来源：`executor/telemetry.ts`（`runToolCallWithTelemetry`）
- 输入：`deps`、`toolCall`、`options`、`execute(telemetry)` 回调。
- 输出：先向 `deps.agentTelemetry.startTool({registeredToolName: toolCall.name, toolCallId: toolCall.id})` 取 scope；scope 缺席时直接以 `execute(undefined)` 运行。scope 存在时在 `scope.run` 内执行回调，成功返回其结果；回调抛出时，若 `options?.signal?.aborted` 为真则 `scope.finishCancelled("abort_signal")`，否则 `scope.finishFailed("unhandled", "unknown", error)`，然后**原样重抛**。
- 错误语义：只负责连 `ToolCallStarted`/`Error` 事件发布都直接抛出的非结构化异常；正常业务失败由业务执行器自己收口，不在这里重复收口。
- 时序与并发：`startTool` 在回调之前；收口在异常路径上先于重抛。
- 幂等：`startTool` 每次调用一次。
- 资源释放：scope 的生命周期由 `scope.run` 管理。
- 平台差异：无。
- 状态所有者：telemetry 端口。
- 日志级别：无。
- 可测断言：scope 缺席时回调收到的 `telemetry` 参数是 `undefined`；回调抛出且 `signal.aborted` 时报 `cancelled/abort_signal`，未 abort 时报 `failed/unhandled/unknown`；两种情况下抛出的错误都是同一个引用。

### B15 默认模型状态出口只在调用点未设时补上

- 来源：`executor/model-status-sink.ts`（`createToolModelStatusSink`、`withDefaultToolModelStatusSink`）
- 输入：`createToolModelStatusSink(context)` 取 `context.emitEvent`/`sessionId`/`turnId`/`traceId`；`withDefaultToolModelStatusSink(model, sink)`。
- 输出：`context.emitEvent` 缺席时 `createToolModelStatusSink` 返回 `undefined`；否则返回一个 `{publish}`，`publish` 把 `ModelNetworkStatusEvent` 包装成 `SessionEventType.ModelNetworkStatus` 会话事件后 `await context.emitEvent(...)`（`sequenceNumber: 0`，`timestamp` 为当前时间）。`withDefaultToolModelStatusSink` 在 `model` 或 `sink` 为 `undefined` 时**原样返回 `model`**；否则在模型调用上下文中读取既有 `statusSink`，**已设则不改**，未设才补默认。
- 错误语义：`emitEvent` 拒绝时 `publish` 的 Promise 拒绝。
- 时序与并发：默认出口绑定在**边界**（执行器交给 handler 的 `context.model`）而不是靠每个调用点记得设。
- 幂等：包装不改变已有 sink；重复包装不叠加。
- 资源释放：无。
- 平台差异：无。
- 状态所有者：模型调用上下文（`deps.model` 的包装）。
- 日志级别：无。
- 可测断言：调用点已设 `statusSink` 时，`withDefaultToolModelStatusSink` 返回的模型其上下文 sink 仍是原来那个（不是默认 sink）；未设时是默认 sink；`model === undefined` 时返回值 `=== undefined`。

---

## E. 输入摘要与 Hook 值预览（`executor/utils.ts`）

三个纯函数，无状态、无 I/O、不抛错（`previewHookValue` 内部兜底）。

### B16 `isRecord` 的判定边界

- 来源：`executor/utils.ts`（`isRecord`）
- 输入：任意值。
- 输出：`typeof value === "object" && value !== null && !Array.isArray(value)`。
- 错误语义：不抛错。
- 时序与并发：无。
- 幂等：是。
- 资源释放：无。
- 平台差异：无。
- 状态所有者：无。
- 日志级别：无。
- 可测断言：`null`、`[]`、`() => {}`、`"x"`、`1` 均为假；`{}`、`new Date()`、带原型的普通对象为真。

### B17 `summarizeInput` 的形状

- 来源：`executor/utils.ts`（`summarizeInput`）
- 输入：任意值。
- 输出：`null` → `{type: "null"}`；数组 → `{type: "array", length}`；其他对象 → `{type: "object", keys}`，`keys` 取 `Object.keys(...)` 的**前 20 个**（保持插入顺序）；字符串 → `{type: "string", length}`；其余 → `{type: typeof value}`。
- 错误语义：不抛错；不读取属性值（只取键名）。
- 时序与并发：无。
- 幂等：是（除非对象在两次调用之间被改）。
- 资源释放：无。
- 平台差异：无。
- 状态所有者：无。
- 日志级别：无。
- 可测断言：21 个键的对象只返回前 20 个；`undefined` 返回 `{type: "undefined"}`，`true` 返回 `{type: "boolean"}`，`1` 返回 `{type: "number"}`；键名 getter 不会被读取（用一个带 getter 的对象验证 getter 未被调用）。

### B18 `previewHookValue` 的截断与兜底

- 来源：`executor/utils.ts`（`previewHookValue`）
- 输入：任意值。
- 输出：字符串原样使用，其他值 `JSON.stringify`；结果为空串（`""`、`undefined`、`null` 的 stringify）时返回 `""`；长度 ≤ 4000 时原样返回，超过则取前 4000 字符拼接 `...[truncated]`。序列化抛错（循环引用、BigInt 等）时返回 `String(value)`。
- 错误语义：不抛错。
- 时序与并发：无。
- 幂等：是。
- 资源释放：无。
- 平台差异：无。
- 状态所有者：无。
- 日志级别：无。
- 可测断言：恰好 4000 字符不截断，4001 字符截断且总长度为 `4000 + "...[truncated]".length`；循环引用对象返回 `String(value)`（`"[object Object]"`）而不是抛错。

---

## F. Memory 文件写入的权限豁免（`executor/memory-file-permission.ts`）

### B19 哪些调用算「目标是 memory 文件」

- 来源：`executor/memory-file-permission.ts`（`targetsMemoryFile`）
- 输入：`{executionInput, memoryRoot?, toolName, workingDirectory, workspaceRoot}`。
- 输出：只有 `toolName` 是 `Write` 或 `Edit`、`memoryRoot` 非空、`executionInput.file_path` 是**非空字符串**，且该路径经既有 memory 路径解析判定为「在 memory 根内」时才为真；否则假。
- 错误语义：不抛错；路径解析失败按「不在根内」处理。
- 时序与并发：无状态。
- 幂等：是。
- 资源释放：无。
- 平台差异：路径解析沿用既有 memory 路径模块，Windows 与 POSIX 的盘符、分隔符、大小写差异由该模块处理。
- 状态所有者：无。
- 日志级别：无。
- 可测断言：`toolName` 为 `Read` 时为假；`file_path` 为空串或非字符串时为假；`memoryRoot` 缺席时为假；指向 memory 根外的相对路径（如 `../x.md`）为假。

### B20 豁免只在「已有决定允许被覆盖」时改写

- 来源：`executor/memory-file-permission.ts`（`applyMemoryFilePermission`、`preservesExistingPermissionDecision`）
- 输入：`B19 的输入 + decision`（`PermissionDecisionResult`）。
- 输出：目标不是 memory 文件、或缺 `memoryRoot`、或目标不以 `.md` 结尾、或安全路径解析失败时返回**原 decision 引用**；已有决定需要保留时同样返回原引用；否则返回 `{...decision, allowed: true, decision: "allow", escalated: false, reason: "Memory Markdown writes are allowed", ruleId: "memory.file.markdown"}`。
- 「需要保留」的判定（顺序即优先级）：`decision === "deny"` 且 `ruleId !== "mode.plan.nonReadOnly"`；或 `alwaysAsk` 为真；或 `decision === "ask"` 且 `ruleId` 属于 `rule.project.ask` / `hook.PreToolUse.ask` 之一。
- 错误语义：不抛错。
- 时序与并发：无状态。
- 幂等：应用两次结果相同。
- 资源释放：无。
- 平台差异：同 B19。
- 状态所有者：无。
- 日志级别：无。
- 可测断言：`.md` 目标是 memory 文件时，`deny` + `ruleId === "mode.plan.nonReadOnly"` 会被改成 allow，而 `deny` + 其他 `ruleId` 保持 deny；`ask` + `ruleId === "hook.PreToolUse.ask"` 保持 ask；非 `.md` 目标即使被豁免条件命中也不改写；返回原引用的分支必须 `===` 入参 decision。

---

## G. 工作流报告投影（`executor/workflow-artifact.ts`）

### B21 通知区段的行数与字节预算

- 来源：`executor/workflow-artifact.ts`（`buildWorkflowReportsNotificationSection`）
- 输入：`readonly unknown[] | undefined`。
- 输出：`undefined` 或空数组时返回 `undefined`；否则逐项生成 `[i] <序列化文本>`（`i` 从 1 开始，文本经 `serializeWorkflowArtifact` 后按 2000 字符截断，超出时前 1999 字符加 `…`），累加 `行长度 + 1`，**第一行无论多长都保留**，之后只要累计超过 8000 就停止；返回 `{count: 输入项数, shown: 实际行数, preview: 行用 "\n" 连接}`。
- 错误语义：不抛错（序列化返回 `undefined` 时按空串处理）。
- 时序与并发：无状态。
- 幂等：是。
- 资源释放：无。
- 平台差异：无。
- 状态所有者：无。
- 日志级别：无。
- 可测断言：`undefined` 与 `[]` 都返回 `undefined`；单条超过 2000 字符时 preview 以 `…` 结尾且该行文本长度恰好 2000；`count` 是**输入项数**（可能大于 `shown`）。

### B22 清单区段最多 8 条

- 来源：`executor/workflow-artifact.ts`（`buildWorkflowReportsManifestSection`）
- 输入：同上。
- 输出：`undefined` 或空数组时 `undefined`；否则取前 8 项，每项按 500 字符截断（超出时前 499 字符加 `…`），返回 `{count: 输入项数, shown: 实际条数, preview: string[]}`；`preview` 是数组（不是字符串）。
- 错误语义：不抛错。
- 时序与并发：无状态。
- 幂等：是。
- 资源释放：无。
- 平台差异：无。
- 状态所有者：无。
- 日志级别：无。
- 可测断言：10 项输入时 `count === 10`、`shown === 8`、`preview.length === 8`、`Array.isArray(preview) === true`。

---

## H. 后台任务输出元数据投影（`executor/background-task-output.ts`）

### B23 快照字段的来源优先级

- 来源：`executor/background-task-output.ts`（`backgroundTaskOutputMetadata`）
- 输入：`snapshot: object | undefined`、可选 `launchOutput: Record<string, unknown>`。
- 输出：一个固定字段集的对象（`childSessionId`、`outputBytes`、`outputFile`、`outputTail`、`outputTruncated`、`stderrBytes`、`stderrFile`、`stderrTail`、`stdoutBytes`、`stdoutFile`、`stdoutTail`）。取值优先级：
  - `childSessionId`：`snapshot.childSessionId` → `launchOutput.childSessionId`（都要求字符串）。
  - `stdoutFile`：`snapshot.stdoutPersistedOutputPath` → `snapshot.result.stdout.artifactPath` → `launchOutput.stdoutPersistedOutputPath`；`stderrFile` 同构。
  - `outputFile`：`snapshot.outputPath` → `outputFile` → `persistedOutputPath` → `rawOutputPath` → `launchOutput` 的同三名 → `stdoutFile` → `stderrFile`。
  - 字节数：`snapshot.result.stdout.bytes` / `stderr.bytes` 优先，回退 `snapshot.stdoutBytes` / `stderrBytes`；两者都缺席时 `outputBytes` 为 `undefined`，否则为 `(stdoutBytes ?? 0) + (stderrBytes ?? 0)`。
  - 尾部文本：`stdout.text`（**空串也回退**，用 `||`）→ `snapshot.stdoutTail`；否则 `stderr.text` → `snapshot.stderrTail`；再否则 `snapshot.output.response`。
  - `outputTruncated`：`snapshot.result` 缺席时为 `undefined`；否则检查 `result.stdout/stderr` 的 `truncated` 或 `artifactTruncated` 严格等于 `true`。
- 错误语义：不抛错；`key in source` 用于区分「键不存在」与「值为 undefined」。
- 时序与并发：无状态。
- 幂等：是。
- 资源释放：无。
- 平台差异：无（只读对象字段，不做路径运算）。
- 状态所有者：无。
- 日志级别：无。
- 可测断言：`snapshot` 为 `undefined` 时不抛错且所有字段为 `undefined`；`result` 缺席时 `outputTruncated` 为 `undefined`（不是 `false`）；`stdout.text` 为空串时回退到 `snapshot.stdoutTail`；`stdoutBytes: 0` 与 `stderrBytes` 缺席时 `outputBytes === 0`（不是 `undefined`）。

---

## I. Bash 超时策略（`bash-timeout-policy.ts`）

### B24 从环境解析策略

- 来源：`bash-timeout-policy.ts`（`resolveBashTimeoutPolicy`、`DEFAULT_BASH_TIMEOUT_MS`、`DEFAULT_BASH_MAX_TIMEOUT_MS`、`DEFAULT_BASH_TIMEOUT_POLICY`）
- 输入：`Readonly<Record<string, string | undefined>>`（形如 `BASH_DEFAULT_TIMEOUT_MS`、`BASH_MAX_TIMEOUT_MS`）。
- 输出：`{defaultTimeoutMs, maxTimeoutMs}`。缺省常量分别是 `120000` 与 `600000`。两个变量都先经「正整数解析」：去首尾空白后为空、`parseInt` 为 `NaN`、或 ≤ 0 一律视为未配置。`defaultTimeoutMs` 未配置时用 120000；`maxTimeoutMs` 配置时取 `max(配置值, defaultTimeoutMs)`，未配置时取 `max(600000, defaultTimeoutMs)`。
- 错误语义：不抛错；非法值静默回退（不警告）。
- 时序与并发：纯函数。
- 幂等：是。
- 资源释放：无。
- 平台差异：无（环境变量名与 Windows/POSIX 无关）。
- 状态所有者：无。
- 日志级别：无。
- 可测断言：`{BASH_DEFAULT_TIMEOUT_MS: "0"}` 回退 120000；`{BASH_DEFAULT_TIMEOUT_MS: "abc"}` 回退；`{BASH_DEFAULT_TIMEOUT_MS: "900000"}` 使 `maxTimeoutMs` 至少 900000（即使 `BASH_MAX_TIMEOUT_MS` 未配置）；`parseInt` 截断行为保留（`"1000ms"` 解析为 1000）。

### B25 单次调用宽度的钳制

- 来源：`bash-timeout-policy.ts`（`resolveBashTimeoutMs`）
- 输入：`inputTimeoutMs: number | undefined`、`policy`。
- 输出：`min(inputTimeoutMs || policy.defaultTimeoutMs, policy.maxTimeoutMs)`。注意用 `||`：`0`、`NaN` 都回退到 `defaultTimeoutMs`。
- 错误语义：不抛错。
- 时序与并发：纯函数。
- 幂等：是。
- 资源释放：无。
- 平台差异：无。
- 状态所有者：无。
- 日志级别：无。
- 可测断言：`inputTimeoutMs = 0` 时返回 `defaultTimeoutMs`（不是 0）；`inputTimeoutMs = Number.NaN` 时同样回退；超过上限时返回上限；`inputTimeoutMs = undefined` 且 `defaultTimeoutMs` 大于 `maxTimeoutMs` 时返回 `maxTimeoutMs`。

---

## J. 工具名兼容（`compat.ts`）

### B26 子代理派发工具名

- 来源：`compat.ts`（`TASK_TOOL_NAME`、`isSubagentDispatchToolName`）
- 输入：`string | undefined`。
- 输出：名字是 `Agent` 或 `Task` 时为真；`undefined`、空串及其他名字为假。
- 错误语义：不抛错。
- 时序与并发：纯函数。
- 幂等：是。
- 资源释放：无。
- 平台差异：无。
- 状态所有者：无。
- 日志级别：无。
- 可测断言：`"Agent"`、`"Task"` 为真；`"task"`（小写）、`""`、`undefined` 为假。

### B27 Hook 匹配器别名集合

- 来源：`compat.ts`（`hookMatcherToolNamesForTool`）
- 输入：`toolName: string`。
- 输出：以自身开头、按插入顺序去重的别名数组：`Agent` → `["Agent","Task"]`，`Task` → `["Task","Agent"]`，`ApplyPatch` → `["ApplyPatch","Write","Edit"]`，其他 → `[toolName]`。
- 错误语义：不抛错。
- 时序与并发：纯函数。
- 幂等：是（每次返回新数组）。
- 资源释放：无。
- 平台差异：无。
- 状态所有者：无。
- 日志级别：无。
- 可测断言：`hookMatcherToolNamesForTool("Unknown")` 返回 `["Unknown"]`；返回值是**新数组**（`!==` 内部常量）；顺序是「自身在前」。

---

## K. 结构化补丁（`diff.ts`）

### B28 补丁分块

- 来源：`diff.ts`（`createStructuredPatch`）
- 输入：`{filePath, newContent, oldContent}`。
- 输出：`DiffHunk[]`；上下文行数为 3，`structuredPatch` 超时预算 5000ms；`structuredPatch` 返回空时得到 `[]`。
- 错误语义：不吞异常（第三方库抛错原样传播）。
- 时序与并发：纯函数（无 I/O）。
- 幂等：是。
- 资源释放：无。
- 平台差异：**换行不归一**——`\r\n` 与 `\n` 属于内容差异，会在 hunk 中体现。
- 状态所有者：无。
- 日志级别：无。
- 可测断言：相同内容返回 `[]`；单行改动产生的 hunk 前后各含 3 行上下文；`filePath` 相同传给库的前两个参数（可从 hunk 内容间接验证）。

### B29 增删行计数

- 来源：`diff.ts`（`countPatchLines`）
- 输入：`DiffHunk[]`。
- 输出：`{additions, deletions}`；逐行判断：以 `+` 开头计一次新增、以 `-` 开头计一次删除（**同一条 `+-` 前缀不变**；`+++`/`---` 文件头若出现在 lines 中也会被计入）。
- 错误语义：不抛错。
- 时序与并发：纯函数。
- 幂等：是。
- 资源释放：无。
- 平台差异：无。
- 状态所有者：无。
- 日志级别：无。
- 可测断言：空数组返回 `{0,0}`；一行 `"+x"` 与一行 `"-y"` 得到 `{additions:1, deletions:1}`；`"\\ No newline at end of file"` 之类既非 `+` 也非 `-` 的行不计。

---

## L. 编辑匹配（`edit-match-distance.ts`、`edit-match-text.ts`、`edit-matchers.ts`）

行为依据：`specs/knorvia-edit-matchers.md`。

### B30 行距离是精确的 UTF-16 编辑距离

- 来源：`edit-match-distance.ts`（`editLineDistance`）
- 输入：两个字符串。
- 输出：先去掉公共前缀与公共后缀，再对中段做 Levenshtein 距离（按 UTF-16 code unit 比较）。
- 错误语义：不抛错。
- 时序与并发：纯函数；使用 `Uint32Array` 单行滚动。
- 幂等：是。
- 资源释放：无。
- 平台差异：无（按 code unit，不按字素簇——补充平面字符按两个单位计）。
- 状态所有者：无。
- 日志级别：无。
- 可测断言：`editLineDistance("", "") === 0`；`editLineDistance("abc","abc") === 0`；`editLineDistance("abc","abd") === 1`；emoji（`"😀"` 与 `"😁"`）距离为 1（因为共享高位代理，只有低位不同）。

### B31 弯引号归一

- 来源：`edit-match-text.ts`（`plainQuotes`）
- 输入：任意字符串。
- 输出：`‘`/`’` → `'`，`“`/`”` → `"`；其他字符不变。
- 错误语义：不抛错。
- 时序与并发：纯函数。
- 幂等：是。
- 资源释放：无。
- 平台差异：无。
- 状态所有者：无。
- 日志级别：无。
- 可测断言：`plainQuotes("a‘b’c“d”e") === "a'b'c\"d\"e"`。

### B32 Read 行号前缀剥离

- 来源：`edit-match-text.ts`（`stripReadNumbers`）
- 输入：`string`。
- 输出：按 `\n` 分行，每行必须匹配 `^\d+(?:: |\t)(.*)$`；全部匹配时返回去掉前缀的内容（保持行数），**任一行不匹配返回 `undefined`**。
- 错误语义：不抛错。
- 时序与并发：纯函数。
- 幂等：是。
- 资源释放：无。
- 平台差异：行分隔只认 `\n`；`\r\n` 会让 `(.*)` 捕获到 `\r`（不额外清理）。
- 状态所有者：无。
- 日志级别：无。
- 可测断言：`"1: a\n2: b"` → `"a\nb"`；`"1\ta"` → `"a"`；`"1: a\nplain"` → `undefined`；空串 → `undefined`（因为没有匹配行）——注意空串 `split("\n")` 得 `[""]`，不匹配，返回 `undefined`。

### B33 可见转义展开

- 来源：`edit-match-text.ts`（`visibleCharacters`）
- 输入：`string`。
- 输出：把 `\n`、`\t`、`\r`、`\"`、`\'`、`` \` ``、`\\`、`\$` 展开为其真实字符（宽度 2 的两个字符）；不匹配的反斜杠序列原样保留。没有任何展开时返回**原引用**（`copied === 0` 分支）。
- 错误语义：不抛错。
- 时序与并发：纯函数。
- 幂等：否——展开后的文本可能再含 `\` 组合（例如 `\\n` 展开成 `\n` 两个字符，再跑一次会变成换行）。这是既有契约，不要"修正"。
- 资源释放：无。
- 平台差异：无。
- 状态所有者：无。
- 日志级别：无。
- 可测断言：`visibleCharacters("a\\nb") === "a\nb"`；`visibleCharacters("plain") === "plain"` 且是同一引用；未知序列 `"\\q"` 原样保留。

### B34 Unicode 转义展开

- 来源：`edit-match-text.ts`（`unicodeCharacters`）
- 输入：`string`。
- 输出：`\\` 保留为两个字符；`\uXXXX`（恰好 4 位十六进制）展开为对应 `String.fromCharCode`；其他 `\u` 形式（不足 4 位或含非十六进制字符）原样保留。
- 错误语义：不抛错。
- 时序与并发：纯函数。
- 幂等：否（同 B33 的理由）。
- 资源释放：无。
- 平台差异：无（只做 BMP 码位，不处理代理对组合）。
- 状态所有者：无。
- 日志级别：无。
- 可测断言：`unicodeCharacters("\\u0041") === "A"`；`unicodeCharacters("\\u00G1")` 原样；`unicodeCharacters("\\\\u0041")` 得到 `"\\u0041"`（双反斜杠被保留，不再展开）。

### B35 引号风格还原

- 来源：`edit-match-text.ts`（`restoreQuotes`）
- 输入：实际命中的旧文本 `actual`、新文本 `replacement`。
- 输出：`actual` 不含弯引号时**原样返回 `replacement`**；含单弯引号（`‘’`）时把 `'` 还原成 `‘`（词首或位于 `OPEN_BEFORE` 集合之后）或 `’`（词中或非词首）；含双弯引号（`“”`）时把 `"` 还原成 `“`（开头）或 `”`。两个标记同时存在时同一字符按各自规则处理。
- 错误语义：不抛错。
- 时序与并发：纯函数；用 `Array.from` 按码点遍历（不是按 UTF-16 单元）。
- 幂等：否（还原后的文本再次输入不会进一步变化，但输入不同）。
- 资源释放：无。
- 平台差异：无。
- 状态所有者：无。
- 日志级别：无。
- 可测断言：`restoreQuotes("plain", "a'b")` 返回同一引用 `"a'b"`；`restoreQuotes("‘x’", "'a'")` → `"‘a’"`；`restoreQuotes("it’s", "'it's'")` → 词中的 `'` 变 `’`、词首的变 `‘`。

### B36 匹配策略的优先级与短路

- 来源：`edit-matchers.ts`（`findEditMatch`）
- 输入：`{content, search, replaceAll}`。
- 输出：依次尝试，命中即返回：
  1. `exact`：`content` 中 `search` 的原样出现（`occurrences`，非重叠、从左到右）。
  2. **空 search 的特殊路径**：`search` 为空串时直接返回 `{status:"matched", actualString:"", strategy:"quote_normalized", candidateCount: content.length + 1}`（保留旧行为，不要改成失败）。
  3. `quote_normalized`：两边都过 `plainQuotes` 后再找，命中时 `actualString` 从**原 content** 按相同下标切片。
  4. `line_number_prefix_stripped` → `stripReadNumbers`；变换结果为 `undefined` 或与原串相同则跳过。
  5. `escape_normalized` → `visibleCharacters`；同上跳过规则。
  6. `unicode_escape_normalized` → `unicodeCharacters`；同上跳过规则。
  7. `replaceAll` 为真时直接 `{status:"not_found"}`；否则进入 `broadCandidates`：`line_trimmed` → `indentation_flexible`（至少 2 行）→ `block_anchor`（至少 3 行，首尾行 trim 后相等且中间行相似度 ≥ 0.8）。
- 多个候选的投影：候选数 > 1 且**首次与后续任一候选的实际文本不同**时返回 `ambiguous`（带 `candidateCount`），否则返回 `matched`（`actualString` 取第一个候选）。`search` 末尾的单个空行（`split("\n")` 的尾空元素）在 `broadCandidates` 里被移除；移除后为空则 `not_found`。
- 错误语义：不抛错。
- 时序与并发：纯函数，无异步。
- 幂等：是。
- 资源释放：无。
- 平台差异：按 UTF-16 与 `\n` 分行处理，与平台无关。
- 状态所有者：无。
- 日志级别：无。
- 可测断言：两处相同 `search` 时 `matched` 且 `candidateCount === 2`；三处不同缩进命中 `line_trimmed` 时若实际文本不同则 `ambiguous`；`replaceAll: true` 时不进入 `broadCandidates`；`line_trimmed` 命中后不再尝试 `block_anchor`。

### B37 行尾归一

- 来源：`edit-matchers.ts`（`normalizeLineEndings`）
- 输入：`string`。
- 输出：`\r\n` 全部替换为 `\n`；单独的 `\r` 不动。
- 错误语义：不抛错。
- 时序与并发：纯函数。
- 幂等：是。
- 资源释放：无。
- 平台差异：明确用于消除 Windows 检出差异。
- 状态所有者：无。
- 日志级别：无。
- 可测断言：`normalizeLineEndings("a\r\nb") === "a\nb"`；`normalizeLineEndings("a\rb") === "a\rb"`。

### B38 替换文本按策略归一

- 来源：`edit-matchers.ts`（`normalizeReplacementForMatch`）
- 输入：`strategy`、`newString`。
- 输出：策略是 `escape_normalized` 时返回 `visibleCharacters(newString)`，其他策略原样返回 `newString`。
- 错误语义：不抛错。
- 时序与并发：纯函数。
- 幂等：否（同 B33）。
- 资源释放：无。
- 平台差异：无。
- 状态所有者：无。
- 日志级别：无。
- 可测断言：策略为 `exact` 时返回同一引用；策略为 `escape_normalized` 时 `\\n` 变成换行。

### B39 引号风格保留

- 来源：`edit-matchers.ts`（`preserveQuoteStyle`）
- 输入：`oldString`、`actualOldString`、`newString`。
- 输出：`oldString === actualOldString` 时原样返回 `newString`；否则返回 `restoreQuotes(actualOldString, newString)`。
- 错误语义：不抛错。
- 时序与并发：纯函数。
- 幂等：是（给定相同输入）。
- 资源释放：无。
- 平台差异：无。
- 状态所有者：无。
- 日志级别：无。
- 可测断言：两者相等时返回同一引用；不等且实际文本含弯引号时按 B35 还原。

---

## M. 模型契约投影（`model-contract.ts`）

### B40 工具条目级投影

- 来源：`model-contract.ts`（`resolveToolEntryModelContract`）
- 输入：`entry: ToolEntry`、`context: ToolExecutionModelContext`。
- 输出：`entry.resolveModelContract?.(context)` 返回假值时返回**原 entry 引用**；否则返回新对象：`inputSchema` 只在投影提供时覆盖，`metadata.description` 只在投影的 `description !== undefined` 时覆盖（`null` 会覆盖），其余 `metadata` 字段保留。
- 错误语义：`resolveModelContract` 抛错时原样传播。
- 时序与并发：每次调用重新求值，不缓存。
- 幂等：是（给定相同上下文与实现的投影）。
- 资源释放：无。
- 状态所有者：无（投影由条目自己提供）。
- 日志级别：无。
- 可测断言：投影返回 `{}` 时返回值不是原引用（`!==`）但字段逐一相等；投影只给 `description` 时不改 `inputSchema`；投影给 `description: undefined` 时不覆盖原描述。

### B41 处理器模型契约投影

- 来源：`model-contract.ts`（`projectToolModelContract`）
- 输入：`contract: ModelToolContract`、`entry: ToolEntry | undefined`、`context`。
- 输出：`entry` 为 `undefined`、或投影为假值时返回**原 contract 引用**；否则返回 `{...contract, description?, inputSchema?}`（两个字段都只在投影提供时覆盖）。
- 错误语义：抛错原样传播。
- 时序与并发：每次调用重新求值。
- 幂等：是。
- 资源释放：无。
- 状态所有者：无。
- 日志级别：无。
- 可测断言：`entry === undefined` 时返回同一引用；投影不提供任何字段时返回同一引用（注意：本函数在投影为真值对象但字段全缺时会返回**新对象**，与 B40 的 `{}` 分支一致——测试要按实际分支断言）。

---

## N. 工具路径（`path-normalization.ts`、`path-policy.ts`）

### B42 平台路径 API 选择

- 来源：`path-normalization.ts`（`getToolPathApi`）
- 输入：`NodeJS.Platform`。
- 输出：`"win32"` 返回 `path.win32`，其他一律返回 `path.posix`。
- 错误语义：不抛错。
- 时序与并发：纯函数。
- 幂等：是。
- 资源释放：无。
- 平台差异：本函数就是平台差异的收敛点；调用方显式传平台，不依赖当前主机。
- 状态所有者：无。
- 日志级别：无。
- 可测断言：`getToolPathApi("win32") === path.win32`；`getToolPathApi("linux") === path.posix`；`getToolPathApi("darwin") === path.posix`。

### B43 比较用路径归一

- 来源：`path-normalization.ts`（`normalizeToolPathForComparison`）
- 输入：`filePath`、可选 `platform`（默认当前平台）。
- 输出：Windows 分支依次做：Git Bash 盘符别名 `/c/...` → `C:\...`（反斜杠化）、`path.win32.normalize`、剥离扩展前缀（`\\?\UNC\...` → `\\...`；`\\?\C:` → `C:`；保留 `\\?\Volume`/`GLOBALROOT` 之类的设备命名空间）、盘符大写；POSIX 分支只做 `normalize`。最后统一 `String.prototype.normalize("NFC")`。
- 错误语义：不抛错。
- 时序与并发：纯函数。
- 幂等：是。
- 资源释放：无。
- 平台差异：两个分支的差异就是本函数的目的；`win32` 分支的输入**必须显式传平台**，否则在 Linux 上得到 POSIX 结果。
- 状态所有者：无。
- 日志级别：无。
- 可测断言：`normalizeToolPathForComparison("/c/Users/a", "win32") === "C:\\Users\\a"`；`normalizeToolPathForComparison("C:/x/../y", "win32") === "C:\\y"`；`normalizeToolPathForComparison("\\\\?\\C:\\x", "win32") === "C:\\x"`；`normalizeToolPathForComparison("\\\\?\\UNC\\srv\\share", "win32") === "\\\\srv\\share"`；含组合字符的路径被 NFC 归一。

### B44 工作区路径解析

- 来源：`path-policy.ts`（`resolveWorkspacePath`）
- 输入：`{inputPath, workingDirectory, workspaceRoot, operation}`。
- 输出：先校验 `workingDirectory` 与 `workspaceRoot` 都是绝对路径（`normalize` 之后 `isAbsolute`）；`inputPath` 为空串时抛 `ToolExecutionFailed`（消息 `Tool path must not be empty`，`recoverable: true`，context 含 `operation`）；否则绝对路径走 `normalize`，相对路径走 `resolve(workingDirectory, inputPath)`。
- 错误语义：非绝对目录抛 `ConfigurationError`（消息 `${label} must be an absolute path for tool execution`，`recoverable: false`，context 以 label 为键）。**有意不阻止工作区外的路径**（注释写明：子代理可能需要读用户指定的兄弟仓库或外部文件）。
- 时序与并发：纯函数（除抛错）。
- 幂等：是。
- 资源释放：无。
- 平台差异：用 `node:path` 的当前平台实现；Windows 上盘符相对路径按 `resolve` 语义处理。
- 状态所有者：无。
- 日志级别：无。
- 可测断言：`inputPath: ""` 抛 `ToolExecutionFailed` 且 `recoverable === true`；`workingDirectory: "relative"` 抛 `ConfigurationError` 且 `recoverable === false`；相对路径拼接为 `workingDirectory` 下的绝对路径；工作区外路径**不报错**。

### B45 工具工作目录解析

- 来源：`path-policy.ts`（`resolveToolWorkingDirectory`）
- 输入：`inputCwd: string | undefined`、`{workingDirectory, workspaceRoot, operation}`。
- 输出：`inputCwd` 为假值（含空串）时校验并返回归一化后的 `workingDirectory`；否则委托 `resolveWorkspacePath`（`inputPath = inputCwd`，同一 operation）。
- 错误语义：同 B44。
- 时序与并发：纯函数。
- 幂等：是。
- 资源释放：无。
- 平台差异：同 B44。
- 状态所有者：无。
- 日志级别：无。
- 可测断言：`inputCwd` 为 `undefined` 或 `""` 都返回 `workingDirectory`；`inputCwd` 为绝对路径时返回其归一化结果。

---

## O. Provider 可见顺序（`provider-visible-order.ts`）

### B46 排序规则

- 来源：`provider-visible-order.ts`（`orderProviderVisibleToolContracts`）
- 输入：`readonly {name: string}[]`。
- 输出：新数组。名字在固定白名单（31 个内置工具名）里的先按 `name.localeCompare` 升序；不在白名单里的**保持输入相对顺序**排在后面。
- 错误语义：不抛错。
- 时序与并发：纯函数；不修改入参数组（`sort` 作用在内部新数组上）。
- 幂等：是。
- 资源释放：无。
- 平台差异：注意 `localeCompare` 受 locale 影响；实现不传 locale，测试不要断言依赖 locale 的大小写规则。
- 状态所有者：无。
- 日志级别：无。
- 可测断言：`["Zed","Bash","Read","alpha"]` → 白名单三个按序在前、`alpha` 在后；入参数组未被修改；相同输入两次结果相等。

---

## P. 读取状态（`read-file-state.ts`、`read-file-state-metadata.ts`）

行为依据：`specs/knorvia-read-state-snapshots.md`。

### B47 读取状态键

- 来源：`read-file-state.ts`（`createReadFileStateKey`）
- 输入：`filePath`、`offset`、`limit`、可选 `target` 平台。
- 输出：`` `${归一化路径}\0${offset ?? 1}\0${limit === undefined ? "" : limit}` ``。`offset` 为 `undefined` 时用 `1`（不是 0）；`limit` 为 `undefined` 时该段为空串，`0` 时是 `"0"`。
- 错误语义：不抛错。
- 时序与并发：纯函数。
- 幂等：是。
- 资源释放：无。
- 平台差异：路径归一化按 B43 处理传入平台。
- 状态所有者：无。
- 日志级别：无。
- 可测断言：`createReadFileStateKey("a", undefined, undefined, "linux") === "a\u00001\u0000"`；`offset: 0` 得到 `"0"`（不是 1，因为 `??` 只对 `undefined` 生效）；`limit: 0` 得到 `"0"`。

### B48 mtime 归一

- 来源：`read-file-state.ts`（`normalizeReadFileStateMtimeMs`）
- 输入：`number | undefined`。
- 输出：`undefined` 原样；其他一律 `Math.floor`。
- 错误语义：不抛错。
- 时序与并发：纯函数。
- 幂等：是（`Math.floor(Math.floor(x)) === Math.floor(x)`）。
- 资源释放：无。
- 平台差异：无。
- 状态所有者：无。
- 日志级别：无。
- 可测断言：`undefined` → `undefined`；`1.9` → `1`；`-1.1` → `-2`（`Math.floor` 而不是截断）。

### B49 最新读取状态查找

- 来源：`read-file-state.ts`（`findLatestReadFileState`）
- 输入：`ReadFileStateMap | undefined`、`filePath`、可选 `target`。
- 输出：`states` 为假值返回 `undefined`；否则遍历所有条目，路径归一化后相等的才参与；取 `readAt.getTime()` **最大**者；**相等时后者覆盖前者**（`!older` 用 `<=` 语义）。
- 错误语义：不抛错。
- 时序与并发：纯函数；不修改 map。
- 幂等：是。
- 资源释放：无。
- 平台差异：路径比较按传入平台。
- 状态所有者：调用方持有的 Map。
- 日志级别：无。
- 可测断言：三条不同时间记录取最新；两条相同 `readAt` 取遍历顺序靠后者；路径大小写不同但在 `win32` 下归一相等时能命中。

### B50 可编辑读取状态

- 来源：`read-file-state.ts`（`findEditableReadFileState`）
- 输入：同 B49。
- 输出：**就是** `findLatestReadFileState` 的结果（新的范围读取也推进文件水位；是否允许 partial 编辑由既有 Edit/Write 消费者判定）。
- 错误语义：不抛错。
- 时序与并发：纯函数。
- 幂等：是。
- 资源释放：无。
- 平台差异：同 B49。
- 状态所有者：调用方。
- 日志级别：无。
- 可测断言：同一输入下 `findEditableReadFileState` 与 `findLatestReadFileState` 返回同一引用。

### B51 快照解析（持久化恢复）

- 来源：`read-file-state-metadata.ts`（`parseReadFileStateMetadata`、`READ_FILE_STATE_METADATA_SCHEMA_VERSION`）
- 输入：`unknown`（期望形如 `{readFileState: {...}}` 的外层元数据）。
- 输出：外层不是非数组对象、或缺 `readFileState`、或它也不是非数组对象时返回 `undefined`；否则**只按 11 个字段投影**（未知字段丢弃）：`schemaVersion` 必须等于 `1`、`tool` 必须是 `Read`/`Write`/`Edit`、`path`/`revisionId` 必须是非空字符串、`content` 必须是字符串（可为空串）、`isPartialView` 必须是布尔、`readAtMs`/`mtimeMs`/`sizeBytes` 必须是有限数；`offset`/`limit` 可选，但不是有限数时**忽略该字段**（不失败）。必填字段任一不满足则返回 `undefined`。
- 错误语义：不抛错。
- 时序与并发：纯函数。
- 幂等：是。
- 资源释放：无。
- 平台差异：无。
- 状态所有者：无。
- 日志级别：无。
- 可测断言：`schemaVersion: 2` → `undefined`；`offset: "1"`（字符串）被忽略且不导致失败，返回对象**没有** `offset` 键；`content: ""` 合法；未知字段不出现在返回对象上；`null`、数组、字符串输入都是 `undefined`。

### B52 从读取条目生成快照

- 来源：`read-file-state-metadata.ts`（`createReadFileStateMetadataFromEntry`）
- 输入：`{completedAt, entry?, toolName}`。
- 输出：`entry` 缺席、或缺 `revisionId`、或 `mtimeMs`/`sizeBytes` 为 `undefined` 时返回 `undefined`（**不用当前磁盘或展示文本补齐 freshness**）；否则返回固定字段对象，`readAtMs` 取 `completedAt.getTime()`，`offset`/`limit` 只在条目上存在时写入。
- 错误语义：不抛错。
- 时序与并发：纯函数。
- 幂等：是（给定相同 `Date`）。
- 资源释放：无。
- 平台差异：无。
- 状态所有者：无。
- 日志级别：无。
- 可测断言：`revisionId` 为空串时返回 `undefined`；`entry.offset === 0` 时快照含 `offset: 0`；`mtimeMs === 0` 合法（只判 `undefined`）。

### B53 从工具输出生成快照

- 来源：`read-file-state-metadata.ts`（`createReadFileStateMetadata`）
- 输入：`{completedAt, output, readFileState?, toolInput, toolName}`。
- 输出：`toolName !== "Read"` 返回 `undefined`；`output` 未通过 `ReadOutputSchema` 返回 `undefined`；`output.type` 不是 `text` 也不是 `file_unchanged` 时返回 `undefined`；否则用 `output.filePath` 与 `toolInput` 上**有限数**的 `offset`/`limit` 生成键（非有限数按 `undefined`），从 `readFileState` 查条目后按 B52 生成。
- 错误语义：schema 校验不通过即返回 `undefined`，不抛错。
- 时序与并发：纯函数。
- 幂等：是。
- 资源释放：无。
- 平台差异：键的归一按当前平台（未显式传 target）。
- 状态所有者：调用方传入的 `readFileState`。
- 日志级别：无。
- 可测断言：`toolName: "Write"` → `undefined`；`output` 为 `{type: "image"}` → `undefined`；`toolInput.offset` 为 `"1"` 时按 `undefined` 处理并命中「默认窗口」的键；`readFileState` 缺席时返回 `undefined`。

---

## Q. 工具可见性（`tool-visibility.ts`）

### B54 工具名别名

- 来源：`tool-visibility.ts`（`normalizeToolNameAlias`）
- 输入：`string`。
- 输出：`"web_search"` → `"WebSearch"`；其他原样。
- 错误语义：不抛错。
- 时序与并发：纯函数。
- 幂等：是。
- 资源释放：无。
- 平台差异：无。
- 状态所有者：无。
- 日志级别：无。
- 可测断言：`"web_search"` → `"WebSearch"`；`"WebSearch"` → `"WebSearch"`；`"web_search_extra"` 原样。

### B55 规则名集合提取

- 来源：`tool-visibility.ts`（`createToolRuleNameSet`）
- 输入：`readonly string[] | undefined`。
- 输出：`undefined` 或空数组返回 `undefined`；否则逐条 `trim`，取 `(` **之前**（下标 > 0 时）的部分作为名字，再经 B54 归一；名字为空的不加入；集合为空时返回 `undefined`。
- 错误语义：不抛错。
- 时序与并发：纯函数。
- 幂等：是。
- 资源释放：无。
- 平台差异：无。
- 状态所有者：无。
- 日志级别：无。
- 可测断言：`["Bash(git:*)"]` → 集合含 `"Bash"`；`[""]`、`["   "]` → `undefined`；`["(x)"]` → `"("` 在下标 0，因此名字是 `"(x)"`（`parenIndex > 0` 不成立）；去重生效。

### B56 单名禁用判定

- 来源：`tool-visibility.ts`（`isToolNameDisallowed`）
- 输入：`toolName`、`disallowedTools`。
- 输出：规则集合为 `undefined` 时 `false`；否则看集合是否含归一化后的 `toolName`。
- 错误语义：不抛错。
- 时序与并发：纯函数。
- 幂等：是。
- 资源释放：无。
- 平台差异：无。
- 状态所有者：无。
- 日志级别：无。
- 可测断言：`("web_search", ["WebSearch"])` 为真；`("WebSearch", ["web_search"])` 为真；规则为空时 `false`。

### B57 列表过滤

- 来源：`tool-visibility.ts`（`filterDisallowedToolNames`）
- 输入：`toolNames`、`disallowedTools`。
- 输出：规则集合为 `undefined` 时返回**原数组引用**；否则返回过滤后的新数组（保持相对顺序）。
- 错误语义：不抛错。
- 时序与并发：纯函数。
- 幂等：是。
- 资源释放：无。
- 平台差异：无。
- 状态所有者：无。
- 日志级别：无。
- 可测断言：无规则时 `===` 入参；有规则时是不同数组且长度减少；别名规则能过滤掉 `web_search`。

---

## R. WebFetch 预批准（`webfetch-preapproved.ts`）

### B58 预批准判定

- 来源：`webfetch-preapproved.ts`（`isWebFetchPreapprovedUrl`）
- 输入：任意字符串。
- 输出：无法作为 `URL` 解析时 `false`；`hostname` 在固定预批准主机集合（约 80 个官方文档站）中时 `true`；否则查「主机 → 路径前缀」表（`wordpress.org`→`/documentation`、`huggingface.co`→`/docs`、`www.kaggle.com`→`/docs`、`vercel.com`→`/docs`）；该表未命中即 `false`；命中主机后，`pathname` 含编码路径穿越（`%25`、`%2f`、`%5c`、`%2e` 的任意组合，大小写不敏感）时 `false`；否则要求 `pathname` 等于前缀或以 `前缀/` 开头。
- 错误语义：不抛错。
- 时序与并发：纯函数。
- 幂等：是。
- 资源释放：无。
- 平台差异：无（只看 URL 字符串）。
- 状态所有者：无。
- 日志级别：无。
- 可测断言：`https://nodejs.org/api/x` 为真；`https://vercel.com/docs/x` 为真，`https://vercel.com/docsx` 为假，`https://vercel.com/docs/%2e%2e/secret` 为假，`https://vercel.com/%64ocs/x` 为假（解码后不是 `/docs`）；`not-a-url` 为假；`https://example.com` 为假。

---

## S. 包入口（`index.ts`、`executor.ts`）

### B59 入口的 re-export 面

- 来源：`index.ts`、`executor.ts`
- 输入：无。
- 输出：`tool/index.ts` 必须继续 `export *` 自 `./scheduler.js`、`./types.js`、`./registry.js`、`./executor.js`，并具名导出 `builtInTools`、`registerBuiltInTools`（来自 `./handlers/index.js`）；`tool/executor.ts` 必须继续具名导出 `ToolExecutorImpl`、`createToolExecutor`，并类型导出 `ToolExecutor`、`ToolExecutorOptions`。
- 错误语义：模块解析失败即入口不可用。
- 时序与并发：模块加载时完成。
- 幂等：是。
- 资源释放：无。
- 平台差异：无。
- 状态所有者：无。
- 日志级别：无。
- 可测断言：从包入口 `import` 后，`createToolExecutor` 是函数、`ToolExecutorImpl` 是类、`builtInTools` 有定义；从 `tool/executor.js` 直接导入同样四个名字成功。

---

## T. 后台任务追踪（`executor/background-tasks.ts`、`executor/background-task-output.ts`）

### B60 哪些结果会被追踪

- 来源：`executor/background-tasks.ts`（`BackgroundTaskTracker.trackBackgroundTask`）
- 输入：`toolCall`、`output`、`traceContext`、`turnId`。
- 输出：`output` 不是非数组对象时直接返回（不发事件）；`output.status` 既不是 `"backgrounded"`，也不是「工具名是 `Agent`/`Task` 且 status 为 `"async_launched"`」时直接返回。
- 错误语义：不抛错。
- 时序与并发：无状态判断在前，任何事件发布在后。
- 幂等：是（前置过滤）。
- 资源释放：无。
- 平台差异：无。
- 状态所有者：调用方给的 output。
- 日志级别：无。
- 可测断言：`null`、`[]`、`"x"` 输出都不产生事件；`status: "backgrounded"` 的非子代理工具会被追踪；`status: "async_launched"` 但工具名不是 `Agent`/`Task` 时**不**追踪。

### B61 任务 ID 与重复追踪

- 来源：`executor/background-tasks.ts`
- 输入：上面通过过滤的 `output`。
- 输出：`taskId` 依次取 `output.backgroundTaskId`（字符串）→ `output.agentId`（字符串）；都不是字符串、或为空、或该 id 已在实例的 `trackedTaskIds` 中时直接返回。
- 错误语义：不抛错。
- 时序与并发：`trackedTaskIds.add` 在发事件**之前**，因此同一 id 的并发第二次调用会被去重。
- 幂等：是（同 id 第二次不重复登记、不重复发 `BackgroundTaskStarted`）。
- 资源释放：终态时从集合删除（见 B65/B68）。
- 平台差异：无。
- 状态所有者：`BackgroundTaskTracker` 实例的 `trackedTaskIds`。
- 日志级别：无。
- 可测断言：同 id 连续两次调用只观察到一次 `BackgroundTaskStarted`；`backgroundTaskId` 为空串时用 `agentId`（`??` 只跳过 `undefined`/`null`，空串会**被采用**——空串最终因 `!taskId` 而返回）。

### B62 启动事件的发布与失败回滚

- 来源：`executor/background-tasks.ts`、`executor/background-task-registry.ts`（`registerRuntimeBackgroundTask`、`removeRuntimeBackgroundTask`）
- 输入：通过 B61 的调用。
- 输出：先 `registerRuntimeBackgroundTask`，再 `emitBackgroundTaskEvent(BackgroundTaskStarted, taskPayload(..., "running", output))`；事件发布抛出时**回滚**：从 `trackedTaskIds` 删除并 `removeRuntimeBackgroundTask`，然后原样重抛。
- 错误语义：事件发布失败会把错误传给调用者（不回退成成功）。
- 时序与并发：登记 → 事件 → （失败则）回滚。
- 幂等：见 B61。
- 资源释放：失败路径释放已登记状态。
- 平台差异：无。
- 状态所有者：runtime-task registry + tracker。
- 日志级别：无（成功路径的 info 日志在事件之后）。
- 可测断言：让 `emitEvent` 在 `BackgroundTaskStarted` 上抛错，调用 `trackBackgroundTask` 会抛出同一错误，且再次以同 id 调用会重新尝试（说明已回滚）。

### B63 无快照源时立即收口为 lost

- 来源：`executor/background-tasks.ts`、`executor/background-tracker-projection.ts`（`hasSnapshotProvider`、`hasDirectWaiter`）
- 输入：启动事件成功之后。
- 输出：若该工具既没有快照提供者也没有直接等待者：写一条 `info` 日志（`background_task.tracking.started`）后再写一条 `info`（`background_task.tracking.lost`，`reason: "missing_snapshot_source"`），`updateRuntimeBackgroundTask(..., "lost")`，`enqueueTerminalNotification(..., "lost", traceContext, undefined, output)`，发 `BackgroundTaskCompleted`（payload 状态 `lost`），从 `trackedTaskIds` 删除并返回。
- 错误语义：`emitBackgroundTaskEvent` 的拒绝原样传播。
- 时序与并发：**不**建立定时器、不建立 waiter。
- 幂等：不重复（已从集合删除，但同 id 再次调用会重新走一遍——调用方不应重复调用）。
- 资源释放：无定时器可释放。
- 平台差异：无。
- 状态所有者：tracker。
- 日志级别：`info`。
- 可测断言：对一个没有快照源的名称调用后，事件序列恰为 `[BackgroundTaskStarted, BackgroundTaskCompleted(lost)]`，且没有 `BackgroundTaskUpdated`；`enqueueBackgroundTaskNotification` 被调用一次且参数状态为 `lost`。

### B64 轮询与「运行中」事件的去重

- 来源：`executor/background-tasks.ts`、`executor/background-tracker-projection.ts`（`runningSignature`）
- 输入：有快照提供者的追踪。
- 输出：建立 1 秒间隔的定时器（`unref()` 处理过，不阻塞进程退出）；**立即**先跑一次 `poll()`。每次 `poll` 在 `pollInFlight` 为真、已 `stopped`、或无快照源时直接返回；读到快照后：status 不是 `"running"`（含 `undefined`）走终态收口，否则走「运行中」发布。发布运行中时先算 `runningSignature`，与上一次相同则**不发事件、不更新 registry**，不同才 `updateRuntimeBackgroundTask(..., "running", snapshot)` 并发 `BackgroundTaskUpdated`。
- 错误语义：`readTaskSnapshot` 抛错被捕获，写 `warn`（`Background task polling failed`，带 `errorMessage`），**不**终止追踪。
- 时序与并发：`pollInFlight` 保证同一时刻只有一个在飞；间隔定时器与立即调用共用这一把锁。
- 幂等：相同快照不重复发事件（签名去重）。
- 资源释放：终态 `cleanup()` 清定时器与最长运行定时器。
- 平台差异：无。
- 状态所有者：tracker。
- 日志级别：`warn`（轮询失败）。
- 可测断言：连续两次读到相同快照只产生一条 `BackgroundTaskUpdated`；快照签名变化时产生第二条；`readTaskSnapshot` 抛错时追踪继续（后续快照变化仍能发布）。

### B65 终态发布的单次结算

- 来源：`executor/background-tasks.ts`（`publishTerminal`）
- 输入：快照（可为 `undefined`）。
- 输出：`stopped` 或 `terminalPublishing` 为真时直接返回（单次结算）；否则置 `terminalPublishing`，在 `finally` 恢复。分三路：
  1. 无快照：写 `info`（`snapshot_missing`）→ `updateRuntimeBackgroundTask("lost")` → `enqueueTerminalNotification("lost")` → `BackgroundTaskCompleted(lost)` → `stopped = true` → `cleanup()`。
  2. 快照 `status === "running"`：`updateRuntimeBackgroundTask("running", snapshot)` → `publishRunning(snapshot)`；若**没有**快照提供者则 `stopped = true` 并 `cleanup()`（只有 waiter 的场景，拿到一次运行中即可收手）。有快照提供者时**不**停止，等待后续轮询。
  3. 其他状态：子代理派发工具（`Agent`/`Task`）且快照 `type === "local_agent"` 且 `notified === true` 时，写 `debug` 日志后直接 `stopped = true` + `cleanup()`（**不发**完成事件、不排队通知——子代理自己已处理通知）；否则写 `info`（`background_task.tracking.terminal`）→ `updateRuntimeBackgroundTask(snapshot.status, snapshot)` → `enqueueTerminalNotification(snapshot.status, traceContext, snapshot)` → `BackgroundTaskCompleted(snapshot.status)` → `stopped = true` → `cleanup()`。
- 错误语义：事件发布/登记抛错原样传播（`finally` 仍恢复标志）；`stopped` 在事件之后才置真，因此事件失败时追踪不会静默停止。
- 时序与并发：`cleanup()` 清定时器并删除 id；同一时刻只有一次终态发布。
- 幂等：同一追踪只发一次 `BackgroundTaskCompleted`。
- 资源释放：清 interval 与 maxRuntime timeout。
- 平台差异：无。
- 状态所有者：tracker。
- 日志级别：`info`（缺快照、观察到终态）、`debug`（子代理已处理通知）。
- 可测断言：先由 waiter 触发一次终态、再由轮询读到同一终态时，`BackgroundTaskCompleted` 只出现一次；子代理 + `local_agent` + `notified: true` 的分支**没有** `BackgroundTaskCompleted`，也没有通知入队。

### B66 子代理后台 Bash 的最长运行时间

- 来源：`executor/background-tasks.ts`
- 输入：`toolCall.name === "Bash"`、`deps.runtimeScope === "subagent"`、`deps.subagentBackgroundBashMaxMs !== undefined`、`deps.executionPort.cancelBackgroundTask` 存在。
- 输出：建立一个 `setTimeout(subagentBackgroundBashMaxMs)`；到点时写 `warn`（`background_task.subagent_bash.max_runtime_exceeded`）并调用 `cancelBackgroundTask(taskId)`；取消失败再写 `warn`（`background_task.subagent_bash.cancel_failed`，带 `errorMessage`）。定时器在 `cleanup()` 中清除。
- 错误语义：取消的拒绝被捕获成 `warn`，不向外传播。
- 时序与并发：与轮询定时器同时建立；两个都归 `cleanup()`。
- 幂等：每个追踪只建立一个。
- 资源释放：`cleanup()` 清除。
- 平台差异：无（超时值由调用方给）。
- 状态所有者：tracker。
- 日志级别：`warn`。
- 可测断言：`runtimeScope` 不是 `subagent` 时不建立该定时器（用一个很短的上限值 + 假定时器验证）；到点后 `cancelBackgroundTask` 收到正确的 `taskId`。

### B67 直接等待者路径

- 来源：`executor/background-tasks.ts`、`executor/background-tracker-projection.ts`（`waitForTaskSnapshot`）
- 输入：有直接等待者且尚未 `stopped`。
- 输出：**不 await**（`void` 起的异步任务），`await waitForTaskSnapshot(...)` 后走 `publishTerminal(snapshot)`。等待抛错时写 `warn`（`Background task wait failed`，带 `errorMessage`），并且**仅在没有快照提供者时**才 `stopped = true` + `cleanup()`（有快照提供者时留给轮询继续）。
- 错误语义：等待错误被吞成 `warn`。
- 时序与并发：等待者与轮询并行，谁先拿到终态谁收口，另一个被 B65 的单次结算挡住。
- 幂等：由 B65 保证。
- 资源释放：由 B65/B63 的 `cleanup()`。
- 平台差异：无。
- 状态所有者：tracker。
- 日志级别：`warn`。
- 可测断言：`waitForTaskSnapshot` 拒绝且工具**有**快照提供者时，追踪未停止（后续轮询仍能发布终态）；没有快照提供者时追踪停止且不再有事件。

---

## U. 已发布产物的模型面投影（`executor/workflow-published-artifacts.ts`）

术语：本文件的 artifact 是**脚本经 `artifact.*` 发布给用户看的产出**；`workflow-artifact.ts` 的 `serializeWorkflowArtifact` 是脚本顶层返回值，两者不同（见 B21/B22）。

### B68 交付物优先排序

- 来源：`executor/workflow-published-artifacts.ts`（内部 `primaryFirst`，经 B69/B70 可观察）
- 输入：`readonly {primary?: true}[]`。
- 输出：新数组，`primary === true` 的排在最前，其余保持原相对顺序（稳定排序）。
- 错误语义：不抛错。
- 时序与并发：纯函数，不改入参。
- 幂等：是。
- 资源释放：无。
- 平台差异：无。
- 状态所有者：无。
- 日志级别：无。
- 可测断言：`[a(primary), b, c]` → `[a, b, c]`；`[b, c, a(primary)]` → `[a, b, c]`；入参数组未被修改。

### B69 一行文本的格式

- 来源：`executor/workflow-published-artifacts.ts`（`formatPublishedArtifactLine`）
- 输入：`{id, kind, version, title?, contentType?, bytes?, itemCount?, primary?}`。
- 输出：`` `- ${id} (${parts.join(", ")})` ``，`parts` 依次为：`kind`、`primary`（仅 `primary === true` 时紧跟 kind）、`v${version}`、`contentType`（仅当存在且长度 > 0）、然后是**二者之一**：`kind` 属于 `chart`/`table`/`metrics`/`board` 时，`itemCount` 存在则加 `${itemCount} item(s)`（`1` 用单数 `item`，其他含 0 用 `items`）；否则 `bytes` 存在则加 `${bytes} bytes`。`title` 经 `trim()` 后为空或 `undefined` 时**连冒号一起省略**，否则追加 `` `: ${title}` ``。
- 错误语义：不抛错。
- 时序与并发：纯函数。
- 幂等：是。
- 资源释放：无。
- 平台差异：无。
- 状态所有者：无。
- 日志级别：无。
- 可测断言：`{id:"r", kind:"file", version:2}` → `"- r (file, v2)"`；加 `primary: true` → `"- r (file, primary, v2)"`；预置看板 `kind: "chart"` + `itemCount: 1` → 含 `"1 item"`（不是 items）；`kind: "file"` + `bytes: 0` → 含 `"0 bytes"`；`title: "   "` → 不含冒号。

### B70 `<artifacts>` 区段

- 来源：`executor/workflow-published-artifacts.ts`（`buildWorkflowArtifactsNotificationSection`、`WORKFLOW_ARTIFACTS_NOTIFICATION_MAX_LINES`、`WORKFLOW_ARTIFACTS_INTROSPECTION_MAX_LINES`）
- 输入：`artifacts | undefined`、`maxLines`。
- 输出：`undefined` 或空数组 → `undefined`；否则 `primaryFirst` 后取前 `maxLines` 行并格式化为一行，返回 `{count: 真实总件数, shown: 实际行数, preview: 行用 "\n" 连接}`。常量：通知区段上界 `8`，`GetWorkflowRun` 截面上界 `32`。
- 错误语义：不抛错。
- 时序与并发：纯函数。
- 幂等：是。
- 资源释放：无。
- 平台差异：无。
- 状态所有者：无。
- 日志级别：无。
- 可测断言：10 件 + `maxLines: 8` → `count === 10`、`shown === 8`；交付物在截断后仍出现（因为先排序）；空数组 → `undefined`。

### B71 manifest 载荷与截断诚实

- 来源：`executor/workflow-published-artifacts.ts`（`buildWorkflowArtifactsManifestSection`）
- 输入：`artifacts | undefined`。
- 输出：`undefined` 或空数组 → `undefined`；否则按 `primaryFirst` 顺序最多取 8 条，每条：`kind` 必须是 `file`/`markdown`/`chart`/`table`/`metrics`/`board` 之一（否则**整条跳过**）；`id` 为空串或长度 > 64 时整条跳过；`version` 必须是不小于 1 的整数（否则整条跳过）；`title` 先 `trim()`，空则省略键，否则截到 120 字符；`contentType` 长度 > 255 时**只丢这个键**（不丢整条）；`description` 只在 `primary === true` 时取并 `trim()`，空则省略，否则截到 500 字符。结果条数为 0 时返回 `undefined`；`artifactsTruncated: true` 的判据是「画出来的条数 < 输入总条数」（被上界砍掉的与被过滤掉的一样算截断）。
- 错误语义：不抛错。
- 时序与并发：纯函数。
- 幂等：是。
- 资源释放：无。
- 平台差异：无。
- 状态所有者：无。
- 日志级别：无。
- 可测断言：未知 `kind` 的条目被丢弃且**不**让其余条目消失；`version: 0` 整条丢弃；`id` 长 65 整条丢弃；`contentType` 长 256 只丢该键；输入 3 条但被过滤 1 条时 `artifactsTruncated === true`（3 > 2）。

### B72 端口详情到投影输入

- 来源：`executor/workflow-published-artifacts.ts`（`toPublishedArtifactSummaries`）
- 输入：`unknown`（期望数组）。
- 输出：不是数组或空数组 → `undefined`；逐条只接受非 `null` 对象；`id`/`kind` 必须是字符串、`version` 必须是数字（三者任一不符合则整条跳过）；`bytes` 只取 `versions` **最后一项**的 `bytes`（必须是数字）；`title`/`contentType`/`description` 只在是字符串时带上；`itemCount` 只在是数字时带上；`primary` 只在严格 `true` 时带上。全部条目都被跳过或输入为空时返回 `undefined`。
- 错误语义：不抛错（防御性检查：一个坏条目不该让整节消失）。
- 时序与并发：纯函数。
- 幂等：是。
- 资源释放：无。
- 平台差异：无。
- 状态所有者：无。
- 日志级别：无。
- 可测断言：`null`/`[]`/`"x"` → `undefined`；`versions: []` 时 `bytes` 缺席；`versions` 最后一项不是对象时 `bytes` 缺席；`primary: 1` 不带 `primary`（必须严格 `true`）；全坏条目时返回 `undefined`。

---

## V. 后台任务登记（`executor/background-task-registry.ts`）

本文件的多数函数只在「工具名映射到 runtime task 类型且 `deps.runtimeTaskRegistry` 存在」时才动 registry；两种情况下都是**静默 no-op**。

### B73 动态工作流入口名

- 来源：`executor/background-task-registry.ts`（`isDynamicWorkflowRunDispatchToolName`）
- 输入：`string`。
- 输出：名字是 `CreateWorkflow`、`AmendWorkflow` 或 `ResumeWorkflowRun` 之一时为真；其他为假。
- 错误语义：不抛错。
- 时序与并发：纯函数。
- 幂等：是。
- 资源释放：无。
- 平台差异：无。
- 状态所有者：无。
- 日志级别：无。
- 可测断言：`"CreateWorkflow"`、`"AmendWorkflow"`、`"ResumeWorkflowRun"` 为真；`"Workflow"`、`"Bash"`、`""` 为假（注意：**legacy `Workflow` 刻意不在内**）。

### B74 工具名到 runtime task 类型的映射

- 来源：`executor/background-task-registry.ts`（内部 `runtimeTaskTypeForToolCall`）
- 输入：`toolCall.name`。
- 输出：`Bash` → `local_bash`；`Workflow` → `local_workflow`；B73 的三个名字 → `local_dynamic_workflow`；其他 → `undefined`。
- 错误语义：不抛错。
- 时序与并发：纯函数。
- 幂等：是。
- 资源释放：无。
- 平台差异：无。
- 状态所有者：无。
- 日志级别：无。
- 可测断言（通过 `claimRuntimeBackgroundTaskNotification` 观察）：未知工具名时该函数**直接返回 `true`** 且不触碰 registry（即使 registry 存在）；`Bash` 时返回 `true` 且 registry 条目的 `notified` 被置真。

### B75 登记：身份面保留、结算面按「重臂」复位

- 来源：`executor/background-task-registry.ts`（`registerRuntimeBackgroundTask`）
- 输入：`deps`、`toolCall`、`taskId`、`output`、可选 `turnId`。
- 输出：工具名映射不到类型、或没有 registry 时返回。已有条目时：**身份面**用 `existing ?? 新值`（`agentId`、`agentType`、`description`、`parentToolCallId`、`startedAt`、`turnId`），**结算面**（`notified`、`completedAt`、`error`、`exitCode`、`resultText`、`pid`、`stopInitiator`）只在工具名属于 B73（「重臂」）时复位，否则保留既有值（`notified` 用 `existing ?? false`）。`outputFile` **不随结算面复位**（`本轮的 outputFile ?? existing.outputFile`）。`status` 恒置 `"running"`，`isBackgrounded` 恒真，`taskType`/`type` 是映射结果。
- 分支：已有条目且**不是**新生命（非重臂，或既有条目不是终态）→ 走 `registry.update`；首次登记或「重臂 + 既有终态」→ 走 `registry.register`，且**剥掉继承的 `branchGeneration`**（让 registry 按当前活动分支重新盖章）。
- 错误语义：不抛错（registry 端口自身抛错会传播）。
- 时序与并发：单次同步调用；同一 `taskId` 的并发登记由调用方（tracker 的 `trackedTaskIds`）串行化。
- 幂等：非重臂时重复登记不改变结算面；重臂时按新生命周期复位。
- 资源释放：无。
- 平台差异：无。
- 状态所有者：runtime-task registry。
- 日志级别：无。
- 可测断言：用一个记录调用的假 registry 验证——首次登记走 `register` 且参数没有 `branchGeneration` 键；非重臂的既有条目走 `update` 且 `notified`/`completedAt`/`error` 保持；`CreateWorkflow` 重臂到既有**终态**条目时 `notified` 复位为 `false`、`completedAt`/`error`/`exitCode`/`resultText`/`pid` 变 `undefined`，而 `agentId`/`parentToolCallId`/`startedAt` 保持；`outputFile` 在两轮之间保持。

### B76 更新：终态条目不再改动

- 来源：`executor/background-task-registry.ts`（`updateRuntimeBackgroundTask`）
- 输入：`deps`、`toolCall`、`taskId`、`status`、可选 `snapshot`。
- 输出：工具名映射不到类型或没有 registry 时返回；否则 `registry.update(taskId, current => ...)`：**current 已是终态时原样返回 current**；否则返回合并对象：`completedAt`（`status === "running"` 时为 `undefined`，否则 `snapshot.completedAt ?? new Date()`）`?? current.completedAt`、`description`（依次取 `snapshot.description` → `snapshot.name` → `input.description` → `input.command` → `input.name` → `input.scriptPath`）`?? current.description`、`error`（`snapshot.error` 的字符串形式或 `error.message`）`?? current.error`、`exitCode`（`snapshot.result.exitCode`）`?? current.exitCode`、`outputFile` `?? current.outputFile`、`pid` `?? current.pid`、`resultText` `?? current.resultText`（**`undefined` 绝不清掉已存下的产物**）、`status`（B77 的归一）、`isBackgrounded: true`、`taskType`/`type`。
- `resultText` 只在 B73 的工具名、且 `status !== "running"`、且快照带 `output` 字段时取 `serializeWorkflowArtifact(snapshot.output)`。
- 错误语义：不抛错（端口抛错传播）。
- 时序与并发：每次调用一次 `update`。
- 幂等：是（同样的 status 与快照得到同样的合并结果；`??` 保证不丢已有值）。
- 资源释放：无。
- 平台差异：无。
- 状态所有者：runtime-task registry。
- 日志级别：无。
- 可测断言：终态条目收到一次 `update` 后内容不变（假 registry 记录回调返回值）；`status: "running"` 不带快照时不写 `completedAt`；`status: "completed"` 不带快照时 `completedAt` 是 `Date`；已有 `resultText` 遇到不含 `output` 的快照时保持原值。

### B77 runtime 任务状态归一

- 来源：`executor/background-task-registry.ts`（内部 `normalizeRuntimeTaskStatus`，经 B76 观察）
- 输入：`status: string`。
- 输出：`running` → `running`；`completed` → `completed`；`cancelled`、`timed_out` → `killed`；`lost` → `lost`；其他（含 `failed`、空串、未知值）→ `failed`。
- 错误语义：不抛错。
- 时序与并发：纯函数。
- 幂等：是。
- 资源释放：无。
- 平台差异：无。
- 状态所有者：无。
- 日志级别：无。
- 可测断言：通过 B76 观察 `status` 字段的落库值：`"timed_out"` 落成 `"killed"`；`"whatever"` 落成 `"failed"`。

### B78 通知认领、释放与移除

- 来源：`executor/background-task-registry.ts`（`claimRuntimeBackgroundTaskNotification`、`releaseRuntimeBackgroundTaskNotification`、`removeRuntimeBackgroundTask`）
- 输入：`deps`、`toolCall`、`taskId`。
- 输出：三个函数在「工具名映射不到类型或无 registry」时直接返回（`claim` 返回 `true`）。`claim`：若 `update` 找不到条目（返回 `undefined`）则返回 `true`（视为可发）；否则只有**本次真的把 `notified` 从假置真**才返回 `true`，已被认领时返回 `false`。`release`：`notified` 为真才置假（幂等）。`remove`：调用 `registry.remove(taskId)`。
- 错误语义：不抛错（端口抛错传播）。
- 时序与并发：`claim` 的读写发生在同一次 `update` 回调内（原子认领）。
- 幂等：`claim` 第二次返回 `false`；`release` 重复调用无额外效果。
- 资源释放：`remove` 从 registry 删除条目。
- 平台差异：无。
- 状态所有者：runtime-task registry。
- 日志级别：无。
- 可测断言：连续两次 `claim` 得到 `true` 然后 `false`；`release` 后再 `claim` 得到 `true`；未知工具名的 `claim` 返回 `true` 且 registry 未被调用。

---

## W. 快照投影（`executor/background-tracker-projection.ts`）

### B79 快照源与等待者按工具名解析

- 来源：`executor/background-tracker-projection.ts`（`hasSnapshotProvider`、`hasDirectWaiter`、`readTaskSnapshot`、`waitForTaskSnapshot`）
- 输入：`deps`、`name`。
- 输出：
  - `Agent`/`Task`（B26）：快照源取 `deps.subagentPort.getTask`（存在才可用，调用时用端口作 receiver）；**没有**等待者；`cancellable` 取决于 `subagentPort.stopTask`。
  - B73 的三个名字：快照源取 `deps.dynamicWorkflowRunPort.getTask`；等待者取 `waitForTask`（是函数才可用）；`cancellable` 取决于 `cancel`。
  - `Workflow`：快照源取 `deps.workflowPort.getTask`；等待者取 `workflowPort.waitForTask`；`cancellable` 恒 `false`。
  - `Bash`：快照源取 `deps.executionPort.getBackgroundTask`；等待者取 `executionPort.waitForBackgroundTask`；`cancellable` 取决于 `executionPort.cancelBackgroundTask`。
  - **其他名字（含未知名字）**：走**同一个 executionPort 兜底分支**——只要 `deps.executionPort.getBackgroundTask` 存在就有快照源，`cancellable` 取决于 `executionPort.cancelBackgroundTask`；但等待者只对 `Bash` 开放（`name === "Bash"` 才读 `waitForBackgroundTask`）。即「未知名字」**不是**「三者都缺席」。
- 错误语义：`readTaskSnapshot`/`waitForTaskSnapshot` 在没有对应端口时返回 `undefined`（不抛错）；端口方法自身抛错原样传播。
- 时序与并发：解析是纯函数；实际读取是异步。
- 幂等：是。
- 资源释放：无。
- 平台差异：无。
- 状态所有者：各端口。
- 日志级别：无。
- 可测断言：`hasSnapshotProvider(deps, "Unknown")` 为假；只给 `subagentPort.getTask` 时 `Agent` 有快照源、`Bash` 没有；`hasDirectWaiter(deps, "Bash")` 在给了 `waitForBackgroundTask` 时为真；`readTaskSnapshot` 在无端口时 `await` 得到 `undefined`。

### B80 三个取字段助手

- 来源：`executor/background-tracker-projection.ts`（`field`、`stringField`、`snapshotString`）
- 输入：对象与键名。
- 输出：`field` 用 `key in snapshot` 判定，键不存在或 `snapshot` 为假值时返回 `undefined`（**键存在但值为 `undefined` 时也返回 `undefined`**，因为读出来就是 `undefined`）；`stringField` 直接读属性，非字符串返回 `undefined`；`snapshotString` 是 `field` + `typeof === "string"`。
- 错误语义：不抛错；会触发原型链上的 getter（`stringField` 直接索引，`field`/`snapshotString` 先 `in` 再索引）。
- 时序与并发：纯函数。
- 幂等：是。
- 资源释放：无。
- 平台差异：无。
- 状态所有者：无。
- 日志级别：无。
- 可测断言：`field({a: undefined}, "a") === undefined`；`field({}, "toString")` 因 `in` 命中原型而返回函数（这是既有语义，不要"修正"）；`stringField({a: 1}, "a") === undefined`；`snapshotString` 与 `field` 对字符串键一致。

### B81 工作流主题

- 来源：`executor/background-tracker-projection.ts`（`workflowSubject`）
- 输入：`call`、`taskId`、可选 `snapshot`、可选 `launch`。
- 输出：按顺序取第一个可用者：`call.input.description` → `snapshot.description` → `snapshot.name` → `launch.name` → `call.input.name` → `call.input.scriptPath` → `taskId`（兜底）。全部要求字符串。
- 错误语义：不抛错（`call.input` 不是对象时按 `undefined` 处理）。
- 时序与并发：纯函数。
- 幂等：是。
- 资源释放：无。
- 平台差异：无。
- 状态所有者：无。
- 日志级别：无。
- 可测断言：`input.description` 优先于 `snapshot.name`；都没有时回落 `taskId`；`input` 为 `null` 时不抛错。

### B82 错误消息与运行签名

- 来源：`executor/background-tracker-projection.ts`（`errorMessage`、`runningSignature`）
- 输入：`errorMessage(unknown)`；`runningSignature(snapshot)`。
- 输出：`errorMessage` 对 `Error` 实例取 `.message`，其他一律 `String(error)`；`runningSignature` 是 `JSON.stringify({pid, stderrBytes, stderrTail, stdoutBytes, stdoutTail})`（**字段顺序固定**为 pid、stderrBytes、stderrTail、stdoutBytes、stdoutTail；缺席字段在 JSON 里被省略）。
- 错误语义：都不抛错。
- 时序与并发：纯函数。
- 幂等：是。
- 资源释放：无。
- 平台差异：无。
- 状态所有者：无。
- 日志级别：无。
- 可测断言：`errorMessage("x") === "x"`；`errorMessage(new Error("y")) === "y"`；两个只在 `stdoutBytes` 上不同的快照得到不同签名；只在 `description` 上不同的快照得到**相同**签名（签名刻意不含它）。

### B83 事件载荷投影

- 来源：`executor/background-tracker-projection.ts`（`taskPayload`）
- 输入：`deps`、`call`、`taskId`、`status`、`launch`、可选 `snapshot`。
- 输出：固定字段对象。要点：`taskKind` 依次判 `Agent`/`Task` → `"subagent"`、B73 → `"workflow"`、否则 `"bash"`；`cancellable` 只在 `status === "running"` 时取 B79 的 `cancellable`，否则恒 `false`；`command` 取 `input.command`（字符串）；`description` 对 B73 工具取 `workflowSubject`，否则 `input.description` → `snapshot.description`；输出文件/字节/尾部字段全部来自 B23 的 `backgroundTaskOutputMetadata(snapshot, launch)`；`terminalId` 等于 `taskId`；`startedAt`/`completedAt`/`pid` 直接取快照字段。
- 错误语义：不抛错。
- 时序与并发：纯函数。
- 幂等：是。
- 资源释放：无。
- 平台差异：无。
- 状态所有者：无。
- 日志级别：无。
- 可测断言：`status: "running"` 且有可取消端口时 `cancellable === true`；`status: "completed"` 时 `cancellable === false`；`terminalId === taskId`；`taskKind` 对 `CreateWorkflow` 是 `"workflow"`。

### B84 后台任务事件发布

- 来源：`executor/background-tracker-projection.ts`（`emitBackgroundTaskEvent`）
- 输入：`deps`、`type`、`payload`、`traceContext`、`turnId`。
- 输出：`await deps.emitEvent({...})`，事件带新的 UUID、`sessionId` 取 `deps.sessionId`、`turnId` 取参数、`traceId` 取 `traceContext.traceId`、`sequenceNumber: 0`、`timestamp` 为当前时间，`payload` 是**同一引用**。
- 错误语义：`emitEvent` 拒绝时原样抛出。
- 时序与并发：单次 await。
- 幂等：不幂等。
- 资源释放：无。
- 平台差异：无。
- 状态所有者：无。
- 日志级别：无。
- 可测断言：`payload` 引用相等；`sequenceNumber === 0`；`type` 原样透传。

---

## X. 终态通知入队（`executor/background-tracker-notification.ts`）

`enqueueTerminalNotification` 是唯一导出。它的**门禁顺序**是兼容面：没有入队端口 → `superseded` 抑制 → 运行时策略抑制 → 格式化文本（空则不排队）→ 认领 → 入队（失败则释放认领并 `warn`）→ `info`。

### B85 门禁顺序与抑制

- 来源：`executor/background-tracker-notification.ts`（`enqueueTerminalNotification`）
- 输入：`deps`、`call`、`taskId`、`status`、`traceContext`、可选 `snapshot`、可选 `launch`。
- 输出：
  1. `deps.enqueueBackgroundTaskNotification` 缺席：写 `debug`（`background_task.notification.queue_unavailable`）后返回。
  2. 终态事实的 `stopReason === "superseded"`：**先认领**（调用 `claimRuntimeBackgroundTaskNotification`，避免同一 run 再被通知）再写 `info`（`background_task.notification.suppressed`，`reason: "workflow_run_superseded"`）后返回。
  3. `deps.shouldEnqueueBackgroundTaskNotification` 返回**严格 `false`**：写 `info`（`reason` 缺省的那个 suppressed）后返回（返回 `undefined`/`true` 都不抑制）。
  4. 按工具名生成文本（见 B86）：为空则写 `debug`（`reason: "empty_message"`）后返回。
  5. 认领失败（返回 `false`）则写 `debug`（`notification_already_handled`）后返回。
  6. 入队；入队抛错时**释放认领**并写 `warn`（`background_task.notification.enqueue failed`，带 `errorMessage`）后返回（不重抛）。
  7. 成功后写 `info`（`background_task.notification.enqueued`）。
- 错误语义：只有入队失败被吞成 `warn`；日志端口自身抛错会传播。
- 时序与并发：认领与入队之间的顺序不可交换（先认领再入队，失败回滚认领）。
- 幂等：同一 `taskId` 第二次调用在认领处返回 `false`，不会二次入队。
- 资源释放：入队失败时释放认领。
- 平台差异：无。
- 状态所有者：runtime-task registry 的 `notified` 位 + 入队端口。
- 日志级别：`debug`、`info`、`warn`。
- 可测断言：没有入队端口时**不**调用认领；`shouldEnqueue...` 返回 `undefined` 时照常入队、返回 `false` 时不入队；入队端口抛错时 `notified` 被释放（再次调用仍能认领成功）；同一 `taskId` 两次调用只入队一次。

### B86 文本与来源元数据

- 来源：`executor/background-tracker-notification.ts`（`workflowText`、`bashText`、`notificationOrigin`、`workflowSummary`、`workflowManifest`、`terminalFacts`、`normalizedStatus`）
- 输入：同 B85。
- 输出：
  - 只有 `Workflow`、B73 三个名字走工作流文本；`Bash` 走 bash 文本；**其他工具名文本为空**（因此第 4 步直接返回）。
  - 状态归三值：`completed` → `completed`；`cancelled`/`timed_out`/`killed`/`stopped` → `killed`；其他（含 `lost`、`failed`）→ `failed`。
  - 终态事实优先取快照的 `runStatus`（只接受 `completed`/`errored`/`stopped`），否则由 status 推导（`completed`→completed、`failed`→errored、`cancelled`→stopped）；`stopReason` 只在 `runStatus === "stopped"` 且是五个允许值之一时带出。
  - bash 摘要：`Background command "<subject>"` + 后缀（`lost` → ` failed because its in-process state was lost`；`completed` → ` completed` + 有 exitCode 时 ` (exit code N)`；`failed` → ` failed` + 有 exitCode 时 ` with exit code N`；否则 ` was stopped`）。`subject` 取 `input.description` → `input.command` → `"Bash background command"`。
  - 工作流摘要：`Workflow "<subject>"` + 后缀（`lost`、`errored`、`stopped`/`killed` 按 `stopReason` 五选一、否则 `completed.`/`failed.`）。
  - 来源元数据：`Bash` → `{backgroundSource: "bash", title: description || command || call.name || taskId, workId: taskId}`；B73 → `{backgroundSource: "workflow", title: subject, workId: taskId, workflowNotification?: manifest}`；其他工具名 → `undefined`（不附 `originMeta`）。
- 错误语义：不抛错。
- 时序与并发：纯投影。
- 幂等：是。
- 资源释放：无。
- 平台差异：无。
- 状态所有者：无。
- 日志级别：无。
- 可测断言：工具名为 `Read` 时不入队（走 `empty_message` 分支）；`Bash` 且 `input.description` 为空时标题回落 `input.command`；`status: "cancelled"` 的 bash 摘要以 ` was stopped` 结尾；B73 且 `stopReason: "superseded"` 在 B85 第 2 步就被抑制、根本不到文本生成。

### B87 工作流 manifest 的界

- 来源：`executor/background-tracker-notification.ts`（`workflowManifest`）
- 输入：`subject`、`status`、可选 `snapshot`。
- 输出：`snapshot` 缺席、或 `status` 不属于 `completed`/`failed`/`cancelled` 时返回 `undefined`；否则返回 `{kind: "terminal", status: <runStatus>, stopReason?, summary: subject.slice(0,500)}`，并按存在性追加：`result`（`serializeWorkflowArtifact(snapshot.output)` 截到 4000 字符，超出时 `resultTruncated: true`，并标 `resultForm` 为 `"prose"`（原始输出是字符串）或 `"json"`）、`error`（`snapshot.error` 字符串截到 2000）、`reports`（B22 的清单区段）、`artifacts` + 可选的 `artifactsTruncated`（B71）、`durationMs`（仅当 `startedAt`/`completedAt` 都是 `Date` 且差值有限非负）。
- 错误语义：不抛错。
- 时序与并发：纯投影。
- 幂等：是。
- 资源释放：无。
- 平台差异：无。
- 状态所有者：无。
- 日志级别：无。
- 可测断言：`status: "running"` 时 `workflowNotification` 缺席；`summary` 在 subject 超过 500 字符时被截断；`durationMs` 在只有 `startedAt` 时不出现。

---

## Y. 纯声明文件

### B88 两个 `types.ts` 只有声明

- 来源：`executor/types.ts`（9 个导出）、`types.ts`（29 个导出）、以及 `bash-timeout-policy.ts` / `read-file-state-metadata.ts` / `background-*.ts` 中的接口与类型别名。
- 输入：无。
- 输出：编译期类型面必须与 `interface.md` 逐字一致；运行时**不产生任何导出值**。
- 错误语义：类型不匹配在编译期失败。
- 时序与并发：无。
- 幂等：无。
- 资源释放：无。
- 平台差异：无。
- 状态所有者：无。
- 日志级别：无。
- 可测断言：编译通过（`pnpm typecheck`）；`interface.md` 的导出名集合与源码逐字核对一致（用脚本比对，不靠目测）。
