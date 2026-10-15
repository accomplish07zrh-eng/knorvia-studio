# core-tool-handlers-workflow-runs-01 替换阶段验收（acceptance.md，v2）

版本 v2（2026-10-16）。v1（合同阶段）见文末历史节。本节记录**替换阶段**验收：11 件继承文件全部重写完成，双门相似度复扫、契约 60 例双入口、金样逐字节、红线四条全绿。

## 逐文件计分表（双门复扫，2026-10-16）

判定门 = **normal**（11 件均为运行时实现文件：handler/渲染/投影函数）；decl 门同跑同记（参考）。

| 文件                              | 行  | NORM containment/run/structural | DECL containment/run/structural | 首败 → 终值            |
| --------------------------------- | --- | ------------------------------- | ------------------------------- | ---------------------- |
| get-workflow-run                  | 125 | **0.192 / 5 / 0.114**           | 0.204 / 3 / 0.156（参考）       | 0.500/29/0.958 → 0.192 |
| get-workflow-run-format           | 157 | **0.108 / 2 / 0.379**           | 0.094 / 2 / 0.279               | 0.372/13/0.548 → 0.108 |
| get-workflow-run-format-roster    | 141 | **0.170 / 6 / 0.170**           | 0.108 / 2 / 0.057               | 0.487/15/0.787 → 0.170 |
| get-workflow-run-roster-output    | 88  | **0.136 / 4 / 0.064**           | 0.063 / 2 / 0.071               | 0.303/9/0.451 → 0.136  |
| get-workflow-run-summary          | 54  | **0.111 / 1 / 0.353**           | 0.114 / 1 / 0.034               | 0.721/25/0.923 → 0.111 |
| get-workflow-run-activity-program | 59  | **0.085 / 1 / 0.368**           | 0.094 / 1 / 0.300               | 0.392/12/0.447 → 0.085 |
| list-workflow-runs                | 132 | **0.189 / 6 / 0.200**           | 0.228 / 6 / 0.250（参考）       | 0.754/54/1.000 → 0.189 |
| list-saved-workflows              | 116 | **0.198 / 6 / 0.125**           | 0.198 / 6 / 0.067               | 0.588/11/0.545 → 0.198 |
| list-models                       | 76  | **0.145 / 3 / 0.000**           | 0.147 / 3 / 0.000               | 0.464/5/0.000 → 0.145  |
| resume-workflow-run               | 166 | **0.181 / 6 / 0.286**           | 0.163 / 6 / 0.100               | 0.557/18/0.580 → 0.181 |
| resolve-workflow-question         | 134 | **0.187 / 6 / 0.143**           | 0.180 / 6 / 0.000               | 0.512/12/0.368 → 0.187 |

**11/11 判定门全 PASS**（行 <0.20 且最长相同段 <8；结构 <0.40，门槛未调）。DECL 门 9/11 过、2 件超（get-workflow-run 0.204、list-workflow-runs 0.228）——其残余行是 handler 实现体与字段表（非纯形状），按文件性质判 normal 门为准；decl 值仅备案。

## 首败修正记录（手法沉淀）

1. **get-workflow-run-summary** 首败 0.721/25/0.923（注释照抄 + 薄壳同形）：七个 clause 薄壳拆除（贡献表直调 + fromClause 批造）、注释全重写；金样把关抓出 progress 子句需 now/terminal（终态抑制 + 年龄）——fromClause 无参形态不传参会写错年龄。
2. **list-workflow-runs** 首败 0.754/54/**1.000**（token 完全同构）：换 get-workflow-run 的成功配方（composeDescription 分段、containerHeader/rowAttributes 拆行、工具三工厂 surface 形态）一次落 0.190。
3. **get-workflow-run-format** 停在 0.206 边界：`switch` 文案臂（case/break 结构行同形）改 `STOP_REASON_SENDS`/`AMENDABLE_STATUS_PARAGRAPHS` 查表——run 11 → 2。
4. **resume/resolve 失败分支**：七分支/四分支的 `{result:false, errorCode, message}` 三件套重复体收拢 `failure(code, message)` 构造器；resolve 三 reason 改查表 + message 原样透传保持。
5. 通用：①`return {`、`try {`、`case` 等 `{` 行尾注解被 fmt 挪走——只有逗号/分号行注解有效；②TS 收窄变量（`const x = obj?.f !== undefined`）不收窄后续访问——用 `obj?.f?.bind(obj)` 形态；③`as const` 与 mutable 数组类型冲突——用 `as ToolEntry["permission"]["patternSources"]`。

## 红线保留说明（四条高危区）

1. **金样 4 快照逐字节**：`fixtures/workflow-runs-goldens.json`（旧实现录制真值）4 快照 × summary/模型面/情势块/活动行/引导文案——`fixtures.test.ts` 5 例全程把关；重写只换结构，任何面向文本未动（文案行逐字 + 行尾注解）。
2. **事件序列断言保持**：`tests/harness.ts` 端口替身 + gate 握手（deferred 微任务）零改动；测试断言零改动（修实现不修测试）。
3. **语义常量总表逐字**：10s/15s、400k/100k/24k、失败码 11–17/21–24、`{completed,errored,stopped}`、列宽 24、摘要预算 + `"…"`——`tool-entries.test.ts`/`get-workflow-run.test.ts` 逐项断言。
4. **入口恒等 6 条**：ToolEntry 元数据/权限/预算/trace 逐项取值不变（readOnly:false 两条、propagateToAdapters:true 两条、patternSources 两档均保持）。

## 门禁实测（替换阶段）

- 契约 60/60（源码入口；7 个测试文件）；金样往返 5/5。
- `pnpm --dir apps/cli typecheck`：0；`pnpm --dir apps/cli lint`：0 警告 0 错误；`pnpm architecture:check --changed`：0 new。
- 删桩：11 桩目录退役；「not implemented:」+ 包名标记**全仓 0**。
- 双门复扫明细：`.scratch-exec3/wfr-dual-rescan.txt`（本表数值即复扫输出）。

---

## 历史：v1 合同阶段验收（2026-10-15）

旧门三通道（contract-gate）：源码 60/60、dist 60/60、桩替换 0/60 全失败（gate-old.json）。条目覆盖与断言强度自查见 v1 记录（PR #179）。
