// SPDX-License-Identifier: Apache-2.0
// 文本编解码的形状声明：编码别名、解码结果与「一种编码族的三个能力」。
import type { FileSystemTextEncoding } from "@knorvia/contracts";

export type Encoding = FileSystemTextEncoding;

export interface DecodedTextBuffer {
  content: string;
  encoding: Encoding;
}

export interface StreamingTextDecoder {
  write(buffer: Buffer): string;
  end(): string;
}

/** 一种编码族的三个能力：整块解码、整块编码、开流式解码器。 */
export interface CodecKit {
  toText(buffer: Buffer, encoding: Encoding): string;
  toBytes(content: string, encoding: Encoding): Buffer;
  streamer(encoding: Encoding): StreamingTextDecoder;
}
