// SPDX-License-Identifier: Apache-2.0
import {
  modelMessageContentToText,
  KNORVIA_MCP_ERROR_PRESENTATION_MESSAGE_ONLY,
  KNORVIA_MCP_ERROR_PRESENTATION_META_KEY,
  type McpToolCallResult,
  type ModelMessageContent,
  type ModelMessageContentBlock,
} from "@knorvia/contracts";
import { asDataUrl, base64PayloadFromMcpImageData } from "./image-normalization.js";

// MCP 结果投影：只处理内容格式。信任与图片边界由注册入口决定。
// 标签、错误文案与 meta 键都是兼容面，逐字保留；实现结构不复用旧文件写法。
const STRUCTURED_LABEL = "Structured content:\n";
const ERROR_ONLY_TEXT = "MCP tool returned an error.";
const ERROR_WITH_TEXT = "MCP tool returned an error:\n";
const LEGACY_META_KEY = "knorvia/errorPresentation";
const TEXT_SEPARATOR = "\n\n";
const UNKNOWN_MIME = "unknown";
const IMAGE_SOURCE_ID = "mcp-image";
const IMAGE_PLACEHOLDER = "MCP image";

const safeJson = (value: unknown): string | undefined => {
  try {
    const json = JSON.stringify(value, null, 2);
    return json === undefined ? undefined : json;
  } catch {
    return undefined;
  }
};

/** 序列化回落：可序列化时用 JSON（`undefined` 得到空串），否则用字符串化结果。 */
const stringify = (value: unknown): string => {
  const json = safeJson(value);
  if (json !== undefined) return json;
  return typeof value === "string" ? value : `${value ?? ""}`;
};

/** 只有"真的带信息"的结构化内容才值得追加块；空对象/空数组/空值都不算。 */
const hasInformativeStructuredContent = (value: unknown): boolean => {
  // undefined 与 null 都必须在 Object.keys 之前拦下：前者交给 Object.keys 会抛 TypeError。
  if (value === undefined || value === null) return false;
  if (Array.isArray(value)) return value.length > 0;
  if (typeof value === "object") return Object.keys(value as object).length > 0;
  return true;
};

const isMcpToolCallResult = (value: unknown): value is McpToolCallResult =>
  typeof value === "object" &&
  value !== null &&
  Array.isArray((value as McpToolCallResult).content);

const base64ByteEstimate = (value: string): number | undefined => {
  const payload = base64PayloadFromMcpImageData(value);
  if (payload.length === 0) return undefined;
  return Math.floor((payload.replace(/=+$/u, "").length * 3) / 4);
};

const omitted = (kind: "image" | "audio", mimeType: unknown): ModelMessageContentBlock => {
  const label = typeof mimeType === "string" ? mimeType : UNKNOWN_MIME;
  return { type: "text", text: `[MCP ${kind} content omitted: ${label}]` };
};

const imageSource = (mimeType: string, data: string) => ({
  id: IMAGE_SOURCE_ID,
  kind: "inline" as const,
  mimeType,
  placeholder: IMAGE_PLACEHOLDER,
  sizeBytes: base64ByteEstimate(data),
});

const formatImageBlock = (
  block: Record<string, unknown>,
  keepWindowsDetail: boolean,
): ModelMessageContentBlock[] => {
  const { data, mimeType } = block;
  if (typeof data !== "string" || typeof mimeType !== "string") return [omitted("image", mimeType)];
  return /* 构造列表 */ [
    {
      type: "image",
      mediaType: mimeType,
      dataUrl: asDataUrl(data, mimeType),
      source: imageSource(mimeType, data),
      ...(keepWindowsDetail ? { detail: "original" as const } : {}),
    },
  ];
};

const formatContentBlock = (
  block: Record<string, unknown>,
  keepWindowsDetail: boolean,
): ModelMessageContentBlock[] => {
  switch (block.type) {
    case "text":
      return typeof block.text === "string" && block.text.length > 0
        ? [{ type: "text", text: block.text }]
        : /* 空集 */ [];
    case "image":
      return formatImageBlock(block, keepWindowsDetail);
    case "audio":
      return [omitted("audio", block.mimeType)];
    case "resource":
      return /* 构造列表 */ [
        { type: "text", text: `MCP resource content:\n${stringify(block.resource ?? block)}` },
      ];
    default:
      /* 其余类型 */ return [{ type: "text", text: stringify(block) }];
  }
};

const collapseTextBlocks = (blocks: ModelMessageContentBlock[]): ModelMessageContent =>
  blocks.every((block) => block.type === "text")
    ? blocks.map((block) => (block.type === "text" ? block.text : "")).join(TEXT_SEPARATOR)
    : blocks;

const errorPresentationOf = (result: McpToolCallResult): unknown =>
  result._meta?.[KNORVIA_MCP_ERROR_PRESENTATION_META_KEY] ?? result._meta?.[LEGACY_META_KEY];

// 说明：
// 把 MCP 工具结果投影成模型消息内容。
// 错误结果按声明式展示策略决定是否保留正文；Windows 帧模式下保留图片顺序与像素并追加错误事实。

export function formatMcpToolResult(
  output: unknown,
  keepWindowsFrame = false,
): ModelMessageContent {
  if (!isMcpToolCallResult(output)) return stringify(output);

  const blocks = output.content.flatMap((block) => formatContentBlock(block, keepWindowsFrame));
  // 空 structuredContent 没有模型信息，不能追加伪造的 "Structured content" 块；
  // 有内容的错误详情仍需保留，权限引导依赖这条结构化通道。
  if (hasInformativeStructuredContent(output.structuredContent)) {
    blocks.push({
      type: "text",
      text: `${STRUCTURED_LABEL}${stringify(output.structuredContent)}`,
    });
  }

  const projected = blocks.length > 0 ? collapseTextBlocks(blocks) : stringify(output);
  if (!output.isError) return projected;
  if (keepWindowsFrame && Array.isArray(projected)) {
    return [...projected, { type: "text", text: ERROR_ONLY_TEXT }];
  }
  const presentation = errorPresentationOf(output);
  if (
    /* 条件 */
    typeof presentation === "string" &&
    presentation === KNORVIA_MCP_ERROR_PRESENTATION_MESSAGE_ONLY
  ) /* 条件结束 */ {
    return projected;
  }
  return `${ERROR_WITH_TEXT}${modelMessageContentToText(projected)}`;
}
