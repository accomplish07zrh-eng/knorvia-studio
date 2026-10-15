// SPDX-License-Identifier: Apache-2.0
// 流事件消费循环（B2）：按适配器产生顺序消费并映射入队——工具输入先缓冲（换行/超长即冲刷），
// 同一 tool_call 的缓冲冲刷先于 tool_call 入队；finish/error 先冲刷全部缓冲再入终止事件；
// 循环内任何异常走 catch：drain 后原样重抛。消费顺序是契约。
import type { ModelReasoningContentBlock, TraceContext } from "../../deps.js";
import { traceContextToLogContext } from "../../deps.js";
import { normalizeModelToolCallsForRuntime, normalizeStreamError } from "../../helpers/index.js";
import { getOrCreateReasoningBlock } from "../reasoning-stream.js";

/** 流状态句柄（由流请求状态工厂提供）。 */
export interface StreamConsumeState {
  /** 推理块数组（追加序）。 */
  reasoning: ModelReasoningContentBlock[];
  /** 推理块按 id 索引。 */
  reasoningById: Map<string, ModelReasoningContentBlock>;
  /** 归一后的工具调用表。 */
  toolCalls: unknown[];
  /** 已入账工具调用 id（去重）。 */
  finalToolCallIds: Set<string>;
  /** 工具输入缓冲（tool_input_start 时清旧账）。 */
  toolInputBuffers: Map<string, string>;
  /** 缓冲冲刷（单个调用）。 */
  flushToolInput(toolCallId: string): Promise<void>;
  /** 缓冲累积。 */
  bufferToolInput(toolCallId: string, delta: string): Promise<void>;
  /** 全量冲刷。 */
  flushAllToolInputs(): Promise<void>;
}

/** 入队端口（普通载荷 + 终止载荷）。 */
export interface StreamPublishPorts {
  /** 入队 + 背压。 */
  enqueue(payload: Record<string, unknown>): Promise<void>;
  /** 入队 + 排空。 */
  enqueueTerminal(payload: Record<string, unknown>): Promise<void>;
  /** 异常路径排空。 */
  drain(): Promise<void>;
}

/** 消费循环的输入面。 */
export interface StreamConsumeRequest {
  /** 模型适配器事件流。 */
  stream: AsyncIterable<Record<string, unknown>>;
  /** 入队端口。 */
  publish: StreamPublishPorts;
  /** 流状态。 */
  state: StreamConsumeState;
  /** 运行时端口（debug 日志）。 */
  logDebug?: (message: string, fields: Record<string, unknown>) => void;
  /** 助手消息 id（写入载荷）。 */
  assistantMessageId: unknown;
  /** 追踪上下文。 */
  traceContext: TraceContext;
  /** 流快照回调。 */
  onStreamSnapshot?: (snapshot: { reasoning: ModelReasoningContentBlock[]; text: string }) => void;
  /** 文本增量回调。 */
  onStreamTextDelta?: (delta: string) => void;
  /** 推理增量回调。 */
  onStreamReasoningDelta?: (delta: string) => void;
  /** 工具调用回调。 */
  onStreamToolCall?: (call: unknown) => void;
  /** 模型选择（工具调用归一的归因）。 */
  modelSelection: { modelId: string; providerId: string };
}

/** 消费结果（流式分支返回值的主体）。 */
export interface StreamConsumeOutcome {
  /** 已收文本。 */
  text: string;
  /** 收尾原因。 */
  finishReason: string;
  /** 用量。 */
  usage: unknown;
  /** 供应商元数据（可缺）。 */
  providerMetadata: Record<string, unknown> | undefined;
}

/** 工具输入三段日志文案（逐字常量）。 */
const TOOL_LOG_TEXT = {
  inputEnd: "Model streaming tool input ended",
  inputEndEvent: "model.streaming.tool_input_end",
  inputStart: "Model streaming tool input started",
  inputStartEvent: "model.streaming.tool_input_start",
  module: "core.runtime",
  toolCall: "Model streaming tool call completed",
  toolCallEvent: "model.streaming.tool_call",
} as const;

/** 载荷里的工具调用入队（tool_call 事件的映射形状）。 */
const toolCallPayload = (
  request: StreamConsumeRequest,
  call: { id: string; input: unknown; name: string },
): Record<string, unknown> => ({
  assistantMessageId: request.assistantMessageId,
  delta: "",
  done: false,
  kind: "tool_call",
  input: call.input,
  toolCallId: call.id,
  toolName: call.name,
});

/** 消费一条适配器事件流（严格按产生顺序）。 */
export async function consumeModelStream(
  request: StreamConsumeRequest,
): Promise<StreamConsumeOutcome> {
  let text = "";
  let finishReason = "unknown";
  let usage: unknown = {};
  let providerMetadata: Record<string, unknown> | undefined;
  const { publish, state } = request;
  const base = () => ({ assistantMessageId: request.assistantMessageId, delta: "", done: false });
  const publishSnapshot = (): void => {
    request.onStreamSnapshot?.({ reasoning: state.reasoning, text });
  };
  try {
    for await (const event of request.stream) {
      switch (event.type) {
        case "start":
          await publish.enqueue({ ...base(), kind: "start" });
          continue;
        case "text_start":
          await publish.enqueue({ ...base(), kind: "text_start" });
          continue;
        case "text_end":
          await publish.enqueue({ ...base(), kind: "text_end" });
          continue;
        case "text_delta":
          text += event.text;
          request.onStreamTextDelta?.(event.text as string);
          publishSnapshot();
          await publish.enqueue({ ...base(), kind: "text_delta", delta: event.text });
          continue;
        case "reasoning_start": {
          const block = getOrCreateReasoningBlock({
            id: event.id as string,
            providerMetadata: event.providerMetadata as never,
            reasoning: state.reasoning,
            reasoningById: state.reasoningById,
          });
          if (event.providerMetadata) block.providerOptions = event.providerMetadata as never;
          await publish.enqueue({ ...base(), kind: "reasoning_start" });
          continue;
        }
        case "reasoning_delta": {
          const block = getOrCreateReasoningBlock({
            id: event.id as string,
            providerMetadata: event.providerMetadata as never,
            reasoning: state.reasoning,
            reasoningById: state.reasoningById,
          });
          block.text += event.text as string;
          request.onStreamReasoningDelta?.(event.text as string);
          if (event.providerMetadata) block.providerOptions = event.providerMetadata as never;
          publishSnapshot();
          await publish.enqueue({ ...base(), kind: "reasoning_delta", delta: event.text });
          continue;
        }
        case "reasoning_end": {
          const block = state.reasoningById.get(event.id as string);
          if (block && event.providerMetadata)
            block.providerOptions = event.providerMetadata as never;
          state.reasoningById.delete(event.id as string);
          await publish.enqueue({ ...base(), kind: "reasoning_end" });
          continue;
        }
        case "tool_input_start": {
          const callId = event.id as string;
          state.toolInputBuffers.delete(callId);
          request.logDebug?.(TOOL_LOG_TEXT.inputStart, {
            ...traceContextToLogContext(request.traceContext),
            ...{ event: TOOL_LOG_TEXT.inputStartEvent },
            providerExecuted: event.providerExecuted,
            toolCallId: callId,
            toolName: event.toolName,
            module: TOOL_LOG_TEXT.module,
          });
          await publish.enqueue({
            ...base(),
            kind: "tool_input_start",
            providerExecuted: event.providerExecuted,
            toolCallId: callId,
            toolName: event.toolName,
          });
          continue;
        }
        case "tool_input_delta":
          await state.bufferToolInput(event.id as string, event.delta as string);
          continue;
        case "tool_input_end": {
          const callId = event.id as string;
          await state.flushToolInput(callId);
          request.logDebug?.(TOOL_LOG_TEXT.inputEnd, {
            ...{ event: TOOL_LOG_TEXT.inputEndEvent },
            toolCallId: callId,
            module: TOOL_LOG_TEXT.module,
          });
          await publish.enqueue({
            ...base(),
            kind: "tool_input_end",
            toolCallId: callId,
          });
          continue;
        }
        case "tool_call": {
          const normalizedList = normalizeModelToolCallsForRuntime(
            [event.toolCall] as never,
            {
              logger: request.logDebug ? { debug: request.logDebug } : undefined,
              model: request.modelSelection,
              source: "streamText",
              traceContext: request.traceContext,
            } as never,
          );
          const normalized = normalizedList?.[0] as
            | { id: string; input: unknown; name: string }
            | undefined;
          if (!normalized) continue;
          await state.flushToolInput(normalized.id);
          if (state.finalToolCallIds.has(normalized.id)) continue;
          state.finalToolCallIds.add(normalized.id);
          state.toolCalls.push(normalized);
          request.logDebug?.(TOOL_LOG_TEXT.toolCall, {
            ...traceContextToLogContext(request.traceContext),
            ...{ event: TOOL_LOG_TEXT.toolCallEvent },
            inputKeys: inputKeyList(normalized.input),
            module: TOOL_LOG_TEXT.module,
            toolCallId: normalized.id,
            toolName: normalized.name,
          });
          await publish.enqueueTerminal(toolCallPayload(request, normalized));
          request.onStreamToolCall?.(normalized);
          continue;
        }
        case "finish":
          finishReason = event.finishReason as string;
          usage = event.usage;
          providerMetadata = event.providerMetadata as Record<string, unknown> | undefined;
          await state.flushAllToolInputs();
          await publish.enqueue({ ...base(), done: true, kind: "finish" });
          continue;
        case "error":
          await state.flushAllToolInputs();
          await publish.enqueue({ ...base(), done: true, kind: "error" });
          throw normalizeStreamError(event.error as never);
      }
    }
  } catch (error) {
    await publish.drain();
    throw error;
  }
  await publish.drain();
  return { text, finishReason, usage, providerMetadata };
}

/** 输入对象的键列表（日志诊断字段）。 */
const inputKeyList = (input: unknown): string[] =>
  input && typeof input === "object" && !Array.isArray(input) ? Object.keys(input) : [];
