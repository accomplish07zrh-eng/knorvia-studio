# core-tool-01 合同（v1，**未完成，草稿**）

`apps/cli/packages/core/src/tool`（直接子文件）+ `apps/cli/packages/core/src/tool/executor/` 的替换合同。计划书「每包流程」第二步的产物；试点 2（M0-13）。

- 分支：`contract/core-tool-01`（从 `origin/main` @ `6ea4cbe7` 检出）
- 状态：**草稿**。见下方「完成度」，未完成的部分在 PR 里逐条列出，不当作通过。

## 完成度（如实）

| 产物                                                                                                                | 状态                                                                                                                                                                                |
| ------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 选包与边界（继承 32 文件 / 3,914 行；66 个已登记 `independent-replacement` 不在范围）                               | 完成                                                                                                                                                                                |
| `interface.md`（32 文件、134 个导出声明，逐字取自源码）                                                             | 完成                                                                                                                                                                                |
| `stubs/`（32 个模块路径的最小桩，签名齐全、函数体抛 `Error("not implemented: core-tool-01")`，语法校验 32/32 通过） | 完成                                                                                                                                                                                |
| `behavior.md`（B1–B88，逐条含输入/输出/错误/时序/幂等/资源释放/平台差异/状态所有者/日志级别/可测断言）              | 完成                                                                                                                                                                                |
| `tests/`（条 → 测试对照见文末）                                                                                     | **部分**：`pure.test.ts` 49 例、`executor.test.ts` 21 例、`misc.test.ts` 4 例，共 **74 例在旧实现的源码入口上全部通过**；尚未覆盖 B2、B64、B66（前两者需要假定时器/内部 deps 观察） |
| dist 入口旧门                                                                                                       | **未跑**                                                                                                                                                                            |
| `callers.md`                                                                                                        | 完成（v1，覆盖入口与已知导入方）                                                                                                                                                    |
| `known-differences.md`                                                                                              | 完成（1 条既存平台差异 + 1 条既有缺陷）                                                                                                                                             |
| `acceptance.md` / `gate-old.json`                                                                                   | **未完成**                                                                                                                                                                          |
| `fixtures/`                                                                                                         | 空（现有测试自带内存替身，未单独抽夹具）                                                                                                                                            |
| `licensing/reviews.json` 登记合同文件、knip entry                                                                   | **未做**                                                                                                                                                                            |

## 范围与边界

**在范围**（重写与删除范围 = `licensing/current-files.json` 里分类为继承的 32 个文件）：

- `apps/cli/packages/core/src/tool/*.ts`（直接子文件）：`bash-timeout-policy.ts`、`compat.ts`、`diff.ts`、`edit-match-distance.ts`、`edit-match-text.ts`、`edit-matchers.ts`、`executor.ts`、`index.ts`、`model-contract.ts`、`path-normalization.ts`、`path-policy.ts`、`provider-visible-order.ts`、`read-file-state-metadata.ts`、`read-file-state.ts`、`tool-visibility.ts`、`types.ts`、`webfetch-preapproved.ts`
- `apps/cli/packages/core/src/tool/executor/`：`impl.ts`、`types.ts`、`events.ts`、`telemetry.ts`、`turn-control.ts`、`model-status-sink.ts`、`memory-file-permission.ts`、`background-tasks.ts`、`background-task-registry.ts`、`background-task-output.ts`、`background-tracker-notification.ts`、`background-tracker-projection.ts`、`utils.ts`、`workflow-artifact.ts`、`workflow-published-artifacts.ts`

合计 **32 文件 / 3,914 行**（继承口径；目录里还有 66 文件 / 4,860 行已登记 `independent-replacement`，属已有独立实现，本包**不动**，见 AGENTS.md「不重复改已独立候选」）。

**不在范围的相邻文件**（不要在本包里改）：`tool/handlers/**`（归 `core-tool-handlers-01/02`，继承 148 文件，选包时必须重切）、`tool/registry/**`、`tool/repl/**`、`tool/scheduler/**`、`tool/schema-validation/**`、`tool/validation-display/**`、`tool/validation-issues/**`，以及 `tool/registry.ts`、`tool/scheduler.ts`、`tool/input-normalization.ts`、`tool/input-validation-model-content.ts`、`tool/json-schema.ts`、`tool/runtime-schema.ts`、`tool/tool-input-validation-issues.ts`、`tool/result-persistence-format.ts`、`tool/read-file-state*.ts` 之外的 `tool/executor/{call-runner,batch-runner,permission-*,hook-*,invocation/**,display/**,result/**,approval/**,batches/**,deadline/**,workflow-display/**}.ts`（这些已是 `independent-replacement`）。

**数字来源**：计划书分包总表写 core-tool-01「28 文件 / 3,147 行」，是 main `1ac688f7` 时的**继承口径**；当前实测继承 32 文件 / 3,914 行（Lead 独立复核 32 / 3,882，差异只在行数计法）。按默认裁决表「单包不超过 60 个文件」，32 ≤ 60，不需要拆包。

## 合同文件

- `behavior.md`：行为条目 B1–B88。
- `interface.md`：32 文件的模块路径与导出签名（逐字自源码提取）。
- `callers.md`：入口与已有导入方。
- `known-differences.md`：既存差异与既有缺陷。
- `stubs/`：32 个最小桩（只含签名）。
- `tests/`：契约测试。
- `acceptance.md`、`fixtures/`、`gate-old.json`：待补。

## 运行契约测试（源码入口）

```text
# 与 scripts/test-studio.mjs 相同的调用方式（Node 24.14.0 + tsx）
$env:TSX_TSCONFIG_PATH = "<repo>/packages/ui/tsconfig.json"
$env:KNORVIA_ENV = "test"
node "D:/knorvia studio开发/toolchain/node-v24.14.0-win-x64/node.exe" --import tsx --test `
  specs/contracts/core-tool-01/tests/pure.test.ts
```

当前结果（源码入口，旧实现）：`pure.test.ts 49/49`、`executor.test.ts 21/21`、`misc.test.ts 4/4`，合计 **74 例全部通过**；`B1–B15、B19–B20、B59–B67、B79–B88` 已有用例，**尚未覆盖 B2、B64、B66**。dist 入口未跑。

各测试文件覆盖的条目：

- `pure.test.ts`：B16–B18、B21–B58、B68–B78、B85、B86
- `executor.test.ts`：B1、B3、B5–B15、B60–B63、B65、B67、B70、B71、B79–B84、B87、B88
- `misc.test.ts`：B4、B19、B20、B59

## 条目 → 测试对照表

| 条目    | 测试                                                                                      | 状态 |
| ------- | ----------------------------------------------------------------------------------------- | ---- |
| B1–B4   | —                                                                                         | 待补 |
| B5–B9   | —                                                                                         | 待补 |
| B10–B13 | —                                                                                         | 待补 |
| B14–B15 | —                                                                                         | 待补 |
| B16     | `pure.test.ts`「B16 isRecord rejects null and arrays」                                    | 通过 |
| B17     | 「B17 summarizeInput shapes each input kind」                                             | 通过 |
| B18     | 「B18 previewHookValue truncates and falls back」                                         | 通过 |
| B19–B20 | —                                                                                         | 待补 |
| B21     | 「B21 buildWorkflowReportsNotificationSection charges a byte budget」                     | 通过 |
| B22     | 「B22 buildWorkflowReportsManifestSection caps at eight entries」                         | 通过 |
| B23     | 「B23 backgroundTaskOutputMetadata resolves field precedence」                            | 通过 |
| B24     | 「B24 resolveBashTimeoutPolicy reads positive integers and falls back」                   | 通过 |
| B25     | 「B25 resolveBashTimeoutMs clamps and treats 0/NaN as absent」                            | 通过 |
| B26     | 「B26 isSubagentDispatchToolName covers Agent and Task only」                             | 通过 |
| B27     | 「B27 hookMatcherToolNamesForTool returns fresh alias arrays」                            | 通过 |
| B28     | 「B28 createStructuredPatch yields hunks with three context lines」                       | 通过 |
| B29     | 「B29 countPatchLines counts only +/- prefixed lines」                                    | 通过 |
| B30     | 「B30 editLineDistance is exact UTF-16 distance」                                         | 通过 |
| B31     | 「B31 plainQuotes folds curly quotes」                                                    | 通过 |
| B32     | 「B32 stripReadNumbers requires every line to carry a prefix」                            | 通过 |
| B33     | 「B33 visibleCharacters expands escapes and keeps the original reference otherwise」      | 通过 |
| B34     | 「B34 unicodeCharacters expands only 4-hex \u escapes」                                   | 通过 |
| B35     | 「B35 restoreQuotes restores curly quote style from the matched text」                    | 通过 |
| B36     | 「B36 findEditMatch strategy order and short circuits」                                   | 通过 |
| B37     | 「B37 normalizeLineEndings folds CRLF only」                                              | 通过 |
| B38     | 「B38 normalizeReplacementForMatch normalizes only the escape strategy」                  | 通过 |
| B39     | 「B39 preserveQuoteStyle returns the replacement when nothing was normalized」            | 通过 |
| B40     | 「B40 resolveToolEntryModelContract projects only provided fields」                       | 通过 |
| B41     | 「B41 projectToolModelContract returns the original contract when nothing projects」      | 通过 |
| B42     | 「B42 getToolPathApi maps win32 and everything else」                                     | 通过 |
| B43     | 「B43 normalizeToolPathForComparison normalizes per platform」（含 known-differences K1） | 通过 |
| B44     | 「B44 resolveWorkspacePath validates directories and joins relative paths」               | 通过 |
| B45     | 「B45 resolveToolWorkingDirectory falls back to workingDirectory」                        | 通过 |
| B46     | 「B46 orderProviderVisibleToolContracts sorts the reference set first」                   | 通过 |
| B47     | 「B47 createReadFileStateKey defaults offset to 1」                                       | 通过 |
| B48     | 「B48 normalizeReadFileStateMtimeMs floors」                                              | 通过 |
| B49     | 「B49 findLatestReadFileState picks the newest matching entry」                           | 通过 |
| B50     | 「B50 findEditableReadFileState mirrors findLatestReadFileState」                         | 通过 |
| B51     | 「B51 parseReadFileStateMetadata projects exactly eleven fields」                         | 通过 |
| B52     | 「B52 createReadFileStateMetadataFromEntry refuses to invent freshness」                  | 通过 |
| B53     | 「B53 createReadFileStateMetadata gated on Read and output shape」                        | 通过 |
| B54     | 「B54 normalizeToolNameAlias maps web_search」                                            | 通过 |
| B55     | 「B55 createToolRuleNameSet trims and strips parameter lists」                            | 通过 |
| B56     | 「B56 isToolNameDisallowed honours the alias」                                            | 通过 |
| B57     | 「B57 filterDisallowedToolNames keeps the original array when there is no rule」          | 通过 |
| B58     | 「B58 isWebFetchPreapprovedUrl checks hosts and path prefixes」                           | 通过 |
| B59     | —                                                                                         | 待补 |
| B60–B67 | —                                                                                         | 待补 |
| B68–B72 | 「B68/B69 published artifact lines and primary ordering」等 4 个用例                      | 通过 |
| B73     | 「B73 isDynamicWorkflowRunDispatchToolName excludes legacy Workflow」                     | 通过 |
| B74–B78 | 「B75/B76/B77/B78 registry lifecycle through the public helpers」                         | 通过 |
| B79–B84 | —                                                                                         | 待补 |
| B85     | 「B85 enqueue gates and releases the claim on failure」                                   | 通过 |
| B86     | 「B86 only Workflow/Bash family produce notification text」                               | 通过 |
| B87     | —                                                                                         | 待补 |
| B88     | 由脚本比对 `interface.md` 导出名集合与源码（尚未写）                                      | 待补 |
