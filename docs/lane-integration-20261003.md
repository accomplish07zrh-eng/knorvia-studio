# 固定云任务归属与整合者持续记录

2026-10-03。父任务已经创建四路固定云任务，统一从 `3b1ff0f715a43cbc51c576fd524479a08e58e203` 建持久分支，draft PR base 为 `integration/backlog-20261003`。只复用这些任务和本整合对话，不创建替代任务。唯一面向 main 的组合出口是 [draft PR #13](https://github.com/accomplish07zrh-eng/knorvia-studio/pull/13)。先前实现阶段未运行验证；父任务现已通知四路冻结，进入下述统一整合与集中验收阶段。暂不合并 main，不机械刷新来源清单或改写权利结论。

## 最终两平台修复接收（09:30 UTC）

四组完整最终输入：CLI `b7dc31ff315121e4302539a5309619b8d8a85b81`、native `a77f03e5925fbe458bfed06e6ebe8d3af0fc684c`、services `f5ebc48f033382706a945cf5ec5156b8905627e3`、UI `d6274d61fe6d15b976f3b7b5b24f8e62d470229e`。前三组通过普通merge进入 `4e9badd56b919bb72c2ec79d5627b8a8f1049c37`，UI已在先前c576接收，路径无重叠/冲突。lane分支接回73材料检查点的祖先同样保留，不将旧source分支缺少的新文档当成删除。详见 [完整接收与字节绑定](final-platform-repair-intake-20261003.json)。

CLI当前source receipt实际含14个原selector、217个source/emitted条目，其中75个src条目与当前源码SHA相符；不是将12个原失败族等同14个selector数。旧selector/golden保持原字节，旧活动helper/caller/reducer绑定独立historical sidecar，未恢复的accepted-source/整文件权利HOLD不改。NaN原oracle恢复原reducer后24个旧golden匹配，live fold只增加SameValueZero组件相等，finite-endpoint reducer不放宽。native4个与services12个Windows失败文件仅修测试root/完整本机路径/别名/导入键，权限/计数/字节/顺序等断言保留。

新services测试helper `packages/services/test/fake-native-paths-20261003.ts` 的当前SHA为 `1f37eaf44b98eb887c3b528bdf6fcd9a2d3d732958a9e58887f76ceba0a6ee70`，当前inventory为unreviewed/NOASSERTION/review null；CLI fold新SHA `fe868022b2e79e60efb90ce32dc0f3872bd205de57dc6c9158186768c84f8e66` 仍upstream-modified/NOASSERTION/review null。登记身份不构成原创、贡献权利或MIT验收。新增50份交付raw（CLI4/native6/services40）与原head逐项同字节，5617旧记录保留；另3份只读上轮CI观察，共5670记录/64,404,283字节。格式检查发现5个CLI夹具/reader与清单排版问题，仅列明排版，原交付SHA与排版后SHA分开，不碰hash绑定JSON/golden/raw。

上轮c576受检synthetic `d2bcf9aa926adad1c0a130f81bebefd46c07d470` 实际结束：Linux8034/8008pass/18fail/8skip，Windows8031/7994pass/36fail/1skip；前置quality/CLI build过，offline失败，均不是本次最终修复组合结果。较早7bfb的Linux22/Windows40和材料73的取消日志仍保留，定向4/4只是Node24.14 Linux上的四个原失败。当前完整组合统一推送后，以标准CI的实际Linux与Windows结果为主，本地不重复整套types/lint/build/test或原路77/12。真实GUI/native权限、发布安装包/原用户数据现场检查不包含在这套offline CI中。26个材料项零关闭，旧LICENSE/NOTICE/register/reviewRequired及来源HOLD全部保持，main未合并。

## 固定任务与路径边界

| 模块     | 固定任务 ID                          | 唯一编辑范围                                                                                                                                                                       | lane 记录                      |
| -------- | ------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------ |
| UI       | 01a10019-de88-7513-8dd6-b2a3981370c7 | packages/ui/\*\*，排除下列明确转交 services/CLI 的路径；继续文件树消费者、grouped section、taskListRowActivity 及其专用候选                                                        | docs/lane-ui-20261003.md       |
| services | 01a10019-ff7f-76f8-8d1e-0ba31855a0e0 | packages/services/**、packages/provider/**，以及下列 Studio 四 helper 与一个 store                                                                                                 | docs/lane-services-20261003.md |
| CLI      | 01a1001a-2143-77b7-a852-00caffddc0c0 | apps/cli/**，排除 apps/cli/packages/contracts/**；另有下列 v4 布局恢复九文件                                                                                                       | docs/lane-cli-20261003.md      |
| native   | 01a1001a-4b5f-750a-9eaf-bfa1d2c5d0d4 | packages/desktop/**，包含整个 src/renderer/**；packages/server/**、packages/server-cli/**、packages/rpc/**、packages/client/**、packages/provider-node/**、packages/cua/**         | docs/lane-native-20261003.md   |
| 整合者   | 本对话                               | packages/shared/**、apps/cli/packages/contracts/**、packages/model-option-map/**、packages/formal-proof/**、packages/web/**、根配置/CI、根 scripts/**、全局来源/许可记录与整合分支 | 本文                           |

这是父任务本轮重新分配后的当前边界，继续复用原四个任务、分支和 PR；下文较早快照保留当时分工与输入，不构成现在的编辑权限。Web 整包转交整合者；UI 明确报告 #15 没有 Web 提交，旧 /tmp 草稿不取用。desktop renderer 整包转交 native。services 的精确切片为 `packages/ui/src/studio/groups/useStudioGroups.ts`、`groupModel.ts`、`groupDefinitions.ts`、`groupSubmission.ts`（后三者同一 groups 目录）及 `packages/ui/src/store/studioGroupStore.ts`；路径绑定来自 #16 完整 head `dac1483b661064ba64003a1137713646d2ebbc8c` 的说明，不扩大到整个 groups 目录。CLI 的精确切片为 `packages/ui/src/v4/` 下 `paneLayoutTree.ts`、`paneLayoutStore.ts`、`paneLayoutPersistence.ts`、`workbenchGroupStore.ts`、`workbenchSessionPlacement.ts`、`workbenchNewTaskTarget.ts`、`usePaneSessionPersistence.ts`、`WorkbenchSplitDivider.tsx`、`workbenchDragDrop.ts`；依据 #14 完整 head `3dff9ec7a8c3f36895640f121e4665bfb80f1989` 的已发布切片规格。读取路径记录不等于接入这些活动 heads。

父任务说明四路模型配置均为 gpt-6.1-sol / max / fast；这是父任务提供的配置记录，不是本整合者另外创建任务或验证运行时服务层。各 lane 记录由对应任务独占编辑，整合者只读，不共写其历史记录。

## desktop renderer 的实际路径

从固定基线的 tracked tree、`packages/desktop/vite.config.ts`、`tsup.config.ts`、HTML 脚本入口和 Main loadFile/loadURL 调用确认，renderer **完整根**为 `packages/desktop/src/renderer/`，不能缩窄成 `packages/desktop/src/renderer/src/`。

| 实际路径/入口                                                                                                                                                         | 唯一文件编辑者 | 相邻文件编辑者                                                                                           |
| --------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------- | -------------------------------------------------------------------------------------------------------- |
| renderer/index.html → renderer/src/main.tsx                                                                                                                           | native         | 主窗口创建/加载与 IPC admission：native                                                                  |
| renderer/resource-manager.html → renderer/src/resource-manager.tsx                                                                                                    | native         | main/resourceManagerWindow.ts、preload/resourceManager.ts：native                                        |
| renderer/cua-permission-panel.html → renderer/cuaPermissionPanel.ts → renderer/cuaPermissionPanelMessages.ts                                                          | native         | main/cuaPermissionDragPanel.ts、preload/cuaPermissionPanel.ts、系统权限/native helper：native            |
| renderer/appTelemetryBridge.ts、renderer/src/\*Bootstrap.ts、renderer/src/performanceTimelineCleanup.ts                                                               | native         | desktop src/shared/\*\*、main/preload/host telemetry：native；packages/shared telemetry 公共合同：整合者 |
| renderer/src/databaseStartupAdmission.ts、remoteWorkspaceSessionServices.ts、remoteWorkspaceServicePortBridge.ts、desktopPlatform.ts、desktopBrowserPlatformBridge.ts | native         | Host/remote/native ports：native；services 业务与持久状态：services；共享 schema：整合者                 |
| renderer/public/\*\*（含保留的彩色 material-icons、Knorvia 图标及其他资产）                                                                                           | native         | 来源/第三方许可决定与最终资产清单：整合者；打包路径：native                                              |
| packages/desktop/vite.config.ts、tsup.config.ts、tsconfig\*.json、package.json、scripts/\*\*、electron-builder/build 配置                                             | native         | native 维护 renderer graph 的入口；整合者协调根 manifest/lockfile/CI                                     |

Vite `root: "src/renderer"`，三个 HTML build input 明确分别为 index、resource-manager、cua-permission-panel，产物到 `packages/desktop/out/renderer`。tsup 单独处理 Main、Host、preload、scheduler；`packages/desktop/src/shared/**` 名称含 shared，仍属于 native 的 desktop 范围，不混同整合者独占的 `packages/shared/**`。

`out/renderer`、`dist`、cache 和安装/便携 payload 是生成/最终构建输出，不列为新的源码 lane，不把产物反复制回当前源目录。Main 自带的 About HTML/window/menu 位于 main，因此仍归 native；其视觉与 UI 标准要跨路协调，不能据“呈现内容”双重编辑 Main 文件。

以上当前分配覆盖直属 renderer 根的 TS/HTML/资产。UI 包内的测试仍随 UI，已转交切片以明确文件白名单为限；renderer 根内的测试及 desktop 根 test/scripts/config 全归 native。其他任务若需改白名单外消费者/界面夹具，先向父任务提出精确路径请求，不自行扩大范围。本阶段只记录未运行项，不以检查成功扩大权限。

## 新增分配的包与跨路接口

`packages/model-option-map/**` 与 `packages/formal-proof/**` 是仓库当前实际存在、四路初始范围未覆盖的额外包；父任务本轮已明确分配给**本整合任务独占实现**，不再等待归属授权，也不交给 UI/native/services/CLI 共写。model-option-map 被 packages/shared/src/model-config.ts、provider/provider-node 与 CLI model adapter 共用；formal-proof 是独立的产品状态枚举器/D3 页面。初次筛选时两包源码最后变更均为 7619e41b950bd52073ebf36754146cf25659d9fa，目标 inventory 的精确 source digest 当时与源一致、review 为 null；其后完成的 runtime 候选绑定见下表，此初始筛选不再代表当前待实现清单；types/barrel/固定配置和视觉值不得仅为数量重排。新分配不解除来源/权利 HOLD。根官网/发行资产、patches、third-party、examples 等继续协调，保留各自来源，不额外开云任务。

跨路公开合同由唯一文件编辑者维护：renderer → preload/Main 的参数、通道与消息；services → CLI/runtime 的 command/snapshot/index；所有 lane → shared/protocol/contracts。请求先给父任务列精确路径、现有符号、需求和依赖 SHA，整合者写公共合同并返回新 checkpoint，其余任务通过普通 merge 接收。临时 any、stub、重复状态所有者、改签名而只改一端或放松安全策略都不能代替对账。

本阶段继承历史 root allocation/hash HOLD 的范围只由新的明确文件分工改变编辑者；这不解除来源/权利或 accepted-byte HOLD。特别是 services 的 sessionService/taskIndexSyncer、CLI 的旧 scheduler selectors、root/E 的 graph/read-state accepted hashes：不能因新 lane ID 或新路径就当作原创/已验收。

## 接收与旧 PR 漂移

旧 PR #7–12 的已收完整 heads 继续按 [第一阶段记录](knorvia-backlog-integration-20261003.md) 保存。2026-10-03 05:03 UTC 的 GitHub API 复读仍为同一组 heads。旧 PR 后续有更新只追加记录新 SHA、时间和范围，**不自动合入、不追赶、不覆盖四路固定任务的活动源码**。

新的四路 PR 在各自批次完成后由父任务通知统一接收。来源分支固定，完整 head 必须记录。接收时继续维护 integration/backlog-20261003，用 merge 保留历史，不 cherry-pick 已收提交、force-push 或重建分支。被拒绝/未安装的候选、原错误与未运行验证不改写成通过。

同次只读取得四路活动 PR：以下均为 open/draft、base `integration/backlog-20261003`，尚未接入整合分支，也不把 PR 存在当作批次完成通知。

| 固定模块 | PR / 固定分支                                                                                    | 05:03 UTC 观察到的完整 head              |
| -------- | ------------------------------------------------------------------------------------------------ | ---------------------------------------- |
| CLI      | [#14](https://github.com/accomplish07zrh-eng/knorvia-studio/pull/14) / lane/cli-rewrite-20261003 | 8ab8d719bea0dc7e3e2f7de522db57dac374e048 |
| UI       | [#15](https://github.com/accomplish07zrh-eng/knorvia-studio/pull/15) / rewrite/ui-20261003       | 4740068ed5704f0e01e1d4d0d7ae3750de0deb24 |
| services | [#16](https://github.com/accomplish07zrh-eng/knorvia-studio/pull/16) / lane/services-20261003    | 146c13ab52958846e2e7209d65bfb7fe7269ecbc |
| native   | [#17](https://github.com/accomplish07zrh-eng/knorvia-studio/pull/17) / rewrite/native-20261003   | cdc80cb1e6d3c731c1ea41d2c9663d83b2fd532d |

父任务随后报告 native 第一轮完成于 `85ea4dcf9d0da20c14a487caaafc677a2f81f047`，GitHub API 已确认 #17 的同一 head；包含控制 client/server、JSONL decoder、状态持久化与停止确认两批源码。父任务已在原固定线程派下一批，故这是已完成批次的冻结输入，不把活动 PR 自动当作全路完成，也暂不合入或提前合 main。实际 desktop 路径一直按 `packages/desktop` 登记；当时 renderer 全部归 UI，其余归 native，现已按上表把整个 renderer 转交 native。历史别名不遗漏根 renderer 文件。

父任务随后报告 UI 四批交付于 `7393e33483aceedb1fad4e2ed3fe50dee10f3db1`，GitHub API 已确认 #15 的同一 head；范围为文件树投影、分组编辑/虚拟滚动、群任务进展、v4 引用稳定化。父任务复用原任务继续文件树 watch/search/sticky 和 Studio/v4；同样保持该批完整 SHA 为冻结输入，尚不接入、不当作全 UI 或消费者验收完成。整合者既有 renderer 完整路径已与父任务再确认，无重叠授权。

本轮代码发布后的最后一次只读 GitHub head 快照：CLI #14 `18f070df5c16f2d9cb44354277b392d5cff8b2f3`、services #16 `5b0b53522d235397cf435a627393c0bf5818d28c`、native #17 `388b69ccf08feacee73fbffb31a48faaa32c07ce`；UI #15 仍为上述 `7393e33483aceedb1fad4e2ed3fe50dee10f3db1`。前三者是活动推进，不覆盖原冻结完成批次、不推定新批验收或提前接入。旧 #7–12 再读仍为第一阶段完整输入 heads，继续只记录漂移，不追赶合入。

2026-10-03 05:47 UTC 本轮发布前最后一次只读远端快照：旧 #7–12 六个完整 heads 再次与第一阶段输入一致，全部 open/draft、原 base 不变。main 仍 `bd0bb014c0974334557fa51814709d0b78f35f1d`；#13 仍 open/draft、base main。新的 #14–17 仍 open/draft、base integration/backlog-20261003：CLI `51bd4b6916f44457c58ea10f0e6246513458019b`、UI `b4eb691e7e3ddf906d08546f84a4defb1f43f971`、services `549b8dbc76a6e359d4b7f9da5db65a367abe4f3e`、native `33f812b483582dd6a6152618b4a57406b94a15ea`。services 与父任务冻结 head 一致；其余后续 head 是活动观察，不覆盖先前已报告完整批次、不推定全路完成、不提前接入，也没有读取/触发新检查。

2026-10-03 06:31 UTC，执行通道恢复后的只读 GitHub 快照为：CLI #14 `3dff9ec7a8c3f36895640f121e4665bfb80f1989`、UI #15 `98bfe6d99d10024bdde2f5b0208c4a787ec66576`、services #16 `dac1483b661064ba64003a1137713646d2ebbc8c`、native #17 `cd0c79cc1629cb62dfe00a4c406d52f198cb8f7d`。四者仍 open/draft、base integration/backlog-20261003，均未合入本分支。父任务先前给出的 CLI f835917… / UI 662b642… / services 90e7d290… / native f25bb5b… 是历史批次输入，后续切片仍在推进，不能把它们或本次观察自动认定为最终冻结 head。#13 仍 open/draft、base main，远端已确认 Web source head `fdd3b3dbff0a8ff85db5170218601bb277088552`。通道恢复后本地同 SHA 且工作区干净，没有重建任务/分支、覆盖远端新提交或接入其他路源码；本次快照未读取或执行 CI。

## 四路冻结接收与最终集中验收

父任务明确通知以下最终输入全部冻结；GitHub API 与 fetched remote refs 都逐一匹配，未有额外漂移。相对 `3b1ff0f715a43cbc51c576fd524479a08e58e203`，整合者及四路的修改路径没有交集。本次四个普通 merge 均无冲突，保留全部提交、规格、源码、旧失败/候选与来源义务，不重放或改写历史。

| 输入                                        | 接收的完整 head                          | 整合 merge commit                        |
| ------------------------------------------- | ---------------------------------------- | ---------------------------------------- |
| #14 CLI + v4                                | 5274ca99d13531377000fe0f2c529561f75ce046 | f9c6627f61b705727f580aee25e54c9f2a63aaea |
| #15 UI                                      | 809374e21993bb03cabaf3d68adad6564baa41fa | 95558f000ee26fa95d976750c98d126adef186a7 |
| #16 services + Studio                       | dac1483b661064ba64003a1137713646d2ebbc8c | 3e2b789bdf6b6534bfe92384777ed6dc07b4a0b1 |
| #17 native + renderer + client declarations | f7ad7efa3e5e1bec72eaba818db6bce43fa33d97 | df2c89478cd5cdaffa1a5cbbc047203c4bfa4327 |

前置整合 head 为 `dc0c4ad2c746d311d9b34634677f93a96ecc642c`，四路源码组合 head 为 `df2c89478cd5cdaffa1a5cbbc047203c4bfa4327`；本节记录和根 runner 接纳会另有提交，不把 merge 本身写成验证通过。下文“待接收”的先前快照均保留历史限定，当前四路已经接入。

根 `scripts/test-studio.mjs` 已接纳 CLI 六条 explicitTests 和 `packages/server-cli/test` 目录，目录下实际三份新增 test 由原顶层规则发现，fixtures 不作为 test；core 既有目录不重复登记。glob 完整集合对账、隔离临时数据目录、凭据过滤、并发/上限及退出码语义保留。当前树开始集中执行最终检查；初次架构命令因尚未安装 typescript 未启动检查，固定 Node 24.14.0 / pnpm 10.33.2 与 frozen/ignore-scripts 依赖准备后，再执行 `pnpm architecture:check --changed` 返回 0，violations/baseline/new 均为 0。这只是修改前的架构范围检查，其他代码/平台/来源检查仍待实际执行，结果继续追加到本文，不解除 HOLD。

具体最终阶段规则已先更新 [原整合规格](../specs/knorvia-backlog-integration-20261003.md)。父任务协调原任务按实际失败修复，不新开任务；在最终代码验收与必要来源边界明确后先报就绪结论，再按授权处理 main。

## 整合者范围的实现筛选

已阅读的 shared assembly/projection 当前源码由 #9 的 `7caec377c3b6aace6f9a08344d77497726459eb2` 后续完整候选更新；虽然 saved inventory 仍标原 upstream-unchanged，当前 digest 已不同且完整 packet/receipt 已在基线。保留 wire-assembler、workflow-runs-artifacts、conversation-message-projection-policy、session-visible-content、tool-plan-adapter；不据陈旧 inventory 再重写一遍。

coding-plan-subscription.ts 是集中协议类型/固定常量，没有可独立计数的运行时 owner，保留原 API 和来源，不为独立数量重排字段。workflow-runs-reducer.ts 的本轮 predecessor `f07e531f2dc425d701ce538f0a74c865f6658a99acc9c22ff68d67a6cfef11e6` 仍有历史 WIP/accepted-binding HOLD；后续 source-exposed 候选在下表绑定新提交，不冒充恢复旧 accepted artifact，也不解除旧 HOLD。其他候选先读当前 contract、调用方与既有记录，再写 spec 和真正待完成的 owner；全局许可决定与最终核验留在后续阶段。

## 去重模块进度（实现候选与来源决定分开）

这是当前接收范围的轻量记录，不是全仓库分母、文件计数或新的审计包。同一模块的辅助文件、wrapper、spec 不另算一个完成模块；源码提交之后只追加实际 SHA 与明确状态。

| 模块 / 源码所有者                                                                              | 当前绑定                                                                                       | 工程状态                                                                                                                                                          | 来源与验收状态                                                                                                          |
| ---------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| 历史 main 的认证、model adapter、插件 source/storage、命令执行/discovery、MCP client lifecycle | main checkpoint bd0bb014c0974334557fa51814709d0b78f35f1d；下文列原提交                         | 历史替换候选已在基线，纳入累计工程估计                                                                                                                            | 沿用原提交记录与来源义务；本轮没有重新核验或全量 MIT 结论                                                               |
| 积压 #7–12 的完整 runtime / workflow / transport / service / shell 等候选                      | 首轮基线 3b1ff0f715a43cbc51c576fd524479a08e58e203；逐输入、冲突与路径绑定见第一阶段记录        | 已安装，保持全部 ancestry；按实际模块去重，不按 PR 数计完成率                                                                                                     | 原失败、source exposure、accepted-hash / 权利 HOLD 保留；组合未验证                                                     |
| shared packet assembly 与 projection policy                                                    | 7caec377c3b6aace6f9a08344d77497726459eb2；保留当前完整 owners                                  | 已安装候选，未因陈旧 inventory 重复重写                                                                                                                           | 保存已有证据；本轮无新接受决定                                                                                          |
| contracts session-event residence / turn retention                                             | spec d91db4dbfcdbf467a53943dcb68f54cef5732e22；实现 ac5515ad37b88d32b07dee5eafbf96fad9978e27   | 完整替换候选已提交，3 个 source 文件算一个模块                                                                                                                    | source-exposed authoring；运行验证、表达独立性与贡献权利仍待核验                                                        |
| contracts session-event projection（reducer / helpers / queue / ledger transitions）           | spec 9dad1581c9dc1bc851170be8655fd8f26ffbd231；实现 1d99b03715822caac58d5d4c5b776692375353b8   | 完整替换候选已提交，5 个 source 文件算一个模块；原公开 runtime 入口接入新转换                                                                                     | source-exposed authoring；初始 template/标准数值 helper/字段策略保留原来源；尚未运行验证或接受表达/权利                 |
| contracts tracing/span/context                                                                 | spec 4779d7fb9d31816c7d75315e83f7dc788a8d7519；source 1c6f6dcb280d0013029eb2e05b12f9f0352be02d | 完整 runtime 替换候选已提交；3 个 source 文件为一个模块，公开入口接入 record residence/共享操作与单一 ALS                                                         | source-exposed；public declarations、ALS/UUID/Date/固定字段保留原来源；未验证/未接受权利                                |
| shared workflow-runs-reducer                                                                   | spec cd201beaa82f74c4b109456862f7d39925d53e55；source 176d54215e34b7ea9ee1c8ab8e9c4b94a01c371f | 完整主体候选已提交；5 个 source 文件为一个模块，run draft/严格身份 bounded rows/派生 actor observations；已装辅助 owners 不重写                                   | source-exposed；旧 f07e531f… 与 accepted-binding HOLD 仍历史限定，不绑定成新接受决定                                    |
| model-option-map                                                                               | spec b75623d31131f86aad701f86b2bb9180a6121089；source 24934687428aa5ed7f80ae5fe530670e33cb24f0 | 完整 runtime 候选已提交：单一 source cache entry、cursor scanner/precedence parser、惰性显式求值栈、path trie 首-owner 与单克隆 merge；7 source 文件为一个模块    | source-exposed；声明/语法/错误文字/标准 JSON 与数值规则保留原来源，未验证或接受权利                                     |
| formal-proof                                                                                   | spec 8b908c95205d4670f6c6b283de7d022cc171cff6；source efb26e83d0e01fa2fdc0be08c39b4f5f0653cc03 | 完整 model/page runtime 候选已提交：phase/event recipes、work-stack/trail 枚举、预算/DAG 投影、单 explorer state 与 geometry-only canvas；9 source 文件为一个模块 | source-exposed；types/catalog/HTML/CSS/固定产品文字/几何/CASE 与 review schema 保留原来源；未运行浏览器/消费者/权利验收 |
| Web theme / platform / bootstrap                                                               | spec 0d51eb27be3738dca08e7f6ea2935d60c4fb684b；source fdd3b3dbff0a8ff85db5170218601bb277088552 | 完整启动候选已提交推送；单一启动 frame、首帧主题、类型化浏览器能力表、同一工作区与失败视图，6 source 文件算一个模块                                               | source-exposed；theme seed 薄入口、性能夹具、公共 API、固定 DOM/文案/样式/平台结果保留原来源；未验证/未接受权利         |
| 四路固定任务新增候选                                                                           | 上述冻结接收表的 #14–17 完整 heads；组合 df2c89478cd5cdaffa1a5cbbc047203c4bfa4327              | 已通过四个普通 merge 安装；每个完整 owner 的 source/spec 与候选范围由各 lane 原记录绑定，不按文件/PR 数重新估计                                                   | 组合技术与产品检查开始集中执行；来源/表达/权利决定仍未接受                                                              |

contracts 实现的文件归属为 `apps/cli/packages/contracts/src/events/in-memory-session-event-store.ts`、`session-event-journal.ts`、`session-event-retention.ts`。事件由每 session 的一个 journal 持有，retention 的索引只引用同一 sealed 链节点；保持公开 port、schema、barrel、工厂和参数、Promise 边界、序号规则、存入对象身份、replay 顺序、策略/时钟错误后的既有已驻留状态与 receiver、120 秒 grace、delete/recreate 与瞬态类别。没有改 UI、持久用户数据或其他 lane 的源码和记录。细则与以后统一验收场景见 [先行 spec](../specs/knorvia-next-integration-event-residence-20261003.md)。代码作者已读旧实现；标准/API/固定策略保留，不以新链结构宣称 clean room 或权利已接受。

projection 的新增实际 owner 为 `events/session-projection-transition.ts`、`session-projection-ledgers.ts`、`session-projection-queue.ts`；`event-reducer.ts` 和 `event-reducer-helpers.ts` 保留原导出并接入唯一 commit。保留队列原位编辑/重排、工具与权限、后台任务多项合并、目标校验身份与失败摘要、主会话 context usage、压缩/checkpoint/rewind 与 streaming 恢复投影；standard/API 默认 template 和 numeric helper 不计为原创。没有编辑 runtime 调用方、公共 schemas、shared workflow reducer 或其他 lane。完整保留项与统一验收场景见 [先行 projection spec](../specs/knorvia-next-integration-session-projection-20261003.md)。

后续 tracing 及 shared workflow 候选的细则分别见 [tracing spec](../specs/knorvia-next-integration-tracing-20261003.md) 与 [workflow projection spec](../specs/knorvia-next-integration-workflow-projection-20261003.md)。前者保留 hook receiver/重入、sync throw/Promise rejection、上下文与 log 优先级；后者保留 run/seq/revision/JSON identity、cap 拒新仍更新旧、actor/node/report/question/artifact、resume/settlement 与实际 caller 入口。两者都未执行验证，不操作真实任务/数据，也不重复已有 helper owners。

两个额外包的细则见 [option-map spec](../specs/knorvia-next-integration-model-option-map-20261003.md) 与 [formal-proof spec](../specs/knorvia-next-integration-formal-proof-20261003.md)。option-map 保留 compiler/tokenizer/types/barrel/error 与同步 apply 的入口，类型和数值/字符串语法仍按原来源；request body 只写入其深克隆，不修改 shared/provider/CLI 调用方。formal-proof 的 model.ts 保留原公开导出，main.ts 实际接入新 model/graph/canvas owner；model-types/model-catalog/explorer-shell 中的原内容迁移、未改 stylesheet 与所有视觉值不能计为新原创。CASE 的 DFS 分配、review key `knorvia.conversation-state-space.review.v1`、导出 JSON 字段/文件名、全部选择/过滤/详情/缩放/适配/重置/导出控件是后续统一验收的兼容边界；本轮没有读取或写入真实浏览器 localStorage。

Web 先行规格见 [Web 启动/主题/平台契约](../specs/knorvia-next-integration-web-startup-20261003.md)，实现仅写 `packages/web/src/main.tsx`、`webBootstrap.ts`、`webStartup.ts`、`webThemeBootstrap.ts`、`webPlatform.ts`、`webAppViews.tsx`。main 按原次序执行 theme、root、稳定 stream client id、一次 plan/connect/platform/present；启动 frame 只管理该次交接，不持有第二业务状态。remote 不请求 server-info；本地 lookup/首 workspace 读取失败保留基础 /ws plan，不提前提交半份 workspace。原成功 JSX/错误 DOM、初始 Root 参数、平台 method/Promise/对象身份/通知/设备值及用户存储 key 保留。源码阅读发现并修正了 workspace getter 失败后的部分提交及设备 platform 读取顺序；没有把这些静态修正写成测试通过。

`webThemeSeed.ts` 保持 SHA-256 `b80b467134c7af134b33f1647f0459fdcab204cb5ce71311257f4a0bd6eb3b26`，继续委托 shared 唯一主题规范化，不另计模块。`perfStudioTimeline.tsx` 保持 SHA-256 `52ae56ea81995c705e98f075aa81e615e1b90636e450bd21f39446241fb5ff73`，保留 5edcf479c3f54e3d191812818804df399cbd739a 的 Knorvia 独立性能夹具与 HTML 入口，不因 saved upstream:null/review:null 再重复重写或推定权利。所有 Web HTML、CSS/品牌资产、Vite/env/package 配置保留；未编辑 shared/UI/client/server/native。theme seed 的原 upstream-modified/review:null、main predecessor 来源暴露、固定展示材料和所有原许可记录均保留，没有更改 global inventory/LICENSE/NOTICE。原分支通道恢复后完成普通提交/推送，远端 source SHA 已确认。

## 本轮跨路输入与 Registry 真正缺项

父任务报告 services 环境已恢复并在原 PR #16 交付：session lifecycle `4f9107d0a722830c54ac44127d8a3298aa4bd78d`、task-index projection `5b0b53522d235397cf435a627393c0bf5818d28c`、protocol cancellation `ab99bf38803664c9d77b7804e369d2cc65682389`，该轮 head `2f10641ad5cb503e24081ec3e42a62f72a9737f8`；继续 startup/commitMessageFileScope、creation/studio-runtime。整合者不接管 services 源文件。

CLI 本轮 head `a3540e4860c8e7a74af5bde1a4a89021a941509d`，源码三批为 TurnMachine `85d6b19e5fbbadb06eeb83aa2f161bbd87812769`、message projection `18f070df5c16f2d9cb44354277b392d5cff8b2f3`、argument/tool-rule `9681d95492b5abcc83dadccfc35af16f6ffae81b`。其 registry 新候选已归档、生产恢复 baseline；不把候选历史计作生产完成。

对 registry 的有限历史读取找到 `e972ca88b458787d59b31b914a73f32d0297f567` 提交的 `docs/knorvia-task-registry-root-review-20261002.md` / `docs/evidence/knorvia-task-registry-root-review-20261002.json`。这是**runtime fragment 推荐**，不是 integrated whole-file receipt：review input 是旧环境 `/tmp` 6097-byte fragment，SHA-256 `3f0420e83be7796d7c767112cc5f10ac3aa66d92e8fd6b91d08847502257eac4`，报告明确完整 integrated file/final digest 未提供，root 的其他接受结果只属 parent-reported。本轮没有执行其中历史 probes。

`12a18abdd47a1639a86726a92f7b9bf55227c8918109c3934b33925b066603e2` 的 reported whole-file receipt 路径 `licensing/evidence/contract-authored-task-registry-expression-20261002.json` 在六个已收 #7–12 完整 heads 中均不存在。当前已取得 refs 的该 source 路径历史只有 88001f027b04324f816176ff5f08b5d1a236f27f（ac09ec1b…）与 7619e41b950bd52073ebf36754146cf25659d9fa（7eb979b4…），没有精确 12a18abd… integrated bytes 的已发布 source commit。缺项是**原 root 发布对应完整源码提交和原 whole-file receipt**；fragment、旧 baseline 或 CLI 归档新候选都不能替代。保持原 HOLD，不从本地缺项推断从未存在，也不恢复旧 `/tmp` 或受限外部素材。

## Services 三个旧绑定的精确定位与可执行后续路线

父任务随后报告 services 到冻结实现边界，PR #16 head `549b8dbc76a6e359d4b7f9da5db65a367abe4f3e`，四个完整 owner 为 session/task-index/protocol/storageStartupGate，暂等历史证据，不重复重写。native PR #17 完成五批八个 desktop 候选的 head `642cf17e2501288bfee834daba54c1db64a4c1aa`，继续最后 exportLogs 与 lock/startupRecovery 是否仍有主体待替换的厘清。UI PR #15 活动 head `a91c4b745d6b00b40ab97350058e2654edb5f3c9`，七批后继续；这些均先保存父任务报告的完整 SHA，不提前合入或合 main。

有限读取所有已取得 refs 的三个 source 路径历史，并对所见 source 版本逐一求摘要，**不是运行 provenance gate/full audit**。三个请求的旧 source SHA-256 均未匹配；指定 receipt 路径在该保留历史中无提交。现有完整定位如下：

| services path（相对 packages/services/src） | requested historical digest / receipt                                                                                                               | 实际整合源与可见历史                                                                                                                                                                                                                                                                    |
| ------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| session/tasksDatabase/startup.ts            | `a45bd7f55dfe610e78b9314ba5807403cd1397c372a8cd2da81c50d8c961c58a`；`licensing/evidence/task-storage-preparation-expression-20261002.json`          | 当前 `d5cc1b688fa979534a1a4520e5813a98f84ed66ae8f8525c10371a5761c03fde`，source commit `805754face6bf038da0ddb308da1f9da508d11e0`；此前 `d62c610760f4b8ab8ff738b5ffc960a8ae615c9f`（7bc2a016…）与 snapshot 7619e41b…（a3a5e714…）                                                       |
| git/commitMessageFileScope.ts               | `ca5bf8cc6396ab43992806626efb6f5700524ec9b0c0b4a36f19090e6c8a6761`；`licensing/evidence/commit-message-scope-independent-replacement-20261001.json` | 当前 `f813e660387f81f205ad6adbf925f4ec09f5c2e903aedeae768c1977311a9d2e`，source commit `7619e41b950bd52073ebf36754146cf25659d9fa`；历史另有 `8c1e3f68ebb3acdc5ceb4f67beb310810cc0e497`，但 digest 为 b25ad115fa9776dec306bad84d071daa0bb84d855019951d6e0f4a3d47ad5f5c，不是请求的 ca5b… |
| creation/creationReference.ts               | `5a6716c314f943b7fe90e91e67c4d1a888efa28558849360114848ccd44bfb43`；`licensing/evidence/creation-reference-containment-20261001.json`               | 当前 `05cd4d5650393c7b3bfe605293776069b653603453fa3dd813f15bdc25cdd654`，source commit `63b4f9479ef91d79249feac1a2ae74e15a047901`；snapshot 7619e41b… 为 4349a388…                                                                                                                      |

旧绑定确实有记录，不能说“只有 HOLD、没有指针”：startup 的 `MIGRATIONS-EVIDENCE-20261002.md` / `MIGRATIONS-AUTHOR-RECEIPTS-20261002.json`、system/source-owner 及 repo receipts 明记 parent-provided binding only；commit scope 的 `AGENT-SESSION-QUEUE-INVENTORY-20261002.json#/holds/commitMessageFileScope` 给出 exact digest、blob `69e43f4ce19a30ea185ba99ffb284ac0d798c6f8` 和上述 receipt；creation 的 `SOURCE-ORIGIN-EVIDENCE-20261002.json#/parentProvidedBindings` / `SOURCE-ORIGIN-INVESTIGATION-20261002.md` 给出 exact digest/receipt、receiptAvailableInLane:false，并明确 containment fix 不等于 whole-file provenance。这个 scope blob 本地不存在；同仓库 GitHub `git/blobs/<exact blob>` 返回 HTTP 404，也没有下载或安装替代内容。不从公开缺项推断从未有未发布版本，不恢复旧 /tmp、受限素材或伪造 whole-file receipt。

可以消除对旧候选的**运行时依赖**：由原 services 任务按已公开的行为/API/spec 续作实际 pending owner，给新提交绑定新的真实 source-exposed authoring 记录。startup 的完整边界是检查/进度副本、mkdir/open、busy/foreign-key、同一一小时 deadline 的 busy-code-only 100ms retry、upgrade snapshot 在 WAL/BEGIN 前、migration 已提交事实、原异常/清理首因、mark migrated 后两 Repo 的 ensureReady/close、最后 prepared/ready；不能改变数据 schema/迁移 SQL 或把 storageStartupGate admission 计成 DB pipeline 已替换。commit scope 的边界是有效 session paths 为空返回 unbounded、trim/slash/root/workspace aliases、绝对路径只加入受控 repo/workspace relative aliases、三个 file path 字段任一匹配、保留文件顺序与对象身份、Windows/POSIX 原 path helper。creation reference 的边界是 project realpath containment 或 succeeded recorded output identity、10MB/nonempty/file/mime 准入、verified 上游 creation-output 身份和 recorded/hash/read-back 一致、派单前失败、原路径/base64/result/错误边界；最终还须落实已规格化的真实路径和 symlink/containment 安全规则。可以保留声明/固定值/标准 API 来源，但不能把新候选摘要写成上述旧摘要，也不能凭重写或新 receipt 清掉整文件权利的不确定性。整合者已读这些源码，不编辑 services 所有者；是否按这三个完整范围续派仍由父任务在原固定任务落实。

父任务后来已在原固定任务续派三个 services owner 和 Registry 新接纳路线，当前 #16 说明记录七个 services 与两个移交 UI 候选，#14 记录 Registry 生产接入 `105b1318464199e5492126984a0293599269f48d`。因此本节“是否续派”与 earlier frozen head 等待仅为当时交接状态，不是当前实现阻塞；旧源码/receipt 缺项与来源/权利 HOLD 保留。尚未合入的这些新候选也不计为本整合分支已经安装或验证完成。

## 最终统一执行队列：native 第一轮新增测试

输入冻结在 #17 的 `85ea4dcf9d0da20c14a487caaafc677a2f81f047`。仅通过 GitHub API 阅读文件和既有根 runner，**没有执行**。纳入最终统一验收的确切测试为 `packages/server-cli/test/control-transport-contract.test.mjs` 与 `packages/server-cli/test/status-persistence-contract.test.mjs`，各自同目录依赖 `control-transport-fixture.mjs` / `status-persistence-fixture.mjs`。控制用例覆盖 JSONL、连接隔离、请求/响应/error、客户端关联与关闭；持久化用例覆盖 phase/error identity、串行 write/rename、错误回调、lock release/strict freshness 与停止确认。

当前 `scripts/test-studio.mjs` 的 testDirectories **不含 packages/server-cli/test**。原固定 native 批次全部接收后，整合者在唯一根文件把该目录纳入统一发现；现在不能先登记尚未合入的缺失目录，因为 runner 无缺失目录跳过逻辑。按已读测试的 node:test 入口，也可在最终阶段明确执行 `node --test packages/server-cli/test/control-transport-contract.test.mjs packages/server-cli/test/status-persistence-contract.test.mjs`；这是未来命令规划，不是已运行记录。统一 root runner 的实际执行仍遵守最终阶段 CLI 构建/依赖前置条件，Linux/Windows 和真实 schema/OS transport/文件路径验收不能由这两个 fake-port fixture 代替。

CLI 报告的新增测试接收后由整合者在同一根 runner 加入 `apps/cli/packages/bootstrap/test/message-mapper-contract.test.ts` 与 `apps/cli/packages/cli/test/argument-admission-contract.test.ts` 的 explicitTests。`core/test/turn-machine-contract.test.ts` 和归档 registry 候选的 `runtime-task-registry-contract.test.ts` 已在现有目录发现范围，不重复显式加入。共 35 用例是 CLI 报告的场景数量，全部未执行；不以归档候选用例证明生产 registry 或 reported accepted bytes。

2026-10-03 06:31 UTC 只读 #14 当前发布记录补充的根 explicitTests 接纳请求共六条：上述 message/argument，再加 `apps/cli/packages/dynamic-workflow/test/ask-scheduler-contract.test.ts`、`apps/cli/packages/bootstrap/test/session-projection-contract.test.ts`、`apps/cli/packages/bootstrap/test/session-snapshot-images-contract.test.ts`、`apps/cli/packages/bootstrap/test/session-snapshot-contract.test.ts`。CLI 报告累计 76 场景，均未执行；生产 Registry 已按新授权接入，但不改变历史未取得的 accepted-byte/receipt 状态。#17 另报告 `packages/server-cli/test/lock-ownership-contract.test.mjs`；待完整原任务批次接收后，再按实际文件去重接入同一根 runner，现在不登记仍缺失的目录/源码，不运行 discovery 或测试。

## 用户要求的累计工程主观估计

现行口径采用父任务根据历史源码记录给出的 **约 75%（粗略区间 65%–80%）**，不是验收率；本整合者停止另外统计。以下保留先前较保守的整合者估计和所用权重，作为历史主观判断，不把两个不同历史范围的估计相加或视为新的审计结果。

先前按第一阶段安装基线 `3b1ff0f715a43cbc51c576fd524479a08e58e203` 及此前 main 的实际大项，整合者主观区间为 **约 55%–70%，误差约 ±10 个百分点**；当时未接入的四路新增 PR 没有计入。两个百分比都回答累计工程工作量，不是本轮 review 覆盖率、验证通过率、源码原创率、MIT 权利清理率或发布完成率。未为统计运行扫描或检查，也不以文件/行数、PR 个数、迁移标签作分母。

| 工作量权重（主观）            | 权重 | 判断依据                                                                                            |
| ----------------------------- | ---- | --------------------------------------------------------------------------------------------------- |
| CLI / 内核 / 工具 / workflow  | 35%  | main 历史与 #7、#8、#11 的大项已进入基线；运行时 reducer 等仍待完成                                 |
| native / desktop / transport  | 25%  | #9、#12 与旧 host/remote 候选已安装；跨端结合、真实 native/UI 路径仍待后期验收                      |
| services / provider           | 15%  | 历史 model/auth/storage 与 #10 已安装；sessionService/taskIndexSyncer 权利与完整 owner 对账尚未接受 |
| UI / web / renderer           | 20%  | 已有组件/启动/远程桥接成果；大量继承 UI 和所有候选的实际 cutover 是最大估计不确定性                 |
| shared / root build / release | 5%   | 已安装 shared assembly/projection 与本轮 contracts 候选；reducer、根来源/发行事项仍在队列           |

纳入判断的历史 main 提交为：auth `dac92ce60465f68c996e9e620b9d871369f971b6`、model `c60390b02ee8b377d830d8361b8c9394c4d4c345`、plugins source/storage `780d847c9a8d6eb7d4b01d22646e1cb1ecf28679`、command/discovery `c439b5d991e9e52f8da3e46ebda9cf869911ff74`、MCP `822cfeecd7add20499bff86d220bebb18ea57c5b`。这里引用其实际历史提交而不是用提交标题自行确认“独立”：既有来源资格、许可与不确定性继续照原记录保留。

## 实现阶段未执行项

上述实现阶段的测试、lint、类型检查、格式/架构检查、构建、完整审计和真实原生/UI/网络/用户数据操作均未运行。只有 Git/API/源码/配置/历史证据读取及授权的仓库提交/推送/PR 维护。现已按父任务明确通知进入最终集中阶段，具体新检查必须按真实命令与受检 SHA 另记，不能覆盖这些历史未运行事实。全局 reviews、根 LICENSE/NOTICE 和 CI 门禁继续保留；current-files 只按实际源与真实来源决定对齐，不声明全量 MIT。

## 最终集中验收首轮实际结果与修复交接

统一接收与 runner checkpoint 已发布为 `8b9113d97379ec2e7b1d80f9a4277b008d40441c`。首轮集中检查绑定该树；整合者类型/测试入口修复 source commit 为 `0f24d7907e47118e0988a0b080eb8aa9575e2cfe`。具体命令、真实退出码、诊断、源码摘要、scope 与未运行项见 [首轮结果 JSON](evidence/backlog-integration-20261003/final-first-pass.json)、[完整首轮类型日志](evidence/backlog-integration-20261003/final-first-typecheck.log.txt) 和 [格式失败路径](evidence/backlog-integration-20261003/final-first-format-paths.json)。首次 frozen 安装日志显示完成，终端 session 却返回 1，未把该退出码写成成功；固定工具版本及实际依赖可用性由后续检查实证，未重复空转安装。

首轮根 typecheck 返回 2，i18n 5422 键一致；85 条诊断去重为 72（shared 5、services 43、server 4、UI 2、desktop 18）。shared 与 contracts 的真实类型表达问题已修补并保留字段读取/顺序/身份，shared 单包类型复查返回 0。根检查尚未复跑或改为通过；services 七文件、native 的 desktop/server、UI 文件树和移交 CLI pane union 由父任务调度原路，整合者不越权接管。CLI 完整 build 首次停在 contracts，修复后 contracts 成功推进，第二轮停在 adapters/browser/index.ts:190 未赋值 admission 与 adapters/image/jimp-compression.ts:60 的 BufferSettings 类型；完整 dist 依赖未形成，所以 pnpm test:studio 与全 CLI typecheck 尚未运行，不能用部分 emit 或选定 tests 代替。

根 lint 返回 1，报告 241 errors/134 warnings；其中定位到的 222 项在历史 docs 证据，七份 desktop .test.mjs 行数，以及一份 licensing 冻结快照行数，另有未定位/重复诊断，原始冻结载荷未删改。根 fmt:check 返回 1，1955 个路径（apps 118、packages 157、docs 1097、licensing 559、specs 24），完整清单保留；没有全仓格式化旧证据、增加忽略或放宽门禁。修复的十三个当前 source/test 文件仅作定点格式化。全量 architecture 按未改策略返回 0，violations/baseline/new 均 0，不代表未管理模块或独立表达/权利已通过。CLI 现有 lint 命令返回 0、实际覆盖 100 文件；不扩称整个 CLI。

固定 Node 24.14.0/pnpm 10.33.2 下 Web build、formal-proof typecheck/lint/build、model-option-map typecheck、desktop build:no-runtime-assets 均返回 0。后者只证明 Main/Host/preload/renderer 源码 bundle，未准备或执行 runtime payload、安装版/便携版、实际 Electron/native UI。shared 九套原边界 tests 与 authority fixture 增加缺省本包 source root，仍保留显式旧根模式；48 场景全过，随后物理入口 native-resolve 修改的五个 authority/hook 场景也全过。均为虚拟端口，不声称实际用户数据/远控/UI验收。

补充定向回归沿用根隔离数据/凭据过滤、Node mocks、并发 2/120s 策略：server-cli 三套实际报告 14 tests、12 pass、2 fail；两项 lock fixture 在加载时因 Identifier port has already been declared 报错，未执行锁行为断言，交 native 原任务。CLI 六个显式文件和三个 core 文件报告 61 tests、60 pass、1 fail；session-projection-contract 文件因缺 core/dist/index.js 在用例前失败，其余 60 通过不构成完整 76 场景或全部 source/emitted 验收。没有重复全套检查或把未运行/夹具加载失败改成生产通过。

provenance:check 首轮返回 1，停在十二个 RPC third-party current inputs。逐项 source commits/旧 input/当前摘要/原分类与来源边界已在 [RPC 对齐记录](evidence/backlog-integration-20261003/rpc-input-reconciliation.json) 保存；只对齐该十二项当前候选字节，复制组件/未知原 import revision/原 Microsoft notice 与 MIT 适用部分、全部 source registers、26 项材料义务与权利 HOLD 不改。current-files 接下来按实际源和原 review 决定生成；未加 independent/MIT review 或清除 stale/conflict/HOLD。清单通过也不是全量 MIT 结论。

GitHub 在四个目标分支 merge 推送后显示 #14–17 为 closed，冻结 heads 仍完全相同，本整合者没有另行调用 close；原任务/分支保留，可继续推送修复的完整 SHA，再普通 merge 接收。唯一面向 main 的 #13 仍 open/draft，main 不动。再次断连提示到达时，实际命令仍成功；生产源码修复已提交，待提交仅这些真实诊断与清单对齐记录，没有丢失、重建任务/分支或频繁重试失败环境。当前明确 **不就绪合 main**：根代码/格式/lint/完整 CLI/regression 门禁及来源/产品边界尚有实质失败，先交父任务调度修复。

RPC 当前 input 对齐后，`pnpm provenance:report` 实际返回 0：当前清单 15597 项、reviewProblems 0、missingReviews 空；26 项未解决第三方材料仍保留，review 与 LICENSE/NOTICE 未改，没有将 unreviewed/候选/HOLD 改为独立接受或 MIT。新增本节/receipt 后再作最后一次 report/check 对账，清单一致性和原材料问题分开。整合者定点 lint 返回 0、报告实际 12 文件，CLI 路径仍受既有配置排除，不声称覆盖整个 contracts/CLI。所有原失败、源码修复摘要与 exact domain requests 已保存，可立即由父任务复用原四路调度。

## 根质量守卫、当前格式修复与材料分类

父任务将类型/构建修复交原四路，整合者继续根/共享独占范围，等待修复 heads 集中接收。根 source commit 为 `f453c0717fcecad07776b5de809697eb0ceff15f`。格式路径按冻结 lane 相对共同基线的真实 diff 分配，优先于目录猜测，完整文件归属见 [路径 JSON](final-format-ownership-20261003.json)：CLI 122、UI 67、services 28、native 38（含各路 docs/spec）；整合者 30、未由四路持有的顶层说明/spec 53，另有 1617 个冻结证据格式失败路径。该列表描述原首轮失败，不推断新修复 head 仍失败。所有 native 文件仍由原任务独占。

根 lint/fmt 现在先强制运行 `check-evidence-integrity`，对 `19f6ccf74ba1064ca81d93194b4f25a36030e361` 的 5493 个原 Git 文件、61318000 原字节逐一确认后才运行语言工具；这些数据目录在语言配置中明确交给完整性守卫。源文件、现行 tests、顶层说明/spec 仍受原规则；所有 CI 质量步骤与失败传播保留，没有自动刷新原证据、修改冻结 payload、放宽生产行数或消除来源 HOLD。补齐既有 test 行数例外对 .mjs 的覆盖，没有修改七份 native tests。

真实定向结果与 command/scope/log SHA 见 [根修复 receipt](root-quality-actions-20261003.json)：守卫 8 场景通过；4 个根文件加7个 native test 的11文件 lint 通过；30 个整合者源文件按原94规则、无忽略的临时定向配置 lint 通过；92 个指定路径格式检查通过。源文件 AST 结构、字面值及声明 flags 在去除纯分组/缩进节点后30个全部相同；首次辅助比较错误纳入完整 SourceFile.text 的文本差异已单独说明，不能误报为生产失败或运行时/类型/UI验收。原根全套失败保留，修复 heads 未收齐前不重跑全量类型/构建。

根 package current input 只因质量命令修改作精确摘要对齐，所有 dependencies/engine/packageManager/license 与其他字段完全不变。source registers、26 项材料、review、LICENSE/NOTICE 均不改；current-files 在这些新源/说明/receipt 确定后按真实模型生成。

[26项材料行动分类](material-obligation-actions-20261003.md)和[逐项 JSON](material-obligation-actions-20261003.json)绑定旧完整来源 checkpoint：15项需要原版本出版者版权/许可材料，3项需要实际平台构建/链接记录，8项需要原SVG来源或权利人授权。18项有保留独立第三方许可的路径；8项未确认素材继续保留现有UI字节及 HOLD。清单里没有已确认的自有源码重写项，这不是全仓独立性结论。固定上游候选图标别名不匹配，Rust/skill 的指定原地址返回404均保留为失败调查；没有授予未知资产许可、发送外部请求或关闭任何义务。根许可维持原状，不能全量 MIT。

## 四路最终修复与完整组合回归

四路最终冻结head按普通merge完整接收，接收checkpoint为 `d826add56755be673efd924b92cf24756af43d6d`；随后父任务授权的116路径纯格式修复与原字节保留发布为 `f5deb08595725c91d74ca96e09bba338fba1119d`。94源码语法/注释、12完整JSON/重复键结构、10Markdown格式变化均核对；原5524冻结记录不变，12JSON原字节另行保存。

这个f5deb085源码checkpoint的标准根types/lint/fmt/architecture/provenance与Web、desktop无runtime-assets源码构建退出0；lint保留1warning/0errors，i18n5422键一致，架构原managedOnly策略0violations。CLI实际构建退出2、完整CLI工作区no-bail types退出1，均为bootstrap5文件同一18条TS2322；14其他CLI包types通过。根cwd过滤误选0项目的退出0未接纳为通过。原CLI任务按父任务指令独占projection修复。

完整 `pnpm test:studio` 实际结束：777文件，8034 tests、8004 pass、22 fail、8 skipped、0cancelled，退出1，约437秒。17个CLI旧当前输入/产物pin加载失败、1个phase-fold历史NaN baseline、1个native导出、2个services、1个UI菜单。定向复现和嵌套子进程统计不累计进完整总数；不把阻止加载、跳过或原快照失败算通过。逐文件诊断、真实作用域及完整原日志见 [组合检查记录](./final-combined-checks-20261003.json) 与 `docs/evidence/final-combined-checks-20261003/`。

旧PR7–12再次核对head无变化；PR14–17的closed/merged快照保留初次接收head，而源分支最新head已逐项核对并作为后续修复完整合入。PR13仍draft、main仍 `bd0bb014c0974334557fa51814709d0b78f35f1d`。26材料义务及历史source/accepted-hash/权利HOLD不清除，全量MIT与实机/真实数据发布验收仍未完成。

## bootstrap类型阻塞后续解决

原CLI head `661e5f64bf819c93c13a7b077531239dec5199cf`（生产 `9e3bc5f81ad63d6112185cb7abc908ab9250ae2c`）普通merge `b5815bb4966e17ec5a515a0c7764ea41c511e666` 后，接收/来源checkpoint `b3721addfffb59ac56f8be9c13e6e5578e95a37d` 上实际完整CLI build退出0（17/17、13缓存），实际CLI cwd全工作区no-bail types退出0（15包脚本完成）。此前18条类型失败已由新的真实检查解除，旧原日志不变；原完整回归22失败不因此变成通过。新增5源码及原CLI doc/spec、接收记录的8路径fmt检查退出0。原字节验收/来源登记与新的完整CLI日志见 [后续组合记录](./final-bootstrap-combined-20261003.json)。

phase-fold case16的只读诊断中，old/current均为空结果且digest相同；原gold的null case15与NaN case16 digest相同却与live NaN不匹配。保留其历史binding失败，未改gold。services scan fixture仍覆盖不存在的实例private getNativeProjectsRoots，而新实现调用module nativeProjectRoots；这是需要重新绑定有意义临时根的测试问题，不恢复已退役私有实现来通过。其它native/services/UI真实断言与CLI当前输入/产物绑定继续按原所属路径推进。

## MIT 自有源码与实际发布内容的材料处置

父任务将22失败交回原四路，从 `7bfb867162cc11adbc237e1c39bf2d61b5c0f81e` 续作，整合者不编辑原路失败文件或重复全量。本次只补充 [26项发布边界矩阵](mit-release-boundaries-20261003.md) 与同名JSON，保留旧分类、所有原许可证/NOTICE、reviewRequired、历史golden/receipt/HOLD。

26项仍未闭项；10项直接涉及完整现行Git树（8个SVG、React skill、两Windows ripgrep ZIP中的同一缺notice Rust revision），11个npm是当前引用条件项，3个@arms未见当前manifest/lock且本机未安装，2个嵌入引擎项须看实际平台产物。Git跟踪18个搜索压缩包，所以完整源码树仍分发这些载荷。仅依赖引用不复制npm实现；不把缺第三方材料扩大成所有可能的自有源码子集都不能开源，也不把第三方非MIT当作自有实现必须重写的证据。

实际只读取得14份版本metadata及其压缩包：14份SHA-1/sha512与出版者一致、无独立license成员，11份archive SHA与旧记录相同；三@arms补到archive/GitHead仍无完整原notice。10次固定root LICENSE读取404保留，不能等同无许可。8个ripgrep压缩包只在内存读，确认缺Rust revision指向两个Windows ZIP，与原登记字节一致，路径字符串不是完整链接核验。20份新观察/response人工加入冻结登记，旧5574记录原字节与原行均保持。

26项内已确认因许可而需替换的自有源码为0，8素材只有拿不到原来源/授权时才进入独立素材路线，不删改现有UI。其外已精确列6个完整owner当前SHA/旧绑定，现行无whole-expression/权利接受，其他四路与整合者候选也继续保留source-exposed/适用许可边界。原作者看过源码本身不等于不可原创，但当前证据不能证明全量自有MIT接受。Apache许可允许满足原条件时分发并为自己的修改附不同条款，仍须保留适用上游许可、修改声明、归属/NOTICE与贡献条款；未改根LICENSE或自行接受缺证风险。

没有运行新的全量测试、lint、types、build或独立性审计，也未执行原生/npm载荷、安装脚本或发送外部消息。后续三路冻结heads先登记待接收：native `7096de3d170eea2267b82db47fb2e9140fdf7b08`、UI `d6274d61fe6d15b976f3b7b5b24f8e62d470229e`、services `f71dae4693f7886ef1fdddef7a0e94e5c8d1f532`，原路指定1/1、1/1、2/2结果是交付记录，须在统一Node24.14组合确认。CLI当前输入与历史NaN仍交原任务；main暂不合并。

## 三路定向失败修复的实际接收

在材料checkpoint `73e0687a78cc7354dfad0589a9e2ebedac159013` 后，先行规格提交 `080c28749c5df8f3647e8027d6a205c4991d8432`，再普通merge三个已冻结head。native `7096de3d170eea2267b82db47fb2e9140fdf7b08` 合并为 `99af83370ba5f80404d88941432d9147196f0e62`；UI `d6274d61fe6d15b976f3b7b5b24f8e62d470229e` 为 `688e8b525071a456c9a765e63a4367c15000790e`；services `f71dae4693f7886ef1fdddef7a0e94e5c8d1f532` 为 `7e01e67d23c7629dcc5f4df38bdf798201e7edf2`。三路都实际继承7bfb867，路径无交集，merge无冲突；没有重写、压缩、强推或覆盖原lane历史。

native生产修复ZIP stage遍历在叶子白名单前排除了诊断祖先目录；UI仅更正组内首项置顶no-op的局部场景，保留并加强原断言；services通过真实端口修正原目录夹具，Git helper恢复原timeout getters顺序。原native test/fixture、UI controller/golden、Claude排序/过滤/dirty-tail及Git次序断言保持。接收后的真实源码/7个原路新raw记录逐项与完整交付head一致，显式冻结；旧5594记录/字节保留，现5601文件。

完整输入、路径原字节及普通merge见 [接收JSON](final-three-failure-intake-20261003.json)。此接收记录尚未运行统一4个失败case；原native1/1、UI1/1、services2/2是交付结果，UI原Node24.19差异保留。组合checkpoint发布后使用本环境Node24.14，仅确认原4项，不重复777文件全量。CLI17个加载pin及NaN历史基线仍由原路处理，旧8034/22/8统计不变，不宣称新的完整通过。来源清单只刷新实际exporter/Git helper/夹具等候选身份，26材料及整文件权利HOLD不解除，main未合并。

### 三路组合的实际4项确认

已发布组合 `c576b3fa11fff052ae75c2e3b35119badf6be209` 上，使用官方Node24.14.0、原root tsx/module-mock/并发2/120s规则与隔离临时数据根，仅选原native/UI/services四个失败case。实际退出0：4 tests、4 pass、0 fail、0 skipped。native原测试assert仍检查5个ZIP成员；UI在此统一runtime确认局部夹具结果；services原扫描排序/过滤/脏尾和Git原getter顺序断言保留。source/fixture/golden未为结果再改动。

完整命令、原stdout/实际退出、当前源码原字节、原三head接收指针见 [定向组合JSON](final-three-failure-combined-20261003.json)，原日志与命令receipt新增2份冻结原件，旧5601份保持。Node输出为spec reporter，初始TAP-only统计解析留null；只对同一原log重新解析得4/4，没有重跑或变更原log。日志中的Claude坏JSON错误是原负向筛选场景，不是未记录的Node失败。

该4/4不能改写f5的完整8034/8004/22/8，CLI17个加载pin和1个NaN历史基线尚待原任务。没有重复全量或构建/全局types/lint/source-expression审计，只有已接收14路径format检查退出0与实际来源清单更新。26材料/自有整文件权利HOLD、许可/NOTICE、历史receipt/golden均保持，main未合并。

## 实际两平台 CI 与后续兼容修复边界

只读job API与原日志确认run `37110107123` 实际受检synthetic为 `d03df27e30768649c77d004092d7508fa8b9afbc`（7bfb867合入bd0bb01）：Linux8034 tests/8004 pass/22 fail/8 skipped，Windows8031/7990/40/1，两job均实际failure。此Windows40不能替代原f5 Linux22记录，也不能标为三路新组合的未修结论。

材料head73e0687的run `37111228357` 两job已cancelled；Linux在offline取消，Windows在lint取消、offline skipped。新组合c576b3fa的run `37111434878` 在本观察时两jobin-progress，Linux在offline、Windows在format。现有PR工作流并发cancel-in-progress策略可由后续推送替代中间run；取消/跳过都不是通过。完整源树/原job日志摘录/步骤snapshot与后续要求见 [两平台边界JSON](final-ci-platform-boundaries-20261003.json)，新增3原观察人工冻结。

父任务已把额外Windows18文件续派原CLI2/native4/services12，整合者只维护整合分支/根材料与接收记录，不编辑这些原路文件。等待CLI current input/NaN及兼容修复的完整head再统一Linux/Windows；当前4/4是Linux Node24.14定向检查，不能当Windows或全量通过。没有手动重跑旧CI或删除测试，根许可/26材料/当前候选表达与权利HOLD、旧原始证据保持，main继续暂缓。
