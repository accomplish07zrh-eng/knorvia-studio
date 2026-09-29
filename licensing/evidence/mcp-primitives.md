<!-- SPDX-License-Identifier: MIT; Copyright (c) 2026 Knorvia Studio contributors -->

# MCP描述符与等待截止来源依据

本次仅审阅两份新运行实现、五份测试支撑和三份新文档的具体内容，不宣称整仓MIT或全流程clean-room。根读过旧两正文、公开声明、MCP端口合同及连接/OAuth回调等待调用处；作者保留自身前序上下文，访问限制不等同全部知识隔离。

先行合同经独立设计审阅，根用4+7项初始观察和15项补充观察澄清返回字段、schema浅复制及原生竞争顺序。作者完整读取四份批准输入和随后仅含公开导出归属的消息，先写design，后编写两个独立模块。描述符拥有新记录和schema浅层；等待者通过统一结算门释放自己的资源，借用source不取消。两个早退观察器仅保留无等待者捕获的拒绝观察；同步到期和取消优先不变。未复制MCP SDK、存储或contracts实现。

作者descriptor61行2174字节、timeout98行2811字节，两份普通排版源均小于400行。首稿独立保存在authoring-draft，format未改变字节；两源Node24解析、strict/noUncheckedIndexedAccess、94规则lint及format第一次都通过，无静态错误/修订，也未按运行反馈改稿。编译器195项实际输入为2候选、1批准contracts声明、192标准/第三方声明，其他产品正文0；声明的自动编译加载不等同人工全文阅读，清单不是完整OS工具访问追踪。

作者未读取旧/主仓实现、历史、测试、探针、bundle或真实contracts索引；没有执行candidate、计时器/Promise观察、产品测试、真实环境探查、网络/模型或构建。已安装的静态工具及其自身依赖会执行，不能将此表述成没有任何工具代码运行。根独立编写71项新测试后验收旧/候选/主仓/实际CLI产物，并全文复读作者设计、源与报告。

| 证据                                  | SHA-256                                                          |
| ------------------------------------- | ---------------------------------------------------------------- |
| 设计审阅                              | abdf49c656e1b054bf6eb9244810c4d20194a0187f17f651e6cb4b6ad7534043 |
| behavior.md                           | c96fa61ba4e410a866890231657037cadb7b2486b6cbf1386bd54c3fad51757e |
| public-api.d.ts                       | 8ab24d1d8520fafbcc15f961f567a5a5644070991f208becbd922daa910567b7 |
| contracts.d.ts                        | a4e5abe82cf2f62975027117c1fc83a3c6b402f6a19819340c45677dacbb53e5 |
| input-hashes.json                     | fd19c053d00ea896daff959e9a43d84cf73d65307ca40d7a223485b5df8a8c67 |
| 作者 design.md                        | 9d31c82843969dbb2c4b6e0dea06fb3483ad8bfb76ccb2ac9bdf3ce425ece0f5 |
| 作者 public-boundary-clarification.md | 6e1eedcbb59a48555d50eeb4516b093bd8f1d220c9b6398bf206c3089a44d614 |
| 作者 implementation-report.md         | c608d7103fbd136a97cc4780edc165bc26219f8c4828d602bdb16f8899c4c5ab |
| 作者 compiler-inputs.json             | e03f801965ee222922a04647010d36b1751288874b8ea53ab07d7fb783caa0f0 |
| 作者 frozen-source-hashes.json        | c4306e51dba5f0f30163ff73efb8e5b9136da74f03a12f7eed00f3f1d9cffea3 |
| 作者 artifact-hashes.json             | c7f02b587af3a229ddedc68fc78dd46090fd66632b53c852db5713f78439791e |
| 旧 descriptor                         | ba5806adb033677d13b5f0e76ac04aaba211ca763426ed7f4b3337489f6ed24f |
| 旧 timeout                            | 01f0c6b9bbd3f8f284b36be7ffb9d34cf657b08181d26b7b5f71e736cda8fb46 |
| 新 descriptor                         | 5e53af6c20d7ce878573d7e60c8b58379f114743c58516d3d83df659eddba87e |
| 新 timeout                            | 3db1d6c0059884ee3dec3889dfb4dc0d1d46cbd3ac4f1a0148f97c982528c095 |

原合同、声明、首稿、静态日志、类型输入清单和有限观察保存在本机任务缓存的mcp-primitives对应目录，不随源码提交；仓内规格保留先行行为与所有权边界，经过普通排版。公开名字、固定字段、Error继承、标准object spread/Promise/timer表达、MIT头、换名或测试通过本身不证明原创。许可决定绑定精确内容摘要，不随目录或调用关系扩大；contracts类型、SDK及其他未替换依赖保留原权利。详见[实际验收](../../docs/knorvia-mcp-primitives-acceptance.md)。
