// SPDX-License-Identifier: Apache-2.0
// kernel-plugin-hooks 合同 v1 的接口清单：插件入口、配置面、复用类型与导出清单。

# kernel-plugin-hooks 接口清单（v1）

## 一、模块路径与接线约定

| 模块路径                                                                         | 兼容要求                                                                  |
| -------------------------------------------------------------------------------- | ------------------------------------------------------------------------- |
| `apps/cli/packages/bootstrap/src/kernel-plugin-hooks/index.ts`                   | **必须**保留：DSH 组合行 `moduleId` 指向本模块；导出 `apply(ctx, config)` |
| `apps/cli/packages/bootstrap/package.json` 的 `exports["./kernel-plugin-hooks"]` | **必须**存在：契约测试与调用方按该子路径导入                              |

**DSH 组合行接线**（`bootstrap/src/kernel/builtins-rows.ts` 追加一行；替换步骤实施）：

```ts
{
  moduleId: "knorvia-kernel-plugin-hooks",
  moduleUrl: kernelPluginHooksUrl,      // 由 module-url.ts 解析
  config: {
    hookConfig: () => hooksRuntimeConfig,          // 当前生效的 Hook 配置（可变更）
    workspaceContext: () => ({ workspacePath, workspaceKey }),
    sessionContext: () => ({ sessionId }),
    trustStore: () => trustStoreHandle,            // adapters 的存储句柄
    logger,
  } satisfies KnorviaHooksConfig,
}
```

**为什么全用 getter**：桥与会话在 attach/detach 之间状态会变；`resolve()` 按事件调用，取值必须是最新状态（沿用 `kernel-plugin-credentials` 的接线范式）。

## 二、配置面（`KnorviaHooksConfig`）

```ts
export interface KnorviaHooksConfig {
  /** 当前生效的 Hook 配置。**必需**。每次事件重新取值，配置变更下一次事件生效。 */
  readonly hookConfig: () => HooksRuntimeConfig;
  /** workspace 身份事实。**必需**（信任判定与变量展开都需要）。 */
  readonly workspaceContext: () => {
    readonly workspacePath: string;
    readonly workspaceKey: string;
  };
  /** 会话身份事实。**必需**（stdin JSON 的 session_id / 环境变量都需要）。 */
  readonly sessionContext: () => { readonly sessionId: string };
  /** 工作区 Hook 信任存储句柄。**必需**（规格：存储随本插件保留）。 */
  readonly trustStore: () => WorkspaceHookTrustStorePort;
  readonly logger?: KnorviaLogger;
}
```

**早失败**（沿用 `kernel-plugin-credentials` §一 的约定）：缺少任一必需字段时 `apply` **立即抛错** ——
配置错误应在装配期暴露，而不是拖到第一次 Hook 触发（那时症状在 Hook 执行上，根因却在装配）。
**不补默认值**：`sessionId` / `workspacePath` 这类是「当前运行时的事实」，凭空造值等于伪造状态。

## 三、复用的公开类型（`@knorvia/contracts`，不重新定义）

本包**直接引用** `apps/cli/packages/contracts/src/hooks/index.ts` 的既有导出：

| 类型 / 值                                                                                                                                                                                             | 用途                                          |
| ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------- |
| `HookEventName`（7 种）                                                                                                                                                                               | 事件名枚举                                    |
| `HookInput` / `SessionStartHookInput` / `UserPromptSubmitHookInput` / `PreToolUseHookInput` / `PermissionRequestHookInput` / `PostToolUseHookInput` / `PostToolUseFailureHookInput` / `StopHookInput` | 各事件的输入形状                              |
| `HookJSONOutput` / `HookSpecificOutput` / `HookSpecificOutputSchema` / `HookJSONOutputSchema`                                                                                                         | Hook stdout 的 schema 与校验                  |
| `HookPermissionDecision`                                                                                                                                                                              | `PreToolUse` / `PermissionRequest` 的决策枚举 |
| `HookOutcome`                                                                                                                                                                                         | 执行结局枚举                                  |
| `HookSourceKind` / `HookConfigSource`                                                                                                                                                                 | Hook 来源                                     |
| `HookConfig` / `HookCommandConfig` / `HookProcessConfig`                                                                                                                                              | 两形态配置                                    |
| `HookMatcherConfig` / `HooksRuntimeConfig`                                                                                                                                                            | 匹配器与运行时配置                            |
| `HookExecutionDescriptor` / `HookPluginContext`                                                                                                                                                       | 执行描述与插件上下文                          |

**不新增**：本包不复制这些类型的定义（避免双份真相）。

## 四、本包对外导出

```ts
// 插件入口
export function apply(ctx: Context, config: KnorviaHooksConfig): void;
export type { KnorviaHooksConfig };

// 执行器（供调用方与测试使用；走公开入口）
export function parseHookOutput(stdout: string, event: HookEventName): HookJSONOutput | undefined;
export function decideForPreToolUse(output: HookJSONOutput): HookPermissionDecision | undefined;
export function decideForStop(output: HookJSONOutput): { continue: boolean } | undefined;

// 信任策略层（B10–B16 的公开面）
export function createWorkspaceHookTrustPolicy(...): WorkspaceHookTrustPolicy;
export function evaluateWorkspaceHookTrust(...): WorkspaceHookTrustEvaluation;
```

**约束**：`index.ts` 只做装配与导出，不含具体逻辑（沿用各 M2 包的组织方式）。

## 五、跨包依赖（只走公开入口）

| 依赖                  | 入口                                                                                                                                    | 用途                     |
| --------------------- | --------------------------------------------------------------------------------------------------------------------------------------- | ------------------------ |
| `@knorvia/contracts`  | `@knorvia/contracts/hooks`（或既有 barrel）                                                                                             | Hook 类型与 schema       |
| `adapters` 的信任存储 | `@knorvia/adapters` 的公开导出（不 deep import）                                                                                        | 工作区 Hook 信任的持久化 |
| DSH 公开类型          | `@deepseek-ai/cordis`、`@deepseek-ai/dsh-tools`、`@deepseek-ai/dsh-agent`、`@deepseek-ai/dsh-session`、`@deepseek-ai/dsh-user-approval` | 事件类型与 `Context`     |

**禁止**：import 桥（`bootstrap/src/kernel-bridge/**`）或 bootstrap 内部实现文件；
import `core/**`（该包随 `kernel-switch` 删除）。
