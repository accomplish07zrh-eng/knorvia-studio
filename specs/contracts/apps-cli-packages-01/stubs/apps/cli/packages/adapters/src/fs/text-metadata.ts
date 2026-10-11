// SPDX-License-Identifier: Apache-2.0
// 桩：只含 interface.md 列出的导出与签名，函数体抛 not implemented。
// 仅用于「桩替换后契约测试全部失败」的验证与替换阶段的起始状态。

export function detectTextEncoding(buffer: Buffer, path?: string): FileSystemTextEncoding {
  throw new Error("not implemented: apps-cli-packages-01");
}

export function decodeTextBuffer(request: {
  buffer: Buffer;
  encoding?: FileSystemTextEncoding;
  path?: string;
}): DecodedTextBuffer {
  throw new Error("not implemented: apps-cli-packages-01");
}

export function encodeTextContent(request: {
  content: string;
  encoding?: FileSystemTextEncoding;
  path?: string;
}): Buffer {
  throw new Error("not implemented: apps-cli-packages-01");
}

export function createStreamingTextDecoder(encoding: FileSystemTextEncoding): StreamingTextDecoder {
  throw new Error("not implemented: apps-cli-packages-01");
}

export function shouldNormalizeLineEndings(encoding: FileSystemTextEncoding): boolean {
  throw new Error("not implemented: apps-cli-packages-01");
}

export function detectLineEndings(content: string): FileSystemLineEndings {
  throw new Error("not implemented: apps-cli-packages-01");
}

export function normalizeLineEndings(content: string): string {
  throw new Error("not implemented: apps-cli-packages-01");
}

export function applyRequestedLineEndings(
  content: string,
  lineEndings: FileSystemLineEndings | undefined,
): string {
  throw new Error("not implemented: apps-cli-packages-01");
}
