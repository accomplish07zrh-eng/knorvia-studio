# dynamic-workflow-01 既存差异（known-differences.md）

v3。本文件记录**不在本包范围的相邻事实**与**旧行为里看起来奇怪但必须原样保留**的特征。重写时不得"顺手修掉" K1–K8。K9（v2 删桩）与 K10（v3 归档注释替换）是合同修订记录，不要求实现侧动作。

## 1. 不在本包范围的相邻文件

| 相邻面                                                        | 归属                                        | 说明                                                                                                                                              |
| ------------------------------------------------------------- | ------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/engine/**`（24 文件）                                    | dynamic-workflow-02                         | 执行引擎。不 import 本包分析模块（只经 facade/schema 间接依赖），本包重写不影响它。                                                               |
| `src/facade/**`（5 文件）                                     | dynamic-workflow-02                         | facade `.d.ts` 资产与 registry/caps。`compile.ts` **import** 它（`FACADE_DTS`、`FACADE_FILE_NAME`），该依赖方向是兼容面。                         |
| `src/lowering/**`、`src/schema/**`                            | dynamic-workflow-02                         | 它们 import 本包的 `analysis/sites`、`analysis/facade-misuse`、`analysis/interpret`、`analysis/graph`、`compiler/compile`——**相对路径是兼容面**。 |
| `src/index.ts`、`src/projections.ts`                          | 两个入口桶（不重写）                        | 再导出本包符号；导出名集合冻结在 `fixtures/entry-exports.json`（B14）。                                                                           |
| `compiler/libs.generated.ts`                                  | 构建期生成物（`scripts/generate-libs.mjs`） | 不进 git、不在 `licensing/current-files.json`；重写 `compile.ts` 时它照常生成，无需合同覆盖。                                                     |
| `analysis/operators.ts`、`analysis/placeholder-resolution.ts` | `unreviewed`（M0-2/M0-3 复核范围）          | 分类为 unreviewed，**不重写、不删**（同 shared-01 口径）。它们被 `taint.ts`/`state.ts` import，重写后新实现可继续按相对路径引用。                 |

## 2. 旧行为特征（保持原样，勿"修"）

### K1 `Node<T>` 不是 `Promise<T>`——不能 `.catch()`，不能塞进 `Promise<T>[]`

`agent().ask()` 返回 `Node<T>`，facade 里 `interface Node<T> extends PromiseLike<T> {}`（**不是** `Promise<T>`）。因此：

- `a.ask("x").catch(…)` → TS2339（`catch` 不存在）；正确写法是 `a.ask("x").then(onOk, onErr)` 或 `try/catch await`。
- `const held: Promise<string>[] = [a.ask("x")]` → TS2345/2739；正确写法是 `Node<string>[]`。

语料 `async/then-catch-recover`、`fanout/forEach-side-effect`、`fanout/reduce-to-nodes`、`async/queue-chain-then` 按旧行为录制（golden）。重写不得把 `Node` 改成 `Promise`。

### K2 `ask<T>` 的类型参数从上下文推断——`const n: number = await a.ask("x")` 是合法的

`ask<T = string>` 的 T 由赋值上下文推断；`const n: number = await a.ask("x")` 推出 `T = number`，编译通过（golden `errors/assign-string-to-number` 原始版本即此行为，现语料改为经 string 中转以获得真正的 2322）。这不是 bug，是泛型默认值 + 上下文推断的正常组合，**保持**。

### K3 别名 `log` 合法、别名 `report` / `ask` / `phase` / `files.read` / `git.status` / `artifact.*` 非法（9001）

facade-siting 检查按调用点判定：`const r = log;` 不产生站点，直接放行；`const r = report;` / `const s = git.status;` / `const m = artifact.metrics;` 等**会**产生站点或有 journal 语义，逃逸进值空间即 9001。golden `misuse/alias-log`（clean）与 `misuse/alias-report`、`misuse/alias-git-status`、`misuse/alias-artifact-metrics`（9001）钉住这条不对称。

### K4 `phase("…")` 尾随标记（后面没有 ask/world.run）编译期**不报错**

facade 文档要求"每个 phase 必须包含至少一个 subagent ask 或 world.run"，但编译器不在编译期强制——尾随空阶段照常 `ok: true`（golden `phases/trailing-marker-no-work`）。该规则属于展示层/引擎层关切。**保持**：重写不得新增这条编译期诊断。

### K5 `await` 非 thenable 合法

`const v = await 5;` 是 TS 合法代码（await 非 thenable 直接返回原值），分析器报 `ok: true`（golden `errors/await-non-thenable`）。**保持**。

### K6 编译期错误短路时 `declaredArtifacts` 恒为空数组

编译诊断或 facade-misuse 非空 → `declaredArtifacts: []`（不是 undefined）——"拿到的永远是数组，不必在每个消费点分辨'没有产物'与'没能分析'"（`analyze.ts` 注释语义，B4）。**保持**该"缺省而不是缺席"设计。

### K7 9006 保留全部图、其余作者检查扣图

fan-out 静态 actor 名（9006）是唯一不清空图的诊断（B6）；其余作者检查（9003/9004/9005/9007/9008/9009）非空时图被扣下。**保持**该不对称。

### K8 `collectDuplicateActorNames`（9005）不从包入口导出

9005 的正门在引擎运行期（`createActor` 的 `DuplicateActorName`）；编译期这条只是"字面量能看穿的那部分提前到便宜的一侧"，其函数**不**经 `src/index.ts` 导出（`analysis.test.mjs`「B15」断言入口上不存在）。重写不得顺手导出它。

## K9 v2 删桩：B20 的 oracle 从桩目录改指 `interface.md` 的 ts 导出声明块

K9 是 v2 合同修订记录，不要求实现侧动作。K1–K8 仍是必须原样保留的旧行为。

- 原因：替换验收要求旧文件与桩全部删除，且全仓搜本包定型未实现标记为零、不留回退路径（计划书「每包流程」五.1 与验收清单第 466 行）。v1 的 B20 把桩目录当 oracle 读取，留桩与删桩互锁。M1 复盘第 4 条走 C 通道，先例是 core-tool-01 B88（`c7e58013`）：删桩，oracle 改指合同自身的 `interface.md` 导出声明块。
- 变更内容：`tests/surface.test.mjs` 的 B20 只换 oracle 的读取对象（桩文件 → `interface.md` 对应 `###` 节内全部 ts 围栏里的导出声明）。**断言方向与强度逐字不变**——`rewriteTargets.length === 53` 的说明文字、`assert.deepEqual(relative, rewriteTargets, "桩文件集与重写目标集必须一致")` 原样；导出名仍是源码 ⊆ 合同声明，`missing` 用 `file:name`，两侧同一条解析正则（与 B88 相同），缺任何一个由 `assert.deepEqual(missing, [])` 拦下。B18、B19 与其余用例不动、不删、不跳过。
- 强度对照：被拿掉的只是「桩 = 接口派生快照」这半边脚手架（桩文本里的定型抛错、SPDX 头、目标清单行数）。v1 桩替换证据留在 `gate-old.json` 的 `stubReplacement`（53 个目标、tests 3、pass 0、fail 3、`allFail=true`），该文件 v2 不覆盖。v2 在新实现上重跑合同门：源码 39/39、dist 39/39、fail 0、skipped 0，未带桩替换。
- 对应测试：`tests/surface.test.mjs`「B20 interface.md 导出声明块覆盖 53 个重写目标的源码导出」。

## K10 v3 归档注释替换：strands 归档 `declaration` 的注释改为 Knorvia 自写文字，签名逐字节不变

K10 是 v3 记录，不要求实现侧动作，也不改变 K1–K8 的"原样保留"要求。它登记的是一项**已完成**的 re-pin 作业的证据口径，防止后来者把归档文本与产物文本的字节差异误读成行为差异。

- 原因：strands 族与其余族不同——`apps/cli/packages/core/test/causality-order-strands-baseline.json` **顶层的 `declaration` 字段**（夹具里读作 `archive.declaration`）被 `causality-order-strands-fixture.ts` 断言**等于当前构建产物** `dist/analysis/causality-order-strands.d.ts` 的全文（历史快照里保留的是上游注释）。实现重写后产物注释换成 Knorvia 自写文字，归档必须整体刷新，否则该断言必然失败。
- 变更内容：只替换注释文字，导出声明与类型签名逐字节不变。`declarationSha256` 刷新为 `5edfa5fac5025be49f658eebfb445c1a6d37da52f3b05af9ecf6cc89cc791e18`（即上面那份 built `.d.ts` 全文的 sha256）。同一文件里的 `compiled`（历史行为 oracle）未改，`sourceSha256`/`emittedSha256`/`baselineCommit`/`publisherCommit`/`publisherBlob`/`publisherPath`/`formatVersion` 未改；同次提交里另外刷新的只有 `dependencies` 下 `causality-order-settle` 的两条当前产物 sha（属 re-pin 的常规部分）。测试代码与断言未动。
- 比对结果：`/workspace/ktools/strip-compare.mjs`（TypeScript scanner 逐 token 去注释后按字节比对，typescript 6.0.2）比对的是**替换前的归档**与重写后的 built `.d.ts`——归档 raw=4639B、built raw=3962B，去注释后两侧同为 1364B，sha256 同为 `269c70659d120c96e17b3a2e0b3b709bd8c57a8bb9f67a22968ec544663e56dd`，`RESULT: IDENTICAL (byte-for-byte after comment removal)`。原始字节差 677B 全部来自注释文字；签名（去注释后的声明文本）逐字节不变。re-pin 之后归档 `declaration` 与 built `.d.ts` 全文等字节（3962B）。
- 对应测试：`apps/cli/packages/core/test/causality-order-strands-fixture.ts`——第 26 行 `assert.equal(sha(archive.declaration), archive.declarationSha256)`，第 41–45 行 `assert.equal(<built causality-order-strands.d.ts 全文>, archive.declaration, "unchanged public declaration bytes")`。两条断言本轮一字未改。本包合同门两入口 39/39 不受影响（合同测试不读 strands 归档，只读 `interface.md`）。

## 3. core 测试夹具的 sha256 pin（替换阶段的已知作业）

以下 core 测试文件用**字符串路径**动态 import 本包深层模块，并 pin 了 `src/analysis/*` 与 `dist/analysis/*` 的 sha256：

- `apps/cli/packages/core/test/causality-reduction-fixture.ts`（pin `causality-reduce.ts` 源码/产物/声明三份 sha）
- `apps/cli/packages/core/test/fanout-cardinality-fixture.ts`
- `apps/cli/packages/core/test/may-set-lane-expansion-fixture.ts`
- `apps/cli/packages/core/test/causality-order-settlement-fixture.ts`
- `apps/cli/packages/core/test/causality-order-strands-fixture.ts`

**替换阶段**改写这些被 pin 的文件时，必须按 GATE-PLAYBOOK D 节做**范围化 re-pin**（只刷新被断言文件的 sha 记录，不改变上游证据语义）；本合同阶段不动它们。行为判据以合同套件两入口为准。

## 4. 语料 expect 分类以旧实现为准

`fixtures/corpus.mjs` 每个样例的 `expect`（clean/diagnostics）是对旧实现 `ok` 的分类断言；录制时已逐例校验与旧实现一致（0 不符）。golden 文件里录制的 `expect` 与语料交叉核对（`golden.test.mjs` 第一例）。新增语料必须先在旧实现上验证分类再落盘。
