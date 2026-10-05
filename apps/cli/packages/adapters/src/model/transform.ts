// SPDX-License-Identifier: MIT
// Knorvia independent replacement; per-file review pending.
import type { ModelMessage as AiSdkModelMessage } from "ai";
import type { ModelInputMessage, ModelInputFormat } from "@knorvia/contracts";
import { dataUrlToDataContent, unsupportedInputMediaText } from "./media-transform-policy.js";
import { normalizeOpenAiCompatibleSystemMessages } from "./system-message-compat.js";
import { providerOptionsForReasoningBlock } from "./anthropic-reasoning-metadata.js";
import {
  shouldTextifyStructuredToolResults,
  toStructuredToolResultText,
  toToolResultMediaUserParts,
  toolResultHasVideoMedia,
  undeliverableFrameReferenceText,
} from "./tool-result-media-projection.js";
import { AiSdkModelAdapterError } from "./errors.js";

export interface AiSdkMessageTransformOptions {
  apiFormat?: string;
  providerOptions?: Record<string, unknown>;
  providerKind?: "openai" | "anthropic" | "openai-compatible" | "gateway" | "custom";
  stripMedia?: boolean;
  inputFormat?: ModelInputFormat;
}
function userParts(
  message: ModelInputMessage,
  options: AiSdkMessageTransformOptions,
): unknown[] | string {
  if (typeof message.content === "string") return message.content || "[Empty user message]";
  const parts: unknown[] = [];
  for (const block of message.content) {
    const unsupported = unsupportedInputMediaText(block, options.inputFormat);
    if (
      unsupported ||
      (options.stripMedia &&
        (block.type === "image" || block.type === "video" || block.type === "file"))
    ) {
      parts.push({ type: "text", text: unsupported ?? "[Media omitted]" });
      continue;
    }
    if (block.type === "text")
      parts.push({ type: "text", text: block.text || "[Empty user message]" });
    else if (block.type === "image") {
      const data = dataUrlToDataContent(block.dataUrl);
      parts.push(
        data
          ? { type: "image", image: data.data, mediaType: data.mediaType }
          : { type: "text", text: "[Invalid image data]" },
      );
    } else if (block.type === "video") {
      const data = dataUrlToDataContent(block.dataUrl);
      parts.push(
        data
          ? { type: "file", data: data.data, mediaType: data.mediaType }
          : { type: "text", text: "[Invalid video data]" },
      );
    } else if (block.type === "file") {
      if (block.text) parts.push({ type: "text", text: block.text });
      else if (block.dataUrl) {
        const data = dataUrlToDataContent(block.dataUrl);
        parts.push(
          data
            ? {
                type: "file",
                data: data.data,
                mediaType: data.mediaType,
                ...(block.name === undefined ? {} : { filename: block.name }),
              }
            : { type: "text", text: "[Invalid file data]" },
        );
      }
    } else if (block.type === "resource_link")
      parts.push({ type: "text", text: `[Resource: ${block.title ?? block.name ?? block.uri}]` });
  }
  if (parts.length === 1 && (parts[0] as { type?: unknown }).type === "text")
    return (parts[0] as { text: string }).text;
  return parts.length ? parts : "[Empty user message]";
}
function assistantParts(
  message: ModelInputMessage,
  options: AiSdkMessageTransformOptions,
): unknown[] | string {
  const parts: unknown[] = [];
  if (typeof message.content === "string") {
    if (message.content) parts.push({ type: "text", text: message.content });
  } else
    for (const block of message.content) {
      if (block.type === "text" && block.text) parts.push({ type: "text", text: block.text });
      if (block.type === "reasoning" && (block.text || block.providerOptions))
        parts.push({
          type: "reasoning",
          text: block.text,
          ...providerOptionsForReasoningBlock(block, options),
        });
    }
  for (const call of message.toolCalls ?? [])
    parts.push({
      type: "tool-call",
      toolCallId: call.id,
      toolName: call.name || (options.providerKind === "anthropic" ? "" : "unnamed_tool"),
      input: call.input,
      ...(call.providerExecuted === undefined ? {} : { providerExecuted: call.providerExecuted }),
    });
  return parts.length === 1 && (parts[0] as { type?: string }).type === "text"
    ? (parts[0] as { text: string }).text
    : parts;
}
export function toAiSdkMessages(
  messages: ModelInputMessage[],
  options: AiSdkMessageTransformOptions = {},
): AiSdkModelMessage[] {
  const source =
    options.providerKind === "openai-compatible"
      ? normalizeOpenAiCompatibleSystemMessages(messages)
      : messages;
  const output: unknown[] = [];
  // 修复依据：并行工具调用的结果是连续的 tool 消息。若每条结果后立刻插入其图片（user 消息），
  // 序列会变成 tool① → user(图片①) → tool②，AI SDK 遇到 user 时发现 tool② 未回填，
  // 抛出 MissingToolResultsError 中断对话。这里先暂存同一段连续 tool 结果的图片，
  // 段结束后按原顺序合并为一条 user 消息：tool① → tool② → user(图片①, 图片②)。
  let pendingToolMedia: unknown[] = [];
  const flushToolMedia = () => {
    if (pendingToolMedia.length) output.push({ role: "user", content: pendingToolMedia });
    pendingToolMedia = [];
  };
  for (const message of source) {
    if (message.role !== "tool") flushToolMedia();
    if (message.role === "system")
      output.push({
        role: "system",
        content:
          typeof message.content === "string"
            ? message.content
            : message.content
                .filter((b) => b.type === "text")
                .map((b) => (b as { text: string }).text)
                .join("\n"),
        ...(message.cacheControl
          ? { providerOptions: { cacheControl: message.cacheControl } }
          : {}),
      });
    else if (message.role === "user")
      output.push({
        role: "user",
        content: userParts(message, options),
        ...(message.cacheControl
          ? { providerOptions: { cacheControl: message.cacheControl } }
          : {}),
      });
    else if (message.role === "assistant")
      output.push({
        role: "assistant",
        content: assistantParts(message, options),
        ...(message.cacheControl
          ? { providerOptions: { cacheControl: message.cacheControl } }
          : {}),
      });
    else {
      if (!message.toolCallId || !message.toolName)
        throw new AiSdkModelAdapterError(
          "invalid_model_request",
          "Tool messages require toolCallId and toolName",
          { context: { reason: "invalid_request", retryable: false, source: "runtime" } },
        );
      const failed = undeliverableFrameReferenceText(message.content, {
        stripMedia: options.stripMedia,
        inputFormat: options.inputFormat,
      });
      const textify =
        shouldTextifyStructuredToolResults({
          apiFormat: options.apiFormat,
          providerKind: options.providerKind,
        }) || toolResultHasVideoMedia(message.content);
      const content = failed
        ? { type: "error-text", value: failed }
        : textify
          ? {
              type: message.isError ? "error-text" : "text",
              value: toStructuredToolResultText(message.content, {
                inputFormat: options.inputFormat,
              }),
            }
          : { type: message.isError ? "error-text" : "json", value: message.content };
      output.push({
        role: "tool",
        content: [
          {
            type: "tool-result",
            toolCallId: message.toolCallId,
            toolName: message.toolName,
            output: content,
          },
        ],
      });
      const media = toToolResultMediaUserParts(message.content, {
        apiFormat: options.apiFormat,
        providerKind: options.providerKind,
        stripMedia: options.stripMedia,
        inputFormat: options.inputFormat,
        toolName: message.toolName,
      });
      pendingToolMedia.push(...media);
    }
  }
  flushToolMedia();
  return output as AiSdkModelMessage[];
}
