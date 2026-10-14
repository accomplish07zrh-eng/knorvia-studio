// SPDX-License-Identifier: Apache-2.0
// 图片媒体识别与 data URL 解析。
// 组织方式：魔数写成一张签名表（逐字节比对，短缓冲自然不匹配），data URL 解析拆成
// 「取分段 → 校验空白 → 校验 base64 → 归一化媒体类型」四步。

/** 识别得出的图片媒体类型；不在表里的字节序列一律返回 undefined。 */
export type DetectedImageMediaType = "image/png" | "image/jpeg" | "image/gif" | "image/webp";

/** data URL 解析结果：原始 base64、解码后的字节、规范化后的 data URL 与媒体类型。 */
export interface ParsedImageDataUrl {
  base64: string;
  data: Uint8Array;
  dataUrl: string;
  mediaType: string;
}

/** 解析选项：是否允许 base64 段里出现空白。 */
export interface ParseImageDataUrlOptions {
  allowWhitespace?: boolean;
}

/** 一种图片格式的魔数：`[相对起始的偏移, 期望字节]` 列表，全部命中才算这种格式。 */
interface ImageSignature {
  mediaType: DetectedImageMediaType;
  bytes: ReadonlyArray<readonly [offset: number, expected: number]>;
}

const IMAGE_SIGNATURES: readonly ImageSignature[] = [
  {
    mediaType: "image/png",
    bytes: [
      [0, 0x89],
      [1, 0x50],
      [2, 0x4e],
      [3, 0x47],
    ],
  },
  {
    mediaType: "image/jpeg",
    bytes: [
      [0, 0xff],
      [1, 0xd8],
      [2, 0xff],
    ],
  },
  {
    mediaType: "image/gif",
    bytes: [
      [0, 0x47],
      [1, 0x49],
      [2, 0x46],
    ],
  },
  {
    mediaType: "image/webp",
    bytes: [
      [0, 0x52],
      [1, 0x49],
      [2, 0x46],
      [3, 0x46],
      [8, 0x57],
      [9, 0x45],
      [10, 0x42],
      [11, 0x50],
    ],
  },
];

const DATA_URL_PATTERN = /^data:(image\/[a-z0-9.+_-]+);base64,([\s\S]+)$/i;
const BASE64_ALPHABET_PATTERN = /^[A-Za-z0-9+/]+={0,2}$/;
const WHITESPACE_PATTERN = /\s/;
const WHITESPACE_GLOBAL_PATTERN = /\s/g;
const JPEG_ALIAS = "image/jpg";
const JPEG_MEDIA_TYPE = "image/jpeg";

/** 按签名表识别图片格式；缓冲长度不足时对应偏移读不到字节，自然不匹配。 */
export function detectImageMediaType(buffer: Uint8Array): DetectedImageMediaType | undefined {
  const matched = IMAGE_SIGNATURES.find((signature) =>
    signature.bytes.every(([offset, expected]) => buffer[offset] === expected),
  );
  return matched?.mediaType;
}

/** base64 长度模 4 不能余 1（余 1 不是任何合法编码长度），字符集只允许标准字母表与最多两个补位等号。 */
function isValidBase64Payload(value: string): boolean {
  if (value.length % 4 === 1) return false;
  return BASE64_ALPHABET_PATTERN.test(value);
}

/** 解析 `data:image/...;base64,...`；不合法、空载荷或媒体类型不符时返回 undefined。 */
export function parseImageDataUrl(
  value: string,
  options: ParseImageDataUrlOptions = {},
): ParsedImageDataUrl | undefined {
  const dataUrl = value.trim();
  const segments = DATA_URL_PATTERN.exec(dataUrl);
  const [, rawMediaType, rawPayload] = segments ?? [];
  if (!rawMediaType || !rawPayload) return undefined;

  const allowWhitespace = options.allowWhitespace === true;
  if (!allowWhitespace && WHITESPACE_PATTERN.test(rawPayload)) return undefined;

  const base64 = allowWhitespace ? rawPayload.replace(WHITESPACE_GLOBAL_PATTERN, "") : rawPayload;
  if (!isValidBase64Payload(base64)) return undefined;

  const data = Buffer.from(base64, "base64");
  if (data.byteLength === 0) return undefined;

  const mediaType = normalizeImageMediaType(rawMediaType);
  return { base64, data, dataUrl: `data:${mediaType};base64,${base64}`, mediaType };
}

/** `image/jpg` 是常见别名，统一归一成 `image/jpeg`；其余只做小写化。 */
export function normalizeImageMediaType(value: string): string {
  const lowered = value.toLowerCase();
  return lowered === JPEG_ALIAS ? JPEG_MEDIA_TYPE : lowered;
}
