import { createPartId, TurnMachineImpl } from "../deps.js";
import type {
  MessageId,
  ModelToolCall,
  ToolCall,
  ToolCallId,
  ToolExecutionResult,
  TraceContext,
} from "../deps.js";
import {
  createStreamRecoveryAnchorId,
  emitStreamRecoveryAnchor,
  emitStreamingToolLedgerUpdate,
  isErrorForToolResult,
  isTurnCancellationError,
  modelContentForToolResult,
  stringifyToolResultOutput,
  toRecordInput,
} from "../helpers/index.js";
import { persistToolResultMediaAttachments } from "../helpers/tool-result-media-persistence.js";
import type { RuntimeModelTextResult, StreamedToolExecutionResult } from "../types.js";
import type { AgentRuntimeInternal } from "../internal.js";
import { emitSyntheticStreamedToolError } from "./streaming-tool-synthetic-result.js";
import {
  persistPendingToolPart,
  projectToolNameForNonEmptyBoundary,
} from "./tool-part-persistence.js";
import { mcpToolPartMetadata } from "./tool-part-metadata.js";
import { persistToolModelStepFinish } from "./turn-step-finish.js";
import { drainInlineGuideForNextRequest } from "./turn-guide-drain.js";
import { handleToolCallAnomalyWarnings } from "./turn-tool-warnings.js";
import { emitNestedModelUsageEvents } from "./turn-nested-model-usage.js";
import type { RegularTurnLoopState } from "./turn-loop-state.js";
import {
  isAutomationMutationRestrictedTurn,
  isOffPeakCreateRestrictedTurn,
  recordCompletedToolBatch,
} from "./turn-loop-state.js";
import { recordToolUsageFromResult } from "./turn-tool-usage.js";
import { recordBrowserTurnToolResult } from "../../repl/browser-turn-state.js";
import { createRuntimeToolResultEntry } from "../../agent/message-history.js";
import { commitTurnRequestEntries } from "./turn-output-token-continuation.js";
import {
  completedToolBatchState,
  failedToolBatchState,
  runningToolBatchState,
  toolBatchResultDiagnostic,
} from "./turn-tool-batch-parts.js";
import type { ToolBatchPartFacts } from "./turn-tool-batch-parts.js";
import { steerToolBatchFollowUp } from "./turn-tool-batch-follow-up.js";

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
    id: call.id as ToolCallId,
    name: call.name,
    input: call.input,
  }));
  const streamed = new Map<string, StreamedToolExecutionResult>();
  for (const entry of options.streamedToolResults ?? []) streamed.set(entry.toolCallId, entry);
  const declared = new Map<string, ToolCall>();
  for (const call of toolCalls) declared.set(call.id, call);
  const parts = new Map<string, ToolBatchPartFacts>();
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
      toolCall,
      status: "tool_call_closed",
      ...(entry ? { executionTiming: "during_stream" as const } : {}),
      input: part.input,
    });
    if (entry)
      await emitSyntheticStreamedToolError(
        this,
        state.events,
        options.modelTraceContext,
        entry.result,
      );
  }
  const schedule = await this.scheduleTools(toolCalls);
  state.turnMachine = new TurnMachineImpl(
    state.turnMachine.scheduleTools(toolCalls, this.toScheduleState(schedule)),
  );
  const pending = toolCalls.filter((call) => !streamed.has(call.id));
  state.turnMachine = new TurnMachineImpl(state.turnMachine.startToolExecution());
  let pendingResults: ToolExecutionResult[] = [];
  if (pending.length > 0) {
    const pendingSchedule =
      pending.length === toolCalls.length ? schedule : await this.scheduleTools(pending);
    const scheduledEvents = await this.emitToolScheduledEvents(
      pending,
      pendingSchedule,
      options.assistantMessageId,
      options.modelTraceContext,
    );
    state.events.push(...scheduledEvents);
    for (const toolCall of pending) {
      await emitStreamingToolLedgerUpdate(this, state.events, options.modelTraceContext, {
        assistantMessageId: options.assistantMessageId,
        toolCall,
        status: "tool_queued",
        input: parts.get(toolCall.id)?.input,
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
      onBatchStart: async (ids: string[]) => {
        if (state.turnAbortSignal.aborted) return;
        for (const id of ids) {
          const call = declared.get(id);
          const part = parts.get(id);
          if (!call || !part) continue;
          part.startedAt = Date.now();
          const boundary = projectToolNameForNonEmptyBoundary(call.name);
          await this.persistPart(
            {
              id: part.partID,
              sessionID: this.sessionId,
              messageID: options.assistantMessageId,
              type: "tool",
              callID: call.id,
              declarationIndex: part.declarationIndex,
              tool: boundary.toolName,
              metadata: boundary.metadata,
              state: runningToolBatchState(this, call, part, boundary),
            },
            options.modelTraceContext,
          );
          await emitStreamingToolLedgerUpdate(this, state.events, options.modelTraceContext, {
            assistantMessageId: options.assistantMessageId,
            toolCall: call,
            status: "tool_started",
            input: part.input,
            startedAt: new Date(part.startedAt),
          });
        }
      },
    });
    pendingResults = execution.results;
    state.events.push(...execution.events);
  }
  const resultIndex = new Map<string, ToolExecutionResult>();
  for (const entry of streamed.values()) resultIndex.set(entry.result.toolCallId, entry.result);
  for (const result of pendingResults) resultIndex.set(result.toolCallId, result);
  const results: ToolExecutionResult[] = [];
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
    state.turnMachine = new TurnMachineImpl(
      state.turnMachine.completeTool(result.toolCallId as ToolCallId, {
        success: result.success,
        content: result.success
          ? modelContentForToolResult(result)
          : (result.error?.message ?? stringifyToolResultOutput(result)),
      }),
    );
  }
  state.turnMachine = new TurnMachineImpl(state.turnMachine.aggregateResults());
  this.logger?.debug("Tools executed", toolBatchResultDiagnostic(results));
  this.logger?.debug("Injecting tool results", { resultCount: results.length });
  let checkpointCancellation: unknown;
  for (const result of results) {
    await recordToolUsageFromResult(this, result, options.modelTraceContext);
    const output = stringifyToolResultOutput(result);
    const isError = isErrorForToolResult(result);
    const boundary = projectToolNameForNonEmptyBoundary(result.toolName);
    const part = parts.get(result.toolCallId);
    if (part) {
      if (result.success) {
        const media = await persistToolResultMediaAttachments({
          artifactStore: this.artifactStore,
          assistantMessageId: options.assistantMessageId,
          content: modelContentForToolResult(result),
          sessionId: this.sessionId,
          sessionStore: this.sessionStore,
          signal: state.turnAbortSignal,
          toolCallId: result.toolCallId,
          toolName: result.toolName,
          traceContext: options.modelTraceContext,
          turnId: state.turnId,
        });
        await this.persistPart(
          {
            id: part.partID,
            sessionID: this.sessionId,
            messageID: options.assistantMessageId,
            type: "tool",
            callID: result.toolCallId as ToolCallId,
            declarationIndex: part.declarationIndex,
            tool: boundary.toolName,
            metadata: boundary.metadata,
            state: completedToolBatchState(result, part, output, boundary, media),
          },
          options.modelTraceContext,
        );
      } else {
        await this.persistPart(
          {
            id: part.partID,
            sessionID: this.sessionId,
            messageID: options.assistantMessageId,
            type: "tool",
            callID: result.toolCallId as ToolCallId,
            declarationIndex: part.declarationIndex,
            tool: boundary.toolName,
            metadata: boundary.metadata,
            state: failedToolBatchState(this, result, part, output),
          },
          options.modelTraceContext,
        );
      }
    }
    this.logger?.debug("addToolResult", {
      toolCallId: result.toolCallId,
      toolName: result.toolName,
      success: result.success,
      contentLength: output.length,
    });
    commitTurnRequestEntries(this, state.turnRequestState, [
      createRuntimeToolResultEntry(
        result.toolCallId,
        result.toolName,
        modelContentForToolResult(result),
        isError,
      ),
    ]);
    try {
      await this.emitFileMutationCheckpoint({
        abortSignal: state.turnAbortSignal,
        events: state.events,
        messageId: state.userMessageId,
        result,
        toolMessageId: options.assistantMessageId,
        traceContext: options.modelTraceContext,
      });
    } catch (error) {
      if (!isTurnCancellationError(error, state.turnAbortSignal)) throw error;
      checkpointCancellation ??= error;
      continue;
    }
    const call = declared.get(result.toolCallId);
    if (call) {
      const recoveryAnchorId = createStreamRecoveryAnchorId(
        options.assistantMessageId,
        result.toolCallId as ToolCallId,
      );
      await emitStreamRecoveryAnchor(this, state.events, options.modelTraceContext, {
        assistantMessageId: options.assistantMessageId,
        toolCallId: result.toolCallId as ToolCallId,
        toolName: boundary.toolName,
        success: result.success,
        resultPartId: part?.partID,
        committedAt: result.completedAt,
      });
      await emitStreamingToolLedgerUpdate(this, state.events, options.modelTraceContext, {
        assistantMessageId: options.assistantMessageId,
        toolCall: call,
        status: "tool_result_committed",
        input: part?.input,
        startedAt: result.startedAt,
        committedAt: result.completedAt,
        resultPartId: part?.partID,
        recoveryAnchorId,
        executionTiming: streamed.has(result.toolCallId) ? "during_stream" : "end_of_stream",
      });
    }
    await steerToolBatchFollowUp(this, state, result, options.modelTraceContext);
  }
  if (checkpointCancellation) throw checkpointCancellation;
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
    if (state.activeTurn)
      await this.fallbackPendingGuidesToQueue({
        activeTurn: state.activeTurn,
        events: state.events,
        reasonCode: "guide.noToolBoundary",
        traceContext: state.turnTraceContext,
      });
    this.logger?.info("Tool result requested turn stop", {
      event: "tool.turn_control.stop",
      module: "core.runtime",
      reason: stopping.turnControl?.reason,
      status: "completed",
      toolCallId: stopping.toolCallId,
      toolName: stopping.toolName,
    });
    if (state.activeTurn) state.activeTurn.steerable = false;
    state.turnMachine = new TurnMachineImpl(
      state.turnMachine.complete(state.modelResponse, "success"),
    );
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
    count: this.messageHistory.getMessageCount(),
    reactiveCompactAttemptedInCurrentModelStep: state.reactiveCompactAttemptedInCurrentModelStep,
  });
  return "continue";
}
