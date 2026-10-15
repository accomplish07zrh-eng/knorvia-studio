# dynamic-workflow-01 调用方（callers.md）

v1。目的：重写时不得破坏这些调用方依赖的模块路径、导出名与签名。逐文件原始清单见机器生成的 [`callers-raw.txt`](callers-raw.txt)（`tests/scan-callers.mjs` 输出）。

## 扫描口径

- 本包 **283 个导出 × 全仓规模**的符号级 `findReferences`（dep:refs 同款逻辑）在本机内存溢出（V8 OOM，见 `acceptance.md`）。因此 callers.md 用两层扫描覆盖 import 面：
  1. **语法级 import 扫描**（`tests/scan-callers.mjs`）：全仓 7,493 个源文件的 `import` / `export … from` / 动态 `import()` 说明符，聚合出「谁以哪个说明符导入了哪些名字」。这层覆盖全部静态可见的调用方（与 dep:refs 的说明符发现等价，只是不做符号解析回溯）。
  2. **字符串路径扫描**：core 测试夹具用 `new URL("src/analysis/…")` 形式的字符串动态 import 深层模块（dep:refs 与语法扫描都看不到），单独列出。
- 与 `pnpm dep:refs` 已跑通的结论核对：`--list-exports` 对本包 55 个文件逐个跑通（315 行声明导出，含类型；运行时导出 283）；`--list-exports` 与本扫描的导出名集合一致。

## 兼容面总结（重写必须保住的三类调用方）

| 类别                                               | 调用方数量 | 依赖的兼容面                                                                                                                                                                                       |
| -------------------------------------------------- | ---------: | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| A. 包外经公开入口 import 分析符号                  |          8 | `@knorvia/dynamic-workflow` 与 `@knorvia/dynamic-workflow/projections` 的**分析相关**导出（见下表）                                                                                                |
| B. 包内跨目录（index/projections/lowering/schema） |          5 | `analysis/*` 与 `compiler/compile` 的相对模块路径 + 具名导出                                                                                                                                       |
| C. core 测试夹具按**字符串路径**动态 import        |          5 | `src/analysis/{analyze,phase-graph,causality-reduce,causality-order-settle,causality-order-strands,causality-graph-lanes,fanout-cardinality,core,mermaid}` 与 `src/compiler/compile.ts` 的模块路径 |

> 包外经入口 import 的其余 47 个文件全部只用 **engine / facade / schema / lowering** 的符号（`WorkflowEngine`、`JournalStorePort`、`RunRecord` 等），属 dynamic-workflow-02 范围，不在本包合同内；它们经由同一个入口桶导入，入口桶本身（`src/index.ts`、`src/projections.ts`）也不是本包重写范围——本包只保证入口桶**再导出的分析符号**原样可用。

## A. 包外调用方（分析相关，8 个文件）

| 调用方                                                                        | 说明符                                  | 引用的分析符号                                                                                            |
| ----------------------------------------------------------------------------- | --------------------------------------- | --------------------------------------------------------------------------------------------------------- |
| `apps/cli/packages/core/src/tool/handlers/workflow-script-analysis.ts`        | 根入口                                  | `analyzeWorkflowScript`、`AnalyzeResult`                                                                  |
| `apps/cli/packages/core/src/tool/handlers/workflow-analysis-display.ts`       | 根入口                                  | `AnalyzeResult`                                                                                           |
| `apps/cli/packages/core/src/tool/handlers/eval-workflow-snippet.ts`           | 根入口                                  | `createWorkflowProgram`、`collectDiagnostics`、`collectSites`、`collectWorldRunCommands`                  |
| `apps/cli/packages/core/src/tool/handlers/create-workflow-graph-bounds.ts`    | `@knorvia/dynamic-workflow/projections` | `CausalityGraph`、`ControlFlowGraph`、`HandoffGraph`、`FLOW_ENTRY`、`FLOW_SINK`、`FLOW_ABORT`、`UNPHASED` |
| `apps/cli/packages/core/src/tool/handlers/create-workflow-graph-fold.ts`      | `@knorvia/dynamic-workflow/projections` | `reduceOrdering`、`ReducibleEdge`                                                                         |
| `apps/cli/packages/core/test/causality-reduction.test.ts`（字符串路径，见 C） | `src/analysis/*`                        | `analyze`、`phase-graph`、`causality-reduce` 的导出                                                       |
| `apps/cli/packages/core/test/create-workflow-graph-fold-fixture.ts`           | `@knorvia/dynamic-workflow/projections` | `reduceOrdering`（经 data: URL 注入历史实现做对照）                                                       |
| `apps/cli/packages/bootstrap/src/protocol/saved-workflows.ts`                 | 根入口                                  | （仅类型；经入口桶，不直接触及分析模块）                                                                  |

`create-workflow-description.ts` / `save-workflow-description.ts` / `eval-workflow-snippet-description.ts` 只引用 `FACADE_DTS` / `SNIPPET_FACADE_DTS`（facade 目录，不在本包范围）。

## B. 包内跨目录调用方（5 个文件）

- `src/index.ts`（根桶，不重写）→ 再导出 17 个分析/编译模块的符号（完整清单见 `callers-raw.txt`）。
- `src/projections.ts`（projections 桶，不重写）→ 再导出 14 个分析模块的符号（浏览器安全子集）。
- `src/lowering/lower.ts`（dynamic-workflow-02 范围）→ `../analysis/sites.js`（`collectSites`、`SiteTable`、`isFacadeDeclared`、`resolveSymbol`）、`../analysis/facade-misuse.js`（`collectFacadeMisuse`）、`../compiler/compile.js`（`createWorkflowProgram`、`collectDiagnostics`、`WorkflowProgram`、`CompileDiagnostic`、`WORKFLOW_FUNCTION_NAME`）。
- `src/schema/synthesize.ts`（dynamic-workflow-02 范围）→ `../analysis/sites.js`（`collectSites`、`SiteTable`）、`../compiler/compile.js`（`createWorkflowProgram`、`collectDiagnostics`、`WorkflowProgram`、`CompileDiagnostic`）。
- `src/schema/actor-submit-profiles.ts`（dynamic-workflow-02 范围）→ `../analysis/sites.js`（`SiteTable`）、`../analysis/graph.js`（`projectSiteGraph`）、`../analysis/interpret.js`（`interpret`）、`../analysis/types.js`（`SiteGraph`）、`../compiler/compile.js`（`WorkflowProgram`）。

> 注意：`lowering` 与 `schema` 是本包**之外**的文件（dynamic-workflow-02），它们 import 本包模块的**具体路径与导出名**——这些相对路径（如 `../analysis/sites.js`）是兼容面的一部分，重写后必须原样存在。

## C. 字符串路径动态 import（5 个 core 测试夹具 + 1 个证明脚本）

以下文件用 `new URL("src/analysis/…")` / `new URL("dist/analysis/…")` 字符串拼出模块路径再动态 import（静态扫描不可见，按文件人工核对列出）：

| 文件                                                                | 字符串路径                                                                                                 |
| ------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| `apps/cli/packages/core/test/causality-reduction-fixture.ts`        | `analysis/causality-reduce`、`analysis/analyze`、`analysis/phase-graph`、`projections`                     |
| `apps/cli/packages/core/test/fanout-cardinality-fixture.ts`         | `analysis/fanout-cardinality`、`compiler/compile`、`analysis/analyze`、`analysis/core`、`analysis/mermaid` |
| `apps/cli/packages/core/test/may-set-lane-expansion-fixture.ts`     | `analysis/causality-graph-lanes`、`analysis/analyze`、`projections`                                        |
| `apps/cli/packages/core/test/causality-order-settlement-fixture.ts` | `analysis/causality-order-settle`、`analysis/analyze`、`projections`                                       |
| `apps/cli/packages/core/test/causality-order-strands-fixture.ts`    | `analysis/causality-order-strands`、`analysis/analyze`、`projections`                                      |
| `docs/evidence/knorvia-cli-graph-loader-check-20261001.mjs`         | 构建产物 `dist/analysis/*`（证据脚本，只读）                                                               |

这些夹具还 pin 了 `src/analysis/*` 与 `dist/analysis/*` 的 sha256（`causality-reduction-current.json` 等）——**重写阶段替换这些文件时必须同步 re-pin（范围化，见 GATE-PLAYBOOK D 节）**，本合同阶段不动它们。

## 扫描结果计数

- 全仓扫描源文件：7,493（跳过 node_modules/dist/build/coverage/out/.git/third-party）。
- 包外经入口导入的文件：55（其中分析相关 8，其余属 dynamic-workflow-02 的 engine/facade 面）。
- 包内跨目录调用方：5。
- 字符串路径调用方：6（5 夹具 + 1 证据脚本）。
- `pnpm dep:refs --list-exports`：55/55 文件跑通，315 行声明导出（含纯类型）。
