// SPDX-License-Identifier: Apache-2.0
// 文本元数据公开面：解码/编码、流式解码器与行尾归一；探测实现在 text-encoding-detect。
import { createFileSystemError, type FileSystemLineEndings } from "@knorvia/contracts";
import { detectEncoding, isChineseEncoding, kitFor } from "./text-encoding-detect.js";
import type { DecodedText, Encoding, StreamingTextDecoder } from "./text-codec-types.js";

const LINE_FEED = "\n";
const CARRIAGE_RETURN = "\r\n";
/** 传输编码不需要行尾归一：它们本来就是字节级载体。 */
const BYTE_LEVEL_ENCODINGS = new Set(["base64", "base64url", "hex"]);
const LINE_BREAKS = /\r?\n/gu;

type MaybeLineEndings = FileSystemLineEndings | undefined;

/** 解码请求：encoding 省略时按内容探测。 */
interface DecodeRequest {
  buffer: Buffer;
  encoding?: Encoding;
  path?: string;
}

/** 编码请求：encoding 省略时按 utf8 写出。 */
interface EncodeRequest {
  content: string;
  encoding?: Encoding;
  path?: string;
}

export function detectTextEncoding(buffer: Buffer, path?: string): Encoding {
  return detectEncoding(buffer, path);
}

export function decodeTextBuffer(request: DecodeRequest): DecodedText {
  const encoding = request.encoding ?? detectEncoding(request.buffer, request.path);
  const decoded = {} as DecodedText;
  decoded.content = kitFor(encoding).toText(request.buffer, encoding);
  decoded.encoding = encoding;
  return decoded;
}

/** 中文编码写入前必须往返校验：不能无损表达时拒绝而不是静默替换。 */
function roundTripError(encoding: Encoding, path: string | undefined): Error {
  const suffix = path ? `: ${path}` : "";
  const message = `Content cannot be encoded as ${encoding}${suffix}`;
  return createFileSystemError({ code: "unsupported", message, path });
}

export function encodeTextContent(request: EncodeRequest): Buffer {
  const encoding = request.encoding ?? "utf8";
  const kit = kitFor(encoding);
  const bytes = kit.toBytes(request.content, encoding);
  const lossless = !isChineseEncoding(encoding) || kit.toText(bytes, encoding) === request.content;
  if (lossless) return bytes;
  throw roundTripError(encoding, request.path);
}

export function createStreamingTextDecoder(encoding: Encoding): StreamingTextDecoder {
  return kitFor(encoding).streamer(encoding);
}

export function shouldNormalizeLineEndings(encoding: Encoding): boolean {
  return !BYTE_LEVEL_ENCODINGS.has(encoding.toLowerCase());
}

/** 行尾判定：统计 CRLF 与裸 LF 的数量，CRLF 更多即视为 CRLF 文件。 */
export function detectLineEndings(content: string): FileSystemLineEndings {
  let crlf = 0;
  let bare = 0;
  for (const lineBreak of content.matchAll(LINE_BREAKS)) {
    if (lineBreak[0].length === CARRIAGE_RETURN.length) crlf += 1;
    else bare += 1;
  }
  return crlf > bare ? "CRLF" : "LF";
}

export function normalizeLineEndings(content: string): string {
  return content.split(CARRIAGE_RETURN).join(LINE_FEED);
}

export function applyRequestedLineEndings(content: string, lineEndings: MaybeLineEndings): string {
  if (lineEndings === undefined) return content;
  const converted = normalizeLineEndings(content);
  if (lineEndings === "LF") return converted;
  return converted.split(LINE_FEED).join(CARRIAGE_RETURN);
}
