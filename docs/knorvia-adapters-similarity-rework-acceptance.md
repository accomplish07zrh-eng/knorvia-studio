<!-- SPDX-License-Identifier: MIT; Copyright (c) 2026 Knorvia Studio contributors -->

# adapters 相似度返工验收（#124 (a) 类 8 + (b) 类 7 + (c) 类 52 + (d) 类 10）

2026-10-20。本批处理 #124 里「相似度工具防刷口径上线后由过变不过」的 77 个文件中属于本线的部分。范围：`apps/cli/packages/adapters/src/**`。工作树 `wt/exec-adapters`，分支 `rework/adapters-similarity`，认领 issue #224。

## 一、计分口径

**实现文件按普通模式计分，纯声明/桶文件按声明模式计分。** 依据：

1. `specs/contracts/shared-01/README.md`「九、计分口径（替换阶段）」：「实现文件（`wire-codec.ts`、`atomicFileLock.ts`、各 reducer…）：相似度工具**普通模式**（行 + 结构两道门槛）」；「纯声明与桶文件：`--declaration --interface specs/contracts/shared-01/interface.md`」。
2. 实测：本线 52 个 (c) 类文件在 `specs/contracts/apps-cli-packages-01/interface.md` 的 55 个模块清单中**零命中**（逐文件 `grep "adapters/src/<相对路径>.ts"` 无结果），即它们都是私有实现模块，没有「合同写死的公开声明」需要剔除。

声明门每批仍跑一遍并留 JSON 报告（`wt/exec-batchA-decl.json` 等）作参考证据；判定只用上表口径。仅 D 批的 `storage/index.ts`、`http/index.ts` 这类 barrel 与 E 批触及的公开面按声明门判定。

三道门槛常量不变：行门槛 ≥10 行时包含率 <0.20 且最长相同段 <8，<10 行时包含率必须为 0；结构门槛 <0.40；压行字面量拆分门禁（packed-literal-split）命中即失败。

## 二、(a) 类：随 kernel-switch 删除，不返工（8 个）

依据：`specs/knorvia-builtin-kernel-dsh.md`「现有包的去向」——`core`（417）「运行时、工具调度、权限、压缩、上下文等由 DSH 与 Knorvia 插件取代；切换完成后整包删除」；`adapters`（53）「模型适配由 pi-ai 取代后删除」。

| 文件                                                                        | 删除依据                                                           | 判定日期   |
| --------------------------------------------------------------------------- | ------------------------------------------------------------------ | ---------- |
| `apps/cli/packages/core/src/runtime/methods/support/event-pipeline.ts`      | `core` 整包随切换删除（规格「现有包的去向」）                      | 2026-10-20 |
| `apps/cli/packages/core/src/runtime/methods/support/recover-step.ts`        | 同上                                                               | 2026-10-20 |
| `apps/cli/packages/core/src/runtime/methods/support/sink-notify.ts`         | 同上                                                               | 2026-10-20 |
| `apps/cli/packages/core/src/runtime/methods/support/status-log-table.ts`    | 同上                                                               | 2026-10-20 |
| `apps/cli/packages/core/src/runtime/methods/support/stream-event-record.ts` | 同上                                                               | 2026-10-20 |
| `apps/cli/packages/core/src/browser-client/runtime-installation.ts`         | 同上                                                               | 2026-10-20 |
| `apps/cli/packages/core/src/tool/executor/display-text.ts`                  | 同上                                                               | 2026-10-20 |
| `apps/cli/packages/adapters/src/model/runner-debug-redaction.ts`            | `adapters` 模型适配「由 pi-ai 取代后删除」（规格「现有包的去向」） | 2026-10-20 |

本线不改这 8 个文件的代码。它们在 #124 的 77 个清单里仍有旧值（例如 `runtime-installation.ts` 0.194→0.200、`display-text.ts` 0.182→0.400），随 `kernel-switch` 删除后不再计分。

## 三、(b) 类：已完成，不重做（7 个）

| 文件                                                         | 返工 PR | 说明                                                                                                 |
| ------------------------------------------------------------ | ------- | ---------------------------------------------------------------------------------------------------- |
| `packages/shared/src/node/nodeSelfResourceTelemetry.ts`      | #210    | shared-01 返工线已完成                                                                               |
| `packages/shared/src/protocol-v4/profiles.ts`                | #210    | 同上                                                                                                 |
| `packages/shared/src/protocol-v4/shared-context-import.ts`   | #210    | 同上                                                                                                 |
| `packages/shared/src/protocol-v4/wire-codec.ts`              | #210    | 同上；该文件是 VS Code 复制组件登记的 root，`third-party/inventory.json.inputs` 的摘要已随 #210 同步 |
| `packages/shared/src/protocol-v4/workflow-artifact.ts`       | #210    | 同上                                                                                                 |
| `packages/shared/src/protocol-v4/workflow-runs-lineage.ts`   | #210    | 同上                                                                                                 |
| `apps/cli/packages/node-repl-host/src/broker-transaction.ts` | #203    | node-repl-host 返工线已完成                                                                          |

## 四、(d) 类：10 个待归属文件的逐文件判定

判定口径（规格「旧数据」2026-10-19 补充）：「凡是打开任一历史版本的旧库（含按顺序执行已有迁移）、读取会话列表、消息、工具结果、压缩摘要、目标记录与工作区检查点，以供展示和一次性导入所需的存储代码，都属于保留范围；只服务旧运行时写入新会话或在旧库内 fork、提交共享上下文的代码，随 `kernel-switch` 删除。工作区 Hook 信任存储随 Knorvia Hook 插件保留；动态工作流日志（dwf-journal）归动态工作流包。逐文件归属由 `kernel-legacy-sessions` 合同按导入与展示路径的实际引用（`pnpm dep:refs`）确定。」

### 4.1 保留并返工（4 个，纳入本线）

| 文件                                                 | `pnpm dep:refs` 实测引用                                                                                                                                                                                                                                                                                                                           | 归属理由                                                                                                                                                                |
| ---------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `storage/session-store/json.ts`                      | `encodeJson` 被 `repositories/dwf-journal.ts`、`dwf-journal-run-state.ts`、`input-history.ts`、`message-storage.ts`、`script-workflow-*.ts`、`session-entries.ts`、`session-inputs.ts`、`session-records.ts`、`usage-writes.ts` 引用；`decodeJson` 被 `session-store/codecs.ts`、`local-settings.ts`、`project-permission-cell.ts`、各 codecs 引用 | `codecs.ts` 是「行 → 契约对象」解码层，被 `repositories/session-records.ts`（`getSession`/`listSessions`）与 `session-scopes.ts` 使用，属「读取会话列表、消息」保留路径 |
| `storage/session-store/record-projection.ts`         | `isJsonRecord`/`projectRecord` 被 `session-store/codecs.ts` 与 `repositories/permission-full-access-payload.ts` 引用                                                                                                                                                                                                                               | 同属行解码层，服务上述读路径                                                                                                                                            |
| `storage/session-store/session-store-connection.ts`  | `openSessionDatabase`、`initializeSessionDatabase`、`checkSessionWriteFault` 被 `sqlite-session-store.ts` 引用                                                                                                                                                                                                                                     | 规格把「打开任一历史版本的旧库（含按顺序执行已有迁移）」明确列入保留范围；本文件是该动作的唯一实现                                                                      |
| `storage/session-store/repositories/usage-values.ts` | `usageCount` 被 `repositories/usage-task.ts#queryTaskUsage` 与 `usage-writes.ts` 引用                                                                                                                                                                                                                                                              | 见 4.4 的单独说明                                                                                                                                                       |

### 4.2 随 kernel-switch 删除，不返工（3 个）

| 文件                                                      | 删除依据                                                                                       | 引用计数                                                                                                                                                                                                                                                                                      | 判定日期   |
| --------------------------------------------------------- | ---------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------- |
| `storage/session-store/repositories/write-transaction.ts` | 规格「只服务旧运行时写入新会话或在旧库内 fork、提交共享上下文的代码，随 `kernel-switch` 删除」 | `withWriteTransaction` 39 处引用，**全部是写路径**（`save*`、`fork-commit`、`shared-context-commit`、`usage-writes`、`session-target*`、`todos`、`input-history`、`script-workflow-*`）；读路径（`getSession`/`listSessions`/`messages`/`sessionEntries`/`readTodos`/`readTarget`）都不经过它 | 2026-10-20 |
| `storage/session-store/shared-context-commit.ts`          | 规格原文点名「提交共享上下文」在删除集合内                                                     | 引用者只有 `sqlite-session-store.ts` 的两个端口方法（`commitSharedContextImportBundle`、`transitionSharedContextImport`）                                                                                                                                                                     | 2026-10-20 |
| `storage/session-target.ts`                               | 规格把「目标**记录**」列入保留读取范围，但本文件只含目标**写**入口                             | 导出 `setSessionTarget`/`cloneSessionTargetForFork`/`createSessionTarget`/`updateSessionTargetStatus`/`updateSessionTargetSummaryTitle`/`clearSessionTarget` 全部是写；目标**读**（`readSessionTarget`）在 `session-target-record.ts`，不在本文件                                             | 2026-10-20 |

### 4.3 dwf-journal 三个文件：按 lead 裁决归本线，并入批 E 返工

~~本线不碰这三个文件。~~ **2026-10-20 lead 裁决已推翻先前的「移交动态工作流线」处置**，以裁决为准：三个文件**留在原地**、归本线返工到过线，并入批 E。理由：规格「旧数据」里「动态工作流日志（dwf-journal）归动态工作流包」是**删除范围**口径，不是物理搬迁要求；搬迁会牵动 session-store 导入链与 SQLite 事务归属，高风险且不满足任何验收项；M6 只要求「登记文件全量重扫零违规」，原地返工同样满足。返工后仍登记 `independent-replacement`，只刷新 basis 实测值，不改分类。

本节措辞将在批 E 的 PR 里整段重写（不在批 A 单独开 PR）；下表保留作立项时的引用事实：

| 文件                                                              | 引用者                                                |
| ----------------------------------------------------------------- | ----------------------------------------------------- |
| `storage/session-store/repositories/dwf-journal-artifacts.ts`     | 只有 `dwf-journal.ts`、`dwf-journal-introspection.ts` |
| `storage/session-store/repositories/dwf-journal-introspection.ts` | 只有 `dwf-journal.ts`                                 |
| `storage/session-store/repositories/dwf-journal-run-state.ts`     | 只有 `dwf-journal-codecs.ts`、`dwf-journal.ts`        |

### 4.4 `usage-values.ts` 的单独说明（规格未覆盖，按默认裁决表保留）

规格「旧数据」保留范围列的是「会话列表、消息、工具结果、压缩摘要、目标记录、工作区检查点」六类读项 + 一次性导入 + 只读展示，**没有列「用量统计」**。本文件的判定：

- **不在删除集合内**：它不是「写新会话」「旧库内 fork」「提交共享上下文」三类之一。
- **被读路径使用**：`usageCount` 经 `repositories/usage-task.ts#queryTaskUsage` 读取旧库 `model_usage` 表并聚合成 `TaskUsageQueryResult`；`usage-writes.ts` 是写入侧。
- **按计划书默认裁决表保守保留**：「不确定某段代码是否还有用 → 保留并写进合同，不删」。
- **行为待复核**：其数据源由旧运行时写入；新内核是否读这份统计取决于 `kernel-legacy-sessions` 与用量展示入口的最终形态。本文档标记为「行为待 `kernel-legacy-sessions` 合同复核」，**仍然返工不删除**（不冒缩小范围的风险）。

## 五、(c) 类 52 个文件的返工实测

数值为「旧值（`origin/main` @ `526825db`，新工具口径）→ 新值」，计分模式见第一节。门槛：containment <0.20、run <8、结构 <0.40。

### 5.1 exec（14 个）

| 文件                                       | 行数    | containment 旧→新 | run 旧→新 | 结构旧→新   |
| ------------------------------------------ | ------- | ----------------- | --------- | ----------- |
| `exec/bash-file-output.ts`                 | 149→181 | 0.537→**0.160**   | 8→**3**   | 0.052→0.008 |
| `exec/bash-output-policy.ts`               | 16→14   | 0.250→**0.071**   | 2→**1**   | 0.000→0.000 |
| `exec/bash-output-preview.ts`              | 27→25   | 0.407→**0.040**   | 6→**1**   | 0.000→0.000 |
| `exec/bash-progress-poller.ts`             | 41→36   | 0.317→**0.083**   | 4→**2**   | 0.030→0.031 |
| `exec/bash-resource-telemetry.ts`          | 68→91   | 0.456→**0.176**   | 7→**3**   | 0.058→0.042 |
| `exec/bash-shell-provider.ts`              | 113→123 | 0.265→**0.138**   | 8→**3**   | 0.020→0.000 |
| `exec/bash-startup-script.ts`              | 52→54   | 0.385→**0.167**   | 9→**2**   | 0.182→0.100 |
| `exec/cwd-capture.ts`                      | 43→57   | 0.488→**0.158**   | 6→**3**   | 0.000→0.000 |
| `exec/node-execution-adapter.ts`           | 34→35   | 0.206→**0.029**   | 4→**1**   | 0.033→0.000 |
| `exec/node-execution-adapter-base.ts`      | 165→208 | 0.236→**0.115**   | 5→**3**   | 0.012→0.015 |
| `exec/node-execution-adapter-lifecycle.ts` | 234→268 | 0.295→**0.194**   | 6→**4**   | 0.011→0.009 |
| `exec/node-execution-adapter-process.ts`   | 200→205 | 0.245→**0.190**   | 5→**5**   | 0.021→0.020 |
| `exec/outputEncoding.ts`                   | 140→150 | 0.329→**0.193**   | 6→**4**   | 0.020→0.016 |
| `exec/process-tree.ts`                     | 66→68   | 0.424→**0.162**   | 4→**3**   | 0.096→0.031 |

### 5.2 `bash-resource-telemetry.ts` 保留的判断链

计划书 M0-14「选择 4」写的是「没有去向的遥测模块直接删除」。本文件不适用该条：

1. 该条针对的是 `telemetry` 包（12 个继承文件）；规格「现有包的去向」对该包写的是「无上游遥测去向时删除；本地诊断指标如需保留，改由 Knorvia 插件提供」。
2. `bash-resource-telemetry.ts` 位于 `adapters`，规格对该包写的是「模型适配由 pi-ai 取代后删除；存储保留旧会话库读取；**其余按需保留**」。执行资源采样不在被删的三类里。
3. 它的产物经 `onToolExecResource` 进入工具执行资源统计；`kernel-dsh-builtins` 挂载 DSH 内置 bash 工具时仍需同等的执行观测，属「按需保留」。

因此按「其余按需保留」重写，不删。

### 5.3 exec 的改法（不是润色）

- **类 → 闭包工厂 + 接口**：`BashFileOutput`、`ExecutionCoordinator`、`ExecutionLifecycle` 三个都改了。句柄、归属标记、取消句柄全部收进闭包作用域；对外只保留成员名。函数切分与旧文件的类方法序列不再一一对应。
- **位置参数 → 单对象入参**（内部函数）。公开 API `decodeExecutionOutputBuffer` 保持位置参数（契约测试按位置调用）。
- **控制流换形态**：UTF-8 前缀判定改成「首字节宽度表 + 码点下界表」；shell 探测改成候选表 + `firstExecutable` 归约；信号投递收敛成具名 `deliver` / `signalGroupOrChild`；体积与进度观察改成显式订阅槽表（`dials` / `slots`）。
- **内部数据形状**：多次赋值改一次构造（`makeRead`、`buildSample`、`spawnFailureResult`）；布尔标志组合改成显式阶段常量（`PHASE.foreground/background/settling`）。
- **注释全部重写**：`node-execution-adapter-lifecycle.ts` 文件头显式写出时序约束（started 事件同步决策、转后台只发生一次、结算顺序），并注明「编排段一律内联，不抽 async 助手——每多一个 await 边界就多一个微任务」。

## 六、门禁结果

### 6.1 相似度

批 A（exec 14）：`similarity.mjs` normal 门 **14/14 通过**，0 失败。报告 `wt/exec-batchA-normal.json`；声明门参考报告 `wt/exec-batchA-decl.json`（11 个私有模块在声明模式下反而超标，见第一节口径说明，不作判定）。

### 6.2 隔离与进程安全（2026-10-20 实测）

本线全部执行 Agent 与用户 GUI 都跑在 DSH 之上，因此进程与主目录两条边界按硬禁令自查，实测证据如下（扫描范围 `apps/cli/packages/adapters/src/**`、`test/**`、`scripts/**`）：

| 检查项                                                                            | 结论     | 实测证据                                                                                                                                                                                                                                                                                                                          |
| --------------------------------------------------------------------------------- | -------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 无进程级批量清理（`taskkill /IM`、`pkill -f`、`killall`、按可执行名或端口批量杀） | **通过** | 全树命中 15 处进程终止调用，逐处核对**全部按 PID 定向**：`exec/node-execution-adapter-process.ts:256` 用 `taskkill /pid <pid> /t /f`（自己 `spawn` 得到的句柄）；`mcp/process-tree.ts:191` 用 `taskkill /pid … /T /F`；`scripts/desktop-release-portable-launch.mjs:351` 用 `taskkill /PID <child.pid> /T /F`。无一按可执行名匹配 |
| 杀进程只沿自己 `spawn` 出的 pid 树向下                                            | **通过** | `mcp/process-tree.ts` 的 Unix 分支用 `pgrep -P <parent>`，回退 `ps -eo pid=,ppid=` 后按 ppid 逐层 `descend`（第 100/120/139/144 行），从根 pid 向下的后代枚举，不按可执行名枚举                                                                                                                                                   |
| 无 `Get-Process` 按名枚举                                                         | **通过** | 唯一出现处 `storage/workspace-hook-trust-process.ts:17` 为 `Get-Process -Id <id>`（按 Id 取 `StartTime`），不枚举、不终止                                                                                                                                                                                                         |
| 不读写真实 DSH 主目录                                                             | **通过** | 全树搜 `DSH_HOME`、`.dsh`、`DSH_SESSION_ID`、`DSH_WEB_URL` **零命中**                                                                                                                                                                                                                                                             |
| 夹具不硬编码真实用户目录                                                          | **通过** | 全树搜 `C:\Users`、`/home/<name>`、`~/`、本机用户目录名 **零命中**                                                                                                                                                                                                                                                                |
| 夹具用临时根                                                                      | **通过** | `mkdtemp` 15 处；`mcp-lease-provider.fixture.ts:43`、`mcp-refresh.fixture.ts:323`、`http-transport-options.test.ts:23` 均为 `mkdtemp(join(tmpdir(), …))`，并断言 `dirname` 落在 `tmpdir()` 内、`relative` 无逃逸；`device-fs-contract` 的 home 是虚拟世界字段（`w.home` / `homedir()=>b.get().home`），不触碰真实主目录           |
| 跨入口不靠 `instanceof` 判接口                                                    | **通过** | 契约测试两入口（源码 118/118、dist 118/118）同时通过，说明源码与 dist 各持的类对象未被跨入口混用                                                                                                                                                                                                                                  |

批 B–E 保持同一边界：`mcp/**`（批 C）涉及 `process-tree`、`oauth-errors` 的改动会复核 PID 定向与错误分流方式；`http/**`、`network/**` 夹具继续用 `mkdtemp` 临时根。

### 6.3 契约测试（两种入口）

`specs/contracts/apps-cli-packages-01/tests/*.test.ts`：

| 入口                                  | 结果                              |
| ------------------------------------- | --------------------------------- |
| 源码（`KNORVIA_ADAPTERS_ENTRY` 未设） | **118 / 118 通过**，0 失败 0 跳过 |
| dist（`KNORVIA_ADAPTERS_ENTRY=dist`） | **118 / 118 通过**，0 失败 0 跳过 |

另跑执行子系统自有契约套件 `apps/cli/packages/adapters/test/exec-runtime-contract`：**62 / 62 通过**。

### 6.4 构建与类型

- `pnpm --filter @knorvia/adapters build`：通过。
- `tsc --noEmit -p apps/cli/packages/adapters/tsconfig.json`：通过（0 诊断）。
- `pnpm fmt` 已在每次门槛测量前执行（格式化会重新折行，先 fmt 再测）。

## 七、批次进度

| 批  | 内容                                                                                                             | 文件数 | 状态          |
| --- | ---------------------------------------------------------------------------------------------------------------- | ------ | ------------- |
| A   | `exec/`                                                                                                          | 14     | 完成（本 PR） |
| B   | `plugins/`                                                                                                       | 18     | 进行中        |
| C   | `mcp/`                                                                                                           | 15     | 待做          |
| D   | `auth/browser.ts`、`http/index.ts`、`http/public-egress-policy.ts`、`network/http-config.ts`、`storage/index.ts` | 5      | 待做          |
| E   | (d) 保留 4 个 + dwf-journal 3 个                                                                                 | 7      | 待做          |

合计返工 **63** 个（52 (c) + 4 (d) 保留 + 3 dwf-journal + 4 见下），不返工 11 个（8 (a) + 3 (d) 随切换删除）。

对账口径（lead 裁决已采纳，见 #224）：`lead/rework77.txt` 里 adapters **63** 个文件必须逐文件闭合，**「在清单里」与「需要返工」是两件事**：

```
77 = adapters 63 + core 7（随切换删除，不归本线）+ shared 6（已完成 #210）+ node-repl-host 1（已完成 #203）
adapters 63 = (c) 返工 52（A14 + B18 + C15 + D5）
            + (d) 保留→返工 4（批 E）
            + dwf-journal 返工 3（批 E）
            + (d) 随切换删除 3（write-transaction / shared-context-commit / session-target）
            + (a) 随切换删除 1（model/runner-debug-redaction.ts）
```

本线返工合计 **59**（52 + 4 + 3），不返工 4（3 (d) + 1 (a)）。逐文件对账表见 #224 评论。
