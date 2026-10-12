# core-01 合同（`@knorvia/core`：agent / compact / context / embedded-search / mcp）

**合同版本：v1（进行中——第一块 `mcp` + `embedded-search` 已写，`agent`/`compact`/`context` 三块待补；补入前不得合并）**

本目录是 `@knorvia/core` 第一个包的**兼容合同**：先冻结公开行为与签名，再按合同独立实现（替换阶段见计划书「每包流程」四、五）。

- 范围：`apps/cli/packages/core/src` 下 `agent`（11 个继承文件）、`compact`（6）、`context`（14，含 `context/sections`）、`embedded-search`（2）、`mcp`（5），共 **38 个继承文件**（`lead/scope-report.mjs` 实测，与计划书「分包总表」第 151 行一致；单包 ≤60）。
- 不在本包：`agent/turn-tool-projection.ts`（已登记 `original`）；`hooks`（M1 试点 `core-hooks` 已完成）；`memory`/`model`/`permission`/`plugin-reference`/`runtime-task`/`session*`（`core-02`）；`.`/`workflow*`（`core-03`）；`runtime`/`tool`/`browser-client`/`repl`/`subagent` 等（计划书其余包）。
- 认领 issue：**#133**；合同分支 `contract/core-01`（基线 `f4b618ee`）。
- 无用代码核对：`knip` 报 2 个"未使用导出"，但二者都经 `runtime/deps.ts` 再导出（属 `core-runtime-*` 范围）→ **保留**，本包无删除提交（见 `acceptance.md` §2）。

## 文件

| 文件 | 内容 |
| --- | --- |
| `README.md` | 本文件：范围、条目 → 测试对照表、旧门结论 |
| `behavior.md` | M1–M5（mcp）、E1–E2（embedded-search）；A/C/X 三块待补。每条九方面 + 可测断言 |
| `interface.md` | 38 个文件的模块路径、导出名与签名（TS AST 生成 + `dep:refs --list-exports` 交叉核对） |
| `callers.md` | 第一块各文件的调用方 + `dep:refs` 抽样（含两条"knip 说未使用但有去向"与工具假阴性） |
| `tests/` | `entry.mjs`（源码/dist 两入口）、`mcp.test.mjs`（M1/M3/M4 公开面断言） |
| `stubs/` | 38 个模块路径的最小桩 + `targets.txt`（`src/... -> apps/cli/packages/core/src/...`） |
| `known-differences.md` | 平台边界与覆盖方、包根 tsx 不可加载（core-03 范围）、内部可达导出清单、必须保留的既有语义 |
| `acceptance.md` | 范围、死代码核对、第一块旧门两入口结果、未覆盖项、首次失败与修正 |
| `fixtures/` | 待 `agent`/`compact`/`context` 块补入（事件序列/录制帧夹具） |
| `gate-old.json` | 旧门报告（三块补齐后由 `scripts/contract-gate.mjs` 生成） |

## 条目 → 测试对照表（第一块）

| 条目 | 测试 / 覆盖方式 |
| --- | --- |
| M1 模型可见 MCP 名称 | `tests/mcp.test.mjs`「M1 模型可见 MCP 工具名（公开面）」 |
| M2 MCP 结果投影 | **间接覆盖**：`formatMcpToolResult` 不经公开入口 → 替换阶段内部单测（`acceptance.md` §4.1） |
| M3 图像内联阈值与超大图投影 | 阈值：`tests/mcp.test.mjs`「M3 图像内联阈值常量（逐字冻结）」；归一行为：**间接覆盖**（内部导出）→ 替换阶段内部单测 |
| M4 MCP 桶与公开入口 | `tests/mcp.test.mjs`「M4 MCP 区导出面与形态（区域桶）」 |
| M5 Windows Computer Use 传输与借用策略 | **间接覆盖**：三个函数不经公开入口 → 替换阶段内部单测（阈值已在 `behavior.md` M5 逐字冻结） |
| E1 内嵌搜索分支判定 | **间接覆盖**：不经公开入口，调用方在 `runtime/methods/*` 与工具层（`callers.md` §1） |
| E2 内嵌搜索 shell 注入开关 | **间接覆盖**：调用方 `tool/handlers/bash.ts`（同上） |

无空行：M1–M5、E1–E2 每条都有测试或明确的间接覆盖归属。

## 旧门（第一块，旧实现）

`node --import tsx --test --test-concurrency=1 specs/contracts/core-01/tests/mcp.test.mjs`：

- 源码入口：tests=**3** pass=**3** fail=0
- dist 入口（`KNORVIA_CORE_ENTRY=dist`）：tests=**3** pass=**3** fail=0

桩替换与三块补齐后的完整旧门由 `scripts/contract-gate.mjs` 统一跑并写入 `gate-old.json`。

## 计分口径（替换阶段，预告）

- 运行时/实现文件：相似度工具**普通模式**（行 + 结构两道门槛，常量不调）。
- 纯声明/桶文件：`--declaration --interface specs/contracts/core-01/interface.md`。
- 已登记 `independent-replacement` 的文件（如 `agent/turn-tool-projection.ts`）不在范围。

## 条目 → 测试对照表（compact 块，C1–C6）

| 条目 | 测试 / 覆盖方式 |
| --- | --- |
| C1 自动压缩阈值与计算 | `tests/compact.test.mjs`「C1 自动压缩阈值常量与计算（逐字冻结）」 |
| C2 `shouldAutoCompact` 五分支与决策字段 | `tests/compact.test.mjs`「C2 shouldAutoCompact 五分支与决策字段」 |
| C3 轮次分组语义 | `tests/compact.test.mjs`「C3 轮次分组语义（经 hasEnoughMessagesToCompact 间接覆盖）」（`groupByAssistantStartedRounds` 不经桶导出） |
| C4 可摘要消息与 token 估算 | `tests/compact.test.mjs`「C4 可摘要消息与 token 估算」 |
| C5 压缩提示词与摘要格式化 | `tests/compact.test.mjs`「C5 压缩提示词与摘要格式化」 |
| C6 microcompact 阈值与文案 | `tests/compact.test.mjs`「C6 microcompact 阈值与常量（逐字冻结）」；`maybeLocalMicrocompactMessages` 的清理逻辑为内部可达 → 替换阶段内部单测 |

无空行：C1–C6 每条都有测试或明确的覆盖归属。

## 条目 → 测试对照表（context 子块 1，X1–X5）

| 条目 | 测试 |
| --- | --- |
| X1 token 估算单位与前缀截断 | `tests/context.test.mjs`「X1 token 估算单位与前缀截断（逐字冻结权重）」 |
| X2 CLI Prefix section | `tests/context.test.mjs`「X2 CLI Prefix section（逐字冻结）」 |
| X3 Current Date section | `tests/context.test.mjs`「X3 Current Date section（逐字冻结）」 |
| X4 Memory section | `tests/context.test.mjs`「X4 Memory section（标题/路径插值/关键标记）」 |
| X5 context 区公开面 | `tests/context.test.mjs`「X5 context 区公开面（区域桶）」 |

context 子块 2（`builder.ts` 装配顺序/去重、`identity`/`env-info`/`skills`/`desktop`/`workflow-actor`/`request-user-context` 文案、`dynamic-sections`、`types`）待补；补齐前合同不得合并。

## 条目 → 测试对照表（context 子块 2，X6–X9）

| 条目 | 测试 |
| --- | --- |
| X6 Agent Identity section | `tests/context-sections.test.mjs`「X6 Agent Identity section（逐字冻结 + output style 分支）」 |
| X7 Desktop Context section | `tests/context-sections.test.mjs`「X7 Desktop Context section（逐字冻结）」 |
| X8 Environment Info 与 git 上下文 | `tests/context-sections.test.mjs`「X8 Environment Info 与 git 上下文（含 undefined 回落）」 |
| X9 Workflow Actor Identity section | `tests/context-sections.test.mjs`「X9 Workflow Actor Identity section（共用安全行/Harness + 工作流契约）」 |

context 子块 3（`builder.ts` 装配顺序/去重、`skills`/`request-user-context` 文案、`dynamic-sections`、`types`）待补。

## 条目 → 测试对照表（context 子块 3，X10–X11）

| 条目 | 测试 |
| --- | --- |
| X10 Skills section | `tests/context-builder.test.mjs`「X10 Skills section（排序、250 字截断、别名、budget 回落）」 |
| X11 builder 装配顺序与 meta_user 组装 | `tests/context-builder.test.mjs`「X11 builder 装配顺序与 meta_user 组装（逐字冻结）」 |

context 块剩余（子块 4）：`dynamic-sections` 内部文案、`request-user-context`（内部函数）、`types.ts` 编译期用例、builder 的增量方法。

## 条目 → 测试对照表（context 子块 4，X12–X13）

| 条目 | 测试 |
| --- | --- |
| X12 ContextBuilder 增量方法与 meta_user attachment | `tests/context-incremental.test.mjs`「X12 ContextBuilder：addSection 追加不去重、setEnvInfo 替换环境段」「X12 meta_user attachment：来源标记与正文包裹」 |
| X13 context 类型面 | `tests/context-types.test.mjs`「X13 context 类型面：正向用例通过编译、反向用例必须报错」 |

context 块剩余（子块 5）：`dynamic-sections` 内部文案、`request-user-context`（内部函数）、`setToolRegistry` 注册行为。

## 条目 → 测试对照表（agent 组 1，A1–A3）

| 条目 | 测试 / 覆盖方式 |
| --- | --- |
| A1 回合阶段状态机 | `tests/agent-turn-state.test.mjs`「A1 回合阶段状态机：取值表、初始状态与转移矩阵」（10×10 全组合） |
| A2 历史工具部件选择 | **间接覆盖**：`selectToolPartsForHistory` 不经区域桶导出 → 替换阶段内部单测（三条实测语义已写进 behavior.md A2） |
| A3 运行时输入呈现标记 | **间接覆盖**：`runtimeInputMetadata` 不经区域桶导出 → 替换阶段内部单测（7 取值域与 real_user/legacy_synthetic 映射已冻结） |

agent 组剩余：`turn-machine`、`message-history`、`session-history-hydrator`、`compact-session`、`file-part-hydration`、`read-file-state-hydrator`、`message-history-usage`（`turn-tool-projection` 已登记 `independent-replacement`，不在范围）。

## 条目 → 测试对照表（agent 组 2，A4–A6）

| 条目 | 测试 |
| --- | --- |
| A4 回合推进的正常事件序列 | `tests/agent-turn-machine.test.mjs`「A4 turn-machine：正常回合的阶段推进序列（方法返回新状态）」 |
| A5 非法转移与失败收尾 | `tests/agent-turn-machine.test.mjs`「A5 turn-machine：非法转移与失败收尾的错误形态」 |
| A6 工具调度、权限等待/裁决、工具结算与待处理输入 | `tests/agent-turn-machine.test.mjs`「A6 turn-machine：工具调度、权限等待/裁决、工具结算与待处理输入」 |

agent 组剩余：`message-history`、`session-history-hydrator`、`compact-session`、`file-part-hydration`、`read-file-state-hydrator`、`message-history-usage`、`agent/index.ts` 桶导出集合断言。

## 条目 → 测试对照表（agent 组 3，A7–A8）

| 条目 | 测试 |
| --- | --- |
| A7 message-history（追加/替换/缓存统计/只读借用） | `tests/agent-message-history.test.mjs`「A7 message-history：初始化、追加、替换与只读借用」「A7 message-history：缓存统计与重置」 |
| A8 compact-session（边界判定、保留规则、裁剪与插回） | `tests/agent-compact-session.test.mjs`「A8 compact-session：压缩边界的判定与保留条件」「A8 compact-session：活动消息裁剪与保留段插回」（文件级入口，区域桶未导出） |

agent 组剩余：`session-history-hydrator`、`file-part-hydration`、`read-file-state-hydrator`、`message-history-usage`、`agent/index.ts` 桶导出集合断言。

## 条目 → 测试对照表（agent 组剩余，A9–A10）

| 条目 | 测试 |
| --- | --- |
| A9 agent 区公开面（区域桶 10 个导出） | `tests/agent-surface.test.mjs`「A9 agent 区公开面（区域桶的 10 个运行时导出）」 |
| A10 `persistedTokenUsageBaseline` | `tests/agent-usage-baseline.test.mjs`「A10 persistedTokenUsageBaseline：输入推导与上下文用量的冻结规则」（文件级入口，区域桶未导出） |

agent 组剩余：`session-history-hydrator.ts`、`file-part-hydration.ts`、`read-file-state-hydrator.ts`。
