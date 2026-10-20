# kernel-bridge-02 已知差异

本包没有「被替换的实现」，差异分四类：**对既有合同的有意演进**、**本包边界**、**DSH 事实**、**暂缓验证**。每条给出理由与对应测试。

## 一、对既有合同的有意演进（不是放宽断言）

| #   | 差异                                                                                                                                                                      | 理由                                                                                                                                                                                                                                                                                              | 对应测试 / 验收                                                      |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------- |
| D1  | `kernel-bridge-01` 的 `bridge-engine.ts` `execute()` 里 `sendText` / `stop` / `compact` / `resolveInteraction` / `createSession.firstInput` 由 `unsupported` 改为真实执行 | 这是本包的工作本体：`kernel-bridge-01` 审查结论指出「34 种命令只实现了 3 种」，本包补「输入与回合」这一类 5 个命令。**不是放宽断言**：`kernel-bridge-01` 的 20 个用例里没有一条断言这些类型必须 `unsupported`（该套件锁的是准入、序号、快照与双链路骨架）                                         | `turn-dispatch.test.mjs`；`kernel-bridge-01/tests/**` 20/20 继续全过 |
| D2  | `projection-layer.ts` 新增回合事件（assistant 行、tool 行、回合边界）的派生规则                                                                                           | 帧类型与字段是冻结的，本包只**新增派生规则**（哪条 DSH 事件产出哪一帧），不改帧结构                                                                                                                                                                                                               | `turn-frames.test.mjs`                                               |
| D3  | v4 `stop` 的 payload **没有** `keepInbox`（只有 `expectedForegroundExecutionId`），而 DSH 的 `agent.cancel(cause, { keepInbox })` 有这个开关                              | 两侧作用点不同：v4 的「保留/清空队列」是**发送侧**的 `sendText.heldQueueDisposition`（`clearQueueAndSend`/`keepQueueAndSend`），DSH 的 `keepInbox` 是**取消侧**的开关。本包实现 `stop` 时按「保留队列」调用 `cancel`（不丢用户已排队的输入），并在 `known-differences` 记明 v4 协议面不暴露该开关 | B6、B7a                                                              |
| D4  | v4 把 `compact` 当**输入型维护命令**（可排队、走 FIFO），DSH 侧是 `ctx.compaction` 的即时服务调用                                                                         | 协议面语义优先：本包在 admission 层把 `compact` 当输入意图排队，执行时调 DSH 压缩服务；这样 idle 立即执行、busy 进 FIFO 的 v4 语义成立                                                                                                                                                            | B7b                                                                  |

## 二、本包边界（有意不做）

| #   | 差异                                                     | 归属                                                             |
| --- | -------------------------------------------------------- | ---------------------------------------------------------------- |
| D4  | `entry.ts` 的 `route()` default 分支不动                 | `kernel-bridge-legacy`（其 interface.md §五 已裁决该 hunk 归它） |
| D5  | 不新增 v4 方法名；回合全部经 `v4/command` 的 `type` 分派 | 冻结面（`@knorvia/shared`）                                      |
| D6  | `fork`、编辑重发、文件回退入口、目标与计划命令不动       | `kernel-bridge-03`                                               |
| D7  | 不实现五种权限模式的映射                                 | `kernel-plugin-policy`                                           |
| D8  | 不做模型供应商与凭据注入                                 | `kernel-plugin-credentials`                                      |
| D9  | 不实现 Hook 7 事件                                       | `kernel-plugin-hooks`                                            |
| D10 | 不新增 `KNORVIA_` 环境变量、不改数据目录、不改旧协议方法 | 计划书红线                                                       |

## 三、DSH 事实（不是缺陷，但影响实现）

| #   | 事实                                                                                                                        | 影响 / 处置                                                                                                                                               |
| --- | --------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| D11 | DSH 的审批审计事件（`approval/asked`/`approval/decided`）必须成对落在**开放回合内**，回合外调用 `approval.request()` 会抛错 | 本包只在回合内发起审批请求（B9）；回合外无审批入口，这也与 Host 的交互时机一致                                                                            |
| D12 | `agent.cancel(cause, { keepInbox })` 是唯一的取消入口，且「第一个原因胜出」                                                 | B6 用它实现 `stop`（按「保留队列」调用，即 `keepInbox: true`）；「第一个原因胜出」由本包前置校验 `expectedForegroundExecutionId` 处理，不额外发明取消路径 |
| D13 | DSH 的 steering 在「下一个 accepted in-turn pre-step」生效，不是立即中断                                                    | B5 的时序即此；steer 不打断进行中的工具调用                                                                                                               |
| D14 | `agents.create()` 要求 `sessionId` 与 `agent.id` 一致（内部会校验）                                                         | 建会话路径必须让两者同源；实现阶段如实处理                                                                                                                |
| D15 | `todo_write`、目标类工具要求「有明确调用者的 Agent 会话」                                                                   | 回合执行必须持有 agent 引用；本包不伪造无 agent 的调用                                                                                                    |
| D16 | DSH 是预发布 SDK（`0.2.0-rc.2`），事件形状不承诺兼容                                                                        | 锁定确切版本；升级单独验收                                                                                                                                |

## 四、暂缓验证（如实标注）

| #   | 项                                                | 归属                                                  |
| --- | ------------------------------------------------- | ----------------------------------------------------- |
| D17 | 真实模型驱动的回合（真实 token 流、真实工具调用） | `kernel-switch` 的真实模型冒烟；离线用假模型/探针回合 |
| D18 | 真实 Host 侧的审批应答（含 UI 交互）              | `kernel-switch` 的工作台冒烟                          |
| D19 | 手机 `web-remote-replayable` 的真实断线重连       | `kernel-switch`（本包只断言恢复链路的帧重建语义）     |
| D20 | macOS 实机                                        | 无实机；Linux CI 覆盖 POSIX 语义                      |

## 五、已核准事项（不再待确认）

| #   | 事项                                              | 结论                                                                                                                                                                                                                                                                                                                            | 来源                                                                                                                                                                                                 |
| --- | ------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| T1  | 回合命令的确切字面量                              | **已核准**：`createSession`（含 `firstInput` 字段）、`sendText`（含 `requestedDelivery` 三义）、`stop`、`compact`、`resolveInteraction`。**没有** `cancelTurn`（= `stop`）、**没有** `steer`（= `sendText.requestedDelivery === "guide"`）                                                                                      | Lead 提供 + 本包复核 `packages/shared/src/protocol-v4/command.ts` 的 `commandPayloadSchemas`（34 命令；`createSession` L45、`sendText` L80、`stop` L141、`compact` L147、`resolveInteraction` L173） |
| T2  | steer 的表达方式                                  | **已核准**：不是独立命令，是 `sendText.requestedDelivery: "guide"`；裁决后的事实是 `conversationInputIntentSchema.steer.state`（`notRequested`/`submitting`/`steering`/`guided`/`fellBack`）与 `delivery.admitted`                                                                                                              | 同上 + `input-intent.ts` L11–L38                                                                                                                                                                     |
| T3  | `queuePosition` 的权威字段                        | **已核准**：`conversationInputIntentSchema.order.queuePosition`（`input-intent.ts` L19–L24），不是自造字段                                                                                                                                                                                                                      | 同上                                                                                                                                                                                                 |
| T4  | 「保留/清空队列」两义的位置                       | **已核准**：在 `sendText.heldQueueDisposition`（`clearQueueAndSend`/`keepQueueAndSend`），`held`（`inputRouting.mode === "choice"`）下必带；**不在** `stop` 里                                                                                                                                                                  | `command.ts` L91 + `snapshot.ts` L163–L170                                                                                                                                                           |
| T5  | 离线如何驱动真实回合                              | **已核准并实测**：`ctx.llm.registerAdapter(["knorvia-fake"], new FakeAdapter())` 可注册假 provider（`registerOk: true`，`listProviders()` 列出）。`LlmAdapter` 最小实现面：`providerInfo` 返回 `{id,name}`（id 必须等于 provider 名、name 非空）、`providerRetryPolicy`/`imageRequestPricing` 返回 `undefined`、再实现 `stream` | README §八之二（本包探针实测）                                                                                                                                                                       |
| T6  | 旧协议 `session/send` 到 `TurnSendRequest` 的映射 | 待实现阶段按 `@knorvia/shared` 的旧协议 schema 填（合同已定方向：共用同一 `KernelTurnExecutor.sendText`）                                                                                                                                                                                                                       | 实现阶段回填                                                                                                                                                                                         |

## 六、实现阶段新增的证据与差异（2026-10-20）

### 6.1 过期 Stop 的对齐依据（B6）

| #   | 差异                                                                                                                                                                | 理由                                                                                                                                                                                                                                                                                                                            | 对应测试                                                                 |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------ |
| D22 | `stop` 的 `expectedForegroundExecutionId` 与当前前台执行**不匹配**时，命令仍然 `accepted`，但结果 `stopped: false`，并记日志 `reason: "stale-foreground-execution"` | **旧引擎语义是「过期 Stop 静默成功、不报错」**：迟到/重复的 Stop 不能被当成错误，否则客户端会在用户已经停止之后收到失败提示。同时它也**不是忽略请求**——命令确实被受理与裁决，只是判定为过期而不动任何状态。DSH 侧的 `agent.cancel` 是「第一个原因胜出」，所以这次判定必须由本包前置完成，否则一个过期的 Stop 会误杀后续无关执行 | `turn-stop.test.mjs` 断言 `status === "accepted"` 且 `stopped === false` |

### 6.2 `sourceCommandId` 在旧协议路径省略（B7b）

| #   | 差异                                                                                                   | 理由                                                                                                                                                                                                                                                                              | 对应测试                                                                      |
| --- | ------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------- |
| D23 | 旧协议 `session/compact` 调 `compactNow(agent, signal, sourceCommandId?)` 时**省略** `sourceCommandId` | 该参数是 DSH 检查点上的「发起手动命令」标记（`dsh-compaction/lib/index.js` 的 `compactCheckpointSource`，**本身可选**）。v4 的 `compact` 命令有 `commandId`，直接传；旧协议 `session/compact` 没有 v4 commandId，因此没有可传的值。**这是省略而不是漏传**：DSH 检查点会不带该字段 | `turn-compact.test.mjs` 断言 v4 路径传了 `envelope.commandId`、旧协议路径不传 |

### 6.3 Host 通道与端口注册的顺序依赖（C2 与 B9）

| #   | 差异                                                                                                        | 理由                                                                                                                                                                                                                                                           | 对应测试                                                                                                                                 |
| --- | ----------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| D24 | `registerLegacyExecutionPort` 的**调用**与审批的**反向请求通道**（`LegacyHostChannel`）在本包合并时尚未落地 | `kernel-bridge-legacy` 的实现（`kernel-bridge/legacy/**`）尚未合并，而 legacy `interface.md` §四 明文规定「端口注册是启动期动作，由组合根完成；本包不 import 02/03」。因此本包只交付**端口对象**与**通道端口形状**，注册与通道注入由组合根在 legacy 合并后完成 | C2：`turn-seam.test.mjs` 的**反向断言**（未注册 → 4 个方法仍回 `-32031`）；审批：`turn-approval.test.mjs` 的「通道缺席 → `unavailable`」 |

### 6.4 审批应答必须由本包自己校验（安全）

| #   | 差异                                                                                                     | 理由                                                                                                                                                                                                         | 对应测试                                           |
| --- | -------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------- |
| D25 | `requestTurnApproval` **不信任** `channel.request()` 的返回值类型，自己再跑一次 `parseInteractionAnswer` | 通道是跨进程/跨实现边界，「`Promise<TurnInteractionAnswer>`」只是**编译期**承诺。实现阶段测试用一个返回 `"yes"` 的通道打穿了第一版（它被当成合法应答继续往下走）。安全判定层不得依赖调用方或被调方的类型声明 | `turn-approval.test.mjs`「应答非法时 fail closed」 |

### 6.5 实现阶段被冻结面纠正的三次（记录，不是差异）

| #   | 我最初写的                          | 冻结面的真相                                                                                                                                                                    | 依据                                   |
| --- | ----------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------- |
| 1   | 自造 `type: "sendText"` 的 ACK 结果 | `commandResultSchema` 里 `sendText` 用 `inputAccepted`，`stop`/`compact` 用 `inputDisposition`，`createSession` 首输入用 `input: { delivery, inputId }`；**没有 `turnId` 字段** | `command.ts` L367–L424；`tsc` 当场拒绝 |
| 2   | `compactNow(agent)` 单参            | `compactNow(agent, signal, sourceCommandId?)` 三参                                                                                                                              | `dsh-compaction` 类型声明 L137         |
| 3   | `startNow` 忙碌时拒绝该命令         | 协议 `requested` 与 `admitted` 本就可以不同，且自带 `fallbackReasonCode`                                                                                                        | `input-intent.ts` L11–L17              |

**口径**：三次都是「先查冻结面、不发明」。这条流程比一次写对更有说服力，因此留档。

## 一之二、D1 的精确内容（改了什么 / 为什么必须改 / 不破坏什么）

Lead 要求把 D1 拆成三问逐条写清，便于审查时一眼核对。

### D1a 改了什么（`BridgeEngineOptions` 与 `execute()`）

| 改动           | 具体内容                                                                                                                                                              |
| -------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 新增可选注入   | `BridgeEngineOptions.turnExecutor?: KernelTurnExecutor`。**缺席时回合命令仍回 `unsupported`**——保留给「只跑段 A 骨架」的场景与 legacy 反向断言测试                    |
| 新增 3 个 case | `case "sendText": case "stop": case "compact": return await dispatchTurnCommand(envelope, this.options.turnExecutor);`（**只委派**，回合语义全在 `turn-commands.ts`） |
| 新增审批登记表 | `BridgeEngine.approvals: TurnApprovalRegistry`。放在引擎上而不是执行器上，因为「进程要退出」是引擎的事实                                                              |
| 新增关闭收敛   | `dispose()` **第一步**调 `approvals.failAllPending()`，且在释放投影层**之前**（投影层释放后就没有通道回执了）                                                         |
| 条件收窄       | `createSession` 的 `firstInput`：原「有 `firstInput` 就回 `unsupported`」→ 改为「**有 `firstInput` 且无执行器**才回 `unsupported`」                                   |

净改动：`61 insertions(+) / 2 deletions(-)`。

### D1b 为什么必须改

1. **回合命令必须落到实际执行器**：`bridge-engine.ts` 的 `execute()` 是唯一的命令分派点（`CommandInbox` 只做准入，不执行）。不在那里加 case，`sendText`/`stop`/`compact` 就永远只能回 `unsupported`——而这正是本包存在的理由（`kernel-bridge-01` 审查结论：「34 种命令只实现了 3 种」）。
2. **执行器需要引擎级的关闭收口**：审批请求的未决登记表必须在进程退出时结算，否则 Host 侧挂着一个永不返回的反向请求。关闭路径是引擎 `dispose()` 的职责，执行器不知道进程要退出。
3. **`firstInput` 的条件必须收窄**：否则即使注入了执行器，带首输入的建会话仍会被旧条件一律拒绝，B3 无法成立。

### D1c 不破坏什么（逐条可核）

| 不变量                                                                | 证据                                                                                                                     |
| --------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| `entry.ts` **一字未改**                                               | `git diff origin/main -- apps/cli/packages/bootstrap/src/kernel-bridge/entry.ts` 为空；`route()` default 分支仍归 legacy |
| `kernel-bridge-01` 的 20 个用例**全过**                               | 实测 `20/20 pass`（准入、序号、快照、双链路骨架未受破坏）                                                                |
| `kernel-bridge-01` 的合同里**没有**「这些命令必须 unsupported」的断言 | 该套件锁的是骨架不变量；`unsupported` 是段 A 的占位状态，不是合同承诺                                                    |
| 「不吞用户输入」的旧保护仍在                                          | `firstInput` + **无执行器** → 仍回 `unsupported`（`bridge-engine` 的条件分支 + `turn-delivery.test.mjs` 的无执行器场景） |
| 既有配置类命令语义不变                                                | `applyConfigCommand` 未改；`setFollowupMode`/`switchCollaborationMode` 分支原样                                          |
| `createSession` 的会话登记与 projection 初始化顺序不变                | 只在末尾追加了首输入投递与其失败回滚（摘掉 `sessions` 登记）                                                             |

**口径**：这不是「放宽断言」或「改测试迁就实现」，而是**完成 `kernel-bridge-01` 预留的扩展点**；最有力的证明是它的 20 个用例一条未改、全部继续通过。

## 七、执行器物化点与凭据行位置（2026-10-20 补充）

| #   | 差异                                                                                 | 理由                                                                                                                                                                                                                                                                                                                                                                                                                                             | 对应测试                                                                                                                             |
| --- | ------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------ |
| D25 | **执行器物化点 = `BridgeEngine.start()`**，而不是 `design.md` 初稿写的「组合根注入」 | Lead 2026-10-20 裁决：**`entry.ts` 零改动是硬边界**（本包 `interface.md` §五 与 `callers.md` 明写）。而 `runBridge`（`entry.ts`）是唯一 `new BridgeEngine` 的地方、且不接收执行器。因此由引擎在 `start()` 里物化并注册端口——语义上仍是「启动期一次动作」，符合 `registerLegacyExecutionPort` 的约束。关闭时 `dispose()` 依次做 `failAllPending()` → `turnPort.release()` → `projection.dispose()`                                                | `turn-c2-registration.test.mjs`（注册后 4 方法可用 / 7 方法仍 -32031 / release 可逆 / 重复注册被拒 / start 自动注册 + dispose 解绑） |
| D26 | **`dsh-credentials` 不能作为组合行挂载**，本包只提供行位置与约定                     | `@deepseek-ai/dsh-credentials` 只导出抽象基类 `CredentialProvider`（自身静态属性只有 `length`/`name`/`prototype`，**无 `Config`、无自定义 `apply`**；`apply` 若检测到的是 `Function.prototype.apply`，那是原生方法不是插件入口）。锁定版本里也没有任何具体 provider。因此「提供实现」归 `kernel-plugin-credentials`（#235），本包给 `KERNEL_CREDENTIAL_PROVIDER_ROW_ID = "knorvia-credentials"` 与 `createKernelCredentialProviderRow(moduleId)` | `specs/contracts/kernel-dsh-builtins/tests/credential-provider-row.test.mjs`（5 用例）                                               |
| D27 | 凭据行**缺席时不生成**，且位置在 MCP 客户端行之前                                    | 缺席时 `ctx.credentials` 无人提供，`llm-pi-ai` 只能回退启动环境——而进程级清洗已删掉 `*_API_KEY`，所以真实模型调用需要它；但本包**不凭空假设有 provider**（没有模块标识就不生成行，避免挂载不存在的模块）。位置在 MCP 客户端之前：凭据是 LLM 的前置能力                                                                                                                                                                                           | 同上（「缺席时不生成」「给出标识时生成且在 MCP 之前」两用例）                                                                        |
