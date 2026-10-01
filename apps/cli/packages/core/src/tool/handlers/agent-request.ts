// Source-exposed Agent request projection; existing attribution remains applicable.
import type { AgentInput, SubagentRunRequest, TraceContext } from "@knorvia/contracts";
import type { ToolExecutionContext } from "../types.js";

type FieldMapping = readonly (readonly [string, keyof ToolExecutionContext])[];
const PARENT_FIELDS = [
  ["sessionId", "sessionId"],
  ["turnId", "turnId"],
  ["parentToolCallId", "toolCallId"],
] as const satisfies FieldMapping;
const LOCATION_FIELDS = [
  ["workingDirectory", "workingDirectory"],
  ["workspaceRoot", "workspaceRoot"],
] as const satisfies FieldMapping;
const TRACE_FIELDS = [
  ["traceId", "traceId"],
  ["spanId", "spanId"],
  ["parentSpanId", "parentSpanId"],
  ["sessionId", "sessionId"],
  ["turnId", "turnId"],
] as const satisfies FieldMapping;

function contextFields<const Mapping extends FieldMapping>(
  context: ToolExecutionContext,
  mapping: Mapping,
): { [Field in Mapping[number] as Field[0]]: ToolExecutionContext[Field[1]] } {
  return Object.fromEntries(mapping.map(([target, source]) => [target, context[source]])) as {
    [Field in Mapping[number] as Field[0]]: ToolExecutionContext[Field[1]];
  };
}

function outputFileVisibility(names: readonly string[] | undefined): boolean {
  const visible = new Set(names ?? []);
  return visible.has("Read") || visible.has("Bash");
}

export function agentLaunchFrame(
  parsed: AgentInput,
  agentType: string,
  context: ToolExecutionContext,
): SubagentRunRequest {
  // 顺序是冻结合同的一部分：父身份、可见工具、位置、trace 分阶段读取；不能缓存 getter。
  return {
    ...contextFields(context, PARENT_FIELDS),
    agentType,
    description: parsed.description,
    prompt: parsed.prompt,
    callerCanReadOutputFile: outputFileVisibility(context.providerVisibleToolNames),
    ...contextFields(context, LOCATION_FIELDS),
    trace: contextFields(context, TRACE_FIELDS) as TraceContext,
  };
}
