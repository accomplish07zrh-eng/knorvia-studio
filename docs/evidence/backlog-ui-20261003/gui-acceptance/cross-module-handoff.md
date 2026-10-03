# 实际 GUI 阻塞的精确交接

观察与源码基线为 `59517d9699519b0a7a44980da27df29d45f0e91e`，UI 后续批次在原
`rewrite/ui-20261003`、[draft PR22](https://github.com/accomplish07zrh-eng/knorvia-studio/pull/22)。
父任务最新 main `345a5a8698efec4f216e4118275214f25fdbd96b` 已观察；本路没有合并它，
该段 main 的 UI 源码差异为空。以下路径/行号按本路源码记录，不代表其他路尚未交接的修改。
实际 desktop renderer 为 `packages/desktop/src/renderer/**`，不是 `apps/desktop/**`。

## Web Controller 装配：交父任务

复现：用实际 `createLocalServices` 和 `createHttpServer`、两个带合成标记的本地
workspace，冷开实际 WebRoot。普通 workspace TaskMeta 行可见，Controller 的
workspaces/tasks 订阅与全局 pinned 查询均返回
`Unknown channel: Channel name 'window-controller' timed out after 1000ms`。
原记录在 [web-restart-results.json](web-restart-results.json)，本次 Hook 修复后仍有相同
Controller 错误，见 [web-workspace-service-startup-results.json](web-workspace-service-startup-results.json)。

| 环节 | 精确入口 |
| --- | --- |
| Web 连接 | `packages/web/src/main.tsx:16` 的 `startWebApp` 调 `connectViaWebSocket` |
| Client proxy | `packages/client/src/remoteServiceAccess.ts:123` 无条件创建 `IWindowControllerService` proxy |
| 描述符 | `packages/services/src/window-controller/windowController.ts:69` 使用 `ServiceChannels.WindowController` |
| UI 订阅/查询 | `packages/ui/src/v4/windowControllerTaskListRegistry.ts:189` 的 `subscribeControllerV4`、`:222` 的 `listTaskList`；`hooks/useGlobalTaskList.ts` 从 base controller 取 pinned |
| HTTP 入口 | `packages/server/src/entry-http.ts:19` 的 `createLocalServices`；`http.ts:105` 的 `connectChannels` 只加 Agent connection scope override，`:119` 暴露 collection |
| 注册表 | `packages/services/src/collection.ts:24` 的 `exposeOnChannelServer` 只遍历已注册 descriptor；当前 `services/src/node.ts` 未注册 Controller |
| 已有 desktop owner | `packages/desktop/src/host/index.ts:892` 注册 `controller.service`，`:893` 创建 attachment，`:895` 使用 connection override；实现入口 `host/windowHostControllerService.ts:588` |

可分配范围为 server/Controller canonical owner 装配及 connection attachment 生命周期；
应先确定是否复用/下移既有 owner 的公共入口，由父任务协调 native 与服务边界。
本路不复制 desktop owner、不加 UI fallback，也不修改 shared/CLI contracts 或根配置。
当前证据只覆盖上述源码 HTTP 工厂场景，桌面 relay 场景未具备运行条件。

## Onboarding：本路已修复，范围保留在 UI

原错误可由带既有合成 tab 的 browser profile 冷启动触发，error boundary 捕获后
`pageerror` 可以为空。准确链为 `Root.tsx:802` 将 `workspaceShellPath || undefined`
传入 `onboarding/OnboardingDialog.tsx:60` 的 `useSettingsSync`，后者调用
`hooks/useSessionService.ts`；另一链是同 dialog 的 `useClaudeSessionMigration`
调用 `hooks/useTaskService.ts`。两个 hook 原先按路径真假调用 `useServices` 或
`useWorkspaceServices`，后者进入 tab/remote store hook 链。恢复路径时 hook 顺序改变，
出现 React hook order warning 与 `areHookInputsEqual` TypeError。`useAgentService` 有同型结构。

本路只在 `hooks/useWorkspaceServices.tsx` 增加共同入口，始终先读原 context 和原
workspace resolver，再选 accessor；三 hook 无条件调用它。无 path 仍返回当前
ServiceProvider，path/identity/remoteSession 仍经原 resolver；task proxy/cache 未改。
接受真实冷启动、两项目草稿切换与 renderer reload，监测 console 和 caught boundary，
Hook 错误为零；Controller 错误仍完整保留。规格见
[knorvia-ui-workspace-service-hooks-20261003.md](../../../../specs/knorvia-ui-workspace-service-hooks-20261003.md)，
字节/运行绑定见 [workspace-service-hook-fix.json](workspace-service-hook-fix.json)。

项目行是 CollapsibleTrigger，已展开时点击只收起；浏览器用例现改用原 New task
按钮明确导航目标草稿。此前普通草稿失败是输入时序错误，本次脚本超时是错误选择了
展开按钮，两者均不列为产品 bug。没有改 UI、持久化、草稿语义或掩盖已知服务错误。

## 子进程清理：交父任务 native/services

原 Host PID 14567、托管 CLI 根 PID 17547；SIGTERM 后清理重试仍报告 PID 17570，
Host exit 1。当时 `/proc/17570/status` 是 esbuild、`State: Z`、`PPid: 1`，见
[shutdown-failure.json](shutdown-failure.json)。后续 Host PID 19760 和新 browser 恢复数据
已通过，不能据此宣称 graceful shutdown 通过。

| 调用链 | 精确入口 |
| --- | --- |
| Host dispose | `packages/services/src/node.ts:1999` 的 `disposeServiceResourcesAndWait` 逐服务 await |
| Agent dispose | `agent/agentService.ts:4905` 的 `disposeAllAndWait` 调 process managers |
| Manager snapshot/retry | `agent/agentProcessManager.ts:1449` 的 `disposeAllAndWait` → `:786` 的 `cleanupManagedProcessForShutdown` → `:797` 的 `cleanupManagedProcessWithRetry` → `cleanupManagedProcess` |
| Transport | `agent/protocolClient.ts:163` 的 `disposeAndWait` → `agent/stdioTransport.ts:275` await terminator、drain 后 `:282` 对 remainingPids 抛错 |
| Ownership/termination | `process/processTreeTerminator.ts:287` 的 `terminateProcessTreeAndWait` → `:322` 的 `waitForProcessTreeTermination`；ownership/identity 入口在 `process/processTreeOwnership.ts` |
| 终止观察 | `process/processTreeWaiter.ts:72` 的 `alive(pid)` 用 `process.kill(pid, 0)`；`:122` 的 `collectRemaining` 通过该判定筛 remaining |

事实是 zombie 仍被记录为 remaining，尚不能从这一例认定全部成因或平台统一政策。
请由 native/services owner 检查已验证身份、进程 dead-state 与 deadline/retry 契约，
然后修复并作有限复验；不能把所有 remaining 直接当成功，也不能误杀其他进程。
本路没有修改这些文件、杀 PID1、改变系统 reaping 或运行用户电脑进程。

Agent runtime 构建产物仍缺，`KNORVIA_AGENT_RUNTIME_UNAVAILABLE` 阻止真实历史/执行/续接
验收；完整主题、Electron 及当前 Windows/macOS 安装/升级也仍未验证。
本记录不改变 source-exposed / Apache-2.0 过渡与 MIT 权利未决结论。
