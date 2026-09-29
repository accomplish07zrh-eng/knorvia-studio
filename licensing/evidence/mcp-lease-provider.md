<!-- SPDX-License-Identifier: MIT; Copyright (c) 2026 Knorvia Studio contributors -->

# MCP授权锁与运行期令牌提供器来源依据

本次具体内容复核范围为两份实现、四份新测试及三份合同/验收/依据文档。根读旧正文与公开声明、做有限观察并形成行为合同；作者只读批准材料，先写设计，使用native path/crypto和保留的锁、凭据、refresh端口。两模块没有引入第二个可变状态或副作用owner。短适配函数、JSON标准表达、协议字段、MIT头及测试成功不能单独证明原创。

作者已保留此前上下文，不是全过程clean-room；没有打开旧/主仓正文、历史、测试、观察/bundle或此前候选目录。13份初始批准材料与一份publication顺序澄清组成首稿输入，记录手动读取范围与摘要。类型检查实际303输入：2候选、7批准产品声明、294标准/SDK/传递声明，其他产品正文0；自动读取用于编译与摘要统计，不是OS访问审计。静态工具实际运行，但未由作者执行候选、测试、构建、凭据/网络/模型操作。

首稿lease138行4131字节，provider55行2308字节；静态首次通过，格式未改字节。根先行71项在旧/首候选通过，随后源码审阅补3项变化code getter测试，首候选3失败。作者获纯行为澄清后修订lease为单次读取，改稿前保留首稿和证据；修订lease136行4242字节，provider保持原字节，修订首次静态通过。修订后旧/候选/主仓/CLI74项及完整3425项通过，具体失败与验证边界见[验收](../../docs/knorvia-mcp-lease-provider-acceptance.md)。本批存在运行反馈修订，不以首稿测试成功或模板化署名掩盖它。

本结论仅对应以下具体摘要与实现表达，保留shared lock、store、SDK和其他模块原权利。锁后random失败不释放的现有限制未改；同进程真实锁验收不代表任意跨进程/崩溃证明。根Apache与preview身份继续适用，整仓尚不满足统一MIT与最终稳定发行条件。

| 证据                                             | SHA-256                                                          |
| ------------------------------------------------ | ---------------------------------------------------------------- |
| 根合同draft                                      | 87bc65a32133d0dea5c2892b6a41e98782dc6a48f230243bc46b7a06dc1ccd23 |
| 审阅 report.md                                   | bf7a986a11c77c155635d2825f7087a9bb7da11367ff899c95828e1ab837f952 |
| 审阅 read-inventory.json                         | 813d2c8eb7f6fbe5d2ae520ada39e78ec5c3f440ca19c78db1192dc1d4260bcf |
| 审阅 receipt.json                                | 27b7a536b001f59befaa3c27775280cc230e8be17efdb72993b2f7ff6901e983 |
| 批准 behavior.md                                 | 87bc65a32133d0dea5c2892b6a41e98782dc6a48f230243bc46b7a06dc1ccd23 |
| 批准 input-hashes.json                           | f7e3ee168d9cea2f65e9287d48b6b4f416ee26b671aa980e227478793cabed84 |
| 批准 clarifications.md                           | 4ee26451c517c1f1be19990025b184d6f3a78bd362958f4f9367d4024554c4e8 |
| 批准 dependency-policy.md                        | e2254e13a29844e2f58b5cfa41dab5bcae1435510080182e66344564a71c9276 |
| 首候选 design.md                                 | 007ee0bf06121c237d28bbd20d38e2ace90cc439858c2a262b93d543b0204d2b |
| 首候选 implementation-report.md                  | 2bd5f7553ee5e3fa7aa6bce9508422c0bba278355ff30a1801522ad25db312e9 |
| 首候选 approved-inputs.json                      | bbdc61209302fc5b428320853674c683382da37db0cbe905a90b959e8d8c66ff |
| 首候选 author-clarification-publication-order.md | c001f836cde5076dfa50bfbc9bc7005ad9a9514ed37099fc1aa9f87ea384e9d0 |
| 首候选 compiler-inputs.json                      | 6c394a18ec2f37120a227cb767b570638f4ba829ec00c3f873d183f5f4de4e83 |
| 首候选 frozen-source-hashes.json                 | 37492433ae708c87c0bf33a0fd6b24395dfef4f3e208dbc24fd71e8083e354fb |
| 修订1 behavior-clarification-and-design.md       | b4c528bc4c4a6d94d02efe40ccae7e9d093acbd8e3781513f13acc805f06b2c6 |
| 修订1 revision-report.md                         | d1a8ad2bade20e29508eccb083007d4cf77b18ca41494d2ebb6124110cf17056 |
| 修订1 compiler-inputs.json                       | 643507119cdc235d9c07dab724913b7ffaf83af531d3c22db27662484df8c098 |
| 修订1 frozen-source-hashes.json                  | 3665ee945ff0c37654736f1685f875721aaee0c17e5e3f1d691808ae0e045c32 |
| 修订1 initial-candidate-hashes.json              | 9bd560969ed80daa6c8ea6b067bef17c2cf7109eb0e0fbbc3a1b0a740d839bc9 |
| 新 oauth-lease                                   | b53ad2318147f599a9f60759223a1257f823278b97ca5d66852c957ec165fe8a |
| 新 oauth-provider                                | 846ea9e4e4fab4652ce1f41ec4b9b58e643459369cfd4fdb17862781dfab123b |
| 旧 oauth-lease                                   | 6a8e59f0f1f78730a5d5de1fb2e82ca2eb595b351cb66153a4fda24ed3ec3e3b |
| 旧 oauth-provider                                | 57c14a1836323d88a928ad27809a1bf02985d977d527ac6c84c13c3bc375230f |

原始输入、设计、首稿/修订、编译器清单与运行日志保存在本机任务缓存；仓内保留[规格](../../specs/knorvia-mcp-lease-provider.md)与实际验收。该记录不是全流程独立性或法律保证。
