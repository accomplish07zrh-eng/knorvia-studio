# core-tool-handlers-workflow-01 接口（interface.md）

只列**兼容所需的模块路径、导出名、参数与返回类型**：替换包必须让这些模块路径与导出在编译产物中保持可用，签名不变。行为见 `behavior.md`，调用方见 `callers.md`。

覆盖 `apps/cli/packages/core/src/tool/handlers` 下 **22 个继承文件**（`licensing/current-files.json` 实测：upstream-unchanged 2 / upstream-modified 19 / unreviewed 1）。

## 导出统计

| 项           | 数量 |
| ------------ | ---- |
| 模块数       | 22   |
| 导出合计     | 57   |
| 运行时值导出 | 55   |
| 类型导出     | 2    |

> 工具描述等大型文案常量（`*_TOOL_DESCRIPTION`、`WORKFLOW_RUN_INTROSPECTION_STEERING` 等）只列名字与种类；其必须保持的语义要点与关键文案见 `behavior.md` 对应 B 条目与测试对照。

## 逐文件导出

### `apps/cli/packages/core/src/tool/handlers/amend-workflow-description.ts`

继承分类 `upstream-unchanged`，36 行，1 个导出。

```ts
export const AMEND_WORKFLOW_TOOL_DESCRIPTION: string;
```

### `apps/cli/packages/core/src/tool/handlers/amend-workflow-resolve.ts`

继承分类 `upstream-modified`，269 行，7 个导出。

```ts
export const AMEND_WORKFLOW_ERROR_CODE: {
  readonly AMEND_UNAVAILABLE: 21;
  readonly MISSING_BOUNDARIES: 22;
  readonly SUBAGENT_MODEL: 23;
  readonly SCRIPT_UNCHANGED: 24;
  readonly SCRIPT_FILE: 25;
  readonly SCRIPT_UNAVAILABLE: 26;
};
export function predecessorNotFoundFailure(runId: string): ToolHandlerFailure;
export function resolveAmendMaxConcurrency(
  requested: number | null | undefined,
  inherited: number | undefined,
  ceiling: number | undefined,
): { max_concurrency?: number };
export function resolveAmendSubagentModelChoice(
  requested: string | null | undefined,
  inherited: string | undefined,
  catalog: ModelCatalogPort | undefined,
):
  | { ok: true; canonical?: string }
  | { ok: false; inherited: boolean; text: string; message: string };
export async function resolveAmendWorkflowInput(
  input: unknown,
  context: ToolInputResolutionContext,
): Promise<ToolInputResolutionResult>;
export function scriptUnavailableFailure(
  runId: string,
  cause: "record" | "host",
): ToolHandlerFailure;
export function validateAmendWorkflowSource(input: unknown): { result: true } | ToolHandlerFailure;
```

### `apps/cli/packages/core/src/tool/handlers/amend-workflow-source.ts`

继承分类 `upstream-modified`，213 行，6 个导出。

```ts
export const AMEND_WORKFLOW_ERROR_CODE: {
  readonly AMEND_UNAVAILABLE: 21;
  readonly MISSING_BOUNDARIES: 22;
  readonly SUBAGENT_MODEL: 23;
  readonly SCRIPT_UNCHANGED: 24;
  readonly SCRIPT_FILE: 25;
  readonly SCRIPT_UNAVAILABLE: 26;
};
export async function refuseUnchangedScript(options: {
  port: DynamicWorkflowRunPort;
  model: AmendWorkflowInput;
  resolvedScript: string;
  described: string | undefined;
}): Promise<ToolHandlerFailure | undefined>;
export async function resolveAmendScript(options: {
  model: AmendWorkflowInput;
  cwd: string;
  port: DynamicWorkflowRunPort | undefined;
  predecessorScriptPath: string | undefined;
}): Promise<AmendScriptResolution>;
export async function resolveKeptScriptFile(options: {
  cwd: string;
  scriptPath: string | undefined;
  script: string;
}): Promise<{ path: string; described: string; lineOffset: number } | undefined>;
export function scriptUnavailableFailure(
  runId: string,
  cause: "record" | "host",
): ToolHandlerFailure;
export function validateAmendWorkflowSource(input: unknown): { result: true } | ToolHandlerFailure;
```

### `apps/cli/packages/core/src/tool/handlers/amend-workflow.ts`

继承分类 `upstream-modified`，311 行，1 个导出。

```ts
export const amendWorkflowToolEntry: ToolEntry;
```

### `apps/cli/packages/core/src/tool/handlers/ask-user-question-result.ts`

继承分类 `unreviewed`，51 行，1 个导出。

```ts
export const executeAnsweredQuestion: ToolHandler;
```

### `apps/cli/packages/core/src/tool/handlers/ask-user-question.ts`

继承分类 `upstream-modified`，100 行，1 个导出。

```ts
export const askUserQuestionToolEntry: ToolEntry;
```

### `apps/cli/packages/core/src/tool/handlers/create-workflow-description.ts`

继承分类 `upstream-modified`，114 行，1 个导出。

```ts
export const CREATE_WORKFLOW_TOOL_DESCRIPTION: string;
```

### `apps/cli/packages/core/src/tool/handlers/create-workflow-graph-bounds.ts`

继承分类 `upstream-modified`，257 行，1 个导出。

```ts
export function boundCausalityGraph(
  graph: CausalityGraph,
  flow?: ControlFlowGraph,
  handoff?: HandoffGraph,
): CreateWorkflowCausalityGraph;
```

### `apps/cli/packages/core/src/tool/handlers/create-workflow-graph-fold.ts`

继承分类 `upstream-modified`，164 行，2 个导出。

```ts
export function foldPhaseEdges(raw: readonly RawEdge[]): RawEdge[];
export interface RawEdge {
  from: string;
  to: string;
  back: boolean;
}
```

### `apps/cli/packages/core/src/tool/handlers/create-workflow-source.ts`

继承分类 `upstream-modified`，348 行，4 个导出。

```ts
export function clampWorkflowMaxConcurrency(value: number, ceiling: number | undefined): number;
export async function resolveCreateWorkflowInput(
  input: unknown,
  cwd: string,
  ceiling?: number,
  catalog?: ModelCatalogPort,
): Promise<ToolInputResolutionResult>;
export const SUBAGENT_MODEL_UNAVAILABLE: "This host cannot choose a subagent model; omit subagent_model.";
export function validateCreateWorkflowSource(input: unknown): { result: true } | ToolHandlerFailure;
```

### `apps/cli/packages/core/src/tool/handlers/create-workflow.ts`

继承分类 `upstream-modified`，396 行，5 个导出。

```ts
export const createWorkflowToolEntry: ToolEntry;
export function describeWorkflowConcurrencyLimit(
  limit: number | undefined,
  ceiling: number | undefined,
): string;
export const DIAGNOSTICS_NOT_EXECUTED_NOTE: "NOTE: The workflow was NOT executed — fix the errors above and resubmit.";
export const EXECUTION_UNAVAILABLE_NOTE: "NOTE: The workflow was NOT executed — workflow execution is not available in this session, so the script was only typechecked.";
export function resolveTraceContext(context: ToolExecutionContext): TraceContext;
```

### `apps/cli/packages/core/src/tool/handlers/eval-workflow-snippet-description.ts`

继承分类 `upstream-modified`，44 行，1 个导出。

```ts
export const EVAL_WORKFLOW_SNIPPET_TOOL_DESCRIPTION: string;
```

### `apps/cli/packages/core/src/tool/handlers/eval-workflow-snippet.ts`

继承分类 `upstream-modified`，323 行，1 个导出。

```ts
export const evalWorkflowSnippetToolEntry: ToolEntry;
```

### `apps/cli/packages/core/src/tool/handlers/save-workflow-description.ts`

继承分类 `upstream-modified`，70 行，1 个导出。

```ts
export const SAVE_WORKFLOW_TOOL_DESCRIPTION: string;
```

### `apps/cli/packages/core/src/tool/handlers/save-workflow.ts`

继承分类 `upstream-modified`，317 行，1 个导出。

```ts
export const saveWorkflowToolEntry: ToolEntry;
```

### `apps/cli/packages/core/src/tool/handlers/workflow-analysis-display.ts`

继承分类 `upstream-modified`，47 行，2 个导出。

```ts
export function boundGraphOfAnalysis(
  analysis: AnalyzeResult,
): CreateWorkflowCausalityGraph | undefined;
export function displayOfAnalysis(
  analysis: AnalyzeResult,
  toolName: string = CREATE_WORKFLOW_TOOL_NAME,
): ToolResultDisplayPayload | undefined;
```

### `apps/cli/packages/core/src/tool/handlers/workflow-drafts.ts`

继承分类 `upstream-modified`，148 行，2 个导出。

```ts
export function resolveWorkflowDraftName(
  name: string | undefined,
  graph: Pick<CreateWorkflowCausalityGraph, "phases"> | undefined,
): string;
export async function writeWorkflowDraft(
  input: WriteWorkflowDraftInput,
): Promise<{ path: string } | undefined>;
```

### `apps/cli/packages/core/src/tool/handlers/workflow-path-source.ts`

继承分类 `upstream-modified`，118 行，1 个导出。

```ts
export async function readWorkflowScriptFile(options: {
  cwd: string;
  inputPath: string;
  parseFrontmatter?: boolean;
}): Promise<WorkflowScriptFileResult>;
```

### `apps/cli/packages/core/src/tool/handlers/workflow-run-introspection.ts`

继承分类 `upstream-modified`，89 行，10 个导出。

```ts
export function escapeXml(value: string): string;
export function formatRelativeAge(now: number, at: number | undefined): string | undefined;
export function formatWorkflowRunCount(value: number): string;
export function formatWorkflowRunDuration(ms: number): string;
export function formatWorkflowRunInstant(now: number, at: number): string;
export function formatWorkflowRunTimestamp(epochMs: number): string;
export const WORKFLOW_RUN_INTROSPECTION_STEERING: string;
export function workflowIntrospectionUnavailableFailure(): ToolHandlerFailure;
export function workflowRunAttribute(name: string, value: string | number | boolean): string;
export function workflowRunNotFoundFailure(runId: string): ToolHandlerFailure;
```

### `apps/cli/packages/core/src/tool/handlers/workflow-script-analysis.ts`

继承分类 `upstream-modified`，24 行，1 个导出。

```ts
export function analyzeScript(script: string): AnalyzeResult;
```

### `apps/cli/packages/core/src/tool/handlers/workflow-script-notes.ts`

继承分类 `upstream-modified`，54 行，6 个导出。

```ts
export function formatWorkflowDiagnosticLines(
  diagnostics: readonly CreateWorkflowDiagnostic[],
  location: WorkflowScriptLocation | undefined,
): string[];
export function workflowAmendedScriptSentence(location: WorkflowScriptLocation): string;
export function workflowLaunchedScriptSentence(location: WorkflowScriptLocation): string;
export function workflowSavedDraftNote(options: {
  savedName: string;
  savedPath: string;
  draft: string;
}): string;
export function workflowScriptFileNote(location: WorkflowScriptLocation): string;
export interface WorkflowScriptLocation {
  kind: "draft" | "path";
  described: string;
  lineOffset: number;
}
```

### `apps/cli/packages/core/src/tool/handlers/workflow-script-path.ts`

继承分类 `upstream-unchanged`，33 行，1 个导出。

```ts
export function describeWorkflowScriptPath(absolutePath: string, cwd: string | undefined): string;
```
