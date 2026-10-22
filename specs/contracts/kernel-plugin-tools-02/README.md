# kernel-plugin-tools-02 合同（补缺工具：离峰 + 会话/计划）

**合同版本：v1**（2026-10-22）

本目录是 M2 接入包 `kernel-plugin-tools-02` 的合同。它冻结**四个 Knorvia 工具在 DSH 运行时上的落地方式**
与**计划模式提示词的重写依据**：`OffPeakCreate` / `OffPeakList` / `ReadSessionContext` / `EnterPlanMode`。

- 分支：`contract/kernel-plugin-tools-02`（基线 `origin/main`，含 `kernel-plugin-tools-01` #294）
- 认领 issue：**#288**（`tools-01` 已交付 cron 族；本包做剩余缺口）
- 前置合同：[`kernel-dsh-00`](../kernel-dsh-00/README.md) v1、
  [`kernel-dsh-builtins`](../kernel-dsh-builtins/README.md) v1、
  [`kernel-plugin-tools-01`](../kernel-plugin-tools-01/README.md) v1（同族形态）
- 依据：`specs/knorvia-builtin-kernel-dsh.md`「能力映射」表「工具 39 个」行；
  计划书「内核方案调整」「接入包流程」
- 事实来源：`@deepseek-ai/dsh@0.2.0-rc.2` 的发布类型与实现产物（`dsh-plan-mode` / `dsh-tool-todo`）、
  旧实现 `core/src/tool/handlers/{off-peak,off-peak-execution,read-session-context,
read-session-context-extraction,plan-mode,plan-mode-operation,plan-mode-projection,
plan-mode-prompts,todo}.ts`（**只读对照行为，不复制**）。**不读 DSH 源码仓库、不改 DSH。**

---

## 一、范围

### 1. 本包做什么

|  #  | 工具名（core 原名）  | 主题             | 本包做法                                   |
| :-: | -------------------- | ---------------- | ------------------------------------------ |
|  1  | `OffPeakCreate`      | 离峰窗口创建     | Knorvia 实现（DSH 无离峰概念）             |
|  2  | `OffPeakList`        | 离峰窗口列表     | 同上                                       |
|  3  | `ReadSessionContext` | 读会话上下文投影 | 从 DSH 会话投影 + Knorvia 附加上下文组装   |
|  4  | `EnterPlanMode`      | 进入计划模式     | 包装 `PlanModeController.set(agent, true)` |

**另交付**：`dsh-plan-mode` 的 **guidance 文本**（进入说明 + 退出说明两份），
按用户裁决「保留语义、重组表达」重写 —— 条目见 [plan-mode-entries.md](plan-mode-entries.md)。

### 2. 本包不做什么

| 不做的事                                        | 归属                                                                      | 依据                                                 |
| ----------------------------------------------- | ------------------------------------------------------------------------- | ---------------------------------------------------- |
| `TodoWrite`                                     | `kernel-dsh-builtins`（已挂 `dsh-tool-todo`）                             | #228 已交付                                          |
| **`TodoRead`**                                  | **不实现** —— 由 `dsh-tool-todo` 的 `sessionProjections` 承接（见 §二 3） | 用户裁决                                             |
| `ExitPlanMode`                                  | **DSH 提供**（`dsh-plan-mode` 的 `exit_plan_mode`）                       | 见 §二 2                                             |
| `cron` 族四个工具                               | `kernel-plugin-tools-01`（已交付 #294）                                   | 计划书分包                                           |
| 工作流族 / 子 Agent 族 / Node REPL              | 各自的包                                                                  | 计划书分包表                                         |
| 五种权限模式语义                                | `kernel-plugin-policy`                                                    | 计划书分包表                                         |
| 7 种 Hook 事件                                  | `kernel-plugin-hooks`                                                     | 计划书分包表                                         |
| 返工 `core/src/tool/**` 的任何文件              | ——                                                                        | M2 接入包不动 `core`；`core` 随 `kernel-switch` 删除 |
| 改 DSH 源码 / fork / vendor                     | ——                                                                        | 规格「不做」                                         |
| 改协议字段、数据格式、`KNORVIA_` 变量、数据目录 | ——                                                                        | 冻结面                                               |

### 3. `todo` 的处置（本包只写合同条目，不实现）

| 项          | 旧实现                                  | 新做法                                                                                                |
| ----------- | --------------------------------------- | ----------------------------------------------------------------------------------------------------- |
| `TodoWrite` | `core/src/tool/handlers/todo.ts` 的工具 | `dsh-tool-todo` 的 `todo_write`（已由 `kernel-dsh-builtins` 挂载）                                    |
| `TodoRead`  | 同上                                    | **不实现** —— `dsh-tool-todo` 通过 `sessionProjections` 注册 `todos` 投影，模型每次请求都看到最新列表 |
| 数据形状    | `{ content, status }` 数组              | **相同**（投影 schema 就是 `{ content, status }` 数组）                                               |
| 状态所有者  | 会话                                    | **相同**（per-session ownership）                                                                     |

**依据**（`dsh-tool-todo/lib/index.js` 实测）：

```js
const inject = ["tools", "sessionProjections"];   // 注入两个注册表
const todosProjectionSchema = z.union([...]);      // todos 投影的 wire schema
ctx.sessionProjections.register({ ... });          // 注册投影
```

**⚠️ 所以「不实现 `TodoRead`」不是功能减少，而是「同一信息的更优通道」** ——
省掉一次工具往返，且模型始终能看到最新列表。

---

## 二、DSH 侧的关键事实（2026-10-22 实测）

### 1. `PlanModeController.set(agent, active)` 的四态返回

```ts
class PlanModeController extends Service {
  set(agent: Agent, active: boolean): "committed" | "queued" | "cancelled" | "noop";
}
```

| 返回        | 含义                               | `EnterPlanMode` 的映射                              |
| ----------- | ---------------------------------- | --------------------------------------------------- |
| `committed` | 已进入计划模式                     | 成功，`active: true`                                |
| `queued`    | 当前有在途步骤，进入被排队到下一步 | 成功但标注 `queued: true`（**模型需知道尚未生效**） |
| `cancelled` | 本次进入被取消                     | **失败**（不是静默成功）                            |
| `noop`      | 状态未变（已在目标状态）           | 成功，`active: true`，`changed: false`              |

**`sessionModeBefore` 的降级**：core 返回「运行前的会话模式」（五态字符串）；
DSH 的 `set()` 不返回该信息，只能读「当前是否 plan」（布尔）。
**记入 [known-differences.md](known-differences.md) D1。**

### 2. `exit_plan_mode`（DSH 提供）的实测行为 —— 6 种失败模式

**参数**：`{ plan: string }`（required），描述要求「完整 markdown 计划，**以 `# ` 标题开头**」。

**输出**：`{ approved: { const: true } }` —— **成功恒为 `approved: true`，其余全抛错**。

**执行逻辑（10 步）**：

|  #  | 条件                      | 结果                                                                                                                 |
| :-: | ------------------------- | -------------------------------------------------------------------------------------------------------------------- |
|  1  | 无调用方 agent            | 抛 `requires a calling agent (no session to switch)`                                                                 |
|  2  | 不在 plan mode            | 抛 `is only available in plan mode`                                                                                  |
|  3  | `plan` 不以 `# ` 标题开头 | 抛 `requires a non-empty markdown plan starting with a # heading`                                                    |
|  4  | 无 `userQuestions` 通道   | 抛 `no user-questions channel is available to review the plan; ask the user to switch the session mode instead`      |
|  5  | 弹「Plan review」询问     | 两个选项：Approve / Keep planning                                                                                    |
|  6  | 用户取消（打断去说话）    | 抛 `The user dismissed the plan review to speak instead; stay in plan mode, stop here, and wait for their message.`  |
|  7  | 服务重载                  | 抛 `the plan-mode service was reloaded while the plan was under review; present the plan again`                      |
|  8  | 用户选 Keep planning      | 抛 `The user chose to keep planning; revise the plan and present it again.`（带反馈时追加 `their feedback: <内容>`） |
|  9  | 用户选 Approve            | 置 pendingIntents(active:false)                                                                                      |
| 10  | 成功                      | 返回 `{ approved: true }`                                                                                            |

**⚠️ 这是本包重写「退出说明」的依据** ——
core 的 27 行旧说明只讲了「什么时候用」，完全没提上述 6 种失败模式。
条目见 [plan-mode-entries.md](plan-mode-entries.md) §六。

### 3. `todo` 由 `sessionProjections` 承接

见 §一 3。

### 4. `dsh-plan-mode` 要求部署方提供 guidance 文本（无默认值）

公开类型注释逐字：

> 「**The only required configuration is the guidance text the agent follows while planning**;
> anything else you add fails at load.」

`lib/index.js` 的 `resolveConfig` 也明确：

> 「Validate deployment-owned plan guidance. **Missing, blank, non-string, or unknown fields
> fail at plugin load** rather than being ignored.」

**→ 所以删除 `core` 的 `plan-mode-prompts.ts` 等于「不提供 guidance」→ 插件加载失败 →
计划模式不可用 → 产品功能减少。必须显式迁移。**

---

## 三、计划模式提示词的重写（用户裁决：方案 A）

**用户裁决原文**：

> 「选 A：保留语义、重组表达。做法：
>
> 1. 先把 7 类触发条件与例子整理成合同条目（只记『何时该/不该进入计划模式』，不抄原句）；
> 2. 按条目用自己的话重写，组织方式自定，正常过两道相似度门槛；
> 3. 准备一组固定场景提示（7 类各有正例 + 若干反例），新旧文本用真实模型对比触发率，
>    并入 `kernel-switch` 前的真实模型冒烟；无 key 时如实标注未验证。
>    新文本放在接入包内作为 `dsh-plan-mode` 的 guidance 配置；`core` 里的旧文件随切换删除。
>    **不采用逐字保留与豁免。**」

**36 项语义条目**（7 类触发 + 4 反例 + 6 步 + 5 正 3 反情形 + 3 注意事项 + 退出 8 小节）
见 [plan-mode-entries.md](plan-mode-entries.md)。

**场景集**（7 类正例 + 4 反例）见同文件 §八。

---

## 四、已有契约测试的复用

### ① 走公开入口且对新运行时同样适用 → **必须继续全过**

| 套件                                                             | 入口                            | 对本包的要求                                    |
| ---------------------------------------------------------------- | ------------------------------- | ----------------------------------------------- |
| `specs/contracts/kernel-bridge-01/tests/**`                      | v4 协议（`app-server --stdio`） | **必须全过**；本包不碰桥                        |
| `specs/contracts/kernel-dsh-00/tests/**`                         | `@knorvia/bootstrap/kernel`     | **必须全过**；本包**追加**工具行，不改既有行 id |
| `specs/contracts/kernel-dsh-builtins/tests/tools-mount.test.mjs` | DSH 公开服务                    | **必须全过**；本包只追加                        |
| `specs/contracts/kernel-plugin-tools-01/tests`（实现 PR 落地后） | 同族公开入口                    | **必须全过**；本包不改 cron 族                  |
| `specs/contracts/shared-0*`、`contracts-*`                       | 包级纯模块                      | 与运行时无关，期望不变                          |

### ② 只测旧内部端口 → **列明，随 `core` 删除，不迁移**

`specs/contracts/core-tool-01`、`core-tool-handlers-bash-01`、`core-01/02/03`、
`core-runtime-*`、`core-hooks` —— 均直接 import `core/src/**`。

**本包把其中与「离峰 / 会话上下文 / 计划模式」相关的**行为条目**
按 DSH 工具语义重新列入 [behavior.md](behavior.md)，**不复制测试代码\*\*。

### ③ 新增（本包特有）→ 新写

见 §五。

---

## 五、条目 → 测试对照表

> **接入包合同 PR 的形态**（与 `kernel-plugin-hooks` #291 一致）：**只带合同文档，不带测试**。
> 本包是新建，合同阶段没有可跑的实现；接入包也没有「旧实现」可录旧门。
> **所有测试随实现 PR 落地。**

| 条目                                    | 测试文件 · 用例（实现 PR 落地）                                                                                | 覆盖     |
| --------------------------------------- | -------------------------------------------------------------------------------------------------------------- | -------- |
| B1 四个工具的可用集                     | `kernel-plugin-tools-02.test.ts` · 注册集为 `OffPeakCreate`/`OffPeakList`/`ReadSessionContext`/`EnterPlanMode` | 注册     |
| B2 参数 schema 形状                     | 同上 · 四个工具的 `properties` 键集                                                                            | 契约     |
| B3 `OffPeakCreate` / `OffPeakList` 闭环 | 同上 · 创建与列出；配置形状不变                                                                                | 离峰     |
| B4 `ReadSessionContext` 输出形状        | 同上 · 从会话投影组装，字段与 core 对齐                                                                        | 会话     |
| B5 `EnterPlanMode` 四态语义             | 同上 · committed/queued/cancelled/noop 各自返回                                                                | 计划     |
| B6 `EnterPlanMode` 不改工具目录         | 同上 · 进入前后 `ctx.tools.get()` 集合不变                                                                     | 计划     |
| B7 enter/exit 成对关系                  | 同上 · 进入说明指向 `exit_plan_mode`；退出说明提「从进入而来」                                                 | 计划     |
| B8 端口不可用 / 服务缺失时明确失败      | 同上 · 不返回空成功                                                                                            | 失败路径 |
| B9 自动化轮次保护（离峰写工具）         | 同上 · 读 `metadata.automationTurn`                                                                            | 保护     |
| B10 无 DSH 品牌泄漏                     | 同上 · 工具描述与 guidance 无 `DeepSeek Harness` / `@deepseek-ai/`                                             | 隔离     |
| B11 guidance 覆盖 36 项语义             | `plan-mode-guidance.test.ts` · 逐项断言 7 类 + 4 反例 + 6 步 + 3 注意事项 + 退出 8 小节的存在性                | 提示词   |
| B12 guidance 无逐字雷同                 | 相似度门槛（见 §六）                                                                                           | 提示词   |

---

## 六、计分模式

- **本包新增文件全部登记 `original`、`Apache-2.0`**（每文件首行 SPDX）。
- **对旧 `core` 对应文件与上游固定提交各跑两道门槛**：
  - 行相似度：规范化包含率 **< 0.20**，最长相同段 **< 8 行**（<10 行文件必须为 0）。
  - 结构相似度：**< 0.40**。
- **比较对象（双重口径）**：
  ```
  --old <同路径> --old-rev beff12b5      ← 计划执行基线（用户裁决：统一固定）
  --upstream-dir <zcode 树> --upstream-rev 872ad960...
  两者取更差（max）< 0.20
  ```
- **本包的旧实现对照文件**（九个，均已在 `beff12b5` 上确认存在，共 1216 行）：

  | core 对照文件                        |    行数 | 覆盖                                             |
  | ------------------------------------ | ------: | ------------------------------------------------ |
  | `off-peak.ts`                        |     170 | `OffPeakCreate` / `OffPeakList`                  |
  | `off-peak-execution.ts`              |      77 | 同上（执行体）                                   |
  | `read-session-context.ts`            |     345 | `ReadSessionContext`                             |
  | `read-session-context-extraction.ts` |      77 | 同上（提取逻辑）                                 |
  | `plan-mode.ts`                       |     155 | `EnterPlanMode`                                  |
  | `plan-mode-operation.ts`             |      79 | 同上（操作）                                     |
  | `plan-mode-projection.ts`            |      64 | 同上（投影）                                     |
  | **`plan-mode-prompts.ts`**           | **130** | **进入说明 + 退出说明（36 项语义）**             |
  | `todo.ts`                            |     153 | `TodoRead`（不实现）/ `TodoWrite`（归 builtins） |

- **DSH 子包按第三方依赖登记**（`third-party`），**不跑相似度**、不登记 `original`。
- **预计新实现文件数：8–12 个**，每个文件都按上述双重口径测量。

**⚠️ `plan-mode-prompts.ts` 的相似度是特例**：
它 130 行几乎全是提示词文本。按用户裁决「保留语义、重组表达，正常过两道门槛」，
**不申请豁免** —— 所以重写后的 guidance 必须与旧文本行相似度 < 0.20。

---

## 七、与相邻包的接缝

| 相邻包                           | 关系                                                                                                     |
| -------------------------------- | -------------------------------------------------------------------------------------------------------- |
| `kernel-plugin-tools-01`（#294） | 同族形态（`apply(ctx, config)` + `defineTool` + 元数据工厂）；**本包复用其模式**，不改它的 cron 族       |
| `kernel-dsh-builtins`（#228）    | 本包**追加**工具行与 `plan-mode` 的 guidance 配置；不改它的挂载集                                        |
| `kernel-plugin-policy`           | `EnterPlanMode` 的**进入条件**可能受五种权限模式影响；本包只调 `PlanModeController.set()`，语义归 policy |
| `kernel-plugin-hooks`（#291）    | 本包不碰 Hook；计划模式的进入/退出可作为 Hook 事件源（由 hooks 包定义）                                  |
| `kernel-legacy-sessions`         | `js`（REPL）与 DSH 的 `run_code`（PTC）的关系由该包侦察                                                  |

---

## 八、完成度

| 步骤                                                            | 状态 |
| --------------------------------------------------------------- | ---- |
| DSH `PlanModeController` 四态实测（§二 1）                      | ✅   |
| DSH `exit_plan_mode` 10 步行为实测（§二 2）                     | ✅   |
| `todo` 投影承接论证（§二 3）                                    | ✅   |
| `plan-mode-prompts` 36 项语义条目（§三 + plan-mode-entries.md） | ✅   |
| 场景集设计（7 正 + 4 反，按类对比）                             | ✅   |
| 九个旧实现对照文件在 `beff12b5` 的确认（§六）                   | ✅   |
| `behavior.md` B1–B12                                            | ⬜   |
| `interface.md` / `callers.md`                                   | ⬜   |
| `known-differences.md` / `acceptance.md`                        | ⬜   |
| 实现 PR                                                         | ⬜   |
