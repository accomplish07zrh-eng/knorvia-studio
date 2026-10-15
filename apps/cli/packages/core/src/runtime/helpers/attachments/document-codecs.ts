// SPDX-License-Identifier: Apache-2.0
// PDF 与视频附件的内联解析（B5）。
// PDF 的门槛最严：媒体类型必须是 application/pdf、头部带 base64 参数、载荷通过严格校验、
// 解码后的字节以 `%PDF-` 魔数开头，且单文件不超过 PDF_INPUT_MAX_BYTES（20 MiB）；视频只
// 要求 `video/*` + 严格载荷。任何一条不满足都返回 undefined，绝不抛异常；魔数与扩展名判定
// 与平台无关，路径比较统一先小写化。

import type { ReadVideoOutput } from "@knorvia/contracts";
import { base64PayloadByteLength, isStrictBase64Payload } from "./data-url-codec.js";

export type VideoInputMimeType = ReadVideoOutput["mimeType"];

const MIB = 1024 * 1024;
// PDF 单文件输入上限：超过即由上层转为路径引用，不再走内联解析。
export const PDF_INPUT_MAX_BYTES: number = 20 * MIB;

const PDF_MEDIA_TYPE = "application/pdf";
const BASE64_PARAMETER = "base64";
const SCHEME = "data:";
// `%PDF-` 的五个 ASCII 字节，把「声称是 PDF」与「真的是 PDF」分开。
const PDF_MAGIC: readonly number[] = [0x25, 0x50, 0x44, 0x46, 0x2d];

// 视频扩展名 → 媒体类型；表外扩展名无法在模型请求里声明视频类型。
const VIDEO_EXTENSION_MEDIA: Readonly<Record<string, VideoInputMimeType>> = {
  ".avi": "video/x-msvideo",
  ".m4v": "video/x-m4v",
  ".mkv": "video/x-matroska",
  ".mov": "video/quicktime",
  ".mp4": "video/mp4",
  ".webm": "video/webm",
};

type InlinePdf = {
  // 解码后的 PDF 字节；调用方用它做体积核算与产物写入。
  bytes: Buffer;
  mediaType: "application/pdf";
  sizeBytes: number;
};

type InlineVideo = {
  mediaType: string;
  // 载荷的解码体积（按 base64 长度折算），用于媒体预算判断。
  sizeBytes: number;
};

export function parseInlinePdfDataUrl(source: string): InlinePdf | undefined {
  const segments = splitDataUrl(source);
  if (!segments) {
    // 非 data URL 形态：没有可解析的头部。
    return undefined;
  }
  const accepted =
    segments.header.mediaType === PDF_MEDIA_TYPE &&
    segments.header.parameters.at(-1)?.trim().toLowerCase() === BASE64_PARAMETER &&
    isStrictBase64Payload(segments.payload);
  if (!accepted) {
    // 媒体类型、base64 参数、严格载荷三者有一个不满足即放弃内联解析。
    return undefined;
  }
  const decoded = Buffer.from(segments.payload, "base64");
  if (!hasPdfMagic(decoded)) {
    return undefined;
  }
  return {
    bytes: decoded,
    mediaType: PDF_MEDIA_TYPE,
    sizeBytes: base64PayloadByteLength(segments.payload),
  };
}

// 判定解码字节是否以 `%PDF-` 开头；不足魔数长度的输入直接判否。
export function isPdfBytes(input: Uint8Array): boolean {
  return hasPdfMagic(input);
}

// 按扩展名推断视频媒体类型；大小写不敏感，表外扩展名返回 undefined。
export function inferVideoMimeFromPath(filePath: string): VideoInputMimeType | undefined {
  const lowered = filePath.toLowerCase();
  for (const [suffix, media] of Object.entries(VIDEO_EXTENSION_MEDIA)) {
    if (lowered.endsWith(suffix)) {
      return media;
    }
  }
  return undefined;
}

export function parseInlineVideoDataUrl(source: string): InlineVideo | undefined {
  const segments = splitDataUrl(source);
  if (!segments) {
    return undefined;
  }
  const parameters = segments.header.parameters;
  const onlyParameterIsBase64 =
    parameters.length === 1 && parameters[0]?.trim().toLowerCase() === BASE64_PARAMETER;
  const accepted =
    segments.header.mediaType.startsWith("video/") &&
    onlyParameterIsBase64 &&
    isStrictBase64Payload(segments.payload);
  if (!accepted) {
    return undefined;
  }
  return {
    mediaType: segments.header.mediaType,
    sizeBytes: base64PayloadByteLength(segments.payload),
  };
}

type DataUrlSegments = {
  header: { mediaType: string; parameters: string[] };
  payload: string;
};

// 拆解 data URL：scheme 大小写不敏感，逗号前是「媒体类型 + 参数段」，逗号后是载荷。
function splitDataUrl(source: string): DataUrlSegments | undefined {
  if (source.slice(0, SCHEME.length).toLowerCase() !== SCHEME) {
    return undefined;
  }
  const separator = source.indexOf(",");
  if (separator < 0) {
    return undefined;
  }
  const [declaredType = "", ...parameters] = source.slice(SCHEME.length, separator).split(";");
  return {
    header: { mediaType: declaredType.trim().toLowerCase(), parameters },
    payload: source.slice(separator + 1),
  };
}

function hasPdfMagic(input: Uint8Array): boolean {
  if (input.byteLength < PDF_MAGIC.length) {
    return false;
  }
  return PDF_MAGIC.every((byte, offset) => input[offset] === byte);
}
