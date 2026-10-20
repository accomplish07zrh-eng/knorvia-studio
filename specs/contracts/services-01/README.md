# services-01 合同（`packages/services/src` 七目录 · 60 件）

**合同版本：v1**（八件套齐、旧门通过，见 [acceptance.md](acceptance.md)）

本目录是 `services-01`（认领 issue：**#206**）的**兼容合同**：先冻结公开行为与导出签名，再按内部功能模块组织独立重写。

- 分支：`contract/services-01`；工作树：`/workspace/wt-svc01`
- 依据：《Knorvia 独立替换任务计划书》、`specs/knorvia-internal-plugins.md` 服务层功能模块规范、M1 切包规则（≤60 件）
- 边界：只覆盖 `packages/services/src` 下 7 个子目录的 60 个继承文件，其余目录由后续 services 包承接

---

## 一、选包实测

### 1. 范围与度量（2026-10-19）

依据 `licensing/current-files.json` 实测，七个核心目录（`agent/`、`broadcast/`、`commands/`、`conversation-telemetry/`、`credential/`、`cua-permission-broker/`、`file/`）共有 **60 个继承文件**（36 unreviewed + 23 upstream-modified + 1 upstream-unchanged），21,682 行 / 829,825 字节。包含：

- 58 个 TypeScript 模块（336 项顶层导出声明）
- 2 份继承规范文档（`agent/STDERR-OWNER-SPEC-20261003.md`、`file/FILTER-SPEC-20261002.md`）

详细列表与度量冻结于 [`scope-files.json`](scope-files.json)。

### 2. 功能分簇

| 簇                           | 包含模块与文件                                                                                                                                                                                                                                             | 职责说明                                                                         | 测试文件                                                                                                                             |
| :--------------------------- | :--------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | :------------------------------------------------------------------------------- | :----------------------------------------------------------------------------------------------------------------------------------- |
| **A1 agent-surface**         | `agent/agent.ts`、`agentErrors`、`agentPresentationSurface`、`agentPluginParams`、`agentWorkflowParams`、`configOptions`、`automationToolPolicy`、`independentPlanSupport`、`agentSpawnCwd`、`agentBrowserAmbientContext`、`pluginReferenceCatalogRequest` | 服务接口、描述符、参数校验、环境事实推导与模型选项配置                           | `agent-surface.test.mjs`                                                                                                             |
| **A3 agent-process**         | `agent/agentProcessManager.ts`、`stdioTransport.ts`、`agentStderrCollector.ts`、`storageStartupGate.ts`、`agentConnectionScope.ts`、`v4HostCommand.ts`、`protocolClient.ts`、`protocolTransport.ts`、`stdioTapDevConfig.ts`                                | 运行时子进程生命周期、stdio 协议帧传输、stderr 日志采集规约与存储就绪门闩        | `agent-process.test.mjs`、`agent-connection-scope.test.mjs`、`v4-host-command.test.mjs`                                              |
| **A5 task-service-adapter**  | `agent/taskServiceAdapter.ts`（巨型适配层）                                                                                                                                                                                                                | 任务工厂、创建与 draft 复用、列表读取、快照运行态、CAS 重试、host 队列与生命周期 | `task-service-adapter.test.mjs`                                                                                                      |
| **A6 task-index**            | `agent/taskIndexSyncer.ts`、`task-index-ingestion/{sessionIndexProjection,snapshotProjection,topicTypes}.ts`、`sessionEventCoalescer.ts`、`repairSubagentTaskIndex.ts`、`modelTrajectory.ts`、`modelTrajectoryFileTail.ts`                                 | 任务索引同步器、双 topic 摄入、快照/会话投影、后台事件合并与轨迹还原             | `task-index-syncer.test.mjs`、`session-event-coalescer.test.mjs`、`repair-subagent-task-index.test.mjs`、`model-trajectory.test.mjs` |
| **A7 agent-service**         | `agent/agentService.ts`（组合根，4,916 行）                                                                                                                                                                                                                | 三进程池装配、`disposeAllAndWait` 收口、workspace 级帧流与生命周期广播           | `agent-service-composition.test.mjs`                                                                                                 |
| **S1 credential-broadcast**  | `credential/`（3件）、`broadcast/`（2件）、`conversation-telemetry/`（1件）                                                                                                                                                                                | 凭据加解密格式、进程内/跨进程互斥锁、广播 claim/lease 状态机与对话埋点           | `credential.test.mjs`、`credential-broadcast.test.mjs`、`credential-broadcast-2.test.mjs`                                            |
| **S2 commands**              | `commands/` 全部 5 件（`commandConfig`、`commandDiscovery`、`commandFileParser`、`commands`、`commandsService`）                                                                                                                                           | Markdown 命令文件解析、frontmatter 提取、命令配置合并与文件热重载                | `commands.test.mjs`、`commands-2.test.mjs`                                                                                           |
| **S3 file-service**          | `file/` 全部 8 件（`file`、`fileService`、`fileServiceIndex`、`fileServiceIO`、`workspaceFileIgnore`、`workspaceFileMentionFilter`、`workspaceFileSearch`、`FILTER-SPEC-20261002.md`）                                                                     | 工作区目录管理、忽略过滤、二进制判定、分段读取与媒体预览                         | `file-service.test.mjs`                                                                                                              |
| **S4 cua-permission-broker** | `cua-permission-broker/` 全部 9 件与 `agent/cuaOperationTurnTracker.ts`                                                                                                                                                                                    | CUA 权限申报状态机、跨平台 socket/named pipe 铸造、PiP 串行投递与子桶委托        | `cua-permission-broker.test.mjs`、`cua-permission-broker-2.test.mjs`                                                                 |

---

## 二、兼容面（公开入口）

`packages/services` 的六个公开入口：

1. `.`：根入口，导出服务描述符、浏览器安全模型与类型
2. `./node`：Node 组合根装配函数
3. `./storage-startup`：存储就绪启动门闩
4. `./cua-permission-broker`：CUA 权限经纪子桶委托入口
5. `./process/processTreeTerminator`：进程树终止工具
6. `./window-controller`：窗口控制器

---

## 三、完成度

| 交付项       | 状态 | 说明                                                                                    |
| :----------- | :--: | :-------------------------------------------------------------------------------------- |
| 范围清单     |  ✅  | [`scope-files.json`](scope-files.json) 实测冻结 60 继承文件                             |
| 接口冻结     |  ✅  | [`interface.md`](interface.md) 机器提取 58 模块 336 条顶层公开导出面                    |
| 调用方分析   |  ✅  | [`callers.md`](callers.md) 三通道扫描 + 原始数据 [`callers-raw.json`](callers-raw.json) |
| 行为规格     |  ✅  | [`behavior.md`](behavior.md) B1–B73 覆盖 9 个测试分簇的全部约定                         |
| 目标架构     |  ✅  | [`design.md`](design.md) 对齐服务层功能模块规范与大文件拆解方案                         |
| 验收报告     |  ✅  | [`acceptance.md`](acceptance.md) 记录测试、首败与复盘                                   |
| 已知差异     |  ✅  | [`known-differences.md`](known-differences.md) 冻结红线清单与平台边界                   |
| 黑盒测试     |  ✅  | 19 个测试套件 / 349 个用例，源码 + dist 双入口 100% 通过（见 acceptance.md §3）         |
| 合同桩与旧门 |  ✅  | 58 个 import-and-throw 桩；`gate-old.json` 两入口 349/349、桩替换 `allFail=true`        |

### 3. 金样与往返（`fixtures/`）

计划书要求「涉及存储、配置、会话记录必须有『旧写 → 新读 → 新写 → 旧读』往返测试」，本包用两份固定金样覆盖：

| 金样                              | 内容                                                                                              | 往返断言                                                                                                                                        |
| :-------------------------------- | :------------------------------------------------------------------------------------------------ | :---------------------------------------------------------------------------------------------------------------------------------------------- |
| `fixtures/credential-enc-v1.json` | 固定 secret + 固定 IV 生成的 `enc:v1:<iv>.<tag>.<body>` 三条密文（ASCII / 中文+emoji / 控制字符） | `credential.test.mjs`「旧实现写的 enc:v1 金样能被当前 provider 读回原文…」与「金样落盘为 credentials.json 后 load 可读；save 新值不破坏旧条目」 |
| `fixtures/command-config.json`    | 含顶层未知键、`enable:false`/`enable:true`/无 `enable` 三类条目的历史 `cli/config.json`           | `commands.test.mjs`「旧实现写的 config.json 金样读成同一覆盖表；新写回后旧读口径不变」                                                          |

两份金样都不含真实凭据与用户数据：secret 与 IV 是测试常量，配置条目是合成的 `/ws/.knorvia/commands/*` 路径。

### 4. 无用代码复核（2026-10-19）

`pnpm knip` 对本包范围报出两个未引用导出，`pnpm dep:refs` 复核后确认都是**同文件内使用**的误报，不删除：

| 导出               | 位置                           | 复核结论                                                                                                             |
| :----------------- | :----------------------------- | :------------------------------------------------------------------------------------------------------------------- |
| `uuidv7`           | `agent/v4HostCommand.ts:19`    | 同文件 2 处使用（`hostV4ClientId`、`commandId` 缺省值）；导出是为黑盒测试可断言 RFC 9562 形态，`interface.md` 已登记 |
| `enabledOverrides` | `commands/commandConfig.ts:31` | 同文件 1 处使用（`readEnabledOverrides` 内部）；导出属 336 条兼容面，`interface.md` 已登记                           |

其余 knip 报告全部落在本包范围之外（`packages/ui`、`apps/cli/packages/*`、`scripts/`），不在本阶段处理。

---

## 四、条目 → 测试对照表

| 条目号 | 行为规格名称              | 对应测试文件                          | 对应断言 / 测试用例标题                                                                               |
| :----- | :------------------------ | :------------------------------------ | :---------------------------------------------------------------------------------------------------- |
| B1     | 范围清单                  | `surface.test.mjs`                    | 「60 个继承文件：7 目录分布与三类分类计数」                                                           |
| B2     | 兼容面同步                | `surface.test.mjs`                    | 「每个范围模块都有一节，且声明名集合与 AST 导出一致」                                                 |
| B3     | 公开入口形状              | `surface.test.mjs`                    | 「根桶暴露 descriptor 与浏览器安全类型面」                                                            |
| B4     | 凭据密文格式              | `credential.test.mjs`                 | 「enc:v1 前缀、随机 IV 与可逆解密；非前缀值原样透传」                                                 |
| B5     | 凭据服务损坏留证          | `credential.test.mjs`                 | 「损坏 JSON 拒绝覆盖：抛 corrupt 错误并留下内容摘要备份」                                             |
| B6     | 进程内并发串行化          | `credential-broadcast.test.mjs`       | 「并发 save 与并发 delete 在锁内串行：无丢更新、通知只在落盘之后、锁目录归还」                        |
| B7     | 跨进程文件锁              | `credential-broadcast.test.mjs`       | 「别的进程持有 credentials.json.lock 时 save 必须等待，并在锁内重读以避免丢更新」                     |
| B8     | 密钥来源与缺失回退        | `credential-broadcast.test.mjs`       | 「无 KNORVIA_CREDENTIAL_SECRET 时按本机身份派生稳定密钥：同机互解、空串等同缺失、默认读 process.env」 |
| B9     | 对话埋点服务              | `credential-broadcast.test.mjs`       | 「工厂是唯一运行时导出，onFact 按 onDynamic\* 约定委托并把订阅句柄原样交回」                          |
| B10    | 跨窗口广播与 Claim        | `credential-broadcast-2.test.mjs`     | 「S23 本地 claim 的 token 语义（broadcast/broadcastService.ts）」                                     |
| B11    | 广播过滤与投递纪律        | `credential-broadcast-2.test.mjs`     | 「S22 入站投递与过滤（broadcast/broadcastService.ts）」                                               |
| B12    | 命令文件发现与解析        | `commands.test.mjs`                   | 「S24 提取 description/argument-hint，缩进行折叠续写，键名大小写不敏感」                              |
| B13    | 命令文件内容生成          | `commands.test.mjs`                   | 「S26 无元数据时原样返回 prompt；有元数据时 --- 块 + 空行 + prompt」                                  |
| B14    | 命令配置覆盖与启用        | `commands.test.mjs`                   | 「S22 禁用写 enable:false、启用删键、集合空时删 command、保留其它未知字段且不改动入参」               |
| B15    | 命令发现来源与去重        | `commands-2.test.mjs`                 | 「S28 项目压用户；knorvia 目录非空即不再扫 agents；同名保留先发现者」                                 |
| B16    | 命令服务描述符与写入      | `commands-2.test.mjs`                 | 「S32 写入按生成格式落盘、返回 userCommand、清除同路径陈旧禁用并保留未知字段」                        |
| B21    | 工作区创建与名字校验      | `file-service.test.mjs`               | 「对话/默认/草稿工作区都落在数据根内，created 只反映真实新建，名字校验先于 IO」                       |
| B22    | 目录列表与属性投影        | `file-service.test.mjs`               | 「默认隐藏点开头条目，目录整体先于文件，组内顺序等于 localeCompare」                                  |
| B23    | 符号链接判定与安全        | `file-service.test.mjs`               | 「符号链接目录的 type 由目标决定，isSymbolicLink 保留 dirent 原始事实，悬空链接退回 file」            |
| B24    | 二进制与文本判定          | `file-service.test.mjs`               | 「NUL 立即判二进制并清空内容，控制字符按占比阈值判定，制表与换行不计入」                              |
| B25    | 文件范围读取              | `file-service.test.mjs`               | 「顶层返回 Uint8Array，EOF 给短数组，越界 offset 给空数组，长度落在 1 与 1MiB 之间」                  |
| B26    | 媒体与二进制预览          | `file-service.test.mjs`               | 「MIME 取小写扩展名，图片表优先于共享音视频表，未知类型回落 octet-stream，base64 可逆」               |
| B27    | 文件搜索索引与缓存        | `file-service.test.mjs`               | 「S42 工作区文件搜索索引与忽略规则（source）」                                                        |
| B28    | 忽略规则与 .knorviaignore | `file-service.test.mjs`               | 「S42 工作区文件搜索索引与忽略规则（source）」                                                        |
| B29    | 文件服务描述符            | `file-service.test.mjs`               | 「S31 IFileService 描述符与实现面（source）」                                                         |
| B30    | 继承规范文档              | `surface.test.mjs`                    | 「60 个继承文件：7 目录分布与三类分类计数」                                                           |
| B31    | CUA 准入代际与安装        | `cua-permission-broker.test.mjs`      | 「S41 beginRecovery 在途幂等复用同一 epoch，commit 后才允许开启下一代」                               |
| B32    | Socket 与 Helper 主机     | `cua-permission-broker-2.test.mjs`    | 「S51 WindowsCuaHelperHost 启动握手」                                                                 |
| B33    | PiP 串行投递              | `cua-permission-broker.test.mjs`      | 「S48 重放定时器在 250ms 后自行重投挂起的 turn-started」                                              |
| B34    | 子桶委托面                | `cua-permission-broker.test.mjs`      | 「S56 本地实现经子桶再导出仍是同一对象，不在 services 侧留副本」                                      |
| B43    | Agent 进程生命周期        | `agent-process.test.mjs`              | 「首次启动返回可用 client，同 workspace 再次 getClient 复用同一实例」                                 |
| B44    | Stdio 协议传输            | `agent-process.test.mjs`              | 「非法 stdout 帧触发 protocol-close 回收，并把首次 cleanup 原因留在退出轨迹里」                       |
| B45    | Stderr 采集与排空         | `agent-process.test.mjs`              | 「非零退出码的崩溃被归为 unexpected，并带 stderr 尾窗与脱敏结果」                                     |
| B46    | 存储就绪门闩              | `agent-process.test.mjs`              | 「CLI 上报 failed 阶段时门闩把启动事实合成为失败并拒绝后续状态」                                      |
| B47    | V4 连接作用域             | `agent-connection-scope.test.mjs`     | 「A61 V4 attachment facade 握手门与可信连接注入」                                                     |
| B48    | v4 命令信封与 CAS         | `v4-host-command.test.mjs`            | 「A66 ACK 六态映射与 CAS 收敛」                                                                       |
| B49    | 模型调用轨迹              | `model-trajectory.test.mjs`           | 「A68 model-io 记录还原与 callSource 分类」                                                           |
| B50    | 后台事件合并              | `session-event-coalescer.test.mjs`    | 「A69 合并键与 delta 拼接」                                                                           |
| B51    | 子 Agent 索引修复         | `repair-subagent-task-index.test.mjs` | 「A71 权威身份确认与批量边界」                                                                        |
| B52    | Agent 服务组合根          | `agent-service-composition.test.mjs`  | 「A72 组合根三进程池与 disposeAllAndWait 幂等」                                                       |
| B53    | 任务适配器公开接口        | `task-service-adapter.test.mjs`       | 「A51 工厂返回完整 IKnorviaTaskService 面，initialize 由协议名与版本组合」                            |
| B54    | 任务创建与 Draft 复用     | `task-service-adapter.test.mjs`       | 「A52 draft session 复用：模型与思考档位按 UI 当前选择对齐」                                          |
| B55    | 任务列表读取与分页        | `task-service-adapter.test.mjs`       | 「A53 五个分区读取统一注入 Knorvia provider 边界并透传 workspaceIdentity」                            |
| B56    | 会话快照与运行态          | `task-service-adapter.test.mjs`       | 「A54 状态由 session、阻塞运行态与 lastError 共同判定」                                               |
| B57    | 子 Agent 与身份隔离       | `task-service-adapter.test.mjs`       | 「A55 subagent_child 快照只读不回写主任务索引」                                                       |
| B58    | Host 命令队列调度         | `task-service-adapter.test.mjs`       | 「A56 enqueue 立即 accepted、drain 由 ready 事件驱动并保持串行」                                      |
| B59    | v4 CAS 命令收敛           | `task-service-adapter.test.mjs`       | 「A57 auto 模式保留旧 op，其余模式与思考档位走 v4 CAS 命令」                                          |
| B60    | 事件投影与生命周期        | `task-service-adapter.test.mjs`       | 「A58 onDynamicTaskEvent 建立本地与上游双订阅并按释放顺序回收」                                       |
| B61    | 任务元数据写路径          | `task-service-adapter.test.mjs`       | 「A59 closeTask 落 deleted tombstone 并清理 live 工具投影」                                           |
| B62    | 路径、轨迹与日志归属      | `task-service-adapter.test.mjs`       | 「A510 getTaskSessionFilePath 与 getModelTrajectory 以 taskId 作为 session 事实源」                   |
| B63    | Claude 原生会话导入       | `task-service-adapter.test.mjs`       | 「A514 Claude 原生导入面走导入仓库，扫描参数不携带 workspaceIdentity」                                |
| B64    | 任务索引同步器装配        | `task-index-syncer.test.mjs`          | 「A73 workspace 订阅与双 topic 独立代际」                                                             |
| B65    | 会话索引投影              | `task-index-syncer.test.mjs`          | 「A75 会话帧投影与终态分流」                                                                          |
| B66    | Topic 摄入类型契约        | `task-index-syncer.test.mjs`          | 「两条 topic 的 ACK 互不阻塞：config 慢不影响 index 的初始帧」                                        |
| B67    | 快照投影与模型写回        | `task-index-syncer.test.mjs`          | 「A78 快照投影、搜索文本预算与模型写回」                                                              |
| B68    | Agent 参数族与能力探测    | `agent-surface.test.mjs`              | 「A15 workspace 目标参数族（agent/agentPluginParams.ts）」                                            |
| B69    | 浏览器 ambient 采集       | `agent-surface.test.mjs`              | 「A26 浏览器 ambient 只读采集（agent/agentBrowserAmbientContext.ts）」                                |
| B70    | automation 工具策略       | `agent-surface.test.mjs`              | 「A20 automation 工具策略（agent/automationToolPolicy.ts）」                                          |
| B71    | 广播描述符与 claim 表     | `credential-broadcast-2.test.mjs`     | 「S20 广播 descriptor 与服务面（broadcast/broadcast.ts）」                                            |
| B72    | 文件搜索打分              | `file-service.test.mjs`               | 「S42 工作区文件搜索索引与忽略规则（source）」                                                        |
| B73    | CUA PiP 与 Windows 运行时 | `cua-permission-broker.test.mjs`      | 「S47 PiP 客户端解析与凭据门」                                                                        |
