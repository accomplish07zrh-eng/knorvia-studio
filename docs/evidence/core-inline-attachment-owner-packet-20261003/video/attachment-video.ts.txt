import type { ReadVideoOutput } from "@knorvia/contracts";
import { base64PayloadByteLength, isStrictBase64Payload } from "./attachment-data-url.js";

export type VideoInputMimeType = ReadVideoOutput["mimeType"];

const VIDEO_PATH_MIME_TYPES: readonly (readonly [string, VideoInputMimeType])[] = [
  [".mp4", "video/mp4"],
  [".m4v", "video/x-m4v"],
  [".mov", "video/quicktime"],
  [".webm", "video/webm"],
  [".mkv", "video/x-matroska"],
  [".avi", "video/x-msvideo"],
];

export function inferVideoMimeFromPath(path: string): VideoInputMimeType | undefined {
  const lowerPath = path.toLowerCase();
  for (const [extension, mimeType] of VIDEO_PATH_MIME_TYPES) {
    if (lowerPath.endsWith(extension)) {
      return mimeType;
    }
  }
  return undefined;
}

export function parseInlineVideoDataUrl(dataUrl: string): {
  mediaType: string;
  sizeBytes: number;
} | undefined {
  const match = /^data:([^;,]+);base64,(.*)$/i.exec(dataUrl);
  const mediaType = match?.[1]?.toLowerCase();
  const payload = match?.[2];

  if (!mediaType?.startsWith("video/") || payload === undefined || !isStrictBase64Payload(payload)) {
    return undefined;
  }

  return {
    mediaType,
    sizeBytes: base64PayloadByteLength(payload),
  };
}
