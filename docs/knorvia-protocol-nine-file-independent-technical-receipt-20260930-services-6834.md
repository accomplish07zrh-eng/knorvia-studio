# 协议九文件独立技术来源复核 receipt

2026-09-30。服务轨复核者未实现这九个协议文件，现对固定候选的 **950 行、71 个片段**完成独立技术复核。支持 24 个限定的设计方面；**整文件独立来源接受、MIT 新授权、材料义务冲销均为 0**。七项完整保留表达均与工程基线和实际上游对象三方逐字节相同。技术支持仅确认设计/组织变化的理由，不确认表达原创性或许可权利。

本 receipt 是源码暴露后的 AI 技术审查记录，不是 clean-room 历史、法律担保或虚构人类签署。它补充[原来源包](knorvia-protocol-nine-file-source-review-wip-20260930.md)，不修改原包、生产实现、测试、共享账本、inventory、许可、NOTICE 或配置。[完整机器证据](../licensing/evidence/protocol-nine-file-independent-technical-receipt-20260930-services-6834.json)为逐片段决定的审计主体。

## 固定输入与复核方法

| 对象         | 固定提交                                   |
| ------------ | ------------------------------------------ |
| 来源包       | `b915d34b3af09cd3ace64c27dec8a88b51c8f0ab` |
| 候选九文件   | `10a23cdf81cab37271025b59d83e78084ceb2dd6` |
| 工程基线     | `8e8f6310d5ca70a57a454054e44f7b61db30b83f` |
| ZCode 原上游 | `872ad960de7ec172591f7e1952f7849229f94521` |

分支 `cloud/services-protocol-source-receipt-20260930-standard-6834` 从来源包提交创建。本提交只新增本文与 JSON。JSON 绑定原包两文件的 raw SHA-256/Git blob、九候选/基线/上游整对象、71 候选片段、所有旧对应范围、修正后的上游范围、W/R/P 三组合同和 22 份材料。行号为从 1 起算的闭区间，包含原行结束符；字节区间为从 0 起算的半开区间。后续候选字节变化使相应接受依据失效。

复核阅读了候选与实际旧实现、先行合同和发布者原件，区分接口行为与实现表达；没有用相似度或测试通过代替来源判断。八个工程基线与上游整文件相同；wire-codec 只有旧第38行包名注释、第60行品牌字段不同，不能据此视为独立重写。

| 候选文件                                                                                                                                                                                                         | 行数/片段 | raw SHA-256                                                        |
| ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------- | ------------------------------------------------------------------ |
| [protocol-v4/wire-binary.ts](https://github.com/accomplish07zrh-eng/knorvia-studio/blob/10a23cdf81cab37271025b59d83e78084ceb2dd6/packages/shared/src/protocol-v4/wire-binary.ts)                                 | 44/5      | `ef91614fb10b1f2add409b1c3ceda49acc2006a6500982f13456fd26582f3f7d` |
| [protocol-v4/wire-codec.ts](https://github.com/accomplish07zrh-eng/knorvia-studio/blob/10a23cdf81cab37271025b59d83e78084ceb2dd6/packages/shared/src/protocol-v4/wire-codec.ts)                                   | 191/13    | `ac1e36d497dafe684a24979e77c1dcb6e0892d731bd4c33fa220eb8a1f221429` |
| [protocol-v4/wire-reassembly.ts](https://github.com/accomplish07zrh-eng/knorvia-studio/blob/10a23cdf81cab37271025b59d83e78084ceb2dd6/packages/shared/src/protocol-v4/wire-reassembly.ts)                         | 176/11    | `ff43c234355ed8611f24ff068d2e9c3e3576940fd2c2adcac1bddffc3dd2da28` |
| [protocol-v4/workflow-runs-concurrency.ts](https://github.com/accomplish07zrh-eng/knorvia-studio/blob/10a23cdf81cab37271025b59d83e78084ceb2dd6/packages/shared/src/protocol-v4/workflow-runs-concurrency.ts)     | 117/9     | `589bae3bd4abcc5fff5a4fe2a23157da52cb53411ad5b98bcd57d015a19ae604` |
| [protocol-v4/workflow-runs-phases.ts](https://github.com/accomplish07zrh-eng/knorvia-studio/blob/10a23cdf81cab37271025b59d83e78084ceb2dd6/packages/shared/src/protocol-v4/workflow-runs-phases.ts)               | 105/7     | `24fbc915e62372f0a9ea8764137b46902b42cba35cbef42c4780e230739272b5` |
| [protocol-v4/workflow-runs-node-progress.ts](https://github.com/accomplish07zrh-eng/knorvia-studio/blob/10a23cdf81cab37271025b59d83e78084ceb2dd6/packages/shared/src/protocol-v4/workflow-runs-node-progress.ts) | 131/8     | `4226480b6b8407c87614697b47c699a367af925bca58abe185839673d7841b48` |
| [remote-workspace-identity.ts](https://github.com/accomplish07zrh-eng/knorvia-studio/blob/10a23cdf81cab37271025b59d83e78084ceb2dd6/packages/shared/src/remote-workspace-identity.ts)                             | 67/8      | `eb845d89d177614b1f901c61068688500e4d3864a75d7a427080bb4bc7023089` |
| [remoteSshHostKey.ts](https://github.com/accomplish07zrh-eng/knorvia-studio/blob/10a23cdf81cab37271025b59d83e78084ceb2dd6/packages/shared/src/remoteSshHostKey.ts)                                               | 94/6      | `14ee2f113e4e7f3c11b8bf0d4af86fd2dcd3ab9153805611a73f4c29c8f626c7` |
| [wslUserValidation.ts](https://github.com/accomplish07zrh-eng/knorvia-studio/blob/10a23cdf81cab37271025b59d83e78084ceb2dd6/packages/shared/src/wslUserValidation.ts)                                             | 25/4      | `de27a789b433e641237c124619caadfdf267407a4ca0bd48fecdf3a9b259fadd` |

## 可接受的技术部分及未闭合范围

`N` 表示可支持限定设计增量；`I` 表示接口/格式/行为约束；`R` 表示保留产品表达；`D` 表示与旧实现有关的重表达；`M` 表示迁移记录。类别可重叠。**N 不代表整段原创或可 MIT 授权**：JSON 的 supportedDesignScopes 明确子范围与排除的旧政策/对象。所有混合文件继续保留适用 Apache/第三方条款。新增 Knorvia 表达的贡献权利未知，与已公开 Apache/MIT 许可的有效使用范围分开记录。

### protocol-v4/wire-binary.ts

| 片段 | 候选行                                                                                                                                                          | 判断  | 独立复核结论                                                                                                 |
| ---- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----- | ------------------------------------------------------------------------------------------------------------ |
| 1    | [1–5](https://github.com/accomplish07zrh-eng/knorvia-studio/blob/10a23cdf81cab37271025b59d83e78084ceb2dd6/packages/shared/src/protocol-v4/wire-binary.ts#L1)    | I/M   | 迁移声明准确披露源码暴露；Zod 导入是依赖边界，声明自身不证明原创。                                           |
| 2    | [6–10](https://github.com/accomplish07zrh-eng/knorvia-studio/blob/10a23cdf81cab37271025b59d83e78084ceb2dd6/packages/shared/src/protocol-v4/wire-binary.ts#L6)   | I/R   | 完整 Zod schema 链与旧基线相同；接受域是兼容事实，链式表达仍须保留原许可并单独处置。                         |
| 3    | [11–26](https://github.com/accomplish07zrh-eng/knorvia-studio/blob/10a23cdf81cab37271025b59d83e78084ceb2dd6/packages/shared/src/protocol-v4/wire-binary.ts#L11) | N/I   | 以 256 项查表替代旧逐位处理；可支持这项技术设计变化。CRC 参数/十六进制输出是约束，表生成表达的贡献权利尚缺。 |
| 4    | [27–38](https://github.com/accomplish07zrh-eng/knorvia-studio/blob/10a23cdf81cab37271025b59d83e78084ceb2dd6/packages/shared/src/protocol-v4/wire-binary.ts#L27) | N/I   | 以三字节对齐的有界块调用 btoa，替代手工字母表；兼顾 padding 与展开栈上限，可支持该机制增量。                 |
| 5    | [39–44](https://github.com/accomplish07zrh-eng/knorvia-studio/blob/10a23cdf81cab37271025b59d83e78084ceb2dd6/packages/shared/src/protocol-v4/wire-binary.ts#L39) | N/I/R | 42–44 原生解码转换可支持；39–41 签名/schema 门沿用既有接受域与表达，不能整体归为新实现。                     |

### protocol-v4/wire-codec.ts

| 片段 | 候选行                                                                                                                                                            | 判断  | 独立复核结论                                                                                                         |
| ---- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----- | -------------------------------------------------------------------------------------------------------------------- |
| 1    | [1–12](https://github.com/accomplish07zrh-eng/knorvia-studio/blob/10a23cdf81cab37271025b59d83e78084ceb2dd6/packages/shared/src/protocol-v4/wire-codec.ts#L1)      | I/M   | 迁移及部分 VS Code 来源声明保留；导入均为本地 core/binary/wire，没有新增 RPC 或 VS Code runtime import。             |
| 2    | [13–30](https://github.com/accomplish07zrh-eng/knorvia-studio/blob/10a23cdf81cab37271025b59d83e78084ceb2dd6/packages/shared/src/protocol-v4/wire-codec.ts#L13)    | N/I   | 阈值求长度替代旧逐次移位计数；支持闭式长度模型。tag、7-bit VQL、204 和 socket 长度来自协议，最大 ID 预算是本地选择。 |
| 3    | [31–45](https://github.com/accomplish07zrh-eng/knorvia-studio/blob/10a23cdf81cab37271025b59d83e78084ceb2dd6/packages/shared/src/protocol-v4/wire-codec.ts#L31)    | I/D   | 固定预算只由每次计量移到模块级；relay 字段、保守值与属性序来自旧产品适配，不接受为新算法。                           |
| 4    | [46–55](https://github.com/accomplish07zrh-eng/knorvia-studio/blob/10a23cdf81cab37271025b59d83e78084ceb2dd6/packages/shared/src/protocol-v4/wire-codec.ts#L46)    | I/R   | 原公开计量说明及结果声明保留；外部字段名可兼容，但原解释文字没有因此成为新贡献。                                     |
| 5    | [56–68](https://github.com/accomplish07zrh-eng/knorvia-studio/blob/10a23cdf81cab37271025b59d83e78084ceb2dd6/packages/shared/src/protocol-v4/wire-codec.ts#L56)    | I/D   | 三层长度公式按旧预算重排；Base64 长度是格式事实，logical/relay 投影仍与 ZCode 产品实现有来源关系。                   |
| 6    | [69–79](https://github.com/accomplish07zrh-eng/knorvia-studio/blob/10a23cdf81cab37271025b59d83e78084ceb2dd6/packages/shared/src/protocol-v4/wire-codec.ts#L69)    | I/R   | JSON byte helper 与错误类保留原实现关系；TextEncoder/JSON API 是标准能力，组合表达未独立闭合。                       |
| 7    | [80–90](https://github.com/accomplish07zrh-eng/knorvia-studio/blob/10a23cdf81cab37271025b59d83e78084ceb2dd6/packages/shared/src/protocol-v4/wire-codec.ts#L80)    | I/R   | 选项声明和 callback shape 沿用；可保留接口约束，不能据声明将同文件函数体归 MIT。                                     |
| 8    | [91–98](https://github.com/accomplish07zrh-eng/knorvia-studio/blob/10a23cdf81cab37271025b59d83e78084ceb2dd6/packages/shared/src/protocol-v4/wire-codec.ts#L91)    | I/D   | 有限正数判断取反、重命名并合并参数；与旧 limit helper 同一判读方案，无新增算法接受。                                 |
| 9    | [99–110](https://github.com/accomplish07zrh-eng/knorvia-studio/blob/10a23cdf81cab37271025b59d83e78084ceb2dd6/packages/shared/src/protocol-v4/wire-codec.ts#L99)   | N/I/D | 支持单一 envelope 工厂消除重复构造的组织增量；字段内容和顺序仍由旧产品对象及合同继承。                               |
| 10   | [111–127](https://github.com/accomplish07zrh-eng/knorvia-studio/blob/10a23cdf81cab37271025b59d83e78084ceb2dd6/packages/shared/src/protocol-v4/wire-codec.ts#L111) | N/I/D | 支持闭包固定一次 reservation/元数据的组织增量；fragment 字段、读取序和错误约束沿用。                                 |
| 11   | [128–148](https://github.com/accomplish07zrh-eng/knorvia-studio/blob/10a23cdf81cab37271025b59d83e78084ceb2dd6/packages/shared/src/protocol-v4/wire-codec.ts#L128) | I/D   | 限额、JSON 编码、complete admission 依原执行次序；抽取工厂没有使入口策略独立闭合。                                   |
| 12   | [149–173](https://github.com/accomplish07zrh-eng/knorvia-studio/blob/10a23cdf81cab37271025b59d83e78084ceb2dd6/packages/shared/src/protocol-v4/wire-codec.ts#L149) | I/R/D | 整数二分、最坏索引 probe、调整边界和故障路径沿用旧设计；callback 顺序被冻结不等于函数体必须保留或已原创。            |
| 13   | [174–191](https://github.com/accomplish07zrh-eng/knorvia-studio/blob/10a23cdf81cab37271025b59d83e78084ceb2dd6/packages/shared/src/protocol-v4/wire-codec.ts#L174) | I/D   | Array.from 替换结果循环，分片切片与逐片复核策略仍继承；可作为实现选择，无新增算法/来源接受。                         |

### protocol-v4/wire-reassembly.ts

| 片段 | 候选行                                                                                                                                                                 | 判断  | 独立复核结论                                                                                          |
| ---- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----- | ----------------------------------------------------------------------------------------------------- |
| 1    | [1–17](https://github.com/accomplish07zrh-eng/knorvia-studio/blob/10a23cdf81cab37271025b59d83e78084ceb2dd6/packages/shared/src/protocol-v4/wire-reassembly.ts#L1)      | I/R/M | 新增迁移记录与原 result union 混合；公开返回 union 属接口，原声明/表达仍保留来源。                    |
| 2    | [18–29](https://github.com/accomplish07zrh-eng/knorvia-studio/blob/10a23cdf81cab37271025b59d83e78084ceb2dd6/packages/shared/src/protocol-v4/wire-reassembly.ts#L18)    | N/I/D | 支持 staged/bytes/payload 的显式阶段表示；reject 返回对象是原故障 shape 的抽取，非整段独立证明。      |
| 3    | [30–38](https://github.com/accomplish07zrh-eng/knorvia-studio/blob/10a23cdf81cab37271025b59d83e78084ceb2dd6/packages/shared/src/protocol-v4/wire-reassembly.ts#L30)    | I/D   | null/object guard 与 topic/subscription equality 从旧路由检查抽取；不作新设计接受。                   |
| 4    | [39–49](https://github.com/accomplish07zrh-eng/knorvia-studio/blob/10a23cdf81cab37271025b59d83e78084ceb2dd6/packages/shared/src/protocol-v4/wire-reassembly.ts#L39)    | I/D   | schema.safeParse 与 parsed.data/delivery 投影从原函数抽取；转换后的 schema 输出与错误时序是兼容事实。 |
| 5    | [50–71](https://github.com/accomplish07zrh-eng/knorvia-studio/blob/10a23cdf81cab37271025b59d83e78084ceb2dd6/packages/shared/src/protocol-v4/wire-reassembly.ts#L50)    | N/I/D | 字段表驱动的 metadata 遍历可支持为维护性增量；具体七字段、checksum 和索引边界继承。                   |
| 6    | [72–75](https://github.com/accomplish07zrh-eng/knorvia-studio/blob/10a23cdf81cab37271025b59d83e78084ceb2dd6/packages/shared/src/protocol-v4/wire-reassembly.ts#L72)    | I/D   | 长度加 every 是旧逐字节比较的短写；字节等价规则必须兼容，不能单靠短写闭合来源。                       |
| 7    | [76–101](https://github.com/accomplish07zrh-eng/knorvia-studio/blob/10a23cdf81cab37271025b59d83e78084ceb2dd6/packages/shared/src/protocol-v4/wire-reassembly.ts#L76)   | N/I/D | 支持把局部 Map/累计字节收为明确 staging 结果；metadata/Base64/冲突/限额顺序及 map 算法沿用。          |
| 8    | [102–125](https://github.com/accomplish07zrh-eng/knorvia-studio/blob/10a23cdf81cab37271025b59d83e78084ceb2dd6/packages/shared/src/protocol-v4/wire-reassembly.ts#L102) | N/I/D | 支持 reconstruction 独立阶段及 tagged 返回；缺片扫描、按索引拼接、长度错误来自原流程。                |
| 9    | [126–143](https://github.com/accomplish07zrh-eng/knorvia-studio/blob/10a23cdf81cab37271025b59d83e78084ceb2dd6/packages/shared/src/protocol-v4/wire-reassembly.ts#L126) | N/I/D | 支持 decodePayload 阶段边界；CRC、fatal UTF-8、JSON 的顺序和 try/catch 故障映射继承。                 |
| 10   | [144–163](https://github.com/accomplish07zrh-eng/knorvia-studio/blob/10a23cdf81cab37271025b59d83e78084ceb2dd6/packages/shared/src/protocol-v4/wire-reassembly.ts#L144) | I/D   | 入口限额、complete 分支与路由/schema 顺序继续原策略；未引入新状态 owner。                             |
| 11   | [164–176](https://github.com/accomplish07zrh-eng/knorvia-studio/blob/10a23cdf81cab37271025b59d83e78084ceb2dd6/packages/shared/src/protocol-v4/wire-reassembly.ts#L164) | N/I/D | 支持由 tagged 阶段返回驱动的单调用编排；assembler/gateway 所有权没有变化，算法来源仍混合。            |

### protocol-v4/workflow-runs-concurrency.ts

| 片段 | 候选行                                                                                                                                                                           | 判断  | 独立复核结论                                                                                           |
| ---- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----- | ------------------------------------------------------------------------------------------------------ |
| 1    | [1–14](https://github.com/accomplish07zrh-eng/knorvia-studio/blob/10a23cdf81cab37271025b59d83e78084ceb2dd6/packages/shared/src/protocol-v4/workflow-runs-concurrency.ts#L1)      | I/R/M | 原模块解释文字/导入保留，首行来源记录为新增；公开纯函数纪律不是整段原创证据。                          |
| 2    | [15–28](https://github.com/accomplish07zrh-eng/knorvia-studio/blob/10a23cdf81cab37271025b59d83e78084ceb2dd6/packages/shared/src/protocol-v4/workflow-runs-concurrency.ts#L15)    | I/R   | idle_reset 常量、完整说明沿用；事件业务语义继承，解释文字仍须来源处置。                                |
| 3    | [29–53](https://github.com/accomplish07zrh-eng/knorvia-studio/blob/10a23cdf81cab37271025b59d83e78084ceb2dd6/packages/shared/src/protocol-v4/workflow-runs-concurrency.ts#L29)    | I/D   | spread 条件投影改成逐字段赋值；cap、ceiling、limit/cooldown 的计算仍原方案，仅写法变化不接受独立算法。 |
| 4    | [54–65](https://github.com/accomplish07zrh-eng/knorvia-studio/blob/10a23cdf81cab37271025b59d83e78084ceb2dd6/packages/shared/src/protocol-v4/workflow-runs-concurrency.ts#L54)    | I/R   | run-started 与桶读数关系的原长注释保留；不能以规范冻结评论为原创依据。                                 |
| 5    | [66–90](https://github.com/accomplish07zrh-eng/knorvia-studio/blob/10a23cdf81cab37271025b59d83e78084ceb2dd6/packages/shared/src/protocol-v4/workflow-runs-concurrency.ts#L66)    | N/I/D | 70–88 变更计划在单次 copy 前汇集配置与桶读数，可支持有限组织增量；旧 withCeiling 和配置规则已有。      |
| 6    | [91–95](https://github.com/accomplish07zrh-eng/knorvia-studio/blob/10a23cdf81cab37271025b59d83e78084ceb2dd6/packages/shared/src/protocol-v4/workflow-runs-concurrency.ts#L91)    | I/R   | 终态 cooldown 的原解释文字保留。                                                                       |
| 7    | [96–102](https://github.com/accomplish07zrh-eng/knorvia-studio/blob/10a23cdf81cab37271025b59d83e78084ceb2dd6/packages/shared/src/protocol-v4/workflow-runs-concurrency.ts#L96)   | I/D   | destructure/rest 改 copy/delete，仍同一清键投影；无新算法，幂等引用规则继承。                          |
| 8    | [103–108](https://github.com/accomplish07zrh-eng/knorvia-studio/blob/10a23cdf81cab37271025b59d83e78084ceb2dd6/packages/shared/src/protocol-v4/workflow-runs-concurrency.ts#L103) | I/D   | 带 minimum 参数的整数 helper 合并旧正数/非负 reader；属于通用判读整合，不能单独证明新出处。            |
| 9    | [109–117](https://github.com/accomplish07zrh-eng/knorvia-studio/blob/10a23cdf81cab37271025b59d83e78084ceb2dd6/packages/shared/src/protocol-v4/workflow-runs-concurrency.ts#L109) | I/R   | nonEmptyString/plainRecord 函数沿用旧表达；短小与通用性需具体性质决定，不能自动豁免。                  |

### protocol-v4/workflow-runs-phases.ts

| 片段 | 候选行                                                                                                                                                                    | 判断  | 独立复核结论                                                                                         |
| ---- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----- | ---------------------------------------------------------------------------------------------------- |
| 1    | [1–3](https://github.com/accomplish07zrh-eng/knorvia-studio/blob/10a23cdf81cab37271025b59d83e78084ceb2dd6/packages/shared/src/protocol-v4/workflow-runs-phases.ts#L1)     | I/M   | 首行迁移记录新增，公开 limits/state 导入沿用接口。                                                   |
| 2    | [4–21](https://github.com/accomplish07zrh-eng/knorvia-studio/blob/10a23cdf81cab37271025b59d83e78084ceb2dd6/packages/shared/src/protocol-v4/workflow-runs-phases.ts#L4)    | I/R   | phase/run-launched 原叙述逐字沿用；函数拆分史与重放说明仍是产品解释文字。                            |
| 3    | [22–39](https://github.com/accomplish07zrh-eng/knorvia-studio/blob/10a23cdf81cab37271025b59d83e78084ceb2dd6/packages/shared/src/protocol-v4/workflow-runs-phases.ts#L22)  | I/R   | 完整 reduceRunLaunched 原样保留；phaseNames admission 是兼容约束，函数体迁移仍未完成。               |
| 4    | [40–50](https://github.com/accomplish07zrh-eng/knorvia-studio/blob/10a23cdf81cab37271025b59d83e78084ceb2dd6/packages/shared/src/protocol-v4/workflow-runs-phases.ts#L40)  | I/R   | alongside 原说明与 admission 保留；拒收错误索引的行为不等于整段授权新贡献。                          |
| 5    | [51–77](https://github.com/accomplish07zrh-eng/knorvia-studio/blob/10a23cdf81cab37271025b59d83e78084ceb2dd6/packages/shared/src/protocol-v4/workflow-runs-phases.ts#L51)  | N/I/D | 支持 Set 只判重而数组写原值的稳定去重机制，保留首次 -0；边界、顺序和邻接业务规则继承。               |
| 6    | [78–89](https://github.com/accomplish07zrh-eng/knorvia-studio/blob/10a23cdf81cab37271025b59d83e78084ceb2dd6/packages/shared/src/protocol-v4/workflow-runs-phases.ts#L78)  | I/R/D | 签名、名称裁剪及 ordinal admission 沿旧策略；不是新 phase 算法。                                     |
| 7    | [90–105](https://github.com/accomplish07zrh-eng/knorvia-studio/blob/10a23cdf81cab37271025b59d83e78084ceb2dd6/packages/shared/src/protocol-v4/workflow-runs-phases.ts#L90) | N/I/D | 支持首匹配索引的单槽 slice 更新替代 map；max rounds/NaN、触界、currentPhase 与 truncation 合同继承。 |

### protocol-v4/workflow-runs-node-progress.ts

| 片段 | 候选行                                                                                                                                                                             | 判断  | 独立复核结论                                                                                 |
| ---- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----- | -------------------------------------------------------------------------------------------- |
| 1    | [1–28](https://github.com/accomplish07zrh-eng/knorvia-studio/blob/10a23cdf81cab37271025b59d83e78084ceb2dd6/packages/shared/src/protocol-v4/workflow-runs-node-progress.ts#L1)      | I/R/M | 首行迁移记录新增，其余出生/进度业务叙述及导入保留原表达。                                    |
| 2    | [29–45](https://github.com/accomplish07zrh-eng/knorvia-studio/blob/10a23cdf81cab37271025b59d83e78084ceb2dd6/packages/shared/src/protocol-v4/workflow-runs-node-progress.ts#L29)    | I/R   | 四字段 Pick 与 carry 原长注释沿用；出生/缓存语义不是新权利证明。                             |
| 3    | [46–68](https://github.com/accomplish07zrh-eng/knorvia-studio/blob/10a23cdf81cab37271025b59d83e78084ceb2dd6/packages/shared/src/protocol-v4/workflow-runs-node-progress.ts#L46)    | N/I/D | 51–66 以字段遍历显式形成 carry projection 可支持组织增量；出生清计数、摘要继承政策原先已有。 |
| 4    | [69–78](https://github.com/accomplish07zrh-eng/knorvia-studio/blob/10a23cdf81cab37271025b59d83e78084ceb2dd6/packages/shared/src/protocol-v4/workflow-runs-node-progress.ts#L69)    | I/R   | progress 后值覆盖、未知实例忽略的原解释文字保留。                                            |
| 5    | [79–102](https://github.com/accomplish07zrh-eng/knorvia-studio/blob/10a23cdf81cab37271025b59d83e78084ceb2dd6/packages/shared/src/protocol-v4/workflow-runs-node-progress.ts#L79)   | N/I/D | 84–101 readings 计划再 copy 更新可支持有限结构增量；首匹配、仅覆盖已知读数、引用规则继承。   |
| 6    | [103–108](https://github.com/accomplish07zrh-eng/knorvia-studio/blob/10a23cdf81cab37271025b59d83e78084ceb2dd6/packages/shared/src/protocol-v4/workflow-runs-node-progress.ts#L103) | I/D   | 参数化整数 reader 合并旧判读；通用惯用表达需单独性质评估，无新算法接受。                     |
| 7    | [109–118](https://github.com/accomplish07zrh-eng/knorvia-studio/blob/10a23cdf81cab37271025b59d83e78084ceb2dd6/packages/shared/src/protocol-v4/workflow-runs-node-progress.ts#L109) | I/R   | readLastTool 注释及完整函数逐字保留；七项 retained expression 之一。                         |
| 8    | [119–131](https://github.com/accomplish07zrh-eng/knorvia-studio/blob/10a23cdf81cab37271025b59d83e78084ceb2dd6/packages/shared/src/protocol-v4/workflow-runs-node-progress.ts#L119) | I/R   | boundedText 注释及完整函数逐字保留；不是只保留字段名。                                       |

### remote-workspace-identity.ts

| 片段 | 候选行                                                                                                                                                            | 判断  | 独立复核结论                                                                                       |
| ---- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----- | -------------------------------------------------------------------------------------------------- |
| 1    | [1–13](https://github.com/accomplish07zrh-eng/knorvia-studio/blob/10a23cdf81cab37271025b59d83e78084ceb2dd6/packages/shared/src/remote-workspace-identity.ts#L1)   | I/R/M | 新增迁移说明与旧 parsed identity 声明混合；kind/路径类型是接口，不能覆盖构造实现授权。             |
| 2    | [14–21](https://github.com/accomplish07zrh-eng/knorvia-studio/blob/10a23cdf81cab37271025b59d83e78084ceb2dd6/packages/shared/src/remote-workspace-identity.ts#L14) | N/I   | 支持锚定 regex 文法表替代游标与 authority 段数查表；文法源于项目兼容合同，非公开独立标准。         |
| 3    | [22–26](https://github.com/accomplish07zrh-eng/knorvia-studio/blob/10a23cdf81cab37271025b59d83e78084ceb2dd6/packages/shared/src/remote-workspace-identity.ts#L22) | I/R   | 候选22–26与基线42–46完全相同；输入包43–47是偏移后的语义定位，receipt 精确修正。                    |
| 4    | [27–28](https://github.com/accomplish07zrh-eng/knorvia-studio/blob/10a23cdf81cab37271025b59d83e78084ceb2dd6/packages/shared/src/remote-workspace-identity.ts#L27) | N/I   | split/filter/join 的 token 路径归一替代 slash 压缩 regex；支持机制增量，归一后的持久键字节仍继承。 |
| 5    | [29–43](https://github.com/accomplish07zrh-eng/knorvia-studio/blob/10a23cdf81cab37271025b59d83e78084ceb2dd6/packages/shared/src/remote-workspace-identity.ts#L29) | I/R   | 候选29–43与基线48–62完全相同；整个 switch/模板仍为旧产品实现，非纯字段接口。                       |
| 6    | [44–51](https://github.com/accomplish07zrh-eng/knorvia-studio/blob/10a23cdf81cab37271025b59d83e78084ceb2dd6/packages/shared/src/remote-workspace-identity.ts#L44) | I/R   | 候选44–51与基线63–70完全相同；原注释、签名保留，修正输入包旧范围。                                 |
| 7    | [52–63](https://github.com/accomplish07zrh-eng/knorvia-studio/blob/10a23cdf81cab37271025b59d83e78084ceb2dd6/packages/shared/src/remote-workspace-identity.ts#L52) | N/I/D | 支持遍历 grammar.exec 提取路径的表解析机制；52–54 prefix guard 与返回 shape/拒收规则继承。         |
| 8    | [64–67](https://github.com/accomplish07zrh-eng/knorvia-studio/blob/10a23cdf81cab37271025b59d83e78084ceb2dd6/packages/shared/src/remote-workspace-identity.ts#L64) | I/R   | 完整远程 predicate/comment 与基线110–113逐字相同；短小不自动完成迁移。                             |

### remoteSshHostKey.ts

| 片段 | 候选行                                                                                                                                                   | 判断    | 独立复核结论                                                                                                 |
| ---- | -------------------------------------------------------------------------------------------------------------------------------------------------------- | ------- | ------------------------------------------------------------------------------------------------------------ |
| 1    | [1–5](https://github.com/accomplish07zrh-eng/knorvia-studio/blob/10a23cdf81cab37271025b59d83e78084ceb2dd6/packages/shared/src/remoteSshHostKey.ts#L1)    | I/R     | 导入与 SSH target alias 整段原样；公开依赖 shape 可兼容，未授予整个模块 MIT。                                |
| 2    | [6–14](https://github.com/accomplish07zrh-eng/knorvia-studio/blob/10a23cdf81cab37271025b59d83e78084ceb2dd6/packages/shared/src/remoteSshHostKey.ts#L6)   | N/I/D/M | 9–13 KeyPathPlan 的 parts 数组表示可支持为有限增量；prefix/root 与 anchored 语义原先已有，注释是迁移记录。   |
| 3    | [15–46](https://github.com/accomplish07zrh-eng/knorvia-studio/blob/10a23cdf81cab37271025b59d83e78084ceb2dd6/packages/shared/src/remoteSshHostKey.ts#L15) | N/I/D   | 支持 parts 计划避免 join/re-split、ASCII drive 判定替代 regex；根分类、UNC 保护与行分隔回落来自原规则。      |
| 4    | [47–67](https://github.com/accomplish07zrh-eng/knorvia-studio/blob/10a23cdf81cab37271025b59d83e78084ceb2dd6/packages/shared/src/remoteSshHostKey.ts#L47) | I/R/D   | 旧基线71–106已使用 token 栈、dot/parent 消解与受保护根；新条件分支是重表达，不能声称首次引入 token reducer。 |
| 5    | [68–80](https://github.com/accomplish07zrh-eng/knorvia-studio/blob/10a23cdf81cab37271025b59d83e78084ceb2dd6/packages/shared/src/remoteSshHostKey.ts#L68) | I/R     | 完整 resolveSshAuthKind 原样；认证优先级/getter 次序属于兼容，函数体仍继承。                                 |
| 6    | [81–94](https://github.com/accomplish07zrh-eng/knorvia-studio/blob/10a23cdf81cab37271025b59d83e78084ceb2dd6/packages/shared/src/remoteSshHostKey.ts#L81) | I/R     | buildSshRemoteHostKey 及注释原样；JSON 六元组既是持久接口也是保留表达。                                      |

### wslUserValidation.ts

| 片段 | 候选行                                                                                                                                                    | 判断  | 独立复核结论                                                                                |
| ---- | --------------------------------------------------------------------------------------------------------------------------------------------------------- | ----- | ------------------------------------------------------------------------------------------- |
| 1    | [1–4](https://github.com/accomplish07zrh-eng/knorvia-studio/blob/10a23cdf81cab37271025b59d83e78084ceb2dd6/packages/shared/src/wslUserValidation.ts#L1)    | I/R   | Zod import 与长度常量沿用；64 是业务接口限额而非独立实现证明。                              |
| 2    | [5–9](https://github.com/accomplish07zrh-eng/knorvia-studio/blob/10a23cdf81cab37271025b59d83e78084ceb2dd6/packages/shared/src/wslUserValidation.ts#L5)    | N/I/M | 支持一个禁用集合 regex 合并旧控制码循环和 slash/includes；禁用集合的语义源于旧业务规则。    |
| 3    | [10–18](https://github.com/accomplish07zrh-eng/knorvia-studio/blob/10a23cdf81cab37271025b59d83e78084ceb2dd6/packages/shared/src/wslUserValidation.ts#L10) | N/I/D | 10–17 的集合判读使用新 regex 机制；trim/UTF-16 非空及长度表达继承，不能将整个函数认定原创。 |
| 4    | [19–25](https://github.com/accomplish07zrh-eng/knorvia-studio/blob/10a23cdf81cab37271025b59d83e78084ceb2dd6/packages/shared/src/wslUserValidation.ts#L19) | I/R   | 完整 wslUserSchema 逐字保留，含 refine 和 issue message；schema 表达迁移仍待处置。          |

其中几个结论收窄原包：固定预算 hoist、Array.from、copy/delete、参数化整数 reader 与并发逐字段投影不足以形成新的独立算法接受；阶段拆分支持的是边界/表示变化，原错误次序、Map/拼接策略仍继承。SSH 旧基线12–69已有根分解，71–106已有 token 栈归约，候选47–67为相关重表达；仅 parts 表示/ASCII 分类的限定增量获技术支持。

CRC/Base64 的格式事实可参考 [RFC1952](https://www.rfc-editor.org/rfc/rfc1952.html)、[RFC4648](https://www.rfc-editor.org/rfc/rfc4648.html) 与 [HTML 原生 Base64 API](https://html.spec.whatwg.org/multipage/webappapis.html#atob)。它们不自动授权项目 schema、错误 namespace、持久身份或业务解释文字；查表/字段计划的通用性也不单独证明候选表达原创。

## 七项保留表达及来源定位修正

| 完整保留表达                                                           | 候选行  | 基线/上游行 | raw span SHA-256                                                   |
| ---------------------------------------------------------------------- | ------- | ----------- | ------------------------------------------------------------------ |
| workflow-runs-phases.ts：reduceRunLaunched full function               | 22–38   | 25–41       | `7c8d045d250674783fa69d7d43fe5d436c5d3bcaada15841266e99b75beef0b0` |
| workflow-runs-node-progress.ts：readLastTool comment and full function | 109–117 | 109–117     | `4e814500203514d096df819c052aca67fc0cdd417b3f5517460564343ad6b7b5` |
| workflow-runs-node-progress.ts：boundedText comment and full function  | 119–131 | 119–131     | `7a61670af90f1d89dcc3b7f42353eca5bf9ec6f8758924347f70a65ef9c04642` |
| remoteSshHostKey.ts：resolveSshAuthKind full function                  | 68–79   | 108–119     | `da033a125ddf6ea92b4330b068ace50990eb83e295e4c2b57cbbc74dc6032e90` |
| remoteSshHostKey.ts：buildSshRemoteHostKey comment and full function   | 81–94   | 121–134     | `88ceedeaf24027fe80e4c33afa20a6029b6ebac18382c481a13e8f6438576965` |
| wslUserValidation.ts：wslUserSchema full declaration                   | 19–25   | 27–33       | `68ece7f98887f2bab42be9502e755b0cc70209e99c3120ac4687d52b2dc650d1` |
| remote-workspace-identity.ts：remote builder switch and function close | 29–42   | 48–61       | `4614c265e0253432838f658a03d83011f283b27eccd0763e6bb9df6a265a4c7f` |

上述七项不是所有保留表达的穷尽清单：Base64 schema、wire 二分路径、类型/注释、短 helper 和 identity predicate 也有明确的保留或派生关系。它们需要逐项性质/来源处置，不能以短小、函数名改动或合同冻结直接结案。

原包 identity 几处旧行号是有合法摘要的偏移范围，不是摘要损坏。本 receipt 保留原包记录并补充更精确对应：

| 片段       | 候选  | 原旧范围      | 复核旧/上游范围 | 新发现           |
| ---------- | ----- | ------------- | --------------- | ---------------- |
| identity-2 | 14–21 | 23–35, 70–107 | 23–34, 71–109   | 语义前件范围补全 |
| identity-3 | 22–26 | 43–47         | 42–46           | 完整片段逐字相同 |
| identity-4 | 27–28 | 37–41, 48     | 36–40, 47       | 语义前件范围补全 |
| identity-5 | 29–43 | 49–63         | 48–62           | 完整片段逐字相同 |
| identity-6 | 44–51 | 65–72         | 63–70           | 完整片段逐字相同 |
| identity-7 | 52–63 | 73–108        | 71–109          | 语义前件范围补全 |

尤其候选22–26、29–43、44–51分别与旧42–46、48–62、63–70完全相同；新 SHA、offset 与上游链接在 sourceCorrespondenceRefinements 中。

## VS Code 范围

固定参考 `microsoft/vscode@44825207bf4389c3bd17c92d3ec28cf784c324cc` 的 LICENSE.txt、ipc.ts、ipc.net.ts 已由公开 raw 原件与 GitHub contents API 双重绑定；三个 Git blob 均一致。LICENSE SHA-256 `9480271317925265e806a9a196aaa33410a962fa9d4d1e248a4a5187bc8c9df9` 与仓库保留文本相同。[发布者固定许可](https://raw.githubusercontent.com/microsoft/vscode/44825207bf4389c3bd17c92d3ec28cf784c324cc/LICENSE.txt)

| 事实                              | 本地只读路径                      | 固定 Microsoft 参考         | 候选范围         |
| --------------------------------- | --------------------------------- | --------------------------- | ---------------- |
| 7-bit VQL / zero                  | serialization.ts 78–103           | ipc.ts 183–209              | wire-codec 13–26 |
| Array/Object/Int 与 JSON fallback | serialization.ts 109–117、170–188 | ipc.ts 241–249、285–308     | wire-codec 24–30 |
| EventFire=204                     | channels.shared.ts 25–31          | ipc.ts 66–72                | wire-codec 28–30 |
| 13-byte socket header             | protocol.ts 207–218、222–230      | ipc.net.ts 289–291、474–478 | wire-codec 56–68 |

对应 raw range 摘要与整对象 binding 在 vscode.scopeFindings 中。候选只导入本地 core/binary/wire，未引入 VS Code 或 RPC runtime；闭式计量描述协议格式，并没有复制 writer 分配/写字节例程。最大 safe-ID、relay envelope、knorvia_type 和错误/assembly 规则是本地产品适配。RPC 本地 JSON fallback 还含嵌套 Uint8Array 扩展，固定 Microsoft 参考没有该本地规则；不能把全部本地 serialization 或 wire-codec 归 Microsoft。

copied-components 的 **importRevision 仍为 null**；固定参考不是原始导入证明。可沿用实际 MIT 许可覆盖的第三方部分并保留 Microsoft copyright/permission notice，不能据部分 MIT 记录将 ZCode 适配整体改成 MIT。[固定 MIT 正文](https://raw.githubusercontent.com/microsoft/vscode/44825207bf4389c3bd17c92d3ec28cf784c324cc/LICENSE.txt) inventory 的 wire-codec input 仍绑定旧 SHA `a8a419e27202f9644dba7589e3e0a95f25b2f0baf3438c157f85e9aee843044f`，本轨只披露，不更新。主线需按精确片段采用“格式事实/保留第三方表达/本地适配”决定，原始导入证据找不到时保留明确未知及 notice。

## 第三方分发与用户迁移目标

Apache §4 要求向接收者提供许可副本、对修改文件给明显修改声明、保留适用源署名，并在规定位置提供适用 NOTICE 的可读副本；对修改或整体附加条款不消除这些原义务。[Apache 原文 §4](https://www.apache.org/licenses/LICENSE-2.0) MIT 要求在副本或实质部分中保留版权和许可声明。[MIT 原文](https://opensource.org/license/mit) 这支持保留合法通用依赖；许可再分发许可本身不完成用户的独立产品实现目标。

| 可保留的通用依赖       | 本轮保留正文核验                          | 发布仍需核验                                                                           |
| ---------------------- | ----------------------------------------- | -------------------------------------------------------------------------------------- |
| TypeScript 6.0.2       | LICENSE.txt                               | 实际携带版本/包许可；inventory 另有5.9.3，本结论不自动扩展                             |
| playwright-core 1.59.1 | LICENSE、NOTICE                           | 实际打包 runtime/browser 及其独立材料                                                  |
| ECharts 6.1.0          | LICENSE、NOTICE、D3 BSD正文、README许可段 | chart/嵌入材料的适用署名；README62字节不替代 LICENSE                                   |
| pdfjs-dist 5.4.296     | 9份：顶层/CMap/ICC/字体/WASM              | 实际分发资产及各自条款；FOXIT、Liberation/OFL、OpenJPEG、QCMS 不按顶层 Apache 批量改标 |

本轮从固定包的 THIRD-PARTY-NOTICES.md 解出 **16 个正文**，按包含原换行的 raw bytes 独立重算摘要，全部匹配 inventory 与原包。新核的是仓库保留正文；15份旧安装/原包文件检查和前轮 ECharts tarball README 提取作为历史证据转交，未重复安装或 tarball 研究。未核新的 source/dist/bundle 分发闭包，**既有27项 material duties 完整保留、冲销0项**。不能用顶层 SPDX 标签替代子材料许可。

## 合同、权利证据与可行动闭合标准

W/R/P 先行合同到实现的祖先关系、三份 evidence 与22份 spec/观察/测试/验收材料摘要已独立核验。部分后加 cross-version/验收文件在最初合同提交不存在，或内容后来变化；JSON明确标记，不误写为合同早已有。历史 wire146、identity257、workflow311 的 source/dist 结果未重跑，只支撑兼容调查；真实 CLI journal/launch 与设备范围的限制继续保留。

父任务可采用 C1/C2 技术 receipt；整文件来源/授权结案还须执行 C3–C8：

| 条件            | 当前判断与行动                                                                                                                              |
| --------------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| C1 摘要         | 本候选完整核验通过；采用 identity 精确定位修正，后续变动重绑                                                                                |
| C2 独立技术复核 | 71片段已给非实现者判断；24项是限定设计方面，不是24项来源授权                                                                                |
| C3 贡献权利     | 取得实际权利人/贡献条款/许可权限依据，逐增量哈希绑定并排除保留材料                                                                          |
| C4 产品表达     | 七完整保留项、schema、二分、解释文字及混合实现逐项决定：有理由的接口/非实现性质结论，或有价值的替代设计；优先保留已支持机制，避免为差异重写 |
| C5 VS Code      | 收窄精确第三方表达/格式事实/本地适配；未知原导入如实保留，main再核 inventory binding                                                        |
| C6 工程         | 本轨无产品改动不重跑；未来改动只跑针对性 source/dist/真实consumer，旧未验范围继续披露                                                       |
| C7 分发         | 用实际产物摘要证实 LICENSE/NOTICE/submaterials 被携带；27义务继续追踪                                                                       |
| C8 集成         | 主线采纳 receipt 后再作 hash-bound ledger 决定/许可与发布调整；本轨无 shared ledger 写入                                                    |

父任务只需汇总一个必要权利问题，不需重新确认一般 MIT 目标或让所有已合法许可的第三方补授权：

> 请确认候选 10a23cdf81cab37271025b59d83e78084ceb2dd6 中这九文件新增 Knorvia 贡献的实际权利人，以及你拥有或获授权以 MIT 发布这些增量的依据；确认范围须排除本 receipt 指出的保留 ZCode、VS Code 和其他第三方表达。

任务重写授权、Git 作者字段、AI 标记或合同祖先不替代贡献权限依据；这是目前材料缺口，不是认定实际作者无权。[Apache §1、§5 的权利人与贡献定义](https://www.apache.org/licenses/LICENSE-2.0) 保留既有公开许可所允许的第三方分发不要求本 receipt 制造新的权利人同意。

## 检查与交接

本轮只运行对象/片段/合同/许可正文的证据检查、文档 JSON 格式检查、相对链接与 git diff/path 边界检查。生产实现、配置、lockfile、shared ledger 与原输入包无改动。架构 skill 明确 documentation-only 跳过；原包已记录 root typecheck/lint 因无 workspace 依赖及 pnpm install 路径失败未执行，本轮不重复同样的环境失败，也不把它们报告为通过。没有 runtime、全量测试、构建或部署。

主线可只采用本分支新增两文件的提交。服务12路径的前轮 receipt 保存在独立 `cloud/services-source-closure-20260930-standard-5526@0708803725867528624927899fc75d1f4ab529ba`，本轮没有重写、合并或扩展它及其他四轨。此处不使用旧227/12/215快照充作当前全仓进度。
