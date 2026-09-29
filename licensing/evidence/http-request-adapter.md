<!-- SPDX-License-Identifier: MIT; Copyright (c) 2026 Knorvia Studio contributors -->

# HTTP 请求入口与 Node 响应桥来源依据

本记录只支持本批两源及新测试/文档的逐文件判断，不宣称整仓MIT、全流程clean-room或法律保证。根Apache-2.0、保留网络配置/公共错误边界及第三方库的权利继续有效。

## 输入与独立设计

根完整读取旧入口和公共/调用边界，再通过自建本机代理复现有效no-body状态的异常逃逸。作者先只读行为草案，提出请求所有者与Node消息交接两模块设计，并指出CA同步性、资源释放和HEAD判定时点等有限歧义。根在最终合同中明确同步成功缓存、准备后才建立timer、立即释放未交接消息、发送时HEAD语义及不覆盖转换首因，再批准实现。

作者实际全文读取以下七份产品输入及其摘要清单；没有读取旧正文、测试、探针、历史或编译实现。Trace声明是本边界使用的类型投影，最终由根以真实仓库声明类型检查，并未宣称投影等同整个公共类型库。

| 批准输入                         | SHA-256                                                          |
| -------------------------------- | ---------------------------------------------------------------- |
| behavior.md (81行)               | 7a8f58c25b6ced9c356cb9e99507fcb342b232e47f7c0f23b8809c0a81752e4d |
| public-api.d.ts (6行)            | de5088fc0ba0ca46c0d2d27773b48cefd682bf6eced2ed4cb593fafbc8c62306 |
| contracts.d.ts (56行)            | fca36b64c5257c3da60d149c0ff19d270ebfc06583a605070b60f225c5a337b6 |
| tracing.d.ts (3行)               | fe4a22d78a27874641c59dca555e4da11ec359c0c99a63e174fea08c8ce3db49 |
| http-config.d.ts (20行)          | 4317c3bb20ff009c19f902afe5856a7925a559bc0a825f6b2354b9a7a713e18c |
| public-egress-policy.d.ts (16行) | b6a0e459033b36405bbf69916ea81d5ca37526dfd66f14ba48f58c28cbb13bcc |
| response-body.d.ts (1行)         | e9008b481d81623131127fa18dfd1d5069dcb2b38b13b51cfccb6974ce599b3f |

另获准读取安装包已有ProxyAgent声明61行，摘要4097f438a41b67a056c0a826fbac2bcdb75c6b46726b6f80f354e70870f2b7d7；没有跟随sourceMappingURL或读取第三方运行实现。为相对静态解析，三份已批准声明按原字节复制到隔离src/http与src/network，未产生运行替代模块。现有会话上下文、自有设计审阅与根读旧源的事实保留，不称全流程隔离。

设计先于代码，实例独占options引用和CA缓存，每请求独占controller/timer/父监听及错误收口，Node桥独占尚未交接的IncomingMessage。依据合同组织两模块，没有从旧私有helper正文逐行改写。固定公开签名、协议字面量、保留依赖调用及短标准Headers/Promise表达仍属于兼容约束，不能依靠改名、文件头、行数或通过测试证明原创。

## 静态与冻结轨迹

两源首轮正常格式、固定Node24语法、strict/noUncheckedIndexedAccess类型和94规则lint均通过。之后作者人工复核认为清理时的错误监听注册也应处于尽力清理边界；先归档首静态两源，再修订bridge并重新执行全部必要静态检查。此为自查修正，没有伪造运行红例。根取得的是最终冻结候选，没有产品运行反馈修订。

编译器输入核对首次误构造批准路径列表，将五份批准声明报成意外输入；保留失败后只修核对脚本，不改候选/类型配置。最终程序243文件：2候选、5批准声明及236标准/Node/ProxyAgent和第三方声明，其他产品正文0。清单为编译器自动读入范围，不是作者人工阅读全文，也不是工具全部IO跟踪。strict/noUncheckedIndexedAccess/noEmit、skipLibCheck与精确声明映射均披露。

| 外部冻结证据                 | SHA-256                                                          |
| ---------------------------- | ---------------------------------------------------------------- |
| 旧入口source.ts              | 55aed27873fe255fb6731f9d8bb89723c2e5f7f676357259ad945ddc062d061d |
| 旧入口module.mjs             | 6c670bd46880e163cda43960e35446a583c1445de9d629ea251424202aef4120 |
| 作者design.md                | 4fdf4158642f99aa00624f4d03a08de3b7470b190e881faba025b55f0a4e61eb |
| 作者implementation-report.md | bd8136410e11dc118f0213619df3482e47f65ae2a36f706c5ac5704601cf7f0c |
| compiler-inputs.json         | 4378684d19a0a60bf0987c93330c30aab4ad923b4a79b34b5494c1a8a134897d |
| frozen-source-hashes.json    | 28015cc250a72511de47de197b77e5fd87e3c67a493b841b8d5cfe9a8f8ae099 |
| 新index.ts                   | 690c0208dd19c57abf3367e6d135c5f3539ee065064927189478170ba8855fb9 |
| 新node-exchange.ts           | 5c275634ccf733e320e4d1cd4d52af1809a61a2478109bceefcffd195e60029f |

外部目录按knorvia-http-transport-inputs、knorvia-http-transport-rebuild、knorvia-http-transport-baseline-cca23aa、knorvia-http-transport-tests命名。基线名称记录冻结时HEAD，HTTP入口字节在下一次77a1c2e提交中仍相同；只是单入口冻结，依赖仍引用实际保留公共模块，不是整条依赖链冻结。主仓规格经过formatter，批准behavior.md保持最初字节；仓外轨迹未随源码提交。

根完整复读243行入口、109行桥及作者报告，执行先旧后新69项、映射旧入口69项、源码与实际编译69项；十四个旧缺陷失败与所有准备失败如实保留。两源均在CLI map可达并匹配dist字节，三个公共导出及参数个数不变。测试由根新写，用合成边界和真实任务回环服务核验结果；这提供行为证据，不自动证明权属。有限覆盖及原始失败见[验收](../../docs/knorvia-http-request-adapter-acceptance.md)。

本批MIT仅覆盖逐文件复核的两份新源、六份测试支撑文件及新规格/验收/证据。原CA/代理配置、公共端口/错误工厂、共享环境读取、第三方依赖保持各自权利；已独立替换的DNS/字节模块维持此前记录。后续摘要变化须重新核对，局部完成不等同全量独立及最终稳定发行。
