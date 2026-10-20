# services-01 合同验收（v1）

对应重写计划书「合同八件套」验收清单与质量门禁要求。旧门产物见 [`gate-old.json`](gate-old.json)。

## 1. 范围与真源

本包范围严格依据 `licensing/current-files.json` 实测并冻结在 [`scope-files.json`](scope-files.json)：

- 包含 `packages/services/src` 下 7 个核心目录（`agent/`、`broadcast/`、`commands/`、`conversation-telemetry/`、`credential/`、`cua-permission-broker/`、`file/`）；
- 共 **60 个继承文件**（36 unreviewed + 23 upstream-modified + 1 upstream-unchanged），21,682 行 / 829,825 字节；
- 包含 58 个 TypeScript 实现文件（顶层导出 336 项）与 2 份继承规范文档（`agent/STDERR-OWNER-SPEC-20261003.md`、`file/FILTER-SPEC-20261002.md`）。

## 2. 八件套交付完成度

| 交付件       | 文件路径                                       | 状态 | 说明                                                                               |
| :----------- | :--------------------------------------------- | :--: | :--------------------------------------------------------------------------------- |
| **范围账本** | [`scope-files.json`](scope-files.json)         |  ✅  | 实测冻结 60 继承文件真源清单与度量                                                 |
| **接口面**   | [`interface.md`](interface.md)                 |  ✅  | AST 机器提取 58 模块 336 条顶层公开导出面                                          |
| **调用方**   | [`callers.md`](callers.md)                     |  ✅  | 三通道扫描（`dep-refs` + grep + AST），附带 [`callers-raw.json`](callers-raw.json) |
| **行为规格** | [`behavior.md`](behavior.md)                   |  ✅  | B1–B73 涵盖 8 个功能簇全部行为、时序、幂等与九项约定                               |
| **目标结构** | [`design.md`](design.md)                       |  ✅  | 契约对齐服务层功能模块约定、三处组合根清单与大文件拆分边界                         |
| **验收报告** | [`acceptance.md`](acceptance.md)               |  ✅  | 本文档，记录旧门实测、首败与修正过程                                               |
| **已知差异** | [`known-differences.md`](known-differences.md) |  ✅  | 红线清单（协议/数据格式/环境一字不改）与实现层允许差异                             |
| **黑盒测试** | [`tests/`](tests/)                             |  ✅  | 19 个测试套件，349 个独立测试用例（源码 + dist 双入口通过）                        |
| **合同桩**   | [`stubs/`](stubs/)                             |  ✅  | 生成器 `build-stubs.mjs` + 58 个 import-and-throw 桩与 `targets.txt`               |
| **旧门**     | [`gate-old.json`](gate-old.json)               |  ✅  | 双入口 100% 绿灯，桩替换 100% 失败验证通过（见 §3）                                |

## 3. 旧门实测结果（gate-old.json）

| 运行入口                                   | 测试文件数 | tests | pass | fail | skipped | exitCode | allFail  |
| :----------------------------------------- | :--------: | :---: | :--: | :--: | :-----: | :------: | :------: |
| **源码入口**                               |     19     |  349  | 349  |  0   |    0    |    0     |    —     |
| **dist 入口** (`KNORVIA_SVC01_ENTRY=dist`) |     19     |  349  | 349  |  0   |    0    |    0     |    —     |
| **桩替换验证** (58 目标文件)               |     19     |  19   |  0   |  19  |    0    |    1     | **true** |

- **`allFail=true` 说明**：桩替换 58 个目标源码后，19 个测试套件在文件加载或执行阶段 100% 抛出 `not implemented: services-01`，证明全部 19 个测试套件均真实依赖本包公开导出面，防刷与空测验证完全达标。
- **环境隔离说明**：遵循 shared-03 复盘经验，dist 入口通过 `--dist-env` 注入环境变量，确保桩替换在源码环境下真实执行并全部拦截。

### 3.1 Windows 挂死修复（2026-10-20）

首次 PR CI 的 `windows / quality` 撞 60 分钟 job 上限被判 cancelled（linux 正常，18m42s）。根因不在用例体内，`--test-timeout` 救不了：

- node:test 的 `after` 钩子按注册顺序 **FIFO** 执行，且**某个钩子抛错后，后续钩子不再执行**；
- 本包用例普遍先 `makeTempRoot(t)`（注册「删临时目录」）、再注册 agent 子进程的 `disposeAllAndWait`；
- Windows 上子进程退出前仍把临时目录当 cwd → 立刻 `rm -r` 抛 `EBUSY` → **dispose 钩子被顶掉** → 子进程常驻 → runner 等不到事件循环清空 → 永久挂死。

修法（`tests/helpers.mjs`，全包统一）：同一用例的全部清理走**一个** after 钩子（WeakMap 保证），
释放步骤**逆序**执行（后建立的先释放）→ 再删目录；每步独立 `try/catch`，全跑完再合并抛出；
`rm` 带 `maxRetries: 20 / retryDelay: 100` 吸收 Windows 句柄延迟释放；`releaseLast` 把「还原全局数据根」
放到最后（提前指空会让被测对象收尾时读目录抛错、掩盖真实清理问题）。钩子在**首次登记**时挂好，
因此清理不依赖「用例体是否走到最后一步」——这正是「应然失败」的用例最容易漏清理的场景。

实测（Windows，Node 24.14.0，`--test-concurrency=2` 与 `test:studio` 同 flags）：

| 运行范围                                        | 修复前 |              修复后 | 结果         |
| :---------------------------------------------- | :----: | ------------------: | :----------- |
| `agent-process.test.mjs` 单文件（35 用例）      | > 180s | 37.0 / 38.1 / 53.8s | 35/35 全过   |
| 全部 19 个测试文件（349 用例）                  |  挂死  |               68.2s | 349/349 全过 |
| 旧门（源 + dist + 桩替换，`contract-gate.mjs`） |  挂死  |              351.6s | 三段全绿     |

门禁运行器 `scripts/contract-gate.mjs` 同时补了兜底墙钟超时（默认 1800000ms，可用
`KNORVIA_CONTRACT_GATE_TIMEOUT_MS` 覆盖）并**把超时判为失败**；不使用 `--test-force-exit`
（能自然退出就不该强杀）。报告里 `timedOut`（`spawnSync` 的 `ETIMEDOUT`）与 `signaled`
（被外部信号终止，如 CI 取消）**分开记**，两者都判失败，但便于区分「夹具挂死」与「外部取消」。

### 3.2 隔离实测（无进程级清理、无真实主目录访问）

- **无进程级清理**：全部夹具中 `taskkill / pkill / killall / Stop-Process / Get-Process` **零命中**。
  仅有的杀进程都是自己 `spawn` 的句柄：`credential-broadcast.test.mjs` 的 lock-holder 子进程用
  `child.kill("SIGKILL")` 收口（已登记进统一清理钩子）；`agent-process.test.mjs` 的两处
  `process.kill(pid, 0)` 是**信号 0 探测**（只查存在性、不杀），且位于 `process.platform !== "win32"` 分支。
- **无真实主目录访问**：测试代码对 `DSH_HOME` / `.dsh` / `DSH_SESSION` / `DSH_WEB` **零引用**。
  数据根一律走 `mkdtemp(tmpdir()/svc01-)` + 公开的 `setDataBaseDir(root)`；需要家目录语义的
  命令/插件用例用 `withEnv(t, "HOME"|"USERPROFILE", <临时根>)` 显式改写，且 `withEnv` 的恢复步骤
  同样登记进统一清理钩子。
- **临时目录**：全部 `mkdtemp` 产物都登记为 `cleanup.directory(...)`，用例结束自动删除。

## 4. 首败与修正（代表性调试与行为判定）

在黑盒契约编写与双入口实跑过程中，发现并对齐了以下代表性实现细节（回写测试与 behavior.md）：

1. **Host 命令队列 Drain 状态机（`A56`）**：出队（drain）由上游 ready 事件驱动触发发送，发送后处于 `status: "running"` 状态；只有收到终端终态或后续 ready 事件时才真正移出 `pendingCommands` 队列。
2. **命令 Promote 优先级（`A56`）**：`promote` 将命令移至队首后，若原运行中命令未收口，队列快照同时包含处于 running 状态的执行项与 accepted 状态的排队项。
3. **工作区身份透传（`A57` / `A59`）**：`setMode` 与 `closeSession` 调用严格透传会话已绑定的 `workspaceIdentity`，避免在跨工作区或远端桌面会话下失去租户隔离。
4. **模型选项快照事实源（`A57`）**：`setModel` 调用后投影的配置项列表以当前会话快照中的模型选项为准；测试 mock harness 初始化时需注入模型选项快照以验证结构化分流。
5. **目标记忆前置校验（`A57`）**：`goalSession`、`stopGeneration` 等操作依赖前置已加载的工作区会话目标记忆，未加载目标时统一抛出稳定的 `KNORVIA_SESSION_TARGET_NOT_FOUND`。
6. **助手消息反馈幂等性（`A515`）**：`setAssistantMessageFeedback` 属于视图层的临时标记映射，适配层不写回底层不可变快照，跨调用不保留未持久化修改。

## 5. 说明

- **测试断言与红线**：严禁放宽测试断言，协议字段、数据目录与错误码逐字保持；
- **持续维护**：新写的 8 个功能模块（`design.md`）将在阶段二接入阶段依据本合同八件套执行，确保无感平替。
