// Source-exposed orchestration; public prose and applicable attribution are retained.
import {
  CoreErrorType,
  ESCALATE_TOOL_NAME,
  EscalateInputSchema,
  createCoreError,
  type EscalateInput,
  type EscalateOutput,
  type EscalateQuestionRequest,
  type TraceContext,
  type WorkflowEscalateOutcome,
} from "@knorvia/contracts";
import type { ToolExecutionContext, ToolHandler } from "../types.js";
type TraceResolver = (context: ToolExecutionContext) => TraceContext;
type RequestField = (
  input: EscalateInput,
  context: ToolExecutionContext,
  trace: TraceResolver,
) => readonly [string, unknown] | undefined;
const REQUEST_FIELDS: readonly RequestField[] = [
  (_input, context) => ["toolCallId", context.toolCallId],
  (input) => ["question", input.question],
  (input) => (input.context === undefined ? undefined : ["context", input.context]),
  (_input, context, trace) => ["trace", trace(context)],
];
function encodeRequest(
  input: EscalateInput,
  context: ToolExecutionContext,
  trace: TraceResolver,
): EscalateQuestionRequest {
  return Object.fromEntries(
    REQUEST_FIELDS.map((read) => read(input, context, trace)).filter(
      (field) => field !== undefined,
    ),
  ) as unknown as EscalateQuestionRequest;
}
type OutcomeFields = {
  kind: unknown;
  answer: unknown;
  qid: unknown;
  message: unknown;
  reason: unknown;
};
type OutcomeReader = readonly [string, (outcome: OutcomeFields) => unknown];
const ANSWERED_FIELDS: readonly OutcomeReader[] = [
  ["status", () => "answered"],
  ["message", (outcome) => outcome.answer],
  ["qid", (outcome) => outcome.qid],
];
const REFUSED_FIELDS: readonly OutcomeReader[] = [
  ["status", () => "refused"],
  ["message", (outcome) => outcome.message],
  ["reason", (outcome) => outcome.reason],
];
function projectOutcome(outcome: WorkflowEscalateOutcome): EscalateOutput {
  const fields = outcome.kind === "answered" ? ANSWERED_FIELDS : REFUSED_FIELDS;
  return Object.fromEntries(
    fields.map(([key, read]) => [key, read(outcome as unknown as OutcomeFields)]),
  ) as unknown as EscalateOutput;
}
function admitPort(context: ToolExecutionContext): void {
  // 保留存在性门及原错误；第二次端口读取与 method lookup 仍由调用表达式持有。
  if (!context.workflowEscalatePort)
    throw createCoreError(
      CoreErrorType.ConfigurationError,
      "Workflow escalate port is not configured for escalate",
      {
        context: { toolCallId: context.toolCallId, toolName: ESCALATE_TOOL_NAME },
        recoverable: false,
      },
    );
}
export function createEscalateOperation(trace: TraceResolver): ToolHandler {
  // 直接绑定唯一 async owner；同步 codec 不新增 await 或 promise adoption。
  return async (input, context) => {
    const parsed = EscalateInputSchema.parse(input) as EscalateInput;
    admitPort(context);
    const outcome = await context.workflowEscalatePort!.escalate(
      encodeRequest(parsed, context, trace),
    );
    return projectOutcome(outcome);
  };
}
