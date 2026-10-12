# contracts-01 行为规格（behavior.md）

每条编号 `B1`、`B2`…，发布后编号不重用。每条写：输入、输出、错误语义、时序与并发、幂等、资源释放、平台差异、状态所有者、日志级别；不适用的项写「不适用」。每条至少被 `tests/` 里一个断言覆盖（末尾标注）。

本包以类型与接口为主；行为条目覆盖**运行时可观察的契约**：常量取值、schema 校验、纯函数语义、投影/保留策略与内存事件存储。纯类型文件（`interfaces/*.port.ts`、各 `*.events.ts` 的类型部分）由 B1 的导出面断言覆盖，不单列条目。

## B1 包入口导出面

- 输入：包公开子路径（`.`、`./capabilities`、`./commands`、`./compact`、`./config`、`./events`、`./hooks`、`./interfaces`、`./model`、`./plugins`）。
- 输出：每个子路径都能载入，且导出 `interface.md` 列出的名字（名称与种类一致；空的 `./capabilities` 允许零导出）。
- 错误语义：入口缺失或导出缺失即为违约。
- 时序与并发：模块求值一次，重复 import 返回同一命名空间。
- 幂等：是。资源释放：不适用。平台差异：不适用。状态所有者：模块自身。日志级别：不适用。
- （测试：api-surface.test.mjs「每个公开子路径都能载入并导出 interface.md 列出的名字」）

## B2 会话标识工厂（`interfaces/shared.ts`）

- 输入：可选的 id 片段；不传时用随机/可排序片段。
- 输出：`createSessionId` → `sess_…`、`createTurnId` → `turn_…`、`createEventId` → `evt_…`、`createQueryId` → `query_…`、`createToolCallId` → `tool_…`、`createMessageId` → `msg_…`、`createPartId` → `part_…`、`createInputHistoryId` → `input_…`、`createProjectId` → `proj_…`、`createWorkspaceId` → `ws_…`、`createTraceId` → 裸 UUID（无前缀）。
- 错误语义：无。
- 时序与并发：同一毫秒内多次调用必须互不相同（随机片段保证）。
- 幂等：不适用（每次生成新 id）。资源释放：不适用。平台差异：不适用。状态所有者：无全局状态。日志级别：不适用。
- （测试：behavior.test.mjs「标识工厂保留既有前缀且同一毫秒内不重复」）

## B3 日志级别常量（`logging/logger.ts`）

- 输入：无。
- 输出：`LogLevel` = `{Debug:0, Info:1, Warn:2, Error:3}`；`LogLevelName` 以数值为键映射到 `"DEBUG"/"INFO"/"WARN"/"ERROR"`。
- 错误语义：不适用。时序与并发：不适用。幂等：常量。资源释放：不适用。平台差异：不适用。状态所有者：模块常量。日志级别：本条目定义级别本身。
- （测试：behavior.test.mjs「日志级别常量与名称映射保持既有取值」）

## B4 命令参数切分（`commands/index.ts` · `splitCustomCommandArguments`）

- 输入：任意字符串。
- 输出：按空白切分后的参数数组；单/双引号内的空白不分段且引号本身不保留；反斜杠转义下一个字符（引号内同样生效）；末尾未闭合的引号保留已收集内容；输入末尾的孤立反斜杠按字面 `\` 追加。
- 错误语义：无（永不抛错）。时序与并发：纯函数。幂等：是。资源释放：不适用。平台差异：不适用（只按 `\s` 与引号规则）。状态所有者：无。日志级别：不适用。
- （测试：behavior.test.mjs「命令参数切分：引号、转义与未闭合引号」）

## B5 命令模板展开（`commands/index.ts` · `expandCustomCommandTemplate`）

- 输入：`{ args, command }`，`command.content` 为模板正文。
- 输出：`{ argumentCount, body, usedArgumentsPlaceholder }`。`args` 先去首尾空白；`$ARGUMENTS` 全部替换为整段 args；`$1`、`$2`… 按 1 基序号替换为对应参数，越界替换为空字符串；两种占位符任一出现即把 `usedArgumentsPlaceholder` 置为 true；当 args 非空且未使用占位符时，正文末尾追加 `\n\nUser arguments:\n<args>`。
- 错误语义：无。时序与并发：纯函数。幂等：是。资源释放：不适用。平台差异：不适用。状态所有者：无。日志级别：不适用。
- （测试：behavior.test.mjs「命令模板展开：$ARGUMENTS、位置参数与 User arguments 追加」）

## B6 命令提示格式化（`commands/index.ts` · `formatCustomCommandPrompt`）

- 输入：`{ argumentCount, body, command, usedArgumentsPlaceholder }`。
- 输出：`prompt` 由四段按序拼接：`Run custom command /<name>.`、`Command source: <scope>/<source>.`、可选的两行技能指令（`Required skills: \`a\`, \`b\`.`与`Before following the command body, call the Skill tool for \`a\`, \`b\`.`，仅在 `skills` 非空时出现）、空行、`body.trim()`；并回传 `argumentCount`与`usedArgumentsPlaceholder`。
- 错误语义：无。时序与并发：纯函数。幂等：是。资源释放：不适用。平台差异：不适用。状态所有者：无。日志级别：不适用。
- （测试：behavior.test.mjs「命令提示格式化：来源行、技能指令与正文顺序」）

## B7 动态语法拒绝（`commands/index.ts` · `detectUnsupportedDynamicSyntax` / `expandCustomCommandPrompt`）

- 输入：正文文本；或 `{ args, command }`。
- 输出：正文含 `` !`…` `` 行内形式或 ` ```! ` 围栏形式时 `detectUnsupportedDynamicSyntax` 返回 `"shell"`，否则 `undefined`；`expandCustomCommandPrompt` 在展开后的正文上检测到该语法时**抛错**，错误信息为 `Custom command /<name> uses unsupported shell expansion. Dynamic expansion is not available yet.`
- 错误语义：见上（未支持语法必须显式失败，不能静默忽略）。
- 时序与并发：纯函数。幂等：是。资源释放：不适用。平台差异：不适用。状态所有者：无。日志级别：不适用。
- （测试：behavior.test.mjs「动态 shell 语法被识别并让 expandCustomCommandPrompt 抛错」）

## B8 命令契约字面量（`commands/index.ts`）

- 输入：无。
- 输出：`CustomCommandScope` 允许 `project|user|system|admin`；`CustomCommandSource` 允许 `agents|knorvia|plugin`；诊断严重级别只有 `warning|error`；诊断码集合为 `custom_command_duplicate_name`、`_invalid_frontmatter`、`_invalid_name`、`_read_failed`、`_root_not_found`、`_scan_failed`、`_too_large`、`_unknown_frontmatter`、`_unsupported_dynamic_syntax`（类型层契约，运行时不导出常量）。
- 错误语义：不适用。时序与并发：不适用。幂等：不适用。资源释放：不适用。平台差异：不适用。状态所有者：类型声明。日志级别：不适用。
- （测试：api-surface.test.mjs「命令/紧凑/日志等模块导出 interface.md 列出的名字」；字面量取值由 TypeScript 编译期约束）

## B9 紧凑边界常量（`compact/index.ts`）

- 输入：无。
- 输出：`CompactTrigger`（`manual/auto/partial/reactive/session_memory`）、`MicrocompactTrigger`（`time_based/token_pressure`）、`MicrocompactStrategy`（`local_tool_result_clear`）、`CompactPhase`（`standalone_turn/pre_request/mid_turn/reactive`）、`CompactReason`（`user_requested/context_limit/model_downshift/provider_overflow`）、`CompactStatus`（`started/boundary_created/summary_created/completed/failed`）、`CompactTimelineStatus`（`started/retrying/skipped/completed/failed/interrupted`）、`CompactTimelineDisplay`（`separator`）、`CompactFailureReason`（`not_enough_messages/prompt_too_long/no_summary/api_error/cancelled/hook_failed/relink_failed/unknown`）。
- 错误语义：不适用。时序与并发：不适用。幂等：常量。资源释放：不适用。平台差异：不适用。状态所有者：模块常量。日志级别：不适用。
- （测试：behavior.test.mjs「紧凑相关常量取值保持既有字面量」）

## B10 紧凑边界 payload 校验（`compact/index.ts` · `compactBoundaryPayloadSchema` / `parseCompactBoundaryPayload`）

- 输入：任意值。
- 输出：合法输入解析为边界 payload；`summaryMessageIds` 缺省为 `[]`；`traceId`、`boundaryId`、`trigger`、`preCompactTokenCount`、`summarizedMessageCount` 必填且分别为非空字符串/枚举/非负整数。
- 错误语义：未知字段（strict）、缺必填、类型不符、负数 token 计数一律抛 zod 错误；`parseCompactBoundaryPayload` 不吞错。
- 时序与并发：纯函数。幂等：是。资源释放：不适用。平台差异：不适用。状态所有者：无。日志级别：不适用。
- （测试：behavior.test.mjs「紧凑边界 payload：必填、默认值与 strict 拒绝未知字段」）

## B11 紧凑时间线 payload 校验与 text 剔除（`compact/index.ts` · `compactTimelinePayloadSchema` / `parseCompactTimelinePayload`）

- 输入：任意值。
- 输出：合法输入解析成功；`display` 缺省为 `separator`；解析结果**不含** `text` 字段（历史遗留字段在 transform 里被丢弃），其余字段原样保留。
- 错误语义：未知字段（strict）与非法 status/trigger 抛错。
- 时序与并发：纯函数。幂等：是。资源释放：不适用。平台差异：不适用。状态所有者：无。日志级别：不适用。
- （测试：behavior.test.mjs「时间线 payload：display 默认值且 text 被剔除」）

## B12 微紧凑边界 payload 校验（`compact/index.ts` · `microcompactBoundaryPayloadSchema` / `parseMicrocompactBoundaryPayload`）

- 输入：任意值。
- 输出：合法输入解析成功；`trigger`/`strategy` 必须是既有枚举值；`clearedToolCallIds`、`keptToolCallIds` 必须是非空字符串数组；token 计数与 `clearedMessageCount` 为非负整数。
- 错误语义：非法枚举、空字符串 id、负数计数、未知字段抛错。
- 时序与并发：纯函数。幂等：是。资源释放：不适用。平台差异：不适用。状态所有者：无。日志级别：不适用。
- （测试：behavior.test.mjs「微紧凑边界 payload：枚举、id 数组与非负计数」）

## B13 紧凑上下文辅助函数（`compact/index.ts`）

- 输入：`isCompactBoundaryItem` 任意值；`buildPostCompactItems` 的 `CompactPostContext`；`getItemsAfterLastCompactBoundary` 的 items 与可选判定函数；`annotateBoundaryWithPreservedSegment` 的 boundary 与 preservedSegment。
- 输出：`isCompactBoundaryItem` 仅在对象带合法 `compactBoundary` 时为 true；`buildPostCompactItems` 顺序固定为 `boundaryMarker → summaryMessages → messagesToKeep → attachments → hookResults`（缺省段跳过）；`getItemsAfterLastCompactBoundary` 返回**最后一个**边界（含）之后的切片，没有边界时返回整个数组的副本；`annotateBoundaryWithPreservedSegment` 返回新对象并把 `preservedSegment` 合并进 `compactBoundary`，不修改入参。
- 错误语义：`annotateBoundaryWithPreservedSegment` 对没有 `compactBoundary` 的项抛 `Cannot annotate a compact boundary on an item without compactBoundary`。
- 时序与并发：纯函数。幂等：`annotate…` 以同一 segment 重复调用结果等价。资源释放：不适用。平台差异：不适用。状态所有者：无。日志级别：不适用。
- （测试：behavior.test.mjs「紧凑辅助函数：边界判定、构造顺序、切片与注解」）

## B14 会话投影初值（`events/event-reducer-helpers.ts` · `initialSessionProjection`）

- 输入：无（模块初始化时间）。
- 输出：`mode="build"`、`status="idle"`、`turnCount=0`、`totalTokenCount=0`、`contextUsed=0`、`contextWindow=200000`，各集合字段为空数组，可选字段为 `undefined`；`createdAt`/`updatedAt` 为 Date。
- 错误语义：不适用。时序与并发：每次模块求值创建一份（导入方共享同一对象，不应原地修改）。幂等：不适用。资源释放：不适用。平台差异：不适用。状态所有者：模块。日志级别：不适用。
- （测试：behavior.test.mjs「投影初值字段与默认值保持既有取值」）

## B15 reducer 纯度与确定性（`events/event-reducer.ts` · `reduce`）

- 输入：`SessionEvent[]`。
- 输出：按事件顺序归约出的投影；同一输入两次调用得到等值投影（`id` 取首个事件的 sessionId，空数组时为 `"unknown"`）。
- 错误语义：无。时序与并发：纯函数（不改写入参数组，也不复用调用方传入的对象）。幂等：是。资源释放：不适用。平台差异：不适用。状态所有者：调用方持有投影；模块只提供初值与单事件转换。日志级别：不适用。
- 说明：`event-reducer-helpers.ts` 的 7 个未引用导出（`apply*` 包装与 `positiveInteger`）已按计划书「先删本包内 knip 确认无用的代码」在本合同 PR 里单独提交删除，不进入本合同；本条目只覆盖公开 reducer。
- （测试：behavior.test.mjs「reduce 不修改输入事件数组，且对同一输入得到等值投影」）

## B16 会话事件保留策略（`events/session-event-retention.ts`）

- 输入：`createSessionEventRetentionPolicy(mode)`；`onAppend(event, nowMs)`；`collectExpired(nowMs, graceMs)`。
- 输出：`unbounded` 模式两个方法恒返回空数组；`turn-window` 模式下 `TurnComplete`/`TurnError` 把该 turn 记为 sealed（同一 turn 只记一次、按首次 sealed 时间），`TurnStarted` 清空所有 sealed 并**返回除当前 turn 外的旧 turnId**（作为可淘汰项）；`collectExpired` 按 `nowMs - sealedAt >= graceMs` 淘汰并返回 turnId。
- 错误语义：无。时序与并发：同一策略实例持有私有链，解构方法后调用仍共享状态。
- 幂等：同一 turn 重复 sealed 不产生新条目。资源释放：淘汰后条目从内部链与索引移除。平台差异：不适用。状态所有者：策略实例。日志级别：不适用。
- 常量：`TRANSIENT_SESSION_EVENT_TYPES` = {`model.streaming`、`tool.call.progress`、`streaming.tool.ledger.updated`、`model.network.status`} 对应的事件类型集合；`SEALED_TURN_TRANSIENT_GRACE_MS = 120000`；`isTransientSessionEvent` 按该集合判定。
- （测试：behavior.test.mjs「保留策略：unbounded 空淘汰、turn-window 的 seal/清空/超时淘汰」与「瞬时事件集合与宽限期常量」）

## B17 内存会话事件存储（`events/in-memory-session-event-store.ts`）

- 输入：`createInMemorySessionEventStore(options)`；`append(event)`；`getEvents(sessionId)`；`getEventsAfter(sessionId, seq)`；`getLatestSequenceNumber(sessionId)`；`deleteSession(sessionId)`；`getStats()`；`pruneTransientEvents(nowMs?, graceMs?)`。
- 输出：同一 session 的事件按追加顺序可读，序号从 1 递增；未知 session 读回空数组、序号 0；`deleteSession` 后读回空；`getStats()` 汇总 `{sessions, events, evictedEvents, retainedTransient}`；`pruneTransientEvents` 返回被移除数量。
- 错误语义：无（未知 session 是空结果而不是抛错）。
- 时序与并发：`append` 为异步；同一 session 的序号分配在 journal 内串行；默认保留模式为 `turn-window`。
- 幂等：读操作幂等；重复 `deleteSession` 幂等。资源释放：`deleteSession` 释放该 session 的 journal。平台差异：不适用。状态所有者：存储实例（每个 session 一个 journal）。日志级别：不适用。
- （测试：behavior.test.mjs「内存事件存储：追加/读取/序号/删除/统计」）

## B18 投影提交与领域 changes（`events/session-projection-ledgers.ts` + `event-reducer-helpers.ts`）

- 输入：投影 + 领域 payload + 时间戳。
- 输出：`commitSessionProjection` 返回新对象（`{...projection, ...changes, updatedAt: timestamp}`），**不修改入参**；`applyCompactBoundary` 以 `truePostCompactTokenCount ?? postCompactTokenCount ?? contextUsed` 更新 `contextUsed` 并写入 `lastCompact`；`applyStreamingToolLedgerUpdate` 按 `(attemptId, toolCallId)` 命中则覆盖（含显式 `undefined` 覆盖），未命中则追加；`applyStreamRecoveryAnchorCreated` 写 `lastStreamRecoveryAnchor`；`applyBackgroundTaskStarted` 以快照白名单替换同 `taskId` 行并补 `startedAt`；`applyBackgroundTaskUpdated` 只覆盖**已定义**字段（`undefined` 不覆盖）；`applyBackgroundTaskCompleted` 命中则覆盖、未命中则追加。
- 错误语义：`applyCompactBoundary` 的 payload 非法时由 schema 抛错。
- 时序与并发：纯函数；每次返回新数组/新对象。幂等：同一 payload 重复应用结果稳定（追加类以 key 命中为准）。
- 资源释放：不适用。平台差异：不适用。状态所有者：调用方持有投影；本模块只算 changes。日志级别：不适用。
- （测试：behavior.test.mjs「投影提交不改入参；紧凑/流式/后台任务 changes 语义」）

## B19 投影队列 changes（`events/session-projection-queue.ts`）

- 输入：投影 + 队列事件 payload（admission/delivery/order/removal/mode）。
- 输出：admission 按 `pendingInputId` 命中则**原位更新且保留首个 `queuedAt`**，未命中追加；delivery 只改目标行的 `intent`（payload 未给 intent 时基于旧 intent 补 `admittedDelivery`/`fallbackReasonCode`）；order 按给定 id 顺序重排、未列出的行按原顺序追加，并给带 intent 的行写入 `queuePosition`（从 0 起）；removal 按 id 过滤；mode change 写 `mode` 与 `planEnabled`（缺省 = `mode === "plan"`），并在有 permissionGrant 时把授权队列项的 intent.mode 置为 `"yolo"`。
- 错误语义：无。时序与并发：纯函数。幂等：removal/order 幂等；admission 以 id 去重。资源释放：不适用。平台差异：不适用。状态所有者：调用方。日志级别：不适用。
- （测试：behavior.test.mjs「队列 changes：admission 原位、order 重排与 mode 授权」）

## B20 媒体策略（`model/media-policy.ts`）

- 入口：`@knorvia/contracts` 包根入口（`model/index.ts` 未再导出媒体策略，根入口 `export * from "./model/media-policy.js"`）。
- 输入：`ModelMessageContentBlock` 与 `ModelInputFormat`。
- 输出：`isProviderVisibleModelInputMediaBlock` 对 image、provider-visible PDF（`type=file` 且 mediaType 主类型为 `application/pdf`、有 dataUrl、无文本或空文本）、provider-visible video（`type=video|file` 且 mediaType 以 `video/` 开头且有 dataUrl）为 true；`getUnsupportedModelInputMediaKind` 在格式不支持对应能力时返回 `image input`/`PDF input`/`video input`，否则 `undefined`；`createUnsupportedModelInputMediaText` 返回占位文本 + `[Media omitted from provider request because the selected model does not support <kind>.]`（占位来自 `modelMessageContentToText`，如 `[Attached image/png]`；占位为空时用 `[Attached media]`）。
- 错误语义：无。时序与并发：纯函数。幂等：是。资源释放：不适用。平台差异：不适用。状态所有者：无。日志级别：不适用。
- （测试：behavior.test.mjs「媒体策略：provider-visible 判定与不支持媒体文案」）

## B21 公网出口 IP 判定（`network/public-egress-ip.ts`）

- 输入：任意字符串（IPv4/IPv6 字面量、带方括号或尾点、大小写混合）。
- 输出：`normalizeIpAddressLiteral` 小写、去尾部点、去方括号；`getIpAddressVersion` 返回 0/4/6；`getPublicEgressIpBlockReason` 对非 IP 返回 `{reason:"not an IP address", version:0}`，对私有/回环/链路本地/组播/保留等既有网段返回对应 reason（如 `private IPv4 address`、`loopback IPv6 address`、`unique-local IPv6 address`），公网地址返回 `undefined`。
- 错误语义：无。时序与并发：纯函数（BlockList 常量在模块求值时建立）。幂等：是。资源释放：不适用。平台差异：不适用（只用 `node:net`）。状态所有者：模块常量。日志级别：不适用。
- （测试：behavior.test.mjs「公网出口 IP：规范化、版本与阻断原因」）

## B22 Git Bash 路径转换（`path/git-bash.ts`）

- 输入：路径字符串。
- 输出：`windowsPathToGitBashPath`：UNC（`\\` 开头）转正斜杠；`X:\…`/`X:/…`/`X:` 转 `/<小写盘符>/…`；其余反斜杠转正斜杠。`gitBashPathToWindowsPath`：`//` 开头转反斜杠；`/cygdrive/x/…` 转 `X:\…`；`/x/…` 转 `X:\…`；其余正斜杠转反斜杠；盘符后无剩余时补 `\`。
- 错误语义：无。时序与并发：纯函数。幂等：同一函数重复调用结果一致（两次转换不保证互逆，非契约）。资源释放：不适用。平台差异：本条目就是 Windows/Git Bash 差异的契约；POSIX 下同样按字符串规则处理。
- 状态所有者：无。日志级别：不适用。
- （测试：behavior.test.mjs「Git Bash 路径双向转换」）

## B23 插件与配置契约（导出面）

- 输入：`@knorvia/contracts/plugins`、`@knorvia/contracts/config` 的导出。
- 输出：导出名与种类符合 `interface.md`（清单/组件 schema、常量与类型齐全）。
- 错误语义：缺导出即违约。时序与并发：不适用。幂等：不适用。资源释放：不适用。平台差异：不适用。状态所有者：模块。日志级别：不适用。
- 说明：plugins/config 的**逐 schema 校验行为**未在 v1 展开（见 `acceptance.md` 的「未覆盖」），v2 补条目时同步补测试并升合同版本。
- （测试：api-surface.test.mjs「每个公开子路径都能载入并导出 interface.md 列出的名字」）

## B24 hooks 契约（导出面）

- 输入：`@knorvia/contracts/hooks` 的导出。
- 输出：导出名与种类符合 `interface.md`（workspace hook 信任相关类型与 store 工厂齐全）。
- 错误语义：缺导出即违约。时序与并发：不适用。幂等：不适用。资源释放：不适用。平台差异：不适用。状态所有者：模块。日志级别：不适用。
- 说明：hook 信任的**逐条判定行为**由 `specs/contracts/core-hooks`（试点 1 合同）覆盖；本合同只覆盖 `@knorvia/contracts/hooks` 的类型与导出面，不重复断言其判定逻辑。
- （测试：api-surface.test.mjs「每个公开子路径都能载入并导出 interface.md 列出的名字」）

## B25 运行时配置契约（`config/index.ts`）

- 入口：`@knorvia/contracts/config`（也经包根入口再导出）。
- 输入：无（模块常量与默认值）。
- 输出：
  - `ConfigKey`：配置键字符串（如 `modelStream.idleTimeoutMs`、`permission.mode`、`storage.dir`、`network.timeout`、`plugins.enabled`、`skills.enabled`）；
  - `ConfigScope`：`system|user|project|session|env|cli`；
  - `ConfigScopePriority`：每个 scope 的数值优先级（`system=0`、`user=10`、`project=20`、`session=30`，`env`/`cli` 更高），优先级严格递增；
  - `DEFAULT_MODEL_STREAM_IDLE_TIMEOUT_MS = 600000`；
  - `DefaultRuntimeConfig`：默认运行配置对象，含 `modelStream.idleTimeoutMs`、`permission.mode="build"`、`storage.dir="~/.knorvia-studio"`、`network.timeout=180000`、`features.*` 布尔开关等。
- 错误语义：不适用（常量）。时序与并发：不适用。幂等：常量。资源释放：不适用。平台差异：`storage.dir` 使用 `~/` 形式，由使用方解析。状态所有者：模块常量（调用方不得原地修改 `DefaultRuntimeConfig`）。日志级别：不适用。
- 说明：`config/index.ts` **没有运行时 schema 解析**（只有常量与类型），因此不存在「接受/拒绝矩阵」；本合同断言其常量取值与默认配置形状。逐键的配置解析/合并行为在 `adapters` 包（config adapters）里，属其替换包的范围。
- （测试：behavior.test.mjs「配置常量与默认运行配置保持既有取值与优先级」）

## B26 插件运行时契约（`plugins/index.ts`）

- 入口：`@knorvia/contracts/plugins`。
- 输入：`isOfficialMarketplaceId(id: string)` 的任意字符串；常量无输入。
- 输出：
  - `KNORVIA_OFFICIAL_PLUGIN_MARKETPLACE = "knorvia-plugins-bundled"`、`KNORVIA_INLINE_PLUGIN_MARKETPLACE = "inline"`、`KNORVIA_PLUGIN_HOST_COMMAND = "__knorvia-plugin-host"`、`KNORVIA_DWF_CHILD_COMMAND = "__knorvia-dwf-child"`；
  - `isOfficialMarketplaceId`：**只**对与官方 marketplace id 完全相等的字符串返回 true，其余（内联 id、空串、大小写变体、带空白、前缀相同但不等的字符串）一律 false。
- 错误语义：不适用（纯谓词，不抛错）。时序与并发：纯函数。幂等：是。资源释放：不适用。平台差异：不适用。状态所有者：无。日志级别：不适用。
- 说明：`plugins/index.ts` 也没有运行时 schema 解析（插件清单/组件的 schema 在 adapters 的插件加载器里）；本合同断言常量与官方 marketplace 判定的接受/拒绝矩阵。
- （测试：behavior.test.mjs「插件常量与官方 marketplace 判定矩阵」）
