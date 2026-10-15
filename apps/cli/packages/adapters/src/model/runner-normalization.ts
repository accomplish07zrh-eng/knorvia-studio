// SPDX-License-Identifier: Apache-2.0
// 结果与流事件归一：SDK 结果/流 chunk → 契约层的用量、reasoning 块、流事件、工具调用/结果、来源。
// 空集合归一为 undefined；未知 chunk 类型返回 undefined（调用方丢弃）。字段映射逐字保持。

import type { LanguageModelUsage, TextStreamPart, ToolSet } from "ai";
import type {
  Logger,
  ModelReasoningContentBlock,
  ModelSource,
  ModelStreamEvent,
  ModelTextResult,
  ModelToolResult,
  ModelUsage,
} from "@knorvia/contracts";
import type { AiSdkGenerateTextResult } from "./runner-runtime.js";
import { normalizeModelToolInput } from "./tool-input-normalization.js";
import { normalizeModelToolName } from "./tool-call-validation.js";

export function normalizeUsage(sdk?: Partial<LanguageModelUsage>): ModelUsage {
  const bag = sdk as Record<string, unknown> | undefined;
  const inputDetails = bag?.inputTokenDetails as Record<string, number> | undefined;
  const outputDetails = bag?.outputTokenDetails as Record<string, number> | undefined;
  return {
    inputTokens: sdk?.inputTokens,
    outputTokens: sdk?.outputTokens,
    totalTokens: sdk?.totalTokens,
    cacheReadTokens: inputDetails?.cacheReadTokens,
    cacheWriteTokens: inputDetails?.cacheWriteTokens,
    reasoningTokens: outputDetails?.reasoningTokens,
  };
}

export function normalizeReasoning(
  fragments?: readonly { providerMetadata?: unknown; text?: string; type?: string }[],
): ModelReasoningContentBlock[] | undefined {
  if (!fragments) return undefined;
  const blocks: ModelReasoningContentBlock[] = [];
  for (const item of fragments) {
    if (!item.text && !item.providerMetadata) continue;
    const block: ModelReasoningContentBlock = { type: "reasoning", text: item.text ?? "" };
    if (typeof item.providerMetadata === "object" && item.providerMetadata !== null) {
      (block as { providerOptions?: Record<string, unknown> }).providerOptions =
        item.providerMetadata as Record<string, unknown>;
    }
    blocks.push(block);
  }
  return blocks.length ? blocks : undefined;
}

function chunkText(raw: Record<string, unknown>): string {
  return String(raw.text ?? raw.delta ?? "");
}

function event(body: Record<string, unknown>): ModelStreamEvent {
  return body as ModelStreamEvent;
}

function metadataOf(raw: Record<string, unknown>): Record<string, unknown> | undefined {
  return raw.providerMetadata as Record<string, unknown> | undefined;
}

export function toModelStreamEvent(chunk: TextStreamPart<ToolSet>): ModelStreamEvent | undefined {
  const raw = chunk as unknown as Record<string, unknown>;
  const type = raw.type;
  if (type === "start") return event({ type: "start" });
  if (type === "text-start") return event({ type: "text_start", id: String(raw.id) });
  if (type === "text-end") return event({ type: "text_end", id: String(raw.id) });
  if (type === "text-delta") {
    return event({
      type: "text_delta", // 文本增量事件
      id: typeof raw.id === "string" ? raw.id : undefined, // 文本段 id
      text: chunkText(raw), // 增量文本
    });
  }
  if (type === "reasoning-start") {
    return event({
      type: "reasoning_start", // 推理段开始事件
      id: String(raw.id), // 推理段 id
      providerMetadata: metadataOf(raw), // provider 侧元数据
    });
  }
  if (type === "reasoning-end") {
    return event({
      type: "reasoning_end", // 推理段结束事件
      id: String(raw.id), // 推理段 id
      providerMetadata: metadataOf(raw), // provider 侧元数据
    });
  }
  if (type === "reasoning-delta") {
    return event({
      type: "reasoning_delta", // 推理增量事件
      id: typeof raw.id === "string" ? raw.id : undefined, // 推理段 id
      text: chunkText(raw), // 增量文本
      providerMetadata: metadataOf(raw), // provider 侧元数据
    });
  }
  if (type === "tool-input-end") {
    return event({
      type: "tool_input_end", // 工具入参结束事件
      id: String(raw.id ?? raw.toolCallId), // 调用 id
    });
  }
  if (type === "tool-input-start") {
    return event({
      type: "tool_input_start", // 工具入参开始事件
      id: String(raw.id ?? raw.toolCallId), // 调用 id
      toolName: String(raw.toolName ?? ""), // 工具名
      providerExecuted: raw.providerExecuted === true, // provider 执行标记
    });
  }
  if (type === "tool-input-delta") {
    return event({
      type: "tool_input_delta", // 工具入参增量事件
      id: String(raw.id ?? raw.toolCallId), // 调用 id
      delta: String(raw.delta ?? ""), // 入参增量文本
    });
  }
  if (type === "tool-call") {
    const toolCallId = String(raw.toolCallId ?? raw.id ?? "");
    return event({
      type: "tool_call", // 完整工具调用事件
      toolCall: {
        id: toolCallId, // 调用 id
        name: normalizeModelToolName(raw.toolName ?? "", {
          toolCallId,
          providerExecuted: raw.providerExecuted,
        }),
        input: normalizeModelToolInput(raw.input, {
          source: "streamText", // 诊断来源标记
          toolName: String(raw.toolName ?? ""),
        }),
        providerExecuted: raw.providerExecuted === true, // provider 执行标记
      },
    });
  }
  if (type === "finish") {
    return event({
      type: "finish", // 终局事件
      finishReason: String(raw.finishReason ?? "unknown"), // 结束原因
      usage: normalizeUsage(raw.totalUsage as Partial<LanguageModelUsage> | undefined),
      providerMetadata: metadataOf(raw), // provider 侧元数据
    });
  }
  if (type === "error") return event({ type: "error", error: raw.error });
  return undefined;
}

export function normalizeToolCalls(
  result: AiSdkGenerateTextResult,
  logger?: Logger,
): ModelTextResult["toolCalls"] {
  const source = result.toolCalls ?? [];
  const calls = [];
  for (const entry of source) {
    const name = normalizeModelToolName(entry.toolName, {
      toolCallId: entry.toolCallId,
      providerExecuted: entry.providerExecuted,
    });
    calls.push({
      id: entry.toolCallId, // 调用 id
      name, // 归一后的工具名
      input: normalizeModelToolInput(entry.input, {
        logger,
        source: "generateText", // 诊断来源标记
        toolName: name,
      }),
      providerExecuted: entry.providerExecuted, // provider 执行标记
    });
  }
  return calls.length ? calls : undefined;
}

export function normalizeToolResults(
  result: AiSdkGenerateTextResult,
  normalizedToolCalls?: ModelTextResult["toolCalls"],
): ModelToolResult[] | undefined {
  const byId = new Map(normalizedToolCalls?.map((entry) => [entry.id, entry]));
  const source = result.toolResults ?? [];
  const values = [];
  for (const item of source) {
    values.push({
      id: item.toolCallId, // 调用 id
      name: item.toolName, // 工具名
      input: byId.get(item.toolCallId)?.input ?? item.input, // 归一入参优先
      output: item.output, // 执行输出
      providerExecuted: item.providerExecuted, // provider 执行标记
      providerMetadata: item.providerMetadata, // provider 侧元数据
    });
  }
  return values.length ? values : undefined;
}

export function normalizeSources(result: AiSdkGenerateTextResult): ModelSource[] | undefined {
  const sources = result.sources as ModelSource[] | undefined;
  return sources?.length ? sources : undefined;
}
