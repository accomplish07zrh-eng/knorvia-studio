# core-tool-handlers-workflow-01 调用方（v1）

数据来源：`scripts/dep-refs.mjs` 同源的静态引用分析（ts-morph），对 22 个继承文件的 **57 个导出**逐个查询工作区（`packages/*`、`apps/*`、`apps/cli/packages/*`、`harness/**`）内的全部引用点。静态分析不覆盖 `import()` 动态导入与字符串路径引用；桶 `export *` 的再导出另见 `interface.md`。

## 概览

| 指标             | 数值 |
| ---------------- | ---- |
| 继承文件         | 22   |
| 导出合计         | 57   |
| 有包外引用的导出 | 12   |
| 包外引用点       | 47   |
| 仅包内使用的导出 | 39   |

## 跨包/跨目录边界（按引用点计）

| 引用方区域               | 引用点 |
| ------------------------ | ------ |
| `apps/cli/packages/core` | 47     |

> 主要调用方为 `handlers/index.ts`（桶，归最后一个 handlers 包）与 core 执行器/权限链、runtime 通知与运行时接线。接口默认不可变。

## 逐模块明细

### `amend-workflow-description.ts`（1 个导出）

包外无引用（仅包内使用）。

### `amend-workflow-resolve.ts`（7 个导出）

| 导出                              | 种类     | 包外引用点 | 位置                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| --------------------------------- | -------- | ---------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `resolveAmendMaxConcurrency`      | function | 2          | runtime/methods/dynamic-workflow-run-settings.ts:13<br>runtime/methods/dynamic-workflow-run-settings.ts:120                                                                                                                                                                                                                                                                                                                                                                                                                               |
| `resolveAmendSubagentModelChoice` | function | 9          | runtime/methods/dynamic-workflow-run-settings.ts:14<br>runtime/methods/dynamic-workflow-run-settings.ts:105<br>apps/cli/packages/core/test/model-catalog-consumers.test.ts:140<br>apps/cli/packages/core/test/model-catalog-consumers.test.ts:144<br>apps/cli/packages/core/test/model-catalog-consumers.test.ts:148<br>apps/cli/packages/core/test/model-catalog-consumers.test.ts:152<br>apps/cli/packages/core/test/model-catalog-consumers.test.ts:161<br>apps/cli/packages/core/test/model-catalog-consumers.test.ts:164<br>…另 1 处 |

### `amend-workflow-source.ts`（6 个导出）

| 导出                    | 种类     | 包外引用点 | 位置                                                                                                        |
| ----------------------- | -------- | ---------- | ----------------------------------------------------------------------------------------------------------- |
| `resolveKeptScriptFile` | function | 2          | runtime/methods/dynamic-workflow-run-settings.ts:16<br>runtime/methods/dynamic-workflow-run-settings.ts:156 |

### `amend-workflow.ts`（1 个导出）

包外无引用（仅包内使用）。

### `ask-user-question-result.ts`（1 个导出）

包外无引用（仅包内使用）。

### `ask-user-question.ts`（1 个导出）

包外无引用（仅包内使用）。

### `create-workflow-description.ts`（1 个导出）

包外无引用（仅包内使用）。

### `create-workflow-graph-bounds.ts`（1 个导出）

包外无引用（仅包内使用）。

### `create-workflow-graph-fold.ts`（2 个导出）

包外无引用（仅包内使用）。

### `create-workflow-source.ts`（4 个导出）

| 导出                         | 种类     | 包外引用点 | 位置                                                                                                                                                                                                  |
| ---------------------------- | -------- | ---------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `resolveCreateWorkflowInput` | function | 3          | apps/cli/packages/core/test/model-catalog-consumers.test.ts:104<br>apps/cli/packages/core/test/model-catalog-consumers.test.ts:127<br>apps/cli/packages/core/test/model-catalog-consumers.test.ts:186 |
| `SUBAGENT_MODEL_UNAVAILABLE` | const    | 2          | apps/cli/packages/core/test/model-catalog-consumers.test.ts:134<br>apps/cli/packages/core/test/model-catalog-consumers.test.ts:157                                                                    |

### `create-workflow.ts`（5 个导出）

包外无引用（仅包内使用）。

### `eval-workflow-snippet-description.ts`（1 个导出）

包外无引用（仅包内使用）。

### `eval-workflow-snippet.ts`（1 个导出）

包外无引用（仅包内使用）。

### `save-workflow-description.ts`（1 个导出）

包外无引用（仅包内使用）。

### `save-workflow.ts`（1 个导出）

包外无引用（仅包内使用）。

### `workflow-analysis-display.ts`（2 个导出）

| 导出                   | 种类     | 包外引用点 | 位置                                                                                                                                                                                                                 |
| ---------------------- | -------- | ---------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `boundGraphOfAnalysis` | function | 4          | runtime/methods/dynamic-workflow-run-settings.ts:19<br>runtime/methods/dynamic-workflow-run-settings.ts:155<br>runtime/methods/dynamic-workflow-run-start.ts:16<br>runtime/methods/dynamic-workflow-run-start.ts:160 |
| `displayOfAnalysis`    | function | 4          | runtime/methods/dynamic-workflow-run-settings.ts:20<br>runtime/methods/dynamic-workflow-run-settings.ts:249<br>runtime/methods/dynamic-workflow-run-start.ts:17<br>runtime/methods/dynamic-workflow-run-start.ts:198 |

### `workflow-drafts.ts`（2 个导出）

| 导出                       | 种类     | 包外引用点 | 位置                                                                                                                                                                                                                 |
| -------------------------- | -------- | ---------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `resolveWorkflowDraftName` | function | 2          | runtime/methods/dynamic-workflow-run-settings.ts:23<br>runtime/methods/dynamic-workflow-run-settings.ts:166                                                                                                          |
| `writeWorkflowDraft`       | function | 4          | runtime/methods/dynamic-workflow-run-settings.ts:24<br>runtime/methods/dynamic-workflow-run-settings.ts:164<br>runtime/methods/dynamic-workflow-run-start.ts:19<br>runtime/methods/dynamic-workflow-run-start.ts:169 |

### `workflow-path-source.ts`（1 个导出）

包外无引用（仅包内使用）。

### `workflow-run-introspection.ts`（10 个导出）

| 导出                    | 种类     | 包外引用点 | 位置                                                                                                                                                                                                                                                                                                                                                        |
| ----------------------- | -------- | ---------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `escapeWorkflowRunText` | function | 9          | runtime-task/notification.ts:90<br>runtime-task/notification.ts:229<br>runtime-task/workflow-notification-copy.ts:6<br>runtime-task/workflow-notification-copy.ts:25<br>runtime/methods/subagent-messages.ts:7<br>runtime/methods/subagent-messages.ts:12<br>runtime/methods/subagent-messages.ts:13<br>runtime/methods/subagent-messages.ts:14<br>…另 1 处 |

### `workflow-script-analysis.ts`（1 个导出）

| 导出            | 种类     | 包外引用点 | 位置                                                                                                                                                                                                                 |
| --------------- | -------- | ---------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `analyzeScript` | function | 4          | runtime/methods/dynamic-workflow-run-settings.ts:26<br>runtime/methods/dynamic-workflow-run-settings.ts:137<br>runtime/methods/dynamic-workflow-run-start.ts:20<br>runtime/methods/dynamic-workflow-run-start.ts:124 |

### `workflow-script-notes.ts`（6 个导出）

包外无引用（仅包内使用）。

### `workflow-script-path.ts`（1 个导出）

| 导出                         | 种类     | 包外引用点 | 位置                                                                                                        |
| ---------------------------- | -------- | ---------- | ----------------------------------------------------------------------------------------------------------- |
| `describeWorkflowScriptPath` | function | 2          | tool/executor/background-tracker-notification.ts:18<br>tool/executor/background-tracker-notification.ts:265 |

## 仅包内使用的导出（包外无静态引用）

- amend-workflow-description.ts :: AMEND_WORKFLOW_TOOL_DESCRIPTION
- amend-workflow-resolve.ts :: predecessorNotFoundFailure
- amend-workflow-resolve.ts :: resolveAmendWorkflowInput
- amend-workflow-source.ts :: refuseUnchangedScript
- amend-workflow-source.ts :: resolveAmendScript
- amend-workflow.ts :: amendWorkflowToolEntry
- ask-user-question-result.ts :: executeAnsweredQuestion
- ask-user-question.ts :: askUserQuestionToolEntry
- create-workflow-description.ts :: CREATE_WORKFLOW_TOOL_DESCRIPTION
- create-workflow-graph-bounds.ts :: boundCausalityGraph
- create-workflow-graph-fold.ts :: foldPhaseEdges
- create-workflow-graph-fold.ts :: RawEdge
- create-workflow-source.ts :: clampWorkflowMaxConcurrency
- create-workflow-source.ts :: validateCreateWorkflowSource
- create-workflow.ts :: createWorkflowToolEntry
- create-workflow.ts :: describeWorkflowConcurrencyLimit
- create-workflow.ts :: DIAGNOSTICS_NOT_EXECUTED_NOTE
- create-workflow.ts :: EXECUTION_UNAVAILABLE_NOTE
- create-workflow.ts :: resolveTraceContext
- eval-workflow-snippet-description.ts :: EVAL_WORKFLOW_SNIPPET_TOOL_DESCRIPTION
- eval-workflow-snippet.ts :: evalWorkflowSnippetToolEntry
- save-workflow-description.ts :: SAVE_WORKFLOW_TOOL_DESCRIPTION
- save-workflow.ts :: saveWorkflowToolEntry
- workflow-path-source.ts :: readWorkflowScriptFile
- workflow-run-introspection.ts :: formatRelativeAge
- workflow-run-introspection.ts :: formatWorkflowRunCount
- workflow-run-introspection.ts :: formatWorkflowRunDuration
- workflow-run-introspection.ts :: formatWorkflowRunInstant
- workflow-run-introspection.ts :: formatWorkflowRunTimestamp
- workflow-run-introspection.ts :: WORKFLOW_RUN_INTROSPECTION_STEERING
- workflow-run-introspection.ts :: workflowIntrospectionUnavailableFailure
- workflow-run-introspection.ts :: workflowRunAttribute
- workflow-run-introspection.ts :: workflowRunNotFoundFailure
- workflow-script-notes.ts :: formatWorkflowDiagnosticLines
- workflow-script-notes.ts :: workflowAmendedScriptSentence
- workflow-script-notes.ts :: workflowLaunchedScriptSentence
- workflow-script-notes.ts :: workflowSavedDraftNote
- workflow-script-notes.ts :: workflowScriptFileNote
- workflow-script-notes.ts :: WorkflowScriptLocation

## 只被桶再导出的导出

- amend-workflow-resolve.ts :: AMEND_WORKFLOW_ERROR_CODE
- amend-workflow-resolve.ts :: scriptUnavailableFailure
- amend-workflow-resolve.ts :: validateAmendWorkflowSource
- amend-workflow-source.ts :: AMEND_WORKFLOW_ERROR_CODE
- amend-workflow-source.ts :: scriptUnavailableFailure
- amend-workflow-source.ts :: validateAmendWorkflowSource
