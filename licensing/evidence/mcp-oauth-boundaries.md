<!-- SPDX-License-Identifier: MIT; Copyright (c) 2026 Knorvia Studio contributors -->

# MCP OAuth错误与发现缓存来源依据

本次按精确内容审阅两份新实现、三份测试支撑和三份文档；不对整仓或整个OAuth目录作MIT声明。根曾读旧正文、公开声明及有限调用点，并用自有有限观察归纳兼容规则。独立设计审阅读取两份批准文档及四项纯行为澄清；作者保留自身前序上下文，不是全流程clean-room。

作者只用批准行为、公开类型及保留SDK声明，先写设计，再实现普通Error工厂/迭代原因分类与一次存储的发现缓存投影。根另外澄清仅object/function身份去重，primitive重复值仍普通cause读取；未发送旧代码。作者没有读取旧/主仓正文、历史、测试、观察或bundle，没有执行产品行为、探查真实凭据、网络或模型。静态工具及其第三方依赖仍实际运行，不能说完全没有代码执行。

新errors131行4319字节、shared66行2562字节。errors首稿124行4299字节（SHA-256 0a76ccf53254e11f6ffdd419f8a569875dd124de3f7fab05f90e36a33b109c96），仅自动格式化改变排版；shared首稿与冻结候选相同。格式、Node24解析、strict/noUncheckedIndexedAccess和94规则lint首次均通过，无行为反馈后修订。编译器实际298输入为2候选、2批准投影声明及294标准/SDK/传递声明，其他产品正文0；自动类型加载不等同人工全文阅读，清单也不是完整OS访问追踪。初次宽SDK搜索输出截断后，作者另完整读批准相关声明片段，没有读SDK实现。

根在读取候选前编写72项验收，对旧冻结正文保留4个目标失败，再验证首候选、主仓旧/新及CLI真实产物，完整复读设计、候选与报告。标准Error/JSON/WeakSet表达、固定键、改名、MIT头和测试通过均不能单独证明来源；许可决定绑定本次具体设计与内容，不随依赖关系扩大。SDK、凭据实现及未替换文件继续保留原权利。

| 证据                              | SHA-256                                                          |
| --------------------------------- | ---------------------------------------------------------------- |
| 设计审阅 draft                    | cc66aa05797331c35bfa9af9486555d5841a92179e79d4c8f31212ebcbaca4c9 |
| 设计审阅报告                      | de171e4d75b992974a894b2c38ce36d89a8884d63b2ae60b75ce92f6a2dcd912 |
| 设计读取清单                      | 5061504b3d6c07e1385ca063de70bb4cf0bdb25ee03968d67a8880324e0e7abf |
| behavior.md                       | 7b3c8e88cc88704afe7d42f6a14b16289a2d876951e0eff3b99b9cb53208b393 |
| public-api.d.ts                   | 973125517667949b9730f7347054fbbd157932a988230e57c8d782db296eae28 |
| shared-credentials.d.ts           | 7ac9ea36477512b160579b423ff3b3cc35039202fc22f8e8e227ca06998713d6 |
| oauth-credentials.d.ts            | 1f00a818f4ea1faeafa7b302fe02b724c601cb120694f9a6fb022a5610f11f8d |
| dependency-policy.md              | 2f61f70ca5efe2cc3b3a01865a96c90e05f5afe84f7aa059e337ed61bae0456a |
| input-hashes.json                 | 8083cfc3e70139b1d410551c5bcb40a9115f1fea6abc7078597a2c77d2817977 |
| 作者 design.md                    | 1eea2c33dab5e57d123ff54e234cc90184110796b7fc76edbca9a18644222033 |
| 作者 cycle-scope-clarification.md | 5dc7ec439f1c2239c3c259252f582580b4eb41a2fd2e41b7bcc325c491766e04 |
| 作者 implementation-report.md     | 8f7ab9ae26fdb6981ff946bd70733190873e7c508d35a09fb4cfdbc710979629 |
| 作者 compiler-inputs.json         | 37ad6d1a9772405adb01e1ca02b01d63583addf1fee9736db2586738b19354a4 |
| 作者 frozen-source-hashes.json    | ed4e8dca4e539235065fcadbca057032edfb974f61c4cfa87b5f268207b0034a |
| 作者 artifact-hashes.json         | 0f24ce16cd33838f1b44e228c04ef2dfcbcec705b60b6e9a9a62091533579f8b |
| 新 oauth-errors                   | 0b56a2b1b63c37014688d94b619a7310eb1d742f90d1e1d951818cbbbdf75d14 |
| 新 oauth-shared                   | fb87e8f7c92ced17ec71d780d4d81252b95a4b27179982b18c51fcc4e015ffad |
| 旧 oauth-errors                   | a2ce9776615db42dcdfa7cc59582cd4ece743acf8b679567ba5275123eff4b1e |
| 旧 oauth-shared                   | a8e80e2be5225620183792a3e19bdee45b9124bb75721c5ea37bf235b6ce82ad |

原合同、首稿、静态日志、读取记录与有限观察保存在本机任务缓存对应目录；仓内保留经排版的先行规格与[实际验收](../../docs/knorvia-mcp-oauth-boundaries-acceptance.md)。这不是法律意见或全流程独立性保证，根Apache与preview身份仍有效。
