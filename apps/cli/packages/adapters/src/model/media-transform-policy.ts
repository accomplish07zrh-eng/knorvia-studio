// SPDX-License-Identifier: MIT
// Knorvia independent replacement; per-file review pending.
import type { ModelInputFormat, ModelMessageContentBlock } from "@knorvia/contracts";

export function dataUrlToDataContent(
  dataUrl: string,
): { mediaType: string; data: string } | undefined {
  const match = /^data:([^;,]+);base64,([A-Za-z0-9+/=\r\n]+)$/.exec(dataUrl);
  return match ? { mediaType: match[1], data: match[2].replace(/[\r\n]/g, "") } : undefined;
}

export function unsupportedInputMediaText(
  block: ModelMessageContentBlock,
  inputFormat: ModelInputFormat | undefined,
): string | undefined {
  if (!inputFormat) return undefined;
  const type = block.type;
  const mediaType = "mediaType" in block ? block.mediaType.toLowerCase() : "";
  const unsupported =
    type === "image"
      ? !inputFormat.supportsImage && "image input"
      : type === "video" || (type === "file" && mediaType.startsWith("video/"))
        ? !inputFormat.supportsVideo && "video input"
        : type === "file" && mediaType.split(";", 1)[0] === "application/pdf" && "dataUrl" in block
          ? !inputFormat.supportsPdf && "PDF input"
          : false;
  if (!unsupported) return undefined;
  const label = "name" in block && block.name ? block.name : mediaType || type;
  return `[Attached ${label}]\n[Media omitted from provider request because the selected model does not support ${unsupported}.]`;
}
