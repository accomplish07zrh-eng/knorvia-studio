# 四组最后修复的实际 CI 与剩余边界

完整统一 branch head 为 `c4f9bbb01cffa283e7179cc5adb53bc5956cb72a`，分支 `integration/backlog-20261003`。[PR13](https://github.com/accomplish07zrh-eng/knorvia-studio/pull/13) 仍 open/draft，main 仍 `bd0bb014c0974334557fa51814709d0b78f35f1d`，未合并。四组最终输入与逐字节接收记录见 [intake](final-platform-repair-intake-20261003.json)；本记录是该 head 的实际新结果，不覆盖旧记录。

[run 37113155595](https://github.com/accomplish07zrh-eng/knorvia-studio/actions/runs/37113155595) 两个 job 均已完成。原 job logs 的 checkout 行明确显示实际受检 synthetic `d11e1efa27a7b7551ce637e5eadfbb292cafb94a`，由上述 branch head merge 入上述 unchanged main。双方 provenance inventory、frozen dependency install、types、lint、fmt、architecture 和 CLI build 全部 success；offline failure，因此整套验收尚未通过。

| 实际 job                                                                                                                | tests | pass | fail | skipped | cancelled | suites |  duration_ms |
| ----------------------------------------------------------------------------------------------------------------------- | ----: | ---: | ---: | ------: | --------: | -----: | -----------: |
| [Linux 111174812501](https://github.com/accomplish07zrh-eng/knorvia-studio/actions/runs/37113155595/job/111174812501)   |  8048 | 8027 |   13 |       8 |         0 |      6 | 434967.09691 |
| [Windows 111174812401](https://github.com/accomplish07zrh-eng/knorvia-studio/actions/runs/37113155595/job/111174812401) |  8048 | 8034 |   13 |       1 |         0 |      6 |  506133.4616 |

双方13个失败文件逐项相同，均为 `apps/cli/packages/core/test/` 下 workflow current-artifact reader SHA 断言，完整文件名/原timestamp/actual与expected SHA在 [原结果与摘录](evidence/final-platform-ci-20261003/) 中。Windows路径只在比较失败文件名的派生清单中转为正斜线；原assertion/stack值保持。摘录是由解码原job log生成的UTF-8 LF子集，Windows原CRLF转LF，不能称为整份原log字节同一。

首先遇到的三个 emitted 路径为 `workflow/lifecycle.js`、`workflow/scheduler/node-runner.js`、`tool/handlers/get-workflow-run-format.js`，actual SHA 精确吻合已有冻结 [CLI source-output 诊断](evidence/backlog-cli-20261003/final-core-artifact-repair.json) 的 `generatedSha256`，而当前 receipt `9ceb5294d0a9f5885a5eec65f85283e3bac6797407bf03809cc6e9ce52bdc714` 绑定的是旧 `emittedSha256`。该原诊断共73对，六对 `sameEmittedBytes=false`，另三对为 `workflow/scheduler/collection-planner.js`、`workflow/lifecycle-seed.js`、`runtime-task/notification.js`。原脚本的runtime AST等价通过不等于exact emitted-byte通过，不能据其通过来刷新旧source/golden/hash或授予整文件表达/权利验收。

整合者只读本地existing217条目又观察到上述六个emit差异，及尚未重建的新fold产物（本地仍是旧caller输出）；该本地read不是新build/test或CI的新失败。CI实际构建后fold旧NaN/loader失败未再出现，当前remaining13均停在上述三个first-encountered emit摘要。不能将六对existing差异的数量等同实际13测试失败数，亦不能认定整个产物闭包只需改三项。

父任务已将当前emit/receipt修复交回原CLI任务，整合者不同时修改其receipt/code。需要用固定实际编译设置和当前source对整个注册闭包逐项建立新绑定，保留原receipt、14个selector、golden、失败/未确认记录和source/rights HOLD；后续冻结head再普通merge进入唯一分支。新head按实际CI验收，不重跑已过模块的全量排查或本地整套。原native/services追加Windows夹具失败本轮没有再出现；GUI/native系统权限、安装包和真实用户数据现场验收仍不包含在这套offline CI。

## 材料核验的实际结论与下一步

26个原材料项全部保留、0关闭，完整记录在 [发布内容矩阵](mit-release-boundaries-20261003.md) 及 [原提交树补充读取](mit-release-source-availability-20261003.json)。当前Git树直接涉及10项：桌面/Web两个目录的docx/folder/pptx/xlsx八个SVG，76个tracked React技能文件，以及两份tracked Windows ripgrep ZIP中缺失Rust std修订的一项。十一npm项按当前依赖与实际打包包含判断；三项历史@arms在有界当前manifest/lock/installed扫描无引用；两个embedded engine项按实际binary/WASM包含判断。各组件自己的MIT/ISC/BSD/Apache及NOTICE保留，不要求非MIT第三方全部独立重写。

对八个已知SVG路径作有界当前SHA复读：全部与材料checkpoint同字节，桌面/Web每种类型成对一致，共四组不同字节。若后续需要恢复出处或独立资产候选，四种图标要同时覆盖两个发布目录；这不是来源/授权证明或视觉验收，八个原材料项继续保留，不减计数、不修改任何UI字节。

| 精确缺口                   | 可以关闭它的具体材料/工作                                                                                                        | 用户决策边界                                                                                                                            |
| -------------------------- | -------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| 八个SVG当前字节            | 原source URL/revision/创作者与完整适用license，修改起点/过程；或明确当前SHA的授权                                                | 整合和CI不需新确认；若原导入者/供应方无材料，再决定保留既定UI要求的独立资产候选或明确不含这些内容的发布范围。不能删掉现有UI以通过gate。 |
| React技能                  | 原完整copyright/permission text，实际import revision与参考 `063bee94c3f4df8453406c830b0a7df0f2860278` 的关系，绑定76个文件及修改 | 原通知材料缺失不能由用户“同意MIT”补足；资料无法恢复时另行决定有来源证明的独立技能候选或明确发布内容范围。                               |
| Windows Rust std           | 两份ZIP/rg.exe确切hash对应的原compiler/build manifest、实际std源修订、LICENSE-MIT/LICENSE-APACHE/COPYRIGHT和linked组件通知       | 不替换成别的Rust版本通知；无法恢复时通过原native owner评估可复现同功能工具构建并验收平台/搜索行为，或明确不含该payload的发布范围。      |
| 当前引用npm/条件embedded项 | 原publisher完整notice与实际bundle包含清单、engine/toolchain/link闭包；保留已找到的声明与所有404/422证据                          | 实际包含范围决定适用义务；不能将metadata license声明/未找到命名license文件分别当作完整授权/侵权证明。                                   |
| 第一方整文件表达/贡献权利  | 当前完整module、保留兼容/upstream部分及实际authoring/contribution授权的证据审查，范围不止下述六项                                | 缺旧receipt本身不是自动重新写代码指令；技术CI通过/source exposure也不是整库原创或MIT批准。                                              |

六个已知整文件目标当前SHA与7bfb材料核验checkpoint逐项相同：CLI registry、services tasksDatabase/startup、commitMessageFileScope、creationReference、sessionService、taskIndexSyncer。当前inventory均NOASSERTION/review null；前四个所述历史receipt仍不存在，后两项保留原归属/整文件HOLD，不伪造缺失receipt名。新增services测试helper和CLI fold的确切新SHA/disposition在intake中，同样不自动promote。这个有界复读只是当前身份对账，不是重跑全仓库表达/权利审计。

当前整合/CI无需新的用户权限决策。完整源码/产品发布的缺口是具体材料和整文件权利证据，用户确认不能直接关闭；资料无法恢复时才需要选择有来源与兼容验收的替代或具体发布内容。现有功能/UI/数据与所有原LICENSE/NOTICE/register/reviewRequired保留，根LICENSE未改，全量MIT尚未验收。
