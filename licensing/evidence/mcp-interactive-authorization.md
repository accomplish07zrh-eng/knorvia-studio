<!-- SPDX-License-Identifier: MIT; Copyright (c) 2026 Knorvia Studio contributors -->

# MCP交互式授权来源依据

文件复核范围为入口、私有事务伴随文件、六份测试及规格/验收/本依据三份文档。根完整读过旧497行正文和声明；合同审阅补齐配置、scope捕获及日志等边界。独立作者各在分开的仓外目录，仅根据批准输入先设计后表达。新实现将一次授权分为entry coordinator和闭包provider；后者无旧私有类布局，外部副作用交给保留依赖，公开入口与正常结果保持。公开字段、常量、兼容诊断、标准语法和接口声明不能据此宣称独创。

批准材料分阶段追加，初始inventory未改写。源作者最初完整读15份批准内容，路径和hook receiver分别追加；编译程序303输入为2候选、7批准产品声明、294标准/SDK/传递声明，其他产品正文0。SDK手读仅公开index.d.mts，记录范围和SHA-256 309cc5f76da5abff0be678d958aba0e875e52909f5f6f0544a45a34ac596cc9c。测试作者最初14份加scope补充，333个TypeScript readFile输入含16任务文件和317自动声明/元信息，不能与program file口径混用；后读路径澄清但未改冻结原测试。

作者没有手读旧/主仓实现、历史、已有测试/观察/bundle或对方产物；此前上下文仍可见。根先审阅独立31项并跑旧源，再审阅候选；根在源码复核后增加公开hook receiver测试，旧32通过但候选31/1失败，作者只收到批准行为反馈而未读测试。最终两处call修订通过32项；不称首次全通过，也不称全流程clean-room。路径猜测修正属于运行前依赖接入问题，首次错误路径候选未运行。

主仓测试接入补来源头、跨平台URL和正确callback路径。真实Timeout模块比缩减公开输入多出若干导出，导致首次主仓strict三诊断，根仅改Pick类型投影；测试断言不变。完整3452基线加32为3484项均通过；具体日志、一次真实自有loopback回调、模拟lease门闩以及源码/产物验证界限见[验收](../../docs/knorvia-mcp-interactive-authorization-acceptance.md)。

具体表达、先行设计、读取和修订证据共同支持本批逐文件复核，不以改名、头注、行数或测试成功替代来源判断。保留SDK、锁、凭据/发现存储、localhost callback等本批外的适用权利；目录约束及编译清单不是OS访问审计。根Apache与preview保持；本依据不代表整仓MIT、法律保证或最终稳定发行完成。

| 证据                                       | SHA-256                                                          |
| ------------------------------------------ | ---------------------------------------------------------------- |
| 根行为草稿                                 | ddd564277025c7c7b791a773ebc20b282c93cb98db60ec1c191df4c7bab4f451 |
| 合同审阅报告                               | c466cc5332f6329441425281393ed06a115bb914566e8635084a72afa4316d39 |
| 批准输入 behavior.md                       | 62a2c594e54121c8f8e7fc999815ccfb0c46d8646559e5687d54b803d63e57c9 |
| 批准输入 input-hashes.json                 | 53f4086fd955215b4fcf144ab54046158ac18c855059f93181040ba19e211906 |
| 批准输入 clarifications.md                 | 0540bf7fdbbf3d67fd42bd7e69e0bd3eecd53419931f53bf4197c3cf6409f222 |
| 批准输入 scope-capture-clarification.md    | 087a0ddf818c45a4b0ecb97938a08e2464c909666de0c263ddb1c7583a5835a1 |
| 批准输入 dependency-path-clarification.md  | e9a7f54e456791110fa14c9aa57179cf5967911f1f4190c45031c6d783a54576 |
| 批准输入 hook-receiver-clarification.md    | 30ccf7cc450c5c12e44286f2f879d8a51068afa5017a9f7c0f9badbe5bd940a7 |
| 原源作者 design.md                         | 38d4b5b4ec9a2ebfc6c88ce5bbbd1d254d37048bff6644e52435aded9aec505b |
| 原源作者 implementation-report.md          | a0f8a8f90744d3206e9dfd02b3de86777d3fb4e69fb115a132d4b62754e363ce |
| 原源作者 approved-inputs.json              | b4a3d24f670da37bd59dfbcbe2bef4972cfc3ca3247d6e4fee34261a1232d981 |
| 原源作者 compiler-inputs.json              | d86baceec879ae80f74e77e864510d22196e3d56db950aedc04d6221579d1c2a |
| 原源作者 authoring-adjustments.md          | dcc28b40bbcc9b0f9a5ecfefc365201d126b203ffc6a408c3c841703715a0a3b |
| 原源作者 manual-sdk-declarations.json      | 6717c496d614ae2a802eb8c1084d802dc51b438cb394b925ec0c9ed41554df76 |
| 原源作者 frozen-source-hashes.json         | 7bc238eefd06c287346d3e9fa37ee063c2a73e3ac7a743d89f0dd5d3129bc9df |
| 路径修订 revision-report.md                | e1d80d6cfad29576864ca1d678805f06883fa1c610ab3e4b303297378bea7cca |
| 路径修订 frozen-source-hashes.json         | 9a86cf6229e67be8b0521a631e948872b252d5e4a40ec9abbe4b3c58241c008c |
| 行为修订 revision-design.md                | acf0dd751029e44f5a3a935add06449dbb6979bff8088d8ac5eba778e8d3b7e6 |
| 行为修订 revision-report.md                | 5e296cda3a26ede74f749c97d1c3010dffd99bcee1274d3317596a5b095cec23 |
| 行为修订 read-scope.json                   | 15f3594b6f97029435bd3d225d13e7c60f83ee1b133a8d822ef1edab17ab1188 |
| 行为修订 compiler-inputs.json              | 745e73d8bf5cabaa7635c2847750e88c2125d17e29884189beed1c72f206c928 |
| 行为修订 frozen-source-hashes.json         | a387252560d96c049bec4b108b30a7f21f697748b7fee60f39355c0329dbd608 |
| 测试作者 design.md                         | bc95f14ef659b55f3d20f66c007db734b6deee1a1967517f6bc0f301218eed01 |
| 测试作者 report.md                         | a8064fb3ef4e50baf60efa6fc7f57a5585a5b1d69f3d6eec20510a400ecb7337 |
| 测试作者 input-hashes.json                 | b51be66d747c00532a610e450ebe8ec41142ae99af69da2cff822e7cbcb63025 |
| 测试作者 test-freeze.json                  | 59fc425b9cd451b6cf4051b4fbf08a05b5d7b833c1ad2bb847f5030f87d9901f |
| 测试作者 integration-path-note.md          | 72bad7820cfde52f5f1495cd246c2b04952eca0749b709d24f0005b065f370d4 |
| 测试作者 checks/final-compiler-inputs.json | 47d838fd7947178455acf83adde8121f114c3a84a3e2f79401e8e4e2ff808413 |
| 根receiver用例                             | 4c779e9dd85496a9dc46a342affcafce55c679911711a1bfe221a7f547284057 |
| 运行 old                                   | b2646760201f172ca662d7117d830b3bd901966c9cbe655db47d2b6c9df462a0 |
| 运行 old-receiver                          | fddb9213c053e28c92da1d12a614faf83b0cc6656fa92c763d5e986954f2ed02 |
| 运行 candidate-path                        | cbaa646e00cba9328ece9c6f36c9386f25117139f7568b1b2d8a161666806bfa |
| 运行 candidate-behavior-1                  | 6188bc42b787032e482b2f0b477c153c5abc20c8dbcf3d2b54b25d4373eec52f |
| 运行 main-old                              | bf0aba914cc29a4fc80fd967eb542fd34a5bfac00229236f4fdaced9ad74285c |
| 运行 main-source                           | d62b3f8e350464b8eeecf364558a13e24b4e8220ec3402348e31f9f5ecff507a |
| 运行 main-compiled                         | 795f036b13c60cc76807d5f9d728216c015ec8008ccb9d6ac70ec2880d68cfb2 |
| 首次主仓strict失败                         | e2ecdb78eda3ccbcfdcd2eeb23e2e4901d65ed5c63333c5d0d5518228e45b217 |
| 修正后strict                               | e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855 |
| 完整离线日志                               | f4f6a23be493929687c4cc4eb47f708381285556273d418818927b4c0e43a931 |
| 新oauth-interactive.ts                     | 05a494a20c13f73cd5f9d33fd9bb522fe6d6cbd6f66da190452f7cdb2fad6477 |
| 新oauth-interactive-transaction.ts         | 025434c8e772eeecce44e081232803d381c8de774dd428a979770c848de0fa5e |
| 旧入口                                     | e46be3249caa3b4cb0fbb490d6da9181f98663821db98b92b70d6ede9a9d6dd1 |

仓外保留批准材料、完整初稿、独立静态与运行首结果、修订及读取清单；仓内保留行为规格和验收事实。
