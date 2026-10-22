# kernel-plugin-tools-01 调用方

> 两个视角：**谁调用本包的工具**（模型通过 DSH 注册表）与
> **本包调用谁**（宿主注入的 `AutomationPort`）。

## 一、谁调用本包的工具

### 1. 模型（唯一实际调用方）

四个工具注册进 `ctx.tools` 后，由 DSH 的工具管线调度：

```
模型发起 tool call
  → tools/pre-execute   （审批：写工具 ask，只读工具直接放行）
  → tools/execute       （环绕：dsh-timeout 施加 30 秒预算）
  → 本包的 execute      （校验交叉约束 → 调 AutomationPort → 投影）
  → tools/post-execute  （结果后处理）
  → tools/result        （呈现投影）
```

**⚠️ 本包不直接调用任何其它 Knorvia 包的工具**，也不被它们直接调用。

### 2. 契约测试

```
apps/cli/packages/bootstrap/test/kernel-plugin-tools-01-cron.test.ts
```

**入口**：`apply(ctx, config)` + 假 `ctx.tools` 桩。
**断言面**：注册集、参数形状、九条约束按名报错、投影隐藏字段、端口缺席失败、无品牌泄漏。

**⚠️ 测试不 import 实现内部函数**（`runCronCreate` 等）——
只通过 `tools.get(name).execute(...)` 断言可观察行为，这样实现重构不会打碎测试。

### 3. 组合层（`KERNEL_PLUGIN_ROWS`）

`kernel-dsh-builtins` 已交付的组合行机制会追加一行：

```ts
{ rowId: "knorvia-tools-cron", moduleId: "@knorvia/bootstrap/kernel-plugin-tools-01", config }
```

**`config` 由宿主在 boot 时构造**，提供 `getAutomationPort` / `sessionIdOf` / `modelOf`。

## 二、本包调用谁

### `AutomationPort`（宿主注入，不 import 实现）

```ts
interface AutomationPort {
  create(input: CronCreateInput, context?: AutomationCreateContext): Promise<CronAutomation>;
  update(input: CronUpdateInput): Promise<CronAutomation>;
  list(): Promise<CronAutomation[]>;
  delete(input: CronDeleteInput): Promise<boolean>;
}
```

**来源**：`@knorvia/contracts` 的 `interfaces/automation.port.ts`（已存在，本包不改）。

**本包的调用契约**：

| 操作     | 传给端口的                              | 期望端口做的                               |
| -------- | --------------------------------------- | ------------------------------------------ |
| `create` | 已校验的输入 + `{ model?, sessionId? }` | 落库、排期、返回完整记录                   |
| `update` | 只含要改字段的输入                      | 合并后返回完整记录                         |
| `list`   | 无                                      | 返回当前 workspace 全部记录（含已完成）    |
| `delete` | `{ id }`                                | 删除并返回 `boolean`（false = 本来就没有） |

**⚠️ 端口是「能力边界」，不是「实现细节」** ——
本包不假设端口怎么落库、怎么排期；那是宿主的 `kernel-bridge-02/03` 或后续包的事。

### 端口缺失时的行为

`getAutomationPort()` 返回 `undefined` → 四个工具都抛
`"Scheduled automations are not available in this session"`。

**⚠️ 不返回空列表、不返回成功** —— 「能力不可用」与「没有任务」是两件事。

### 端口抛「创建上限」错误时

`AutomationCreateLimitError`（`code = AUTOMATION_CREATE_LIMIT_REACHED`）→
本包翻译成带同一错误码的 `Error`，`cause` 保留原始错误。

**为什么单独处理**：上限不是异常，是产品语义（用户有配额），
调用方要拿到可识别的错误码而不是一段自由文本。

## 三、本包**不**调用谁（重要的边界）

| 不调用                               | 为什么                                                             |
| ------------------------------------ | ------------------------------------------------------------------ |
| `core/src/**`                        | 旧实现只作行为对照，随 `core` 删除                                 |
| `dsh-user-approval` 直接 API         | 审批由 DSH 的 `tools/pre-execute` 调度，本包只声明 `needsApproval` |
| `dsh-timeout` 直接 API               | 超时由 `tools/execute` 环绕，本包只声明 `timeoutMs`                |
| `dsh-output-retention` 直接 API      | 输出裁剪由 DSH 承担，本包只声明 `maxOutputBytes`                   |
| 任何 `@deepseek-ai/*` 的内部实现文件 | 只用公开类型与公开服务（规格红线）                                 |

## 四、依赖方向图

```text
模型
 │ tool call
 ▼
DSH ToolRuntime（ctx.tools）
 │ tools/pre-execute → execute → post-execute → result
 ▼
kernel-plugin-tools-01（本包）
 │ AutomationPort（注入）
 ▼
宿主：定时任务端口实现（落库 / 排期 / 触发）
 │
 ▼
任务触发时 → 新会话（或复用创建时的会话，见 interface.md §二）
```

**⚠️ 关键：本包只做「工具 → 端口」这一跳**，
端口的实现、排期、触发都不在本包范围内。
