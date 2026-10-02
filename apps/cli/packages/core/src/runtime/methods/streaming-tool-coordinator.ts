import { TurnMachineImpl } from "../deps.js";
import type { MessageId, Model, ModelToolCall, ToolCallId, TraceContext } from "../deps.js";
import { emitStreamingToolLedgerUpdate } from "../helpers/index.js";
import type { AgentRuntimeInternal } from "../internal.js";
import type { StreamedToolExecutionResult } from "../types.js";
import { createRuntimeAssistantEntry } from "../../agent/message-history.js";
import {
  beginStreamRecoveryAttempt,
  emitStreamRecoveryRetryEvents,
  emitStreamRecoveryStarted,
  hasStreamRecoveryBudget,
  recoverPartialAssistantOutputFailure,
} from "./streaming-recovery.js";
import { createSyntheticStreamedToolResult } from "./streaming-tool-synthetic-result.js";
import { executeStreamingTool } from "./streaming-tool-execution.js";
import { recordModelHistoryRound, type RegularTurnLoopState } from "./turn-loop-state.js";
import { commitTurnRequestEntries } from "./turn-output-token-continuation.js";
import { executeToolCallsForModelStep } from "./turn-tools.js";

const STREAMING_TOOL_CANCEL_DRAIN_TIMEOUT_MS = 250;
const STREAMING_TOOL_EXECUTION_MODE = "readOnly";

interface StreamingToolCoordinator {
  accept(toolCall: ModelToolCall): void;
  abandon(reason: "cancelled" | "model_failed"): Promise<void>;
  drain(toolCalls: readonly ModelToolCall[]): Promise<StreamedToolExecutionResult[]>;
  recordReasoningDelta(text: string): void;
  recordTextDelta(text: string): void;
  recoverFromModelFailure(
    error: unknown,
    assistantCreatedAt: number,
    options?: { failedRequestId?: string },
  ): Promise<boolean>;
}

function permitsStreamingLaunch(runtime: AgentRuntimeInternal, toolCall: ModelToolCall) {
  if (toolCall.providerExecuted) return false;
  if (!toolCall.name.trim()) return false;
  if (runtime.config.modelStreaming !== "on") return false;
  if ((runtime.config.streamingToolExecution ?? STREAMING_TOOL_EXECUTION_MODE) === "off")
    return false;
  const entry = runtime.registry.get(toolCall.name);
  if (!entry) return false;
  const metadata = entry.metadata;
  const scope = entry.permission?.sideEffectScope ?? metadata.sideEffectScope;
  const requiresUserInteraction = entry.requiresUserInteraction ?? metadata.requiresUserInteraction;
  return (
    metadata.readOnly &&
    metadata.concurrentSafe &&
    !metadata.destructive &&
    !metadata.needsApproval &&
    !requiresUserInteraction &&
    scope === "none"
  );
}

async function raceWithTimeout<T>(
  operation: Promise<T>,
  milliseconds: number,
): Promise<T | undefined> {
  let timeout: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      operation,
      new Promise<undefined>((resolve) => {
        timeout = setTimeout(() => resolve(undefined), milliseconds);
      }),
    ]);
  } finally {
    if (timeout) clearTimeout(timeout);
  }
}

export function createStreamingToolCoordinator(
  runtime: AgentRuntimeInternal,
  state: RegularTurnLoopState,
  options: {
    assistantMessageId: MessageId;
    model: Model;
    traceContext: TraceContext;
  },
): StreamingToolCoordinator {
  const declarations = new Map<string, ModelToolCall>();
  const executions = new Map<string, Promise<StreamedToolExecutionResult | undefined>>();
  const abortController = new AbortController();
  const turnAbortListener = () => abortController.abort();
  state.turnAbortSignal.addEventListener("abort", turnAbortListener, { once: true });
  let discardedReasoningBytes = 0;
  let discardedTextBytes = 0;

  return {
    accept(toolCall) {
      const declaration = { ...toolCall };
      if (declaration.providerExecuted) return;
      declarations.set(declaration.id, declaration);
      if (!permitsStreamingLaunch(runtime, declaration)) return;
      if (executions.has(declaration.id)) return;
      const execution = executeStreamingTool(runtime, state, declaration, {
        declarationIndex: declarations.size - 1,
        assistantMessageId: options.assistantMessageId,
        model: options.model,
        traceContext: options.traceContext,
        signal: abortController.signal,
      }).catch(async (error: unknown) => {
        runtime.logger?.warn("Streaming tool execution fell back to end-of-stream execution", {
          error: error instanceof Error ? error.message : String(error),
          event: "tool.streaming.execution_failed",
          module: "core.runtime",
          status: "failed",
          toolCallId: declaration.id,
          toolName: declaration.name,
        });
        return undefined;
      });
      executions.set(declaration.id, execution);
    },

    async abandon(reason) {
      abortController.abort();
      const status = reason === "cancelled" ? "tool_cancelled" : "tool_abandoned";
      await Promise.all(
        Array.from(declarations.values()).map((declaration) =>
          emitStreamingToolLedgerUpdate(runtime, state.events, options.traceContext, {
            assistantMessageId: options.assistantMessageId,
            toolCall: {
              id: declaration.id as ToolCallId,
              input: declaration.input,
              name: declaration.name,
            },
            status,
            executionTiming: "during_stream",
            blockedReason: reason,
          }),
        ),
      );
      await raceWithTimeout(
        Promise.allSettled(executions.values()),
        STREAMING_TOOL_CANCEL_DRAIN_TIMEOUT_MS,
      );
      state.turnAbortSignal.removeEventListener("abort", turnAbortListener);
    },

    async drain(toolCalls) {
      const results: StreamedToolExecutionResult[] = [];
      for (const toolCall of toolCalls) {
        const execution = executions.get(toolCall.id);
        if (!execution) continue;
        const result = await execution;
        if (result) results.push(result);
      }
      state.turnAbortSignal.removeEventListener("abort", turnAbortListener);
      return results;
    },

    recordReasoningDelta(text) {
      discardedReasoningBytes += new TextEncoder().encode(text).byteLength;
    },

    recordTextDelta(text) {
      discardedTextBytes += new TextEncoder().encode(text).byteLength;
    },

    async recoverFromModelFailure(error, assistantCreatedAt, recoveryOptions = {}) {
      if (state.turnAbortSignal.aborted || !hasStreamRecoveryBudget(state)) return false;
      const recoveryEventOptions = {
        ...options,
        ...(recoveryOptions.failedRequestId
          ? { failedRequestId: recoveryOptions.failedRequestId }
          : {}),
      };
      if (declarations.size === 0) {
        return recoverPartialAssistantOutputFailure({
          abortController,
          assistantCreatedAt,
          discardedReasoningBytes,
          discardedTextBytes,
          error,
          options: recoveryEventOptions,
          runtime,
          state,
          turnAbortListener,
        });
      }

      abortController.abort();
      const recoveryAttempt = beginStreamRecoveryAttempt(state);
      const toolCalls = Array.from(declarations.values());
      const completedResults = await collectSettledExecutions(executions, toolCalls);
      const completedById = new Map(completedResults.map((result) => [result.toolCallId, result]));
      const streamedToolResults = toolCalls.map(
        (toolCall) =>
          completedById.get(toolCall.id as ToolCallId) ??
          createSyntheticStreamedToolResult(
            toolCall,
            executions.has(toolCall.id) ? "unknown_execution_state" : "not_executed",
          ),
      );
      await emitStreamRecoveryStarted(runtime, state, recoveryEventOptions, error, recoveryAttempt);
      state.modelResponse = "";
      state.modelStepCount += 1;
      recordModelHistoryRound(state);
      state.toolCallCount += streamedToolResults.length;
      commitTurnRequestEntries(runtime, state.turnRequestState, [
        createRuntimeAssistantEntry("", toolCalls, undefined, options.model),
      ]);
      state.turnMachine = new TurnMachineImpl(state.turnMachine.receiveModelResponse(""));
      await executeToolCallsForModelStep.call(runtime, state, {
        assistantCreatedAt,
        assistantMessageId: options.assistantMessageId,
        modelTraceContext: options.traceContext,
        result: {
          finishReason: "tool-calls",
          providerMetadata: { recoveredFromStreamFailure: true },
          text: "",
          toolCalls,
          usage: {},
        },
        streamedToolResults,
        toolCalls,
      });
      await emitStreamRecoveryRetryEvents(runtime, state, recoveryEventOptions, {
        ...recoveryAttempt,
        discardedReasoningBytes,
        discardedTextBytes,
        reason: "latest_committed_tool_result",
        toolCallIds: streamedToolResults.map((result) => result.toolCallId),
      });
      state.turnAbortSignal.removeEventListener("abort", turnAbortListener);
      return true;
    },
  };
}

// 保留 collection 的 async settlement owner；避免改变 recovery publication 的微任务边界。
async function collectSettledExecutions(
  executions: Map<string, Promise<StreamedToolExecutionResult | undefined>>,
  toolCalls: readonly ModelToolCall[],
): Promise<StreamedToolExecutionResult[]> {
  const settled = await Promise.all(
    toolCalls.map((toolCall) => {
      const execution = executions.get(toolCall.id);
      if (!execution) return undefined;
      return raceWithTimeout(
        execution.catch(() => undefined),
        STREAMING_TOOL_CANCEL_DRAIN_TIMEOUT_MS,
      );
    }),
  );
  return settled.filter((result): result is StreamedToolExecutionResult => result !== undefined);
}
