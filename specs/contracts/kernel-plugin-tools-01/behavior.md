# kernel-plugin-tools-01 行为条目

> 每条都可在离线测试中断言。行为依据取自旧实现
> （`core/src/tool/handlers/{cron,cron-execution}.ts`，**只读对照**）与 DSH 公开类型。
> **本文件不复制旧代码，只规定可观察效果。**
>
> **范围**：本包只含 `cron` 族四个工具。
> `OffPeak*` / `ReadSessionContext` / `EnterPlanMode` / `TodoRead` 归 `kernel-plugin-tools-02`。

## A. 工具注册与契约形状

### B1 四个工具的可用集

`ctx.tools` 在运行时列出的工具中，必须包含：

```
CronCreate / CronList / CronUpdate / CronDelete
```

**且不含** `TodoRead`（由 `dsh-tool-todo` 的会话投影承接，属 `tools-02` 的裁决范围）。

**断言**：注册集的名字排序后等于上述四个；`ctx.tools.get("TodoRead")` 为 undefined。

### B2 参数 schema 形状

每个工具的参数由 `@deepseek-ai/schemastery` 的 `ValueSchemaSpec` 定义（**不是 zod**）。
`defineTool` 会把 per-property 的 `parameters` 编译成**隐式开放对象根**
（`{ type: "object", properties: {...} }`），所以断言要读 `properties`。

| 工具         | 参数字段                                                                                             |
| ------------ | ---------------------------------------------------------------------------------------------------- |
| `CronCreate` | `cron` / `delayMinutes` / `prompt` / `title` / `recurring` / `maxRuns` / `intervalUnit` / `interval` |
| `CronList`   | 无                                                                                                   |
| `CronUpdate` | `id` + 上述 8 个字段（全部可选）                                                                     |
| `CronDelete` | `id`                                                                                                 |

**断言**：四个工具的 `properties` 键集与上表一致。

### B3 字段级校验（DSH schema 表达不了的部分）

DSH 的 `ValueSchemaSpec` **只有** `type` / `enum` / `const` 与四个注解字段，
**没有 `min` / `max` / `minLength` / 变换**。旧实现靠 zod 在字段阶段做的校验必须移到执行体：

| 校验                                | 约束名                      | 断言                                  |
| ----------------------------------- | --------------------------- | ------------------------------------- |
| `title` 只含空白                    | `title-not-blank`           | 拒绝，端口未被调用                    |
| `cron` 只含空白                     | `cron-not-blank`            | 拒绝                                  |
| `delayMinutes` 非正整数或超 525 600 | `delay-minutes-in-range`    | 拒绝（`-1` / `0` / `525_601` 各一例） |
| `maxRuns` 非正整数                  | `max-runs-positive-integer` | 拒绝（`0` 一例）                      |
| `intervalUnit` 非枚举值             | `interval-unit-enum`        | 拒绝（`fortnight` 一例）              |

### B4 `delayMinutes: null` 等价于「未给」

**为什么需要**：旧契约的 `delayMinutes` 曾是「必填可空」，旧调用方会显式传 `null`。
若 schema 只写 `{ type: "number" }`，DSH 会在**到达执行体之前**拒绝
（实测报错 `invalid arguments: "delayMinutes" must be a number`），
于是「`null` 等价于未给」这条兼容语义无法成立。

**做法**：`oneOf: [{ type: "number" }, { type: "null" }]`，对应旧 zod 的 `.nullable()`。

**断言**：传 `{ cron, delayMinutes: null }` → 成功创建（按绝对 cron 处理），端口被调用一次。

### B5 审批声明

四个工具的元数据：

| 工具         | `readOnly` | `needsApproval` |
| ------------ | :--------: | :-------------: |
| `CronCreate` |     ❌     |       ✅        |
| `CronList`   |     ✅     |       ❌        |
| `CronUpdate` |     ❌     |       ✅        |
| `CronDelete` |     ❌     |       ✅        |

**⚠️ 审批的**执行**由 DSH 的 `tools/pre-execute` 与 `dsh-user-approval` 承担**
（缺应答者时 `ask` 降级为拒绝）。**本包只声明 `needsApproval`，不实现审批流。**

**断言**：四个工具的 `needsApproval` 取值与上表一致。

### B6 无 DSH 品牌泄漏

工具 `description`、`guidance`、结果内容里**不得**出现
`DeepSeek Harness`、`powered by DeepSeek`、`@deepseek-ai/` 包名。

**断言**：逐个工具取 description，正则检查无上述字样。

## B. `CronCreate` 的九条交叉约束

**每条都有名字**（测试与错误消息都用它定位）。顺序即报错优先级。

|  #  | 约束名                              | 违反条件                                  | 断言               |
| :-: | ----------------------------------- | ----------------------------------------- | ------------------ |
|  1  | `cron-required-without-delay`       | 没给 `delayMinutes` 且没给 `cron`         | 拒绝，端口未调用   |
|  2  | `relative-delay-omits-cron`         | 给了 `delayMinutes` 又给 `cron`           | 拒绝               |
|  3  | `relative-delay-is-one-shot`        | 给了 `delayMinutes` 又 `recurring: true`  | 拒绝               |
|  4  | `relative-delay-has-no-max-runs`    | 给了 `delayMinutes` 又给 `maxRuns`        | 拒绝               |
|  5  | `interval-unit-excludes-delay`      | 给了 `intervalUnit` 又给 `delayMinutes`   | 拒绝               |
|  6  | `interval-unit-pairs-with-interval` | `intervalUnit` 与 `interval` 只给其一     | 拒绝               |
|  7  | `interval-unit-requires-recurring`  | 给了 `intervalUnit` 又 `recurring: false` | 拒绝               |
|  8  | `interval-unit-has-no-max-runs`     | 给了 `intervalUnit` 又给 `maxRuns`        | 拒绝               |
|  9  | `interval-within-range`             | `interval` 非 1–200 整数                  | 拒绝（`201` 一例） |

**一次报全**：多个违反项同时出现时，错误文本列出全部（不是遇第一条就停）。

**断言**：每条约束至少一个用例，断言错误文本包含该约束名。

## C. 投影（模型可见面）

### B7 隐藏 `modelSelection` 与 `mode`

**实测依据**（`CronAutomationSchema.safeParse`）：

```
12 字段（缺 modelSelection/mode）: ✅ 通过
14 字段（含两者）:                 ✅ 通过
14 字段 + 未知键:                  ❌ 失败 — Unrecognized key(s)
```

**所以「少给」合法、「多给未知键」不合法** —— 旧实现的 12 字段是**有意少给，不是 bug**。

**本包做法**：`ModelVisibleField = Exclude<keyof CronAutomation, "modelSelection" | "mode">`，
运行时用「实际键 − 隐藏字段」。当前与旧实现的 12 字段等价。

**断言**：`CronCreate` 与 `CronList` 的结果都不含 `modelSelection` / `mode`；
且 `automationId` 等 12 个字段都在。

**⚠️ 差异**：契约新增第 15 个字段时，本包会**包含**它而旧实现不会 —— 见 known-differences D1。

## D. 四个操作的输出

| 工具         | 输出                                                  | 断言                                                                                        |
| ------------ | ----------------------------------------------------- | ------------------------------------------------------------------------------------------- |
| `CronCreate` | `{ automation, message: "Created automation <id>." }` | message 含 `Created automation` 与任务 id                                                   |
| `CronUpdate` | `{ automation, message: "Updated automation <id>." }` | message 含 `Updated automation`                                                             |
| `CronList`   | `{ automations }`                                     | 每条都过投影                                                                                |
| `CronDelete` | `{ deleted, id, message }`                            | 成功文案 `Deleted automation <id>.`；未找到文案 `… was not found in the current workspace.` |

### B8 删除是幂等的

`delete` 返回 `false`（任务本来就不存在）**不抛错**，而是返回
`{ deleted: false, id, message: "<id> was not found in the current workspace." }`。

**理由**：删除是幂等操作；「本来就没有」与「删掉了」是两种正常结果，
让模型能区分而不是收到异常。

**断言**：端口返回 `false` → 结果是 `deleted: false` 且不抛错。

## E. 失败路径与保护

### B9 端口不可用时明确失败

`getAutomationPort()` 返回 `undefined` → 四个工具都抛
`"Scheduled automations are not available in this session"`。

**⚠️ 不返回空列表、不返回成功** —— 「能力不可用」与「没有任务」是两件事。

**断言**：四个工具各一例，都 `assert.rejects`。

### B10 自动化轮次内不得写

读 DSH 执行上下文的 `metadata.automationTurn === true`：

- 三个写工具（`CronCreate` / `CronUpdate` / `CronDelete`）→ **拒绝**；
- `CronList`（只读）→ **仍可用**。

**理由**：自动化轮次再创建自动化会无限递归。

**⚠️ 这是本包最重要的运行前提**：DSH 的 `ToolRunContext` 没有「自动化轮次」概念，
本包约定宿主在 `metadata.automationTurn` 上标注。
**若宿主不标注 → 该保护不生效** —— 见 known-differences D6。

**断言**：两个用例（写工具被拒、只读仍可用）。

### B11 创建上限错误的翻译

端口抛 `AutomationCreateLimitError`（`code = AUTOMATION_CREATE_LIMIT_REACHED`）→
本包翻译成带同一错误码的 `Error`，`cause` 保留原始错误。

**理由**：上限不是异常，是产品语义（用户有配额），调用方要拿到可识别的错误码。

**断言**：端口抛该错误 → 本包抛出的错误 `code` 相同且 `cause` 是原始错误。

## F. 跨平台

### B12 不在真实用户目录读写

测试用临时目录 + 诱饵目录；断言诱饵 `~/.knorvia-studio` 全树 mtime 不变。

**⚠️ 本包的存储由宿主端口负责**，本包自身不读写文件系统 ——
所以这条主要约束**端口的假实现**不得触碰真实目录。
