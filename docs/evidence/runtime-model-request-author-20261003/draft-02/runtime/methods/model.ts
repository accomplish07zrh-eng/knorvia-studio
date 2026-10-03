import { beginLocalTurnPreparation } from "@knorvia/contracts";
import { runWithModelInvocationContext, traceContextToLogContext } from "../deps.js";
import type { ModelUsage, ToolCallId } from "../deps.js";
import {
  logModelRequestMediaSummary,
  logMediaBudgetProjection,
  logMediaCapabilityProjection,
  normalizeStreamError,
  normalizeModelToolCallsForRuntime,
  projectMessagesWithMediaAttachmentPaths,
  projectMessagesForInputFormat,
  projectMessagesForMediaBudget,
} from "../helpers/index.js";
import type { RunModelTextRequestOptions, RuntimeModelTextResult } from "../types.js";
import type { AgentRuntimeInternal } from "../internal.js";
import { modelRequestTokenLimitLogContext } from "./model-token-limits.js";
import { getOrCreateReasoningBlock } from "./reasoning-stream.js";
import { createRefreshRuntimeHeadersBeforeModelAttempt } from "./model-runtime-headers.js";
import { resolveModelRequestSessionTypeFromTaskType } from "./model-request-session-type.js";
import {
  createModelRequestStreamState,
  inspectModelRequestStreamResult,
} from "./model-request-stream-state.js";

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
  const capabilityProjection = projectMessagesForInputFormat(
    pathMessages,
    model.properties.inputFormat,
  );
  logMediaCapabilityProjection(this.logger, options.traceContext, capabilityProjection, {
    event: "model.request.media_capability_projection",
    message: "Model request media capability projection",
    model: `${model.providerId}/${model.modelId}`,
  });
  const mediaProjection = projectMessagesForMediaBudget(capabilityProjection.messages, {
    latestRealUserMessageIndex: options.latestRealUserMessageIndex,
  });
  logMediaBudgetProjection(this.logger, options.traceContext, mediaProjection, {
    event: "model.request.media_projection",
    message: "Model request media budget projection",
  });
  const projectedOptions =
    mediaProjection.messages === options.messages
      ? options
      : { ...options, messages: mediaProjection.messages };
  const traceContext = projectedOptions.traceContext;
  logModelRequestMediaSummary(this.logger, traceContext, {
    incomingMessages: options.messages,
    mediaProjection,
    providerMessages: projectedOptions.messages,
  });
  const invocationContext = {
    metadata: traceContextToLogContext(traceContext),
    modelRequestSessionType: resolveModelRequestSessionTypeFromTaskType(this.config.taskType),
    modelCall: {
      actorKind: this.agentTelemetry.actorKind,
      operation: "agent_step" as const,
      operationId: traceContext.spanId,
      ...(projectedOptions.streamRecovery
        ? {
            callCause: "recovery" as const,
            attributes: { streamRecoveryNumber: projectedOptions.streamRecovery.retryNumber },
          }
        : {}),
    },
    statusSink: this.createModelStatusSink(traceContext, projectedOptions.events, {
      ...(projectedOptions.onModelNetworkStatus
        ? { onStatus: projectedOptions.onModelNetworkStatus }
        : {}),
      ...(projectedOptions.streamRecovery
        ? { streamRecovery: projectedOptions.streamRecovery }
        : {}),
    }),
    traceContext,
    refreshRuntimeHeadersBeforeAttempt: createRefreshRuntimeHeadersBeforeModelAttempt(this, {
      abortSignal: projectedOptions.abortSignal,
      model,
      traceContext,
    }),
    streamIdleTimeoutRetryNumber: projectedOptions.streamRecovery?.retryNumber,
    streamRecovery: projectedOptions.streamRecovery,
  };
  const request = {
    messages: projectedOptions.messages,
    tools: projectedOptions.tools,
    abortSignal: projectedOptions.abortSignal,
    ...(projectedOptions.maxOutputTokens !== undefined
      ? { options: { maxOutputTokens: projectedOptions.maxOutputTokens } }
      : {}),
  };
  this.logger?.debug(
    "Model request token limits",
    modelRequestTokenLimitLogContext({
      contextWindow: model.properties.contextWindow,
      maxOutputTokens: projectedOptions.maxOutputTokens,
      modelContextBudgetStrategy: this.config.modelContextBudgetStrategy,
      traceContext,
    }),
  );
  const contextUsageSnapshot = this.buildContextUsageSnapshot(projectedOptions);
  const contextUsageBreakdown = this.buildContextUsageBreakdownFromSnapshot(contextUsageSnapshot);
  this.logContextUsageSnapshot(projectedOptions, contextUsageSnapshot);
  if (!this.shouldStreamModelText()) {
    const result = await runWithModelInvocationContext(invocationContext, () =>
      model.generateText(request),
    );
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
  const {
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
  } = createModelRequestStreamState(this, options);
  const publishSnapshot = () => options.onStreamSnapshot?.({ reasoning, text });
  const stream = runWithModelInvocationContext(invocationContext, () => model.streamText(request));
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
          text += event.text;
          options.onStreamTextDelta?.(event.text);
          publishSnapshot();
          await enqueue({
            assistantMessageId: options.assistantMessageId,
            delta: event.text,
            done: false,
            kind: "text_delta",
          });
          break;
        case "reasoning_start": {
          const block = getOrCreateReasoningBlock({
            id: event.id,
            providerMetadata: event.providerMetadata,
            reasoning,
            reasoningById,
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
            id: event.id,
            providerMetadata: event.providerMetadata,
            reasoning,
            reasoningById,
          });
          block.text += event.text;
          options.onStreamReasoningDelta?.(event.text);
          if (event.providerMetadata) block.providerOptions = event.providerMetadata;
          publishSnapshot();
          await enqueue({
            assistantMessageId: options.assistantMessageId,
            delta: event.text,
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
          toolInputBuffers.delete(event.id);
          this.logger?.debug("Model streaming tool input started", {
            ...traceContextToLogContext(options.traceContext),
            event: "model.streaming.tool_input_start",
            module: "core.runtime",
            providerExecuted: event.providerExecuted,
            toolCallId: event.id as ToolCallId,
            toolName: event.toolName,
          });
          await enqueue({
            assistantMessageId: options.assistantMessageId,
            delta: "",
            done: false,
            kind: "tool_input_start",
            providerExecuted: event.providerExecuted,
            toolCallId: event.id as ToolCallId,
            toolName: event.toolName,
          });
          break;
        case "tool_input_delta":
          await bufferToolInput(event.id, event.delta);
          break;
        case "tool_input_end":
          await flushToolInput(event.id);
          this.logger?.debug("Model streaming tool input ended", {
            ...traceContextToLogContext(options.traceContext),
            event: "model.streaming.tool_input_end",
            module: "core.runtime",
            toolCallId: event.id as ToolCallId,
          });
          await enqueue({
            assistantMessageId: options.assistantMessageId,
            delta: "",
            done: false,
            kind: "tool_input_end",
            toolCallId: event.id as ToolCallId,
          });
          break;
        case "tool_call": {
          const call = normalizeModelToolCallsForRuntime([event.toolCall], {
            logger: this.logger,
            model: modelSelection,
            source: "streamText",
            traceContext: options.traceContext,
          })?.[0];
          if (!call) break;
          await flushToolInput(call.id);
          if (finalToolCallIds.has(call.id)) break;
          finalToolCallIds.add(call.id);
          toolCalls.push(call);
          this.logger?.debug("Model streaming tool call completed", {
            ...traceContextToLogContext(options.traceContext),
            event: "model.streaming.tool_call",
            inputKeys:
              call.input && typeof call.input === "object" && !Array.isArray(call.input)
                ? Object.keys(call.input)
                : [],
            module: "core.runtime",
            toolCallId: call.id as ToolCallId,
            toolName: call.name,
          });
          await enqueueTerminal({
            assistantMessageId: options.assistantMessageId,
            delta: "",
            done: false,
            kind: "tool_call",
            input: call.input,
            toolCallId: call.id as ToolCallId,
            toolName: call.name,
          });
          options.onStreamToolCall?.(call);
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
  } catch (error) {
    await queue.drain();
    throw error;
  }
  await queue.drain();

  inspectModelRequestStreamResult(
    this,
    {
      finishReason,
      providerMetadata,
      usage,
      text,
      toolCalls,
    },
    modelSelection,
    traceContext,
  );
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
