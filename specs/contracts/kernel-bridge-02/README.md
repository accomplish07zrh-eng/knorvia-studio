# kernel-bridge-02 合同：输入与回合

## 一、范围

### 1. 本包做什么

`kernel-bridge-02` 是 M2 接入包，负责**把 v4 的「输入与回合」命令映射到 DSH 会话操作**，并把回合过程映射成 v4 帧。具体范围（计划书「新增接入包」表）：

| 能力             | v4 侧                                          | 本包要做的事                                                 |
| ---------------- | ---------------------------------------------- | ------------------------------------------------------------ |
| 发送输入         | `sendText` 命令                                | 映射到 DSH 会话收件箱，经 `CommandInbox` 串行 admission      |
| 建会话带首条输入 | `createSession.firstInput`                     | 建会话后立刻投递首条输入，保持「创建 + 首输入」的原子语义    |
| 排队             | `sendText` 在 busy/running 时的 admission 结果 | 排队事实来自 `CommandInbox`，本包不另开写入路径              |
| 引导（steer）    | 运行中输入插队                                 | 映射到 DSH 的 steering 通道                                  |
| 取消             | `cancel` / 停止当前回合                        | 映射到 DSH 的取消原因与活动信号                              |
| 审批交互         | 工具执行前的审批请求与应答                     | 把 DSH 的 `request(...)` 桥成 v4 的审批交互，应答回填        |
| 回合帧           | assistant 行、tool 行、`TurnComplete`          | 由 DSH 事件派生 v4 帧，序号与快照语义沿用 `kernel-bridge-01` |

### 2. 本包不做什么

| 不做                                                               | 归属                                                                |
| ------------------------------------------------------------------ | ------------------------------------------------------------------- |
| `entry.ts` 的 `route()` **default 分支**（旧协议路由委派）         | `kernel-bridge-legacy`（`kernel-bridge-legacy` 合同 §五已裁决归它） |
| 其余 v4 命令（fork、编辑重发、文件回退入口、目标与计划相关命令等） | `kernel-bridge-03`                                                  |
| 旧协议 74 个方法                                                   | `kernel-bridge-legacy`                                              |
| 改变 `CommandInbox` 的串行 admission、CAS、幂等语义                | 冻结面（`kernel-bridge-01`）                                        |
| 改变 v4 帧结构、ACK 形状、序号规则、快照语义                       | 冻结面（`@knorvia/shared`）                                         |
| 五种权限模式到 DSH 策略的映射                                      | `kernel-plugin-policy`                                              |
| 模型供应商与凭据注入                                               | `kernel-plugin-credentials`                                         |
| 回合类旧协议方法在本侧的**执行实现**                               | 见 §四「与 legacy 线的接缝」                                        |

### 3. 分支与状态

- 合同分支 `contract/kernel-bridge-02`，基线 `origin/main` `23cd766e`
- 实现分支 `replace/kernel-bridge-02`（合同合并后从最新 main 开）
- 认领 issue：**#222**（沿用，不新开）

## 二、依赖与既有骨架

### 1. 依赖

| 依赖                              | 用途                                                                        |
| --------------------------------- | --------------------------------------------------------------------------- |
| `kernel-bridge-01`（已合并 #218） | `CommandInbox`、`BridgeEngine`、`ProjectionLayer`、序号与快照、两条链路语义 |
| `kernel-dsh-builtins`（#219）     | 已挂载的 DSH 能力：工具、审批执行点、压缩、目标、计划模式、子 Agent         |
| `@knorvia/shared/protocol-v4`     | 命令与帧的 schema、`V4_METHODS`、`commandPayloadSchemas`（冻结，不改）      |

### 1.1 回合命令的权威字面量（已核准）

`packages/shared/src/protocol-v4/command.ts` 的 `commandPayloadSchemas` 实测 **34 个命令**（与计划书「v4 命令 34 种」吻合）。其中属于本包「输入与回合」的只有 **5 个**：

| 命令字面量           | 本包要做的事                                                                                                       |
| -------------------- | ------------------------------------------------------------------------------------------------------------------ |
| `createSession`      | payload 的 `firstInput` 字段：建会话后立即投递首条输入（B3）                                                       |
| `sendText`           | 输入投递本体；`requestedDelivery: "startNow" \| "queue" \| "guide"` 表达三种交付意愿，`guide` 即 steer（B2/B4/B5） |
| `stop`               | 取消当前回合；唯一的取消命令（B6）                                                                                 |
| `compact`            | 输入型维护命令：idle 立即执行、busy/held 进 FIFO（B7）                                                             |
| `resolveInteraction` | 审批/交互应答回填（B9/B10）                                                                                        |

**不存在的名字（不得使用）**：`cancelTurn`（取消是 `stop`）、`steer`（是 `sendText.requestedDelivery === "guide"`）。
`createSession.firstInput` 不是命令名，是 `createSession` payload 的字段。

**准入裁决的权威形状**：`sendText` 的 `requestedDelivery` 是**请求**，CLI 侧 admission 后按 `inputRouting.mode`（`startNow`/`enqueue`/`guide`/`reject`/`choice`）裁决，裁决事实落在 `conversationInputIntentSchema` 的 `delivery.requested` / `delivery.admitted` / `delivery.fallbackReasonCode` 与 `order.admissionSeq` / `order.queuePosition`。**`queuePosition` 来自 `order.queuePosition`，不是自造字段。**
`heldQueueDisposition: "clearQueueAndSend" | "keepQueueAndSend"` 是 `held` 状态（`inputRouting.mode === "choice"`）下**必带**的处置意图——「清空队列后发送 / 保留队列立即发送」的两种语义在这里，**不在 `stop` 的 payload 里**。

### 2. 既有骨架的事实（`23cd766e` 实测）

`apps/cli/packages/bootstrap/src/kernel-bridge/` 已有：

| 模块                       | 现状                                                                                                                                                             |
| -------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `entry.ts`                 | 物理协议入口；`route()` 已接 `command`、`commandsQuery`、`conversationSubscribe`、`conversationResync`、`conversationUnsubscribe`、`connectionFlow` 六个 v4 方法 |
| `bridge-engine.ts`         | `execute()` 的 `switch (envelope.type)`：**已接** `createSession` 与配置类命令；**其余命令类型回 `unsupported`**，不伪造成功                                     |
| `command-inbox.ts`         | 串行 admission、CAS、全局幂等桶                                                                                                                                  |
| `projection-layer.ts`      | 事件 → 投影 → 帧                                                                                                                                                 |
| `sequence-watermark.ts`    | 序号与水位                                                                                                                                                       |
| `snapshot-materializer.ts` | 快照物化                                                                                                                                                         |

**本包的工作就是在 `execute()` 的 switch 里补齐回合类命令**，并新增「回合推进」与「审批交互」两个内部模块。`route()` 的六个已接方法不动。

## 三、v4 命令面的当前缺口（本包要补的部分）

`kernel-bridge-01` 审查结论（计划书「内核方案调整」）：**34 种 v4 命令只实现了 3 种**。本包负责其中「输入与回合」一类，`kernel-bridge-03` 负责其余。

本包承诺从 `unsupported` 变为**真实执行**的 5 个命令（字面量已核准，见 §二.1.1）：

| 命令字面量           | 语义                                                   | 关键点                                                                                                                                            |
| -------------------- | ------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| `createSession`      | 建会话；payload 的 `firstInput` 存在时立即投递首条输入 | 建会话已实现，本包补 `firstInput` 的投递与原子性（B3）                                                                                            |
| `sendText`           | 向会话投递一条用户输入                                 | `requestedDelivery` 三义：`startNow`（原子抢占当前 turn）/ `queue`（入队）/ `guide`（steer）；admission 后由 `inputRouting.mode` 裁决（B2/B4/B5） |
| `stop`               | 停止当前回合                                           | 取消的唯一命令；payload 只有 `expectedForegroundExecutionId`（迟到 Stop 防误杀），**没有 `keepInbox`**（B6）                                      |
| `compact`            | 输入型维护：idle 立即执行、busy/held 进 FIFO           | 不走 CAS，`sourceCommandId` 提供幂等边界（B7）                                                                                                    |
| `resolveInteraction` | 审批/交互应答                                          | `answer` 的 `optionId`/`freeText`/`action`（accept/decline/cancel）/`content`；先到先得、晚到 noop（B9/B10）                                      |

> 字面量与 payload 形状的权威来源是 `packages/shared/src/protocol-v4/command.ts` 的 `commandPayloadSchemas`（34 个命令）；本合同只列语义与归属，不复制 schema。`queuePosition` 的权威字段是 `conversationInputIntentSchema.order.queuePosition`。

## 四、与 legacy 线的接缝（kernel-switch 准入项 C2）

**规则（计划书「接入包流程」+ Lead 2026-10-20 裁决）**：

1. 回合类旧协议方法（`session/send`、`session/stop`、`session/cancelBackgroundTask`、`session/compact`、`session/fork`、`session/goal`、`session/setModel`、`session/setThoughtLevel`、`session/setMode`、`session/resume`、`session/subscribe`）在旧协议侧**由 legacy 路由器收口**；
2. 但它们的**执行必须实到 `kernel-bridge-legacy` 冻结的执行端口**（`registerLegacyExecutionPort` / `LegacyExecutionPort.execute`，见 `specs/contracts/kernel-bridge-legacy/interface.md` §四）；
3. 依赖方向固定：**`kernel-bridge-02` → `kernel-bridge-legacy`**。本包 import legacy 的注册面并注册自己的实现；`kernel-bridge-legacy` 不得 import 本包；
4. 所以「v4 `sendText`」与「旧协议 `session/send`」最终走**同一条执行实现**：v4 侧经 `execute()` 的类型分派，旧协议侧经 legacy 端口的 `execute({method, params})`。**两条路径不得各自实现一份**。

这条是 `kernel-switch` 的准入项 C2，本包必须做到；未做到则 legacy 侧的回合方法只能回 capability 缺席（`kernel-bridge-legacy` behavior B10 的临时态），M2 无法退出。

## 五、不变量（锁定的冻结面）

| #   | 不变量                | 内容                                                                                      |
| --- | --------------------- | ----------------------------------------------------------------------------------------- |
| L1  | 单一 admission 所有者 | 输入只经 `CommandInbox` 进入；DSH 会话收件箱不出现第二条写入路径                          |
| L2  | 幂等                  | 同 `commandId` 重复投递返回同一结果，不产生第二次副作用                                   |
| L3  | 序号单调              | 回合帧的 `fromSeq` 严格单调；取消与失败不得回退水位                                       |
| L4  | 快照一致              | 任何时刻的快照都能从 DSH 事件序号重建；重连与回放语义不变                                 |
| L5  | 链路语义              | `desktop-continuous` 与 `web-remote-replayable` 的流、快照、队列、重连语义不因本包改变    |
| L6  | 帧结构                | assistant 行、tool 行、`TurnComplete` 的形状与 `@knorvia/shared` 冻结的 schema 逐字段一致 |
| L7  | 审批闭环              | 每个 `approval/asked` 都有配对的 `approval/decided`；无应答者时 fail closed，不授权       |
| L8  | 无新写入路径          | 本包不新增 `KNORVIA_` 环境变量、不改数据目录、不改旧协议方法                              |

## 六、测试与门禁

- 契约测试只走公开入口：`app-server --stdio` NDJSON（与 `kernel-bridge-01` 同一套 `_protocol.mjs` 口径）。
- `specs/contracts/kernel-bridge-01/tests/**` 的 20 个用例**必须继续全过**（本包扩了命令面，不能破坏准入/序号/快照骨架）。
- `specs/contracts/kernel-dsh-00/tests/**`、`specs/contracts/kernel-dsh-builtins/tests/**` 继续全过。
- 门禁同「接入门禁」：`fmt` / `fmt:check` / `typecheck` / `lint` / `architecture:check` / `build:cli-packages` / 两道相似度 / knip 条目级 / `test:studio` 交 CI / `provenance:report` + `check`（最后一步）。
- **DSH 是第三方依赖登记，不跑相似度**；本包新代码逐文件登记 `original`。
- Windows 语义：新增合同测试用 `--test-concurrency=2` 单文件完整跑并记录耗时；清理一律放 `after` 钩子、多动作各自 try/catch、`rm` 带重试；不用 `--test-force-exit`。

## 七、条目 → 测试对照表

> 接入包例外：无「被替换的旧实现」可录 `gate-old.json`。本包行为依据是 v4 冻结 schema + `kernel-bridge-01` 骨架 + DSH 公开事件面。
> **合同阶段可立即通过**的只有 `command-surface.test.mjs` 与 `fake-provider-seam.test.mjs`（共 8 用例）；其余行为条目随实现 PR 落地，届时本表逐行补齐。

| 条目                                   | 测试文件 · 用例                                                                     | 阶段    |
| -------------------------------------- | ----------------------------------------------------------------------------------- | ------- |
| B1 五个回合命令字面量存在于命令面      | `command-surface.test.mjs` · 5 个字面量都在、自造名都不在                           | ✅ 合同 |
| B1 命令面共 34 个                      | `command-surface.test.mjs` · 数量 = 34                                              | ✅ 合同 |
| B1 `sendText` 交付意愿三义             | `command-surface.test.mjs` · `startNow`/`queue`/`guide` 合法，`steer`/`queued` 非法 | ✅ 合同 |
| B1 不新增 v4 方法名                    | `command-surface.test.mjs` · `V4_METHODS` 取值冻结                                  | ✅ 合同 |
| B1 未知方法仍 `-32601`                 | `command-surface.test.mjs` · default 分支行为不变                                   | ✅ 合同 |
| B1 回合信封可按冻结形状构造            | `command-surface.test.mjs` · 信封字段                                               | ✅ 合同 |
| B2 假 provider seam 可注册             | `fake-provider-seam.test.mjs` · `registerAdapter` + `listProviders`                 | ✅ 合同 |
| B2 seam 元数据 fail closed             | `fake-provider-seam.test.mjs` · name 为空即拒绝                                     | ✅ 合同 |
| B1 回合命令不再 `unsupported`          | `turn-dispatch.test.mjs` · 五个命令的 ACK                                           | 实现    |
| B2 `sendText` 真实执行并产出回合帧     | `turn-dispatch.test.mjs` · assistant 行 → `TurnComplete`                            | 实现    |
| B3 `createSession.firstInput` 原子语义 | `turn-dispatch.test.mjs` · 同一 ACK 含 `sessionId` + `turnId`                       | 实现    |
| B4 `sendText.queue` 入队不丢输入       | `turn-queue.test.mjs` · `delivery.admitted === "queue"` + `order.queuePosition`     | 实现    |
| B5 `sendText.guide` 并入当前回合       | `turn-queue.test.mjs` · `steer.state` 走 `steering → guided`                        | 实现    |
| B6 `stop` 停止当前回合                 | `turn-cancel.test.mjs` · 停止后无新 assistant 行；过期 Stop noop                    | 实现    |
| B7a `heldQueueDisposition` 两义        | `turn-queue.test.mjs` · `clearQueueAndSend` / `keepQueueAndSend` 对照               | 实现    |
| B7b `compact` 排队语义                 | `turn-compact.test.mjs` · idle 立即、busy 进 FIFO                                   | 实现    |
| B8 幂等：同 `commandId` 只执行一次     | `turn-idempotency.test.mjs` · 重复投递同一 ACK                                      | 实现    |
| B9 `resolveInteraction` 回填审批       | `turn-approval.test.mjs` · 成对审计事件 + 应答回填                                  | 实现    |
| B10 审批无应答 fail closed             | `turn-approval.test.mjs` · 超时/缺席不授权                                          | 实现    |
| B11 回合帧形状                         | `turn-frames.test.mjs` · assistant/tool 行与 `TurnComplete` 逐字段                  | 实现    |
| B12 序号单调不回退                     | `turn-frames.test.mjs` · 含取消与失败的连续回合                                     | 实现    |
| B13 两条链路语义不变                   | `turn-links.test.mjs` · `desktop-continuous` 与 `web-remote-replayable`             | 实现    |
| B14 legacy 执行端口接线（C2）          | `turn-legacy-port.test.mjs` · `session/send` 与 `sendText` 同一实现                 | 实现    |
| B15 单一 admission 所有者              | `turn-admission.test.mjs` · DSH 收件箱无第二条写入路径                              | 实现    |
| B16 `kernel-bridge-01` 20 用例继续全过 | `kernel-bridge-01/tests/**`                                                         | 实现    |

## 八、计分模式

- 本包新增文件全部登记 `original`、`Apache-2.0`（每文件首行 SPDX）。
- 仍按计划书对旧 `core` 与 `bootstrap` 的回合执行路径、以及上游固定提交跑两道门槛：行包含率 < 0.20 且最长相同段 < 8（<10 行必须 0）、结构 < 0.40；normal 与 declaration 两门都跑，未过计数取并集。
- DSH 子包按第三方依赖登记，不跑相似度、不登记 `original`。

## 八之二、离线回合驱动的可行性（已实测，结论：可行）

**结论：用 DSH 的公开 LLM seam 注册一个假 provider，可以离线确定性驱动回合。已验证。**

实测探针（2026-10-20，Node 24.14.0 / Windows，`wt/cb02`）：

```text
{
  "LlmAdapterIsClass": true,
  "registerOk": true,
  "handleKeys": ["replace"],
  "providers": [{ "id": "knorvia-fake", "name": "Knorvia Fake Provider" }]
}
```

机制：

1. `@deepseek-ai/dsh-llm` 导出抽象类 `LlmAdapter`，公开方法
   `ctx.llm.registerAdapter(providers: string[], adapter: LlmAdapter): AdapterRegistrationHandle`；
   返回的 handle 只有 `replace`（换绑，不是解绑）。
2. `LlmAdapter` 需要实现的最小面（**实测**）：`providerInfo(provider)` 返回 `{ id, name }`（`id` 必须等于注册的 provider 名、`name` 非空，否则注册抛 `LlmError`）；`providerRetryPolicy()` 与 `imageRequestPricing()` 返回 `undefined` 即用默认；再实现 `stream` 产出固定帧。
   `LlmAdapter.prototype` 的完整方法面：`providerInfo`、`providerRetryPolicy`、`imageRequestPricing`、`listModels`、`resolveModel`、`prepareCall`。
3. `dsh-llm-pi-ai` 走的是同一条公开接口。**不 fork、不改 DSH 源码**，符合计划书红线。
4. 假 provider 只用于契约测试（`tests/_fake-provider.mjs`），不进入组合行、不进入产品运行时。

**离线覆盖**：`createSession` + `sendText` 用假 provider 真实驱动 agent loop，从而断言 assistant 行、tool 行、`TurnComplete` 的**帧形状**与**序号单调性**；`stop` 与 `compact` 不需要模型即可确定性断言。

**留给真实冒烟**（`kernel-switch`）：真实模型 token 流、真实工具调用的完整回合、真实 Host 审批应答。

## 九、完成度

| 步骤                                                      | 状态                                                 |
| --------------------------------------------------------- | ---------------------------------------------------- |
| 侦察 v4 回合命令字面量（`commandPayloadSchemas` 34 命令） | ✅（Lead 提供 + 本包源码复核 `command.ts` L44–L185） |
| 侦察 DSH 回合驱动 seam（`ctx.llm.registerAdapter`）       | ✅ **实测注册成功**（见 §八之二）                    |
| `behavior.md` B1–B16                                      | ✅                                                   |
| `interface.md` / `callers.md`                             | ✅                                                   |
| `known-differences.md` / `acceptance.md`                  | ✅                                                   |
| `tests/`（合同阶段 8 用例）+ `fixtures/`                  | ✅                                                   |
| 合同 PR                                                   | ⬜                                                   |
| 实现 PR（B2–B16 行为测试）                                | ⬜                                                   |

> 本包**无 `stubs/`**：接入包不替换任何既有实现，按计划书口径「桩只含签名」对它不适用（`kernel-dsh-builtins` 同例）。
> | `stubs/` | ⬜ |
> | `known-differences.md` / `acceptance.md` | ⬜ |
> | 合同 PR | ⬜ |
> | 实现 PR | ⬜ |

## 十、缺口清单（DSH 做不到或语义不符）

| #   | 缺口                                                                                                                         | 影响                                         | 处置                                                                                                                                                                 |
| --- | ---------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| G1  | DSH 的取消入口是 `agent.cancel(cause, { keepInbox })`，「第一个原因胜出」；v4 的 `stop` 只有 `expectedForegroundExecutionId` | 迟到 Stop 的防误杀要靠我们自己比对 id        | 用 `expectedForegroundExecutionId` 比对当前前台执行 id；不匹配则 noop（B6）                                                                                          |
| G2  | v4 的 `heldQueueDisposition` 是「held 状态下必带」的**输入处置意图**，而 DSH 的 `keepInbox` 是**取消时**的队列开关           | 两者语义接近但作用点不同（发送时 vs 取消时） | 分别映射：`heldQueueDisposition` 在发送侧决定 `clearQueueAndSend`/`keepQueueAndSend`；`keepInbox` 在取消侧由本包的 `stop` 实现决定。差异记 `known-differences.md` D3 |
| G3  | DSH 的 steering 在「下一个 accepted in-turn pre-step」生效，不能立即中断正在进行的工具                                       | `guide` 是尽力而为，不是抢占                 | B5 如实表达；`conversationInputSteerSchema.state` 的 `fellBack` 有对应语义                                                                                           |
| G4  | DSH 的审批审计事件必须落在开放回合内，回合外 `approval.request()` 抛错                                                       | 审批只能在回合内发起                         | B9 只在回合内请求；这是安全语义（不是缺陷）                                                                                                                          |
| G5  | `compact` 在 DSH 侧是 `ctx.compaction.compactNow` 一类的服务调用，不是「输入」                                               | v4 把 compact 当输入型维护命令（可排队）     | 本包在 admission 层把它当输入意图排队，执行时调 DSH 压缩服务；差异记 D4                                                                                              |
| G6  | DSH 是预发布 SDK（`0.2.0-rc.2`），`LlmAdapter` 形状不承诺兼容                                                                | 假 provider 探针可能随升级失效               | 锁定确切版本；升级单独验收                                                                                                                                           |

**红线**：以上缺口一律在 Knorvia 侧适配，**不改 DSH 源码**，不放宽断言。

## 十一、接口与调用方

见 [interface.md](interface.md) 与 [callers.md](callers.md)。
