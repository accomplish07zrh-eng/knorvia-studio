# CLI Task Registry 当前源码来源核验

本次只核验 `apps/cli/packages/core/src/runtime-task/registry.ts` 的完整当前表达、保留片段和贡献出处；内部依赖 `registry-waits.ts` 只用于厘清等待实现。绑定 main `59517d9699519b0a7a44980da27df29d45f0e91e`，原持久分支 `lane/cli-rewrite-20261003` 已同步至该提交。本轮没有改变生产源码、公共 contracts、许可证、全局来源登记或既有验收记录。

**用户最新决定：项目继续采用 Apache-2.0，MIT 专项停止。** 本次已形成的准确来源证据予以保存，不继续额外重写、贡献权接受或材料闭项；根 LICENSE / README 由整合任务统一处理。

当前实现的来源链与保留范围已经可以核对，不据此宣称整文件全部重新原创。新订阅结构有先行契约和实际源提交；公开类型及多处常规快照/消息表达仍与上游相同或只改局部名称。出版者同一确切版本明确采用 Apache-2.0，保留这些部分有现存许可依据。本次没有确认任何必须因许可再次重写的区段；来源暴露、语法相同或丢失的旧 receipt 均不能单独推出侵权、不可版权化或必须全重写。

机器可读事实、完整摘要、逐区段行号与比较结果见 [来源记录](evidence/backlog-cli-20261003/registry-source-provenance-20261003.json)。[限定源码比较器](evidence/backlog-cli-20261003/registry-expression-static-20261003.cjs) 只解析语法节点并对照指定表达，不创建 TypeScript program、checker 或 emit，不执行应用或测试；相同语法不是语义等价、作者过程或版权判断。

## 补齐确切出版者原件

本地 Git 对象库原先没有来源清单的 blob。本次通过公开 GitHub contents API 实际取得 ZCode 提交 `872ad960de7ec172591f7e1952f7849229f94521` 的以下四份确切原件，并分别按 Git blob 对象格式重算 SHA-1、按原字节重算 SHA-256，与已有清单逐项一致；没有采用另一版本的许可证代替。

| 原件 | Git blob | 原字节 SHA-256 / bytes |
| --- | --- | --- |
| [上游 Registry](https://github.com/zai-org/ZCode/blob/872ad960de7ec172591f7e1952f7849229f94521/apps/zcode-cli/packages/core/src/runtime-task/registry.ts) | `48d9788209c80bdc10dcca8b4e507e2fde33765b` | `8f138a00926d188a0a336f12d87bf8af2f5402f7817179fae249b6c56b0681b9` / 9147 |
| [LICENSE](https://github.com/zai-org/ZCode/blob/872ad960de7ec172591f7e1952f7849229f94521/LICENSE) | `550d8df4cfc74878663a511caa97852f15fd9592` | `606c36baf38b973227273df12a74930e4b4137280eea835c5cd623aa4553c13b` / 11344 |
| [NOTICE.md](https://github.com/zai-org/ZCode/blob/872ad960de7ec172591f7e1952f7849229f94521/NOTICE.md) | `03eb41e08227d51dfcc5f2020406cb9165599aea` | `cca8e323ad7f3b12167b58fba7d14faf18a2cdc4fa890818058872f6215912bf` / 27721 |
| [core/package.json](https://github.com/zai-org/ZCode/blob/872ad960de7ec172591f7e1952f7849229f94521/apps/zcode-cli/packages/core/package.json) | `6ea21f876843b7d78c1cb0f774d210610440a7bb` | `abf5a6c8715fe87ea4b5ef3a48b225f94980dc386fe2ccfe98844347aa16bcd8` / 1366 |

上游 Registry 没有单独版权或许可头；package 没有 license 字段；固定版本清单在本文件的各级父目录只列出根 LICENSE / NOTICE，另实际读取 runtime-task 的目录树，没有更近的许可文件。该版本 NOTICE 第四节明确说明第一方代码采用根 Apache-2.0，第三方部分保留自己的条款；LICENSE 的版权附录为 Z.AI Co., Ltd.，当前仓库 LICENSE 与其原字节相同。这里确认的是出版者的版本声明和可追溯原件，不把它等同于逐作者产权转让证明或全部第三方义务已闭合。

## 完整当前文件与保留表达

当前文件为 **6412 bytes / 202 行 / SHA-256 `c7f4fc09641ddd04fe1692635ede2a5fde8b61c36dec82f35c21fa981fb97d84`**，Git blob `e6e3a06726a01b64d12220fa0b13c5f665969152`。下表覆盖全部非空源码区段，行号绑定上述原字节；“语法相同”忽略位置、注释和排版，必要的标识符映射在 receipt 中逐项列明，不推断作者究竟复制还是分别写出同一常规表达。

| 当前行号 / 区段 | 与确切上游及契约的事实关系 |
| --- | --- |
| 1–9 imports | 合并上游两个 contracts type import，替换包命名空间，新增内部等待订阅 helper；外部类型来自既有契约。 |
| 11–82 公开类型、字段和 Registry 接口 | 六项完整公开声明的语法树同时与上游、`api.d.ts` 相同；固定 task/status/field/API 词汇保留。当前四段说明注释在后来的接纳提交新增，与上游五个注释 token 无原文完全相同项，语义主题承继。 |
| 84–92 初始 generation 与 terminal 集合 | 提取初始值常量，Set 的类型注解改变；六个终态文字及次序保留，属于冻结的行为词汇。 |
| 94–97 class/state | 快照 Map 仍是既有常规索引；两个独立 waiter Set 索引改为一个 `TaskWaitSubscriptions`，新增组织不只是字段改名。 |
| 99–106 register | 浅复制、nullish generation 和 Map commit 的语法在局部 `stamped → stored`、`tasks → snapshots` 后相同；两次私有通知调用改为共用 publish。数据、getter 和效果次序是先行契约要求。 |
| 108–110 generation setter | 完整方法体相同。 |
| 112–122 update | 读取、missing guard、patcher、原 id commit 和返回值语法在局部变量/字段映射后相同；通知路径改由共用 publish。 |
| 124–131 requestBackground | 读取、guard、Map commit 在局部映射后相同，浅复制初始化只去掉类型注解并改局部变量名；通知接入新订阅结构。 |
| 133–137 remove | Map 删除及 terminal-before-background 效果次序保留；通知由新订阅 owner 执行。 |
| 139–145 get / all | 两个完整方法体仅将快照字段名 `tasks` 改为 `snapshots`。 |
| 147–152 queueMessage | 完整方法体语法相同；公开 update 调用与 spread/append 是契约要求。 |
| 154–160 drainMessages | 完整方法体仅改快照字段名；presence、length、原数组身份和 shallow-copy getter 次序保留，未增加发布。 |
| 162–181 两种 wait | immediate 与同步 options/signal 边界来自契约；background 的 missing guard 被分开，terminal 的 lookup/immediate 段仅改局部名称。pending 委托到新订阅 owner。 |
| 183–190 private publish | 合并旧终态与后台判读，仍保留 terminal → background undefined → 重读 background flag 的可观察顺序；订阅所有权和回收结构在 helper。 |
| 192–194 terminal helper | 完整函数语法相同，保留固定集合判断。 |
| 196–202 running-background helper | materialize-all 后改为 for 循环；literal-true/running 谓词与上游相同，读取和短路规则来自契约。 |

作为真实依赖读取的 `registry-waits.ts` 为 3211 bytes，SHA-256 `234729ce198ce0111d102307e7394e9157a40cd9db112a5ddb5b5628ffb9ddbe`。其 ticket/cohort/book 类型、统一 id 索引、双向 FIFO、原 cohort 身份判断和 cleanup 闭包与旧双 Map + Set + waiter record 的组织不同；新结构在先行规格中已有明确描述。listener 安装、once/abort 字面量、native Promise、detach-before-cleanup、FIFO 和错误后部分效果都是继承的行为契约；abort fallback 的固定文本及 nullish-reason 表达也保留。**此处支持新组织方式的契约实现来源，不扩展为 helper 整文件或主文件的 clean-room / MIT 接受。**

## 可追溯贡献链及实际边界

| 原件 / 提交 | 可以证明的事实 |
| --- | --- |
| [ZCode `872ad960de7ec172591f7e1952f7849229f94521`](https://github.com/zai-org/ZCode/commit/872ad960de7ec172591f7e1952f7849229f94521) | 文件路径限定的 GitHub commit 历史只返回这一公开快照；元数据 author/committer 为 wuweiqi、关联登录 MBearo。该查询不跟随以前的路径重命名，不能识别公开快照之前所有实际作者。 |
| [导入 `7619e41b950bd52073ebf36754146cf25659d9fa`](https://github.com/accomplish07zrh-eng/knorvia-studio/commit/7619e41b950bd52073ebf36754146cf25659d9fa) | 本仓库 root snapshot，作者名 Knorvia、关联登录 accomplish07zrh-eng；该文件与上述上游原字节相比**仅**替换两处 contracts 包名，不能把快照提交者认作旧实现原创作者。 |
| [格式化 `88001f027b04324f816176ff5f08b5d1a236f27f`](https://github.com/accomplish07zrh-eng/knorvia-studio/commit/88001f027b04324f816176ff5f08b5d1a236f27f) | 作者名/登录 Claude / claude；本文件解析语法与导入版本相同，仅格式变化。有效签名证明签名状态，不授予新的版权或 MIT 权利。 |
| 契约输入 `f17024263f787db1d017ac6d5060a10b9305bec1` | 四份输入的当前摘要与原记录相同；作者名 RenHui Zhang。行为 packet 是 curator 已阅读旧源码后的提取，公开声明是源派生材料；失败的 native author 没有初始化成功，也没有形成有效作者稿。 |
| [先行规格 `8a59000746080512fd5d10c8fa09895a403122b8`](https://github.com/accomplish07zrh-eng/knorvia-studio/commit/8a59000746080512fd5d10c8fa09895a403122b8) | 2026-10-03 04:54:04Z 先提交统一 id / 双向 FIFO / ticket / detach / abort 的组织规格，早于候选提交 4分23秒。Git 能证明提交次序，不能独立证明模型读取文件的时间或隔离作者环境。 |
| [首次候选 `8ab8d719bea0dc7e3e2f7de522db57dac374e048`](https://github.com/accomplish07zrh-eng/knorvia-studio/commit/8ab8d719bea0dc7e3e2f7de522db57dac374e048) | 首次保存当前新结构；作者名 RenHui Zhang、关联登录 accomplish07zrh-eng。是本路授权执行的 source-exposed 契约实现，不声称 clean room。 |
| `db54c1eb42732f6a9ba15977a4668f31fcab9191` | 为旧 reported accepted-byte HOLD 恢复生产，原候选归档；当前归档与首次候选原字节相同。 |
| 接纳规格 `7f0e45b3d2a75f284c84e3cae18dd743d91ece15`、[生产接纳 `105b1318464199e5492126984a0293599269f48d`](https://github.com/accomplish07zrh-eng/knorvia-studio/commit/105b1318464199e5492126984a0293599269f48d) | 明确选择本路完整新候选，消除运行时对丢失旧稿的依赖。生产与归档语法相同，但生产新增四段注释：主文件摘要为 `c7f4fc…`，归档为 `42351bef…`，**不是原字节相同**；helper 原字节相同。 |

元数据登录关联、作者名和签名须按各自实际意义记录，不能代替原内容的产权链或逐文件许可范围。首次初稿先于本轮旧 body 阅读的描述来自已有 lane 工具记录；之前已有历史说明暴露，且 source-derived packet 已公开，因此本次不把它升级为经独立证明的隔离创作。

## Apache 决定下的收尾边界

本次已补齐的是：确切上游源码/有效许可原件绑定、当前完整表达与局部保留映射、实际候选/注释/贡献提交链。保持 `upstream-modified` 与保留部分的 Apache 义务有证据依据；不改全局 inventory/reviews 的接受状态。**未发现需要重新选择运行时 owner 或整体重写的事实理由。** 本路保存已形成的事实后停止专项，不进一步推进贡献权接受或材料闭项。

项目继续 Apache-2.0；原第三方许可、归属、适用 NOTICE 和真实来源记录继续保留。Apache-2.0 §2 / §4 允许制作和分发修改，仍有交付许可、显著修改声明及保留适用归属和 NOTICE 的条件；项目选择 Apache 不自动消除第三方义务，也不证明当前文件全部重新原创。[Apache-2.0 正文](https://www.apache.org/licenses/LICENSE-2.0)

当前源码内四段注释说明行为，没有明确注明“从 ZCode 修改”。本次没有认定整包 notice 合规，也没有核对所有实际发布包。停止指令前已形成如下**这一文件**的事实性修改/来源说明建议，保留作参考；本轮不进一步安装头部、改生产摘要或旧验收绑定，不改 API 或实现算法：

```ts
// Modified for Knorvia Studio: snapshot publication and id-scoped subscriptions.
// Source: zai-org/ZCode@872ad960de7ec172591f7e1952f7849229f94521,
// apps/zcode-cli/packages/core/src/runtime-task/registry.ts.
// Retained upstream material is subject to Apache-2.0; preserve its license and notices.
```

没有证据要求现在向第三方另求许可，亦未联系第三方。出版者原许可可作为保留上游部分的许可依据。本次保留真实来源及贡献元数据，不再为改用 MIT 推进接受工作，也不把公开 API、固定状态或普通 Map/spread 写法列为额外重写任务。

旧 whole-file 请求 SHA-256 `12a18abdd47a1639a86726a92f7b9bf55227c8918109c3934b33925b066603e2` 和其原 receipt 仍缺；`e972ca88…` 对 6097-byte runtime fragment 的推荐不是它的整文件来源或许可接受。旧历史缺项保留，不宣布找回或关闭；它不能阻止对当前 `c7f4fc…` 源码形成以上新事实结论，也不是当前实现需要再次替换的充分理由。

**本轮未验证运行行为。** 没有运行测试、lint、类型检查、构建、格式检查或全量审计；只做限定读取、原件摘要核对、语法表达对照、变更差异阅读和提交/远端确认。之前技术整合的 CI 结果不计为本轮来源/产权证据。

## 后续目标澄清：独立维护继续，生产改动待协调

用户进一步澄清：保留 Apache-2.0 和常用第三方声明，只真正去掉原项目继承实现，成为自维护上游。上述“无确认必须因许可再次重写的区段”是许可事实边界，**不取消这个产品目标**；停止的是 MIT 专项。

当前最小可辨认表达候选为 `registry.ts:147–152` 的 queueMessage 和 `154–160` 的 drainMessages 两个完整方法体：分别语法相同和仅改快照字段名。它们可组成独立消息缓冲变换批次，不把相同公开接口、source-exposed、固定词汇或单行 Map 操作本身当作残留证据。实际作者是否直接复制仍未证明；没有认定当前新等待订阅结构需要重写。

已在[原 Registry spec](../specs/knorvia-next-cli-task-registry-20261003.md)准备 pure message transform / 单一快照写入者的最小候选方案，保留公开 update override、数组身份、迭代、enumerable/Symbol/原型安全、getter 次序及错误后部分效果。仅拟改两方法/import 和新增内部 helper；生产暂未改变，待整合者协调同文件写入及之后的摘要/验收绑定刷新。常用第三方库、Apache 及版权/NOTICE 均保留。
