import { beginLocalTurnPreparation } from "@knorvia/contracts";
import { runWithModelInvocationContext, traceContextToLogContext } from "../deps.js";
import type { ModelReasoningContentBlock, ModelToolCall, ModelUsage, ToolCallId } from "../deps.js";
import {
  buildSuspiciousEmptyDiagnostics,
  finalizeSuspiciousEmptyModelResult,
  isContextExceededFinishReason,
  isSuspiciousEmptyModelResult,
  logModelRequestMediaSummary,
  logMediaBudgetProjection,
  logMediaCapabilityProjection,
  normalizeStreamError,
  normalizeModelToolCallsForRuntime,
  projectMessagesWithMediaAttachmentPaths,
  projectMessagesForInputFormat,
  projectMessagesForMediaBudget,
  readRawFinishReason,
} from "../helpers/index.js";
import type { RunModelTextRequestOptions, RuntimeModelTextResult } from "../types.js";
import type { AgentRuntimeInternal } from "../internal.js";
import { modelRequestTokenLimitLogContext } from "./model-token-limits.js";
import { createModelStreamingEventQueue } from "./model-streaming-event-queue.js";
import { getOrCreateReasoningBlock } from "./reasoning-stream.js";
import { createRefreshRuntimeHeadersBeforeModelAttempt } from "./model-runtime-headers.js";
import { resolveModelRequestSessionTypeFromTaskType } from "./model-request-session-type.js";
import { isOutputTokenLimitFinishReason } from "./turn-output-token-continuation.js";

export async function runModelTextRequest(
  this: AgentRuntimeInternal,
  options: RunModelTextRequestOptions,
): Promise<RuntimeModelTextResult> {
  const completeAssembly = beginLocalTurnPreparation(options.traceContext, "request_assembly");
  const model = options.model;
  const modelSelection = { providerId: model.providerId, modelId: model.modelId };
  const pathMessages = await projectMessagesWithMediaAttachmentPaths(
    options.messages,
    this.artifactStore,
  );
  const capabilityProjection = projectMessagesForInputFormat(pathMessages, model.inputFormat);
  logMediaCapabilityProjection(this.logger, options.traceContext, capabilityProjection, {
    event: "model.request.media_capability_projection",
    message: "Model request media capability projection",
    model: modelSelection.modelId,
  });
  const mediaProjection = projectMessagesForMediaBudget(capabilityProjection.messages, {
    latestRealUserMessageIndex: options.latestRealUserMessageIndex,
  });
  logMediaBudgetProjection(this.logger, options.traceContext, mediaProjection, {
    event: "model.request.media_projection",
    message: "Model request media budget projection",
  });
  const projectedOptions = mediaProjection.messages === options.messages
    ? options
    : { ...options, messages: mediaProjection.messages };
  const traceContext = projectedOptions.traceContext;
  logModelRequestMediaSummary(this.logger, traceContext, {
    incomingMessages: options.messages,
    mediaProjection,
    providerMessages: projectedOptions.messages,
  });
  const streamRecovery = projectedOptions.streamRecovery;
  const retryNumber = streamRecovery?.retryNumber;
  const invocationContext = {
    metadata: traceContextToLogContext(traceContext),
    modelRequestSessionType: resolveModelRequestSessionTypeFromTaskType(this.config.taskType),
    modelCall: {
      actorKind: this.agentTelemetry.actorKind,
      operation: "agent_step" as const,
      operationId: traceContext.spanId,
      ...(streamRecovery ? {
        callCause: "recovery" as const,
        attributes: { streamRecoveryNumber: retryNumber },
      } : {}),
    },
    statusSink: this.createModelStatusSink(traceContext, projectedOptions.events, {
      onStatus: projectedOptions.onModelNetworkStatus,
      streamRecovery,
    }),
    traceContext,
    refreshRuntimeHeadersBeforeAttempt: createRefreshRuntimeHeadersBeforeModelAttempt(this, {
      abortSignal: projectedOptions.abortSignal,
      model,
      traceContext,
    }),
    streamIdleTimeoutRetryNumber: retryNumber,
    streamRecovery,
  };
  const request = {
    messages: projectedOptions.messages,
    tools: projectedOptions.tools,
    abortSignal: projectedOptions.abortSignal,
    ...(projectedOptions.maxOutputTokens !== undefined
      ? { options: { maxOutputTokens: projectedOptions.maxOutputTokens } }
      : {}),
  };
  this.logger?.debug("Model request token limits", modelRequestTokenLimitLogContext({
    contextWindow: model.contextWindow,
    maxOutputTokens: projectedOptions.maxOutputTokens,
    modelContextBudgetStrategy: this.config.modelContextBudgetStrategy,
    traceContext,
  }));
  const contextUsageSnapshot = this.buildContextUsageSnapshot(projectedOptions);
  const contextUsageBreakdown = this.buildContextUsageBreakdownFromSnapshot(contextUsageSnapshot);
  this.logContextUsageSnapshot(projectedOptions, contextUsageSnapshot);
  if (!this.shouldStreamModelText()) {
    const result = await runWithModelInvocationContext(invocationContext, () => model.generateText(request));
    const toolCalls = normalizeModelToolCallsForRuntime(result.toolCalls, {
      logger: this.logger,
      model: modelSelection,
      source: "generateText",
      traceContext,
    });
    return {
      ...result,
      ...(contextUsageBreakdown.length > 0 ? { contextUsageBreakdown } : {}),
      toolCalls,
    };
  }

  let text = "";
  let finishReason = "unknown";
  let usage: ModelUsage = {};
  let providerMetadata: Record<string, unknown> | undefined;
  const reasoning: ModelReasoningContentBlock[] = [];
  const reasoningById = new Map<string, ModelReasoningContentBlock>();
  const toolCalls: ModelToolCall[] = [];
  const finalToolCallIds = new Set<ToolCallId>();
  const toolInputBuffers = new Map<ToolCallId, string>();
  const queue = createModelStreamingEventQueue({
    events: options.events,
    runtime: this,
    traceContext: options.traceContext,
  });
  const publishSnapshot = () => projectedOptions.onStreamSnapshot?.({ reasoning, text });
  const enqueue = async (payload: Parameters<typeof queue.enqueue>[0]) => {
    queue.enqueue(payload);
    await queue.maybeApplyBackpressure();
  };
  const enqueueTerminal = async (payload: Parameters<typeof queue.enqueue>[0]) => {
    queue.enqueue(payload);
    await queue.drain();
  };
  const flushToolInput = async (toolCallId: ToolCallId) => {
    const delta = toolInputBuffers.get(toolCallId);
    if (!delta) return;
    toolInputBuffers.delete(toolCallId);
    this.logger?.debug("Model streaming tool input delta flushed", {
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
      toolCallId,
    });
  };
  const bufferToolInput = async (toolCallId: ToolCallId, delta: string) => {
    if (!delta) return;
    const buffered = (toolInputBuffers.get(toolCallId) ?? "") + delta;
    toolInputBuffers.set(toolCallId, buffered);
    if (buffered.includes("\n") || buffered.includes("\r")
      || buffered.includes("\\n") || buffered.includes("\\r") || buffered.length >= 4096) {
      await flushToolInput(toolCallId);
    }
  };
  const flushAllToolInputs = async () => {
    const ids = [...toolInputBuffers.keys()];
    for (const id of ids) await flushToolInput(id);
  };
  const stream = await runWithModelInvocationContext(invocationContext, () => model.streamText(request));
  completeAssembly();
  try {
    for await (const event of stream) {
      switch (event.type) {
        case "start":
        case "text_start":
        case "text_end":
          await enqueue({
            assistantMessageId: options.assistantMessageId,
            delta: "",
            done: false,
            kind: event.type,
          });
          break;
        case "text_delta":
          text += event.delta;
          projectedOptions.onStreamTextDelta?.(event.delta);
          publishSnapshot();
          await enqueue({
            assistantMessageId: options.assistantMessageId,
            delta: event.delta,
            done: false,
            kind: "text_delta",
          });
          break;
        case "reasoning_start": {
          const block = getOrCreateReasoningBlock({
            id: event.id, providerMetadata: event.providerMetadata, reasoning, reasoningById,
          });
          if (event.providerMetadata) block.providerOptions = event.providerMetadata;
          await enqueue({
            assistantMessageId: options.assistantMessageId,
            delta: "",
            done: false,
            kind: "reasoning_start",
          });
          break;
        }
        case "reasoning_delta": {
          const block = getOrCreateReasoningBlock({
            id: event.id, providerMetadata: event.providerMetadata, reasoning, reasoningById,
          });
          block.text += event.delta;
          projectedOptions.onStreamReasoningDelta?.(event.delta);
          if (event.providerMetadata) block.providerOptions = event.providerMetadata;
          publishSnapshot();
          await enqueue({
            assistantMessageId: options.assistantMessageId,
            delta: event.delta,
            done: false,
            kind: "reasoning_delta",
          });
          break;
        }
        case "reasoning_end": {
          const block = reasoningById.get(event.id);
          if (block && event.providerMetadata) block.providerOptions = event.providerMetadata;
          reasoningById.delete(event.id);
          await enqueue({
            assistantMessageId: options.assistantMessageId,
            delta: "",
            done: false,
            kind: "reasoning_end",
          });
          break;
        }
        case "tool_input_start":
          toolInputBuffers.delete(event.toolCallId);
          this.logger?.debug("Model streaming tool input started", {
            ...traceContextToLogContext(options.traceContext),
            event: "model.streaming.tool_input_start",
            module: "core.runtime",
            providerExecuted: event.providerExecuted,
            toolCallId: event.toolCallId,
            toolName: event.toolName,
          });
          await enqueue({
            assistantMessageId: options.assistantMessageId,
            delta: "",
            done: false,
            kind: "tool_input_start",
            providerExecuted: event.providerExecuted,
            toolCallId: event.toolCallId,
            toolName: event.toolName,
          });
          break;
        case "tool_input_delta":
          await bufferToolInput(event.toolCallId, event.delta);
          break;
        case "tool_input_end":
          await flushToolInput(event.toolCallId);
          this.logger?.debug("Model streaming tool input ended", {
            ...traceContextToLogContext(options.traceContext),
            event: "model.streaming.tool_input_end",
            module: "core.runtime",
            toolCallId: event.toolCallId,
          });
          await enqueue({
            assistantMessageId: options.assistantMessageId,
            delta: "",
            done: false,
            kind: "tool_input_end",
            toolCallId: event.toolCallId,
          });
          break;
        case "tool_call": {
          const call = normalizeModelToolCallsForRuntime([event.toolCall], {
            logger: this.logger, model: modelSelection, source: "streamText", traceContext: options.traceContext,
          })?.[0];
          if (!call) break;
          await flushToolInput(call.toolCallId);
          if (finalToolCallIds.has(call.toolCallId)) break;
          finalToolCallIds.add(call.toolCallId);
          toolCalls.push(call);
          this.logger?.debug("Model streaming tool call completed", {
            ...traceContextToLogContext(options.traceContext),
            event: "model.streaming.tool_call",
            inputKeys: call.input && typeof call.input === "object" && !Array.isArray(call.input)
              ? Object.keys(call.input) : undefined,
            module: "core.runtime",
            toolCallId: call.toolCallId,
            toolName: call.toolName,
          });
          await enqueueTerminal({
            assistantMessageId: options.assistantMessageId,
            delta: "",
            done: false,
            kind: "tool_call",
            input: call.input,
            toolCallId: call.toolCallId,
            toolName: call.toolName,
          });
          projectedOptions.onStreamToolCall?.(call);
          break;
        }
        case "finish":
          finishReason = event.finishReason;
          usage = event.usage;
          providerMetadata = event.providerMetadata;
          await flushAllToolInputs();
          await enqueueTerminal({
            assistantMessageId: options.assistantMessageId,
            delta: "",
            done: true,
            kind: "finish",
          });
          break;
        case "error":
          await flushAllToolInputs();
          await enqueueTerminal({
            assistantMessageId: options.assistantMessageId,
            delta: "",
            done: true,
            kind: "error",
          });
          throw normalizeStreamError(event.error);
      }
    }
    await queue.drain();
  } catch (error) {
    await queue.drain();
    throw error;
  }

  const rawFinishReason = readRawFinishReason(providerMetadata);
  const outputTokenLimit = isOutputTokenLimitFinishReason(finishReason, rawFinishReason);
  const contextExceeded = toolCalls.length === 0 && !outputTokenLimit
    && isContextExceededFinishReason(finishReason, rawFinishReason);
  if (contextExceeded) {
    this.logger?.warn("Model stream ended with provider context overflow", {
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
  } else if (!outputTokenLimit && isSuspiciousEmptyModelResult(finishReason, text.length, toolCalls.length, usage)) {
    const diagnostics = buildSuspiciousEmptyDiagnostics({ finishReason, providerMetadata, rawFinishReason });
    this.logger?.warn("Model stream ended with suspicious empty completion", {
      ...traceContextToLogContext(traceContext),
      event: "model.runtime.stream.suspicious_empty",
      module: "core.runtime",
      modelProviderId: modelSelection.providerId,
      modelId: modelSelection.modelId,
      textLength: text.length,
      toolCallCount: toolCalls.length,
      ...diagnostics,
    });
    finalizeSuspiciousEmptyModelResult({ finishReason, model: modelSelection, providerMetadata, rawFinishReason });
  }
  return {
    ...(contextUsageBreakdown.length > 0 ? { contextUsageBreakdown } : {}),
    finishReason,
    providerMetadata,
    reasoning: reasoning.length > 0 ? reasoning : undefined,
    text,
    toolCalls: toolCalls.length > 0 ? toolCalls : undefined,
    usage,
  };
}
