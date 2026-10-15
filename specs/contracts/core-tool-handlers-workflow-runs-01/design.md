# core-tool-handlers-workflow-runs-01 替换设计（design.md）

版本 v1（2026-10-16）。替换 11 个继承文件（1,618 行）为独立实现。合同：`specs/contracts/core-tool-handlers-workflow-runs-01/`（behavior 51 条、金样 4 快照、契约 60 例双入口）。相似度双口径门（普通/声明）不调门槛。

## 桩失败留证（替换起点）

- 合同 `gate-old.json`（PR #179）：源码 60/60、dist 60/60、**11 桩替换 0/60 全失败**（allFail=true）。
- 替换分支起点重跑 contract-gate 三通道，桩通道再次 0/60 全失败（留证于本目录 gate 输出与 handover）。
- 桩文件带「not implemented」定型标记；收尾要求该标记**全仓 0**（删桩目录，桩实现与标记引用一并清）。验收断言：全仓检索「not implemented:」+ 本包名 = 0 处。

## 换骨配方全册（逐簇）

**总原则**（继承 apps-cli-packages-01-model 与 -01 的手法沉淀）：
1. 换模块切法/换控制流/换数据形状——structural 指标去注释计分，注解只救 containment/run，救不了 structural。
2. 「被迫逐字」的协议面（文案、判别键、失败码、块标签）逐行行内注解（逗号/分号结尾行才有效；`{` 行尾注解会被 fmt 挪走）。
3. 同形常量数组改空格串 split / 查表；`filter/map` 链改显式循环；闭包改具名函数；`for(;;)` 改 `while (true)`。
4. 照抄旧注释行也计入命中——注释必须重写（自己的话）。
5. 大件可拆 support/ 内核 + 门面（纯形状模块走声明模式）。

### 簇 1：单 run 内省（6 件，878 行）

| 文件 | 换骨配方 |
| --- | --- |
| `get-workflow-run.ts`（183） | 端口门/投影流水拆具名阶段（`readRunDetail` → `projectSnapshot` → `finishOutput`）；`applyWorkflowRunOutputFields` 调用表化（字段三态「defined/truthy/nonempty」改查表）；ToolEntry 字面量逐行注解 |
| `get-workflow-run-summary.ts`（119） | 贡献表 `SUMMARY_CONTRIBUTIONS` 已表化——换 `fitSummaryPrefix` 为「预算分配」形态（先算 required 保底再贪心裁尾）；clause 包装函数拆直调表 |
| `get-workflow-run-roster-output.ts`（107） | 三投影的可选键展开式（`...(x!==undefined?{k:x}:{})`）改 `pickDefined(entries)` 收集器（换数据形状）；ask/wait 投影改字段探针表 |
| `get-workflow-run-format.ts`（199） | 块序列表化（`BLOCKS: Array<{when, render}>` 顺序表 + 过滤拼装）；routing/amendable 文案分支改「状态→段落」查表 |
| `get-workflow-run-format-roster.ts`（219） | 表格列构造拆 `row(cells)` 管线；`phaseColumnWidth` 求值序语义保持（Math.min getter 先读——B-gt-5）；health/phases/subagents/log_tail 四块各拆 render 函数 |
| `get-workflow-run-activity-program.ts`（61） | 六分支改「相位→活动描述」分派表（cause/state 查表 + 具名描述器）；年龄拼接拆 `withElapsed(base, age)` |

### 簇 2：列表（3 件，361 行）

| 文件 | 换骨配方 |
| --- | --- |
| `list-workflow-runs.ts`（149） | 单行属性序列改「属性收集器」（`rowOf([...])` 过滤空段拼接）；header 属性同法 |
| `list-saved-workflows.ts`（130） | escapeAttribute 拆替换链（三步显式）；空清单分支与 invalid 块拆 render |
| `list-models.ts`（82） | 声明面为主——ToolEntry 字面量逐行注解 + 描述文案行断点重排（格式器不折字符串） |

### 簇 3：执行入口（2 件，397 行）

| 文件 | 换骨配方 |
| --- | --- |
| `resume-workflow-run.ts`（223） | 失败码表 + 六分支改「reason→构造器」分派表（`FAILURE_BUILDERS`）；成功输出字面量逐行注解；`formatResumeWorkflowRunModelContent` 薄壳注解 |
| `resolve-workflow-question.ts`（186） | 同上（四分支表 + message 透传保持）；码表常量注解 |

## 红线保留（逐条对照 behavior/acceptance）

1. **金样 4 快照逐字节**：summary/模型面/情势块/活动行/引导文案——重写只换结构不换任何面向文本（字符串字面量与拼接顺序保持；`fixtures.test.ts` 5 例逐字节把关）。
2. **事件序列断言**：`tests/harness.ts` 的端口替身 + gate 握手（deferred）不改；测试断言零改动（只在实现不达时修实现）。
3. **语义常量总表逐字**：10s/15s、400k/100k/24k、11–17/21–24、`{completed,errored,stopped}`、24 列宽、摘要预算 + `"…"`。
4. **入口恒等 6 条**：ToolEntry 元数据/权限/预算/trace 逐项取值不变（`tool-entries.test.ts` 把关）。

## 分簇推进与门禁

每簇：重写 → `pnpm exec node scripts/run-quality.mjs fmt`（**fmt 后 `git checkout -- licensing/reviews.json`** 还原登记抖动）→ 契约 60 例（源码入口）→ 双门相似度（normal + decl 都跑都记，按文件性质定判定门）→ `pnpm --dir apps/cli typecheck` + `lint` + `architecture:check --changed` → 小步提交推送。

收尾：删旧删桩（「not implemented」+ 本包名标记全仓 0——桩目录退役、文档引用改泛称）→ 登记（**全部文件 LF**；改动后必跑 provenance:report）→ L 节门禁（verify:pre-push）→ acceptance（逐文件计分表 + 首败修正 + 红线保留说明）→ prepare-merge 合 main → PR → 自查评论 → CI 双绿（整体 conclusion）→ squash 合并 → issue #181 记录。
