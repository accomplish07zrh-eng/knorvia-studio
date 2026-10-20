# services-01 目标结构（design）

合同阶段的目标结构声明：重写时按 `specs/knorvia-internal-plugins.md` 的**服务层功能模块**约定组织本包，
兼容面（`interface.md` 的 58 个模块路径与 336 条导出、`packages/services/package.json` 的六个公开入口）
保持不变。本文档不改变任何行为口径，只约定新写的落地形状；行为以 `behavior.md` 为准。

## 一、当前形态与目标差异

当前 60 个继承文件按目录平铺，服务注册散在三处组合根（`packages/services/src/node.ts`、
`packages/desktop/src/host/remoteWorkspaceServiceCollection.ts`、`packages/server/src/http.ts`），
两处同名重复声明（见 `callers.md` §五）。目标是把同一批能力收进 8 个功能模块，
每个模块唯一持有自己的状态与服务描述符，模块之间只通过对方的公开入口或 `@knorvia/shared` 协议类型交互。

| 功能模块 id           | 继承来源（本包范围文件）                                                                                                                                                                                                                                                                                                                  | 唯一状态所有者                                    |
| --------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------- |
| `agent-kernel`        | `agent/protocolClient.ts`、`agent/protocolTransport.ts`、`agent/stdioTransport.ts`、`agent/stdioTapDevConfig.ts`、`agent/agentProcessManager.ts`、`agent/agentStderrCollector.ts`、`agent/storageStartupGate.ts`、`agent/agentConnectionScope.ts`、`agent/v4HostCommand.ts`                                                               | 进程与连接域（Agent 子进程句柄、就绪门闩）        |
| `agent-session`       | `agent/agentService.ts`、`agent/taskServiceAdapter.ts`、`agent/agent.ts` 及其参数/错误/呈现面（`agentErrors`、`agentPresentationSurface`、`agentPluginParams`、`agentWorkflowParams`、`configOptions`、`automationToolPolicy`、`independentPlanSupport`、`agentSpawnCwd`、`agentBrowserAmbientContext`、`pluginReferenceCatalogRequest`） | 会话与任务（草稿、输入队列、附件、模式/模型切换） |
| `task-index`          | `agent/taskIndexSyncer.ts`、`agent/task-index-ingestion/{sessionIndexProjection,snapshotProjection,topicTypes}.ts`、`agent/sessionEventCoalescer.ts`、`agent/repairSubagentTaskIndex.ts`、`agent/modelTrajectory.ts`、`agent/modelTrajectoryFileTail.ts`                                                                                  | 任务索引与投影（`tasks-index.sqlite` 的写入方）   |
| `credential-store`    | `credential/credential.ts`、`credential/credentialService.ts`、`credential/providers/credentialCipherProvider.ts`                                                                                                                                                                                                                         | `credentials.json`（`enc:v1:` 密文与备份件）      |
| `workspace-broadcast` | `broadcast/broadcast.ts`、`broadcast/broadcastService.ts`、`conversation-telemetry/conversationTelemetry.ts`                                                                                                                                                                                                                              | 跨窗口 claim/lease 与投递去重                     |
| `user-commands`       | `commands/commandConfig.ts`、`commandDiscovery.ts`、`commandFileParser.ts`、`commands.ts`、`commandsService.ts`                                                                                                                                                                                                                           | 命令目录与启用覆盖（`commandConfig` 写回）        |
| `workspace-file`      | `file/file.ts`、`fileService.ts`、`fileServiceIndex.ts`、`fileServiceIO.ts`、`workspaceFileIgnore.ts`、`workspaceFileMentionFilter.ts`、`workspaceFileSearch.ts`、`FILTER-SPEC-20261002.md`                                                                                                                                               | 工作区索引与忽略规则判定                          |
| `computer-use`        | `cua-permission-broker/` 全部 9 个文件与 `agent/cuaOperationTurnTracker.ts`、`agent/agentProcessManager.ts` 的权限申报入口                                                                                                                                                                                                                | 权限状态机与 helper 安装/会话                     |

`computer-use` 与其余模块不同：它的子桶 `@knorvia/services/cua-permission-broker` 是 `export * from
"@knorvia/cua/broker/server"` 的委托面，重写保持委托，不把 `packages/cua` 的实现搬进来。

## 二、模块形状

沿用现有依赖注入设施（`descriptors.ts`、`collection.ts`、`accessor.ts`），一个功能模块一个目录加一个 `module.ts`：

```ts
// 形状示意，字段以 services-01 合同既有 descriptor/collection 设施为准
export const agentKernelModule = {
  id: "agent-kernel",
  requires: ["conversation-telemetry-gate", "data-location"],
  register(services) {
    services.add(IAgentProcessManager, () => createAgentProcessManager(services));
  },
  contributes: { toolPolicy: ["automation"] },
} as const;
```

- `id` 与 `architecture-policy.yaml` 登记的模块 id 一致；`requires` 只写模块 id 或基础服务描述符，不写深层路径。
- `register()` 只注册本模块自己拥有的服务描述符，不注册别人的、不在别人的描述符上补实现。
- `contributes` 是纯数据（交给界面层的入口/策略声明），运行期不增删。
- 已有先例形状：`packages/services/src/creation/module.ts`、`packages/services/src/studio-runtime/module.ts`；
  新增模块向它们对齐，不另造注册协议。

三处组合根改为遍历同一份功能模块清单（清单来源唯一，放在 `packages/services` 内），
环境差异通过依赖注入的描述符实现选择解决，不在组合根里写 `if (desktop)`。

## 三、大文件的拆分边界

`agent/agentService.ts`（4,916 行）与 `agent/taskServiceAdapter.ts`（5,742 行）不整文件替换成另一个大文件，
按 `behavior.md` 的 B 条目分组拆分，同时保留原模块路径作为兼容出口：

- `agent/agentService.ts` → `agent/session/*`（会话生命周期与输入 admission）、`agent/attachment/*`（三段式附件）、
  `agent/plugin-catalog/*`（插件与技能引用目录）、`agent/automation/*`（自动化与 saved workflow），
  原路径继续 `export` 同名公开符号（`interface.md` 登记的签名逐字不变）。
- `agent/taskServiceAdapter.ts` → `agent/task-view/*`（列表/排序/分组投影）、`agent/task-target/*`
  （运行态与目标判定）、`agent/task-reference/*`（群聊与子 Agent 引用）。
- 拆出的内部文件不进 `interface.md`，只经模块公开入口可达；`architecture-policy.yaml` 用
  `publicEntrypoints` 标明哪个文件是对外面。

拆分只改文件组织与内部依赖方向，不改任何输入/输出/错误语义、时序、幂等与资源释放口径。

## 四、依赖方向与禁止项

- 允许：功能模块 → `@knorvia/shared` 协议类型、`@knorvia/contracts`、`packages/rpc`、基础服务描述符。
- 禁止：功能模块之间深层导入对方实现细节（只走公开入口或描述符）、跨模块循环、UI 直调 Repo、
  Service 引用 Runtime 具体实现。
- 唯一写入路径：每个状态所有者只写自己的存储；`credentials.json` 只有 `credential-store` 写，
  `tasks-index.sqlite` 只有 `task-index` 写，广播 claim/lease 只有 `workspace-broadcast` 写。
- 两处同名重复声明收口：`uuidv7` 复用 `@knorvia/shared/uuid`，`KnorviaAgentRuntimeLifecycleEvent`
  由 `agent/agent.ts` 唯一持有（`agentProcessManager.ts` 不再自行声明）。
- 删除功能 = 删模块目录 + 组合清单里一行 + 架构登记一行，不留运行期兜底分支。

## 五、验收映射（本包相关部分）

| 计划书要求                               | 本包落点                                                                           |
| ---------------------------------------- | ---------------------------------------------------------------------------------- |
| 三处组合根来自同一清单                   | 断言清单来源唯一（`node.ts`/desktop/server 注册集合可逐 id 对齐）                  |
| 去掉一个功能模块其余仍通过               | 每个模块的 `requires` 显式；`pnpm architecture:check` 拦住悬空导入                 |
| 架构检查拦住跨模块深层导入与循环         | 8 个模块登记进 `architecture-policy.yaml`，`forbidDeepImports`/`forbidCycles` 生效 |
| 行为不变（界面、数据、协议）             | `behavior.md` B 条目 + `tests/` 黑盒两入口全过 + `fixtures/` 金样往返              |
| `pnpm test:studio`、typecheck、lint 全过 | 接入阶段实测，记进 `acceptance.md`                                                 |
