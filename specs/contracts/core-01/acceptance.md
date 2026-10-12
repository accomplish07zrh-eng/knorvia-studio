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
