// SPDX-License-Identifier: MIT
// Knorvia independent replacement; per-file review pending.
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
export function normalizeUsage(usage?: Partial<LanguageModelUsage>): ModelUsage {
  const value = usage as Record<string, unknown> | undefined;
  const details = value?.inputTokenDetails as Record<string, number> | undefined;
  const outputDetails = value?.outputTokenDetails as Record<string, number> | undefined;
  return {
    inputTokens: usage?.inputTokens,
    outputTokens: usage?.outputTokens,
    totalTokens: usage?.totalTokens,
    cacheReadTokens: details?.cacheReadTokens,
    cacheWriteTokens: details?.cacheWriteTokens,
    reasoningTokens: outputDetails?.reasoningTokens,
  };
}
export function normalizeReasoning(
  reasoning?: readonly { providerMetadata?: unknown; text?: string; type?: string }[],
): ModelReasoningContentBlock[] | undefined {
  const blocks = reasoning
    ?.filter((item) => item.text || item.providerMetadata)
    .map((item) => ({
      type: "reasoning" as const,
      text: item.text ?? "",
      ...(typeof item.providerMetadata === "object" && item.providerMetadata !== null
        ? { providerOptions: item.providerMetadata as Record<string, unknown> }
        : {}),
    }));
  return blocks?.length ? blocks : undefined;
}
export function toModelStreamEvent(chunk: TextStreamPart<ToolSet>): ModelStreamEvent | undefined {
  const value = chunk as unknown as Record<string, unknown>;
  switch (value.type) {
    case "start":
      return { type: "start" };
    case "text-start":
      return { type: "text_start", id: String(value.id) };
    case "text-delta":
      return {
        type: "text_delta",
        id: typeof value.id === "string" ? value.id : undefined,
        text: String(value.text ?? value.delta ?? ""),
      };
    case "text-end":
      return { type: "text_end", id: String(value.id) };
    case "reasoning-start":
      return {
        type: "reasoning_start",
        id: String(value.id),
        providerMetadata: value.providerMetadata as Record<string, unknown> | undefined,
      };
    case "reasoning-delta":
      return {
        type: "reasoning_delta",
        id: typeof value.id === "string" ? value.id : undefined,
        text: String(value.text ?? value.delta ?? ""),
        providerMetadata: value.providerMetadata as Record<string, unknown> | undefined,
      };
    case "reasoning-end":
      return {
        type: "reasoning_end",
        id: String(value.id),
        providerMetadata: value.providerMetadata as Record<string, unknown> | undefined,
      };
    case "tool-input-start":
      return {
        type: "tool_input_start",
        id: String(value.id ?? value.toolCallId),
        toolName: String(value.toolName ?? ""),
        providerExecuted: value.providerExecuted === true,
      };
    case "tool-input-delta":
      return {
        type: "tool_input_delta",
        id: String(value.id ?? value.toolCallId),
        delta: String(value.delta ?? ""),
      };
    case "tool-input-end":
      return { type: "tool_input_end", id: String(value.id ?? value.toolCallId) };
    case "tool-call":
      const toolCallId = String(value.toolCallId ?? value.id ?? "");
      return {
        type: "tool_call",
        toolCall: {
          id: toolCallId,
          name: normalizeModelToolName(value.toolName ?? "", {
            toolCallId,
            providerExecuted: value.providerExecuted,
          }),
          input: normalizeModelToolInput(value.input, {
            source: "streamText",
            toolName: String(value.toolName ?? ""),
          }),
          providerExecuted: value.providerExecuted === true,
        },
      };
    case "finish":
      return {
        type: "finish",
        finishReason: String(value.finishReason ?? "unknown"),
        usage: normalizeUsage(value.totalUsage as Partial<LanguageModelUsage> | undefined),
        providerMetadata: value.providerMetadata as Record<string, unknown> | undefined,
      };
    case "error":
      return { type: "error", error: value.error };
    default:
      return undefined;
  }
}
export function normalizeToolCalls(
  result: AiSdkGenerateTextResult,
  logger?: Logger,
): ModelTextResult["toolCalls"] {
  const calls =
    result.toolCalls?.map((call) => {
      const name = normalizeModelToolName(call.toolName, {
        toolCallId: call.toolCallId,
        providerExecuted: call.providerExecuted,
      });
      return {
        id: call.toolCallId,
        name,
        input: normalizeModelToolInput(call.input, {
          logger,
          source: "generateText",
          toolName: name,
        }),
        providerExecuted: call.providerExecuted,
      };
    }) ?? [];
  return calls.length ? calls : undefined;
}
export function normalizeToolResults(
  result: AiSdkGenerateTextResult,
  normalizedToolCalls?: ModelTextResult["toolCalls"],
): ModelToolResult[] | undefined {
  const byId = new Map(normalizedToolCalls?.map((call) => [call.id, call]));
  const values =
    result.toolResults?.map((item) => ({
      id: item.toolCallId,
      name: item.toolName,
      input: byId.get(item.toolCallId)?.input ?? item.input,
      output: item.output,
      providerExecuted: item.providerExecuted,
      providerMetadata: item.providerMetadata,
    })) ?? [];
  return values.length ? values : undefined;
}
export function normalizeSources(result: AiSdkGenerateTextResult): ModelSource[] | undefined {
  const sources = result.sources as ModelSource[] | undefined;
  return sources?.length ? sources : undefined;
}
