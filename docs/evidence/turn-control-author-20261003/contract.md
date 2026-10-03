# Executor outcome-control behavior

Implement all four public synchronous functions in api.d.ts in the logical module `core/src/tool/executor/turn-control.ts`. No new public exports, asynchronous gates, state, policy, grants or data writes. Private organization is your choice. Import existing protocol symbols from `@knorvia/contracts` and types from `../types.js`; dependency implementations are excluded. public-types.d.ts is a type-only excerpt, not a complete standalone compilation environment.

All operations return the exact original result when their admission is not met. An admitted operation returns a fresh shallow result copy, retaining all own enumerable string/symbol properties and nested references; overwrite only its specified fields. Existing error, output, display, serialization and timestamps remain shared. Overwriting an existing field retains its property order. Never mutate the input result/context/metadata. Throws from property reads, trim, shallow copy or the existing predicate propagate synchronously; no normalization/catch/retry.

## Automation retained-task limit

Admission read order: result.success, context.toolName, then existing isAutomationCreateLimitError(context.error), with short-circuiting. Only a failed result for literal CronCreate with predicate true is admitted. Then set modelContent to model-strings.json automationLimit and turnControl to `{reason:'automation_create_limit',stopTurnAfterResult:true}`. The original raw error remains in result.error, but its model-facing content is replaced. Context error is the predicate input, not result.error. Preserve all other fields, including an existing followUpUserInput.

## Plan refusal

First resolve context.planEnabled when non-nullish, otherwise whether context.mode equals 'plan'; explicit false disables this route even in plan mode. Only when enabled, context.toolName equals the imported EXIT_PLAN_MODE_TOOL_NAME, and result.success is false is it admitted; this read order short-circuits.

Feedback authority requires result.error.type exactly imported CoreErrorType.PermissionDenied, then result.error.reasonSource exactly plan_approval_feedback. Only after both checks read and trim result.error.message. Nonempty feedback is eligible unless it equals `Permission denied for ${EXIT_PLAN_MODE_TOOL_NAME}` after trimming. Genuine eligible feedback sets followUpUserInput to `{input: trimmedMessage,reasonSource:'plan_approval_feedback'}` and modelContent to the fixed planDenied message. This route preserves any existing turnControl; it does not clear it. Without eligible feedback set turnControl `{reason:'plan_exit_denied',stopTurnAfterResult:true}` and preserve existing modelContent/followUpUserInput. A denied project/hook/broker reason is not user feedback without the dedicated authority source. Do not invent acknowledgement of later steering acceptance.

## Workflow refine refusal

Context toolName is checked first: only imported CREATE_WORKFLOW_TOOL_NAME or AMEND_WORKFLOW_TOOL_NAME, followed by failed result, are eligible. No mode gate and ResumeWorkflowRun is excluded. Feedback requires error.type PermissionDenied, then source workflow_refine_feedback, then a nonempty trimmed error.message. Set followUpUserInput `{input: trimmedMessage,reasonSource:'workflow_refine_feedback'}` and fixed workflowDenied modelContent. No feedback returns original identity; there is no new stop-turn fallback. Preserve existing turnControl and other result fields.

## Metadata terminal success

Read result.success first; only on success read context.entry.metadata.stopTurnOnSuccess. Admission requires strict true, not truthiness. Set turnControl `{reason:'subagent_terminal',stopTurnAfterResult:true}` on a shallow result copy. No tool-name restriction, no handler launch, no new child policy. Preserve all other fields; on failure do not read entry/metadata at all.

## Current callers and boundaries

Unchanged `Admission.rejectPermission` applies plan then workflow projection before classifying permission-denied/error exits and appending existing hook contexts. Existing Invocation success applies terminal metadata and existing failedExecution applies automation limits. You do not author these consumers or their helpers. A Task/Workflow/Cron business result can be represented by owned plain synthetic records; there are no real agents, permissions, tools or automations in this assignment.

Current-task author inputs are only this contract, api.d.ts, public-types.d.ts, dependency-api.d.ts and model-strings.json. Do not read implementation/history/tests/oracles/receipts or compile/run a candidate before its full initial source is saved and hashed. Fixed APIs, protocol and model-facing text are compatibility inputs, not originality credit. Disclose inherited author context and instruction-only access limits; no clean-room/licence/header claim.
