// SPDX-License-Identifier: Apache-2.0
// 流请求状态：推理块登记 + 工具调用收集 + 工具输入缓冲。缓冲按「换行/转义即冲刷、超长即冲刷」
// 攒批，冲刷顺序就是累积顺序；每条冲刷载荷按固定形状补齐后交给调用方写出去。
import { traceContextToLogContext } from "../../deps.js";
import type { ModelReasoningContentBlock, ToolCallId, TraceContext } from "../../deps.js";
import type { StreamingQueuePayload } from "./write-queue.js";

/** 触发立即冲刷的换行/转义记号（JSON 流式输入会带反斜杠形态）。 */
const FLUSH_TRIGGERS = ["\n", "\r", "\\n", "\\r"] as const;

/** 缓冲长度上限：攒到该长度不再等换行，直接冲刷。 */
const TOOL_INPUT_BUFFER_LIMIT = 4_096;

const FLUSH_EVENT = "model.streaming.tool_input_delta.flush";
const FLUSH_MESSAGE = "Model streaming tool input delta flushed";
const LOG_MODULE = "core.runtime";
const DELTA_KIND = "tool_input_delta";

/** 冲刷日志文案（逐字对外）。 */
export const FLUSH_LOG_MESSAGE = FLUSH_MESSAGE;

/** 推理块列表（追加序）。 */
type BlockList = ModelReasoningContentBlock[];
/** 推理块索引（按 id）。 */
type BlockIndex = Map<string, ModelReasoningContentBlock>;
/** 工具输入缓冲。 */
type InputBufferMap = Map<string, string>;
/** 已入账调用 id 集合。 */
type ToolIdSet = Set<string>;

/** 流请求状态句柄：一次模型请求生命周期内持有全部流式中间态。 */
export interface RequestStreamState {
  /** 推理块数组（追加序）。 */
  reasoning: BlockList;
  /** 推理块按 id 索引。 */
  reasoningById: BlockIndex;
  /** 归一后的工具调用表。 */
  toolCalls: unknown[];
  /** 已入账的工具调用 id（去重用）。 */
  finalToolCallIds: ToolIdSet;
  /** 工具输入缓冲（按调用 id 累积）。 */
  toolInputBuffers: InputBufferMap;
  /** 冲刷单个调用的缓冲（空缓冲 no-op）。 */
  flushToolInput: (callId: string) => Promise<void>;
  /** 累积工具输入 delta（触发条件满足即冲刷）。 */
  bufferToolInput: (callId: string, delta: string) => Promise<void>;
  /** 按缓冲键序逐个冲刷。 */
  flushAllToolInputs: () => Promise<void>;
}

/** 状态构造入参：冲刷落地、冲刷日志与助手消息 id。 */
export interface RequestStreamStateSpec {
  /** 助手消息 id（写入冲刷载荷）。 */
  assistantMessageId: string | undefined;
  /** 把冲刷出的 delta 载荷写出去（入队 + 背压由调用方接线）。 */
  emitFlushed: (payload: StreamingQueuePayload) => Promise<void>;
  /** 冲刷日志回调（字段由 flushLogFields 组装）。 */
  logFlush: (fields: Record<string, unknown>) => void;
  /** 追踪上下文（日志字段用）。 */
  traceContext: TraceContext;
}

/** 冲刷日志的字段组装（事件名/模块名逐字）。 */
export const flushLogFields = (
  traceContext: TraceContext,
  detail: { deltaLength: number; toolCallId: string },
): Record<string, unknown> => ({
  ...traceContextToLogContext(traceContext),
  deltaLength: detail.deltaLength,
  event: FLUSH_EVENT,
  module: LOG_MODULE,
  toolCallId: detail.toolCallId,
});

/** 工具输入 delta 载荷：done 恒 false，kind 恒 tool_input_delta。 */
const toolDeltaPayload = (
  assistantMessageId: string | undefined,
  delta: string,
  callId: string,
): StreamingQueuePayload => ({
  ...{ assistantMessageId, delta },
  ...{ done: false as const, kind: DELTA_KIND },
  toolCallId: callId as ToolCallId,
});

/** 建流请求状态：缓冲、推理块与工具调用三组中间态一次配齐。 */
export function createRequestStreamState(spec: RequestStreamStateSpec): RequestStreamState {
  const reasoning: BlockList = [];
  const reasoningById: BlockIndex = new Map();
  const toolCalls: unknown[] = [];
  const finalToolCallIds: ToolIdSet = new Set();
  const toolInputBuffers: InputBufferMap = new Map();

  const flushToolInput = async (callId: string): Promise<void> => {
    const buffered = toolInputBuffers.get(callId);
    if (!buffered) return;
    toolInputBuffers.delete(callId);
    spec.logFlush(
      flushLogFields(spec.traceContext, { deltaLength: buffered.length, toolCallId: callId }),
    );
    await spec.emitFlushed(toolDeltaPayload(spec.assistantMessageId, buffered, callId));
  };

  const bufferToolInput = async (callId: string, delta: string): Promise<void> => {
    if (delta.length === 0) return;
    const merged = (toolInputBuffers.get(callId) ?? "").concat(delta);
    toolInputBuffers.set(callId, merged);
    const longEnough = merged.length >= TOOL_INPUT_BUFFER_LIMIT;
    const hasBoundary = FLUSH_TRIGGERS.some((marker) => merged.includes(marker));
    if (longEnough || hasBoundary) await flushToolInput(callId);
  };

  const flushAllToolInputs = async (): Promise<void> => {
    for (const callId of [...toolInputBuffers.keys()]) await flushToolInput(callId);
  };

  const handle = {} as RequestStreamState;
  handle.reasoning = reasoning;
  handle.reasoningById = reasoningById;
  handle.toolCalls = toolCalls;
  handle.finalToolCallIds = finalToolCallIds;
  handle.toolInputBuffers = toolInputBuffers;
  handle.flushToolInput = flushToolInput;
  handle.bufferToolInput = bufferToolInput;
  handle.flushAllToolInputs = flushAllToolInputs;
  return handle;
}
