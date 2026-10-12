# contracts-02 调用方（callers.md）

范围：`@knorvia/contracts` 的 `tools`（44 继承）、`tracing`（4）、`workflow`（7）、`rewind`（1）。
方法：对每个公开入口做全仓文本搜索（`apps/`、`packages/`、`scripts/`、`specs/`，排除 `node_modules`/`dist`），
列出 import / `require` / 动态 `import()` 的调用点；再用 `dep:refs` 对关键导出抽样核对（见文末）。
同一文件多次命中只记一行。

## `@knorvia/contracts/tools/node-repl`

命中 1 处。

- `apps\cli\packages\node-repl-host\src\mcp-runtime.ts:9` — `import { JsInputJsonSchema } from "@knorvia/contracts/tools/node-repl";`

## `@knorvia/contracts/tools/websearch`

命中 0 处。

- （无）

## `@knorvia/contracts/tools`

命中 0 处。

- （无）

## `@knorvia/contracts/workflow`

命中 0 处。

- （无）

## `@knorvia/contracts/rewind`

命中 0 处。

- （无）

## `@knorvia/contracts`

命中 1085 处。

- `scripts\build-desktop-agent-cli.mjs:36` — `{ packageName: "@knorvia/contracts", packageDir: "contracts" },`
- `apps\cli\pnpm-lock.yaml:69` — `'@knorvia/contracts':`
- `apps\cli\pnpm-lock.yaml:128` — `'@knorvia/contracts':`
- `apps\cli\pnpm-lock.yaml:150` — `'@knorvia/contracts':`
- `apps\cli\pnpm-lock.yaml:187` — `'@knorvia/contracts':`
- `apps\cli\pnpm-lock.yaml:264` — `'@knorvia/contracts':`
- `apps\cli\pnpm-lock.yaml:310` — `'@knorvia/contracts':`
- `apps\cli\packages\tui\src\types.ts:20` — `} from "@knorvia/contracts";`
- `apps\cli\packages\tui\src\tui.tsx:2` — `import type { UiThemeMode } from "@knorvia/contracts";`
- `apps\cli\packages\tui\src\theme\types.ts:1` — `import type { UiThemeMode, UiThemePreference } from "@knorvia/contracts";`
- `apps\cli\packages\tui\src\theme\terminal.ts:2` — `import type { UiThemeMode } from "@knorvia/contracts";`
- `apps\cli\packages\tui\src\theme\state.ts:1` — `import type { UiThemeMode, UiThemePreference } from "@knorvia/contracts";`
- `apps\cli\packages\tui\src\theme\defaults.ts:1` — `import type { UiThemeMode } from "@knorvia/contracts";`
- `apps\cli\packages\tui\src\state.ts:1` — `import type { SessionEvent } from "@knorvia/contracts";`
- `apps\cli\packages\tui\src\app.tsx:1` — `import type { ModelUsageSummary, TodoItem, TurnId } from "@knorvia/contracts";`
- `apps\cli\packages\tui\src\app-workflow-events.ts:6` — `import type { DynamicWorkflowRunProgressPayload } from "@knorvia/contracts";`
- `apps\cli\packages\tui\src\app-view.tsx:1` — `import type { ModelUsageSummary, TodoItem, TurnId } from "@knorvia/contracts";`
- `apps\cli\packages\tui\src\app-turn-complete.ts:5` — `import type { ModelUsageSummary } from "@knorvia/contracts";`
- `apps\cli\packages\tui\src\app-tool-transcript.ts:1` — `import { SessionEventType, type SessionEvent } from "@knorvia/contracts";`
- `apps\cli\packages\tui\src\app-submit.ts:1` — `import type { SessionEvent, TurnId } from "@knorvia/contracts";`
- `apps\cli\packages\tui\src\app-submit-controller.ts:3` — `import type { SessionEvent, TurnId } from "@knorvia/contracts";`
- `apps\cli\packages\tui\src\app-subagents.ts:2` — `import { SessionEventType, type SessionEvent } from "@knorvia/contracts";`
- `apps\cli\packages\tui\src\app-subagent-transcript.ts:1` — `import { SessionEventType, type SessionEvent } from "@knorvia/contracts";`
- `apps\cli\packages\tui\src\app-subagent-events.ts:1` — `import { SessionEventType, type SessionEvent } from "@knorvia/contracts";`
- `apps\cli\packages\tui\src\app-sidebar-mcp.tsx:1` — `import type { McpServerStatus, McpServerStatusKind } from "@knorvia/contracts";`
- `apps\cli\packages\tui\src\app-sidebar-api.tsx:1` — `import type { ModelUsageSummary } from "@knorvia/contracts";`
- `apps\cli\packages\tui\src\app-session-event-handler.ts:1` — `import type { SessionEvent } from "@knorvia/contracts";`
- `apps\cli\packages\tui\src\app-result.ts:1` — `import type { CollaborationMode, ModelUsageSummary, TodoItem, TurnId } from "@knorvia/contracts";`
- `apps\cli\packages\tui\src\app-question-state.ts:1` — `import type { AskUserQuestionAnnotation, AskUserQuestionInput } from "@knorvia/contracts";`
- `apps\cli\packages\tui\src\app-permission.ts:9` — `} from "@knorvia/contracts";`
- `apps\cli\packages\tui\src\app-model.ts:9` — `} from "@knorvia/contracts";`
- `apps\cli\packages\tui\src\app-mode.ts:1` — `import type { CollaborationMode } from "@knorvia/contracts";`
- `apps\cli\packages\tui\src\app-events.ts:7` — `} from "@knorvia/contracts";`
- `apps\cli\packages\tui\src\app-event-data.ts:1` — `import { createModelUsageSummary, type ModelUsageSummary } from "@knorvia/contracts";`
- `apps\cli\packages\tui\src\app-approval.ts:1` — `import type { PermissionBrokerRequest, PermissionBrokerResult } from "@knorvia/contracts";`
- `apps\cli\packages\tui\package.json:22` — `"@knorvia/contracts": "workspace:*",`
- `apps\cli\packages\telemetry\package.json:22` — `"@knorvia/contracts": "workspace:*",`
- `apps\cli\packages\node-repl-host\src\cua-broker.ts:5` — `import type { Logger } from "@knorvia/contracts";`
- `apps\cli\packages\node-repl-host\package.json:23` — `"@knorvia/contracts": "workspace:*",`
- `apps\cli\packages\i18n\src\types.ts:1` — `import type { SupportedLocale } from "@knorvia/contracts";`
- `apps\cli\packages\i18n\src\types.ts:3` — `export type { SupportedLocale, UiLocale } from "@knorvia/contracts";`
- `apps\cli\packages\i18n\src\locale.ts:1` — `import type { SupportedLocale, UiLocale } from "@knorvia/contracts";`
- `apps\cli\packages\i18n\src\index.ts:1` — `import type { UiLocale, SupportedLocale } from "@knorvia/contracts";`
- `apps\cli\packages\i18n\package.json:22` — `"@knorvia/contracts": "workspace:*"`
- `apps\cli\packages\core\test\background-data-safety-20261003.mjs:68` — `"@knorvia/contracts",`
- `apps\cli\packages\core\test\ask-user-question-fixture.ts:3` — `import type { PermissionBrokerPort } from "@knorvia/contracts";`
- `apps\cli\packages\core\test\ask-user-question-contract.test.ts:9` — `} from "@knorvia/contracts";`
- `apps\cli\packages\core\test\ask-user-question-consumers.test.ts:9` — `} from "@knorvia/contracts";`
- `apps\cli\packages\core\test\agent-tool-fixture.ts:4` — `import { AgentInputSchema, AgentOutputSchema } from "@knorvia/contracts";`
- `apps\cli\packages\core\test\agent-tool-contract.test.ts:9` — `} from "@knorvia/contracts";`
- `apps\cli\packages\core\test\agent-tool-consumers.test.ts:4` — `import { CoreErrorType, SessionEventType } from "@knorvia/contracts";`
- `apps\cli\packages\core\src\workflow\scheduler.ts:19` — `export { deriveWorkflowRunSchedulerState, deriveWorkflowSchedulerState } from "@knorvia/contracts";`
- `apps\cli\packages\core\src\workflow\scheduler.ts:20` — `export type { WorkflowSchedulerDerivedNode, WorkflowSchedulerState } from "@knorvia/contracts";`
- `apps\cli\packages\core\src\workflow\scheduler\types.ts:12` — `} from "@knorvia/contracts";`
- `apps\cli\packages\core\src\workflow\scheduler\ready-order.ts:1` — `import type { WorkflowGraph, WorkflowGraphNode } from "@knorvia/contracts";`
- `apps\cli\packages\core\src\workflow\scheduler\prompts.ts:5` — `} from "@knorvia/contracts";`
- `apps\cli\packages\core\src\workflow\scheduler\planner-expansion.ts:6` — `} from "@knorvia/contracts";`
- `apps\cli\packages\core\src\workflow\scheduler\node-runner.ts:5` — `} from "@knorvia/contracts";`
- `apps\cli\packages\core\src\workflow\scheduler\node-runner-outcome.ts:6` — `} from "@knorvia/contracts";`
- `apps\cli\packages\core\src\workflow\scheduler\graph-helpers.ts:11` — `} from "@knorvia/contracts";`
- （其余 1025 处省略）

## 抽样核对（`dep:refs`）

```
pnpm dep:refs --list-exports apps/cli/packages/contracts/src/tools/target.ts
pnpm dep:refs apps/cli/packages/contracts/src/rewind/index.ts:evaluateRewindTarget --json
pnpm dep:refs apps/cli/packages/contracts/src/tracing/tracer.ts:createRootTraceContext --json
```

核对结论：`tools/target.ts` 的 `Target*` 兼容别名在 `--list-exports` 中显示为未使用，与全仓搜索一致（该块已在合同前删除）；
`evaluateRewindTarget` 与 `createRootTraceContext` 的调用点与上表 import 命中一致。
