# kernel-bridge-legacy 调用方

`pnpm dep:refs --list-exports` 与源码扫描的结果。本包不新增公开模块，调用方 = 既有旧协议面的所有消费方。

## 一、Host 侧消费（`packages/services/**`）

实测（`526825db`）：`packages/services/src/agent/**` 引用 `knorviaProtocolMethods` 的键 **63 个**，其中

- **61 个客户端方向方法**（由 Host 作为客户端向 CLI 发请求）：
  `runtimeCapabilities`、`processChildProcesses`、`sessionCreate`、`sessionResume`、`sessionList`、`sessionSubagents`、`sessionRead`、`sessionMessages`、`sessionEvents`、`sessionDebug`、`sessionSubscribe`、`sessionSend`、`sessionClose`、`sessionCompact`、`sessionGoal`、`sessionSetModel`、`sessionSetThoughtLevel`、`sessionSetMode`、`workspaceReadPresentation`、`workspaceHookTrustGrant`、`workspaceUpdateInteractionPreferences`、`workspaceUpdateModelIoPreferences`、`workspaceUpdateDynamicWorkflowPolicy`、`workspaceGenerateText`、`workspaceCancelGenerateText`、`providerTestModelConnectivity`、`mcpList`、`pluginsList`、`pluginsReferenceCatalog`、`pluginsReferenceCatalogWithCategory`、`pluginsResolveSuggestedReference`、`pluginsSetEnabled`、`pluginsOverview`、`pluginsMarketplaceAdd`、`pluginsMarketplaceRemove`、`pluginsMarketplaceUpdate`、`pluginsInstall`、`pluginsCancelOperation`、`pluginsUninstall`、`pluginsUpdate`、`pluginsRestoreBuiltin`、`pluginsConfigure`、`pluginsResetConfig`、`pluginsValidate`、`pluginsDescribe`、`skillsReferenceCatalog`、`workflowsList`、`workflowsGet`、`workflowsUpdateMeta`、`workflowsDelete`、`workflowsRuns`、`workflowsMove`、`automationCreate`、`automationUpdate`、`automationCheckTaskBinding`、`automationList`、`automationDelete`、`offPeakCreate`、`offPeakList`、`interactionRequestPermission`、`interactionRequestUserInput`、`interactionBrowserList`、`interactionBrowserExecute`
  （其中 `automation*`、`offPeak*`、`interaction*` 由 CLI 侧发起、Host 侧应答，见 §二）
- **1 个反向请求**：`sessionRequestRuntimePreferences`（CLI 发起、Host 应答）
- **1 个借名通知**：`computerUseOperationEvent`

**未被 Host 引用的客户端方向方法**（Host 已有 v4 替代路径或已弃用；协议面仍须实现）：

| 方法                                                           | 现状                                                                                    |
| -------------------------------------------------------------- | --------------------------------------------------------------------------------------- |
| `usage/stats`、`session/usage`                                 | `@deprecated`（Host 已改走 `v4/usage/stats` 与 `v4/conversation/usage`）；wire 兼容保留 |
| `workspace/updateOffPeakToolPolicy`                            | Host 不再下发（Off-Peak 门禁改由 create/resume 的 `offPeakToolEnabled` 携带）           |
| `session/stop`、`session/cancelBackgroundTask`、`session/fork` | Host 已收敛到 v4 命令（`stop`、`cancelBackgroundWork`、`forkAssistant`）；wire 兼容保留 |

以上四类由 behavior B5 用 `outcome: "either"` 覆盖（必须被应答，但不要求成功）。

## 二、CLI 侧发起（本包要写的方向）

`apps/cli/packages/bootstrap/src/protocol/**` 现有发起点（实现阶段要按同一方向、同一语义重建）：

| 发起方法                                                | 旧实现位置                                                   | 语义                                                         |
| ------------------------------------------------------- | ------------------------------------------------------------ | ------------------------------------------------------------ | ---- | ------- | -------------------- | ---------- |
| `session/requestRuntimePreferences`                     | `server-operations.ts`（`requestSessionRuntimePreferences`） | 会话物化前取 Host 侧运行时偏好；15 s 超时                    |
| `interaction/requestPermission`                         | `interaction-broker.ts`                                      | 权限交互；支持 v4 竞速与重发现                               |
| `interaction/requestUserInput`                          | `interaction-broker.ts`                                      | AskUserQuestion 与 Plan 审批                                 |
| `interaction/requestProviderRuntimeHeaders`             | `provider-runtime-headers.ts`                                | 按请求获取供应商凭据；180 s 总时限；中止/超时发取消通知      |
| `interaction/browserList`、`interaction/browserExecute` | `browser-request-channel.ts`                                 | 浏览器反控                                                   |
| `automation/create                                      | update                                                       | checkTaskBinding                                             | list | delete` | `automation-port.ts` | 自动化中枢 |
| `offPeak/create`、`offPeak/list`                        | `offpeak-port.ts`                                            | Off-Peak 任务                                                |
| `interaction/requestOfficialMcpAuthHeaders`             | 无既有调用点（老版本遗留）                                   | 协议面保留；实现阶段按同一反向请求语义提供，无调用方即无流量 |

## 三、发送通知（本包要写的方向）

| 通知                                          | 旧触发点                                      |
| --------------------------------------------- | --------------------------------------------- |
| `startup/storageState`                        | `protocol/storage-startup.ts`（旧运行时迁移） |
| `interaction/providerRuntimeHeadersCancelled` | `provider-runtime-headers.ts`（中止/超时）    |
| `process/mcpTelemetry`                        | `protocol-entrypoint.ts`                      |
| `process/mcpResourceSamples`                  | `protocol-entrypoint.ts`                      |
| `process/toolExecResource`                    | `protocol-entrypoint.ts`                      |
| `process/resourceSample`                      | `protocol/resource-sampler.ts`                |
| `plugins/operationProgress`                   | `plugin-reference-catalog.ts`                 |
| `computer-use/operation-event`（借方法名）    | `server-operations.ts`                        |

## 四、跨进程边界

- **Host 进程**（`packages/desktop`、`packages/server`、`packages/services`）：通过 stdio NDJSON 与本包通信，代码不变。
- **Renderer**：经 Host 间接消费，不直连 CLI。
- **外部内核（ACP）**：另一条链路，不经本包。
- **`packages/client`**：SDK 包装，不直连本包。

## 五、测试引用

- `specs/contracts/kernel-bridge-legacy/tests/**`：本包契约测试（黑盒，只走 NDJSON）。
- `specs/contracts/kernel-bridge-01/tests/**`：v4 面契约；实现阶段一并复跑（本包不改 v4 面）。
- `specs/contracts/kernel-dsh-00/tests/engine-selection.test.mjs`：引擎选择；继续通过。
