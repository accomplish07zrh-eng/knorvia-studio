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

旧 PR #7–12 的已收完整 heads 继续按 [第一阶段记录](knorvia-backlog-integration-20261003.md) 保存。本轮复读仍为同一组 heads。旧 PR 后续有更新只追加记录新 SHA、时间和范围，**不自动合入、不追赶、不覆盖四路固定任务的活动源码**。

新的四路 PR 在各自批次完成后由父任务通知统一接收。来源分支固定，完整 head 必须记录。接收时继续维护 integration/backlog-20261003，用 merge 保留历史，不 cherry-pick 已收提交、force-push 或重建分支。被拒绝/未安装的候选、原错误与未运行验证不改写成通过。

## 整合者范围的实现筛选

已阅读的 shared assembly/projection 当前源码由 #9 的 `7caec377c3b6aace6f9a08344d77497726459eb2` 后续完整候选更新；虽然 saved inventory 仍标原 upstream-unchanged，当前 digest 已不同且完整 packet/receipt 已在基线。保留 wire-assembler、workflow-runs-artifacts、conversation-message-projection-policy、session-visible-content、tool-plan-adapter；不据陈旧 inventory 再重写一遍。

coding-plan-subscription.ts 是集中协议类型/固定常量，没有可独立计数的运行时 owner，保留原 API 和来源，不为独立数量重排字段。workflow-runs-reducer.ts 当前 `f07e531f2dc425d701ce538f0a74c865f6658a99acc9c22ff68d67a6cfef11e6` 仍有历史 WIP/accepted-binding HOLD；先保留精确事实，不能冒充恢复旧 accepted artifact。其他候选需读当前 contract、调用方与完整历史记录，先写 spec，再以新实现替换真正待完成的 owner；全局许可决定与最终核验留在后续阶段。

## 本轮未执行项

测试、lint、类型检查、格式/架构检查、构建、完整审计和真实原生/UI/网络/用户数据操作均未运行。只有 Git/API/源码/配置/历史证据读取及授权的仓库提交/推送/PR 维护。全局 reviews/current-files、根 LICENSE/NOTICE 和 CI 门禁继续保留，不声明通过或全量 MIT。
