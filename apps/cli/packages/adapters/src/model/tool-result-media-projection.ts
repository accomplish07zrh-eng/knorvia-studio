// SPDX-License-Identifier: MIT
// Knorvia independent replacement; per-file review pending.
import type { ModelMessage as AiSdkModelMessage } from "ai";
import type { ModelInputFormat, ModelMessageContent } from "@knorvia/contracts";
import { containsOfficialCuaImageRefCredentialText } from "@knorvia/cua/frame-contract";
import { dataUrlToDataContent, unsupportedInputMediaText } from "./media-transform-policy.js";
type AiSdkUserContent = Extract<AiSdkModelMessage, { role: "user" }>["content"];
type AiSdkUserContentParts = Extract<AiSdkUserContent, unknown[]>;
interface ToolResultMediaProjectionOptions {
  apiFormat?: string;
  providerKind?: "openai" | "anthropic" | "openai-compatible" | "gateway" | "custom";
  stripMedia?: boolean;
  inputFormat?: ModelInputFormat;
  toolName: string;
}
export function shouldTextifyStructuredToolResults(
  options: Pick<ToolResultMediaProjectionOptions, "apiFormat" | "providerKind">,
): boolean {
  return (
    options.providerKind === "openai-compatible" || options.apiFormat === "openai-chat-completions"
  );
}
function blocks(content: ModelMessageContent) {
  return typeof content === "string" ? [] : content;
}
export function toolResultHasVideoMedia(content: ModelMessageContent): boolean {
  return blocks(content).some(
    (block) =>
      (block.type === "video" || block.type === "file") &&
      block.mediaType.toLowerCase().startsWith("video/") &&
      "dataUrl" in block &&
      Boolean(block.dataUrl),
  );
}
export function toStructuredToolResultText(
  content: ModelMessageContent,
  options: Pick<ToolResultMediaProjectionOptions, "inputFormat"> = {},
): string {
  if (typeof content === "string") return content;
  return content
    .map((block) => {
      const unsupported = unsupportedInputMediaText(block, options.inputFormat);
      if (unsupported) return unsupported;
      if (block.type === "text") return block.text;
      if (block.type === "reasoning") return "";
      if (block.type === "file" && block.text) return block.text;
      if (block.type === "resource_link")
        return `[Resource: ${block.title ?? block.name ?? block.uri}]`;
      return `[Attached ${"mediaType" in block ? block.mediaType : "media"}]`;
    })
    .filter(Boolean)
    .join("\n\n");
}
function deliverable(
  block: ReturnType<typeof blocks>[number],
  options: Pick<ToolResultMediaProjectionOptions, "stripMedia" | "inputFormat">,
): boolean {
  if (options.stripMedia || unsupportedInputMediaText(block, options.inputFormat)) return false;
  return (
    (block.type === "image" || block.type === "video" || block.type === "file") &&
    "dataUrl" in block &&
    typeof block.dataUrl === "string" &&
    dataUrlToDataContent(block.dataUrl) !== undefined
  );
}
export function toToolResultMediaUserParts(
  content: ModelMessageContent,
  options: ToolResultMediaProjectionOptions,
): AiSdkUserContentParts {
  if (typeof content === "string") return [] as unknown as AiSdkUserContentParts;
  const parts: unknown[] = [];
  for (let index = 0; index < content.length; index += 1) {
    const block = content[index];
    if (!deliverable(block, options)) continue;
    const parsed = dataUrlToDataContent((block as { dataUrl: string }).dataUrl)!;
    parts.push(
      block.type === "image"
        ? { type: "image", image: parsed.data, mediaType: parsed.mediaType }
        : {
            type: "file",
            data: parsed.data,
            mediaType: parsed.mediaType,
            filename: "name" in block ? block.name : undefined,
          },
    );
    const following = content[index + 1];
    if (following?.type === "text" && containsOfficialCuaImageRefCredentialText(following.text)) {
      parts.push({ type: "text", text: following.text });
      index += 1;
    }
  }
  return parts as AiSdkUserContentParts;
}
export function undeliverableFrameReferenceText(
  content: ModelMessageContent,
  options: Pick<ToolResultMediaProjectionOptions, "stripMedia" | "inputFormat">,
): string | undefined {
  if (typeof content === "string") return undefined;
  for (let index = 0; index < content.length; index += 1) {
    const block = content[index];
    if (block.type !== "text" || !containsOfficialCuaImageRefCredentialText(block.text)) continue;
    if (index === 0 || !deliverable(content[index - 1], options))
      return "Tool result omitted because its frame reference media could not be delivered to the selected model.";
  }
  return undefined;
}
