// SPDX-License-Identifier: Apache-2.0
// 桩：只含 interface.md 列出的导出与签名，函数体抛 not implemented。
// 仅用于「桩替换后契约测试全部失败」的验证与替换阶段的起始状态。

export function absolute(path: string): string {
  throw new Error("not implemented: apps-cli-packages-01");
}

export function code(error: unknown): unknown {
  throw new Error("not implemented: apps-cli-packages-01");
}

export function failure(error: unknown, path: string): Error {
  throw new Error("not implemented: apps-cli-packages-01");
}

export function aborted(signal?: AbortSignal): void {
  throw new Error("not implemented: apps-cli-packages-01");
}

export function abortError(message: string): Error {
  throw new Error("not implemented: apps-cli-packages-01");
}

export function nodeKind(info: {
  isFile(): boolean;
  isDirectory(): boolean;
  isSymbolicLink(): boolean;
}): FileSystemNodeKind {
  throw new Error("not implemented: apps-cli-packages-01");
}

export function regular(
  info: { isFile(): boolean; isDirectory(): boolean },
  path: string,
  kind: "text" | "binary",
): void {
  throw new Error("not implemented: apps-cli-packages-01");
}

export function revision(info: { mtimeMs: number; size: number }, bytes?: Buffer) {
  throw new Error("not implemented: apps-cli-packages-01");
}

export function byteCount(bytes: number): string {
  throw new Error("not implemented: apps-cli-packages-01");
}
