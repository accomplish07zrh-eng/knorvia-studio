<!-- SPDX-License-Identifier: MIT; Copyright (c) 2026 Knorvia Studio contributors -->

# MCP进程与资源遥测来源依据

复核范围为tracker、sampler两实现、四份测试及规格/验收/本依据三份文档。合同准备者与根完整接触旧500行实现及公开接口；合同明确功能、单一状态owner、精确事件形状和异常/并发边界。根核对有限声明后发给分别独立的源码/测试作者，共九份批准输入，不提供旧实现、历史、已有测试/观察、bundle或另一作者产物。

源作者先设计以registration/process闭包提供currentness及局部观察、资源模块独立维护一个采样窗口，再编写307/205行具体实现。builtin字节投影及HMAC交给native能力，group创建与窗口清理使用局部职责函数；没有复制第二份accepted state/IO owner。工具前两初稿保留，之后仅格式化，首次静态检查均通过。编译program197输入：2候选、3批准产品声明、192标准/第三方声明，其他产品正文0。无额外手读SDK/产品正文，也未执行候选。

测试作者先设计tracker/sampler/组合三个边界，四份文件25项；其compiler readFile219输入含11任务内、208自动声明/metadata，与program计数不同。首轮格式失败及静态审阅追加有界断言/全局timer隔离均保留，在任何产品执行之前完成。根先完整审阅测试并跑旧25，再读候选设计/正文/报告并执行候选25，主仓/实际dist也各25通过；没有行为反馈修订或弱化断言。来源头和平台URL接入不改变测试语义。

两个作者均披露已有上下文，未读本批旧/主仓实现、历史、旧测试/probe/bundle或对方输出。限定目录是程序性分工，编译清单不是OS访问审计，不称全过程clean-room。具体表达、设计、读取记录和先行验收共同支持逐文件判断；标准语法、哈希算法、字段/常量、接口结构、MIT头及测试成功都不足以单独证明原创。

25项和完整3509项的实际结果及native/端口界限见[验收](../../docs/knorvia-mcp-process-telemetry-acceptance.md)。保留process probe、shared schema/事件协议、原生及其他依赖的适用权利，不把它们归成本批重建成果。预先明确的时钟busy等既有限制维持兼容而未暗改。根Apache、preview保持，整仓MIT与稳定发布尚未完成；此记录不是法律保证。

| 证据                                        | SHA-256                                                          |
| ------------------------------------------- | ---------------------------------------------------------------- |
| 合同准备 contract.md                        | 14c5d9b4edd2b0a304ade6e3704a795a8858ddfef41aea61b3301c64ec82ca1a |
| 合同准备 read-inventory.json                | 43c9f90155c286292b3ce028fb11b3fdd7b0a7eb968070c4a580e2707460d60e |
| 合同准备 review.md                          | 86cbdd5d945375d17e58e44f7515299a30e3bf8965c143e4bcc0f1faf2337949 |
| 合同准备 receipt.json                       | 7df870f3592c253f04dd3b3060cc5bfe3e13251c713d2de9a62ee12476ddb88f |
| 批准输入 behavior.md                        | 14c5d9b4edd2b0a304ade6e3704a795a8858ddfef41aea61b3301c64ec82ca1a |
| 批准输入 input-hashes.json                  | 0185e71bcd4c6301d754ae24850baec5fc70b0287ca60b6d3d208fcc4d319738 |
| 批准输入 dependency-policy.md               | e9ea1151f82cafa7f661964668da8d545d4a9d7d4168d573f38bb15dd9b48988 |
| 源作者 design.md                            | be79a6a66cc0e7d4504a80e32ea3e582997e5a6b4686639baf05bc1aeaa44401 |
| 源作者 implementation-report.md             | 95082ddfd18577aff639c347045d3aea6ac25354a2db297373616abff3d6a98d |
| 源作者 approved-inputs.json                 | 2b3a3d93b6ac9490121a0a7e9db08235f51da83925a3d0f6f6abbb547b7dab67 |
| 源作者 compiler-inputs.json                 | 5171e5424821d0ccbda9a46d4205ed608f30e2271c7b7b1e426a256eda9d58f2 |
| 源作者 first-draft-hashes.json              | b45527f8dfa63472801fb3753ae42a3a2ef73540574e009ddbf5833f6c24a8df |
| 源作者 frozen-source-hashes.json            | 07b9927b85d5620a86247a1c6aad80ac3106a73ec7b40dcea770a1124a70a8f3 |
| 测试作者 design.md                          | 79d7ecb41162b488d027c77ba82c660dff5614232981200f117d8aed2ceef0ea |
| 测试作者 report.md                          | a5c63eedcb66e89d0ab85b4881529d77ceb4889c17b6b7d6a84cee7651e4197e |
| 测试作者 input-hashes.json                  | c1aa778a253739675929846196f9c1014524bfbe5e9c6481cf674f23542fb8d1 |
| 测试作者 test-freeze.json                   | e1082553a7ac2e4d96bae07df5d9125f05f449df9dd4475025b61a709e110332 |
| 测试作者 checks/frozen-compiler-inputs.json | 39a510045d52532e4fb9ecb57ce7cf2f597c153297551cb131d4beff7b1ec600 |
| 测试作者 handoff-hashes.json                | b3a3d1058422f0d22cbc792016f9b2e8fa76f70b25f09e1aaee1e2a1dd3cbf41 |
| 运行 old                                    | c9393590bb7af590d6e1d5d23353a5254513ec20e5443719766c9ad3bb069e0a |
| 运行 candidate                              | 8af036b16e05f5c6c8c39f25d8531c813b80c0c8a9ebfdb1ac2fd299dc6bb8bb |
| 运行 main-old                               | 38d7c7176e26bf86a104009091b0d732d808034c155ff54c1feadcda3535d16a |
| 运行 main-source                            | cc8aa3926505e0d524634647dd9d873984172bf2d06ca4208c3e1cefbdc9d453 |
| 运行 main-compiled                          | c16a36b854258ce4789914ff5581da6d71ac9992df243f867af83ae260d30952 |
| 完整回归                                    | 5ca38aba21550fe279f7de7d4a1bf510deb454e85e388e1f4d18d98b10775e61 |
| 新telemetry.ts                              | f9ccd162f25c3e469f3097ac613d7d94c1da8c588bc0d877c42d6a7f24f70545 |
| 旧telemetry.ts                              | fda97c9831f66bac765467c40b291ad166d130d126646b8a265bf42830d09a2a |
| 新resource-telemetry.ts                     | ff85a73c86300dd746e7e234c64faf17a6f56b06b8642722eeb6664c5db66c45 |
| 旧resource-telemetry.ts                     | 16d69cb8a9dd477ddc9ac46ac5763b6ab5fa3665acb63c6baffbb9b1f6263a97 |

仓外保留输入、设计、完整初稿、首/最终静态结果、编译清单及首次运行日志；仓内保留规格与真实验收。
