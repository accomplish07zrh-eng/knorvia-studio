# core-tool-01 调用方（callers.md）

v1。目的：重写时不得破坏这些调用方依赖的模块路径、导出名与签名。工具：`pnpm dep:refs`（symbol 级）与全仓导入检索。

## 包入口

`apps/cli/packages/core/src/tool/index.ts` 是包入口（barrel），对外可见的导出由四部分组成：

- `./scheduler.js`（**不在本包**，已独立替换）
- `./types.js`（**本包**）
- `./registry.js`（**不在本包**，已独立替换）
- `./executor.js`（**本包** → `./executor/impl.js` 与 `./executor/types.js`）
- 具名导出 `builtInTools`、`registerBuiltInTools`（来自 `./handlers/index.js`，**不在本包**）

## 生产调用方

| 调用方                                                                        | 依赖                                                                                                                                                                                                                                                                            | 说明                                                                 |
| ----------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------- |
| `apps/cli/packages/core/src/runtime/deps.ts`                                  | `import { createToolExecutor, createToolRegistry, registerBuiltInTools } from "../tool/index.js"`；`export { defaultToolScheduler as defaultScheduler, ToolScheduler } from "../tool/scheduler.js"`；`export type { ToolDependency, ToolSchedule } from "../tool/scheduler.js"` | **唯一的生产装配点**：执行器与注册表在 runtime deps 里构造并向下传递 |
| `apps/cli/packages/core/src/context/builder.ts`                               | `import type { ToolRegistry } from "../tool/registry.js"`                                                                                                                                                                                                                       | 只读注册表                                                           |
| `apps/cli/packages/core/src/mcp/index.ts`                                     | `import type { ToolRegistry } from "../tool/registry.js"`；`import type { ToolEntry } from "../tool/types.js"`                                                                                                                                                                  | MCP 工具登记                                                         |
| `apps/cli/packages/core/src/mcp/image-normalization.ts`                       | `import type { ToolExecutionContext } from "../tool/types.js"`                                                                                                                                                                                                                  | 图像归一化上下文                                                     |
| `apps/cli/packages/core/src/agent/read-file-state-hydrator.ts`                | `import type { ReadFileStateMap } from "../tool/types.js"`                                                                                                                                                                                                                      | 会话恢复时注水读取状态                                               |
| `apps/cli/packages/core/src/runtime/helpers/project-memory-agent.ts`          | `import type { ReadFileStateMap } from "../../tool/types.js"`                                                                                                                                                                                                                   | 同上                                                                 |
| `apps/cli/packages/core/src/memory/memory-agent-loop.ts`                      | `import type { ExecutableToolCall, ToolExecutionResult } from "../tool/types.js"`                                                                                                                                                                                               | 记忆代理循环                                                         |
| `apps/cli/packages/core/src/permission/service.ts`                            | `import type { ToolPermissionRulePolicy } from "../tool/types.js"`                                                                                                                                                                                                              | 权限服务读取工具规则策略                                             |
| `apps/cli/packages/core/src/permission/policy-program.ts`                     | 同上                                                                                                                                                                                                                                                                            |                                                                      |
| `apps/cli/packages/core/src/permission/project-rule-matching.ts`              | 同上                                                                                                                                                                                                                                                                            |                                                                      |
| `apps/cli/packages/core/src/runtime/methods/dynamic-workflow-run-settings.ts` | `import type { ExecutableToolCall } from "../../tool/types.js"`                                                                                                                                                                                                                 |                                                                      |
| `apps/cli/packages/core/src/runtime/methods/dynamic-workflow-run-start.ts`    | 同上                                                                                                                                                                                                                                                                            |                                                                      |
| `apps/cli/packages/core/src/runtime/methods/dynamic-workflow-run-track.ts`    | 同上                                                                                                                                                                                                                                                                            |                                                                      |

合计 13 个生产文件（全在 `apps/cli/packages/core/src`）。

## 测试与夹具调用方

| 调用方                                                         | 依赖                                                                                                                                              |
| -------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| `apps/cli/packages/core/test/tool-batch-schedule.test.ts`      | `import { ToolExecutorImpl } from "../src/tool/executor/impl.js"`、`import type { ToolBatchExecuteOptions } from "../src/tool/executor/types.js"` |
| `apps/cli/packages/core/test/tool-batch-waves.test.ts`         | `import type { ToolExecuteOptions } from "../src/tool/executor/types.js"`                                                                         |
| `apps/cli/packages/core/test/tool-invocation-fixture.ts`       | `import type { BackgroundTaskTracker } from "../src/tool/executor/background-tasks.js"`、`ToolExecuteOptions`、`ToolExecutorDeps`                 |
| `apps/cli/packages/core/test/permission-flow-fixture.ts`       | `import type { ToolExecutorDeps } from "../src/tool/executor/types.js"`                                                                           |
| `apps/cli/packages/core/test/result-budget-fixture.ts`         | 同上                                                                                                                                              |
| `apps/cli/packages/core/test/permission-project-store.test.ts` | 同上                                                                                                                                              |
| `apps/cli/packages/core/test/windows-computer-use-mcp.test.ts` | 同上                                                                                                                                              |

**结论：** `ToolExecutorDeps`、`ToolExecuteOptions`、`ToolBatchExecuteOptions`、`ToolExecutorImpl`、`BackgroundTaskTracker`、`ToolEntry`、`ToolExecutionContext`、`ReadFileStateMap`、`ToolPermissionRulePolicy`、`ExecutableToolCall`、`ToolExecutionResult`、`createToolExecutor` 是**被外部引用的名字**，重写后必须继续存在且签名不变；内部文件名可自定，但这些模块路径（`tool/types.js`、`tool/registry.js`、`tool/scheduler.js`、`tool/index.js`、`tool/executor.js`、`tool/executor/impl.js`、`tool/executor/types.js`、`tool/executor/background-tasks.js`）属兼容面，见 `interface.md`。

## 尚未用 `dep:refs` 逐符号跑完的部分

`callers.md` 目前覆盖包入口、`types.ts`、`registry.ts`、`scheduler.ts`、`executor/impl.ts`、`executor/types.ts`、`executor/background-tasks.ts` 的引用关系；其余 25 个继承文件的导出是否被更深的模块按名引用，还需要逐个跑
`pnpm dep:refs apps/cli/packages/core/src/tool/<file>.ts:<export>` 补齐（`interface.md` 已给出全部导出名）。
