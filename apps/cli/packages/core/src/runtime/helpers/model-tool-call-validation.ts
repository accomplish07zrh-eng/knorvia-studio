import { CoreErrorType, createCoreError, traceContextToLogContext } from "../deps.js";
import type { Logger, Model, ModelToolCall, ToolCall, TraceContext } from "../deps.js";

interface ModelToolCallValidationContext {
  logger?: Logger;
  model: Pick<Model, "providerId" | "modelId">;
  source: string;
  traceContext: TraceContext;
}

interface ToolCallNameContext extends ModelToolCallValidationContext {
  providerExecuted?: boolean;
  toolCallId?: string;
  toolCallIndex?: number;
}

export function normalizeModelToolCallsForRuntime(
  toolCalls: readonly ModelToolCall[] | undefined,
  context: ModelToolCallValidationContext,
): ModelToolCall[] | undefined {
  if (!toolCalls || toolCalls.length === 0) {
    return undefined;
  }

  return toolCalls.map((toolCall, index) => ({
    ...toolCall,
    name: admitModelToolCallName(toolCall.name, {
      ...context,
      providerExecuted: toolCall.providerExecuted,
      toolCallId: toolCall.id,
      toolCallIndex: index,
    }),
  }));
}

export function requireRuntimeToolCallName(
  toolCall: Pick<ModelToolCall | ToolCall, "id" | "name">,
  context: ModelToolCallValidationContext,
): string {
  const name = toolCall.name;
  const callContext = { ...context, toolCallId: toolCall.id };
  const trimmedName = typeof name === "string" ? name.trim() : "";
  if (trimmedName.length > 0) {
    return trimmedName;
  }
  return rejectToolCallName(callContext);
}

function admitModelToolCallName(name: unknown, context: ToolCallNameContext): string {
  const trimmedName = typeof name === "string" ? name.trim() : "";
  if (trimmedName.length > 0) {
    return trimmedName;
  }
  if (
    typeof name === "string" &&
    context.providerExecuted !== true &&
    typeof context.toolCallId === "string" &&
    context.toolCallId.trim().length > 0
  ) {
    return name;
  }
  return rejectToolCallName(context);
}

function rejectToolCallName(context: ToolCallNameContext): never {
  const logContext = {
    ...traceContextToLogContext(context.traceContext),
    event: "model.invalid_tool_call",
    module: "core.runtime",
    model: `${context.model.providerId}/${context.model.modelId}`,
    modelId: context.model.modelId,
    providerId: context.model.providerId,
    source: context.source,
    status: "failed" as const,
    toolCallId: context.toolCallId,
    toolCallIndex: context.toolCallIndex,
  };
  context.logger?.warn("Model returned invalid tool call", logContext);
  throw createCoreError(
    CoreErrorType.ModelError,
    "Model returned an invalid tool call: tool name is empty.",
    { context: logContext, recoverable: true, retryable: false },
  );
}
