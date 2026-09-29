<!-- SPDX-License-Identifier: MIT; Copyright (c) 2026 Knorvia Studio contributors -->

# MCP凭据配对与命名空间来源依据

本次仅审阅两份独立实现、五份自有测试支撑及三份自有合同/事实文档的精确内容。根读取旧正文、公开声明与有限调用点，编写自有观察后给出纯行为合同；设计审阅只读取批准材料并提出四项有限澄清。作者保留此前上下文，不是全过程clean-room。

作者从批准合同与公开声明编写新设计，再实现浅谓词、raw generation、延迟读取的canonical字段投影、单一legacy决策与存储批次协调；命名空间调用native SHA-256计算五原值的摘要。引用、字段缺席/own undefined、序列化时序、条件失效guard和原生比较保持。没有重新实现crypto/util或SDK，不将调用这些依赖视为其代码原创。

两候选分别255行9411字节、35行1258字节。首稿归档与最终逐字节相同，首轮格式、Node24解析、strict/noUncheckedIndexedAccess类型与94规则lint均通过，无运行反馈后改稿。作者未执行候选/行为测试/产品构建，也未读取旧/主仓正文、历史、测试、观察或bundle、真实凭据、环境值、网络或模型。静态工具确实执行，不能称为没有代码执行。

编译器实际299输入：2候选、3批准产品声明、294标准/SDK/传递声明，其他产品正文0。作者未人工打开SDK声明正文；编译器自动解析和摘要统计已记录，不等于手动全文阅读或完整OS文件访问审计。相对声明从批准副本逐字节复制，未借产品实现解析类型。批准合同保留了早期审阅段落，最终任务与合同作者段明确实施权限，没有依此错误暂停。

根在候选阅读前写71项验收，再完整复读设计、源码、报告；旧/候选、主仓旧/新与CLI真实产物均通过，完整离线3351项通过。测试、相同行数减少、MIT头、标准JSON/crypto表达及固定协议字段均不能单独证明来源；本结论基于本次具体表达与受限输入记录，不延伸到其余OAuth/store/SDK。过渡期根Apache、第三方权利与preview身份继续适用。

| 证据                             | SHA-256                                                          |
| -------------------------------- | ---------------------------------------------------------------- |
| 设计审阅draft                    | 2b694c93bdd3bfdcca7e326d5c62fb137da4d13b136cce412030ce790bf6404b |
| 审阅 report.md                   | c66da04867df47943fe6df18bc2d336d78117826317020d3d5fd549ba393a3a6 |
| 审阅 read-inventory.json         | a9fb182236fa0f09b00cc0402026e6e5c217cd06c97a04bbd59e153ebe6726cb |
| 审阅 receipt.json                | 1187911c5717380e9324ae9a90952b76d9b3d28afa56027f223988b7a96f9a7f |
| behavior.md                      | 4f7d31b021a56f07c1e5efbf5b8db6d46cce94555e689833229dd72edb6738ca |
| oauth-credentials.d.ts           | bee7a1a2d652a6df04d08bf536cee740c3a474cd69e3a5174c785858062fa117 |
| oauth.d.ts                       | 9a825908062f551acc5378cd5e5220418db9ddff57e088fdd1eee5b4993f1750 |
| shared-credentials.d.ts          | 7ac9ea36477512b160579b423ff3b3cc35039202fc22f8e8e227ca06998713d6 |
| oauth-shared.d.ts                | 9c1ae9016e64386088332f843c482a28c7eecc2c11e9f96789d72369c3e1dad7 |
| contracts.d.ts                   | 345ce3da7827d6b2e17932888bdebbc3770cfe31850bddc61ba65e0fab92ccd2 |
| dependency-policy.md             | 25e4ae459ac7c879ec71e03338d57e4dff87aedc9e828d429ba06108d87cb246 |
| input-hashes.json                | 5d33a58d77940244efaaefb3ada28f9903fe7b1621839e798b484af63ac80e75 |
| 作者 design.md                   | 74ddeebc63021422a9b54c5ebe64fcc5c4429c47cb3e2321388fdc4e4f20ca3c |
| 作者 implementation-report.md    | d42786b1481c94406a11618970ba2dc93f9e28b0ba62da7b7592fed605a2f764 |
| 作者 approved-inputs.json        | 2d9a89740fd2a405f4c1e4d5c162b4c29711f49d3bc8cafd8d1971488dce69a8 |
| 作者 compiler-inputs.json        | b20d45b98f69d3d2d13063756220e9345aa55327b1556f21463d5939f9662572 |
| 作者 frozen-source-hashes.json   | ea75d9d7585d393e6b0b97c3936258e8ca42183a6dbd6d0ff1366f1af44e070d |
| 作者 authoring-draft-hashes.json | 6ef19522074ea3601306fdddfd3a000ba17abccde02248dae7a7da3df8b613a6 |
| 作者 artifact-hashes.json        | 105a82111631379be8b7dfd3c8016934afd302b396e2f06efbe985e46e5851e5 |
| 新 oauth-credentials             | af46ca2f00b59caa0d1e7b17e52fe1af7e8fae8c92024ab186a9b1e1b14e51b8 |
| 新 oauth                         | a2103d0d043fe775a9d4463519431b0634b15383d22220030ecc5fba650dc6b5 |
| 旧 oauth-credentials             | 6829b3ac9f187d70e75ada76b2b610f7765a4c816747a91a5ff88d8664e73cd7 |
| 旧 oauth                         | 8c0d9bc0171481229064add187b0f29734645c6164be00fb606bf27ad7d7c54c |

原始批准材料、首稿、读取清单、静态/运行日志与观察保存于本机任务缓存；仓内保留[先行规格](../../specs/knorvia-mcp-credential-pair.md)与[实际验收](../../docs/knorvia-mcp-credential-pair-acceptance.md)。这不是全流程独立性或法律保证。
