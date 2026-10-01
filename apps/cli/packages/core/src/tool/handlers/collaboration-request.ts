// Source-exposed request projection; public contracts and applicable attribution are retained.
import type {
  CoordinatorResponseRequest,
  RespondToCoordinatorInput,
  SendMessageInput,
  SubagentSendMessageRequest,
  SubmitResultInput,
  SubmitResultRequest,
  TraceContext,
} from "@knorvia/contracts";
import type { ToolExecutionContext } from "../types.js";

type ContextField = readonly [target: string, source: keyof ToolExecutionContext];
const SEND_PARENT_FIELDS = [
  ["sessionId", "sessionId"],
  ["turnId", "turnId"],
  ["parentToolCallId", "toolCallId"],
] as const satisfies readonly ContextField[];
const SEND_LOCATION_FIELDS = [
  ["workingDirectory", "workingDirectory"],
  ["workspaceRoot", "workspaceRoot"],
] as const satisfies readonly ContextField[];
const TRACE_FIELDS = [
  ["traceId", "traceId"],
  ["spanId", "spanId"],
  ["parentSpanId", "parentSpanId"],
  ["sessionId", "sessionId"],
  ["turnId", "turnId"],
] as const satisfies readonly ContextField[];

function encodeContext<const Fields extends readonly ContextField[]>(
  context: ToolExecutionContext,
  fields: Fields,
): { [Field in Fields[number] as Field[0]]: ToolExecutionContext[Field[1]] } {
  const entries: [string, unknown][] = [];
  for (const [target, source] of fields) entries.push([target, context[source]]);
  return Object.fromEntries(entries) as {
    [Field in Fields[number] as Field[0]]: ToolExecutionContext[Field[1]];
  };
}

function traceFor(context: ToolExecutionContext): TraceContext {
  return context.traceContext ?? (encodeContext(context, TRACE_FIELDS) as TraceContext);
}

export function sendMessageRequest(
  parsed: SendMessageInput,
  context: ToolExecutionContext,
): SubagentSendMessageRequest {
  // 方法 getter 已先求值；编码按冻结顺序读取字段，不能提前快照端口或 trace。
  return {
    ...encodeContext(context, SEND_PARENT_FIELDS),
    to: parsed.to,
    summary: parsed.summary,
    message: parsed.message,
    ...encodeContext(context, SEND_LOCATION_FIELDS),
    trace: traceFor(context),
  };
}

export function coordinatorResponseRequest(
  parsed: RespondToCoordinatorInput,
  context: ToolExecutionContext,
): CoordinatorResponseRequest {
  return {
    ...encodeContext(context, [["childToolCallId", "toolCallId"]] as const),
    summary: parsed.summary,
    message: parsed.message,
    trace: traceFor(context),
  };
}

export function workflowSubmissionRequest(
  parsed: SubmitResultInput,
  context: ToolExecutionContext,
): SubmitResultRequest {
  return {
    ...encodeContext(context, [["toolCallId", "toolCallId"]] as const),
    result: parsed.result,
    trace: traceFor(context),
  };
}
