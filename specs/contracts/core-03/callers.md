# core-03 调用方（v1）

数据来源：全仓导入解析（`apps`、`packages`、`scripts` 下的 `.ts/.tsx/.mjs/.js`，排除 `node_modules`/`dist`/`.turbo`）。

## 调用方总览（80 个文件）

| 区域                                   | 文件数 |
| -------------------------------------- | ------ |
| `apps/cli/packages/bootstrap`          | 47     |
| `apps/cli/packages/node-repl-host`     | 22     |
| `apps/cli/packages/cli`                | 9      |
| `apps/cli/packages/browser-use-plugin` | 1      |
| `apps/cli/packages/tui`                | 1      |

全部调用方位于 `apps/cli/packages`（以 `bootstrap/src/app/*` 为主），均通过包名入口 `@knorvia/core` 引用；没有任何调用方直接相对导入 `core/src/workflow/**`。

## 入口形态

| 场景       | 入口                                                                                             | 备注                                                                    |
| ---------- | ------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------- |
| 生产调用方 | `@knorvia/core`（包根 `src/index.ts`）                                                           | 依赖包根导出集合（190 具名导出）；本轮修复使源码入口（tsx）也能加载包根 |
| 区域桶     | `workflow/expert.ts`、`workflow/scheduler.ts`、`workflow/lifecycle.ts`、`workflow/definition.ts` | 供分块测试与内部使用；导出名同样受 `interface.md` 约束                  |
| 契约测试   | 包根（源码路径或 `KNORVIA_CORE_HOOKS_ENTRY` 风格的环境变量指向 dist）                            | 双入口验证                                                              |

## 调用方样本

| 调用方                                                                      | 引用            |
| --------------------------------------------------------------------------- | --------------- |
| `apps/cli/packages/bootstrap/src/app/create-app.ts`                         | `@knorvia/core` |
| `apps/cli/packages/bootstrap/src/app/dynamic-workflow-run-launch.ts`        | `@knorvia/core` |
| `apps/cli/packages/bootstrap/src/app/dynamic-workflow-run-progress-sink.ts` | `@knorvia/core` |
| `apps/cli/packages/bootstrap/src/app/dynamic-workflow-run-service.ts`       | `@knorvia/core` |
| `apps/cli/packages/bootstrap/src/app/input-facade.ts`                       | `@knorvia/core` |
| `apps/cli/packages/bootstrap/src/app/paths.ts`                              | `@knorvia/core` |
| `apps/cli/packages/bootstrap/src/app/plugin-runtime-features.ts`            | `@knorvia/core` |
| `apps/cli/packages/bootstrap/src/app/prompt-input.ts`                       | `@knorvia/core` |
| `apps/cli/packages/bootstrap/src/app/provider-registry-model-runtime.ts`    | `@knorvia/core` |
| `apps/cli/packages/bootstrap/src/app/runtime-config.ts`                     | `@knorvia/core` |
| `apps/cli/packages/bootstrap/src/app/script-workflow-child-runtime.ts`      | `@knorvia/core` |
| `apps/cli/packages/bootstrap/src/app/session-facade.ts`                     | `@knorvia/core` |
| `apps/cli/packages/bootstrap/src/app/startup-marks.ts`                      | `@knorvia/core` |
| `apps/cli/packages/bootstrap/src/app/subagent-observation.ts`               | `@knorvia/core` |
| `apps/cli/packages/bootstrap/src/app/types.ts`                              | `@knorvia/core` |
| `apps/cli/packages/bootstrap/src/app/workflow-actor-transcript.ts`          | `@knorvia/core` |
| `apps/cli/packages/bootstrap/src/app/workflow-driver-concurrency.ts`        | `@knorvia/core` |
| `apps/cli/packages/bootstrap/src/app/workflow-driver-helpers.ts`            | `@knorvia/core` |
| `apps/cli/packages/bootstrap/src/app/workflow-driver-submit-profile.ts`     | `@knorvia/core` |
| `apps/cli/packages/bootstrap/src/app/workflow-driver-tool-activity.ts`      | `@knorvia/core` |

（其余 60 个调用方同类，均只经包名入口。）

## 本包对外依赖（反向）

| 依赖包               | 引用次数（35 文件内） |
| -------------------- | --------------------- |
| `@knorvia/contracts` | 38                    |

## 边界约束

- 替换实现**不得**改变 `@knorvia/core` 的导出名集合与种类（值/类型），否则调用方（尤其 `bootstrap/src/app/*`）会在编译或运行期失败。
- `src/index.ts` 中指向别包区域（agent/context/compact/hooks/mcp/plugin-reference/subagent/runtime-task）的 `export *` 属别包契约，本包仅保证其**种类**正确。
- 调用方对调度事件与返回形态有行为依赖（见 `known-differences.md` §5），属兼容面。
