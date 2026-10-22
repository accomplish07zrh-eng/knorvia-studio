# kernel-plugin-tools-02 已知差异

> 每条都是「有意为之的差异」，不是缺陷。若某条被改动，视为破坏合同。

## D0 元数据必须分两层：DSH 工具定义 vs Knorvia 能力声明（2026-10-23 实测）

**与 `tools-01` 的 D0 同源**（同一批侦察产出的合同携带同一个错误假设）。

**合同原状**：`interface.md` §二 把 `destructive` / `concurrentSafe` /
`sideEffectScope` / `riskLevel` / `maxOutputBytes` 当作「工具的元数据」一并列出，
**暗示它们都是 DSH 工具定义的一部分**。

**实测**（`@deepseek-ai/dsh-tools/lib/types/schema.d.ts` 的 `DefineToolOptions`）：

| 字段                                                                                                           | 是否存在 | 说明                         |
| -------------------------------------------------------------------------------------------------------------- | :------: | ---------------------------- |
| `timeoutMs`                                                                                                    |    ✅    | L197                         |
| `isConcurrencySafe`                                                                                            |    ✅    | L203，**是函数不是布尔字段** |
| `readOnly` / `destructive` / `needsApproval` / `sideEffectScope` / `riskLevel` / `maxOutputBytes` / `guidance` |    ❌    | **DSH 工具定义里全部没有**   |

**两层分离**（与 `tools-01` 一致）：

| 层               | 谁定义                                                | 管什么                               | 本包怎么提供                        |
| ---------------- | ----------------------------------------------------- | ------------------------------------ | ----------------------------------- |
| DSH 工具定义     | `@deepseek-ai/dsh-tools`                              | 工具怎么跑（参数、执行、超时、并发） | `defineTool({...})`                 |
| Knorvia 能力声明 | `kernel-plugin-policy` 的 `ToolCapabilityDeclaration` | 工具的风险/审批语义                  | 导出 `TOOLS_02_CAPABILITIES` 纯数据 |

**⚠️ 而 `guidance` 在本包是特例** —— 它不是工具字段，而是 `dsh-plan-mode` 的
**部署方配置** `PlanModeConfig.section`（实测 `dsh-plan-mode/lib/types/index.d.ts`）：

```ts
export interface PlanModeConfig {
  /** Guidance rendered as the `plan:policy` prompt section while plan mode is active. */
  section: string;
}
```

所以「两份 guidance 文本」由组合根传给 `dsh-plan-mode`，**不经过 `defineTool`**。

## D1 `sessionModeBefore` 从五态字符串降级为布尔

**旧实现**：`EnterPlanMode` 返回 `{ sessionModeBefore: <"build"|"edit"|"plan"|"yolo"|"auto"> }` ——
告诉模型「进入前的会话模式是哪一种」。

**DSH**：`PlanModeController` 只暴露「当前是否 plan」（布尔），**没有五态概念**。

**本包**：返回 `{ sessionModeBeforePlan: boolean }`。

**影响**：模型失去「之前是 build 还是 edit」这个信息，只知道「之前是否已在计划模式」。

**为什么可接受**：五态模式是 `kernel-plugin-policy` 的产品概念，
DSH 的 plan-mode 只关心「是否 plan」。若 policy 包后续需要五态信息，
应由它自己维护，而不是让本包从 DSH 反推。

**⚠️ 若某个提示词依赖「之前是 build 还是 edit」→ 需在 policy 包补齐。**

## D2 `TodoRead` 不实现，由会话投影承接

**旧实现**：`TodoRead` 工具（读当前 todo 列表）+ `TodoWrite` 工具。

**DSH**：`dsh-tool-todo` 只提供 `todo_write`，并通过 `sessionProjections` 把 `todos`
投影进模型上下文（`inject = ["tools", "sessionProjections"]`）。

**本包**：不实现 `TodoRead`。

**数据形状与状态所有者均相同**（`{ content, status }[]`，per-session），
所以**不是功能减少**，而是同一信息的更优通道（省掉一次工具往返）。

**⚠️ 若将来发现模型/提示词依赖 `TodoRead` 工具存在**（实测证据）→ 再评估补一个只读工具。

## D3 计划模式 guidance 是**重写**而非逐字保留

**用户裁决**：「保留语义、重组表达；不采用逐字保留与豁免。」

**本包**：

- 36 项语义条目全部保留（见 [plan-mode-entries.md](plan-mode-entries.md)）；
- 表达完全重写（组织方式自定）；
- **正常过两道相似度门槛**（< 0.20 / run < 8 / structural < 0.40）。

**⚠️ 这是本包最大的行为风险点**：
提示词措辞会直接影响模型触发 `EnterPlanMode` 的频率。
**所以用户要求「真实模型对比触发率」** —— 见 [acceptance.md](acceptance.md) 的场景集与验证记录。

## D4 退出说明比旧版**更完整**（不是措辞重排）

**旧说明**（27 行）：只讲「什么时候用 ExitPlanMode」。

**DSH 的 `exit_plan_mode` 有 6 种失败模式**（无 agent / 不在计划模式 / 计划格式不对 /
无 userQuestions / 服务重载 / 用户取消或要求继续规划），旧说明**完全没提**。

**本包**：退出说明覆盖 8 个小节（含这 6 种失败的含义与应对）。

**所以这不是「换个说法」而是「补上旧说明缺失的行为」** ——
模型第一次会知道「用户选『继续规划』不是工具坏了，是让我改计划」。

## D5 `EnterPlanMode` 的四态语义（旧实现只有「成功」）

**旧实现**：进入计划模式只有「成功」一种结果。

**DSH 的 `PlanModeController.set()` 返回四态**：
`committed` / `queued` / `cancelled` / `noop`。

**本包**：把四态映射为工具输出（见 behavior.md B5）：

- `committed` → 成功且 `changed: true`；
- `queued` → 成功但 `changed: false` + `phase: "queued"`（**模型须知道尚未生效**）；
- `cancelled` → **抛错**（不得静默当成功）；
- `noop` → 成功但 `changed: false`。

**⚠️ `queued` 是新增语义**：旧实现没有「排队」这个概念，
模型需要知道「我的进入请求还没生效，当前步骤结束后才生效」。

## D6 自动化轮次判定的信息来源（与 `tools-01` 同）

**旧实现**：由宿主的 `rejectAutomationTurn(context, name)` 回调判定。

**本包**：读 DSH 执行上下文的 `metadata.automationTurn === true`。

**⚠️ 这是本包与 `tools-01` 共享的运行前提**：DSH 的 `ToolRunContext` 没有「自动化轮次」概念，
所以约定宿主在该字段上标注。**若宿主不标注 → 保护不生效**。

## D7 `ReadSessionContext` 的数据来源变了（从 core 状态 → DSH 投影）

**旧实现**：从 core 的会话对象（`core/src/repl` 的运行时状态）读上下文。

**DSH**：从会话投影（`sessionProjections`）读，再叠加 Knorvia 附加信息。

**⚠️ 这可能导致字段的可得性不同**：
旧实现能读到的某些内部字段，在 DSH 投影里可能不存在。
**实现时必须逐字段核对**，缺失的要么由 Knorvia 侧补、要么记入本文件。

**⚠️ 这是本包实现阶段最需要逐字段验证的一处** ——
`read-session-context.ts`（345 行）的输出 schema 必须逐字段对照。
