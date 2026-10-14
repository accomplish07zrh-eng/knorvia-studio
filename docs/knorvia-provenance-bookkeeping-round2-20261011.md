# Knorvia Studio 来源清单记账第二轮报告

日期：2026-10-11。分支：`m0/1-bookkeeping-round2`。本报告对应计划书附录「M0-1 记账第二轮做法」（issue #94）。只改 `licensing/reviews.json`（只追加）与新增文档，不动代码。

## 1. 开工基线与核验

| 项目         | 值                                                                                                                                                 |
| ------------ | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| 工作分支起点 | `6ea4cbe751a3d4b35d08460151eed758f5a76ac8`（main，执行基线 `beff12b5`）                                                                            |
| 首快照提交   | `7619e41b950bd52073ebf36754146cf25659d9fa`                                                                                                         |
| 上游固定提交 | `872ad960de7ec172591f7e1952f7849229f94521`（仓库外只读对象库 `D:\tools.cache\knorvia-provenance\upstream.git`，6,973 条目，其中 6,886 个文本文件） |
| SPDX 正文    | `spdx/license-list-data` 固定 tag `v3.29.0`，`text/` 下 826 份许可正文，下载到仓库外缓存目录                                                       |
| Node / pnpm  | Node v24.14.0 / pnpm 10.33.2（`mise.toml` 固定版本；本机没有 mise，用仓库外的 Node 24.14.0 包装脚本运行）                                          |
| 开工门禁     | `pnpm provenance:check` = 0、`pnpm fmt:check` = 0、`pnpm lint` = 0（1 条既有 warning）、`pnpm typecheck` = 0                                       |

开工清单 `licensing/current-files.json` 总计 16,574 个文件；`provenance:check` 报 reviewProblems = 0。

## 2. 分类数量前后对比

数字取自 `licensing/current-files.json` 的 summary。

| 分类                      | 开工  | 收工  | 变化  |
| ------------------------- | ----- | ----- | ----- |
| `upstream-unchanged`      | 1369  | 1327  | -42   |
| `upstream-modified`       | 2414  | 2414  | +0    |
| `unreviewed`              | 5729  | 2723  | -3006 |
| `original`                | 4206  | 7180  | +2974 |
| `independent-replacement` | 439   | 439   | +0    |
| `third-party`             | 2408  | 2487  | +79   |
| `reviewed-retained`       | 8     | 8     | +0    |
| `generated-report`        | 1     | 1     | +0    |
| 合计                      | 16574 | 16579 | +5    |

合计 +5 是本次新增的五个文件：四个工具文件（`scripts/provenance/bookkeeping-round2.mjs`、`bookkeeping-round2-similarity.mjs`、`bookkeeping-round2-history.mjs`、`bookkeeping-round2-records.mjs`）与本报告文件。四个工具文件已在第 5 类登记为 `original`；本报告文件是本次工作的交付物，评审期间还会修订，登记会立刻过期，因此不登记，在 `licensing/current-files.json` 里显示为 `unreviewed`，见第 6 节。
unreviewed 净减 3,006 = 登记掉的 3,007 条 unreviewed（第 1 类 2,947 + 第 4 类 60）减 1 个未登记的新增文件（本报告）。`upstream-unchanged` 减 42 = 第 2 类 5 + 第 3 类 37。

## 3. 五类处理结果

| 类别                                            | 范围文件数 | 登记 | 交还 |
| ----------------------------------------------- | ---------- | ---- | ---- |
| 1 第一轮只因条件 4 被交还的文档与证据           | 2947       | 2947 | 0    |
| 2 缺少许可头部行的 `third-party/upstream/*.txt` | 64         | 5    | 59   |
| 3 7-Zip / LZMA 公有领域声明                     | 37         | 37   | 0    |
| 4 `third-party/` 下未审查文件                   | 60         | 60   | 0    |
| 5 本轮新增的记账工具文件                        | 4          | 4    | 0    |
| 合计                                            | 3112       | 3053 | 59   |

共向 `licensing/reviews.json` 追加 3,053 条记录：`original` 2,974 条、`third-party` 79 条。

### 3.1 第 1 类：条件 4 修订后的文档与证据

第一轮交还清单共 5,768 条，其中「只因条件 4 被交还」（原因只含「首次加入提交含替换字样」一条）3,962 条。按修订后的条件 4，产品源码范围为 `packages/*/src`、`packages/*/test`、`apps/cli/packages/*/src`、`apps/cli/packages/*/test`、`scripts/`，落在该范围内的 1,015 条继续交还，不在范围内的 2,947 条按条件 1–3 重判。

重判结果（全部独立重算，不沿用第一轮结论）：

- 条件 1（首次加入晚于 `7619e41`）：2,947 条全部通过，用 `git log --reverse --name-status -M` 建全历史索引后沿改名链取最初加入提交，失败 0；
- 条件 2（不是从上游路径改名或复制）：改名/复制谱系 0 条；
- 条件 3（与 `zai-org/ZCode@872ad960` 行相似度）：失败 0。门槛为规范化行数 ≥ 10 时包含率 < 0.2 且最长连续段 < 8 行，< 10 行时包含率为 0。

因此 2,947 条全部登记 `original`，license 为 `Apache-2.0`。basis 用附录模板，并按要求追加 `Replacement wording in the commit describes the documented work, not this file's origin.`；evidence 为 `git:<完整首次提交哈希>`、`licensing/upstream-baseline.json`，首次提交改动了 `specs/*.md` 的另加该规格（2,798 条）。

### 3.2 第 2 类：SPDX 正文比对

第一轮阶段 A 因「缺少 `Publisher-declared license` 与 `Evidence` 头部行」交还 64 条。本轮从 `spdx/license-list-data` 固定 tag `v3.29.0` 取 `text/<ID>.txt`，把两侧正文合并空白、去首尾空行后逐字比对。完全一致才登记 `third-party`，license 写该 SPDX 标识，evidence 写 SPDX 正文地址。

完全一致的 5 条：

| 文件                                                                                        | SPDX 标识            |
| ------------------------------------------------------------------------------------------- | -------------------- |
| `third-party/upstream/43070e2d4e532684de521b885f385d0841030efa2b1a20bafb76133a5e1379c1.txt` | `Apache-2.0`         |
| `third-party/upstream/58d1e17ffe5109a7ae296caafcadfdbe6a7d176f0bc4ab01e12a689b0499d8bd.txt` | `Apache-2.0`         |
| `third-party/upstream/a60eea817514531668d7e00765731449fe14d059d3249e0bc93b36de45f759f2.txt` | `Apache-2.0`         |
| `third-party/upstream/cc3273e0694ea5896145e0677699b53471b03ea43021ddc50e7923fbb9f5023c.txt` | `Google-Patent-WebM` |
| `third-party/upstream/cfc7749b96f63bd31c3c42b5c471bf756814053e847c10f3eb003417bc523d30.txt` | `Apache-2.0`         |

其余 59 条正文含具体版权行、或本身不是许可正文（源码头、GitHub API 响应、构建脚本、发行版清单等），与 SPDX 正文不完全一致，继续交还，逐条见第 5 节。

### 3.3 第 3 类：7-Zip / LZMA 公有领域声明

第一轮阶段 A 交还的 37 条 `third-party/native-search/licenses/*.txt` 都是 7-Zip / LZMA SDK 源文件头部注释的原文快照（55–178 字节），正文只声明 public domain（Igor Pavlov），没有对应的 SPDX 标识。按计划书一律登记 `third-party`，license 写 `LicenseRef-Public-Domain`，basis 写明正文只声明公有领域，evidence 写 `third-party/native-search/sources.json`（该文件把这 37 条绑定到 ugrep 7.8.4 的 archive 成员）。

### 3.4 第 4 类：`third-party/` 下未审查文件

开工时 `third-party/` 下 `unreviewed` 实际为 60 条：`source-verification-20261003/` 23 条、`ui/lobe-icons-LICENSE.txt` 1 条、`upstream/*.txt` 36 条。计划书写「96 个」是把第一轮报告里另外列出的同一批 36 条 `upstream/*.txt` 又计了一次（60 + 36）；本轮按去重后的 60 条处理，36 条不重复登记。

- 36 条 `upstream/*.txt`：属于第三方组件的通知正文快照，按所属组件许可登记 `third-party`。license 由正文判定（Zlib 9、BSD-3-Clause 7、FTL 8、MIT 5、CC0-1.0 2、Unicode-3.0 2、ISC 1、libpng-2.0 1、`FTL OR GPL-2.0-or-later` 1），evidence 写绑定该文件的证据文件（`licensing/evidence/skia-*.json`、`material-closure-20261002.json` 或 `third-party/inventory.json`）。
- 1 条 `third-party/ui/lobe-icons-LICENSE.txt`：lobe-icons（LobeHub）的 MIT 正文，随桌面安装包分发（`packages/desktop/electron-builder.config.js` 把它放进 `licenses/`），登记 `third-party` / `MIT`。
- 23 条 `third-party/source-verification-20261003/*`：本项目自己的来源核实记录，按四条条件判定全部通过（首次加入 2026-10-01 至 2026-10-03、无改名或复制、行相似度全部为 0 或低于门槛），登记 `original`。
- 计划书提到的清单数据（`SHA256SUMS`、`sources.json` 等）在这 60 条中不存在，因此本轮没有按「不登记」处理的对象。

### 3.5 第 5 类：本轮新增的记账工具文件

四个工具文件都是本轮新增的源码，按「新文件登记为 original、basis 如实写明」登记，license 与各文件头的 `// SPDX-License-Identifier: MIT` 一致：

| 文件                                                   | license | 说明                     |
| ------------------------------------------------------ | ------- | ------------------------ |
| `scripts/provenance/bookkeeping-round2.mjs`            | MIT     | 判定与幂等追加的入口     |
| `scripts/provenance/bookkeeping-round2-similarity.mjs` | MIT     | 行相似度实现             |
| `scripts/provenance/bookkeeping-round2-history.mjs`    | MIT     | Git 历史与第一轮清单解析 |
| `scripts/provenance/bookkeeping-round2-records.mjs`    | MIT     | 已复核的许可判定数据     |

basis 写明：只读第一轮报告、`licensing/current-files.json`、`licensing/upstream-baseline.json`、Git 历史、固定上游指纹与 SPDX 正文，只写 `licensing/reviews.json`；没有参照或复制任何被替换的产品实现；相似度按第一轮报告第 4 节的算法实现；只用 Node 标准库。

## 4. 判定规则与相似度实现

相似度用与第一轮同一算法：按扩展名分组（ts/tsx/js/jsx/mjs/cjs/mts/cts 为一组，其余同扩展名各自一组）；每行去首尾空白、丢弃空行、只含 `{ } ( ) [ ] ; ,` 的行、`import ` 行、`export * from` 与 `export {` 开头的行，注释保留；对每个候选文件统计「被同一个上游文件包含的候选行数 ÷ 候选规范化行数」的最大值作为包含率，最长连续相同段按（上游文件，位置偏移）对角线延伸求解，同一候选行对同一上游文件只计一次。二进制文件跳过条件 3。

工具：`scripts/provenance/bookkeeping-round2.mjs`（判定与幂等追加）、`scripts/provenance/bookkeeping-round2-similarity.mjs`（相似度实现）、`scripts/provenance/bookkeeping-round2-history.mjs`（Git 历史与第一轮清单解析）、`scripts/provenance/bookkeeping-round2-records.mjs`（已复核的许可判定数据）。四个文件都是本次交付物，已在第 5 类登记为 `original`。

复现命令（在仓库根目录，需要仓库外的上游对象库与 SPDX 正文）：

```text
node scripts/provenance/bookkeeping-round2.mjs plan  --upstream <上游 Git 目录> --spdx <SPDX text 目录>
node scripts/provenance/bookkeeping-round2.mjs apply --upstream <上游 Git 目录> --spdx <SPDX text 目录>
```

`apply` 只追加：读取现有 `licensing/reviews.json`，跳过已存在的 path，按原文件缩进风格追加，重复执行不产生变化（本轮实测第二次 `appended: 0`、文件摘要不变）。重跑 `plan` 复现出的记录与已追加记录逐字节一致。

### 4.1 「首次加入提交」的口径

basis 里的 `Created by Knorvia commit <短哈希>` 记的是**该路径首次出现的提交**（`git log --reverse --name-status -M` 里该路径的最早一条记录），不是 `git log --follow --diff-filter=A` 追复制链之后的源头提交。两者在「同一次提交里复制出一份新路径」的文件上会不同：`git log --name-status -M` 不检测复制，这种文件在历史里显示为 `A`。

跨复制链的源头由条件 2 单独检查：`git log --follow --name-status` 的复制/改名来源是否在 `licensing/upstream-baseline.json` 里。本批存在复制链的证据文件，其来源都在 Knorvia 自己的 `licensing/evidence/` 内、不在上游基线里，所以条件 2 不因此交还；两个口径下条件 1 的结论（首次加入晚于 `7619e41`）也一致，登记决定不变。Lead 抽查 30 条里命中 2 条：`licensing/evidence/desktop-storage-sampler-preparation-owners-20261003/pre-check-snapshots/scoped-static.mjs`（追链源头 `a8a2305a`，路径首次出现 `a99b8e78`）与 `licensing/evidence/desktop-recording-presentation-owners-20261003/retained-shapes.mjs`（追链源头 `3df52de3`，路径首次出现 `b6f2526e`）。

本轮又对第 1 类的 2,947 条逐条跑了 `git log --follow --diff-filter=A` 复核，结果见第 7 节。

## 5. 交还清单

共 59 条，全部来自第 2 类。

| 路径                                                                                        | 原因                                                                                                     |
| ------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------- |
| `third-party/upstream/014bb31e83d5c2e76aea1cc6e82217346ab41362f32cb355ad0f5c10aa0aeaff.txt` | 正文是 Apache-2.0 条款的组件自有版本（含具体版权行或附加声明），与 SPDX 标准正文不完全一致               |
| `third-party/upstream/0a7cda7d15aca7baaa3035e1f90466dde9ecc980c103cd230382d6675714bf2a.txt` | 正文是 MIT 条款，但含具体版权行，与 SPDX 标准正文不完全一致                                              |
| `third-party/upstream/0c74e86d37d6fc7e8f22b4b8e3b801f6737c263c27a71d81c86cd8de0b6a84e5.txt` | 正文是 Apache-2.0 条款的组件自有版本（含具体版权行或附加声明），与 SPDX 标准正文不完全一致               |
| `third-party/upstream/0e80a2d229d2fd4fc7e8636142ec5d0ff0bc031f14c15b682e2ac01dfd5b5138.txt` | 正文是 MIT 条款，但含具体版权行，与 SPDX 标准正文不完全一致                                              |
| `third-party/upstream/1564074e13439397221ffd522e2e504d56561994a23d371aa5e3ad43e4f5423f.txt` | 正文是 MIT 条款，但含具体版权行，与 SPDX 标准正文不完全一致                                              |
| `third-party/upstream/17510cf7a58b4879b887ec05a45d72cf1b73544dd9ec7e72f20110ed104229ee.txt` | 正文是 Unicode-3.0 条款，但含具体版权行，与 SPDX 标准正文不完全一致                                      |
| `third-party/upstream/1a8f1058753f1ba890de984e48f0242a3a5c29a6a8f2ed9fd813f36985387e8d.txt` | 正文是 MIT 条款，但含具体版权行，与 SPDX 标准正文不完全一致                                              |
| `third-party/upstream/23f18e03dc49df91622fe2a76176497404e46ced8a715d9d2b67a7446571cca3.txt` | 正文是 MIT 条款，但含具体版权行，与 SPDX 标准正文不完全一致                                              |
| `third-party/upstream/268872b9816f90fd8e85db5a28d33f8150ebb8dd016653fb39ef1f94f2686bc5.txt` | 正文是 Apache-2.0 条款的组件自有版本（含具体版权行或附加声明），与 SPDX 标准正文不完全一致               |
| `third-party/upstream/2711a8b5a5cdfef0e639f96c1aca12ae23d7d64a02d0507f1bdf14d2b27bbc3a.txt` | 正文是 CC0 条款的组件自有版本（含具体版权行或附加声明），与 SPDX 标准正文不完全一致                      |
| `third-party/upstream/3007cd45c9afdf93812c0c8a7643ea32a7db0b24e495dc0f2312c8a43990b0dd.txt` | 正文是 Apache-2.0 条款的组件自有版本（含具体版权行或附加声明），与 SPDX 标准正文不完全一致               |
| `third-party/upstream/31b15de82aa19a845156169a17a5488bf597e561b2c318d159ed583139b25e87.txt` | 正文是 MIT 条款，但含具体版权行，与 SPDX 标准正文不完全一致                                              |
| `third-party/upstream/34dee5fd5e5cc756efb5ad4d64652bce719bdf5e900ca5d7538253e737930bc4.txt` | 正文是 MIT 条款的组件自有版本（含具体版权行或附加声明），与 SPDX 标准正文不完全一致                      |
| `third-party/upstream/37398454f23ddeb02f0b81113fef9ebdc4571b7297cb6e18376c1ccb9bb1453e.txt` | 正文是第三方组件自有的许可或声明文本（含具体版权行），与 SPDX 标准正文不完全一致                         |
| `third-party/upstream/3d180008e36922a4e8daec11c34c7af264fed5962d07924aea928c38e8663c94.txt` | 正文是 MIT 条款，但含具体版权行，与 SPDX 标准正文不完全一致                                              |
| `third-party/upstream/417fa227d75b1e22a15d8389ca8b5e8b7b86241c3b1b17288d20523016ef6fa6.txt` | 正文是第三方组件自有的许可或声明文本（含具体版权行），与 SPDX 标准正文不完全一致                         |
| `third-party/upstream/4a1d35b6325ede5ff9fc338fe7e6fdcaa9fe770767a0114242b817dcba28253f.txt` | 正文不是许可正文（接口响应、构建脚本或数据文件），无法与 SPDX 许可正文比对                               |
| `third-party/upstream/508d4676d4083e874df706f302d9d42e5e7f9aed3f5a7ea614dc6d2b2252a22f.txt` | 正文是 Apache-2.0 条款的组件自有版本（含具体版权行或附加声明），与 SPDX 标准正文不完全一致               |
| `third-party/upstream/5129f8779dca579cfcb235570688a2f15822b270575e04f27ef906aabbcc0355.txt` | 正文是 MIT 条款，但含具体版权行，与 SPDX 标准正文不完全一致                                              |
| `third-party/upstream/52412d7bc7ce4157ea628bbaacb8829e0a9cb3c58f57f99176126bc8cf2bfc85.txt` | 正文是 MIT 条款，但含具体版权行，与 SPDX 标准正文不完全一致                                              |
| `third-party/upstream/52c49219748499a9a56e0d8d10a73a2d7741f5ecf5c88bdff30593599d6dfbb6.txt` | 正文是 Apache-2.0 条款的组件自有版本（含具体版权行或附加声明），与 SPDX 标准正文不完全一致               |
| `third-party/upstream/539dd7aed86e8a4f12cbdd0e6c50c189c7d74847e4fecc64ce2c6ee3a01da38b.txt` | 正文是 MIT 条款，但含具体版权行，与 SPDX 标准正文不完全一致                                              |
| `third-party/upstream/59c38e93a395817bc9d674d868af7c062fcea8b37468af8b3f6f075133eb1756.txt` | 正文是 MIT 条款，但含具体版权行，与 SPDX 标准正文不完全一致                                              |
| `third-party/upstream/5a5ee54c5001bbad1cdc1a57cc3dd4c42199b2da09d39c7ee41fab002d02967f.txt` | 正文是 FreeType Project License 条款的组件自有版本（含具体版权行或附加声明），与 SPDX 标准正文不完全一致 |
| `third-party/upstream/5aec868f669e384a22372a4e8a1a6cd7d44c64cd451f960ca69cc170d1e13acf.txt` | 正文是 BSD-3-Clause 条款的组件自有版本（含具体版权行或附加声明），与 SPDX 标准正文不完全一致             |
| `third-party/upstream/5f745b8244890bde0a2258fe32342d60c577fad043e8601d923690a5bfe1b54f.txt` | 正文不是许可正文（接口响应、构建脚本或数据文件），无法与 SPDX 许可正文比对                               |
| `third-party/upstream/5f787c1dee3c56547f09ccc2906ab5f5293c4d8dd6c8654e573216c38e908dbd.txt` | 正文是 BSD-3-Clause 条款的组件自有版本（含具体版权行或附加声明），与 SPDX 标准正文不完全一致             |
| `third-party/upstream/66aa9feab8bb39aceebd69f2a357015d57ceab486d3c7a19ff8d3d4110a6d101.txt` | 正文是 MIT 条款，但含具体版权行，与 SPDX 标准正文不完全一致                                              |
| `third-party/upstream/6ae13df543a24b3fb18c25182cf4f084132f799ea9225410f7037888401b7469.txt` | 正文是 MIT 条款，但含具体版权行，与 SPDX 标准正文不完全一致                                              |
| `third-party/upstream/75815e3bf6484201a3c3d17a1bbf10f2e8e3237f84df10a2357ea896db2a81d6.txt` | 正文是第三方组件自有的许可或声明文本（含具体版权行），与 SPDX 标准正文不完全一致                         |
| `third-party/upstream/8405932022a556380c2d8c272eff154a923feb197233f348ce5f7334fb0a5ede.txt` | 正文是 BSD-3-Clause 条款，但含具体版权行，与 SPDX 标准正文不完全一致                                     |
| `third-party/upstream/8802fecf9da4367bc23bcf20b21cc143785fc6c92b152f3fa7fbe6ce08d344d6.txt` | 正文是 MIT 条款，但含具体版权行，与 SPDX 标准正文不完全一致                                              |
| `third-party/upstream/8a1efa755d19446b51a18e1c15f6308728da0b36283c4d38050698ad6954b69a.txt` | 正文是 MIT 条款，但含具体版权行，与 SPDX 标准正文不完全一致                                              |
| `third-party/upstream/91915f8ae056a68a3c5bdf05d9f6f78bb6903e27a8ca3a8434c9e4ac87300575.txt` | 正文是第三方组件自有的许可或声明文本（含具体版权行），与 SPDX 标准正文不完全一致                         |
| `third-party/upstream/9480271317925265e806a9a196aaa33410a962fa9d4d1e248a4a5187bc8c9df9.txt` | 正文是 MIT 条款，但含具体版权行，与 SPDX 标准正文不完全一致                                              |
| `third-party/upstream/96f5b328adbb78eeaaec6980d73fd558cb1e4d62560ed615646bc3cf5e532430.txt` | 正文是 BSD-3-Clause 条款的组件自有版本（含具体版权行或附加声明），与 SPDX 标准正文不完全一致             |
| `third-party/upstream/96f73f9d2a16c21a36b418f06073be26e7d6d5e7c1bc99756b21a4f2c74ef171.txt` | 正文是 MIT 条款，但含具体版权行，与 SPDX 标准正文不完全一致                                              |
| `third-party/upstream/992490064b90ec94c302fe5f29dcc14cb44145857064e46f9ffe6c8f511c1093.txt` | 正文是 MIT 条款，但含具体版权行，与 SPDX 标准正文不完全一致                                              |
| `third-party/upstream/9b405ef4c89342f5eae1dd828882f931747f71001cfba7d114801039b52ad09b.txt` | 正文是 Apache-2.0 条款的组件自有版本（含具体版权行或附加声明），与 SPDX 标准正文不完全一致               |
| `third-party/upstream/9b7a157a0079ef346f3215b964071fa460d0dd251ca93cbf581bcc91595066ca.txt` | 正文是 MIT 条款的组件自有版本（含具体版权行或附加声明），与 SPDX 标准正文不完全一致                      |
| `third-party/upstream/a37e0e9697144819e1d965176ac4ae5bc3fa02d11e7812036bbcadf6dafe2400.txt` | 正文是 MIT 条款，但含具体版权行，与 SPDX 标准正文不完全一致                                              |
| `third-party/upstream/af0d7d2cef91fc243cf4ad98570b03d1f26f5e0227cad0f5f4a7376e2feb3160.txt` | 正文是 MIT 条款，但含具体版权行，与 SPDX 标准正文不完全一致                                              |
| `third-party/upstream/b4f9adb7c568904834d0dd6cc98d16c390d21ca32fc17ae7a267715269bd5529.txt` | 正文是 Apache-2.0 条款的组件自有版本（含具体版权行或附加声明），与 SPDX 标准正文不完全一致               |
| `third-party/upstream/ba8f810f2455c2f08e2d56bb49b72f37fcf68f1f4fade38977cfd7372050ad64.txt` | 正文是第三方组件自有的许可或声明文本（含具体版权行），与 SPDX 标准正文不完全一致                         |
| `third-party/upstream/bdb0a645ea18c60507d0368379b1ac5474b92255fcc2d115e07486a7672ba526.txt` | 正文是 libpng-2.0 条款，但含具体版权行，与 SPDX 标准正文不完全一致                                       |
| `third-party/upstream/c2cfccb812fe482101a8f04597dfc5a9991a6b2748266c47ac91b6a5aae15383.txt` | 正文是 MIT 条款的组件自有版本（含具体版权行或附加声明），与 SPDX 标准正文不完全一致                      |
| `third-party/upstream/c5adaf9051f20a1bbeecfb39de415cac1fef591d4fcda2b55d66b31354fdba1e.txt` | 正文是 MIT 条款的组件自有版本（含具体版权行或附加声明），与 SPDX 标准正文不完全一致                      |
| `third-party/upstream/c8b789cf5a746611e6300a0cc7750dbf92b61912a709d04e639245f7290656d0.txt` | 正文是 BSD-3-Clause 条款的组件自有版本（含具体版权行或附加声明），与 SPDX 标准正文不完全一致             |
| `third-party/upstream/cb992262f361a5359e6771c28740d33c7041e15332ae8537fae40538992591a9.txt` | 正文是 MIT 条款，但含具体版权行，与 SPDX 标准正文不完全一致                                              |
| `third-party/upstream/cdab3014d4f69b49dde2b85e81792208c72de613aa6aed7f7a9b5c6609b89670.txt` | 正文是 MIT 条款，但含具体版权行，与 SPDX 标准正文不完全一致                                              |
| `third-party/upstream/cf81859d85e99ff2fad83d51d9dfd85ca5189b23c4442aacf1890c54665d92f4.txt` | 正文是 MIT 条款，但含具体版权行，与 SPDX 标准正文不完全一致                                              |
| `third-party/upstream/d65ff929f8a373ea16b21d45d5489557d51389ba6583a5c9959d5487c02ce965.txt` | 正文是 CC0 条款的组件自有版本（含具体版权行或附加声明），与 SPDX 标准正文不完全一致                      |
| `third-party/upstream/da6d3703ed11cbe42bd212c725957c98da23cbff1998c05fa4b3d976d1a58e93.txt` | 正文是 MIT 条款，但含具体版权行，与 SPDX 标准正文不完全一致                                              |
| `third-party/upstream/e1cfcc55c325b3f78cf55df9664abaa066e2271dffe8213347d9fccdfbac8f2c.txt` | 正文是 Zlib 条款，但含具体版权行，与 SPDX 标准正文不完全一致                                             |
| `third-party/upstream/e2b35be49f7284a45b7baca8fc7b3ab7440e7902392b2528a457816b5bb2a15c.txt` | 正文是 MIT 条款，但含具体版权行，与 SPDX 标准正文不完全一致                                              |
| `third-party/upstream/e49e62397b603438476e0d6b5ca3b6e6d4f23a80594e596aff29ac04fa3e1b1c.txt` | 正文是 MIT 条款，但含具体版权行，与 SPDX 标准正文不完全一致                                              |
| `third-party/upstream/ebb2e920800c6353474e3e23d84f714ee8aaecd8f5a71851aa03594a4129d855.txt` | 正文是 MIT 条款，但含具体版权行，与 SPDX 标准正文不完全一致                                              |
| `third-party/upstream/f9bc4423732350eb0b3f7ed7e91d530298476f8fec0c6c427a1c04ade22655af.txt` | 正文是 MIT 条款，但含具体版权行，与 SPDX 标准正文不完全一致                                              |
| `third-party/upstream/fc7d762e0ebf8720d0a03cf00058aaa3a198347e9651be2f50a25e3b3ec13985.txt` | 正文是 MIT 条款，但含具体版权行，与 SPDX 标准正文不完全一致                                              |

另外，第一轮只因条件 4 被交还、且落在修订后条件 4 范围内的 1,015 条产品源码与测试文件本轮继续交还（不在本轮处理范围，由 M0-2/M0-3 处置）。

## 6. 不登记的例外

- 本报告文件：它是本次工作的交付物，评审期间还会修订，登记会立刻过期，因此不登记，在 `licensing/current-files.json` 里显示为 `unreviewed` 并在此书面列出。本轮新增的四个工具文件已在第 5 类登记为 `original`。
- 第一轮「清单数据（按规则不登记）」的 8 条本轮不变。

## 7. 门禁与验证

| 检查                                        | 结果                                            |
| ------------------------------------------- | ----------------------------------------------- |
| `pnpm provenance:report`                    | 通过（reviewProblems = 0，missingReviews 为空） |
| `pnpm provenance:check`                     | 退出码 0                                        |
| `pnpm fmt:check`                            | 退出码 0                                        |
| `pnpm lint`                                 | 退出码 0（1 条既有 warning，见第 8 节）         |
| `pnpm typecheck`                            | 退出码 0（含 `i18n:check`，5,573 个键一致）     |
| `pnpm architecture:check`                   | 退出码 0，violations 0                          |
| `node scripts/check-evidence-integrity.mjs` | 退出码 0（6,031 文件 / 69,654,143 字节）        |
| `scripts/provenance/*.test.mjs`             | 8 个通过；4 个在 main 上同样失败，见第 8 节     |
| `pnpm build:cli-packages`                   | 退出码 0                                        |
| `pnpm knip`                                 | 与 main 逐行一致（退出码同为 1，见第 8 节）     |
| 远端 CI（Linux + Windows）                  | 两个 job 都 success，见第 8 节                  |

以上本机门禁全部用 `mise.toml` 固定的 Node v24.14.0 运行（本机 PATH 上是 Node v26.3.0，与仓库固定版本不一致）。全量 `pnpm test:studio` 不在本机跑：本机同时有多个 `test-studio.mjs` 争抢资源，超时结论不可信，改用 PR 的 CI 结论。

## 8. 声明与偏离

- 本报告只登记来源事实，不代表任何文件已独立替换；basis 里的相似度数字都是本轮实测值。
- `licensing/reviews.json` 的改动是纯追加：相对 `6ea4cbe7` 增加 36,757 行、删除 0 行。
- 全量离线回归与双平台质量检查以 PR #103 的 CI 为准：run 38130284236（head `9f390f40`）的 `linux / quality`（13m56s）与 `windows / quality`（23m1s）都 success。
- 第 4.1 节口径的复核：对第 1 类的 2,947 条逐条跑 `git log --follow --diff-filter=A`，345 条存在复制或改名链，358 条的追链源头提交与 basis 记录的「路径首次出现提交」不同；**345 条的链源头没有一条在 `licensing/upstream-baseline.json` 里**（源头都落在 Knorvia 自己的 `licensing/evidence/`、`docs/evidence/`、`docs/`、`apps/cli/packages/core/test/` 与 `packages/desktop/build/`），所以条件 2 在更严格的追链口径下同样不交还，登记决定不变。
- `pnpm lint` 在本分支与 main 上都是 1 条既有 warning（`scripts/packaged-runtime-evidence.mjs:121` 的 `no-control-regex`），与本任务无关。
- `pnpm knip` 在本分支与 main 上都以退出码 1 结束。把两个命令行入口加进 `knip.json` 根 workspace 的 `entry` 后，本分支输出与干净 main 的输出**逐行一致**（2,850 行，只有回显工作目录的两行不同），unused files 都是 1,774 个：没有新增未使用文件或导出。
- `scripts/provenance/dependency-history-qa-regressions.test.mjs`、`retained-npm-notices.test.mjs`、`services-lane-current-fast-20261001.test.mjs`、`services-lane-fast-20261001.test.mjs` 在本分支失败，但在未修改的 main 检出（`6ea4cbe7`）上用同一 Node v24.14.0 运行也失败，退出码都是 1，属既有失败。
- `THIRD-PARTY-NOTICES.md` 本轮没有重新生成，原因两条，都先在干净 main 上复现过：一是 `node scripts/licenses.mjs notices` 在 Windows 上因 fd 上限 8192 触发 EMFILE；二是已提交的第三方声明相对 `pnpm-lock.yaml` 已经过期（锁文件是 `axios@1.20.0`，`third-party/inventory.json` 记录的是 `1.13.6`，其依赖还缺许可正文）。已合入 main 的那份 `THIRD-PARTY-NOTICES.md` 同样复现这两条。本轮只追加来源记录，不改变实际分发材料，因此不在本任务内修。
- 本轮没有修改任何产品代码、测试、`specs/`、`docs/evidence/`、`licensing/evidence/` 与 `licensing/upstream-baseline.json`；除 `licensing/reviews.json` 与 `licensing/current-files.json` 外，只改了 `knip.json` 的根 workspace `entry`（接入门禁所需的两个命令行入口登记）。
