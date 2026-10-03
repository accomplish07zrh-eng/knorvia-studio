# 固定云任务归属与整合者持续记录

2026-10-03。父任务已经创建四路固定云任务，统一从 `3b1ff0f715a43cbc51c576fd524479a08e58e203` 建持久分支，draft PR base 为 `integration/backlog-20261003`。只复用这些任务和本整合对话，不创建替代任务。唯一面向 main 的组合出口是 [draft PR #13](https://github.com/accomplish07zrh-eng/knorvia-studio/pull/13)。所有实现批次完成后再统一整合、来源核验、测试与构建；本阶段不运行验证，不合并 main，不机械刷新来源清单。

## 固定任务与路径边界

| 模块 | 固定任务 ID | 唯一编辑范围 | lane 记录 |
| --- | --- | --- | --- |
| UI | 01a10019-de88-7513-8dd6-b2a3981370c7 | packages/ui/**、packages/web/**、packages/desktop/src/renderer/** | docs/lane-ui-20261003.md |
| services | 01a10019-ff7f-76f8-8d1e-0ba31855a0e0 | packages/services/**、packages/provider/** | docs/lane-services-20261003.md |
| CLI | 01a1001a-2143-77b7-a852-00caffddc0c0 | apps/cli/**，排除 apps/cli/packages/contracts/** | docs/lane-cli-20261003.md |
| native | 01a1001a-4b5f-750a-9eaf-bfa1d2c5d0d4 | packages/desktop/**，排除 src/renderer/**；packages/server/**、packages/server-cli/**、packages/rpc/**、packages/client/**、packages/provider-node/**、packages/cua/** | docs/lane-native-20261003.md |
| 整合者 | 本对话 | packages/shared/**、apps/cli/packages/contracts/**、根配置/CI、根 scripts/**、全局来源/许可记录与整合分支 | 本文 |

父任务说明四路模型配置均为 gpt-6.1-sol / max / fast；这是父任务提供的配置记录，不是本整合者另外创建任务或验证运行时服务层。各 lane 记录由对应任务独占编辑，整合者只读，不共写其历史记录。

## desktop renderer 的实际路径

从固定基线的 tracked tree、`packages/desktop/vite.config.ts`、`tsup.config.ts`、HTML 脚本入口和 Main loadFile/loadURL 调用确认，renderer **完整根**为 `packages/desktop/src/renderer/`，不能缩窄成 `packages/desktop/src/renderer/src/`。

| 实际路径/入口 | 唯一文件编辑者 | 相邻文件编辑者 |
| --- | --- | --- |
| renderer/index.html → renderer/src/main.tsx | UI | 主窗口创建/加载与 IPC admission：native |
| renderer/resource-manager.html → renderer/src/resource-manager.tsx | UI | main/resourceManagerWindow.ts、preload/resourceManager.ts：native |
| renderer/cua-permission-panel.html → renderer/cuaPermissionPanel.ts → renderer/cuaPermissionPanelMessages.ts | UI | main/cuaPermissionDragPanel.ts、preload/cuaPermissionPanel.ts、系统权限/native helper：native |
| renderer/appTelemetryBridge.ts、renderer/src/*Bootstrap.ts、renderer/src/performanceTimelineCleanup.ts | UI | desktop src/shared/**、main/preload/host telemetry：native；packages/shared telemetry 公共合同：整合者 |
| renderer/src/databaseStartupAdmission.ts、remoteWorkspaceSessionServices.ts、remoteWorkspaceServicePortBridge.ts、desktopPlatform.ts、desktopBrowserPlatformBridge.ts | UI | Host/remote/native ports：native；services 业务与持久状态：services；共享 schema：整合者 |
| renderer/public/**（含保留的彩色 material-icons、Knorvia 图标及其他资产） | UI | 来源/第三方许可决定与最终资产清单：整合者；打包路径：native |
| packages/desktop/vite.config.ts、tsup.config.ts、tsconfig*.json、package.json、scripts/**、electron-builder/build 配置 | native | UI 提供 renderer graph 的入口需求；整合者协调根 manifest/lockfile/CI |

Vite `root: "src/renderer"`，三个 HTML build input 明确分别为 index、resource-manager、cua-permission-panel，产物到 `packages/desktop/out/renderer`。tsup 单独处理 Main、Host、preload、scheduler；`packages/desktop/src/shared/**` 名称含 shared，但按父任务的 desktop 非 renderer 范围归 native，不混同整合者独占的 `packages/shared/**`。

`out/renderer`、`dist`、cache 和安装/便携 payload 是生成/最终构建输出，不列为新的源码 lane，不把产物反复制回当前源目录。Main 自带的 About HTML/window/menu 位于 main，因此仍归 native；其视觉与 UI 标准要跨路协调，不能据“呈现内容”双重编辑 Main 文件。

以上明确生产文件没有目录重叠，也覆盖直属 renderer 根的 TS/HTML/资产。UI 包内、renderer 根内的测试随 UI；desktop 根 test/scripts/config 文件随 native，UI 若需改这些已有消费者/界面夹具则向父任务提出精确路径请求，不自行越界。本阶段只记录未运行项，不以检查成功扩大权限。

## 尚未分配的包与跨路接口

`packages/model-option-map/**` 与 `packages/formal-proof/**` 是仓库当前实际存在、四路范围未覆盖的额外包；暂由整合者登记 HOLD/协调，**未授权某一路自动接管**。没有因为目录存在就推定仍待重写或属于原创。根官网/发行资产、patches、third-party、examples 及额外资源也在整合者协调队列，保留各自来源；需要实现时由父任务明确原固定任务归属或由整合者在自身范围推进，不额外开云任务。

跨路公开合同由唯一文件编辑者维护：renderer → preload/Main 的参数、通道与消息；services → CLI/runtime 的 command/snapshot/index；所有 lane → shared/protocol/contracts。请求先给父任务列精确路径、现有符号、需求和依赖 SHA，整合者写公共合同并返回新 checkpoint，其余任务通过普通 merge 接收。临时 any、stub、重复状态所有者、改签名而只改一端或放松安全策略都不能代替对账。

本阶段继承历史 root allocation/hash HOLD 的范围只由新的明确文件分工改变编辑者；这不解除来源/权利或 accepted-byte HOLD。特别是 services 的 sessionService/taskIndexSyncer、CLI 的旧 scheduler selectors、root/E 的 graph/read-state accepted hashes：不能因新 lane ID 或新路径就当作原创/已验收。

## 接收与旧 PR 漂移

旧 PR #7–12 的已收完整 heads 继续按 [第一阶段记录](knorvia-backlog-integration-20261003.md) 保存。2026-10-03 05:03 UTC 的 GitHub API 复读仍为同一组 heads。旧 PR 后续有更新只追加记录新 SHA、时间和范围，**不自动合入、不追赶、不覆盖四路固定任务的活动源码**。

新的四路 PR 在各自批次完成后由父任务通知统一接收。来源分支固定，完整 head 必须记录。接收时继续维护 integration/backlog-20261003，用 merge 保留历史，不 cherry-pick 已收提交、force-push 或重建分支。被拒绝/未安装的候选、原错误与未运行验证不改写成通过。

同次只读取得四路活动 PR：以下均为 open/draft、base `integration/backlog-20261003`，尚未接入整合分支，也不把 PR 存在当作批次完成通知。

| 固定模块 | PR / 固定分支 | 05:03 UTC 观察到的完整 head |
| --- | --- | --- |
| CLI | [#14](https://github.com/accomplish07zrh-eng/knorvia-studio/pull/14) / lane/cli-rewrite-20261003 | 8ab8d719bea0dc7e3e2f7de522db57dac374e048 |
| UI | [#15](https://github.com/accomplish07zrh-eng/knorvia-studio/pull/15) / rewrite/ui-20261003 | 4740068ed5704f0e01e1d4d0d7ae3750de0deb24 |
| services | [#16](https://github.com/accomplish07zrh-eng/knorvia-studio/pull/16) / lane/services-20261003 | 146c13ab52958846e2e7209d65bfb7fe7269ecbc |
| native | [#17](https://github.com/accomplish07zrh-eng/knorvia-studio/pull/17) / rewrite/native-20261003 | cdc80cb1e6d3c731c1ea41d2c9663d83b2fd532d |

## 整合者范围的实现筛选

已阅读的 shared assembly/projection 当前源码由 #9 的 `7caec377c3b6aace6f9a08344d77497726459eb2` 后续完整候选更新；虽然 saved inventory 仍标原 upstream-unchanged，当前 digest 已不同且完整 packet/receipt 已在基线。保留 wire-assembler、workflow-runs-artifacts、conversation-message-projection-policy、session-visible-content、tool-plan-adapter；不据陈旧 inventory 再重写一遍。

coding-plan-subscription.ts 是集中协议类型/固定常量，没有可独立计数的运行时 owner，保留原 API 和来源，不为独立数量重排字段。workflow-runs-reducer.ts 当前 `f07e531f2dc425d701ce538f0a74c865f6658a99acc9c22ff68d67a6cfef11e6` 仍有历史 WIP/accepted-binding HOLD；先保留精确事实，不能冒充恢复旧 accepted artifact。其他候选需读当前 contract、调用方与完整历史记录，先写 spec，再以新实现替换真正待完成的 owner；全局许可决定与最终核验留在后续阶段。

## 去重模块进度（实现候选与来源决定分开）

这是当前接收范围的轻量记录，不是全仓库分母、文件计数或新的审计包。同一模块的辅助文件、wrapper、spec 不另算一个完成模块；源码提交之后只追加实际 SHA 与明确状态。

| 模块 / 源码所有者 | 当前绑定 | 工程状态 | 来源与验收状态 |
| --- | --- | --- | --- |
| 历史 main 的认证、model adapter、插件 source/storage、命令执行/discovery、MCP client lifecycle | main checkpoint bd0bb014c0974334557fa51814709d0b78f35f1d；下文列原提交 | 历史替换候选已在基线，纳入累计工程估计 | 沿用原提交记录与来源义务；本轮没有重新核验或全量 MIT 结论 |
| 积压 #7–12 的完整 runtime / workflow / transport / service / shell 等候选 | 首轮基线 3b1ff0f715a43cbc51c576fd524479a08e58e203；逐输入、冲突与路径绑定见第一阶段记录 | 已安装，保持全部 ancestry；按实际模块去重，不按 PR 数计完成率 | 原失败、source exposure、accepted-hash / 权利 HOLD 保留；组合未验证 |
| shared packet assembly 与 projection policy | 7caec377c3b6aace6f9a08344d77497726459eb2；保留当前完整 owners | 已安装候选，未因陈旧 inventory 重复重写 | 保存已有证据；本轮无新接受决定 |
| contracts session-event residence / turn retention | spec d91db4dbfcdbf467a53943dcb68f54cef5732e22；实现 ac5515ad37b88d32b07dee5eafbf96fad9978e27 | 完整替换候选已提交，3 个 source 文件算一个模块 | source-exposed authoring；运行验证、表达独立性与贡献权利仍待核验 |
| contracts event-reducer / event-reducer-helpers / tracing tracer | 源码保留自 3b1ff0f715a43cbc51c576fd524479a08e58e203 | 仍待完整行为合同与实现，不从 store 的完成推定 reducer 完成 | 原来源保留，未接受原创决定 |
| shared workflow-runs-reducer | 当前源码 SHA-256 f07e531f2dc425d701ce538f0a74c865f6658a99acc9c22ff68d67a6cfef11e6，保留自同一基线 | 仍待实现/accepted artifact 对账，保留历史 HOLD | 不恢复被放弃的旧实现，不把旧 accepted receipt 绑定新源码 |
| 四路固定任务当前新增候选 | 上表 #14–17 的观察 heads | 待父任务批次完成通知和统一接收；未计入安装完成估计 | 来源、消费者与产品验收待统一阶段 |

contracts 实现的文件归属为 `apps/cli/packages/contracts/src/events/in-memory-session-event-store.ts`、`session-event-journal.ts`、`session-event-retention.ts`。事件由每 session 的一个 journal 持有，retention 的索引只引用同一 sealed 链节点；保持公开 port、schema、barrel、工厂和参数、Promise 边界、序号规则、存入对象身份、replay 顺序、策略/时钟错误后的既有已驻留状态与 receiver、120 秒 grace、delete/recreate 与瞬态类别。没有改 UI、持久用户数据或其他 lane 的源码和记录。细则与以后统一验收场景见 [先行 spec](../specs/knorvia-next-integration-event-residence-20261003.md)。代码作者已读旧实现；标准/API/固定策略保留，不以新链结构宣称 clean room 或权利已接受。

## 用户要求的累计工程主观估计

按第一阶段安装基线 `3b1ff0f715a43cbc51c576fd524479a08e58e203` 及此前 main 的实际大项，累计工程替换的主观区间为 **约 55%–70%，误差约 ±10 个百分点**。本轮一个 event-residence 模块不足以收窄该区间；尚未接入的四路新增 PR 不计入。此数字回答累计工程工作量，不是本轮 review 覆盖率、验证通过率、源码原创率、MIT 权利清理率或发布完成率。未为统计运行扫描或检查，也不以文件/行数、PR 个数、迁移标签作分母。

| 工作量权重（主观） | 权重 | 判断依据 |
| --- | --- | --- |
| CLI / 内核 / 工具 / workflow | 35% | main 历史与 #7、#8、#11 的大项已进入基线；运行时 reducer 等仍待完成 |
| native / desktop / transport | 25% | #9、#12 与旧 host/remote 候选已安装；跨端结合、真实 native/UI 路径仍待后期验收 |
| services / provider | 15% | 历史 model/auth/storage 与 #10 已安装；sessionService/taskIndexSyncer 权利与完整 owner 对账尚未接受 |
| UI / web / renderer | 20% | 已有组件/启动/远程桥接成果；大量继承 UI 和所有候选的实际 cutover 是最大估计不确定性 |
| shared / root build / release | 5% | 已安装 shared assembly/projection 与本轮 contracts 候选；reducer、根来源/发行事项仍在队列 |

纳入判断的历史 main 提交为：auth `dac92ce60465f68c996e9e620b9d871369f971b6`、model `c60390b02ee8b377d830d8361b8c9394c4d4c345`、plugins source/storage `780d847c9a8d6eb7d4b01d22646e1cb1ecf28679`、command/discovery `c439b5d991e9e52f8da3e46ebda9cf869911ff74`、MCP `822cfeecd7add20499bff86d220bebb18ea57c5b`。这里引用其实际历史提交而不是用提交标题自行确认“独立”：既有来源资格、许可与不确定性继续照原记录保留。

## 本轮未执行项

测试、lint、类型检查、格式/架构检查、构建、完整审计和真实原生/UI/网络/用户数据操作均未运行。只有 Git/API/源码/配置/历史证据读取及授权的仓库提交/推送/PR 维护。全局 reviews/current-files、根 LICENSE/NOTICE 和 CI 门禁继续保留，不声明通过或全量 MIT。
