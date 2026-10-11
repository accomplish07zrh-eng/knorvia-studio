// SPDX-License-Identifier: Apache-2.0
// 桩：只含 interface.md 列出的导出与签名，函数体抛 not implemented。
// 仅用于「桩替换后契约测试全部失败」的验证与替换阶段的起始状态。

export function finish(
  request: FileSystemSearchTextRequest,
  startedAt: number,
  hits: SearchHits,
): FileSystemSearchTextResult {
  throw new Error("not implemented: apps-cli-packages-01");
}

export function parseOutput(
  text: string,
  root: string,
  request: FileSystemSearchTextRequest,
): SearchHits {
  throw new Error("not implemented: apps-cli-packages-01");
}

export async function sortFiles(paths: string[]): Promise<string[]> {
  throw new Error("not implemented: apps-cli-packages-01");
}

export function ripgrepFailure(stderr: string, path: string, pattern: string): Error {
  throw new Error("not implemented: apps-cli-packages-01");
}
