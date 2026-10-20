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

### 4.3 不属本线，归动态工作流包（3 个）

规格「旧数据」原文：「动态工作流日志（dwf-journal）归动态工作流包」。

| 文件                                                              | 引用者                                                |
| ----------------------------------------------------------------- | ----------------------------------------------------- |
| `storage/session-store/repositories/dwf-journal-artifacts.ts`     | 只有 `dwf-journal.ts`、`dwf-journal-introspection.ts` |
| `storage/session-store/repositories/dwf-journal-introspection.ts` | 只有 `dwf-journal.ts`                                 |
| `storage/session-store/repositories/dwf-journal-run-state.ts`     | 只有 `dwf-journal-codecs.ts`、`dwf-journal.ts`        |

本线**不碰**这三个文件，也不为让它们过线而改。已在 issue #224 登记，并同步 lead（lead 会记到 #124 的 (d) 类处置与动态工作流线的准入项）。

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

### 6.2 契约测试（两种入口）

`specs/contracts/apps-cli-packages-01/tests/*.test.ts`：

| 入口                                  | 结果                              |
| ------------------------------------- | --------------------------------- |
| 源码（`KNORVIA_ADAPTERS_ENTRY` 未设） | **118 / 118 通过**，0 失败 0 跳过 |
| dist（`KNORVIA_ADAPTERS_ENTRY=dist`） | **118 / 118 通过**，0 失败 0 跳过 |

另跑执行子系统自有契约套件 `apps/cli/packages/adapters/test/exec-runtime-contract`：**62 / 62 通过**。

### 6.3 构建与类型

- `pnpm --filter @knorvia/adapters build`：通过。
- `tsc --noEmit -p apps/cli/packages/adapters/tsconfig.json`：通过（0 诊断）。
- `pnpm fmt` 已在每次门槛测量前执行（格式化会重新折行，先 fmt 再测）。

## 七、批次进度

| 批  | 内容                                             | 文件数 | 状态          |
| --- | ------------------------------------------------ | ------ | ------------- |
| A   | `exec/`                                          | 14     | 完成（本 PR） |
| B   | `plugins/`                                       | 18     | 进行中        |
| C   | `mcp/`                                           | 15     | 待做          |
| D   | `auth/`、`http/`、`network/`、`storage/index.ts` | 5      | 待做          |
| E   | (d) 保留 4 个                                    | 4      | 待做          |

合计返工 **56** 个（52 (c) + 4 (d)），不返工 11 个（8 (a) + 3 (d) 删除），移交动态工作流线 3 个（dwf-journal）。
