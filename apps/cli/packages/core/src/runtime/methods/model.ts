// SPDX-License-Identifier: Apache-2.0
// 模型请求入口（B1/B2）：装配管线与流消费循环在 support/（model-request-assembly /
// stream-consume），这里保持兼容导出面并按 shouldStreamModelText 二分。
import { runWithModelInvocationContext } from "../deps.js";
import type { AgentRuntimeInternal } from "../internal.js";
import { normalizeModelToolCallsForRuntime } from "../helpers/index.js";
import type { RunModelTextRequestOptions, RuntimeModelTextResult } from "../types.js";
import {
  assembleRequestPipeline,
  finalizeNonStreamingResult,
} from "./support/model-request-assembly.js";
import { consumeModelStream, type StreamConsumeRequest } from "./support/stream-consume.js";
import {
  createModelRequestStreamState,
  inspectModelRequestStreamResult,
} from "./model-request-stream-state.js";

export async function runModelTextRequest(
  this: AgentRuntimeInternal,
  options: RunModelTextRequestOptions,
): Promise<RuntimeModelTextResult> /* 模型文本结果 */ {
  const assembly = await assembleRequestPipeline(this, options);
  const runtime = this;
  const model = options.model;
  const { request } = assembly;

  // 非流式二分：生成一次、归一工具调用、条件附加用量分解。
  if (!this.shouldStreamModelText()) {
    const raw = (await runWithModelInvocationContext(assembly.invocationContext as never, () =>
      model.generateText(request as never),
    )) as unknown as Record<string, unknown>;
    const normalized = normalizeModelToolCallsForRuntime(raw.toolCalls as never, {
      logger: this.logger,
      model: assembly.modelSelection as never,
      source: "generateText",
      traceContext: options.traceContext,
    });
    return finalizeNonStreamingResult(assembly, raw as never, normalized);
  }

  // 流式分支：先起流（同 tick 内完成 assembly 收尾），再按产生顺序消费。
  const state = createModelRequestStreamState(this, options);
  const stream = runWithModelInvocationContext(assembly.invocationContext as never, () =>
    model.streamText(request as never),
  );
  assembly.completeAssembly();
  const consumeRequest: StreamConsumeRequest = {
    stream: stream as never,
    publish: {
      enqueue: state.enqueue,
      enqueueTerminal: state.enqueueTerminal,
      drain: () => state.queue.drain(),
    },
    state: {
      reasoning: state.reasoning,
      reasoningById: state.reasoningById,
      toolCalls: state.toolCalls,
      finalToolCallIds: state.finalToolCallIds,
      toolInputBuffers: state.toolInputBuffers,
      flushToolInput: state.flushToolInput,
      bufferToolInput: state.bufferToolInput,
      flushAllToolInputs: state.flushAllToolInputs,
    },
    logDebug: (message, fields) => {
      this.logger?.debug(message, fields);
    },
    assistantMessageId: options.assistantMessageId,
    traceContext: options.traceContext,
    modelSelection: assembly.modelSelection,
    onStreamSnapshot: options.onStreamSnapshot,
    onStreamTextDelta: options.onStreamTextDelta,
    onStreamReasoningDelta: options.onStreamReasoningDelta,
    onStreamToolCall: options.onStreamToolCall as never,
  };
  const outcome = await consumeModelStream(consumeRequest);
  inspectModelRequestStreamResult(
    runtime,
    {
      finishReason: outcome.finishReason,
      providerMetadata: outcome.providerMetadata,
      usage: outcome.usage as never,
      text: outcome.text,
      toolCalls: state.toolCalls as never,
    },
    assembly.modelSelection,
    options,
  );
  const body = {} as Record<string, unknown>;
  if (assembly.contextUsageBreakdown.length > 0) {
    body.contextUsageBreakdown = assembly.contextUsageBreakdown;
  }
  body.finishReason = outcome.finishReason;
  body.providerMetadata = outcome.providerMetadata;
  body.reasoning = state.reasoning.length > 0 ? state.reasoning : undefined;
  body.text = outcome.text;
  body.toolCalls = state.toolCalls.length > 0 ? state.toolCalls : undefined;
  body.usage = outcome.usage as never;
  return body as unknown as RuntimeModelTextResult;
}
