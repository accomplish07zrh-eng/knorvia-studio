<!-- SPDX-License-Identifier: MIT; Copyright (c) 2026 Knorvia Studio contributors -->

# MCP令牌刷新协调器来源依据

具体内容复核范围为一份实现、四份新测试及规格/验收/本依据三份文档。根完整读旧291行正文/公开声明后编写行为合同；独立合同审阅补两处边界，源作者和测试作者分别在隔离目录先设计后表达。候选220行将锁内操作作为一个协调器的局部回调，按discovery、exchange和外层锁明确错误边界，仅同步fallback助手处理现有令牌/temporary选择；原生path及共享锁、凭据、SDK保持各自所有权。未增加复制的状态或写入路径。

源作者批准输入共14份，测试作者在其基础上获批lint配置共15份；原始inventory没有改写，新增输入各有摘要。两者披露此前上下文，未手读旧/主仓正文、历史、其他任务候选、旧测试/观察/bundle或对方产物；根拥有行为验收。候选作者编译程序303输入：1候选、8批准产品声明、294标准/SDK/传递声明，其他产品正文0。测试作者审计332个TypeScript readFile输入，含4自有测试、批准声明、标准/SDK声明与包元信息，不能与候选的program input口径混用。工具/清单只证明所记录范围，不是OS级访问审计或全流程clean-room。

源作者首草稿209行8057字节（e9616e79f3e873e2f985f37aa9b8fa5f312806092802a57edb9499a880cbec0c），首格式版217行8165字节（9d07dc2669780950c02adde47dc2aaa681726f540ee14f83b26919ec7b3f806f）。首轮SDK类型1诊断与lint2诊断保留；只作fresh空对象的编译期类型断言及去除冗余spread，最终220行8232字节。源作者不执行候选/测试。测试作者的首次metadata类型、格式、审计助手ESM错误以及93/94规则差异也保留。根完整审阅测试并先跑旧实现，后审阅候选设计/源/report；全部27项首次运行通过，无运行反馈修订。主仓接入只调整测试头和平台绑定，不改变断言。

源码、实际CLI产物27项和完整3452项结果详见[验收](../../docs/knorvia-mcp-token-refresh-acceptance.md)。源文本的具体表达、设计和读取证据共同支持本批文件审阅，不能仅凭头注、改名、代码变短、标准语法、协议字段或通过测试认定原创。保留SDK、共享锁、store及其适用权利，不把它们算作本批独立实现。根Apache与preview身份保持，整仓MIT/稳定发行尚未完成；本记录不是法律保证。

| 证据                                | SHA-256                                                          |
| ----------------------------------- | ---------------------------------------------------------------- |
| 根合同                              | 09b9c2cff03093961ddd182c7ca389386ebf8f799c9dfad05ffcb9f9db84ce46 |
| 合同审阅 report.md                  | c102572619b28e9c7affa21ac174f7c1c9d4db212b2115b3ea25168b73cc4d44 |
| 合同审阅 read-inventory.json        | 002879eaffe1c0a9f834086f68a1ac34dc93e1ad1f60798625281daf2c6f970e |
| 合同审阅 receipt.json               | 40a0d02600055aebddc2b4ddf43adcf894c9e88314c172c7ab3254ae080b40b9 |
| 批准输入 behavior.md                | 09b9c2cff03093961ddd182c7ca389386ebf8f799c9dfad05ffcb9f9db84ce46 |
| 批准输入 input-hashes.json          | 3a6a3436fb821dce91f5573fa74392f59bd68174c88a4dd04b24a4a851f02d3f |
| 批准输入 clarifications.md          | 64d86fd8a47097a58f8e1b7497a4cfc1d0e1f9819ab9416fe183daa3c11e8105 |
| 批准输入 sdk-public-symbols.md      | 3c6f6a300e32ee247a69c7bb29807c6f6ff0400428fbf98663abb21bccf8f1db |
| 批准输入 acceptance-oxlint.json     | 6ed6efbcb42ca90634932f50e574e8587b90b472e393620d826d07f725acd824 |
| 源作者 design.md                    | ca56b04c899f3a79ac708427a969f3ae2a7bd51acf09e15aa0486d5911188031 |
| 源作者 implementation-report.md     | a3541dc08e1f78ba83849b9bbdc0c129613d7d26c98979f2002a9ada21eb8c0a |
| 源作者 approved-inputs.json         | 7cfc1391e11057433c4d99e7879f75ca7ae29cdac76eb90f8d13e7de552fe94d |
| 源作者 compiler-inputs.json         | 9bdb3dc95e388bdd6d88985863cd740b9a84b3cf573a85e125a5bdd3d9fde2ae |
| 源作者 static-correction-record.md  | b5ee913ed008208d0524671bf4e39fcedd95515bac7710bacd82adbc61c50699 |
| 源作者 frozen-source-hashes.json    | 6693ae3a3d77e02f40fb0f15e0e66f3305faf3dafc33daffa9759cc55d6b9fd4 |
| 测试作者 design.md                  | f4639ba98a72f83c66c470ecb2415e5863d73facc51ecca5794cf6ed432fa01f |
| 测试作者 report.md                  | 326a95687f1d893a763eadecdb6f173ce1e4f60d8e30b13b702f02f477b0a78a |
| 测试作者 approved-inputs-final.json | 53e44dcf71c5f53981b944a5425780567f2d41b34dcf543cfbc099f56ff64c6c |
| 测试作者 automatic-type-inputs.json | 8df6a5591a684e666cb1b7d2d04969481bd3e21e685c08cafab19342961dd547 |
| 测试作者 manual-public-inputs.json  | 47a1eca211d18b5d2e96551b8fa22e427b97ae2bf9f96a9cfcc5d83a11a4c151 |
| 测试作者 frozen-output-hashes.json  | 110efa7c5555e516e70549f50a1ec10d6b080a3f7336105ebb1d5ebadd4fa3ce |
| 运行 old                            | 660dd3afb1e5bf43d37781f9eb4887c8242000db7c0f16d831d045c6abb2e95f |
| 运行 candidate                      | df4e56ef229b2400e90068b76ad3eb8d0c3de18a9273d2c53d5e2b1fa4c78401 |
| 运行 main-old                       | bfd4007791525f8d271473ae6a6f10db10f3af5b23eb3c628ce8fbe82f36d3d4 |
| 运行 main-source                    | 7c1f252adeee7ddad592677a369477e88fe9b18dbbefe681ffa8b3e789c88da7 |
| 运行 main-compiled                  | 9082e4793cc9aeba8561fc7398eb9685d188d55d3937f09690278fe624676bb4 |
| 新oauth-refresh.ts                  | f16bcc6808082eba8e38f67e7a34eaa9dc7f6a6897af8416ca287932b3e9d3aa |
| 旧oauth-refresh.ts                  | a95dba3641ccebf793afe19d064ed7ee743d50c6ce39d02de78a687cc0987574 |

仓外保存原始批准输入、设计、初稿/静态修正、输入清单与首次运行日志；仓内保留先行规格及实际结果。文档收尾全仓格式首轮仅reviews.json失败，后续格式化/核验另存日志，不覆盖首次结果；提交前GitHub TLS查询失败不冒充远端已核验。
