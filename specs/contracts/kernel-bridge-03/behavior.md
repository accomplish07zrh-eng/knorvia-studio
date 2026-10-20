# kernel-bridge-03 行为规格

> 每条都是**可判定断言**（能用一个测试表达「通过/失败」），与 `kernel-bridge-02/behavior.md` 同一口径。
> 缺口类条目（B20–B22）的判定口径见 `known-differences.md` §三。

## 分组 A：纯投影 / 配置类（5 条）

### B1 `renameSession` 改标题并产出投影

**断言**：对已存在会话发 `renameSession { title }` → ACK `accepted`；
快照中该会话的标题变为新值；同值重发按配置类语义处理（不产生第二条事件）。

### B2 `setAssistantFeedback` 设置/清除反馈

**断言**：`{ feedback: "like" }` → 该行 `feedback` 为 `like`；`{ feedback: null }` → 清除（变回无反馈）；
非法的 `target` → 拒绝，不产生投影。

### B3 `switchModelConfig` 切换模型

**断言**：`{ provider, model, thought }` → 投影产出 `modelChange` 行（`rows.ts` 已定的行类型）；
快照 `config.modelSelection` 随之更新；**不触发模型轮**（配置类，不是回合命令）。

### B4 `deleteSession` 删除会话

**断言**：`{}` → 会话从快照消失；对已删除会话重发 → 按会话不存在处理（`proto.sessionNotFound`），
**不抛内部错误**。删除后其队列项一并清理（不留下悬挂 `queueItemId`）。

### B5 `discardSharedContext`：**能力缺口**（见 B20）

---

## 分组 B：队列操作（5 条）— 本包最容易出错的一组

统一前置事实（`known-differences.md` §五）：`CommandInbox` 持有 **v4 `queueItemId` ↔ DSH `MessageId`** 的映射；
队列内容的实际变更调 DSH `Inbox` 的公开方法（`replace`/`remove`/`splice`/`prepend`）。

### B6 `editQueueItem` 原位改文案

**断言**：对队列中一项 `{ queueItemId, newText }` →

1. ACK `accepted`；
2. 该项在 v4 `order` 里的**位次不变**（原位替换，不是重新入队）；
3. DSH 侧对应 `MessageId` 的文本已更新（`Inbox.replace` 返回 `true`）；
4. 对**已不在队列**的 id → 拒绝（`Inbox.replace` 返回 `false` → 按冻结面回拒绝，不静默成功）。

### B7 `deleteQueueItem` 移除一项

**断言**：`{ queueItemId }` → ACK `accepted`；该项从 v4 `order` 消失；
`Inbox.remove` 返回 `true`；其余项的**相对位次不变**；对已不在队列的 id → 拒绝。

### B8 `reorderQueueItem` 调整位次

**断言**：`{ queueItemId, beforeQueueItemId }` →

1. 目标项移动到 `beforeQueueItemId` **之前**；
2. `beforeQueueItemId === null` → 移到**队尾**；
3. 移动后 `order.queuePosition` 与 `Inbox.nextTurn` 的真实顺序一致；
4. 任一 id 不在队列 → 拒绝，且**队列不变**（要么全成功要么全不动）。

### B9 `sendQueuedNow` 立即发送队列项

**断言**：`{ queueItemId }` →

1. 该项从队列移除并**立即开始执行**（不再等待）；
2. 若该 `queueItemId` 的原文在投影里已不可得（已被 drain/删除）→ 拒绝
   （legacy 用 `V4QueueItemTextUnavailableError`，本包用同类 reasonCode）；
3. **「已开始执行但移除失败」必须显式失败**，不能报告成功（legacy 用
   `V4QueuePromotionCommitError`；本包沿用同类 reasonCode 语义）；
4. 重复提升同一项 → 拒绝（legacy 用 `guard.queueItemReserved`）；
5. ★ **其余排队项必须仍在**（`keepInbox: true` 的可判定证据）。
   DSH 的 `agent.cancel` 默认**不带** `keepInbox`，会 `splice` 丢弃排队的输入
   （`dsh-agent` 类型注释原文：「without the stop button's `keepInbox`, so queued input is discarded
   with a logged inbox splice」）。**用户只要求发这一条，不是清空队列**——
   若用默认值，其余消息会**静默丢失**，而这个缺陷很难被其它断言抓到；
6. ★ **必须等到回合真正 idle 才提交新输入**：`agent.cancel()` **不等待结算**
   （同文件原文：「Nothing is awaited to settlement.」），因此要等 `agent/status` 事件变 `idle`
   ——**用事件而不是轮询/sleep 凑时序**；超时仅作兜底并给出稳定错误类型。
   若不等待，会出现「**新旧回合交错**」（新输入在旧回合尚未结束时提交）。

### B10 `setAutoDrain` 设置自动出队

**断言**：`{ autoDrain: boolean }` → ACK `accepted`；
该状态由 `CommandInbox` 持有（**DSH 无 autoDrain 概念**，实测零命中）；
`true` 时后续入队项按序自动出队；`false` 时保持待发。

### B11 队列的单一身份所有者（不变量断言）

**断言**（结构性）：`CommandInbox` 是 `queueItemId` 的**唯一发号方**；
DSH `Inbox` 的 `MessageId` 是**映射目标**，不是对外身份。
测试：任意队列操作后，`order.queuePosition` 与 `Inbox.nextTurn.length`（或权威序列）一致；
且**不存在**第二条代码路径能直接改队列而不更新映射（用源码反结构断言，同 02 的 B15）。

---

## 分组 C：需要回合栈（7 条）

### B12 `forkAssistant` 在指定行处分叉

**断言**：`{ target }`（`conversationRowTarget`）→ ACK `accepted`；
`result.type === "forkAssistant"`（冻结面 `commandResultSchema` 已列该 type）；
新会话从该行**之后**分叉；返回 `{ type: "forkAssistant", sessionId }` 形状（**无自造字段**）。

### B13 `editUserQuery` 编辑重发

**断言**：`{ target, newText, workspaceMode }` →

1. `workspaceMode: "preserve"`（缺省）：仅切对话分支，**不动工作区文件**；
2. `workspaceMode: "rewind"`：先安全恢复该轮文件，再切分支；
3. 语义 = 「在该用户消息**前一序号** fork，然后发送新输入」（DSH 的 fork 能力映射，不是重写回合栈）；
4. `attachments` 可选透传。

### B14 `retryTurn` 重试一轮

**断言**：`{ target }` → 重新执行该助手轮；产生新的回合；不重复已成功的工具调用副作用
（若无法保证，**必须如实说明限制**并登记）。

### B15 `createSelectionSideSession` 创建选择侧会话

**断言**：`{ firstInput: { text, modelSelection? } }` → ACK `accepted`；
`result.type === "createSelectionSideSession"`；
父会话由 `envelope.sessionId` 指定，子会话继承父 runtime 配置（缺省）；
**与 02 的 B3 同一原子性要求**：建会话与首输入在同一 ACK 之前完成。

### B16–B18 目标 3 条

| 命令              | 断言                                                                                                         |
| ----------------- | ------------------------------------------------------------------------------------------------------------ |
| `sendGoalCommand` | `{ text, displayText?, modelSelection?, mode?, planEnabled? }` → 设置目标并启动目标轮；投影产出 `goalSet` 行 |
| `pauseGoal`       | `{}` → 目标暂停；投影反映暂停态                                                                              |
| `resumeGoal`      | `{}` → 目标恢复                                                                                              |

**依据**：DSH 有 `ctx.goals`（`GoalService extends TypertRemoteService`，`dsh-goal`）+ `dsh-goal-round-driver` + `dsh-command-goal`（斜杠命令）。三条命令映射到该服务。

---

## 分组 D：其余（1 条可实现 + 缺口）

### B19 `cancelBackgroundWork` 取消后台作业

**断言**：`{ workId }` → 取消该后台作业；`workId ≡ runId`（协议注释已声明同一身份等式）；
对不存在/已完成 → 按冻结面处理，**不抛内部错误**。

### B20 `applyFileRewind`：**能力缺口**（`fault.command.capabilityAbsent`）

**断言**：

1. 命令**从 v4 协议面可达**（不返回 `unsupported`）；
2. 返回专门 reasonCode 表示「命令面已实现，当前引擎无该能力后端」；
3. **不伪造「文件已回退」**：不得回 `accepted`；
4. 载荷校验仍然生效（非法 `target` → 拒绝，与能力缺席区分）。

### B21 工作流 3 条：**能力缺口**

`resumeWorkflowRun` / `startSavedWorkflow` / `amendWorkflowRunSettings` 的断言同 B20 的 1–4。

### B22 工作区钩子 5 条：**能力缺口**

`respondWorkspaceHookReview` / `toggleWorkspaceHookReviewItem` / `revokeWorkspaceHookTrust` /
`requestWorkspaceHookReview` / `snoozeInteractionAutoResolution` 的断言同 B20 的 1–4。

### B23 `discardSharedContext`：**能力缺口**

断言同 B20 的 1–4。

---

## 分组 E：收口与回归

### B24 legacy 执行端口 12/12（C2 完整满足）

**断言**：

1. `HANDLED_METHODS` 表**恰好 12 行**（`PORT_BACKED_METHODS` 的每一个都在表里）；
2. 注册后 12 个方法**全部**落到执行器（逐条断言到达的方法名 + sessionId）；
3. 未注册时 12 个方法**全部**回 `-32031`（反向断言）；
4. `session/close` 有**真正的 handler**（不是 `-32031`）。

> **这张表是 C2 的唯一事实来源**，必须在代码注释里写明。

### B25 34 条 v4 命令全部非 `unsupported`（收口断言）

**断言**：遍历 `commandPayloadSchemas` 的 34 个键，逐条断言
`reasonCode !== "unsupported"`。
允许的结果：`accepted` / `noop` / `rejected`（带**专门** reasonCode）/ `failed`（带专门 reasonCode）。
**只禁止 `unsupported`**——它代表「协议面还有未实现的命令」。

### B26 `kernel-bridge-01` 与 `kernel-bridge-02` 的用例继续全过

**断言**：`kernel-bridge-01` 20/20、`kernel-bridge-02` 50/50 在本包改动后仍全过。

### B27 单一 admission 不退化

**断言**：02 的 B15 反结构断言继续成立（引擎只经 `inbox.handle`、不直接 `inbox.append`、
回合命令经统一分派）。本包新增的队列操作**也必须**经 `CommandInbox`，不得在引擎里直接改队列。

### B28 `entry.ts` 零改动

**断言**：`git diff origin/main -- .../kernel-bridge/entry.ts` 为空；`route()` 六个已接方法与
`default` 分支不动。
