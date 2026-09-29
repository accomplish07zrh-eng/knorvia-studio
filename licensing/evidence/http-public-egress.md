<!-- SPDX-License-Identifier: MIT; Copyright (c) 2026 Knorvia Studio contributors -->

# HTTP 公网目的地与 DNS 回调来源依据

本记录只支持一个新模块及本批新测试/文档的逐文件复核，不宣称整仓MIT、全流程clean-room或法律保证。根Apache-2.0、保留的IP策略、公共错误工厂、Node与第三方依赖的权利继续有效。

## 批准输入

主代理完整读取旧实现、公共声明和HTTP调用边界，并用自有resolver提取错误优先级及已证实的Promise观察问题。隔离作者先仅读行为草案提出设计审阅；正式实现只接收下列批准输入和主代理限缩授权。第一份合同冻结不改；兼容补充另作输入，而不是覆盖旧证据。

| 批准输入                  | SHA-256                                                          |
| ------------------------- | ---------------------------------------------------------------- |
| behavior.md，初始63行合同 | bb4f57907d6da58ffc2769364b07595457afc0f22e18d7e837ee8c4cad4375f8 |
| public-api.d.ts           | ec2b3dcc2fa5002ebe80b546c0456f9aca3874cd8f26009bc6dc74ab04077b04 |
| contracts.d.ts            | 140b63e712a98491df0d5aef3f74ae3cc64a56caab843f713fd726a360aafd61 |
| 9行交付兼容补充           | 39cb7dc1f9b2dea987aab2c95b89a236cd1b029faa7893e8c85e7eeb5aeada8e |

作者未读取旧实现、测试、探针、历史或产品bundle，没有执行候选行为、DNS、网络或模型。其此前会话上下文和自有审阅仍存在，不能称全流程隔离。固定公开签名、错误消息、保留IP调用与短标准Promise写法是兼容约束，不凭同名/改名、文件头、行数或通过测试判断原创。

独立设计使用每次查询的终态与监听所有者，明确取得resolver Promise后即承担拒绝观察，校验结果沿既有断言/Node回调接口投递。首稿静态类型有两项捕获signal收窄诊断；归档原157行草稿后只修正自有局部引用，158行技术候选通过静态检查。根的61项首次运行通过后，新增五项检查揭示四项兼容退步；根只提供行为补充，作者保留原候选并修正调用时all快照、默认第三参数及all交付分支，未获取失败测试正文或旧源作为模板。

最终157行修订的格式、Node24语法、strict/noUncheckedIndexedAccess类型和94规则lint首轮均通过。编译程序仍为194文件：一个候选、一个批准contracts声明及192份标准/Node/第三方声明，其他产品正文0；精确声明映射、skipLibCheck和工具配置未改变。这只是编译器输入清单，不代表追踪全部工具进程IO。原21项报告、配置和日志按摘要确认未改，原失败继续保留。

## 冻结记录

| 证据                           | SHA-256                                                          |
| ------------------------------ | ---------------------------------------------------------------- |
| 旧入口source.ts                | febf35fa5f943d9f667eec048c4d025b318f1a539a85ca3f14be636e004b07b2 |
| 旧入口module.mjs               | 4918e354b752e18ffc37e446b98e71281d9728c21d5e2e176f6d728a305626d0 |
| 作者design.md                  | 4533277da49110e8219bb0d3dac2f0604a256147d6d8f6795d57e62ad849022f |
| 首技术候选                     | 57e16e69be44686afafa8afb658efc3774aa5d3a82cfcfa7ecb122f86dae8bbb |
| 原implementation-report.md     | 945e252abca0241879f190d2bbed34e070513366f3305f5dff774deffe4f9cf1 |
| revision1-report.md            | b18c4c6e963b356d11666221128018918e2b8887c81e6545545077de93221384 |
| revision1-compiler-inputs.json | 00b13a1c67e8306a64a549d99a775ccf1a5c356e2426031a9d21f431c9501657 |
| revision1-source-hashes.json   | 5c9cef9dbce2c760ae2f8a88aa523c58a0e0ea1b3650a1fc7153f0990169b1bb |
| 最终public-egress-policy.ts    | a0fb608458bdffcbe219c4ece6d8f4ce92f3b4c8686f967808a08979e99b168d |

外部证据目录分别为 knorvia-public-egress-inputs、knorvia-public-egress-rebuild、knorvia-public-egress-baseline-cca23aa、knorvia-public-egress-tests；初候选另在作者archive/initial-candidate和根candidate-first中冻结。主仓规格已附交付补充，不再与初始behavior.md逐字相同。仓外轨迹没有随源码提交，不将其说成已公开发布的附件。

根完整复读157行最终候选及其与初候选的差异，再验66项候选、整合源码和实际编译入口。保留的contracts错误/IP运行依赖没有作为旧实现正文交给作者，其原许可不变。测试源由根新写，用旧入口先执行以确认兼容和批准修复；这提供行为证据，不等同于权属保证。具体旧版失败、初候选退步、最终通过与有限覆盖见[验收记录](../../docs/knorvia-http-public-egress-acceptance.md)。

本批MIT范围只覆盖逐文件复核的新模块、六份测试支撑文件及新写规格/验收/证据。HTTP请求adapter、网络配置、原公共错误/IP实现和所有第三方库均不因此改变许可；后续摘要变化必须重新复核，当前局部完成不结束全量目标。
