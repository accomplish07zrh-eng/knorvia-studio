# packages-02 调用方

生成方式（仓库根目录，2026-10-19）：`grep -rl` 统计 `packages/**`、`apps/**` 下
`*.ts` / `*.tsx` / `*.mjs` / `*.js` 中对包名的静态 import。替换阶段不得改变这些路径的导入结果。

## 一、`@knorvia/rpc`（121 个文件）

| 工作区                | 文件数 |
| --------------------- | -----: |
| `packages/services`   |     79 |
| `packages/desktop`    |     15 |
| `packages/server`     |     12 |
| `packages/ui`         |      9 |
| `packages/server-cli` |      3 |
| `packages/client`     |      3 |

<details>
<summary>全量清单</summary>

- `packages/client/src/messageport.ts`
- `packages/client/src/remoteServiceAccess.ts`
- `packages/client/src/websocket.ts`
- `packages/desktop/src/host/electronPort.ts`
- `packages/desktop/src/host/hostAgentResourceTelemetry.ts`
- `packages/desktop/src/host/hostMcpResourceTelemetry.ts`
- `packages/desktop/src/host/hostMcpTelemetry.ts`
- `packages/desktop/src/host/hostNetworkTelemetry.ts`
- `packages/desktop/src/host/hostRemoteWorkspaceProxyState.ts`
- `packages/desktop/src/host/hostServiceResourceTelemetry.ts`
- `packages/desktop/src/host/hostToolExecResourceTelemetry.ts`
- `packages/desktop/src/host/index.ts`
- `packages/desktop/src/host/indexOwner.ports-fixture.mjs`
- `packages/desktop/src/host/promptAttachmentTransferService.ts`
- `packages/desktop/src/main/desktopNetworkTelemetry.ts`
- `packages/desktop/src/main/networkTelemetryAggregator.ts`
- `packages/desktop/test/studio-workflow-schedule.test.ts`
- `packages/desktop/tsup.config.ts`
- `packages/server-cli/src/server-core/http.ts`
- `packages/server-cli/src/server-core/taskActivityTracker.ts`
- `packages/server-cli/tsup.config.ts`
- `packages/server/src/http.ts`
- `packages/server/src/remote/backend.ts`
- `packages/server/src/remote/closeEvent.ts`
- `packages/server/src/remote/connect.ts`
- `packages/server/src/remote/ssh-backend.ts`
- `packages/server/src/remote/stdio-socket.ts`
- `packages/server/src/stdio.ts`
- `packages/server/test/connect-launch-authority-safety.test.mjs`
- `packages/server/test/http-window-controller-contract-20261003.test.ts`
- `packages/server/test/lifecycle-injected-compatibility.test.mjs`
- `packages/server/test/ssh-backend-authorization-target-safety.test.mjs`
- `packages/server/tsup.config.ts`
- `packages/services/src/agent/agent.ts`
- `packages/services/src/agent/agentConnectionScope.ts`
- `packages/services/src/agent/agentProcessManager.ts`
- `packages/services/src/agent/agentService.ts`
- `packages/services/src/agent/protocolClient.ts`
- `packages/services/src/agent/protocolTransport.ts`
- `packages/services/src/agent/stdioTransport.ts`
- `packages/services/src/agent/storageStartupGate.ts`
- `packages/services/src/agent/taskIndexSyncer.ts`
- `packages/services/src/agent/taskServiceAdapter.ts`
- `packages/services/src/broadcast/broadcast.ts`
- `packages/services/src/broadcast/broadcastService.ts`
- `packages/services/src/collection.ts`
- `packages/services/src/conversation-telemetry/conversationTelemetry.ts`
- `packages/services/src/fileWatcher/fileWatcher.ts`
- `packages/services/src/fileWatcher/fileWatcherRuntime.ts`
- `packages/services/src/fileWatcher/fileWatcherService.ts`
- `packages/services/src/memoryDiagnostics.ts`
- `packages/services/src/model-provider/providerFacadeServices.ts`
- `packages/services/src/plugins/pluginManagement.ts`
- `packages/services/src/prompt-attachment-transfer/promptAttachmentTransfer.ts`
- `packages/services/src/prompt-attachment-transfer/promptAttachmentTransferService.ts`
- `packages/services/src/session/taskService.ts`
- `packages/services/src/storage/app/storageService.ts`
- `packages/services/src/storage/contract.ts`
- `packages/services/src/studio-runtime/adapters/builtinKernel.ts`
- `packages/services/src/studio-runtime/app/runtimeDependencies.ts`
- `packages/services/src/studio-runtime/app/studioRuntimeService.ts`
- `packages/services/src/studio-runtime/contract.ts`
- `packages/services/src/studio-runtime/node.ts`
- `packages/services/src/terminal/terminal.ts`
- `packages/services/src/terminal/terminalService.ts`
- `packages/services/src/terminal/terminalServiceInstanceOwner.ts`
- `packages/services/src/window-controller/windowController.ts`
- `packages/services/src/window-controller/windowHostControllerService.ts`
- `packages/services/src/window-controller/windowHostSessionsIndexObserver.ts`
- `packages/services/test/agent-stdio-fake-authority-20261003.test.ts`
- `packages/services/test/feedback-archive-emitted-register-fast-20261001.mjs`
- `packages/services/test/file-watcher-contract-fast-20261001.test.ts`
- `packages/services/test/file-watcher-emitted-register-fast-20261001.mjs`
- `packages/services/test/file-watcher-native-fast-20261001.test.ts`
- `packages/services/test/fixtures/studio-attention-browser.ts`
- `packages/services/test/fixtures/studio-image-browser.ts`
- `packages/services/test/fixtures/studio-rpc.integration.ts`
- `packages/services/test/git-graph-query-fixture-fast-20261001.ts`
- `packages/services/test/git-read-projection-emitted-register-fast-20261001.mjs`
- `packages/services/test/git-read-projection-fixture-fast-20261001.ts`
- `packages/services/test/local-attachment-fake-authority-20261003.test.ts`
- `packages/services/test/mobileHostProtocol.test.ts`
- `packages/services/test/service-collection-fake-authority-20261003.test.ts`
- `packages/services/test/studio-agent-tools.fixture.ts`
- `packages/services/test/studio-attention-inbox.test.ts`
- `packages/services/test/studio-feedback-admission-review.test.ts`
- `packages/services/test/studio-image-admission-rpc.integration.test.ts`
- `packages/services/test/studio-image-compare-messageport.integration.test.ts`
- `packages/services/test/studio-image-compare-rpc.integration.test.ts`
- `packages/services/test/studio-image-input.test.ts`
- `packages/services/test/studio-image-rpc.integration.test.ts`
- `packages/services/test/studio-kernel-expansion.test.ts`
- `packages/services/test/studio-native-image-combination.integration.test.ts`
- `packages/services/test/studio-remote-admission.test.ts`
- `packages/services/test/studio-review-attention-integration.test.ts`
- `packages/services/test/studio-runtime-barriers.test.ts`
- `packages/services/test/studio-runtime-lifecycle.test.ts`
- `packages/services/test/studio-runtime.test.ts`
- `packages/services/test/studio-ssh-local-regression.test.ts`
- `packages/services/test/studio-workflow-delivery-path.test.ts`
- `packages/services/test/studio-workflow-file-handoff.test.ts`
- `packages/services/test/studio-workflow-media-loopback.test.ts`
- `packages/services/test/studio-workflow-outcomes.test.ts`
- `packages/services/test/studio-workflow-output-production.test.ts`
- `packages/services/test/studio-workspace-feedback-fixture.ts`
- `packages/services/test/studio-workspace-feedback.test.ts`
- `packages/services/test/task-index-workspace-contract-20261003.test.ts`
- `packages/services/test/terminal-lifecycle-corrective-fast-20261001.test.ts`
- `packages/services/test/terminal-lifecycle-fixture-fast-20261001.ts`
- `packages/services/test/terminal-lifecycle-monitor-ports-fast-20261001.ts`
- `packages/services/test/terminal-lifecycle-rpc-fast-20261001.test.ts`
- `packages/services/test/terminal-profile-portable-emitted-register-fast-20261001.mjs`
- `packages/ui/src/hooks/useFileWatcherService.ts`
- `packages/ui/src/hooks/useGitAutoRefresh.ts`
- `packages/ui/src/hooks/usePptxFileWatch.ts`
- `packages/ui/src/hooks/useTerminalService.ts`
- `packages/ui/src/hooks/useWorkspaceServices.tsx`
- `packages/ui/src/terminal/TerminalSession.tsx`
- `packages/ui/src/v4/attachmentUploadTransaction.ts`
- `packages/ui/src/v4/useWorkspaceSessionsIndexItems.ts`
- `packages/ui/src/workspace-file-tree/types.ts`

</details>

## 二、`@knorvia/provider-node`（7 个文件）

| 文件                                                                       | 消费内容                                         |
| -------------------------------------------------------------------------- | ------------------------------------------------ |
| `apps/cli/packages/bootstrap/src/app/process-provider-registry-runtime.ts` | `createNodeProviderRegistryRuntime` 等运行时装配 |
| `apps/cli/packages/bootstrap/src/protocol-entrypoint.ts`                   | `createNodeModelSelectionFacade`                 |
| `apps/cli/packages/cli/src/provider-runtime-env.ts`                        | 运行时路径/环境变量常量                          |
| `packages/services/src/model-provider/providerConfigRuntime.ts`            | config runtime 类型与工厂                        |
| `packages/services/src/model-provider/providerRuntime.ts`                  | registry runtime 类型与工厂                      |
| `packages/services/src/node.ts`                                            | 两处 re-export（provider-node 公开类型）         |
| `packages/desktop/tsup.config.ts`                                          | 打包外部化匹配                                   |

## 三、跨包依赖边界

- `packages/provider-node` 依赖 `@knorvia/provider`、`@knorvia/shared` 的公开入口；
  `packages-02` 不修改这两个包，也不从它们的内部路径导入（合同测试同样只走公开入口）。
- `packages/rpc` 无工作区依赖，仅依赖 Node 内置模块与 DOM 类型。
- 调用方按包入口导入；替换阶段不得要求调用方改 import 路径。
