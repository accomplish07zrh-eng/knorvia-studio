<!-- SPDX-License-Identifier: MIT; Copyright (c) 2026 Knorvia Studio contributors -->

# MCP 客户端来源依据

逐文件范围为十三生产源、十九测试源和三份规格/验收/依据。根亲自按批准功能合同和有限公开声明设计并编写源码；测试作者独立编写冻结测试；另一代理先验收旧版再读候选正文与运行候选。主仓整合未依据运行失败修改候选生产逻辑。

根在本批之前看过旧入口前95行及较多相邻MCP、认证、网络、遥测上下文，不能称为全过程clean-room。未重新阅读旧入口完整实现、旧测试或旧bundle来实现候选。合同准备者完整接触旧实现；独立测试作者没有读取候选。验收者先枚举候选文件元数据的事实、输入摘要晚于部分阅读的事实和全部首次失败均公开在[验收](../../docs/knorvia-mcp-client-acceptance.md)。目录隔离、MIT头、摘要和测试通过不单独构成权利保证；第三方SDK及接口仍保留其适用权利。

## 冻结与验收摘要

| 证据                                  | SHA-256                                                            |
| ------------------------------------- | ------------------------------------------------------------------ |
| 批准输入 manifest.json                | `b73b249d264cccce33ffcf3fb3385ebf75b168e8b12fb1107d98fc56bf54d87a` |
| 诊断澄清 diagnostic-clarifications.md | `6bd2be5829277fbd72b370719d4a8f914a2ce2dfaf3d2c86d6b16801414a3e8e` |
| 候选 design.md                        | `da5bc0ef8a4d482d36bf19b591d74bad722e399d8d78e359068522b0f2b56bcb` |
| 候选 implementation-report.md         | `e6fbcff45b76c2aa784c0f44d4209387ce9b85ed788dd7158e0128c6cf07ef5e` |
| 候选 frozen-source-hashes.json        | `569b76d2edd7f371938db1b78bdb60066b154b9b6bfd8306a4da1d103ce49241` |
| 验收 acceptance-report.md             | `e406803dbf88e102ebf2e9295573c00d8b93da0ed2072d6aa4fc3138b62335cf` |
| 接受测试 accepted-test-hashes.json    | `9eed1be204ff7cf00384b1cc4389a03cc7aeeebd108ff171f7ff1efab0879420` |
| 测试原稿至接受稿累计 patch            | `d4ca728227654614dc12c5ca329ed0eed6726027321e9880d152d14954bc4cc9` |
| old-first 最终 TAP                    | `3a1f2edf44fba77dffa433285cfafab966a4c2283f98a090acb867026f02ba27` |
| candidate 首次 TAP                    | `b4216dd3f1814724efd7c357f3fc1b49776b050e1103d254ceed7ae9b676a7b8` |
| 主仓整合收据（格式化前）              | `01dbd7d195dd7303554d26ba16031634aa1b7e419a7dcbef9b408458c313c0a0` |
| 十八文件擦除类型后等价检查            | `1ba9d1df2e4c3a89d3f616d0b8cbc50de56a4d89f34347352beb9884040f4a25` |
| main-source receipt                   | `3d94177b37a64fc232069bd7d7d721aae7c70f970e07f6a0c4a64f2a8f6763e7` |
| main-compiled receipt                 | `9a9201b10be5e7e66a7faad724b399e281f7177101fef0afaa7d0970e61d499c` |
| CLI 可达产物身份                      | `debbe0d0480982b2965b92ac083ca9d772ee5f3c95079ed5786a411c1913951a` |
| 完整回归日志                          | `e6fe60bdbbdc37a243d313b2dae58bf727f321c3cc12b2aae12b543483c81b06` |

原独立测试manifest SHA-256为39a2ee3c69ef9ea5375ef5962276d6763c08fb4641e45e30b07915f35f02ad00，包含十九TypeScript、package及tsconfig。批准输入26项和另附3000字节诊断澄清均重新校验；测试21项、候选十三源和旧77649字节入口摘要匹配。旧入口SHA-256为210c257b4e38137190231d455f38760993b72e6552a7f36a52a998da74eb7798；整合前主仓与其一致。

十三生产源在最终冻结、候选验收、主仓整合及产物构建期间保持字节一致：

| 文件                 | bytes | 物理行 | SHA-256                                                            |
| -------------------- | ----: | -----: | ------------------------------------------------------------------ |
| client-api.ts        |  6100 |    182 | `bff1d4cb3566cfd24ad7af4c5a781a2d4d45ac5c242d715258c06c843cc05d95` |
| client-auth.ts       |  5770 |    153 | `2213fc637f96a67b12ccdf36535f21eaca9ad1885da4191b20e074c63b2f9c59` |
| client-cleanup.ts    |  2719 |     82 | `66cdf6b49e02d642f82bb55b8e718a827dc3ab0c258a67692b0cd1c92f4b2cac` |
| client-connection.ts |  9647 |    274 | `93beffb013c1ff4ca6ade4f6c9ec4706040166099fcb54719756640151f592df` |
| client-context.ts    |  2259 |     54 | `5aedce6cdaa58f93022a3a1cbb5084ea408dc7523fbd5178cfaf95964479e11d` |
| client-lifecycle.ts  |  4977 |    143 | `88ffe44f3176746df5bc1aa97a771bd40a85c8cee677bfc7281553451da341ca` |
| client-official.ts   |  4814 |    140 | `9b899c318378d8118983f6071293186a649aa98f8eebceaced4ebcfa38636a20` |
| client-state.ts      |  5327 |    154 | `8a78473356a5aa1085adc0ef454a521d3f0bac7dd4ae3fb276d1722465559625` |
| client-stdio-log.ts  |  2261 |     66 | `0f3d732fa8110605eabdabf2158a359d72a17ab6419bdff1dfc6d2e92f828245` |
| client-tools.ts      |  6824 |    174 | `2a57782f6fdee64118748f812b5ebd595417c312551c17d2b39df267439f76c1` |
| client-transport.ts  |  3194 |     82 | `5d45a52571a48cff9930034f874dc2394c0fef03fd1011b028dfed626c734d60` |
| client-wait.ts       |  1409 |     43 | `b886de0898b447975597e7b4ca8ac405e416442c16c53835a4a3ec5174217436` |
| index.ts             |  1203 |     40 | `bf55f9d8eff4cb4073cd0eb578a5acb8b7b49042be89854bc27296ece758b693` |

## 实际复核与限制

旧版接受测试81项全过之后才开始候选正文复核与首次候选运行；候选81全过。七个测试文件有明确批准的夹具/合同修正，另增一项真实rejected-wait分支；累计patch为事实依据，不把首稿80项直接称为最终81项。旧/新副本十八非映射文件一致，bundle仅绑定不同fixtureRoot。

主仓十三源保持冻结原样；十九测试加MIT头、重定位和内存loader；十八非loader文件的规范化擦除类型JavaScript一致。主仓source81、确切CLI产物81与整仓3693均通过，类型/lint/架构/构建通过。测试验证公开端口、返回引用、日志及保留依赖调用，不窥候选私有状态布局；保留依赖替身并非十三目标实现替身。

真实网络/OAuth网站/凭据、实际MCP服务器、OS信号和native ABI、本批远端CI及安装包没有被本组owned seams证明。完整替换目标、整个应用的许可调整及最终稳定发布尚未完成；这里的独立替换与MIT决定仅绑定reviews.json的确切文件摘要。
