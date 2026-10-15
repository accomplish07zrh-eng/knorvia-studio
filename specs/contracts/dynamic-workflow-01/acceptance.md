# dynamic-workflow-01 验收记录（acceptance.md）

v1 · 2026-10-15 · 分支 `contract/dynamic-workflow-01` · 旧门提交 `b87ee190`（`origin/main@95426e41` 并入后的树）

## 一、范围

- 在范围：`apps/cli/packages/dynamic-workflow/src/analysis/*.ts`（54）+ `src/compiler/compile.ts`（1）= **55 继承文件 / 12,882 行**。
- 继承分类：upstream-unchanged 20 + upstream-modified 33 = **53 个重写目标**；另有 2 个 unreviewed（`operators.ts`、`placeholder-resolution.ts`）不重写不删。≤60 不拆包。
- 选包收尾：`knip -W @knorvia/dynamic-workflow --include=exports,…` 空输出；`ParamActuals` 已删（`ded99450`）；`pnpm dep:refs --list-exports` 55/55 跑通（315 行声明导出）。

## 二、旧门结果（scripts/contract-gate.mjs）

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

## 四、桩替换验证

- `stubs/build-stubs.mjs` 生成 55 个 import-即抛桩 + `targets.txt`（55 行）。
- 旧门 `--stub-root`/`--stub-targets` 替换后源码入口 3 个测试文件全失败（pass=0）→ `allFail=true`，证明契约测试确实测到公开行为。

## 五、预登记差异（known-differences.md K1–K8）

每条都有对应测试或语料：

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
- **core 夹具 sha256 pin**：替换阶段的范围化 re-pin 作业（GATE-PLAYBOOK D 节），本阶段不动。
- **mermaid 渲染器的逐字节 golden**：mermaid 输出由图决定，图本身已被六个投影逐字节钉住；mermaid 只测非空 + 确定性（B13）。
- **SNIPPET_FACADE_DTS 的编译行为**：eval-workflow-snippet 的片段编译走 `createWorkflowProgram({facadeDts})`，其行为差异由 dynamic-workflow-02 的调用方测试覆盖；本包只守 `SNIPPET_FACADE_DTS` 常量内容（B1）。
