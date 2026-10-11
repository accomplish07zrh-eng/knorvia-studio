// SPDX-License-Identifier: Apache-2.0
// 桩：只含 interface.md 列出的导出与签名，函数体抛 not implemented。
// 仅用于「桩替换后契约测试全部失败」的验证与替换阶段的起始状态。

export const VCS_NAMES = [".git", ".svn", ".hg", ".bzr", ".jj", ".sl"] as const;

export function posixRelative(root: string, file: string): string {
  throw new Error("not implemented: apps-cli-packages-01");
}

export function glob(pattern: string): (relativePath: string, fileName: string) => boolean {
  throw new Error("not implemented: apps-cli-packages-01");
}

export const TYPE_EXTENSIONS: never = undefined as never;

export function fileType(type: string): string {
  throw new Error("not implemented: apps-cli-packages-01");
}

export function matchesType(path: string, type: string): boolean {
  throw new Error("not implemented: apps-cli-packages-01");
}

export function filter(
  root: string,
  request: FileSystemSearchTextRequest,
): (path: string) => boolean {
  throw new Error("not implemented: apps-cli-packages-01");
}

export async function walk(
  root: string,
  signal: AbortSignal | undefined,
  visit: (path: string, info: Awaited<ReturnType<typeof stat>>) => Promise<void> | void,
): Promise<void> {
  throw new Error("not implemented: apps-cli-packages-01");
}

export async function candidates(
  path: string,
  info: Awaited<ReturnType<typeof stat>>,
  request: FileSystemSearchTextRequest,
  signal?: AbortSignal,
): Promise<Candidate[]> {
  throw new Error("not implemented: apps-cli-packages-01");
}

export function recent(a: Candidate, b: Candidate): number {
  throw new Error("not implemented: apps-cli-packages-01");
}
