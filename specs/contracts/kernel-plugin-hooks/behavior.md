// SPDX-License-Identifier: Apache-2.0
// kernel-plugin-hooks 合同 v1 的行为规格。行为用本仓库自己的话描述；编号发布后不重用。

# kernel-plugin-hooks 行为规格（v1）

## 一、范围与口径

- **本包做的事**：把 7 种 Hook 事件挂到 DSH 的 cordis 事件扩展点；实现 Hook 执行器；保留工作区 Hook 信任规则与 session mailbox 登记。
- **不复用的旧代码**：`core/src/hooks/**` 28 个文件随 `kernel-switch` 整体删除。本包**只复用它们的行为合同**（见 §四 映射表），不返工其代码。
- **行为编号**：H1..Hn 是本包自己的行为（挂载、执行器、信任策略）；B1..B19 是复用的 `core-hooks` 行为，语义不变、只换挂载方式。
- **时间**：不断言具体毫秒；只断言顺序、字段存在性与单调性（沿用 `core-hooks` 口径）。
- **状态所有者**：Hook 配置与信任策略由本插件持有；会话正文归 DSH 会话日志；本模块不引入进程级隐藏单例（依赖由 `apply` 注入）。

---

## 二、DSH 侧的关键事实（2026-10-22 实测）

> 全部来自 `node_modules/@deepseek-ai/dsh@0.2.0-rc.2` 各子包 `lib/types/*.d.ts` 的公开类型与 JSDoc。不读、不改源码。

### 2.1 事件分发模式（`@deepseek-ai/cordis/lib/types/events.d.ts`）

| mode        | 语义（原文要点）                                                                       |
| ----------- | -------------------------------------------------------------------------------------- |
| `emit`      | 同步调用监听器、不 await                                                               |
| `parallel`  | 所有监听器一起 await                                                                   |
| `serial`    | **按序 await，直到某个监听器 bail**；返回首个 bail 值（非 `null`/`false`/`undefined`） |
| `bail`      | 同步调用直到首个 bail 值                                                               |
| `waterfall` | 组合式：每个监听器拿到 `next()`，可拦可改可短路                                        |

**对旧 Hook 语义的映射**：

- `waterfall` 的「不调 `next()`」= 旧行为的**短路**（后续 Hook 不执行）✅
- `serial` 的「首个 bail 值即短路」= 旧行为的**任一 deny 即短路**✅
- **两者都与旧行为一致，无需 known-difference**

### 2.2 `session/created`（SessionStart）

```ts
'session/created'(this: Scoped<Session>, session: Session): void;
```

**JSDoc 原文要点（`@mode emit`）**：

> Creation announcement during session publication. **A synchronous throw vetoes and rolls back with a paired disposal**; detach requested during dispatch is deferred. A returned-promise rejection is logged but **cannot retroactively veto** this synchronous boundary.

**约束**：

- ✅ 同步 `throw` → 否决会话创建并回滚
- ❌ 返回 rejected promise → 只记录，**不能否决**
- → **H1 要求：`SessionStart` Hook 的阻断必须是同步 throw；异步 Hook 的阻断需在 await 前完成判定，否则降级为「记录但不阻断」并计入 telemetry**

### 2.3 `agent/pre-step`（UserPromptSubmit）

```ts
'agent/pre-step'(this: Scoped<Agent>, payload: {
  agent: Agent; messages: UserMessage[]; turn: number; step: number; signal: AbortSignal;
}, next: () => Promise<...>): Promise<...>;
```

**JSDoc 原文（`@mode waterfall`）**：

> Reject a proposed step or **replace the messages that enter it**. Calling `next()` preserves the current messages.

**能力**：拒绝步骤（阻断提交）；替换 messages（注入 additionalContext）。

### 2.4 `tools/pre-execute`（PreToolUse）

```ts
'tools/pre-execute'(this: Scoped<ToolRuntime>, exec: ToolExecution, next: () => Promise<PreToolDecision>): Promise<PreToolDecision>;
```

**JSDoc 原文（`@mode waterfall`）**：

> Allow, deny, cancel, or ask before dispatch. `next()` delegates to allow; `cancel` selects the canonical pre-dispatch cancellation result, and **missing approval support turns `ask` into denial**. Async gates must observe `exec.signal`; the registry rechecks cancellation after they settle but never abandons their promise.

**约束**：

- `ask` 在无审批支持时**降级为拒绝** → H3 要求：本包挂载时若 `ask` 是用户配置的结果，需保证审批应答者已装配（即 `dsh-user-approval` 在本插件之前可用），否则该 Hook 的 ask 表现为 deny 并计入 telemetry
- 异步门**必须观察 `exec.signal`**

### 2.5 `approval/request`（PermissionRequest）

```ts
'approval/request'(this: Scoped<Agent>, req: ApprovalRequestEvent, next: () => Promise<ApprovalOutcome>): Promise<ApprovalOutcome>;
```

**`ApprovalRequestEvent`**：`agent` / `toolName` / `callId?` / `reason?` / `displayReason?` / `signal?`

**JSDoc 原文（`@mode waterfall`）**：

> Ask composed answerers for one decision. **Return an outcome to claim the request or call `next()` to delegate.**

**能力**：Hook 可作为应答者**认领**该请求，或 `next()` 委托给下游应答者。

### 2.6 `tools/post-execute`（PostToolUse / PostToolUseFailure）★

```ts
'tools/post-execute'(this: Scoped<ToolRuntime>, exec: ToolExecution, result: Readonly<ToolExecutionResult>, next: () => Promise<PostToolDecision>): Promise<PostToolDecision>;
```

**JSDoc 原文（`@mode waterfall`）**：

> Accept, replace, enrich, or block a normalized dispatch result. `next()` accepts it unchanged; **thrown tools still reach this waterfall as errors**. Async listeners must observe `exec.signal`; after they settle, caller cancellation replaces only a successful accepted outcome with the code selected by whether the tool body was invoked.

**能力**：成功与失败**都**到达此扩展点 → 同时承担 `PostToolUse` 与 `PostToolUseFailure`。

### 2.7 `tools/result`（纯观测，不承担决策）

```ts
'tools/result'(this: Scoped<ToolRuntime>, exec: Readonly<ToolExecution>, result: Readonly<ToolExecutionResult>): undefined;
```

**JSDoc 原文（`@mode emit`）**：

> Observe the **frozen**, lossless-JSON final outcome. **Listener failures are contained.**

**用途**：审计与观测。**不用于阻断/改写**（`emit` + `deep-frozen`）。

### 2.8 `agent/turn-stopping`（Stop）

```ts
'agent/turn-stopping'(this: Scoped<Agent>, payload: { agent: Agent; turn: number; signal: AbortSignal }): Promise<void> | void;
```

**JSDoc 原文要点（`@mode serial`）**：

> The turn is about to close: the model owes no response (no live tool calls, no fresh steering). Awaited before the boundary commits — **a listener that objects steers (`agent.steer(...)`) and the machine re-reads its inbox**: fresh steering runs another step, none closes the turn. **Data decides, so listener order cannot change the outcome.**

**能力与约束**：

- ✅ Hook 调 `agent.steer(...)` 即让回合继续（等价旧 `continue: true`）
- ⚠️ **「数据决定，监听器顺序不能改变结论」** → 多 Hook 聚合时，**顺序无关**：只要任一 Hook 提出继续，回合就继续。这与旧「按序短路」在**结果上等价**（都是「有一个要继续就继续」），但**执行次数不同**（serial 会跑完所有监听器直到 bail）→ 记入 `known-differences.md`

---

## 三、本包行为条目

### H1 7 种事件挂载与生命周期

1. 插件 `apply(ctx, config)` 被调用后，**7 个挂载点全部注册**（§二 的 7 个事件名），注册顺序不影响语义（cordis 用 `Promise.all` 并发挂载）。
2. 每个挂载点只在**该事件发生且存在匹配配置**时才执行 Hook；无配置时不产生任何 Shell 调用，也不写日志（除 debug）。
3. 插件卸载（cordis 生命周期）后，7 个监听器全部注销，不再触发任何 Hook。
4. `SessionStart` 的阻断是**同步 throw**（§2.2 约束）；其余事件的阻断通过对应 waterfall/serial 的返回表达。
5. 状态所有者：监听器注册由 cordis 生命周期持有；Hook 配置快照由本插件持有，配置变更后**下一次事件**生效（不回溯已在进行的事件）。

### H2 Hook 执行器（复用 `core-hooks` B1–B9 的语义）

1. Hook 的两形态（`process` / `command`）按 `HooksRuntimeConfig` 解析与执行，行为与 B1–B9 一致：
   - stdin JSON 的字段（camelCase + snake_case 双写、`transcript_path`/`transcriptPath`、`hook_event_name`、事件专属别名）**逐条保留**；
   - `process` 形态：`[command, ...args]` 直接执行，不经 shell；
   - `command` 形态：经 shell 执行，环境叠加见 B2；
   - 变量展开（`${CLAUDE_*}` / `${KNORVIA_*}`）、未知变量原样保留、`${*_SKILL_DIR}` 抛 `ConfigurationError`。
2. **新增（相对 core-hooks）**：Hook 的输入里的 session / workspace / 模型选择事实，由本插件从 **DSH 公开服务**取得（不是旧 `core` 的运行时对象）。取值失败时按「该字段缺失」处理并计入 telemetry，不伪造值。
3. 执行超时、取消、输出上限沿用 B1–B9 的既有预算常量；`signal` 来自 DSH 事件的 `signal`（§2.3–2.8）。
4. 返回 `HookJSONOutput` 的解析、schema 校验、非法 JSON / schema 不符的处置与 B8 一致。

### H3 挂载点决策映射

1. `PreToolUse` → `tools/pre-execute`：`HookPermissionDecision` 的 `allow` / `deny` / `ask` 分别映射到 DSH 的 allow / deny / ask；**无审批支持时 ask 降级为 deny 并计入 telemetry**（§2.4）。
2. `PermissionRequest` → `approval/request`：Hook 产出决策时**认领**该请求；无决策时调 `next()` 委托下游。
3. `PostToolUse` → `tools/post-execute`：成功结果可被 Hook **接受 / 替换内容 / 阻断**。
4. `PostToolUseFailure` → `tools/post-execute`（错误分支）：thrown tool 也到达此点（§2.6），Hook 可阻断或替换。
5. `UserPromptSubmit` → `agent/pre-step`：Hook 决定「拒绝该步骤」或「替换进入步骤的消息」。
6. `Stop` → `agent/turn-stopping`：Hook 要求继续时调 `agent.steer(...)`；**不做任何事时回合正常关闭**。
7. `SessionStart` → `session/created`：同步 throw 阻断（§2.2）。
8. **多重 Hook 的聚合**：waterfall 类按注册顺序执行，首个产生阻断的 Hook 短路后续（不调 `next()`）；serial 类（Stop）由数据决定，顺序无关（§2.8）。

### H4 工作区 Hook 信任规则（复用 `core-hooks` B10–B16 的语义）

1. **策略存储**：复用 `adapters/src/storage/workspace-hook-trust-store.ts` 提供的存储（规格：「工作区 Hook 信任存储随 Knorvia Hook 插件保留」）。本包**不重新实现**文件锁、路径解析、原子写入。
2. **策略层**（本包实现）：信任策略的取值、设置、清除与通知（B10）；协调者的 epoch / revision 校验（B11）；单条信任求值（B12）；审核流程注册表（B13）；运行时准入（B14）；telemetry 脱敏（B15）；信任记录创建（B16）。
3. 信任判定的**结果**与旧行为一致：`allow_trusted_only` 缺记录 → `blocked_policy`；`deny` 优先于一切（B12）。
4. **新增**：准入判定的输入来自 DSH 事件（workspace 身份、工具名、Hook 来源），不依赖旧 `core` 的运行时对象。

### H5 session mailbox 登记（复用 B17）

1. 三个事件（`SessionStart` / `UserPromptSubmit` / `Stop`）的登记项形状、返回的 `additionalContext`、`PostToolUse` 的 pending input 入队语义与 B17 一致。
2. **新增约束**：`additionalContext` 的注入路径按 §五 known-differences 执行（延后到下一步）。

### H6 观测与 telemetry

1. 每次 Hook 执行产出可诊断记录：事件名、Hook 来源、决策、耗时、是否阻断、失败原因（脱敏后）。
2. 复用 B15 的脱敏规则（字段脱敏、摘要截断）。
3. 不记录完整用户内容、凭据、内部地址。

---

## 四、复用 `core-hooks` 合同的映射

| core-hooks 条目               | 本包对应       | 复用方式                                              |
| ----------------------------- | -------------- | ----------------------------------------------------- |
| B1 兼容 stdin                 | H2.1           | 语义不变                                              |
| B2 插件环境与变量展开         | H2.1           | 语义不变                                              |
| B3 执行描述元数据             | H2.1           | 语义不变                                              |
| B4 展示文本脱敏               | H6.2           | 语义不变                                              |
| B5 配置运行器登记             | H2.1           | 语义不变                                              |
| B6 workspace 登记项与插入顺序 | H4.2           | 语义不变（存储换成 adapters）                         |
| B7 配置回调执行映射           | H2.1           | 语义不变                                              |
| B8 执行结果解析               | H2.4           | 语义不变                                              |
| B9 退出码 2 输出语义          | H2.4           | 语义不变                                              |
| B10 策略提供者                | H4.2           | 语义不变                                              |
| B11 信任协调者                | H4.2           | 语义不变                                              |
| B12 单条信任求值              | H4.3           | 语义不变                                              |
| B13 审核流程注册表            | H4.2           | 语义不变                                              |
| B14 运行时准入                | H4.4           | 输入换成 DSH 事件                                     |
| B15 telemetry 脱敏            | H6.2           | 语义不变                                              |
| B16 信任记录创建              | H4.2           | 语义不变                                              |
| B17 session mailbox           | H5             | 语义不变 + additionalContext 延后（known-difference） |
| B18 公开入口与类型面          | `interface.md` | 换成 `@knorvia/bootstrap/kernel-plugin-hooks` 导出    |
| B19 平台与资源边界            | 全文           | 语义不变                                              |

---

## 五、known-differences

见 [`known-differences.md`](known-differences.md)。当前登记 **2 条**：

1. `PostToolUse` 的 `additionalContext` **延后到下一步**（DSH 无「工具结果后追加上下文」的公开通道）。
2. `Stop` 的多 Hook **执行次数不同**（serial 跑完所有监听器直到 bail；旧行为按序短路），但**聚合结论等价**。

---

## 六、与 `kernel-plugin-policy` 的挂载点分工

`tools/pre-execute` 是两边共用挂载点。分工按 **policy 的判定阶段**划分，不是简单「谁先谁后」：

| 阶段                                                                          | 谁能决定                        |  是否调 `next()`   |           本包 Hook 是否参与            |
| ----------------------------------------------------------------------------- | ------------------------------- | :----------------: | :-------------------------------------: |
| **硬约束**（plan 只读限制、`requiresUserInteraction`、`alwaysAsk`、会话授权） | **policy 独占**                 | 否 —— **直接返回** | **不参与**（Hook 无权推翻产品级硬约束） |
| **软约束**（ordinary、plan 豁免、build 默认）                                 | policy **调 `next()`** 交给下游 |         是         | **参与** —— Hook 判定后 policy 综合结论 |

**理由**：权限模式是产品级不可绕过的约束；Hook 是用户自定义扩展，只能作用于「模式本身允许的范围」。

**本包的实现约束**：

1. 不读取、不修改模式状态 —— 模式事实由 policy 拥有。
2. **不假设「所有工具调用都能看到 Hook」**：硬约束阶段 policy 不调 `next()`，本包监听器根本不执行。
3. Hook 的决策不能放宽硬约束 —— 因为硬约束阶段本包没有执行机会，这是结构性保证，不靠运行时判断。

**对齐状态**：待与 `kernel-plugin-policy` 合同双方确认（issue #287 记录）。
