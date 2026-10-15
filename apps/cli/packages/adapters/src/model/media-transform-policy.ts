// SPDX-License-Identifier: Apache-2.0
// 输入媒体能力判定与 data URL 解析：投影层据此把「模型不支持的媒体」换成占位文案，
// 或把 data URL 拆成 mediaType + 数据两段。占位文案是对外可见文本，逐字保持。

import type { ModelInputFormat, ModelMessageContentBlock } from "@knorvia/contracts";

const DATA_URL = /^data:([^;,]+);base64,([A-Za-z0-9+/=\r\n]+)$/u;
const LINE_BREAKS = /[\r\n]/gu;

export function dataUrlToDataContent(raw: string): { mediaType: string; data: string } | undefined {
  const matched = DATA_URL.exec(raw);
  if (matched === null) return undefined;
  return { mediaType: matched[1] as string, data: (matched[2] as string).replace(LINE_BREAKS, "") };
}

function rejectionLabel(
  chunk: ModelMessageContentBlock,
  capabilities: ModelInputFormat,
): string | false {
  const kind = chunk.type;
  const lowered = "mediaType" in chunk ? chunk.mediaType.toLowerCase() : "";
  if (kind === "image") return capabilities.supportsImage ? false : "image input";
  if (kind === "video" || (kind === "file" && lowered.startsWith("video/")))
    return capabilities.supportsVideo ? false : "video input";
  if (kind === "file" && lowered.split(";", 1)[0] === "application/pdf" && "dataUrl" in chunk)
    return capabilities.supportsPdf ? false : "PDF input";
  return false;
}

export function unsupportedInputMediaText(
  chunk: ModelMessageContentBlock,
  capabilities: ModelInputFormat | undefined,
): string | undefined {
  if (!capabilities) return undefined;
  const rejected = rejectionLabel(chunk, capabilities);
  if (rejected === false) return undefined;
  const lowered = "mediaType" in chunk ? chunk.mediaType.toLowerCase() : "";
  const label = "name" in chunk && chunk.name ? chunk.name : lowered || chunk.type;
  return `[Attached ${label}]\n[Media omitted from provider request because the selected model does not support ${rejected}.]`;
}
