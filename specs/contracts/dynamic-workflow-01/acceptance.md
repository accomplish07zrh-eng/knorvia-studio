# dynamic-workflow-01 验收记录（acceptance.md）

v3 · 2026-10-18 · 分支 `replace/dynamic-workflow-01`

v1（2026-10-15，分支 `contract/dynamic-workflow-01`，旧门提交 `b87ee190`，`origin/main@95426e41` 并入后的树）的记录保留在下面各节。v2 删除桩目录，B20 oracle 改指 `interface.md` 导出声明块（`known-differences.md` K9），并在新实现上重跑合同门（不带桩替换，不覆盖 `gate-old.json`）。v3 只新增 K10（strands 归档 `declaration` 的注释替换，签名逐字节不变）并在新实现上再跑一次合同门；条目、断言、实现源码与 `gate-old.json` 均未动。实测见文末「八」（v2）与「十」（v3）。

## 一、范围

- 在范围：`apps/cli/packages/dynamic-workflow/src/analysis/*.ts`（54）+ `src/compiler/compile.ts`（1）= **55 继承文件 / 12,882 行**。
- 继承分类：upstream-unchanged 20 + upstream-modified 33 = **53 个重写目标**；另有 2 个 unreviewed（`operators.ts`、`placeholder-resolution.ts`）不重写不删。≤60 不拆包。
- 选包收尾：`knip -W @knorvia/dynamic-workflow --include=exports,…` 空输出；`ParamActuals` 已删（`ded99450`）；`pnpm dep:refs --list-exports` 55/55 跑通（315 行声明导出）。

## 二、旧门结果（v1，历史；scripts/contract-gate.mjs）

| 入口      | tests | pass | fail | skipped | 说明                                                       |
| --------- | ----: | ---: | ---: | ------: | ---------------------------------------------------------- |
| 源码入口  |    39 |   39 |    0 |       0 | 含 324 样例 golden 回放（17 例中的 16 族）                 |
| dist 入口 |    39 |   39 |    0 |       0 | 前置 `pnpm --dir apps/cli/packages/dynamic-workflow build` |
| 桩替换    |     3 |    0 |    3 |       0 | 53 个重写目标文件替换后 3 个测试文件全失败，allFail=true   |

`gate-old.json`：`pass: true`，node v24.14.0，runner `scripts/contract-gate.mjs`。

## 三、golden 样例

- 语料：`fixtures/corpus.mjs`，**324 样例 / 16 族**（≥300 ✓，任务书选择 10）。
- 录制：`tests/record-golden.mjs` 在旧实现上一次性录制，输出 `fixtures/golden/*.json`（16 文件，518 KB）。
- 回放：`tests/golden.test.mjs` 逐字节比对 ok / 诊断（码/行列/消息）/ 产物清单 / 六个规范文本投影（core、causality、flow、handoff、site、actor）。
- expect 分类校验：录制时 324/324 与旧实现 `ok` 一致（0 不符）；回放再交叉核对语料↔golden 的 expect。

## 四、桩替换验证（v1 历史项）

- v1 生成 53 个重写目标的 import 即抛桩与目标清单（`gate-old.json` 的 `stubReplacement.replacedFiles` 为 53）。
- 旧门桩替换后源码入口 3 个测试文件全失败（pass=0）→ `allFail=true`，证明契约测试确实测到公开行为。
- **v2 已删除桩目录**，该验证不再可复跑，目录也不再是回退路径。B20 的 oracle 改指 `interface.md` 导出声明块（K9）。

## 五、预登记差异（known-differences.md K1–K8）

K9（v2 删桩）与 K10（v3 归档注释替换）是合同修订记录，不是实现差异，见文末。K1–K8 每条都有对应测试或语料：

| 差异                                  | 对应测试/语料                                                                                                |
| ------------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| K1 Node 非 Promise                    | golden `async/then-catch-recover`、`fanout/forEach-side-effect`、`async/queue-chain-then`                    |
| K2 ask 类型参数上下文推断             | golden `errors/assign-string-to-number`（经 string 中转钉 2322）                                             |
| K3 alias-log 合法 / alias-report 非法 | golden `misuse/alias-log`、`misuse/alias-report`、`misuse/alias-git-status`、`misuse/alias-artifact-metrics` |
| K4 phase 尾随空标记合法               | golden `phases/trailing-marker-no-work`                                                                      |
| K5 await 非 thenable 合法             | golden `errors/await-non-thenable`                                                                           |
| K6 编译错时空产物清单                 | `analysis.test.mjs`「B4」                                                                                    |
| K7 9006 不扣图                        | `analysis.test.mjs`「B6」+ golden `fanout/static-name-in-fanout`                                             |
| K8 9005 不导出                        | `analysis.test.mjs`「B15」                                                                                   |

## 六、门禁（本地，Node 24.14.0）

见 PR 描述贴的门禁摘要（fmt / lint / typecheck / architecture / build / test:studio / knip / provenance）。test:studio 会自动收录 `specs/contracts/dynamic-workflow-01/tests/*.test.mjs`（M0-10 机制）。

## 七、未覆盖项

- **符号级 dep:refs findReferences 内存溢出**：283 个导出 × 全仓 7,493 文件的引用回溯在本机 V8 OOM。替代方案：语法级 import 扫描（`tests/scan-callers.mjs`，覆盖全部静态可见 import）+ 字符径人工核对 + `pnpm dep:refs --list-exports` 55/55 逐文件跑通。符号级全量回溯留待替换阶段按需对单文件跑。
- **core 夹具 sha256 pin**：替换阶段的范围化 re-pin 作业（GATE-PLAYBOOK D 节），本阶段不动。v3 的 strands 归档 `declaration` 那一行已按此口径完成，证据见 `known-differences.md` K10 与文末「十」。
- **mermaid 渲染器的逐字节 golden**：mermaid 输出由图决定，图本身已被六个投影逐字节钉住；mermaid 只测非空 + 确定性（B13）。
- **SNIPPET_FACADE_DTS 的编译行为**：eval-workflow-snippet 的片段编译走 `createWorkflowProgram({facadeDts})`，其行为差异由 dynamic-workflow-02 的调用方测试覆盖；本包只守 `SNIPPET_FACADE_DTS` 常量内容（B1）。

## 八、v2 新实现合同门（不覆盖 gate-old.json）

- 触发：删桩，B20 oracle 从桩目录改指 `interface.md` 的 ts 导出声明块（断言方向与强度逐字不变，见 K9）。重跑对象是**新实现**，不是旧实现；不带桩替换参数。
- 命令：`node scripts/contract-gate.mjs --contract specs/contracts/dynamic-workflow-01 --tests "*.test.mjs" --dist-env KNORVIA_DW01_ENTRY=dist --json <合同目录以外的路径>`
- 实测提交：`417f9244`（删桩与 B20 改指已提交；本节在其后写入）。Node v20.19.2。runner `scripts/contract-gate.mjs`。`generatedAt` `2026-10-16T20:50:32.600Z`。
- dist 前置：`pnpm --dir apps/cli/packages/dynamic-workflow build`。

| 入口 | tests | pass | fail | skipped | exit |
| ---- | ----: | ---: | ---: | ------: | ---: |
| 源码 |    39 |   39 |    0 |       0 |    0 |
| dist |    39 |   39 |    0 |       0 |    0 |

- `pass: true`。`stubReplacement: null`。
- 源码末尾：`# tests 39` / `# pass 39` / `# fail 0` / `# skipped 0` / `# duration_ms 59119.399845`
- dist 末尾：`# tests 39` / `# pass 39` / `# fail 0` / `# skipped 0` / `# duration_ms 41903.81015`

`gate-old.json` 仍是 v1 旧实现记录（`pass: true`，node v24.14.0，源码 39/39、dist 39/39、桩替换 0/3 且 `allFail=true`），本轮没有改它的字节。

同一次收尾里，`pnpm --dir apps/cli/packages/dynamic-workflow typecheck` 与 `lint` 退出码都是 0（lint 仍有 5 条既有 warning，不在本轮改动的文件里）。

## 九、计分口径（替换阶段）

与 `docs/knorvia-contracts-01-acceptance.md` 第 26 行同一口径（Lead 裁定，2026-10-12），接口路径换成本合同：

- **运行时/实现文件用普通模式**（行 + 结构）。门槛常量 **0.2 / 8 / 0.4 不改**。报告值取 `--old-rev origin/main` 与上游固定树两侧的最大值。
- **纯声明/桶文件用 `--declaration --interface specs/contracts/dynamic-workflow-01/interface.md`**。当「兼容面行数本身 ≥ 残留归一化行数的 20%」时，普通模式数学上不可达，该文件按第三步用声明模式计分。工具字段：`declaration-lines` = 被剔除行数，`residual-lines` = 残留归一化行数。
- `compiler/compile-types.ts` 只留五个公共接口（`CompileDiagnostic`、`CompileResult`、`ScriptLoc`、`WorkflowProgram`、`CreateWorkflowProgramOptions`），走声明模式。
- 运行时值 `defaultCompilerOptions`、`SCRIPT_FILE_NAME`、`WORKFLOW_FUNCTION_NAME` 在重写后的 `compiler/compile.ts` 里，走普通模式。`defaultCompilerOptions` 不导出。
- 本节只记录计分模式，不改行为，不覆盖 `gate-old.json`，也不改第八节的 v2 门禁数字。

## 十、v3 归档注释替换（K10）与第三次合同门

- 触发：K10——`apps/cli/packages/core/test/causality-order-strands-baseline.json` 顶层的 `declaration` 字段注释换成 Knorvia 自写文字，`declarationSha256` 刷新为 `5edfa5fac5025be49f658eebfb445c1a6d37da52f3b05af9ecf6cc89cc791e18`（= 当前 `dist/analysis/causality-order-strands.d.ts` 全文 sha256）。同文件 `compiled` 历史行为 oracle 未改，测试断言与实现源码未动。
- 签名等价证据：`/workspace/ktools/strip-compare.mjs`（TypeScript scanner 逐 token 去注释后按字节比对，typescript 6.0.2），比对对象是**替换前的归档**与重写后的 built `.d.ts`——归档 raw=4639B、built raw=3962B，去注释后两侧同为 1364B、sha256 同为 `269c70659d120c96e17b3a2e0b3b709bd8c57a8bb9f67a22968ec544663e56dd`，`RESULT: IDENTICAL (byte-for-byte after comment removal)`。
- 命令：与第八节同一条（`node scripts/contract-gate.mjs --contract specs/contracts/dynamic-workflow-01 --tests "*.test.mjs" --dist-env KNORVIA_DW01_ENTRY=dist --json <合同目录以外的路径>`），不带桩替换参数。
- 实测提交：`d0ce5d0f`（K10 的 re-pin 已提交；本节在其后写入）。Node v24.14.0。`generatedAt` `2026-10-18T10:33:44.854Z`。报告 `/workspace/ktools/dw01-gate-v3-final.json`。dist 前置：`pnpm --dir apps/cli/packages/dynamic-workflow build`（退出码 0）。

| 入口 | tests | pass | fail | skipped | todo | exit |
| ---- | ----: | ---: | ---: | ------: | ---: | ---: |
| 源码 |    39 |   39 |    0 |       0 |    0 |    0 |
| dist |    39 |   39 |    0 |       0 |    0 |    0 |

- `pass: true`。`stubReplacement: null`。
- 源码末尾：`ℹ tests 39` / `ℹ pass 39` / `ℹ fail 0` / `ℹ skipped 0` / `ℹ duration_ms 34431.080856`
- dist 末尾：`ℹ tests 39` / `ℹ pass 39` / `ℹ fail 0` / `ℹ skipped 0` / `ℹ duration_ms 16678.342219`
- `gate-old.json` 仍是 v1 旧实现记录，本轮没有改它的字节；第八节的 v2 数字原样保留，本节只做第三次重跑。
- 合同文档里只有 `interface.md` 被测试读取（`tests/surface.test.mjs` 的 B20），v3 没有改它，所以本节的数字对提交后的树同样成立。
