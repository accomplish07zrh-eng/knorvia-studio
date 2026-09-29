<!-- SPDX-License-Identifier: MIT; Copyright (c) 2026 Knorvia Studio contributors -->

# MCP认证请求来源依据

本批逐文件范围为两源、六份先行测试和三份规格/验收/依据。根与合同准备者完整接触旧563行及公开接口；源作者/测试作者分别获准七份初始材料和工厂名称澄清，不读取本批旧目标、旧测试/probe/bundle或对方输出。根核对公共shared签名时检索输出连带出现少量实现边缘行，未将其交给作者。源作者保留先前HTTP/MCP上下文，测试作者保留先前审阅/行为摘要；不声称全历史无接触。

作者先设计入口拥有单次调用阶段，纯响应伴随处理诊断及释放，再编写新表达；共享策略/registry/凭据/传输继续是外部依赖。类型首错只用已准入值的类型断言修正，没有产品运行反馈修改。测试独立设计34项后冻结，根先完整读测试并跑旧34，再读候选并跑同样用例；旧/候选/主仓/确切CLI产物均34通过，无断言放宽。主仓仅追加头和入口绑定，fixture接入类型错误通过Pick三个实际helper修正，无运行语义变化。完整3576项及全部初始失败见[验收](../../docs/knorvia-mcp-official-auth-acceptance.md)。

源compiler program196和测试compiler readFile221采用不同计数范围，清单与原始失败/初稿均保留；有限声明不等于OS沙箱或访问审计。测试最初查找不存在的policy.md后才读实际dependency-policy.md，其工厂名拼写笔误由独立澄清解决，没有增设别名。测试初始目录hash操作与澄清发布有交叠，初始inventory已含新增文件hash，实际完整阅读由另份记录标明；没有重写初始清单。

新设计、具体表达、受限输入及可复核证据共同支持逐文件判断；标准接口/算法/字段、MIT头、改名和测试通过不能单独证明独立。程序性分工不构成全过程clean-room或法律保证；原生API、共享helper和其他依赖权属不扩大到本批。根Apache和preview保持，全量目标尚未完成。

| 证据                                       | SHA-256                                                          |
| ------------------------------------------ | ---------------------------------------------------------------- |
| 合同 contract.md                           | 471fffb4f1eb00716ec494b8085873010435769d2c037c406bc1aca36f919037 |
| 合同 read-inventory.json                   | 33f2e07ad1f5e5b183082fa23c99bb09440a0005e2d9c54ba2ccab5a4301a8cf |
| 合同 review.md                             | 671f8fdd98770107e31e70f31db238943c3589d2b4dd120d3d0f9dcf740d9417 |
| 合同 receipt.json                          | 494e140c810239b9313fed84e47382849130f43b6eaf805ea892ad3588b43cc7 |
| 批准输入 behavior.md                       | 471fffb4f1eb00716ec494b8085873010435769d2c037c406bc1aca36f919037 |
| 批准输入 input-hashes.json                 | ff7c33e696ebc72ba4c1dfb655f0b4fb8f8b77ff37d61d21299b51f3ff212e15 |
| 批准输入 dependency-policy.md              | 7fcfee174e07c407503ae2c7679decbe6b1a0bfb8b923eaa3aa4911df4e545cb |
| 批准输入 export-name-clarification.md      | 8ef71dfecbbae7f1f721427fde154259bfc62fdb8ee056ea5abfc87ce4252189 |
| 源作者 design.md                           | 5555cdb69a2f8aa29416029db1c91765f7d2173d33d9f4f3db4901e9320d5eb2 |
| 源作者 implementation-report.md            | c47e13cb04c41d4ae3c5cb70a571c0813ac59761d2d3464f5ddad3da17fccd98 |
| 源作者 approved-inputs.json                | 674b28c13bf783c32a5a02b4ba6cd5b325da479604031621a93ac12dccaaa6ac |
| 源作者 additional-inputs.json              | 56b7d6c00f9b3c91c084a4e727ec4be004604c6c49a469f7745b5a5a9c6424b8 |
| 源作者 first-draft-hashes.json             | 14b6e3ff5cc0f1ee9cc80805e42afc5db60a43b19bbc650f2055a7f5126d1918 |
| 源作者 first-formatted-hashes.json         | f88f0ea29c87f660a5c5a51656ee3b8165bb837ec870b4e26232eb4f160f6fe8 |
| 源作者 compiler-inputs-first.json          | 6159693433e7799dde1480b580b205c5ea519365ad4ccf4bfdd1779d571ded6e |
| 源作者 compiler-inputs-final.json          | fedfb402bb165da868c7179c59b86a5b62c211c44e56730dd6875f2491cfa4ef |
| 源作者 frozen-source-hashes.json           | 0e46a466cdfc881a5a7687a7e1c4cdbd95d590728832d72173a49a1fca44ccaf |
| 源作者 static-corrections.md               | b7502fdc2594d22993f79d49916c61b8a6ec8ccdfdf62df1aa9a6bf5898c1aa4 |
| 测试作者 design.md                         | ebddd7165d92b8aab3e4db3c93123ffa36fe396b7a9f4fd28c320027a14f5235 |
| 测试作者 report.md                         | 7ab04bf90749e52b3f36b15f187d4d6f490a0b8b7f8698d7b57ec97fba164184 |
| 测试作者 input-hashes.json                 | fbe0a8ffa00abe67eb116799d278a411254e7cc6037d4f32a2e81d11c00c37a7 |
| 测试作者 export-addendum-input.json        | 1fbb3e7d5fd6f6c51c05382c2934318cb0266d75f43fc8ea3fd8f66afcd1b027 |
| 测试作者 test-freeze.json                  | a6548887ccabcf1ceb3575f1febd046933ccfe7131bf6c4f1d75c9a92635f4fe |
| 测试作者 checks/final-compiler-inputs.json | fb379b5f340a793f058da3bf85ad525dfb0d5667c9f8ffba276b2c19271cc295 |
| 首次运行 old                               | 87db91a4370e61ae6f618f036e30faf529b0e984592be8a38914025e04dae39a |
| 首次运行 candidate                         | fd9fb175b4636cb1b91b30061a9d80eb78a6c236051eb53aaaeaafa1815083bc |
| 首次运行 main-old                          | c01a60e52663412c09e988ddf04d306571012b1734a2d98ec606cc48f465b961 |
| 首次运行 main-source                       | f06ca48eceb3cc56a6d6ba0cb8f02ad2c6dce28c9cebf5320365ac07e9922600 |
| 首次运行 main-compiled                     | 3aee1472aac413636057789bdaeeddf9394a9e1bde9fb90d57e49243f474c03c |
| 根类型接入修正                             | 6a2ac5aa37ac0f862c0a6cb7a48ac80d3efaed2a0802c00838b89a2bc8925424 |
| 首次主仓严格类型失败                       | 57d3952c5287b2226b8cdc440e94cb1761fecd931711eb0dbdf50a0da6ef788d |
| 全量回归                                   | 1dab3e7156ef8790f1e98da6dfdcffd06903308abdc56f8cea42eaacee685145 |
| 新official-auth.ts                         | 9ef5290438d22e11e91f6034820acca82bb44f0450d8b5e2e9974e9b02e67fa6 |
| 新official-auth-response.ts                | 40aa8338f21ce32dbcea24ce795cc3612259b52464bb2a3cc0421c154c4ffb3a |
| 旧official-auth.ts                         | 5d4f1a554d48db56c4e6d9281cbf57a8e1246b5b7e48b8f4eca0572abb40ff6e |
