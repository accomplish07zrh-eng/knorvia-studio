# kernel-plugin-tools-02 接口

> 本包对外的变化只有三处：`@knorvia/bootstrap` 新增一个子路径导出、
> `KERNEL_PLUGIN_ROWS` 追加一行、以及**给 `dsh-plan-mode` 行补上 guidance 配置**。
> **不改任何 v4 协议字段、旧协议方法、用户数据格式、`KNORVIA_` 环境变量或数据目录。**

## 一、包导出面

新增子路径（`apps/cli/packages/bootstrap/package.json`）：

```json
"./kernel-plugin-tools-02": {
  "types": "./dist/kernel-plugin-tools-02/index.d.ts",
  "import": "./dist/kernel-plugin-tools-02/index.js"
}
```

### `apply(ctx, config)`

DSH 插件入口（与 `kernel-plugin-tools-01` / `kernel-plugin-credentials` 同形态）：

```ts
export function apply(ctx: Context, config: KernelPluginTools02Config): void;
```

在 `apply` 内向 `ctx.tools.register(defineTool(...))` 注册四个工具，不做别的事。

### `KernelPluginTools02Config`

```ts
export interface KernelPluginTools02Config {
  /** 取离峰端口；返回 undefined 表示当前会话不支持离峰配置。 */
  readonly getOffPeakPort: () => OffPeakPort | undefined;
  /** 取会话上下文投影的读取面；返回 undefined 表示不可用。 */
  readonly getSessionContextSource: () => SessionContextSource | undefined;
  /** 取计划模式控制器；返回 undefined 表示 DSH 未挂载 dsh-plan-mode。 */
  readonly getPlanModeController: () => PlanModeController | undefined;
  /** 取当前调用的会话 id。 */
  readonly sessionIdOf?: (ctx: Context) => string | undefined;
}
```

**为什么全部用注入**：插件对宿主零耦合、测试可注入假实现；
与 `kernel-plugin-tools-01` 的 `getAutomationPort` 同一模式。

## 二、注册的工具（模型可见面）

| 工具名               | 只读 | 需审批 | 参数                           | 输出                                                |
| -------------------- | :--: | :----: | ------------------------------ | --------------------------------------------------- |
| `OffPeakCreate`      |  ❌  |   ✅   | `title` + 时间窗口字段（成对） | `{ window, message }`                               |
| `OffPeakList`        |  ✅  |   ❌   | —                              | `{ windows }`                                       |
| `ReadSessionContext` |  ✅  |   ❌   | —                              | 会话上下文快照（字段与旧实现对齐）                  |
| `EnterPlanMode`      |  ❌  |   ✅   | —                              | `{ active, changed, phase, sessionModeBeforePlan }` |

**元数据分两层**（2026-10-23 实测修正，与 `tools-01` 的 known-differences D0 同源）：

### 第一层：DSH 工具定义（`DefineToolOptions` 的真实字段）

| 字段                | 取值                                                         |
| ------------------- | ------------------------------------------------------------ |
| `timeoutMs`         | `30_000`（四个工具相同）                                     |
| `isConcurrencySafe` | 全部 `() => false` —— 离峰配置与计划模式状态都不是并发安全的 |

**⚠️ DSH 的 `DefineToolOptions` 只有 `timeoutMs` 与 `isConcurrencySafe` 两个语义字段**；
`readOnly` / `destructive` / `needsApproval` / `sideEffectScope` / `riskLevel` /
`maxOutputBytes` / `guidance` **在 DSH 里都不存在**（实测 `dsh-tools/lib/types/schema.d.ts`）。

### 第二层：Knorvia 能力声明（`ToolCapabilityDeclaration`，纯数据）

由 `kernel-plugin-policy` 的 `resolveCapability(toolName, declaration)` 读取。
依据：`tool-catalogue.ts` 的注释逐字说明「DSH 的 `ToolSchema` 只是 JSON Schema，
不含 `readOnly` / `destructive` / `sideEffectScope` 语义 —— 那些是 Knorvia 的产品概念」。

| 字段              | `OffPeakCreate` | `OffPeakList` | `ReadSessionContext` | `EnterPlanMode` |
| ----------------- | --------------- | ------------- | -------------------- | --------------- |
| `readOnly`        | `false`         | `true`        | `true`               | `false`         |
| `destructive`     | `false`         | `false`       | `false`              | `false`         |
| `needsApproval`   | `true`          | `false`       | `false`              | `true`          |
| `sideEffectScope` | `"workspace"`   | `"none"`      | `"none"`             | `"session"`     |
| `riskLevel`       | `"medium"`      | `"low"`       | `"low"`              | `"medium"`      |

**⚠️ `sideEffectScope` 的三个不同取值是有意的**：
离峰配置写工作区；读会话上下文无副作用；进入计划模式只改会话状态。

**⚠️ `maxOutputBytes` 本包不声明** —— 输出预算由 DSH 的 `dsh-output-retention`
与 `dsh-spill` 承担（与 `tools-01` 一致）。

## 三、`dsh-plan-mode` 行的 guidance 配置

**本包交付两份模型可见文本**（`plan-mode-guidance.ts`）：

```ts
/** 进入说明：7 类触发条件 + 4 反例 + 6 步流程 + 5 正 3 反情形 + 3 注意事项。 */
export const ENTER_PLAN_MODE_GUIDANCE: string;

/** 退出说明：按 DSH exit_plan_mode 的 6 种失败模式重写。 */
export const EXIT_PLAN_MODE_GUIDANCE: string;
```

**挂载方式**：`dsh-plan-mode` 的 config 里 `section` 字段（必填，纯文本）。
**⚠️ 而 DSH 的 `resolveConfig` 要求「Missing, blank, non-string, or unknown fields fail at plugin load」** ——
所以这两个常量必须非空字符串，且不能带未知字段。

**⚠️ 两份文本互相指向**（见 behavior.md B7）：
进入说明提「用 `exit_plan_mode` 请用户审批」；退出说明提「从 `enter_plan_mode` 进入后」。

## 四、导出清单（供测试与宿主使用）

```ts
// 插件入口
export function apply(ctx, config): void;
export interface KernelPluginTools02Config;

// guidance（宿主挂到 dsh-plan-mode 的 config.section）
export { ENTER_PLAN_MODE_GUIDANCE, EXIT_PLAN_MODE_GUIDANCE } from "./plan-mode-guidance.js";

// 四态与错误类型（测试与宿主可断言）
export { PlanModeEnterCancelledError } from "./plan-mode-tool.js";
export type { PlanModeEnterOutcome } from "./plan-mode-tool.js";
```

## 五、依赖方向（冻结）

```text
@knorvia/contracts  ──(OffPeakPort / SessionContextSource)──>  kernel-plugin-tools-02
@deepseek-ai/dsh-tools ──(defineTool / ToolRuntime)──>  kernel-plugin-tools-02
@deepseek-ai/dsh-plan-mode ──(PlanModeController)──>  kernel-plugin-tools-02
```

**本包不被上述三者 import**；本包对它们的依赖是「调用」。

**本包不依赖**：

- `core/src/**`（旧实现只作行为对照，不 import）
- `kernel-plugin-tools-01`（并行包，无交集；但**复用其形态**）
- `kernel-plugin-policy`（进入条件的语义归它；本包只调 `set()`）
- `dsh-user-approval` / `dsh-timeout` / `dsh-output-retention`（由 DSH 组合层挂载）

## 六、与旧实现的对照关系（不 import，只对照行为）

| 旧文件（`beff12b5` 基线）            |    行数 | 本包的对照对象                                   |
| ------------------------------------ | ------: | ------------------------------------------------ |
| `off-peak.ts`                        |     170 | 两个离峰工具的定义与文案                         |
| `off-peak-execution.ts`              |      77 | 离峰执行体与投影                                 |
| `read-session-context.ts`            |     345 | 会话上下文的输出形状                             |
| `read-session-context-extraction.ts` |      77 | 提取逻辑                                         |
| `plan-mode.ts`                       |     155 | `EnterPlanMode` 的工具定义                       |
| `plan-mode-operation.ts`             |      79 | 进入操作                                         |
| `plan-mode-projection.ts`            |      64 | 状态投影                                         |
| **`plan-mode-prompts.ts`**           | **130** | **进入说明 + 退出说明（36 项语义）**             |
| `todo.ts`                            |     153 | `TodoRead`（不实现）/ `TodoWrite`（归 builtins） |

**合计 1250 行**（其中 `plan-mode-prompts.ts` 130 行是提示词文本）。

## 七、与 `kernel-plugin-tools-01` 的形态对齐

| 维度     | `tools-01`（cron 族）                 | `tools-02`（本包）                                                           |
| -------- | ------------------------------------- | ---------------------------------------------------------------------------- |
| 插件入口 | `apply(ctx, config)`                  | 同                                                                           |
| 注册方式 | `ctx.tools.register(defineTool(...))` | 同                                                                           |
| 元数据   | `cronToolMetadata()` 工厂             | `tools02Metadata()` 工厂（同思路）                                           |
| 约束表达 | 九条具名交叉约束 + 五条字段级         | 离峰窗口成对约束 + 计划模式四态                                              |
| 端口注入 | `getAutomationPort()`                 | `getOffPeakPort()` / `getSessionContextSource()` / `getPlanModeController()` |
| 投影     | 排除 `modelSelection` / `mode`        | 按旧实现的输出 schema 对齐                                                   |

**⚠️ 复用形态但不共享代码** —— 两个包的工具族不同，共享会引入不必要的耦合。
