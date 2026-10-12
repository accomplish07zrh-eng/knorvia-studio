# core-01 验收记录（acceptance.md）

> 本文件按块增量补齐。当前记录**第一块：`mcp` + `embedded-search`（M1–M5、E1–E2）**；`agent` / `compact` / `context` 三块在后续步骤补入，补入前不得合并合同。

## 1. 范围与来源

`apps/cli/packages/core` 的 5 个区，共 **38 个继承文件**（`lead/scope-report.mjs` 实测，与计划书分包总表第 151 行一致）：

| 区 | 全部文件 | 继承 | 分类 |
| --- | --- | --- | --- |
| `src/agent` | 12 | 11 | upstream-modified 10 / upstream-unchanged 1 / original 1 |
| `src/compact` | 6 | 6 | upstream-modified 4 / upstream-unchanged 2 |
| `src/context`（含 `sections`） | 14 | 14 | upstream-modified 11 / upstream-unchanged 3 |
| `src/embedded-search` | 2 | 2 | upstream-modified 1 / upstream-unchanged 1 |
| `src/mcp` | 5 | 5 | upstream-modified 3 / unreviewed 2 |
| **合计** | 39 | **38** | ≤60 ✓ |

- 认领 issue：**#133**；合同分支 `contract/core-01`（基线 `f4b618ee`）。
- 不在本包：`agent/turn-tool-projection.ts`（已登记 `original`）；`hooks`（M1 试点 `core-hooks` 已完成）；`memory`/`model`/`permission`/`plugin-reference`/`runtime-task`/`session*`（`core-02`）；`.`/`workflow*`（`core-03`）；`runtime`/`tool`/`browser-client`/`repl`/`subagent` 等（计划书其余包）。

## 2. 死代码核对（步骤 ①）

`pnpm knip` 在本包 5 个区报出 2 个"未使用导出"，核验后**都不删**：

| 符号 | knip 报的位置 | 核验 | 处置 |
| --- | --- | --- | --- |
| `getMessagesToSummarize` | `compact/manual.ts:62`、`compact/index.ts:9` | 本文件内部使用；**`runtime/deps.ts:299` 也再导出** | 保留（删掉会破坏 `core-runtime-*` 的公开面） |
| `ReadFileStateHydrationResult` | `agent/read-file-state-hydrator.ts:12` | 本文件内使用；**`runtime/deps.ts:255` 再导出** | 保留（同上） |

结论：本包没有可安全删除的无用代码 → 合同 PR 不含"删除无用代码"提交。`dep:refs` 的假阴性（对包名入口 + 桶再导出的引用不解析）与本次两条"knip 说未使用但实际有去向"的记录见 `callers.md`。

## 3. 第一块（mcp / embedded-search）的旧门结果

`specs/contracts/core-01/tests/mcp.test.mjs`（只走区域桶 `src/mcp/index.ts`）：

- 源码入口：tests=**3** pass=**3** fail=0 skipped=0（`node --import tsx --test`）
- dist 入口：tests=**3** pass=**3** fail=0 skipped=0（先 `tsc -p apps/cli/packages/core/tsconfig.json` 构建，再 `KNORVIA_CORE_ENTRY=dist`）

断言覆盖：`toMcpToolName` 的名称形态（含 `mcp__unknown__unknown`）、三个图像阈值常量的**逐字取值**、区域桶运行时导出集合（6 个名字的集合相等）。

## 4. 第一块的未覆盖项（如实列出）

1. **只有内部可达的导出**不做黑盒断言（`normalizeMcpToolResultForModel`、`toModelVisibleMcpNamePart`、`matchesModelVisibleMcpServerName`、`formatMcpToolResult`、`asDataUrl`、`base64PayloadFromMcpImageData`、`hasOfficialCuaFrameAuthority`、Windows CU 三函数、`embedded-search/*` 全部导出）→ 其阈值/文案在**替换阶段的内部单测**里逐字冻结；调用方见 `callers.md`。
2. **平台相关行为**（真实 Windows 窗口接管、PNG 几何与像素、CUA 官方帧完整性、真实截图压缩质量、shell 内 `find()`/`grep()` 注入效果）不在本包合同内，覆盖方见 `known-differences.md` §1。
3. **包根入口在 tsx 下不可加载**（`ToolExecutor` 类型当值再导出，属 core-03 范围）→ 本包用区域桶做入口，问题登记在 `known-differences.md` §2。
4. `agent` / `compact` / `context` 三块的行为条目与测试**尚未写**（下一块补入；补入前合同不得合并）。

## 5. 首次失败与修正（本块）

1. **测试入口选错**：初版用包根 `@knorvia/core` 作为黑盒入口 → tsx 下抛 `does not provide an export named 'ToolExecutor'`（见 §4.3）。改用区域桶 `src/mcp/index.ts`。
2. **对公开面的假设过宽**：初版断言了 `normalizeMcpToolResultForModel`、`formatMcpToolResult`、Windows CU 三函数等 → 实测区域桶只导出 6 个名字。改为"公开面只断言可达集合"，其余转入 §4.1 的间接覆盖口径。
3. **行为条目与覆盖方式对齐**：`behavior.md` 的 M2/M3 行为/M5 现在明确标注"内部可达 → 间接覆盖 + 替换阶段内部单测"，避免审查时被当成漏测。

## 6. 第二块（compact）的旧门结果

`specs/contracts/core-01/tests/compact.test.mjs`（入口：区域桶 `src/compact/index.ts`）：

- 源码入口：tests=**6** pass=**6** fail=0 skipped=0
- dist 入口（`KNORVIA_CORE_ENTRY=dist`）：tests=**6** pass=**6** fail=0 skipped=0

断言覆盖：六个阈值常量与三个派生计算（179000 / 166000 / 21000 上限）、`shouldAutoCompact` 的五个 `reason` 分支与决策字段（含 provider* 透传、`thresholdPercent=100`、`>=` 阈值即压缩）、轮次分组语义（经 `hasEnoughMessagesToCompact`）、可摘要消息过滤与浅拷贝、token 估算的累加与工具参数计入、提示词拼接与摘要格式化、microcompact 九个工具名与 `buildDefaultMicrocompactThreshold` 的三个取值。

## 7. 第二块的未覆盖项（如实列出）

1. `groupByAssistantStartedRounds`（`compact/rounds.ts`）**不经桶导出** → 只经 `hasEnoughMessagesToCompact` 间接覆盖；分组函数的 id 语义（同一助手 id 不新起组）暂无公开路径可断言，替换阶段内部单测补。
2. `maybeLocalMicrocompactMessages`（清理哪些工具结果、保留最近 N 条、最小节省 token、空闲阈值、错误结果策略）内部可达 → 替换阶段内部单测 + 调用方（runtime 压缩路径）覆盖。
3. `buildManualCompactBoundary`（边界 payload 的字段投影，含 `summaryMessageIds`、`customInstructions` 布尔化、trace 字段）内部可达 → 替换阶段内部单测。
4. `buildCompactSummaryMessage` 的**尾部分支**（`recentMessagesPreserved`/`replStateCleared`/`suppressFollowup`/`transcriptPath` 的文案拼接）未逐条断言 → 替换阶段内部单测。
5. `getUsageTotalTokens`、`createCompactBoundaryId`、`NO_TOOLS_PREAMBLE`/`BASE_COMPACT_PROMPT`/`NO_TOOLS_TRAILER` 的**完整原文**未逐字断言（只断言了拼接关系与自定义指令位置）——原文过长，逐字断言会让合同对文案排版过度敏感；替换阶段以"拼接关系 + 关键标记"复核。

## 8. context 子块 1（X1–X5）的旧门结果与未覆盖项

### 旧门（旧实现）

`specs/contracts/core-01/tests/context.test.mjs`（入口：区域桶 `src/context/index.ts`）：

- 源码入口：tests=**5** pass=**5** fail=0 skipped=0
- dist 入口（`KNORVIA_CORE_ENTRY=dist`）：tests=**5** pass=**5** fail=0 skipped=0

断言覆盖：token 权重与除数（实测 **3**：`"a"×100 → 34`、`"a"×1000 → 334`）、前缀截断的越界下标语义、`CLI Prefix`/`Current Date`/`Memory` 三个 section 的**完整对象**或关键标记与路径插值、context 区 16 个运行时导出的集合相等。

### 未覆盖项（子块 2 待补，如实列出）

1. `builder.ts`：`ContextBuilder` 的装配**顺序**、`createContextBuilder` 的默认 section 列表、`buildContextMetaUserBody`/`buildSkillsMetaUserBody` 的 meta_user 正文拼接与去重裁剪规则 —— 需要按事件序列/顺序断言，留给子块 2。
2. `sections/{identity,env-info,skills,desktop,workflow-actor,request-user-context}.ts` 的固定标题与完整文案（`identity` 的 security notice / harness block、`env-info` 的 git 判定、`skills` 的清单截断、`desktop`/`workflow-actor` 的注入目标）—— 留给子块 2。
3. `dynamic-sections.ts` 的四个动态 section（session guidance / dynamic behavior / output style / context management）的触发条件与文案 —— 留给子块 2。
4. `types.ts` 的类型面（`ContextSection` 字段、`ContextSource` 取值、`ContextBuilderConfig` 形状）—— 由 B6 式编译期用例在子块 2 补。
5. `estimateTokens` 的除数来自 `@knorvia/shared` 的 `ESTIMATED_TOKEN_CHAR_DIVISOR`（实测 3）：本合同按**实测值**冻结；若 shared 调整该常量，core-01 与 shared 需同步改并重跑旧门。

## 9. context 子块 2（X6–X9）的旧门结果与未覆盖项

### 旧门（旧实现）

`specs/contracts/core-01/tests/context-sections.test.mjs`（入口：区域桶 `src/context/index.ts`）：

- 源码入口：tests=**4** pass=**4** fail=0 skipped=0
- dist 入口（`KNORVIA_CORE_ENTRY=dist`）：tests=**4** pass=**4** fail=0 skipped=0

断言覆盖：`Agent Identity` 两种形态（1220/407 与 1246/416）与安全行/Harness 逐字、`Desktop Context`（1109/370 与两个小节 + `::code-comment` 示例行）、`Environment Info`（184/62 与五行含两处 `undefined` 回落）、`Workflow Actor Identity`（2731/911 与共用安全行/Harness、`submit_result`/`escalate`/`path:line`/`not run` 标记）、非 git 仓库时 git 段为 `null`。

### 未覆盖项（子块 3 待补，如实列出）

1. `builder.ts`：`ContextBuilder` 的装配**顺序**与去重裁剪、`createContextBuilder` 的默认 section 列表、`buildContextMetaUserBody`/`buildSkillsMetaUserBody` 的 meta_user 正文拼接 —— 需要按顺序/事件序列断言。
2. `sections/skills.ts`：`buildSkillsSection` 的入参形状不是 `{skills}`（探针 `TypeError: Cannot read properties of undefined (reading 'skills')`），需读源码后按真实入参冻结清单截断与 `skillMetadataBudget` 行为。
3. `sections/request-user-context.ts`：`buildRequestUserContextSection` **不经桶导出**（内部函数）——`# agentsMd` 段、`Contents of <path> (workspace instructions|user default instructions):`、`[File truncated: <name>]`、memory 索引段与 `null` 回落。
4. `dynamic-sections.ts` 四个动态 section（session guidance / dynamic behavior / output style / context management）的触发条件与文案。
5. `types.ts` 的类型面（`ContextSection` 字段、`ContextSource` 取值、`ContextBuilderConfig` 形状）——B6 式编译期用例。
6. `buildSecurityNotice`/`buildHarnessBlock` 为内部函数：只经 X6/X9 的"逐字同一份"间接冻结，无独立黑盒入口。

## 10. context 子块 3（X10–X11）的旧门结果与剩余未覆盖项

### 旧门（旧实现）

`specs/contracts/core-01/tests/context-builder.test.mjs`（入口：区域桶 `src/context/index.ts`）：

- 源码入口：tests=**2** pass=**2** fail=0 skipped=0
- dist 入口（`KNORVIA_CORE_ENTRY=dist`）：tests=**2** pass=**2** fail=0 skipped=0

断言覆盖：Skills 段的排序（`localeCompare`）、250 字截断（249 + `...`）、`whenToUse` 拼接、`qualifiedName` 别名后缀、`metadataBudget` 回落为只列名字、空清单 → `null`；builder 最小配置下的装配顺序（CLI Prefix → Agent Identity → Dynamic Behavior → Environment Info → Context Management）、`build()` 结果键与 `totalChars`/`totalTokens` 自洽、`buildContextMetaUserBody` 的外层包裹 + 6 空格 IMPORTANT 尾注 + 空数组 → `null` + 不按 target 过滤、`buildSkillsMetaUserBody` 的无包裹拼接。

### 实测修正

初版断言 `buildContextMetaUserBody([identity])` 为 `null`（以为它按 `injectionTarget` 过滤）——**实测不是**：该函数把传进来的段一律拼进正文，由调用方决定传哪些。已按实测改正并写入 behavior.md X11。

### 剩余未覆盖项（子块 4，如实列出）

1. `dynamic-sections.ts` 四个动态 section（`buildSessionGuidanceSection`/`buildDynamicBehaviorSection`/`buildOutputStyleSection`/`buildContextManagementSection`）的**内部文案与触发条件**——不经桶导出；其**存在与装配顺序**已由 X11 冻结。
2. `sections/request-user-context.ts` 的 `buildRequestUserContextSection`（内部函数）：`# agentsMd` 标题与 OVERRIDE 文案、`Contents of <filePath> (workspace instructions|user default instructions):`、截断时追加 `[File truncated: <fileName>]`、memory 索引段 `(user's auto-memory, persists across conversations)`、无内容 → `null`。
3. `types.ts` 的类型面（`ContextSection` 字段、`ContextSource` 取值、`ContextBuilderConfig` 形状、`PresentationSurface`）——B6 式编译期用例。
4. `ContextBuilder` 的增量方法（`setToolRegistry`/`setEnvInfo`/`addSection`）对装配顺序与去重的影响。
5. `sections/skills.ts` 的排序依赖 `localeCompare`：同一 locale 下稳定，但**跨 locale 的排序差异**未冻结（合同只冻结"按显示名升序"这一规则与同 locale 下的具体顺序）。

## 11. context 子块 4（X12–X13）的旧门结果与剩余未覆盖项

### 旧门（旧实现）

`specs/contracts/core-01/tests/context-incremental.test.mjs` 与 `tests/context-types.test.mjs`（入口：区域桶 + 包目录内编译期用例）：

- 源码入口：tests=**3** pass=**3** fail=0 skipped=0（2 个增量行为 + 1 个编译期用例）
- dist 入口（`KNORVIA_CORE_ENTRY=dist`）：tests=**3** pass=**3** fail=0 skipped=0

断言覆盖：`addSection` 追加不去重、`setEnvInfo` 替换环境段并在 git 仓库下多出 `system_context`、`metaUserAttachments` 的来源标记与正文包裹、`context/types.ts` 十个类型的正/反向编译期用例（含 `EnvInfo` 五个必填字段）。

### 实测修正

初版编译期用例的 `envInfo` 字面量只给了 `cwd`/`platform`/`isGitRepository` → `TS2739`（`EnvInfo` 还必填 `shell`/`osVersion`/`nodeVersion`）。补齐后通过；这也解释了运行时 `- Shell: undefined` / `- OS Version: undefined` 的回落文案（类型要求必填，但旧实现的运行时用 `undefined` 兜底）。

### 剩余未覆盖项（子块 5，如实列出）

1. `dynamic-sections.ts` 四个动态 section（`buildSessionGuidanceSection`/`buildDynamicBehaviorSection`/`buildOutputStyleSection`/`buildContextManagementSection`）的内部文案与触发条件 —— 不经桶导出；其**存在与装配顺序**已由 X11 冻结。
2. `sections/request-user-context.ts` 的 `buildRequestUserContextSection`（内部函数）：`# agentsMd` 标题与 OVERRIDE 文案、`Contents of <filePath> (workspace instructions|user default instructions):`、截断追加 `[File truncated: <fileName>]`、memory 索引段 `(user's auto-memory, persists across conversations)`、无内容 → `null`。
3. `ContextBuilder.setToolRegistry` 的注册行为（需要 `ToolRegistry` 夹具）。
4. `sections/skills.ts` 排序依赖 `localeCompare`：同 locale 下稳定；跨 locale 的排序差异见 `known-differences.md`。

## 12. agent 组 1（A1–A3）的旧门结果与剩余未覆盖项

### 旧门（旧实现）

`specs/contracts/core-01/tests/agent-turn-state.test.mjs`（入口：区域桶 `src/agent/index.ts`）：

- 源码入口：tests=**1** pass=**1** fail=0 skipped=0
- dist 入口（`KNORVIA_CORE_ENTRY=dist`）：tests=**1** pass=**1** fail=0 skipped=0

断言覆盖：`TurnPhase` 十个取值、`createTurnState` 的完整初始状态（含 `attachments` 透传与 `startedAt` 为 `Date`）、两个阶段谓词对十个取值逐一遍历、`canTransitionTo` 的 **10×10 全组合**转移矩阵（含原地自转与跨阶段跳转必须为 `false`）。

### 未覆盖项（agent 组剩余，如实列出）

1. `turn-machine.ts`（`TurnMachineImpl`）：阶段推进与事件序列 —— 需要按计划书要求写**事件序列断言**（模拟模型流的中途取消、工具并发、压缩触发点，不用 sleep/超时），是本包合同剩余的最大工作量。
2. `message-history.ts`：`MessageHistoryImpl`/`createMessageHistory` 与 `cloneModelMessageContent`/`cloneModelInputMessage`/`cloneRuntimeMessageEntry`/`countContextPrefixMessages`/`invalidateRuntimeTokenUsage`/四个 `*RuntimeMetadata` 辅助函数。
3. `session-history-hydrator.ts`：`activeSessionMessages`、`hydrateMessageHistoryFromSession`（会话历史水合）。
4. `compact-session.ts`：`compactActiveSessionMessages` 与 `isCompactPreservableSessionMessage`/`isActiveCompactionBoundaryPart`。
5. `file-part-hydration.ts`：`projectPersistedToolMediaContent`；`read-file-state-hydrator.ts`：文件读取状态水合（其 `ReadFileStateHydrationResult` 类型经 `runtime/deps.ts` 再导出，见 §2）。
6. `message-history-usage.ts`：`persistedTokenUsageBaseline`。
7. 内部可达（不进区域桶，只经文件级入口或替换阶段内部单测）：`selectToolPartsForHistory`（A2）、`runtimeInputMetadata`（A3）、`turn-tool-projection.ts` 的五个函数（该文件已登记 `independent-replacement`，**不在本包替换范围**）。
8. `agent/index.ts` 的区域桶运行时导出集合（实测 10 个：`MessageHistoryImpl`、`TurnMachineImpl`、`TurnPhase`、`activeSessionMessages`、`canTransitionTo`、`createMessageHistory`、`createTurnState`、`hydrateMessageHistoryFromSession`、`isTerminalPhase`、`isWaitingPhase`）尚未单独断言为"集合相等" —— 待 agent 组剩余条目补齐后一并加。

## 13. agent 组 2（A4–A6 turn-machine）的旧门结果与剩余未覆盖项

### 旧门（旧实现）

`specs/contracts/core-01/tests/agent-turn-machine.test.mjs`（入口：区域桶 `src/agent/index.ts`）：

- 源码入口：tests=**3** pass=**3** fail=0 skipped=0
- dist 入口（`KNORVIA_CORE_ENTRY=dist`）：tests=**3** pass=**3** fail=0 skipped=0

断言覆盖：正常回合的阶段推进序列（idle → processing_input → awaiting_model_response → streaming → completing，含 `modelRequest`/`streamingContent`/`finalResponse`/`resultType`/`completedAt`/`isComplete`/终态不可再 start）、`getNextPhase` 在四个阶段上的取值、非法转移的三条错误文案与 `recoverable`、`fail` 的错误形态、工具调度（statuses 与 `scheduledTools`）、权限等待与裁决（allow 保持 waiting、deny → permission_denied、pending/resolved 列表）、工具结算（success/failed + `tool_error` 形态）、`getNextPhase` 的聚合与收尾分支、待处理输入的入队与排空（含原数组引用）。**全部为同步状态推进，无 sleep/超时**。

### 实测修正（三条，均已按实测改正并写入 behavior.md/known-differences）

1. 阶段机**没有 streaming 自环**：初版断言 `addStreamingContent` 能追加第二段内容 → 实测抛 `Cannot transition from streaming to streaming`。
2. `resolvePermission("allow")` **不改调用状态**（仍 `waiting_permission`），只有 `deny` 改成 `permission_denied`。
3. `startToolExecution` **把所有非等待调用重标为 `running`**（含已完成的），因此"完成后再次 startToolExecution"会复活调用；`completeTool`/`resolvePermission` 都只 `project()`、不改阶段。两条 quirk 已记入 `known-differences.md` §6。

另有两处测试代码笔误（`aggregateResults()`/`queuePendingInput()` 返回的是**状态**而不是 machine 实例，需 `new TurnMachineImpl(state)` 包一层）——已修正。

### 剩余未覆盖项（agent 组剩余，如实列出）

1. `message-history.ts`：`MessageHistoryImpl`/`createMessageHistory` 与 `cloneModelMessageContent`/`cloneModelInputMessage`/`cloneRuntimeMessageEntry`/`countContextPrefixMessages`/`invalidateRuntimeTokenUsage`/四个 `*RuntimeMetadata`。
2. `session-history-hydrator.ts`：`activeSessionMessages`、`hydrateMessageHistoryFromSession`。
3. `compact-session.ts`：`compactActiveSessionMessages` 与两个谓词。
4. `file-part-hydration.ts`：`projectPersistedToolMediaContent`；`read-file-state-hydrator.ts` 的文件读取状态水合。
5. `message-history-usage.ts`：`persistedTokenUsageBaseline`。
6. `agent/index.ts` 区域桶的 10 个运行时导出尚未做"集合相等"断言（待补齐后加）。
7. 内部可达（不经区域桶）：`selectToolPartsForHistory`（A2）、`runtimeInputMetadata`（A3）。

## 14. agent 组 3 的进展：`message-history` 探针实测语义已冻结，黑盒测试待下一轮补齐

本轮对 `agent/message-history.ts` 做了 API 与语义探针（`createMessageHistory()` 的公开方法：`init`/`addUser`/`addAttachment`/`addEntries`/`addAssistant`/`addToolResult`/`borrowReadOnlyRuntimeEntries`/`toRuntimeEntries`/`replaceMessages`/`getMessageCount`/`getCacheStats`/`setCacheHit`/`setCacheMiss`/`reset`/`recomputeCacheStats`），实测结论如下（**已冻结，替换实现必须一致**）：

1. `createMessageHistory()` 初始为空：`getMessageCount() === 0`、`toRuntimeEntries() === []`、`getCacheStats() === {totalMessages:0, cachedMessages:0, lastCacheHit:false}`（**未设置过缓存读取时没有 `cacheReadTokens` 键**）。
2. `init(messages)` **替换**全部条目；`replaceMessages(messages)` 同样整体替换；`reset()` 清空条目并把统计归零。
3. `addUser(text, metadata?)` 追加 `{message:{role:"user",content:text}, metadata}`；`addAssistant(...)` 追加 `{message:{role:"assistant",content:...}}`。**每条条目都带 `metadata` 键**（缺省时值为 `undefined`，`JSON.stringify` 里看不到——这是本轮踩过的坑）。
4. `addToolResult(...)`/`addAttachment(...)` 要求 `content` 是**内容块数组**（传字符串会抛 `TypeError: content.map is not a function`）；两者的确切入参顺序与块形状本轮未定，留待下一轮。
5. `setCacheHit(tokens)`/`setCacheMiss()`/`recomputeCacheStats()` **都没有返回值**；统计要另调 `getCacheStats()`。`setCacheHit(3)` 后统计为 `{totalMessages, cachedMessages: totalMessages, lastCacheHit: true, cacheReadTokens: 3}`；`setCacheMiss()` 后 `{…, cachedMessages: 0, lastCacheHit: false, cacheReadTokens: undefined}`（**设置过之后该键保留**）。
6. `borrowReadOnlyRuntimeEntries()` 返回的是**借用视图**：与历史**共享同一数组**，`push` 会真的改到历史（实测 `getMessageCount()` 从 4 变 5）。"只读"是对调用方的约定，不是运行时冻结。

**本轮未提交黑盒测试**：`tests/agent-message-history.test.mjs` 在两次按实测修正后仍有 2 条初始统计断言未对齐（`cacheReadTokens` 键的存在性在"从未设置"与"设置后清除"两种状态下不同），我把它从分支移除，避免留下红测试；下一轮按上面第 1、5 条的精确差异补齐断言即可（其余 4 条已可直接写死）。`compact-session.ts`（`compactActiveSessionMessages` 与两个谓词）同样留待下一轮。

## 15. agent 组 3 收尾（A8 compact-session）

### 旧门（旧实现）

`specs/contracts/core-01/tests/agent-compact-session.test.mjs`（入口：**文件级** `src/agent/compact-session.ts`，因本区三个导出不经区域桶）：

- 源码入口：tests=**2** pass=**2** fail=0 skipped=0
- dist 入口（`KNORVIA_CORE_ENTRY=dist`）：tests=**2** pass=**2** fail=0 skipped=0

断言覆盖：`isActiveCompactionBoundaryPart` 的三态（有边界 / 无边界有 timelineStatus / 无边界无 timelineStatus）、`isCompactPreservableSessionMessage` 的六条规则（user/assistant 通过；hidden 语义、含 compaction part、assistant 带 error、system 角色一律拒绝）、`compactActiveSessionMessages` 的四种形态（不保留 → slice 且引用同一批消息；无 preservedSegment → 不插回；锚点缺失 → 插下标 1；锚点在活动切片内 → 插其后；head/tail 定位失败 → 不插回）。

### 现状（分支全绿）

`specs/contracts/core-01/tests/` 共 **11 个测试文件**：源码 **31/31**、dist **31/31**（M1–M5、E1–E2、C1–C6、X1–X13、A1–A8）。

### 剩余未覆盖项（agent 组剩余，如实列出）

1. `session-history-hydrator.ts`：`activeSessionMessages`、`hydrateMessageHistoryFromSession`（会话历史水合；后者经区域桶公开）。
2. `file-part-hydration.ts`：`projectPersistedToolMediaContent`（内部可达）。
3. `read-file-state-hydrator.ts`：文件读取状态水合（其 `ReadFileStateHydrationResult` 类型经 `runtime/deps.ts` 再导出，见 §2）。
4. `message-history-usage.ts`：`persistedTokenUsageBaseline`（内部可达）。
5. `agent/index.ts` 区域桶的 10 个运行时导出集合断言（`MessageHistoryImpl`、`TurnMachineImpl`、`TurnPhase`、`activeSessionMessages`、`canTransitionTo`、`createMessageHistory`、`createTurnState`、`hydrateMessageHistoryFromSession`、`isTerminalPhase`、`isWaitingPhase`）。
6. 内部可达（不经区域桶）：`selectToolPartsForHistory`（A2）、`runtimeInputMetadata`（A3）、`compact-session` 三函数（A8，已用文件级入口覆盖）。

## 16. agent 组剩余进展（A9 公开面 + A10 用量基线）

### 旧门（旧实现，两入口都过）

| 测试文件 | 源码 | dist |
| --- | --- | --- |
| `agent-surface.test.mjs`（A9 区域桶 10 个运行时导出的集合相等） | 1/1 | 1/1 |
| `agent-usage-baseline.test.mjs`（A10 `persistedTokenUsageBaseline`） | 1/1 | 1/1 |

`persistedTokenUsageBaseline` 的冻结规则：输入推导优先级 `input` → `total - output` → `cache.read + cache.write`；推导结果非正即整体 `undefined`；`contextUsageTokens` 在 `output > 0` 时取 `input + output`、否则 `total ≥ input` 时取 `total`、再否则 `undefined`；所有数值向下取整、负数视为未给。

### 实测 quirk（已冻结）

`tokens.cache` **必须存在**：实现无条件读 `tokens.cache.read`/`.write`，缺 `cache` 会抛 `TypeError: Cannot read properties of undefined (reading 'read')`（类型层必填、运行时无兜底）。测试用 `assert.throws(..., TypeError)` 固定该行为。

### 分支现状（全绿）

`specs/contracts/core-01/tests/` 共 **13 个测试文件**：源码 **33/33**、dist **33/33**（M1–M5、E1–E2、C1–C6、X1–X13、A1–A10）。

### 剩余未覆盖项（agent 组最后 3 个文件）

1. `session-history-hydrator.ts`：`activeSessionMessages`（经区域桶公开）、`hydrateMessageHistoryFromSession`（经区域桶公开）——会话历史水合，需要按事件序列/夹具断言。
2. `file-part-hydration.ts`：`projectPersistedToolMediaContent`（内部可达）。
3. `read-file-state-hydrator.ts`：文件读取状态水合（`ReadFileStateHydrationResult` 类型经 `runtime/deps.ts` 再导出）。

三个文件补齐后即可跑完整旧门（`scripts/contract-gate.mjs`：源码 + dist + 桩替换）并提 `contract: core-01 v1`。

## 17. agent 组最后三文件进展（A11 file-part-hydration）

### 旧门（旧实现，两入口都过）

`specs/contracts/core-01/tests/agent-file-part-hydration.test.mjs`（入口：**文件级** `src/agent/file-part-hydration.ts`）：

- 源码入口：tests=**2** pass=**2** fail=0 skipped=0
- dist 入口（`KNORVIA_CORE_ENTRY=dist`）：tests=**2** pass=**2** fail=0 skipped=0

断言覆盖：`projectPersistedToolMediaContent` 的**全有或全无**行校验（非数组/空数组/`null` 行/数组行/未知类型/text 非字符串/缺索引/负索引/非整数索引/任一行不合法即整体丢弃）与投影（text 行产出新块、attachment 行引用同一块对象、越界整体丢弃、空文本行合法）。

### 分支现状（全绿）

`specs/contracts/core-01/tests/` 共 **14 个测试文件**：源码 **35/35**、dist **35/35**。

### 剩余未覆盖项（agent 组最后两项）

1. `session-history-hydrator.ts`：`activeSessionMessages`（经区域桶公开）与 `hydrateMessageHistoryFromSession`（经区域桶公开）——会话历史水合，需要按事件序列/夹具断言；本文件 13.9 KB，是 agent 区剩余的最大块。
2. `read-file-state-hydrator.ts`：文件读取状态水合（导出 `ReadFileStateHydrationResult` 类型经 `runtime/deps.ts` 再导出，见 §2）；其运行时投影函数未覆盖。
3. 同文件内的 `filePartToContentBlock`（`file-part-hydration.ts` 的**异步**导出）：依赖 `artifactStore.readToolResultArtifact` 与 `isArtifactUri` 判定（`image/*` 媒体类型推导、video/pdf/text/本地引用的分支），需要注入式 store 夹具，留待下一轮。

## 18. agent 组最后三文件之二（A12 filePartToContentBlock）

### 旧门（旧实现，两入口都过）

`specs/contracts/core-01/tests/agent-file-part-block.test.mjs`（入口：**文件级** `src/agent/file-part-hydration.ts`）：

- 源码入口：tests=**2** pass=**2** fail=0 skipped=0
- dist 入口（`KNORVIA_CORE_ENTRY=dist`）：tests=**2** pass=**2** fail=0 skipped=0

断言覆盖：内联图片（含 `image/*` 从 data URL 推导媒体类型）、视频、PDF（带参数归一 `application/pdf`）、`resource` 起源的引用身份、`text/*` 预览直通、无预览时的文本回落（含 `filename ?? url` 两种 label）、`storageKind:"local_ref"` 的 label 选择，以及 **quirk**：`source` 存在但缺 `text.value` 抛 `TypeError`（`assert.rejects`）。

### 本轮踩坑（已按实测改正）

初版把 `resource` 用例写成 https URL（无内联 payload）→ 实际走**文本回落**分支（不产出 `source`），断言 `source.kind` 抛 `TypeError`；改成内联 `data:application/pdf;base64,AA` 后才命中 PDF 分支。

### 剩余未覆盖项

1. `session-history-hydrator.ts`：`activeSessionMessages`/`hydrateMessageHistoryFromSession`（经区域桶公开）——会话历史水合，需事件序列/夹具断言。
2. `read-file-state-hydrator.ts`：文件读取状态水合的运行时投影函数。
3. `filePartToContentBlock` 中需要 `artifactStore.readToolResultArtifact` 的读取分支，以及 `isArtifactUri(durableUri)` 为真时的 artifact 身份分支（`kind:"inline"`、`uri = metadata.artifactUri`、`path` 置空）。

## 19. agent 组最后三文件之三（A13 session-history-hydrator）探针实测语义，黑盒测试待补齐

本轮对 `agent/session-history-hydrator.ts`（13.9 KB）做了签名与语义探针，实测结论如下（**已冻结，替换实现必须一致**）：

1. **签名**：`activeSessionMessages(messages)`（第一参就是消息数组）；`hydrateMessageHistoryFromSession(session, history)`（第一参是**会话对象**，内部读 `session.messages` 再交给 `activeSessionMessages`；把消息数组直接当第一参会抛 `TypeError: Cannot read properties of undefined (reading 'length')`，栈在 `lastBoundary` ← `activeSessionMessages` ← `hydrateMessageHistoryFromSession`）。
2. **`activeSessionMessages`**：`[]` → `[]`；没有压缩边界时**按原序返回全部消息且引用同一批对象**（实测 `["m1","m2","m3"]`）；存在 compaction 边界时**从最后一个边界（含）起**（实测边界在索引 1 → `["b","m3"]`）。
3. **`hydrateMessageHistoryFromSession`** 是**异步**的，返回计数结果 `{appliedMessageCount, interruptedToolCount, messageCount, partCount}`；对**没有 parts** 的消息实测 `{appliedMessageCount: 0, interruptedToolCount: 0, messageCount: 2, partCount: 0}`，且历史条目不变（幂等）。

**本轮未提交 A13 黑盒测试**：按上述语义写出的测试在「异步返回值 + 结果对象」两处修正后，第二次补丁把同一文件里的两处 `await hydrateMessageHistoryFromSession(...)` 调用串改坏（区间替换命中了刚插入的调用），只跑出 1 个用例且失败。我把它从分支移除，**不留红测试**；下一轮按第 1–3 条写死即可（签名与返回形状都已实测，无需再读 13.9 KB 源码）。

**剩余未覆盖项**：`session-history-hydrator.ts`（本节三条语义待落成断言）、`read-file-state-hydrator.ts`、`filePartToContentBlock` 的 `artifactStore` 读取分支与 artifact 身份分支。三项补齐后跑完整旧门（源码 + dist + 桩替换）并提 `contract: core-01 v1`。
