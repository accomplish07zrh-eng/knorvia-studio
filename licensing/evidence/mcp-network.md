<!-- SPDX-License-Identifier: MIT; Copyright (c) 2026 Knorvia Studio contributors -->

# MCP网络边界来源依据

本记录仅支持一个新源、四测试支撑及三新文档的逐文件内容审阅，不宣称整仓MIT、全流程clean-room或法律保证。根读过旧实现、公开声明和MCP调用边界；作者保留自身既有上下文，不能将源码访问限制说成全部知识隔离。

先行设计审阅要求澄清公共依赖选项、继承PATH读取及两侧归一化；根以12项实际依赖观察和6项自有依赖边界观察定稿。作者完整读取六份批准输入，先写design，再独立安排模块级execPath/platform捕获、单次环境清理/投影和独立PATH处理。只有插入目录时创建新记录；HTTP标量按原次序交给保留工厂。两小辅助操作分别负责路径所有权和native access-only失败，不新增缓存、公共钩子或复制sanitizer/投影/fetch正文。

首候选82行/3029字节，原未格式化83行稿保留。格式、Node24语法、strict/noUncheckedIndexedAccess与94规则lint首轮均通过。根的四项普通记录观察发现2项`__proto__`字符串兼容退步，按纯行为补充修订。原22文件按字节归档；修订只改字符串复制表达及中文说明，新源仍82行、3117字节，其他PATH/依赖/API不变。修订静态首轮均通过；这不冒充作者运行了测试。

作者没有读旧/主仓实现、测试、探针、历史或运行产物，没有执行候选、真实env/PATH/进程观察、访问检查、网络、模型或产品构建。编译器实际196程序输入：1候选、3批准产品声明、192标准/第三方声明，其他产品正文0。自动声明输入不等于人工全文阅读；清单也不是完整OS工具访问追踪。批准的两个相对声明仅按原字节复制用于类型解析，不将声明归为新运行实现。

| 证据                           | SHA-256                                                          |
| ------------------------------ | ---------------------------------------------------------------- |
| 先行设计审阅                   | dc8f731681d30e68b2eabbd3f42f3623436d876ca28e1b53345ec3bd8a8bd2ca |
| behavior.md                    | 77f8b2d41698daf122d342a8cd4828f6178ee9d65b785c882419e0715af72bb1 |
| public-api.d.ts                | 1166a0c4621c047ade9cbe9eefd1f07a95d6822ce03bede586540946ca1f91a0 |
| shared.d.ts                    | 3b84a3ca1dc245077eb889cb21ac84515174d1161ecccbff8e024be5955d4071 |
| input-hashes.json              | f2fc8ca5a6fadd76782820bfbd4bb8ab4e2c0232afeccb1ae4c72515cc260db3 |
| record-semantics.md            | 64876b12b243268231f198e2b37f57f6e6850700ff107764b4502e833a9c3e36 |
| 作者design.md                  | 1385aa569c23e1d45e4956e1eed97e44ee09cce08af2f5539b8fa1ca805f881a |
| 首轮implementation-report.md   | c52bb42423561bf49af6528c48c02332e35564fb425b1a5472f21d620af19e87 |
| revision1-report.md            | 11c79b336d662f7a5e0fa5cc744b366bbe6a9b7b05e3605af2519cf069bea470 |
| revision1-compiler-inputs.json | ecdac066cc17d3d3e062f5a2f56c657dd3b326369190a4561989848389522be3 |
| 首候选归档清单                 | ca329d5269565e66b73c2b127eccdd4c1641af5164b371ce578d988832da20c5 |
| 修订源清单                     | 1f326fe74f25adf982e10462ab116a551ba5d9db46215ba75baf31117554f11d |
| 旧源码                         | 99625b288feef0169dc5cfdfcbfd46ecfb5d4e5d5446811d59f48fb34d4a79d0 |
| 首候选源码                     | 827a49bf0603c031b4ed093cf7979a1cf5cd44df36330d447ecbc4484b6a4e6c |
| 修订源码                       | e391831353211105ffd18f98562604df18031f924fd24b591764399017ffe581 |

输入/首稿/修订/测试/旧基线/结果保存在任务缓存中的mcp-network对应目录，未随源码提交。旧基线只冻结这个模块正文，实际shared及已接受的网络适配层仍为外部依赖；自有接收器实验另记，不能当作真实依赖验收。仓内规格包含冻结行为、补充和所有权图，经过普通排版，原输入字节仍保留。

根完整复读首候选、修订及报告，自行编写59项有限新测试并校验主仓旧/新及真实编译入口；首次外部ESM/参数类型错误与旧shared总入口夹具映射错误均见[验收](../../docs/knorvia-mcp-network-acceptance.md)。固定签名、标准普通对象赋值、原生path表达、MIT头、改名或测试通过本身都不是原创证明。仅按具体内容摘要审阅本批文件；保留依赖、根Apache及其他版权不因此改为MIT。
