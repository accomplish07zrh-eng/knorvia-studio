# kernel-plugin-tools-01 行为条目

> 每条都可在离线测试中断言。行为依据取自旧实现
> （`core/src/tool/handlers/{cron,off-peak,read-session-context,plan-mode,todo}.ts`，**只读对照**）
> 与 DSH 公开类型。**本文件不复制旧代码，只规定可观察效果。**

## A. 工具注册与契约形状（B1–B2、B10–B12）

### B1 九个工具的可用集

`ctx.tools.get()` 在运行时列出的工具中，必须包含本包实现的 **8 个**：

```
CronCreate / CronList / CronUpdate / CronDelete
OffPeakCreate / OffPeakList
ReadSessionContext / EnterPlanMode
```

**`TodoRead` 不在其中**（由会话投影承接，见 §D B9）。

**断言**：逐个名字 `ctx.tools.get(name)` 非 undefined；且这 8 个的工具定义 `execute` 是函数。

### B2 参数 schema 形状与旧契约对齐

每个工具的参数 schema 由 `@deepseek-ai/schemastery` 定义（**不是 zod**），
且与旧实现的 JSON Schema **形状等价**：

| 工具                 | 必填字段         | 关键约束                                                                       |
| -------------------- | ---------------- | ------------------------------------------------------------------------------ |
| `CronCreate`         | `title` `prompt` | `cron` 或 `delayMinutes` 至少一个；`recurring=true` 时**不得**同时给 `maxRuns` |
| `CronList`           | 无               | —                                                                              |
| `CronUpdate`         | `id`             | 只更新给定字段                                                                 |
| `CronDelete`         | `id`             | —                                                                              |
| `OffPeakCreate`      | `title`          | 时间窗口字段成对出现                                                           |
| `OffPeakList`        | 无               | —                                                                              |
| `ReadSessionContext` | 无               | —                                                                              |
| `EnterPlanMode`      | 无               | 空输入对象（与旧实现 `z.object({}).strict()` 一致）                            |

**断言**：向每个工具传非法参数（缺必填 / 多传严格模式下的额外字段）→ 抛 `ToolArgsError`，且 `execute` **未被调用**。

### B10 参数非法不进入 execute

`execute` 只在参数通过 schema 校验后被调用。

**断言**：用非法参数调 `ctx.tools` 的 dispatch，`execute` 的调用计数为 0。

### B11 审批 fail closed

工具通过 `tools/pre-execute` 走审批；**无审批应答者时 `ask` 降级为拒绝**。

**本包四个写工具**（`CronCreate` / `CronUpdate` / `CronDelete` / `OffPeakCreate`）标 `needsApproval: true`；
读工具（`CronList` / `OffPeakList` / `ReadSessionContext` / `EnterPlanMode`）不要求审批。

**断言**：无应答者时，写工具的 dispatch 被拒绝，`execute` 未被调用；读工具正常执行。

### B12 无 DSH 品牌泄漏

工具 `description`、`modelInstructions`、结果内容里**不得**出现
`DeepSeek Harness`、`powered by DeepSeek`、`@deepseek-ai/` 包名。

**断言**：逐个工具取 description + 执行一次取结果，正则检查无上述字样。

## B. 定时任务族（B3–B4）

### B3 `CronCreate` 写入既有存储形状

创建定时任务后，持久化内容的**字段形状与旧实现一致**（数据格式不变）：
`id` / `title` / `prompt` / `cron` / `delayMinutes` / `recurring` / `maxRuns` /
`intervalUnit` / `interval` / `createdAt` / `status`。

**断言**：创建后读取存储，字段集合与旧实现写的完全一致（逐字段比较键名，不比较值）。

### B4 `CronCreate` 的排期语义（行为条目，逐条断言）

|  #  | 规则                                                                             | 断言                                            |
| :-: | -------------------------------------------------------------------------------- | ----------------------------------------------- |
|  1  | `cron` 使用**用户本地时区**，不转 UTC                                            | 给 `0 9 * * 1-5`，保存的 `cron` 字面量不变      |
|  2  | 相对延迟走 `delayMinutes`（不自行换算成 cron）                                   | 给 `delayMinutes=8`，保存的 `cron` 为 undefined |
|  3  | `recurring=true` 时**不得**同时给 `maxRuns`                                      | 同时给 → 报错（不是静默忽略）                   |
|  4  | `recurring=false` 且未给 `maxRuns` → 默认上限 1                                  | 保存的 `maxRuns` 为 1                           |
|  5  | 每 N 单位重复时必须同时给 `intervalUnit` 与 `interval`；`interval` 为 1–200 整数 | 缺一个 → 报错；`interval=201` → 报错            |
|  6  | 绝对墙钟时间（用户点名的日期）才 pin cron 的月/日/时/分                          | 给「明天 9 点」形态 → 允许 pin                  |
|  7  | 不改动用户给定的时刻（无 jitter / 无平移）                                       | 保存的 `cron` 与输入逐字相同                    |
|  8  | 输入里**不得**含 workspace 路径或身份（用当前会话 workspace）                    | 给含路径的输入 → 被忽略或报错，不写入存储       |

### B5 `CronList` / `CronUpdate` / `CronDelete` 闭环

- `CronList` 返回当前 workspace 的全部任务（含已完成，保留历史）。
- `CronUpdate` 只改给定字段，未给字段保持原值。
- `CronDelete` 删除后 `CronList` 不再包含该 id。

**断言**：创建 → 列出（含）→ 更新 title → 列出（title 变、其他不变）→ 删除 → 列出（不含）。

## C. 离峰族（B5）

### B5 `OffPeakCreate` / `OffPeakList`

- 创建离峰窗口后，配置形状与旧实现一致。
- 时间窗口字段成对出现（缺一半 → 报错）。
- `OffPeakList` 返回全部窗口。

**断言**：创建 → 列出（含）→ 字段形状与旧实现逐键一致。

## D. 会话/计划族（B6–B9）

### B6 `ReadSessionContext` 输出形状

从 DSH 会话投影 + Knorvia 附加上下文组装，输出字段与旧实现对齐。

**断言**：在给定会话下调用，返回对象的键集合与旧实现的输出 schema 一致。

### B7 `EnterPlanMode` 的四态语义（**本包最关键的适配点**）

旧实现返回 `{ sessionModeBefore: <五态之一> }`；DSH 的
`PlanModeController.set(agent, active)` 返回四态。映射如下：

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

### B8 `EnterPlanMode` 不改变工具目录

进入计划模式前后，`ctx.tools.get()` 的集合**完全相同**
（DSH 注释：「entering or leaving plan mode changes only the prompt section,
not the request tool catalog」）。

**断言**：进入前后各取一次工具名集合，深度相等。

### B9 `TodoRead` 不存在，但 todo 始终可见

- `ctx.tools.get("TodoRead")` 为 undefined。
- 会话投影里 `todos` 可见（首次写入前为 null，写入后为完整列表）。

**断言**：断言无 `TodoRead` 工具；写入一条 todo 后从投影读到它。

## E. 边界与失败路径

### B13 存储不可用时不放行

定时/离峰工具的存储读写失败 → 工具返回**明确失败**，不返回「成功但没写入」。

**断言**：注入写失败，工具结果是错误，且存储内容未变。

### B14 跨平台路径与主目录

定时/离峰存储路径用跨平台解析（不硬编码分隔符）；
测试不在真实用户目录读写（用临时目录 + 诱饵目录断言未被触碰）。

**断言**：跑一个诱饵 `~/.knorvia-studio` 全树 mtime 不变。
