// SPDX-License-Identifier: Apache-2.0
// 媒体类型归一化与取消检查：把外部传入的 MIME 收敛到 jimp 能编码的集合。
import { JimpMime } from "jimp";
import { detectImageMediaType } from "@knorvia/contracts";

/** jimp 能编码输出的 MIME 名单；成员判定与顺序无关。 */
const ENCODABLE_MIMES = [
  JimpMime.bmp,
  JimpMime.gif,
  JimpMime.jpeg,
  JimpMime.png,
  JimpMime.tiff,
] as const;
const PNG_FALLBACK = JimpMime.png;

type EncodableMime = (typeof ENCODABLE_MIMES)[number];

export { detectImageMediaType };

/** 可直传的输入 MIME（小写）→ 归一化结果；未列出的都退回 PNG。 */
const PASSTHROUGH_MEDIA_TYPES = new Map<string, string>([
  ["image/jpg", JimpMime.jpeg],
  ["image/jpeg", JimpMime.jpeg],
  ["image/png", JimpMime.png],
  ["image/gif", JimpMime.gif],
  ["image/webp", "image/webp"],
]);

function isEncodable(mime: string): mime is EncodableMime {
  return (ENCODABLE_MIMES as readonly string[]).includes(mime);
}

export function normalizeMediaType(mediaType: string): string {
  return PASSTHROUGH_MEDIA_TYPES.get(mediaType.toLowerCase()) ?? PNG_FALLBACK;
}

/** 请求的 MIME 优先，其次用解码结果，最后退回 PNG。 */
export function jimpOutputMediaType(
  requestedMime: string,
  detectedMime: string | undefined,
): EncodableMime {
  if (isEncodable(requestedMime)) return requestedMime;
  if (detectedMime !== undefined && isEncodable(detectedMime)) return detectedMime;
  return PNG_FALLBACK;
}

export function throwIfAborted(cancellation: AbortSignal | undefined): void {
  if (cancellation?.aborted) throw new Error("Image resize was cancelled");
}
