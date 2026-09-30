# 协议九文件来源审查包

2026-09-30。Standard 继任完成本次**审查材料准备**：九文件、950 行全部进入 71 个连续且不重叠的片段，逐片段绑定候选摘要、旧表达定位、设计合同和复核问题。来源接受、已确认 Knorvia 原创片段及新增 MIT 授权均为 **0**；独立接受复核者仍未指定。本包不是 clean-room 证明，不代替授权链、ledger 决定或发布验收。

文件名保留 `wip` 以延续交接链接；旧暂停检查点保存在 Git `281dc094299bc3fdc80cb862d2cc3be3554b8c20`。分支仍为 `parallel/protocol-source-review-20260930-nine`，本次只更新本文与[机器证据](../licensing/evidence/protocol-nine-file-source-review-wip-20260930.json)。三组已推送实现和交接材料不重做、不合并；生产文件、许可/NOTICE、共享账本、inventory、lockfile 和全局配置均未修改。父任务负责集成、接受复核者和下一段所有权。

## 绑定与分类

候选固定为 `10a23cdf81cab37271025b59d83e78084ceb2dd6`，旧工程基线为 `8e8f6310d5ca70a57a454054e44f7b61db30b83f`，原上游为 `zai-org/ZCode@872ad960de7ec172591f7e1952f7849229f94521`。九份候选、九份旧基线、八个本地上游 blob 和 wire-codec 只读上游原件均已重核。旧检查点所有至少三行机械匹配的位置及摘要也已重核。未把上游源码写回工作区或 Git 对象库。

片段 SHA-256 使用包含原 LF 行结束符的完整闭区间；空行归入相邻片段，全文覆盖一次。旧基线语义对应区间各有摘要，不暗示逐字相同。全文摘要、Git blob、上游关系及合同材料摘要见 JSON；任何后续字节变化使绑定失效。

| 类别                          | 本包含义                                 | 接受边界                                      |
| ----------------------------- | ---------------------------------------- | --------------------------------------------- |
| `interface-constraint`        | 格式、字段、外部结果、调用次序与数据兼容 | 不自动认定具体代码/文字表达必须保留或不受保护 |
| `retained-product-expression` | 观察到的旧代码、结构或解释文字           | 技术来源关系，不是侵权或适用法结论            |
| `new-design-candidate`        | 有先行合同支持的改变设计/表达候选        | 不等于已接受独立、原创或可授权 MIT            |
| `unknown-provenance`          | 派生关系、片段来源或贡献权利未证明       | 提出具体证据问题，保留现许可                  |
| `original-Knorvia-expression` | 经接受的原创表达与权利范围               | 本次无接受项；不等于断言所有新表达都无原创性  |

类别可重叠。实现者读取旧源码的事实继续披露；新准备者补材料不会使历史变成隔离实现。相似行数、短文件、改名、测试通过和 AI 标记不作权利证明。

## 九文件结论

以下均为候选行号，完整 71 项问题见 `files[].spans`。

| 文件                                         | 兼容约束                                                   | 新设计候选                                                                | 待接受或替换的表达                                                                |
| -------------------------------------------- | ---------------------------------------------------------- | ------------------------------------------------------------------------- | --------------------------------------------------------------------------------- |
| `protocol-v4/wire-binary.ts`                 | CRC 参数；Base64 字母/填充；非空及旧 pad bits 接受域       | 11–26 表驱动 CRC；27–38 三字节对齐原生编码；39–44 原生解码                | 6–10 旧 schema 链、解码 safeParse 门；新增表达的生成/授权记录                     |
| `protocol-v4/wire-codec.ts`                  | RPC/VQL/relay 格式、属性序、预算、故障及 callback 探测次序 | 13–30 长度模型；31–45 固定预算；99–127 envelope/closure；174–191 输出生成 | 旧注释/声明、JSON helper/error 类、对象投影；149–173 二分控制流；VS Code 精确范围 |
| `protocol-v4/wire-reassembly.ts`             | 故障优先级、重复片、累计限额、UTF-8/JSON/schema 时序       | 18–29 阶段类型；76–143 staging/reconstruction/decoding；164–176 编排      | 旧结果声明、routing/metadata/error 投影与循环结构的派生关系                       |
| `protocol-v4/workflow-runs-concurrency.ts`   | cap/run limit、单调 ceiling、idle_reset、缺席键与引用      | 33–51 条件投影；70–88 变更计划；97–100 copy/delete                        | 大量原解释文字；109–117 旧 helper；对象写法变化不足以认定独立                     |
| `protocol-v4/workflow-runs-phases.ts`        | 名称序、UTF-16 限额、邻接索引、首次匹配、rounds/NaN、触界  | 51–75 stable Set；90–105 单槽更新                                         | 4–21、40–48 原注释；22–38 整个旧 reduceRunLaunched；78–89 判读                    |
| `protocol-v4/workflow-runs-node-progress.ts` | 出生清读数、头部继承、后值覆盖、首匹配与拷贝边界           | 51–66 字段策略；84–101 读数/更新计划；103–107 整数 helper                 | 模块/公开叙述；109–117 readLastTool；119–131 boundedText                          |
| `remote-workspace-identity.ts`               | ssh/wsl/docker 文法、旧 WSL 格式、IO 路径分离              | 14–20 锚定文法；27–28 token 化；52–62 表解析                              | 旧构造 switch/模板、文字、声明和 predicate；项目文法不是公开独立标准              |
| `remoteSshHostKey.ts`                        | JSON 六元组、auth 优先级/getter 序、路径词法规则           | 9–45 路径计划；47–66 token reducer                                        | 68–79 auth 函数、81–94 JSON builder/注释原样保留；新 reducer 派生关系             |
| `wslUserValidation.ts`                       | UTF-16 长度 64、禁用集合、schema 空用户与 Zod issues       | 5–8 禁用集合；10–17 集合判读                                              | 19–25 原 schema；trim/length 表达；改正则不足以证明独立                           |

以下七个完整表达逐字节等于旧工程基线。片段摘要、旧行与候选全文摘要见 `retainedWholeExpressions`，可直接用于接受决定或后续替换。

| 文件                           | 候选行  | 保留对象                             |
| ------------------------------ | ------- | ------------------------------------ |
| workflow-runs-phases.ts        | 22–38   | 完整 reduceRunLaunched               |
| workflow-runs-node-progress.ts | 109–117 | readLastTool 注释及完整函数          |
| workflow-runs-node-progress.ts | 119–131 | boundedText 注释及完整函数           |
| remoteSshHostKey.ts            | 68–79   | 完整 resolveSshAuthKind              |
| remoteSshHostKey.ts            | 81–94   | buildSshRemoteHostKey 注释及完整函数 |
| wslUserValidation.ts           | 19–25   | 完整 wslUserSchema                   |
| remote-workspace-identity.ts   | 29–42   | 构造 switch、全部模板及函数结尾      |

wire-codec 上游原件 SHA-256 `ac2494a3acc795c809c94ee9393f50271a9c2a0fd33813459e5ab93842ceef75`、Git blob `0332e837eac7b8805a12cb8dd3210599632e373e` 均匹配历史 ledger；旧工程基线摘要为 `a8a419e27202f9644dba7589e3e0a95f25b2f0baf3438c157f85e9aee843044f`。两者仅第 38 行包名注释与第 60 行品牌字段不同，这个旧基线不是独立重写证据。本包未修复 inventory 旧 input binding，也未把整个文件归属 Microsoft。

## 合同与贡献权利

W/R/P 的合同、观察、测试、消费者和旧验收材料均绑定摘要；祖先关系证明合同检查点早于实现。它不证明作者权利或表达独立。

| 合同                                                                | 检查点                                   | 实现提交                                 | 历史工程结果，本次未重跑            |
| ------------------------------------------------------------------- | ---------------------------------------- | ---------------------------------------- | ----------------------------------- |
| [W：wire](../specs/knorvia-protocol-wire-helpers-20260930.md)       | 0639cf675dec4dc6556b5ee9e57da87ddfb8c36e | 5277f8074c5071d3fc90b72370347ddf6d53ee51 | reviewed source/dist 各146通过      |
| [R：identity](../specs/knorvia-remote-identity-helpers-20260930.md) | 9eeb7892d87d9d95d34ab9252c6c482b81ff8174 | bc36df98da36e56cda66051137b99d31f2184666 | source/dist 各257通过               |
| [P：workflow](../specs/knorvia-workflow-projections-20260930.md)    | b65d9f01ed74c0c844273a49eee6fd8e942a4b7e | 10a23cdf81cab37271025b59d83e78084ceb2dd6 | 最终 reviewed source/dist 各311通过 |

公开标准支持算法/行为事实：[RFC4648 §3–4](https://www.rfc-editor.org/rfc/rfc4648.html) 描述 Base64；[RFC1952 §3.2/附录](https://www.rfc-editor.org/rfc/rfc1952.html) 提供 CRC 参数；[HTML Base64 API](https://html.spec.whatwg.org/multipage/webappapis.html#atob) 支持原生转换。项目 schema、错误 namespace、SSH/WSL 身份和工作流仍是项目合同，不因引用 RFC 成为已授权的新表达。本次没有复制 RFC 参考 C 实现。

AGENTS、任务授权、Git 作者和旧 evidence 没有提供可核实的新贡献授权链。这表示**本包没有证据**，不是断言作者实际无权。接受者需识别贡献者和适用雇佣/委托/贡献条款，明确可授权增量及保留材料排除范围。生成标记不替代权利依据，Apache contributor/默认贡献条款也不能自行证明某次提交符合其前提。[Apache §1–5](https://www.apache.org/licenses/LICENSE-2.0)

## 接受门槛

1. **AC1 摘要有效**：核对九个整文件、71 个片段、旧基线/上游关系和 W/R/P 材料；接受记录绑定当前候选，不把准备状态视为接受。
2. **AC2 表达有结论**：另一复核者回答每项 reviewQuestion，区分必要行为、旧表达、新设计及未知；七个完整保留项及 wire 二分路径必须明确处置。接口兼容不自动豁免函数体。
3. **AC3 权利范围可核实**：拟作 MIT 的增量需贡献依据、生成/设计记录和保留材料排除范围；未补证继续原许可/待审。不制造签署、同意或隔离历史。
4. **AC4 产品迁移和许可分开**：ZCode 产品代码需有证据的独立替换或具体非实现性质结论。保留/混合代码即使可按 Apache 分发，也不能宣称用户独立迁移完成。
5. **AC5 第三方范围准确**：VS Code 部分 MIT 不覆盖本地 envelope 适配；导入 revision、精确片段与义务继续查。未知时保留 notice，不按根许可/目录批量授权。
6. **AC6 工程证据随变动核验**：本次无生产变化，不重跑旧 runtime/full suite。后续生产改动先冻结外部合同、执行相关 source/dist/消费者回归，核对声明、输入/产物、desktop continuous/mobile replay。CLI journal/launch、设备等历史未验范围仍披露。
7. **AC7 接受和分发闭环**：父任务接受后更新 ledger/报告/input binding；发布时核验实际 source/dist/bundle 许可与 NOTICE 闭包。本包不冲销既有27项材料义务。

## 后续设计合同候选

本轨只提出供父任务安排的方案边界，没有新增生产所有权或代码：

- Base64/WSL schema：辨明接受域、完整 Zod issues 和公开 introspection 的真实兼容需求。必要保留表达可作精确性质决定；需要替换时新校验设计须保持外部结果。旧 spec 冻结 schema expression，不能偷偷放宽测试制造独立性；真正不相容的可靠性/体验改进先由父任务修订规格、明确验收差异。
- Phase/node projection：从接受名字表、稳定邻接、出生/携带/覆盖策略与单一状态所有者建立新的计划/投影架构，并说明价值。验收包括缺席/无效/上限/重复、getter/native 异常、引用/单槽拷贝及 replay/resume。重写注释不完成未变函数体迁移，换循环也不足以形成独立设计。
- Identity/SSH key：评估单一数据驱动投影计划的可维护性价值，保持持久键字节、字段读取序与路径词法规则；模板/if 链移入配置不自动闭合。不得借本包改认证、存储或连接流程。
- Wire 二分探测：callback 可以有状态，调用序列已冻结。接受者先判明具体表达必要性/保留范围；若提出不同算法，需性能/可靠性价值和保持或获准改变的合同，不无说明改探测顺序。

## 第三方保留与分发证据

重取固定上游 LICENSE 后仍与根许可一致，SHA-256 `606c36baf38b973227273df12a74930e4b4137280eea835c5cd623aa4553c13b`。[固定上游原文](https://raw.githubusercontent.com/zai-org/ZCode/872ad960de7ec172591f7e1952f7849229f94521/LICENSE) 支持保留对应 Apache 范围，不证明新贡献 MIT 权利。

Apache 允许满足 §4 后对修改/整体附加条款；再分发仍需许可副本、修改声明、适用署名/NOTICE。[Apache §4](https://www.apache.org/licenses/LICENSE-2.0) 修改不消除原义务。[ASF FAQ](https://www.apache.org/foundation/license-faq.html) MIT 也要求保留相应版权与许可正文。[MIT 原文](https://opensource.org/license/mit)

| 第三方候选             | 保留材料                                      | 本包证据与未完成项                               |
| ---------------------- | --------------------------------------------- | ------------------------------------------------ |
| TypeScript 6.0.2       | Apache LICENSE.txt                            | 历史全文匹配；未核新发布闭包                     |
| playwright-core 1.59.1 | Apache LICENSE/NOTICE                         | 历史全文匹配；浏览器/运行时实际分发另核          |
| ECharts 6.1.0          | Apache LICENSE/NOTICE、D3 声明、README 许可段 | 三份历史全文匹配；本次补齐62字节 README 提取     |
| pdfjs-dist 5.4.296     | Apache LICENSE、CMap/ICC/字体/WASM 各自正文   | 九份历史全文匹配；子材料不由顶层 Apache 标签改写 |

四个通用依赖可在遵守具体条款/分发范围后保留，规格不要求为自有 MIT 模块重写它们。15份全文核对是旧检查点保存结果，本环境没有实装依赖，不冒充重跑。ECharts 遗漏提取本次从[固定版本 registry metadata](https://registry.npmjs.org/echarts/6.1.0) 的 tarball 在内存重现，SHA-512 匹配 registry integrity。按检查点 scripts/third-party-npm.mjs 提取 README 许可段，SHA-256 `8a4c3eb1acbbc8ae95185e93061600adc6a51988e5c5ac264738a5cc5aa3667d` 匹配 inventory。未安装依赖、提取资产到工作区或核验整个 tarball 再分发闭包。

固定 VS Code LICENSE 重取摘要 `9480271317925265e806a9a196aaa33410a962fa9d4d1e248a4a5187bc8c9df9` 匹配保留文本，但 importRevision 仍为 null，记录明确本地 envelope measurement 属于 ZCode 适配；参考许可不是原始导入版本证明。[固定 VS Code 原文](https://raw.githubusercontent.com/microsoft/vscode/44825207bf4389c3bd17c92d3ec28cf784c324cc/LICENSE.txt)

## 本轮检查与阻塞

逐文件/片段/上游摘要、机械匹配、七个完整保留项、合同祖先和受保护材料已核对。文档/JSON 用临时隔离的固定 oxfmt@0.41.0 格式化并检查（根配置忽略 evidence JSON，故显式使用临时空配置，仓库配置不改）；JSON结构/覆盖、相对链接和 git diff --check 通过。三组旧测试只作历史证据，本次未运行 runtime、全量测试或构建。

仓库要求的 pnpm typecheck/lint 均已尝试。本环境 fallback 为 pnpm11.19.0、Node24.19.0（项目固定10.33.2/24.14.0），且无工作区依赖；fallback 自动进入 install 后因 /home/agent/.local/share/pnpm 不存在退出，两脚本均未执行。直接架构命令因缺 typescript 退出，不能写成通过。未执行完整 verify:pre-push，它依赖同样不可用的 root lint/架构环境；未改全局配置或申请额外权限。

剩余阻塞：独立接受复核、贡献权利依据、保留表达处置、VS Code 导入/片段范围、父任务 inventory/ledger 更新及真实分发闭包。227/12/215 与27材料义务是旧交接快照，不作当前全仓进度；本轨新增来源接受仍为0。本包准备已收束，请父任务指派下一范围。既有路线见[来源策略](knorvia-protocol-source-review-strategy-20260930.md)。
