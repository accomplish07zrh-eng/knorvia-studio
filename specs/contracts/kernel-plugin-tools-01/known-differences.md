# kernel-plugin-tools-01 已知差异

> 每条都是「有意为之的差异」，不是缺陷。若某条被改动，视为破坏合同。

## D1 投影改为「排除表」而非「白名单」——契约新增字段时行为不同

**旧实现**：硬编码 12 个字段名的白名单。

**本包**：`ModelVisibleField = Exclude<keyof CronAutomation, "modelSelection" | "mode">`，
运行时用 `Object.keys(值) − 隐藏字段`。

**当前行为等价**：`CronAutomation` 恰好 14 个字段，排除 2 个后正是旧实现的 12 个
（`zod` 实测：`.optional()` 字段少给不会让输出校验失败）。

**差异只在「契约新增字段」时显现**：

| 情形                              | 旧实现                                 | 本包                                             |
| --------------------------------- | -------------------------------------- | ------------------------------------------------ |
| `CronAutomation` 新增第 15 个字段 | **不会**出现在模型可见面（白名单没写） | **会**出现（除非显式加进 `MODEL_HIDDEN_FIELDS`） |

**为什么这个差异是可接受的**：旧实现的失效方式是「漏写」——
它漏过 `scheduleRule`，导致「每 N 分钟」被显示成「每小时」（源码注释有记录）。
本包反过来：默认可见、显式隐藏，漏写从「可能」变成「不可能」。

**⚠️ 但这是行为差异，不是纯改进** —— 若将来新增的是内部字段而没人加进隐藏表，
就会泄漏给模型。**所以「契约新增字段」时必须同步检查 `MODEL_HIDDEN_FIELDS`。**

## D2 `modelSelection` / `mode` 不给模型看

**实测依据**（`CronAutomationSchema.safeParse`）：

```
12 字段（缺 modelSelection/mode）: ✅ 通过
14 字段（含两者）:                 ✅ 通过
14 字段 + 未知键:                  ❌ 失败 — Unrecognized key(s)
```

**所以「少给」合法、「多给未知键」不合法** —— 旧实现的 12 字段是**有意少给，不是 bug**。

**为什么隐藏**：

- `modelSelection`（`providerId` / `modelId` / `options`）是任务内部调度用的 provider 配置；
- `mode`（`build` / `edit` / `plan` / `yolo`）是任务创建时的工作模式。

两者都是宿主调度状态，模型改不了也不该依赖。

## D3 `delayMinutes` 的 `null` 与 `undefined` 都视为「非相对延迟」

**旧契约注释原文**：

> 「`delayMinutes` 曾经是必填可空，普通 cron 创建也得显式写 null；省略字段的旧调用方、
> 或把 null 当成『不稳定值』而不回传的 provider，会直接 parse 失败；更糟的是在
> `!== null` 判定下 undefined 会掉进相对延迟分支，把 recurring 任务错建成一次性。」

**本包保留**：`hasRelativeDelay()` 用 `typeof input.delayMinutes === "number"` 判定，
所以 `null` / `undefined` 都走「非相对」分支。

**⚠️ 这意味着 `delayMinutes: null` 不会报错** —— 它与「没给」等价。
这是**为了兼容旧调用方**，不是宽松。

## D4 九个交叉约束的错误文本与旧实现不同

**旧实现**：每条 `.refine()` 的 `message` 是固定句子（如 `"cron is required when delayMinutes is not set"`）。

**本包**：错误文本形如 `Invalid cron arguments — <约束名>: <说明>`，
一次列出**全部**违反项（旧实现遇第一条就停）。

**差异**：

- 文本前缀不同（`Invalid cron arguments — `）；
- 本包一次报全（旧实现报第一条）。

**为什么这样改**：一次报全能省一轮模型往返；而约束名可让测试定位到具体哪条。

**⚠️ 若某个下游断言依赖旧文案的**精确字符串**，需按本合同升级断言**（属合同演进）。

## D5 `CronDelete` 的「没找到」是成功而非错误

**与旧实现一致**：返回 `{ deleted: false, id, message: "…was not found in the current workspace." }`，
不抛错。

**理由**：删除是幂等操作；「本来就没有」与「删掉了」是两种正常结果，
让模型能区分而不是收到异常。

## D6 自动化轮次判定的信息来源

**旧实现**：由宿主的 `rejectAutomationTurn(context, name)` 回调判定。

**本包**：读 DSH 执行上下文的 `metadata.automationTurn === true`。

**⚠️ 这是形态差异**：DSH 的 `ToolRunContext` 没有「自动化轮次」概念，
所以本包约定宿主在 `metadata.automationTurn` 上标注。
**若宿主不标注 → 该保护不生效**（模型可在自动化轮次里再创建自动化，造成递归）。

**⚠️ 这是本包最重要的运行前提**，实现 PR 必须在组合行 config 或 bridge 层确保该标注存在。
