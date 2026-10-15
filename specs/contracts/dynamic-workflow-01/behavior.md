# dynamic-workflow-01 行为规格（behavior.md）

版本 v1 · 2026-10-15 · 基线 `49dde725`（开包时的 origin/main；旧门提交见 `gate-old.json` 的 `commit`）

本文描述 `apps/cli/packages/dynamic-workflow/src/analysis/`（54 个文件）与 `src/compiler/compile.ts`（1 个文件）共 **55 个继承文件**的可观察行为，是重写依据。编号 B1、B2…发布后不重用。每条都给出黑盒可验证的断言；条目→测试对照见 `README.md` 末尾。

**复用的既有规格**（行为依据，不是实现模板）：`specs/knorvia-causality-lane-facts.md`、`specs/knorvia-causality-order-settlement.md`、`specs/knorvia-causality-order-strands.md`、`specs/knorvia-causality-reduction-owner.md`、`specs/knorvia-causality-reduction-target.md`、`specs/knorvia-fanout-cardinality-owner.md`、`specs/knorvia-fanout-cardinality-documentation.md`、`specs/knorvia-may-set-lane-expansion.md`。

**状态所有者总览**（全包一致，逐条不再重复）：

- 本包是**纯静态分析编译器**：输入是工作流脚本文本，输出是诊断、产物清单与若干规范文本投影。没有运行时状态、没有 I/O、没有时钟、没有全局可变单例；每次 `analyzeWorkflowScript` 调用自成一体，任意顺序、任意并发调用互不影响。
- 编译基底（`compiler/compile.ts`）用**全虚拟编译宿主**：脚本 + facade `.d.ts` + 内嵌 TS 标准库全部在内存 Map 里，不触磁盘；`writeFile` 一律抛错（`noEmit`）。
- 日志级别：无。本包不写任何日志（诊断就是它的"输出日志"）。

**诊断码总表**（值即契约，见 B7）：

| 码   | 常量                             | 含义                                                        |
| ---- | -------------------------------- | ----------------------------------------------------------- |
| 9001 | （未导出，`facade-misuse.ts`）   | facade 调用逃逸进值空间（别名/解构/传参/改类型）            |
| 9003 | `WORLD_RUN_LITERAL_CODE`         | `world.run` 首参不是编译期字符串字面量                      |
| 9004 | `PHASE_MARKER_CODE`              | `phase()` 名字非字面量 / 空 / 不在语句位置                  |
| 9005 | （未导出，`actor-names.ts`）     | 字面量 actor 重名                                           |
| 9006 | `FANOUT_ACTOR_NAME_CODE`         | fan-out / 循环内 `agent("静态名")`（唯一不扣图的诊断）      |
| 9007 | `ARTIFACT_DECLARATION_CODE`      | 产物 id 非法（非字面量 / 超 64 字符 / 字符集 / 一 id 两用） |
| 9008 | `ARTIFACT_HOISTING_CODE`         | 产物声明被提升进循环                                        |
| 9009 | `ARTIFACT_PRIMARY_CONFLICT_CODE` | 两个 `primary: true` 冲突                                   |

---

## A. 编译基底（`compiler/compile.ts`）

### B1 脚本包装与诊断坐标映射

- 来源：`compiler/compile.ts`（`SCRIPT_PRELUDE`、`toScriptLoc`、`collectDiagnostics`）。
- 输入：脚本文本；`createWorkflowProgram(scriptText, options?)`。
- 输出：脚本被拼进一个 `async function __workflowScript() { … }` 包装体（prelude 恰好 1 行）再编译；返回的 `WorkflowProgram` 暴露 `program`、`scriptFile`、`toScriptLoc(pos)`。所有诊断与站点位置都映射回**作者坐标**（1-based 行列，剥掉 prelude 行）。
- 错误语义：`scriptFile` 缺失（不可能路径）抛 `Error("workflow script source file missing from program")`；诊断本身不抛错，进 `diagnostics` 数组。
- 时序与并发：纯函数，无 I/O、无共享状态；同一脚本两次编译结果一致。
- 幂等：是。
- 资源释放：无（TS Program 由 GC 回收）。
- 平台差异：无（虚拟宿主的目录恒为 `/`，文件名恒为常量，不依赖宿主文件系统）。
- 状态所有者：无状态。
- 日志级别：无。
- 可测断言：第 1 行的类型错误报在 `line: 1`；第 2 行的错误报在 `line: 2`（`analysis.test.mjs`「B1 编译器包装」两例）。

### B2 诊断顺序与短路

- 来源：`analysis/analyze.ts`。
- 输入：脚本文本。
- 输出：诊断按固定顺序拼接——① 编译诊断（句法在前、语义在后）→ ② facade-misuse（9001）→ ③ 作者检查批（world-run 9003 → artifacts 9007/9008/9009 → phase 9004 → actor 9005/9006）。
- 错误语义：**短路**——①或②非空时③不执行，图全部扣下，`declaredArtifacts` 为空数组。
- 时序与并发：同一次调用内的纯顺序拼接；无跨调用状态。
- 幂等：是。
- 资源释放：无。
- 平台差异：无。
- 状态所有者：无状态。
- 日志级别：无。
- 可测断言：同时含编译错误与 `world.run(变量)` 的脚本，诊断里**没有** 9003（`analysis.test.mjs`「B2 诊断顺序」）。

### B3 环境修饰符消息改写

- 来源：`compiler/compile.ts`（`AMBIENT_MODIFIER_MESSAGES`、`rewriteAmbientModifierMessage`）。
- 输入：脚本顶层的 `declare` / `export` 修饰符（TS1184）。
- 输出：TS 原始消息被替换成以 "The \`declare\` modifier is not allowed in a workflow script" / "\`export\` is not allowed in a workflow script" 开头的可操作文案；其他位置的 TS1184 保持原文案。
- 错误语义：只改文案不改码（仍 1184）。
- 时序与并发：无。
- 幂等：是。
- 资源释放：无。
- 平台差异：无。
- 状态所有者：无状态。
- 日志级别：无。
- 可测断言：`declare const ambient` 与 `export const value` 两个脚本的诊断消息包含改写文案（`analysis.test.mjs`「B3」）。

### B4 分析管线短路与扣图规则

- 来源：`analysis/analyze.ts`（`AnalyzeResult` 语义）。
- 输入：脚本文本。
- 输出：`ok` = "可提交" = 全部诊断为空。`core`/`graph`/`causality`/`flow`/`handoff` **当且仅当** ①②两类诊断都为空时才给出（B2 的③阶段诊断也扣图）。
- 错误语义：编译诊断或 facade-misuse 非空 → `declaredArtifacts: []`、无图；作者检查（③）非空 → `declaredArtifacts` 照常给出、但图扣下。**唯一例外是 9006**（见 B6）。
- 时序与并发：无。
- 幂等：是。
- 资源释放：无。
- 平台差异：无。
- 状态所有者：无状态。
- 日志级别：无。
- 可测断言：编译错误脚本 `core === undefined` 且 `declaredArtifacts` 为 `[]`；facade-misuse 脚本同样（`analysis.test.mjs`「B4」两例）。

### B5 产物清单在作者期诊断下照常给出

- 来源：`analysis/analyze.ts`、`analysis/artifacts.ts`。
- 输入：含 `artifact.metrics("m", …)` 声明且含 9003 类错误的脚本。
- 输出：`declaredArtifacts` 是 `[{id, kind}]`（去重、按 id 排序）；作者检查非空时仍给出。
- 错误语义：见 B4；9007/9008/9009 非空时（作者批内）**也**给出——只有①②才清空它。
- 时序与并发：无。
- 幂等：是。
- 资源释放：无。
- 平台差异：无。
- 状态所有者：无状态。
- 日志级别：无。
- 可测断言：`artifact.metrics("m") + world.run(变量)` 的结果 `declaredArtifacts` 为 `[{id:"m",kind:"metrics"}]`（`analysis.test.mjs`「B5」）。

### B6 9006 是唯一不扣图的诊断

- 来源：`analysis/analyze.ts`（`FANOUT_ACTOR_NAME_CODE` 过滤）、`specs/knorvia-fanout-cardinality-owner.md`。
- 输入：fan-out / 循环体内 `agent("静态名")` 的脚本。
- 输出：`ok: false`（提交仍被挡），诊断含 9006，但 `core`/`graph`/`causality`/`flow`/`handoff` **全部保留**——形状完全可分析，扣图只会让作者在最需要看图时看不到。
- 错误语义：9006 与③批其他诊断共存时（如 9003），只要①②为空，图仍在。
- 时序与并发：无。
- 幂等：是。
- 资源释放：无。
- 平台差异：无。
- 状态所有者：无状态。
- 日志级别：无。
- 可测断言：`Promise.all(xs.map(async x => await agent("static").ask(x)))` 的结果含 9006 且五个图字段全部非 undefined（`analysis.test.mjs`「B6」；golden 回放的 `fanout/static-name-in-fanout` 同证）。

### B7 编译期常量即契约

- 来源：`analysis/phases.ts`、`analysis/world-run.ts`、`analysis/artifacts.ts`、`analysis/handoff-graph.ts`、`analysis/flow-graph.ts`、`analysis/causality-graph-types.ts`、`analysis/causality-order.ts`。
- 输入：无（常量导出）。
- 输出：`PHASE_MARKER_CODE=9004`、`WORLD_RUN_LITERAL_CODE=9003`、`ARTIFACT_DECLARATION_CODE=9007`、`ARTIFACT_HOISTING_CODE=9008`、`ARTIFACT_PRIMARY_CONFLICT_CODE=9009`、`FANOUT_EXPAND_CAP=8`、`FLOW_ENTRY="entry"`、`FLOW_SINK="sink"`、`FLOW_ABORT="abort"`、`SINK_ID="sink"`、`UNKNOWN_LANE="unknown"`、`WORKSPACE_LANE="workspace"`、`UNPHASED="unphased"`、`UNPHASED_ID="unphased"`。
- 错误语义：不适用。
- 时序与并发：不适用。
- 幂等：不适用。
- 资源释放：无。
- 平台差异：无。
- 状态所有者：模块常量。
- 日志级别：无。
- 可测断言：逐个 `assert.equal`（`analysis.test.mjs`「B7」）。

### B8 产物 id 的字符集与上限

- 来源：`facade/artifact-caps.ts`（`ARTIFACT_ID_PATTERN`、`ARTIFACT_CAPS`）、`analysis/artifacts.ts`。
- 输入：`artifact.*(id, …)` 的 id 实参。
- 输出：id 必须匹配 `^[A-Za-z0-9_.-]+$` 且 ≤64 字符；单 run 最多 32 个不同 id（`maxArtifactsPerRun`）。
- 错误语义：违反 → 9007，清单里不出现非法 id。
- 时序与并发：无。
- 幂等：是。
- 资源释放：无。
- 平台差异：无。
- 状态所有者：无状态。
- 日志级别：无。
- 可测断言：65 字符 id 与含空格 id 各得 9007；`ARTIFACT_ID_PATTERN.source` 与 `maxArtifactsPerRun` 逐字等于契约值（`analysis.test.mjs`「B8」）。

### B9 确定性

- 来源：全包（`serialize.ts` 排序、`core.ts` 排序等）。
- 输入：同一脚本文本。
- 输出：两次 `analyzeWorkflowScript` 的诊断、清单与六个序列化文本**逐字节一致**。内部排序只用 ASCII id/locale 独立比较；无 `Date.now`、`Math.random`、`process.env`。
- 错误语义：不适用。
- 时序与并发：无跨调用状态，任意并发安全。
- 幂等：是（本质）。
- 资源释放：无。
- 平台差异：已核对——分析目录无 `localeCompare` 大小写/locale 敏感用法之外的宿主依赖；golden 在 Windows 录制、Linux CI 回放。
- 状态所有者：无状态。
- 日志级别：无。
- 可测断言：同一脚本两次分析的五个序列化文本与诊断 deep-equal（`analysis.test.mjs`「B9」）。

### B10 core JSON 往返

- 来源：`analysis/core-json.ts`（`encodeAnalysisCore`/`decodeAnalysisCore`；Map 以有序 `[key, value][]` 落盘）。
- 输入：`AnalysisCore`。
- 输出：encode → decode → `serializeCore` 与原序列化逐字节一致；二次 encode 与一次 encode deep-equal。
- 错误语义：类型层约束（`AnalysisCoreJson`）。
- 时序与并发：无。
- 幂等：是。
- 资源释放：无。
- 平台差异：无（JSON 文本序即 Map 插入序）。
- 状态所有者：无状态。
- 日志级别：无。
- 可测断言：`analysis.test.mjs`「B10」。

### B11 projections 桶与根桶的投影同源

- 来源：`analysis/causality-graph.ts`（`projectCausalityGraph`）、`analysis/graph.ts`（`projectSiteGraph`）。
- 输入：`AnalysisCore`。
- 输出：用 projections 桶从 core 重投影出的因果图，与 `analyzeWorkflowScript` 内建产出**逐字节一致**（图是 core 的纯投影，不二次读 AST）。
- 错误语义：不适用。
- 时序与并发：无。
- 幂等：是。
- 资源释放：无。
- 平台差异：无。
- 状态所有者：无状态。
- 日志级别：无。
- 可测断言：`projectCausalityGraph(decode(encode(core)), projectSiteGraph(decode(encode(core))))` 与内建 causality 序列化相等（`analysis.test.mjs`「B11」）。

### B12 reduceOrdering 的空输入与自环

- 来源：`analysis/causality-reduce.ts`（贪心不可约传递归约；回边作 carry）。
- 输入：`ReducibleEdge[]`。
- 输出：空输入归约为空数组；自环（`from === to`）不抛错，归约为合法数组。
- 错误语义：不抛。
- 时序与并发：无。
- 幂等：是。
- 资源释放：无。
- 平台差异：无。
- 状态所有者：无状态。
- 日志级别：无。
- 可测断言：`analysis.test.mjs`「B12」；golden 回放 `legacy/reduction-*` 族钉住完整归约语义。

### B13 mermaid 渲染器

- 来源：`analysis/mermaid.ts`（七个 `*ToMermaid`）。
- 输入：对应图对象。
- 输出：非空 mermaid 文本；同一输入两次渲染逐字节一致。`handoffGraphToMermaid(graph, causality)` 第二参是整个因果图（取其 `lanes`/`phases` 供命名）。
- 错误语义：不抛（缺名时用 id 兜底）。
- 时序与并发：无。
- 幂等：是。
- 资源释放：无。
- 平台差异：无。
- 状态所有者：无状态。
- 日志级别：无。
- 可测断言：五个渲染器输出非空且重复渲染一致（`analysis.test.mjs`「B13」）。

### B14 入口导出面

- 来源：`src/index.ts`、`src/projections.ts`（不重写，但其再导出的分析符号是本包兼容面）。
- 输入：无。
- 输出：两个入口的**运行时导出名集合**冻结在 `fixtures/entry-exports.json`（根桶 84 项、projections 桶 32 项，含非本包的 engine/facade/schema 符号——那些属 dynamic-workflow-02，但集合变动会破坏调用方）。
- 错误语义：不适用。
- 时序与并发：不适用。
- 幂等：不适用。
- 资源释放：无。
- 平台差异：无。
- 状态所有者：模块导出。
- 日志级别：无。
- 可测断言：`Object.keys(dw)` / `Object.keys(projections)` 与录制 deep-equal（`analysis.test.mjs`「B14」）。

### B15 收集器公开面与 world.run 命令集

- 来源：`analysis/sites.ts`、`analysis/world-run.ts`、`analysis/phases.ts`、`analysis/artifacts.ts`。
- 输入：`WorkflowProgram` + `SiteTable`。
- 输出：`collectWorldRunCommands` 返回 `{commands, diagnostics}`；命令集是**编译期字符串字面量的去重排序列表**（确认窗展示的授权集）。`collectDuplicateActorNames`（9005）**不**从入口导出（引擎侧正门在运行期）。
- 错误语义：非字面量 `world.run` 首参 → 9003，进 `diagnostics`。
- 时序与并发：无。
- 幂等：是。
- 资源释放：无。
- 平台差异：无。
- 状态所有者：无状态。
- 日志级别：无。
- 可测断言：两次相同 `world.run("git", ["status"])` 收集为 `["git"]`；`collectDuplicateActorNames` 不在入口上（`analysis.test.mjs`「B15」）。

### B16 空脚本与纯逻辑脚本

- 来源：`analysis/analyze.ts`、`analysis/causality-graph.ts`。
- 输入：空串 / 无站点脚本。
- 输出：`ok: true`、诊断空、core 存在（空站点表）、因果图序列化为空文本（只有换行）。
- 错误语义：空脚本不是错误。
- 时序与并发：无。
- 幂等：是。
- 资源释放：无。
- 平台差异：无。
- 状态所有者：无状态。
- 日志级别：无。
- 可测断言：`analyzeWorkflowScript("")` 的因果图序列化 `trim()` 为空（`analysis.test.mjs`「B16」；golden `basic/empty` 同证）。

### B17 locale 独立性

- 来源：`analysis/core.ts`（`renderFacts` 的键排序）等。
- 输入：含多个 ask 站点的脚本。
- 输出：`serializeCore` 的站点行按 ASCII 序排列，不随宿主 locale 改变（`sort()` 默认码点序用于文本行）。
- 错误语义：不适用。
- 时序与并发：不适用。
- 幂等：是。
- 资源释放：无。
- 平台差异：本条就是平台差异条目——Windows（zh）录制、Linux（en）回放必须一致。
- 状态所有者：无状态。
- 日志级别：无。
- 可测断言：core 文本中 `ask ` 开头的行序列等于其排序副本（`analysis.test.mjs`「B17」）。

### B18 模块路径兼容面（源码侧）

- 来源：`callers.md` B 类调用方。
- 输入：无。
- 输出：范围目录下 55 个文件（`analysis/*.ts` ×54 + `compiler/compile.ts`）在源码侧全部存在——其中 53 个是重写目标、2 个 unreviewed（`operators.ts`、`placeholder-resolution.ts`）原样保留；`lowering`/`schema`/core 夹具按相对路径 import 它们。
- 错误语义：不适用。
- 时序与并发：不适用。
- 幂等：不适用。
- 资源释放：无。
- 平台差异：无。
- 状态所有者：文件系统布局。
- 日志级别：无。
- 可测断言：`surface.test.mjs`「B18」逐个 `existsSync`。

### B19 dist 产物存在（dist 入口模式）

- 来源：`package.json` `build`（tsc 产 `dist/**`）。
- 输入：无。
- 输出：dist 入口模式下 55 个 `.js` 与 55 个 `.d.ts` 产物存在（source 模式跳过校验）。
- 错误语义：不适用。
- 时序与并发：不适用。
- 幂等：不适用。
- 资源释放：无。
- 平台差异：无。
- 状态所有者：构建产物。
- 日志级别：无。
- 可测断言：`surface.test.mjs`「B19」。

### B20 桩面一致性

- 来源：`stubs/build-stubs.mjs`。
- 输入：无。
- 输出：`stubs/` 下 53 个桩文件与**重写目标**（55 范围文件减 2 个 unreviewed）一一对应；每个桩有 SPDX 头、import 即抛 `not implemented: dynamic-workflow-01`；`targets.txt` 列 53 个目标。
- 错误语义：不适用。
- 时序与并发：不适用。
- 幂等：不适用。
- 资源释放：无。
- 平台差异：无。
- 状态所有者：合同目录。
- 日志级别：无。
- 可测断言：`surface.test.mjs`「B20」。

---

## golden 样例族（B1–B20 之外的全量等价面）

`fixtures/corpus.mjs` 的 **324 个样例 / 16 族**（legacy、basic、phases、fanout、joins、async、loops、control、world、artifacts、actors、misuse、taint、errors、combined、settle）经 `tests/golden.test.mjs` 与旧实现录制的 `fixtures/golden/*.json` 逐字节比对——这 324 个样例的输入→输出等价性由 golden 回放整体承担，不逐条列入 B 编号。族→行为覆盖：

| 族        | 主要覆盖                                                                                    |
| --------- | ------------------------------------------------------------------------------------------- |
| legacy    | core 测试夹具的真实脚本（lane-facts/reduction/strands/may-set/fanout-cardinality 回归锚点） |
| basic     | 最小形状、类型参数、unicode、返回形状                                                       |
| phases    | 标记语义、字面量要求、空名/表达式位置错误                                                   |
| fanout    | 提升（map/flatMap/forEach/reduce/for-of）、基数（1/8/9/空/变异失效/glob）                   |
| joins     | Promise.all/allSettled/展开/世界读取混合                                                    |
| async     | 循环 await、then 链、持有节点、递归、try/finally                                            |
| loops     | for/for-in/while/do-while、break/continue、嵌套                                             |
| control   | if/三元/短路/switch/throw 路径                                                              |
| world     | files._、git._、world.run 字面量与错误                                                      |
| artifacts | 四种预置 + file/markdown 内容产物、primary 冲突、id 规则                                    |
| actors    | 命名规则、模板名、重名 9005、fan-out 静态名 9006                                            |
| misuse    | 别名/解构/bind/计算成员/改类型的 9001 族                                                    |
| taint     | ask→ask 数据流、端口类型、对象/数组/类流                                                    |
| errors    | TS 编译错误（语法、类型、环境缺失、修饰符）                                                 |
| combined  | 贴近真实模板的组合脚本（发布闸门、重试环、双 agent 交接、看板、调研汇总）                   |
| settle    | 结清语义（held 节点、再入计划、并行持有）——core 结清夹具脚本                                |
