# core-tool-handlers-workflow-runs-01 调用方（callers.md）

版本 v1。覆盖 `dep:refs` 对 11 个在范围模块 **16 个运行时导出**的全部结果（`pnpm dep:refs <file>:<export>`，2026-10-15）。**无零引用文件或导出**：6 个工具入口经 `index.ts` barrel 注册、10 个内部纯函数由包内兄弟模块消费。

## 包外引用（12 处，全部在 `handlers/index.ts` barrel）

| 导出                               | 模块                           | 引用方                                            |
| ---------------------------------- | ------------------------------ | ------------------------------------------------- |
| `getWorkflowRunToolEntry`          | `get-workflow-run.ts`          | `index.ts:68`（import）+ `index.ts:121`（注册表） |
| `listWorkflowRunsToolEntry`        | `list-workflow-runs.ts`        | `index.ts:67` + `index.ts:120`                    |
| `listSavedWorkflowsToolEntry`      | `list-saved-workflows.ts`      | `index.ts:64` + `index.ts:131`                    |
| `listModelsToolEntry`              | `list-models.ts`               | `index.ts:65` + `index.ts:135`                    |
| `resumeWorkflowRunToolEntry`       | `resume-workflow-run.ts`       | `index.ts:69` + `index.ts:125`                    |
| `resolveWorkflowQuestionToolEntry` | `resolve-workflow-question.ts` | `index.ts:57` + `index.ts:129`                    |

`index.ts` 归 handlers 末包（不在本包范围）；替换包只要保持模块路径与导出名不变，barrel 不需改动。

## 包内兄弟引用（10 个纯函数，dep:refs 无包外引用）

| 导出                                                                               | 模块                                   | 消费方（包内）                                          |
| ---------------------------------------------------------------------------------- | -------------------------------------- | ------------------------------------------------------- |
| `formatGetWorkflowRunModelContent`                                                 | `get-workflow-run-format.ts`           | `get-workflow-run.ts`（`ToolEntry.formatModelContent`） |
| `formatWorkflowRunHealthBlock` / `PhasesBlock` / `SubagentsBlock` / `LogTailBlock` | `get-workflow-run-format-roster.ts`    | `get-workflow-run-format.ts`（模型面骨架）              |
| `toGetWorkflowRunPhases` / `toGetWorkflowRunSubagents` / `toGetWorkflowRunHealth`  | `get-workflow-run-roster-output.ts`    | `get-workflow-run.ts`（快照投影）                       |
| `buildWorkflowRunSummary`                                                          | `get-workflow-run-summary.ts`          | `get-workflow-run.ts`（摘要最后拼）                     |
| `renderWorkflowRunActivity`                                                        | `get-workflow-run-activity-program.ts` | `get-workflow-run-format-roster.ts`（花名册活动列）     |

## 依赖方向（本包消费的公开入口，替换时保持不变）

- `@knorvia/contracts`：工具 schema（6 组 Input/Output JsonSchema + runtime schema）、`GET_WORKFLOW_RUN_ROSTER_LIMITS`、`GET_WORKFLOW_RUN_SUMMARY_MAX_CHARS`、`SAVED_WORKFLOW_PROJECT_DIR`
- `../types`（`ToolEntry`/`ToolHandler`/`ToolExecutionContext`/`ToolHandlerFailure`）
- `../executor/workflow-artifact`（`serializeWorkflowArtifact`）、`../executor/workflow-published-artifacts`（`WORKFLOW_ARTIFACTS_INTROSPECTION_MAX_LINES`、`formatPublishedArtifactLine`）
- `../../runtime-task/notification`（`formatWorkflowProviderStopError`）
- 同目录 original 邻居：`get-workflow-run-snapshot-fields`、`get-workflow-run-output-fields`、`get-workflow-run-summary-clauses`、`list-workflow-runs-operation`、`list-saved-workflows-model-renderer`、`list-models-projection`、`./saved-workflows/index.js`
- 同目录前向依赖（workflow-01 22 件）：`workflow-run-introspection`（`WORKFLOW_RUN_INTROSPECTION_STEERING`、`workflowIntrospectionUnavailableFailure`、`workflowRunNotFoundFailure`、`escapeWorkflowRunText`、`formatRelativeAge`、`formatWorkflowRunInstant`、`formatWorkflowRunTimestamp`、`formatWorkflowRunDuration`、`formatWorkflowRunCount`、`workflowRunAttribute`）
