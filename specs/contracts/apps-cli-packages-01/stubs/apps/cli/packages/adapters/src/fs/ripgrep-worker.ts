// SPDX-License-Identifier: Apache-2.0
// 桩：只含 interface.md 列出的导出与签名，函数体抛 not implemented。
// 仅用于「桩替换后契约测试全部失败」的验证与替换阶段的起始状态。

export class RipgrepRuntimeFailure extends Error {
  constructor(..._args: never[]) {
    super("not implemented: apps-cli-packages-01");
    throw new Error("not implemented: apps-cli-packages-01");
  }
}

export function setRipgrepWorkerFactoryForTests(
  factory: RipgrepWorkerFactory | undefined,
): () => void {
  throw new Error("not implemented: apps-cli-packages-01");
}

export function setRipgrepTimeoutMsForTests(timeoutMs: number | undefined): () => void {
  throw new Error("not implemented: apps-cli-packages-01");
}

export async function runSearch(
  args: string[],
  preopens: Record<string, string>,
  signal?: AbortSignal,
): Promise<RipgrepBufferedResult> {
  throw new Error("not implemented: apps-cli-packages-01");
}
