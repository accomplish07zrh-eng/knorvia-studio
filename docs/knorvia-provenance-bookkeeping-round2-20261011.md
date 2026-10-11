# Knorvia Studio 来源清单记账第二轮报告

日期：2026-10-11。分支：`m0/1-bookkeeping-round2`。对应《Knorvia 独立替换任务计划书》M0-1 与附录「M0-1 记账第二轮做法」。第一轮结果见 [knorvia-provenance-bookkeeping-20261010.md](knorvia-provenance-bookkeeping-20261010.md)。

## 1. 开工基线与核验

| 项目                  | 值                                                                                                                     |
| --------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| 开工时的 main 提交    | `70edae4b`（docs: 同步计划书副本（终端交互模式保留并重写））                                                           |
| 工作分支              | `m0/1-bookkeeping-round2`（git checkout -b m0/1-bookkeeping-round2 origin/main）                                       |
| 首快照提交            | `7619e41b950bd52073ebf36754146cf25659d9fa`（2026-09-24）                                                               |
| 上游固定提交          | `872ad960de7ec172591f7e1952f7849229f94521`，来自仓库外只读对象库 `D:/tools.cache/knorvia-provenance/upstream.git`      |
| SPDX 许可正文固定来源 | `spdx/license-list-data` tag `v3.29.0`（https://github.com/spdx/license-list-data/tree/v3.29.0）                       |
| Node / pnpm           | Node 24.14.0 / pnpm 10.33.2（mise.toml 固定版本；本机没有 mise，沿用仓库外 `D:/provenance-work/toolchain` 下的同版本） |
| 开工清单              | licensing/current-files.json 总计 16574 个文件；`provenance:check` 报 reviewProblems = 0、missingReviews 为空          |

## 2. 分类数量前后对比

数字取自 licensing/current-files.json 的 summary（含本轮新增的报告文件本身）。

| 分类                      | 开工 | 收工 | 变化  |
| ------------------------- | ---- | ---- | ----- |
| `generated-report`        | 1    | 1    | 0     |
| `independent-replacement` | 439  | 439  | 0     |
| `original`                | 4206 | 7078 | 2872  |
| `reviewed-retained`       | 8    | 8    | 0     |
| `third-party`             | 2408 | 2453 | 45    |
| `unreviewed`              | 5729 | 2855 | -2874 |
| `upstream-modified`       | 2414 | 2414 | 0     |
| `upstream-unchanged`      | 1369 | 1327 | -42   |

## 3. 四类文件与处理结果

| 类别                                          | 计划书范围 | 本轮实际处理 | 登记 | 交还 |
| --------------------------------------------- | ---------- | ------------ | ---- | ---- |
| 1. 第一轮只因条件 4 被交还的文档与证据        | 约 2,900   | 2870         | 2866 | 4    |
| 2. third-party/upstream/ 缺少头部行的许可正文 | 64         | 64           | 5    | 59   |
| 3. 7-Zip/LZMA 公有领域声明                    | 37         | 37           | 37   | 0    |
| 4. third-party/ 下未审查文件                  | 96         | 60           | 9    | 51   |
| 合计                                          | 约 3,100   | 3031         | 2917 | 114  |

**第一类。** 第二轮修订后的条件 4 只适用于产品源码（`packages/*/src`、`apps/cli/packages/*/src`、两者的 `test/`、`scripts/`）。第一轮因「首次加入提交含替换字样」被交还、且路径在 `docs/`、`licensing/evidence/`、`specs/` 的 2870 个文件按条件 1–3 重新判：全部不是首快照文件、没有从上游路径改名或复制、且没有上游字节相同项；2866 个通过条件 3 登记为 original 并附第二轮追加句，4 个在重测条件 3 时未过门槛（见第 5 节）。

**第二类。** 64 个文件按固定 tag `v3.29.0` 取 SPDX 许可正文，合并空白、去首尾空行后与文件正文整体比对：5 个完全一致，按 SPDX 标识登记为 third-party，evidence 写 SPDX 正文地址；59 个不完全一致，继续交还。

任务清单里这一类的简称是「许可正文补头」，附录给的程序是「取 SPDX 正文比对，完全一致才登记」，并没有要求改动 `third-party/upstream/*.txt` 本身；M0-1 的角色又是「只改来源记录，不动代码」，因此按更具体的附录执行：文件一字未改，只在 licensing/reviews.json 登记。59 个不一致文件的原因分布（用空白折叠后的词重叠率找最接近的 SPDX 文本）：

| 情况                                                                                                | 文件数 |
| --------------------------------------------------------------------------------------------------- | ------ |
| 标准正文但带发布者自己的版权行（如 `Copyright (c) 2022 WorkOS`），SPDX 正文是占位符，因此整体不相等 | 43     |
| 源码文件头注释式声明（`/* ... */`、`//` 块）                                                        | 11     |
| 自带 SPDX 标识的源码式声明（不是许可正文本身）                                                      | 3      |
| 其他（正文被截断、多许可合并等）                                                                    | 2      |

其中 37 个能按空白折叠词重叠率找到 ≥ 0.90 的最近 SPDX 文本（MIT 20、JSON 6、Apache-2.0 3、BSD-3-Clause-Clear 2 等），但按附录门槛仍不登记。这 59 个多数在 `third-party/inventory.json` 的 npm 包 notice 里有引用，与第四类那 34 个「无任何组件引用」的文件不同，建议下一轮由根 Agent 决定是否按所属组件许可正文登记。

**第三类。** 37 个 `third-party/native-search/licenses/*.txt` 的正文只声明公有领域（Igor Pavlov / 7-Zip LZMA SDK），没有 SPDX 标识；全部登记为 third-party，license 写 `LicenseRef-Public-Domain`，并按 `third-party/native-search/sources.json` 写明所属组件（ugrep@7.8.4）。

**第四类。** third-party/ 下 60 个未审查文件：6 个 Knorvia 自有的来源核验说明（`.md`）与补丁记录（`.diff`）按条件 1–3 判后登记为 original；1 个 lobe-icons 的 MIT 许可正文登记为 third-party；2 个在清单中有唯一组件引用的许可正文按组件许可登记为 third-party；34 个在 `third-party/inventory.json`、`third-party/copied-components.json`、`third-party/native-search/sources.json` 中都没有任何组件引用，无法按「所属组件许可正文」登记；17 个是来源核验数据清单（属 `sources.json` 一类），按第二轮规则不登记。这三类共 51 个交还并写明原因。

## 4. 相似度检查的实现与结果

复用第一轮的算法：上游固定提交 872ad960 的全部文本文件（6,886 个，二进制 87 个）按扩展名分组，ts/tsx/js/jsx/mjs/cjs/mts/cts 为一组，其余同扩展名各自一组；规范化每一行时去首尾空白、丢弃空行、丢弃只含 `{ } ( ) [ ] ; ,` 的行、丢弃以 `import `、`export * from`、`export {` 开头的行，注释保留；只与同组文件比较。

- 包含率：候选的每一行取包含它的上游文件，得到该上游文件包含的候选行数，除以候选规范化行数，取最大值。
- 最长相同段：对每组候选位置与上游出现位置，从「前一位置不相同的极大对齐起点」向后延伸，取全部上游文件的最大值（不使用跳段）。
- 门槛：规范化行数 ≥ 10 时包含率 < 0.2 且最长相同段 < 8；规范化行数 < 10 时包含率必须为 0。

本轮先用第一轮报告里已记录数值的 6 个文件校准实现，全部对上：

| 文件                                                                     | 包含率（本轮 / 第一轮） | 最长段（本轮 / 第一轮） |
| ------------------------------------------------------------------------ | ----------------------- | ----------------------- |
| apps/cli/packages/adapters/src/fs/file-search-paths.ts                   | 0.336 / 0.34            | 20 / 20                 |
| apps/cli/packages/adapters/src/fs/node-file-io.ts                        | 0.400 / 0.40            | 6 / 6                   |
| docs/evidence/agent-runtime-author-20261003/api.d.ts                     | 0.783 / 0.78            | 37 / 37                 |
| docs/evidence/agent-runtime-author-20261003/draft-01/candidate.ts        | 0.824 / 0.82            | 33 / 33                 |
| docs/evidence/background-data-author-20261003/workflow-artifact-api.d.ts | 0.538 / 0.54            | 2 / 2                   |
| docs/evidence/background-tracker-author-20261003/ports.d.ts              | 0.991 / 0.99            | 34 / 34                 |

第一类候选（2870 个）的包含率分布：
| 包含率 | 文件数 |
| --- | --- |
| 0 | 1174 |
| 0–0.1 | 677 |
| 0.1–0.2 | 70 |
| 规范化行数 < 10 | 949 |

四个未过门槛的文件都在「最长相同段」上超标（第一轮报告对它们的交还原因只写了条件 4，本轮如实按重测结果交还）：

| 文件                                                                                              | 包含率 | 最长相同段 | 最相似上游文件                                                   |
| ------------------------------------------------------------------------------------------------- | ------ | ---------- | ---------------------------------------------------------------- |
| `docs/evidence/desktop-window-root-packet-20261003/dependency-api.d.ts`                           | 0.12   | 8          | `packages/desktop/src/main/desktopHostProcess.ts`                |
| `docs/evidence/runtime-turn-command-author-20261003/supporting.d.ts`                              | 0.18   | 86         | `apps/zcode-cli/packages/core/src/runtime/types.ts`              |
| `docs/knorvia-workflow-scheduler-author-inputs-20261002/supporting-types.d.ts`                    | 0.09   | 9          | `apps/zcode-cli/packages/contracts/src/events/session.events.ts` |
| `licensing/evidence/protocol-nine-file-independent-technical-receipt-20260930-services-6834.json` | 0.01   | 10         | `third-party/inventory.json`                                     |

## 5. 首次加入提交的口径

条件 1 按计划书附录写明的 `git log --follow --diff-filter=A` 判定。第一轮实现用一次性历史扫描建立「路径 → 首次加入提交」表，对 `--follow` 会识别为改名/复制的文件（Git 在同一次提交里按相似度把新路径算作旧路径的副本）会记到新路径自己的提交上，与 `--follow` 结果不同。

本轮先按批量口径生成，随后抽检 13 条时发现 1 条不一致（`licensing/evidence/cli-config-behavior-owners-20261003/final-architecture.json`：批量口径给 `5ddfd57c`，`--follow` 给 `41e3112b`），因此把全部 2872 条登记逐条用 `git log --follow --diff-filter=A` 重算，341 条与批量口径不同，全部改成 `--follow` 口径（basis 的提交短哈希与日期、evidence 的 `git:` 条目、以及同一提交改动的 `specs/*.md` 一起改），其余保持不变。改完后：

- 逐条复核 341 条：cited 提交、`git show --name-only <提交> -- specs` 与 evidence 的规格清单、basis 前缀三项全部一致，0 条失败；
- 全部 2872 条再用 `git log --follow --diff-filter=A` 逐条比对 cited 提交，0 条不一致；
- 条件 2 全部重跑：`git log --follow --name-status` 最老一条记录里出现改名/复制（R/C）且来源路径在 `licensing/upstream-baseline.json` 的，一条也没有；
- 再抽检 13 条（覆盖各类路径）：0 条不一致；
- 没有一条的 `--follow` 首次加入提交等于首快照 `7619e41`，因此没有文件因条件 1 需要退回。

## 6. 交还清单

共 114 条，全部交还根 Agent 处理。

| 路径                                                                                              | 阶段 | 原因                                                                                                                                                                                                                                        |
| ------------------------------------------------------------------------------------------------- | ---- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `docs/evidence/desktop-window-root-packet-20261003/dependency-api.d.ts`                           | 1    | 相似度 0.12（最相似 packages/desktop/src/main/desktopHostProcess.ts），最长连续段 8 行，超过 0.2 / 8 行阈值                                                                                                                                 |
| `docs/evidence/runtime-turn-command-author-20261003/supporting.d.ts`                              | 1    | 相似度 0.18（最相似 apps/zcode-cli/packages/core/src/runtime/types.ts），最长连续段 86 行，超过 0.2 / 8 行阈值                                                                                                                              |
| `docs/knorvia-workflow-scheduler-author-inputs-20261002/supporting-types.d.ts`                    | 1    | 相似度 0.09（最相似 apps/zcode-cli/packages/contracts/src/events/session.events.ts），最长连续段 9 行，超过 0.2 / 8 行阈值                                                                                                                  |
| `licensing/evidence/protocol-nine-file-independent-technical-receipt-20260930-services-6834.json` | 1    | 相似度 0.01（最相似 third-party/inventory.json），最长连续段 10 行，超过 0.2 / 8 行阈值                                                                                                                                                     |
| `third-party/upstream/014bb31e83d5c2e76aea1cc6e82217346ab41362f32cb355ad0f5c10aa0aeaff.txt`       | 2    | 正文与 SPDX license-list-data v3.29.0 的任一许可正文（合并空白、去首尾空行后）不完全一致；按第二轮规则继续交还                                                                                                                              |
| `third-party/upstream/0a7cda7d15aca7baaa3035e1f90466dde9ecc980c103cd230382d6675714bf2a.txt`       | 2    | 正文与 SPDX license-list-data v3.29.0 的任一许可正文（合并空白、去首尾空行后）不完全一致；按第二轮规则继续交还                                                                                                                              |
| `third-party/upstream/0c74e86d37d6fc7e8f22b4b8e3b801f6737c263c27a71d81c86cd8de0b6a84e5.txt`       | 2    | 正文与 SPDX license-list-data v3.29.0 的任一许可正文（合并空白、去首尾空行后）不完全一致；按第二轮规则继续交还                                                                                                                              |
| `third-party/upstream/0e80a2d229d2fd4fc7e8636142ec5d0ff0bc031f14c15b682e2ac01dfd5b5138.txt`       | 2    | 正文与 SPDX license-list-data v3.29.0 的任一许可正文（合并空白、去首尾空行后）不完全一致；按第二轮规则继续交还                                                                                                                              |
| `third-party/upstream/1564074e13439397221ffd522e2e504d56561994a23d371aa5e3ad43e4f5423f.txt`       | 2    | 正文与 SPDX license-list-data v3.29.0 的任一许可正文（合并空白、去首尾空行后）不完全一致；按第二轮规则继续交还                                                                                                                              |
| `third-party/upstream/17510cf7a58b4879b887ec05a45d72cf1b73544dd9ec7e72f20110ed104229ee.txt`       | 2    | 正文与 SPDX license-list-data v3.29.0 的任一许可正文（合并空白、去首尾空行后）不完全一致；按第二轮规则继续交还                                                                                                                              |
| `third-party/upstream/1a8f1058753f1ba890de984e48f0242a3a5c29a6a8f2ed9fd813f36985387e8d.txt`       | 2    | 正文与 SPDX license-list-data v3.29.0 的任一许可正文（合并空白、去首尾空行后）不完全一致；按第二轮规则继续交还                                                                                                                              |
| `third-party/upstream/23f18e03dc49df91622fe2a76176497404e46ced8a715d9d2b67a7446571cca3.txt`       | 2    | 正文与 SPDX license-list-data v3.29.0 的任一许可正文（合并空白、去首尾空行后）不完全一致；按第二轮规则继续交还                                                                                                                              |
| `third-party/upstream/268872b9816f90fd8e85db5a28d33f8150ebb8dd016653fb39ef1f94f2686bc5.txt`       | 2    | 正文与 SPDX license-list-data v3.29.0 的任一许可正文（合并空白、去首尾空行后）不完全一致；按第二轮规则继续交还                                                                                                                              |
| `third-party/upstream/2711a8b5a5cdfef0e639f96c1aca12ae23d7d64a02d0507f1bdf14d2b27bbc3a.txt`       | 2    | 正文与 SPDX license-list-data v3.29.0 的任一许可正文（合并空白、去首尾空行后）不完全一致；按第二轮规则继续交还                                                                                                                              |
| `third-party/upstream/3007cd45c9afdf93812c0c8a7643ea32a7db0b24e495dc0f2312c8a43990b0dd.txt`       | 2    | 正文与 SPDX license-list-data v3.29.0 的任一许可正文（合并空白、去首尾空行后）不完全一致；按第二轮规则继续交还                                                                                                                              |
| `third-party/upstream/31b15de82aa19a845156169a17a5488bf597e561b2c318d159ed583139b25e87.txt`       | 2    | 正文与 SPDX license-list-data v3.29.0 的任一许可正文（合并空白、去首尾空行后）不完全一致；按第二轮规则继续交还                                                                                                                              |
| `third-party/upstream/34dee5fd5e5cc756efb5ad4d64652bce719bdf5e900ca5d7538253e737930bc4.txt`       | 2    | 正文与 SPDX license-list-data v3.29.0 的任一许可正文（合并空白、去首尾空行后）不完全一致；按第二轮规则继续交还                                                                                                                              |
| `third-party/upstream/37398454f23ddeb02f0b81113fef9ebdc4571b7297cb6e18376c1ccb9bb1453e.txt`       | 2    | 正文与 SPDX license-list-data v3.29.0 的任一许可正文（合并空白、去首尾空行后）不完全一致；按第二轮规则继续交还                                                                                                                              |
| `third-party/upstream/3d180008e36922a4e8daec11c34c7af264fed5962d07924aea928c38e8663c94.txt`       | 2    | 正文与 SPDX license-list-data v3.29.0 的任一许可正文（合并空白、去首尾空行后）不完全一致；按第二轮规则继续交还                                                                                                                              |
| `third-party/upstream/417fa227d75b1e22a15d8389ca8b5e8b7b86241c3b1b17288d20523016ef6fa6.txt`       | 2    | 正文与 SPDX license-list-data v3.29.0 的任一许可正文（合并空白、去首尾空行后）不完全一致；按第二轮规则继续交还                                                                                                                              |
| `third-party/upstream/4a1d35b6325ede5ff9fc338fe7e6fdcaa9fe770767a0114242b817dcba28253f.txt`       | 2    | 正文与 SPDX license-list-data v3.29.0 的任一许可正文（合并空白、去首尾空行后）不完全一致；按第二轮规则继续交还                                                                                                                              |
| `third-party/upstream/508d4676d4083e874df706f302d9d42e5e7f9aed3f5a7ea614dc6d2b2252a22f.txt`       | 2    | 正文与 SPDX license-list-data v3.29.0 的任一许可正文（合并空白、去首尾空行后）不完全一致；按第二轮规则继续交还                                                                                                                              |
| `third-party/upstream/5129f8779dca579cfcb235570688a2f15822b270575e04f27ef906aabbcc0355.txt`       | 2    | 正文与 SPDX license-list-data v3.29.0 的任一许可正文（合并空白、去首尾空行后）不完全一致；按第二轮规则继续交还                                                                                                                              |
| `third-party/upstream/52412d7bc7ce4157ea628bbaacb8829e0a9cb3c58f57f99176126bc8cf2bfc85.txt`       | 2    | 正文与 SPDX license-list-data v3.29.0 的任一许可正文（合并空白、去首尾空行后）不完全一致；按第二轮规则继续交还                                                                                                                              |
| `third-party/upstream/52c49219748499a9a56e0d8d10a73a2d7741f5ecf5c88bdff30593599d6dfbb6.txt`       | 2    | 正文与 SPDX license-list-data v3.29.0 的任一许可正文（合并空白、去首尾空行后）不完全一致；按第二轮规则继续交还                                                                                                                              |
| `third-party/upstream/539dd7aed86e8a4f12cbdd0e6c50c189c7d74847e4fecc64ce2c6ee3a01da38b.txt`       | 2    | 正文与 SPDX license-list-data v3.29.0 的任一许可正文（合并空白、去首尾空行后）不完全一致；按第二轮规则继续交还                                                                                                                              |
| `third-party/upstream/59c38e93a395817bc9d674d868af7c062fcea8b37468af8b3f6f075133eb1756.txt`       | 2    | 正文与 SPDX license-list-data v3.29.0 的任一许可正文（合并空白、去首尾空行后）不完全一致；按第二轮规则继续交还                                                                                                                              |
| `third-party/upstream/5a5ee54c5001bbad1cdc1a57cc3dd4c42199b2da09d39c7ee41fab002d02967f.txt`       | 2    | 正文与 SPDX license-list-data v3.29.0 的任一许可正文（合并空白、去首尾空行后）不完全一致；按第二轮规则继续交还                                                                                                                              |
| `third-party/upstream/5aec868f669e384a22372a4e8a1a6cd7d44c64cd451f960ca69cc170d1e13acf.txt`       | 2    | 正文与 SPDX license-list-data v3.29.0 的任一许可正文（合并空白、去首尾空行后）不完全一致；按第二轮规则继续交还                                                                                                                              |
| `third-party/upstream/5f745b8244890bde0a2258fe32342d60c577fad043e8601d923690a5bfe1b54f.txt`       | 2    | 正文与 SPDX license-list-data v3.29.0 的任一许可正文（合并空白、去首尾空行后）不完全一致；按第二轮规则继续交还                                                                                                                              |
| `third-party/upstream/5f787c1dee3c56547f09ccc2906ab5f5293c4d8dd6c8654e573216c38e908dbd.txt`       | 2    | 正文与 SPDX license-list-data v3.29.0 的任一许可正文（合并空白、去首尾空行后）不完全一致；按第二轮规则继续交还                                                                                                                              |
| `third-party/upstream/66aa9feab8bb39aceebd69f2a357015d57ceab486d3c7a19ff8d3d4110a6d101.txt`       | 2    | 正文与 SPDX license-list-data v3.29.0 的任一许可正文（合并空白、去首尾空行后）不完全一致；按第二轮规则继续交还                                                                                                                              |
| `third-party/upstream/6ae13df543a24b3fb18c25182cf4f084132f799ea9225410f7037888401b7469.txt`       | 2    | 正文与 SPDX license-list-data v3.29.0 的任一许可正文（合并空白、去首尾空行后）不完全一致；按第二轮规则继续交还                                                                                                                              |
| `third-party/upstream/75815e3bf6484201a3c3d17a1bbf10f2e8e3237f84df10a2357ea896db2a81d6.txt`       | 2    | 正文与 SPDX license-list-data v3.29.0 的任一许可正文（合并空白、去首尾空行后）不完全一致；按第二轮规则继续交还                                                                                                                              |
| `third-party/upstream/8405932022a556380c2d8c272eff154a923feb197233f348ce5f7334fb0a5ede.txt`       | 2    | 正文与 SPDX license-list-data v3.29.0 的任一许可正文（合并空白、去首尾空行后）不完全一致；按第二轮规则继续交还                                                                                                                              |
| `third-party/upstream/8802fecf9da4367bc23bcf20b21cc143785fc6c92b152f3fa7fbe6ce08d344d6.txt`       | 2    | 正文与 SPDX license-list-data v3.29.0 的任一许可正文（合并空白、去首尾空行后）不完全一致；按第二轮规则继续交还                                                                                                                              |
| `third-party/upstream/8a1efa755d19446b51a18e1c15f6308728da0b36283c4d38050698ad6954b69a.txt`       | 2    | 正文与 SPDX license-list-data v3.29.0 的任一许可正文（合并空白、去首尾空行后）不完全一致；按第二轮规则继续交还                                                                                                                              |
| `third-party/upstream/91915f8ae056a68a3c5bdf05d9f6f78bb6903e27a8ca3a8434c9e4ac87300575.txt`       | 2    | 正文与 SPDX license-list-data v3.29.0 的任一许可正文（合并空白、去首尾空行后）不完全一致；按第二轮规则继续交还                                                                                                                              |
| `third-party/upstream/9480271317925265e806a9a196aaa33410a962fa9d4d1e248a4a5187bc8c9df9.txt`       | 2    | 正文与 SPDX license-list-data v3.29.0 的任一许可正文（合并空白、去首尾空行后）不完全一致；按第二轮规则继续交还                                                                                                                              |
| `third-party/upstream/96f5b328adbb78eeaaec6980d73fd558cb1e4d62560ed615646bc3cf5e532430.txt`       | 2    | 正文与 SPDX license-list-data v3.29.0 的任一许可正文（合并空白、去首尾空行后）不完全一致；按第二轮规则继续交还                                                                                                                              |
| `third-party/upstream/96f73f9d2a16c21a36b418f06073be26e7d6d5e7c1bc99756b21a4f2c74ef171.txt`       | 2    | 正文与 SPDX license-list-data v3.29.0 的任一许可正文（合并空白、去首尾空行后）不完全一致；按第二轮规则继续交还                                                                                                                              |
| `third-party/upstream/992490064b90ec94c302fe5f29dcc14cb44145857064e46f9ffe6c8f511c1093.txt`       | 2    | 正文与 SPDX license-list-data v3.29.0 的任一许可正文（合并空白、去首尾空行后）不完全一致；按第二轮规则继续交还                                                                                                                              |
| `third-party/upstream/9b405ef4c89342f5eae1dd828882f931747f71001cfba7d114801039b52ad09b.txt`       | 2    | 正文与 SPDX license-list-data v3.29.0 的任一许可正文（合并空白、去首尾空行后）不完全一致；按第二轮规则继续交还                                                                                                                              |
| `third-party/upstream/9b7a157a0079ef346f3215b964071fa460d0dd251ca93cbf581bcc91595066ca.txt`       | 2    | 正文与 SPDX license-list-data v3.29.0 的任一许可正文（合并空白、去首尾空行后）不完全一致；按第二轮规则继续交还                                                                                                                              |
| `third-party/upstream/a37e0e9697144819e1d965176ac4ae5bc3fa02d11e7812036bbcadf6dafe2400.txt`       | 2    | 正文与 SPDX license-list-data v3.29.0 的任一许可正文（合并空白、去首尾空行后）不完全一致；按第二轮规则继续交还                                                                                                                              |
| `third-party/upstream/af0d7d2cef91fc243cf4ad98570b03d1f26f5e0227cad0f5f4a7376e2feb3160.txt`       | 2    | 正文与 SPDX license-list-data v3.29.0 的任一许可正文（合并空白、去首尾空行后）不完全一致；按第二轮规则继续交还                                                                                                                              |
| `third-party/upstream/b4f9adb7c568904834d0dd6cc98d16c390d21ca32fc17ae7a267715269bd5529.txt`       | 2    | 正文与 SPDX license-list-data v3.29.0 的任一许可正文（合并空白、去首尾空行后）不完全一致；按第二轮规则继续交还                                                                                                                              |
| `third-party/upstream/ba8f810f2455c2f08e2d56bb49b72f37fcf68f1f4fade38977cfd7372050ad64.txt`       | 2    | 正文与 SPDX license-list-data v3.29.0 的任一许可正文（合并空白、去首尾空行后）不完全一致；按第二轮规则继续交还                                                                                                                              |
| `third-party/upstream/bdb0a645ea18c60507d0368379b1ac5474b92255fcc2d115e07486a7672ba526.txt`       | 2    | 正文与 SPDX license-list-data v3.29.0 的任一许可正文（合并空白、去首尾空行后）不完全一致；按第二轮规则继续交还                                                                                                                              |
| `third-party/upstream/c2cfccb812fe482101a8f04597dfc5a9991a6b2748266c47ac91b6a5aae15383.txt`       | 2    | 正文与 SPDX license-list-data v3.29.0 的任一许可正文（合并空白、去首尾空行后）不完全一致；按第二轮规则继续交还                                                                                                                              |
| `third-party/upstream/c5adaf9051f20a1bbeecfb39de415cac1fef591d4fcda2b55d66b31354fdba1e.txt`       | 2    | 正文与 SPDX license-list-data v3.29.0 的任一许可正文（合并空白、去首尾空行后）不完全一致；按第二轮规则继续交还                                                                                                                              |
| `third-party/upstream/c8b789cf5a746611e6300a0cc7750dbf92b61912a709d04e639245f7290656d0.txt`       | 2    | 正文与 SPDX license-list-data v3.29.0 的任一许可正文（合并空白、去首尾空行后）不完全一致；按第二轮规则继续交还                                                                                                                              |
| `third-party/upstream/cb992262f361a5359e6771c28740d33c7041e15332ae8537fae40538992591a9.txt`       | 2    | 正文与 SPDX license-list-data v3.29.0 的任一许可正文（合并空白、去首尾空行后）不完全一致；按第二轮规则继续交还                                                                                                                              |
| `third-party/upstream/cdab3014d4f69b49dde2b85e81792208c72de613aa6aed7f7a9b5c6609b89670.txt`       | 2    | 正文与 SPDX license-list-data v3.29.0 的任一许可正文（合并空白、去首尾空行后）不完全一致；按第二轮规则继续交还                                                                                                                              |
| `third-party/upstream/cf81859d85e99ff2fad83d51d9dfd85ca5189b23c4442aacf1890c54665d92f4.txt`       | 2    | 正文与 SPDX license-list-data v3.29.0 的任一许可正文（合并空白、去首尾空行后）不完全一致；按第二轮规则继续交还                                                                                                                              |
| `third-party/upstream/d65ff929f8a373ea16b21d45d5489557d51389ba6583a5c9959d5487c02ce965.txt`       | 2    | 正文与 SPDX license-list-data v3.29.0 的任一许可正文（合并空白、去首尾空行后）不完全一致；按第二轮规则继续交还                                                                                                                              |
| `third-party/upstream/da6d3703ed11cbe42bd212c725957c98da23cbff1998c05fa4b3d976d1a58e93.txt`       | 2    | 正文与 SPDX license-list-data v3.29.0 的任一许可正文（合并空白、去首尾空行后）不完全一致；按第二轮规则继续交还                                                                                                                              |
| `third-party/upstream/e1cfcc55c325b3f78cf55df9664abaa066e2271dffe8213347d9fccdfbac8f2c.txt`       | 2    | 正文与 SPDX license-list-data v3.29.0 的任一许可正文（合并空白、去首尾空行后）不完全一致；按第二轮规则继续交还                                                                                                                              |
| `third-party/upstream/e2b35be49f7284a45b7baca8fc7b3ab7440e7902392b2528a457816b5bb2a15c.txt`       | 2    | 正文与 SPDX license-list-data v3.29.0 的任一许可正文（合并空白、去首尾空行后）不完全一致；按第二轮规则继续交还                                                                                                                              |
| `third-party/upstream/e49e62397b603438476e0d6b5ca3b6e6d4f23a80594e596aff29ac04fa3e1b1c.txt`       | 2    | 正文与 SPDX license-list-data v3.29.0 的任一许可正文（合并空白、去首尾空行后）不完全一致；按第二轮规则继续交还                                                                                                                              |
| `third-party/upstream/ebb2e920800c6353474e3e23d84f714ee8aaecd8f5a71851aa03594a4129d855.txt`       | 2    | 正文与 SPDX license-list-data v3.29.0 的任一许可正文（合并空白、去首尾空行后）不完全一致；按第二轮规则继续交还                                                                                                                              |
| `third-party/upstream/f9bc4423732350eb0b3f7ed7e91d530298476f8fec0c6c427a1c04ade22655af.txt`       | 2    | 正文与 SPDX license-list-data v3.29.0 的任一许可正文（合并空白、去首尾空行后）不完全一致；按第二轮规则继续交还                                                                                                                              |
| `third-party/upstream/fc7d762e0ebf8720d0a03cf00058aaa3a198347e9651be2f50a25e3b3ec13985.txt`       | 2    | 正文与 SPDX license-list-data v3.29.0 的任一许可正文（合并空白、去首尾空行后）不完全一致；按第二轮规则继续交还                                                                                                                              |
| `third-party/upstream/0164b7ab9ba129d156250887a12cd86e1ee6de9f021ae2ab2566e65e6b4edeb6.txt`       | 4    | third-party/inventory.json、copied-components.json 与 native-search/sources.json 中没有任何组件引用该文件；正文与 SPDX license-list-data v3.29.0 许可正文不完全一致，无法按所属组件许可正文登记，继续交还（无引用上游资产，留待 M0-5 判定） |
| `third-party/upstream/02421fcfbfb1d656ef0b6ff4cd3c39f2946f08c3219fa42db482add7ce1f53ea.txt`       | 4    | third-party/inventory.json、copied-components.json 与 native-search/sources.json 中没有任何组件引用该文件；正文与 SPDX license-list-data v3.29.0 许可正文不完全一致，无法按所属组件许可正文登记，继续交还（无引用上游资产，留待 M0-5 判定） |
| `third-party/upstream/0c778720761a0b9ed03b83d55cc1dff2cd79e367528cfb8988176c4dc2b1dd27.txt`       | 4    | third-party/inventory.json、copied-components.json 与 native-search/sources.json 中没有任何组件引用该文件；正文与 SPDX license-list-data v3.29.0 许可正文不完全一致，无法按所属组件许可正文登记，继续交还（无引用上游资产，留待 M0-5 判定） |
| `third-party/upstream/0d33f8c63be2bd52f40ab4754f0312fa5a510d4a01bd76869254d3b210850d9d.txt`       | 4    | third-party/inventory.json、copied-components.json 与 native-search/sources.json 中没有任何组件引用该文件；正文与 SPDX license-list-data v3.29.0 许可正文不完全一致，无法按所属组件许可正文登记，继续交还（无引用上游资产，留待 M0-5 判定） |
| `third-party/upstream/12dffc8d88e81ef2fda9bb2142599751cced9564ec87cea683538980b1c42d75.txt`       | 4    | third-party/inventory.json、copied-components.json 与 native-search/sources.json 中没有任何组件引用该文件；正文与 SPDX license-list-data v3.29.0 许可正文不完全一致，无法按所属组件许可正文登记，继续交还（无引用上游资产，留待 M0-5 判定） |
| `third-party/upstream/23c23145f6eac25c28cdcc03d38506a5712a9a8cffb5bd5301457f6173ea696e.txt`       | 4    | third-party/inventory.json、copied-components.json 与 native-search/sources.json 中没有任何组件引用该文件；正文与 SPDX license-list-data v3.29.0 许可正文不完全一致，无法按所属组件许可正文登记，继续交还（无引用上游资产，留待 M0-5 判定） |
| `third-party/upstream/35213d2e8040f799a87200ed2fb6aa5c471cce8ab200826d2eb94f60b714b513.txt`       | 4    | third-party/inventory.json、copied-components.json 与 native-search/sources.json 中没有任何组件引用该文件；正文与 SPDX license-list-data v3.29.0 许可正文不完全一致，无法按所属组件许可正文登记，继续交还（无引用上游资产，留待 M0-5 判定） |
| `third-party/upstream/368cca1106be99d39ecd32a38d8305585d802a475effb66380b91ffc9bcf709b.txt`       | 4    | third-party/inventory.json、copied-components.json 与 native-search/sources.json 中没有任何组件引用该文件；正文与 SPDX license-list-data v3.29.0 许可正文不完全一致，无法按所属组件许可正文登记，继续交还（无引用上游资产，留待 M0-5 判定） |
| `third-party/upstream/3e38787d12d0ac72ff96fb090cdb02dab1ba3930978501fc9091f1754471faf8.txt`       | 4    | third-party/inventory.json、copied-components.json 与 native-search/sources.json 中没有任何组件引用该文件；正文与 SPDX license-list-data v3.29.0 许可正文不完全一致，无法按所属组件许可正文登记，继续交还（无引用上游资产，留待 M0-5 判定） |
| `third-party/upstream/442042c9409b2655e490f26c7da9a4075399495519b79918c1fd51b6ed458ad5.txt`       | 4    | third-party/inventory.json、copied-components.json 与 native-search/sources.json 中没有任何组件引用该文件；正文与 SPDX license-list-data v3.29.0 许可正文不完全一致，无法按所属组件许可正文登记，继续交还（无引用上游资产，留待 M0-5 判定） |
| `third-party/upstream/5285d96f6aa3188193d5fbefd8710ed6a46af185e0a43817c17acee5f4b1ab3d.txt`       | 4    | third-party/inventory.json、copied-components.json 与 native-search/sources.json 中没有任何组件引用该文件；正文与 SPDX license-list-data v3.29.0 许可正文不完全一致，无法按所属组件许可正文登记，继续交还（无引用上游资产，留待 M0-5 判定） |
| `third-party/upstream/55b223e3f0fdcf0c262d3ff37aeb32ba063d300e53b97d56057bd3a34c8ae989.txt`       | 4    | third-party/inventory.json、copied-components.json 与 native-search/sources.json 中没有任何组件引用该文件；正文与 SPDX license-list-data v3.29.0 许可正文不完全一致，无法按所属组件许可正文登记，继续交还（无引用上游资产，留待 M0-5 判定） |
| `third-party/upstream/6787208f83f659ccbc2223b2fde952ffa6f7e8aca62f1a8a2bf5bc51bb1b2383.txt`       | 4    | third-party/inventory.json、copied-components.json 与 native-search/sources.json 中没有任何组件引用该文件；正文与 SPDX license-list-data v3.29.0 许可正文不完全一致，无法按所属组件许可正文登记，继续交还（无引用上游资产，留待 M0-5 判定） |
| `third-party/upstream/866e6fa48cb8810d36d8d85a3085d7aa1c4317d3731f0ef84919428fee87bf71.txt`       | 4    | third-party/inventory.json、copied-components.json 与 native-search/sources.json 中没有任何组件引用该文件；正文与 SPDX license-list-data v3.29.0 许可正文不完全一致，无法按所属组件许可正文登记，继续交还（无引用上游资产，留待 M0-5 判定） |
| `third-party/upstream/9059c5a7575258863d7694c333dc1c7d211087be94fd63db7622a9a5ab72036f.txt`       | 4    | third-party/inventory.json、copied-components.json 与 native-search/sources.json 中没有任何组件引用该文件；正文与 SPDX license-list-data v3.29.0 许可正文不完全一致，无法按所属组件许可正文登记，继续交还（无引用上游资产，留待 M0-5 判定） |
| `third-party/upstream/926f434136ee825ea37627e6283d3cf9b544c75d229c34a7e993729b2fd68076.txt`       | 4    | third-party/inventory.json、copied-components.json 与 native-search/sources.json 中没有任何组件引用该文件；正文与 SPDX license-list-data v3.29.0 许可正文不完全一致，无法按所属组件许可正文登记，继续交还（无引用上游资产，留待 M0-5 判定） |
| `third-party/upstream/9fe1a90bd32659d7953616283dc2bffaa165518aae9ace026040c42c559ba606.txt`       | 4    | third-party/inventory.json、copied-components.json 与 native-search/sources.json 中没有任何组件引用该文件；正文与 SPDX license-list-data v3.29.0 许可正文不完全一致，无法按所属组件许可正文登记，继续交还（无引用上游资产，留待 M0-5 判定） |
| `third-party/upstream/a385735ac3240f1bf6f32884cb7c888d0e4f37c863eb9a1b40c6ba7e7192750a.txt`       | 4    | third-party/inventory.json、copied-components.json 与 native-search/sources.json 中没有任何组件引用该文件；正文与 SPDX license-list-data v3.29.0 许可正文不完全一致，无法按所属组件许可正文登记，继续交还（无引用上游资产，留待 M0-5 判定） |
| `third-party/upstream/a76c3d70aed9b52b78196199da23e207ae6a01513ade15f40cfffe172b74b345.txt`       | 4    | third-party/inventory.json、copied-components.json 与 native-search/sources.json 中没有任何组件引用该文件；正文与 SPDX license-list-data v3.29.0 许可正文不完全一致，无法按所属组件许可正文登记，继续交还（无引用上游资产，留待 M0-5 判定） |
| `third-party/upstream/a8df3fb9aac5e61c2bd8cd45066240916d08aabd8cfd38f7f2d39757e90bb832.txt`       | 4    | third-party/inventory.json、copied-components.json 与 native-search/sources.json 中没有任何组件引用该文件；正文与 SPDX license-list-data v3.29.0 许可正文不完全一致，无法按所属组件许可正文登记，继续交还（无引用上游资产，留待 M0-5 判定） |
| `third-party/upstream/aca9c8fbe556e770221641d454905105c1c9ab7dac5491ceafa9793323ed72a4.txt`       | 4    | third-party/inventory.json、copied-components.json 与 native-search/sources.json 中没有任何组件引用该文件；正文与 SPDX license-list-data v3.29.0 许可正文不完全一致，无法按所属组件许可正文登记，继续交还（无引用上游资产，留待 M0-5 判定） |
| `third-party/upstream/b48e789ef8667646edc2b727cafc882d814a7f16dc7eed31d3b397e2d33ca691.txt`       | 4    | third-party/inventory.json、copied-components.json 与 native-search/sources.json 中没有任何组件引用该文件；正文与 SPDX license-list-data v3.29.0 许可正文不完全一致，无法按所属组件许可正文登记，继续交还（无引用上游资产，留待 M0-5 判定） |
| `third-party/upstream/b6d3d72e3ecc9d33d5de6d6547f68c577c203d623585adb6455d20216cced592.txt`       | 4    | third-party/inventory.json、copied-components.json 与 native-search/sources.json 中没有任何组件引用该文件；正文与 SPDX license-list-data v3.29.0 许可正文不完全一致，无法按所属组件许可正文登记，继续交还（无引用上游资产，留待 M0-5 判定） |
| `third-party/upstream/bd36c8b474855fa294c2ec5c184544478ef3720aad37d65a6296a4f264fd2d3b.txt`       | 4    | third-party/inventory.json、copied-components.json 与 native-search/sources.json 中没有任何组件引用该文件；正文与 SPDX license-list-data v3.29.0 许可正文不完全一致，无法按所属组件许可正文登记，继续交还（无引用上游资产，留待 M0-5 判定） |
| `third-party/upstream/c7c439b79bd9a71954f3509a8bd9ad05d44887114aa259beb8084e8e15ddbeb9.txt`       | 4    | third-party/inventory.json、copied-components.json 与 native-search/sources.json 中没有任何组件引用该文件；正文与 SPDX license-list-data v3.29.0 许可正文不完全一致，无法按所属组件许可正文登记，继续交还（无引用上游资产，留待 M0-5 判定） |
| `third-party/upstream/ca7047566630aa93a701f06df3817e2b7cfd7f12807281b2e09013b8f9132c70.txt`       | 4    | third-party/inventory.json、copied-components.json 与 native-search/sources.json 中没有任何组件引用该文件；正文与 SPDX license-list-data v3.29.0 许可正文不完全一致，无法按所属组件许可正文登记，继续交还（无引用上游资产，留待 M0-5 判定） |
| `third-party/upstream/cb95728cc2b4a3502bb8e69c019e0e5f01c0a218a855168e9c19d4df51582cd5.txt`       | 4    | third-party/inventory.json、copied-components.json 与 native-search/sources.json 中没有任何组件引用该文件；正文与 SPDX license-list-data v3.29.0 许可正文不完全一致，无法按所属组件许可正文登记，继续交还（无引用上游资产，留待 M0-5 判定） |
| `third-party/upstream/cdb6b2a4e60de61211f8759676ea2251ed3a42d0d3d7b4e83eaccf4af1c15472.txt`       | 4    | third-party/inventory.json、copied-components.json 与 native-search/sources.json 中没有任何组件引用该文件；正文与 SPDX license-list-data v3.29.0 许可正文不完全一致，无法按所属组件许可正文登记，继续交还（无引用上游资产，留待 M0-5 判定） |
| `third-party/upstream/d38239a23bfadf84d2f89504f3f6e435ed200a30fe329a9c198f5000017b48a2.txt`       | 4    | third-party/inventory.json、copied-components.json 与 native-search/sources.json 中没有任何组件引用该文件；正文与 SPDX license-list-data v3.29.0 许可正文不完全一致，无法按所属组件许可正文登记，继续交还（无引用上游资产，留待 M0-5 判定） |
| `third-party/upstream/d38d82f865590ced088d26ebbb6abb1eae0b49e12cba492c14f323e73656a9a2.txt`       | 4    | third-party/inventory.json、copied-components.json 与 native-search/sources.json 中没有任何组件引用该文件；正文与 SPDX license-list-data v3.29.0 许可正文不完全一致，无法按所属组件许可正文登记，继续交还（无引用上游资产，留待 M0-5 判定） |
| `third-party/upstream/df694330c5856149838d49b822ec23986329fd8413bde5e816874f0ee04d1c56.txt`       | 4    | third-party/inventory.json、copied-components.json 与 native-search/sources.json 中没有任何组件引用该文件；正文与 SPDX license-list-data v3.29.0 许可正文不完全一致，无法按所属组件许可正文登记，继续交还（无引用上游资产，留待 M0-5 判定） |
| `third-party/upstream/dfe146342f94e1595214e12a377ff40d383db36dadbc09b8cc071ef354114dc3.txt`       | 4    | third-party/inventory.json、copied-components.json 与 native-search/sources.json 中没有任何组件引用该文件；正文与 SPDX license-list-data v3.29.0 许可正文不完全一致，无法按所属组件许可正文登记，继续交还（无引用上游资产，留待 M0-5 判定） |
| `third-party/upstream/e184ca99561e85dd1eda33fd6b9f2b09f4df94636b540532ad7358ffbae23fe1.txt`       | 4    | third-party/inventory.json、copied-components.json 与 native-search/sources.json 中没有任何组件引用该文件；正文与 SPDX license-list-data v3.29.0 许可正文不完全一致，无法按所属组件许可正文登记，继续交还（无引用上游资产，留待 M0-5 判定） |
| `third-party/upstream/e7a93b009565cfce55919a381437ac4db883e9da2126fa28b91d12732bc53d96.txt`       | 4    | third-party/inventory.json、copied-components.json 与 native-search/sources.json 中没有任何组件引用该文件；正文与 SPDX license-list-data v3.29.0 许可正文不完全一致，无法按所属组件许可正文登记，继续交还（无引用上游资产，留待 M0-5 判定） |
| `third-party/source-verification-20261003/apache-distribution-matrix.json`                        | 4    | 清单数据（来源核验数据清单，属 sources.json 一类），按第二轮规则不登记                                                                                                                                                                      |
| `third-party/source-verification-20261003/boolbase-published-tags.json`                           | 4    | 清单数据（来源核验数据清单，属 sources.json 一类），按第二轮规则不登记                                                                                                                                                                      |
| `third-party/source-verification-20261003/bounded-inherited-source-facts.json`                    | 4    | 清单数据（来源核验数据清单，属 sources.json 一类），按第二轮规则不登记                                                                                                                                                                      |
| `third-party/source-verification-20261003/bounded-svg-source-facts.json`                          | 4    | 清单数据（来源核验数据清单，属 sources.json 一类），按第二轮规则不登记                                                                                                                                                                      |
| `third-party/source-verification-20261003/canvas-published-artifacts.json`                        | 4    | 清单数据（来源核验数据清单，属 sources.json 一类），按第二轮规则不登记                                                                                                                                                                      |
| `third-party/source-verification-20261003/cloud-gui-preparation.json`                             | 4    | 清单数据（来源核验数据清单，属 sources.json 一类），按第二轮规则不登记                                                                                                                                                                      |
| `third-party/source-verification-20261003/input-bindings.json`                                    | 4    | 清单数据（来源核验数据清单，属 sources.json 一类），按第二轮规则不登记                                                                                                                                                                      |
| `third-party/source-verification-20261003/native-projection-scope.json`                           | 4    | 清单数据（来源核验数据清单，属 sources.json 一类），按第二轮规则不登记                                                                                                                                                                      |
| `third-party/source-verification-20261003/npm-archive-headers.json`                               | 4    | 清单数据（来源核验数据清单，属 sources.json 一类），按第二轮规则不登记                                                                                                                                                                      |
| `third-party/source-verification-20261003/pinned-source-headers.json`                             | 4    | 清单数据（来源核验数据清单，属 sources.json 一类），按第二轮规则不登记                                                                                                                                                                      |
| `third-party/source-verification-20261003/product-runtime-closures.json`                          | 4    | 清单数据（来源核验数据清单，属 sources.json 一类），按第二轮规则不登记                                                                                                                                                                      |
| `third-party/source-verification-20261003/quickjs-original-notice-reads.json`                     | 4    | 清单数据（来源核验数据清单，属 sources.json 一类），按第二轮规则不登记                                                                                                                                                                      |
| `third-party/source-verification-20261003/quickjs-source-binding.json`                            | 4    | 清单数据（来源核验数据清单，属 sources.json 一类），按第二轮规则不登记                                                                                                                                                                      |
| `third-party/source-verification-20261003/quickjs-source-commit.json`                             | 4    | 清单数据（来源核验数据清单，属 sources.json 一类），按第二轮规则不登记                                                                                                                                                                      |
| `third-party/source-verification-20261003/quickjs-wasm-artifacts.json`                            | 4    | 清单数据（来源核验数据清单，属 sources.json 一类），按第二轮规则不登记                                                                                                                                                                      |
| `third-party/source-verification-20261003/react-skill-identification.json`                        | 4    | 清单数据（来源核验数据清单，属 sources.json 一类），按第二轮规则不登记                                                                                                                                                                      |
| `third-party/source-verification-20261003/react-upstream-license-availability.json`               | 4    | 清单数据（来源核验数据清单，属 sources.json 一类），按第二轮规则不登记                                                                                                                                                                      |

第三类 37 个文件与第四类的 6 个 `.md`/`.diff` 已全部登记，不在此表。

本轮报告文件本身（`docs/knorvia-provenance-bookkeeping-round2-20261011.md`）是本次工作的交付物，交付前可能修订，因此与第一轮报告 `docs/knorvia-provenance-bookkeeping-20261010.md` 一样不登记：两份报告各留一条书面例外（本轮报告新增 1 个 unreviewed，第一轮报告沿用其既有状态）。登记它们需要绑定的摘要会在下一次文字修订时立刻过期，交给 M0 收尾连同其余书面例外统一处理。

## 7. 批次

| 批次 | 提交信息                                        | 提交           |
| ---- | ----------------------------------------------- | -------------- |
| 1    | chore(provenance): 第二轮第 1 批，登记 300 条   | `8265713cef9a` |
| 2    | chore(provenance): 第二轮第 2 批，登记来源清单  | `dc73b2610b5a` |
| 3    | chore(provenance): 第二轮第 3 批，登记来源清单  | `7bf71f660126` |
| 4    | chore(provenance): 第二轮第 4 批，登记来源清单  | `2b355d55a137` |
| 5    | chore(provenance): 第二轮第 5 批，登记来源清单  | `9da91d3a69ab` |
| 6    | chore(provenance): 第二轮第 6 批，登记来源清单  | `0f685a251f79` |
| 7    | chore(provenance): 第二轮第 7 批，登记来源清单  | `f9646eac323c` |
| 8    | chore(provenance): 第二轮第 8 批，登记来源清单  | `00ae3b1fdf8d` |
| 9    | chore(provenance): 第二轮第 9 批，登记来源清单  | `cbe370fd28f3` |
| 10   | chore(provenance): 第二轮第 10 批，登记来源清单 | `f7d6d888414d` |

每批顺序：追加 licensing/reviews.json → `node node_modules/oxfmt/bin/oxfmt licensing/reviews.json` → `node scripts/provenance/cli.mjs` → `node scripts/provenance/cli.mjs --check` → 校验工作树只有这两个文件被改动 → 单独提交。首次加入提交改口径的 341 条作为单独一批提交。批次日志在仓库外的 `D:/provenance-work/round2/logs/round2-batches.log`，不提交。

## 8. 门禁

提 PR 前按 M0 任务做法运行门禁，命令与结尾输出如下（原始日志在仓库外，不提交）：

| 命令                      | 结果                                                                                                                                                                                                                                                  |
| ------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `pnpm fmt:check`          | 退出码 0（14s）；结尾输出：Checking formatting... All matched files use the correct format. Finished in 12196ms on 7742 files using 24 threads.                                                                                                       |
| `pnpm lint`               | 退出码 0（2s）；结尾输出： help: Avoid matching control characters in regular expressions. If intentional, consider using a Unicode escape instead. Found 1 warning and 0 errors. Finished in 332ms on 3509 files using 24 threads.                   |
| `pnpm typecheck`          | 退出码 0（2s）；结尾输出：> knorvia-studio@0.11.4 i18n:check D:\knorvia studio开发 > node scripts/check-i18n-parity.mjs [i18n] en-US and zh-CN: 5573 matching keys, validated values and placeholders                                                 |
| `pnpm architecture:check` | 退出码 0（3s）；结尾输出：violations: 0 baseline: 0 new: 0                                                                                                                                                                                            |
| `pnpm knip`               | 退出码 1（27s）；结尾输出：src/index.ts …ages/server …p.json Remove redundant entry pattern build-remote.ts …ages/server …p.json Remove redundant entry pattern                                                                                       |
| `pnpm build:cli-packages` | 退出码 0（45s）；结尾输出：Installing the version in your repository (^2.4.0) before calling `turbo` will result in more predictable behavior across environments. WARNING Unable to calculate transitive closures: Workspace 'packages/dynamic-workf |
| `pnpm test:studio`        | 退出码 1（830s）；结尾输出： diff: 'simple' }  ELIFECYCLE  Command failed with exit code 1.                                                                                                                                                           |
| `pnpm provenance:check`   | 退出码 0（25s）；结尾输出： "missingReviews": [] } Unresolved third-party material obligations: 26                                                                                                                                                    |

`pnpm knip` 与 `pnpm test:studio` 在 main 上本来就失败，不算本任务的问题。本分支只改来源记录，没有改代码或测试。把仓库切到 `origin/main`（`70edae4b`）后，用同一台机器、同一份依赖、先跑 `pnpm build:cli-packages`（退出码 0），再跑同样命令：

| 命令               | 本分支              | origin/main                         |
| ------------------ | ------------------- | ----------------------------------- |
| `pnpm knip`        | 退出码 1            | 退出码 1，同样的 entry pattern 提示 |
| `pnpm test:studio` | 退出码 1，失败 3 项 | 退出码 1，失败 6 项                 |

失败用例（去重后）：

| 用例                                                                                            | 本分支 | origin/main |
| ----------------------------------------------------------------------------------------------- | ------ | ----------- |
| `asynchronous JSON mapping distinguishes completed, failed, timed-out and malformed outputs`    | 失败   | 通过        |
| `health loss withdraws preview and fails; exit of an owned service is not displayed as stopped` | 失败   | 失败        |
| `packages\desktop\test\official-plugin-staging.test.mjs`                                        | 失败   | 失败        |
| `approved service receives only safe OS values plus its assigned loopback port`                 | 通过   | 失败        |
| `device/fs complete frozen contract: dist`                                                      | 通过   | 失败        |
| `device/fs complete frozen contract: source`                                                    | 通过   | 失败        |
| `spawn failure and readiness timeout remain failures after owned cleanup`                       | 通过   | 失败        |

两次运行失败的具体子用例不完全一样：`packages/services/test/creation-polish.test.ts` 的用例依赖并发时序，单独运行时 11/11 通过（本分支实测退出码 0）；`device/fs complete frozen contract` 只在 main 那次出现；`studio-workspace-runtime-health` 的用例依赖回环端口与启动时序，两次失败的子用例数不同。因此按计划书默认裁决记为「main 上本来就失败」，本轮不新增失败、也不掩盖。

## 9. 声明

- 本轮只改来源记录，没有改动任何代码、规格或第三方材料。
- 登记采用第二轮修订后的四条条件；条件 1、2、3 的判定沿用第一轮实现并在本轮重跑，条件 3 的数值取自本轮实现（第 4 节校准）。
- 「Bookkeeping review only; not a claim of independent replacement of any upstream implementation.」只表示来源记账结论，不代表独立实现，也不改变任何现有许可声明。
- 交还文件保持 unreviewed，不代表它们已有结论。
