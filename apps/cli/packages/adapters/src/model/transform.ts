// SPDX-License-Identifier: Apache-2.0
// 输入消息 → AI SDK 消息投影：角色保序、system 归一（openai-compatible）、user/assistant 内容块
// 投影、tool 结果投影与连续 tool 媒体合并（防 MissingToolResultsError 的既有修复保持）。
// 占位与提示文案是对外可见文本，逐字保持。

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
  apiFormat?: string; // provider API 形态
  providerOptions?: Record<string, unknown>; // provider 侧选项
  providerKind?: "openai" | "anthropic" | "openai-compatible" | "gateway" | "custom"; // SDK 种类
  stripMedia?: boolean; // 媒体剥离开关
  inputFormat?: ModelInputFormat; // 模型输入能力表
}

const EMPTY_TEXT = "[Empty user message]";
const OMITTED_MEDIA = "[Media omitted]";
const INVALID_IMAGE = "[Invalid image data]";
const INVALID_VIDEO = "[Invalid video data]";
const INVALID_FILE = "[Invalid file data]";
const UNNAMED_TOOL = "unnamed_tool";

type DecodedMedia = { mediaType: string; data: string };

function textPart(text: string): unknown {
  return { type: "text", text }; // 文本段
}

function imagePart(decoded: DecodedMedia): unknown {
  return { type: "image", image: decoded.data, mediaType: decoded.mediaType }; // 图片段
}

function videoPart(decoded: DecodedMedia): unknown {
  return { type: "file", data: decoded.data, mediaType: decoded.mediaType }; // 视频按文件段投递
}

function filePart(name: string | undefined, decoded: DecodedMedia): unknown {
  const extras = name === undefined ? {} : { filename: name };
  return { type: "file", data: decoded.data, mediaType: decoded.mediaType, ...extras }; // 文件段
}

function resourceText(block: { title?: string; name?: string; uri: string }): string {
  return `[Resource: ${block.title ?? block.name ?? block.uri}]`;
}

function userParts(
  entry: ModelInputMessage,
  view: AiSdkMessageTransformOptions,
): unknown[] | string {
  if (typeof entry.content === "string") return entry.content || EMPTY_TEXT;
  const parts: unknown[] = [];
  for (const block of entry.content) {
    const unsupported = unsupportedInputMediaText(block, view.inputFormat);
    const stripped =
      view.stripMedia &&
      (block.type === "image" || block.type === "video" || block.type === "file");
    if (unsupported || stripped) {
      parts.push(textPart(unsupported ?? OMITTED_MEDIA));
    } else if (block.type === "text") {
      parts.push(textPart(block.text || EMPTY_TEXT));
    } else if (block.type === "image") {
      const decoded = dataUrlToDataContent(block.dataUrl);
      parts.push(decoded ? imagePart(decoded) : textPart(INVALID_IMAGE));
    } else if (block.type === "video") {
      const decoded = dataUrlToDataContent(block.dataUrl);
      parts.push(decoded ? videoPart(decoded) : textPart(INVALID_VIDEO));
    } else if (block.type === "file") {
      if (block.text) parts.push(textPart(block.text));
      else if (block.dataUrl) {
        const decoded = dataUrlToDataContent(block.dataUrl);
        parts.push(decoded ? filePart(block.name, decoded) : textPart(INVALID_FILE));
      }
    } else if (block.type === "resource_link") {
      parts.push(textPart(resourceText(block)));
    }
  }
  const onlyText = parts.length === 1 && (parts[0] as { type?: unknown }).type === "text";
  if (onlyText) return (parts[0] as { text: string }).text;
  return parts.length ? parts : EMPTY_TEXT;
}

function assistantParts(
  entry: ModelInputMessage,
  view: AiSdkMessageTransformOptions,
): unknown[] | string {
  const parts: unknown[] = [];
  if (typeof entry.content === "string") {
    if (entry.content) parts.push(textPart(entry.content));
  } else {
    for (const block of entry.content) {
      if (block.type === "text" && block.text) parts.push(textPart(block.text));
      if (block.type === "reasoning" && (block.text || block.providerOptions)) {
        parts.push({
          type: "reasoning", // 推理段
          text: block.text, // 推理文本
          ...providerOptionsForReasoningBlock(block, view),
        });
      }
    }
  }
  for (const call of entry.toolCalls ?? []) {
    const fallback = view.providerKind === "anthropic" ? "" : UNNAMED_TOOL;
    parts.push({
      type: "tool-call", // 工具调用段
      toolCallId: call.id, // 调用 id
      toolName: call.name || fallback, // 空名闭合（anthropic 空串，其余 unnamed_tool）
      input: call.input, // 入参
      ...(call.providerExecuted === undefined ? {} : { providerExecuted: call.providerExecuted }), // 执行标记按需附带
    });
  }
  const onlyText = parts.length === 1 && (parts[0] as { type?: string }).type === "text";
  return onlyText ? (parts[0] as { text: string }).text : parts;
}

function joinTextBlocks(content: Extract<ModelInputMessage["content"], unknown[]>): string {
  const lines: string[] = [];
  for (const block of content) {
    if (block.type === "text") lines.push((block as { text: string }).text);
  }
  return lines.join("\n");
}

function systemMessage(entry: ModelInputMessage): unknown {
  const content = typeof entry.content === "string" ? entry.content : joinTextBlocks(entry.content);
  const shaped = { role: "system", content };
  return entry.cacheControl
    ? { ...shaped, providerOptions: { cacheControl: entry.cacheControl } }
    : shaped;
}

function toolMessage(entry: ModelInputMessage, view: AiSdkMessageTransformOptions): unknown {
  const failed = undeliverableFrameReferenceText(entry.content, {
    stripMedia: view.stripMedia,
    inputFormat: view.inputFormat,
  });
  const textify =
    shouldTextifyStructuredToolResults({
      apiFormat: view.apiFormat,
      providerKind: view.providerKind,
    }) || toolResultHasVideoMedia(entry.content);
  const body = failed
    ? { type: "error-text", value: failed }
    : textify
      ? {
          type: entry.isError ? "error-text" : "text",
          value: toStructuredToolResultText(entry.content, { inputFormat: view.inputFormat }),
        }
      : { type: entry.isError ? "error-text" : "json", value: entry.content };
  return {
    role: "tool", // 工具角色（协议面）
    content: [
      {
        type: "tool-result", // 工具结果段
        toolCallId: entry.toolCallId!, // 调用 id
        toolName: entry.toolName!, // 工具名
        output: body, // 结果体（三形态见 B28）
      },
    ],
  };
}

export function toAiSdkMessages(
  history: ModelInputMessage[],
  view: AiSdkMessageTransformOptions = {},
): AiSdkModelMessage[] {
  const compatible = view.providerKind === "openai-compatible";
  const source = compatible ? normalizeOpenAiCompatibleSystemMessages(history) : history;
  const output: unknown[] = [];
  // 连续 tool 结果的媒体段先暂存、段尾合并成一条 user 消息（保持既有修复）。
  let pendingToolMedia: unknown[] = [];
  const flushToolMedia = () => {
    if (pendingToolMedia.length) output.push({ role: "user", content: pendingToolMedia });
    pendingToolMedia = [];
  };
  for (const entry of source) {
    if (entry.role !== "tool") flushToolMedia();
    if (entry.role === "system") {
      output.push(systemMessage(entry));
    } else if (entry.role === "user") {
      const shaped = { role: "user", content: userParts(entry, view) };
      output.push(
        entry.cacheControl
          ? { ...shaped, providerOptions: { cacheControl: entry.cacheControl } }
          : shaped,
      );
    } else if (entry.role === "assistant") {
      const shaped = { role: "assistant", content: assistantParts(entry, view) };
      output.push(
        entry.cacheControl
          ? { ...shaped, providerOptions: { cacheControl: entry.cacheControl } }
          : shaped,
      );
    } else {
      if (!entry.toolCallId || !entry.toolName) {
        throw new AiSdkModelAdapterError(
          "invalid_model_request",
          "Tool messages require toolCallId and toolName",
          { context: { reason: "invalid_request", retryable: false, source: "runtime" } },
        );
      }
      output.push(toolMessage(entry, view));
      const trailingMedia = toToolResultMediaUserParts(entry.content, {
        apiFormat: view.apiFormat,
        providerKind: view.providerKind,
        stripMedia: view.stripMedia,
        inputFormat: view.inputFormat,
        toolName: entry.toolName,
      });
      pendingToolMedia.push(...trailingMedia);
    }
  }
  flushToolMedia();
  return output as AiSdkModelMessage[];
}
