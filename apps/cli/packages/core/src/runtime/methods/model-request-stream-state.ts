// SPDX-License-Identifier: Apache-2.0
// 流请求状态入口：状态句柄在 support/tool-input-buffers.ts、体检在 support/stream-inspection.ts、
// 写入队列在 support/write-queue.ts，这里把三者接到运行时端口面上。
import type { ModelReasoningContentBlock, ModelToolCall } from "../deps.js";
import type { AgentRuntimeInternal } from "../internal.js";
import type { RunModelTextRequestOptions, RuntimeModelTextResult } from "../types.js";
import { inspectStreamOutcome } from "./support/stream-inspection.js";
import {
  createRequestStreamState,
  FLUSH_LOG_MESSAGE,
  type RequestStreamState,
} from "./support/tool-input-buffers.js";
import {
  createStreamingWriteQueue,
  type StreamingQueuePayload,
  type StreamingWriteQueue,
} from "./support/write-queue.js";

/** 状态句柄：队列 + 三组中间态 + 缓冲冲刷入口。 */
interface ModelRequestStreamHandle {
  queue: StreamingWriteQueue;
  reasoning: ModelReasoningContentBlock[];
  reasoningById: Map<string, ModelReasoningContentBlock>;
  toolCalls: ModelToolCall[];
  finalToolCallIds: Set<string>;
  toolInputBuffers: Map<string, string>;
  enqueue(payload: Parameters<StreamingWriteQueue["enqueue"]>[0]): Promise<void>;
  enqueueTerminal(payload: Parameters<StreamingWriteQueue["enqueue"]>[0]): Promise<void>;
  flushToolInput(toolCallId: string): Promise<void>;
  bufferToolInput(toolCallId: string, delta: string): Promise<void>;
  flushAllToolInputs(): Promise<void>;
}

export function createModelRequestStreamState(
  runtime: AgentRuntimeInternal,
  options: RunModelTextRequestOptions,
): ModelRequestStreamHandle {
  const queue = createStreamingWriteQueue({
    write: (payload: StreamingQueuePayload) =>
      runtime.emitModelStreamingEvent(
        payload as never,
        options.traceContext,
        options.events as never,
      ),
  });
  const enqueue = async (payload: StreamingQueuePayload): Promise<void> => {
    queue.enqueue(payload);
    await queue.maybeApplyBackpressure();
  };
  const enqueueTerminal = async (payload: StreamingQueuePayload): Promise<void> => {
    queue.enqueue(payload);
    await queue.drain();
  };
  const core: RequestStreamState = createRequestStreamState({
    assistantMessageId: options.assistantMessageId,
    emitFlushed: enqueue,
    logFlush: (fields) => {
      runtime.logger?.debug(FLUSH_LOG_MESSAGE, fields);
    },
    traceContext: options.traceContext,
  });
  return {
    queue,
    reasoning: core.reasoning,
    reasoningById: core.reasoningById,
    toolCalls: core.toolCalls as ModelToolCall[],
    finalToolCallIds: core.finalToolCallIds as Set<string>,
    toolInputBuffers: core.toolInputBuffers,
    enqueue,
    enqueueTerminal,
    flushToolInput: core.flushToolInput,
    bufferToolInput: core.bufferToolInput,
    flushAllToolInputs: core.flushAllToolInputs,
  };
}

export function inspectModelRequestStreamResult(
  runtime: AgentRuntimeInternal,
  result: Pick<RuntimeModelTextResult, "finishReason" | "providerMetadata" | "usage" | "text"> & {
    toolCalls: ModelToolCall[];
  },
  modelSelection: { providerId: string; modelId: string },
  options: RunModelTextRequestOptions,
): void {
  inspectStreamOutcome({
    warn: (message, fields) => {
      runtime.logger?.warn(message, fields);
    },
    finishReason: result.finishReason,
    providerMetadata: result.providerMetadata,
    usage: result.usage,
    text: result.text,
    toolCalls: result.toolCalls,
    modelSelection: { modelId: modelSelection.modelId, providerId: modelSelection.providerId },
    traceContext: options.traceContext,
  });
}
