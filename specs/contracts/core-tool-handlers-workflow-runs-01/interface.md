# core-tool-handlers-workflow-runs-01 接口（interface.md）

只列**兼容所需的模块路径、导出名、参数与返回类型**：替换包必须让这些模块路径与导出在编译产物中保持可用，签名不变。行为见 `behavior.md`，调用方见 `callers.md`。

覆盖 `apps/cli/packages/core/src/tool/handlers` 下 **11 个继承文件**（`licensing/current-files.json` 实测：upstream-modified 10 / unreviewed 1）。

## 导出统计

| 项           | 数量 |
| ------------ | ---- |
| 模块数       | 11   |
| 导出合计     | 16   |
| 运行时值导出 | 16   |
| 类型导出     | 0    |

## get-workflow-run.ts

> 单 run 自适应详情 handler

- `getWorkflowRunToolEntry` (value): `ToolEntry`

## get-workflow-run-format.ts

> GetWorkflowRun 模型面骨架

- `formatGetWorkflowRunModelContent` (value): `(output: unknown) => ModelMessageContent`

## get-workflow-run-format-roster.ts

> 情势三块与 log_tail 表格渲染

- `formatWorkflowRunHealthBlock` (value): `(run: GetWorkflowRunOutput, terminal: boolean) => string`
- `formatWorkflowRunPhasesBlock` (value): `(run: GetWorkflowRunOutput, terminal: boolean) => string | undefined`
- `formatWorkflowRunSubagentsBlock` (value): `(run: GetWorkflowRunOutput) => string`
- `formatWorkflowRunLogTailBlock` (value): `(run: GetWorkflowRunOutput) => string`

## get-workflow-run-roster-output.ts

> 端口视图 → 契约投影

- `toGetWorkflowRunPhases` (value): `(phases: readonly DynamicWorkflowRunPhaseView[] | undefined) => GetWorkflowRunPhase[] | undefined`
- `toGetWorkflowRunSubagents` (value): `(subagents: readonly DynamicWorkflowRunSubagentView[]) => { subagents: GetWorkflowRunSubagent[]; truncated: boolean; }`
- `toGetWorkflowRunHealth` (value): `(health: DynamicWorkflowRunHealth) => GetWorkflowRunHealth`

## get-workflow-run-summary.ts

> 确定性 summary

- `buildWorkflowRunSummary` (value): `(run: WorkflowRunSummaryFacts) => string`

## get-workflow-run-activity-program.ts

> 花名册活动行渲染

- `renderWorkflowRunActivity` (value): `(subagent: GetWorkflowRunSubagent, now: number, askedAtByQid: ReadonlyMap<string, number>) => string`

## list-workflow-runs.ts

> ListWorkflowRuns 工具入口

- `listWorkflowRunsToolEntry` (value): `ToolEntry`

## list-saved-workflows.ts

> ListSavedWorkflows 工具入口

- `listSavedWorkflowsToolEntry` (value): `ToolEntry`

## list-models.ts

> ListModels 工具入口

- `listModelsToolEntry` (value): `ToolEntry`

## resume-workflow-run.ts

> ResumeWorkflowRun 工具入口

- `resumeWorkflowRunToolEntry` (value): `ToolEntry`

## resolve-workflow-question.ts

> ResolveWorkflowQuestion 工具入口

- `resolveWorkflowQuestionToolEntry` (value): `ToolEntry`
