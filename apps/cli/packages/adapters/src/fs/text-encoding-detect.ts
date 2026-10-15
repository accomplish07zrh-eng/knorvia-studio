// SPDX-License-Identifier: Apache-2.0
// 编码探测与编解码族：BOM/控制字符判定、往返校验与 iconv/原生两套 kit。
import { StringDecoder } from "node:string_decoder";
import { TextDecoder } from "node:util";
import { createFileSystemError } from "@knorvia/contracts";
import iconv from "iconv-lite";
import type { CodecKit, Encoding, StreamingTextDecoder } from "./text-codec-types.js";

const CHINESE_ENCODINGS = ["gb2312", "gbk", "gb18030"] as const;
const MAX_INCOMPLETE_SUFFIX = 3;
const CONTROL_FRACTION = 0.3;
const UTF8_BOM = [0xef, 0xbb, 0xbf] as const;
const UTF16LE_BOM = [0xff, 0xfe] as const;

type ChineseEncoding = (typeof CHINESE_ENCODINGS)[number];

function isChinese(encoding: Encoding): encoding is ChineseEncoding {
  return CHINESE_ENCODINGS.includes(encoding as ChineseEncoding);
}

/** iconv 族：中文编码的整块与流式转换都交给 iconv。 */
const ICONV_KIT: CodecKit = {
  toText: (buffer, encoding) => iconv.decode(buffer, encoding),
  toBytes: (content, encoding) => iconv.encode(content, encoding),
  streamer(encoding) {
    const state = iconv.getDecoder(encoding);
    const stream = {} as StreamingTextDecoder;
    stream.write = (buffer) => state.write(buffer);
    stream.end = () => state.end() ?? "";
    return stream;
  },
};

/** 原生族：Buffer 与 StringDecoder 已覆盖 utf8/utf16le/latin1/ascii 等。 */
const NATIVE_KIT: CodecKit = {
  toText: (buffer, encoding) => buffer.toString(encoding as BufferEncoding),
  toBytes: (content, encoding) => Buffer.from(content, encoding as BufferEncoding),
  streamer(encoding) {
    const state = new StringDecoder(encoding as BufferEncoding);
    const stream = {} as StreamingTextDecoder;
    stream.write = (buffer) => state.write(buffer);
    stream.end = () => state.end();
    return stream;
  },
};

/** 同一编码的完整读取、写入与流式解码由同一个 kit 选择边界负责。 */
export function kitFor(encoding: Encoding): CodecKit {
  return isChinese(encoding) ? ICONV_KIT : NATIVE_KIT;
}

/** 中文编码判定：调用方据此决定是否需要往返校验与行尾归一。 */
export function isChineseEncoding(encoding: Encoding): boolean {
  return isChinese(encoding);
}

export function unsupportedEncoding(path?: string): Error {
  const suffix = path ? `: ${path}` : "";
  const message = `Unsupported or binary text encoding${suffix}`;
  return createFileSystemError({ code: "unsupported", message, path });
}

function startsWithBytes(buffer: Buffer, prefix: readonly number[]): boolean {
  return prefix.every((byte, index) => buffer[index] === byte);
}

/** NUL 与过多控制字符都视为二进制；UTF-16 已由 BOM 提前返回，不在此列。 */
function assertTextual(buffer: Buffer, path?: string): void {
  let controls = 0;
  for (const byte of buffer) {
    if (byte === 0) throw unsupportedEncoding(path);
    if (byte < 9 || (byte > 13 && byte < 32)) controls += 1;
  }
  if (controls / buffer.length > CONTROL_FRACTION) throw unsupportedEncoding(path);
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
    if (kit.toBytes(kit.toText(prefix, encoding), encoding).equals(prefix)) return true;
  }
  return false;
}

/** 探测顺序：UTF-8 BOM → UTF-16LE BOM → 文本性 → 严格 UTF-8 → 中文往返 → 不支持。 */
export function detectEncoding(buffer: Buffer, path?: string): Encoding {
  if (startsWithBytes(buffer, UTF8_BOM)) return "utf8";
  if (startsWithBytes(buffer, UTF16LE_BOM)) return "utf16le";
  assertTextual(buffer, path);
  if (isFatalUtf8(buffer)) return "utf8";
  for (const encoding of CHINESE_ENCODINGS) {
    if (roundTripsAsChinese(buffer, encoding)) return encoding;
  }
  throw unsupportedEncoding(path);
}
