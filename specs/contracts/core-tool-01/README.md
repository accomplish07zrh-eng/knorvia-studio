# core-tool-01 合同（v2）

版本 **v2**（2026-10-15）。v2 = v1（2026-10-11，试点 2 / M0-13，issue #95）按 Lead 裁决 C（2026-10-14，issue #148 评论）的收尾修订：**删除 `stubs/`，B88 的 oracle 从 `stubs/<路径>` 改指 `interface.md` 各节的 ```ts 导出声明块**；断言方向与强度逐字不变（源码导出名 ⊆ 合同声明，`assert.deepEqual(missing, [])`），其余 80 例断言不动、不删、不跳过。`apps/cli/packages/core/src/tool`（直接子文件）+ `apps/cli/packages/core/src/tool/executor/` 的替换合同。计划书「每包流程」第二步的产物。

- v2 另含两处配套修订：① `interface.md` 6 行常量简写（`NAME = 值;`）改回逐字源码形式 `export const NAME = 值;`（与本文件「逐字取自源码」的口径一致，旧实现 6ea4cbe7 逐行核对）；② 按 core-hooks v1.1 先例对旧实现重跑更新后的旧门并刷新 `gate-old.json` / `acceptance.md`（复跑记录见两者）。
- 分支：`replace/core-tool-01`（PR #153；v1 合同原分支 `contract/core-tool-01`，检出点 `6ea4cbe7`）
- 状态：**合同完成（v2）**。旧门 v2 复跑：源码入口 81/81、dist 入口 81/81，预登记差异 0 条（`gate-old.json`）。

## 范围与边界

**在范围**（重写与删除范围 = `licensing/current-files.json` 里分类为继承的 32 个文件）：

- `apps/cli/packages/core/src/tool/*.ts`（直接子文件）：`bash-timeout-policy.ts`、`compat.ts`、`diff.ts`、`edit-match-distance.ts`、`edit-match-text.ts`、`edit-matchers.ts`、`executor.ts`、`index.ts`、`model-contract.ts`、`path-normalization.ts`、`path-policy.ts`、`provider-visible-order.ts`、`read-file-state-metadata.ts`、`read-file-state.ts`、`tool-visibility.ts`、`types.ts`、`webfetch-preapproved.ts`
- `apps/cli/packages/core/src/tool/executor/`：`impl.ts`、`types.ts`、`events.ts`、`telemetry.ts`、`turn-control.ts`、`model-status-sink.ts`、`memory-file-permission.ts`、`background-tasks.ts`、`background-task-registry.ts`、`background-task-output.ts`、`background-tracker-notification.ts`、`background-tracker-projection.ts`、`utils.ts`、`workflow-artifact.ts`、`workflow-published-artifacts.ts`

合计 **32 文件 / 3,914 行**（继承口径）。同目录另有 66 文件 / 4,860 行已登记 `independent-replacement`，属已有独立实现，本包**不动**，**包括它们的既有缺陷**（AGENTS.md「不重复改已独立候选」；`known-differences.md` 已按这个口径写明 `timeout.ts` 同步 throw、`batch-runner` 的 offPeakTurn 不补偿）。

**不在范围的相邻文件**（不要在本包里改）：`tool/handlers/**`（归 `core-tool-handlers-01/02`，继承 148 文件，选包时必须重切）、`tool/registry/**`、`tool/repl/**`、`tool/scheduler/**`、`tool/schema-validation/**`、`tool/validation-display/**`、`tool/validation-issues/**`，以及 `tool/registry.ts`、`tool/scheduler.ts`、`tool/input-normalization.ts`、`tool/input-validation-model-content.ts`、`tool/json-schema.ts`、`tool/runtime-schema.ts`、`tool/tool-input-validation-issues.ts`、`tool/result-persistence-format.ts`、`tool/executor/{call-runner,batch-runner,permission-*,hook-*,invocation/**,display/**,result/**,approval/**,batches/**,deadline/**,workflow-display/**}.ts`（这些已是 `independent-replacement`）。

**数字来源**：计划书分包总表写 core-tool-01「28 文件 / 3,147 行」，是 main `1ac688f7` 时的继承口径；当前实测继承 32 文件 / 3,914 行（Lead 独立复核 32 / 3,882，差异只在行数计法）。按默认裁决表「单包不超过 60 个文件」，32 ≤ 60，不需要拆包。

## 完成度

| 产物                                                                                                                | 状态                                                                                                    |
| ------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------- |
| 选包与边界（继承 32 文件 / 3,914 行；66 个已登记 `independent-replacement` 不在范围）                               | 完成                                                                                                    |
| `interface.md`（32 文件、134 个导出声明，逐字取自源码）                                                             | 完成                                                                                                    |
| `stubs/`（32 个模块路径的最小桩，签名齐全、函数体抛 `Error("not implemented: core-tool-01")`，语法校验 32/32 通过） | v1 完成 → **v2 已删除**（裁决 C；桩替换后契约 0/9 通过的证据留存 `gate-old.json` 的 `stubReplacement`） |
| `behavior.md`（B1–B88，逐条含输入/输出/错误/时序/幂等/资源释放/平台差异/状态所有者/日志级别/可测断言）              | 完成                                                                                                    |
| `tests/`（81 例，两个入口各 81/81；条 → 测试对照见文末）                                                            | 完成                                                                                                    |
| dist 入口旧门（`dist-entry-loader.mjs` + `pnpm build:cli-packages`）                                                | 完成                                                                                                    |
| `callers.md`（覆盖 `pnpm dep:refs` 的全部结果：32 文件、184 个导出名、228 个外部调用方）                            | 完成                                                                                                    |
| `known-differences.md`（K1–K3，每条都有对应用例）                                                                   | 完成                                                                                                    |
| `acceptance.md` / `gate-old.json`                                                                                   | 完成                                                                                                    |
| `fixtures/`（3 份夹具，由 `tests/fixtures.test.ts` 实际读取）                                                       | 完成                                                                                                    |
| `licensing/reviews.json` 登记合同文件、`knip.json` 根 `entry`                                                       | 完成                                                                                                    |

## 合同文件

- `behavior.md`：行为条目 B1–B88。
- `interface.md`：32 文件的模块路径与导出签名（逐字自源码提取）。
- `callers.md`：调用方与 `dep:refs` 结果。
- `known-differences.md`：既存差异与既有缺陷。
- `stubs/`：32 个最小桩（只含签名）。**v2 已删除**（裁决 C：桩是合同阶段脚手架，「桩=接口派生快照」的检查证据留存 `gate-old.json` 的 `stubReplacement`）。
- `tests/`：81 例契约测试；`fixtures/`：夹具。
- `acceptance.md`、`gate-old.json`：验收与旧门结果。
- `dist-entry-loader.mjs`：dist 入口的解析钩子（同一份测试跑两个入口）。

## 运行契约测试（两个入口）

```text
# 前置：Node 24.14.0（mise.toml 固定版本）
$env:TSX_TSCONFIG_PATH = "<repo>/packages/ui/tsconfig.json"
$env:KNORVIA_ENV = "test"

# 源码入口
node <node24> --import tsx --test specs/contracts/core-tool-01/tests/*.test.ts

# dist 入口（先 pnpm build:cli-packages）
node <node24> --import tsx --import ./specs/contracts/core-tool-01/dist-entry-loader.mjs `
  --test specs/contracts/core-tool-01/tests/*.test.ts
```

当前结果（旧实现，v2 旧门复跑 2026-10-15）：源码入口 81/81、dist 入口 81/81，预登记差异 0 条。

各测试文件覆盖的条目：

- `pure.test.ts`（50 例）：B16–B18、B21–B58、B68–B78、B85、B86
- `executor.test.ts`（21 例）：B1、B3、B5–B15、B60–B63、B65、B67、B70、B71、B79–B84、B87、B88
- `misc.test.ts`（4 例）：B4、B19、B20、B59
- `deps-and-timers.test.ts`（3 例）：B2、B64、B66（假定时器驱动，不用 sleep）
- `fixtures.test.ts`（3 例）：夹具驱动的 B36、B49/B50、B64/B65

## 注意事项

1. **桩的 lint 告警：已随桩删除消失。** v1 合同阶段 `pnpm lint` 退出码 0、206 条 warning 全部来自 `specs/contracts/core-tool-01/stubs/**`（只含签名的桩必然产生未使用导入/参数）；v2 删桩后这批 warning 不复存在，lint 仍然退出码 0。没有改任何 lint 配置、没有加免检注释。
2. **K1 不要顺手改。** `normalizeToolPathForComparison` 的显式非宿主平台结果随宿主 `path.normalize` 变化（`known-differences.md` K1，用例在 B43）。重写时**不得**把它改成 `path.posix.normalize`——那会改变现有行为。
3. **时序类断言用事件序列，不用 sleep。** B60–B67 的轮询、去重、最长运行定时器都由 `node:test` 的假定时器驱动（`deps-and-timers.test.ts`）。
4. **不动的文件。** 66 个 `independent-replacement` 文件及其既有缺陷不在本包补偿范围；`callers.md` 里从这些文件进来的调用关系只要求模块路径与导出名保持可用。
5. **桩覆盖验证已做并留证（历史项）**：v1 阶段用 `stubs/` 覆盖 32 个文件后契约测试 0/9 通过、失败原因全是 `not implemented: core-tool-01`（常量桩在求值时抛错，测试文件在导入阶段中止），实测记录在 `gate-old.json` 的 `stubReplacement`。v2 按裁决 C 删桩，该验证不再可复跑，仅作留证。

## 条目 → 测试对照表

| 条目    | 测试                                                                                                                                                                  | 状态 |
| ------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---- |
| B1      | `executor.test.ts`「B1/B3 createToolExecutor builds an executor that exposes the four entry points」                                                                  | 通过 |
| B2      | `deps-and-timers.test.ts`「B2 executor deps resolve the documented default fallback chain」                                                                           | 通过 |
| B3      | `executor.test.ts`「B1/B3 createToolExecutor builds an executor that exposes the four entry points」                                                                  | 通过 |
| B4      | `misc.test.ts`「B4 trackExternalBackgroundTask shares the submit path tracker」                                                                                       | 通过 |
| B5      | `executor.test.ts`「B5 ToolCallStarted omits optional keys instead of writing undefined」                                                                             | 通过 |
| B6–B7   | `executor.test.ts`「B6/B7 ToolCallResult and error payloads keep references and order」                                                                               | 通过 |
| B8–B9   | `executor.test.ts`「B8/B9 permission events carry defaults, capability bit and modifiedInput」                                                                        | 通过 |
| B10     | `executor.test.ts`「B10 automation create limit stops the turn only for CronCreate failures」                                                                         | 通过 |
| B11     | `executor.test.ts`「B11 plan exit denial splits feedback from stop-turn」                                                                                             | 通过 |
| B12     | `executor.test.ts`「B12 workflow refine denial only adds follow-up input」                                                                                            | 通过 |
| B13     | `executor.test.ts`「B13 terminal tool stop requires a strict metadata flag」                                                                                          | 通过 |
| B14     | `executor.test.ts`「B14 telemetry wrapper finishes the span on the right outcome」                                                                                    | 通过 |
| B15     | `executor.test.ts`「B15 default model status sink never overrides a caller sink」                                                                                     | 通过 |
| B16     | `pure.test.ts`「B16 isRecord rejects null and arrays」                                                                                                                | 通过 |
| B17     | `pure.test.ts`「B17 summarizeInput shapes each input kind」                                                                                                           | 通过 |
| B18     | `pure.test.ts`「B18 previewHookValue truncates and falls back」                                                                                                       | 通过 |
| B19     | `misc.test.ts`「B19 targetsMemoryFile only for Write/Edit with an in-root .md path」                                                                                  | 通过 |
| B20     | `misc.test.ts`「B20 applyMemoryFilePermission rewrites only an overridable decision」                                                                                 | 通过 |
| B21     | `pure.test.ts`「B21 buildWorkflowReportsNotificationSection charges a byte budget」                                                                                   | 通过 |
| B22     | `pure.test.ts`「B22 buildWorkflowReportsManifestSection caps at eight entries」                                                                                       | 通过 |
| B23     | `pure.test.ts`「B23 backgroundTaskOutputMetadata resolves field precedence」                                                                                          | 通过 |
| B24     | `pure.test.ts`「B24 resolveBashTimeoutPolicy reads positive integers and falls back」                                                                                 | 通过 |
| B25     | `pure.test.ts`「B25 resolveBashTimeoutMs clamps and treats 0/NaN as absent」                                                                                          | 通过 |
| B26     | `pure.test.ts`「B26 isSubagentDispatchToolName covers Agent and Task only」                                                                                           | 通过 |
| B27     | `pure.test.ts`「B27 hookMatcherToolNamesForTool returns fresh alias arrays」                                                                                          | 通过 |
| B28     | `pure.test.ts`「B28 createStructuredPatch yields hunks with three context lines」                                                                                     | 通过 |
| B29     | `pure.test.ts`「B29 countPatchLines counts only +/- prefixed lines」                                                                                                  | 通过 |
| B30     | `pure.test.ts`「B30 editLineDistance is exact UTF-16 distance」                                                                                                       | 通过 |
| B31     | `pure.test.ts`「B31 plainQuotes folds curly quotes」                                                                                                                  | 通过 |
| B32     | `pure.test.ts`「B32 stripReadNumbers requires every line to carry a prefix」                                                                                          | 通过 |
| B33     | `pure.test.ts`「B33 visibleCharacters expands escapes and keeps the original reference otherwise (K3)」                                                               | 通过 |
| B34     | `pure.test.ts`「B34 unicodeCharacters expands only 4-hex \u escapes (K3)」                                                                                            | 通过 |
| B35     | `pure.test.ts`「B35 restoreQuotes restores curly quote style from the matched text」                                                                                  | 通过 |
| B36     | `pure.test.ts`「B36 findEditMatch strategy order and short circuits」                                                                                                 | 通过 |
| B37     | `pure.test.ts`「B37 normalizeLineEndings folds CRLF only」                                                                                                            | 通过 |
| B38     | `pure.test.ts`「B38 normalizeReplacementForMatch normalizes only the escape strategy」                                                                                | 通过 |
| B39     | `pure.test.ts`「B39 preserveQuoteStyle returns the replacement when nothing was normalized」                                                                          | 通过 |
| B40     | `pure.test.ts`「B40 resolveToolEntryModelContract projects only provided fields」                                                                                     | 通过 |
| B41     | `pure.test.ts`「B41 projectToolModelContract returns the original contract when nothing projects」                                                                    | 通过 |
| B42     | `pure.test.ts`「B42 getToolPathApi maps win32 and everything else」                                                                                                   | 通过 |
| B43     | `pure.test.ts`「B43 normalizeToolPathForComparison normalizes per platform (K1)」                                                                                     | 通过 |
| B44     | `pure.test.ts`「B44 resolveWorkspacePath validates directories and joins relative paths」                                                                             | 通过 |
| B45     | `pure.test.ts`「B45 resolveToolWorkingDirectory falls back to workingDirectory」                                                                                      | 通过 |
| B46     | `pure.test.ts`「B46 orderProviderVisibleToolContracts sorts the reference set first (K2)」                                                                            | 通过 |
| B47     | `pure.test.ts`「B47 createReadFileStateKey defaults offset to 1」                                                                                                     | 通过 |
| B48     | `pure.test.ts`「B48 normalizeReadFileStateMtimeMs floors」                                                                                                            | 通过 |
| B49     | `pure.test.ts`「B49 findLatestReadFileState picks the newest matching entry」                                                                                         | 通过 |
| B50     | `pure.test.ts`「B50 findEditableReadFileState mirrors findLatestReadFileState」                                                                                       | 通过 |
| B51     | `pure.test.ts`「B51 parseReadFileStateMetadata projects exactly eleven fields」                                                                                       | 通过 |
| B52     | `pure.test.ts`「B52 createReadFileStateMetadataFromEntry refuses to invent freshness」                                                                                | 通过 |
| B53     | `pure.test.ts`「B53 createReadFileStateMetadata gated on Read and output shape」                                                                                      | 通过 |
| B54     | `pure.test.ts`「B54 normalizeToolNameAlias maps web_search」                                                                                                          | 通过 |
| B55     | `pure.test.ts`「B55 createToolRuleNameSet trims and strips parameter lists」                                                                                          | 通过 |
| B56     | `pure.test.ts`「B56 isToolNameDisallowed honours the alias」                                                                                                          | 通过 |
| B57     | `pure.test.ts`「B57 filterDisallowedToolNames keeps the original array when there is no rule」                                                                        | 通过 |
| B58     | `pure.test.ts`「B58 isWebFetchPreapprovedUrl checks hosts and path prefixes」                                                                                         | 通过 |
| B59     | `misc.test.ts`「B59 the package entry keeps the documented re-export surface」                                                                                        | 通过 |
| B60–B61 | `executor.test.ts`「B60/B61 tracker filters and dedupes task ids」                                                                                                    | 通过 |
| B62     | `executor.test.ts`「B62 tracker rolls back when the started event fails」                                                                                             | 通过 |
| B63     | `executor.test.ts`「B63/B65 tracker reaches a terminal state through the snapshot poll」                                                                              | 通过 |
| B64     | `deps-and-timers.test.ts`「B64 poll publishes running once per signature and survives read errors」                                                                   | 通过 |
| B65     | `executor.test.ts`「B63/B65 tracker reaches a terminal state through the snapshot poll」                                                                              | 通过 |
| B66     | `deps-and-timers.test.ts`「B66 subagent background Bash arms and clears the max-runtime cancel」                                                                      | 通过 |
| B67     | `executor.test.ts`「B67 tracker keeps polling when the waiter rejects but a snapshot source exists」                                                                  | 通过 |
| B68–B69 | `pure.test.ts`「B68/B69 published artifact lines and primary ordering」                                                                                               | 通过 |
| B70     | `pure.test.ts`「B70 buildWorkflowArtifactsNotificationSection reports real totals + executor.test.ts: B70/B71 constants stay at the documented bounds」               | 通过 |
| B71     | `pure.test.ts`「B71 buildWorkflowArtifactsManifestSection drops bad rows and reports truncation + executor.test.ts: B70/B71 constants stay at the documented bounds」 | 通过 |
| B72     | `pure.test.ts`「B72 toPublishedArtifactSummaries defends against malformed input」                                                                                    | 通过 |
| B73     | `pure.test.ts`「B73 isDynamicWorkflowRunDispatchToolName excludes legacy Workflow」                                                                                   | 通过 |
| B74     | `pure.test.ts`「B74 tool name maps to the documented runtime task type」                                                                                              | 通过 |
| B75–B78 | `pure.test.ts`「B75/B76/B77/B78 registry lifecycle through the public helpers」                                                                                       | 通过 |
| B79     | `executor.test.ts`「B79 hasSnapshotProvider/hasDirectWaiter resolve per tool name」                                                                                   | 通过 |
| B80–B82 | `executor.test.ts`「B80/B81/B82 projection helpers keep the documented semantics」                                                                                    | 通过 |
| B83     | `executor.test.ts`「B83 taskPayload projects kind, cancellable and terminalId」                                                                                       | 通过 |
| B84     | `executor.test.ts`「B84 emitBackgroundTaskEvent forwards type, payload reference and trace」                                                                          | 通过 |
| B85     | `pure.test.ts`「B85 enqueue gates and releases the claim on failure」                                                                                                 | 通过 |
| B86     | `pure.test.ts`「B86 only Workflow/Bash family produce notification text」                                                                                             | 通过 |
| B87     | `executor.test.ts`「B87 workflow manifest bounds result, error and duration」                                                                                         | 通过 |
| B88     | `executor.test.ts`「B88 interface.md export declarations cover the source exports」                                                                                   | 通过 |

共 88 条行为、79 行对照，每行都有对应用例（无空行）。
