import type {
  CompletedToolPartMetadata,
  MessageId,
  Model,
  PartId,
  ToolCall,
  TraceContext,
} from "../deps.js";
import { requireRuntimeToolCallName } from "../helpers/index.js";
import type { AgentRuntimeInternal } from "../internal.js";

interface NonEmptyToolNameProjection {
  metadata?: Record<string, unknown>;
  toolName: string;
}

export function projectToolNameForNonEmptyBoundary(toolName: string): NonEmptyToolNameProjection {
  if (toolName.trim().length > 0) return { toolName };
  return { metadata: { providerToolName: toolName }, toolName: "empty_tool_name" };
}

export async function persistPendingToolPart(
  runtime: AgentRuntimeInternal,
  options: {
    assistantMessageId: MessageId;
    declarationIndex: number;
    input: Record<string, unknown>;
    partID: PartId;
    toolCall: ToolCall;
    traceContext: TraceContext;
    metadata?: CompletedToolPartMetadata;
    model: Model;
  },
): Promise<void> {
  const projected =
    typeof options.toolCall.name === "string" && options.toolCall.name.trim().length === 0
      ? projectToolNameForNonEmptyBoundary(options.toolCall.name)
      : {
          toolName: requireRuntimeToolCallName(options.toolCall, {
            logger: runtime.logger,
            model: options.model,
            source: "persistPendingToolPart",
            traceContext: options.traceContext,
          }),
        };
  await runtime.persistPart(
    {
      id: options.partID,
      sessionID: runtime.sessionId,
      messageID: options.assistantMessageId,
      type: "tool",
      callID: options.toolCall.id,
      declarationIndex: options.declarationIndex,
      tool: projected.toolName,
      metadata: { ...projected.metadata, ...options.metadata },
      state: {
        status: "pending",
        input: options.input,
        raw: JSON.stringify({ tool: projected.toolName, input: options.toolCall.input }),
      },
    },
    options.traceContext,
  );
}
