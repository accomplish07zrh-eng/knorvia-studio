import { createPartId, traceContextToLogContext } from "../deps.js";
import type { MessageId, ModelToolCall, ToolCall, ToolCallId, TraceContext } from "../deps.js";
import {
  emitStreamingToolLedgerUpdate, modelContentForToolResult, toRecordInput,
} from "../helpers/index.js";
import type { RuntimeModelTextResult, StreamedToolExecutionResult } from "../types.js";
import type { AgentRuntimeInternal } from "../internal.js";
import { emitSyntheticStreamedToolError } from "./streaming-tool-synthetic-result.js";
import { persistPendingToolPart, projectToolNameForNonEmptyBoundary } from "./tool-part-persistence.js";
import { mcpToolPartMetadata } from "./tool-part-metadata.js";
import { persistToolModelStepFinish } from "./turn-step-finish.js";
import { drainInlineGuideForNextRequest } from "./turn-guide-drain.js";
import { handleToolCallAnomalyWarnings } from "./turn-tool-warnings.js";
import { emitNestedModelUsageEvents } from "./turn-nested-model-usage.js";
import type { RegularTurnLoopState } from "./turn-loop-state.js";
import {
  isAutomationMutationRestrictedTurn, isOffPeakCreateRestrictedTurn, recordCompletedToolBatch,
} from "./turn-loop-state.js";
import { recordBrowserTurnToolResult } from "../../repl/browser-turn-state.js";
import { publishToolBatchResults } from "./turn-tool-batch-publication.js";

export interface ToolBatchPartFacts {
  declarationIndex: number;
  partID: ReturnType<typeof createPartId>;
  input: Record<string, unknown>;
  startedAt: number;
}

export async function executeToolCallsForModelStep(
  this: AgentRuntimeInternal,
  state: RegularTurnLoopState,
  options: {
    assistantCreatedAt: number;
    assistantMessageId: MessageId;
    modelTraceContext: TraceContext;
    result: RuntimeModelTextResult;
    streamedToolResults?: StreamedToolExecutionResult[];
    toolCalls: ModelToolCall[];
  },
): Promise<"continue" | "break"> {
  const model = state.model;
  if (!model) throw new Error("Model-backed tool execution requires the loop Model");
  const providerId = model.providerId;
  const modelId = model.modelId;
  const toolCalls: ToolCall[] = options.toolCalls.map((call) => ({
    id: call.id,
    name: call.name,
    input: call.input,
  }));
  const streamed = new Map<ToolCallId, StreamedToolExecutionResult>();
  for (const entry of options.streamedToolResults ?? []) streamed.set(entry.toolCallId, entry);
  const declared = new Map<ToolCallId, ToolCall>();
  for (const call of toolCalls) declared.set(call.id, call);
  const parts = new Map<ToolCallId, ToolBatchPartFacts>();
  for (let declarationIndex = 0; declarationIndex < toolCalls.length; declarationIndex++) {
    const toolCall = toolCalls[declarationIndex];
    const entry = streamed.get(toolCall.id);
    const part = {
      declarationIndex,
      partID: entry ? entry.partID : createPartId(),
      input: entry ? entry.input : toRecordInput(toolCall.input),
      startedAt: entry ? entry.result.startedAt.getTime() : Date.now(),
    };
    parts.set(toolCall.id, part);
    if (entry && entry.ledgerRecorded !== false) continue;
    await persistPendingToolPart(this, {
      assistantMessageId: options.assistantMessageId,
      declarationIndex,
      input: part.input,
      partID: part.partID,
      toolCall,
      traceContext: options.modelTraceContext,
      model,
      metadata: mcpToolPartMetadata(this.registry.getMetadata(toolCall.name)?.mcpPresentation),
    });
    await emitStreamingToolLedgerUpdate(this, state.events, options.modelTraceContext, {
      assistantMessageId: options.assistantMessageId,
      event: "tool_call_closed",
      toolCall,
      input: part.input,
      startedAt: new Date(part.startedAt),
      resultPartId: part.partID,
      executionTiming: entry ? "during_stream" : "end_of_stream",
      providerId,
      modelId,
    });
    if (entry) {
      await emitSyntheticStreamedToolError(this, state.events, options.modelTraceContext, entry.result);
    }
  }
  const schedule = await this.scheduleTools(toolCalls);
  state.turnMachine.schedule(this.toScheduleState(schedule));
  const pending = toolCalls.filter((call) => !streamed.has(call.id));
  state.turnMachine.startToolExecution();
  let pendingResults: StreamedToolExecutionResult["result"][] = [];
  if (pending.length > 0) {
    const pendingSchedule = pending.length === toolCalls.length
      ? schedule : await this.scheduleTools(pending);
    const scheduledEvents = await this.emitToolScheduledEvents(
      pending, pendingSchedule, options.assistantMessageId, options.modelTraceContext,
    );
    state.events.push(...scheduledEvents);
    for (const toolCall of pending) {
      const part = parts.get(toolCall.id)!;
      await emitStreamingToolLedgerUpdate(this, state.events, options.modelTraceContext, {
        assistantMessageId: options.assistantMessageId,
        event: "tool_queued",
        toolCall,
        input: part.input,
        startedAt: new Date(part.startedAt),
        resultPartId: part.partID,
        executionTiming: "end_of_stream",
        providerId,
        modelId,
      });
    }
    this.logger?.debug("Executing tools", {
      streamedToolCallCount: streamed.size,
      toolCallCount: pending.length,
      tools: pending.map((call) => call.name),
    });
    const execution = await this.executeTools(pending, pendingSchedule, {
      automationTurn: isAutomationMutationRestrictedTurn(state),
      offPeakTurn: isOffPeakCreateRestrictedTurn(state),
      signal: state.turnAbortSignal,
      traceContext: options.modelTraceContext,
      subagentModelOverride: state.subagentModelOverride,
      model,
      onBatchStart: async (ids: ToolCallId[]) => {
        if (state.turnAbortSignal.aborted) return;
        for (const id of ids) {
          const call = declared.get(id);
          const part = parts.get(id);
          if (!call || !part) continue;
          part.startedAt = Date.now();
          const boundary = projectToolNameForNonEmptyBoundary(call.name);
          await this.persistPart({
            id: part.partID,
            sessionID: this.sessionId,
            messageID: options.assistantMessageId,
            type: "tool",
            callID: id,
            declarationIndex: part.declarationIndex,
            tool: boundary.toolName,
            metadata: boundary.metadata,
            state: {
              status: "running",
              input: part.input,
              title: call.name,
              metadata: mcpToolPartMetadata(this.registry.getMetadata(call.name)?.mcpPresentation) ?? {},
              time: { start: part.startedAt },
            },
          }, options.modelTraceContext);
          await emitStreamingToolLedgerUpdate(this, state.events, options.modelTraceContext, {
            assistantMessageId: options.assistantMessageId,
            event: "tool_started",
            toolCall: call,
            input: part.input,
            startedAt: new Date(part.startedAt),
            resultPartId: part.partID,
            executionTiming: "end_of_stream",
            providerId,
            modelId,
          });
        }
      },
    });
    pendingResults = execution.results;
    state.events.push(...execution.events);
  }
  const resultIndex = new Map<ToolCallId, StreamedToolExecutionResult["result"]>();
  for (const [id, entry] of streamed) resultIndex.set(id, entry.result);
  for (const result of pendingResults) resultIndex.set(result.toolCallId, result);
  const results: StreamedToolExecutionResult["result"][] = [];
  for (const call of toolCalls) {
    const result = resultIndex.get(call.id);
    if (result) results.push(result);
  }
  for (const result of results) {
    recordBrowserTurnToolResult({
      output: result.output,
      sessionId: this.sessionId,
      toolName: result.toolName,
      turnId: state.turnId,
    });
  }
  await emitNestedModelUsageEvents(this, {
    events: state.events,
    results,
    traceContext: options.modelTraceContext,
  });
  for (const result of results) {
    state.turnMachine.completeTool(result.toolCallId, result.success
      ? modelContentForToolResult(result)
      : result.error?.message ?? String(result.output));
  }
  state.turnMachine.aggregateToolResults();
  this.logger?.debug("Tools executed", {
    resultCount: results.length,
    results: results.map((result) => ({
      toolCallId: result.toolCallId,
      toolName: result.toolName,
      success: result.success,
      output: typeof result.output === "string" ? result.output.slice(0, 50) : "[object]",
    })),
  });
  this.logger?.debug("Injecting tool results", { resultCount: results.length });
  await publishToolBatchResults(this, state, {
    assistantMessageId: options.assistantMessageId,
    modelTraceContext: options.modelTraceContext,
    results,
    parts,
    declared,
    streamed,
    providerId,
    modelId,
  });
  const stopping = results.find((result) => result.turnControl?.stopTurnAfterResult === true);
  if (stopping) {
    await persistToolModelStepFinish(this, state, options);
    if (stopping.turnControl?.reason === "automation_create_limit") {
      state.automationCreateLimitReached = true;
      recordCompletedToolBatch(state);
      this.logger?.info("Automation create limit switched turn to text-only response", {
        event: "automation.create_limit.text_only_continuation",
        module: "core.runtime",
        reason: stopping.turnControl.reason,
        status: "completed",
        toolCallId: stopping.toolCallId,
        toolName: stopping.toolName,
      });
      return "continue";
    }
    if (state.activeTurn) {
      await this.fallbackPendingGuidesToQueue({
        activeTurn: state.activeTurn,
        events: state.events,
        reasonCode: "guide.noToolBoundary",
        traceContext: state.turnTraceContext,
      });
    }
    this.logger?.info("Tool result requested turn stop", {
      event: "tool.turn_control.stop",
      module: "core.runtime",
      reason: stopping.turnControl?.reason,
      status: "completed",
      toolCallId: stopping.toolCallId,
      toolName: stopping.toolName,
    });
    if (state.activeTurn) state.activeTurn.steerable = false;
    state.turnMachine.complete(state.modelResponse, "success");
    return "break";
  }
  await handleToolCallAnomalyWarnings(this, state, {
    modelTraceContext: options.modelTraceContext,
    toolCalls: options.toolCalls,
  });
  await persistToolModelStepFinish(this, state, options);
  await drainInlineGuideForNextRequest(this, state);
  recordCompletedToolBatch(state);
  this.logger?.debug("After inject, message count", {
    compactToolTurnsSinceLastCompact: state.compactTracking?.toolTurnsSinceCompact,
    count: this.messageHistory.getMessages().length,
    reactiveCompactAttemptedInCurrentModelStep: state.reactiveCompactAttemptedInCurrentModelStep,
  });
  return "continue";
}
