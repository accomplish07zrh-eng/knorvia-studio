# kernel-plugin-tools-02 调用方

> 两个视角：**谁调用本包的工具**（模型通过 DSH 注册表）与
> **本包调用谁**（宿主注入的三个端口 + DSH 的 `PlanModeController`）。

## 一、谁调用本包的工具

### 1. 模型（唯一实际调用方）

四个工具注册进 `ctx.tools` 后，由 DSH 的工具管线调度：

```
模型发起 tool call
  → tools/pre-execute   （审批：写工具 ask，只读工具直接放行）
  → tools/execute       （环绕：dsh-timeout 施加 30 秒预算）
  → 本包的 execute      （校验 → 调端口/控制器 → 投影）
  → tools/post-execute  （结果后处理）
  → tools/result        （呈现投影）
```

**⚠️ 本包不直接调用其它 Knorvia 包的工具**，也不被它们直接调用。

### 2. 契约测试

```
apps/cli/packages/bootstrap/test/kernel-plugin-tools-02.test.ts
apps/cli/packages/bootstrap/test/plan-mode-guidance.test.ts
```

**入口**：`apply(ctx, config)` + 假 `ctx.tools` 桩。
**断言面**：注册集、参数形状、四态语义、enter/exit 成对关系、
guidance 的 36 项覆盖、无品牌泄漏。

**⚠️ 测试不 import 实现内部函数** —— 只通过 `tools.get(name).execute(...)` 断言可观察行为。

### 3. 组合层（`KERNEL_PLUGIN_ROWS`）

追加一行：

```ts
{ rowId: "knorvia-tools-offpeak-plan", moduleId: "@knorvia/bootstrap/kernel-plugin-tools-02", config }
```

**并给既有的 `plan-mode` 行补 `section` 配置**：

```ts
{
  rowId: "plan-mode",                       // dsh-plan-mode 的行
  config: { section: ENTER_PLAN_MODE_GUIDANCE },
}
```

**⚠️ 这是本包与 `tools-01` 的关键差别**：`tools-01` 只追加工具行；
本包还要**修改既有 `plan-mode` 行的 config**（补 guidance）。

## 二、本包调用谁

### 三个注入端口

| 端口                   | 提供什么                    | 缺失时                          |
| ---------------------- | --------------------------- | ------------------------------- |
| `OffPeakPort`          | 离峰窗口的增/查             | 两个离峰工具抛明确错误          |
| `SessionContextSource` | 会话投影的读取面            | `ReadSessionContext` 抛明确错误 |
| `PlanModeController`   | DSH 的 `set(agent, active)` | `EnterPlanMode` 抛明确错误      |

**⚠️ 三者都是「能力边界」不是「实现细节」** —— 本包不假设它们怎么落库、怎么维护状态。

### `PlanModeController`（DSH 提供，公开服务）

```ts
class PlanModeController extends Service {
  set(agent: Agent, active: boolean): "committed" | "queued" | "cancelled" | "noop";
}
```

**本包只用 `set(agent, true)`** —— 不调 `set(agent, false)`（那是 `exit_plan_mode` 的事）。

### `dsh-tool-todo` 的 `sessionProjections`（只读，不调用 API）

**本包不调用它** —— 但 `ReadSessionContext` 需要从会话投影读数据，
所以 `SessionContextSource` 的实现方会用到它。

**⚠️ 这层间接是有意的**：本包不直接依赖 `dsh-tool-todo` 的内部，
只依赖宿主提供的「读会话上下文」能力。

## 三、本包**不**调用谁（重要的边界）

| 不调用                               | 为什么                                                            |
| ------------------------------------ | ----------------------------------------------------------------- |
| `core/src/**`                        | 旧实现只作行为对照，随 `core` 删除                                |
| `exit_plan_mode` 的内部实现          | 它是 DSH 提供的**工具**，模型直接调用；本包只写它的 guidance 文本 |
| `dsh-user-approval` 直接 API         | 审批由 `tools/pre-execute` 调度                                   |
| `dsh-timeout` 直接 API               | 超时由 `tools/execute` 环绕                                       |
| `kernel-plugin-policy` 的 API        | 进入条件的语义归它；本包只调 `set()`                              |
| 任何 `@deepseek-ai/*` 的内部实现文件 | 只用公开类型与公开服务（规格红线）                                |

## 四、enter / exit 的成对调用关系（本包最特殊的一处）

```text
模型
 │
 ├─ 调 enter_plan_mode（本包提供）
 │    → PlanModeController.set(agent, true)
 │    → 进入计划模式（提示 section 切换）
 │
 ├─ 探索代码库、设计、写计划
 │
 └─ 调 exit_plan_mode（DSH 提供）
      → 弹「Plan review」问用户
      → 用户 Approve → 离开计划模式 → 下一步执行
      → 用户 Keep planning → 抛错 → 模型改计划后重新提交
      → 用户取消 → 抛错 → 停在计划模式等消息
```

**⚠️ 关键：enter 是本包的工具，exit 是 DSH 的工具** ——
两者由不同实现提供，但**必须成对工作**。

**所以两份 guidance 必须互相指向**（behavior.md B7）：

- 进入说明：进入后准备好时用 `exit_plan_mode`；
- 退出说明：这是从 `enter_plan_mode` 进入后的退出。

**⚠️ 若只写其中一份的指引 → 模型可能「进了出不来」或「不知道 exit 存在」。**

## 五、依赖方向图

```text
模型
 │ tool call
 ▼
DSH ToolRuntime（ctx.tools）
 │ tools/pre-execute → execute → post-execute → result
 ▼
kernel-plugin-tools-02（本包）
 ├─ OffPeakPort（注入）          → 宿主：离峰配置存储
 ├─ SessionContextSource（注入） → 宿主：会话投影读取
 └─ PlanModeController（DSH）    → DSH：计划模式状态
 │
 ▼
（计划模式下）模型调 DSH 的 exit_plan_mode → 用户审查 → 批准后执行
```

**⚠️ 本包只做「工具 → 端口/控制器」这一跳**；
离峰存储、会话投影、计划模式状态机都不在本包范围内。
