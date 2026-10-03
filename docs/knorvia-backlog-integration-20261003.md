# PR #7–12 整合基线与持续接收规则

六路固定 head 已合入唯一分支 `integration/backlog-20261003`。源码整合提交为 **`e2fa9bc6b7e4006d583837539a81f73b3806378e`**，其后提交只补本轮记录。面向 main 的整合 PR 保持 draft，最终 checkpoint 以 PR 的完整 head SHA 和远端 ref 为准。后续任务从该完整 checkpoint 建分支，所有增量继续回到这条整合分支。本轮不合并 main、不另建云端任务，也不改写来源分支历史。

先行[整合规格](../specs/knorvia-backlog-integration-20261003.md)在 `af33d0a6ebdf11004b823176d9f6552b9a9594e7` 提交。Git 元数据与路径选择见 [input/source bindings](evidence/backlog-integration-20261003/integration-snapshot.json) 和 [path selection](evidence/backlog-integration-20261003/integration-path-selection.json)。这些记录是整合来源与版本选择，不是产品验收或来源/权利核验通过。

## 完整输入与 merge 提交

main 仍为 `bd0bb014c0974334557fa51814709d0b78f35f1d`。初查、fetch 后及整合后的第二次远端 PR 元数据读取均观察到下列同一组 heads；没有把描述中的旧 checkpoint 当成最新 head。

| PR | 合入的完整 head | 整合 merge commit |
| --- | --- | --- |
| [#7](https://github.com/accomplish07zrh-eng/knorvia-studio/pull/7) | f25b931164ee6287167e965e9da7a7586131b264 | 整合分支直接继承此 head |
| [#9](https://github.com/accomplish07zrh-eng/knorvia-studio/pull/9) | 2458655c2644c487bb66967800e000943b9678cf | 802c21320ee9d596911f57fc4751a66b72fc91c1 |
| [#10](https://github.com/accomplish07zrh-eng/knorvia-studio/pull/10) | ea7aa6acf8e9b33c7446aa25a8ca16687e2f330e | 92e59d9483de34bbef2b95d3575040bf8397a3bc |
| [#12](https://github.com/accomplish07zrh-eng/knorvia-studio/pull/12) | b84ab3a992f1df751661f6b64ee5f7e25d0ebdb8 | 0ee78c1368903bce38b745b56753f771bc8870e8 |
| [#11](https://github.com/accomplish07zrh-eng/knorvia-studio/pull/11) | e884311ee74df690cfe36e38d9bbe0eae86c791d | abe5974ec1f0aa29025b5592109f7570cd4e6bb3 |
| [#8](https://github.com/accomplish07zrh-eng/knorvia-studio/pull/8) | da2aae2e86e83f62ac9b8edd3496b408fcda2139 | e2fa9bc6b7e4006d583837539a81f73b3806378e |

六个输入提交全部保留为当前整合树的 Git 祖先。#8、#9、#10、#12 各自真正 merge-base 之后的改动路径分别为 1,721 / 2,068 / 453 / 555，最终 mode/blob 与各自 head 全部相同。#11 的 2,221 个改动路径中 2,213 个完全相同，另外八个为下面明确的版本选择。#7 的 731 个改动路径中 726 个相同，另一个采用 E 新 context owner、四个由 #10 的后续 service owner 更新。数字只用于 Git 路径账目，不计为功能覆盖、独立实现或权利进展。

## 九处冲突的选择与保留

| 路径（core src/test 前缀省略） | 当前来源 | 依据 |
| --- | --- | --- |
| src/tool/handlers/read-text-orchestration.ts | #7 f25b9311 | 保留同步 generator；只在 stat/range IO 等待，避免完成 metadata 后扩大取消窗口 |
| src/tool/handlers/read.ts | #7 f25b9311 | 入口消费同一同步 plan，保留原完成与失败时序 |
| test/read-orchestration-consumer-fixture.ts | #7 f25b9311 | 保留不可变 golden 与按真实 root 校正的 UTF-8 字节预期 |
| test/read-orchestration-consumers.test.ts | #7 f25b9311 | 保留 POSIX/Windows/Unicode 和实际 PDF executor 回归，不削弱原 oracle |
| specs/knorvia-read-orchestration.md（仓库根） | #7 f25b9311 | 保留完成时序修复和 PDF fixture 跨平台修复规格 |
| src/workflow/scheduler/collection-planner.ts | #8 da2aae2e | 后续完整 E v2 owner；SHA256 32ffd9142ec2d13db5589fa520222c68dbd15e8da2d248efb3b72377620de3af |
| src/workflow/scheduler/node-runner.ts | #8 da2aae2e | 后续完整 E owner；SHA256 61e6c3ea17edf02e748469e21dd8d2e3f22b26ead2f3a27169a30c197252dc27 |
| src/workflow/scheduler/planner-expansion.ts | #8 da2aae2e | 后续完整 E v2 owner；SHA256 fa55221d297c30564d8960ba3e91e50fb6e9de14e7c915025f5dbcc4c736fb73 |
| src/session-context/read-session-context.ts | #8 da2aae2e | b5152875 安装的完整 E 原稿；SHA256 a6de1f543bef8d6403f6f9d744fddaa815b5c75382a1c70873baa424646368ca |

选择的是来源 head 的整文件，不是拼接两套 owner。E 安装、冻结稿、source-exposed curator、共享 executor 的 instruction-only 限制和原失败记录继续保留。旧 A scheduler receipts/selectors 仍绑定旧 source，不能用来声称当前 E + A consumer 组合已通过。`collection-planner-admission.ts`、`node-runner-outcome.ts` 和 `session-context/material-selection.ts` 保留，但当前选定整文件不使用这些旧 helper；此阶段不为复用旧 selector 恢复调用。真实消费者/最终 selector 由后续统一验收处理。

另检查两个没有 open PR 的既有远端支线：UI `578732fa4686bb915397f8be93d1c975567a48c7` 的八个生产路径已在 #7 按相同 blob 保留，无需重放；file-watcher `1d1b8307399d1076cc2be8f50db71022f0840def` 的旧 Git 方案已有 #7/#10 后续替换与原 HASH HOLD，未以旧 branch tip 覆盖新 service owner。二者完整 SHA 与对应 metadata observation 留在 snapshot；这不证明未发布的本地工作不存在，也不恢复无法访问的旧实现。

## 旧 PR 与活动提交

#7–12 维持原 open/draft 状态、原 base 和原分支，供现有任务继续提交并保留完整讨论、冻结稿与历史来源；本轮没有关闭、retarget、force-push 或覆盖 PR 描述。整合 PR 是唯一面向 main 的后续组合出口，不再单独把旧 PR 合并 main。

后续继续复用本整合任务和父任务分配的固定云端任务。每次接收前记录来源 PR 最新完整 SHA、前次已收 SHA、真正 merge-base、改动路径和当前其他任务的归属；用 merge 保留历史。若源 head 推进且会改变已选 owner，先阅读该增量和精确 receipt，再作逐文件裁决；不得以旧 checkpoint 或分支名称覆盖新 SHA。最终收齐并验收之后，再由父任务按整合链关闭已被取代的旧 PR；关闭不删除来源分支/证据。

## 四个互不重叠的后续任务边界

下面是供父任务创建并固定复用的编辑边界建议，不是全目录来源归属或自动许可授予。每一路首先按当前 source/receipt 保留已完成成果，只挑仍需完整替换的 owner；不得重复已接受实现以制造计数。跨边界依赖保持只读，通过父任务给整合者递交接口需求。

| 固定模块 | 可编辑的生产文件归属 | 首轮重点与排除 |
| --- | --- | --- |
| UI、workspace 与群任务呈现 | packages/ui/**；packages/web/**；packages/desktop/src/renderer/** | 现有布局/黑白/玻璃/动画/快捷键/中英文/移动端、store/hooks 与 optimistic projection；优先 workspace-grouped-tasks、workspace-file-tree、studio/groups 及 v4 consumer。保留 #7/B5 成果；不操作 main/preload/services/RPC/协议。desktop renderer 的数据库启动接口变化交整合者协调。 |
| services、session 与任务索引 | packages/services/**；packages/provider/** | session、agent、task、creation/studio-runtime 的单一 owner 与数据兼容；保留 #10 后续 owners。agent-session/sessionService.ts 和 agent/taskIndexSyncer.ts 先做 parent accepted/historical 精确绑定与 HOLD 对账，解除前不安装新候选。不得改 CLI runtime、RPC、desktop native 或全局来源登记。 |
| CLI 内核、工具与工作流 | apps/cli/**，排除 apps/cli/packages/contracts/** | runtime/turn、agent、tool、workflow/scheduler、context 的剩余完整 owner 与调用入口；保留 A/E 当前整合选择、CommandInbox、权限/trace 和错误时序。tool-perf 已有保留决定，不按旧询问强制重写。公共 schema、provider native、desktop/transport/service 文件只读。 |
| desktop native 与传输 | packages/desktop/src/** 排除 renderer/**；packages/desktop 的其他文件；packages/server/**；packages/server-cli/**；packages/rpc/**；packages/client/**；packages/provider-node/**；packages/cua/** | Main/Host/IPC、远控、stdio/RPC、连接/取消/lease 与 native 桥接；可从 E 已备 complete channelClient packet 对账后推进，保留 #9/#12 已装 owners。不接管服务业务状态，不编辑 UI renderer/CLI；平台及反馈流/node-forge 诊断留待最终阶段实际验证。 |

各路包内测试/证据随其模块维护，本阶段不运行验证。新根规格使用各自唯一 `specs/knorvia-next-{ui,services,cli,platform}-*` 前缀，新根证据使用 `docs/evidence/backlog-{ui,services,cli,platform}-*/` 前缀，防止共写历史记录。既有跨模块规格如需改动先交整合者协调。

整合者唯一维护共享协议 `packages/shared/**`、`apps/cli/packages/contracts/**`、根 manifests/lockfiles、architecture-policy、CI、全局 provenance/reviews/current-files、LICENSE/NOTICE/THIRD-PARTY-NOTICES 及整合记录。最终来源清单刷新与验证属于后续统一验收；实现阶段不为门禁调整分类、放宽检查或改变权利结论。其他未列出的包/根资产先由父任务明确分配，不多开替代任务。

## 未运行项与真实剩余阻塞

本轮 **未运行** 测试、lint、类型检查、格式/架构验证、CLI/Web/安装包构建、完整审计、source/emitted/消费者矩阵、原生/界面/平台回归。没有安装依赖、重跑 CI、操作真实用户数据、配置、凭据、网络/权限业务或发布；Git/API 只用于授权的仓库读取/提交/推送/PR。旧证据中的局部通过与失败保持历史限定，均不是本轮结果。

只阅读既有 CI：[PR9 37096643153](https://github.com/accomplish07zrh-eng/knorvia-studio/actions/runs/37096643153)、[PR10 37096385450](https://github.com/accomplish07zrh-eng/knorvia-studio/actions/runs/37096385450)、[PR12 37095110127](https://github.com/accomplish07zrh-eng/knorvia-studio/actions/runs/37095110127)。三个 exact heads 的 Linux 和 Windows 都失败于 file provenance inventory，安装、类型/lint/format/架构/构建/离线回归均 skipped。创建整合 PR 可由既有工作流自动产生新 run；不会将其写成已通过。

剩余重点：

- sessionService/taskIndexSyncer 的分配与来源 HOLD；D startup/commitMessageFileScope 和 root/E accepted-hash HOLD；原候选的 whole-expression、贡献权与材料义务尚未核验。
- 三个 E scheduler 当前 consumer、共享 schema、G transport/RPC/Host → D services → root Main/IPC 与 UI 的最终组合兼容尚未验收。旧 source/emitted selectors 不是当前组合验证。
- 历史 RPC/CUA、ReadableStream.destroy、node-forge 诊断只作已有证据保留；本轮不运行类型检查，不能判定它们在最终树仍存在或已经解决。
- 全局来源清单已在既有 CI 失败，新增文件与后续改动不会自动清理门禁。保留原 inventory/reviews 事实与过期风险，最终核对后再刷新，不能从技术 candidate 自动授 MIT。
- #7 的 27 项与 E 的 21 项材料口径均保留在各自 pinned 历史记录，本轮不计算新的关闭数；README/NOTICE、彩色图标、React skill、QuickJS/Skia/Rust 等义务不能因黑白视觉或重构抹除。

根 LICENSE 的 Git blob `550d8df4cfc74878663a511caa97852f15fd9592` 与 NOTICE.md `23f3047cb5753322ce0742545e5e06791392f5ea` 仍与 #7 相同。未完成独立性、来源、权利、产物与最终功能验收前，不改称全量 MIT，也不声明完成开源迁移。
