import type { TraceContext } from "@knorvia/contracts";
import type { ToolExecutionContext } from "../types.js";

const WEBSEARCH_TOOL_NAME = "WebSearch";
const CONTEXT_FIELDS = ["traceId", "spanId", "parentSpanId", "sessionId", "turnId"] as const;

export function webSearchTraceFromContext(context: ToolExecutionContext): TraceContext {
  const fields = CONTEXT_FIELDS.map((name) => [name, context[name]]);
  const trace = Object.fromEntries(fields) as TraceContext;
  trace.attributes = { toolCallId: context.toolCallId, toolName: WEBSEARCH_TOOL_NAME };
  return trace;
}
