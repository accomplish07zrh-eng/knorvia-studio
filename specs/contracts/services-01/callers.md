# services-01 调用面（callers）

范围 60 个继承文件（58 个 `.ts` + 2 份 `.md` 文档）现在被谁、从哪里、以什么方式调用。
这一节是重写阶段的**改动半径依据**：兼容面不变的前提下，只有这里列出的调用方会感知本包的变化。

## 一、口径与复现

三条互补通道，全部只读静态扫描，不执行被测代码：

| 通道 | 问题                                       | 命令                                                                                          |
| ---- | ------------------------------------------ | --------------------------------------------------------------------------------------------- |
| A    | 非范围文件按**路径**直接 import 范围文件   | `node specs/contracts/services-01/tests/callers-scan.mjs`（含内部边与可达性，输出 JSON 证据） |
| B    | 非范围文件从**公开入口** import 范围符号   | 同上（`@knorvia/services`、`@knorvia/services/node`、`@knorvia/services/<子路径>`）           |
| C    | 范围文件沿静态 import 是否仍从公开入口可达 | 同上（`packages/services/package.json` 的 `exports` 六个入口起步走图）                        |
| D    | 被导入符号在导入语句之外**真实出现**几次   | `node specs/contracts/services-01/tests/realuse-scan.mjs`                                     |
| —    | 条目级无用导出                             | `pnpm knip`；存疑项用 `pnpm dep:refs packages/services/src/<path>:<symbol>` 复核              |

机器证据：`callers-raw.json`（逐模块 A/B/并集调用方、内部出入边、可达位）；两份扫描脚本都在 `tests/` 下，
可重复执行，不参与测试门禁。符号归属按「名字 → 声明它的范围模块」映射，
`agent/agent.ts` 的 `export * from "./agentPluginParams.js"` / `"./agentWorkflowParams.js"` 两条星号再导出
不展开（符号仍归各自声明文件），因此 A/B 两通道对这两个模块的调用方数会偏保守。

## 二、公开兼容入口（本包对外只有这六个）

`packages/services/package.json` 的 `exports`：

| 入口                                 | 文件                                   | 本包关系                                                           |
| ------------------------------------ | -------------------------------------- | ------------------------------------------------------------------ |
| `.`（`@knorvia/services`）           | `src/index.ts`                         | 桶文件本身属 **services-04**；本包只保证它再导出的范围符号形状不变 |
| `./node`（`@knorvia/services/node`） | `src/node.ts`                          | 同上；本包 24 个模块由它注册进服务集合（含 `setDataBaseDir` 等）   |
| `./cua-permission-broker`            | `src/cua-permission-broker/index.ts`   | **在本包范围内**（`cua-permission-broker/index.ts`）               |
| `./storage-startup`                  | `src/storage-startup.ts`               | 桶文件不在本包；范围内 `agent/storageStartupGate.ts` 是其实现依赖  |
| `./process/processTreeTerminator`    | `src/process/processTreeTerminator.ts` | 不在本包（process 域另包）                                         |
| `./window-controller`                | `src/window-controller/node.ts`        | 不在本包                                                           |

结论：**范围 58 个 `.ts` 全部从公开入口可达（58/58）**，包括 14 个没有任何外部调用方的模块。

## 三、总量

| 指标                           | 数值                                                                        |
| ------------------------------ | --------------------------------------------------------------------------- |
| 非范围扫描文件                 | 6,589（两条通道共用同一次目录遍历）                                         |
| A 深层路径 import              | 107 处，43 个调用方文件                                                     |
| B 公开入口符号 import          | 46 处，21 个调用方文件                                                      |
| A∪B 调用方文件                 | 64 个                                                                       |
| D 真实引用（导入语句之外使用） | 228 处，49 个调用方文件                                                     |
| 范围内互引（内部边）           | 89 条（`.` 相对 + `#src/` 别名 + 子路径三种写法都计入）                     |
| 符号→模块映射覆盖              | 298 个导出名（interface.md 336 条里的具名声明与具名再导出；星号再导出另计） |

调用方分布（按并集 64 个文件）：`packages/services/src` 兄弟域与桶 18 个（`node.ts` 覆盖 24 个模块、
`index.ts` 10 个、`accessor.ts` 6 个、`agent-session/sessionService.ts` 4 个），`packages/services/test` 22 个
（每个 ≤2 模块，是 fake-authority 与 contract 回归），`packages/ui/src` 15 个，`packages/desktop/src` 5 个，
`packages/server/src`、`packages/server-cli/src`、`apps/cli/packages/*/test` 各 1–2 个。
UI 侧集中在使用面最小的一条链：`packages/ui/src/lib/cuaPermissionStatus*` 与 `packages/ui/src/cua-permission/*`
消费 `cua-permission-broker` 子桶；`remotePluginSyncRefresh.ts`、`attachmentUploadTransaction.ts` 消费凭据与广播面。

## 四、目录汇总

### 目录汇总

| 目录                      | 模块 | A 深层 import | B 入口符号 | 调用方文件（并集） |
| ------------------------- | ---: | ------------: | ---------: | -----------------: |
| `agent/`                  |   31 |            53 |         11 |                 37 |
| `broadcast/`              |    2 |             7 |          2 |                  6 |
| `commands/`               |    5 |             9 |          1 |                  8 |
| `conversation-telemetry/` |    1 |             1 |          0 |                  1 |
| `credential/`             |    3 |             7 |          1 |                  6 |
| `cua-permission-broker/`  |    9 |            17 |         28 |                 14 |
| `file/`                   |    7 |            13 |          3 |                 11 |

### 逐模块账

| modulePath                                             | 分类               |   A |   B | 并集调用方 | 公开面可达 | 范围内出边 | 范围内入边 |
| ------------------------------------------------------ | ------------------ | --: | --: | ---------: | ---------- | ---------: | ---------: |
| `agent/agent.ts`                                       | unreviewed         |  14 |   9 |         22 | 是         |          4 |         12 |
| `agent/agentBrowserAmbientContext.ts`                  | unreviewed         |   0 |   0 |          0 | 是         |          0 |          1 |
| `agent/agentConnectionScope.ts`                        | unreviewed         |   3 |   0 |          2 | 是         |          1 |          1 |
| `agent/agentErrors.ts`                                 | unreviewed         |   1 |   0 |          1 | 是         |          0 |          1 |
| `agent/agentPluginParams.ts`                           | unreviewed         |   1 |   0 |          1 | 是         |          0 |          3 |
| `agent/agentPresentationSurface.ts`                    | unreviewed         |   1 |   0 |          1 | 是         |          0 |          1 |
| `agent/agentProcessManager.ts`                         | unreviewed         |   4 |   1 |          3 | 是         |          6 |          2 |
| `agent/agentService.ts`                                | unreviewed         |   2 |   0 |          1 | 是         |         13 |          0 |
| `agent/agentSpawnCwd.ts`                               | unreviewed         |   1 |   1 |          2 | 是         |          0 |          1 |
| `agent/agentStderrCollector.ts`                        | unreviewed         |   1 |   0 |          1 | 是         |          0 |          1 |
| `agent/agentWorkflowParams.ts`                         | unreviewed         |   0 |   0 |          0 | 是         |          1 |          2 |
| `agent/automationToolPolicy.ts`                        | upstream-unchanged |   2 |   0 |          2 | 是         |          0 |          2 |
| `agent/configOptions.ts`                               | unreviewed         |   1 |   0 |          1 | 是         |          0 |          2 |
| `agent/cuaOperationTurnTracker.ts`                     | unreviewed         |   1 |   0 |          1 | 是         |          0 |          1 |
| `agent/independentPlanSupport.ts`                      | unreviewed         |   0 |   0 |          0 | 是         |          1 |          1 |
| `agent/modelTrajectory.ts`                             | unreviewed         |   1 |   0 |          1 | 是         |          2 |          1 |
| `agent/modelTrajectoryFileTail.ts`                     | unreviewed         |   0 |   0 |          0 | 是         |          0 |          2 |
| `agent/pluginReferenceCatalogRequest.ts`               | unreviewed         |   0 |   0 |          0 | 是         |          1 |          1 |
| `agent/protocolClient.ts`                              | unreviewed         |   1 |   0 |          1 | 是         |          2 |          4 |
| `agent/protocolTransport.ts`                           | unreviewed         |   1 |   0 |          1 | 是         |          0 |          2 |
| `agent/repairSubagentTaskIndex.ts`                     | unreviewed         |   0 |   0 |          0 | 是         |          1 |          1 |
| `agent/sessionEventCoalescer.ts`                       | unreviewed         |   1 |   0 |          1 | 是         |          1 |          1 |
| `agent/stdioTapDevConfig.ts`                           | unreviewed         |   1 |   0 |          1 | 是         |          0 |          1 |
| `agent/stdioTransport.ts`                              | unreviewed         |   2 |   0 |          2 | 是         |          2 |          1 |
| `agent/storageStartupGate.ts`                          | unreviewed         |   0 |   0 |          0 | 是         |          0 |          1 |
| `agent/task-index-ingestion/sessionIndexProjection.ts` | unreviewed         |   1 |   0 |          1 | 是         |          4 |          1 |
| `agent/task-index-ingestion/snapshotProjection.ts`     | unreviewed         |   3 |   0 |          2 | 是         |          3 |          2 |
| `agent/task-index-ingestion/topicTypes.ts`             | unreviewed         |   3 |   0 |          3 | 是         |          1 |          3 |
| `agent/taskIndexSyncer.ts`                             | unreviewed         |   3 |   0 |          3 | 是         |          4 |          1 |
| `agent/taskServiceAdapter.ts`                          | unreviewed         |   4 |   0 |          3 | 是         |          7 |          0 |
| `agent/v4HostCommand.ts`                               | unreviewed         |   0 |   0 |          0 | 是         |          0 |          1 |
| `broadcast/broadcast.ts`                               | upstream-modified  |   4 |   1 |          4 | 是         |          0 |          1 |
| `broadcast/broadcastService.ts`                        | upstream-modified  |   3 |   1 |          3 | 是         |          1 |          0 |
| `commands/commandConfig.ts`                            | unreviewed         |   0 |   0 |          0 | 是         |          0 |          3 |
| `commands/commandDiscovery.ts`                         | unreviewed         |   0 |   0 |          0 | 是         |          3 |          1 |
| `commands/commandFileParser.ts`                        | upstream-modified  |   3 |   0 |          3 | 是         |          0 |          2 |
| `commands/commands.ts`                                 | upstream-modified  |   3 |   1 |          4 | 是         |          0 |          1 |
| `commands/commandsService.ts`                          | upstream-modified  |   3 |   0 |          2 | 是         |          4 |          0 |
| `conversation-telemetry/conversationTelemetry.ts`      | upstream-modified  |   1 |   0 |          1 | 是         |          1 |          0 |
| `credential/credential.ts`                             | upstream-modified  |   4 |   0 |          4 | 是         |          0 |          1 |
| `credential/credentialService.ts`                      | upstream-modified  |   2 |   1 |          2 | 是         |          2 |          0 |
| `credential/providers/credentialCipherProvider.ts`     | upstream-modified  |   1 |   0 |          1 | 是         |          0 |          1 |
| `cua-permission-broker/cuaAgentAdmissionGate.ts`       | upstream-modified  |   1 |   0 |          1 | 是         |          0 |          1 |
| `cua-permission-broker/cuaHelperInstaller.ts`          | upstream-modified  |   2 |   2 |          2 | 是         |          0 |          0 |
| `cua-permission-broker/cuaPermissionService.ts`        | upstream-modified  |   3 |  13 |          7 | 是         |          0 |          2 |
| `cua-permission-broker/cuaPipSession.ts`               | upstream-modified  |   2 |   0 |          2 | 是         |          0 |          3 |
| `cua-permission-broker/cuaPipSessionService.ts`        | upstream-modified  |   1 |   0 |          1 | 是         |          1 |          2 |
| `cua-permission-broker/index.ts`                       | upstream-modified  |   6 |  13 |          8 | 是         |          9 |          1 |
| `cua-permission-broker/windowsCuaDevHelperHost.ts`     | upstream-modified  |   1 |   0 |          1 | 是         |          2 |          2 |
| `cua-permission-broker/windowsCuaDevRuntime.ts`        | upstream-modified  |   1 |   0 |          1 | 是         |          0 |          1 |
| `cua-permission-broker/windowsCuaHelperHostSupport.ts` | upstream-modified  |   0 |   0 |          0 | 是         |          1 |          2 |
| `file/file.ts`                                         | upstream-modified  |   5 |   3 |          8 | 是         |          0 |          1 |
| `file/fileService.ts`                                  | upstream-modified  |   4 |   0 |          2 | 是         |          7 |          0 |
| `file/fileServiceIndex.ts`                             | unreviewed         |   0 |   0 |          0 | 是         |          4 |          1 |
| `file/fileServiceIO.ts`                                | unreviewed         |   0 |   0 |          0 | 是         |          0 |          2 |
| `file/workspaceFileIgnore.ts`                          | upstream-modified  |   1 |   0 |          1 | 是         |          0 |          2 |
| `file/workspaceFileMentionFilter.ts`                   | upstream-modified  |   3 |   0 |          2 | 是         |          0 |          3 |
| `file/workspaceFileSearch.ts`                          | upstream-modified  |   0 |   0 |          0 | 是         |          0 |          2 |

合计：范围 58 个 .ts + 2 份 .md；A 107 处 / 43 个调用方；B 46 处 / 21 个调用方；并集 64 个调用方文件；内部边 89 条；公开入口可达 58/58。证据：`specs/contracts/services-01/callers-raw.json`

## 五、没有外部调用方的 14 个模块（都不删）

并集调用方为 0，但每个都有范围内入边，且从公开入口可达——它们是**域内实现细节**，不是死代码：

| modulePath                                             | 范围内入边（调用它的范围模块）                                     |
| ------------------------------------------------------ | ------------------------------------------------------------------ |
| `agent/agentBrowserAmbientContext.ts`                  | `agent/agentService.ts`                                            |
| `agent/agentWorkflowParams.ts`                         | `agent/agent.ts`（`export *` 星号再导出两处）                      |
| `agent/independentPlanSupport.ts`                      | `agent/agentService.ts`                                            |
| `agent/modelTrajectoryFileTail.ts`                     | `agent/modelTrajectory.ts`（两处引用）                             |
| `agent/pluginReferenceCatalogRequest.ts`               | `agent/agentService.ts`                                            |
| `agent/repairSubagentTaskIndex.ts`                     | `agent/task-index-ingestion/sessionIndexProjection.ts`             |
| `agent/storageStartupGate.ts`                          | `agent/protocolClient.ts`（`#src/` 别名写法，只有通道 C/D 能看见） |
| `agent/v4HostCommand.ts`                               | `agent/taskServiceAdapter.ts`                                      |
| `commands/commandConfig.ts`                            | `commands/commandDiscovery.ts`、`commands/commandsService.ts`      |
| `commands/commandDiscovery.ts`                         | `commands/commandsService.ts`                                      |
| `cua-permission-broker/windowsCuaHelperHostSupport.ts` | `cua-permission-broker/windowsCuaDevHelperHost.ts`（两处引用）     |
| `file/fileServiceIndex.ts`                             | `file/fileService.ts`                                              |
| `file/fileServiceIO.ts`                                | `file/fileService.ts`、`file/fileServiceIndex.ts`                  |
| `file/workspaceFileSearch.ts`                          | `file/fileService.ts`、`file/fileServiceIndex.ts`                  |

`pnpm knip` 的 Unused files（333 条）里**没有**任何一个范围文件；条目级命中 4 条，逐条 `dep:refs` + 全仓核实：

| knip 命中                                                              | 核实结论                                                                                              |
| ---------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------- |
| `agent/v4HostCommand.ts:19` `uuidv7`（unused export）                  | 同文件 36/67 行在用；`export` 关键字外部无人用。与 `packages/shared/src/uuid.ts:42` 同名重复声明      |
| `commands/commandConfig.ts:31` `enabledOverrides`                      | 同文件 41 行在用（`readCommandConfiguration()` 之后），export 面无外部消费者                          |
| `commands/commandConfig.ts:6` `CommandConfiguration`                   | 同文件 16/25/45/48/78 行在用                                                                          |
| `agent/agentProcessManager.ts:212` `KnorviaAgentRuntimeLifecycleEvent` | `packages/server-cli` 消费的是 `agent/agent.ts:182` 的同名 interface；本文件 212 行是一份**重复声明** |

**无用代码结论：本包没有删除提交**（每包流程「一、3」）。四条命中都是「模块内部使用」或「同名重复声明」，
删掉会破坏可达面。两处重复声明不在合同阶段动实现，登记给 design.md：
`uuidv7` 复用 `@knorvia/shared`；`KnorviaAgentRuntimeLifecycleEvent` 由 `agent/agent.ts` 唯一持有。

## 六、重写阶段的改动半径

- 只有 `@knorvia/services` 六个入口的导出名与签名是外部可见面；A 通道的 107 处深层 import 集中在
  `packages/services/src` 桶与兄弟域、`packages/services/test` 两处，属于**同包内部约束**，
  重写时这些路径必须继续存在（`importDeep()` 也按同一批路径断言）。
- 时序敏感调用方：`packages/desktop/src/host/remoteWorkspaceServiceCollection.ts`（服务集合注册顺序）、
  `packages/server/src/http.ts`、`packages/server-cli/src/server-core/taskActivityTracker.ts`
  （runtime lifecycle 事件消费）、`packages/ui/src/lib/cuaPermissionStatus*`（权限状态缓存与防回环）。
- 本包不改动任何调用方；接入阶段若必须改调用方，按计划书走单独提交并说明原因。
