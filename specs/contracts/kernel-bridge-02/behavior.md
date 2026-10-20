# kernel-bridge-02 行为合同

每条写：输入、输出、错误语义、时序与并发、幂等、资源释放、平台差异、状态所有者、日志级别。编号 B1、B2…，发布后编号不重用。

「能力本体归 DSH」是本合同的前提：以下条目描述的是**命令到 DSH 会话操作的映射**与**回合过程到 v4 帧的派生**，不是重写 DSH 内部实现。「旧内核口径」指 `apps/cli/packages/core/src/**` 与 `apps/cli/packages/bootstrap/src/protocol-v4/**` 当前实现的效果（只作行为依据，不作代码依据）。

---

## B1 回合类命令的分派

- **输入**：`v4/command` 请求，`type` 属于下表（字面量与 payload 由 `packages/shared/src/protocol-v4/command.ts` 的 `commandPayloadSchemas` 冻结并校验）。
- **输出**：命令进入 `CommandInbox`，返回 accepted ACK（`result` 形状沿用 `kernel-bridge-01` 的 ACK 约定）。
- **语义**：实现阶段在 `bridge-engine.ts` 的 `execute()` switch 中补齐下表分支。此前回 `unsupported` 的这 5 个命令，**必须不再回 `unsupported`**：

  | 命令字面量           | payload 关键字段                                                                        | 本包实现的语义                                                                    |
  | -------------------- | --------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------- |
  | `createSession`      | `workspaceId`、`firstInput?{text, attachments?, modelSelection?, mode?, planEnabled?}`  | 建会话（已实现）+ `firstInput` 投递（B3）                                         |
  | `sendText`           | `text`、`requestedDelivery?: "startNow" \| "queue" \| "guide"`、`heldQueueDisposition?` | 输入投递（B2）；三义分派：`startNow` 抢占、`queue` 入队、`guide` 引导（B4/B5/B7） |
  | `stop`               | `expectedForegroundExecutionId?`                                                        | 停止当前回合（B6）；无 `keepInbox`                                                |
  | `compact`            | `{}`                                                                                    | 输入型维护：idle 立即执行、busy/held 进 FIFO（B7）                                |
  | `resolveInteraction` | `interactionId`、`answer{optionId?, freeText?, action?, content?}`                      | 审批/交互应答回填（B9）                                                           |

  > **不存在的名字**：`cancelTurn`（取消是 `stop`）、`steer`（是 `sendText.requestedDelivery === "guide"`）。`createSession.firstInput` 是字段不是命令。

- **准入裁决的形状**：`requestedDelivery` 是**请求**；admission 后按 `inputRouting.mode`（`startNow`/`enqueue`/`guide`/`reject`/`choice`）裁决，事实落在 `conversationInputIntentSchema` 的 `delivery.requested` / `delivery.admitted` / `delivery.fallbackReasonCode`、`order.admissionSeq` / `order.queuePosition`、`steer.state`。**`queuePosition` 取自 `order.queuePosition`，不自造字段。**
- **错误**：会话不存在 → 既有 `-32004` 语义；payload 非法 → `-32602` + 既有文案结构；`commandId` 重复 → 幂等返回首次结果（B8）。
- **时序**：admission 在 `CommandInbox` 内串行；同会话的两条输入按 ACK 顺序执行。
- **幂等**：见 B8。
- **资源释放**：命令生命周期随会话；取消时协调 DSH 活动信号与队列。
- **平台差异**：无。
- **状态所有者**：`CommandInbox`（admission）+ DSH 会话（正文与回合状态）。
- **日志**：`info` `kernel.bridge.command.accepted`（含 type/sessionId，不含正文）；`debug` `kernel.bridge.command.dispatch`。

## B2 `sendText` 真实执行并产出回合帧

- **输入**：`sendText`，`requestedDelivery: "queue"`（或省略，按 `inputRouting` 裁决），会话空闲。
- **输出**：用户消息进入 DSH 会话；随后产生 assistant 行帧与 `TurnComplete` 帧（B11）。
- **语义**：这是本包的核心可判定行为——**必须真实驱动 DSH 回合**，不是只回 ACK。测试用一个通过 `ctx.llm.registerAdapter` 注册的假 provider 驱动真实 agent loop（README §八之二），断言帧序列，不用 sleep 凑时序。
- **错误**：模型侧失败 → 既有错误帧语义（不吞、不改写成成功）。
- **时序**：assistant 行按 DSH 事件顺序产出；`TurnComplete` 在该回合所有行之后、下一个回合之前。
- **幂等**：按 `commandId`；同一 `commandId` 不产生第二个回合。
- **资源释放**：回合结束后活动信号释放；后台作业归 `dsh-jobs-local`。
- **平台差异**：无。
- **状态所有者**：DSH 会话日志（正文唯一所有者）；协议桥只派生帧，不另存正文。
- **日志**：`debug` `kernel.bridge.turn.frame`（逐帧，生产不落盘）。

## B3 `createSession.firstInput` 的原子语义

- **输入**：`createSession` 且 payload 带 `firstInput`。
- **输出**：建会话与投递首条输入在**同一个 ACK 之前完成**；ACK 同时含 `sessionId` 与 `turnId`。
- **语义**：Host 依赖「创建成功即可认为首输入已被接受」这一事实，所以两者不得拆成两次往返。
- **错误**：首输入非法 → 会话不留下半建状态（回滚或整条拒绝，按实现选择并在 `known-differences.md` 记明）。
- **时序**：首帧的 `fromSeq` 从该会话的起始序号开始，不出现空洞。
- **幂等**：同一 `commandId` 重放返回首次的 `sessionId` + `turnId`。
- **资源释放**：同 B1。
- **平台差异**：无。
- **状态所有者**：同 B1。
- **日志**：`info` `kernel.bridge.session.created`（含 sessionId，不含正文）。

## B4 `sendText.queue` 入队，不丢输入

- **输入**：会话正在运行时投递 `sendText`（`requestedDelivery: "queue"`，或省略后由 `inputRouting.mode === "enqueue"` 裁决为入队）。
- **输出**：ACK accepted；输入意图事实里 `delivery.admitted === "queue"`，`order.queuePosition` 反映排队位置；该输入在当前回合结束后按序执行。
- **语义**：排队事实由 `CommandInbox` 与 DSH 会话收件箱持有；本包**不新增第二条写入路径**（L1）。排队不是拒绝，也不是静默丢弃。裁决为 `reject`/`choice` 时不入队：`reject` 回拒绝原因，`choice` 要求客户端带 `heldQueueDisposition`（B7a）。
- **错误**：`inputRouting.mode === "reject"` → 既有拒绝语义 + `reasonCode`，不得改成 accepted。
- **时序**：同会话输入严格 FIFO（`order.admissionSeq` 递增）；不同会话可并发。
- **幂等**：重放同一 `commandId` 不重复排队。
- **资源释放**：取消与处置分别见 B6 / B7a。
- **平台差异**：无。
- **状态所有者**：`CommandInbox` + DSH 会话收件箱。
- **日志**：`info` `kernel.bridge.command.queued`（含 position）。

## B5 `sendText.guide`（steer）插队

- **输入**：会话正在运行时投递 `sendText`（`requestedDelivery: "guide"`）。
- **输出**：输入作为引导消息，在**下一个 accepted in-turn pre-step** 被当前回合消费；不新起回合。意图事实里 `steer.state` 依次表达 `submitting → steering → guided`。
- **语义**：`guide` 与 `queue` 的区别是「并入当前回合」vs「排到下一回合」。`guide` **不打断**进行中的工具调用（DSH 的 steering 只在步边界生效，README G3）。
- **错误**：无运行中回合、或引导不合格 → `steer.state === "fellBack"` + `reasonCode`，按 `queue` 处理（处置如实暴露给客户端，不静默降级）。
- **时序**：只在下一个 accepted in-turn pre-step 生效；不得跨回合生效。
- **幂等**：同一 `commandId` 只引导一次。
- **资源释放**：随回合。
- **平台差异**：无。
- **状态所有者**：DSH 会话收件箱的 steering 通道。
- **日志**：`info` `kernel.bridge.command.guided`（含是否 fellBack）。

## B6 `stop` 停止当前回合

- **输入**：`stop`，可选 `expectedForegroundExecutionId`。
- **输出**：当前回合停止；此后**不再产生该回合的新 assistant 行**；产出一条终止性帧（`TurnComplete` 带取消原因）。
- **语义**：取消要送达 DSH 的活动信号（`agent.cancel(cause)`）。`expectedForegroundExecutionId` 用于**拒绝迟到的 Stop**：id 与当前前台执行不一致时视为过期命令，noop 且不取消任何东西（DSH 的「第一个原因胜出」语义由本包负责前置校验，README G1）。已开始的工具按其自身语义收敛；本包不强杀进程、不按进程名清理（安全口径）。
- **错误**：无活动回合 → accepted 且 `cancelled: false`（幂等空操作）；`expectedForegroundExecutionId` 不匹配 → 过期命令，noop，不报错。
- **时序**：取消与帧产出之间有确定的先后：取消 ACK 先于终止帧，或同一批消息内按 ACK → 帧顺序写出。测试用事件序列断言。
- **幂等**：重复 `stop` 同一回合是空操作。
- **资源释放**：回合内后台作业归 `dsh-jobs-local` 的释放语义；本包不额外杀进程。
- **平台差异**：无。
- **状态所有者**：DSH 活动信号 + 会话日志。
- **日志**：`info` `kernel.bridge.turn.stopped`（含原因与是否过期）。

## B7 `heldQueueDisposition` 两义与 `compact` 的排队

**B7a：`heldQueueDisposition`（发送侧的队列处置）**

- **输入**：`sendText`，且当前会话处于 `held`（= completed 且 queue > 0 且 `autoDrain === false`，此时 `inputRouting.mode === "choice"`）。`heldQueueDisposition` 在 held 下**必带**：`"clearQueueAndSend"` 或 `"keepQueueAndSend"`。
- **输出**：`clearQueueAndSend` → 先清空队列再以 `startNow` 发送；`keepQueueAndSend` → 保留队列并立即 `startNow`。
- **语义**：这是 Host「清空队列后发送 / 保留队列立即发送」两种用户动作的可判定形式。`expectedHeldQueueItemIds` 用于校验：CLI 在处置前必须确认用户看到的就是这些队列项，防止桌面/手机并发增删后把没确认过的项一并处置；集合不匹配 → 拒绝该命令（既有 ACK 拒绝语义），不改队列。
- **错误**：held 状态下缺 `heldQueueDisposition` → `-32602`（schema 强制）；`expectedHeldQueueItemIds` 不匹配 → 拒绝，队列不动。
- **时序**：清空/保留先于发送生效；处置与发送在同一命令内原子。
- **幂等**：按 `commandId`。
- **资源释放**：`clearQueueAndSend` 清掉的队列项不产生副作用。
- **平台差异**：无。
- **状态所有者**：`CommandInbox`（队列与幂等）+ DSH 会话收件箱。
- **日志**：`info` `kernel.bridge.queue.disposed`（含 disposition 与是否清空）。

**B7b：`compact` 的排队语义**

- **输入**：`compact`（空 payload），会话 idle 或 busy/held。
- **输出**：idle → 立即执行压缩；busy/held → 进入 FIFO，按队列顺序执行。
- **语义**：`compact` 是**输入型维护命令**（不是立即服务调用），因此它与普通输入共用同一条队列；`sourceCommandId` 提供幂等边界（因 admission 与当前 revision 无关，不走 CAS）。
- **错误**：压缩失败 → 既有错误语义；不伪造空压缩结果。
- **时序**：busy 时与已排队的输入按 FIFO；不插队、不抢占。
- **幂等**：同一 `commandId` 只压缩一次。
- **资源释放**：随 `ctx.compaction`。
- **平台差异**：无。
- **状态所有者**：DSH 压缩服务 + 会话日志（检查点）。
- **日志**：`info` `kernel.bridge.compact.scheduled` / `.executed`。

> 关于 `stop` 与 `keepInbox`：v4 的 `stop` payload **没有** `keepInbox`（实测只有 `expectedForegroundExecutionId`）。「取消时是否保留队列」的差异记 `known-differences.md` D3：DSH 的 `agent.cancel(cause, { keepInbox })` 是本包实现 `stop` 时可用的开关，但 v4 协议面不暴露它，因此本包按「保留队列」实现并如实记录。

## B8 幂等：同 `commandId` 只执行一次

- **输入**：同一 `commandId` 的重复投递（相同或不同 payload）。
- **输出**：返回首次的 ACK（逐字段相同）；不产生第二次副作用。
- **语义**：全局幂等桶归 `kernel-bridge-01` 的 `CommandInbox`；本包不得绕过它或另建桶。
- **错误**：相同 `commandId` + 不同 payload → 首次结果优先（不报冲突），与 `kernel-bridge-01` 既有口径一致。
- **时序**：重放可能在首次尚未完成时到达；此时挂到同一 future，不并发执行。
- **幂等**：本条即幂等本体。
- **资源释放**：不适用。
- **平台差异**：无。
- **状态所有者**：`CommandInbox` 的幂等桶。
- **日志**：`debug` `kernel.bridge.command.replayed`。

## B9 `resolveInteraction` 回填审批

- **输入**：DSH 侧工具执行前的审批请求（`ctx.approval.request`，携带 agent、toolName、toolCallId、reason、signal）。应答来自 v4 的 `resolveInteraction` 命令（`interactionId` + `answer{optionId?, freeText?, action?, content?}`）。
- **输出**：CLI 向 Host 发出一次审批交互请求；Host 用 `resolveInteraction` 应答后回填 DSH，得到 `allowed-once` / `rejected` / `unavailable`。`answer.action` 按 `accept`/`decline`/`cancel` 精确映射；缺省走 `optionId`/`freeText` 兼容路径。
- **语义**：DSH 的审批审计事件（`approval/asked`、`approval/decided`）必须成对出现在**开放回合内**；本包只在回合内发起请求，不制造裸事件（README G4）。`resolveInteraction` 是**先到先得**：同一 `interactionId` 的重复应答，晚到的 noop（`reasonCode = proto.alreadyResolved`），不改已有决定。
- **错误**：`interactionId` 不存在或已过期 → 既有 ACK 拒绝语义，不改任何审批状态；应答非法 → 归一化为 `unavailable`（fail closed），不授权。
- **时序**：请求在工具执行前；应答到达前该工具处于挂起。取消信号到达 → 请求取消，结果为 `unavailable`。
- **幂等**：同一 `interactionId` 只生效一次（B9 语义内建）。
- **资源释放**：请求随回合结束释放；未决请求在回合取消时终止。
- **平台差异**：无。
- **状态所有者**：DSH `ApprovalService` + 会话日志的审批事件。
- **日志**：`info` `kernel.bridge.approval.requested` / `.decided`（只含 toolName 与结果，不含参数）。

## B10 审批无应答者时 fail closed

- **输入**：审批请求发出，但 Host 未应答（连接断开、超时、无应答者）。
- **输出**：结果为 `unavailable`；对应工具调用不得执行。
- **语义**：这是与旧内核一致的安全语义：「没人回答 = 不批准」。不得降级为 `allowed-once`，也不得静默跳过审批直接执行。
- **错误**：本条即错误语义本体。
- **时序**：超时或通道关闭即收敛，不无限挂起。
- **幂等**：不适用。
- **资源释放**：未决请求终止。
- **平台差异**：无。
- **状态所有者**：`ApprovalService`。
- **日志**：`warn` `kernel.bridge.approval.unavailable`。

## B11 回合帧形状

- **输入**：DSH 回合事件（assistant 消息、工具调用、工具结果、回合边界）。
- **输出**：v4 帧，`kind` 与字段由 `@knorvia/shared` 冻结：
  - assistant 行：模型输出文本段；
  - tool 行：工具名、调用与结果（含 `isError`）；
  - `TurnComplete`：回合结束，带结束原因（正常/取消/失败）。
- **语义**：帧由 DSH 事件**派生**，不在 Knorvia 侧另存一份正文（规格「对话正文的唯一所有者是 DSH 会话日志」）。
- **错误**：DSH 事件形状异常 → 记 `error` 并跳过该帧，不得伪造替代帧。
- **时序**：帧顺序 = DSH 事件顺序；同一回合的 `TurnComplete` 在其所有行之后。
- **幂等**：同一事件序号只派生一帧（重放不重复）。
- **资源释放**：不适用。
- **平台差异**：无。
- **状态所有者**：DSH 会话日志（事实）+ 投影层（派生）。
- **日志**：`debug` 逐帧。

## B12 序号单调不回退

- **输入**：连续回合、含取消与失败。
- **输出**：帧的 `fromSeq` 严格单调递增；取消与失败不回退水位，也不跳过序号。
- **语义**：沿用 `kernel-bridge-01` 的序列水位语义；本包不得在取消/失败路径上重置信封或复用序号。
- **错误**：-
- **时序**：-
- **幂等**：-
- **资源释放**：-
- **平台差异**：无。
- **状态所有者**：`SequenceWatermark`。
- **日志**：不新增。

## B13 两条链路语义不变

- **输入**：同一回合在两条链路上被消费：`desktop-continuous`（实时流）与 `web-remote-replayable`（恢复可重放）。
- **输出**：实时链路收到增量帧；恢复链路按 `fromSeq` 重放，结果与实时链路一致。
- **语义**：本包新增的回合帧必须同时满足两种语义——实时链路不丢帧，恢复链路能从任意水位重建。
- **错误**：-
- **时序**：恢复链路的 `recovery` 交付以快照 + 增量表达。
- **幂等**：重放同一水位产出同一帧序列。
- **资源释放**：订阅随连接关闭释放。
- **平台差异**：无。
- **状态所有者**：`ProjectionLayer` + `LinksRegistry`（`kernel-bridge-01`）。
- **日志**：`debug` `kernel.bridge.link.delivery`。

## B14 legacy 执行端口接线（kernel-switch 准入项 C2）

- **输入**：旧协议回合类方法（`session/send`、`session/stop`、`session/cancelBackgroundTask`、`session/compact`、`session/fork`、`session/goal`、`session/setModel`、`session/setThoughtLevel`、`session/setMode`、`session/resume`、`session/subscribe`）。
- **输出**：这些方法的执行落到本包实现的 `LegacyExecutionPort`；结果按 `LegacyMethodOutcome` 返回。
- **语义**：v4 `sendText` 与旧协议 `session/send` **走同一条执行实现**，不得各自实现一份。依赖方向固定 **02 → legacy**（本包 import legacy 的注册面并注册实现；legacy 不 import 本包）。
- **错误**：本包未注册端口时，legacy 按 capability 缺席返回（其 behavior B10）；注册后不得再出现缺席。
- **时序**：端口是启动期注册，运行期不增删；重复注册抛错（legacy 的唯一所有者约束）。
- **幂等**：旧协议方法本身的幂等语义不变。
- **资源释放**：解绑函数随桥关闭调用。
- **平台差异**：无。
- **状态所有者**：legacy 的端口注册表（唯一所有者）+ 本包的执行实现。
- **日志**：`info` `kernel.bridge.legacy.port.registered`。

## B15 单一 admission 所有者

- **输入**：任意路径的输入（v4 `sendText`、旧协议 `session/send`、`createSession.firstInput`）。
- **输出**：全部经 `CommandInbox` admission；DSH 会话收件箱只接收已被 admission 的输入。
- **语义**：规格「进程与所有者」明写：新引擎下由协议桥的 `CommandInbox` 做串行 admission，DSH 的会话收件箱只接收已被 admission 的输入，**不另开一条写入路径**。本包不得直接写 DSH 收件箱绕过 admission。
- **错误**：-
- **时序**：-
- **幂等**：-
- **资源释放**：-
- **平台差异**：无。
- **状态所有者**：`CommandInbox`（admission 唯一所有者）。
- **日志**：`debug` `kernel.bridge.admission.owner`。

## B16 `kernel-bridge-01` 20 用例继续全过

- **输入**：`specs/contracts/kernel-bridge-01/tests/**`。
- **输出**：20/20 通过。
- **语义**：本包扩了命令面与回合推进，但**不得破坏** v4 准入、序号、快照与双链路骨架。这些用例是「扩面没弄坏骨架」的回归证据。
- **错误**：任一失败 → 本包不合并。
- **时序**：-
- **幂等**：-
- **资源释放**：-
- **平台差异**：Linux 与 Windows 都跑。
- **状态所有者**：`kernel-bridge-01` 的冻结面。
- **日志**：不新增。
