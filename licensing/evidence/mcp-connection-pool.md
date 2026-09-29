<!-- SPDX-License-Identifier: MIT; Copyright (c) 2026 Knorvia Studio contributors -->

# MCP连接池来源依据

逐文件复核范围：两源、六先行测试与规格/验收/本依据三文档。根与合同准备者完整接触旧464行正文及公开接口；源作者与测试作者分别仅获准行为、三份有限声明、工具规则/范围及输入摘要，共七份初始输入。startup的enabled/connected计算和可选telemetry参数求值边界，作为作者提问后的独立附加合同记录，不重写初始清单。

源作者先设计pool持有唯一连接/lease状态，identity伴随只负责等价值和context投影，再独立写363/52行具体表达。未复制adapter、telemetry、transport实现或新增第二事实owner。工具前原稿、首次格式后文本、首次lint两警告及保留快照遍历的修正均留档。两次compiler program196输入各含2候选、2批准声明、192标准/第三方声明，其他产品正文0；此计数不是手工阅读或OS审计。合同准备期间实际telemetry.d.ts随前批构建改变，首读与最终摘要分别保留，公开接口相同；作者只使用根批准的有限声明，未覆盖初始记录。

测试作者先设计五组公共行为验收，再写33项及381非空行fixture，实际compiler读取219路径，标准类型/metadata解析单独记录。首轮格式8目标失败保留，之后只有formatter修正。根先完整读六测试及设计/报告，旧33全部通过之后才完整读两候选/设计/报告并运行。候选、主仓旧/新与实际CLI产物各33通过，无运行反馈修订、修改断言或私有状态匹配。完整3542项及真实CLI可达dist摘要见[验收](../../docs/knorvia-mcp-connection-pool-acceptance.md)。

作者披露保留先前上下文，包括之前telemetry材料里的pool调用者职责摘要；本批未手读旧pool实现、历史、旧测试/probe/bundle或对方输出。目录边界是程序性分工，有限声明/编译清单不等于OS沙箱或全过程clean-room。标准算法、字段、协议、消息、接口、MIT头及测试通过不能单独建立作者权利；具体设计、表达与记录共同支撑逐文件决定，非法律保证。

native crypto/timer、adapter、telemetry、公共协议与其他依赖继续各自适用权利，不把它们算作本批重建。既有并发/关闭/失败限制按合同保留。根Apache、preview与整仓迁移状态不变，没有宣称整仓MIT或最终稳定发布完成。

| 证据                                         | SHA-256                                                          |
| -------------------------------------------- | ---------------------------------------------------------------- |
| 合同准备 contract.md                         | 1a7f7424f404809946a127085ed60999aaffbfa2667712e2d2ac40ac1afa76d3 |
| 合同准备 read-inventory.json                 | 66560f54cdd8b3cd906da4953797ae8208f2f68906fb1e74fcf28bc486434cc7 |
| 合同准备 review.md                           | 4680f7f570c407d1f8d854d00c174e7bed8ad44a479b45496f997f1cf5173fb2 |
| 合同准备 receipt.json                        | 252f486df4e69c7bcf348ea9dc2ada7242eb08695a44a60e71c57a3e0277365f |
| 批准输入 behavior.md                         | 1a7f7424f404809946a127085ed60999aaffbfa2667712e2d2ac40ac1afa76d3 |
| 批准输入 input-hashes.json                   | 166710e61b899af8eaabe240861b56db2d40f4966c5e7a2152988a7e71e10b73 |
| 批准输入 dependency-policy.md                | b583cf1bc94e5e2be9536f8b74c9092069becdc7a116297dca7228084f113117 |
| 批准输入 startup-evaluation-clarification.md | 136297ea1ede63892b811cc3ef848519e798af7dce16955c10baae1adf9e6656 |
| 源作者 design.md                             | e43d0ec7668e8d32d7266e00c7f67748ae2e22f3732caf427ac220f86f96d1ef |
| 源作者 implementation-report.md              | 2045b4edae7c5bd546db0c5328ca8dbfcd99e43ae3981252874f28226a7ff854 |
| 源作者 approved-inputs.json                  | 9fdd75bb8b22cef8015a22d3fa31283ff72162e003c03b564a6fa37c8235ba70 |
| 源作者 additional-inputs.json                | 66e3840f7c31e81bf2a3940335ad2257315359950aab55b6221c9987f695c7b0 |
| 源作者 compiler-inputs-first.json            | 503b70f7a46f673717734ba5140e7010cd7197a1488ffac4f1ec61d72d8a1d66 |
| 源作者 compiler-inputs-final.json            | 20233c9e24513e07223f7fdd03b5b232c9cf79bc25a0c6b55cbb7f1811e1588a |
| 源作者 first-draft-hashes.json               | d7e90a33a7b281241d424609f21f0e8df7448b08d9f30999340d822523bbae4c |
| 源作者 frozen-source-hashes.json             | 8b2dacd053affb0e83709efff1733084a3c44f9927658aa45b49d26d9e5beef2 |
| 测试作者 design.md                           | fb2e925cbfc8c71d77fea3bd9ee09585878c314a7a96e92e09878489b0a1f9e1 |
| 测试作者 report.md                           | d3846016294e99be6425533b46d01c1c08ef520bab013418ff2a57c15e44f952 |
| 测试作者 input-hashes.json                   | b4f31f02d785e91cc3a24177f1570cea51065a29ff0a61752ff32e3c018e2fc8 |
| 测试作者 startup-addendum-input.json         | 653944cd108a61d7755c0f33608772a14fc0f80ab7f94af5c08b71afbe23ea1b |
| 测试作者 test-freeze.json                    | 13ad2e82008b69e9ea291d2cb35892ba55808a950cd5be2a14aa2fec216cce62 |
| 测试作者 checks/final-compiler-inputs.json   | 62897d4926035dad4973a021ef65ac4b76ac6883f3a8185164a9c92df5a6b3ca |
| 运行 old                                     | 04ae28ddcea0ba33444efbaaaf63f1bcb54722ddaed8c6ce4abdac1eeac5aa94 |
| 运行 candidate                               | 925fee9a50bfaca792fe50f6b944433fbf628ffd1e3c3bcb808456c92ab8f9ec |
| 运行 main-old                                | 3ec37a721599e9731f4b77c0a0d71cd0e8601fff991fa57be7c5c18ff630a8fc |
| 运行 main-source                             | d790cf1d4465cc656aba93ae0f459966f626b2f577410720669de1552f008e14 |
| 运行 main-compiled                           | 47700c452f8f6a5ee8eeb09819bc03767531e60b092140d9b377ded5de7217af |
| 完整回归                                     | 8322fe50741c0c379805978b9cbf142bfd0cc386f0818a4b998b8187c3de13fc |
| 新pool.ts                                    | bcf7768cf7abf03ce254b58334dd07f84aec3a5c75469c690043aa67520c56a3 |
| 新pool-identity.ts                           | cffd81fd1b5bcb134755b52a27886685ff7ec914789d12657b7b6e616b65693c |
| 旧pool.ts                                    | 67963cd076ed817fb4fc348e41f8300442410385766ce50f6a46d6ac71fde905 |

仓外保留批准输入、完整初稿/首次结果、编译清单及首次运行日志；仓内保留规格与真实验收。
