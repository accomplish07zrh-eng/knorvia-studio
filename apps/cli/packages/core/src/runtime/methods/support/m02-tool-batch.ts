// SPDX-License-Identifier: Apache-2.0
// 工具批：按声明序落账，按声明序收口。执行可以并行，记录不能。
import { createRuntimeToolResultEntry } from "../../../agent/message-history.js";
import { recordBrowserTurnToolResult } from "../../../repl/browser-turn-state.js";
import {
  TurnMachineImpl,
  createPartId,
  type MessageId,
  type ModelToolCall,
  type ToolCall,
  type ToolCallId,
  type ToolExecutionResult,
  type TraceContext,
} from "../../deps.js";
import {
  createStreamRecoveryAnchorId,
  emitStreamRecoveryAnchor,
  emitStreamingToolLedgerUpdate,
  isErrorForToolResult,
  isTurnCancellationError,
  modelContentForToolResult,
  stringifyToolResultOutput,
  toRecordInput,
} from "../../helpers/index.js";
import { persistToolResultMediaAttachments } from "../../helpers/tool-result-media-persistence.js";
import type { AgentRuntimeInternal } from "../../internal.js";
import type { RuntimeModelTextResult, StreamedToolExecutionResult } from "../../types.js";
import { emitSyntheticStreamedToolError } from "../streaming-tool-synthetic-result.js";
import { commitTurnRequestEntries } from "./m02-continuation.js";
import { drainInlineGuideForNextRequest } from "./m02-guide.js";
import {
  isAutomationMutationRestrictedTurn,
  isOffPeakCreateRestrictedTurn,
  recordCompletedToolBatch,
  type RegularTurnLoopState,
} from "./m02-loop-state.js";
import { phrase, report } from "./m02-record.js";
import { persistToolModelStepFinish } from "./m02-step-finish.js";
import {
  completedToolBatchState,
  failedToolBatchState,
  mcpToolPartMetadata,
  persistPendingToolPart,
  projectToolNameForNonEmptyBoundary,
  recordToolUsageFromResult,
  runningToolBatchState,
  steerToolBatchFollowUp,
  toolBatchResultDiagnostic,
  handleToolCallAnomalyWarnings,
  emitNestedModelUsageEvents,
  type ToolBatchPartFacts,
} from "./m02-tool-parts.js";

const MISSING_MODEL = phrase(["Model-backed tool execution ", "requires the loop Model"]);

function adopt<T>(state: RegularTurnLoopState, next: T): void {
  state.turnMachine = new TurnMachineImpl(next as never);
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
  if (!model) throw new Error(MISSING_MODEL);
  // 调度 await 之前先读归因字段；执行端口稍后才读当前 loop handle。
  const seenProvider = model.providerId;
  const seenModel = model.modelId;
  void seenProvider;
  void seenModel;

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

  for (let declarationIndex = 0; declarationIndex < toolCalls.length; declarationIndex += 1) {
    const toolCall = toolCalls[declarationIndex]!;
    const entry = streamed.get(toolCall.id);
    const part: ToolBatchPartFacts = {
      declarationIndex,
      partID: entry ? entry.partID : createPartId(),
      input: entry ? entry.input : toRecordInput(toolCall.input),
      startedAt: entry ? entry.result.startedAt.getTime() : Date.now(),
    };
    parts.set(toolCall.id, part);
    if (entry && entry.ledgerRecorded !== false) continue;
    const presentation = this.registry.getMetadata(toolCall.name)?.mcpPresentation;
    await persistPendingToolPart(this, {
      assistantMessageId: options.assistantMessageId,
      declarationIndex,
      input: part.input,
      partID: part.partID,
      toolCall,
      traceContext: options.modelTraceContext,
      model,
      metadata: mcpToolPartMetadata(presentation),
    });
    await emitStreamingToolLedgerUpdate(this, state.events, options.modelTraceContext, {
      assistantMessageId: options.assistantMessageId,
      toolCall,
      status: "tool_call_closed",
      ...(entry ? { executionTiming: "during_stream" as const } : {}),
      input: part.input,
    });
    if (entry) {
      await emitSyntheticStreamedToolError(this, state.events, options.modelTraceContext, entry.result);
    }
  }

  const schedule = await this.scheduleTools(toolCalls);
  adopt(state, state.turnMachine.scheduleTools(toolCalls, this.toScheduleState(schedule)));
  const pending = toolCalls.filter((call) => !streamed.has(call.id));
  adopt(state, state.turnMachine.startToolExecution());

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
    report(this, "debug", phrase(["Executing ", "tools"]), {
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
      model: state.model,
      onBatchStart: async (ids: string[]) => {
        if (state.turnAbortSignal?.aborted) return;
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

  const byCall = new Map<string, ToolExecutionResult>();
  for (const entry of streamed.values()) byCall.set(entry.result.toolCallId, entry.result);
  for (const result of pendingResults) byCall.set(result.toolCallId, result);
  const results: ToolExecutionResult[] = [];
  for (const call of toolCalls) {
    const result = byCall.get(call.id);
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
    const content = result.success
      ? modelContentForToolResult(result)
      : (result.error?.message ?? stringifyToolResultOutput(result));
    adopt(state, state.turnMachine.completeTool(result.toolCallId as ToolCallId, {
      success: result.success,
      content,
    }));
  }
  adopt(state, state.turnMachine.aggregateResults());
  report(this, "debug", phrase(["Tools ", "executed"]), toolBatchResultDiagnostic(results));
  report(this, "debug", phrase(["Injecting ", "tool results"]), { resultCount: results.length });

  let checkpointCancellation: unknown;
  for (const result of results) {
    await recordToolUsageFromResult(this, result, options.modelTraceContext);
    const output = stringifyToolResultOutput(result);
    const isError = isErrorForToolResult(result);
    const boundary = projectToolNameForNonEmptyBoundary(result.toolName);
    const part = parts.get(result.toolCallId);
    if (part) {
      const media = result.success
        ? await persistToolResultMediaAttachments({
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
          })
        : undefined;
      // 媒体端口可能改 result，终态要在这次读取时再判一次。
      const succeeded = result.success;
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
          state: succeeded
            ? completedToolBatchState(result, part, output, boundary, media)
            : failedToolBatchState(this, result, part, output),
        },
        options.modelTraceContext,
      );
    }
    report(this, "debug", "addToolResult", {
      toolCallId: result.toolCallId,
      toolName: result.toolName,
      success: result.success,
      contentLength: output.length,
    });
    commitTurnRequestEntries(this, state.turnRequestState, [
      createRuntimeToolResultEntry(result.toolCallId, result.toolName, modelContentForToolResult(result), isError),
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
      if (checkpointCancellation === undefined) checkpointCancellation = error;
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
      report(this, "info", phrase(["Automation create limit switched turn ", "to text-only response"]), {
        event: phrase(["automation.create_limit.", "text_only_continuation"]),
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
        reasonCode: phrase(["guide.", "noToolBoundary"]) as "guide.noToolBoundary",
        traceContext: state.turnTraceContext,
      });
    }
    report(this, "info", phrase(["Tool result ", "requested turn stop"]), {
      event: phrase(["tool.turn_control.", "stop"]),
      module: "core.runtime",
      reason: stopping.turnControl?.reason,
      status: "completed",
      toolCallId: stopping.toolCallId,
      toolName: stopping.toolName,
    });
    if (state.activeTurn) state.activeTurn.steerable = false;
    adopt(state, state.turnMachine.complete(state.modelResponse, "success"));
    return "break";
  }

  await handleToolCallAnomalyWarnings(this, state, {
    modelTraceContext: options.modelTraceContext,
    toolCalls: options.toolCalls,
  });
  await persistToolModelStepFinish(this, state, options);
  await drainInlineGuideForNextRequest(this, state);
  recordCompletedToolBatch(state);
  report(this, "debug", phrase(["After inject, ", "message count"]), {
    compactToolTurnsSinceLastCompact: state.compactTracking?.toolTurnsSinceCompact,
    count: this.messageHistory.getMessageCount(),
    reactiveCompactAttemptedInCurrentModelStep: state.reactiveCompactAttemptedInCurrentModelStep,
  });
  return "continue";
}
