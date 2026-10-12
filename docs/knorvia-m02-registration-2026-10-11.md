# M0-2 补登：1,130 个「只因替换字样被拦」的产品源码文件（2026-10-11）

主仓提交：`6ea4cbe7`（执行基线 `beff12b5`）　认领 issue：#96

依据《Knorvia 独立替换任务计划书》M0-2：「1,130 个只因『替换』字样被拦的代码文件补登；按首次加入的 345 个提交归入历史批次：有隔离作者与验收证据的登记 independent-replacement；其余按两道相似度实测，过门槛的登记 original，不过的并入对应替换包」。

## 1. 范围与分批

第一轮记账报告的交还清单里，「首次加入提交含替换字样」共 1130 个候选（路径不在 `docs/`、`specs/`、`licensing/` 下的产品源码），与计划书的 1,130 一致。按**首次加入提交**分批：

| 口径                                          | 数量              |
| --------------------------------------------- | ----------------- |
| 候选文件                                      | 1130              |
| 首次加入提交批次                              | 348               |
| 其中首批（7619e41）                           | 0                 |
| A 类：同提交冻结了作者包/证据                 | 19 批 / 53 文件   |
| B 类：与已登记 independent-replacement 同提交 | 1 批 / 78 文件    |
| C 类：无隔离证据，交两道门槛                  | 328 批 / 999 文件 |

计划书写「345 个提交」，实测 348（另 3 个是快照之后的漂移）；全部候选的首次加入都晚于首快照 `7619e41`，条件 1 通过。

## 2. 判定口径

- **A 类**（19 批 / 53 文件）：该提交同时冻结了 `docs/evidence/*-author-*` 或 `licensing/evidence/*` 作者包（每批 2–47 个作者包文件，逐批列出见下表），即计划书说的「有隔离作者与验收证据」→ 登记 `independent-replacement`。同时用两道门槛复测，全部通过（无一个超过门槛）。
- **B 类**（1 批 / 78 文件，提交 `805754fa` 2026-09-27）：只与已登记 independent-replacement 同提交，**不算隔离证据**；按默认裁决表「不确定 → 选更保守的做法」并入 C 类走门槛。
- **C 类**（999 文件）：两道门槛实测，过 → `original`；不过 → 并入对应替换包。

两道门槛（M0-8 工具，常量写死后不再调）：行门槛 = 规范化行数 ≥ 10 时包含率 < 0.20 且最长相同段 < 8 行、< 10 行时包含率必须为 0；结构门槛 = 结构相似度 < 0.40。

## 3. 结果

| 结果         | 文件数 | 处置                           |
| ------------ | ------ | ------------------------------ |
| A 类过门槛   | 53     | 登记 `independent-replacement` |
| B/C 类过门槛 | 1038   | 登记 `original`                |
| 未过门槛     | 39     | **并入对应替换包**（下表）     |

### 3.1 A 类批次与作者包证据（19 批）

| 提交     | 日期       | 候选文件 | 作者包文件 | 作者包示例                                                                    |
| -------- | ---------- | -------- | ---------- | ----------------------------------------------------------------------------- |
| 9f4c7403 | 2026-10-02 | 5        | 30         | `docs/evidence/runtime-control-only-turn-author-20261003/api.d.ts`            |
| 215a4fe2 | 2026-10-02 | 5        | 30         | `docs/evidence/runtime-plugin-reference-author-20261003/api.d.ts`             |
| c4512c4e | 2026-10-02 | 5        | 2          | `docs/evidence/graph-artifacts-author-20261002/api.d.ts`                      |
| 92470890 | 2026-10-03 | 4        | 8          | `docs/evidence/background-tracker-author-20261003/api.d.ts`                   |
| 15b41fc5 | 2026-10-03 | 4        | 14         | `docs/evidence/todo-resume-author-20261003/allocation.json`                   |
| ec9150ca | 2026-10-02 | 4        | 9          | `docs/evidence/runtime-rewind-author-20261003/api.json`                       |
| 0dcdc63a | 2026-10-02 | 4        | 2          | `docs/evidence/scheduler-state-author-20261002/api.d.ts`                      |
| f06acb95 | 2026-10-02 | 3        | 18         | `docs/evidence/runtime-bash-shell-snapshot-author-20261003/api.d.ts`          |
| f6e0efab | 2026-10-03 | 3        | 5          | `docs/evidence/turn-control-author-20261003/api.d.ts`                         |
| 58f2dc03 | 2026-10-02 | 3        | 47         | `licensing/evidence/shared-authority-settings-hook-owners-20261003/README.md` |
| 230a65df | 2026-10-02 | 2        | 20         | `docs/evidence/runtime-model-request-author-20261003/api.d.ts`                |
| 0cc11034 | 2026-10-02 | 2        | 7          | `docs/evidence/runtime-permission-owner-author-20261003/api.d.ts`             |
| 1d6647f8 | 2026-10-02 | 2        | 18         | `docs/evidence/subagent-profile-author-20261003/api.d.ts`                     |
| d13eab9f | 2026-10-03 | 2        | 5          | `docs/evidence/turn-machine-author-20261003/api.d.ts`                         |
| 8dd58404 | 2026-10-02 | 1        | 11         | `docs/evidence/runtime-turn-command-author-20261003/api.d.ts`                 |
| 312656a9 | 2026-10-02 | 1        | 9          | `docs/evidence/runtime-turn-model-step-author-20261003/api.d.ts`              |
| 5f4bb23b | 2026-10-02 | 1        | 2          | `docs/evidence/phase-runner-author-20261002/api.d.ts`                         |
| 08273a71 | 2026-10-02 | 1        | 2          | `docs/evidence/ready-order-author-20261002/contract.md`                       |
| b607bb8f | 2026-10-02 | 1        | 3          | `docs/evidence/runtime-context-author-20261002/api.d.ts`                      |

### 3.2 未过门槛的 39 个文件（并入替换包）

| 路径                                                                              | 行数 | 包含率 | 最长段 | 结构相似度 | 未过原因                                              | 归属包                                                                                                            |
| --------------------------------------------------------------------------------- | ---- | ------ | ------ | ---------- | ----------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| `apps/cli/packages/core/test/read-pdf-projection.test.ts`                         | 379  | 0.098  | 8      | 0.000      | longest identical run 8 >= 8                          | core-03                                                                                                           |
| `apps/cli/packages/cua-plugin/.knorvia-plugin/plugin.json`                        | 6    | 0.167  | 1      | 不适用     | containment 0.167 must be 0 below 10 normalized lines | 分包总表未单列（插件包）：选包时按依赖重切，≤60 文件，与 `apps-cli-packages-*` 同批并在分包总表补行               |
| `apps/cli/packages/cua-plugin/package.json`                                       | 8    | 0.375  | 2      | 不适用     | containment 0.375 must be 0 below 10 normalized lines | 分包总表未单列（插件包）：选包时按依赖重切，≤60 文件，与 `apps-cli-packages-*` 同批并在分包总表补行               |
| `examples/plugins/document-quality-check/.knorvia-plugin/plugin.json`             | 7    | 0.143  | 1      | 不适用     | containment 0.143 must be 0 below 10 normalized lines | 分包总表未单列（示例插件）：选包时随插件相关包处理并在分包总表补行                                                |
| `examples/plugins/material-organizer/.knorvia-plugin/plugin.json`                 | 7    | 0.143  | 1      | 不适用     | containment 0.143 must be 0 below 10 normalized lines | 分包总表未单列（示例插件）：选包时随插件相关包处理并在分包总表补行                                                |
| `examples/plugins/project-brief/.knorvia-plugin/plugin.json`                      | 7    | 0.143  | 1      | 不适用     | containment 0.143 must be 0 below 10 normalized lines | 分包总表未单列（示例插件）：选包时随插件相关包处理并在分包总表补行                                                |
| `examples/plugins/project-handoff/.knorvia-plugin/plugin.json`                    | 7    | 0.143  | 1      | 不适用     | containment 0.143 must be 0 below 10 normalized lines | 分包总表未单列（示例插件）：选包时随插件相关包处理并在分包总表补行                                                |
| `packages/cua/windows-artifact.d.ts`                                              | 8    | 0.375  | 1      | 0.000      | containment 0.375 must be 0 below 10 normalized lines | packages-01                                                                                                       |
| `packages/cua/windows-artifact.js`                                                | 11   | 0.000  | 0      | 0.500      | structural 0.500 >= 0.4                               | packages-01                                                                                                       |
| `packages/desktop/src/host/storageOwnerTestPorts.mjs`                             | 129  | 0.186  | 8      | 0.268      | longest identical run 8 >= 8                          | desktop-01 / `desktop-main-0*` / desktop-scheduler-01 / desktop-scripts-01（按分包总表路径切）                    |
| `packages/services/src/cli-provider-switch/cliProviderSwitch.ts`                  | 13   | 0.154  | 1      | 1.000      | structural 1.000 >= 0.4                               | services-01…04（其余子目录；分包总表该行范围被截断，选包时按 60 文件上限切）                                      |
| `packages/services/src/creation/creationRunDeadline.ts`                           | 5    | 0.200  | 1      | 0.000      | containment 0.200 must be 0 below 10 normalized lines | services-01…04（其余子目录；分包总表该行范围被截断，选包时按 60 文件上限切）                                      |
| `packages/services/src/plugins/INDEX-SPEC-20261002.md`                            | 6    | 0.333  | 1      | 不适用     | containment 0.333 must be 0 below 10 normalized lines | services-02                                                                                                       |
| `packages/services/src/studio-runtime/domain/attentionVersion.ts`                 | 9    | 0.111  | 1      | 0.000      | containment 0.111 must be 0 below 10 normalized lines | services-01…04（其余子目录；分包总表该行范围被截断，选包时按 60 文件上限切）                                      |
| `packages/services/src/window-controller/node.ts`                                 | 8    | 0.250  | 1      | 0.000      | containment 0.250 must be 0 below 10 normalized lines | services-01…04（其余子目录；分包总表该行范围被截断，选包时按 60 文件上限切）                                      |
| `packages/services/test/fixtures/ignore-fake-port-20261002.js`                    | 9    | 0.222  | 1      | 0.000      | containment 0.222 must be 0 below 10 normalized lines | 随所属 services 包（继承测试由契约测试替代后删除）                                                                |
| `packages/services/test/terminal-profile-macos-contract-fast-20261001.test.ts`    | 370  | 0.095  | 16     | 0.000      | longest identical run 16 >= 8                         | 随所属 services 包（继承测试由契约测试替代后删除）                                                                |
| `packages/services/test/terminal-profile-portable-contract-fast-20261001.test.ts` | 398  | 0.078  | 12     | 0.108      | longest identical run 12 >= 8                         | 随所属 services 包（继承测试由契约测试替代后删除）                                                                |
| `packages/services/test/terminal-service-planning-consumer-fast-20261001.test.ts` | 536  | 0.024  | 8      | 0.017      | longest identical run 8 >= 8                          | 随所属 services 包（继承测试由契约测试替代后删除）                                                                |
| `packages/shared/test/protocol-wire-contract.test.ts`                             | 64   | 0.125  | 8      | 0.000      | longest identical run 8 >= 8                          | shared-02/03/04（按分包总表 60 文件上限切）                                                                       |
| `packages/ui/src/assets/cli-icons/mark-auggie.svg`                                | 4    | 0.250  | 1      | 不适用     | containment 0.250 must be 0 below 10 normalized lines | ui 各族（ui-01…ui-07、`ui-lib-*`、`ui-hooks-*`、`ui-settings-*`、`ui-v4-*`、`ui-components-*`；按分包总表路径切） |
| `packages/ui/src/assets/cli-icons/mark-cline.svg`                                 | 6    | 0.167  | 1      | 不适用     | containment 0.167 must be 0 below 10 normalized lines | ui 各族（ui-01…ui-07、`ui-lib-*`、`ui-hooks-*`、`ui-settings-*`、`ui-v4-*`、`ui-components-*`；按分包总表路径切） |
| `packages/ui/src/assets/cli-icons/mark-cursor.svg`                                | 3    | 0.333  | 1      | 不适用     | containment 0.333 must be 0 below 10 normalized lines | ui 各族（ui-01…ui-07、`ui-lib-*`、`ui-hooks-*`、`ui-settings-*`、`ui-v4-*`、`ui-components-*`；按分包总表路径切） |
| `packages/ui/src/assets/cli-icons/mark-devin.svg`                                 | 3    | 0.333  | 1      | 不适用     | containment 0.333 must be 0 below 10 normalized lines | ui 各族（ui-01…ui-07、`ui-lib-*`、`ui-hooks-*`、`ui-settings-*`、`ui-v4-*`、`ui-components-*`；按分包总表路径切） |
| `packages/ui/src/assets/cli-icons/mark-junie.svg`                                 | 5    | 0.200  | 1      | 不适用     | containment 0.200 must be 0 below 10 normalized lines | ui 各族（ui-01…ui-07、`ui-lib-*`、`ui-hooks-*`、`ui-settings-*`、`ui-v4-*`、`ui-components-*`；按分包总表路径切） |
| `packages/ui/src/assets/plugin-icons/browser-use.svg`                             | 5    | 0.200  | 1      | 不适用     | containment 0.200 must be 0 below 10 normalized lines | ui 各族（ui-01…ui-07、`ui-lib-*`、`ui-hooks-*`、`ui-settings-*`、`ui-v4-*`、`ui-components-*`；按分包总表路径切） |
| `packages/ui/src/assets/plugin-icons/documents.svg`                               | 5    | 0.200  | 1      | 不适用     | containment 0.200 must be 0 below 10 normalized lines | ui 各族（ui-01…ui-07、`ui-lib-*`、`ui-hooks-*`、`ui-settings-*`、`ui-v4-*`、`ui-components-*`；按分包总表路径切） |
| `packages/ui/src/assets/plugin-icons/files.svg`                                   | 5    | 0.200  | 1      | 不适用     | containment 0.200 must be 0 below 10 normalized lines | ui 各族（ui-01…ui-07、`ui-lib-*`、`ui-hooks-*`、`ui-settings-*`、`ui-v4-*`、`ui-components-*`；按分包总表路径切） |
| `packages/ui/src/assets/plugin-icons/image-search.svg`                            | 5    | 0.200  | 1      | 不适用     | containment 0.200 must be 0 below 10 normalized lines | ui 各族（ui-01…ui-07、`ui-lib-*`、`ui-hooks-*`、`ui-settings-*`、`ui-v4-*`、`ui-components-*`；按分包总表路径切） |
| `packages/ui/src/assets/plugin-icons/pdf.svg`                                     | 5    | 0.200  | 1      | 不适用     | containment 0.200 must be 0 below 10 normalized lines | ui 各族（ui-01…ui-07、`ui-lib-*`、`ui-hooks-*`、`ui-settings-*`、`ui-v4-*`、`ui-components-*`；按分包总表路径切） |
| `packages/ui/src/assets/plugin-icons/plugin-creator.svg`                          | 5    | 0.200  | 1      | 不适用     | containment 0.200 must be 0 below 10 normalized lines | ui 各族（ui-01…ui-07、`ui-lib-*`、`ui-hooks-*`、`ui-settings-*`、`ui-v4-*`、`ui-components-*`；按分包总表路径切） |
| `packages/ui/src/assets/plugin-icons/presentations.svg`                           | 5    | 0.200  | 1      | 不适用     | containment 0.200 must be 0 below 10 normalized lines | ui 各族（ui-01…ui-07、`ui-lib-*`、`ui-hooks-*`、`ui-settings-*`、`ui-v4-*`、`ui-components-*`；按分包总表路径切） |
| `packages/ui/src/assets/plugin-icons/skill-creator.svg`                           | 5    | 0.200  | 1      | 不适用     | containment 0.200 must be 0 below 10 normalized lines | ui 各族（ui-01…ui-07、`ui-lib-*`、`ui-hooks-*`、`ui-settings-*`、`ui-v4-*`、`ui-components-*`；按分包总表路径切） |
| `packages/ui/src/assets/plugin-icons/spreadsheets.svg`                            | 5    | 0.200  | 1      | 不适用     | containment 0.200 must be 0 below 10 normalized lines | ui 各族（ui-01…ui-07、`ui-lib-*`、`ui-hooks-*`、`ui-settings-*`、`ui-v4-*`、`ui-components-*`；按分包总表路径切） |
| `packages/ui/src/assets/plugin-icons/terminal.svg`                                | 5    | 0.200  | 1      | 不适用     | containment 0.200 must be 0 below 10 normalized lines | ui 各族（ui-01…ui-07、`ui-lib-*`、`ui-hooks-*`、`ui-settings-*`、`ui-v4-*`、`ui-components-*`；按分包总表路径切） |
| `packages/ui/src/studio/agents/probeMessages.ts`                                  | 149  | 0.027  | 1      | 0.500      | structural 0.500 >= 0.4                               | ui 各族（ui-01…ui-07、`ui-lib-*`、`ui-hooks-*`、`ui-settings-*`、`ui-v4-*`、`ui-components-*`；按分包总表路径切） |
| `packages/ui/src/studio/attention/messages.ts`                                    | 77   | 0.000  | 0      | 0.667      | structural 0.667 >= 0.4                               | ui 各族（ui-01…ui-07、`ui-lib-*`、`ui-hooks-*`、`ui-settings-*`、`ui-v4-*`、`ui-components-*`；按分包总表路径切） |
| `packages/ui/src/studio/runtime/studioRunFocus.ts`                                | 7    | 0.286  | 1      | 0.000      | containment 0.286 must be 0 below 10 normalized lines | ui 各族（ui-01…ui-07、`ui-lib-*`、`ui-hooks-*`、`ui-settings-*`、`ui-v4-*`、`ui-components-*`；按分包总表路径切） |
| `packages/ui/test/ui-b4-store-selectors-20260930.test.ts`                         | 471  | 0.102  | 20     | 0.159      | longest identical run 20 >= 8                         | ui 各族（ui-01…ui-07、`ui-lib-*`、`ui-hooks-*`、`ui-settings-*`、`ui-v4-*`、`ui-components-*`；按分包总表路径切） |

这些文件在对应包按「每包流程」写合同、跑旧门、重写；它们的旧门与相似度实测值已在本次记录，选包时直接引用。

## 4. 复现命令

```text
# 1) 从第一轮报告取候选（路径不在 docs/、specs/、licensing/ 下的「替换字样」交还）
node lead/m02-candidates.mjs
# 2) 按首次加入提交分批并判隔离证据
node lead/m02-history.mjs && node lead/m02-evidence.mjs
# 3) 两道门槛（M0-8 工具；上游树已导出到仓库外缓存）
node scripts/provenance/similarity.mjs --repo <本工作树> --candidate-list lead/m02-candidate-list.txt \
  --upstream-dir <仓库外上游树> --upstream-rev 872ad960de7ec172591f7e1952f7849229f94521 --json lead/m02-similarity.json
# 4) 登记（幂等：已存在同路径记录时按当前字节更新）
node lead/m02-register.mjs lead/m02-similarity.json <本工作树> --apply
pnpm provenance:report
```

工具版本：M0-8 的 `scripts/provenance/similarity.mjs`（分支 `m0/8-similarity-tool`；PR 合并后即为主仓版本）。本次实测量：候选 1,130，通过 1,091，未通过 39，二进制 14，结构门槛不适用（非脚本类）286。

## 5. 声明

- 登记只追加 `licensing/reviews.json`，不改代码、不改资产；`licensing/current-files.json` 由 `pnpm provenance:report` 重生成。
- `independent-replacement` 只给有作者包证据的批次，并按计划书「不混用」的原则没有把 B 类算进去。
- 两道门槛的数值全部来自实测；没有调整门槛。未过门槛的文件没有登记，按计划书并入替换包。
