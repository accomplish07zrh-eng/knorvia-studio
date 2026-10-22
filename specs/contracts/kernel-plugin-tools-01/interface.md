# kernel-plugin-tools-01 接口

> 本包对外的变化只有三处：`@knorvia/bootstrap` 新增一个子路径导出、
> `KERNEL_PLUGIN_ROWS` 追加一行、以及四个工具进入 DSH 的工具注册表。
> **不改任何 v4 协议字段、旧协议方法、用户数据格式、`KNORVIA_` 环境变量或数据目录。**

## 一、包导出面

新增子路径（`apps/cli/packages/bootstrap/package.json`）：

```json
"./kernel-plugin-tools-01": {
  "types": "./dist/kernel-plugin-tools-01/index.d.ts",
  "import": "./dist/kernel-plugin-tools-01/index.js"
}
```

### `apply(ctx, config)`

DSH 插件入口（与 `kernel-plugin-credentials` 同形态）：

```ts
export function apply(ctx: Context, config: KernelPluginToolsConfig): void;
```

在 `apply` 内向 `ctx.tools.register(defineTool(...))` 注册四个工具，不做别的事
（审批、超时、结果序列化由 DSH 承担）。

### `KernelPluginToolsConfig`

```ts
export interface KernelPluginToolsConfig {
  /** 取定时任务端口；返回 undefined 表示当前会话不支持定时任务。 */
  readonly getAutomationPort: () => AutomationPort | undefined;
  /** 取当前调用的会话 id（用于创建时绑定会话）。 */
  readonly sessionIdOf?: (ctx: Context) => string | undefined;
  /** 取当前调用的模型标识（`providerId/modelId`）。 */
  readonly modelOf?: (ctx: Context) => string | undefined;
}
```

**为什么端口用注入而不是 import**：插件对宿主零耦合，测试可注入假端口；
这也是 `kernel-plugin-credentials` 已确立的形态（`testProviderConnectivity` 同样注入）。

## 二、注册的工具（模型可见面）

| 工具名       | 只读 | 需审批 | 参数                                                                                                 | 输出                       |
| ------------ | :--: | :----: | ---------------------------------------------------------------------------------------------------- | -------------------------- |
| `CronCreate` |  ❌  |   ✅   | `cron` / `delayMinutes` / `prompt` / `title` / `recurring` / `maxRuns` / `intervalUnit` / `interval` | `{ automation, message }`  |
| `CronList`   |  ✅  |   ❌   | —                                                                                                    | `{ automations }`          |
| `CronUpdate` |  ❌  |   ✅   | `id` + 上述 8 个字段（全部可选）                                                                     | `{ automation, message }`  |
| `CronDelete` |  ❌  |   ✅   | `id`                                                                                                 | `{ deleted, id, message }` |

**元数据分两层**（2026-10-23 实测修正 —— 原表把两层混在一起）：

### 第一层：DSH 工具定义（`DefineToolOptions` 的真实字段）

| 字段                | 取值                                                  |
| ------------------- | ----------------------------------------------------- |
| `timeoutMs`         | `30_000`（四个工具相同）                              |
| `isConcurrencySafe` | `CronList` → `() => true`；三个写工具 → `() => false` |

**⚠️ DSH 的 `DefineToolOptions` 只有 `timeoutMs` 与 `isConcurrencySafe` 两个语义字段**；
`readOnly` / `destructive` / `needsApproval` / `sideEffectScope` / `riskLevel` /
`maxOutputBytes` / `guidance` **在 DSH 里都不存在**（实测 `lib/types/schema.d.ts`）。

### 第二层：Knorvia 能力声明（`ToolCapabilityDeclaration`，纯数据）

由 `kernel-plugin-policy` 的 `resolveCapability(toolName, declaration)` 读取。
依据：`tool-catalogue.ts` 的注释逐字说明「DSH 的 `ToolSchema` 只是 JSON Schema，
不含 `readOnly` / `destructive` / `sideEffectScope` 语义 —— 那些是 Knorvia 的产品概念」。

| 字段              | 取值                                                   |
| ----------------- | ------------------------------------------------------ |
| `readOnly`        | `CronList` → `true`；其余 → `false`                    |
| `destructive`     | 全部 `false`（删除是删除一条调度记录，不是删用户数据） |
| `needsApproval`   | `CronList` → `false`；其余 → `true`                    |
| `sideEffectScope` | `CronList` → `"none"`；其余 → `"workspace"`            |
| `riskLevel`       | `CronList` → `"low"`；其余 → `"medium"`                |

**⚠️ `maxOutputBytes` 本包不声明** —— 输出预算由 DSH 的 `dsh-output-retention`
与 `dsh-spill` 承担（见 README §二 4 的映射表）。

## 三、导出清单（供测试与宿主使用）

```ts
// 插件入口
export function apply(ctx, config): void;
export interface KernelPluginToolsConfig;

// 约束与常量（测试与宿主可断言）
export { CRON_CREATE_CONSTRAINTS, CRON_INTERVAL_UNITS, violationsOf } from "./cron-schema.js";
export { CRON_MODEL_BYTES, CRON_TOOL_TIMEOUT_MS, cronToolMetadata } from "./cron-declaration.js";
export type { CronCallContext, CronOperation, CronPipeline, CronPortProvider } from "./cron-execution.js";
```

**为什么把约束表导出**：让契约测试能逐条断言「九条约束各自存在且按名报错」，
而不是只测「非法输入会失败」——后者无法区分「哪一条约束生效了」。

## 四、依赖方向（冻结）

```text
@knorvia/contracts  ──(AutomationPort / CronAutomation / 四个 Input Schema)──>  kernel-plugin-tools-01
@deepseek-ai/dsh-tools ──(defineTool / ToolRuntime)──>  kernel-plugin-tools-01
```

**本包不被上述两者 import**；本包对它们的依赖是「调用」。

**本包不依赖**：

- `core/src/**`（旧实现在本包只作行为对照，不 import）
- `kernel-plugin-credentials` / `kernel-dsh-builtins` / `kernel-bridge-*`（并行包，无交集）
- `dsh-user-approval` / `dsh-timeout` / `dsh-output-retention`（由 DSH 组合层挂载，本包只声明需求）

## 五、组合行（`KERNEL_PLUGIN_ROWS` 追加）

```ts
{
  rowId: "knorvia-tools-cron",
  moduleId: "@knorvia/bootstrap/kernel-plugin-tools-01",
  config: { /* 宿主在 boot 时注入 getAutomationPort / sessionIdOf / modelOf */ },
}
```

**⚠️ 行 id 与 `moduleId` 的最终形态由实现 PR 落定**；本合同的约束是：
**追加行不改既有行 id**，且 `kernel-dsh-00` 的行快照测试按本合同升级（属合同演进，不是放宽断言）。

## 六、与相邻包的接缝

| 相邻包                               | 关系                                                                                                    |
| ------------------------------------ | ------------------------------------------------------------------------------------------------------- |
| `kernel-dsh-builtins`（已合并 #228） | 本包**追加**工具行；不改它的挂载集与 `system-prompt` 配置                                               |
| `kernel-plugin-policy`（未开始）     | 本包的写工具会经 `tools/pre-execute` 走审批；**五种权限模式的语义由它决定**，本包只声明 `needsApproval` |
| `kernel-plugin-hooks`（未开始）      | 本包不碰 Hook 事件；Hook 挂在 `tools/pre-execute` / `post-execute` 上                                   |
| `kernel-plugin-tools-02`（下一包）   | `off-peak` 2 个 + 会话/计划 3 个工具；**本包不含**                                                      |
| `kernel-legacy-sessions`             | `js` 工具（REPL）；DSH 的 `run_code`（PTC）是否覆盖由该包侦察                                           |

## 七、与旧实现的对照关系（不 import，只对照行为）

| 旧文件（`beff12b5` 基线）                  | 行数 | 本包的对照对象                 |
| ------------------------------------------ | ---: | ------------------------------ |
| `core/src/tool/handlers/cron.ts`           |  300 | 四个工具的定义、文案、超时预算 |
| `core/src/tool/handlers/cron-execution.ts` |  137 | 准入、投影、四态输出、错误文案 |

**合计 437 行**。本包的新实现约 700 行（含测试）。

**⚠️ 旧实现的两处行为在本包保留**（实测确认不是 bug）：

1. **投影只给 12 个字段**，隐藏 `modelSelection` / `mode`。
   `zod` 实测：两者都是 `.optional()`，少给合法；多给未知键才失败。
2. **`delayMinutes` 的 `null` 与 `undefined` 都视为「非相对延迟」**。
   旧契约注释写明：`null` 曾被当作不稳定值，`undefined` 曾掉进相对延迟分支把周期任务错建成一次性。
