# contracts-02 接口（兼容面）

范围：`apps/cli/packages/contracts/src` 下 `tools`（44 继承）、`tracing`（4）、`workflow`（7）、`rewind`（1），共 56 个继承文件。
本文件只列兼容所需的模块路径、导出名、参数与返回类型；行为规格见 `behavior.md`，调用方见 `callers.md`。
纯声明文件按本文件列出的名字剔除兼容行后再算相似度门槛（工具从本文件的反引号片段与代码块提取名字，排除语言关键字）。

## 包入口与子路径（本包范围）

| 子路径                               | 入口文件                 |
| ------------------------------------ | ------------------------ |
| `@knorvia/contracts`                 | `src/index.ts`           |
| `@knorvia/contracts/tools`           | `src/tools/index.ts`     |
| `@knorvia/contracts/tools/node-repl` | `src/tools/node-repl.ts` |
| `@knorvia/contracts/tools/websearch` | `src/tools/websearch.ts` |
| `@knorvia/contracts/workflow`        | `src/workflow/index.ts`  |
| `@knorvia/contracts/rewind`          | `src/rewind/index.ts`    |

`tracing/*` 没有独立子路径，经包根入口再导出；`tools/` 下的单个工具文件经 `./tools` barrel 导出（`node-repl`、`websearch` 另有独立子路径）。

## 导出清单（按文件）

### `rewind/index.ts`

- `ActiveConversationBranchOptions` (InterfaceDeclaration) — `ActiveConversationBranchOptions`
- `CheckpointCreatedPayload` (TypeAliasDeclaration) — `Omit<{ checkpointId: string; messageId: string; scope: "conversation" | "workspace" | "both"; snapshotRef: string; targetMessageId?: string | undefined; toolMessageId?: string | undefined; diffRef?: s`
- `checkpointCreatedPayloadSchema` (VariableDeclaration) — `z.ZodObject<{ checkpointId: z.ZodString; messageId: z.ZodString; targetMessageId: z.ZodOptional<z.ZodString>; toolMessageId: z.ZodOptional<z.ZodString>; scope: z.ZodEnum<["conversation", "workspace", `
- `CheckpointProjectionInfo` (InterfaceDeclaration) — `CheckpointProjectionInfo`
- `evaluateRewindTarget` (FunctionDeclaration) — `export function evaluateRewindTarget<T extends { id: string }>( input: EvaluateRewindTargetInput<T>, ): RewindTargetEvaluation { const getId = input.getId ?? ((item: T) => item.id); const targetIndex `
- `EvaluateRewindTargetInput` (InterfaceDeclaration) — `EvaluateRewindTargetInput<T>`
- `parseCheckpointCreatedPayload` (FunctionDeclaration) — `export function parseCheckpointCreatedPayload(input: unknown): CheckpointCreatedPayload { return checkpointCreatedPayloadSchema.parse(input) as CheckpointCreatedPayload; }`
- `parseRewindTriggeredPayload` (FunctionDeclaration) — `export function parseRewindTriggeredPayload(input: unknown): RewindTriggeredPayload { return rewindTriggeredPayloadSchema.parse(input) as RewindTriggeredPayload; }`
- `parseWorkspaceCheckpointArtifact` (FunctionDeclaration) — `export function parseWorkspaceCheckpointArtifact(input: unknown): WorkspaceCheckpointArtifact { return workspaceCheckpointArtifactSchema.parse(input) as WorkspaceCheckpointArtifact; }`
- `RewindProjectionInfo` (InterfaceDeclaration) — `RewindProjectionInfo`
- `RewindScope` (VariableDeclaration | TypeAliasDeclaration) — `{ readonly Conversation: "conversation"; readonly Workspace: "workspace"; readonly Both: "both"; }`
- `RewindStrategy` (VariableDeclaration | TypeAliasDeclaration) — `{ readonly ActiveChain: "active_chain"; readonly FileOnly: "file_only"; readonly ForkRequired: "fork_required"; readonly Unavailable: "unavailable"; }`
- `RewindTargetEvaluation` (InterfaceDeclaration) — `RewindTargetEvaluation`
- `RewindTargetStatus` (VariableDeclaration | TypeAliasDeclaration) — `{ readonly ActiveChain: "active_chain"; readonly CoveredByCompact: "covered_by_compact"; readonly Missing: "missing"; }`
- `RewindTriggeredPayload` (TypeAliasDeclaration) — `Omit<{ scope: "conversation" | "workspace" | "both"; rewindId: string; strategy: "active_chain" | "file_only" | "fork_required" | "unavailable"; targetMessageId?: string | undefined; compactBoundaryId`
- `rewindTriggeredPayloadSchema` (VariableDeclaration) — `z.ZodObject<{ rewindId: z.ZodString; scope: z.ZodEnum<["conversation", "workspace", "both"]>; strategy: z.ZodEnum<["active_chain", "file_only", "fork_required", "unavailable"]>; targetMessageId: z.Zod`
- `selectActiveConversationBranch` (FunctionDeclaration) — `export function selectActiveConversationBranch<T extends { info: { id: MessageId } }>( messages: readonly T[], options: ActiveConversationBranchOptions = {}, ): T[] { if (!options.rewindTargetMessageI`
- `WorkspaceCheckpointArtifact` (TypeAliasDeclaration) — `{ version: 1; kind: "workspace_file_before_change"; createdAt: string; toolCallId: string; toolName: string; files: { path: string; existedBefore: boolean; beforeContent: string | null; structuredPatc`
- `workspaceCheckpointArtifactSchema` (VariableDeclaration) — `z.ZodObject<{ version: z.ZodLiteral<1>; kind: z.ZodLiteral<"workspace_file_before_change">; createdAt: z.ZodString; toolCallId: z.ZodString; toolName: z.ZodString; files: z.ZodArray<z.ZodObject<{ path`

### `tools/agent.ts`

- `AgentBackgroundedOutput` (InterfaceDeclaration) — `AgentBackgroundedOutput`
- `AgentBackgroundedOutputSchema` (VariableDeclaration) — `z.ZodObject<{ status: z.ZodLiteral<"async_launched">; isAsync: z.ZodLiteral<true>; agentId: z.ZodString; agentType: z.ZodString; description: z.ZodString; prompt: z.ZodString; childSessionId: z.ZodStr`
- `AgentCompletedOutput` (InterfaceDeclaration) — `AgentCompletedOutput`
- `AgentCompletedOutputSchema` (VariableDeclaration) — `z.ZodObject<{ status: z.ZodLiteral<"completed">; agentId: z.ZodString; agentType: z.ZodString; description: z.ZodString; prompt: z.ZodString; content: z.ZodArray<z.ZodObject<{ type: z.ZodLiteral<"text`
- `AgentErrorCode` (VariableDeclaration | TypeAliasDeclaration) — `{ readonly SUBAGENT_UNAVAILABLE: "agent_subagent_unavailable"; readonly BACKGROUND_UNAVAILABLE: "agent_background_unavailable"; readonly UNKNOWN_AGENT_TYPE: "agent_unknown_type"; readonly CHILD_RUNTIM`
- `AgentInput` (TypeAliasDeclaration) — `{ description: string; prompt: string; subagent_type?: string | undefined; run_in_background?: boolean | undefined; }`
- `AgentInputJsonSchema` (VariableDeclaration) — `import("../model/index.js").JsonSchema`
- `AgentInputSchema` (VariableDeclaration) — `z.ZodObject<{ description: z.ZodString; prompt: z.ZodString; subagent_type: z.ZodOptional<z.ZodString>; run_in_background: z.ZodOptional<z.ZodBoolean>; }, "strip", z.ZodTypeAny, { description: string;`
- `AgentOutput` (TypeAliasDeclaration) — `AgentBackgroundedOutput | AgentCompletedOutput`
- `AgentOutputJsonSchema` (VariableDeclaration) — `import("../model/index.js").JsonSchema`
- `AgentOutputSchema` (VariableDeclaration) — `z.ZodUnion<[z.ZodObject<{ status: z.ZodLiteral<"completed">; agentId: z.ZodString; agentType: z.ZodString; description: z.ZodString; prompt: z.ZodString; content: z.ZodArray<z.ZodObject<{ type: z.ZodL`
- `AgentTextContentBlock` (InterfaceDeclaration) — `AgentTextContentBlock`
- `AgentTextContentBlockSchema` (VariableDeclaration) — `z.ZodObject<{ type: z.ZodLiteral<"text">; text: z.ZodString; }, "strict", z.ZodTypeAny, { type: "text"; text: string; }, { type: "text"; text: string; }>`
- `AgentToolCall` (InterfaceDeclaration) — `AgentToolCall`
- `AgentToolResult` (InterfaceDeclaration) — `AgentToolResult`
- `AgentType` (VariableDeclaration | TypeAliasDeclaration) — `{ readonly GeneralPurpose: "general-purpose"; readonly Explore: "Explore"; }`

### `tools/amend-workflow.ts`

- `AMEND_WORKFLOW_SOURCE_ERROR` (VariableDeclaration) — `"Provide at most one revised script: `path`for the script file you edited (the usual form), or`script` for the whole revised script inline. Passing both is ambiguous; omit both to keep the predecess`
- `AMEND_WORKFLOW_TOOL_NAME` (VariableDeclaration) — `"AmendWorkflow"`
- `AmendWorkflowInput` (TypeAliasDeclaration) — `{ run_id: string; path?: string | undefined; script?: string | undefined; name?: string | undefined; max_concurrency?: number | null | undefined; subagent_model?: string | null | undefined; predecesso`
- `AmendWorkflowInputJsonSchema` (VariableDeclaration) — `import("../index.js").JsonSchema`
- `AmendWorkflowInputSchema` (VariableDeclaration) — `z.ZodObject<{ run_id: z.ZodString; script: z.ZodOptional<z.ZodString>; path: z.ZodOptional<z.ZodString>; name: z.ZodOptional<z.ZodString>; max_concurrency: z.ZodOptional<z.ZodNullable<z.ZodNumber>>; s`
- `AmendWorkflowPredecessor` (TypeAliasDeclaration) — `{ status: "completed" | "errored" | "pending" | "running" | "stopped"; owned_by_this_session: boolean; name?: string | undefined; stop_reason?: "user" | "model" | "provider" | "interrupted" | "superse`
- `AmendWorkflowPredecessorSchema` (VariableDeclaration) — `z.ZodObject<{ name: z.ZodOptional<z.ZodString>; status: z.ZodEnum<["completed", "errored", "pending", "running", "stopped"]>; stop_reason: z.ZodOptional<z.ZodEnum<["user", "model", "provider", "interr`

### `tools/apply-patch.ts`

- `ApplyPatchErrorCode` (VariableDeclaration | TypeAliasDeclaration) — `{ readonly INVALID_PATCH: "apply_patch_invalid_patch"; readonly EMPTY_PATCH: "apply_patch_empty_patch"; readonly FILE_NOT_EXIST: "apply_patch_file_not_exist"; readonly FILE_EXISTS: "apply_patch_file_e`
- `ApplyPatchFileChange` (InterfaceDeclaration) — `ApplyPatchFileChange`
- `ApplyPatchFileChangeSchema` (VariableDeclaration) — `z.ZodObject<{ filePath: z.ZodString; type: z.ZodEnum<["add", "update", "delete", "move"]>; movePath: z.ZodOptional<z.ZodString>; structuredPatch: z.ZodArray<z.ZodObject<{ oldStart: z.ZodNumber; oldLin`
- `ApplyPatchInput` (TypeAliasDeclaration) — `{ patch_text: string; }`
- `ApplyPatchInputJsonSchema` (VariableDeclaration) — `import("../index.js").JsonSchema`
- `ApplyPatchInputSchema` (VariableDeclaration) — `z.ZodObject<{ patch_text: z.ZodString; }, "strict", z.ZodTypeAny, { patch_text: string; }, { patch_text: string; }>`
- `ApplyPatchOutput` (InterfaceDeclaration) — `ApplyPatchOutput`
- `ApplyPatchOutputJsonSchema` (VariableDeclaration) — `import("../index.js").JsonSchema`
- `ApplyPatchOutputSchema` (VariableDeclaration) — `z.ZodObject<{ files: z.ZodArray<z.ZodObject<{ filePath: z.ZodString; type: z.ZodEnum<["add", "update", "delete", "move"]>; movePath: z.ZodOptional<z.ZodString>; structuredPatch: z.ZodArray<z.ZodObject`
- `ApplyPatchToolCall` (InterfaceDeclaration) — `ApplyPatchToolCall`
- `ApplyPatchToolResult` (InterfaceDeclaration) — `ApplyPatchToolResult`

### `tools/ask-user-question.ts`

- `ASK_USER_QUESTION_TOOL_CHIP_WIDTH` (VariableDeclaration) — `12`
- `ASK_USER_QUESTION_TOOL_NAME` (VariableDeclaration) — `"AskUserQuestion"`
- `AskUserQuestion` (TypeAliasDeclaration) — `{ options: { description: string; label: string; preview?: string | undefined; }[]; question: string; header: string; multiSelect: boolean; }`
- `AskUserQuestionAnnotation` (TypeAliasDeclaration) — `{ preview?: string | undefined; notes?: string | undefined; }`
- `AskUserQuestionAnnotationSchema` (VariableDeclaration) — `z.ZodObject<{ preview: z.ZodOptional<z.ZodString>; notes: z.ZodOptional<z.ZodString>; }, "strict", z.ZodTypeAny, { preview?: string | undefined; notes?: string | undefined; }, { preview?: string | und`
- `AskUserQuestionAnsweredInputSchema` (VariableDeclaration) — `z.ZodEffects<z.ZodEffects<z.ZodObject<{ questions: z.ZodArray<z.ZodEffects<z.ZodObject<{ question: z.ZodString; header: z.ZodString; options: z.ZodArray<z.ZodEffects<z.ZodObject<{ label: z.ZodString; `
- `AskUserQuestionInput` (TypeAliasDeclaration) — `{ questions: { options: { description: string; label: string; preview?: string | undefined; }[]; question: string; header: string; multiSelect: boolean; }[]; answers?: Record<string, string> | undefin`
- `AskUserQuestionInputJsonSchema` (VariableDeclaration) — `import("../index.js").JsonSchema`
- `AskUserQuestionInputSchema` (VariableDeclaration) — `z.ZodEffects<z.ZodObject<{ questions: z.ZodArray<z.ZodEffects<z.ZodObject<{ question: z.ZodString; header: z.ZodString; options: z.ZodArray<z.ZodEffects<z.ZodObject<{ label: z.ZodString; description: `
- `AskUserQuestionOption` (TypeAliasDeclaration) — `{ description: string; label: string; preview?: string | undefined; }`
- `AskUserQuestionOptionSchema` (VariableDeclaration) — `z.ZodEffects<z.ZodObject<{ label: z.ZodString; description: z.ZodString; preview: z.ZodOptional<z.ZodString>; }, "strict", z.ZodTypeAny, { description: string; label: string; preview?: string | undefi`
- `AskUserQuestionOutput` (TypeAliasDeclaration) — `{ questions: { options: { description: string; label: string; preview?: string | undefined; }[]; question: string; header: string; multiSelect: boolean; }[]; answers: Record<string, string>; annotatio`
- `AskUserQuestionOutputJsonSchema` (VariableDeclaration) — `import("../index.js").JsonSchema`
- `AskUserQuestionOutputSchema` (VariableDeclaration) — `z.ZodObject<{ questions: z.ZodArray<z.ZodEffects<z.ZodObject<{ question: z.ZodString; header: z.ZodString; options: z.ZodArray<z.ZodEffects<z.ZodObject<{ label: z.ZodString; description: z.ZodString; `
- `AskUserQuestionSchema` (VariableDeclaration) — `z.ZodEffects<z.ZodObject<{ question: z.ZodString; header: z.ZodString; options: z.ZodArray<z.ZodEffects<z.ZodObject<{ label: z.ZodString; description: z.ZodString; preview: z.ZodOptional<z.ZodString>;`

### `tools/automation.ts`

- `CronAutomation` (TypeAliasDeclaration) — `{ prompt: string; automationId: string; title: string; cronExpr: string; enabled: boolean; lifecycleStatus: "completed" | "active" | "failed" | "paused"; runCount: number; recurring: boolean; nextRunA`
- `CronAutomationScheduleRule` (TypeAliasDeclaration) — `{ unit: "minute" | "hourly" | "daily" | "weekly" | "monthly" | "yearly"; minute: number; interval: number; hour: number; anchorAt: number; weekdays?: number[] | undefined; monthDays?: number[] | undef`
- `CronAutomationScheduleRuleSchema` (VariableDeclaration) — `z.ZodObject<{ unit: z.ZodEnum<["minute", "hourly", "daily", "weekly", "monthly", "yearly"]>; interval: z.ZodNumber; hour: z.ZodNumber; minute: z.ZodNumber; anchorAt: z.ZodNumber; weekdays: z.ZodOption`
- `CronAutomationSchema` (VariableDeclaration) — `z.ZodObject<{ automationId: z.ZodString; title: z.ZodString; cronExpr: z.ZodString; prompt: z.ZodString; enabled: z.ZodBoolean; lifecycleStatus: z.ZodEnum<["active", "completed", "failed", "paused"]>;`
- `CronCreateInput` (TypeAliasDeclaration) — `{ prompt: string; title: string; recurring?: boolean | undefined; maxRuns?: number | undefined; interval?: number | undefined; cron?: string | undefined; delayMinutes?: number | null | undefined; inte`
- `CronCreateInputJsonSchema` (VariableDeclaration) — `import("../index.js").JsonSchema`
- `CronCreateInputSchema` (VariableDeclaration) — `z.ZodEffects<z.ZodEffects<z.ZodEffects<z.ZodEffects<z.ZodEffects<z.ZodEffects<z.ZodEffects<z.ZodEffects<z.ZodObject<{ cron: z.ZodOptional<z.ZodString>; delayMinutes: z.ZodOptional<z.ZodNullable<z.ZodN`
- `CronCreateOutput` (TypeAliasDeclaration) — `{ message: string; automation: { prompt: string; automationId: string; title: string; cronExpr: string; enabled: boolean; lifecycleStatus: "completed" | "active" | "failed" | "paused"; runCount: numbe`
- `CronCreateOutputJsonSchema` (VariableDeclaration) — `import("../index.js").JsonSchema`
- `CronCreateOutputSchema` (VariableDeclaration) — `z.ZodObject<{ automation: z.ZodObject<{ automationId: z.ZodString; title: z.ZodString; cronExpr: z.ZodString; prompt: z.ZodString; enabled: z.ZodBoolean; lifecycleStatus: z.ZodEnum<["active", "complet`
- `CronDeleteInput` (TypeAliasDeclaration) — `{ id: string; }`
- `CronDeleteInputJsonSchema` (VariableDeclaration) — `import("../index.js").JsonSchema`
- `CronDeleteInputSchema` (VariableDeclaration) — `z.ZodObject<{ id: z.ZodString; }, "strict", z.ZodTypeAny, { id: string; }, { id: string; }>`
- `CronDeleteOutput` (TypeAliasDeclaration) — `{ message: string; id: string; deleted: boolean; }`
- `CronDeleteOutputJsonSchema` (VariableDeclaration) — `import("../index.js").JsonSchema`
- `CronDeleteOutputSchema` (VariableDeclaration) — `z.ZodObject<{ deleted: z.ZodBoolean; id: z.ZodString; message: z.ZodString; }, "strict", z.ZodTypeAny, { message: string; id: string; deleted: boolean; }, { message: string; id: string; deleted: boole`
- `CronListInput` (TypeAliasDeclaration) — `{}`
- `CronListInputJsonSchema` (VariableDeclaration) — `import("../index.js").JsonSchema`
- `CronListInputSchema` (VariableDeclaration) — `z.ZodObject<{}, "strict", z.ZodTypeAny, {}, {}>`
- `CronListOutput` (TypeAliasDeclaration) — `{ automations: { prompt: string; automationId: string; title: string; cronExpr: string; enabled: boolean; lifecycleStatus: "completed" | "active" | "failed" | "paused"; runCount: number; recurring: bo`
- `CronListOutputJsonSchema` (VariableDeclaration) — `import("../index.js").JsonSchema`
- `CronListOutputSchema` (VariableDeclaration) — `z.ZodObject<{ automations: z.ZodArray<z.ZodObject<{ automationId: z.ZodString; title: z.ZodString; cronExpr: z.ZodString; prompt: z.ZodString; enabled: z.ZodBoolean; lifecycleStatus: z.ZodEnum<["activ`
- `CronUpdateInput` (TypeAliasDeclaration) — `{ title: string; id: string; prompt?: string | undefined; recurring?: boolean | undefined; maxRuns?: number | null | undefined; interval?: number | undefined; cron?: string | undefined; intervalUnit?:`
- `CronUpdateInputJsonSchema` (VariableDeclaration) — `import("../index.js").JsonSchema`
- `CronUpdateInputSchema` (VariableDeclaration) — `z.ZodEffects<z.ZodEffects<z.ZodEffects<z.ZodEffects<z.ZodEffects<z.ZodEffects<z.ZodObject<{ id: z.ZodString; cron: z.ZodOptional<z.ZodString>; prompt: z.ZodOptional<z.ZodString>; title: z.ZodString; r`
- `CronUpdateOutput` (TypeAliasDeclaration) — `{ message: string; automation: { prompt: string; automationId: string; title: string; cronExpr: string; enabled: boolean; lifecycleStatus: "completed" | "active" | "failed" | "paused"; runCount: numbe`
- `CronUpdateOutputJsonSchema` (VariableDeclaration) — `import("../index.js").JsonSchema`
- `CronUpdateOutputSchema` (VariableDeclaration) — `z.ZodObject<{ automation: z.ZodObject<{ automationId: z.ZodString; title: z.ZodString; cronExpr: z.ZodString; prompt: z.ZodString; enabled: z.ZodBoolean; lifecycleStatus: z.ZodEnum<["active", "complet`
- `hasRelativeDelayMinutes` (FunctionDeclaration) — `export function hasRelativeDelayMinutes(input: { delayMinutes?: number | null }): boolean { return typeof input.delayMinutes === "number"; }`

### `tools/bash.ts`

- `BackgroundTask` (InterfaceDeclaration) — `BackgroundTask`
- `BashErrorCode` (VariableDeclaration | TypeAliasDeclaration) — `{ readonly COMMAND_NOT_PARSABLE: "bash_command_not_parsable"; readonly COMMAND_TOO_COMPLEX: "bash_command_too_complex"; readonly COMMAND_INJECTION_RISK: "bash_command_injection_risk"; readonly READONL`
- `BashInput` (TypeAliasDeclaration) — `{ command: string; description?: string | undefined; run_in_background?: boolean | undefined; timeout?: number | undefined; dangerouslyDisableSandbox?: boolean | undefined; }`
- `BashInputJsonSchema` (VariableDeclaration) — `import("../index.js").JsonSchema`
- `BashInputSchema` (VariableDeclaration) — `z.ZodObject<{ command: z.ZodString; timeout: z.ZodOptional<z.ZodEffects<z.ZodNumber, number, unknown>>; description: z.ZodOptional<z.ZodString>; run_in_background: z.ZodOptional<z.ZodEffects<z.ZodBool`
- `BashOutput` (InterfaceDeclaration) — `BashOutput`
- `BashOutputJsonSchema` (VariableDeclaration) — `import("../index.js").JsonSchema`
- `BashOutputSchema` (VariableDeclaration) — `z.ZodObject<{ stdout: z.ZodString; stderr: z.ZodString; status: z.ZodOptional<z.ZodEnum<["completed", "failed", "timed_out", "cancelled", "spawn_error", "backgrounded"]>>; exitCode: z.ZodOptional<z.Zo`
- `BashToolCall` (InterfaceDeclaration) — `BashToolCall`
- `BashToolResult` (InterfaceDeclaration) — `BashToolResult`
- `ShellPermissionPolicy` (InterfaceDeclaration) — `ShellPermissionPolicy`
- `ShellPermissionRule` (TypeAliasDeclaration) — `{ type: "allow" | "deny"; pattern: string; description?: string; }`

### `tools/contract.ts`

- `isWorkspaceMutatingToolCall` (FunctionDeclaration) — `export function isWorkspaceMutatingToolCall(capability: { readOnly?: boolean | undefined; sideEffectScope?: ToolSideEffectScope | undefined; }): boolean { if (capability.readOnly === true) return fals`
- `isWorldTouchingToolCall` (FunctionDeclaration) — `export function isWorldTouchingToolCall(capability: { sideEffectScope?: ToolSideEffectScope | undefined; }): boolean { return capability.sideEffectScope === undefined ? true : !PROTOCOL_ONLY_SIDE_EFFE`
- `NoToolTimeoutPolicy` (InterfaceDeclaration) — `NoToolTimeoutPolicy`
- `ProviderNativeToolSpec` (InterfaceDeclaration) — `ProviderNativeToolSpec`
- `TimedToolTimeoutPolicy` (InterfaceDeclaration) — `TimedToolTimeoutPolicy`
- `ToolCancellationPolicy` (InterfaceDeclaration) — `ToolCancellationPolicy`
- `ToolContractDeclaration` (InterfaceDeclaration) — `ToolContractDeclaration`
- `ToolExecutionMode` (TypeAliasDeclaration) — `"client" | "providerNative"`
- `ToolPermissionPatternSource` (TypeAliasDeclaration) — `"path" | "custom" | "toolName" | "command" | "none" | "input" | "network"`
- `ToolPermissionSpec` (InterfaceDeclaration) — `ToolPermissionSpec`
- `ToolResultBudget` (InterfaceDeclaration) — `ToolResultBudget`
- `ToolResultBudgetStrategy` (TypeAliasDeclaration) — `"inline" | "truncate" | "artifact"`
- `ToolSideEffectScope` (TypeAliasDeclaration) — `"workspace" | "none" | "network" | "git" | "system" | "session" | "userInteraction"`
- `ToolTimeoutPolicy` (TypeAliasDeclaration) — `NoToolTimeoutPolicy | TimedToolTimeoutPolicy`
- `ToolTracePolicy` (InterfaceDeclaration) — `ToolTracePolicy`
- `WORKSPACE_MUTATING_SIDE_EFFECT_SCOPES` (VariableDeclaration) — `ReadonlySet<ToolSideEffectScope>`

### `tools/create-workflow.ts`

- `CREATE_WORKFLOW_ARGS_WITHOUT_PATH_ERROR` (VariableDeclaration) — `"`args`belongs to the`path`source: it carries values for the arguments a script file declares in its`/\* knorvia-workflow`block. For a saved workflow pass`saved.args`; an inline `script` declares`
- `CREATE_WORKFLOW_DISPLAY_MAX_DIAGNOSTICS` (VariableDeclaration) — `100`
- `CREATE_WORKFLOW_DISPLAY_MAX_MESSAGE_CHARS` (VariableDeclaration) — `2048`
- `CREATE_WORKFLOW_GRAPH_MAX_HANDOFF_TYPES` (VariableDeclaration) — `8`
- `CREATE_WORKFLOW_GRAPH_MAX_HANDOFFS` (VariableDeclaration) — `256`
- `CREATE_WORKFLOW_GRAPH_MAX_ID_CHARS` (VariableDeclaration) — `64`
- `CREATE_WORKFLOW_GRAPH_MAX_LANES` (VariableDeclaration) — `32`
- `CREATE_WORKFLOW_GRAPH_MAX_NAME_CHARS` (VariableDeclaration) — `128`
- `CREATE_WORKFLOW_GRAPH_MAX_PARTICIPANTS` (VariableDeclaration) — `64`
- `CREATE_WORKFLOW_GRAPH_MAX_PHASE_EDGES` (VariableDeclaration) — `128`
- `CREATE_WORKFLOW_GRAPH_MAX_PHASES` (VariableDeclaration) — `32`
- `CREATE_WORKFLOW_GRAPH_MAX_STEPS` (VariableDeclaration) — `64`
- `CREATE_WORKFLOW_SOURCE_ERROR` (VariableDeclaration) — `"Provide exactly one workflow source: `script`for a one-off script written inline,`saved`to run a workflow saved in this project, or`path` for a script file on disk (the file a previous result nam`
- `CREATE_WORKFLOW_STEP_KINDS` (VariableDeclaration) — `readonly ["ask", "world-read"]`
- `CREATE_WORKFLOW_TOOL_NAME` (VariableDeclaration) — `"CreateWorkflow"`
- `CreateWorkflowCausalityGraph` (TypeAliasDeclaration) — `{ lanes: { id: string; name?: string | undefined; line?: number | undefined; column?: number | undefined; namePattern?: { head?: string | undefined; tail?: string | undefined; } | undefined; }[]; step`
- `CreateWorkflowCausalityGraphSchema` (VariableDeclaration) — `z.ZodObject<{ steps: z.ZodArray<z.ZodObject<{ id: z.ZodString; kind: z.ZodEnum<["ask", "world-read"]>; label: z.ZodString; labelPattern: z.ZodOptional<z.ZodObject<{ head: z.ZodOptional<z.ZodString>; t`
- `CreateWorkflowDiagnostic` (TypeAliasDeclaration) — `{ code: number; message: string; line: number; column: number; }`
- `CreateWorkflowDiagnosticSchema` (VariableDeclaration) — `z.ZodObject<{ code: z.ZodNumber; column: z.ZodNumber; line: z.ZodNumber; message: z.ZodString; }, "strict", z.ZodTypeAny, { code: number; message: string; line: number; column: number; }, { code: numb`
- `CreateWorkflowEdge` (TypeAliasDeclaration) — `{ from: string; to: string; back?: true | undefined; }`
- `CreateWorkflowEdgeSchema` (VariableDeclaration) — `z.ZodObject<{ from: z.ZodString; to: z.ZodString; back: z.ZodOptional<z.ZodLiteral<true>>; }, "strict", z.ZodTypeAny, { from: string; to: string; back?: true | undefined; }, { from: string; to: string`
- `CreateWorkflowHandoff` (TypeAliasDeclaration) — `{ from: string; to: string; back?: true | undefined; types?: string[] | undefined; }`
- `CreateWorkflowHandoffSchema` (VariableDeclaration) — `z.ZodObject<{ from: z.ZodString; to: z.ZodString; back: z.ZodOptional<z.ZodLiteral<true>>; } & { types: z.ZodOptional<z.ZodArray<z.ZodString, "many">>; }, "strict", z.ZodTypeAny, { from: string; to: s`
- `CreateWorkflowInput` (TypeAliasDeclaration) — `{ path?: string | undefined; script?: string | undefined; name?: string | undefined; max_concurrency?: number | undefined; subagent_model?: string | undefined; script_line_offset?: number | undefined;`
- `CreateWorkflowInputJsonSchema` (VariableDeclaration) — `import("../index.js").JsonSchema`
- `CreateWorkflowInputSchema` (VariableDeclaration) — `z.ZodObject<{ name: z.ZodOptional<z.ZodString>; script: z.ZodOptional<z.ZodString>; path: z.ZodOptional<z.ZodString>; args: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodUnknown>>; max_concurrency: z.Zo`
- `CreateWorkflowLane` (TypeAliasDeclaration) — `{ id: string; name?: string | undefined; line?: number | undefined; column?: number | undefined; namePattern?: { head?: string | undefined; tail?: string | undefined; } | undefined; }`
- `CreateWorkflowLaneSchema` (VariableDeclaration) — `z.ZodObject<{ id: z.ZodString; name: z.ZodOptional<z.ZodString>; namePattern: z.ZodOptional<z.ZodObject<{ head: z.ZodOptional<z.ZodString>; tail: z.ZodOptional<z.ZodString>; }, "strict", z.ZodTypeAny,`
- `CreateWorkflowNamePattern` (TypeAliasDeclaration) — `{ head?: string | undefined; tail?: string | undefined; }`
- `CreateWorkflowNamePatternSchema` (VariableDeclaration) — `z.ZodObject<{ head: z.ZodOptional<z.ZodString>; tail: z.ZodOptional<z.ZodString>; }, "strict", z.ZodTypeAny, { head?: string | undefined; tail?: string | undefined; }, { head?: string | undefined; tai`
- `CreateWorkflowOutput` (TypeAliasDeclaration) — `{ diagnostics: { code: number; message: string; line: number; column: number; }[]; ok: boolean; response: string; status?: "backgrounded" | undefined; backgroundTaskId?: string | undefined; causalityG`
- `CreateWorkflowOutputJsonSchema` (VariableDeclaration) — `import("../index.js").JsonSchema`
- `CreateWorkflowOutputSchema` (VariableDeclaration) — `z.ZodObject<{ diagnostics: z.ZodArray<z.ZodObject<{ code: z.ZodNumber; column: z.ZodNumber; line: z.ZodNumber; message: z.ZodString; }, "strict", z.ZodTypeAny, { code: number; message: string; line: n`
- `CreateWorkflowParticipant` (TypeAliasDeclaration) — `{ id: string; lane: string; phase: string; steps: string[]; many?: true | undefined; member?: { index: number; of: number; } | undefined; }`
- `CreateWorkflowParticipantSchema` (VariableDeclaration) — `z.ZodObject<{ id: z.ZodString; phase: z.ZodString; lane: z.ZodString; steps: z.ZodArray<z.ZodString, "many">; member: z.ZodOptional<z.ZodObject<{ index: z.ZodNumber; of: z.ZodNumber; }, "strict", z.Zo`
- `CreateWorkflowPhase` (TypeAliasDeclaration) — `{ id: string; name?: string | undefined; line?: number | undefined; column?: number | undefined; alongside?: string[] | undefined; }`
- `createWorkflowPhaseAlongside` (FunctionDeclaration) — `export function createWorkflowPhaseAlongside( graph: Pick<CreateWorkflowCausalityGraph, "phases"> | undefined, ): number[][] | undefined { const named = namedPhases(graph); if (named === undefined) re`
- `createWorkflowPhaseNames` (FunctionDeclaration) — `export function createWorkflowPhaseNames( graph: Pick<CreateWorkflowCausalityGraph, "phases"> | undefined, ): string[] | undefined { return namedPhases(graph)?.map((phase) => phase.name); }`
- `CreateWorkflowPhaseSchema` (VariableDeclaration) — `z.ZodObject<{ id: z.ZodString; name: z.ZodOptional<z.ZodString>; line: z.ZodOptional<z.ZodNumber>; column: z.ZodOptional<z.ZodNumber>; alongside: z.ZodOptional<z.ZodArray<z.ZodString, "many">>; }, "st`
- `CreateWorkflowResolvedSavedSource` (TypeAliasDeclaration) — `{ name: string; scope?: "project" | "global" | undefined; path?: string | undefined; args?: Record<string, unknown> | undefined; draft?: string | undefined; }`
- `CreateWorkflowResolvedSavedSourceSchema` (VariableDeclaration) — `z.ZodObject<{ name: z.ZodString; args: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodUnknown>>; path: z.ZodOptional<z.ZodString>; scope: z.ZodOptional<z.ZodEnum<["project", "global"]>>; } & { draft: z.Z`
- `CreateWorkflowSavedSource` (TypeAliasDeclaration) — `{ name: string; scope?: "project" | "global" | undefined; path?: string | undefined; args?: Record<string, unknown> | undefined; }`
- `CreateWorkflowSavedSourceSchema` (VariableDeclaration) — `z.ZodObject<{ name: z.ZodString; args: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodUnknown>>; path: z.ZodOptional<z.ZodString>; scope: z.ZodOptional<z.ZodEnum<["project", "global"]>>; }, "strict", z.Z`
- `CreateWorkflowStep` (TypeAliasDeclaration) — `{ kind: "ask" | "world-read"; label: string; id: string; lane: string; source?: string | undefined; labelPattern?: { head?: string | undefined; tail?: string | undefined; } | undefined; line?: number `
- `CreateWorkflowStepSchema` (VariableDeclaration) — `z.ZodObject<{ id: z.ZodString; kind: z.ZodEnum<["ask", "world-read"]>; label: z.ZodString; labelPattern: z.ZodOptional<z.ZodObject<{ head: z.ZodOptional<z.ZodString>; tail: z.ZodOptional<z.ZodString>;`
- `createWorkflowToolResultDisplayDiagnosticSchema` (VariableDeclaration) — `z.ZodObject<{ line: z.ZodNumber; column: z.ZodNumber; code: z.ZodNumber; message: z.ZodString; }, "strict", z.ZodTypeAny, { code: number; message: string; line: number; column: number; }, { code: numb`

### `tools/edit.ts`

- `DiffHunk` (InterfaceDeclaration) — `DiffHunk`
- `EditDiffHunkSchema` (VariableDeclaration) — `z.ZodObject<{ oldStart: z.ZodNumber; oldLines: z.ZodNumber; newStart: z.ZodNumber; newLines: z.ZodNumber; lines: z.ZodArray<z.ZodString, "many">; }, "strict", z.ZodTypeAny, { oldStart: number; oldLine`
- `EditErrorCode` (VariableDeclaration | TypeAliasDeclaration) — `{ readonly NO_CHANGE: 1; readonly FILE_EXISTS_NO_OLD_STRING: 3; readonly FILE_NOT_EXIST: 4; readonly NOTEBOOK_FILE: 5; readonly FILE_NOT_READ: 6; readonly STALE_FILE: 7; readonly OLD_STRING_NOT_FOUND:`
- `EditGitDiffSchema` (VariableDeclaration) — `z.ZodObject<{ filename: z.ZodString; status: z.ZodEnum<["modified", "added"]>; additions: z.ZodNumber; deletions: z.ZodNumber; changes: z.ZodNumber; patch: z.ZodString; repository: z.ZodOptional<z.Zod`
- `EditInput` (TypeAliasDeclaration) — `{ file_path: string; old_string: string; new_string: string; replace_all: boolean; }`
- `EditInputJsonSchema` (VariableDeclaration) — `import("../index.js").JsonSchema`
- `EditInputSchema` (VariableDeclaration) — `z.ZodObject<{ file_path: z.ZodString; old_string: z.ZodString; new_string: z.ZodString; replace_all: z.ZodDefault<z.ZodOptional<z.ZodEffects<z.ZodBoolean, boolean, unknown>>>; }, "strip", z.ZodTypeAny`
- `EditOutput` (InterfaceDeclaration) — `EditOutput`
- `EditOutputJsonSchema` (VariableDeclaration) — `import("../index.js").JsonSchema`
- `EditOutputSchema` (VariableDeclaration) — `z.ZodObject<{ filePath: z.ZodString; oldString: z.ZodString; newString: z.ZodString; originalFile: z.ZodString; structuredPatch: z.ZodArray<z.ZodObject<{ oldStart: z.ZodNumber; oldLines: z.ZodNumber; `
- `EditToolCall` (InterfaceDeclaration) — `EditToolCall`
- `EditToolResult` (InterfaceDeclaration) — `EditToolResult`
- `GitDiff` (InterfaceDeclaration) — `GitDiff`

### `tools/escalate.ts`

- `ESCALATE_TOOL_NAME` (VariableDeclaration) — `"escalate"`
- `EscalateInput` (TypeAliasDeclaration) — `{ question: string; context?: string | undefined; }`
- `EscalateInputJsonSchema` (VariableDeclaration) — `import("../index.js").JsonSchema`
- `EscalateInputSchema` (VariableDeclaration) — `z.ZodObject<{ question: z.ZodString; context: z.ZodOptional<z.ZodString>; }, "strict", z.ZodTypeAny, { question: string; context?: string | undefined; }, { question: string; context?: string | undefin`
- `EscalateOutput` (TypeAliasDeclaration) — `{ status: "answered" | "refused"; message: string; reason?: "budget_exhausted" | "no_active_ask" | undefined; qid?: string | undefined; }`
- `EscalateOutputJsonSchema` (VariableDeclaration) — `import("../index.js").JsonSchema`
- `EscalateOutputSchema` (VariableDeclaration) — `z.ZodObject<{ status: z.ZodEnum<["answered", "refused"]>; message: z.ZodString; qid: z.ZodOptional<z.ZodString>; reason: z.ZodOptional<z.ZodEnum<["budget_exhausted", "no_active_ask"]>>; }, "strict", z`

### `tools/eval-workflow-snippet.ts`

- `EVAL_WORKFLOW_SNIPPET_DEFAULT_TIMEOUT_MS` (VariableDeclaration) — `60000`
- `EVAL_WORKFLOW_SNIPPET_MAX_ARTIFACT_BYTES` (VariableDeclaration) — `number`
- `EVAL_WORKFLOW_SNIPPET_MAX_LOG_CHARS` (VariableDeclaration) — `2048`
- `EVAL_WORKFLOW_SNIPPET_MAX_LOGS` (VariableDeclaration) — `100`
- `EVAL_WORKFLOW_SNIPPET_MAX_TIMEOUT_MS` (VariableDeclaration) — `600000`
- `EVAL_WORKFLOW_SNIPPET_MIN_TIMEOUT_MS` (VariableDeclaration) — `1000`
- `EVAL_WORKFLOW_SNIPPET_SOURCE_ERROR` (VariableDeclaration) — `"Provide exactly one snippet source: `code`for the snippet inline, or`path` for a file holding it. Passing both, or neither, is ambiguous."`
- `EVAL_WORKFLOW_SNIPPET_TOOL_NAME` (VariableDeclaration) — `"EvalWorkflowSnippet"`
- `EvalWorkflowSnippetInput` (TypeAliasDeclaration) — `{ code?: string | undefined; path?: string | undefined; timeoutMs?: number | undefined; }`
- `EvalWorkflowSnippetInputJsonSchema` (VariableDeclaration) — `import("../index.js").JsonSchema`
- `EvalWorkflowSnippetInputSchema` (VariableDeclaration) — `z.ZodObject<{ code: z.ZodOptional<z.ZodString>; path: z.ZodOptional<z.ZodString>; timeoutMs: z.ZodOptional<z.ZodNumber>; }, "strict", z.ZodTypeAny, { code?: string | undefined; path?: string | undefin`
- `EvalWorkflowSnippetOutput` (TypeAliasDeclaration) — `{ diagnostics: { code: number; message: string; line: number; column: number; }[]; ok: boolean; response: string; logs: string[]; durationMs: number; }`
- `EvalWorkflowSnippetOutputJsonSchema` (VariableDeclaration) — `import("../index.js").JsonSchema`
- `EvalWorkflowSnippetOutputSchema` (VariableDeclaration) — `z.ZodObject<{ ok: z.ZodBoolean; diagnostics: z.ZodArray<z.ZodObject<{ code: z.ZodNumber; column: z.ZodNumber; line: z.ZodNumber; message: z.ZodString; }, "strict", z.ZodTypeAny, { code: number; messag`

### `tools/get-workflow-run-roster.ts`

- `GET_WORKFLOW_RUN_ROSTER_LIMITS` (VariableDeclaration) — `{ readonly maxPhases: 32; readonly maxPhaseNameLength: 128; readonly maxSubagents: 64; readonly maxActorNameLength: 128; readonly maxInstructionsHeadLength: 240; readonly maxLastToolNameLength: 64; re`
- `GetWorkflowRunConcurrencyHealthSchema` (VariableDeclaration) — `z.ZodObject<{ effective: z.ZodNumber; cap: z.ZodNumber; reason: z.ZodOptional<z.ZodString>; since: z.ZodOptional<z.ZodNumber>; }, "strict", z.ZodTypeAny, { effective: number; cap: number; reason?: str`
- `GetWorkflowRunHealth` (TypeAliasDeclaration) — `{ consecutiveFailures: number; cachedSteps: number; pendingQuestionsKnown: boolean; lastProgressAt?: number | undefined; stalledSince?: number | undefined; concurrency?: { effective: number; cap: numb`
- `GetWorkflowRunHealthSchema` (VariableDeclaration) — `z.ZodObject<{ lastProgressAt: z.ZodOptional<z.ZodNumber>; stalledSince: z.ZodOptional<z.ZodNumber>; concurrency: z.ZodOptional<z.ZodObject<{ effective: z.ZodNumber; cap: z.ZodNumber; reason: z.ZodOpti`
- `GetWorkflowRunPhase` (TypeAliasDeclaration) — `{ name: string; state: "done" | "current" | "ahead" | "unfinished"; rounds: number; nodesSettled: number; nodesRunning: number; enteredAt?: number | undefined; exitedAt?: number | undefined; }`
- `GetWorkflowRunPhaseSchema` (VariableDeclaration) — `z.ZodObject<{ name: z.ZodString; state: z.ZodEnum<["done", "current", "ahead", "unfinished"]>; rounds: z.ZodNumber; nodesSettled: z.ZodNumber; nodesRunning: z.ZodNumber; enteredAt: z.ZodOptional<z.Zod`
- `GetWorkflowRunSubagent` (TypeAliasDeclaration) — `{ state: "failed" | "done" | "unfinished" | "idle" | "executing" | "waiting" | "parked"; siteId: string; ordinal: number; stepsSettled: number; stepsFailed: number; tokens: number; name?: string | und`
- `GetWorkflowRunSubagentAsk` (TypeAliasDeclaration) — `{ siteId: string; ordinal: number; actorSeq?: number | undefined; instructionsHead?: string | undefined; startedAt?: number | undefined; turn?: number | undefined; toolCalls?: number | undefined; last`
- `GetWorkflowRunSubagentAskSchema` (VariableDeclaration) — `z.ZodObject<{ siteId: z.ZodString; ordinal: z.ZodNumber; actorSeq: z.ZodOptional<z.ZodNumber>; instructionsHead: z.ZodOptional<z.ZodString>; startedAt: z.ZodOptional<z.ZodNumber>; turn: z.ZodOptional<`
- `GetWorkflowRunSubagentLastToolSchema` (VariableDeclaration) — `z.ZodObject<{ name: z.ZodString; target: z.ZodOptional<z.ZodString>; at: z.ZodOptional<z.ZodNumber>; }, "strict", z.ZodTypeAny, { name: string; at?: number | undefined; target?: string | undefined; },`
- `GetWorkflowRunSubagentSchema` (VariableDeclaration) — `z.ZodObject<{ siteId: z.ZodString; ordinal: z.ZodNumber; name: z.ZodOptional<z.ZodString>; state: z.ZodEnum<["idle", "executing", "waiting", "parked", "done", "failed", "unfinished"]>; phaseName: z.Zo`
- `GetWorkflowRunSubagentWaitSchema` (VariableDeclaration) — `z.ZodObject<{ cause: z.ZodEnum<["slot", "backoff"]>; reason: z.ZodOptional<z.ZodString>; retryAfterMs: z.ZodOptional<z.ZodNumber>; since: z.ZodOptional<z.ZodNumber>; }, "strict", z.ZodTypeAny, { cause`

### `tools/get-workflow-run.ts`

- `GET_WORKFLOW_RUN_ROSTER_LIMITS` (VariableDeclaration) — `{ readonly maxPhases: 32; readonly maxPhaseNameLength: 128; readonly maxSubagents: 64; readonly maxActorNameLength: 128; readonly maxInstructionsHeadLength: 240; readonly maxLastToolNameLength: 64; re`
- `GET_WORKFLOW_RUN_SUMMARY_MAX_CHARS` (VariableDeclaration) — `400`
- `GET_WORKFLOW_RUN_TOOL_NAME` (VariableDeclaration) — `"GetWorkflowRun"`
- `GetWorkflowRunActorSchema` (VariableDeclaration) — `z.ZodObject<{ siteId: z.ZodString; ordinal: z.ZodNumber; name: z.ZodOptional<z.ZodString>; }, "strict", z.ZodTypeAny, { siteId: string; ordinal: number; name?: string | undefined; }, { siteId: string;`
- `GetWorkflowRunArtifactSchema` (VariableDeclaration) — `z.ZodObject<{ id: z.ZodString; kind: z.ZodEnum<["file", "markdown", "chart", "table", "metrics", "board"]>; title: z.ZodOptional<z.ZodString>; version: z.ZodNumber; contentType: z.ZodOptional<z.ZodStr`
- `GetWorkflowRunConcurrencyHealthSchema` (VariableDeclaration) — `z.ZodObject<{ effective: z.ZodNumber; cap: z.ZodNumber; reason: z.ZodOptional<z.ZodString>; since: z.ZodOptional<z.ZodNumber>; }, "strict", z.ZodTypeAny, { effective: number; cap: number; reason?: str`
- `GetWorkflowRunErrorSchema` (VariableDeclaration) — `z.ZodObject<{ code: z.ZodString; message: z.ZodString; providerStop: z.ZodOptional<z.ZodObject<{ kind: z.ZodEnum<["auth", "not_configured", "model_unavailable", "invalid_request", "quota", "other"]>; `
- `GetWorkflowRunHealth` (TypeAliasDeclaration) — `{ consecutiveFailures: number; cachedSteps: number; pendingQuestionsKnown: boolean; lastProgressAt?: number | undefined; stalledSince?: number | undefined; concurrency?: { effective: number; cap: numb`
- `GetWorkflowRunHealthSchema` (VariableDeclaration) — `z.ZodObject<{ lastProgressAt: z.ZodOptional<z.ZodNumber>; stalledSince: z.ZodOptional<z.ZodNumber>; concurrency: z.ZodOptional<z.ZodObject<{ effective: z.ZodNumber; cap: z.ZodNumber; reason: z.ZodOpti`
- `GetWorkflowRunInput` (TypeAliasDeclaration) — `{ run_id: string; }`
- `GetWorkflowRunInputJsonSchema` (VariableDeclaration) — `import("../index.js").JsonSchema`
- `GetWorkflowRunInputSchema` (VariableDeclaration) — `z.ZodObject<{ run_id: z.ZodString; }, "strict", z.ZodTypeAny, { run_id: string; }, { run_id: string; }>`
- `GetWorkflowRunLogEntrySchema` (VariableDeclaration) — `z.ZodObject<{ sequence: z.ZodNumber; message: z.ZodString; at: z.ZodOptional<z.ZodNumber>; }, "strict", z.ZodTypeAny, { message: string; sequence: number; at?: number | undefined; }, { message: string`
- `GetWorkflowRunOutput` (TypeAliasDeclaration) — `{ status: "completed" | "errored" | "pending" | "running" | "stopped"; createdAt: number; usage: { nodesRunning: number; spentTokens: number; nodesObserved: number; nodesCompleted: number; nodesFailed`
- `GetWorkflowRunOutputJsonSchema` (VariableDeclaration) — `import("../index.js").JsonSchema`
- `GetWorkflowRunOutputSchema` (VariableDeclaration) — `z.ZodObject<{ runId: z.ZodString; label: z.ZodString; labelSource: z.ZodEnum<["name", "script"]>; status: z.ZodEnum<["completed", "errored", "pending", "running", "stopped"]>; stopReason: z.ZodOptiona`
- `GetWorkflowRunPendingQuestionSchema` (VariableDeclaration) — `z.ZodObject<{ qid: z.ZodString; actor: z.ZodString; actorName: z.ZodOptional<z.ZodString>; question: z.ZodString; context: z.ZodOptional<z.ZodString>; askedAt: z.ZodNumber; }, "strict", z.ZodTypeAny, `
- `GetWorkflowRunPhase` (TypeAliasDeclaration) — `{ name: string; state: "done" | "current" | "ahead" | "unfinished"; rounds: number; nodesSettled: number; nodesRunning: number; enteredAt?: number | undefined; exitedAt?: number | undefined; }`
- `GetWorkflowRunPhaseSchema` (VariableDeclaration) — `z.ZodObject<{ name: z.ZodString; state: z.ZodEnum<["done", "current", "ahead", "unfinished"]>; rounds: z.ZodNumber; nodesSettled: z.ZodNumber; nodesRunning: z.ZodNumber; enteredAt: z.ZodOptional<z.Zod`
- `GetWorkflowRunSubagent` (TypeAliasDeclaration) — `{ state: "failed" | "done" | "unfinished" | "idle" | "executing" | "waiting" | "parked"; siteId: string; ordinal: number; stepsSettled: number; stepsFailed: number; tokens: number; name?: string | und`
- `GetWorkflowRunSubagentAsk` (TypeAliasDeclaration) — `{ siteId: string; ordinal: number; actorSeq?: number | undefined; instructionsHead?: string | undefined; startedAt?: number | undefined; turn?: number | undefined; toolCalls?: number | undefined; last`
- `GetWorkflowRunSubagentAskSchema` (VariableDeclaration) — `z.ZodObject<{ siteId: z.ZodString; ordinal: z.ZodNumber; actorSeq: z.ZodOptional<z.ZodNumber>; instructionsHead: z.ZodOptional<z.ZodString>; startedAt: z.ZodOptional<z.ZodNumber>; turn: z.ZodOptional<`
- `GetWorkflowRunSubagentLastToolSchema` (VariableDeclaration) — `z.ZodObject<{ name: z.ZodString; target: z.ZodOptional<z.ZodString>; at: z.ZodOptional<z.ZodNumber>; }, "strict", z.ZodTypeAny, { name: string; at?: number | undefined; target?: string | undefined; },`
- `GetWorkflowRunSubagentSchema` (VariableDeclaration) — `z.ZodObject<{ siteId: z.ZodString; ordinal: z.ZodNumber; name: z.ZodOptional<z.ZodString>; state: z.ZodEnum<["idle", "executing", "waiting", "parked", "done", "failed", "unfinished"]>; phaseName: z.Zo`
- `GetWorkflowRunSubagentWaitSchema` (VariableDeclaration) — `z.ZodObject<{ cause: z.ZodEnum<["slot", "backoff"]>; reason: z.ZodOptional<z.ZodString>; retryAfterMs: z.ZodOptional<z.ZodNumber>; since: z.ZodOptional<z.ZodNumber>; }, "strict", z.ZodTypeAny, { cause`
- `GetWorkflowRunUsageSchema` (VariableDeclaration) — `z.ZodObject<{ spentTokens: z.ZodNumber; nodesObserved: z.ZodNumber; nodesRunning: z.ZodNumber; nodesCompleted: z.ZodNumber; nodesFailed: z.ZodNumber; }, "strict", z.ZodTypeAny, { nodesRunning: number;`

### `tools/glob.ts`

- `GlobErrorCode` (VariableDeclaration | TypeAliasDeclaration) — `{ readonly INVALID_PATTERN: "glob_invalid_pattern"; readonly INVALID_PATH: "glob_invalid_path"; readonly PERMISSION_DENIED: "glob_permission_denied"; readonly IO_ERROR: "glob_io_error"; }`
- `GlobInput` (TypeAliasDeclaration) — `{ pattern: string; path?: string | undefined; }`
- `GlobInputJsonSchema` (VariableDeclaration) — `import("../index.js").JsonSchema`
- `GlobInputSchema` (VariableDeclaration) — `z.ZodObject<{ pattern: z.ZodString; path: z.ZodOptional<z.ZodString>; }, "strip", z.ZodTypeAny, { pattern: string; path?: string | undefined; }, { pattern: string; path?: string | undefined; }>`
- `GlobOutput` (InterfaceDeclaration) — `GlobOutput`
- `GlobOutputJsonSchema` (VariableDeclaration) — `import("../index.js").JsonSchema`
- `GlobOutputSchema` (VariableDeclaration) — `z.ZodObject<{ durationMs: z.ZodNumber; numFiles: z.ZodNumber; filenames: z.ZodArray<z.ZodString, "many">; truncated: z.ZodBoolean; }, "strict", z.ZodTypeAny, { truncated: boolean; durationMs: number; `
- `GlobToolCall` (InterfaceDeclaration) — `GlobToolCall`
- `GlobToolResult` (InterfaceDeclaration) — `GlobToolResult`

### `tools/grep.ts`

- `GrepErrorCode` (VariableDeclaration | TypeAliasDeclaration) — `{ readonly INVALID_PATTERN: "grep_invalid_pattern"; readonly INVALID_PATH: "grep_invalid_path"; readonly PERMISSION_DENIED: "grep_permission_denied"; readonly TOO_LARGE: "grep_too_large"; readonly CAN`
- `GrepInput` (TypeAliasDeclaration) — `{ pattern: string; path?: string | undefined; type?: string | undefined; context?: number | undefined; glob?: string | undefined; output_mode?: "content" | "count" | "files_with_matches" | undefined; `
- `GrepInputJsonSchema` (VariableDeclaration) — `import("../index.js").JsonSchema`
- `GrepInputSchema` (VariableDeclaration) — `z.ZodObject<{ pattern: z.ZodString; path: z.ZodOptional<z.ZodString>; glob: z.ZodOptional<z.ZodString>; output_mode: z.ZodOptional<z.ZodEnum<["content", "files_with_matches", "count"]>>; "-B": z.ZodOp`
- `GrepOutput` (InterfaceDeclaration) — `GrepOutput`
- `GrepOutputJsonSchema` (VariableDeclaration) — `import("../index.js").JsonSchema`
- `GrepOutputMode` (VariableDeclaration | TypeAliasDeclaration) — `{ readonly Content: "content"; readonly FilesWithMatches: "files_with_matches"; readonly Count: "count"; }`
- `GrepOutputSchema` (VariableDeclaration) — `z.ZodObject<{ mode: z.ZodEnum<["content", "files_with_matches", "count"]>; durationMs: z.ZodNumber; numFiles: z.ZodNumber; filenames: z.ZodArray<z.ZodString, "many">; content: z.ZodOptional<z.ZodStrin`
- `GrepToolCall` (InterfaceDeclaration) — `GrepToolCall`
- `GrepToolResult` (InterfaceDeclaration) — `GrepToolResult`

### `tools/index.ts`

- `AgentBackgroundedOutput` (InterfaceDeclaration) — `AgentBackgroundedOutput`
- `AgentBackgroundedOutputSchema` (VariableDeclaration) — `z.ZodObject<{ status: z.ZodLiteral<"async_launched">; isAsync: z.ZodLiteral<true>; agentId: z.ZodString; agentType: z.ZodString; description: z.ZodString; prompt: z.ZodString; childSessionId: z.ZodStr`
- `AgentCompletedOutput` (InterfaceDeclaration) — `AgentCompletedOutput`
- `AgentCompletedOutputSchema` (VariableDeclaration) — `z.ZodObject<{ status: z.ZodLiteral<"completed">; agentId: z.ZodString; agentType: z.ZodString; description: z.ZodString; prompt: z.ZodString; content: z.ZodArray<z.ZodObject<{ type: z.ZodLiteral<"text`
- `AgentErrorCode` (VariableDeclaration | TypeAliasDeclaration) — `{ readonly SUBAGENT_UNAVAILABLE: "agent_subagent_unavailable"; readonly BACKGROUND_UNAVAILABLE: "agent_background_unavailable"; readonly UNKNOWN_AGENT_TYPE: "agent_unknown_type"; readonly CHILD_RUNTIM`
- `AgentInput` (TypeAliasDeclaration) — `{ description: string; prompt: string; subagent_type?: string | undefined; run_in_background?: boolean | undefined; }`
- `AgentInputJsonSchema` (VariableDeclaration) — `import("../model/index.js").JsonSchema`
- `AgentInputSchema` (VariableDeclaration) — `z.ZodObject<{ description: z.ZodString; prompt: z.ZodString; subagent_type: z.ZodOptional<z.ZodString>; run_in_background: z.ZodOptional<z.ZodBoolean>; }, "strip", z.ZodTypeAny, { description: string;`
- `AgentOutput` (TypeAliasDeclaration) — `AgentBackgroundedOutput | AgentCompletedOutput`
- `AgentOutputJsonSchema` (VariableDeclaration) — `import("../model/index.js").JsonSchema`
- `AgentOutputSchema` (VariableDeclaration) — `z.ZodUnion<[z.ZodObject<{ status: z.ZodLiteral<"completed">; agentId: z.ZodString; agentType: z.ZodString; description: z.ZodString; prompt: z.ZodString; content: z.ZodArray<z.ZodObject<{ type: z.ZodL`
- `AgentTextContentBlock` (InterfaceDeclaration) — `AgentTextContentBlock`
- `AgentTextContentBlockSchema` (VariableDeclaration) — `z.ZodObject<{ type: z.ZodLiteral<"text">; text: z.ZodString; }, "strict", z.ZodTypeAny, { type: "text"; text: string; }, { type: "text"; text: string; }>`
- `AgentToolCall` (InterfaceDeclaration) — `AgentToolCall`
- `AgentToolResult` (InterfaceDeclaration) — `AgentToolResult`
- `AgentType` (VariableDeclaration | TypeAliasDeclaration) — `{ readonly GeneralPurpose: "general-purpose"; readonly Explore: "Explore"; }`
- `AMEND_WORKFLOW_SOURCE_ERROR` (VariableDeclaration) — `"Provide at most one revised script: `path`for the script file you edited (the usual form), or`script` for the whole revised script inline. Passing both is ambiguous; omit both to keep the predecess`
- `AMEND_WORKFLOW_TOOL_NAME` (VariableDeclaration) — `"AmendWorkflow"`
- `AmendWorkflowInput` (TypeAliasDeclaration) — `{ run_id: string; path?: string | undefined; script?: string | undefined; name?: string | undefined; max_concurrency?: number | null | undefined; subagent_model?: string | null | undefined; predecesso`
- `AmendWorkflowInputJsonSchema` (VariableDeclaration) — `import("../index.js").JsonSchema`
- `AmendWorkflowInputSchema` (VariableDeclaration) — `z.ZodObject<{ run_id: z.ZodString; script: z.ZodOptional<z.ZodString>; path: z.ZodOptional<z.ZodString>; name: z.ZodOptional<z.ZodString>; max_concurrency: z.ZodOptional<z.ZodNullable<z.ZodNumber>>; s`
- `AmendWorkflowPredecessor` (TypeAliasDeclaration) — `{ status: "completed" | "errored" | "pending" | "running" | "stopped"; owned_by_this_session: boolean; name?: string | undefined; stop_reason?: "user" | "model" | "provider" | "interrupted" | "superse`
- `AmendWorkflowPredecessorSchema` (VariableDeclaration) — `z.ZodObject<{ name: z.ZodOptional<z.ZodString>; status: z.ZodEnum<["completed", "errored", "pending", "running", "stopped"]>; stop_reason: z.ZodOptional<z.ZodEnum<["user", "model", "provider", "interr`
- `ApplicationIconLocator` (TypeAliasDeclaration) — `{ value: string; kind: "darwin-bundle-id"; } | { value: string; kind: "windows-executable-path"; } | { value: string; kind: "windows-aumid"; }`
- `applicationIconLocatorSchema` (VariableDeclaration) — `z.ZodDiscriminatedUnion<"kind", [z.ZodObject<{ kind: z.ZodLiteral<"darwin-bundle-id">; value: z.ZodString; }, "strict", z.ZodTypeAny, { value: string; kind: "darwin-bundle-id"; }, { value: string; kin`
- `ApplyPatchErrorCode` (VariableDeclaration | TypeAliasDeclaration) — `{ readonly INVALID_PATCH: "apply_patch_invalid_patch"; readonly EMPTY_PATCH: "apply_patch_empty_patch"; readonly FILE_NOT_EXIST: "apply_patch_file_not_exist"; readonly FILE_EXISTS: "apply_patch_file_e`
- `ApplyPatchFileChange` (InterfaceDeclaration) — `ApplyPatchFileChange`
- `ApplyPatchFileChangeSchema` (VariableDeclaration) — `z.ZodObject<{ filePath: z.ZodString; type: z.ZodEnum<["add", "update", "delete", "move"]>; movePath: z.ZodOptional<z.ZodString>; structuredPatch: z.ZodArray<z.ZodObject<{ oldStart: z.ZodNumber; oldLin`
- `ApplyPatchInput` (TypeAliasDeclaration) — `{ patch_text: string; }`
- `ApplyPatchInputJsonSchema` (VariableDeclaration) — `import("../index.js").JsonSchema`
- `ApplyPatchInputSchema` (VariableDeclaration) — `z.ZodObject<{ patch_text: z.ZodString; }, "strict", z.ZodTypeAny, { patch_text: string; }, { patch_text: string; }>`
- `ApplyPatchOutput` (InterfaceDeclaration) — `ApplyPatchOutput`
- `ApplyPatchOutputJsonSchema` (VariableDeclaration) — `import("../index.js").JsonSchema`
- `ApplyPatchOutputSchema` (VariableDeclaration) — `z.ZodObject<{ files: z.ZodArray<z.ZodObject<{ filePath: z.ZodString; type: z.ZodEnum<["add", "update", "delete", "move"]>; movePath: z.ZodOptional<z.ZodString>; structuredPatch: z.ZodArray<z.ZodObject`
- `ApplyPatchToolCall` (InterfaceDeclaration) — `ApplyPatchToolCall`
- `ApplyPatchToolResult` (InterfaceDeclaration) — `ApplyPatchToolResult`
- `ASK_USER_QUESTION_TOOL_CHIP_WIDTH` (VariableDeclaration) — `12`
- `ASK_USER_QUESTION_TOOL_NAME` (VariableDeclaration) — `"AskUserQuestion"`
- `AskUserQuestion` (TypeAliasDeclaration) — `{ options: { description: string; label: string; preview?: string | undefined; }[]; question: string; header: string; multiSelect: boolean; }`
- `AskUserQuestionAnnotation` (TypeAliasDeclaration) — `{ preview?: string | undefined; notes?: string | undefined; }`
- `AskUserQuestionAnnotationSchema` (VariableDeclaration) — `z.ZodObject<{ preview: z.ZodOptional<z.ZodString>; notes: z.ZodOptional<z.ZodString>; }, "strict", z.ZodTypeAny, { preview?: string | undefined; notes?: string | undefined; }, { preview?: string | und`
- `AskUserQuestionAnsweredInputSchema` (VariableDeclaration) — `z.ZodEffects<z.ZodEffects<z.ZodObject<{ questions: z.ZodArray<z.ZodEffects<z.ZodObject<{ question: z.ZodString; header: z.ZodString; options: z.ZodArray<z.ZodEffects<z.ZodObject<{ label: z.ZodString; `
- `AskUserQuestionInput` (TypeAliasDeclaration) — `{ questions: { options: { description: string; label: string; preview?: string | undefined; }[]; question: string; header: string; multiSelect: boolean; }[]; answers?: Record<string, string> | undefin`
- `AskUserQuestionInputJsonSchema` (VariableDeclaration) — `import("../index.js").JsonSchema`
- `AskUserQuestionInputSchema` (VariableDeclaration) — `z.ZodEffects<z.ZodObject<{ questions: z.ZodArray<z.ZodEffects<z.ZodObject<{ question: z.ZodString; header: z.ZodString; options: z.ZodArray<z.ZodEffects<z.ZodObject<{ label: z.ZodString; description: `
- `AskUserQuestionOption` (TypeAliasDeclaration) — `{ description: string; label: string; preview?: string | undefined; }`
- `AskUserQuestionOptionSchema` (VariableDeclaration) — `z.ZodEffects<z.ZodObject<{ label: z.ZodString; description: z.ZodString; preview: z.ZodOptional<z.ZodString>; }, "strict", z.ZodTypeAny, { description: string; label: string; preview?: string | undefi`
- `AskUserQuestionOutput` (TypeAliasDeclaration) — `{ questions: { options: { description: string; label: string; preview?: string | undefined; }[]; question: string; header: string; multiSelect: boolean; }[]; answers: Record<string, string>; annotatio`
- `AskUserQuestionOutputJsonSchema` (VariableDeclaration) — `import("../index.js").JsonSchema`
- `AskUserQuestionOutputSchema` (VariableDeclaration) — `z.ZodObject<{ questions: z.ZodArray<z.ZodEffects<z.ZodObject<{ question: z.ZodString; header: z.ZodString; options: z.ZodArray<z.ZodEffects<z.ZodObject<{ label: z.ZodString; description: z.ZodString; `
- `AskUserQuestionSchema` (VariableDeclaration) — `z.ZodEffects<z.ZodObject<{ question: z.ZodString; header: z.ZodString; options: z.ZodArray<z.ZodEffects<z.ZodObject<{ label: z.ZodString; description: z.ZodString; preview: z.ZodOptional<z.ZodString>;`
- `BackgroundTask` (InterfaceDeclaration) — `BackgroundTask`
- `BashErrorCode` (VariableDeclaration | TypeAliasDeclaration) — `{ readonly COMMAND_NOT_PARSABLE: "bash_command_not_parsable"; readonly COMMAND_TOO_COMPLEX: "bash_command_too_complex"; readonly COMMAND_INJECTION_RISK: "bash_command_injection_risk"; readonly READONL`
- `BashInput` (TypeAliasDeclaration) — `{ command: string; description?: string | undefined; run_in_background?: boolean | undefined; timeout?: number | undefined; dangerouslyDisableSandbox?: boolean | undefined; }`
- `BashInputJsonSchema` (VariableDeclaration) — `import("../index.js").JsonSchema`
- `BashInputSchema` (VariableDeclaration) — `z.ZodObject<{ command: z.ZodString; timeout: z.ZodOptional<z.ZodEffects<z.ZodNumber, number, unknown>>; description: z.ZodOptional<z.ZodString>; run_in_background: z.ZodOptional<z.ZodEffects<z.ZodBool`
- `BashOutput` (InterfaceDeclaration) — `BashOutput`
- `BashOutputJsonSchema` (VariableDeclaration) — `import("../index.js").JsonSchema`
- `BashOutputSchema` (VariableDeclaration) — `z.ZodObject<{ stdout: z.ZodString; stderr: z.ZodString; status: z.ZodOptional<z.ZodEnum<["completed", "failed", "timed_out", "cancelled", "spawn_error", "backgrounded"]>>; exitCode: z.ZodOptional<z.Zo`
- `BashToolCall` (InterfaceDeclaration) — `BashToolCall`
- `BashToolResult` (InterfaceDeclaration) — `BashToolResult`
- `CellOutput` (InterfaceDeclaration) — `CellOutput`
- `CommandExecutionTelemetry` (TypeAliasDeclaration) — `{ status: "completed" | "failed" | "timed_out" | "cancelled" | "spawn_error" | "backgrounded"; name?: string | undefined; exitCode?: number | undefined; timedOut?: boolean | undefined; runMs?: number `
- `CommandExecutionTelemetrySchema` (VariableDeclaration) — `z.ZodObject<{ runMs: z.ZodOptional<z.ZodNumber>; firstOutputMs: z.ZodOptional<z.ZodNumber>; noOutputMs: z.ZodOptional<z.ZodNumber>; exitCode: z.ZodOptional<z.ZodNumber>; timedOut: z.ZodOptional<z.ZodB`
- `COMPLETED_TOOL_PART_METADATA_SCHEMA_VERSION` (VariableDeclaration) — `1`
- `CompletedToolPartMetadata` (TypeAliasDeclaration) — `{ schemaVersion: 1; display?: { kind: "bash_output"; truncated: boolean; output: string; outputPath?: string | undefined; } | { kind: "file_diff"; structuredPatch: { oldStart: number; oldLines: number`
- `completedToolPartMetadataSchema` (VariableDeclaration) — `z.ZodObject<{ schemaVersion: z.ZodLiteral<1>; display: z.ZodOptional<z.ZodDiscriminatedUnion<"kind", [z.ZodObject<{ kind: z.ZodLiteral<"bash_output">; output: z.ZodString; truncated: z.ZodBoolean; out`
- `CREATE_WORKFLOW_ARGS_WITHOUT_PATH_ERROR` (VariableDeclaration) — `"`args`belongs to the`path`source: it carries values for the arguments a script file declares in its`/\* knorvia-workflow`block. For a saved workflow pass`saved.args`; an inline `script` declares`
- `CREATE_WORKFLOW_DISPLAY_MAX_DIAGNOSTICS` (VariableDeclaration) — `100`
- `CREATE_WORKFLOW_DISPLAY_MAX_MESSAGE_CHARS` (VariableDeclaration) — `2048`
- `CREATE_WORKFLOW_GRAPH_MAX_HANDOFF_TYPES` (VariableDeclaration) — `8`
- `CREATE_WORKFLOW_GRAPH_MAX_HANDOFFS` (VariableDeclaration) — `256`
- `CREATE_WORKFLOW_GRAPH_MAX_ID_CHARS` (VariableDeclaration) — `64`
- `CREATE_WORKFLOW_GRAPH_MAX_LANES` (VariableDeclaration) — `32`
- `CREATE_WORKFLOW_GRAPH_MAX_NAME_CHARS` (VariableDeclaration) — `128`
- `CREATE_WORKFLOW_GRAPH_MAX_PARTICIPANTS` (VariableDeclaration) — `64`
- `CREATE_WORKFLOW_GRAPH_MAX_PHASE_EDGES` (VariableDeclaration) — `128`
- `CREATE_WORKFLOW_GRAPH_MAX_PHASES` (VariableDeclaration) — `32`
- `CREATE_WORKFLOW_GRAPH_MAX_STEPS` (VariableDeclaration) — `64`
- `CREATE_WORKFLOW_SOURCE_ERROR` (VariableDeclaration) — `"Provide exactly one workflow source: `script`for a one-off script written inline,`saved`to run a workflow saved in this project, or`path` for a script file on disk (the file a previous result nam`
- `CREATE_WORKFLOW_STEP_KINDS` (VariableDeclaration) — `readonly ["ask", "world-read"]`
- `CREATE_WORKFLOW_TOOL_NAME` (VariableDeclaration) — `"CreateWorkflow"`
- `CreateWorkflowCausalityGraph` (TypeAliasDeclaration) — `{ lanes: { id: string; name?: string | undefined; line?: number | undefined; column?: number | undefined; namePattern?: { head?: string | undefined; tail?: string | undefined; } | undefined; }[]; step`
- `CreateWorkflowCausalityGraphSchema` (VariableDeclaration) — `z.ZodObject<{ steps: z.ZodArray<z.ZodObject<{ id: z.ZodString; kind: z.ZodEnum<["ask", "world-read"]>; label: z.ZodString; labelPattern: z.ZodOptional<z.ZodObject<{ head: z.ZodOptional<z.ZodString>; t`
- `CreateWorkflowDiagnostic` (TypeAliasDeclaration) — `{ code: number; message: string; line: number; column: number; }`
- `CreateWorkflowDiagnosticSchema` (VariableDeclaration) — `z.ZodObject<{ code: z.ZodNumber; column: z.ZodNumber; line: z.ZodNumber; message: z.ZodString; }, "strict", z.ZodTypeAny, { code: number; message: string; line: number; column: number; }, { code: numb`
- `CreateWorkflowEdge` (TypeAliasDeclaration) — `{ from: string; to: string; back?: true | undefined; }`
- `CreateWorkflowEdgeSchema` (VariableDeclaration) — `z.ZodObject<{ from: z.ZodString; to: z.ZodString; back: z.ZodOptional<z.ZodLiteral<true>>; }, "strict", z.ZodTypeAny, { from: string; to: string; back?: true | undefined; }, { from: string; to: string`
- `CreateWorkflowHandoff` (TypeAliasDeclaration) — `{ from: string; to: string; back?: true | undefined; types?: string[] | undefined; }`
- `CreateWorkflowHandoffSchema` (VariableDeclaration) — `z.ZodObject<{ from: z.ZodString; to: z.ZodString; back: z.ZodOptional<z.ZodLiteral<true>>; } & { types: z.ZodOptional<z.ZodArray<z.ZodString, "many">>; }, "strict", z.ZodTypeAny, { from: string; to: s`
- `CreateWorkflowInput` (TypeAliasDeclaration) — `{ path?: string | undefined; script?: string | undefined; name?: string | undefined; max_concurrency?: number | undefined; subagent_model?: string | undefined; script_line_offset?: number | undefined;`
- `CreateWorkflowInputJsonSchema` (VariableDeclaration) — `import("../index.js").JsonSchema`
- `CreateWorkflowInputSchema` (VariableDeclaration) — `z.ZodObject<{ name: z.ZodOptional<z.ZodString>; script: z.ZodOptional<z.ZodString>; path: z.ZodOptional<z.ZodString>; args: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodUnknown>>; max_concurrency: z.Zo`
- `CreateWorkflowLane` (TypeAliasDeclaration) — `{ id: string; name?: string | undefined; line?: number | undefined; column?: number | undefined; namePattern?: { head?: string | undefined; tail?: string | undefined; } | undefined; }`
- `CreateWorkflowLaneSchema` (VariableDeclaration) — `z.ZodObject<{ id: z.ZodString; name: z.ZodOptional<z.ZodString>; namePattern: z.ZodOptional<z.ZodObject<{ head: z.ZodOptional<z.ZodString>; tail: z.ZodOptional<z.ZodString>; }, "strict", z.ZodTypeAny,`
- `CreateWorkflowNamePattern` (TypeAliasDeclaration) — `{ head?: string | undefined; tail?: string | undefined; }`
- `CreateWorkflowNamePatternSchema` (VariableDeclaration) — `z.ZodObject<{ head: z.ZodOptional<z.ZodString>; tail: z.ZodOptional<z.ZodString>; }, "strict", z.ZodTypeAny, { head?: string | undefined; tail?: string | undefined; }, { head?: string | undefined; tai`
- `CreateWorkflowOutput` (TypeAliasDeclaration) — `{ diagnostics: { code: number; message: string; line: number; column: number; }[]; ok: boolean; response: string; status?: "backgrounded" | undefined; backgroundTaskId?: string | undefined; causalityG`
- `CreateWorkflowOutputJsonSchema` (VariableDeclaration) — `import("../index.js").JsonSchema`
- `CreateWorkflowOutputSchema` (VariableDeclaration) — `z.ZodObject<{ diagnostics: z.ZodArray<z.ZodObject<{ code: z.ZodNumber; column: z.ZodNumber; line: z.ZodNumber; message: z.ZodString; }, "strict", z.ZodTypeAny, { code: number; message: string; line: n`
- `CreateWorkflowParticipant` (TypeAliasDeclaration) — `{ id: string; lane: string; phase: string; steps: string[]; many?: true | undefined; member?: { index: number; of: number; } | undefined; }`
- `CreateWorkflowParticipantSchema` (VariableDeclaration) — `z.ZodObject<{ id: z.ZodString; phase: z.ZodString; lane: z.ZodString; steps: z.ZodArray<z.ZodString, "many">; member: z.ZodOptional<z.ZodObject<{ index: z.ZodNumber; of: z.ZodNumber; }, "strict", z.Zo`
- `CreateWorkflowPhase` (TypeAliasDeclaration) — `{ id: string; name?: string | undefined; line?: number | undefined; column?: number | undefined; alongside?: string[] | undefined; }`
- `createWorkflowPhaseAlongside` (FunctionDeclaration) — `export function createWorkflowPhaseAlongside( graph: Pick<CreateWorkflowCausalityGraph, "phases"> | undefined, ): number[][] | undefined { const named = namedPhases(graph); if (named === undefined) re`
- `createWorkflowPhaseNames` (FunctionDeclaration) — `export function createWorkflowPhaseNames( graph: Pick<CreateWorkflowCausalityGraph, "phases"> | undefined, ): string[] | undefined { return namedPhases(graph)?.map((phase) => phase.name); }`
- `CreateWorkflowPhaseSchema` (VariableDeclaration) — `z.ZodObject<{ id: z.ZodString; name: z.ZodOptional<z.ZodString>; line: z.ZodOptional<z.ZodNumber>; column: z.ZodOptional<z.ZodNumber>; alongside: z.ZodOptional<z.ZodArray<z.ZodString, "many">>; }, "st`
- `CreateWorkflowResolvedSavedSource` (TypeAliasDeclaration) — `{ name: string; scope?: "project" | "global" | undefined; path?: string | undefined; args?: Record<string, unknown> | undefined; draft?: string | undefined; }`
- `CreateWorkflowResolvedSavedSourceSchema` (VariableDeclaration) — `z.ZodObject<{ name: z.ZodString; args: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodUnknown>>; path: z.ZodOptional<z.ZodString>; scope: z.ZodOptional<z.ZodEnum<["project", "global"]>>; } & { draft: z.Z`
- `CreateWorkflowSavedSource` (TypeAliasDeclaration) — `{ name: string; scope?: "project" | "global" | undefined; path?: string | undefined; args?: Record<string, unknown> | undefined; }`
- `CreateWorkflowSavedSourceSchema` (VariableDeclaration) — `z.ZodObject<{ name: z.ZodString; args: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodUnknown>>; path: z.ZodOptional<z.ZodString>; scope: z.ZodOptional<z.ZodEnum<["project", "global"]>>; }, "strict", z.Z`
- `CreateWorkflowStep` (TypeAliasDeclaration) — `{ kind: "ask" | "world-read"; label: string; id: string; lane: string; source?: string | undefined; labelPattern?: { head?: string | undefined; tail?: string | undefined; } | undefined; line?: number `
- `CreateWorkflowStepSchema` (VariableDeclaration) — `z.ZodObject<{ id: z.ZodString; kind: z.ZodEnum<["ask", "world-read"]>; label: z.ZodString; labelPattern: z.ZodOptional<z.ZodObject<{ head: z.ZodOptional<z.ZodString>; tail: z.ZodOptional<z.ZodString>;`
- `createWorkflowToolResultDisplayDiagnosticSchema` (VariableDeclaration) — `z.ZodObject<{ line: z.ZodNumber; column: z.ZodNumber; code: z.ZodNumber; message: z.ZodString; }, "strict", z.ZodTypeAny, { code: number; message: string; line: number; column: number; }, { code: numb`
- `CreateWorkflowToolResultDisplayPayload` (TypeAliasDeclaration) — `{ kind: "create_workflow"; diagnostics: { code: number; message: string; line: number; column: number; }[]; ok: boolean; errorCount: number; truncated?: boolean | undefined; causalityGraph?: { lanes: `
- `createWorkflowToolResultDisplayPayloadSchema` (VariableDeclaration) — `z.ZodObject<{ kind: z.ZodLiteral<"create_workflow">; ok: z.ZodBoolean; errorCount: z.ZodNumber; diagnostics: z.ZodArray<z.ZodObject<{ line: z.ZodNumber; column: z.ZodNumber; code: z.ZodNumber; message`
- `CronAutomation` (TypeAliasDeclaration) — `{ prompt: string; automationId: string; title: string; cronExpr: string; enabled: boolean; lifecycleStatus: "completed" | "active" | "failed" | "paused"; runCount: number; recurring: boolean; nextRunA`
- `CronAutomationScheduleRule` (TypeAliasDeclaration) — `{ unit: "minute" | "hourly" | "daily" | "weekly" | "monthly" | "yearly"; minute: number; interval: number; hour: number; anchorAt: number; weekdays?: number[] | undefined; monthDays?: number[] | undef`
- `CronAutomationScheduleRuleSchema` (VariableDeclaration) — `z.ZodObject<{ unit: z.ZodEnum<["minute", "hourly", "daily", "weekly", "monthly", "yearly"]>; interval: z.ZodNumber; hour: z.ZodNumber; minute: z.ZodNumber; anchorAt: z.ZodNumber; weekdays: z.ZodOption`
- `CronAutomationSchema` (VariableDeclaration) — `z.ZodObject<{ automationId: z.ZodString; title: z.ZodString; cronExpr: z.ZodString; prompt: z.ZodString; enabled: z.ZodBoolean; lifecycleStatus: z.ZodEnum<["active", "completed", "failed", "paused"]>;`
- `CronCreateInput` (TypeAliasDeclaration) — `{ prompt: string; title: string; recurring?: boolean | undefined; maxRuns?: number | undefined; interval?: number | undefined; cron?: string | undefined; delayMinutes?: number | null | undefined; inte`
- `CronCreateInputJsonSchema` (VariableDeclaration) — `import("../index.js").JsonSchema`
- `CronCreateInputSchema` (VariableDeclaration) — `z.ZodEffects<z.ZodEffects<z.ZodEffects<z.ZodEffects<z.ZodEffects<z.ZodEffects<z.ZodEffects<z.ZodEffects<z.ZodObject<{ cron: z.ZodOptional<z.ZodString>; delayMinutes: z.ZodOptional<z.ZodNullable<z.ZodN`
- `CronCreateOutput` (TypeAliasDeclaration) — `{ message: string; automation: { prompt: string; automationId: string; title: string; cronExpr: string; enabled: boolean; lifecycleStatus: "completed" | "active" | "failed" | "paused"; runCount: numbe`
- `CronCreateOutputJsonSchema` (VariableDeclaration) — `import("../index.js").JsonSchema`
- `CronCreateOutputSchema` (VariableDeclaration) — `z.ZodObject<{ automation: z.ZodObject<{ automationId: z.ZodString; title: z.ZodString; cronExpr: z.ZodString; prompt: z.ZodString; enabled: z.ZodBoolean; lifecycleStatus: z.ZodEnum<["active", "complet`
- `CronDeleteInput` (TypeAliasDeclaration) — `{ id: string; }`
- `CronDeleteInputJsonSchema` (VariableDeclaration) — `import("../index.js").JsonSchema`
- `CronDeleteInputSchema` (VariableDeclaration) — `z.ZodObject<{ id: z.ZodString; }, "strict", z.ZodTypeAny, { id: string; }, { id: string; }>`
- `CronDeleteOutput` (TypeAliasDeclaration) — `{ message: string; id: string; deleted: boolean; }`
- `CronDeleteOutputJsonSchema` (VariableDeclaration) — `import("../index.js").JsonSchema`
- `CronDeleteOutputSchema` (VariableDeclaration) — `z.ZodObject<{ deleted: z.ZodBoolean; id: z.ZodString; message: z.ZodString; }, "strict", z.ZodTypeAny, { message: string; id: string; deleted: boolean; }, { message: string; id: string; deleted: boole`
- `CronListInput` (TypeAliasDeclaration) — `{}`
- `CronListInputJsonSchema` (VariableDeclaration) — `import("../index.js").JsonSchema`
- `CronListInputSchema` (VariableDeclaration) — `z.ZodObject<{}, "strict", z.ZodTypeAny, {}, {}>`
- `CronListOutput` (TypeAliasDeclaration) — `{ automations: { prompt: string; automationId: string; title: string; cronExpr: string; enabled: boolean; lifecycleStatus: "completed" | "active" | "failed" | "paused"; runCount: number; recurring: bo`
- `CronListOutputJsonSchema` (VariableDeclaration) — `import("../index.js").JsonSchema`
- `CronListOutputSchema` (VariableDeclaration) — `z.ZodObject<{ automations: z.ZodArray<z.ZodObject<{ automationId: z.ZodString; title: z.ZodString; cronExpr: z.ZodString; prompt: z.ZodString; enabled: z.ZodBoolean; lifecycleStatus: z.ZodEnum<["activ`
- `CronUpdateInput` (TypeAliasDeclaration) — `{ title: string; id: string; prompt?: string | undefined; recurring?: boolean | undefined; maxRuns?: number | null | undefined; interval?: number | undefined; cron?: string | undefined; intervalUnit?:`
- `CronUpdateInputJsonSchema` (VariableDeclaration) — `import("../index.js").JsonSchema`
- `CronUpdateInputSchema` (VariableDeclaration) — `z.ZodEffects<z.ZodEffects<z.ZodEffects<z.ZodEffects<z.ZodEffects<z.ZodEffects<z.ZodObject<{ id: z.ZodString; cron: z.ZodOptional<z.ZodString>; prompt: z.ZodOptional<z.ZodString>; title: z.ZodString; r`
- `CronUpdateOutput` (TypeAliasDeclaration) — `{ message: string; automation: { prompt: string; automationId: string; title: string; cronExpr: string; enabled: boolean; lifecycleStatus: "completed" | "active" | "failed" | "paused"; runCount: numbe`
- `CronUpdateOutputJsonSchema` (VariableDeclaration) — `import("../index.js").JsonSchema`
- `CronUpdateOutputSchema` (VariableDeclaration) — `z.ZodObject<{ automation: z.ZodObject<{ automationId: z.ZodString; title: z.ZodString; cronExpr: z.ZodString; prompt: z.ZodString; enabled: z.ZodBoolean; lifecycleStatus: z.ZodEnum<["active", "complet`
- `CUA_TARGET_APP_DISPLAY_META_KEY` (VariableDeclaration) — `"knorvia.cua/target-app-display-v1"`
- `CuaRequestAccessStatusDisplay` (TypeAliasDeclaration) — `{ schemaVersion: 1; platform: "darwin"; grantOwner: string; accessibility: "granted" | "stale" | "denied"; screenRecording: "unknown" | "granted" | "denied"; }`
- `cuaRequestAccessStatusDisplaySchema` (VariableDeclaration) — `z.ZodObject<{ schemaVersion: z.ZodLiteral<1>; platform: z.ZodLiteral<"darwin">; grantOwner: z.ZodString; accessibility: z.ZodEnum<["granted", "stale", "denied"]>; screenRecording: z.ZodEnum<["granted"`
- `CuaTargetAppDisplay` (TypeAliasDeclaration) — `{ schemaVersion: 1; iconLocators: ({ value: string; kind: "darwin-bundle-id"; } | { value: string; kind: "windows-executable-path"; } | { value: string; kind: "windows-aumid"; })[]; displayName?: stri`
- `cuaTargetAppDisplaySchema` (VariableDeclaration) — `z.ZodObject<{ schemaVersion: z.ZodLiteral<1>; displayName: z.ZodOptional<z.ZodString>; iconLocators: z.ZodArray<z.ZodDiscriminatedUnion<"kind", [z.ZodObject<{ kind: z.ZodLiteral<"darwin-bundle-id">; v`
- `CuaToolResultDisplayPayload` (TypeAliasDeclaration) — `{ status: "failed" | "success"; kind: "cua"; toolName: string; schemaVersion: 1; text?: string | undefined; structuredContent?: string | undefined; input?: string | undefined; truncated?: boolean | un`
- `cuaToolResultDisplayPayloadSchema` (VariableDeclaration) — `z.ZodObject<{ kind: z.ZodLiteral<"cua">; schemaVersion: z.ZodLiteral<1>; toolName: z.ZodString; status: z.ZodEnum<["success", "failed"]>; input: z.ZodOptional<z.ZodString>; structuredContent: z.ZodOpt`
- `DiffHunk` (InterfaceDeclaration) — `DiffHunk`
- `EditDiffHunkSchema` (VariableDeclaration) — `z.ZodObject<{ oldStart: z.ZodNumber; oldLines: z.ZodNumber; newStart: z.ZodNumber; newLines: z.ZodNumber; lines: z.ZodArray<z.ZodString, "many">; }, "strict", z.ZodTypeAny, { oldStart: number; oldLine`
- `EditErrorCode` (VariableDeclaration | TypeAliasDeclaration) — `{ readonly NO_CHANGE: 1; readonly FILE_EXISTS_NO_OLD_STRING: 3; readonly FILE_NOT_EXIST: 4; readonly NOTEBOOK_FILE: 5; readonly FILE_NOT_READ: 6; readonly STALE_FILE: 7; readonly OLD_STRING_NOT_FOUND:`
- `EditGitDiffSchema` (VariableDeclaration) — `z.ZodObject<{ filename: z.ZodString; status: z.ZodEnum<["modified", "added"]>; additions: z.ZodNumber; deletions: z.ZodNumber; changes: z.ZodNumber; patch: z.ZodString; repository: z.ZodOptional<z.Zod`
- `EditInput` (TypeAliasDeclaration) — `{ file_path: string; old_string: string; new_string: string; replace_all: boolean; }`
- `EditInputJsonSchema` (VariableDeclaration) — `import("../index.js").JsonSchema`
- `EditInputSchema` (VariableDeclaration) — `z.ZodObject<{ file_path: z.ZodString; old_string: z.ZodString; new_string: z.ZodString; replace_all: z.ZodDefault<z.ZodOptional<z.ZodEffects<z.ZodBoolean, boolean, unknown>>>; }, "strip", z.ZodTypeAny`
- `EditOutput` (InterfaceDeclaration) — `EditOutput`
- `EditOutputJsonSchema` (VariableDeclaration) — `import("../index.js").JsonSchema`
- `EditOutputSchema` (VariableDeclaration) — `z.ZodObject<{ filePath: z.ZodString; oldString: z.ZodString; newString: z.ZodString; originalFile: z.ZodString; structuredPatch: z.ZodArray<z.ZodObject<{ oldStart: z.ZodNumber; oldLines: z.ZodNumber; `
- `EditToolCall` (InterfaceDeclaration) — `EditToolCall`
- `EditToolResult` (InterfaceDeclaration) — `EditToolResult`
- `ENTER_PLAN_MODE_TOOL_NAME` (VariableDeclaration) — `"EnterPlanMode"`
- `EnterPlanModeInput` (TypeAliasDeclaration) — `{}`
- `EnterPlanModeInputJsonSchema` (VariableDeclaration) — `import("../index.js").JsonSchema`
- `EnterPlanModeInputSchema` (VariableDeclaration) — `z.ZodObject<{}, "strict", z.ZodTypeAny, {}, {}>`
- `EnterPlanModeOutput` (TypeAliasDeclaration) — `{ message: string; mode: "build" | "edit" | "plan" | "yolo" | "auto"; previousMode: "build" | "edit" | "plan" | "yolo" | "auto"; planEnabled?: boolean | undefined; previousPlanEnabled?: boolean | unde`
- `EnterPlanModeOutputJsonSchema` (VariableDeclaration) — `import("../index.js").JsonSchema`
- `EnterPlanModeOutputSchema` (VariableDeclaration) — `z.ZodObject<{ message: z.ZodString; previousMode: z.ZodEnum<["plan", "build", "edit", "yolo", "auto"]>; mode: z.ZodEnum<["plan", "build", "edit", "yolo", "auto"]>; planEnabled: z.ZodOptional<z.ZodBool`
- `EnterPlanModeTransitionResult` (InterfaceDeclaration) — `EnterPlanModeTransitionResult`
- `ESCALATE_TOOL_NAME` (VariableDeclaration) — `"escalate"`
- `EscalateInput` (TypeAliasDeclaration) — `{ question: string; context?: string | undefined; }`
- `EscalateInputJsonSchema` (VariableDeclaration) — `import("../index.js").JsonSchema`
- `EscalateInputSchema` (VariableDeclaration) — `z.ZodObject<{ question: z.ZodString; context: z.ZodOptional<z.ZodString>; }, "strict", z.ZodTypeAny, { question: string; context?: string | undefined; }, { question: string; context?: string | undefin`
- `EscalateOutput` (TypeAliasDeclaration) — `{ status: "answered" | "refused"; message: string; reason?: "budget_exhausted" | "no_active_ask" | undefined; qid?: string | undefined; }`
- `EscalateOutputJsonSchema` (VariableDeclaration) — `import("../index.js").JsonSchema`
- `EscalateOutputSchema` (VariableDeclaration) — `z.ZodObject<{ status: z.ZodEnum<["answered", "refused"]>; message: z.ZodString; qid: z.ZodOptional<z.ZodString>; reason: z.ZodOptional<z.ZodEnum<["budget_exhausted", "no_active_ask"]>>; }, "strict", z`
- `escapeGoalPromptText` (FunctionDeclaration) — `export function escapeGoalPromptText(input: string): string { return input.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;"); }`
- `EVAL_WORKFLOW_SNIPPET_DEFAULT_TIMEOUT_MS` (VariableDeclaration) — `60000`
- `EVAL_WORKFLOW_SNIPPET_MAX_ARTIFACT_BYTES` (VariableDeclaration) — `number`
- `EVAL_WORKFLOW_SNIPPET_MAX_LOG_CHARS` (VariableDeclaration) — `2048`
- `EVAL_WORKFLOW_SNIPPET_MAX_LOGS` (VariableDeclaration) — `100`
- `EVAL_WORKFLOW_SNIPPET_MAX_TIMEOUT_MS` (VariableDeclaration) — `600000`
- `EVAL_WORKFLOW_SNIPPET_MIN_TIMEOUT_MS` (VariableDeclaration) — `1000`
- `EVAL_WORKFLOW_SNIPPET_SOURCE_ERROR` (VariableDeclaration) — `"Provide exactly one snippet source: `code`for the snippet inline, or`path` for a file holding it. Passing both, or neither, is ambiguous."`
- `EVAL_WORKFLOW_SNIPPET_TOOL_NAME` (VariableDeclaration) — `"EvalWorkflowSnippet"`
- `EvalWorkflowSnippetInput` (TypeAliasDeclaration) — `{ code?: string | undefined; path?: string | undefined; timeoutMs?: number | undefined; }`
- `EvalWorkflowSnippetInputJsonSchema` (VariableDeclaration) — `import("../index.js").JsonSchema`
- `EvalWorkflowSnippetInputSchema` (VariableDeclaration) — `z.ZodObject<{ code: z.ZodOptional<z.ZodString>; path: z.ZodOptional<z.ZodString>; timeoutMs: z.ZodOptional<z.ZodNumber>; }, "strict", z.ZodTypeAny, { code?: string | undefined; path?: string | undefin`
- `EvalWorkflowSnippetOutput` (TypeAliasDeclaration) — `{ diagnostics: { code: number; message: string; line: number; column: number; }[]; ok: boolean; response: string; logs: string[]; durationMs: number; }`
- `EvalWorkflowSnippetOutputJsonSchema` (VariableDeclaration) — `import("../index.js").JsonSchema`
- `EvalWorkflowSnippetOutputSchema` (VariableDeclaration) — `z.ZodObject<{ ok: z.ZodBoolean; diagnostics: z.ZodArray<z.ZodObject<{ code: z.ZodNumber; column: z.ZodNumber; line: z.ZodNumber; message: z.ZodString; }, "strict", z.ZodTypeAny, { code: number; messag`
- `EvalWorkflowSnippetToolResultDisplayPayload` (TypeAliasDeclaration) — `{ kind: "eval_workflow_snippet"; diagnostics: { code: number; message: string; line: number; column: number; }[]; ok: boolean; response: string; logs: string[]; durationMs: number; truncated?: boolean`
- `evalWorkflowSnippetToolResultDisplayPayloadSchema` (VariableDeclaration) — `z.ZodObject<{ kind: z.ZodLiteral<"eval_workflow_snippet">; ok: z.ZodBoolean; diagnostics: z.ZodArray<z.ZodObject<{ line: z.ZodNumber; column: z.ZodNumber; code: z.ZodNumber; message: z.ZodString; }, "`
- `EXIT_PLAN_MODE_TOOL_NAME` (VariableDeclaration) — `"ExitPlanMode"`
- `ExitPlanModeAllowedPrompt` (TypeAliasDeclaration) — `{ prompt: string; tool: "Bash"; }`
- `ExitPlanModeAllowedPromptSchema` (VariableDeclaration) — `z.ZodObject<{ tool: z.ZodEnum<["Bash"]>; prompt: z.ZodString; }, "strict", z.ZodTypeAny, { prompt: string; tool: "Bash"; }, { prompt: string; tool: "Bash"; }>`
- `ExitPlanModeInput` (TypeAliasDeclaration) — `{ plan: string; allowedPrompts?: { prompt: string; tool: "Bash"; }[] | undefined; } & { [k: string]: unknown; }`
- `ExitPlanModeInputJsonSchema` (VariableDeclaration) — `import("../index.js").JsonSchema`
- `ExitPlanModeInputSchema` (VariableDeclaration) — `z.ZodObject<{ plan: z.ZodEffects<z.ZodString, string, string>; allowedPrompts: z.ZodOptional<z.ZodArray<z.ZodObject<{ tool: z.ZodEnum<["Bash"]>; prompt: z.ZodString; }, "strict", z.ZodTypeAny, { promp`
- `ExitPlanModeOutput` (TypeAliasDeclaration) — `{ plan: string | null; mode: "build" | "edit" | "yolo" | "auto"; previousMode: "build" | "edit" | "plan" | "yolo" | "auto"; approved: true; planEnabled?: boolean | undefined; previousPlanEnabled?: boo`
- `ExitPlanModeOutputJsonSchema` (VariableDeclaration) — `import("../index.js").JsonSchema`
- `ExitPlanModeOutputSchema` (VariableDeclaration) — `z.ZodObject<{ plan: z.ZodNullable<z.ZodString>; approved: z.ZodLiteral<true>; previousMode: z.ZodEnum<["plan", "build", "edit", "yolo", "auto"]>; planEnabled: z.ZodOptional<z.ZodBoolean>; previousPlan`
- `ExitPlanModeTransitionResult` (InterfaceDeclaration) — `ExitPlanModeTransitionResult`
- `failedGoalCompletionVerification` (FunctionDeclaration) — `export function failedGoalCompletionVerification(reason: string): GoalCompletionVerificationOutput { // 这个兜底表示 verifier 自身失败，不是模型给出的下一步。 // 若写入 nextAction，UI 会把内部控制文案当成下一轮迭代标题展示。 return { passed: fals`
- `failOpenGoalCompletionVerification` (FunctionDeclaration) — `export function failOpenGoalCompletionVerification( reason: string, ): GoalCompletionVerificationOutput { // 这里表示 verifier 基础设施/格式失败，不是 verifier 明确判定目标未完成。 // 默认通过能避免 goal 因裁判链路偶发失败被无限卡住，同时保留 reason 供`
- `FileDiffToolResultDisplayPayload` (TypeAliasDeclaration) — `{ kind: "file_diff"; structuredPatch: { oldStart: number; oldLines: number; newStart: number; newLines: number; lines: string[]; }[]; filePath: string; additions: number; deletions: number; truncated?`
- `fileDiffToolResultDisplayPayloadSchema` (VariableDeclaration) — `z.ZodObject<{ kind: z.ZodLiteral<"file_diff">; filePath: z.ZodString; additions: z.ZodNumber; deletions: z.ZodNumber; structuredPatch: z.ZodArray<z.ZodObject<{ oldStart: z.ZodNumber; oldLines: z.ZodNu`
- `FileSystemExecutionTelemetry` (TypeAliasDeclaration) — `{ fileCount?: number | undefined; readMs?: number | undefined; writeMs?: number | undefined; totalBytes?: number | undefined; maxFileBytes?: number | undefined; workspaceKind?: "unknown" | "local" | "`
- `FileSystemExecutionTelemetrySchema` (VariableDeclaration) — `z.ZodObject<{ readMs: z.ZodOptional<z.ZodNumber>; writeMs: z.ZodOptional<z.ZodNumber>; fileCount: z.ZodOptional<z.ZodNumber>; totalBytes: z.ZodOptional<z.ZodNumber>; maxFileBytes: z.ZodOptional<z.ZodN`
- `formatGoalCompletionVerificationFailurePrompt` (FunctionDeclaration) — `export function formatGoalCompletionVerificationFailurePrompt(input: { goal: SessionGoal; reason: string; nextAction: string; }): string { return [ "<system-reminder>", "The active session goal was no`
- `formatGoalCompletionVerificationPassedContent` (FunctionDeclaration) — `export function formatGoalCompletionVerificationPassedContent(input: { goal: SessionGoal; reason: string; }): string { return [ "Goal completion verification passed.", `Status: ${input.goal.status}`, `
- `formatGoalCompletionVerificationPrompt` (FunctionDeclaration) — `export function formatGoalCompletionVerificationPrompt(goal: SessionGoal): string { const tokenBudget = goal.tokenBudget === null ? "none" : goal.tokenBudget.toString(); return [ "Verify whether the a`
- `formatGoalContinuationPrompt` (FunctionDeclaration) — `export function formatGoalContinuationPrompt( goal: SessionGoal, verification?: Pick<GoalCompletionVerificationOutput, "nextAction" | "reason"> | null, ): string { const tokenBudget = goal.tokenBudget`
- `formatGoalStateForModel` (FunctionDeclaration) — `export function formatGoalStateForModel(goal: SessionGoal | null): string { if (!goal) return ""; const budget = goal.tokenBudget === null ? "none" : goal.tokenBudget.toString(); return [ "Current ses`
- `formatTodoStateForModel` (FunctionDeclaration) — `export function formatTodoStateForModel(todos: readonly TodoItem[]): string { if (todos.length === 0) { return ""; } return [ "Current session todo state (authoritative):", ...todos.map( (todo, index)`
- `GET_WORKFLOW_RUN_ROSTER_LIMITS` (VariableDeclaration) — `{ readonly maxPhases: 32; readonly maxPhaseNameLength: 128; readonly maxSubagents: 64; readonly maxActorNameLength: 128; readonly maxInstructionsHeadLength: 240; readonly maxLastToolNameLength: 64; re`
- `GET_WORKFLOW_RUN_SUMMARY_MAX_CHARS` (VariableDeclaration) — `400`
- `GET_WORKFLOW_RUN_TOOL_NAME` (VariableDeclaration) — `"GetWorkflowRun"`
- `getReadPdfPagesValidationFailure` (FunctionDeclaration) — `export function getReadPdfPagesValidationFailure( filePath: string, pages: string | undefined, ): ReadPdfPagesValidationFailure | undefined { if (pages === undefined || !filePath.toLowerCase().endsWit`
- `GetWorkflowRunActorSchema` (VariableDeclaration) — `z.ZodObject<{ siteId: z.ZodString; ordinal: z.ZodNumber; name: z.ZodOptional<z.ZodString>; }, "strict", z.ZodTypeAny, { siteId: string; ordinal: number; name?: string | undefined; }, { siteId: string;`
- `GetWorkflowRunArtifactSchema` (VariableDeclaration) — `z.ZodObject<{ id: z.ZodString; kind: z.ZodEnum<["file", "markdown", "chart", "table", "metrics", "board"]>; title: z.ZodOptional<z.ZodString>; version: z.ZodNumber; contentType: z.ZodOptional<z.ZodStr`
- `GetWorkflowRunConcurrencyHealthSchema` (VariableDeclaration) — `z.ZodObject<{ effective: z.ZodNumber; cap: z.ZodNumber; reason: z.ZodOptional<z.ZodString>; since: z.ZodOptional<z.ZodNumber>; }, "strict", z.ZodTypeAny, { effective: number; cap: number; reason?: str`
- `GetWorkflowRunErrorSchema` (VariableDeclaration) — `z.ZodObject<{ code: z.ZodString; message: z.ZodString; providerStop: z.ZodOptional<z.ZodObject<{ kind: z.ZodEnum<["auth", "not_configured", "model_unavailable", "invalid_request", "quota", "other"]>; `
- `GetWorkflowRunHealth` (TypeAliasDeclaration) — `{ consecutiveFailures: number; cachedSteps: number; pendingQuestionsKnown: boolean; lastProgressAt?: number | undefined; stalledSince?: number | undefined; concurrency?: { effective: number; cap: numb`
- `GetWorkflowRunHealthSchema` (VariableDeclaration) — `z.ZodObject<{ lastProgressAt: z.ZodOptional<z.ZodNumber>; stalledSince: z.ZodOptional<z.ZodNumber>; concurrency: z.ZodOptional<z.ZodObject<{ effective: z.ZodNumber; cap: z.ZodNumber; reason: z.ZodOpti`
- `GetWorkflowRunInput` (TypeAliasDeclaration) — `{ run_id: string; }`
- `GetWorkflowRunInputJsonSchema` (VariableDeclaration) — `import("../index.js").JsonSchema`
- `GetWorkflowRunInputSchema` (VariableDeclaration) — `z.ZodObject<{ run_id: z.ZodString; }, "strict", z.ZodTypeAny, { run_id: string; }, { run_id: string; }>`
- `GetWorkflowRunLogEntrySchema` (VariableDeclaration) — `z.ZodObject<{ sequence: z.ZodNumber; message: z.ZodString; at: z.ZodOptional<z.ZodNumber>; }, "strict", z.ZodTypeAny, { message: string; sequence: number; at?: number | undefined; }, { message: string`
- `GetWorkflowRunOutput` (TypeAliasDeclaration) — `{ status: "completed" | "errored" | "pending" | "running" | "stopped"; createdAt: number; usage: { nodesRunning: number; spentTokens: number; nodesObserved: number; nodesCompleted: number; nodesFailed`
- `GetWorkflowRunOutputJsonSchema` (VariableDeclaration) — `import("../index.js").JsonSchema`
- `GetWorkflowRunOutputSchema` (VariableDeclaration) — `z.ZodObject<{ runId: z.ZodString; label: z.ZodString; labelSource: z.ZodEnum<["name", "script"]>; status: z.ZodEnum<["completed", "errored", "pending", "running", "stopped"]>; stopReason: z.ZodOptiona`
- `GetWorkflowRunPendingQuestionSchema` (VariableDeclaration) — `z.ZodObject<{ qid: z.ZodString; actor: z.ZodString; actorName: z.ZodOptional<z.ZodString>; question: z.ZodString; context: z.ZodOptional<z.ZodString>; askedAt: z.ZodNumber; }, "strict", z.ZodTypeAny, `
- `GetWorkflowRunPhase` (TypeAliasDeclaration) — `{ name: string; state: "done" | "current" | "ahead" | "unfinished"; rounds: number; nodesSettled: number; nodesRunning: number; enteredAt?: number | undefined; exitedAt?: number | undefined; }`
- `GetWorkflowRunPhaseSchema` (VariableDeclaration) — `z.ZodObject<{ name: z.ZodString; state: z.ZodEnum<["done", "current", "ahead", "unfinished"]>; rounds: z.ZodNumber; nodesSettled: z.ZodNumber; nodesRunning: z.ZodNumber; enteredAt: z.ZodOptional<z.Zod`
- `GetWorkflowRunSubagent` (TypeAliasDeclaration) — `{ state: "failed" | "done" | "unfinished" | "idle" | "executing" | "waiting" | "parked"; siteId: string; ordinal: number; stepsSettled: number; stepsFailed: number; tokens: number; name?: string | und`
- `GetWorkflowRunSubagentAsk` (TypeAliasDeclaration) — `{ siteId: string; ordinal: number; actorSeq?: number | undefined; instructionsHead?: string | undefined; startedAt?: number | undefined; turn?: number | undefined; toolCalls?: number | undefined; last`
- `GetWorkflowRunSubagentAskSchema` (VariableDeclaration) — `z.ZodObject<{ siteId: z.ZodString; ordinal: z.ZodNumber; actorSeq: z.ZodOptional<z.ZodNumber>; instructionsHead: z.ZodOptional<z.ZodString>; startedAt: z.ZodOptional<z.ZodNumber>; turn: z.ZodOptional<`
- `GetWorkflowRunSubagentLastToolSchema` (VariableDeclaration) — `z.ZodObject<{ name: z.ZodString; target: z.ZodOptional<z.ZodString>; at: z.ZodOptional<z.ZodNumber>; }, "strict", z.ZodTypeAny, { name: string; at?: number | undefined; target?: string | undefined; },`
- `GetWorkflowRunSubagentSchema` (VariableDeclaration) — `z.ZodObject<{ siteId: z.ZodString; ordinal: z.ZodNumber; name: z.ZodOptional<z.ZodString>; state: z.ZodEnum<["idle", "executing", "waiting", "parked", "done", "failed", "unfinished"]>; phaseName: z.Zo`
- `GetWorkflowRunSubagentWaitSchema` (VariableDeclaration) — `z.ZodObject<{ cause: z.ZodEnum<["slot", "backoff"]>; reason: z.ZodOptional<z.ZodString>; retryAfterMs: z.ZodOptional<z.ZodNumber>; since: z.ZodOptional<z.ZodNumber>; }, "strict", z.ZodTypeAny, { cause`
- `getWorkflowRunToolResultDisplayErrorSchema` (VariableDeclaration) — `z.ZodObject<{ code: z.ZodString; message: z.ZodString; }, "strict", z.ZodTypeAny, { code: string; message: string; }, { code: string; message: string; }>`
- `getWorkflowRunToolResultDisplayLogEntrySchema` (VariableDeclaration) — `z.ZodObject<{ sequence: z.ZodNumber; message: z.ZodString; at: z.ZodOptional<z.ZodNumber>; }, "strict", z.ZodTypeAny, { message: string; sequence: number; at?: number | undefined; }, { message: string`
- `GetWorkflowRunToolResultDisplayPayload` (TypeAliasDeclaration) — `{ status: "completed" | "errored" | "pending" | "running" | "stopped"; kind: "get_workflow_run"; usage: { nodesRunning: number; spentTokens: number; nodesObserved: number; nodesCompleted: number; node`
- `getWorkflowRunToolResultDisplayPayloadSchema` (VariableDeclaration) — `z.ZodObject<{ kind: z.ZodLiteral<"get_workflow_run">; runId: z.ZodString; label: z.ZodString; status: z.ZodEnum<["completed", "errored", "pending", "running", "stopped"]>; stopReason: z.ZodOptional<z.`
- `getWorkflowRunToolResultDisplaySubagentSchema` (VariableDeclaration) — `z.ZodObject<{ siteId: z.ZodString; ordinal: z.ZodNumber; name: z.ZodOptional<z.ZodString>; state: z.ZodEnum<["idle", "executing", "waiting", "parked", "done", "failed", "unfinished"]>; phaseName: z.Zo`
- `GetWorkflowRunUsageSchema` (VariableDeclaration) — `z.ZodObject<{ spentTokens: z.ZodNumber; nodesObserved: z.ZodNumber; nodesRunning: z.ZodNumber; nodesCompleted: z.ZodNumber; nodesFailed: z.ZodNumber; }, "strict", z.ZodTypeAny, { nodesRunning: number;`
- `GitDiff` (InterfaceDeclaration) — `GitDiff`
- `GlobErrorCode` (VariableDeclaration | TypeAliasDeclaration) — `{ readonly INVALID_PATTERN: "glob_invalid_pattern"; readonly INVALID_PATH: "glob_invalid_path"; readonly PERMISSION_DENIED: "glob_permission_denied"; readonly IO_ERROR: "glob_io_error"; }`
- `GlobInput` (TypeAliasDeclaration) — `{ pattern: string; path?: string | undefined; }`
- `GlobInputJsonSchema` (VariableDeclaration) — `import("../index.js").JsonSchema`
- `GlobInputSchema` (VariableDeclaration) — `z.ZodObject<{ pattern: z.ZodString; path: z.ZodOptional<z.ZodString>; }, "strip", z.ZodTypeAny, { pattern: string; path?: string | undefined; }, { pattern: string; path?: string | undefined; }>`
- `GlobOutput` (InterfaceDeclaration) — `GlobOutput`
- `GlobOutputJsonSchema` (VariableDeclaration) — `import("../index.js").JsonSchema`
- `GlobOutputSchema` (VariableDeclaration) — `z.ZodObject<{ durationMs: z.ZodNumber; numFiles: z.ZodNumber; filenames: z.ZodArray<z.ZodString, "many">; truncated: z.ZodBoolean; }, "strict", z.ZodTypeAny, { truncated: boolean; durationMs: number; `
- `GlobToolCall` (InterfaceDeclaration) — `GlobToolCall`
- `GlobToolResult` (InterfaceDeclaration) — `GlobToolResult`
- `GOAL_COMPLETION_VERIFICATION_FALLBACK_REASON` (VariableDeclaration) — `"The completion verifier could not confirm that every goal requirement is complete."`
- `GOAL_COMPLETION_VERIFICATION_QUERY_SOURCE` (VariableDeclaration) — `"target_completion_verification"`
- `GoalCompletionVerificationOutput` (TypeAliasDeclaration) — `{ reason: string; passed: boolean; nextAction?: string | undefined; }`
- `GoalCompletionVerificationOutputSchema` (VariableDeclaration) — `z.ZodObject<{ nextAction: z.ZodOptional<z.ZodString>; passed: z.ZodBoolean; reason: z.ZodString; }, "strict", z.ZodTypeAny, { reason: string; passed: boolean; nextAction?: string | undefined; }, { rea`
- `GoalObjectiveSchema` (VariableDeclaration) — `z.ZodEffects<z.ZodEffects<z.ZodEffects<z.ZodString, string, string>, string, string>, string, string>`
- `GoalReadInput` (TypeAliasDeclaration) — `{}`
- `GoalReadInputJsonSchema` (VariableDeclaration) — `import("../index.js").JsonSchema`
- `GoalReadInputSchema` (VariableDeclaration) — `z.ZodObject<{}, "strict", z.ZodTypeAny, {}, {}>`
- `GoalReadOutput` (InterfaceDeclaration) — `GoalReadOutput`
- `GoalReadOutputJsonSchema` (VariableDeclaration) — `import("../index.js").JsonSchema`
- `GoalReadOutputSchema` (VariableDeclaration) — `z.ZodObject<{ goal: z.ZodNullable<z.ZodObject<{ sessionID: z.ZodString; targetID: z.ZodString; objective: z.ZodString; summaryTitle: z.ZodNullable<z.ZodString>; status: z.ZodEnum<["active", "paused", `
- `GoalStatus` (VariableDeclaration | TypeAliasDeclaration) — `{ readonly Active: "active"; readonly Paused: "paused"; readonly BudgetLimited: "budget_limited"; readonly Complete: "complete"; }`
- `GoalStatusSchema` (VariableDeclaration) — `z.ZodEnum<["active", "paused", "budget_limited", "complete"]>`
- `GoalTokenBudgetSchema` (VariableDeclaration) — `z.ZodNullable<z.ZodNumber>`
- `GrepErrorCode` (VariableDeclaration | TypeAliasDeclaration) — `{ readonly INVALID_PATTERN: "grep_invalid_pattern"; readonly INVALID_PATH: "grep_invalid_path"; readonly PERMISSION_DENIED: "grep_permission_denied"; readonly TOO_LARGE: "grep_too_large"; readonly CAN`
- `GrepInput` (TypeAliasDeclaration) — `{ pattern: string; path?: string | undefined; type?: string | undefined; context?: number | undefined; glob?: string | undefined; output_mode?: "content" | "count" | "files_with_matches" | undefined; `
- `GrepInputJsonSchema` (VariableDeclaration) — `import("../index.js").JsonSchema`
- `GrepInputSchema` (VariableDeclaration) — `z.ZodObject<{ pattern: z.ZodString; path: z.ZodOptional<z.ZodString>; glob: z.ZodOptional<z.ZodString>; output_mode: z.ZodOptional<z.ZodEnum<["content", "files_with_matches", "count"]>>; "-B": z.ZodOp`
- `GrepOutput` (InterfaceDeclaration) — `GrepOutput`
- `GrepOutputJsonSchema` (VariableDeclaration) — `import("../index.js").JsonSchema`
- `GrepOutputMode` (VariableDeclaration | TypeAliasDeclaration) — `{ readonly Content: "content"; readonly FilesWithMatches: "files_with_matches"; readonly Count: "count"; }`
- `GrepOutputSchema` (VariableDeclaration) — `z.ZodObject<{ mode: z.ZodEnum<["content", "files_with_matches", "count"]>; durationMs: z.ZodNumber; numFiles: z.ZodNumber; filenames: z.ZodArray<z.ZodString, "many">; content: z.ZodOptional<z.ZodStrin`
- `GrepToolCall` (InterfaceDeclaration) — `GrepToolCall`
- `GrepToolResult` (InterfaceDeclaration) — `GrepToolResult`
- `hasRelativeDelayMinutes` (FunctionDeclaration) — `export function hasRelativeDelayMinutes(input: { delayMinutes?: number | null }): boolean { return typeof input.delayMinutes === "number"; }`
- `isTodoToolName` (FunctionDeclaration) — `export function isTodoToolName(value: string | undefined): value is "TodoRead" | "TodoWrite" { return value === "TodoRead" || value === "TodoWrite"; }`
- `isValidSavedWorkflowName` (FunctionDeclaration) — `export function isValidSavedWorkflowName(name: string): boolean { if (name.length === 0 || name.length > SAVED_WORKFLOW_MAX_NAME_CHARS) return false; if (!SAVED_WORKFLOW_NAME_PATTERN.test(name)) retur`
- `isWorkspaceMutatingToolCall` (FunctionDeclaration) — `export function isWorkspaceMutatingToolCall(capability: { readOnly?: boolean | undefined; sideEffectScope?: ToolSideEffectScope | undefined; }): boolean { if (capability.readOnly === true) return fals`
- `isWorldTouchingToolCall` (FunctionDeclaration) — `export function isWorldTouchingToolCall(capability: { sideEffectScope?: ToolSideEffectScope | undefined; }): boolean { return capability.sideEffectScope === undefined ? true : !PROTOCOL_ONLY_SIDE_EFFE`
- `JsInput` (TypeAliasDeclaration) — `{ code: string; title: string; timeout_ms?: number | undefined; }`
- `JsInputJsonSchema` (VariableDeclaration) — `import("../index.js").JsonSchema`
- `JsInputSchema` (VariableDeclaration) — `z.ZodObject<{ code: z.ZodString; title: z.ZodString; timeout_ms: z.ZodOptional<z.ZodNumber>; }, "strict", z.ZodTypeAny, { code: string; title: string; timeout_ms?: number | undefined; }, { code: strin`
- `JsOutput` (TypeAliasDeclaration) — `{ logs: string; result?: string | undefined; error?: { message: string; name: string; stack?: string | undefined; } | undefined; images?: { mimeType: string; base64: string; }[] | undefined; browserSc`
- `JsOutputJsonSchema` (VariableDeclaration) — `import("../index.js").JsonSchema`
- `JsOutputSchema` (VariableDeclaration) — `z.ZodObject<{ result: z.ZodOptional<z.ZodString>; logs: z.ZodString; error: z.ZodOptional<z.ZodObject<{ name: z.ZodString; message: z.ZodString; stack: z.ZodOptional<z.ZodString>; }, "strip", z.ZodTyp`
- `JsRuntimeInput` (TypeAliasDeclaration) — `{ code: string; title?: string | undefined; timeout_ms?: number | undefined; }`
- `JsRuntimeInputSchema` (VariableDeclaration) — `z.ZodObject<{ code: z.ZodString; timeout_ms: z.ZodOptional<z.ZodNumber>; title: z.ZodOptional<z.ZodString>; }, "strict", z.ZodTypeAny, { code: string; title?: string | undefined; timeout_ms?: number |`
- `LIST_MODELS_TOOL_NAME` (VariableDeclaration) — `"ListModels"`
- `LIST_SAVED_WORKFLOWS_TOOL_NAME` (VariableDeclaration) — `"ListSavedWorkflows"`
- `LIST_WORKFLOW_RUNS_DEFAULT_LIMIT` (VariableDeclaration) — `20`
- `LIST_WORKFLOW_RUNS_MAX_LIMIT` (VariableDeclaration) — `50`
- `LIST_WORKFLOW_RUNS_MIN_LIMIT` (VariableDeclaration) — `1`
- `LIST_WORKFLOW_RUNS_TOOL_NAME` (VariableDeclaration) — `"ListWorkflowRuns"`
- `ListModelsEntry` (TypeAliasDeclaration) — `{ providerId: string; modelId: string; id: string; reasoningLevels: string[]; providerLabel?: string | undefined; defaultReasoningLevel?: string | undefined; contextWindow?: number | undefined; disabl`
- `ListModelsEntrySchema` (VariableDeclaration) — `z.ZodObject<{ id: z.ZodString; providerId: z.ZodString; modelId: z.ZodString; providerLabel: z.ZodOptional<z.ZodString>; reasoningLevels: z.ZodArray<z.ZodString, "many">; defaultReasoningLevel: z.ZodO`
- `ListModelsInput` (TypeAliasDeclaration) — `{}`
- `ListModelsInputJsonSchema` (VariableDeclaration) — `import("../index.js").JsonSchema`
- `ListModelsInputSchema` (VariableDeclaration) — `z.ZodObject<{}, "strict", z.ZodTypeAny, {}, {}>`
- `ListModelsOutput` (TypeAliasDeclaration) — `{ models: { providerId: string; modelId: string; id: string; reasoningLevels: string[]; providerLabel?: string | undefined; defaultReasoningLevel?: string | undefined; contextWindow?: number | undefin`
- `ListModelsOutputJsonSchema` (VariableDeclaration) — `import("../index.js").JsonSchema`
- `ListModelsOutputSchema` (VariableDeclaration) — `z.ZodObject<{ current: z.ZodOptional<z.ZodString>; models: z.ZodArray<z.ZodObject<{ id: z.ZodString; providerId: z.ZodString; modelId: z.ZodString; providerLabel: z.ZodOptional<z.ZodString>; reasoning`
- `ListModelsToolResultDisplayPayload` (TypeAliasDeclaration) — `{ kind: "list_models"; models: { providerId: string; modelId: string; id: string; reasoningLevels: string[]; providerLabel?: string | undefined; defaultReasoningLevel?: string | undefined; contextWind`
- `listModelsToolResultDisplayPayloadSchema` (VariableDeclaration) — `z.ZodObject<{ kind: z.ZodLiteral<"list_models">; current: z.ZodOptional<z.ZodString>; models: z.ZodArray<z.ZodObject<{ id: z.ZodString; providerId: z.ZodString; modelId: z.ZodString; providerLabel: z.`
- `ListSavedWorkflowsInput` (TypeAliasDeclaration) — `{}`
- `ListSavedWorkflowsInputJsonSchema` (VariableDeclaration) — `import("../index.js").JsonSchema`
- `ListSavedWorkflowsInputSchema` (VariableDeclaration) — `z.ZodObject<{}, "strict", z.ZodTypeAny, {}, {}>`
- `ListSavedWorkflowsOutput` (TypeAliasDeclaration) — `{ workflows: { scope: "project" | "global"; path: string; description: string; name: string; args?: Record<string, { type: "string" | "number" | "boolean" | "json"; description?: string | undefined; r`
- `ListSavedWorkflowsOutputJsonSchema` (VariableDeclaration) — `import("../index.js").JsonSchema`
- `ListSavedWorkflowsOutputSchema` (VariableDeclaration) — `z.ZodObject<{ workflows: z.ZodArray<z.ZodObject<{ name: z.ZodString; description: z.ZodString; whenToUse: z.ZodOptional<z.ZodString>; args: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodObject<{ type: z`
- `ListWorkflowRunsInput` (TypeAliasDeclaration) — `{ limit: number; statuses?: ("completed" | "errored" | "pending" | "running" | "stopped")[] | undefined; }`
- `ListWorkflowRunsInputJsonSchema` (VariableDeclaration) — `import("../index.js").JsonSchema`
- `ListWorkflowRunsInputSchema` (VariableDeclaration) — `z.ZodObject<{ limit: z.ZodEffects<z.ZodDefault<z.ZodNumber>, number, unknown>; statuses: z.ZodOptional<z.ZodArray<z.ZodEnum<["completed", "errored", "pending", "running", "stopped"]>, "many">>; }, "st`
- `ListWorkflowRunsOutput` (TypeAliasDeclaration) — `{ runs: { status: "completed" | "errored" | "pending" | "running" | "stopped"; createdAt: number; label: string; runId: string; labelSource: "script" | "name"; ownedByThisSession: boolean; updatedAt: `
- `ListWorkflowRunsOutputJsonSchema` (VariableDeclaration) — `import("../index.js").JsonSchema`
- `ListWorkflowRunsOutputSchema` (VariableDeclaration) — `z.ZodObject<{ runs: z.ZodArray<z.ZodObject<{ runId: z.ZodString; label: z.ZodString; labelSource: z.ZodEnum<["name", "script"]>; status: z.ZodEnum<["completed", "errored", "pending", "running", "stopp`
- `ListWorkflowRunsRun` (TypeAliasDeclaration) — `{ status: "completed" | "errored" | "pending" | "running" | "stopped"; createdAt: number; label: string; runId: string; labelSource: "script" | "name"; ownedByThisSession: boolean; updatedAt: number; `
- `ListWorkflowRunsRunSchema` (VariableDeclaration) — `z.ZodObject<{ runId: z.ZodString; label: z.ZodString; labelSource: z.ZodEnum<["name", "script"]>; status: z.ZodEnum<["completed", "errored", "pending", "running", "stopped"]>; stopReason: z.ZodOptiona`
- `ListWorkflowRunsToolResultDisplayPayload` (TypeAliasDeclaration) — `{ kind: "list_workflow_runs"; runs: { status: "completed" | "errored" | "pending" | "running" | "stopped"; createdAt: number; label: string; runId: string; labelSource: "script" | "name"; ownedByThisS`
- `listWorkflowRunsToolResultDisplayPayloadSchema` (VariableDeclaration) — `z.ZodObject<{ kind: z.ZodLiteral<"list_workflow_runs">; runs: z.ZodArray<z.ZodObject<{ runId: z.ZodString; label: z.ZodString; labelSource: z.ZodEnum<["name", "script"]>; status: z.ZodEnum<["completed`
- `LocalAgentMessageToolResultDisplayPayload` (TypeAliasDeclaration) — `{ status: "failed" | "success"; kind: "local_agent_message"; message?: string | undefined; error?: string | undefined; }`
- `localAgentMessageToolResultDisplayPayloadSchema` (VariableDeclaration) — `z.ZodObject<{ kind: z.ZodLiteral<"local_agent_message">; status: z.ZodEnum<["success", "failed"]>; error: z.ZodOptional<z.ZodString>; message: z.ZodOptional<z.ZodString>; }, "strict", z.ZodTypeAny, { `
- `MAX_GOAL_OBJECTIVE_CHARS` (VariableDeclaration) — `4000`
- `MCP_TOOL_DISPLAY_MAX_DESCRIPTION_CHARS` (VariableDeclaration) — `number`
- `MCP_TOOL_DISPLAY_MAX_NAME_CHARS` (VariableDeclaration) — `256`
- `McpToolResultDisplayPayload` (TypeAliasDeclaration) — `{ kind: "mcp_tool"; toolName: string; serverName: string; unavailable?: { code: "quota_exceeded" | "coding_plan_required"; } | undefined; description?: string | undefined; }`
- `mcpToolResultDisplayPayloadSchema` (VariableDeclaration) — `z.ZodObject<{ kind: z.ZodLiteral<"mcp_tool">; serverName: z.ZodString; toolName: z.ZodString; description: z.ZodOptional<z.ZodString>; unavailable: z.ZodOptional<z.ZodObject<{ code: z.ZodEnum<["quota_`
- `NodeReplCuaAppDisplay` (TypeAliasDeclaration) — `{ appKey: string; displayName?: string | undefined; }`
- `nodeReplCuaAppDisplaySchema` (VariableDeclaration) — `z.ZodObject<{ appKey: z.ZodString; displayName: z.ZodOptional<z.ZodString>; }, "strict", z.ZodTypeAny, { appKey: string; displayName?: string | undefined; }, { appKey: string; displayName?: string | u`
- `NodeReplImageToolResultDisplayPayload` (TypeAliasDeclaration) — `{ kind: "node_repl_images"; source?: "browser_turn_end" | undefined; truncated?: boolean | undefined; images?: { mimeType: string; base64: string; }[] | undefined; app?: { appKey: string; displayName?`
- `nodeReplImageToolResultDisplayPayloadSchema` (VariableDeclaration) — `z.ZodObject<{ kind: z.ZodLiteral<"node_repl_images">; images: z.ZodOptional<z.ZodArray<z.ZodObject<{ base64: z.ZodString; mimeType: z.ZodString; }, "strict", z.ZodTypeAny, { mimeType: string; base64: `
- `normalizeGoalObjective` (FunctionDeclaration) — `export function normalizeGoalObjective(value: string): string { return GoalObjectiveSchema.parse(value); }`
- `normalizeToolJsonSchema` (FunctionDeclaration) — `export function normalizeToolJsonSchema(schema: JsonSchema): JsonSchema { // 显式保存每层迭代位置，保留旧深度优先次序；反向压入全部节点会改变跨角色别名的结果。 // 按身份去重防止循环，生成器只产出下一条边，不互相递归，深层结构不再耗尽调用栈。 const pending: Iterator<unknown>[] = [`
- `NotebookCell` (InterfaceDeclaration) — `NotebookCell`
- `NoToolTimeoutPolicy` (InterfaceDeclaration) — `NoToolTimeoutPolicy`
- `OffPeakCreateInput` (TypeAliasDeclaration) — `{ prompt: string; title: string; model?: string | undefined; permissionMode?: "build" | "edit" | "plan" | "yolo" | undefined; thoughtLevel?: string | undefined; }`
- `OffPeakCreateInputJsonSchema` (VariableDeclaration) — `import("../index.js").JsonSchema`
- `OffPeakCreateInputSchema` (VariableDeclaration) — `z.ZodObject<{ title: z.ZodString; prompt: z.ZodString; permissionMode: z.ZodOptional<z.ZodEnum<["build", "edit", "plan", "yolo"]>>; model: z.ZodOptional<z.ZodString>; thoughtLevel: z.ZodOptional<z.Zod`
- `OffPeakCreateOutput` (TypeAliasDeclaration) — `{ message: string; task: { status: "completed" | "running" | "failed" | "paused" | "cancelled" | "queued"; createdAt: number; title: string; offPeakTaskId: string; queuePosition?: number | undefined; `
- `OffPeakCreateOutputJsonSchema` (VariableDeclaration) — `import("../index.js").JsonSchema`
- `OffPeakCreateOutputSchema` (VariableDeclaration) — `z.ZodObject<{ task: z.ZodObject<{ offPeakTaskId: z.ZodString; title: z.ZodString; status: z.ZodEnum<["queued", "paused", "running", "completed", "failed", "cancelled"]>; queuePosition: z.ZodOptional<z`
- `OffPeakListInput` (TypeAliasDeclaration) — `{}`
- `OffPeakListInputJsonSchema` (VariableDeclaration) — `import("../index.js").JsonSchema`
- `OffPeakListInputSchema` (VariableDeclaration) — `z.ZodObject<{}, "strict", z.ZodTypeAny, {}, {}>`
- `OffPeakListOutput` (TypeAliasDeclaration) — `{ tasks: { status: "completed" | "running" | "failed" | "paused" | "cancelled" | "queued"; createdAt: number; title: string; offPeakTaskId: string; queuePosition?: number | undefined; sessionId?: stri`
- `OffPeakListOutputJsonSchema` (VariableDeclaration) — `import("../index.js").JsonSchema`
- `OffPeakListOutputSchema` (VariableDeclaration) — `z.ZodObject<{ tasks: z.ZodArray<z.ZodObject<{ offPeakTaskId: z.ZodString; title: z.ZodString; status: z.ZodEnum<["queued", "paused", "running", "completed", "failed", "cancelled"]>; queuePosition: z.Z`
- `OffPeakTaskStatus` (TypeAliasDeclaration) — `"completed" | "running" | "failed" | "paused" | "cancelled" | "queued"`
- `OffPeakTaskStatusSchema` (VariableDeclaration) — `z.ZodEnum<["queued", "paused", "running", "completed", "failed", "cancelled"]>`
- `OffPeakTaskSummary` (TypeAliasDeclaration) — `{ status: "completed" | "running" | "failed" | "paused" | "cancelled" | "queued"; createdAt: number; title: string; offPeakTaskId: string; queuePosition?: number | undefined; sessionId?: string | unde`
- `OffPeakTaskSummarySchema` (VariableDeclaration) — `z.ZodObject<{ offPeakTaskId: z.ZodString; title: z.ZodString; status: z.ZodEnum<["queued", "paused", "running", "completed", "failed", "cancelled"]>; queuePosition: z.ZodOptional<z.ZodNumber>; session`
- `parseCompletedToolPartMetadata` (FunctionDeclaration) — `export function parseCompletedToolPartMetadata( input: unknown, ): CompletedToolPartMetadata | undefined { const scrubbed = isPlainRecord(input) && "display" in input ? { ...input, display: scrubPersi`
- `ParsedTodoReadOutput` (TypeAliasDeclaration) — `{ todos: { status: "completed" | "pending" | "in_progress"; content: string; priority: "high" | "medium" | "low"; }[]; }`
- `ParsedTodoWriteOutput` (TypeAliasDeclaration) — `{ summary: { completed: number; pending: number; total: number; inProgress: number; }; todos: { status: "completed" | "pending" | "in_progress"; content: string; priority: "high" | "medium" | "low"; }`
- `parseGoalCompletionVerificationText` (FunctionDeclaration) — `export function parseGoalCompletionVerificationText( text: string, ): GoalCompletionVerificationOutput { const parsed = parseJsonObject(text); if (!parsed) { // verifier 是 goal 完成闸门，但 provider 偶发坏 JSO`
- `parseReadPdfPageRange` (FunctionDeclaration) — `export function parseReadPdfPageRange(value: string): ReadPdfPageRange | undefined { const normalized = value.trim(); if (/^\d+-$/u.test(normalized)) { const firstPage = Number(normalized.slice(0, -1)`
- `parseToolResultDisplayPayload` (FunctionDeclaration) — `export function parseToolResultDisplayPayload( input: unknown, ): ToolResultDisplayPayload | undefined { const result = toolResultDisplayPayloadSchema.safeParse(scrubPersistedDisplay(input)); return r`
- `PatchExecutionTelemetry` (TypeAliasDeclaration) — `{ matchMs?: number | undefined; hunkCount?: number | undefined; matchAttempts?: number | undefined; }`
- `PatchExecutionTelemetrySchema` (VariableDeclaration) — `z.ZodObject<{ matchMs: z.ZodOptional<z.ZodNumber>; hunkCount: z.ZodOptional<z.ZodNumber>; matchAttempts: z.ZodOptional<z.ZodNumber>; }, "strict", z.ZodTypeAny, { matchMs?: number | undefined; hunkCoun`
- `PLAN_MODE_MAX_PLAN_CHARS` (VariableDeclaration) — `20000`
- `ProviderNativeToolSpec` (InterfaceDeclaration) — `ProviderNativeToolSpec`
- `READ_DEFAULT_MAX_LINES` (VariableDeclaration) — `2000`
- `READ_IMAGE_MAX_BASE64_BYTES` (VariableDeclaration) — `number`
- `READ_IMAGE_MAX_DIMENSION` (VariableDeclaration) — `2000`
- `READ_IMAGE_MAX_INPUT_BYTES` (VariableDeclaration) — `number`
- `READ_IMAGE_TARGET_BYTES` (VariableDeclaration) — `number`
- `READ_IMAGE_TOKEN_TO_BASE64_CHAR_RATIO` (VariableDeclaration) — `0.125`
- `READ_MAX_FILE_SIZE_BYTES` (VariableDeclaration) — `number`
- `READ_MAX_OUTPUT_TOKENS` (VariableDeclaration) — `25000`
- `READ_PDF_AVAILABILITY_TIMEOUT_MS` (VariableDeclaration) — `5000`
- `READ_PDF_EXTRACT_MAX_INPUT_BYTES` (VariableDeclaration) — `number`
- `READ_PDF_INFO_TIMEOUT_MS` (VariableDeclaration) — `10000`
- `READ_PDF_MAX_PAGES_PER_REQUEST` (VariableDeclaration) — `20`
- `READ_PDF_NATIVE_MAX_INPUT_BYTES` (VariableDeclaration) — `number`
- `READ_PDF_NATIVE_MAX_PAGES` (VariableDeclaration) — `10`
- `READ_PDF_PAGES_DESCRIPTION` (VariableDeclaration) — `"Page range for PDF files (e.g., \"1-5\", \"3\", \"10-20\"). Only applicable to PDF files. Maximum 20 pages per request."`
- `READ_PDF_RENDER_TIMEOUT_MS` (VariableDeclaration) — `120000`
- `READ_SESSION_CONTEXT_DEFAULT_MAX_TOKENS` (VariableDeclaration) — `6000`
- `READ_SESSION_CONTEXT_MAX_TOKENS` (VariableDeclaration) — `12000`
- `READ_SESSION_CONTEXT_TOOL_NAME` (VariableDeclaration) — `"ReadSessionContext"`
- `READ_VIDEO_MAX_INPUT_BYTES` (VariableDeclaration) — `number`
- `ReadCellOutputSchema` (VariableDeclaration) — `z.ZodObject<{ type: z.ZodEnum<["stream", "execute_result", "error", "display_data"]>; text: z.ZodString; metadata: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodUnknown>>; }, "strict", z.ZodTypeAny, { t`
- `ReadErrorCode` (VariableDeclaration | TypeAliasDeclaration) — `{ readonly PDF_INVALID_PAGES: 7; readonly PDF_PAGE_RANGE_TOO_LARGE: 8; readonly PDF_PAGES_IMAGES_UNSUPPORTED: 10; readonly PDF_CONFIGURATION_ERROR: 11; readonly PDF_INVALID: 12; readonly PDF_TOO_LARGE`
- `ReadFileState` (InterfaceDeclaration) — `ReadFileState`
- `ReadImageDimensionsSchema` (VariableDeclaration) — `z.ZodObject<{ originalWidth: z.ZodOptional<z.ZodNumber>; originalHeight: z.ZodOptional<z.ZodNumber>; displayWidth: z.ZodOptional<z.ZodNumber>; displayHeight: z.ZodOptional<z.ZodNumber>; }, "strict", z`
- `ReadImageOutput` (InterfaceDeclaration) — `ReadImageOutput`
- `ReadImageOutputSchema` (VariableDeclaration) — `z.ZodObject<{ type: z.ZodLiteral<"image">; base64: z.ZodString; mimeType: z.ZodEnum<["image/jpeg", "image/png", "image/gif", "image/webp"]>; originalSize: z.ZodNumber; transformedSize: z.ZodOptional<z`
- `ReadInput` (TypeAliasDeclaration) — `{ file_path: string; offset?: number | undefined; limit?: number | undefined; pages?: string | undefined; }`
- `ReadInputJsonSchema` (VariableDeclaration) — `import("../index.js").JsonSchema`
- `ReadInputSchema` (VariableDeclaration) — `z.ZodEffects<z.ZodObject<{ file_path: z.ZodString; offset: z.ZodOptional<z.ZodNumber>; limit: z.ZodOptional<z.ZodNumber>; } & { pages: z.ZodOptional<z.ZodString>; }, "strip", z.ZodTypeAny, { file_path`
- `ReadNotebookCellSchema` (VariableDeclaration) — `z.ZodObject<{ cellType: z.ZodEnum<["code", "markdown"]>; source: z.ZodString; outputs: z.ZodOptional<z.ZodArray<z.ZodObject<{ type: z.ZodEnum<["stream", "execute_result", "error", "display_data"]>; te`
- `ReadNotebookOutput` (InterfaceDeclaration) — `ReadNotebookOutput`
- `ReadNotebookOutputSchema` (VariableDeclaration) — `z.ZodObject<{ type: z.ZodLiteral<"notebook">; notebookPath: z.ZodString; cells: z.ZodArray<z.ZodObject<{ cellType: z.ZodEnum<["code", "markdown"]>; source: z.ZodString; outputs: z.ZodOptional<z.ZodArr`
- `ReadOutput` (TypeAliasDeclaration) — `ReadImageOutput | ReadNotebookOutput | ReadTextOutput | ReadVideoOutput | ReadPdfOutput | ReadPartsOutput | ReadUnchangedOutput`
- `ReadOutputJsonSchema` (VariableDeclaration) — `import("../index.js").JsonSchema`
- `ReadOutputSchema` (VariableDeclaration) — `z.ZodUnion<[z.ZodObject<{ type: z.ZodLiteral<"text">; filePath: z.ZodString; content: z.ZodString; numLines: z.ZodNumber; startLine: z.ZodNumber; totalLines: z.ZodNumber; sizeBytes: z.ZodOptional<z.Zo`
- `ReadPartsOutput` (InterfaceDeclaration) — `ReadPartsOutput`
- `ReadPartsOutputSchema` (VariableDeclaration) — `z.ZodObject<{ type: z.ZodLiteral<"parts">; filePath: z.ZodString; numParts: z.ZodNumber; originalSize: z.ZodNumber; pages: z.ZodArray<z.ZodObject<{ type: z.ZodLiteral<"image">; base64: z.ZodString; mi`
- `ReadPdfInputJsonSchema` (VariableDeclaration) — `import("../index.js").JsonSchema`
- `ReadPdfOutput` (InterfaceDeclaration) — `ReadPdfOutput`
- `ReadPdfOutputSchema` (VariableDeclaration) — `z.ZodObject<{ type: z.ZodLiteral<"pdf">; filePath: z.ZodString; base64: z.ZodString; originalSize: z.ZodNumber; pages: z.ZodOptional<z.ZodString>; }, "strict", z.ZodTypeAny, { type: "pdf"; filePath: s`
- `ReadPdfPageRange` (InterfaceDeclaration) — `ReadPdfPageRange`
- `ReadPdfPagesValidationFailure` (InterfaceDeclaration) — `ReadPdfPagesValidationFailure`
- `ReadSessionContextInput` (TypeAliasDeclaration) — `{ strategy: "relevant" | "handoff"; sessionId: string; query: string; maxTokens?: number | undefined; }`
- `ReadSessionContextInputJsonSchema` (VariableDeclaration) — `import("../index.js").JsonSchema`
- `ReadSessionContextInputSchema` (VariableDeclaration) — `z.ZodObject<{ sessionId: z.ZodString; query: z.ZodString; strategy: z.ZodDefault<z.ZodOptional<z.ZodEnum<["relevant", "handoff"]>>>; maxTokens: z.ZodOptional<z.ZodNumber>; }, "strict", z.ZodTypeAny, {`
- `ReadSessionContextOutput` (TypeAliasDeclaration) — `{ status: "failed" | "success" | "not_found"; strategy: "relevant" | "handoff"; content: string; source: "local" | "none" | "lite" | "fallback"; truncated: boolean; sessionId: string; query: string; m`
- `ReadSessionContextOutputJsonSchema` (VariableDeclaration) — `import("../index.js").JsonSchema`
- `ReadSessionContextOutputSchema` (VariableDeclaration) — `z.ZodObject<{ status: z.ZodEnum<["success", "not_found", "failed"]>; sessionId: z.ZodString; title: z.ZodOptional<z.ZodString>; directory: z.ZodOptional<z.ZodString>; path: z.ZodOptional<z.ZodString>;`
- `ReadSessionContextReference` (TypeAliasDeclaration) — `{ messageId: string; reason?: string | undefined; index?: number | undefined; partId?: string | undefined; role?: "user" | "assistant" | undefined; }`
- `ReadSessionContextReferenceSchema` (VariableDeclaration) — `z.ZodObject<{ messageId: z.ZodString; partId: z.ZodOptional<z.ZodString>; index: z.ZodOptional<z.ZodNumber>; role: z.ZodOptional<z.ZodEnum<["user", "assistant"]>>; reason: z.ZodOptional<z.ZodString>; `
- `ReadSessionContextStrategySchema` (VariableDeclaration) — `z.ZodEnum<["relevant", "handoff"]>`
- `ReadTextOutput` (InterfaceDeclaration) — `ReadTextOutput`
- `ReadTextOutputSchema` (VariableDeclaration) — `z.ZodObject<{ type: z.ZodLiteral<"text">; filePath: z.ZodString; content: z.ZodString; numLines: z.ZodNumber; startLine: z.ZodNumber; totalLines: z.ZodNumber; sizeBytes: z.ZodOptional<z.ZodNumber>; by`
- `ReadToolCall` (InterfaceDeclaration) — `ReadToolCall`
- `ReadToolResult` (InterfaceDeclaration) — `ReadToolResult`
- `ReadUnchangedOutput` (InterfaceDeclaration) — `ReadUnchangedOutput`
- `ReadUnchangedOutputSchema` (VariableDeclaration) — `z.ZodObject<{ type: z.ZodLiteral<"file_unchanged">; filePath: z.ZodString; }, "strict", z.ZodTypeAny, { type: "file_unchanged"; filePath: string; }, { type: "file_unchanged"; filePath: string; }>`
- `ReadVideoOutput` (InterfaceDeclaration) — `ReadVideoOutput`
- `ReadVideoOutputSchema` (VariableDeclaration) — `z.ZodObject<{ type: z.ZodLiteral<"video">; base64: z.ZodString; mimeType: z.ZodEnum<["video/mp4", "video/quicktime", "video/webm", "video/x-matroska", "video/x-m4v", "video/x-msvideo"]>; originalSize:`
- `RESOLVE_WORKFLOW_QUESTION_TOOL_NAME` (VariableDeclaration) — `"ResolveWorkflowQuestion"`
- `ResolveWorkflowQuestionInput` (TypeAliasDeclaration) — `{ question_id: string; answer: string; }`
- `ResolveWorkflowQuestionInputJsonSchema` (VariableDeclaration) — `import("../index.js").JsonSchema`
- `ResolveWorkflowQuestionInputSchema` (VariableDeclaration) — `z.ZodObject<{ question_id: z.ZodString; answer: z.ZodString; }, "strict", z.ZodTypeAny, { question_id: string; answer: string; }, { question_id: string; answer: string; }>`
- `ResolveWorkflowQuestionOutput` (TypeAliasDeclaration) — `{ ok: true; response: string; qid: string; }`
- `ResolveWorkflowQuestionOutputJsonSchema` (VariableDeclaration) — `import("../index.js").JsonSchema`
- `ResolveWorkflowQuestionOutputSchema` (VariableDeclaration) — `z.ZodObject<{ ok: z.ZodLiteral<true>; qid: z.ZodString; response: z.ZodString; }, "strict", z.ZodTypeAny, { ok: true; response: string; qid: string; }, { ok: true; response: string; qid: string; }>`
- `RESPOND_TO_COORDINATOR_MAX_CONTENT_CHARS` (VariableDeclaration) — `20000`
- `RESPOND_TO_COORDINATOR_TOOL_NAME` (VariableDeclaration) — `"RespondToCoordinator"`
- `RespondToCoordinatorInput` (TypeAliasDeclaration) — `{ message: string; summary: string; }`
- `RespondToCoordinatorInputJsonSchema` (VariableDeclaration) — `import("../index.js").JsonSchema`
- `RespondToCoordinatorInputSchema` (VariableDeclaration) — `z.ZodObject<{ summary: z.ZodString; message: z.ZodString; }, "strict", z.ZodTypeAny, { message: string; summary: string; }, { message: string; summary: string; }>`
- `RespondToCoordinatorOutput` (TypeAliasDeclaration) — `{ status: "failed" | "success"; message: string; responseId: string; error?: string | undefined; }`
- `RespondToCoordinatorOutputSchema` (VariableDeclaration) — `z.ZodObject<{ status: z.ZodEnum<["success", "failed"]>; responseId: z.ZodString; message: z.ZodString; error: z.ZodOptional<z.ZodString>; }, "strict", z.ZodTypeAny, { status: "failed" | "success"; mes`
- `RespondToCoordinatorToolResultDisplayPayload` (TypeAliasDeclaration) — `{ status: "failed" | "success"; kind: "respond_to_coordinator"; }`
- `respondToCoordinatorToolResultDisplayPayloadSchema` (VariableDeclaration) — `z.ZodObject<{ kind: z.ZodLiteral<"respond_to_coordinator">; status: z.ZodEnum<["success", "failed"]>; }, "strict", z.ZodTypeAny, { status: "failed" | "success"; kind: "respond_to_coordinator"; }, { st`
- `RESUME_WORKFLOW_RUN_TOOL_NAME` (VariableDeclaration) — `"ResumeWorkflowRun"`
- `ResumeWorkflowRunInput` (TypeAliasDeclaration) — `{ run_id: string; }`
- `ResumeWorkflowRunInputJsonSchema` (VariableDeclaration) — `import("../index.js").JsonSchema`
- `ResumeWorkflowRunInputSchema` (VariableDeclaration) — `z.ZodObject<{ run_id: z.ZodString; }, "strict", z.ZodTypeAny, { run_id: string; }, { run_id: string; }>`
- `ResumeWorkflowRunOutput` (TypeAliasDeclaration) — `{ status: "backgrounded"; backgroundTaskId: string; ok: true; response: string; runId: string; }`
- `ResumeWorkflowRunOutputJsonSchema` (VariableDeclaration) — `import("../index.js").JsonSchema`
- `ResumeWorkflowRunOutputSchema` (VariableDeclaration) — `z.ZodObject<{ ok: z.ZodLiteral<true>; runId: z.ZodString; response: z.ZodString; status: z.ZodLiteral<"backgrounded">; backgroundTaskId: z.ZodString; }, "strict", z.ZodTypeAny, { status: "backgrounded`
- `ResumeWorkflowRunToolResultDisplayPayload` (TypeAliasDeclaration) — `{ kind: "resume_workflow_run"; runId: string; }`
- `resumeWorkflowRunToolResultDisplayPayloadSchema` (VariableDeclaration) — `z.ZodObject<{ kind: z.ZodLiteral<"resume_workflow_run">; runId: z.ZodString; }, "strict", z.ZodTypeAny, { kind: "resume_workflow_run"; runId: string; }, { kind: "resume_workflow_run"; runId: string; }`
- `SAVE_WORKFLOW_SENTINEL_IN_SCRIPT_ERROR` (VariableDeclaration) — `"The `script`must be the workflow body only — it already starts with a`/\* knorvia-workflow`metadata block. Pass the metadata through the`description`/`whenToUse`/`args` fields instead; the blo`
- `SAVE_WORKFLOW_SOURCE_ERROR` (VariableDeclaration) — `"Provide exactly one script source: `script`for the body inline, or`script_path` for the file holding it (a draft, usually). Passing both, or neither, is ambiguous."`
- `SAVE_WORKFLOW_TOOL_NAME` (VariableDeclaration) — `"SaveWorkflow"`
- `SAVED_WORKFLOW_ARG_TYPES` (VariableDeclaration) — `readonly ["string", "number", "boolean", "json"]`
- `SAVED_WORKFLOW_FILE_EXTENSION` (VariableDeclaration) — `".dwf.ts"`
- `SAVED_WORKFLOW_GLOBAL_DIR` (VariableDeclaration) — `".knorvia-studio/workflows"`
- `SAVED_WORKFLOW_MAX_NAME_CHARS` (VariableDeclaration) — `64`
- `SAVED_WORKFLOW_NAME_PATTERN` (VariableDeclaration) — `RegExp`
- `SAVED_WORKFLOW_PROJECT_DIR` (VariableDeclaration) — `".knorvia-studio/workflows"`
- `SAVED_WORKFLOW_SCOPES` (VariableDeclaration) — `readonly ["project", "global"]`
- `SAVED_WORKFLOW_SHADOWING` (VariableDeclaration) — `readonly ["hides_global", "hidden_by_project"]`
- `SavedWorkflowArgDeclaration` (TypeAliasDeclaration) — `{ type: "string" | "number" | "boolean" | "json"; description?: string | undefined; required?: boolean | undefined; default?: unknown; }`
- `SavedWorkflowArgDeclarationSchema` (VariableDeclaration) — `z.ZodObject<{ type: z.ZodEnum<["string", "number", "boolean", "json"]>; description: z.ZodOptional<z.ZodString>; required: z.ZodOptional<z.ZodBoolean>; default: z.ZodOptional<z.ZodUnknown>; }, "strict`
- `SavedWorkflowArgsDeclaration` (TypeAliasDeclaration) — `{ [x: string]: { type: "string" | "number" | "boolean" | "json"; description?: string | undefined; required?: boolean | undefined; default?: unknown; }; }`
- `SavedWorkflowArgsDeclarationSchema` (VariableDeclaration) — `z.ZodRecord<z.ZodString, z.ZodObject<{ type: z.ZodEnum<["string", "number", "boolean", "json"]>; description: z.ZodOptional<z.ZodString>; required: z.ZodOptional<z.ZodBoolean>; default: z.ZodOptional<`
- `SavedWorkflowArgType` (TypeAliasDeclaration) — `"string" | "number" | "boolean" | "json"`
- `SavedWorkflowArgTypeSchema` (VariableDeclaration) — `z.ZodEnum<["string", "number", "boolean", "json"]>`
- `SavedWorkflowEntry` (TypeAliasDeclaration) — `{ scope: "project" | "global"; path: string; description: string; name: string; args?: Record<string, { type: "string" | "number" | "boolean" | "json"; description?: string | undefined; required?: boo`
- `SavedWorkflowEntrySchema` (VariableDeclaration) — `z.ZodObject<{ name: z.ZodString; description: z.ZodString; whenToUse: z.ZodOptional<z.ZodString>; args: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodObject<{ type: z.ZodEnum<["string", "number", "boole`
- `SavedWorkflowInvalidEntry` (TypeAliasDeclaration) — `{ path: string; reason: string; }`
- `SavedWorkflowInvalidEntrySchema` (VariableDeclaration) — `z.ZodObject<{ path: z.ZodString; reason: z.ZodString; }, "strict", z.ZodTypeAny, { path: string; reason: string; }, { path: string; reason: string; }>`
- `SavedWorkflowListToolResultDisplayPayload` (TypeAliasDeclaration) — `{ kind: "saved_workflow_list"; workflows: { scope: string; path: string; name: string; argNames: string[]; description?: string | undefined; whenToUse?: string | undefined; }[]; truncated?: boolean | `
- `savedWorkflowListToolResultDisplayPayloadSchema` (VariableDeclaration) — `z.ZodObject<{ kind: z.ZodLiteral<"saved_workflow_list">; workflows: z.ZodArray<z.ZodObject<{ name: z.ZodString; description: z.ZodOptional<z.ZodString>; whenToUse: z.ZodOptional<z.ZodString>; scope: z`
- `SavedWorkflowMeta` (TypeAliasDeclaration) — `{ description: string; args?: Record<string, { type: "string" | "number" | "boolean" | "json"; description?: string | undefined; required?: boolean | undefined; default?: unknown; }> | undefined; when`
- `SavedWorkflowMetaSchema` (VariableDeclaration) — `z.ZodObject<{ description: z.ZodString; whenToUse: z.ZodOptional<z.ZodString>; args: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodObject<{ type: z.ZodEnum<["string", "number", "boolean", "json"]>; desc`
- `SavedWorkflowScope` (TypeAliasDeclaration) — `"project" | "global"`
- `SavedWorkflowScopeSchema` (VariableDeclaration) — `z.ZodEnum<["project", "global"]>`
- `SavedWorkflowShadowing` (TypeAliasDeclaration) — `"hides_global" | "hidden_by_project"`
- `SavedWorkflowShadowingSchema` (VariableDeclaration) — `z.ZodEnum<["hides_global", "hidden_by_project"]>`
- `SaveWorkflowInput` (TypeAliasDeclaration) — `{ scope: "project" | "global"; description: string; name: string; path?: string | undefined; script?: string | undefined; args?: Record<string, { type: "string" | "number" | "boolean" | "json"; descri`
- `SaveWorkflowInputJsonSchema` (VariableDeclaration) — `import("../index.js").JsonSchema`
- `SaveWorkflowInputSchema` (VariableDeclaration) — `z.ZodObject<{ name: z.ZodString; description: z.ZodString; whenToUse: z.ZodOptional<z.ZodString>; args: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodObject<{ type: z.ZodEnum<["string", "number", "boole`
- `SaveWorkflowOutput` (TypeAliasDeclaration) — `{ scope: "project" | "global"; path: string; name: string; diagnostics: { code: number; message: string; line: number; column: number; }[]; ok: boolean; response: string; overwritten?: boolean | undef`
- `SaveWorkflowOutputJsonSchema` (VariableDeclaration) — `import("../index.js").JsonSchema`
- `SaveWorkflowOutputSchema` (VariableDeclaration) — `z.ZodObject<{ diagnostics: z.ZodArray<z.ZodObject<{ code: z.ZodNumber; column: z.ZodNumber; line: z.ZodNumber; message: z.ZodString; }, "strict", z.ZodTypeAny, { code: number; message: string; line: n`
- `SEND_MESSAGE_MAX_CONTENT_CHARS` (VariableDeclaration) — `20000`
- `SEND_MESSAGE_TOOL_NAME` (VariableDeclaration) — `"SendMessage"`
- `SendMessageInput` (TypeAliasDeclaration) — `{ message: string; summary: string; to: string; }`
- `SendMessageInputJsonSchema` (VariableDeclaration) — `import("../index.js").JsonSchema`
- `SendMessageInputSchema` (VariableDeclaration) — `z.ZodObject<{ to: z.ZodString; summary: z.ZodString; message: z.ZodString; }, "strict", z.ZodTypeAny, { message: string; summary: string; to: string; }, { message: string; summary: string; to: string;`
- `SendMessageOutput` (TypeAliasDeclaration) — `{ messageId: string; status: "failed" | "success"; message?: string | undefined; agentId?: string | undefined; outputFile?: string | undefined; error?: string | undefined; taskId?: string | undefined;`
- `SendMessageOutputJsonSchema` (VariableDeclaration) — `import("../index.js").JsonSchema`
- `SendMessageOutputSchema` (VariableDeclaration) — `z.ZodObject<{ status: z.ZodEnum<["success", "failed"]>; messageId: z.ZodString; agentId: z.ZodOptional<z.ZodString>; delivery: z.ZodOptional<z.ZodEnum<["queued", "steered", "resumed_background"]>>; er`
- `SessionGoal` (InterfaceDeclaration) — `SessionGoal`
- `SessionGoalSchema` (VariableDeclaration) — `z.ZodObject<{ sessionID: z.ZodString; targetID: z.ZodString; objective: z.ZodString; summaryTitle: z.ZodNullable<z.ZodString>; status: z.ZodEnum<["active", "paused", "budget_limited", "complete"]>; to`
- `SessionModePort` (InterfaceDeclaration) — `SessionModePort`
- `SessionModeTransitionInput` (InterfaceDeclaration) — `SessionModeTransitionInput`
- `ShellPermissionPolicy` (InterfaceDeclaration) — `ShellPermissionPolicy`
- `ShellPermissionRule` (TypeAliasDeclaration) — `{ type: "allow" | "deny"; pattern: string; description?: string; }`
- `SkillInput` (TypeAliasDeclaration) — `{ skill: string; args?: string | undefined; }`
- `SkillInputJsonSchema` (VariableDeclaration) — `import("../index.js").JsonSchema`
- `SkillInputSchema` (VariableDeclaration) — `z.ZodEffects<z.ZodUnion<[z.ZodObject<{ skill: z.ZodString; args: z.ZodOptional<z.ZodString>; }, "strip", z.ZodTypeAny, { skill: string; args?: string | undefined; }, { skill: string; args?: string | u`
- `SkillOutput` (TypeAliasDeclaration) — `string | SkillStructuredOutput`
- `SkillOutputJsonSchema` (VariableDeclaration) — `import("../index.js").JsonSchema`
- `SkillOutputSchema` (VariableDeclaration) — `z.ZodUnion<[z.ZodString, z.ZodObject<{ name: z.ZodString; content: z.ZodString; baseDirectory: z.ZodString; truncated: z.ZodBoolean; }, "strict", z.ZodTypeAny, { content: string; name: string; truncat`
- `SkillRuntimeInput` (TypeAliasDeclaration) — `{ args: string | undefined; skill: string; }`
- `SkillStructuredOutput` (InterfaceDeclaration) — `SkillStructuredOutput`
- `SkillStructuredOutputSchema` (VariableDeclaration) — `z.ZodObject<{ name: z.ZodString; content: z.ZodString; baseDirectory: z.ZodString; truncated: z.ZodBoolean; }, "strict", z.ZodTypeAny, { content: string; name: string; truncated: boolean; baseDirector`
- `SkillToolCall` (InterfaceDeclaration) — `SkillToolCall`
- `SkillToolResult` (InterfaceDeclaration) — `SkillToolResult`
- `SUBMIT_RESULT_TOOL_NAME` (VariableDeclaration) — `"submit_result"`
- `SubmitResultInput` (TypeAliasDeclaration) — `{ result?: unknown; }`
- `SubmitResultInputJsonSchema` (VariableDeclaration) — `import("../index.js").JsonSchema`
- `SubmitResultInputSchema` (VariableDeclaration) — `z.ZodObject<{ result: z.ZodUnknown; }, "strict", z.ZodTypeAny, { result?: unknown; }, { result?: unknown; }>`
- `SubmitResultOutput` (TypeAliasDeclaration) — `{ status: "accepted"; }`
- `SubmitResultOutputJsonSchema` (VariableDeclaration) — `import("../index.js").JsonSchema`
- `SubmitResultOutputSchema` (VariableDeclaration) — `z.ZodObject<{ status: z.ZodLiteral<"accepted">; }, "strict", z.ZodTypeAny, { status: "accepted"; }, { status: "accepted"; }>`
- `TASK_OUTPUT_ALIASES` (VariableDeclaration) — `readonly ["AgentOutputTool", "BashOutputTool", "AgentOutput", "BashOutput"]`
- `TASK_OUTPUT_DISPLAY_MAX_OUTPUT_CHARS` (VariableDeclaration) — `2000`
- `TASK_OUTPUT_DISPLAY_MAX_STATUS_CHARS` (VariableDeclaration) — `64`
- `TASK_OUTPUT_PROVIDER_DESCRIPTION` (VariableDeclaration) — `"DEPRECATED: Background tasks return their output file path in the tool result, and you receive a <task-notification> with the same path when the task completes.\n- For bash tasks: prefer using the Re`
- `TASK_OUTPUT_TOOL_NAME` (VariableDeclaration) — `"TaskOutput"`
- `TASK_STOP_TOOL_NAME` (VariableDeclaration) — `"TaskStop"`
- `TaskOutputInput` (TypeAliasDeclaration) — `{ timeout: number; task_id: string; block: boolean; }`
- `TaskOutputInputJsonSchema` (VariableDeclaration) — `{ required: string[]; }`
- `TaskOutputInputSchema` (VariableDeclaration) — `z.ZodObject<{ task_id: z.ZodString; block: z.ZodEffects<z.ZodDefault<z.ZodBoolean>, boolean, unknown>; timeout: z.ZodDefault<z.ZodNumber>; }, "strict", z.ZodTypeAny, { timeout: number; task_id: string`
- `TaskOutputResult` (TypeAliasDeclaration) — `{ task: { status: string; description: string; output: string; task_id: string; task_type: string; prompt?: string | undefined; outputFile?: string | undefined; exitCode?: number | null | undefined; r`
- `TaskOutputResultJsonSchema` (VariableDeclaration) — `import("../index.js").JsonSchema`
- `TaskOutputResultSchema` (VariableDeclaration) — `z.ZodObject<{ retrieval_status: z.ZodEnum<["success", "not_ready", "timeout"]>; task: z.ZodNullable<z.ZodObject<{ task_id: z.ZodString; task_type: z.ZodString; status: z.ZodString; description: z.ZodS`
- `TaskOutputTask` (TypeAliasDeclaration) — `{ status: string; description: string; output: string; task_id: string; task_type: string; prompt?: string | undefined; outputFile?: string | undefined; exitCode?: number | null | undefined; result?: `
- `TaskOutputTaskSchema` (VariableDeclaration) — `z.ZodObject<{ task_id: z.ZodString; task_type: z.ZodString; status: z.ZodString; description: z.ZodString; output: z.ZodString; exitCode: z.ZodOptional<z.ZodNullable<z.ZodNumber>>; error: z.ZodOptiona`
- `TaskOutputToolResultDisplayPayload` (TypeAliasDeclaration) — `{ kind: "task_output"; retrievalStatus: "timeout" | "success" | "not_ready"; truncated?: true | undefined; output?: string | undefined; taskStatus?: string | undefined; }`
- `taskOutputToolResultDisplayPayloadSchema` (VariableDeclaration) — `z.ZodObject<{ kind: z.ZodLiteral<"task_output">; retrievalStatus: z.ZodEnum<["success", "not_ready", "timeout"]>; taskStatus: z.ZodOptional<z.ZodString>; output: z.ZodOptional<z.ZodString>; truncated:`
- `TaskStopInput` (TypeAliasDeclaration) — `{ task_id?: string | undefined; shell_id?: string | undefined; }`
- `TaskStopInputJsonSchema` (VariableDeclaration) — `import("../index.js").JsonSchema`
- `TaskStopInputSchema` (VariableDeclaration) — `z.ZodObject<{ task_id: z.ZodOptional<z.ZodString>; shell_id: z.ZodOptional<z.ZodString>; }, "strict", z.ZodTypeAny, { task_id?: string | undefined; shell_id?: string | undefined; }, { task_id?: string`
- `TaskStopOutput` (TypeAliasDeclaration) — `{ message: string; task_id: string; task_type: string; command?: string | undefined; }`
- `TaskStopOutputJsonSchema` (VariableDeclaration) — `import("../index.js").JsonSchema`
- `TaskStopOutputSchema` (VariableDeclaration) — `z.ZodObject<{ message: z.ZodString; task_id: z.ZodString; task_type: z.ZodString; command: z.ZodOptional<z.ZodString>; }, "strict", z.ZodTypeAny, { message: string; task_id: string; task_type: string;`
- `TaskStopToolResultDisplayPayload` (TypeAliasDeclaration) — `{ message: string; kind: "task_stop"; taskId: string; taskType: string; command?: string | undefined; truncated?: boolean | undefined; }`
- `taskStopToolResultDisplayPayloadSchema` (VariableDeclaration) — `z.ZodObject<{ kind: z.ZodLiteral<"task_stop">; taskId: z.ZodString; taskType: z.ZodString; command: z.ZodOptional<z.ZodString>; message: z.ZodString; truncated: z.ZodOptional<z.ZodBoolean>; }, "strict`
- `TimedToolTimeoutPolicy` (InterfaceDeclaration) — `TimedToolTimeoutPolicy`
- `TodoItem` (TypeAliasDeclaration) — `{ status: "completed" | "pending" | "in_progress"; content: string; priority: "high" | "medium" | "low"; }`
- `TodoItemSchema` (VariableDeclaration) — `z.ZodObject<{ content: z.ZodString; status: z.ZodEnum<["pending", "in_progress", "completed"]>; priority: z.ZodEnum<["high", "medium", "low"]>; }, "strip", z.ZodTypeAny, { status: "completed" | "pendi`
- `todoItemsFromToolResultContent` (FunctionDeclaration) — `export function todoItemsFromToolResultContent(content: string): TodoItem[] | undefined { let parsed: unknown; try { parsed = JSON.parse(content); } catch { return undefined; } const readResult = Todo`
- `TodoPriority` (VariableDeclaration | TypeAliasDeclaration) — `{ readonly High: "high"; readonly Medium: "medium"; readonly Low: "low"; }`
- `TodoReadInput` (TypeAliasDeclaration) — `{}`
- `TodoReadInputJsonSchema` (VariableDeclaration) — `import("../index.js").JsonSchema`
- `TodoReadInputSchema` (VariableDeclaration) — `z.ZodObject<{}, "strict", z.ZodTypeAny, {}, {}>`
- `TodoReadOutput` (InterfaceDeclaration) — `TodoReadOutput`
- `TodoReadOutputJsonSchema` (VariableDeclaration) — `import("../index.js").JsonSchema`
- `TodoReadOutputSchema` (VariableDeclaration) — `z.ZodObject<{ todos: z.ZodArray<z.ZodObject<{ content: z.ZodString; status: z.ZodEnum<["pending", "in_progress", "completed"]>; priority: z.ZodEnum<["high", "medium", "low"]>; }, "strip", z.ZodTypeAny`
- `TodoReadToolCall` (InterfaceDeclaration) — `TodoReadToolCall`
- `TodoStatus` (VariableDeclaration | TypeAliasDeclaration) — `{ readonly Pending: "pending"; readonly InProgress: "in_progress"; readonly Completed: "completed"; }`
- `TodoSummary` (InterfaceDeclaration) — `TodoSummary`
- `TodoSummarySchema` (VariableDeclaration) — `z.ZodObject<{ total: z.ZodNumber; pending: z.ZodNumber; inProgress: z.ZodNumber; completed: z.ZodNumber; }, "strict", z.ZodTypeAny, { completed: number; pending: number; total: number; inProgress: num`
- `TodoWriteInput` (TypeAliasDeclaration) — `{ todos: { status: "completed" | "pending" | "in_progress"; content: string; priority: "high" | "medium" | "low"; }[]; }`
- `TodoWriteInputJsonSchema` (VariableDeclaration) — `import("../index.js").JsonSchema`
- `TodoWriteInputSchema` (VariableDeclaration) — `z.ZodObject<{ todos: z.ZodArray<z.ZodObject<{ content: z.ZodString; status: z.ZodEnum<["pending", "in_progress", "completed"]>; priority: z.ZodEnum<["high", "medium", "low"]>; }, "strip", z.ZodTypeAny`
- `TodoWriteOutput` (InterfaceDeclaration) — `TodoWriteOutput`
- `TodoWriteOutputJsonSchema` (VariableDeclaration) — `import("../index.js").JsonSchema`
- `TodoWriteOutputSchema` (VariableDeclaration) — `z.ZodObject<{ oldTodos: z.ZodArray<z.ZodObject<{ content: z.ZodString; status: z.ZodEnum<["pending", "in_progress", "completed"]>; priority: z.ZodEnum<["high", "medium", "low"]>; }, "strip", z.ZodType`
- `TodoWriteToolCall` (InterfaceDeclaration) — `TodoWriteToolCall`
- `TOOL_JSON_SCHEMA_VERSION` (VariableDeclaration) — `"https://json-schema.org/draft/2020-12/schema"`
- `ToolCancellationPolicy` (InterfaceDeclaration) — `ToolCancellationPolicy`
- `ToolCommandStatus` (TypeAliasDeclaration) — `"completed" | "failed" | "timed_out" | "cancelled" | "spawn_error" | "backgrounded"`
- `ToolCommandStatusSchema` (VariableDeclaration) — `z.ZodEnum<["completed", "failed", "timed_out", "cancelled", "spawn_error", "backgrounded"]>`
- `ToolContractDeclaration` (InterfaceDeclaration) — `ToolContractDeclaration`
- `ToolExecutionMode` (TypeAliasDeclaration) — `"client" | "providerNative"`
- `ToolExecutionTelemetry` (TypeAliasDeclaration) — `{ totalMs?: number | undefined; permissionWaitMs?: number | undefined; detail?: { kind: "command"; command: { status: "completed" | "failed" | "timed_out" | "cancelled" | "spawn_error" | "backgrounded`
- `ToolExecutionTelemetryDetail` (TypeAliasDeclaration) — `{ kind: "command"; command: { status: "completed" | "failed" | "timed_out" | "cancelled" | "spawn_error" | "backgrounded"; name?: string | undefined; exitCode?: number | undefined; timedOut?: boolean `
- `ToolExecutionTelemetryDetailSchema` (VariableDeclaration) — `z.ZodDiscriminatedUnion<"kind", [z.ZodObject<{ kind: z.ZodLiteral<"command">; command: z.ZodObject<{ runMs: z.ZodOptional<z.ZodNumber>; firstOutputMs: z.ZodOptional<z.ZodNumber>; noOutputMs: z.ZodOpti`
- `ToolExecutionTelemetrySchema` (VariableDeclaration) — `z.ZodObject<{ totalMs: z.ZodOptional<z.ZodNumber>; permissionWaitMs: z.ZodOptional<z.ZodNumber>; detail: z.ZodOptional<z.ZodDiscriminatedUnion<"kind", [z.ZodObject<{ kind: z.ZodLiteral<"command">; com`
- `ToolPermissionPatternSource` (TypeAliasDeclaration) — `"path" | "custom" | "toolName" | "command" | "none" | "input" | "network"`
- `ToolPermissionSpec` (InterfaceDeclaration) — `ToolPermissionSpec`
- `ToolResultBudget` (InterfaceDeclaration) — `ToolResultBudget`
- `ToolResultBudgetStrategy` (TypeAliasDeclaration) — `"inline" | "truncate" | "artifact"`
- `toolResultDisplayDiffHunkSchema` (VariableDeclaration) — `z.ZodObject<{ oldStart: z.ZodNumber; oldLines: z.ZodNumber; newStart: z.ZodNumber; newLines: z.ZodNumber; lines: z.ZodArray<z.ZodString, "many">; }, "strict", z.ZodTypeAny, { oldStart: number; oldLine`
- `ToolResultDisplayPayload` (TypeAliasDeclaration) — `{ kind: "bash_output"; truncated: boolean; output: string; outputPath?: string | undefined; } | { kind: "file_diff"; structuredPatch: { oldStart: number; oldLines: number; newStart: number; newLines: `
- `toolResultDisplayPayloadSchema` (VariableDeclaration) — `z.ZodDiscriminatedUnion<"kind", [z.ZodObject<{ kind: z.ZodLiteral<"bash_output">; output: z.ZodString; truncated: z.ZodBoolean; outputPath: z.ZodOptional<z.ZodString>; }, "strict", z.ZodTypeAny, { kin`
- `ToolResultSerializationMetadata` (TypeAliasDeclaration) — `{ truncated: boolean; originalBytes: number; returnedBytes: number; budgetStrategy: "inline" | "truncate" | "artifact"; artifactPath?: string | undefined; }`
- `toolResultSerializationMetadataSchema` (VariableDeclaration) — `z.ZodObject<{ truncated: z.ZodBoolean; originalBytes: z.ZodNumber; returnedBytes: z.ZodNumber; budgetStrategy: z.ZodEnum<["inline", "truncate", "artifact"]>; artifactPath: z.ZodOptional<z.ZodString>; `
- `ToolSideEffectScope` (TypeAliasDeclaration) — `"workspace" | "none" | "network" | "git" | "system" | "session" | "userInteraction"`
- `ToolTimeoutPolicy` (TypeAliasDeclaration) — `NoToolTimeoutPolicy | TimedToolTimeoutPolicy`
- `ToolTracePolicy` (InterfaceDeclaration) — `ToolTracePolicy`
- `toToolJsonSchema` (FunctionDeclaration) — `export function toToolJsonSchema(schema: ZodTypeAny): JsonSchema { const generated = zodToJsonSchema(schema, { target: "jsonSchema7", effectStrategy: "input", $refStrategy: "none", }) as JsonSchema; c`
- `toWebSearchProviderNativeArgs` (FunctionDeclaration) — `export function toWebSearchProviderNativeArgs( input: WebSearchInput, defaults: { maxUses: number }, ): WebSearchProviderNativeArgs { return { allowedDomains: input.allowed_domains, blockedDomains: in`
- `typedSubmitResultInputSchema` (FunctionDeclaration) — `export function typedSubmitResultInputSchema( resultSchema: Record<string, unknown>, ): Record<string, unknown> { return { type: "object", properties: { result: { description: "The structured result f`
- `WebFetchErrorCode` (VariableDeclaration | TypeAliasDeclaration) — `{ readonly InvalidUrl: "webfetch_invalid_url"; readonly UnsupportedProtocol: "webfetch_unsupported_protocol"; readonly CredentialsInUrl: "webfetch_credentials_in_url"; readonly MissingRedirectLocation`
- `WebFetchInput` (TypeAliasDeclaration) — `{ prompt: string; url: string; }`
- `WebFetchInputJsonSchema` (VariableDeclaration) — `import("../index.js").JsonSchema`
- `WebFetchInputSchema` (VariableDeclaration) — `z.ZodObject<{ url: z.ZodString; prompt: z.ZodString; }, "strip", z.ZodTypeAny, { prompt: string; url: string; }, { prompt: string; url: string; }>`
- `WebFetchOutput` (InterfaceDeclaration) — `WebFetchOutput`
- `WebFetchOutputJsonSchema` (VariableDeclaration) — `import("../index.js").JsonSchema`
- `WebFetchOutputSchema` (VariableDeclaration) — `z.ZodObject<{ url: z.ZodString; finalUrl: z.ZodString; status: z.ZodNumber; statusText: z.ZodString; contentType: z.ZodString; bytes: z.ZodNumber; durationMs: z.ZodNumber; result: z.ZodString; cacheHi`
- `WebFetchRedirect` (InterfaceDeclaration) — `WebFetchRedirect`
- `WebFetchRedirectSchema` (VariableDeclaration) — `z.ZodObject<{ from: z.ZodString; to: z.ZodString; status: z.ZodNumber; }, "strict", z.ZodTypeAny, { status: number; from: string; to: string; }, { status: number; from: string; to: string; }>`
- `WebFetchToolCall` (InterfaceDeclaration) — `WebFetchToolCall`
- `WebFetchToolResult` (InterfaceDeclaration) — `WebFetchToolResult`
- `WEBSEARCH_PROVIDER_NATIVE_SPEC` (VariableDeclaration) — `ProviderNativeToolSpec`
- `WEBSEARCH_TOOL_CONTRACT` (VariableDeclaration) — `ToolContractDeclaration`
- `WebSearchInput` (TypeAliasDeclaration) — `{ query: string; allowed_domains?: string[] | undefined; blocked_domains?: string[] | undefined; maxUses?: number | undefined; }`
- `WebSearchInputJsonSchema` (VariableDeclaration) — `import("../index.js").JsonSchema`
- `WebSearchInputSchema` (VariableDeclaration) — `z.ZodEffects<z.ZodObject<{ query: z.ZodString; allowed_domains: z.ZodOptional<z.ZodArray<z.ZodString, "many">>; blocked_domains: z.ZodOptional<z.ZodArray<z.ZodString, "many">>; } & { maxUses: z.ZodOpt`
- `WebSearchOutput` (TypeAliasDeclaration) — `{ durationMs: number; query: string; results: { url: string; title?: string | undefined; pageAge?: string | undefined; }[]; sources: { url: string; title?: string | undefined; }[]; summary?: string | `
- `WebSearchOutputJsonSchema` (VariableDeclaration) — `import("../index.js").JsonSchema`
- `WebSearchOutputSchema` (VariableDeclaration) — `z.ZodObject<{ query: z.ZodString; results: z.ZodArray<z.ZodObject<{ title: z.ZodOptional<z.ZodString>; url: z.ZodString; pageAge: z.ZodOptional<z.ZodString>; }, "strict", z.ZodTypeAny, { url: string; `
- `WebSearchProviderNativeArgs` (InterfaceDeclaration) — `WebSearchProviderNativeArgs`
- `WebSearchResultItem` (TypeAliasDeclaration) — `{ url: string; title?: string | undefined; pageAge?: string | undefined; }`
- `WebSearchResultItemSchema` (VariableDeclaration) — `z.ZodObject<{ title: z.ZodOptional<z.ZodString>; url: z.ZodString; pageAge: z.ZodOptional<z.ZodString>; }, "strict", z.ZodTypeAny, { url: string; title?: string | undefined; pageAge?: string | undefin`
- `WebSearchSource` (TypeAliasDeclaration) — `{ url: string; title?: string | undefined; }`
- `WebSearchSourceSchema` (VariableDeclaration) — `z.ZodObject<{ title: z.ZodOptional<z.ZodString>; url: z.ZodString; }, "strict", z.ZodTypeAny, { url: string; title?: string | undefined; }, { url: string; title?: string | undefined; }>`
- `WORKFLOW_DRAFTS_DIR` (VariableDeclaration) — `".knorvia-studio/workflow-drafts"`
- `WORKFLOW_OBSERVATION_DISPLAY_MAX_ACTORS` (VariableDeclaration) — `32`
- `WORKFLOW_OBSERVATION_DISPLAY_MAX_ARGS` (VariableDeclaration) — `32`
- `WORKFLOW_OBSERVATION_DISPLAY_MAX_LOG_CHARS` (VariableDeclaration) — `1024`
- `WORKFLOW_OBSERVATION_DISPLAY_MAX_LOG_ENTRIES` (VariableDeclaration) — `40`
- `WORKFLOW_OBSERVATION_DISPLAY_MAX_META_CHARS` (VariableDeclaration) — `2048`
- `WORKFLOW_OBSERVATION_DISPLAY_MAX_MODELS` (VariableDeclaration) — `100`
- `WORKFLOW_OBSERVATION_DISPLAY_MAX_PHASES` (VariableDeclaration) — `32`
- `WORKFLOW_OBSERVATION_DISPLAY_MAX_RESULT_CHARS` (VariableDeclaration) — `4000`
- `WORKFLOW_OBSERVATION_DISPLAY_MAX_RUNS` (VariableDeclaration) — `50`
- `WORKFLOW_OBSERVATION_DISPLAY_MAX_SUBAGENTS` (VariableDeclaration) — `64`
- `WORKFLOW_RUN_ID_PATTERN` (VariableDeclaration) — `RegExp`
- `WORKFLOW_RUN_LIFECYCLE_STATUSES` (VariableDeclaration) — `readonly ["completed", "errored", "pending", "running", "stopped"]`
- `WORKFLOW_RUN_STOP_REASONS` (VariableDeclaration) — `readonly ["user", "model", "provider", "interrupted", "superseded"]`
- `WORKFLOW_SCRIPT_MAX_LENGTH` (VariableDeclaration) — `524288`
- `WorkflowInput` (TypeAliasDeclaration) — `{ description?: string | undefined; script?: string | undefined; name?: string | undefined; title?: string | undefined; args?: unknown; scriptPath?: string | undefined; resumeFromRunId?: string | unde`
- `WorkflowInputJsonSchema` (VariableDeclaration) — `import("../index.js").JsonSchema`
- `WorkflowInputSchema` (VariableDeclaration) — `z.ZodEffects<z.ZodObject<{ args: z.ZodOptional<z.ZodUnknown>; description: z.ZodOptional<z.ZodString>; name: z.ZodOptional<z.ZodString>; resumeFromRunId: z.ZodOptional<z.ZodString>; script: z.ZodOptio`
- `WorkflowOutput` (TypeAliasDeclaration) — `{ status: "completed" | "failed" | "backgrounded"; backgroundTaskId: string; response: string; runId: string; traceId: string; name?: string | undefined; scriptPath?: string | undefined; }`
- `WorkflowOutputJsonSchema` (VariableDeclaration) — `import("../index.js").JsonSchema`
- `WorkflowOutputSchema` (VariableDeclaration) — `z.ZodObject<{ backgroundTaskId: z.ZodString; name: z.ZodOptional<z.ZodString>; response: z.ZodString; runId: z.ZodString; scriptPath: z.ZodOptional<z.ZodString>; status: z.ZodEnum<["backgrounded", "co`
- `WorkflowOutputStatus` (TypeAliasDeclaration) — `"completed" | "failed" | "backgrounded"`
- `WorkflowOutputStatusSchema` (VariableDeclaration) — `z.ZodEnum<["backgrounded", "completed", "failed"]>`
- `WorkflowRunSummarySchema` (VariableDeclaration) — `z.ZodObject<{ runId: z.ZodString; label: z.ZodString; labelSource: z.ZodEnum<["name", "script"]>; status: z.ZodEnum<["completed", "errored", "pending", "running", "stopped"]>; stopReason: z.ZodOptiona`
- `WorkflowToolResult` (InterfaceDeclaration) — `WorkflowToolResult`
- `WORKSPACE_MUTATING_SIDE_EFFECT_SCOPES` (VariableDeclaration) — `ReadonlySet<ToolSideEffectScope>`
- `WriteDiffHunkSchema` (VariableDeclaration) — `z.ZodObject<{ oldStart: z.ZodNumber; oldLines: z.ZodNumber; newStart: z.ZodNumber; newLines: z.ZodNumber; lines: z.ZodArray<z.ZodString, "many">; }, "strict", z.ZodTypeAny, { oldStart: number; oldLine`
- `WriteErrorCode` (VariableDeclaration | TypeAliasDeclaration) — `{ readonly FILE_NOT_READ: "write_file_not_read"; readonly PARTIAL_READ: "write_partial_read"; readonly STALE_FILE: "write_stale_file"; readonly PERMISSION_DENIED: "write_permission_denied"; readonly S`
- `WriteGitDiffSchema` (VariableDeclaration) — `z.ZodObject<{ filename: z.ZodString; status: z.ZodEnum<["modified", "added"]>; additions: z.ZodNumber; deletions: z.ZodNumber; changes: z.ZodNumber; patch: z.ZodString; repository: z.ZodOptional<z.Zod`
- `WriteInput` (TypeAliasDeclaration) — `{ content: string; file_path: string; }`
- `WriteInputJsonSchema` (VariableDeclaration) — `import("../index.js").JsonSchema`
- `WriteInputSchema` (VariableDeclaration) — `z.ZodObject<{ file_path: z.ZodString; content: z.ZodString; }, "strip", z.ZodTypeAny, { content: string; file_path: string; }, { content: string; file_path: string; }>`
- `WriteOutput` (InterfaceDeclaration) — `WriteOutput`
- `WriteOutputJsonSchema` (VariableDeclaration) — `import("../index.js").JsonSchema`
- `WriteOutputSchema` (VariableDeclaration) — `z.ZodObject<{ type: z.ZodEnum<["create", "update"]>; filePath: z.ZodString; content: z.ZodString; structuredPatch: z.ZodArray<z.ZodObject<{ oldStart: z.ZodNumber; oldLines: z.ZodNumber; newStart: z.Zo`
- `WriteToolCall` (InterfaceDeclaration) — `WriteToolCall`
- `WriteToolResult` (InterfaceDeclaration) — `WriteToolResult`

### `tools/list-models.ts`

- `LIST_MODELS_TOOL_NAME` (VariableDeclaration) — `"ListModels"`
- `ListModelsEntry` (TypeAliasDeclaration) — `{ providerId: string; modelId: string; id: string; reasoningLevels: string[]; providerLabel?: string | undefined; defaultReasoningLevel?: string | undefined; contextWindow?: number | undefined; disabl`
- `ListModelsEntrySchema` (VariableDeclaration) — `z.ZodObject<{ id: z.ZodString; providerId: z.ZodString; modelId: z.ZodString; providerLabel: z.ZodOptional<z.ZodString>; reasoningLevels: z.ZodArray<z.ZodString, "many">; defaultReasoningLevel: z.ZodO`
- `ListModelsInput` (TypeAliasDeclaration) — `{}`
- `ListModelsInputJsonSchema` (VariableDeclaration) — `import("../index.js").JsonSchema`
- `ListModelsInputSchema` (VariableDeclaration) — `z.ZodObject<{}, "strict", z.ZodTypeAny, {}, {}>`
- `ListModelsOutput` (TypeAliasDeclaration) — `{ models: { providerId: string; modelId: string; id: string; reasoningLevels: string[]; providerLabel?: string | undefined; defaultReasoningLevel?: string | undefined; contextWindow?: number | undefin`
- `ListModelsOutputJsonSchema` (VariableDeclaration) — `import("../index.js").JsonSchema`
- `ListModelsOutputSchema` (VariableDeclaration) — `z.ZodObject<{ current: z.ZodOptional<z.ZodString>; models: z.ZodArray<z.ZodObject<{ id: z.ZodString; providerId: z.ZodString; modelId: z.ZodString; providerLabel: z.ZodOptional<z.ZodString>; reasoning`

### `tools/list-saved-workflows.ts`

- `LIST_SAVED_WORKFLOWS_TOOL_NAME` (VariableDeclaration) — `"ListSavedWorkflows"`
- `ListSavedWorkflowsInput` (TypeAliasDeclaration) — `{}`
- `ListSavedWorkflowsInputJsonSchema` (VariableDeclaration) — `import("../index.js").JsonSchema`
- `ListSavedWorkflowsInputSchema` (VariableDeclaration) — `z.ZodObject<{}, "strict", z.ZodTypeAny, {}, {}>`
- `ListSavedWorkflowsOutput` (TypeAliasDeclaration) — `{ workflows: { scope: "project" | "global"; path: string; description: string; name: string; args?: Record<string, { type: "string" | "number" | "boolean" | "json"; description?: string | undefined; r`
- `ListSavedWorkflowsOutputJsonSchema` (VariableDeclaration) — `import("../index.js").JsonSchema`
- `ListSavedWorkflowsOutputSchema` (VariableDeclaration) — `z.ZodObject<{ workflows: z.ZodArray<z.ZodObject<{ name: z.ZodString; description: z.ZodString; whenToUse: z.ZodOptional<z.ZodString>; args: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodObject<{ type: z`

### `tools/list-workflow-runs.ts`

- `LIST_WORKFLOW_RUNS_DEFAULT_LIMIT` (VariableDeclaration) — `20`
- `LIST_WORKFLOW_RUNS_MAX_LIMIT` (VariableDeclaration) — `50`
- `LIST_WORKFLOW_RUNS_MIN_LIMIT` (VariableDeclaration) — `1`
- `LIST_WORKFLOW_RUNS_TOOL_NAME` (VariableDeclaration) — `"ListWorkflowRuns"`
- `ListWorkflowRunsInput` (TypeAliasDeclaration) — `{ limit: number; statuses?: ("completed" | "errored" | "pending" | "running" | "stopped")[] | undefined; }`
- `ListWorkflowRunsInputJsonSchema` (VariableDeclaration) — `import("../index.js").JsonSchema`
- `ListWorkflowRunsInputSchema` (VariableDeclaration) — `z.ZodObject<{ limit: z.ZodEffects<z.ZodDefault<z.ZodNumber>, number, unknown>; statuses: z.ZodOptional<z.ZodArray<z.ZodEnum<["completed", "errored", "pending", "running", "stopped"]>, "many">>; }, "st`
- `ListWorkflowRunsOutput` (TypeAliasDeclaration) — `{ runs: { status: "completed" | "errored" | "pending" | "running" | "stopped"; createdAt: number; label: string; runId: string; labelSource: "script" | "name"; ownedByThisSession: boolean; updatedAt: `
- `ListWorkflowRunsOutputJsonSchema` (VariableDeclaration) — `import("../index.js").JsonSchema`
- `ListWorkflowRunsOutputSchema` (VariableDeclaration) — `z.ZodObject<{ runs: z.ZodArray<z.ZodObject<{ runId: z.ZodString; label: z.ZodString; labelSource: z.ZodEnum<["name", "script"]>; status: z.ZodEnum<["completed", "errored", "pending", "running", "stopp`
- `ListWorkflowRunsRun` (TypeAliasDeclaration) — `{ status: "completed" | "errored" | "pending" | "running" | "stopped"; createdAt: number; label: string; runId: string; labelSource: "script" | "name"; ownedByThisSession: boolean; updatedAt: number; `
- `ListWorkflowRunsRunSchema` (VariableDeclaration) — `z.ZodObject<{ runId: z.ZodString; label: z.ZodString; labelSource: z.ZodEnum<["name", "script"]>; status: z.ZodEnum<["completed", "errored", "pending", "running", "stopped"]>; stopReason: z.ZodOptiona`
- `WORKFLOW_RUN_LIFECYCLE_STATUSES` (VariableDeclaration) — `readonly ["completed", "errored", "pending", "running", "stopped"]`
- `WORKFLOW_RUN_STOP_REASONS` (VariableDeclaration) — `readonly ["user", "model", "provider", "interrupted", "superseded"]`
- `WorkflowRunSummarySchema` (VariableDeclaration) — `z.ZodObject<{ runId: z.ZodString; label: z.ZodString; labelSource: z.ZodEnum<["name", "script"]>; status: z.ZodEnum<["completed", "errored", "pending", "running", "stopped"]>; stopReason: z.ZodOptiona`

### `tools/off-peak.ts`

- `OffPeakCreateInput` (TypeAliasDeclaration) — `{ prompt: string; title: string; model?: string | undefined; permissionMode?: "build" | "edit" | "plan" | "yolo" | undefined; thoughtLevel?: string | undefined; }`
- `OffPeakCreateInputJsonSchema` (VariableDeclaration) — `import("../index.js").JsonSchema`
- `OffPeakCreateInputSchema` (VariableDeclaration) — `z.ZodObject<{ title: z.ZodString; prompt: z.ZodString; permissionMode: z.ZodOptional<z.ZodEnum<["build", "edit", "plan", "yolo"]>>; model: z.ZodOptional<z.ZodString>; thoughtLevel: z.ZodOptional<z.Zod`
- `OffPeakCreateOutput` (TypeAliasDeclaration) — `{ message: string; task: { status: "completed" | "running" | "failed" | "paused" | "cancelled" | "queued"; createdAt: number; title: string; offPeakTaskId: string; queuePosition?: number | undefined; `
- `OffPeakCreateOutputJsonSchema` (VariableDeclaration) — `import("../index.js").JsonSchema`
- `OffPeakCreateOutputSchema` (VariableDeclaration) — `z.ZodObject<{ task: z.ZodObject<{ offPeakTaskId: z.ZodString; title: z.ZodString; status: z.ZodEnum<["queued", "paused", "running", "completed", "failed", "cancelled"]>; queuePosition: z.ZodOptional<z`
- `OffPeakListInput` (TypeAliasDeclaration) — `{}`
- `OffPeakListInputJsonSchema` (VariableDeclaration) — `import("../index.js").JsonSchema`
- `OffPeakListInputSchema` (VariableDeclaration) — `z.ZodObject<{}, "strict", z.ZodTypeAny, {}, {}>`
- `OffPeakListOutput` (TypeAliasDeclaration) — `{ tasks: { status: "completed" | "running" | "failed" | "paused" | "cancelled" | "queued"; createdAt: number; title: string; offPeakTaskId: string; queuePosition?: number | undefined; sessionId?: stri`
- `OffPeakListOutputJsonSchema` (VariableDeclaration) — `import("../index.js").JsonSchema`
- `OffPeakListOutputSchema` (VariableDeclaration) — `z.ZodObject<{ tasks: z.ZodArray<z.ZodObject<{ offPeakTaskId: z.ZodString; title: z.ZodString; status: z.ZodEnum<["queued", "paused", "running", "completed", "failed", "cancelled"]>; queuePosition: z.Z`
- `OffPeakTaskStatus` (TypeAliasDeclaration) — `"completed" | "running" | "failed" | "paused" | "cancelled" | "queued"`
- `OffPeakTaskStatusSchema` (VariableDeclaration) — `z.ZodEnum<["queued", "paused", "running", "completed", "failed", "cancelled"]>`
- `OffPeakTaskSummary` (TypeAliasDeclaration) — `{ status: "completed" | "running" | "failed" | "paused" | "cancelled" | "queued"; createdAt: number; title: string; offPeakTaskId: string; queuePosition?: number | undefined; sessionId?: string | unde`
- `OffPeakTaskSummarySchema` (VariableDeclaration) — `z.ZodObject<{ offPeakTaskId: z.ZodString; title: z.ZodString; status: z.ZodEnum<["queued", "paused", "running", "completed", "failed", "cancelled"]>; queuePosition: z.ZodOptional<z.ZodNumber>; session`

### `tools/performance.ts`

- `CommandExecutionTelemetry` (TypeAliasDeclaration) — `{ status: "completed" | "failed" | "timed_out" | "cancelled" | "spawn_error" | "backgrounded"; name?: string | undefined; exitCode?: number | undefined; timedOut?: boolean | undefined; runMs?: number `
- `CommandExecutionTelemetrySchema` (VariableDeclaration) — `z.ZodObject<{ runMs: z.ZodOptional<z.ZodNumber>; firstOutputMs: z.ZodOptional<z.ZodNumber>; noOutputMs: z.ZodOptional<z.ZodNumber>; exitCode: z.ZodOptional<z.ZodNumber>; timedOut: z.ZodOptional<z.ZodB`
- `FileSystemExecutionTelemetry` (TypeAliasDeclaration) — `{ fileCount?: number | undefined; readMs?: number | undefined; writeMs?: number | undefined; totalBytes?: number | undefined; maxFileBytes?: number | undefined; workspaceKind?: "unknown" | "local" | "`
- `FileSystemExecutionTelemetrySchema` (VariableDeclaration) — `z.ZodObject<{ readMs: z.ZodOptional<z.ZodNumber>; writeMs: z.ZodOptional<z.ZodNumber>; fileCount: z.ZodOptional<z.ZodNumber>; totalBytes: z.ZodOptional<z.ZodNumber>; maxFileBytes: z.ZodOptional<z.ZodN`
- `PatchExecutionTelemetry` (TypeAliasDeclaration) — `{ matchMs?: number | undefined; hunkCount?: number | undefined; matchAttempts?: number | undefined; }`
- `PatchExecutionTelemetrySchema` (VariableDeclaration) — `z.ZodObject<{ matchMs: z.ZodOptional<z.ZodNumber>; hunkCount: z.ZodOptional<z.ZodNumber>; matchAttempts: z.ZodOptional<z.ZodNumber>; }, "strict", z.ZodTypeAny, { matchMs?: number | undefined; hunkCoun`
- `ToolCommandStatus` (TypeAliasDeclaration) — `"completed" | "failed" | "timed_out" | "cancelled" | "spawn_error" | "backgrounded"`
- `ToolCommandStatusSchema` (VariableDeclaration) — `z.ZodEnum<["completed", "failed", "timed_out", "cancelled", "spawn_error", "backgrounded"]>`
- `ToolExecutionTelemetry` (TypeAliasDeclaration) — `{ totalMs?: number | undefined; permissionWaitMs?: number | undefined; detail?: { kind: "command"; command: { status: "completed" | "failed" | "timed_out" | "cancelled" | "spawn_error" | "backgrounded`
- `ToolExecutionTelemetryDetail` (TypeAliasDeclaration) — `{ kind: "command"; command: { status: "completed" | "failed" | "timed_out" | "cancelled" | "spawn_error" | "backgrounded"; name?: string | undefined; exitCode?: number | undefined; timedOut?: boolean `
- `ToolExecutionTelemetryDetailSchema` (VariableDeclaration) — `z.ZodDiscriminatedUnion<"kind", [z.ZodObject<{ kind: z.ZodLiteral<"command">; command: z.ZodObject<{ runMs: z.ZodOptional<z.ZodNumber>; firstOutputMs: z.ZodOptional<z.ZodNumber>; noOutputMs: z.ZodOpti`
- `ToolExecutionTelemetrySchema` (VariableDeclaration) — `z.ZodObject<{ totalMs: z.ZodOptional<z.ZodNumber>; permissionWaitMs: z.ZodOptional<z.ZodNumber>; detail: z.ZodOptional<z.ZodDiscriminatedUnion<"kind", [z.ZodObject<{ kind: z.ZodLiteral<"command">; com`

### `tools/plan-mode.ts`

- `ENTER_PLAN_MODE_TOOL_NAME` (VariableDeclaration) — `"EnterPlanMode"`
- `EnterPlanModeInput` (TypeAliasDeclaration) — `{}`
- `EnterPlanModeInputJsonSchema` (VariableDeclaration) — `import("../index.js").JsonSchema`
- `EnterPlanModeInputSchema` (VariableDeclaration) — `z.ZodObject<{}, "strict", z.ZodTypeAny, {}, {}>`
- `EnterPlanModeOutput` (TypeAliasDeclaration) — `{ message: string; mode: "build" | "edit" | "plan" | "yolo" | "auto"; previousMode: "build" | "edit" | "plan" | "yolo" | "auto"; planEnabled?: boolean | undefined; previousPlanEnabled?: boolean | unde`
- `EnterPlanModeOutputJsonSchema` (VariableDeclaration) — `import("../index.js").JsonSchema`
- `EnterPlanModeOutputSchema` (VariableDeclaration) — `z.ZodObject<{ message: z.ZodString; previousMode: z.ZodEnum<["plan", "build", "edit", "yolo", "auto"]>; mode: z.ZodEnum<["plan", "build", "edit", "yolo", "auto"]>; planEnabled: z.ZodOptional<z.ZodBool`
- `EnterPlanModeTransitionResult` (InterfaceDeclaration) — `EnterPlanModeTransitionResult`
- `EXIT_PLAN_MODE_TOOL_NAME` (VariableDeclaration) — `"ExitPlanMode"`
- `ExitPlanModeAllowedPrompt` (TypeAliasDeclaration) — `{ prompt: string; tool: "Bash"; }`
- `ExitPlanModeAllowedPromptSchema` (VariableDeclaration) — `z.ZodObject<{ tool: z.ZodEnum<["Bash"]>; prompt: z.ZodString; }, "strict", z.ZodTypeAny, { prompt: string; tool: "Bash"; }, { prompt: string; tool: "Bash"; }>`
- `ExitPlanModeInput` (TypeAliasDeclaration) — `{ plan: string; allowedPrompts?: { prompt: string; tool: "Bash"; }[] | undefined; } & { [k: string]: unknown; }`
- `ExitPlanModeInputJsonSchema` (VariableDeclaration) — `import("../index.js").JsonSchema`
- `ExitPlanModeInputSchema` (VariableDeclaration) — `z.ZodObject<{ plan: z.ZodEffects<z.ZodString, string, string>; allowedPrompts: z.ZodOptional<z.ZodArray<z.ZodObject<{ tool: z.ZodEnum<["Bash"]>; prompt: z.ZodString; }, "strict", z.ZodTypeAny, { promp`
- `ExitPlanModeOutput` (TypeAliasDeclaration) — `{ plan: string | null; mode: "build" | "edit" | "yolo" | "auto"; previousMode: "build" | "edit" | "plan" | "yolo" | "auto"; approved: true; planEnabled?: boolean | undefined; previousPlanEnabled?: boo`
- `ExitPlanModeOutputJsonSchema` (VariableDeclaration) — `import("../index.js").JsonSchema`
- `ExitPlanModeOutputSchema` (VariableDeclaration) — `z.ZodObject<{ plan: z.ZodNullable<z.ZodString>; approved: z.ZodLiteral<true>; previousMode: z.ZodEnum<["plan", "build", "edit", "yolo", "auto"]>; planEnabled: z.ZodOptional<z.ZodBoolean>; previousPlan`
- `ExitPlanModeTransitionResult` (InterfaceDeclaration) — `ExitPlanModeTransitionResult`
- `PLAN_MODE_MAX_PLAN_CHARS` (VariableDeclaration) — `20000`
- `SessionModePort` (InterfaceDeclaration) — `SessionModePort`
- `SessionModeTransitionInput` (InterfaceDeclaration) — `SessionModeTransitionInput`

### `tools/read-pdf.ts`

- `getReadPdfPagesValidationFailure` (FunctionDeclaration) — `export function getReadPdfPagesValidationFailure( filePath: string, pages: string | undefined, ): ReadPdfPagesValidationFailure | undefined { if (pages === undefined || !filePath.toLowerCase().endsWit`
- `parseReadPdfPageRange` (FunctionDeclaration) — `export function parseReadPdfPageRange(value: string): ReadPdfPageRange | undefined { const normalized = value.trim(); if (/^\d+-$/u.test(normalized)) { const firstPage = Number(normalized.slice(0, -1)`
- `READ_PDF_AVAILABILITY_TIMEOUT_MS` (VariableDeclaration) — `5000`
- `READ_PDF_EXTRACT_MAX_INPUT_BYTES` (VariableDeclaration) — `number`
- `READ_PDF_INFO_TIMEOUT_MS` (VariableDeclaration) — `10000`
- `READ_PDF_MAX_PAGES_PER_REQUEST` (VariableDeclaration) — `20`
- `READ_PDF_NATIVE_MAX_INPUT_BYTES` (VariableDeclaration) — `number`
- `READ_PDF_NATIVE_MAX_PAGES` (VariableDeclaration) — `10`
- `READ_PDF_PAGES_DESCRIPTION` (VariableDeclaration) — `"Page range for PDF files (e.g., \"1-5\", \"3\", \"10-20\"). Only applicable to PDF files. Maximum 20 pages per request."`
- `READ_PDF_RENDER_TIMEOUT_MS` (VariableDeclaration) — `120000`
- `ReadErrorCode` (VariableDeclaration | TypeAliasDeclaration) — `{ readonly PDF_INVALID_PAGES: 7; readonly PDF_PAGE_RANGE_TOO_LARGE: 8; readonly PDF_PAGES_IMAGES_UNSUPPORTED: 10; readonly PDF_CONFIGURATION_ERROR: 11; readonly PDF_INVALID: 12; readonly PDF_TOO_LARGE`
- `ReadPdfPageRange` (InterfaceDeclaration) — `ReadPdfPageRange`
- `ReadPdfPagesValidationFailure` (InterfaceDeclaration) — `ReadPdfPagesValidationFailure`

### `tools/read-session-context.ts`

- `READ_SESSION_CONTEXT_DEFAULT_MAX_TOKENS` (VariableDeclaration) — `6000`
- `READ_SESSION_CONTEXT_MAX_TOKENS` (VariableDeclaration) — `12000`
- `READ_SESSION_CONTEXT_TOOL_NAME` (VariableDeclaration) — `"ReadSessionContext"`
- `ReadSessionContextInput` (TypeAliasDeclaration) — `{ strategy: "relevant" | "handoff"; sessionId: string; query: string; maxTokens?: number | undefined; }`
- `ReadSessionContextInputJsonSchema` (VariableDeclaration) — `import("../index.js").JsonSchema`
- `ReadSessionContextInputSchema` (VariableDeclaration) — `z.ZodObject<{ sessionId: z.ZodString; query: z.ZodString; strategy: z.ZodDefault<z.ZodOptional<z.ZodEnum<["relevant", "handoff"]>>>; maxTokens: z.ZodOptional<z.ZodNumber>; }, "strict", z.ZodTypeAny, {`
- `ReadSessionContextOutput` (TypeAliasDeclaration) — `{ status: "failed" | "success" | "not_found"; strategy: "relevant" | "handoff"; content: string; source: "local" | "none" | "lite" | "fallback"; truncated: boolean; sessionId: string; query: string; m`
- `ReadSessionContextOutputJsonSchema` (VariableDeclaration) — `import("../index.js").JsonSchema`
- `ReadSessionContextOutputSchema` (VariableDeclaration) — `z.ZodObject<{ status: z.ZodEnum<["success", "not_found", "failed"]>; sessionId: z.ZodString; title: z.ZodOptional<z.ZodString>; directory: z.ZodOptional<z.ZodString>; path: z.ZodOptional<z.ZodString>;`
- `ReadSessionContextReference` (TypeAliasDeclaration) — `{ messageId: string; reason?: string | undefined; index?: number | undefined; partId?: string | undefined; role?: "user" | "assistant" | undefined; }`
- `ReadSessionContextReferenceSchema` (VariableDeclaration) — `z.ZodObject<{ messageId: z.ZodString; partId: z.ZodOptional<z.ZodString>; index: z.ZodOptional<z.ZodNumber>; role: z.ZodOptional<z.ZodEnum<["user", "assistant"]>>; reason: z.ZodOptional<z.ZodString>; `
- `ReadSessionContextStrategySchema` (VariableDeclaration) — `z.ZodEnum<["relevant", "handoff"]>`

### `tools/read-state.ts`

- `ReadFileState` (InterfaceDeclaration) — `ReadFileState`

### `tools/read.ts`

- `CellOutput` (InterfaceDeclaration) — `CellOutput`
- `getReadPdfPagesValidationFailure` (FunctionDeclaration) — `export function getReadPdfPagesValidationFailure( filePath: string, pages: string | undefined, ): ReadPdfPagesValidationFailure | undefined { if (pages === undefined || !filePath.toLowerCase().endsWit`
- `NotebookCell` (InterfaceDeclaration) — `NotebookCell`
- `parseReadPdfPageRange` (FunctionDeclaration) — `export function parseReadPdfPageRange(value: string): ReadPdfPageRange | undefined { const normalized = value.trim(); if (/^\d+-$/u.test(normalized)) { const firstPage = Number(normalized.slice(0, -1)`
- `READ_DEFAULT_MAX_LINES` (VariableDeclaration) — `2000`
- `READ_IMAGE_MAX_BASE64_BYTES` (VariableDeclaration) — `number`
- `READ_IMAGE_MAX_DIMENSION` (VariableDeclaration) — `2000`
- `READ_IMAGE_MAX_INPUT_BYTES` (VariableDeclaration) — `number`
- `READ_IMAGE_TARGET_BYTES` (VariableDeclaration) — `number`
- `READ_IMAGE_TOKEN_TO_BASE64_CHAR_RATIO` (VariableDeclaration) — `0.125`
- `READ_MAX_FILE_SIZE_BYTES` (VariableDeclaration) — `number`
- `READ_MAX_OUTPUT_TOKENS` (VariableDeclaration) — `25000`
- `READ_PDF_AVAILABILITY_TIMEOUT_MS` (VariableDeclaration) — `5000`
- `READ_PDF_EXTRACT_MAX_INPUT_BYTES` (VariableDeclaration) — `number`
- `READ_PDF_INFO_TIMEOUT_MS` (VariableDeclaration) — `10000`
- `READ_PDF_MAX_PAGES_PER_REQUEST` (VariableDeclaration) — `20`
- `READ_PDF_NATIVE_MAX_INPUT_BYTES` (VariableDeclaration) — `number`
- `READ_PDF_NATIVE_MAX_PAGES` (VariableDeclaration) — `10`
- `READ_PDF_PAGES_DESCRIPTION` (VariableDeclaration) — `"Page range for PDF files (e.g., \"1-5\", \"3\", \"10-20\"). Only applicable to PDF files. Maximum 20 pages per request."`
- `READ_PDF_RENDER_TIMEOUT_MS` (VariableDeclaration) — `120000`
- `READ_VIDEO_MAX_INPUT_BYTES` (VariableDeclaration) — `number`
- `ReadCellOutputSchema` (VariableDeclaration) — `z.ZodObject<{ type: z.ZodEnum<["stream", "execute_result", "error", "display_data"]>; text: z.ZodString; metadata: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodUnknown>>; }, "strict", z.ZodTypeAny, { t`
- `ReadErrorCode` (VariableDeclaration | TypeAliasDeclaration) — `{ readonly PDF_INVALID_PAGES: 7; readonly PDF_PAGE_RANGE_TOO_LARGE: 8; readonly PDF_PAGES_IMAGES_UNSUPPORTED: 10; readonly PDF_CONFIGURATION_ERROR: 11; readonly PDF_INVALID: 12; readonly PDF_TOO_LARGE`
- `ReadFileState` (InterfaceDeclaration) — `ReadFileState`
- `ReadImageDimensionsSchema` (VariableDeclaration) — `z.ZodObject<{ originalWidth: z.ZodOptional<z.ZodNumber>; originalHeight: z.ZodOptional<z.ZodNumber>; displayWidth: z.ZodOptional<z.ZodNumber>; displayHeight: z.ZodOptional<z.ZodNumber>; }, "strict", z`
- `ReadImageOutput` (InterfaceDeclaration) — `ReadImageOutput`
- `ReadImageOutputSchema` (VariableDeclaration) — `z.ZodObject<{ type: z.ZodLiteral<"image">; base64: z.ZodString; mimeType: z.ZodEnum<["image/jpeg", "image/png", "image/gif", "image/webp"]>; originalSize: z.ZodNumber; transformedSize: z.ZodOptional<z`
- `ReadInput` (TypeAliasDeclaration) — `{ file_path: string; offset?: number | undefined; limit?: number | undefined; pages?: string | undefined; }`
- `ReadInputJsonSchema` (VariableDeclaration) — `import("../index.js").JsonSchema`
- `ReadInputSchema` (VariableDeclaration) — `z.ZodEffects<z.ZodObject<{ file_path: z.ZodString; offset: z.ZodOptional<z.ZodNumber>; limit: z.ZodOptional<z.ZodNumber>; } & { pages: z.ZodOptional<z.ZodString>; }, "strip", z.ZodTypeAny, { file_path`
- `ReadNotebookCellSchema` (VariableDeclaration) — `z.ZodObject<{ cellType: z.ZodEnum<["code", "markdown"]>; source: z.ZodString; outputs: z.ZodOptional<z.ZodArray<z.ZodObject<{ type: z.ZodEnum<["stream", "execute_result", "error", "display_data"]>; te`
- `ReadNotebookOutput` (InterfaceDeclaration) — `ReadNotebookOutput`
- `ReadNotebookOutputSchema` (VariableDeclaration) — `z.ZodObject<{ type: z.ZodLiteral<"notebook">; notebookPath: z.ZodString; cells: z.ZodArray<z.ZodObject<{ cellType: z.ZodEnum<["code", "markdown"]>; source: z.ZodString; outputs: z.ZodOptional<z.ZodArr`
- `ReadOutput` (TypeAliasDeclaration) — `ReadImageOutput | ReadNotebookOutput | ReadTextOutput | ReadVideoOutput | ReadPdfOutput | ReadPartsOutput | ReadUnchangedOutput`
- `ReadOutputJsonSchema` (VariableDeclaration) — `import("../index.js").JsonSchema`
- `ReadOutputSchema` (VariableDeclaration) — `z.ZodUnion<[z.ZodObject<{ type: z.ZodLiteral<"text">; filePath: z.ZodString; content: z.ZodString; numLines: z.ZodNumber; startLine: z.ZodNumber; totalLines: z.ZodNumber; sizeBytes: z.ZodOptional<z.Zo`
- `ReadPartsOutput` (InterfaceDeclaration) — `ReadPartsOutput`
- `ReadPartsOutputSchema` (VariableDeclaration) — `z.ZodObject<{ type: z.ZodLiteral<"parts">; filePath: z.ZodString; numParts: z.ZodNumber; originalSize: z.ZodNumber; pages: z.ZodArray<z.ZodObject<{ type: z.ZodLiteral<"image">; base64: z.ZodString; mi`
- `ReadPdfInputJsonSchema` (VariableDeclaration) — `import("../index.js").JsonSchema`
- `ReadPdfOutput` (InterfaceDeclaration) — `ReadPdfOutput`
- `ReadPdfOutputSchema` (VariableDeclaration) — `z.ZodObject<{ type: z.ZodLiteral<"pdf">; filePath: z.ZodString; base64: z.ZodString; originalSize: z.ZodNumber; pages: z.ZodOptional<z.ZodString>; }, "strict", z.ZodTypeAny, { type: "pdf"; filePath: s`
- `ReadPdfPageRange` (InterfaceDeclaration) — `ReadPdfPageRange`
- `ReadPdfPagesValidationFailure` (InterfaceDeclaration) — `ReadPdfPagesValidationFailure`
- `ReadTextOutput` (InterfaceDeclaration) — `ReadTextOutput`
- `ReadTextOutputSchema` (VariableDeclaration) — `z.ZodObject<{ type: z.ZodLiteral<"text">; filePath: z.ZodString; content: z.ZodString; numLines: z.ZodNumber; startLine: z.ZodNumber; totalLines: z.ZodNumber; sizeBytes: z.ZodOptional<z.ZodNumber>; by`
- `ReadToolCall` (InterfaceDeclaration) — `ReadToolCall`
- `ReadToolResult` (InterfaceDeclaration) — `ReadToolResult`
- `ReadUnchangedOutput` (InterfaceDeclaration) — `ReadUnchangedOutput`
- `ReadUnchangedOutputSchema` (VariableDeclaration) — `z.ZodObject<{ type: z.ZodLiteral<"file_unchanged">; filePath: z.ZodString; }, "strict", z.ZodTypeAny, { type: "file_unchanged"; filePath: string; }, { type: "file_unchanged"; filePath: string; }>`
- `ReadVideoOutput` (InterfaceDeclaration) — `ReadVideoOutput`
- `ReadVideoOutputSchema` (VariableDeclaration) — `z.ZodObject<{ type: z.ZodLiteral<"video">; base64: z.ZodString; mimeType: z.ZodEnum<["video/mp4", "video/quicktime", "video/webm", "video/x-matroska", "video/x-m4v", "video/x-msvideo"]>; originalSize:`

### `tools/resolve-workflow-question.ts`

- `RESOLVE_WORKFLOW_QUESTION_TOOL_NAME` (VariableDeclaration) — `"ResolveWorkflowQuestion"`
- `ResolveWorkflowQuestionInput` (TypeAliasDeclaration) — `{ question_id: string; answer: string; }`
- `ResolveWorkflowQuestionInputJsonSchema` (VariableDeclaration) — `import("../index.js").JsonSchema`
- `ResolveWorkflowQuestionInputSchema` (VariableDeclaration) — `z.ZodObject<{ question_id: z.ZodString; answer: z.ZodString; }, "strict", z.ZodTypeAny, { question_id: string; answer: string; }, { question_id: string; answer: string; }>`
- `ResolveWorkflowQuestionOutput` (TypeAliasDeclaration) — `{ ok: true; response: string; qid: string; }`
- `ResolveWorkflowQuestionOutputJsonSchema` (VariableDeclaration) — `import("../index.js").JsonSchema`
- `ResolveWorkflowQuestionOutputSchema` (VariableDeclaration) — `z.ZodObject<{ ok: z.ZodLiteral<true>; qid: z.ZodString; response: z.ZodString; }, "strict", z.ZodTypeAny, { ok: true; response: string; qid: string; }, { ok: true; response: string; qid: string; }>`

### `tools/respond-to-coordinator.ts`

- `RESPOND_TO_COORDINATOR_MAX_CONTENT_CHARS` (VariableDeclaration) — `20000`
- `RESPOND_TO_COORDINATOR_TOOL_NAME` (VariableDeclaration) — `"RespondToCoordinator"`
- `RespondToCoordinatorInput` (TypeAliasDeclaration) — `{ message: string; summary: string; }`
- `RespondToCoordinatorInputJsonSchema` (VariableDeclaration) — `import("../index.js").JsonSchema`
- `RespondToCoordinatorInputSchema` (VariableDeclaration) — `z.ZodObject<{ summary: z.ZodString; message: z.ZodString; }, "strict", z.ZodTypeAny, { message: string; summary: string; }, { message: string; summary: string; }>`
- `RespondToCoordinatorOutput` (TypeAliasDeclaration) — `{ status: "failed" | "success"; message: string; responseId: string; error?: string | undefined; }`
- `RespondToCoordinatorOutputSchema` (VariableDeclaration) — `z.ZodObject<{ status: z.ZodEnum<["success", "failed"]>; responseId: z.ZodString; message: z.ZodString; error: z.ZodOptional<z.ZodString>; }, "strict", z.ZodTypeAny, { status: "failed" | "success"; mes`

### `tools/resume-workflow-run.ts`

- `RESUME_WORKFLOW_RUN_TOOL_NAME` (VariableDeclaration) — `"ResumeWorkflowRun"`
- `ResumeWorkflowRunInput` (TypeAliasDeclaration) — `{ run_id: string; }`
- `ResumeWorkflowRunInputJsonSchema` (VariableDeclaration) — `import("../index.js").JsonSchema`
- `ResumeWorkflowRunInputSchema` (VariableDeclaration) — `z.ZodObject<{ run_id: z.ZodString; }, "strict", z.ZodTypeAny, { run_id: string; }, { run_id: string; }>`
- `ResumeWorkflowRunOutput` (TypeAliasDeclaration) — `{ status: "backgrounded"; backgroundTaskId: string; ok: true; response: string; runId: string; }`
- `ResumeWorkflowRunOutputJsonSchema` (VariableDeclaration) — `import("../index.js").JsonSchema`
- `ResumeWorkflowRunOutputSchema` (VariableDeclaration) — `z.ZodObject<{ ok: z.ZodLiteral<true>; runId: z.ZodString; response: z.ZodString; status: z.ZodLiteral<"backgrounded">; backgroundTaskId: z.ZodString; }, "strict", z.ZodTypeAny, { status: "backgrounded`

### `tools/save-workflow.ts`

- `SAVE_WORKFLOW_SENTINEL_IN_SCRIPT_ERROR` (VariableDeclaration) — `"The `script`must be the workflow body only — it already starts with a`/\* knorvia-workflow`metadata block. Pass the metadata through the`description`/`whenToUse`/`args` fields instead; the blo`
- `SAVE_WORKFLOW_SOURCE_ERROR` (VariableDeclaration) — `"Provide exactly one script source: `script`for the body inline, or`script_path` for the file holding it (a draft, usually). Passing both, or neither, is ambiguous."`
- `SAVE_WORKFLOW_TOOL_NAME` (VariableDeclaration) — `"SaveWorkflow"`
- `SaveWorkflowInput` (TypeAliasDeclaration) — `{ scope: "project" | "global"; description: string; name: string; path?: string | undefined; script?: string | undefined; args?: Record<string, { type: "string" | "number" | "boolean" | "json"; descri`
- `SaveWorkflowInputJsonSchema` (VariableDeclaration) — `import("../index.js").JsonSchema`
- `SaveWorkflowInputSchema` (VariableDeclaration) — `z.ZodObject<{ name: z.ZodString; description: z.ZodString; whenToUse: z.ZodOptional<z.ZodString>; args: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodObject<{ type: z.ZodEnum<["string", "number", "boole`
- `SaveWorkflowOutput` (TypeAliasDeclaration) — `{ scope: "project" | "global"; path: string; name: string; diagnostics: { code: number; message: string; line: number; column: number; }[]; ok: boolean; response: string; overwritten?: boolean | undef`
- `SaveWorkflowOutputJsonSchema` (VariableDeclaration) — `import("../index.js").JsonSchema`
- `SaveWorkflowOutputSchema` (VariableDeclaration) — `z.ZodObject<{ diagnostics: z.ZodArray<z.ZodObject<{ code: z.ZodNumber; column: z.ZodNumber; line: z.ZodNumber; message: z.ZodString; }, "strict", z.ZodTypeAny, { code: number; message: string; line: n`

### `tools/saved-workflow.ts`

- `isValidSavedWorkflowName` (FunctionDeclaration) — `export function isValidSavedWorkflowName(name: string): boolean { if (name.length === 0 || name.length > SAVED_WORKFLOW_MAX_NAME_CHARS) return false; if (!SAVED_WORKFLOW_NAME_PATTERN.test(name)) retur`
- `SAVED_WORKFLOW_ARG_TYPES` (VariableDeclaration) — `readonly ["string", "number", "boolean", "json"]`
- `SAVED_WORKFLOW_FILE_EXTENSION` (VariableDeclaration) — `".dwf.ts"`
- `SAVED_WORKFLOW_GLOBAL_DIR` (VariableDeclaration) — `".knorvia-studio/workflows"`
- `SAVED_WORKFLOW_MAX_NAME_CHARS` (VariableDeclaration) — `64`
- `SAVED_WORKFLOW_NAME_PATTERN` (VariableDeclaration) — `RegExp`
- `SAVED_WORKFLOW_PROJECT_DIR` (VariableDeclaration) — `".knorvia-studio/workflows"`
- `SAVED_WORKFLOW_SCOPES` (VariableDeclaration) — `readonly ["project", "global"]`
- `SAVED_WORKFLOW_SHADOWING` (VariableDeclaration) — `readonly ["hides_global", "hidden_by_project"]`
- `SavedWorkflowArgDeclaration` (TypeAliasDeclaration) — `{ type: "string" | "number" | "boolean" | "json"; description?: string | undefined; required?: boolean | undefined; default?: unknown; }`
- `SavedWorkflowArgDeclarationSchema` (VariableDeclaration) — `z.ZodObject<{ type: z.ZodEnum<["string", "number", "boolean", "json"]>; description: z.ZodOptional<z.ZodString>; required: z.ZodOptional<z.ZodBoolean>; default: z.ZodOptional<z.ZodUnknown>; }, "strict`
- `SavedWorkflowArgsDeclaration` (TypeAliasDeclaration) — `{ [x: string]: { type: "string" | "number" | "boolean" | "json"; description?: string | undefined; required?: boolean | undefined; default?: unknown; }; }`
- `SavedWorkflowArgsDeclarationSchema` (VariableDeclaration) — `z.ZodRecord<z.ZodString, z.ZodObject<{ type: z.ZodEnum<["string", "number", "boolean", "json"]>; description: z.ZodOptional<z.ZodString>; required: z.ZodOptional<z.ZodBoolean>; default: z.ZodOptional<`
- `SavedWorkflowArgType` (TypeAliasDeclaration) — `"string" | "number" | "boolean" | "json"`
- `SavedWorkflowArgTypeSchema` (VariableDeclaration) — `z.ZodEnum<["string", "number", "boolean", "json"]>`
- `SavedWorkflowEntry` (TypeAliasDeclaration) — `{ scope: "project" | "global"; path: string; description: string; name: string; args?: Record<string, { type: "string" | "number" | "boolean" | "json"; description?: string | undefined; required?: boo`
- `SavedWorkflowEntrySchema` (VariableDeclaration) — `z.ZodObject<{ name: z.ZodString; description: z.ZodString; whenToUse: z.ZodOptional<z.ZodString>; args: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodObject<{ type: z.ZodEnum<["string", "number", "boole`
- `SavedWorkflowInvalidEntry` (TypeAliasDeclaration) — `{ path: string; reason: string; }`
- `SavedWorkflowInvalidEntrySchema` (VariableDeclaration) — `z.ZodObject<{ path: z.ZodString; reason: z.ZodString; }, "strict", z.ZodTypeAny, { path: string; reason: string; }, { path: string; reason: string; }>`
- `SavedWorkflowMeta` (TypeAliasDeclaration) — `{ description: string; args?: Record<string, { type: "string" | "number" | "boolean" | "json"; description?: string | undefined; required?: boolean | undefined; default?: unknown; }> | undefined; when`
- `SavedWorkflowMetaSchema` (VariableDeclaration) — `z.ZodObject<{ description: z.ZodString; whenToUse: z.ZodOptional<z.ZodString>; args: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodObject<{ type: z.ZodEnum<["string", "number", "boolean", "json"]>; desc`
- `SavedWorkflowScope` (TypeAliasDeclaration) — `"project" | "global"`
- `SavedWorkflowScopeSchema` (VariableDeclaration) — `z.ZodEnum<["project", "global"]>`
- `SavedWorkflowShadowing` (TypeAliasDeclaration) — `"hides_global" | "hidden_by_project"`
- `SavedWorkflowShadowingSchema` (VariableDeclaration) — `z.ZodEnum<["hides_global", "hidden_by_project"]>`
- `WORKFLOW_DRAFTS_DIR` (VariableDeclaration) — `".knorvia-studio/workflow-drafts"`

### `tools/send-message.ts`

- `SEND_MESSAGE_MAX_CONTENT_CHARS` (VariableDeclaration) — `20000`
- `SEND_MESSAGE_TOOL_NAME` (VariableDeclaration) — `"SendMessage"`
- `SendMessageInput` (TypeAliasDeclaration) — `{ message: string; summary: string; to: string; }`
- `SendMessageInputJsonSchema` (VariableDeclaration) — `import("../index.js").JsonSchema`
- `SendMessageInputSchema` (VariableDeclaration) — `z.ZodObject<{ to: z.ZodString; summary: z.ZodString; message: z.ZodString; }, "strict", z.ZodTypeAny, { message: string; summary: string; to: string; }, { message: string; summary: string; to: string;`
- `SendMessageOutput` (TypeAliasDeclaration) — `{ messageId: string; status: "failed" | "success"; message?: string | undefined; agentId?: string | undefined; outputFile?: string | undefined; error?: string | undefined; taskId?: string | undefined;`
- `SendMessageOutputJsonSchema` (VariableDeclaration) — `import("../index.js").JsonSchema`
- `SendMessageOutputSchema` (VariableDeclaration) — `z.ZodObject<{ status: z.ZodEnum<["success", "failed"]>; messageId: z.ZodString; agentId: z.ZodOptional<z.ZodString>; delivery: z.ZodOptional<z.ZodEnum<["queued", "steered", "resumed_background"]>>; er`

### `tools/skill.ts`

- `SkillInput` (TypeAliasDeclaration) — `{ skill: string; args?: string | undefined; }`
- `SkillInputJsonSchema` (VariableDeclaration) — `import("../index.js").JsonSchema`
- `SkillInputSchema` (VariableDeclaration) — `z.ZodEffects<z.ZodUnion<[z.ZodObject<{ skill: z.ZodString; args: z.ZodOptional<z.ZodString>; }, "strip", z.ZodTypeAny, { skill: string; args?: string | undefined; }, { skill: string; args?: string | u`
- `SkillOutput` (TypeAliasDeclaration) — `string | SkillStructuredOutput`
- `SkillOutputJsonSchema` (VariableDeclaration) — `import("../index.js").JsonSchema`
- `SkillOutputSchema` (VariableDeclaration) — `z.ZodUnion<[z.ZodString, z.ZodObject<{ name: z.ZodString; content: z.ZodString; baseDirectory: z.ZodString; truncated: z.ZodBoolean; }, "strict", z.ZodTypeAny, { content: string; name: string; truncat`
- `SkillRuntimeInput` (TypeAliasDeclaration) — `{ args: string | undefined; skill: string; }`
- `SkillStructuredOutput` (InterfaceDeclaration) — `SkillStructuredOutput`
- `SkillStructuredOutputSchema` (VariableDeclaration) — `z.ZodObject<{ name: z.ZodString; content: z.ZodString; baseDirectory: z.ZodString; truncated: z.ZodBoolean; }, "strict", z.ZodTypeAny, { content: string; name: string; truncated: boolean; baseDirector`
- `SkillToolCall` (InterfaceDeclaration) — `SkillToolCall`
- `SkillToolResult` (InterfaceDeclaration) — `SkillToolResult`

### `tools/submit-result.ts`

- `SUBMIT_RESULT_TOOL_NAME` (VariableDeclaration) — `"submit_result"`
- `SubmitResultInput` (TypeAliasDeclaration) — `{ result?: unknown; }`
- `SubmitResultInputJsonSchema` (VariableDeclaration) — `import("../index.js").JsonSchema`
- `SubmitResultInputSchema` (VariableDeclaration) — `z.ZodObject<{ result: z.ZodUnknown; }, "strict", z.ZodTypeAny, { result?: unknown; }, { result?: unknown; }>`
- `SubmitResultOutput` (TypeAliasDeclaration) — `{ status: "accepted"; }`
- `SubmitResultOutputJsonSchema` (VariableDeclaration) — `import("../index.js").JsonSchema`
- `SubmitResultOutputSchema` (VariableDeclaration) — `z.ZodObject<{ status: z.ZodLiteral<"accepted">; }, "strict", z.ZodTypeAny, { status: "accepted"; }, { status: "accepted"; }>`
- `typedSubmitResultInputSchema` (FunctionDeclaration) — `export function typedSubmitResultInputSchema( resultSchema: Record<string, unknown>, ): Record<string, unknown> { return { type: "object", properties: { result: { description: "The structured result f`

### `tools/target.ts`

- `escapeGoalPromptText` (FunctionDeclaration) — `export function escapeGoalPromptText(input: string): string { return input.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;"); }`
- `failedGoalCompletionVerification` (FunctionDeclaration) — `export function failedGoalCompletionVerification(reason: string): GoalCompletionVerificationOutput { // 这个兜底表示 verifier 自身失败，不是模型给出的下一步。 // 若写入 nextAction，UI 会把内部控制文案当成下一轮迭代标题展示。 return { passed: fals`
- `failOpenGoalCompletionVerification` (FunctionDeclaration) — `export function failOpenGoalCompletionVerification( reason: string, ): GoalCompletionVerificationOutput { // 这里表示 verifier 基础设施/格式失败，不是 verifier 明确判定目标未完成。 // 默认通过能避免 goal 因裁判链路偶发失败被无限卡住，同时保留 reason 供`
- `formatGoalCompletionVerificationFailurePrompt` (FunctionDeclaration) — `export function formatGoalCompletionVerificationFailurePrompt(input: { goal: SessionGoal; reason: string; nextAction: string; }): string { return [ "<system-reminder>", "The active session goal was no`
- `formatGoalCompletionVerificationPassedContent` (FunctionDeclaration) — `export function formatGoalCompletionVerificationPassedContent(input: { goal: SessionGoal; reason: string; }): string { return [ "Goal completion verification passed.", `Status: ${input.goal.status}`, `
- `formatGoalCompletionVerificationPrompt` (FunctionDeclaration) — `export function formatGoalCompletionVerificationPrompt(goal: SessionGoal): string { const tokenBudget = goal.tokenBudget === null ? "none" : goal.tokenBudget.toString(); return [ "Verify whether the a`
- `formatGoalContinuationPrompt` (FunctionDeclaration) — `export function formatGoalContinuationPrompt( goal: SessionGoal, verification?: Pick<GoalCompletionVerificationOutput, "nextAction" | "reason"> | null, ): string { const tokenBudget = goal.tokenBudget`
- `formatGoalStateForModel` (FunctionDeclaration) — `export function formatGoalStateForModel(goal: SessionGoal | null): string { if (!goal) return ""; const budget = goal.tokenBudget === null ? "none" : goal.tokenBudget.toString(); return [ "Current ses`
- `GOAL_COMPLETION_VERIFICATION_FALLBACK_REASON` (VariableDeclaration) — `"The completion verifier could not confirm that every goal requirement is complete."`
- `GOAL_COMPLETION_VERIFICATION_QUERY_SOURCE` (VariableDeclaration) — `"target_completion_verification"`
- `GoalCompletionVerificationOutput` (TypeAliasDeclaration) — `{ reason: string; passed: boolean; nextAction?: string | undefined; }`
- `GoalCompletionVerificationOutputSchema` (VariableDeclaration) — `z.ZodObject<{ nextAction: z.ZodOptional<z.ZodString>; passed: z.ZodBoolean; reason: z.ZodString; }, "strict", z.ZodTypeAny, { reason: string; passed: boolean; nextAction?: string | undefined; }, { rea`
- `GoalObjectiveSchema` (VariableDeclaration) — `z.ZodEffects<z.ZodEffects<z.ZodEffects<z.ZodString, string, string>, string, string>, string, string>`
- `GoalReadInput` (TypeAliasDeclaration) — `{}`
- `GoalReadInputJsonSchema` (VariableDeclaration) — `import("../index.js").JsonSchema`
- `GoalReadInputSchema` (VariableDeclaration) — `z.ZodObject<{}, "strict", z.ZodTypeAny, {}, {}>`
- `GoalReadOutput` (InterfaceDeclaration) — `GoalReadOutput`
- `GoalReadOutputJsonSchema` (VariableDeclaration) — `import("../index.js").JsonSchema`
- `GoalReadOutputSchema` (VariableDeclaration) — `z.ZodObject<{ goal: z.ZodNullable<z.ZodObject<{ sessionID: z.ZodString; targetID: z.ZodString; objective: z.ZodString; summaryTitle: z.ZodNullable<z.ZodString>; status: z.ZodEnum<["active", "paused", `
- `GoalStatus` (VariableDeclaration | TypeAliasDeclaration) — `{ readonly Active: "active"; readonly Paused: "paused"; readonly BudgetLimited: "budget_limited"; readonly Complete: "complete"; }`
- `GoalStatusSchema` (VariableDeclaration) — `z.ZodEnum<["active", "paused", "budget_limited", "complete"]>`
- `GoalTokenBudgetSchema` (VariableDeclaration) — `z.ZodNullable<z.ZodNumber>`
- `MAX_GOAL_OBJECTIVE_CHARS` (VariableDeclaration) — `4000`
- `normalizeGoalObjective` (FunctionDeclaration) — `export function normalizeGoalObjective(value: string): string { return GoalObjectiveSchema.parse(value); }`
- `parseGoalCompletionVerificationText` (FunctionDeclaration) — `export function parseGoalCompletionVerificationText( text: string, ): GoalCompletionVerificationOutput { const parsed = parseJsonObject(text); if (!parsed) { // verifier 是 goal 完成闸门，但 provider 偶发坏 JSO`
- `SessionGoal` (InterfaceDeclaration) — `SessionGoal`
- `SessionGoalSchema` (VariableDeclaration) — `z.ZodObject<{ sessionID: z.ZodString; targetID: z.ZodString; objective: z.ZodString; summaryTitle: z.ZodNullable<z.ZodString>; status: z.ZodEnum<["active", "paused", "budget_limited", "complete"]>; to`

### `tools/task-output.ts`

- `TASK_OUTPUT_ALIASES` (VariableDeclaration) — `readonly ["AgentOutputTool", "BashOutputTool", "AgentOutput", "BashOutput"]`
- `TASK_OUTPUT_PROVIDER_DESCRIPTION` (VariableDeclaration) — `"DEPRECATED: Background tasks return their output file path in the tool result, and you receive a <task-notification> with the same path when the task completes.\n- For bash tasks: prefer using the Re`
- `TASK_OUTPUT_TOOL_NAME` (VariableDeclaration) — `"TaskOutput"`
- `TaskOutputInput` (TypeAliasDeclaration) — `{ timeout: number; task_id: string; block: boolean; }`
- `TaskOutputInputJsonSchema` (VariableDeclaration) — `{ required: string[]; }`
- `TaskOutputInputSchema` (VariableDeclaration) — `z.ZodObject<{ task_id: z.ZodString; block: z.ZodEffects<z.ZodDefault<z.ZodBoolean>, boolean, unknown>; timeout: z.ZodDefault<z.ZodNumber>; }, "strict", z.ZodTypeAny, { timeout: number; task_id: string`
- `TaskOutputResult` (TypeAliasDeclaration) — `{ task: { status: string; description: string; output: string; task_id: string; task_type: string; prompt?: string | undefined; outputFile?: string | undefined; exitCode?: number | null | undefined; r`
- `TaskOutputResultJsonSchema` (VariableDeclaration) — `import("../index.js").JsonSchema`
- `TaskOutputResultSchema` (VariableDeclaration) — `z.ZodObject<{ retrieval_status: z.ZodEnum<["success", "not_ready", "timeout"]>; task: z.ZodNullable<z.ZodObject<{ task_id: z.ZodString; task_type: z.ZodString; status: z.ZodString; description: z.ZodS`
- `TaskOutputTask` (TypeAliasDeclaration) — `{ status: string; description: string; output: string; task_id: string; task_type: string; prompt?: string | undefined; outputFile?: string | undefined; exitCode?: number | null | undefined; result?: `
- `TaskOutputTaskSchema` (VariableDeclaration) — `z.ZodObject<{ task_id: z.ZodString; task_type: z.ZodString; status: z.ZodString; description: z.ZodString; output: z.ZodString; exitCode: z.ZodOptional<z.ZodNullable<z.ZodNumber>>; error: z.ZodOptiona`

### `tools/task-stop.ts`

- `TASK_STOP_TOOL_NAME` (VariableDeclaration) — `"TaskStop"`
- `TaskStopInput` (TypeAliasDeclaration) — `{ task_id?: string | undefined; shell_id?: string | undefined; }`
- `TaskStopInputJsonSchema` (VariableDeclaration) — `import("../index.js").JsonSchema`
- `TaskStopInputSchema` (VariableDeclaration) — `z.ZodObject<{ task_id: z.ZodOptional<z.ZodString>; shell_id: z.ZodOptional<z.ZodString>; }, "strict", z.ZodTypeAny, { task_id?: string | undefined; shell_id?: string | undefined; }, { task_id?: string`
- `TaskStopOutput` (TypeAliasDeclaration) — `{ message: string; task_id: string; task_type: string; command?: string | undefined; }`
- `TaskStopOutputJsonSchema` (VariableDeclaration) — `import("../index.js").JsonSchema`
- `TaskStopOutputSchema` (VariableDeclaration) — `z.ZodObject<{ message: z.ZodString; task_id: z.ZodString; task_type: z.ZodString; command: z.ZodOptional<z.ZodString>; }, "strict", z.ZodTypeAny, { message: string; task_id: string; task_type: string;`

### `tools/todo.ts`

- `formatTodoStateForModel` (FunctionDeclaration) — `export function formatTodoStateForModel(todos: readonly TodoItem[]): string { if (todos.length === 0) { return ""; } return [ "Current session todo state (authoritative):", ...todos.map( (todo, index)`
- `isTodoToolName` (FunctionDeclaration) — `export function isTodoToolName(value: string | undefined): value is "TodoRead" | "TodoWrite" { return value === "TodoRead" || value === "TodoWrite"; }`
- `ParsedTodoReadOutput` (TypeAliasDeclaration) — `{ todos: { status: "completed" | "pending" | "in_progress"; content: string; priority: "high" | "medium" | "low"; }[]; }`
- `ParsedTodoWriteOutput` (TypeAliasDeclaration) — `{ summary: { completed: number; pending: number; total: number; inProgress: number; }; todos: { status: "completed" | "pending" | "in_progress"; content: string; priority: "high" | "medium" | "low"; }`
- `TodoItem` (TypeAliasDeclaration) — `{ status: "completed" | "pending" | "in_progress"; content: string; priority: "high" | "medium" | "low"; }`
- `TodoItemSchema` (VariableDeclaration) — `z.ZodObject<{ content: z.ZodString; status: z.ZodEnum<["pending", "in_progress", "completed"]>; priority: z.ZodEnum<["high", "medium", "low"]>; }, "strip", z.ZodTypeAny, { status: "completed" | "pendi`
- `todoItemsFromToolResultContent` (FunctionDeclaration) — `export function todoItemsFromToolResultContent(content: string): TodoItem[] | undefined { let parsed: unknown; try { parsed = JSON.parse(content); } catch { return undefined; } const readResult = Todo`
- `TodoPriority` (VariableDeclaration | TypeAliasDeclaration) — `{ readonly High: "high"; readonly Medium: "medium"; readonly Low: "low"; }`
- `TodoReadInput` (TypeAliasDeclaration) — `{}`
- `TodoReadInputJsonSchema` (VariableDeclaration) — `import("../index.js").JsonSchema`
- `TodoReadInputSchema` (VariableDeclaration) — `z.ZodObject<{}, "strict", z.ZodTypeAny, {}, {}>`
- `TodoReadOutput` (InterfaceDeclaration) — `TodoReadOutput`
- `TodoReadOutputJsonSchema` (VariableDeclaration) — `import("../index.js").JsonSchema`
- `TodoReadOutputSchema` (VariableDeclaration) — `z.ZodObject<{ todos: z.ZodArray<z.ZodObject<{ content: z.ZodString; status: z.ZodEnum<["pending", "in_progress", "completed"]>; priority: z.ZodEnum<["high", "medium", "low"]>; }, "strip", z.ZodTypeAny`
- `TodoReadToolCall` (InterfaceDeclaration) — `TodoReadToolCall`
- `TodoStatus` (VariableDeclaration | TypeAliasDeclaration) — `{ readonly Pending: "pending"; readonly InProgress: "in_progress"; readonly Completed: "completed"; }`
- `TodoSummary` (InterfaceDeclaration) — `TodoSummary`
- `TodoSummarySchema` (VariableDeclaration) — `z.ZodObject<{ total: z.ZodNumber; pending: z.ZodNumber; inProgress: z.ZodNumber; completed: z.ZodNumber; }, "strict", z.ZodTypeAny, { completed: number; pending: number; total: number; inProgress: num`
- `TodoWriteInput` (TypeAliasDeclaration) — `{ todos: { status: "completed" | "pending" | "in_progress"; content: string; priority: "high" | "medium" | "low"; }[]; }`
- `TodoWriteInputJsonSchema` (VariableDeclaration) — `import("../index.js").JsonSchema`
- `TodoWriteInputSchema` (VariableDeclaration) — `z.ZodObject<{ todos: z.ZodArray<z.ZodObject<{ content: z.ZodString; status: z.ZodEnum<["pending", "in_progress", "completed"]>; priority: z.ZodEnum<["high", "medium", "low"]>; }, "strip", z.ZodTypeAny`
- `TodoWriteOutput` (InterfaceDeclaration) — `TodoWriteOutput`
- `TodoWriteOutputJsonSchema` (VariableDeclaration) — `import("../index.js").JsonSchema`
- `TodoWriteOutputSchema` (VariableDeclaration) — `z.ZodObject<{ oldTodos: z.ZodArray<z.ZodObject<{ content: z.ZodString; status: z.ZodEnum<["pending", "in_progress", "completed"]>; priority: z.ZodEnum<["high", "medium", "low"]>; }, "strip", z.ZodType`
- `TodoWriteToolCall` (InterfaceDeclaration) — `TodoWriteToolCall`

### `tools/tool-result-metadata.ts`

- `ApplicationIconLocator` (TypeAliasDeclaration) — `{ value: string; kind: "darwin-bundle-id"; } | { value: string; kind: "windows-executable-path"; } | { value: string; kind: "windows-aumid"; }`
- `applicationIconLocatorSchema` (VariableDeclaration) — `z.ZodDiscriminatedUnion<"kind", [z.ZodObject<{ kind: z.ZodLiteral<"darwin-bundle-id">; value: z.ZodString; }, "strict", z.ZodTypeAny, { value: string; kind: "darwin-bundle-id"; }, { value: string; kin`
- `COMPLETED_TOOL_PART_METADATA_SCHEMA_VERSION` (VariableDeclaration) — `1`
- `CompletedToolPartMetadata` (TypeAliasDeclaration) — `{ schemaVersion: 1; display?: { kind: "bash_output"; truncated: boolean; output: string; outputPath?: string | undefined; } | { kind: "file_diff"; structuredPatch: { oldStart: number; oldLines: number`
- `completedToolPartMetadataSchema` (VariableDeclaration) — `z.ZodObject<{ schemaVersion: z.ZodLiteral<1>; display: z.ZodOptional<z.ZodDiscriminatedUnion<"kind", [z.ZodObject<{ kind: z.ZodLiteral<"bash_output">; output: z.ZodString; truncated: z.ZodBoolean; out`
- `CreateWorkflowToolResultDisplayPayload` (TypeAliasDeclaration) — `{ kind: "create_workflow"; diagnostics: { code: number; message: string; line: number; column: number; }[]; ok: boolean; errorCount: number; truncated?: boolean | undefined; causalityGraph?: { lanes: `
- `createWorkflowToolResultDisplayPayloadSchema` (VariableDeclaration) — `z.ZodObject<{ kind: z.ZodLiteral<"create_workflow">; ok: z.ZodBoolean; errorCount: z.ZodNumber; diagnostics: z.ZodArray<z.ZodObject<{ line: z.ZodNumber; column: z.ZodNumber; code: z.ZodNumber; message`
- `CUA_TARGET_APP_DISPLAY_META_KEY` (VariableDeclaration) — `"knorvia.cua/target-app-display-v1"`
- `CuaRequestAccessStatusDisplay` (TypeAliasDeclaration) — `{ schemaVersion: 1; platform: "darwin"; grantOwner: string; accessibility: "granted" | "stale" | "denied"; screenRecording: "unknown" | "granted" | "denied"; }`
- `cuaRequestAccessStatusDisplaySchema` (VariableDeclaration) — `z.ZodObject<{ schemaVersion: z.ZodLiteral<1>; platform: z.ZodLiteral<"darwin">; grantOwner: z.ZodString; accessibility: z.ZodEnum<["granted", "stale", "denied"]>; screenRecording: z.ZodEnum<["granted"`
- `CuaTargetAppDisplay` (TypeAliasDeclaration) — `{ schemaVersion: 1; iconLocators: ({ value: string; kind: "darwin-bundle-id"; } | { value: string; kind: "windows-executable-path"; } | { value: string; kind: "windows-aumid"; })[]; displayName?: stri`
- `cuaTargetAppDisplaySchema` (VariableDeclaration) — `z.ZodObject<{ schemaVersion: z.ZodLiteral<1>; displayName: z.ZodOptional<z.ZodString>; iconLocators: z.ZodArray<z.ZodDiscriminatedUnion<"kind", [z.ZodObject<{ kind: z.ZodLiteral<"darwin-bundle-id">; v`
- `CuaToolResultDisplayPayload` (TypeAliasDeclaration) — `{ status: "failed" | "success"; kind: "cua"; toolName: string; schemaVersion: 1; text?: string | undefined; structuredContent?: string | undefined; input?: string | undefined; truncated?: boolean | un`
- `cuaToolResultDisplayPayloadSchema` (VariableDeclaration) — `z.ZodObject<{ kind: z.ZodLiteral<"cua">; schemaVersion: z.ZodLiteral<1>; toolName: z.ZodString; status: z.ZodEnum<["success", "failed"]>; input: z.ZodOptional<z.ZodString>; structuredContent: z.ZodOpt`
- `FileDiffToolResultDisplayPayload` (TypeAliasDeclaration) — `{ kind: "file_diff"; structuredPatch: { oldStart: number; oldLines: number; newStart: number; newLines: number; lines: string[]; }[]; filePath: string; additions: number; deletions: number; truncated?`
- `fileDiffToolResultDisplayPayloadSchema` (VariableDeclaration) — `z.ZodObject<{ kind: z.ZodLiteral<"file_diff">; filePath: z.ZodString; additions: z.ZodNumber; deletions: z.ZodNumber; structuredPatch: z.ZodArray<z.ZodObject<{ oldStart: z.ZodNumber; oldLines: z.ZodNu`
- `LocalAgentMessageToolResultDisplayPayload` (TypeAliasDeclaration) — `{ status: "failed" | "success"; kind: "local_agent_message"; message?: string | undefined; error?: string | undefined; }`
- `localAgentMessageToolResultDisplayPayloadSchema` (VariableDeclaration) — `z.ZodObject<{ kind: z.ZodLiteral<"local_agent_message">; status: z.ZodEnum<["success", "failed"]>; error: z.ZodOptional<z.ZodString>; message: z.ZodOptional<z.ZodString>; }, "strict", z.ZodTypeAny, { `
- `MCP_TOOL_DISPLAY_MAX_DESCRIPTION_CHARS` (VariableDeclaration) — `number`
- `MCP_TOOL_DISPLAY_MAX_NAME_CHARS` (VariableDeclaration) — `256`
- `McpToolResultDisplayPayload` (TypeAliasDeclaration) — `{ kind: "mcp_tool"; toolName: string; serverName: string; unavailable?: { code: "quota_exceeded" | "coding_plan_required"; } | undefined; description?: string | undefined; }`
- `mcpToolResultDisplayPayloadSchema` (VariableDeclaration) — `z.ZodObject<{ kind: z.ZodLiteral<"mcp_tool">; serverName: z.ZodString; toolName: z.ZodString; description: z.ZodOptional<z.ZodString>; unavailable: z.ZodOptional<z.ZodObject<{ code: z.ZodEnum<["quota_`
- `NodeReplCuaAppDisplay` (TypeAliasDeclaration) — `{ appKey: string; displayName?: string | undefined; }`
- `nodeReplCuaAppDisplaySchema` (VariableDeclaration) — `z.ZodObject<{ appKey: z.ZodString; displayName: z.ZodOptional<z.ZodString>; }, "strict", z.ZodTypeAny, { appKey: string; displayName?: string | undefined; }, { appKey: string; displayName?: string | u`
- `NodeReplImageToolResultDisplayPayload` (TypeAliasDeclaration) — `{ kind: "node_repl_images"; source?: "browser_turn_end" | undefined; truncated?: boolean | undefined; images?: { mimeType: string; base64: string; }[] | undefined; app?: { appKey: string; displayName?`
- `nodeReplImageToolResultDisplayPayloadSchema` (VariableDeclaration) — `z.ZodObject<{ kind: z.ZodLiteral<"node_repl_images">; images: z.ZodOptional<z.ZodArray<z.ZodObject<{ base64: z.ZodString; mimeType: z.ZodString; }, "strict", z.ZodTypeAny, { mimeType: string; base64: `
- `parseCompletedToolPartMetadata` (FunctionDeclaration) — `export function parseCompletedToolPartMetadata( input: unknown, ): CompletedToolPartMetadata | undefined { const scrubbed = isPlainRecord(input) && "display" in input ? { ...input, display: scrubPersi`
- `parseToolResultDisplayPayload` (FunctionDeclaration) — `export function parseToolResultDisplayPayload( input: unknown, ): ToolResultDisplayPayload | undefined { const result = toolResultDisplayPayloadSchema.safeParse(scrubPersistedDisplay(input)); return r`
- `RespondToCoordinatorToolResultDisplayPayload` (TypeAliasDeclaration) — `{ status: "failed" | "success"; kind: "respond_to_coordinator"; }`
- `respondToCoordinatorToolResultDisplayPayloadSchema` (VariableDeclaration) — `z.ZodObject<{ kind: z.ZodLiteral<"respond_to_coordinator">; status: z.ZodEnum<["success", "failed"]>; }, "strict", z.ZodTypeAny, { status: "failed" | "success"; kind: "respond_to_coordinator"; }, { st`
- `TASK_OUTPUT_DISPLAY_MAX_OUTPUT_CHARS` (VariableDeclaration) — `2000`
- `TASK_OUTPUT_DISPLAY_MAX_STATUS_CHARS` (VariableDeclaration) — `64`
- `TaskOutputToolResultDisplayPayload` (TypeAliasDeclaration) — `{ kind: "task_output"; retrievalStatus: "timeout" | "success" | "not_ready"; truncated?: true | undefined; output?: string | undefined; taskStatus?: string | undefined; }`
- `taskOutputToolResultDisplayPayloadSchema` (VariableDeclaration) — `z.ZodObject<{ kind: z.ZodLiteral<"task_output">; retrievalStatus: z.ZodEnum<["success", "not_ready", "timeout"]>; taskStatus: z.ZodOptional<z.ZodString>; output: z.ZodOptional<z.ZodString>; truncated:`
- `TaskStopToolResultDisplayPayload` (TypeAliasDeclaration) — `{ message: string; kind: "task_stop"; taskId: string; taskType: string; command?: string | undefined; truncated?: boolean | undefined; }`
- `taskStopToolResultDisplayPayloadSchema` (VariableDeclaration) — `z.ZodObject<{ kind: z.ZodLiteral<"task_stop">; taskId: z.ZodString; taskType: z.ZodString; command: z.ZodOptional<z.ZodString>; message: z.ZodString; truncated: z.ZodOptional<z.ZodBoolean>; }, "strict`
- `toolResultDisplayDiffHunkSchema` (VariableDeclaration) — `z.ZodObject<{ oldStart: z.ZodNumber; oldLines: z.ZodNumber; newStart: z.ZodNumber; newLines: z.ZodNumber; lines: z.ZodArray<z.ZodString, "many">; }, "strict", z.ZodTypeAny, { oldStart: number; oldLine`
- `ToolResultDisplayPayload` (TypeAliasDeclaration) — `{ kind: "bash_output"; truncated: boolean; output: string; outputPath?: string | undefined; } | { kind: "file_diff"; structuredPatch: { oldStart: number; oldLines: number; newStart: number; newLines: `
- `toolResultDisplayPayloadSchema` (VariableDeclaration) — `z.ZodDiscriminatedUnion<"kind", [z.ZodObject<{ kind: z.ZodLiteral<"bash_output">; output: z.ZodString; truncated: z.ZodBoolean; outputPath: z.ZodOptional<z.ZodString>; }, "strict", z.ZodTypeAny, { kin`
- `ToolResultSerializationMetadata` (TypeAliasDeclaration) — `{ truncated: boolean; originalBytes: number; returnedBytes: number; budgetStrategy: "inline" | "truncate" | "artifact"; artifactPath?: string | undefined; }`
- `toolResultSerializationMetadataSchema` (VariableDeclaration) — `z.ZodObject<{ truncated: z.ZodBoolean; originalBytes: z.ZodNumber; returnedBytes: z.ZodNumber; budgetStrategy: z.ZodEnum<["inline", "truncate", "artifact"]>; artifactPath: z.ZodOptional<z.ZodString>; `

### `tools/webfetch.ts`

- `WebFetchErrorCode` (VariableDeclaration | TypeAliasDeclaration) — `{ readonly InvalidUrl: "webfetch_invalid_url"; readonly UnsupportedProtocol: "webfetch_unsupported_protocol"; readonly CredentialsInUrl: "webfetch_credentials_in_url"; readonly MissingRedirectLocation`
- `WebFetchInput` (TypeAliasDeclaration) — `{ prompt: string; url: string; }`
- `WebFetchInputJsonSchema` (VariableDeclaration) — `import("../index.js").JsonSchema`
- `WebFetchInputSchema` (VariableDeclaration) — `z.ZodObject<{ url: z.ZodString; prompt: z.ZodString; }, "strip", z.ZodTypeAny, { prompt: string; url: string; }, { prompt: string; url: string; }>`
- `WebFetchOutput` (InterfaceDeclaration) — `WebFetchOutput`
- `WebFetchOutputJsonSchema` (VariableDeclaration) — `import("../index.js").JsonSchema`
- `WebFetchOutputSchema` (VariableDeclaration) — `z.ZodObject<{ url: z.ZodString; finalUrl: z.ZodString; status: z.ZodNumber; statusText: z.ZodString; contentType: z.ZodString; bytes: z.ZodNumber; durationMs: z.ZodNumber; result: z.ZodString; cacheHi`
- `WebFetchRedirect` (InterfaceDeclaration) — `WebFetchRedirect`
- `WebFetchRedirectSchema` (VariableDeclaration) — `z.ZodObject<{ from: z.ZodString; to: z.ZodString; status: z.ZodNumber; }, "strict", z.ZodTypeAny, { status: number; from: string; to: string; }, { status: number; from: string; to: string; }>`
- `WebFetchToolCall` (InterfaceDeclaration) — `WebFetchToolCall`
- `WebFetchToolResult` (InterfaceDeclaration) — `WebFetchToolResult`

### `tools/websearch.ts`

- `toWebSearchProviderNativeArgs` (FunctionDeclaration) — `export function toWebSearchProviderNativeArgs( input: WebSearchInput, defaults: { maxUses: number }, ): WebSearchProviderNativeArgs { return { allowedDomains: input.allowed_domains, blockedDomains: in`
- `WEBSEARCH_PROVIDER_NATIVE_SPEC` (VariableDeclaration) — `ProviderNativeToolSpec`
- `WEBSEARCH_TOOL_CONTRACT` (VariableDeclaration) — `ToolContractDeclaration`
- `WebSearchInput` (TypeAliasDeclaration) — `{ query: string; allowed_domains?: string[] | undefined; blocked_domains?: string[] | undefined; maxUses?: number | undefined; }`
- `WebSearchInputJsonSchema` (VariableDeclaration) — `import("../index.js").JsonSchema`
- `WebSearchInputSchema` (VariableDeclaration) — `z.ZodEffects<z.ZodObject<{ query: z.ZodString; allowed_domains: z.ZodOptional<z.ZodArray<z.ZodString, "many">>; blocked_domains: z.ZodOptional<z.ZodArray<z.ZodString, "many">>; } & { maxUses: z.ZodOpt`
- `WebSearchOutput` (TypeAliasDeclaration) — `{ durationMs: number; query: string; results: { url: string; title?: string | undefined; pageAge?: string | undefined; }[]; sources: { url: string; title?: string | undefined; }[]; summary?: string | `
- `WebSearchOutputJsonSchema` (VariableDeclaration) — `import("../index.js").JsonSchema`
- `WebSearchOutputSchema` (VariableDeclaration) — `z.ZodObject<{ query: z.ZodString; results: z.ZodArray<z.ZodObject<{ title: z.ZodOptional<z.ZodString>; url: z.ZodString; pageAge: z.ZodOptional<z.ZodString>; }, "strict", z.ZodTypeAny, { url: string; `
- `WebSearchProviderNativeArgs` (InterfaceDeclaration) — `WebSearchProviderNativeArgs`
- `WebSearchResultItem` (TypeAliasDeclaration) — `{ url: string; title?: string | undefined; pageAge?: string | undefined; }`
- `WebSearchResultItemSchema` (VariableDeclaration) — `z.ZodObject<{ title: z.ZodOptional<z.ZodString>; url: z.ZodString; pageAge: z.ZodOptional<z.ZodString>; }, "strict", z.ZodTypeAny, { url: string; title?: string | undefined; pageAge?: string | undefin`
- `WebSearchSource` (TypeAliasDeclaration) — `{ url: string; title?: string | undefined; }`
- `WebSearchSourceSchema` (VariableDeclaration) — `z.ZodObject<{ title: z.ZodOptional<z.ZodString>; url: z.ZodString; }, "strict", z.ZodTypeAny, { url: string; title?: string | undefined; }, { url: string; title?: string | undefined; }>`

### `tools/workflow-observation-display.ts`

- `EvalWorkflowSnippetToolResultDisplayPayload` (TypeAliasDeclaration) — `{ kind: "eval_workflow_snippet"; diagnostics: { code: number; message: string; line: number; column: number; }[]; ok: boolean; response: string; logs: string[]; durationMs: number; truncated?: boolean`
- `evalWorkflowSnippetToolResultDisplayPayloadSchema` (VariableDeclaration) — `z.ZodObject<{ kind: z.ZodLiteral<"eval_workflow_snippet">; ok: z.ZodBoolean; diagnostics: z.ZodArray<z.ZodObject<{ line: z.ZodNumber; column: z.ZodNumber; code: z.ZodNumber; message: z.ZodString; }, "`
- `getWorkflowRunToolResultDisplayErrorSchema` (VariableDeclaration) — `z.ZodObject<{ code: z.ZodString; message: z.ZodString; }, "strict", z.ZodTypeAny, { code: string; message: string; }, { code: string; message: string; }>`
- `getWorkflowRunToolResultDisplayLogEntrySchema` (VariableDeclaration) — `z.ZodObject<{ sequence: z.ZodNumber; message: z.ZodString; at: z.ZodOptional<z.ZodNumber>; }, "strict", z.ZodTypeAny, { message: string; sequence: number; at?: number | undefined; }, { message: string`
- `GetWorkflowRunToolResultDisplayPayload` (TypeAliasDeclaration) — `{ status: "completed" | "errored" | "pending" | "running" | "stopped"; kind: "get_workflow_run"; usage: { nodesRunning: number; spentTokens: number; nodesObserved: number; nodesCompleted: number; node`
- `getWorkflowRunToolResultDisplayPayloadSchema` (VariableDeclaration) — `z.ZodObject<{ kind: z.ZodLiteral<"get_workflow_run">; runId: z.ZodString; label: z.ZodString; status: z.ZodEnum<["completed", "errored", "pending", "running", "stopped"]>; stopReason: z.ZodOptional<z.`
- `getWorkflowRunToolResultDisplaySubagentSchema` (VariableDeclaration) — `z.ZodObject<{ siteId: z.ZodString; ordinal: z.ZodNumber; name: z.ZodOptional<z.ZodString>; state: z.ZodEnum<["idle", "executing", "waiting", "parked", "done", "failed", "unfinished"]>; phaseName: z.Zo`
- `ListModelsToolResultDisplayPayload` (TypeAliasDeclaration) — `{ kind: "list_models"; models: { providerId: string; modelId: string; id: string; reasoningLevels: string[]; providerLabel?: string | undefined; defaultReasoningLevel?: string | undefined; contextWind`
- `listModelsToolResultDisplayPayloadSchema` (VariableDeclaration) — `z.ZodObject<{ kind: z.ZodLiteral<"list_models">; current: z.ZodOptional<z.ZodString>; models: z.ZodArray<z.ZodObject<{ id: z.ZodString; providerId: z.ZodString; modelId: z.ZodString; providerLabel: z.`
- `ListWorkflowRunsToolResultDisplayPayload` (TypeAliasDeclaration) — `{ kind: "list_workflow_runs"; runs: { status: "completed" | "errored" | "pending" | "running" | "stopped"; createdAt: number; label: string; runId: string; labelSource: "script" | "name"; ownedByThisS`
- `listWorkflowRunsToolResultDisplayPayloadSchema` (VariableDeclaration) — `z.ZodObject<{ kind: z.ZodLiteral<"list_workflow_runs">; runs: z.ZodArray<z.ZodObject<{ runId: z.ZodString; label: z.ZodString; labelSource: z.ZodEnum<["name", "script"]>; status: z.ZodEnum<["completed`
- `ResumeWorkflowRunToolResultDisplayPayload` (TypeAliasDeclaration) — `{ kind: "resume_workflow_run"; runId: string; }`
- `resumeWorkflowRunToolResultDisplayPayloadSchema` (VariableDeclaration) — `z.ZodObject<{ kind: z.ZodLiteral<"resume_workflow_run">; runId: z.ZodString; }, "strict", z.ZodTypeAny, { kind: "resume_workflow_run"; runId: string; }, { kind: "resume_workflow_run"; runId: string; }`
- `SavedWorkflowListToolResultDisplayPayload` (TypeAliasDeclaration) — `{ kind: "saved_workflow_list"; workflows: { scope: string; path: string; name: string; argNames: string[]; description?: string | undefined; whenToUse?: string | undefined; }[]; truncated?: boolean | `
- `savedWorkflowListToolResultDisplayPayloadSchema` (VariableDeclaration) — `z.ZodObject<{ kind: z.ZodLiteral<"saved_workflow_list">; workflows: z.ZodArray<z.ZodObject<{ name: z.ZodString; description: z.ZodOptional<z.ZodString>; whenToUse: z.ZodOptional<z.ZodString>; scope: z`
- `WORKFLOW_OBSERVATION_DISPLAY_MAX_ACTORS` (VariableDeclaration) — `32`
- `WORKFLOW_OBSERVATION_DISPLAY_MAX_ARGS` (VariableDeclaration) — `32`
- `WORKFLOW_OBSERVATION_DISPLAY_MAX_LOG_CHARS` (VariableDeclaration) — `1024`
- `WORKFLOW_OBSERVATION_DISPLAY_MAX_LOG_ENTRIES` (VariableDeclaration) — `40`
- `WORKFLOW_OBSERVATION_DISPLAY_MAX_META_CHARS` (VariableDeclaration) — `2048`
- `WORKFLOW_OBSERVATION_DISPLAY_MAX_MODELS` (VariableDeclaration) — `100`
- `WORKFLOW_OBSERVATION_DISPLAY_MAX_PHASES` (VariableDeclaration) — `32`
- `WORKFLOW_OBSERVATION_DISPLAY_MAX_RESULT_CHARS` (VariableDeclaration) — `4000`
- `WORKFLOW_OBSERVATION_DISPLAY_MAX_RUNS` (VariableDeclaration) — `50`
- `WORKFLOW_OBSERVATION_DISPLAY_MAX_SUBAGENTS` (VariableDeclaration) — `64`

### `tools/workflow.ts`

- `WORKFLOW_RUN_ID_PATTERN` (VariableDeclaration) — `RegExp`
- `WORKFLOW_SCRIPT_MAX_LENGTH` (VariableDeclaration) — `524288`
- `WorkflowInput` (TypeAliasDeclaration) — `{ description?: string | undefined; script?: string | undefined; name?: string | undefined; title?: string | undefined; args?: unknown; scriptPath?: string | undefined; resumeFromRunId?: string | unde`
- `WorkflowInputJsonSchema` (VariableDeclaration) — `import("../index.js").JsonSchema`
- `WorkflowInputSchema` (VariableDeclaration) — `z.ZodEffects<z.ZodObject<{ args: z.ZodOptional<z.ZodUnknown>; description: z.ZodOptional<z.ZodString>; name: z.ZodOptional<z.ZodString>; resumeFromRunId: z.ZodOptional<z.ZodString>; script: z.ZodOptio`
- `WorkflowOutput` (TypeAliasDeclaration) — `{ status: "completed" | "failed" | "backgrounded"; backgroundTaskId: string; response: string; runId: string; traceId: string; name?: string | undefined; scriptPath?: string | undefined; }`
- `WorkflowOutputJsonSchema` (VariableDeclaration) — `import("../index.js").JsonSchema`
- `WorkflowOutputSchema` (VariableDeclaration) — `z.ZodObject<{ backgroundTaskId: z.ZodString; name: z.ZodOptional<z.ZodString>; response: z.ZodString; runId: z.ZodString; scriptPath: z.ZodOptional<z.ZodString>; status: z.ZodEnum<["backgrounded", "co`
- `WorkflowOutputStatus` (TypeAliasDeclaration) — `"completed" | "failed" | "backgrounded"`
- `WorkflowOutputStatusSchema` (VariableDeclaration) — `z.ZodEnum<["backgrounded", "completed", "failed"]>`
- `WorkflowToolResult` (InterfaceDeclaration) — `WorkflowToolResult`

### `tools/write.ts`

- `DiffHunk` (InterfaceDeclaration) — `DiffHunk`
- `GitDiff` (InterfaceDeclaration) — `GitDiff`
- `WriteDiffHunkSchema` (VariableDeclaration) — `z.ZodObject<{ oldStart: z.ZodNumber; oldLines: z.ZodNumber; newStart: z.ZodNumber; newLines: z.ZodNumber; lines: z.ZodArray<z.ZodString, "many">; }, "strict", z.ZodTypeAny, { oldStart: number; oldLine`
- `WriteErrorCode` (VariableDeclaration | TypeAliasDeclaration) — `{ readonly FILE_NOT_READ: "write_file_not_read"; readonly PARTIAL_READ: "write_partial_read"; readonly STALE_FILE: "write_stale_file"; readonly PERMISSION_DENIED: "write_permission_denied"; readonly S`
- `WriteGitDiffSchema` (VariableDeclaration) — `z.ZodObject<{ filename: z.ZodString; status: z.ZodEnum<["modified", "added"]>; additions: z.ZodNumber; deletions: z.ZodNumber; changes: z.ZodNumber; patch: z.ZodString; repository: z.ZodOptional<z.Zod`
- `WriteInput` (TypeAliasDeclaration) — `{ content: string; file_path: string; }`
- `WriteInputJsonSchema` (VariableDeclaration) — `import("../index.js").JsonSchema`
- `WriteInputSchema` (VariableDeclaration) — `z.ZodObject<{ file_path: z.ZodString; content: z.ZodString; }, "strip", z.ZodTypeAny, { content: string; file_path: string; }, { content: string; file_path: string; }>`
- `WriteOutput` (InterfaceDeclaration) — `WriteOutput`
- `WriteOutputJsonSchema` (VariableDeclaration) — `import("../index.js").JsonSchema`
- `WriteOutputSchema` (VariableDeclaration) — `z.ZodObject<{ type: z.ZodEnum<["create", "update"]>; filePath: z.ZodString; content: z.ZodString; structuredPatch: z.ZodArray<z.ZodObject<{ oldStart: z.ZodNumber; oldLines: z.ZodNumber; newStart: z.Zo`
- `WriteToolCall` (InterfaceDeclaration) — `WriteToolCall`
- `WriteToolResult` (InterfaceDeclaration) — `WriteToolResult`

### `tracing/local-turn-preparation.ts`

- `beginLocalTurnPreparation` (FunctionDeclaration) — `export function beginLocalTurnPreparation( trace: { queryId?: string; sessionId?: string; turnId?: string }, stage: PreparationStage, ): (outcome?: LocalTurnPreparationFact["outcome"]) => void { const`
- `LocalTurnPreparationFact` (InterfaceDeclaration) — `LocalTurnPreparationFact`
- `observeLocalTurnPreparation` (FunctionDeclaration) — `export function observeLocalTurnPreparation( inputId: string, publish: Subscription["publish"], ): () => void { if (subscriptions.size >= LOCAL_TTFT_MAX_PENDING || subscriptions.has(inputId)) return n`

### `tracing/span-residence.ts`

- `createResidentSpan` (FunctionDeclaration) — `export function createResidentSpan( name: string, traceId: TraceId, parentId?: string, onEnd?: (span: Span) => void, ): Span { const span: Span = Object.assign(Object.create(spanOperations) as Span, {`
- `createSpanIdentifier` (FunctionDeclaration) — `export function createSpanIdentifier(): string { // 协议兼容格式：UUID 的前 16 字符；标准表达和格式保留既有来源。 return crypto.randomUUID().slice(0, 16); }`

### `tracing/tracer-types.ts`

- `ExecutionContext` (InterfaceDeclaration) — `ExecutionContext`
- `Span` (InterfaceDeclaration) — `Span`
- `TraceContext` (InterfaceDeclaration) — `TraceContext`
- `Tracer` (InterfaceDeclaration) — `Tracer`

### `tracing/tracer.ts`

- `createChildTraceContext` (FunctionDeclaration) — `export function createChildTraceContext( parent: TraceContext, options: { queryId?: QueryId; sessionId?: SessionId; turnId?: TurnId; attributes?: Record<string, string | number | boolean>; } = {}, ): `
- `createRootTraceContext` (FunctionDeclaration) — `export function createRootTraceContext( options: { traceId?: TraceId; queryId?: QueryId; sessionId?: SessionId; turnId?: TurnId; attributes?: Record<string, string | number | boolean>; } = {}, ): Trac`
- `createSpan` (FunctionDeclaration) — `export function createSpan(name: string): Span { const context = getCurrentTraceContext(); return createResidentSpan( name, context?.traceId ?? createTraceId(), context?.spanId ?? context?.parentSpanI`
- `createTracer` (FunctionDeclaration) — `export function createTracer(name: string, onSpanEnd?: (span: Span) => void): Tracer { return { name, startSpan(spanName: string, parentContext?: TraceContext): Span { return createResidentSpan( spanN`
- `ExecutionContext` (InterfaceDeclaration) — `ExecutionContext`
- `getCurrentTraceContext` (FunctionDeclaration) — `export function getCurrentTraceContext(): TraceContext | undefined { return ambientTrace.getStore(); }`
- `runWithContext` (FunctionDeclaration) — `export function runWithContext<T>(context: TraceContext, fn: () => T): T { return ambientTrace.run(context, fn); }`
- `runWithContextAsync` (FunctionDeclaration) — `export async function runWithContextAsync<T>( context: TraceContext, fn: () => Promise<T>, ): Promise<T> { return ambientTrace.run(context, fn); }`
- `Span` (InterfaceDeclaration) — `Span`
- `TraceContext` (InterfaceDeclaration) — `TraceContext`
- `traceContextToLogContext` (FunctionDeclaration) — `export function traceContextToLogContext(context: TraceContext): LogContext { return { traceId: context.traceId, queryId: context.queryId, spanId: context.spanId, parentSpanId: context.parentSpanId, s`
- `Tracer` (InterfaceDeclaration) — `Tracer`

### `workflow/definition.ts`

- `ExpertWorkflowPhase` (TypeAliasDeclaration) — `"complete" | "clarify" | "task_analysis" | "arch_decompose" | "env_setup" | "meta_prompt" | "exec" | "final_critic"`
- `ExpertWorkflowPhaseSchema` (VariableDeclaration) — `z.ZodEnum<["clarify", "task_analysis", "arch_decompose", "env_setup", "meta_prompt", "exec", "final_critic", "complete"]>`
- `ExpertWorkflowStrategy` (TypeAliasDeclaration) — `{ clarify: { confidenceThreshold: number; maxRounds: number; minRounds: number; }; executor: { drainingChangeHours: number; frontierTarget: number; maxConcurrentLoops: number; maxConsecutiveErrors: nu`
- `ExpertWorkflowStrategySchema` (VariableDeclaration) — `z.ZodObject<{ clarify: z.ZodObject<{ confidenceThreshold: z.ZodNumber; maxRounds: z.ZodNumber; minRounds: z.ZodNumber; }, "strip", z.ZodTypeAny, { confidenceThreshold: number; maxRounds: number; minRo`
- `WorkflowDefinition` (TypeAliasDeclaration) — `{ strategy: { clarify: { confidenceThreshold: number; maxRounds: number; minRounds: number; }; executor: { drainingChangeHours: number; frontierTarget: number; maxConcurrentLoops: number; maxConsecuti`
- `WorkflowDefinitionSchema` (VariableDeclaration) — `z.ZodEffects<z.ZodObject<{ definitionId: z.ZodString; definitionVersion: z.ZodString; description: z.ZodOptional<z.ZodString>; kind: z.ZodString; phaseOrder: z.ZodArray<z.ZodString, "many">; phases: z`
- `WorkflowGraphCollectionStatus` (TypeAliasDeclaration) — `"active" | "draining" | "exhausted"`
- `WorkflowGraphCollectionStatusSchema` (VariableDeclaration) — `z.ZodEnum<["active", "draining", "exhausted"]>`
- `WorkflowGraphSeedSource` (TypeAliasDeclaration) — `{ targetPhase: string; gateAfterPhase?: string | undefined; }`
- `WorkflowGraphSeedSourceSchema` (VariableDeclaration) — `z.ZodObject<{ gateAfterPhase: z.ZodOptional<z.ZodString>; targetPhase: z.ZodString; }, "strip", z.ZodTypeAny, { targetPhase: string; gateAfterPhase?: string | undefined; }, { targetPhase: string; gate`
- `WorkflowKind` (TypeAliasDeclaration) — `string`
- `WorkflowKindSchema` (VariableDeclaration) — `z.ZodString`
- `WorkflowNodeStatus` (TypeAliasDeclaration) — `"completed" | "pending" | "active" | "failed" | "cancelled" | "skipped"`
- `WorkflowNodeStatusSchema` (VariableDeclaration) — `z.ZodEnum<["pending", "active", "completed", "failed", "skipped", "cancelled"]>`
- `WorkflowPhaseBehavior` (TypeAliasDeclaration) — `"complete" | "agent" | "scheduled_graph" | "critic"`
- `WorkflowPhaseBehaviorSchema` (VariableDeclaration) — `z.ZodEnum<["agent", "scheduled_graph", "critic", "complete"]>`
- `WorkflowPhaseDefinition` (TypeAliasDeclaration) — `{ description: string; title: string; phase: string; behavior: "complete" | "agent" | "scheduled_graph" | "critic"; artifactPath?: string | undefined; nodePromptsFromArtifact?: { targetPhase: string; `
- `WorkflowPhaseDefinitionSchema` (VariableDeclaration) — `z.ZodObject<{ artifactPath: z.ZodOptional<z.ZodString>; behavior: z.ZodDefault<z.ZodEnum<["agent", "scheduled_graph", "critic", "complete"]>>; description: z.ZodString; nodePromptsFromArtifact: z.ZodO`
- `WorkflowPhaseId` (TypeAliasDeclaration) — `string`
- `WorkflowPhaseIdSchema` (VariableDeclaration) — `z.ZodString`
- `WorkflowRunStatus` (TypeAliasDeclaration) — `"completed" | "pending" | "running" | "failed" | "paused" | "cancelled"`
- `WorkflowRunStatusSchema` (VariableDeclaration) — `z.ZodEnum<["pending", "running", "paused", "completed", "failed", "cancelled"]>`
- `WorkflowStrategy` (TypeAliasDeclaration) — `{ clarify: { confidenceThreshold: number; maxRounds: number; minRounds: number; }; executor: { drainingChangeHours: number; frontierTarget: number; maxConcurrentLoops: number; maxConsecutiveErrors: nu`
- `WorkflowStrategySchema` (VariableDeclaration) — `z.ZodObject<{ clarify: z.ZodObject<{ confidenceThreshold: z.ZodNumber; maxRounds: z.ZodNumber; minRounds: z.ZodNumber; }, "strip", z.ZodTypeAny, { confidenceThreshold: number; maxRounds: number; minRo`

### `workflow/graph-schema.ts`

- `WorkflowCriticReopenProposal` (TypeAliasDeclaration) — `{ reason: string; nodeId: string; severity?: "critical" | "major" | "minor" | undefined; }`
- `WorkflowCriticReopenProposalSchema` (VariableDeclaration) — `z.ZodObject<{ nodeId: z.ZodString; reason: z.ZodString; severity: z.ZodOptional<z.ZodEnum<["critical", "major", "minor"]>>; }, "strip", z.ZodTypeAny, { reason: string; nodeId: string; severity?: "crit`
- `WorkflowCriticResult` (TypeAliasDeclaration) — `{ acceptanceGaps: string[]; reasoning: string; reopenProposals: { reason: string; nodeId: string; severity?: "critical" | "major" | "minor" | undefined; }[]; verdict: "pass" | "fail"; }`
- `WorkflowCriticResultSchema` (VariableDeclaration) — `z.ZodObject<{ acceptanceGaps: z.ZodDefault<z.ZodArray<z.ZodString, "many">>; reasoning: z.ZodDefault<z.ZodString>; reopenProposals: z.ZodDefault<z.ZodArray<z.ZodObject<{ nodeId: z.ZodString; reason: z`
- `WorkflowCriticSeverity` (TypeAliasDeclaration) — `"critical" | "major" | "minor"`
- `WorkflowCriticSeveritySchema` (VariableDeclaration) — `z.ZodEnum<["critical", "major", "minor"]>`
- `WorkflowGraph` (TypeAliasDeclaration) — `{ edges: { from: string; to: string; }[]; nodes: { status: "completed" | "pending" | "active" | "failed" | "cancelled" | "skipped"; kind: "phase" | "task"; title: string; id: string; dependsOn: string`
- `WorkflowGraphCollection` (TypeAliasDeclaration) — `{ collectionId: string; status?: "active" | "draining" | "exhausted" | undefined; title?: string | undefined; phase?: string | undefined; errorCount?: number | undefined; goal?: string | undefined; fr`
- `WorkflowGraphCollectionSchema` (VariableDeclaration) — `z.ZodObject<{ analyzedNodeIds: z.ZodOptional<z.ZodArray<z.ZodString, "many">>; collectionId: z.ZodString; errorCount: z.ZodOptional<z.ZodNumber>; exhausted: z.ZodOptional<z.ZodBoolean>; explorable: z.`
- `WorkflowGraphEdge` (TypeAliasDeclaration) — `{ from: string; to: string; }`
- `WorkflowGraphEdgeSchema` (VariableDeclaration) — `z.ZodObject<{ from: z.ZodString; to: z.ZodString; }, "strip", z.ZodTypeAny, { from: string; to: string; }, { from: string; to: string; }>`
- `WorkflowGraphNode` (TypeAliasDeclaration) — `{ status: "completed" | "pending" | "active" | "failed" | "cancelled" | "skipped"; kind: "phase" | "task"; title: string; id: string; dependsOn: string[]; description?: string | undefined; prompt?: st`
- `WorkflowGraphNodeSchema` (VariableDeclaration) — `z.ZodObject<{ collectionId: z.ZodOptional<z.ZodString>; id: z.ZodString; attempts: z.ZodOptional<z.ZodNumber>; dependsOn: z.ZodDefault<z.ZodArray<z.ZodString, "many">>; description: z.ZodOptional<z.Zo`
- `WorkflowGraphPlannerNode` (TypeAliasDeclaration) — `{ kind: "phase" | "task"; title: string; id: string; dependsOn: string[]; description?: string | undefined; prompt?: string | undefined; phase?: string | undefined; collectionId?: string | undefined; `
- `WorkflowGraphPlannerNodeSchema` (VariableDeclaration) — `z.ZodObject<{ collectionId: z.ZodOptional<z.ZodString>; dependsOn: z.ZodDefault<z.ZodArray<z.ZodString, "many">>; description: z.ZodOptional<z.ZodString>; id: z.ZodString; kind: z.ZodDefault<z.ZodEnum`
- `WorkflowGraphPlannerResult` (TypeAliasDeclaration) — `{ edges: { from: string; to: string; }[]; nodes: { kind: "phase" | "task"; title: string; id: string; dependsOn: string[]; description?: string | undefined; prompt?: string | undefined; phase?: string`
- `WorkflowGraphPlannerResultSchema` (VariableDeclaration) — `z.ZodObject<{ collectionNodeIds: z.ZodOptional<z.ZodArray<z.ZodString, "many">>; edges: z.ZodDefault<z.ZodArray<z.ZodObject<{ from: z.ZodString; to: z.ZodString; }, "strip", z.ZodTypeAny, { from: stri`
- `WorkflowGraphSchema` (VariableDeclaration) — `z.ZodObject<{ collections: z.ZodOptional<z.ZodArray<z.ZodObject<{ analyzedNodeIds: z.ZodOptional<z.ZodArray<z.ZodString, "many">>; collectionId: z.ZodString; errorCount: z.ZodOptional<z.ZodNumber>; ex`
- `WorkflowGraphSeed` (TypeAliasDeclaration) — `{ collections: { collectionId: string; nodeIds: string[]; title?: string | undefined; phase?: string | undefined; goal?: string | undefined; frontierTarget?: number | undefined; explorable?: boolean |`
- `WorkflowGraphSeedCollection` (TypeAliasDeclaration) — `{ collectionId: string; nodeIds: string[]; title?: string | undefined; phase?: string | undefined; goal?: string | undefined; frontierTarget?: number | undefined; explorable?: boolean | undefined; met`
- `WorkflowGraphSeedCollectionSchema` (VariableDeclaration) — `z.ZodObject<{ collectionId: z.ZodString; explorable: z.ZodOptional<z.ZodBoolean>; frontierTarget: z.ZodOptional<z.ZodNumber>; goal: z.ZodOptional<z.ZodString>; metric: z.ZodOptional<z.ZodString>; node`
- `WorkflowGraphSeedSchema` (VariableDeclaration) — `z.ZodObject<{ collections: z.ZodDefault<z.ZodArray<z.ZodObject<{ collectionId: z.ZodString; explorable: z.ZodOptional<z.ZodBoolean>; frontierTarget: z.ZodOptional<z.ZodNumber>; goal: z.ZodOptional<z.Z`
- `WorkflowNodePromptUpdate` (TypeAliasDeclaration) — `{ id: string; description?: string | undefined; prompt?: string | undefined; title?: string | undefined; }`
- `WorkflowNodePromptUpdateSchema` (VariableDeclaration) — `z.ZodEffects<z.ZodObject<{ description: z.ZodOptional<z.ZodString>; id: z.ZodString; prompt: z.ZodOptional<z.ZodString>; title: z.ZodOptional<z.ZodString>; }, "strip", z.ZodTypeAny, { id: string; desc`
- `WorkflowNodePromptUpdateSet` (TypeAliasDeclaration) — `{ nodes: { id: string; description?: string | undefined; prompt?: string | undefined; title?: string | undefined; }[]; reasoning?: string | undefined; }`
- `WorkflowNodePromptUpdateSetSchema` (VariableDeclaration) — `z.ZodObject<{ nodes: z.ZodDefault<z.ZodArray<z.ZodEffects<z.ZodObject<{ description: z.ZodOptional<z.ZodString>; id: z.ZodString; prompt: z.ZodOptional<z.ZodString>; title: z.ZodOptional<z.ZodString>;`

### `workflow/index.ts`

- `CreateScriptWorkflowActivityInput` (InterfaceDeclaration) — `CreateScriptWorkflowActivityInput`
- `CreateScriptWorkflowRunInput` (InterfaceDeclaration) — `CreateScriptWorkflowRunInput`
- `CreateSessionTaskLinkInput` (InterfaceDeclaration) — `CreateSessionTaskLinkInput`
- `deriveWorkflowRunSchedulerState` (FunctionDeclaration) — `export function deriveWorkflowRunSchedulerState( snapshot: WorkflowRunSnapshot, ): WorkflowSchedulerState { const state = deriveWorkflowSchedulerState(snapshot.graph); const activeActivities = snapsho`
- `deriveWorkflowSchedulerState` (FunctionDeclaration) — `export function deriveWorkflowSchedulerState(graph: WorkflowGraph): WorkflowSchedulerState { const nodesById = new Map<string, WorkflowGraphNode>(); for (const node of graph.nodes) { nodesById.set(nod`
- `deriveWorkflowSessionLinks` (FunctionDeclaration) — `export function deriveWorkflowSessionLinks( snapshot: Pick<WorkflowRunSnapshot, "activities" | "runId">, ): WorkflowSessionLink[] { const attemptByScope = new Map<string, number>(); return snapshot.ac`
- `ExpertWorkflowPhase` (TypeAliasDeclaration) — `"complete" | "clarify" | "task_analysis" | "arch_decompose" | "env_setup" | "meta_prompt" | "exec" | "final_critic"`
- `ExpertWorkflowPhaseSchema` (VariableDeclaration) — `z.ZodEnum<["clarify", "task_analysis", "arch_decompose", "env_setup", "meta_prompt", "exec", "final_critic", "complete"]>`
- `ExpertWorkflowRunSnapshot` (TypeAliasDeclaration) — `{ status: "completed" | "pending" | "running" | "failed" | "paused" | "cancelled"; strategy: { clarify: { confidenceThreshold: number; maxRounds: number; minRounds: number; }; executor: { drainingChan`
- `ExpertWorkflowRunSnapshotSchema` (VariableDeclaration) — `z.ZodObject<{ activities: z.ZodDefault<z.ZodArray<z.ZodObject<{ activityId: z.ZodString; artifactPath: z.ZodOptional<z.ZodString>; completedAt: z.ZodOptional<z.ZodString>; error: z.ZodOptional<z.ZodSt`
- `ExpertWorkflowStrategy` (TypeAliasDeclaration) — `{ clarify: { confidenceThreshold: number; maxRounds: number; minRounds: number; }; executor: { drainingChangeHours: number; frontierTarget: number; maxConcurrentLoops: number; maxConsecutiveErrors: nu`
- `ExpertWorkflowStrategySchema` (VariableDeclaration) — `z.ZodObject<{ clarify: z.ZodObject<{ confidenceThreshold: z.ZodNumber; maxRounds: z.ZodNumber; minRounds: z.ZodNumber; }, "strip", z.ZodTypeAny, { confidenceThreshold: number; maxRounds: number; minRo`
- `SCRIPT_WORKFLOW_ACTIVITY_STATUSES` (VariableDeclaration) — `readonly ["queued", "running", "completed", "failed", "skipped", "cancelled", "cached", "lost"]`
- `SCRIPT_WORKFLOW_DEFINITION_SCOPES` (VariableDeclaration) — `readonly ["builtin", "explicit", "project", "user"]`
- `SCRIPT_WORKFLOW_RUN_STATUSES` (VariableDeclaration) — `readonly ["pending", "running", "paused", "completed", "failed", "cancelled"]`
- `ScriptWorkflowActivityRecord` (InterfaceDeclaration) — `ScriptWorkflowActivityRecord`
- `ScriptWorkflowActivityStatus` (TypeAliasDeclaration) — `"completed" | "running" | "failed" | "cancelled" | "queued" | "skipped" | "cached" | "lost"`
- `ScriptWorkflowDefinitionRecord` (InterfaceDeclaration) — `ScriptWorkflowDefinitionRecord`
- `ScriptWorkflowDefinitionScope` (TypeAliasDeclaration) — `"user" | "project" | "builtin" | "explicit"`
- `ScriptWorkflowEventRecord` (InterfaceDeclaration) — `ScriptWorkflowEventRecord`
- `ScriptWorkflowRunRecord` (InterfaceDeclaration) — `ScriptWorkflowRunRecord`
- `ScriptWorkflowRunStats` (InterfaceDeclaration) — `ScriptWorkflowRunStats`
- `ScriptWorkflowRunStatsSchema` (VariableDeclaration) — `z.ZodObject<{ agentCalls: z.ZodNumber; cachedAgentCalls: z.ZodNumber; failedAgentCalls: z.ZodNumber; tokens: z.ZodObject<{ cacheRead: z.ZodNumber; cacheWrite: z.ZodNumber; input: z.ZodNumber; output: `
- `ScriptWorkflowRunStatus` (TypeAliasDeclaration) — `"completed" | "pending" | "running" | "failed" | "paused" | "cancelled"`
- `ScriptWorkflowSource` (TypeAliasDeclaration) — `"user" | "builtin"`
- `ScriptWorkflowStorePort` (InterfaceDeclaration) — `ScriptWorkflowStorePort`
- `SessionTaskLinkRecord` (InterfaceDeclaration) — `SessionTaskLinkRecord`
- `UpdateScriptWorkflowActivityInput` (InterfaceDeclaration) — `UpdateScriptWorkflowActivityInput`
- `UpdateScriptWorkflowRunInput` (InterfaceDeclaration) — `UpdateScriptWorkflowRunInput`
- `UpsertScriptWorkflowDefinitionInput` (InterfaceDeclaration) — `UpsertScriptWorkflowDefinitionInput`
- `WorkflowActivityKind` (TypeAliasDeclaration) — `"agent_session" | "planner_agent" | "subplanner_agent" | "actor_agent" | "critic_agent"`
- `WorkflowActivityKindSchema` (VariableDeclaration) — `z.ZodEnum<["agent_session", "planner_agent", "subplanner_agent", "actor_agent", "critic_agent"]>`
- `WorkflowActivitySnapshot` (TypeAliasDeclaration) — `{ status: "completed" | "pending" | "active" | "failed" | "cancelled" | "skipped"; kind: "agent_session" | "planner_agent" | "subplanner_agent" | "actor_agent" | "critic_agent"; phase: string; started`
- `WorkflowActivitySnapshotSchema` (VariableDeclaration) — `z.ZodObject<{ activityId: z.ZodString; artifactPath: z.ZodOptional<z.ZodString>; completedAt: z.ZodOptional<z.ZodString>; error: z.ZodOptional<z.ZodString>; inputArtifactPaths: z.ZodDefault<z.ZodArray`
- `WorkflowAgentCallInput` (TypeAliasDeclaration) — `{ prompt: string; phase?: string | undefined; callPath?: string | undefined; opts?: { agentType?: string | undefined; model?: string | undefined; label?: string | undefined; phase?: string | undefined`
- `WorkflowAgentCallInputSchema` (VariableDeclaration) — `z.ZodObject<{ callPath: z.ZodOptional<z.ZodString>; phase: z.ZodOptional<z.ZodString>; opts: z.ZodOptional<z.ZodObject<{ agentType: z.ZodOptional<z.ZodString>; instructions: z.ZodOptional<z.ZodString>`
- `WorkflowAgentIsolation` (TypeAliasDeclaration) — `"worktree"`
- `WorkflowAgentIsolationSchema` (VariableDeclaration) — `z.ZodEnum<["worktree"]>`
- `WorkflowAgentOptions` (TypeAliasDeclaration) — `{ agentType?: string | undefined; model?: string | undefined; label?: string | undefined; phase?: string | undefined; timeoutMs?: number | undefined; instructions?: string | undefined; isolation?: "wo`
- `WorkflowAgentOptionsSchema` (VariableDeclaration) — `z.ZodObject<{ agentType: z.ZodOptional<z.ZodString>; instructions: z.ZodOptional<z.ZodString>; isolation: z.ZodOptional<z.ZodEnum<["worktree"]>>; label: z.ZodOptional<z.ZodString>; maxTurns: z.ZodOpti`
- `WorkflowArtifact` (TypeAliasDeclaration) — `{ path: string; createdAt: string; label: string; contentType: string; phase?: string | undefined; }`
- `WorkflowArtifactSchema` (VariableDeclaration) — `z.ZodObject<{ contentType: z.ZodString; createdAt: z.ZodString; label: z.ZodString; path: z.ZodString; phase: z.ZodOptional<z.ZodString>; }, "strip", z.ZodTypeAny, { path: string; createdAt: string; l`
- `WorkflowCriticReopenProposal` (TypeAliasDeclaration) — `{ reason: string; nodeId: string; severity?: "critical" | "major" | "minor" | undefined; }`
- `WorkflowCriticReopenProposalSchema` (VariableDeclaration) — `z.ZodObject<{ nodeId: z.ZodString; reason: z.ZodString; severity: z.ZodOptional<z.ZodEnum<["critical", "major", "minor"]>>; }, "strip", z.ZodTypeAny, { reason: string; nodeId: string; severity?: "crit`
- `WorkflowCriticResult` (TypeAliasDeclaration) — `{ acceptanceGaps: string[]; reasoning: string; reopenProposals: { reason: string; nodeId: string; severity?: "critical" | "major" | "minor" | undefined; }[]; verdict: "pass" | "fail"; }`
- `WorkflowCriticResultSchema` (VariableDeclaration) — `z.ZodObject<{ acceptanceGaps: z.ZodDefault<z.ZodArray<z.ZodString, "many">>; reasoning: z.ZodDefault<z.ZodString>; reopenProposals: z.ZodDefault<z.ZodArray<z.ZodObject<{ nodeId: z.ZodString; reason: z`
- `WorkflowCriticSeverity` (TypeAliasDeclaration) — `"critical" | "major" | "minor"`
- `WorkflowCriticSeveritySchema` (VariableDeclaration) — `z.ZodEnum<["critical", "major", "minor"]>`
- `WorkflowDefinition` (TypeAliasDeclaration) — `{ strategy: { clarify: { confidenceThreshold: number; maxRounds: number; minRounds: number; }; executor: { drainingChangeHours: number; frontierTarget: number; maxConcurrentLoops: number; maxConsecuti`
- `WorkflowDefinitionSchema` (VariableDeclaration) — `z.ZodEffects<z.ZodObject<{ definitionId: z.ZodString; definitionVersion: z.ZodString; description: z.ZodOptional<z.ZodString>; kind: z.ZodString; phaseOrder: z.ZodArray<z.ZodString, "many">; phases: z`
- `WorkflowDefinitionStorePort` (InterfaceDeclaration) — `WorkflowDefinitionStorePort`
- `WorkflowEvent` (TypeAliasDeclaration) — `{ type: "run_started" | "run_completed" | "run_failed" | "workflow_paused" | "workflow_retry_started" | "workflow_session_linked" | "run_cancelled" | "phase_started" | "phase_completed" | "phase_faile`
- `WorkflowEventSchema` (VariableDeclaration) — `z.ZodObject<{ kind: z.ZodString; message: z.ZodOptional<z.ZodString>; nodeId: z.ZodOptional<z.ZodString>; payload: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodUnknown>>; phase: z.ZodOptional<z.ZodStri`
- `WorkflowEventType` (TypeAliasDeclaration) — `"run_started" | "run_completed" | "run_failed" | "workflow_paused" | "workflow_retry_started" | "workflow_session_linked" | "run_cancelled" | "phase_started" | "phase_completed" | "phase_failed" | "ar`
- `WorkflowEventTypeSchema` (VariableDeclaration) — `z.ZodEnum<["run_started", "run_completed", "run_failed", "workflow_paused", "workflow_retry_started", "workflow_session_linked", "run_cancelled", "phase_started", "phase_completed", "phase_failed", "a`
- `WorkflowFailure` (TypeAliasDeclaration) — `{ message: string; kind: "unknown" | "provider" | "timeout" | "cancelled" | "network" | "auth" | "tool" | "rate_limit" | "model_context" | "configuration" | "permission"; recoverable: boolean; retryab`
- `WorkflowFailureKind` (TypeAliasDeclaration) — `"unknown" | "provider" | "timeout" | "cancelled" | "network" | "auth" | "tool" | "rate_limit" | "model_context" | "configuration" | "permission"`
- `WorkflowFailureKindSchema` (VariableDeclaration) — `z.ZodEnum<["network", "rate_limit", "timeout", "auth", "provider", "model_context", "configuration", "permission", "tool", "cancelled", "unknown"]>`
- `WorkflowFailureSchema` (VariableDeclaration) — `z.ZodObject<{ activityId: z.ZodOptional<z.ZodString>; code: z.ZodOptional<z.ZodString>; kind: z.ZodEnum<["network", "rate_limit", "timeout", "auth", "provider", "model_context", "configuration", "perm`
- `WorkflowGraph` (TypeAliasDeclaration) — `{ edges: { from: string; to: string; }[]; nodes: { status: "completed" | "pending" | "active" | "failed" | "cancelled" | "skipped"; kind: "phase" | "task"; title: string; id: string; dependsOn: string`
- `WorkflowGraphCollection` (TypeAliasDeclaration) — `{ collectionId: string; status?: "active" | "draining" | "exhausted" | undefined; title?: string | undefined; phase?: string | undefined; errorCount?: number | undefined; goal?: string | undefined; fr`
- `WorkflowGraphCollectionSchema` (VariableDeclaration) — `z.ZodObject<{ analyzedNodeIds: z.ZodOptional<z.ZodArray<z.ZodString, "many">>; collectionId: z.ZodString; errorCount: z.ZodOptional<z.ZodNumber>; exhausted: z.ZodOptional<z.ZodBoolean>; explorable: z.`
- `WorkflowGraphCollectionStatus` (TypeAliasDeclaration) — `"active" | "draining" | "exhausted"`
- `WorkflowGraphCollectionStatusSchema` (VariableDeclaration) — `z.ZodEnum<["active", "draining", "exhausted"]>`
- `WorkflowGraphEdge` (TypeAliasDeclaration) — `{ from: string; to: string; }`
- `WorkflowGraphEdgeSchema` (VariableDeclaration) — `z.ZodObject<{ from: z.ZodString; to: z.ZodString; }, "strip", z.ZodTypeAny, { from: string; to: string; }, { from: string; to: string; }>`
- `WorkflowGraphNode` (TypeAliasDeclaration) — `{ status: "completed" | "pending" | "active" | "failed" | "cancelled" | "skipped"; kind: "phase" | "task"; title: string; id: string; dependsOn: string[]; description?: string | undefined; prompt?: st`
- `WorkflowGraphNodeSchema` (VariableDeclaration) — `z.ZodObject<{ collectionId: z.ZodOptional<z.ZodString>; id: z.ZodString; attempts: z.ZodOptional<z.ZodNumber>; dependsOn: z.ZodDefault<z.ZodArray<z.ZodString, "many">>; description: z.ZodOptional<z.Zo`
- `WorkflowGraphPlannerNode` (TypeAliasDeclaration) — `{ kind: "phase" | "task"; title: string; id: string; dependsOn: string[]; description?: string | undefined; prompt?: string | undefined; phase?: string | undefined; collectionId?: string | undefined; `
- `WorkflowGraphPlannerNodeSchema` (VariableDeclaration) — `z.ZodObject<{ collectionId: z.ZodOptional<z.ZodString>; dependsOn: z.ZodDefault<z.ZodArray<z.ZodString, "many">>; description: z.ZodOptional<z.ZodString>; id: z.ZodString; kind: z.ZodDefault<z.ZodEnum`
- `WorkflowGraphPlannerResult` (TypeAliasDeclaration) — `{ edges: { from: string; to: string; }[]; nodes: { kind: "phase" | "task"; title: string; id: string; dependsOn: string[]; description?: string | undefined; prompt?: string | undefined; phase?: string`
- `WorkflowGraphPlannerResultSchema` (VariableDeclaration) — `z.ZodObject<{ collectionNodeIds: z.ZodOptional<z.ZodArray<z.ZodString, "many">>; edges: z.ZodDefault<z.ZodArray<z.ZodObject<{ from: z.ZodString; to: z.ZodString; }, "strip", z.ZodTypeAny, { from: stri`
- `WorkflowGraphRecord` (TypeAliasDeclaration) — `{ strategy: { clarify: { confidenceThreshold: number; maxRounds: number; minRounds: number; }; executor: { drainingChangeHours: number; frontierTarget: number; maxConcurrentLoops: number; maxConsecuti`
- `WorkflowGraphRecordSchema` (VariableDeclaration) — `z.ZodDiscriminatedUnion<"recordType", [z.ZodObject<{ recordType: z.ZodLiteral<"meta">; createdAt: z.ZodString; definitionId: z.ZodOptional<z.ZodString>; definitionVersion: z.ZodOptional<z.ZodString>; `
- `WorkflowGraphSchema` (VariableDeclaration) — `z.ZodObject<{ collections: z.ZodOptional<z.ZodArray<z.ZodObject<{ analyzedNodeIds: z.ZodOptional<z.ZodArray<z.ZodString, "many">>; collectionId: z.ZodString; errorCount: z.ZodOptional<z.ZodNumber>; ex`
- `WorkflowGraphSeed` (TypeAliasDeclaration) — `{ collections: { collectionId: string; nodeIds: string[]; title?: string | undefined; phase?: string | undefined; goal?: string | undefined; frontierTarget?: number | undefined; explorable?: boolean |`
- `WorkflowGraphSeedCollection` (TypeAliasDeclaration) — `{ collectionId: string; nodeIds: string[]; title?: string | undefined; phase?: string | undefined; goal?: string | undefined; frontierTarget?: number | undefined; explorable?: boolean | undefined; met`
- `WorkflowGraphSeedCollectionSchema` (VariableDeclaration) — `z.ZodObject<{ collectionId: z.ZodString; explorable: z.ZodOptional<z.ZodBoolean>; frontierTarget: z.ZodOptional<z.ZodNumber>; goal: z.ZodOptional<z.ZodString>; metric: z.ZodOptional<z.ZodString>; node`
- `WorkflowGraphSeedSchema` (VariableDeclaration) — `z.ZodObject<{ collections: z.ZodDefault<z.ZodArray<z.ZodObject<{ collectionId: z.ZodString; explorable: z.ZodOptional<z.ZodBoolean>; frontierTarget: z.ZodOptional<z.ZodNumber>; goal: z.ZodOptional<z.Z`
- `WorkflowGraphSeedSource` (TypeAliasDeclaration) — `{ targetPhase: string; gateAfterPhase?: string | undefined; }`
- `WorkflowGraphSeedSourceSchema` (VariableDeclaration) — `z.ZodObject<{ gateAfterPhase: z.ZodOptional<z.ZodString>; targetPhase: z.ZodString; }, "strip", z.ZodTypeAny, { targetPhase: string; gateAfterPhase?: string | undefined; }, { targetPhase: string; gate`
- `WorkflowKind` (TypeAliasDeclaration) — `string`
- `WorkflowKindSchema` (VariableDeclaration) — `z.ZodString`
- `WorkflowNodePromptUpdate` (TypeAliasDeclaration) — `{ id: string; description?: string | undefined; prompt?: string | undefined; title?: string | undefined; }`
- `WorkflowNodePromptUpdateSchema` (VariableDeclaration) — `z.ZodEffects<z.ZodObject<{ description: z.ZodOptional<z.ZodString>; id: z.ZodString; prompt: z.ZodOptional<z.ZodString>; title: z.ZodOptional<z.ZodString>; }, "strip", z.ZodTypeAny, { id: string; desc`
- `WorkflowNodePromptUpdateSet` (TypeAliasDeclaration) — `{ nodes: { id: string; description?: string | undefined; prompt?: string | undefined; title?: string | undefined; }[]; reasoning?: string | undefined; }`
- `WorkflowNodePromptUpdateSetSchema` (VariableDeclaration) — `z.ZodObject<{ nodes: z.ZodDefault<z.ZodArray<z.ZodEffects<z.ZodObject<{ description: z.ZodOptional<z.ZodString>; id: z.ZodString; prompt: z.ZodOptional<z.ZodString>; title: z.ZodOptional<z.ZodString>;`
- `WorkflowNodeStatus` (TypeAliasDeclaration) — `"completed" | "pending" | "active" | "failed" | "cancelled" | "skipped"`
- `WorkflowNodeStatusSchema` (VariableDeclaration) — `z.ZodEnum<["pending", "active", "completed", "failed", "skipped", "cancelled"]>`
- `WorkflowPhaseBehavior` (TypeAliasDeclaration) — `"complete" | "agent" | "scheduled_graph" | "critic"`
- `WorkflowPhaseBehaviorSchema` (VariableDeclaration) — `z.ZodEnum<["agent", "scheduled_graph", "critic", "complete"]>`
- `WorkflowPhaseDefinition` (TypeAliasDeclaration) — `{ description: string; title: string; phase: string; behavior: "complete" | "agent" | "scheduled_graph" | "critic"; artifactPath?: string | undefined; nodePromptsFromArtifact?: { targetPhase: string; `
- `WorkflowPhaseDefinitionSchema` (VariableDeclaration) — `z.ZodObject<{ artifactPath: z.ZodOptional<z.ZodString>; behavior: z.ZodDefault<z.ZodEnum<["agent", "scheduled_graph", "critic", "complete"]>>; description: z.ZodString; nodePromptsFromArtifact: z.ZodO`
- `WorkflowPhaseId` (TypeAliasDeclaration) — `string`
- `WorkflowPhaseIdSchema` (VariableDeclaration) — `z.ZodString`
- `WorkflowPhaseSnapshot` (TypeAliasDeclaration) — `{ status: "completed" | "pending" | "active" | "failed" | "cancelled" | "skipped"; phase: string; startedAt?: string | undefined; error?: string | undefined; artifactPath?: string | undefined; session`
- `WorkflowPhaseSnapshotSchema` (VariableDeclaration) — `z.ZodObject<{ artifactPath: z.ZodOptional<z.ZodString>; activityId: z.ZodOptional<z.ZodString>; completedAt: z.ZodOptional<z.ZodString>; error: z.ZodOptional<z.ZodString>; phase: z.ZodString; sessionI`
- `WorkflowRecoveryAction` (TypeAliasDeclaration) — `{ label: string; action: "retry" | "retry_with_current_model" | "skip_node" | "cancel"; phase?: string | undefined; nodeId?: string | undefined; activityId?: string | undefined; destructive?: boolean `
- `WorkflowRecoveryActionSchema` (VariableDeclaration) — `z.ZodObject<{ action: z.ZodEnum<["retry", "retry_with_current_model", "skip_node", "cancel"]>; activityId: z.ZodOptional<z.ZodString>; destructive: z.ZodOptional<z.ZodBoolean>; label: z.ZodString; nod`
- `WorkflowRunListItem` (InterfaceDeclaration) — `WorkflowRunListItem`
- `WorkflowRunSnapshot` (TypeAliasDeclaration) — `{ status: "completed" | "pending" | "running" | "failed" | "paused" | "cancelled"; strategy: { clarify: { confidenceThreshold: number; maxRounds: number; minRounds: number; }; executor: { drainingChan`
- `WorkflowRunSnapshotSchema` (VariableDeclaration) — `z.ZodObject<{ activities: z.ZodDefault<z.ZodArray<z.ZodObject<{ activityId: z.ZodString; artifactPath: z.ZodOptional<z.ZodString>; completedAt: z.ZodOptional<z.ZodString>; error: z.ZodOptional<z.ZodSt`
- `WorkflowRunStatus` (TypeAliasDeclaration) — `"completed" | "pending" | "running" | "failed" | "paused" | "cancelled"`
- `WorkflowRunStatusSchema` (VariableDeclaration) — `z.ZodEnum<["pending", "running", "paused", "completed", "failed", "cancelled"]>`
- `WorkflowSchedulerActiveActivity` (TypeAliasDeclaration) — `{ phase: string; activityId: string; sessionId?: string | undefined; traceId?: string | undefined; nodeId?: string | undefined; turnId?: string | undefined; }`
- `WorkflowSchedulerActiveActivitySchema` (VariableDeclaration) — `z.ZodObject<{ activityId: z.ZodString; nodeId: z.ZodOptional<z.ZodString>; phase: z.ZodString; sessionId: z.ZodOptional<z.ZodString>; traceId: z.ZodOptional<z.ZodString>; turnId: z.ZodOptional<z.ZodSt`
- `WorkflowSchedulerCollectionState` (TypeAliasDeclaration) — `{ status: "active" | "draining" | "exhausted"; errorCount: number; exhausted: boolean; plannerRuns: number; collection: { collectionId: string; status?: "active" | "draining" | "exhausted" | undefined`
- `WorkflowSchedulerCollectionStateSchema` (VariableDeclaration) — `z.ZodObject<{ activeNodeIds: z.ZodArray<z.ZodString, "many">; collection: z.ZodObject<{ analyzedNodeIds: z.ZodOptional<z.ZodArray<z.ZodString, "many">>; collectionId: z.ZodString; errorCount: z.ZodOpt`
- `WorkflowSchedulerDerivedNode` (TypeAliasDeclaration) — `{ node: { status: "completed" | "pending" | "active" | "failed" | "cancelled" | "skipped"; kind: "phase" | "task"; title: string; id: string; dependsOn: string[]; description?: string | undefined; pro`
- `WorkflowSchedulerDerivedNodeSchema` (VariableDeclaration) — `z.ZodObject<{ blockedBy: z.ZodArray<z.ZodString, "many">; collectionIds: z.ZodDefault<z.ZodArray<z.ZodString, "many">>; incoming: z.ZodArray<z.ZodString, "many">; node: z.ZodObject<{ collectionId: z.Z`
- `WorkflowSchedulerState` (TypeAliasDeclaration) — `{ nodes: { node: { status: "completed" | "pending" | "active" | "failed" | "cancelled" | "skipped"; kind: "phase" | "task"; title: string; id: string; dependsOn: string[]; description?: string | undef`
- `WorkflowSchedulerStateSchema` (VariableDeclaration) — `z.ZodObject<{ activeActivities: z.ZodArray<z.ZodObject<{ activityId: z.ZodString; nodeId: z.ZodOptional<z.ZodString>; phase: z.ZodString; sessionId: z.ZodOptional<z.ZodString>; traceId: z.ZodOptional<`
- `WorkflowScriptMeta` (TypeAliasDeclaration) — `{ description: string; name: string; phases: { title: string; model?: string | undefined; detail?: string | undefined; }[]; whenToUse?: string | undefined; }`
- `WorkflowScriptMetaSchema` (VariableDeclaration) — `z.ZodEffects<z.ZodObject<{ description: z.ZodString; name: z.ZodString; phases: z.ZodDefault<z.ZodArray<z.ZodObject<{ detail: z.ZodOptional<z.ZodString>; model: z.ZodOptional<z.ZodString>; title: z.Zo`
- `WorkflowScriptPhaseMeta` (TypeAliasDeclaration) — `{ title: string; model?: string | undefined; detail?: string | undefined; }`
- `WorkflowScriptPhaseMetaSchema` (VariableDeclaration) — `z.ZodObject<{ detail: z.ZodOptional<z.ZodString>; model: z.ZodOptional<z.ZodString>; title: z.ZodString; }, "strict", z.ZodTypeAny, { title: string; model?: string | undefined; detail?: string | undef`
- `WorkflowSessionLink` (TypeAliasDeclaration) — `{ status: "completed" | "running" | "failed" | "cancelled" | "starting" | "retrying_model" | "waiting_permission"; kind: "agent_session" | "planner_agent" | "subplanner_agent" | "actor_agent" | "criti`
- `WorkflowSessionLinkSchema` (VariableDeclaration) — `z.ZodObject<{ activityId: z.ZodString; attempt: z.ZodNumber; completedAt: z.ZodOptional<z.ZodString>; kind: z.ZodEnum<["agent_session", "planner_agent", "subplanner_agent", "actor_agent", "critic_agen`
- `WorkflowSessionLinkStatus` (TypeAliasDeclaration) — `"completed" | "running" | "failed" | "cancelled" | "starting" | "retrying_model" | "waiting_permission"`
- `WorkflowSessionLinkStatusSchema` (VariableDeclaration) — `z.ZodEnum<["starting", "running", "retrying_model", "waiting_permission", "completed", "failed", "cancelled"]>`
- `WorkflowStorePort` (InterfaceDeclaration) — `WorkflowStorePort`
- `WorkflowStrategy` (TypeAliasDeclaration) — `{ clarify: { confidenceThreshold: number; maxRounds: number; minRounds: number; }; executor: { drainingChangeHours: number; frontierTarget: number; maxConcurrentLoops: number; maxConsecutiveErrors: nu`
- `WorkflowStrategySchema` (VariableDeclaration) — `z.ZodObject<{ clarify: z.ZodObject<{ confidenceThreshold: z.ZodNumber; maxRounds: z.ZodNumber; minRounds: z.ZodNumber; }, "strip", z.ZodTypeAny, { confidenceThreshold: number; maxRounds: number; minRo`

### `workflow/run-schema.ts`

- `ExpertWorkflowRunSnapshot` (TypeAliasDeclaration) — `{ status: "completed" | "pending" | "running" | "failed" | "paused" | "cancelled"; strategy: { clarify: { confidenceThreshold: number; maxRounds: number; minRounds: number; }; executor: { drainingChan`
- `ExpertWorkflowRunSnapshotSchema` (VariableDeclaration) — `z.ZodObject<{ activities: z.ZodDefault<z.ZodArray<z.ZodObject<{ activityId: z.ZodString; artifactPath: z.ZodOptional<z.ZodString>; completedAt: z.ZodOptional<z.ZodString>; error: z.ZodOptional<z.ZodSt`
- `WorkflowActivityKind` (TypeAliasDeclaration) — `"agent_session" | "planner_agent" | "subplanner_agent" | "actor_agent" | "critic_agent"`
- `WorkflowActivityKindSchema` (VariableDeclaration) — `z.ZodEnum<["agent_session", "planner_agent", "subplanner_agent", "actor_agent", "critic_agent"]>`
- `WorkflowActivitySnapshot` (TypeAliasDeclaration) — `{ status: "completed" | "pending" | "active" | "failed" | "cancelled" | "skipped"; kind: "agent_session" | "planner_agent" | "subplanner_agent" | "actor_agent" | "critic_agent"; phase: string; started`
- `WorkflowActivitySnapshotSchema` (VariableDeclaration) — `z.ZodObject<{ activityId: z.ZodString; artifactPath: z.ZodOptional<z.ZodString>; completedAt: z.ZodOptional<z.ZodString>; error: z.ZodOptional<z.ZodString>; inputArtifactPaths: z.ZodDefault<z.ZodArray`
- `WorkflowArtifact` (TypeAliasDeclaration) — `{ path: string; createdAt: string; label: string; contentType: string; phase?: string | undefined; }`
- `WorkflowArtifactSchema` (VariableDeclaration) — `z.ZodObject<{ contentType: z.ZodString; createdAt: z.ZodString; label: z.ZodString; path: z.ZodString; phase: z.ZodOptional<z.ZodString>; }, "strip", z.ZodTypeAny, { path: string; createdAt: string; l`
- `WorkflowEvent` (TypeAliasDeclaration) — `{ type: "run_started" | "run_completed" | "run_failed" | "workflow_paused" | "workflow_retry_started" | "workflow_session_linked" | "run_cancelled" | "phase_started" | "phase_completed" | "phase_faile`
- `WorkflowEventSchema` (VariableDeclaration) — `z.ZodObject<{ kind: z.ZodString; message: z.ZodOptional<z.ZodString>; nodeId: z.ZodOptional<z.ZodString>; payload: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodUnknown>>; phase: z.ZodOptional<z.ZodStri`
- `WorkflowEventType` (TypeAliasDeclaration) — `"run_started" | "run_completed" | "run_failed" | "workflow_paused" | "workflow_retry_started" | "workflow_session_linked" | "run_cancelled" | "phase_started" | "phase_completed" | "phase_failed" | "ar`
- `WorkflowEventTypeSchema` (VariableDeclaration) — `z.ZodEnum<["run_started", "run_completed", "run_failed", "workflow_paused", "workflow_retry_started", "workflow_session_linked", "run_cancelled", "phase_started", "phase_completed", "phase_failed", "a`
- `WorkflowFailure` (TypeAliasDeclaration) — `{ message: string; kind: "unknown" | "provider" | "timeout" | "cancelled" | "network" | "auth" | "tool" | "rate_limit" | "model_context" | "configuration" | "permission"; recoverable: boolean; retryab`
- `WorkflowFailureKind` (TypeAliasDeclaration) — `"unknown" | "provider" | "timeout" | "cancelled" | "network" | "auth" | "tool" | "rate_limit" | "model_context" | "configuration" | "permission"`
- `WorkflowFailureKindSchema` (VariableDeclaration) — `z.ZodEnum<["network", "rate_limit", "timeout", "auth", "provider", "model_context", "configuration", "permission", "tool", "cancelled", "unknown"]>`
- `WorkflowFailureSchema` (VariableDeclaration) — `z.ZodObject<{ activityId: z.ZodOptional<z.ZodString>; code: z.ZodOptional<z.ZodString>; kind: z.ZodEnum<["network", "rate_limit", "timeout", "auth", "provider", "model_context", "configuration", "perm`
- `WorkflowGraphRecord` (TypeAliasDeclaration) — `{ strategy: { clarify: { confidenceThreshold: number; maxRounds: number; minRounds: number; }; executor: { drainingChangeHours: number; frontierTarget: number; maxConcurrentLoops: number; maxConsecuti`
- `WorkflowGraphRecordSchema` (VariableDeclaration) — `z.ZodDiscriminatedUnion<"recordType", [z.ZodObject<{ recordType: z.ZodLiteral<"meta">; createdAt: z.ZodString; definitionId: z.ZodOptional<z.ZodString>; definitionVersion: z.ZodOptional<z.ZodString>; `
- `WorkflowPhaseSnapshot` (TypeAliasDeclaration) — `{ status: "completed" | "pending" | "active" | "failed" | "cancelled" | "skipped"; phase: string; startedAt?: string | undefined; error?: string | undefined; artifactPath?: string | undefined; session`
- `WorkflowPhaseSnapshotSchema` (VariableDeclaration) — `z.ZodObject<{ artifactPath: z.ZodOptional<z.ZodString>; activityId: z.ZodOptional<z.ZodString>; completedAt: z.ZodOptional<z.ZodString>; error: z.ZodOptional<z.ZodString>; phase: z.ZodString; sessionI`
- `WorkflowRecoveryAction` (TypeAliasDeclaration) — `{ label: string; action: "retry" | "retry_with_current_model" | "skip_node" | "cancel"; phase?: string | undefined; nodeId?: string | undefined; activityId?: string | undefined; destructive?: boolean `
- `WorkflowRecoveryActionSchema` (VariableDeclaration) — `z.ZodObject<{ action: z.ZodEnum<["retry", "retry_with_current_model", "skip_node", "cancel"]>; activityId: z.ZodOptional<z.ZodString>; destructive: z.ZodOptional<z.ZodBoolean>; label: z.ZodString; nod`
- `WorkflowRunSnapshot` (TypeAliasDeclaration) — `{ status: "completed" | "pending" | "running" | "failed" | "paused" | "cancelled"; strategy: { clarify: { confidenceThreshold: number; maxRounds: number; minRounds: number; }; executor: { drainingChan`
- `WorkflowRunSnapshotSchema` (VariableDeclaration) — `z.ZodObject<{ activities: z.ZodDefault<z.ZodArray<z.ZodObject<{ activityId: z.ZodString; artifactPath: z.ZodOptional<z.ZodString>; completedAt: z.ZodOptional<z.ZodString>; error: z.ZodOptional<z.ZodSt`
- `WorkflowSessionLink` (TypeAliasDeclaration) — `{ status: "completed" | "running" | "failed" | "cancelled" | "starting" | "retrying_model" | "waiting_permission"; kind: "agent_session" | "planner_agent" | "subplanner_agent" | "actor_agent" | "criti`
- `WorkflowSessionLinkSchema` (VariableDeclaration) — `z.ZodObject<{ activityId: z.ZodString; attempt: z.ZodNumber; completedAt: z.ZodOptional<z.ZodString>; kind: z.ZodEnum<["agent_session", "planner_agent", "subplanner_agent", "actor_agent", "critic_agen`
- `WorkflowSessionLinkStatus` (TypeAliasDeclaration) — `"completed" | "running" | "failed" | "cancelled" | "starting" | "retrying_model" | "waiting_permission"`
- `WorkflowSessionLinkStatusSchema` (VariableDeclaration) — `z.ZodEnum<["starting", "running", "retrying_model", "waiting_permission", "completed", "failed", "cancelled"]>`

### `workflow/scheduler-state.ts`

- `deriveWorkflowRunSchedulerState` (FunctionDeclaration) — `export function deriveWorkflowRunSchedulerState( snapshot: WorkflowRunSnapshot, ): WorkflowSchedulerState { const state = deriveWorkflowSchedulerState(snapshot.graph); const activeActivities = snapsho`
- `deriveWorkflowSchedulerState` (FunctionDeclaration) — `export function deriveWorkflowSchedulerState(graph: WorkflowGraph): WorkflowSchedulerState { const nodesById = new Map<string, WorkflowGraphNode>(); for (const node of graph.nodes) { nodesById.set(nod`
- `WorkflowSchedulerActiveActivity` (TypeAliasDeclaration) — `{ phase: string; activityId: string; sessionId?: string | undefined; traceId?: string | undefined; nodeId?: string | undefined; turnId?: string | undefined; }`
- `WorkflowSchedulerActiveActivitySchema` (VariableDeclaration) — `z.ZodObject<{ activityId: z.ZodString; nodeId: z.ZodOptional<z.ZodString>; phase: z.ZodString; sessionId: z.ZodOptional<z.ZodString>; traceId: z.ZodOptional<z.ZodString>; turnId: z.ZodOptional<z.ZodSt`
- `WorkflowSchedulerCollectionState` (TypeAliasDeclaration) — `{ status: "active" | "draining" | "exhausted"; errorCount: number; exhausted: boolean; plannerRuns: number; collection: { collectionId: string; status?: "active" | "draining" | "exhausted" | undefined`
- `WorkflowSchedulerCollectionStateSchema` (VariableDeclaration) — `z.ZodObject<{ activeNodeIds: z.ZodArray<z.ZodString, "many">; collection: z.ZodObject<{ analyzedNodeIds: z.ZodOptional<z.ZodArray<z.ZodString, "many">>; collectionId: z.ZodString; errorCount: z.ZodOpt`
- `WorkflowSchedulerDerivedNode` (TypeAliasDeclaration) — `{ node: { status: "completed" | "pending" | "active" | "failed" | "cancelled" | "skipped"; kind: "phase" | "task"; title: string; id: string; dependsOn: string[]; description?: string | undefined; pro`
- `WorkflowSchedulerDerivedNodeSchema` (VariableDeclaration) — `z.ZodObject<{ blockedBy: z.ZodArray<z.ZodString, "many">; collectionIds: z.ZodDefault<z.ZodArray<z.ZodString, "many">>; incoming: z.ZodArray<z.ZodString, "many">; node: z.ZodObject<{ collectionId: z.Z`
- `WorkflowSchedulerState` (TypeAliasDeclaration) — `{ nodes: { node: { status: "completed" | "pending" | "active" | "failed" | "cancelled" | "skipped"; kind: "phase" | "task"; title: string; id: string; dependsOn: string[]; description?: string | undef`
- `WorkflowSchedulerStateSchema` (VariableDeclaration) — `z.ZodObject<{ activeActivities: z.ZodArray<z.ZodObject<{ activityId: z.ZodString; nodeId: z.ZodOptional<z.ZodString>; phase: z.ZodString; sessionId: z.ZodOptional<z.ZodString>; traceId: z.ZodOptional<`

### `workflow/script.ts`

- `CreateScriptWorkflowActivityInput` (InterfaceDeclaration) — `CreateScriptWorkflowActivityInput`
- `CreateScriptWorkflowRunInput` (InterfaceDeclaration) — `CreateScriptWorkflowRunInput`
- `CreateSessionTaskLinkInput` (InterfaceDeclaration) — `CreateSessionTaskLinkInput`
- `SCRIPT_WORKFLOW_ACTIVITY_STATUSES` (VariableDeclaration) — `readonly ["queued", "running", "completed", "failed", "skipped", "cancelled", "cached", "lost"]`
- `SCRIPT_WORKFLOW_DEFINITION_SCOPES` (VariableDeclaration) — `readonly ["builtin", "explicit", "project", "user"]`
- `SCRIPT_WORKFLOW_RUN_STATUSES` (VariableDeclaration) — `readonly ["pending", "running", "paused", "completed", "failed", "cancelled"]`
- `ScriptWorkflowActivityRecord` (InterfaceDeclaration) — `ScriptWorkflowActivityRecord`
- `ScriptWorkflowActivityStatus` (TypeAliasDeclaration) — `"completed" | "running" | "failed" | "cancelled" | "queued" | "skipped" | "cached" | "lost"`
- `ScriptWorkflowDefinitionRecord` (InterfaceDeclaration) — `ScriptWorkflowDefinitionRecord`
- `ScriptWorkflowDefinitionScope` (TypeAliasDeclaration) — `"user" | "project" | "builtin" | "explicit"`
- `ScriptWorkflowEventRecord` (InterfaceDeclaration) — `ScriptWorkflowEventRecord`
- `ScriptWorkflowRunRecord` (InterfaceDeclaration) — `ScriptWorkflowRunRecord`
- `ScriptWorkflowRunStats` (InterfaceDeclaration) — `ScriptWorkflowRunStats`
- `ScriptWorkflowRunStatsSchema` (VariableDeclaration) — `z.ZodObject<{ agentCalls: z.ZodNumber; cachedAgentCalls: z.ZodNumber; failedAgentCalls: z.ZodNumber; tokens: z.ZodObject<{ cacheRead: z.ZodNumber; cacheWrite: z.ZodNumber; input: z.ZodNumber; output: `
- `ScriptWorkflowRunStatus` (TypeAliasDeclaration) — `"completed" | "pending" | "running" | "failed" | "paused" | "cancelled"`
- `ScriptWorkflowSource` (TypeAliasDeclaration) — `"user" | "builtin"`
- `ScriptWorkflowStorePort` (InterfaceDeclaration) — `ScriptWorkflowStorePort`
- `SessionTaskLinkRecord` (InterfaceDeclaration) — `SessionTaskLinkRecord`
- `UpdateScriptWorkflowActivityInput` (InterfaceDeclaration) — `UpdateScriptWorkflowActivityInput`
- `UpdateScriptWorkflowRunInput` (InterfaceDeclaration) — `UpdateScriptWorkflowRunInput`
- `UpsertScriptWorkflowDefinitionInput` (InterfaceDeclaration) — `UpsertScriptWorkflowDefinitionInput`
- `WorkflowAgentCallInput` (TypeAliasDeclaration) — `{ prompt: string; phase?: string | undefined; callPath?: string | undefined; opts?: { agentType?: string | undefined; model?: string | undefined; label?: string | undefined; phase?: string | undefined`
- `WorkflowAgentCallInputSchema` (VariableDeclaration) — `z.ZodObject<{ callPath: z.ZodOptional<z.ZodString>; phase: z.ZodOptional<z.ZodString>; opts: z.ZodOptional<z.ZodObject<{ agentType: z.ZodOptional<z.ZodString>; instructions: z.ZodOptional<z.ZodString>`
- `WorkflowAgentIsolation` (TypeAliasDeclaration) — `"worktree"`
- `WorkflowAgentIsolationSchema` (VariableDeclaration) — `z.ZodEnum<["worktree"]>`
- `WorkflowAgentOptions` (TypeAliasDeclaration) — `{ agentType?: string | undefined; model?: string | undefined; label?: string | undefined; phase?: string | undefined; timeoutMs?: number | undefined; instructions?: string | undefined; isolation?: "wo`
- `WorkflowAgentOptionsSchema` (VariableDeclaration) — `z.ZodObject<{ agentType: z.ZodOptional<z.ZodString>; instructions: z.ZodOptional<z.ZodString>; isolation: z.ZodOptional<z.ZodEnum<["worktree"]>>; label: z.ZodOptional<z.ZodString>; maxTurns: z.ZodOpti`
- `WorkflowScriptMeta` (TypeAliasDeclaration) — `{ description: string; name: string; phases: { title: string; model?: string | undefined; detail?: string | undefined; }[]; whenToUse?: string | undefined; }`
- `WorkflowScriptMetaSchema` (VariableDeclaration) — `z.ZodEffects<z.ZodObject<{ description: z.ZodString; name: z.ZodString; phases: z.ZodDefault<z.ZodArray<z.ZodObject<{ detail: z.ZodOptional<z.ZodString>; model: z.ZodOptional<z.ZodString>; title: z.Zo`
- `WorkflowScriptPhaseMeta` (TypeAliasDeclaration) — `{ title: string; model?: string | undefined; detail?: string | undefined; }`
- `WorkflowScriptPhaseMetaSchema` (VariableDeclaration) — `z.ZodObject<{ detail: z.ZodOptional<z.ZodString>; model: z.ZodOptional<z.ZodString>; title: z.ZodString; }, "strict", z.ZodTypeAny, { title: string; model?: string | undefined; detail?: string | undef`

### `workflow/session-links.ts`

- `deriveWorkflowSessionLinks` (FunctionDeclaration) — `export function deriveWorkflowSessionLinks( snapshot: Pick<WorkflowRunSnapshot, "activities" | "runId">, ): WorkflowSessionLink[] { const attemptByScope = new Map<string, number>(); return snapshot.ac`

## 相邻文件的契约行（不在本包范围，仅登记契约名以供剔除）

> **本节的目的不是宣称范围。** `contracts/src/errors/index.ts` 已登记 `independent-replacement`，
> 按 AGENTS.md「不重复改已独立候选」不属于本包的重写对象；但它导出的错误码是**对外契约**——
> 名字被下游代码与契约测试逐字依赖，改名会破坏调用方或让测试变红。因此在此登记契约名，
> 供「契约行剔除」机制（`--contract-lines`）在相似度计分前剔除这些行。

### `errors/index.ts` —— 27 个错误码

**键名与线协议值一一对应，且值由键名机械派生**（驼峰 → 下划线），当前 27 条**失配 0**。

> 因此**登记键名即覆盖值**，不必逐字写 54 条。
> **但这是「当前 27 条实测的事实」，不是规则**：若将来新增不合该派生规则的键
> （例如 `HTTPError` → `httperror` 与 `http_error` 两种可能），必须**单独登记它的值**。

#### 有包外调用方引用（22 条）

证据口径：`CoreErrorType.<键名>` 在 `apps/` 与 `packages/` 下的代码/夹具中的包外出现次数
（排除定义文件自身、`docs/`、`specs/`、`**/dist/**`）。

| 键名                     | 线协议值                   | 包外文件数 | 首个证据文件                                                                    |
| ------------------------ | -------------------------- | ---------: | ------------------------------------------------------------------------------- |
| `ConfigurationError`     | `configuration_error`      |         56 | `apps/cli/packages/core/src/hooks/configured-runner-input.ts`                   |
| `ToolExecutionFailed`    | `tool_execution_failed`    |         46 | `apps/cli/packages/core/src/hooks/configured-runner-callback.ts`                |
| `ToolCancelled`          | `tool_cancelled`           |         44 | `apps/cli/packages/bootstrap/src/app/script-workflow-tool-port.ts`              |
| `PermissionDenied`       | `permission_denied`        |         21 | `apps/cli/packages/core/src/tool/executor/errors.ts`                            |
| `ToolTimeout`            | `tool_timeout`             |         16 | `apps/cli/packages/core/src/hooks/runner-helpers.ts`                            |
| `TurnCancelled`          | `turn_cancelled`           |         14 | `apps/cli/packages/bootstrap/src/app/workflow-driver-helpers.ts`                |
| `InvalidStateTransition` | `invalid_state_transition` |         14 | `apps/cli/packages/core/src/permission/broker.ts`                               |
| `SessionNotFound`        | `session_not_found`        |         10 | `apps/cli/packages/bootstrap/src/app/dynamic-workflow-run-launch.ts`            |
| `ModelError`             | `model_error`              |         10 | `apps/cli/packages/core/src/runtime/helpers/model/provider-business-failure.ts` |
| `PermissionTimeout`      | `permission_timeout`       |          9 | `apps/cli/packages/core/src/permission/broker.ts`                               |
| `InvalidInput`           | `invalid_input`            |          6 | `apps/cli/packages/core/src/runtime/helpers/media/model-media-policy.ts`        |
| `ModelContextExceeded`   | `model_context_exceeded`   |          5 | `apps/cli/packages/core/src/runtime/helpers/model/failure-classification.ts`    |
| `StorageError`           | `storage_error`            |          5 | `apps/cli/packages/core/src/tool/executor/permission-flow/refusals.ts`          |
| `SessionCorrupted`       | `session_corrupted`        |          4 | `apps/cli/packages/bootstrap/src/protocol/server-operations.ts`                 |
| `ToolNotFound`           | `tool_not_found`           |          4 | `apps/cli/packages/core/src/tool/executor/call-runner.ts`                       |
| `PermissionEscalation`   | `permission_escalation`    |          4 | `apps/cli/packages/core/src/tool/executor/invocation/outcome.ts`                |
| `TurnInProgress`         | `turn_in_progress`         |          2 | `apps/cli/packages/core/src/runtime/methods/steering-active.ts`                 |
| `InvalidTurnPhase`       | `invalid_turn_phase`       |          2 | `apps/cli/packages/core/src/agent/turn-machine.ts`                              |
| `ModelTimeout`           | `model_timeout`            |          2 | `apps/cli/packages/core/src/workflow/expert/failures.ts`                        |
| `ModelRateLimited`       | `model_rate_limited`       |          2 | `apps/cli/packages/core/src/workflow/expert/failures.ts`                        |
| `ToolMaxCalls`           | `tool_max_calls`           |          2 | `apps/cli/packages/core/src/workflow/expert/failures.ts`                        |
| `UnknownError`           | `unknown_error`            |          2 | `apps/cli/packages/core/src/runtime/helpers/turn/outcome-events.ts`             |

#### 仅有同包契约测试证据（5 条）

| 键名                   | 线协议值                 | 证据                                                                                        |
| ---------------------- | ------------------------ | ------------------------------------------------------------------------------------------- |
| `SessionAlreadyExists` | `session_already_exists` | `../../test/core-errors.test.ts` 的 `deepEqual(Object.keys/values(...))` 逐字断言全部 27 条 |
| `TurnNotFound`         | `turn_not_found`         | `../../test/core-errors.test.ts` 的 `deepEqual(Object.keys/values(...))` 逐字断言全部 27 条 |
| `EventOutOfOrder`      | `event_out_of_order`     | `../../test/core-errors.test.ts` 的 `deepEqual(Object.keys/values(...))` 逐字断言全部 27 条 |
| `ProjectionCorrupted`  | `projection_corrupted`   | `../../test/core-errors.test.ts` 的 `deepEqual(Object.keys/values(...))` 逐字断言全部 27 条 |
| `Cancelled`            | `cancelled`              | `../../test/core-errors.test.ts` 的 `deepEqual(Object.keys/values(...))` 逐字断言全部 27 条 |

**说明**：这 5 条无包外调用方，但同包契约测试
`apps/cli/packages/contracts/test/core-errors.test.ts` 对**全部 27 个键名与值**做 `deepEqual`
逐字断言（顺序敏感 + 完整集合）——改名会使该测试变红，这构成**测试级契约证据**。
不是「没有契约」，而是「契约的保护者只有测试」：与调用方引用相比它同样阻止改名，
只是失败位置从编译期移到测试期。

### 为什么这 27 条必须剔除而不是改写

它们作为对象字面量的 `键: "值"` 成对出现，形式本身就是契约：

```ts
export const CoreErrorType = {
  SessionNotFound: "session_not_found",
  // …另外 26 条
} as const;
```

改键名会破坏 `CoreErrorType.Xxx` 形式的调用方；改值会改变线协议上的错误码；
换写法（如改成数组 + 运行时构造）会破坏 `as const` 的字面量类型推导与 `Object.keys` 的断言。
因此这些行**结构上不可能通过改写消除**，只能剔除后对剩余实现计分。
