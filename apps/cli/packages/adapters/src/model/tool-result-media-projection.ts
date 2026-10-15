// SPDX-License-Identifier: Apache-2.0
// 工具结果媒体投影：把结果里的图/视频/file 抽成随行 user 消息的媒体段，CUA 帧引用凭据文本
// 紧随媒体搬运；不可投递的帧引用整条结果换成固定提示。结构化文本化用于不收结构化输出的端。
// 固定提示文案是对外可见文本，逐字保持。

import type { ModelMessage as AiSdkModelMessage } from "ai";
import type { ModelInputFormat, ModelMessageContent } from "@knorvia/contracts";
import { containsOfficialCuaImageRefCredentialText } from "@knorvia/cua/frame-contract";
import { dataUrlToDataContent, unsupportedInputMediaText } from "./media-transform-policy.js";

type AiSdkUserContent = Extract<AiSdkModelMessage, { role: "user" }>["content"];
type AiSdkUserContentParts = Extract<AiSdkUserContent, unknown[]>;
type ContentBlock = NonNullable<Extract<ModelMessageContent, unknown[]>>[number];

interface ToolResultMediaProjectionOptions {
  apiFormat?: string; // provider API 形态
  providerKind?: "openai" | "anthropic" | "openai-compatible" | "gateway" | "custom"; // SDK 种类
  stripMedia?: boolean; // 媒体剥离开关
  inputFormat?: ModelInputFormat; // 模型输入能力表
  toolName: string; // 所属工具名（诊断用）
}

export function shouldTextifyStructuredToolResults(
  route: Pick<ToolResultMediaProjectionOptions, "apiFormat" | "providerKind">,
): boolean {
  const compatible = route.providerKind === "openai-compatible";
  return compatible || route.apiFormat === "openai-chat-completions";
}

function blocks(payload: ModelMessageContent): ContentBlock[] {
  return typeof payload === "string" ? [] : payload;
}

export function toolResultHasVideoMedia(payload: ModelMessageContent): boolean {
  for (const block of blocks(payload)) {
    const videoish = block.type === "video" || block.type === "file";
    if (!videoish) continue;
    const hasData = "dataUrl" in block && Boolean(block.dataUrl);
    if (hasData && block.mediaType.toLowerCase().startsWith("video/")) return true;
  }
  return false;
}

export function toStructuredToolResultText(
  payload: ModelMessageContent,
  view: Pick<ToolResultMediaProjectionOptions, "inputFormat"> = {},
): string {
  if (typeof payload === "string") return payload;
  const lines: string[] = [];
  for (const block of payload) {
    const unsupported = unsupportedInputMediaText(block, view.inputFormat);
    if (unsupported) {
      lines.push(unsupported);
      continue;
    }
    if (block.type === "text") {
      lines.push(block.text);
      continue;
    }
    if (block.type === "reasoning") {
      lines.push("");
      continue;
    }
    if (block.type === "file" && block.text) {
      lines.push(block.text);
      continue;
    }
    if (block.type === "resource_link") {
      lines.push(`[Resource: ${block.title ?? block.name ?? block.uri}]`);
      continue;
    }
    lines.push(`[Attached ${"mediaType" in block ? block.mediaType : "media"}]`);
  }
  return lines.filter(Boolean).join("\n\n");
}

function deliverable(
  block: ContentBlock,
  view: Pick<ToolResultMediaProjectionOptions, "stripMedia" | "inputFormat">,
): boolean {
  if (view.stripMedia || unsupportedInputMediaText(block, view.inputFormat)) return false;
  const carriesMedia = block.type === "image" || block.type === "video" || block.type === "file";
  if (!carriesMedia) return false;
  if (!("dataUrl" in block) || typeof block.dataUrl !== "string") return false;
  return dataUrlToDataContent(block.dataUrl) !== undefined;
}

function mediaPart(block: ContentBlock, parsed: { mediaType: string; data: string }): unknown {
  const shared = { mediaType: parsed.mediaType };
  if (block.type === "image") return { type: "image", image: parsed.data, ...shared };
  const filename = "name" in block ? block.name : undefined;
  return { type: "file", data: parsed.data, ...shared, filename };
}

export function toToolResultMediaUserParts(
  payload: ModelMessageContent,
  view: ToolResultMediaProjectionOptions,
): AiSdkUserContentParts {
  if (typeof payload === "string") return [] as unknown as AiSdkUserContentParts;
  const collected: unknown[] = [];
  let index = 0;
  while (index < payload.length) {
    const block = payload[index] as ContentBlock;
    if (!deliverable(block, view)) {
      ++index;
      continue;
    }
    const parsed = dataUrlToDataContent((block as { dataUrl: string }).dataUrl)!;
    collected.push(mediaPart(block, parsed));
    const follower = payload[index + 1] as ContentBlock | undefined;
    const credentialText =
      follower?.type === "text" && containsOfficialCuaImageRefCredentialText(follower.text);
    if (credentialText) {
      collected.push({ type: "text", text: (follower as { text: string }).text });
      ++index;
    }
    ++index;
  }
  return collected as AiSdkUserContentParts;
}

export function undeliverableFrameReferenceText(
  payload: ModelMessageContent,
  view: Pick<ToolResultMediaProjectionOptions, "stripMedia" | "inputFormat">,
): string | undefined {
  if (typeof payload === "string") return undefined;
  let cursor = 0;
  for (const block of payload) {
    const isCredential =
      block.type === "text" && containsOfficialCuaImageRefCredentialText(block.text);
    const previous = cursor > 0 ? (payload[cursor - 1] as ContentBlock) : undefined;
    const orphan = previous === undefined || !deliverable(previous, view);
    if (isCredential && orphan) {
      return "Tool result omitted because its frame reference media could not be delivered to the selected model.";
    }
    ++cursor;
  }
  return undefined;
}
