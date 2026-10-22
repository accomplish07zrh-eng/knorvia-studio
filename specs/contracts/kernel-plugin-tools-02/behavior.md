# kernel-plugin-tools-02 行为条目

> 每条都可在离线测试中断言。行为依据取自旧实现
> （`core/src/tool/handlers/{off-peak,off-peak-execution,read-session-context,
read-session-context-extraction,plan-mode,plan-mode-operation,plan-mode-projection,
plan-mode-prompts,todo}.ts`，**只读对照**）与 DSH 公开类型。
> **本文件不复制旧代码，只规定可观察效果。**
>
> **范围**：四个工具（`OffPeakCreate` / `OffPeakList` / `ReadSessionContext` / `EnterPlanMode`）
>
> - 计划模式 guidance 两份文本。`TodoRead` 不实现（见 §F）。

## A. 工具注册与契约形状

### B1 四个工具的可用集

`ctx.tools` 在运行时列出的工具中，必须包含：

```
OffPeakCreate / OffPeakList / ReadSessionContext / EnterPlanMode
```

**且不含** `TodoRead`（由 `dsh-tool-todo` 的 `sessionProjections` 承接，见 §F）。

**断言**：注册集的名字排序后等于上述四个；`ctx.tools.get("TodoRead")` 为 undefined。

### B2 参数 schema 形状

| 工具                 | 参数字段                                                |
| -------------------- | ------------------------------------------------------- |
| `OffPeakCreate`      | `title` + 时间窗口字段（成对出现）                      |
| `OffPeakList`        | 无                                                      |
| `ReadSessionContext` | 无                                                      |
| `EnterPlanMode`      | 无（空输入对象，与旧实现 `z.object({}).strict()` 一致） |

**⚠️ `defineTool` 把 per-property 的 `parameters` 编译成隐式开放对象根**
（`{ type: "object", properties: {...} }`），断言要读 `properties`。

**断言**：四个工具的 `properties` 键集与上表一致。

### B10 无 DSH 品牌泄漏

工具 `description`、guidance、结果内容里**不得**出现
`DeepSeek Harness`、`powered by DeepSeek`、`@deepseek-ai/` 包名。

**断言**：逐个工具取 description + 两份 guidance 文本，正则检查无上述字样。

**⚠️ `guidance` 在本包的归属**（2026-10-23 实测澄清）：
本包的 `guidance` **不是工具字段**（DSH 的 `DefineToolOptions` 无 `guidance`），
而是 `dsh-plan-mode` 的**部署方配置** `PlanModeConfig.section`：

```ts
// node_modules/@deepseek-ai/dsh-plan-mode/lib/types/index.d.ts
export interface PlanModeConfig {
  /** Guidance rendered as the `plan:policy` prompt section while plan mode is active. */
  section: string;
}
```

所以「两份 guidance 文本」由组合根传给 `dsh-plan-mode` 的 `section` 配置，
**不是** `defineTool` 的参数。断言时从本包的导出常量取文本，而不是从工具定义里取。

## B. 离峰族

### B3 `OffPeakCreate` / `OffPeakList` 闭环

- `OffPeakCreate` 写入离峰窗口后，配置形状与旧实现一致（**数据格式不变**）；
- 时间窗口字段成对出现（缺一半 → 拒绝）；
- `OffPeakList` 返回全部窗口。

**断言**：创建 → 列出（含）→ 字段形状与旧实现逐键一致；缺一半窗口字段 → 拒绝且端口未调用。

### B9 自动化轮次内不得写

读 DSH 执行上下文的 `metadata.automationTurn === true`：

- `OffPeakCreate`（写）→ **拒绝**；
- `OffPeakList` / `ReadSessionContext` / `EnterPlanMode`（只读或模式切换）→ 仍可用。

**理由**：自动化轮次再创建自动化会无限递归（与 `tools-01` 的 cron 族同规则）。

**⚠️ 与 `tools-01` 共享同一个运行前提**：DSH 的 `ToolRunContext` 没有「自动化轮次」概念，
宿主须在 `metadata.automationTurn` 上标注。**若宿主不标注 → 该保护不生效。**

**断言**：两个用例（写工具被拒、只读仍可用）。

## C. 会话上下文族

### B4 `ReadSessionContext` 输出形状

从 DSH 会话投影 + Knorvia 附加上下文组装，输出字段与旧实现对齐。

**断言**：在给定会话下调用，返回对象的键集合与旧实现的输出 schema 一致。

## D. 计划模式族

### B5 `EnterPlanMode` 的四态语义（**本包最关键的适配点**）

旧实现返回 `{ sessionModeBefore: <五态之一> }`；DSH 的
`PlanModeController.set(agent, true)` 返回四态。映射如下：

| `set()` 返回 | 本工具返回                                            | 语义                                                 |
| ------------ | ----------------------------------------------------- | ---------------------------------------------------- |
| `committed`  | `{ active: true, changed: true, phase: "committed" }` | 已进入计划模式                                       |
| `queued`     | `{ active: true, changed: false, phase: "queued" }`   | 进入已排队（当前有在途步骤），**模型须知道尚未生效** |
| `cancelled`  | **抛错**（`PlanModeEnterCancelledError`）             | 进入被取消 —— **不得静默当成功**                     |
| `noop`       | `{ active: true, changed: false, phase: "noop" }`     | 已在计划模式，状态未变                               |

**断言**：mock `PlanModeController.set` 依次返回四态，逐个断言返回/抛错。

**⚠️ `sessionModeBefore` 的降级**：DSH 不提供「之前是哪种模式」（只有是否 plan），
本工具返回 `sessionModeBeforePlan: boolean`（旧实现是五态字符串）。
**记入 [known-differences.md](known-differences.md) D1。**

### B6 `EnterPlanMode` 不改变工具目录

进入计划模式前后，`ctx.tools.get()` 的集合**完全相同**
（DSH 注释：「entering or leaving plan mode changes only the prompt section,
not the request tool catalog」）。

**断言**：进入前后各取一次工具名集合，深度相等。

### B7 **enter 与 exit 的成对关系**

`enter_plan_mode`（本包提供）与 `exit_plan_mode`（DSH 提供）是一对：

```
enter_plan_mode  → PlanModeController.set(agent, true)  → 进入
   ↓（模型探索、设计、写计划）
exit_plan_mode   → DSH 的 exit_plan_mode（弹「Plan review」）→ 用户批准 → 离开
```

**两份 guidance 必须互相指向**：

| guidance     | 必须提到                                                                  |
| ------------ | ------------------------------------------------------------------------- |
| **进入说明** | 进入后准备好时用 **`exit_plan_mode`** 请用户审批                          |
| **退出说明** | 它是**从 `enter_plan_mode` 进入后**的退出；成功后「从下一步开始执行计划」 |

**断言**：

- 进入说明文本包含 `exit_plan_mode` 这个工具名；
- 退出说明文本包含 `enter_plan_mode` 或「进入计划模式」的表述；
- 退出说明覆盖 DSH 的 6 种失败模式（见 B11）。

## E. 失败路径

### B8 端口 / 服务缺失时明确失败

| 工具                            | 缺失的东西           | 行为                                     |
| ------------------------------- | -------------------- | ---------------------------------------- |
| `OffPeakCreate` / `OffPeakList` | 离峰端口             | 抛明确错误，**不返回空列表、不返回成功** |
| `ReadSessionContext`            | 会话投影服务         | 同上                                     |
| `EnterPlanMode`                 | `PlanModeController` | 同上                                     |

**断言**：四个工具各一例，都 `assert.rejects`，且错误文案含「not available」类表述。

## F. `todo` 的处置（本包不实现）

### B13 `TodoRead` 不存在，但 todo 始终可见

- `ctx.tools.get("TodoRead")` 为 undefined；
- 会话投影里 `todos` 可见（首次写入前为 `null`，写入后为 `{ content, status }[]`）。

**依据**（`dsh-tool-todo/lib/index.js`）：

```js
const inject = ["tools", "sessionProjections"];
const todosProjectionSchema = z.union([...]);
ctx.sessionProjections.register({ ... });
```

**断言**：断言无 `TodoRead` 工具；写入一条 todo 后从投影读到它；
且投影项的字段形状是 `{ content, status }`（与旧实现相同）。

**⚠️ 这不是功能减少** —— 同一信息通过投影提供，省掉一次工具往返。

## G. 计划模式 guidance 的语义覆盖

### B11 guidance 覆盖 36 项语义

**进入说明**必须覆盖（按 [plan-mode-entries.md](plan-mode-entries.md) §一–§五）：

| 项               | 数量 | 断言方式                                                    |
| ---------------- | ---: | ----------------------------------------------------------- |
| 7 类触发条件     |    7 | 每类至少一个可识别短语（如「新增有意义的功能」对应第 1 类） |
| 4 条「何时不用」 |    4 | 逐条                                                        |
| 6 步进入后流程   |    6 | 逐条                                                        |
| 5 个正例情形     |    5 | 逐条（话术自拟，断言「覆盖的情形」而非原文）                |
| 3 个反例情形     |    3 | 逐条                                                        |
| 3 条注意事项     |    3 | 逐条                                                        |

**退出说明**必须覆盖（§六 6.1–6.8）：

| 项                                                | 断言                                       |
| ------------------------------------------------- | ------------------------------------------ |
| 6.1 何时用（实现规划；纯研究不用）                | 含「研究」与「实现」的区分表述             |
| 6.2 `plan` 参数格式                               | 含「`# ` 标题开头」的要求                  |
| 6.3 前提（须在计划模式 + 需 user-questions 通道） | 两条都在                                   |
| 6.4 用户批准 → 离开模式、下一步执行               | 在                                         |
| 6.5 用户选「继续规划」→ **不是失败**              | 含「不是失败 / 修改后重新提交」的表述      |
| 6.6 用户取消 → 留在模式、停下等消息               | 在                                         |
| 6.7 服务重载 → 重新呈现                           | 在                                         |
| 6.8 成功只有一种结果                              | 含「成功恒为 approved / 其余为错误」的表述 |

**断言**：`plan-mode-guidance.test.ts` 逐项检查上述可识别短语的存在。

### B12 guidance 无逐字雷同

重写后的两份 guidance 对旧 `plan-mode-prompts.ts`（130 行）：

- 行相似度 **< 0.20**；
- 最长相同段 **< 8 行**；
- 结构相似度 **< 0.40**。

**⚠️ 不申请豁免**（用户裁决明确「不采用逐字保留与豁免」）。

**断言**：相似度工具实测（命令见 [acceptance.md](acceptance.md)）。

### B14 场景集可执行（按类对比）

`plan-mode-entries.md` §八 的 11 个场景（7 正 + 4 反）必须是可复制执行的固定提示文本。

**断言**：场景集文件存在且含 11 条；每条标注「期望触发 / 期望不触发」与「对应类别」。

**⚠️ 真实模型对比触发率需要 key** —— 无 key 时 acceptance.md 如实标注「未验证」。
