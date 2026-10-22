# kernel-plugin-tools-01 合同（补缺工具：定时/离峰 + 会话/计划）

**合同版本：v1**（2026-10-22）

本目录是 M2 接入包 `kernel-plugin-tools-01` 的合同。它冻结**cron 族四个 Knorvia 工具在 DSH 运行时上的落地方式**：
`cron_*`（4）/ `off_peak_*`（2）/ `read_session_context` / `enter_plan_mode` / `todo_read`。

- 分支：`contract/kernel-plugin-tools-01`（基线 `origin/main`，含 `kernel-dsh-00`、`kernel-dsh-builtins`、
  `kernel-bridge-01/02/03`、`kernel-bridge-legacy`、`kernel-plugin-credentials`）
- 认领 issue：**#288**（原定 bash 族，侦察后改范围，见 §七「范围变更记录」）
- 前置合同：[`kernel-dsh-00`](../kernel-dsh-00/README.md) v1（新运行时启动与固定组合）、
  [`kernel-dsh-builtins`](../kernel-dsh-builtins/README.md) v1（工具挂载与配置）
- 依据：`specs/knorvia-builtin-kernel-dsh.md`「能力映射」表「工具 39 个」行 ——
  **「逐个对照：DSH 已有的直接用，缺的写成 Knorvia 工具插件」**；
  `specs/knorvia-internal-plugins.md`「内核层（M2）」；计划书「内核方案调整」「接入包流程」
- 事实来源：`@deepseek-ai/dsh@0.2.0-rc.2` 各子包的**发布类型**（`lib/types/*.d.ts`）、
  旧实现 `apps/cli/packages/core/src/tool/handlers/{cron,off-peak,read-session-context,plan-mode,todo}.ts`
  （**只读对照行为，不复制**）。**不读 DSH 源码仓库、不改 DSH。**

---

## 一、范围

### 1. 本包做什么

在 `kernel-dsh-builtins` 已挂载的工具集之上，**补 cron 族四个 DSH 没有的 Knorvia 工具**，
全部用 `ctx.tools.register(defineTool({...}))` 注册（DSH 公开 API）：

|  #  | 工具名（core 原名） | 主题         | 本包做法                       |
| :-: | ------------------- | ------------ | ------------------------------ |
|  1  | `CronCreate`        | 定时任务创建 | Knorvia 实现（DSH 无定时工具） |
|  2  | `CronList`          | 定时任务列表 | 同上                           |
|  3  | `CronUpdate`        | 定时任务更新 | 同上                           |
|  4  | `CronDelete`        | 定时任务删除 | 同上                           |

**归 `kernel-plugin-tools-02`（本包不做）**：

| 工具名                          | 主题             | 该包的做法（已由用户裁决）                                                |
| ------------------------------- | ---------------- | ------------------------------------------------------------------------- |
| `OffPeakCreate` / `OffPeakList` | 离峰窗口         | Knorvia 实现                                                              |
| `ReadSessionContext`            | 读会话上下文投影 | Knorvia 实现（DSH 会话投影 + 附加信息）                                   |
| `EnterPlanMode`                 | 进入计划模式     | 包装 `PlanModeController.set(agent, true)`（四态语义见 §二 2）            |
| `TodoRead`                      | 读 todo 列表     | **不实现** —— 由 `dsh-tool-todo` 的 `sessionProjections` 承接（见 §二 3） |

**⚠️ `plan-mode-prompts.ts`（131 行模型提示词）的迁移已由用户裁决为「方案 A：保留语义、重组表达」**，
详见 `kernel-plugin-tools-02` 的合同；本包不含。

1. 四个工具全部由本包实现。
2. 工具的参数 schema 用 DSH 的 `@deepseek-ai/schemastery`（**不是 zod**），
   与 `defineTool` 的 `DefineToolOptions` 对齐。
3. 工具的副作用边界：定时任务工具经宿主注入的 `AutomationPort` 读写（**数据格式不变**）。
4. 每个工具写契约测试，**只走公开入口**（`@knorvia/bootstrap/kernel-plugin-tools-01` 子路径与 DSH 公开服务）。
5. 新代码登记 `original`、`Apache-2.0`（每文件首行 SPDX）。

### 2. 本包不做什么

| 不做的事                                                                                                                                                                                                                         | 归属                                          | 依据                                                                                            |
| -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------- | ----------------------------------------------------------------------------------------------- |
| 工作流族 9 个工具（`create_workflow` / `amend_workflow` / `save_workflow` / `eval_workflow_snippet` / `get_workflow_run` / `list_saved_workflows` / `list_workflow_runs` / `resume_workflow_run` / `resolve_workflow_question`） | `kernel-plugin-workflow`                      | 计划书分包表                                                                                    |
| 子 Agent 族 7 个工具（`agent` / `task` / `respond_to_coordinator` / `submit_result` / `escalate` / `task_output` / `task_stop`）                                                                                                 | `kernel-plugin-skills`                        | 计划书分包表                                                                                    |
| Node REPL（`js` 工具）                                                                                                                                                                                                           | `kernel-legacy-sessions`                      | 计划书分包表（`core/src/repl`）。**注意 DSH 的 `run_code`（PTC 模式）可能部分覆盖，由该包侦察** |
| `TodoWrite`                                                                                                                                                                                                                      | `kernel-dsh-builtins`（已挂 `dsh-tool-todo`） | #228 已交付                                                                                     |
| 五种权限模式语义（plan/build/edit/yolo/auto）                                                                                                                                                                                    | `kernel-plugin-policy`                        | 计划书分包表                                                                                    |
| 7 种 Hook 事件                                                                                                                                                                                                                   | `kernel-plugin-hooks`                         | 计划书分包表                                                                                    |
| 返工 `core/src/tool/**` 的任何文件                                                                                                                                                                                               | ——                                            | **M2 接入包不动 `core`**；`core` 随 `kernel-switch` 删除。见 §二 4 映射表                       |
| 改 DSH 源码 / fork / vendor                                                                                                                                                                                                      | ——                                            | 规格「不做」                                                                                    |
| 改协议字段、数据格式、`KNORVIA_` 变量、数据目录                                                                                                                                                                                  | ——                                            | 冻结面                                                                                          |

---

## 二、DSH 侧的关键事实（2026-10-22 实测）

> 结论来自 `@deepseek-ai/dsh@0.2.0-rc.2` 的发布类型与 `node_modules` 实际产物。只记录接入需要的事实，不复制实现。

### 1. 工具注册与五段执行管线（`@deepseek-ai/dsh-tools`）

```ts
ctx.tools: ToolRuntime
  · register(definition)   // 注册工具
  · restrict(filter)       // 限制可用集
  · guard(check)           // 单调否决（注册在 tools/pre-execute waterfall 之后）
```

**五个 waterfall 事件**（全部允许异步监听器，且**必须观察 `exec.signal`**）：

| 事件                 | 语义                                                                 | 对本包的意义                                                   |
| -------------------- | -------------------------------------------------------------------- | -------------------------------------------------------------- |
| `tools/pre-execute`  | 允许 / 拒绝 / 取消 / **询问**；`next()` 委托为 allow                 | 审批入口。**缺审批支持时 `ask` 自动降级为拒绝（fail closed）** |
| `tools/execute`      | 环绕（超时 / 重试 / 指标）；**只能改 `exec.signal`**，调用身份不可变 | 超时由 `dsh-timeout` 在此挂载                                  |
| `tools/post-execute` | 接受 / 替换 / 丰富 / 阻断结果                                        | 结果后处理                                                     |
| `tools/result`       | 结果投影（呈现）                                                     | 展示层                                                         |
| `tool/ptc-dispatch`  | `run_code` 子分派的**日志副本**可替换                                | 与本包无关（PTC 属 REPL 族）                                   |

**工具定义**：`defineTool({ name, description, parameters, execute })`，
可选 `projectContent` / `finalizeContent`（呈现投影）。参数 schema 用 `@deepseek-ai/schemastery`。

### 2. `enter_plan_mode` 的对应物是**服务 API**，不是工具

`dsh-plan-mode` 的公开类型注释（逐字）：

> 「Plan mode is logged per-agent collaboration state: while active, a deployment-owned
> guidance section is included in each model request, and `exit_plan_mode` presents the
> completed plan for user review, while the `/plan off` command lets a user leave directly.」
>
> 「**The exit tool remains registered while plan mode is inactive, so entering or leaving
> plan mode changes only the prompt section, not the request tool catalog.**」

```ts
class PlanModeController extends Service {
  set(agent: Agent, active: boolean): "committed" | "queued" | "cancelled" | "noop";
}
```

**结论**：DSH **只有 `exit_plan_mode` 工具**；「进入」是 `PlanModeController.set(agent, true)` +
提示 section 切换。本包为此实现 `EnterPlanMode` 工具作为**公开 API 的正常包装**（不改 DSH）。

**四态返回的产品语义**（必须逐条落到 `behavior.md`）：

| `set()` 返回 | 含义（DSH 侧）                     | 本包工具的返回                                  |
| ------------ | ---------------------------------- | ----------------------------------------------- |
| `committed`  | 已进入计划模式                     | 成功，`active: true`                            |
| `queued`     | 当前有在途步骤，进入被排队到下一步 | 成功但标注 `queued: true`（模型需知道尚未生效） |
| `cancelled`  | 本次进入被取消                     | **失败**（不是静默成功）                        |
| `noop`       | 状态未变（已在目标状态）           | 成功，`active: true`，`changed: false`          |

**`sessionModeBefore` 字段的降级**：core 返回「运行前的会话模式」
（含 plan/build/edit/yolo/auto 五态）；DSH 的 `set()` 不返回该信息，
本包只能读 `PlanModeController` 当前是否 plan（布尔）。**记入 [known-differences.md](known-differences.md) D1。**

### 3. `todo_read` 由 `sessionProjections` 承接（不需要工具）

`dsh-tool-todo` 的公开事实：

```
inject = ["tools", "sessionProjections"]      // 注入两个注册表
ctx.sessionProjections.register({ ... })      // 注册 todos 投影
投影内容 = 完整列表，或「首次写入前为 null」
```

**结论**：todo 状态**始终在模型上下文里**（会话投影），
比「调一次工具去读」更优（省一次往返）。**本包不实现 `TodoRead`**，
**记入 [known-differences.md](known-differences.md) D2。**

> **⚠️ 若将来发现模型/提示词依赖 `TodoRead` 工具存在**（实测证据），
> 再评估是否补一个只读工具；现在按「投影承接」处理。

### 4. `core/src/tool/executor/` 的 37 个文件 → DSH 对应物（本包不返工它们的依据）

**这张表回答「为什么接入包不动 `core`」**：DSH 的工具管线已内建这些职责。

| 分类             | core 文件                                                                                                                                                                    |   数量 | DSH 对应物                                                                              |
| ---------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -----: | --------------------------------------------------------------------------------------- |
| 调用编排与身份   | `call-runner` `batch-runner` `invocation/{invocation,identity,context,admission,outcome}`                                                                                    |      7 | `ToolRuntime` + 四个 waterfall 事件（调用身份是不可变 `ToolExecution`）                 |
| 校验与超时       | `validation` `timeout` `deadline/pausable-deadline`                                                                                                                          |      3 | `validateArgs` + `ToolArgsError` + `dsh-timeout` + `exec.signal`                        |
| 权限与审批       | `permission-flow` `permission-flow/{assessment,refusals}` `permission-capability` `permission-grants` `permission-input-recheck` `permission-responder-race` `approval-gate` |      8 | `tools/pre-execute`（allow/deny/cancel/ask）+ `dsh-user-approval` + `dsh-authorization` |
| 权限（产品语义） | `permission-rules-persistence` `permission-suggestions`                                                                                                                      |      2 | **`kernel-plugin-policy`**（Knorvia 产品语义，不是 DSH 覆盖）                           |
| 结果处理         | `result-serialization` `result-content-projection` `result/{artifact-result,byte-budget,hook-result,protected-frame}`                                                        |      6 | `tools/post-execute` + `dsh-output-retention` + `dsh-spill` + `dsh-attachment`          |
| 展示层           | `display-text` `display/{computer,mcp,repl}-card` `create-workflow-display` `workflow-display/{analysis,catalog,run}-card` `workflow-observation-display`                    |      9 | `presentation.d.ts` 的 `ToolCallView` / `ToolResultView`（各变体）                      |
| Hook 与错误      | `hook-flow` `errors`                                                                                                                                                         |      2 | 四个 waterfall + `HarnessError`                                                         |
| **合计**         |                                                                                                                                                                              | **37** | **全部有归属**（35 个 DSH，2 个归 `kernel-plugin-policy`）                              |

**⚠️ 本表的边界（必须读）**：
「有对应物」**不等于**「语义逐字等同」。本表只回答「为什么这 37 个文件不需**返工**」 ——
它们随 `core` 删除，职责由 DSH 服务 + 两个 Knorvia 插件包承接；
**行为对齐**由 `kernel-dsh-builtins`（挂载与配置）与 `kernel-plugin-policy`（五种模式语义）负责。

### 5. 缺口工具的 DSH 状态（实测）

| 工具                                                    |  DSH 是否有   | 说明                                                           |
| ------------------------------------------------------- | :-----------: | -------------------------------------------------------------- |
| `CronCreate` / `CronList` / `CronUpdate` / `CronDelete` |     ❌ 无     | DSH 无定时任务能力；`dsh-jobs` 是**进程内后台任务**，不是 cron |
| `OffPeakCreate` / `OffPeakList`                         |     ❌ 无     | DSH 无「离峰窗口」概念                                         |
| `ReadSessionContext`                                    |     ❌ 无     | DSH 有会话投影机制，但无「读上下文」工具                       |
| `EnterPlanMode`                                         | ❌ 无（工具） | 有 `PlanModeController.set()` 服务 API，见 §二 2               |
| `TodoRead`                                              | ❌ 无（工具） | 有 `sessionProjections` 投影，见 §二 3                         |

**为对照，DSH 已提供（12 个，本包不实现）**：
`read` `write` `edit` `read_image`（`dsh-tool-fs`）、`glob` `grep`（`dsh-tool-fs-search`）、
`bash`（`dsh-tool-bash`）、`web_fetch` `web_search`（`dsh-tool-web`）、`todo_write`（`dsh-tool-todo`）、
`skill`（`dsh-tool-skill`）、`job_list` `job_output` `job_kill`（`dsh-tool-jobs`）、
`create_goal` `get_goal` `update_goal`（`dsh-tool-goal`）、`list_subagent_models`（`dsh-tool-subagent`）、
`interrupt_agent` `send_message`（`dsh-tool-subagent-control`）、`exit_plan_mode`（`dsh-plan-mode`）、
`list_mcp_resources` `list_mcp_resource_templates` `read_mcp_resource`（`dsh-mcp-resources`）、
`run_code`（`dsh-tools`，PTC 模式）。

---

## 三、缺口清单与处置

### 本包处理（G1）

|  #  | 工具                                                    | DSH 缺口                                                 | 本包处置                                         | 数据/行为影响                            |
| :-: | ------------------------------------------------------- | -------------------------------------------------------- | ------------------------------------------------ | ---------------------------------------- |
| G1  | `CronCreate` / `CronList` / `CronUpdate` / `CronDelete` | **无定时能力**（`dsh-jobs` 是进程内后台任务，不是 cron） | 实现四个工具，经宿主注入的 `AutomationPort` 读写 | **数据格式不变**（沿用 core 的存储形状） |

### 归 `kernel-plugin-tools-02`（G2–G5，本包不做）

|  #  | 工具                            | DSH 缺口                   | 该包处置                                                       |
| :-: | ------------------------------- | -------------------------- | -------------------------------------------------------------- |
| G2  | `OffPeakCreate` / `OffPeakList` | 无离峰概念                 | 实现两个工具                                                   |
| G3  | `ReadSessionContext`            | 无读取工具                 | 从 DSH 会话投影 + Knorvia 附加上下文组装                       |
| G4  | `EnterPlanMode`                 | 无进入工具（只有服务 API） | 包装 `PlanModeController.set(agent, true)`（四态语义见 §二 2） |
| G5  | `TodoRead`                      | 无读取工具（有投影）       | **不实现**；由 `sessionProjections` 承接                       |

**红线**：以上缺口一律在 Knorvia 侧实现，**不改 DSH**、**不放宽断言**、**不改数据格式**。

---

## 四、已有契约测试的复用

计划书「接入包流程」第 2 条：列出「走公开协议入口、对新运行时同样适用」的已有契约测试。
**分三类**：

### ① 走公开入口且对新运行时同样适用 → **必须继续全过**

| 套件                                                             | 入口                                   | 对本包的要求                                      |
| ---------------------------------------------------------------- | -------------------------------------- | ------------------------------------------------- |
| `specs/contracts/kernel-bridge-01/tests/**`                      | v4 协议（`app-server --stdio` NDJSON） | **必须全过**；本包不碰桥                          |
| `specs/contracts/kernel-dsh-00/tests/**`                         | `@knorvia/bootstrap/kernel`            | **必须全过**；本包会**追加**工具行，不改既有行 id |
| `specs/contracts/kernel-dsh-builtins/tests/tools-mount.test.mjs` | DSH 公开服务（`ctx.tools.get()`）      | **必须全过**；本包只追加，不改其挂载集            |
| `specs/contracts/kernel-plugin-credentials/tests/**`             | 公开插件入口                           | **必须全过**；与本包无交集                        |
| `specs/contracts/shared-0*`、`contracts-*`                       | 包级纯模块                             | 与运行时无关，期望不变                            |

### ② 只测旧内部端口 → **列明，随 `core` 删除，不迁移**

| 套件                                                            | 为何不迁移                                     |
| --------------------------------------------------------------- | ---------------------------------------------- |
| `specs/contracts/core-tool-01`                                  | 直接 import `core/src/tool/**`，随 `core` 删除 |
| `specs/contracts/core-tool-handlers-bash-01`                    | 同上（bash 族已在 `#169` 完成替换，见 §七）    |
| `specs/contracts/core-01/02/03`、`core-runtime-*`、`core-hooks` | 同上                                           |

**本包把其中与「定时/离峰/会话/计划」相关的**行为条目**按 DSH 工具语义重新列入 [behavior.md](behavior.md)，
不复制测试代码。**

### ③ 新增（本包特有）→ 新写

见 §五 条目 → 测试对照表。

---

## 五、条目 → 测试对照表

> **接入包合同 PR 的形态**（与 `kernel-plugin-hooks` #291 一致）：**只带合同文档，不带测试**。
> 理由：本包是**新建**，合同阶段没有可跑的实现；接入包也没有「旧实现」可录旧门。
> **所有测试随实现 PR 落地**，届时同一份合同即为其验收依据。

| 条目                                        | 测试文件 · 用例（实现 PR 落地）                                                                                       | 覆盖     |
| ------------------------------------------- | --------------------------------------------------------------------------------------------------------------------- | -------- |
| B1 四个 cron 工具在 DSH 上的可用集          | `kernel-plugin-tools-01-cron.test.ts` · 注册集为 `CronCreate`/`CronList`/`CronUpdate`/`CronDelete`，且不含 `TodoRead` | 注册     |
| B2 参数 schema 形状                         | 同上 · 四个工具的参数字段集；`defineTool` 会编译成隐式开放对象根，断言读 `properties`                                 | 契约     |
| B3 `CronCreate` 写入既有存储形状            | `kernel-plugin-tools-01-cron.test.ts` · 创建后调端口且参数正确；投影字段集与旧实现一致                                | 定时     |
| B4 `CronCreate` 的九条交叉约束              | 同上 · 逐条按约束名断言（`cron-required-without-delay` 等 9 条）                                                      | 定时     |
| B5 `CronList` / `CronUpdate` / `CronDelete` | 同上 · 列举、只改给定字段、删除幂等（`deleted:false` 不抛错）                                                         | 定时     |
| B6 字段级校验（DSH schema 表达不了的部分）  | 同上 · 空白 `title`/`cron`、`delayMinutes` 范围、`maxRuns` 正整数、`intervalUnit` 枚举                                | 校验     |
| B7 `delayMinutes: null` 等价于未给          | 同上 · `oneOf: [number, null]` 让 DSH schema 层放行，执行体按「非相对」处理                                           | 兼容     |
| B8 投影隐藏 `modelSelection` / `mode`       | 同上 · 创建与列举结果都不含这两个字段                                                                                 | 投影     |
| B9 端口不可用时四个工具都明确失败           | 同上 · 不返回空成功、不返回空列表                                                                                     | 失败路径 |
| B10 自动化轮次内写工具被拒绝                | 同上 · 读 `metadata.automationTurn`；`CronList` 仍可用                                                                | 保护     |
| B11 无 DSH 品牌泄漏                         | 同上 · 工具描述与结果无 `DeepSeek Harness` / `@deepseek-ai/`                                                          | 隔离     |

**⚠️ 本包不含**：`OffPeakCreate` / `OffPeakList` / `ReadSessionContext` / `EnterPlanMode` /
`TodoRead` —— 它们归 `kernel-plugin-tools-02`（见 §一 2 与 §七）。

---

## 六、计分模式

- **本包新增文件全部登记 `original`、`Apache-2.0`**（每文件首行 SPDX）。
- **对旧 `core` 对应文件与上游固定提交各跑两道门槛**（证明没有照搬）：
  - 行相似度：规范化包含率 **< 0.20**，最长相同段 **< 8 行**（<10 行文件必须为 0）。
  - 结构相似度：**< 0.40**。
- **比较对象（双重口径）**：
  ```
  --old <同路径> --old-rev beff12b5      ← 计划执行基线（用户裁决：统一固定）
  --upstream-dir <zcode 树> --upstream-rev 872ad960...
  两者取更差（max）< 0.20
  ```
- **本包的旧实现对照文件**（五个，均已在 `beff12b5` 上确认存在，共 1132 行）：

  | core 对照文件                                    | 行数 | 覆盖的工具                                              |
  | ------------------------------------------------ | ---: | ------------------------------------------------------- |
  | `core/src/tool/handlers/cron.ts`                 |  300 | `CronCreate` / `CronList` / `CronUpdate` / `CronDelete` |
  | `core/src/tool/handlers/off-peak.ts`             |  178 | `OffPeakCreate` / `OffPeakList`                         |
  | `core/src/tool/handlers/read-session-context.ts` |  346 | `ReadSessionContext`                                    |
  | `core/src/tool/handlers/plan-mode.ts`            |  155 | `EnterPlanMode`（`ExitPlanMode` 归 DSH）                |
  | `core/src/tool/handlers/todo.ts`                 |  153 | `TodoRead`（不实现）/ `TodoWrite`（归 builtins）        |

- **DSH 子包按第三方依赖登记**（`third-party`），**不跑相似度**、不登记 `original`。
- **预计新实现文件数：10–15 个**，每个文件都按上述双重口径测量（即 20–30 次测量）。

---

## 七、范围变更记录（#288 原定 bash 族 → 本包）

**原因**：`#288` 原定「`core/src/tool/handlers/` 的 bash 族 31 文件」，
侦察后发现该范围**已被 `#169` 覆盖**：

| 侦察结论                                                                 | 实测证据                                                                                                                                      |
| ------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------- |
| `bash-rules/`（20）+ `bash-exec/`（11）共 31 文件**全部已是 `original`** | `licensing/current-files.json` 分类查询：`{original: 31}`                                                                                     |
| 它们在 `beff12b5` 上**全部不存在**（由 `#169` 新建）                     | `similarity-check` 前置校验拒绝；`git log --diff-filter=A` → `829fe57e replace: core-tool-handlers-bash-01（继承 -38） (#169)`                |
| 与已有合同 `core-tool-handlers-bash-01`（38 文件）**重叠 0**             | 旧合同 `scope-files.json` 全是旧扁平 `bash-*.ts`，不含新目录结构                                                                              |
| 同目录另有 10 个 `upstream-modified` 兼容转发                            | 其中 3 个是纯 re-export（4 行，非转发行 0）；7 个有实现但**实现已迁到 `bash-rules/`/`bash-exec/`**，返工只能改转发形式 → **无质量收益，不动** |

**结论**：M2 接入包**不动 `core`**（`core` 随 `kernel-switch` 删除）。
`#288` 的真实待办是「补缺工具」。本包只做其中 cron 族四个；其余归 `kernel-plugin-tools-02`。

---

## 八、完成度

| 步骤                                        | 状态 |
| ------------------------------------------- | ---- |
| DSH 工具框架侦察（§二 1）                   | ✅   |
| 40 个工具名对照（§二 5）                    | ✅   |
| `core` executor 37 文件 → DSH 映射（§二 4） | ✅   |
| 缺口工具确认（§二 5，cron 族 4 个归本包）   | ✅   |
| `enter_plan_mode` 四态语义（§二 2）         | ✅   |
| `todo_read` 投影论证（§二 3）               | ✅   |
| 旧实现对照文件在 `beff12b5` 的确认（§六）   | ✅   |
| `behavior.md` B1–B12                        | ✅   |
| `interface.md` / `callers.md`               | ✅   |
| `known-differences.md` / `acceptance.md`    | ✅   |
| `tests/`（合同阶段 T1/T2）                  | ✅   |
| 实现 PR                                     | ⬜   |
