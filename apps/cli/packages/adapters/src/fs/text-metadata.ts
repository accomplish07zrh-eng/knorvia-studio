// SPDX-License-Identifier: Apache-2.0
// 文本元数据：编码探测/解码/编码、流式解码器与行尾归一。
import { StringDecoder } from "node:string_decoder";
import { TextDecoder } from "node:util";
import {
  createFileSystemError,
  type FileSystemLineEndings,
  type FileSystemTextEncoding,
} from "@knorvia/contracts";
import iconv from "iconv-lite";

const CHINESE_ENCODINGS = ["gb2312", "gbk", "gb18030"] as const;
const MAX_INCOMPLETE_SUFFIX = 3;
const CONTROL_FRACTION = 0.3;
const LF = "\n";
const CRLF = "\r\n";
const UTF8_BOM = [0xef, 0xbb, 0xbf] as const;
const UTF16LE_BOM = [0xff, 0xfe] as const;
/** 传输编码不需要行尾归一：它们本来就是字节级载体。 */
const TRANSPORT_ENCODINGS = new Set(["base64", "base64url", "hex"]);
const LINE_BREAKS = /\r?\n/gu;

type Encoding = FileSystemTextEncoding;
type ChineseEncoding = (typeof CHINESE_ENCODINGS)[number];

interface DecodedText {
  content: string;
  encoding: Encoding;
}

interface StreamingTextDecoder {
  write(buffer: Buffer): string;
  end(): string;
}

/** 一种编码族的三个能力：整块解码、整块编码、开流式解码器。 */
interface CodecKit {
  decode(buffer: Buffer, encoding: Encoding): string;
  encode(content: string, encoding: Encoding): Buffer;
  openStream(encoding: Encoding): StreamingTextDecoder;
}

function isChinese(encoding: Encoding): encoding is ChineseEncoding {
  return CHINESE_ENCODINGS.includes(encoding as ChineseEncoding);
}

/** iconv 族：中文编码的整块与流式转换都交给 iconv。 */
const ICONV_KIT: CodecKit = {
  decode: (buffer, encoding) => iconv.decode(buffer, encoding),
  encode: (content, encoding) => iconv.encode(content, encoding),
  openStream(encoding) {
    const state = iconv.getDecoder(encoding);
    const stream = {} as StreamingTextDecoder;
    stream.write = (buffer) => state.write(buffer);
    stream.end = () => state.end() ?? "";
    return stream;
  },
};

/** 原生族：Buffer 与 StringDecoder 已覆盖 utf8/utf16le/latin1/ascii 等。 */
const NATIVE_KIT: CodecKit = {
  decode: (buffer, encoding) => buffer.toString(encoding),
  encode: (content, encoding) => Buffer.from(content, encoding),
  openStream(encoding) {
    const state = new StringDecoder(encoding);
    const stream = {} as StreamingTextDecoder;
    stream.write = (buffer) => state.write(buffer);
    stream.end = () => state.end();
    return stream;
  },
};

/** 同一编码的完整读取、写入与流式解码由同一个 kit 选择边界负责。 */
function kitFor(encoding: Encoding): CodecKit {
  return isChinese(encoding) ? ICONV_KIT : NATIVE_KIT;
}

function encodingError(code: string, message: string, path?: string): Error {
  return createFileSystemError({ code, message, path });
}

function unsupported(path?: string): Error {
  const suffix = path ? `: ${path}` : "";
  return encodingError("unsupported", `Unsupported or binary text encoding${suffix}`, path);
}

function startsWithBytes(buffer: Buffer, prefix: readonly number[]): boolean {
  return prefix.every((byte, index) => buffer[index] === byte);
}

/** NUL 与过多控制字符都视为二进制；UTF-16 已由 BOM 提前返回，不在此列。 */
function assertTextual(buffer: Buffer, path?: string): void {
  let controls = 0;
  for (const byte of buffer) {
    if (byte === 0) throw unsupported(path);
    if (byte < 9 || (byte > 13 && byte < 32)) controls += 1;
  }
  if (controls / buffer.length > CONTROL_FRACTION) throw unsupported(path);
}

function isFatalUtf8(buffer: Buffer): boolean {
  try {
    new TextDecoder("utf-8", { fatal: true }).decode(buffer);
    return true;
  } catch {
    return false;
  }
}

/** 采样可能恰好切断中文字符：只有可逐字节往返的非空前缀才算命中。 */
function roundTripsAsChinese(buffer: Buffer, encoding: ChineseEncoding): boolean {
  const kit = kitFor(encoding);
  const shortest = Math.max(1, buffer.length - MAX_INCOMPLETE_SUFFIX);
  for (let end = buffer.length; end >= shortest; end -= 1) {
    const prefix = buffer.subarray(0, end);
    if (kit.encode(kit.decode(prefix, encoding), encoding).equals(prefix)) return true;
  }
  return false;
}

export function detectTextEncoding(buffer: Buffer, path?: string): Encoding {
  // BOM 的权重高于内容中的 NUL；UTF-16 文件不能先经二进制筛选。
  if (startsWithBytes(buffer, UTF8_BOM)) return "utf8";
  if (startsWithBytes(buffer, UTF16LE_BOM)) return "utf16le";
  assertTextual(buffer, path);
  if (isFatalUtf8(buffer)) return "utf8";
  for (const encoding of CHINESE_ENCODINGS) {
    if (roundTripsAsChinese(buffer, encoding)) return encoding;
  }
  throw unsupported(path);
}

export function decodeTextBuffer(request: {
  buffer: Buffer;
  encoding?: Encoding;
  path?: string;
}): DecodedText {
  const encoding = request.encoding ?? detectTextEncoding(request.buffer, request.path);
  const decoded = {} as DecodedText;
  decoded.content = kitFor(encoding).decode(request.buffer, encoding);
  decoded.encoding = encoding;
  return decoded;
}

export function encodeTextContent(request: {
  content: string;
  encoding?: Encoding;
  path?: string;
}): Buffer {
  const encoding = request.encoding ?? "utf8";
  const kit = kitFor(encoding);
  const bytes = kit.encode(request.content, encoding);
  const roundTripped = !isChinese(encoding) || kit.decode(bytes, encoding) === request.content;
  if (roundTripped) return bytes;
  const suffix = request.path ? `: ${request.path}` : "";
  throw encodingError(
    "unsupported",
    `Content cannot be encoded as ${encoding}${suffix}`,
    request.path,
  );
}

export function createStreamingTextDecoder(encoding: Encoding): StreamingTextDecoder {
  return kitFor(encoding).openStream(encoding);
}

export function shouldNormalizeLineEndings(encoding: Encoding): boolean {
  return !TRANSPORT_ENCODINGS.has(encoding.toLowerCase());
}

/** 行尾判定：统计 CRLF 与裸 LF 的数量，CRLF 更多即视为 CRLF 文件。 */
export function detectLineEndings(content: string): FileSystemLineEndings {
  let crlf = 0;
  let bare = 0;
  for (const lineBreak of content.matchAll(LINE_BREAKS)) {
    if (lineBreak[0].length === CRLF.length) crlf += 1;
    else bare += 1;
  }
  return crlf > bare ? "CRLF" : "LF";
}

export function normalizeLineEndings(content: string): string {
  return content.replaceAll(CRLF, LF);
}

export function applyRequestedLineEndings(
  content: string,
  lineEndings: FileSystemLineEndings | undefined,
): string {
  if (lineEndings === undefined) return content;
  const normalized = normalizeLineEndings(content);
  if (lineEndings === "LF") return normalized;
  return normalized.replaceAll(LF, CRLF);
}
