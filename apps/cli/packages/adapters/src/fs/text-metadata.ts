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
const TRANSPORT_ENCODINGS = new Set(["base64", "base64url", "hex"]);
type ChineseEncoding = (typeof CHINESE_ENCODINGS)[number];

interface DecodedTextBuffer {
  content: string;
  encoding: FileSystemTextEncoding;
}
interface StreamingTextDecoder {
  write(buffer: Buffer): string;
  end(): string;
}
interface TextCodec {
  decode(buffer: Buffer): string;
  encode(content: string): Buffer;
  stream(): StreamingTextDecoder;
}

function isChinese(encoding: FileSystemTextEncoding): encoding is ChineseEncoding {
  return CHINESE_ENCODINGS.includes(encoding as ChineseEncoding);
}

// 同一编码的完整读取、写入与流式解码由同一个 codec 选择边界负责。
function codec(encoding: FileSystemTextEncoding): TextCodec {
  if (isChinese(encoding)) {
    return {
      decode: (buffer) => iconv.decode(buffer, encoding),
      encode: (content) => iconv.encode(content, encoding),
      stream() {
        const state = iconv.getDecoder(encoding);
        return { write: (buffer) => state.write(buffer), end: () => state.end() ?? "" };
      },
    };
  }
  return {
    decode: (buffer) => buffer.toString(encoding),
    encode: (content) => Buffer.from(content, encoding),
    stream() {
      const state = new StringDecoder(encoding);
      return { write: (buffer) => state.write(buffer), end: () => state.end() };
    },
  };
}

function unsupported(path?: string): Error {
  return createFileSystemError({
    code: "unsupported",
    path,
    message: `Unsupported or binary text encoding${path ? `: ${path}` : ""}`,
  });
}

export function detectTextEncoding(buffer: Buffer, path?: string): FileSystemTextEncoding {
  // BOM 的权重高于内容中的 NUL；UTF-16 文件不能先经二进制筛选。
  if (buffer[0] === 0xef && buffer[1] === 0xbb && buffer[2] === 0xbf) return "utf8";
  if (buffer[0] === 0xff && buffer[1] === 0xfe) return "utf16le";
  let controls = 0;
  for (let index = 0; index < buffer.length; index++) {
    const byte = buffer[index]!;
    if (byte === 0) throw unsupported(path);
    if (byte < 9 || (byte > 13 && byte < 32)) controls++;
  }
  if (controls / buffer.length > CONTROL_FRACTION) throw unsupported(path);
  try {
    new TextDecoder("utf-8", { fatal: true }).decode(buffer);
    return "utf8";
  } catch {
    // 采样可能恰好切断中文字符，只有可逐字节往返的非空前缀可通过。
  }
  for (const encoding of CHINESE_ENCODINGS) {
    const conversion = codec(encoding);
    const shortest = Math.max(1, buffer.length - MAX_INCOMPLETE_SUFFIX);
    for (let end = buffer.length; end >= shortest; end--) {
      const prefix = buffer.subarray(0, end);
      if (conversion.encode(conversion.decode(prefix)).equals(prefix)) return encoding;
    }
  }
  throw unsupported(path);
}

export function decodeTextBuffer(request: {
  buffer: Buffer;
  encoding?: FileSystemTextEncoding;
  path?: string;
}): DecodedTextBuffer {
  const encoding = request.encoding ?? detectTextEncoding(request.buffer, request.path);
  return { content: codec(encoding).decode(request.buffer), encoding };
}

export function encodeTextContent(request: {
  content: string;
  encoding?: FileSystemTextEncoding;
  path?: string;
}): Buffer {
  const encoding = request.encoding ?? "utf8";
  const conversion = codec(encoding);
  const bytes = conversion.encode(request.content);
  if (isChinese(encoding) && conversion.decode(bytes) !== request.content) {
    throw createFileSystemError({
      code: "unsupported",
      path: request.path,
      message: `Content cannot be encoded as ${encoding}${request.path ? `: ${request.path}` : ""}`,
    });
  }
  return bytes;
}

export function createStreamingTextDecoder(encoding: FileSystemTextEncoding): StreamingTextDecoder {
  return codec(encoding).stream();
}

export function shouldNormalizeLineEndings(encoding: FileSystemTextEncoding): boolean {
  return !TRANSPORT_ENCODINGS.has(encoding.toLowerCase());
}

export function detectLineEndings(content: string): FileSystemLineEndings {
  let balance = 0;
  for (
    let newline = content.indexOf(LF);
    newline !== -1;
    newline = content.indexOf(LF, newline + 1)
  )
    balance += content[newline - 1] === "\r" ? 1 : -1;
  return balance > 0 ? "CRLF" : "LF";
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
  return lineEndings === "CRLF" ? normalized.replaceAll(LF, CRLF) : normalized;
}
