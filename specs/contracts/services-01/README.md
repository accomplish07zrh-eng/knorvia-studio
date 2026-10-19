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

| 簇                           | 包含模块与文件                                                                                                                                                                                                                                             | 职责说明                                                                         | 测试文件                                                                                  |
| :--------------------------- | :--------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | :------------------------------------------------------------------------------- | :---------------------------------------------------------------------------------------- |
| **A1 agent-surface**         | `agent/agent.ts`、`agentErrors`、`agentPresentationSurface`、`agentPluginParams`、`agentWorkflowParams`、`configOptions`、`automationToolPolicy`、`independentPlanSupport`、`agentSpawnCwd`、`agentBrowserAmbientContext`、`pluginReferenceCatalogRequest` | 服务接口、描述符、参数校验、环境事实推导与模型选项配置                           | `agent-surface.test.mjs`                                                                  |
| **A3 agent-process**         | `agent/agentProcessManager.ts`、`stdioTransport.ts`、`agentStderrCollector.ts`、`storageStartupGate.ts`、`agentConnectionScope.ts`、`v4HostCommand.ts`、`protocolClient.ts`、`protocolTransport.ts`、`stdioTapDevConfig.ts`                                | 运行时子进程生命周期、stdio 协议帧传输、stderr 日志采集规约与存储就绪门闩        | `agent-process.test.mjs`                                                                  |
| **A5 task-service-adapter**  | `agent/taskServiceAdapter.ts`（巨型适配层）                                                                                                                                                                                                                | 任务工厂、创建与 draft 复用、列表读取、快照运行态、CAS 重试、host 队列与生命周期 | `task-service-adapter.test.mjs`                                                           |
| **S1 credential-broadcast**  | `credential/`（3件）、`broadcast/`（2件）、`conversation-telemetry/`（1件）                                                                                                                                                                                | 凭据加解密格式、进程内/跨进程互斥锁、广播 claim/lease 状态机与对话埋点           | `credential.test.mjs`、`credential-broadcast.test.mjs`、`credential-broadcast-2.test.mjs` |
| **S2 commands**              | `commands/` 全部 5 件（`commandConfig`、`commandDiscovery`、`commandFileParser`、`commands`、`commandsService`）                                                                                                                                           | Markdown 命令文件解析、frontmatter 提取、命令配置合并与文件热重载                | `commands.test.mjs`、`commands-2.test.mjs`                                                |
| **S3 file-service**          | `file/` 全部 8 件（`file`、`fileService`、`fileServiceIndex`、`fileServiceIO`、`workspaceFileIgnore`、`workspaceFileMentionFilter`、`workspaceFileSearch`、`FILTER-SPEC-20261002.md`）                                                                     | 工作区目录管理、忽略过滤、二进制判定、分段读取与媒体预览                         | `file-service.test.mjs`                                                                   |
| **S4 cua-permission-broker** | `cua-permission-broker/` 全部 9 件与 `agent/cuaOperationTurnTracker.ts`                                                                                                                                                                                    | CUA 权限申报状态机、跨平台 socket/named pipe 铸造、PiP 串行投递与子桶委托        | `cua-permission-broker.test.mjs`、`cua-permission-broker-2.test.mjs`                      |

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
| 行为规格     |  ✅  | [`behavior.md`](behavior.md) B1–B63 涵盖 7 个功能簇全部约定                             |
| 目标架构     |  ✅  | [`design.md`](design.md) 对齐服务层功能模块规范与大文件拆解方案                         |
| 验收报告     |  ✅  | [`acceptance.md`](acceptance.md) 记录测试、首败与复盘                                   |
| 已知差异     |  ✅  | [`known-differences.md`](known-differences.md) 冻结红线清单与平台边界                   |
| 黑盒测试     |  ✅  | 12 个测试套件，源码 + dist 双入口 100% 通过（267/267）                                  |
| 合同桩与旧门 |  ✅  | 58 个 import-and-throw 桩，`gate-old.json` 达成 `allFail=true`                          |

---

## 四、条目 → 测试对照表

| 条目号 | 行为规格名称          | 对应测试文件                       | 对应断言 / 测试用例标题                                                             |
| :----- | :-------------------- | :--------------------------------- | :---------------------------------------------------------------------------------- |
| B1     | 范围清单              | `surface.test.mjs`                 | 「60 个继承文件：7 目录分布与三类分类计数」                                         |
| B2     | 兼容面同步            | `surface.test.mjs`                 | 「每个范围模块都有一节，且声明名集合与 AST 导出一致」                               |
| B3     | 公开入口形状          | `surface.test.mjs`                 | 「根桶暴露 descriptor 与浏览器安全类型面」                                          |
| B4     | 凭据密文格式          | `credential.test.mjs`              | 「enc:v1 前缀、随机 IV 与可逆解密；非前缀值原样透传」                               |
| B5     | 凭据服务损坏留证      | `credential.test.mjs`              | 「损坏 JSON 拒绝覆盖：抛 corrupt 错误并留下内容摘要备份」                           |
| B6     | 进程内并发串行化      | `credential-broadcast.test.mjs`    | 「并发 save 与并发 delete 在锁内串行：无丢更新、通知只在落盘之后」                  |
| B7     | 跨进程文件锁          | `credential-broadcast.test.mjs`    | 「别的进程持有 credentials.json.lock 时 save 必须等待」                             |
| B8     | 密钥来源与缺失回退    | `credential-broadcast.test.mjs`    | 「无 KNORVIA_CREDENTIAL_SECRET 时按本机身份派生稳定密钥」                           |
| B9     | 对话埋点服务          | `credential-broadcast.test.mjs`    | 「工厂是唯一运行时导出，onFact 按 onDynamic\* 约定委托」                            |
| B10    | 跨窗口广播与 Claim    | `credential-broadcast-2.test.mjs`  | 「S23 进程内 claim 语义：reservation / commit / release」                           |
| B11    | 广播过滤与投递纪律    | `credential-broadcast-2.test.mjs`  | 「S22 入站投递与过滤：按通道与 workspaceKey 过滤」                                  |
| B12    | 命令文件发现与解析    | `commands.test.mjs`                | 「S24 提取 description/argument-hint，缩进行折叠续写」                              |
| B13    | 命令文件内容生成      | `commands.test.mjs`                | 「S26 无元数据时原样返回 prompt；有元数据时 --- 块 + 空行 + prompt」                |
| B14    | 命令配置覆盖与启用    | `commands-2.test.mjs`              | 「S27 命令配置合并与覆盖：支持 enabled: false」                                     |
| B15    | 命令热重载与监视      | `commands-2.test.mjs`              | 「S28 热重载与广播：防抖重载并派发 commands_changed」                               |
| B21    | 工作区创建与名字校验  | `file-service.test.mjs`            | 「对话/默认/草稿工作区都落在数据根内，created 只反映真实新建」                      |
| B22    | 目录列表与属性投影    | `file-service.test.mjs`            | 「默认隐藏点开头条目，目录整体先于文件，组内顺序等于 localeCompare」                |
| B23    | 符号链接判定与安全    | `file-service.test.mjs`            | 「符号链接目录的 type 由目标决定，isSymbolicLink 保留 dirent 原始事实」             |
| B24    | 二进制与文本判定      | `file-service.test.mjs`            | 「NUL 立即判二进制并清空内容，控制字符按占比阈值判定」                              |
| B25    | 文件范围读取          | `file-service.test.mjs`            | 「顶层返回 Uint8Array，EOF 给短数组，越界 offset 给空数组」                         |
| B26    | 媒体与二进制预览      | `file-service.test.mjs`            | 「MIME 取小写扩展名，图片表优先于共享音视频表，上限 25MiB」                         |
| B31    | 权限申报与状态机      | `cua-permission-broker.test.mjs`   | 「权限请求状态机迁移与细粒度授权」                                                  |
| B32    | IPC Socket 通道       | `cua-permission-broker.test.mjs`   | 「S56 socket 路径常量与铸造入口保持 producer 语义」                                 |
| B33    | PiP 串行投递          | `cua-permission-broker-2.test.mjs` | 「S48 重放定时器在 250ms 后自行重投挂起的 turn-started」                            |
| B34    | 子桶委托面            | `cua-permission-broker-2.test.mjs` | 「S56 本地实现经子桶再导出仍是同一对象，不在 services 留副本」                      |
| B43    | Agent 进程生命周期    | `agent-process.test.mjs`           | 「Agent 子进程启动、保活与优雅关闭」                                                |
| B44    | Stdio 协议传输        | `agent-process.test.mjs`           | 「StdioTransport 双向 JSON-RPC 帧封装与断开通知」                                   |
| B45    | Stderr 采集与规约     | `agent-process.test.mjs`           | 「StderrOwnerSpec 时间戳截断与 crash dump 关联」                                    |
| B46    | 存储就绪门闩          | `agent-process.test.mjs`           | 「StorageStartupGate 阻塞直至存储就绪」                                             |
| B53    | 任务适配器公开接口    | `task-service-adapter.test.mjs`    | 「A51 工厂返回完整 IKnorviaTaskService 面」                                         |
| B54    | 任务创建与 Draft 复用 | `task-service-adapter.test.mjs`    | 「A52 普通创建走 createSession，同步 task index 并广播」                            |
| B55    | 任务列表读取与分页    | `task-service-adapter.test.mjs`    | 「A53 五个分区读取统一注入 Knorvia provider 边界并透传 workspaceIdentity」          |
| B56    | 会话快照与运行态      | `task-service-adapter.test.mjs`    | 「A54 状态由 session、阻塞运行态与 lastError 共同判定」                             |
| B57    | 子 Agent 与身份隔离   | `task-service-adapter.test.mjs`    | 「A55 subagent_child 快照只读不回写主任务索引」                                     |
| B58    | Host 命令队列调度     | `task-service-adapter.test.mjs`    | 「A56 enqueue 立即 accepted、drain 由 ready 事件驱动并保持串行」                    |
| B59    | v4 CAS 命令收敛       | `task-service-adapter.test.mjs`    | 「A57 auto 模式保留旧 op，其余模式与思考档位走 v4 CAS 命令」                        |
| B60    | 事件投影与生命周期    | `task-service-adapter.test.mjs`    | 「A58 onDynamicTaskEvent 建立本地与上游双订阅并按释放顺序回收」                     |
| B61    | 任务元数据写路径      | `task-service-adapter.test.mjs`    | 「A59 closeTask 落 deleted tombstone 并清理 live 工具投影」                         |
| B62    | 路径、轨迹与日志归属  | `task-service-adapter.test.mjs`    | 「A510 getTaskSessionFilePath 与 getModelTrajectory 以 taskId 作为 session 事实源」 |
| B63    | Claude 原生会话导入   | `task-service-adapter.test.mjs`    | 「A514 Claude 原生导入面走导入仓库，扫描参数不携带 workspaceIdentity」              |
