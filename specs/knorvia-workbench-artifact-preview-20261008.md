# 工作台每格并行产物预览

2026-10-08。延续 `knorvia-task-workbench-20261008.md`。用户要求：工作台每格同时展示聊天与该格 Agent 的产物，复用已有会话侧栏的网页渲染；例如多个 Agent 各自生成 HTML 鹈鹕动画，可以并排观看。每格可切换「聊天＋预览」「仅聊天」「仅预览」，保留原工作台的独立操作、拖边调尺寸和单格放大。原生终端切换不在范围内。

基线为 PR #50 候选 `59bef83d27c51ca0663be0f2dca4bc9b3bda4ba8`（0.11.0）。

## 产品规则

- 每格标题栏新增三态视图切换：聊天＋预览（默认）、仅聊天、仅预览。视图随布局持久化；未知值按默认处理。
- 「聊天＋预览」在格子宽度 ≥ 760px 时左右并排（聊天在左），更窄时上下排列；放大后同样适用。
- 切换视图与布局只改变显示，不卸载聊天：仅预览时聊天保持挂载（草稿、审批、自动刷新预览继续工作），仅聊天时已打开的网页保持挂载、仅从布局中隐藏。
- 预览内容只来自本格会话自己的产物，不读取其他格、其他会话或当前主聊天的状态：
  - **Knorvia 格**：沿用聊天里已有的网页预览卡片（最新完成轮次中被本会话改动过的 HTML 文件，以及 `localhost` 地址）。该轮卡片确认可见后自动在本格预览中打开最新一张；用户点击卡片或聊天中的本地网页链接也在本格预览打开（若处于「仅聊天」则切到「聊天＋预览」；自动打开不改变视图），其他外部链接仍由系统浏览器打开。
  - **外部内核格**（Codex、Claude Code 等）：取本会话最近一次已结束、带隔离工作区的运行，列出其中相对基线新增或修改的 `.html` / `.htm` 文件，默认打开 `index.html`，否则按路径排序的第一个；可在预览标题栏切换文件。运行中的任务不读取，结束后自动刷新。
- 渲染复用会话侧栏的网页视图（`UnifiedBrowserView`，桌面 `<webview>`），以「仅显示」模式运行：不向主进程登记为 Agent 可控的浏览器标签，不挂 CDP，不参与标签驻留/淘汰与重启恢复，不写入全局「网页显示偏好」设置。四格各自独立的视图互不影响。
- 无法渲染时明确说明，不回退到其他会话：Web 与手机远控（无内嵌浏览器）、SSH/远程或带工作区标识的项目、远端内核运行，在「仅预览」时显示「此环境暂不能在格子内预览网页」；「聊天＋预览」时不占用半格，聊天保持整格。
- 预览标题栏提供：文件名/标题、刷新、在系统浏览器打开（仅本地文件与 localhost）、外部内核的文件切换。

## 状态所有者与事件顺序

| 状态             | 唯一所有者                                                       | 说明                                                                             |
| ---------------- | ---------------------------------------------------------------- | -------------------------------------------------------------------------------- |
| 每格视图（三态） | 工作台 store（`WorkbenchTile.view`）                             | 随布局持久化，`decodeWorkbench` 严格校验                                         |
| 每格当前预览地址 | 渲染进程内存中的预览 store，按 tile 键控                         | 不持久化；绑定 `kernel:sessionId`，会话换代或 Host 未核对时清空                  |
| Knorvia 产物来源 | 既有预览卡片管线（SessionPane 行上下文）                         | 新增可选回调，只有工作台显式传入，常规聊天默认值不变                             |
| 外部内核产物来源 | StudioRuntimeService `workspaceChanges({ artifactsOnly: true })` | 只读：不加项目锁、不执行应用恢复、不读取文件内容，只返回本次运行改动的 HTML 路径 |
| 网页渲染         | `UnifiedBrowserView` 仅显示模式                                  | 不 attach/residency 上报                                                         |

```text
Knorvia：轮次完成 → 预览卡片校验可见 → onAutoOpenAssistantWebsite(key=行ID+地址, 去重)
        → 预览 store.set(tile, binding, url) → 本格 WorkbenchPreview 导航
外部：timeline 中最近已结束且含隔离步骤的运行变化 → workspaceChanges({ runId, stepId, artifactsOnly: true })
      → 回执时复核 tile 绑定未变 → 预览 store.set → 导航
会话换代 / Host 未核对 / 格子关闭 → 预览 store.clear(tile)
```

迟到回执（请求发出后格子换了会话、内核或 Host）一律丢弃。契约公开方法上限为 12，因此不新增 RPC，而是给既有 `workspaceChanges` 增加显式的只读请求模式，返回项以 `previewPath` 携带本机绝对路径、不含文件内容。`artifactsOnly` 请求拒绝运行中的运行与不存在的隔离工作区，远端内核运行明确报不支持；返回的绝对路径必须位于该运行的隔离工作副本内。

## 验收

- 视图三态切换、持久化与非法值回退；四格各自预览不同会话的 HTML，互不串扰。
- 仅预览时聊天仍挂载；仅聊天时网页不被卸载；放大/拖边后预览随格子尺寸变化。
- Knorvia 自动打开只发生一次/轮，跨会话不串；非本地链接不进入格子预览。
- 外部内核：运行中不读取；结束后列出新增/修改的 HTML，默认 `index.html`；迟到回执被丢弃；远端与共享模式明确说明。
- 仅显示模式不调用 `browserViewAttachGuest` / `browserViewReportResidency`。
- typecheck、lint、fmt、架构、来源清单与全量离线测试；桌面实机多格并排观看需在 Windows 上复核。

## 实现与验证记录（2026-10-08）

- 服务：`workspaceManager.artifacts` 只读扫描隔离副本；`listStudioWorkspaceArtifacts` 拒绝运行中与远端运行、不检查同项目其他活动任务；经既有 `workspaceChanges({ artifactsOnly: true })` 暴露（契约仍为 12 个公开方法）。`StudioRuntimeDependencies` 移入 `runtimeDependencies.ts` 以保持服务文件行数门禁。
- 渲染：`UnifiedBrowserView` 新增 `displayOnly`，跳过 `browserViewAttachGuest` / `browserViewReportResidency` 与元素拾取；导航仍由渲染进程 `loadURL` 完成。
- 界面：`WorkbenchTileBody`（三态切换与布局）、`WorkbenchPreview`、`workbenchPreviewStore`、`useWorkbenchArtifacts`；Knorvia 经 `SessionPane.onAutoOpenAssistantWebsite` 与格内 `onOpenBrowserUrl`。
- 测试：`packages/services/test/studio-workbench-artifacts.test.ts`、`packages/ui/test/workbench-artifact-preview.test.ts`；Chromium 工作台冒烟新增第九组（`scripts/task-workbench-preview-evidence.mjs`），原八组全部通过。
- 未覆盖：Chromium 无 `<webview>`，桌面格内网页渲染与多格并排观看需在 Windows/Linux 安装包上实机复核；本地无 Electron。
