# dynamic-workflow-01 合同（v3）

版本 **v3**（2026-10-18）。v3 = v2 加 `known-differences.md` **K10**：strands 归档（`causality-order-strands-baseline.json` 顶层的 `declaration` 字段）的注释已替换为 Knorvia 自写文字，类型签名逐字节不变（去注释比对 IDENTICAL）。**只登记已完成 re-pin 的证据口径**——断言、测试代码、实现源码一律不动，不新增也不放宽任何条目。

v2 = v1（2026-10-15，issue #154）按计划书「每包流程」五.1、替换验收清单与 M1 复盘第 4 条（core-tool-01 B88，`c7e58013`）的收尾修订：**删除 `stubs/`，B20 的 oracle 从桩目录改指 `interface.md` 各节的 ts 导出声明块**；断言方向与强度逐字不变（重写目标计数 53、文件集 `assert.deepEqual`、源码导出名 ⊆ 合同声明且 `assert.deepEqual(missing, [])`，解析正则与 B88 相同）。其余断言不动、不删、不跳过。`apps/cli/packages/dynamic-workflow/src/analysis/`（54 个文件）+ `src/compiler/compile.ts`（1 个文件）的替换合同。计划书「每包流程」第二步的产物；M2 包 dynamic-workflow-01，issue #154。

- 分支：`replace/dynamic-workflow-01`（合同 v1 起自 `contract/dynamic-workflow-01`，`origin/main` @ `49dde725`，已并入 `95426e41`/`5a129165`）
- 状态：**v3 收尾**。v1 旧门在两个入口各 39/39 通过、桩替换 3/3 文件全失败，记录留在 `gate-old.json`（v2/v3 均不覆盖）。v2 在新实现上重跑合同门（源码与 dist，不带桩替换）：各 39/39、fail 0、skipped 0。v3 只补 K10 与新实现上的第三次重跑，条目与断言无变化。
- 任务书选择 10：**golden 样例为主**——本合同含 **324 个输入脚本 → 静态分析结果**的录制样例（16 族），回放逐字节比对。

## 范围与边界

**在范围**（`licensing/current-files.json` 分类为继承的 **55 个文件**）：

- `apps/cli/packages/dynamic-workflow/src/analysis/*.ts`：54 个文件。
- `apps/cli/packages/dynamic-workflow/src/compiler/compile.ts`：1 个文件（`upstream-unchanged`）。

其中 **重写目标 = 53 个继承文件**（`upstream-unchanged` 20 + `upstream-modified` 33）；另有 2 个 `unreviewed` 文件（`analysis/operators.ts`、`analysis/placeholder-resolution.ts`，共 144 行）属 M0-2/M0-3 复核范围，**不重写、不删**（同 shared-01 口径，见 `known-differences.md` §1）。53 ≤ 60，**不需要拆包**。

**不在范围的相邻文件**（不要在本包里改）：`src/engine/**`（24 文件，dynamic-workflow-02）、`src/facade/**`（5 文件，dynamic-workflow-02）、`src/lowering/**`、`src/schema/**`（dynamic-workflow-02）、两个入口桶 `src/index.ts`/`src/projections.ts`（内部实现可任意重组，但**导出面冻结**）、`compiler/libs.generated.ts`（构建期生成物）。逐项理由见 `known-differences.md` §1。

**选包收尾记录**：`knip --include=exports,nsExports,types,nsTypes -W @knorvia/dynamic-workflow` 空输出（无未用导出）；无引用导出 `ParamActuals` 已在 `ded99450` 单独删除；`pnpm dep:refs --list-exports` 55/55 文件跑通。

## 完成度

| 产物                                                                                                                | 状态                                                                                  |
| ------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------- |
| 选包与边界（范围 55 继承文件；重写目标 53 = 20 unchanged + 33 modified；2 unreviewed 不动）                         | 完成                                                                                  |
| `interface.md`（55 文件、283 项运行时导出签名，`tests/gen-interface.mjs` 机器生成）                                 | 完成                                                                                  |
| `stubs/`（v1：53 个重写目标的模块桩、生成脚本与目标清单）                                                           | v1 完成 → **v2 已删除**（桩替换 0/3 的证据留存 `gate-old.json` 的 `stubReplacement`） |
| `behavior.md`（B1–B20，逐条含九项 + golden 族覆盖表）                                                               | 完成                                                                                  |
| `tests/`（3 个测试文件 39 例；golden 回放 324 样例 / 16 族；两入口）                                                | 完成                                                                                  |
| `fixtures/`（`corpus.mjs` 324 样例、`golden/*.json` 16 族录制 518KB、`entry-exports.json` 导出面录制）              | 完成                                                                                  |
| dist 入口旧门（`KNORVIA_DW01_ENTRY=dist` + `pnpm --dir apps/cli/packages/dynamic-workflow build`）                  | 完成                                                                                  |
| `callers.md`（语法级 import 扫描 7,493 文件 + 字符串路径 6 处；`callers-raw.txt` 机器生成）                         | 完成                                                                                  |
| `known-differences.md`（K1–K8 旧行为特征 + K9 v2 删桩记录 + K10 v3 归档注释替换 + 不在范围相邻文件 + sha pin 作业） | 完成                                                                                  |
| `acceptance.md` / `gate-old.json`                                                                                   | 完成                                                                                  |
| `licensing/reviews.json` 登记合同文件、`knip.json` 根 entry                                                         | 完成                                                                                  |

## 合同文件

- `behavior.md`：行为条目 B1–B20 + golden 样例族覆盖表。
- `interface.md`：55 文件的模块路径与导出签名（机器生成，不手改）。
- `callers.md` + `callers-raw.txt`：调用方全量清单。
- `known-differences.md`：既存差异与旧行为特征（K1–K8）；K9 是 v2 删桩、K10 是 v3 归档注释替换的合同修订记录。
- `stubs/`：v1 的最小桩与生成脚本。**v2 已删除**（桩替换证据留存 `gate-old.json` 的 `stubReplacement`）。
- `tests/`：3 个契约测试文件（`entry.mjs` 支持源码/dist 两入口）+ 录制/生成脚本。
- `fixtures/`：`corpus.mjs`（324 样例语料）、`golden/`（16 族旧实现录制）、`entry-exports.json`。
- `acceptance.md`、`gate-old.json`：验收与旧门结果。

## 运行契约测试（两个入口）

```text
# 前置：Node 24.14.0（mise.toml 固定版本），仓库根目录
# 源码入口（pnpm test:studio 用的就是这一档）
node --import tsx --test "specs/contracts/dynamic-workflow-01/tests/*.test.mjs"

# dist 入口（先构建本包产物）
pnpm --dir apps/cli/packages/dynamic-workflow build
$env:KNORVIA_DW01_ENTRY = "dist"
node --import tsx --test "specs/contracts/dynamic-workflow-01/tests/*.test.mjs"
```

当前结果（v1 旧实现，见 `gate-old.json`）：源码入口 39/39、dist 入口 39/39，golden 样例 324/324，预登记差异 8 条（K1–K8，见 `known-differences.md`）。

v2 新实现（2026-10-17，Node v20.19.2，`scripts/contract-gate.mjs`，不带桩替换，报告写在合同目录以外，**没有覆盖 `gate-old.json`**）：源码入口 39/39、dist 入口 39/39，fail 0，skipped 0。dist 前置：`pnpm --dir apps/cli/packages/dynamic-workflow build`。

v3 新实现（2026-10-18，Node v24.14.0，同一 runner 与同一命令，报告写在合同目录以外，同样**没有覆盖 `gate-old.json`**）：源码入口 39/39、dist 入口 39/39，fail 0，skipped 0。v3 无条目变更，重跑只为确认 K10 那次 re-pin 没牵动本包行为。

各测试文件覆盖的条目：

- `golden.test.mjs`（17 例）：324 样例全量回放（语料↔golden 一致性 + 16 族逐字节比对）
- `analysis.test.mjs`（19 例）：B1–B17
- `surface.test.mjs`（3 例）：B18、B19（dist 模式）、B20

## 注意事项

1. **golden 是本合同的主体**（任务书选择 10）。324 个样例的「输入脚本 → 分析结果」由旧实现在 `49dde725`+merge 后的树上一次性录制（`tests/record-golden.mjs`）；回放测试逐字节比对 `ok`、诊断（码/行/列/消息）、产物清单与六个规范文本投影（core / causality / flow / handoff / site / actor）。**重写实现产出任何不同字节即红。**
2. **语料 expect 分类以旧实现为准**：`corpus.mjs` 每例的 `expect` 是对旧实现 `ok` 的分类断言，录制时逐例校验（0 不符）。新增语料必须先验证分类再落盘。
3. **桩已删除（v2）**：v1 的桩只含签名，桩替换验证在旧门里跑过（3 个测试文件全失败，`allFail=true`），证据在 `gate-old.json` 的 `stubReplacement`。v2 起该目录不存在，这段验证不再可复跑，也不再作为回退路径。2 个 unreviewed 文件本来就不进桩（不重写不删）。B20 改为以 `interface.md` 的导出声明块为 oracle。
4. **dep:refs 符号级 findReferences 在本包规模下内存溢出**（283 导出 × 全仓），改用语法级 import 扫描 + 逐文件 `--list-exports`（`--list-exports` 55/55 跑通），见 `callers.md` 与 `acceptance.md`。
5. **core 测试夹具的 sha256 pin 是替换阶段的已知作业**（5 个夹具 + 1 证据脚本按字符串路径 import 本包深层模块并 pin sha）：替换时范围化 re-pin，行为判据以本合同两入口为准，见 `known-differences.md` §3；strands 归档 `declaration` 的注释替换与去注释等价证据见 K10。
6. **重跑录制**：改语料后 `node --import tsx specs/contracts/dynamic-workflow-01/tests/record-golden.mjs` 重录 golden，再跑旧门并升版本。

## 条目 → 测试对照表

| 条目                                | 测试（`tests/` 下，只走公开入口）                                                                                           |
| ----------------------------------- | --------------------------------------------------------------------------------------------------------------------------- |
| golden 324 样例 / 16 族全量等价     | `golden.test.mjs`「golden 回放（source/dist 入口）：语料与录制清单一一对应」＋16 个「golden 回放：\<族\> 族 N 例」          |
| B1 编译器包装与诊断坐标映射         | `analysis.test.mjs`「B1 编译器包装：诊断位置映射回作者坐标」＋「B1 编译器包装：SCRIPT_FILE_NAME 与 facade 文件名常量」      |
| B2 诊断顺序与短路                   | `analysis.test.mjs`「B2 诊断顺序：语义诊断在句法诊断之后、作者检查在编译诊断之后」                                          |
| B3 环境修饰符消息改写               | `analysis.test.mjs`「B3 环境修饰符消息改写：declare/export 给出可操作文案」                                                 |
| B4 分析管线短路与扣图规则           | `analysis.test.mjs`「B4 analyze 管线短路：编译诊断非空时不产出图也不产出产物清单」＋「B4 facade-misuse 同样扣下全部图」     |
| B5 产物清单在作者期诊断下照常给出   | `analysis.test.mjs`「B5 产物清单：诊断非空时仍给出（作者期检查不扣产物清单）」                                              |
| B6 9006 是唯一不扣图的诊断          | `analysis.test.mjs`「B6 9006 唯一不扣图：fan-out 静态 actor 名清 ok 但保留全部图」＋ golden `fanout/static-name-in-fanout`  |
| B7 编译期常量即契约                 | `analysis.test.mjs`「B7 编译期常量：诊断码与上限值即契约」                                                                  |
| B8 产物 id 的字符集与上限           | `analysis.test.mjs`「B8 产物 id 上限与字符集」＋ golden `artifacts/id-too-long`、`artifacts/id-non-literal`                 |
| B9 确定性                           | `analysis.test.mjs`「B9 确定性：同一脚本两次分析输出逐字节一致」                                                            |
| B10 core JSON 往返                  | `analysis.test.mjs`「B10 core JSON 往返：encode → decode → 再序列化逐字节一致」                                             |
| B11 projections 桶与根桶的投影同源  | `analysis.test.mjs`「B11 projections 桶与根桶的分析投影同源」                                                               |
| B12 reduceOrdering 的空输入与自环   | `analysis.test.mjs`「B12 reduceOrdering：贪心不可约归约的空输入与自环」＋ golden `legacy/reduction-1`、`legacy/reduction-2` |
| B13 mermaid 渲染器                  | `analysis.test.mjs`「B13 mermaid 渲染器：输出非空且确定」                                                                   |
| B14 入口导出面                      | `analysis.test.mjs`「B14 入口导出面：运行时导出集合与录制一致」                                                             |
| B15 收集器公开面与 world.run 命令集 | `analysis.test.mjs`「B15 collectSites / collectWorldRunCommands / collectPhaseMarkerDiagnostics 公开面」                    |
| B16 空脚本与纯逻辑脚本              | `analysis.test.mjs`「B16 空脚本与纯逻辑脚本：无站点、无图边、ok=true」＋ golden `basic/empty`、`basic/whitespace`           |
| B17 locale 独立性                   | `analysis.test.mjs`「B17 locale 独立性：ASCII id 排序在不同 locale 下一致」                                                 |
| B18 模块路径兼容面（源码侧）        | `surface.test.mjs`「B18 模块路径兼容面：55 个范围文件存在」                                                                 |
| B19 dist 产物存在（dist 入口模式）  | `surface.test.mjs`「B19 dist 入口模式下 55 个产物存在」                                                                     |
| B20 导出声明覆盖                    | `surface.test.mjs`「B20 interface.md 导出声明块覆盖 53 个重写目标的源码导出」                                               |

B1–B20 全部有条目、全部有测试（无空行）；324 个 golden 样例的整体等价由 `golden.test.mjs` 承担（首行）。

## 旧门与新实现门禁（v2 / v3）

v1 旧门（旧实现上的结论，机器可读记录在 [`gate-old.json`](gate-old.json)，**v2/v3 不覆盖该文件**）：

- 源码入口：tests=39 **pass=39** fail=0（golden 324/324 样例）
- dist 入口（前置：`pnpm --dir apps/cli/packages/dynamic-workflow build`）：tests=39 **pass=39** fail=0
- 桩替换（53 个重写目标文件）：tests=3 **pass=0** fail=3 → `allFail=true`：契约测试确实测到公开行为
- 预登记差异：K1–K8（`known-differences.md`，各有对应测试/语料）；跳过：0
- v1 命令另带桩替换参数，并把报告写入 `gate-old.json`。目录删除后该段不再可复跑。

v2 在**新实现**上重跑（2026-10-17，Node v20.19.2，实测提交 `417f9244`，不带桩替换）：

```text
node scripts/contract-gate.mjs --contract specs/contracts/dynamic-workflow-01 \
  --tests "*.test.mjs" --dist-env KNORVIA_DW01_ENTRY=dist \
  --json <合同目录以外的路径>
```

- 源码入口：tests=39 **pass=39** fail=0 skipped=0 exit=0（`duration_ms 59119.399845`）
- dist 入口：tests=39 **pass=39** fail=0 skipped=0 exit=0（`duration_ms 41903.81015`）
- `stubReplacement`：null（未启用桩替换）
- 总判：`pass: true`

v3 用**同一条命令**在新实现上再跑一次（2026-10-18，Node v24.14.0，实测提交 `d0ce5d0f`，报告 `/workspace/ktools/dw01-gate-v3-final.json`，`generatedAt` `2026-10-18T10:33:44.854Z`，不带桩替换；`gate-old.json` 未被写入）：

- 源码入口：tests=39 **pass=39** fail=0 skipped=0 todo=0 exit=0（`duration_ms 34431.080856`）
- dist 入口：tests=39 **pass=39** fail=0 skipped=0 todo=0 exit=0（`duration_ms 16678.342219`，环境 `KNORVIA_DW01_ENTRY=dist`）
- `stubReplacement`：null；总判：`pass: true`
- 触发原因：K10 那次 strands 归档 re-pin 只动 `core/test` 的哈希与归档文本，本包无改动；重跑确认 324 个 golden 样例与 B1–B20 未受影响。合同文档里只有 `interface.md` 被测试读取（`tests/surface.test.mjs`），v3 没有改它。

## 计分口径（替换阶段）

计分口径（Lead 裁定，2026-10-12，见 `docs/knorvia-contracts-01-acceptance.md` 第 26 行）：**运行时/实现文件用普通模式**；**纯声明/桶文件用 `--declaration --interface specs/contracts/dynamic-workflow-01/interface.md`**；当「兼容面行数本身 ≥ 残留归一化行数的 20%」时，普通模式数学上不可达，该文件按第三步用声明模式计分。门槛常量 **0.2 / 8 / 0.4 不改**。工具字段：`declaration-lines` = 被剔除行数，`residual-lines` = 残留归一化行数。报告值取 `--old-rev origin/main` 与上游固定树两侧的最大值。

- 重写目标与拆分出去的实现文件：普通模式。
- `compiler/compile-types.ts` 只保留与 `interface.md` 里 `compile.ts` 公共形状一致的五个接口（`CompileDiagnostic`、`CompileResult`、`ScriptLoc`、`WorkflowProgram`、`CreateWorkflowProgramOptions`），按声明模式计分：`node scripts/provenance/similarity.mjs --declaration --interface specs/contracts/dynamic-workflow-01/interface.md`。
- 运行时值 `SCRIPT_FILE_NAME`、`WORKFLOW_FUNCTION_NAME` 与 `defaultCompilerOptions` 在独立重写的 `compiler/compile.ts` 里，该文件走普通模式。`defaultCompilerOptions` 不导出（不在 `interface.md` 的导出清单里）。
- 入口桶与本包无关（`src/index.ts`/`src/projections.ts` 不在重写范围），但其再导出的分析符号经 B14 导出面测试守住。
- core 夹具 sha256 pin 的文件（`causality-reduce.ts` 等）：替换时按 GATE-PLAYBOOK D 节范围化 re-pin。
