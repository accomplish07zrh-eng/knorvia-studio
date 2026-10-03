import { createPartId } from "../deps.js";
import type {
  MessageId,
  Model,
  ModelToolCall,
  ToolCall,
  ToolCallId,
  TraceContext,
} from "../deps.js";
import {
  emitStreamingToolLedgerUpdate,
  requireRuntimeToolCallName,
  throwIfTurnAborted,
  toRecordInput,
} from "../helpers/index.js";
import type { AgentRuntimeInternal } from "../internal.js";
import type { StreamedToolExecutionResult } from "../types.js";
import { mcpToolPartMetadata } from "./tool-part-metadata.js";
import { persistPendingToolPart } from "./tool-part-persistence.js";
import {
  isAutomationMutationRestrictedTurn,
  isOffPeakCreateRestrictedTurn,
  type RegularTurnLoopState,
} from "./turn-loop-state.js";

export async function executeStreamingTool(
  runtime: AgentRuntimeInternal,
  state: RegularTurnLoopState,
  declaration: ModelToolCall,
  options: {
    assistantMessageId: MessageId;
    declarationIndex: number;
    model: Model;
    signal: AbortSignal;
    traceContext: TraceContext;
  },
): Promise<StreamedToolExecutionResult | undefined> {
  throwIfTurnAborted(state.turnAbortSignal);
  const toolName = requireRuntimeToolCallName(declaration, {
    logger: runtime.logger,
    model: options.model,
    source: "streamingToolCoordinator.executeDuringStream",
    traceContext: options.traceContext,
  });
  const tool: ToolCall = {
    id: declaration.id as ToolCallId,
    input: declaration.input,
    name: toolName,
  };
  const partID = createPartId();
  const input = toRecordInput(tool.input);
  const metadata = mcpToolPartMetadata(runtime.registry.getMetadata(toolName)?.mcpPresentation);
  await persistPendingToolPart(runtime, {
    assistantMessageId: options.assistantMessageId,
    declarationIndex: options.declarationIndex,
    input,
    partID,
    toolCall: tool,
    traceContext: options.traceContext,
    metadata,
    model: options.model,
  });
  await emitStreamingToolLedgerUpdate(runtime, state.events, options.traceContext, {
    assistantMessageId: options.assistantMessageId,
    toolCall: tool,
    status: "tool_call_closed",
    input,
    executionTiming: "during_stream",
  });
  const schedule = await runtime.scheduleTools([tool]);
  const scheduledEvents = await runtime.emitToolScheduledEvents(
    [tool],
    schedule,
    options.assistantMessageId,
    options.traceContext,
  );
  state.events.push(...scheduledEvents);
  await emitStreamingToolLedgerUpdate(runtime, state.events, options.traceContext, {
    assistantMessageId: options.assistantMessageId,
    toolCall: tool,
    status: "tool_queued",
    input,
    executionTiming: "during_stream",
  });
  const execution = await runtime.executeTools([tool], schedule, {
    subagentModelOverride: state.subagentModelOverride,
    model: state.model,
    automationTurn: isAutomationMutationRestrictedTurn(state),
    offPeakTurn: isOffPeakCreateRestrictedTurn(state),
    signal: options.signal,
    traceContext: options.traceContext,
    onBatchStart: async () => {
      const start = Date.now();
      await runtime.persistPart(
        {
          id: partID,
          sessionID: runtime.sessionId,
          messageID: options.assistantMessageId,
          type: "tool",
          callID: tool.id,
          declarationIndex: options.declarationIndex,
          tool: toolName,
          state: {
            status: "running",
            input,
            title: toolName,
            metadata: metadata ?? {},
            time: { start },
          },
        },
        options.traceContext,
      );
      await emitStreamingToolLedgerUpdate(runtime, state.events, options.traceContext, {
        assistantMessageId: options.assistantMessageId,
        toolCall: tool,
        status: "tool_started",
        input,
        startedAt: new Date(start),
        executionTiming: "during_stream",
      });
    },
  });
  state.events.push(...execution.events);
  const result = execution.results[0];
  if (!result) return undefined;
  return { input, ledgerRecorded: true, partID, result, toolCallId: tool.id as ToolCallId };
}
