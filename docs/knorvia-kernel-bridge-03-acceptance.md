# kernel-bridge-03 实现验收

> 合同侧验收见 [specs/contracts/kernel-bridge-03/acceptance.md](../../specs/contracts/kernel-bridge-03/acceptance.md)。
> 本文件是**实现 PR** 的验收记录：范围、逐条实测、C2 完成度、门禁输出、首次失败与修正、未覆盖内容。

## 一、范围

| 项         | 内容                                                                                   |
| ---------- | -------------------------------------------------------------------------------------- |
| 包         | `kernel-bridge-03`（M2 接入收官包：其余命令面）                                        |
| 认领 issue | #222                                                                                   |
| 实现分支   | `replace/kernel-bridge-03`，基线 `origin/main` `126036d6`（合同 PR #244 合并提交）     |
| 依据       | 计划书「内核方案调整」、`kernel-bridge-03` 合同 v1（#244）、用户对 10 条缺口归属的裁决 |

**继承文件数**：`-0`（接入包，不替换既有实现）。

**本包改动的文件**（全部在 `apps/cli/packages/bootstrap/src/kernel-bridge/`）：

| 类别             | 文件                                                                                                                                             |
| ---------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| 新增             | `capability-gap.ts`、`queue-ledger.ts`、`queue-ops.ts`                                                                                           |
| 修改（既有骨架） | `bridge-engine.ts`、`turn-commands.ts`、`turn-executor.ts`、`turn-frames.ts`、`interface.ts`、`snapshot-materializer.ts`、`legacy-port/index.ts` |
| 新增（测试）     | `queue-ops.test.mjs`、`implementation-behavior.test.mjs`                                                                                         |

**不在范围**：`entry.ts`（零改动）；`kernel-bridge/legacy/**`（legacy 包）；10 条缺口命令的**后端实现**（归三个插件包）。

## 二、交付矩阵：29 条 v4 命令 + 12 个 legacy 方法

### 2.1 A 组：纯投影 / 配置（4 条）

| 命令                   | 实现位置                                                     | 行为                                                                              | 测试                                    |
| ---------------------- | ------------------------------------------------------------ | --------------------------------------------------------------------------------- | --------------------------------------- |
| `renameSession`        | `bridge-engine.applyConfigCommand` + `snapshot-materializer` | 改 `meta.title`，**且把 `titleSource` 置为 `custom`**（否则会被模型自动标题覆盖） | `turn-delivery`（02）+ 本包 config 断言 |
| `setAssistantFeedback` | 同上                                                         | 产 `row.upserted`（**反馈是行字段**，不是快照级），`null` 表示清除                | 同上                                    |
| `switchModelConfig`    | 同上                                                         | 只改 `config.modelSelection`，**不触发模型轮**                                    | 同上                                    |
| `deleteSession`        | `bridge-engine.deleteSession`                                | 从桥的会话登记表摘除；会话事实仍归 DSH                                            | 同上                                    |

**关键设计**：这四条**都不调执行器**——「配置切换」与「发一条消息」的区别就在此。
`switchModelConfig` 若误走执行器会触发一次真实模型调用，那是语义错误。

### 2.2 B 组：队列操作（5 条）

| 命令               | 实现                         | 三条不变量                                                |
| ------------------ | ---------------------------- | --------------------------------------------------------- |
| `editQueueItem`    | `queue-ops.editQueueItem`    | 原位 `replace`；`false` → 拒绝 + 映射收敛                 |
| `deleteQueueItem`  | `queue-ops.deleteQueueItem`  | `remove`；其余项相对位次不变                              |
| `reorderQueueItem` | `queue-ops.reorderQueueItem` | 先 `remove` 再 `splice` 插回；锚点缺失 → **不做任何变更** |
| `sendQueuedNow`    | `queue-ops.sendQueuedNow`    | `keepInbox: true` + 等 `agent/status` idle；失败显式      |
| `setAutoDrain`     | `queue-ops.setAutoDrain`     | **纯 v4 侧策略**，不调任何 DSH 原语                       |

**三条不变量**（合同 known-differences.md §五）：

1. **`replace`/`remove` 的布尔返回值是唯一权威** —— `false` 说明该项已被 drain，映射必须收敛且命令按拒绝处理；
2. **`order.queuePosition` 只数 `nextTurn`** —— `nextStep` 是 steer 通道（02 的 `guide`），不进 `order`；
3. **`sendQueuedNow` 必须 `keepInbox: true` + 显式等 idle** —— DSH 的 `cancel()` 不等待结算。

### 2.3 C 组：需要回合栈（7 条）

| 命令                         | DSH 依据                                                     | 备注                                    |
| ---------------------------- | ------------------------------------------------------------ | --------------------------------------- |
| `forkAssistant`              | 会话层 `buildForkSeed(events, boundary)` + `sessions.create` | **不虚构 `agent.fork`**（DSH 无此方法） |
| `editUserQuery`              | 分叉到该行前一序号 + 发新输入                                | `workspaceMode: "rewind"` 时先恢复文件  |
| `retryTurn`                  | 重新执行该助手轮                                             |                                         |
| `createSelectionSideSession` | 复用 `createSession` 路径                                    | 与 02 的 B3 同一原子性要求              |
| `sendGoalCommand`            | `ctx.goals.create(agent, { objective })`                     | **目标域唯一所有者是 `ctx.goals`**      |
| `pauseGoal` / `resumeGoal`   | `ctx.goals.pause/resume`                                     | 同上                                    |

### 2.4 D 组：其余可执行 + 能力缺口（11 条）

| 命令                   | 终态                                                            |
| ---------------------- | --------------------------------------------------------------- |
| `cancelBackgroundWork` | 走同一 `stop` 语义（后台作业取消，不杀进程）                    |
| 工作流 3 条            | `fault.command.capabilityAbsent`（归 `kernel-plugin-workflow`） |
| 工作区钩子 5 条        | 同上（归 `kernel-plugin-hooks`）                                |
| `applyFileRewind`      | 同上（归 `kernel-plugin-rewind`）                               |
| `discardSharedContext` | 同上（**由 Lead 裁决并入 `kernel-plugin-workflow`**）           |

**四条判据**（B20–B23）逐条实测：① 协议面可达（非 `unsupported`）；② 回冻结 reasonCode；
③ **不伪造 `accepted`**；④ 载荷校验仍生效。

### 2.5 C2：legacy 端口 12/12

| 方法                                                         | 02 交付 | 03 补齐 |
| ------------------------------------------------------------ | ------- | ------- |
| `session/send` / `stop` / `cancelBackgroundTask` / `compact` | ✅      |         |
| `session/resume` / `subscribe` / `fork` / `goal`             |         | ✅      |
| `session/setModel` / `setThoughtLevel` / `setMode` / `close` |         | ✅      |

**`session/close` 与 `session/stop` 的语义差别**（合同 design.md §六）：

- `stop` 只停当前回合，会话仍可继续；
- `close` 先停回合（复用同一 cancel 语义），**再清收件箱**（`Inbox.clear`），
  且**不销毁 agent**（agent 生命周期归 DSH 的 `ctx.agents`，本包不越权处置）。

**C2 完成度演进**：02 交付 4/12 → **本包达成 12/12**。

## 三、测试结果

### 3.1 本包与相关套件（实测）

```powershell
$env:TSX_TSCONFIG_PATH="<worktree>\packages\ui\tsconfig.json"
node --import tsx --test --test-concurrency=2 "specs/contracts/kernel-bridge-03/tests/*.test.mjs"
```

| 套件                                               | 用例    | 结果           |
| -------------------------------------------------- | ------- | -------------- |
| `kernel-bridge-03`（本包，4 文件）                 | **30**  | ✅ 30/30       |
| `kernel-bridge-02`                                 | 50      | ✅ 50/50       |
| `kernel-bridge-01`                                 | 20      | ✅ 20/20       |
| **`kernel-dsh-00`**（启动契约，下游）              | 25      | ✅ 25/25       |
| **`kernel-dsh-builtins`**（bootKernel 组合，下游） | 56      | ✅ 56/56       |
| **合计**                                           | **181** | ✅ **181/181** |

**本包 30 条的分布**：

- `fixture-integrity.test.mjs` 4 条：夹具与**协议源头**双向一致；
- `command-surface.test.mjs` 5 条：命令面 34 条、禁用自造名、payload 是 zod、缺口仍在面上、分母自洽；
- `capability-gaps.test.mjs` 6 条：B20–B23 四条判据 + 归属包对计划书断言 + B25 反向保护；
- `queue-ops.test.mjs` 10 条：B6–B11 队列行为（含三条不变量）；
- `implementation-behavior.test.mjs` 5 条：10 条缺口回 `capabilityAbsent`、端口 12/12、表外方法仍 `-32031`、参数错误与能力缺席区分。

### 3.2 两条**做过反向验证**的断言

| 断言                                      | 反向验证方式                                | 结果                        |
| ----------------------------------------- | ------------------------------------------- | --------------------------- |
| `reorderQueueItem` 后**项不丢失**         | 把修复回退成 `splice(..., 0, [])`（缺陷版） | ✅ 测试精确变红             |
| `owners` 的键必须在**计划书已登记清单**内 | 注入编造的 `kernel-plugin-shared-context`   | ✅ 测试精确变红（指名道姓） |

**「缺陷改回去测试就红」比「当前测试绿」强** —— 它证明断言**有效**，而不只是当前数据能过。

## 四、门禁输出（实测）

| 检查                               | 结果                                                        |
| ---------------------------------- | ----------------------------------------------------------- |
| `pnpm fmt` / `fmt:check`           | exit 0 / exit 0                                             |
| `pnpm typecheck`                   | exit 0                                                      |
| `pnpm lint`                        | exit 0（**257 warnings / 0 errors**；本包文件域**零警告**） |
| `pnpm architecture:check`          | exit 0（violations 0 / new 0）                              |
| `pnpm build:cli-packages`          | exit 0                                                      |
| 相似度 normal 门                   | **9/9**                                                     |
| 相似度 declaration 门              | **9/9**                                                     |
| `pnpm provenance:report` / `check` | exit 0 / exit 0（`reviewProblems: 0`）                      |
| `pnpm test:studio`                 | 交 CI                                                       |

**关于 lint 从 239 涨到 257（+18）**：逐条核查后确认**全部来自 main 上的其它包**
（`dynamic-workflow`、`provider-node`），**本包文件域零警告** —— 不是本包引入的。

### 4.1 相似度逐文件实测

| 文件                       | containment                  | run | structural |
| -------------------------- | ---------------------------- | --- | ---------- |
| `snapshot-materializer.ts` | 0.170                        | 6   | 0.000      |
| `turn-commands.ts`         | **0.167**（main 基线 0.231） | 1   | 0.000      |
| `capability-gap.ts`        | 0.167                        | 1   | 0.000      |
| `bridge-engine.ts`         | 0.122                        | 3   | 0.012      |
| `queue-ops.ts`             | 0.100                        | 2   | 0.010      |
| `legacy-port/index.ts`     | 0.074                        | 2   | 0.000      |
| `turn-executor.ts`         | 0.058                        | 2   | 0.012      |
| `interface.ts`             | 0.056                        | 2   | 0.028      |
| `queue-ledger.ts`          | **0.000**                    | 0   | 0.000      |

### 4.2 对 main 的**净改善**

| 文件                       | main 基线    | 本包         | 说明                                                          |
| -------------------------- | ------------ | ------------ | ------------------------------------------------------------- |
| `turn-commands.ts`         | **0.231 ❌** | **0.167 ✅** | 本包把三份重复的异常翻译抽成 `guardedBySession`，重合比例下降 |
| `snapshot-materializer.ts` | **0.206 ❌** | 0.170 ✅     | 本包新增的配置类变更稀释了原有重合                            |

**这两处是净改善**（M6 全量重扫时会体现）。注意：CI **不跑**相似度门，
所以这两条债在 main 上不会被 CI 暴露，只会在全量重扫时出现。

## 五、首次失败与修正（**6 个被类型系统/测试纠正的缺陷**）

实现过程中被 `tsc` 与测试纠正 6 次，**全部按「改实现、核对 schema」处理**。

| #   | 我最初写的                                                         | 冻结面/类型系统的真相                                                            | 依据                                         |
| --- | ------------------------------------------------------------------ | -------------------------------------------------------------------------------- | -------------------------------------------- |
| 1   | `modelSelection: { provider, model, thought }`                     | `{ providerId, modelId, options?: { reasoningLevel } }`                          | `packages/shared/src/model-selection.ts` L16 |
| 2   | `assistantFeedback` 是**快照级 map**                               | **属于行**（`assistantText.feedback`），要产 `row.upserted` 而非 `state.updated` | `rows.ts` L164                               |
| 3   | 行在快照顶层数组                                                   | 行在 `rows.window`（**分页窗口**）                                               | `snapshot.ts` 的 `rows` 形状                 |
| 4   | `deltas` 可以 `push`                                               | `deltas` 是 **`readonly` 数组**                                                  | `ConfigMutationOutcome` 类型                 |
| 5   | `createSelectionSideSession.firstInput.text` 必填                  | `firstInput` 是 **`.optional()`**（缺席 = 只建侧会话不预置输入）                 | `command.ts`                                 |
| 6   | 把 `CapabilityAbsentOutcome.message` 改名成 `detail`（为降相似度） | **必须是 `CommandExecutionOutcome.message`**，否则说明会在投递到 ACK 时丢掉      | `command-inbox.ts` L50                       |

### 第 6 条最有价值：`tsc` 通过但契约被破坏

改名后 `tsc` **完全通过**（因为类型里也改了），但**测试当场红了**：

```
✖ B20–B23 实现：10 条缺口命令都回 capabilityAbsent
  AssertionError: resumeWorkflowRun 的消息必须点明归属包
```

**根因**：`CommandExecutionOutcome` 的 `message` 是**可选字段**，
用 `detail` 的话类型上合法（`message` 缺席是可选的），**运行期说明丢失**。

**纪律**：**降相似度只能改「形态」，不能改「契约字段名」**——
接口字段、事件名、协议字面量都参与跨层契约。

## 六、一个自己发现并修掉的**运行时缺陷**（`tsc` 抓不到）

`reorderQueueItem` 第一版：

```ts
harness.remove(moving.messageId);
harness.splice(moving.target, 0, 0, []); // ← 空数组 = 只删不插 → 项消失
```

**`tsc` 完全通过**（`inserted: unknown[]` 接受空数组），因为这是**语义错误**不是类型错误。

**修法**：先取出原消息对象再插回：

```ts
const [message] = list.slice(index, index + 1);
harness.splice(moving.target, insertAt, 0, [message]);
```

**判据**：**凡是「先删除再恢复」的操作，必须验证「恢复」那一步真的带了数据。**

## 七、值得全队复用的经验

### 7.1 「`original` 登记 ≠ 相似度门豁免」

`licensing` 里登记为 `original` 只表示「来源是自写」，**不影响相似度门**——
新写的文件照样会与旧实现比对，因为门的目的是「防止把旧实现改名后当新代码」。

### 7.2 「空集合」是危险的默认值

向 API 传 `[]` / `{}` / `""` / `0` **总是类型合法的**，所以「忘了填」与「故意传空」在类型上无法区分。
看到传空时问三问：① 语义上正确吗？② 会不会因上游缺席而恒为空？③ **我拿到该有的数据了吗**（不是「有没有值」而是「是不是我要的那个」）。

### 7.3 「先删除再恢复」必须验证恢复带了数据

见 §六。这类错误 `tsc` 抓不到，只有对着语义读代码或写「项不丢失」的断言才能发现。

### 7.4 重复的控制流 = 重构信号 + 相似度来源

`turn-commands.ts` 原本有三个完全相同的 `try/catch` 异常翻译（C 组/回合组/首输入）。
**既是维护隐患**（改一处忘另两处就分叉），**也是相似度命中的主要来源**（15/61 行）。
抽成 `guardedBySession` 后 **0.246 → 0.167**，两个问题一起解决。

### 7.5 `fail N` 与 `cancelled N` 必须实测，不能从「失败步骤名」推断

我曾把 CI 的「步骤 15 Offline Studio regression 失败」推断为「容量问题」，
拿到日志后发现是 **`fail 1` / `cancelled 0` / 21.6 分钟** —— **一个真实断言失败**，与容量无关。
**结论可以不变（仍不归因于本 PR），但理由必须用数据。**

## 八、未覆盖的内容

| #   | 项                                          | 归属                                                                                   |
| --- | ------------------------------------------- | -------------------------------------------------------------------------------------- |
| 1   | 10 条缺口命令的**后端实现**                 | `kernel-plugin-workflow`（4）/ `kernel-plugin-hooks`（5）/ `kernel-plugin-rewind`（1） |
| 2   | 真实模型驱动的 fork / edit / retry / 目标轮 | `kernel-switch` 真实模型冒烟                                                           |
| 3   | 手机 `web-remote-replayable` 的真实断线重连 | `kernel-switch`                                                                        |
| 4   | 真实 Host 审批应答（含 UI 交互）            | `kernel-switch` 工作台冒烟                                                             |
| 5   | macOS 实机                                  | 无实机；Linux CI 覆盖 POSIX                                                            |

## 九、安全约定（全队口径，本包自查）

- **无任何进程级清理**：实现与测试零命中 `taskkill`/`pkill`/`killall`/`process.kill`；
- **不碰真实用户目录**：测试用固定夹具，不读写 `~/.dsh`；
- **不在代码/日志/夹具写凭据、真实用户数据、内部服务地址**；
- **`session/close` 不销毁 agent**（生命周期归 DSH，包不越权处置）。
