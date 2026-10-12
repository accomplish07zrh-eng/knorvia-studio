# contracts-02 行为规格（behavior.md）

每条编号 `B1`、`B2`…，发布后编号不重用。每条写：输入、输出、错误语义、时序与并发、幂等、资源释放、平台差异、状态所有者、日志级别；不适用的项写「不适用」。每条至少被 `tests/` 里一个断言覆盖（末尾标注）。

本包是 `@knorvia/contracts` 的 `tools`（44 继承文件）、`tracing`（4）、`workflow`（7）、`rewind`（1），共 56 个继承文件。工具文件以 **zod/JSON schema 与常量**为主；行为条目覆盖运行时可观察的契约（schema 接受/拒绝、常量取值、纯函数语义、span 生命周期），纯类型文件由 B1 的导出面断言覆盖。

## B1 公开入口导出面

- 输入：包公开子路径（`.`、`./tools`、`./tools/websearch`、`./workflow`、`./rewind`；`./tools/node-repl` 属已登记 independent-replacement，不在本合同范围）。
- 输出：每个子路径都能载入，且导出 `interface.md` 列出的运行时名字（名称与种类一致）。
- 错误语义：入口缺失或运行时导出缺失即违约。时序与并发：模块求值一次，重复 import 返回同一命名空间。
- 幂等：是。资源释放：不适用。平台差异：不适用。状态所有者：模块自身。日志级别：不适用。
- 例外：`tracing/span-residence.ts` 是包内私有模块（不经任何公开入口导出），由 B3 经公开的 `createSpan`/`createTracer` 间接覆盖。
- （测试：api-surface.test.mjs「每个公开子路径都能载入并导出 interface.md 列出的运行时名字」「包根入口覆盖本包四个区的关键导出」）

## B2 追踪上下文（`tracing/tracer.ts`）

- 输入：`createRootTraceContext(options?)`、`createChildTraceContext(parent, options?)`、`runWithContext`、`runWithContextAsync`、`getCurrentTraceContext`、`createSpan`、`traceContextToLogContext`。
- 输出：root 上下文生成 `traceId`（未给时新生成）与 16 字符 `spanId`，`queryId`/`sessionId`/`turnId`/`attributes` 缺省为 `undefined`；child 上下文沿用 parent 的 `traceId`，`spanId` 新生成，`parentSpanId` 与 `parentId` 都等于 parent 的 `spanId`，`queryId`/`sessionId`/`turnId` 缺省继承 parent，`attributes` 为 parent 与 options 的合并（options 覆盖同键）。
- 错误语义：无（不抛错）。
- 时序与并发：ambient 上下文经 `AsyncLocalStorage` 传递；`runWithContext`/`runWithContextAsync` 作用域结束后不得残留（同步与异步都验证）。
- 幂等：`getCurrentTraceContext` 在作用域外恒为 `undefined`。资源释放：作用域结束即释放 ambient 槽位。平台差异：不适用（只用 `node:async_hooks`）。状态所有者：AsyncLocalStorage（进程内）。日志级别：`traceContextToLogContext` 输出 `traceId/queryId/spanId/parentSpanId/sessionId/turnId` + attributes 平铺。
- （测试：behavior.test.mjs「B2 追踪上下文：root/child 字段与 ambient 语义」「B2b 异步 ambient 上下文与 createSpan 继承」）

## B3 span 驻留语义（`tracing/span-residence.ts`，经公开 `createSpan`/`createTracer` 覆盖）

- 输入：`createSpan(name)` / `createTracer(name, onSpanEnd?)` 的 `startSpan`、`withSpan`、`withSpanAsync`；span 的 `setAttribute`、`setAttributes`、`addEvent`、`end`。
- 输出：新 span `status="running"`、`attributes={}`、`endTime=undefined`、`spanId` 为 16 字符；`setAttribute`/`setAttributes` 写入同一 `attributes` record；`addEvent` 无副作用（契约没有 exporter，不存可增长事件集合）；`end()` 置 `status="completed"` 与 `endTime`；`end(error)` 置 `status="error"` 并保存该 Error。
- 错误语义：`withSpan` 同步回调抛错时 span 以该错误结算后**原样重抛**；`withSpanAsync` 拒绝时同样结算并原样重抛（错误时序保持 direct-then 边界，不用 async 包装）。
- 时序与并发：同一 span 只结算一次（重复 `end` 不改变状态与 `endTime`）；`onEnd` 钩子在结算后以**同一个 record** 调用一次。
- 幂等：重复 `end` 幂等。资源释放：不适用（内存 record，无 exporter）。平台差异：`spanId` 用 `crypto.randomUUID().slice(0,16)`，跨平台一致。状态所有者：span record 自身（`WeakMap` 只关联回调）。日志级别：不适用。
- （测试：behavior.test.mjs「B3 span 驻留语义：状态、属性、单次结算与 onEnd 钩子」）

## B4 Read PDF 契约（`tools/read-pdf.ts`）

- 输入：`parseReadPdfPageRange(value)`；`getReadPdfPagesValidationFailure(filePath, pages)`。
- 输出：`"1-5"` → `{firstPage:1,lastPage:5}`；`"3"` → `{3,3}`；`"10-"` → `{firstPage:10,lastPage:Infinity}`（开放区间）；非法（`"5-3"`、`"0"`、`"1-2-3"`、`"abc"`、空串）→ `undefined`。校验函数：非 `.pdf` 或 `pages` 未给 → `undefined`；解析失败 → `{errorCode:7, message:"Invalid pages parameter: …"}`；页数超过 20（含开放区间按 21 计）→ `{errorCode:8, message:"Page range … exceeds maximum of 20 pages per request. …"}`。
- 错误语义：解析与校验都不抛错，用返回值表达（调用方据此给模型可读消息）。
- 时序与并发：纯函数。幂等：是。资源释放：不适用。平台差异：不适用。状态所有者：无。日志级别：不适用。
- 常量（兼容契约）：`READ_PDF_NATIVE_MAX_INPUT_BYTES=20971520`、`READ_PDF_EXTRACT_MAX_INPUT_BYTES=104857600`、`READ_PDF_NATIVE_MAX_PAGES=10`、`READ_PDF_MAX_PAGES_PER_REQUEST=20`、`READ_PDF_INFO_TIMEOUT_MS=10000`、`READ_PDF_AVAILABILITY_TIMEOUT_MS=5000`、`READ_PDF_RENDER_TIMEOUT_MS=120000`；`ReadErrorCode` 13 个值 7–20（见测试）。
- （测试：behavior.test.mjs「B4 Read PDF：常量、分页解析与校验失败」「B5 Read 常量与错误码取值」）

## B5 Read 工具常量与错误码（`tools/read.ts`）

- 输入：无。
- 输出：`READ_DEFAULT_MAX_LINES=2000`、`READ_MAX_OUTPUT_TOKENS=25000`、`READ_IMAGE_MAX_DIMENSION=2000`、`READ_IMAGE_TOKEN_TO_BASE64_CHAR_RATIO=0.125`、`READ_PDF_MAX_PAGES_PER_REQUEST=20`；`ReadErrorCode` 取值固定（`PDF_INVALID_PAGES=7` … `PDF_PROCESS_FAILED=20`）。
- 错误语义：不适用。时序与并发：不适用。幂等：常量。资源释放：不适用。平台差异：不适用。状态所有者：模块常量。日志级别：不适用。
- （测试：behavior.test.mjs「B5 Read 常量与错误码取值」）

## B6 goal/target schema（`tools/target.ts`）

- 输入：`GoalStatusSchema`、`GoalTokenBudgetSchema`、`GoalObjectiveSchema`、`SessionGoalSchema`、`GoalReadInputSchema`、`GoalReadOutputSchema` 的任意值；`normalizeGoalObjective(value)`；`formatGoalStateForModel(goal|null)`。
- 输出：`GoalStatus` = `active|paused|budget_limited|complete`；`MAX_GOAL_OBJECTIVE_CHARS=4000`；`GOAL_COMPLETION_VERIFICATION_QUERY_SOURCE="target_completion_verification"`；token budget 接受正整数或 `null`，拒绝 0/负数；objective 先去首尾空白再校验非空且 ≤4000 字符；`SessionGoalSchema` 为 strict 对象（`sessionID/targetID/objective/summaryTitle/status/tokenBudget/tokensUsed/timeUsedSeconds/time{created,updated}` 必填，`time` 也是 strict）；`GoalReadInputSchema` 为 `{}` strict；`GoalReadOutputSchema` 要求 `goal`（可空）；`formatGoalStateForModel(null)` 返回空串。
- 错误语义：非法输入由 zod 抛错（`parse`）或返回 `success:false`（`safeParse`）。
- 时序与并发：纯函数。幂等：是。资源释放：不适用。平台差异：不适用。状态所有者：无。日志级别：不适用。
- 说明：`Target*` 兼容别名已按 knip 与全仓搜索确认为无引用，在合同前单独提交删除（`edc59645`），不再属于兼容面。
- （测试：behavior.test.mjs「B6 goal/target schema 与文案」）

## B7 rewind 契约（`rewind/index.ts`）

- 输入：`RewindScope`/`RewindStrategy`/`RewindTargetStatus` 常量；`parseCheckpointCreatedPayload`/`parseRewindTriggeredPayload`/`parseWorkspaceCheckpointArtifact`；`evaluateRewindTarget(input)`；`selectActiveConversationBranch(messages, options?)`。
- 输出：scope = `conversation|workspace|both`；strategy = `active_chain|file_only|fork_required|unavailable`；targetStatus = `active_chain|covered_by_compact|missing`。`evaluateRewindTarget`：目标不在 items 中 → `{strategy:"unavailable", targetStatus:"missing", allowedScopes:[], reason:"target_not_found"}`；在活跃链且无 checkpoint → `allowedScopes:["conversation"]`、`reason:"target_in_active_chain"`；有 checkpoint → `allowedScopes:["conversation","workspace","both"]`。`selectActiveConversationBranch`：无 `rewindTargetMessageId` → 原数组副本；有目标 → 目标之前的消息；给了 `rewindKeptMessageIds` → 按给定 id 取消息（未知 id 忽略）。
- 错误语义：三个 `parse*` 对非法 payload 抛 zod 错误，不返回 `undefined`。
- 时序与并发：纯函数。幂等：是。资源释放：不适用。平台差异：不适用。状态所有者：无（调用方持有会话记录）。日志级别：不适用。
- （测试：behavior.test.mjs「B7 rewind 常量、payload 解析与目标判定」）

## B8 CreateWorkflow 契约（`tools/create-workflow.ts`）

- 输入：常量；`CreateWorkflowInputSchema`、`CreateWorkflowDiagnosticSchema`、`CreateWorkflowEdgeSchema` 的任意值。
- 输出：`CREATE_WORKFLOW_TOOL_NAME="CreateWorkflow"`；`CREATE_WORKFLOW_STEP_KINDS=["ask","world-read"]`；图上限 `MAX_STEPS=64`、`MAX_PHASES=32`、`MAX_LANES=32`、`MAX_HANDOFFS=256`、`MAX_ID_CHARS=64`、`MAX_NAME_CHARS=128`、`MAX_HANDOFF_TYPES=8`、`MAX_PARTICIPANTS=64`、`MAX_PHASE_EDGES=128`；display 上限 `MAX_DIAGNOSTICS=100`、`MAX_MESSAGE_CHARS=2048`；`CreateWorkflowInputSchema` 为 strict（接受 `{script}`，拒绝未知键）；诊断与边 schema 为 strict，缺字段或多余字段被拒。
- 错误语义：非法输入 `safeParse.success=false`。
- 时序与并发：纯函数。幂等：是。资源释放：不适用。平台差异：不适用。状态所有者：无。日志级别：不适用。
- 说明：「script / path / saved 三选一」的来源互斥**不在 schema 内**（旧实现由工具处理层校验），本合同只断言 schema 自身可见的行为。
- （测试：behavior.test.mjs「B8 CreateWorkflow 常量与输入 schema」）

## B9 workflow canonical schema 与 Expert 别名（`workflow/definition.ts`、`workflow/run-schema.ts`）

- 输入：`WorkflowStrategySchema` 任意值；`ExpertWorkflowStrategySchema`、`ExpertWorkflowRunSnapshotSchema`。
- 输出：`ExpertWorkflowStrategySchema === WorkflowStrategySchema`、`ExpertWorkflowRunSnapshotSchema === WorkflowRunSnapshotSchema`（同一 schema 对象，别名不是副本）；`WorkflowStrategySchema` 要求 `clarify{confidenceThreshold,maxRounds,minRounds}`、`executor{drainingChangeHours,frontierTarget,maxConcurrentLoops,maxConsecutiveErrors,maxPlannerRuns}`、`finalCritic{maxIterations}`、`reactLoop{maxRounds}`，正整数约束生效（`maxRounds:0` 被拒）。
- 错误语义：非法输入 `safeParse.success=false`；未知键被拒。
- 时序与并发：纯函数。幂等：是。资源释放：不适用。平台差异：不适用。状态所有者：无。日志级别：不适用。
- （测试：behavior.test.mjs「B9 workflow canonical schema 与 Expert 别名」）
