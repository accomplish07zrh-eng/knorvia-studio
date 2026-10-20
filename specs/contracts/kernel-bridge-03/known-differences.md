# kernel-bridge-03 已知差异与缺口清单

> 本文件记录实现阶段**必须如实说明**的差异、计数修正与能力缺口。
> 与 `kernel-bridge-02/known-differences.md` 同一口径：每一条都要能指到证据。

## 一、计数修正（计划书与实际的不一致）

### D1 分母修正：legacy 端口 12 个方法，不是 11 个

| 项 | 计划书口径 | 实测口径 | 依据 |
| --- | --- | --- | --- |
| legacy 执行端口方法数 | 11 | **12** | `legacy/method-table.ts` 的 `PORT_BACKED_METHODS` 实测 12 个 |
| 02 已交付 | 4 | 4 | `session/send`、`session/stop`、`session/cancelBackgroundTask`、`session/compact` |
| 03 待交付 | 7 | **8** | 12 − 4 = 8 |

**被漏计的是 `session/close`**：它在 `PORT_BACKED_METHODS` 里（`knorviaProtocolMethods.sessionClose`），
且 `legacy/contracts.ts` L177 为它登记了 params/result schema，但：
- `legacy/session-handlers.ts` **没有** `session/close` 的 handler；
- `kernel-bridge-02` 的 `HANDLED_METHODS` 也**没有**它。

**因此它既不在 legacy 侧、也不在 02，必须归 03。** C2 的完整分母是 **12**。

> **口径纪律**：以后一律以 `PORT_BACKED_METHODS` 这张冻结表为准，不靠人工清单。
> 人工清单已两次漏掉 `session/close`。

### D2 v4 命令分母

| 项 | 数量 | 说明 |
| --- | --- | --- |
| `commandPayloadSchemas` 总数 | **34** | `packages/shared/src/protocol-v4/command.ts` 实测 |
| `kernel-bridge-01` 已实现 | **3** | `createSession`、`setFollowupMode`、`switchCollaborationMode` |
| `kernel-bridge-02` 已实现 | **5** 条命令 / **6** 个交付条目 | `sendText`、`stop`、`compact`、`resolveInteraction`，外加 `createSession` 的 `firstInput` 字段（不重复计 `createSession`） |
| **03 待覆盖** | **26** | 34 − 3 − 5 = 26（`createSession` 不重复计） |

**注意**：`setFollowupMode` / `switchCollaborationMode` 是 01 已实现的配置类命令，
03 **不重复实现**，但收口断言要把它们算进「34 条全部非 unsupported」。

## 二、能力缺口（dsh 引擎下无后端）

### D3 结构事实：`dsh` 与 `legacy` 是两个独立的进程路径

这是本次侦察最重要的发现，也是下面 10 条缺口的共同根因。

**证据链**：

1. **引擎选择**（`apps/cli/packages/cli/src/run.ts` L254 附近）：
   ```ts
   if (resolveKernelEngine(inheritedEnv) === "dsh" && !prepareStorageOnly) {
     const { runKernelProcess } = await import("@knorvia/bootstrap/kernel");
     return await runKernelProcess({ ... });        // ← dsh 分支到此为止
   }
   // ↓ 以下全部是 legacy 分支
   const env = prepareProtocolCommandEnv({ ... });
   ```
2. **`kernel/process.ts` 的本地 import 只有 4 个模块**：`constants.js`、`errors.js`、`host.js`、`logger.js`，
   加动态 `import("../kernel-bridge/entry.js")`。**不含 `app/create-app.js`。**
3. **`grep 'create-app|createKnorviaApp|AgentRuntime'` 于 `bootstrap/src/kernel/**` → 零命中。**
4. 因此 dsh 引擎**不构造** legacy 的 `KnorviaApp`，也就拿不到它闭包里的任何后端。

### D4 工作流 3 条：dsh 引擎下无后端

| 命令 | legacy 实现位置 | 依赖（全是 legacy app 闭包内变量） |
| --- | --- | --- |
| `resumeWorkflowRun` | `app/create-app.ts` L1221 | `dynamicWorkflowRunPort.resume`、`getRuntime().trackResumedDynamicWorkflowRun` |
| `startSavedWorkflow` | 同文件 L1245 | `prepareUserExecutionBoundary`、`getRuntime().startSavedWorkflowRun` |
| `amendWorkflowRunSettings` | 同文件 L1262 | `dynamicWorkflowRunPort.amend`、`getScript`、`getRuntime()` |

`dynamicWorkflowRunPort` 的构造在 L587：
```ts
const dynamicWorkflowJournal = resolveDynamicWorkflowJournalStore(sessionStore, logger);
const dynamicWorkflowRunPort = dynamicWorkflowJournal === undefined ? undefined
  : createDynamicWorkflowRunService({ concurrency: workflowConcurrencyGovernor, createActorRuntime: ... })
```
它需要 `sessionStore`（SqliteSessionStore）、`workflowConcurrencyGovernor`、`createScriptWorkflowAgentRuntime`
—— **dsh 引擎侧都没有。**

**补充**：`apps/cli/packages/dynamic-workflow` 与 `dynamic-workflow-runtime` 是**库**（导出编译器、静态分析器、
Facade DTS、artifact 能力等），**不是可挂载的运行时服务**：它们缺少「会话、模型调用、工具执行」那一层，
而那层由 legacy 的 `AgentRuntime` 提供。

### D5 工作区钩子 5 条：dsh 引擎下无后端

| 命令 | 说明 |
| --- | --- |
| `respondWorkspaceHookReview` | legacy 侧由 `protocol-v4/commands/handlers/interaction-background.ts` 实现，依赖 legacy 的 hook review 存储 |
| `toggleWorkspaceHookReviewItem` | 同上 |
| `revokeWorkspaceHookTrust` | 同上 |
| `requestWorkspaceHookReview` | 同上 |
| `snoozeInteractionAutoResolution` | 同上 |

**旁证**：`kernel/host.ts` 里有一行 `callKernelLogger(logger, "debug", "hooks.compat=disabled")`
—— dsh 引擎**主动声明**关闭了 hook 兼容。

### D6 `discardSharedContext`：dsh 引擎下无存储

| 项 | 实测 |
| --- | --- |
| 协议形状 | `{ contextId: string }`（`.strict()`，`command.ts` L243） |
| legacy 实现 | `protocol-v4/commands/handlers/session-mgmt.ts` L173 —— 经 host 的 `discardSharedContext(sessionId, contextId)` |
| legacy 桥接 | `protocol/v4-bridge.ts` L901 —— 用 `context.deps.sessionStore` |
| dsh 侧 | `grep 'sessionStore|sharedContext|discardShared'` 于 `bootstrap/src/kernel/**` → **零命中** |

**结论**：归入缺口。dsh 的会话持久化是 `@deepseek-ai/dsh-session-persistence-jsonl`（JSONL），
不是 legacy 的 SqliteSessionStore，「共享上下文导入」这套存储在新内核里尚未重建。

**归属（Lead 2026-10-20 裁决）：`kernel-plugin-workflow`**。理由：
1. 它与工作流同属「**跨会话数据传递**」——`discardSharedContext` 是丢弃一份被导入会话的共享上下文；
2. **不为一条命令新开一个包**（计划书按功能模块分包，一条命令不构成一个包）；
3. 计划书**未单独登记** shared-context 包，强行新增会扩大 `kernel-switch` 的前置包数量。

因此 `kernel-plugin-workflow` 的范围是 **4 条**：`resumeWorkflowRun` / `startSavedWorkflow` /
`amendWorkflowRunSettings` / `discardSharedContext`。

### D7 `applyFileRewind`：依赖未建的 `kernel-plugin-rewind`

| 项 | 实测 |
| --- | --- |
| `kernel-plugin-rewind` | **不存在**（`specs/contracts/` 与 `bootstrap/src/kernel-bridge/` 均无） |
| legacy 侧 | 有 `protocol-v4/commands/handlers/file-rewind.ts` |
| DSH 侧 | 无对应能力 |

**分工**：命令面归 03（校验载荷、admission、产出冻结 ACK、如实回能力缺席）；
文件回退的存储与恢复归未来的 `kernel-plugin-rewind`。

## 三、缺口命令的处置口径

### D8 用专门 reasonCode，而不是 `unsupported`

**10 条**缺口命令（D4 的 3 + D5 的 5 + D6 的 1 + D7 的 1）**不使用 `unsupported`**，
改用**已核准并冻结**的 `fault.command.capabilityAbsent`，以区分三种不同的失败：

| reasonCode | 语义 | 客户端应当 |
| --- | --- | --- |
| `unsupported` | **实现进度**：段 A 尚未接入这条命令 | 视为 bug（B25 收口断言要求 34 条全非它） |
| `fault.command.capabilityUnsupported` | **设计如此**：该能力**永不支持**（既有先例） | 显示「不支持此功能」（终态） |
| **`fault.command.capabilityAbsent`** | **当前缺失**：能力**待补**，有明确归属包 | 显示「当前内核暂不支持，后续版本提供」（过渡态） |

**字面量为什么是它**（同族依据）：既有先例 `fault.command.capabilityUnsupported` 的形状是
`fault.<域>.<原因>`，本包的取法与之**同域同形**，只把「Unsupported（永不）」换成「Absent（当前缺）」。

**与「不新增错误码」红线的区分**：红线指**不新增 JSON-RPC 数字错误码**（`-32004`/`-32031`/`-32601`/`-32602`/`-32603`）；
`data.reasonCode` 是**业务层字符串**，可以新增（既有 `unsupported`、`alreadyResolved`、`capabilityUnsupported` 都在这一层）。

**依据**（协议层已为此留了余地）：`resumeWorkflowRun` 等命令的 payload **不携带 `baseRevision`**，
`command.ts` 的注释写明「workflowRuns 面免 revision，**假 CAS 失败只会误伤**」——
说明协议设计本来就允许这些命令失败而不牵连会话状态。所以「如实回能力缺席」是**协议预留的处理方式**，
不是本包发明的降级。

### D9 这不等于「删除功能」

代码仍在 legacy 分支（`create-app.ts`、`protocol-v4/commands/handlers/**`）。
`kernel-switch` 只是把默认引擎切到 dsh，**不会删除 legacy 代码**。
真正的功能可用性取决于 `kernel-plugin-workflow` / `kernel-plugin-hooks` / `kernel-plugin-rewind`
三个接入包是否在 switch 之前完成。

## 四、实现阶段的参考材料（可用于逐组移植语义）

legacy 的 v4 原生 handler 已按命令分组分文件，是**语义参考**（不是可复制的实现）：

| 文件（`protocol-v4/commands/handlers/`） | 覆盖的命令组 |
| --- | --- |
| `session-flow.ts` | `createSession`、`sendText` 等的流程 |
| `queue.ts` | `sendQueuedNow`、`editQueueItem`、`reorderQueueItem`、`deleteQueueItem`、`setAutoDrain`、`setFollowupMode` |
| `session-mgmt.ts` | `createSession`、`renameSession`、`deleteSession`、`discardSharedContext` |
| `selection-side-session.ts` | `createSelectionSideSession` |
| `goal-compact.ts` | 目标命令 + 压缩队列处置 |
| `model-config.ts` | `switchModelConfig` |
| `interaction-background.ts` | `resolveInteraction`、钩子 5 条、`cancelBackgroundWork`、工作流 3 条 |
| `fork-edit-retry.ts` | `forkAssistant`、`editUserQuery`、`retryTurn` |
| `file-rewind.ts` | `applyFileRewind` |
| `assistant-feedback.ts` | `setAssistantFeedback` |

**纪律**：读它理解语义，**不逐行改写**（相似度门会拦，且这正是「独立实现」的要求）。
每一组都要能对着 v4 冻结面独立写出，并记录相似度实测。

## 五、队列 5 条命令的**修正结论**（重要，取代 README §四 的初步判断）

README §四 最初写「队列的**唯一所有者**必须是 `CommandInbox`，不能让 DSH 的 inbox 变成第二个队列所有者」。
**实现前侦察推翻了其中一半**，此处按实测修正。

### 5.1 事实：DSH 的 `Inbox` 本身就是可编辑队列

`node_modules/@deepseek-ai/dsh-agent/lib/types/*.d.ts` 的 `Inbox` 接口实测：

| 方法 | 语义 | 对应 v4 命令 |
| --- | --- | --- |
| `append(target, message)` | 追加 | （02 已在用） |
| `prepend(target, message)` | 前插 | `reorderQueueItem`（移到队首） |
| `replace(messageId, newMessage): boolean` | **原位替换**，返回「是否仍在队列」 | `editQueueItem` |
| `remove(messageId): boolean` | **移除**，返回「是否仍在队列」 | `deleteQueueItem` |
| `splice(target, start, deleteCount, inserted)` | 标准拼接 + 持久记录 | `reorderQueueItem`（任意位置） |
| `clear()` | 清空全部未决输入 | （`stop` 的队列处置） |

**所以 DSH 的 inbox 不是「只接收、不可编辑」的管道，它本来就是可编辑队列。**
我之前「DSH inbox 没有可编辑队列视图」的判断**是错的**，这里更正。

### 5.2 但「单一所有者」的结论**仍然成立**，理由变了

正确的理由不是「DSH 不能编辑队列」，而是：

1. **v4 的 `order.queuePosition` 是协议事实**，它必须与服务端真实队列一致；
2. DSH 的 `nextTurn` / `nextStep` 是**两个**列表（回合级 vs 步级），而 v4 的队列是**一个**线性序列；
3. 因此必须有一个**权威映射**：v4 `queueItemId`（= `CommandInbox` 侧的 id）↔ DSH `MessageId`。

**结论**：`CommandInbox` 仍是**队列身份的权威所有者**（谁在队里、位次多少），
但**队列内容的实际变更由它调用 DSH `Inbox` 的方法完成**——不是「绕过 DSH」，而是「DSH 提供原语、`CommandInbox` 提供身份与顺序」。

### 5.3 由此产生的实现要求

| # | 要求 |
| --- | --- |
| R1 | `CommandInbox` 必须维护 `queueItemId → MessageId` 的映射；映射缺失即「该项已被 drain/删除」 |
| R2 | `editQueueItem` = `replace(messageId, newMessage)`；返回 `false` 表示已不在队列 → 按冻结面回拒绝 |
| R3 | `deleteQueueItem` = `remove(messageId)`；同上 |
| R4 | `reorderQueueItem` = 先 `remove` 再 `splice` 到目标位次（`beforeQueueItemId === null` → 队尾） |
| R5 | `sendQueuedNow` = 把该项提升为「立即执行」：从队列移除 + 作为新回合输入提交；**必须处理「提升成功但移除失败」的中间态**（legacy 用 `V4QueuePromotionCommitError` 表达，本包沿用同类 reasonCode） |
| R6 | `setAutoDrain`：DSH **没有** autoDrain 概念（实测零命中）→ 这是纯 v4 侧的调度策略，由 `CommandInbox` 自己持有 |
| R7 | **核心可判定断言**：任何队列操作后，v4 `order.queuePosition` 必须与 `Inbox.nextTurn.length`（队列态）一致 |

### 5.4 仍需实现阶段确认的两点

| # | 疑点 | 处置 |
| --- | --- | --- |
| U1 | `nextTurn` 与 `nextStep` 两个列表如何映射到**一个** v4 线性队列？`nextStep` 是「下一步边界就并入」的（02 的 `guide` 就用它），它是否应出现在 v4 的 `order` 里？ | 实现阶段对照 legacy `queue.ts` 的 `inputIntentMetadataFromQueueItem` 与协议 `order` 定义确认，**合同阶段不拍板** |
| U2 | `sendQueuedNow` 的「取消当前回合再执行」是否需要 `stop` 语义？legacy 用 `preemptActiveTurnAndWait` | 需要查 DSH `agent.cancel({kind:"user"})` 的语义是否等价，**合同阶段不拍板** |