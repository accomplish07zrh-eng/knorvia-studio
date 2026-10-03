import { traceContextToLogContext } from "../deps.js";
import type { ModelReasoningContentBlock, ModelToolCall, ToolCallId } from "../deps.js";
import {
  buildSuspiciousEmptyDiagnostics,
  finalizeSuspiciousEmptyModelResult,
  isContextExceededFinishReason,
  isSuspiciousEmptyModelResult,
  readRawFinishReason,
} from "../helpers/index.js";
import type { AgentRuntimeInternal } from "../internal.js";
import type { RunModelTextRequestOptions, RuntimeModelTextResult } from "../types.js";
import { createModelStreamingEventQueue } from "./model-streaming-event-queue.js";
import { isOutputTokenLimitFinishReason } from "./turn-output-token-continuation.js";

export function createModelRequestStreamState(
  runtime: AgentRuntimeInternal,
  options: RunModelTextRequestOptions,
) {
  const reasoning: ModelReasoningContentBlock[] = [];
  const reasoningById = new Map<string, ModelReasoningContentBlock>();
  const toolCalls: ModelToolCall[] = [];
  const finalToolCallIds = new Set<string>();
  const toolInputBuffers = new Map<string, string>();
  const queue = createModelStreamingEventQueue({
    events: options.events,
    runtime,
    traceContext: options.traceContext,
  });
  const enqueue = async (payload: Parameters<typeof queue.enqueue>[0]) => {
    queue.enqueue(payload);
    await queue.maybeApplyBackpressure();
  };
  const enqueueTerminal = async (payload: Parameters<typeof queue.enqueue>[0]) => {
    queue.enqueue(payload);
    await queue.drain();
  };
  const flushToolInput = async (toolCallId: string) => {
    const delta = toolInputBuffers.get(toolCallId);
    if (!delta) return;
    toolInputBuffers.delete(toolCallId);
    runtime.logger?.debug("Model streaming tool input delta flushed", {
      ...traceContextToLogContext(options.traceContext),
      deltaLength: delta.length,
      event: "model.streaming.tool_input_delta.flush",
      module: "core.runtime",
      toolCallId,
    });
    await enqueue({
      assistantMessageId: options.assistantMessageId,
      delta,
      done: false,
      kind: "tool_input_delta",
      toolCallId: toolCallId as ToolCallId,
    });
  };
  const bufferToolInput = async (toolCallId: string, delta: string) => {
    if (!delta) return;
    const buffered = (toolInputBuffers.get(toolCallId) ?? "") + delta;
    toolInputBuffers.set(toolCallId, buffered);
    if (
      buffered.includes("\n") ||
      buffered.includes("\r") ||
      buffered.includes("\\n") ||
      buffered.includes("\\r") ||
      buffered.length >= 4096
    ) {
      await flushToolInput(toolCallId);
    }
  };
  const flushAllToolInputs = async () => {
    const ids = [...toolInputBuffers.keys()];
    for (const id of ids) await flushToolInput(id);
  };
  return {
    queue,
    reasoning,
    reasoningById,
    toolCalls,
    finalToolCallIds,
    toolInputBuffers,
    enqueue,
    enqueueTerminal,
    flushToolInput,
    bufferToolInput,
    flushAllToolInputs,
  };
}

type ModelRequestStreamResult = Pick<
  RuntimeModelTextResult,
  "finishReason" | "providerMetadata" | "usage" | "text"
> & { toolCalls: ModelToolCall[] };

export function inspectModelRequestStreamResult(
  runtime: AgentRuntimeInternal,
  result: ModelRequestStreamResult,
  modelSelection: { providerId: string; modelId: string },
  traceContext: RunModelTextRequestOptions["traceContext"],
): void {
  const { finishReason, providerMetadata, usage, text, toolCalls } = result;
  const rawFinishReason = readRawFinishReason(providerMetadata);
  const outputTokenLimit = isOutputTokenLimitFinishReason(finishReason, rawFinishReason);
  const contextExceeded =
    toolCalls.length === 0 &&
    !outputTokenLimit &&
    isContextExceededFinishReason(finishReason, rawFinishReason);
  if (contextExceeded) {
    runtime.logger?.warn("Model stream ended with provider context overflow", {
      ...traceContextToLogContext(traceContext),
      event: "model.runtime.stream.context_exceeded",
      finishReason,
      module: "core.runtime",
      modelProviderId: modelSelection.providerId,
      modelId: modelSelection.modelId,
      rawFinishReason,
      textLength: text.length,
      toolCallCount: toolCalls.length,
    });
  } else if (
    !outputTokenLimit &&
    isSuspiciousEmptyModelResult(finishReason, text.length, toolCalls.length, usage)
  ) {
    runtime.logger?.warn("Model stream ended with suspicious empty completion", {
      ...traceContextToLogContext(traceContext),
      event: "model.runtime.stream.suspicious_empty",
      module: "core.runtime",
      modelProviderId: modelSelection.providerId,
      modelId: modelSelection.modelId,
      textLength: text.length,
      toolCallCount: toolCalls.length,
      ...buildSuspiciousEmptyDiagnostics({ finishReason, providerMetadata, rawFinishReason }),
    });
    finalizeSuspiciousEmptyModelResult({
      finishReason,
      model: modelSelection,
      providerMetadata,
      rawFinishReason,
    });
  }
}
