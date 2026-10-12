// SPDX-License-Identifier: Apache-2.0
// 桩：只含 interface.md 列出的导出与签名，函数体抛 not implemented。
// 仅用于「桩替换后契约测试全部失败」的验证与替换阶段的起始状态。

export function setRipgrepWorkerFactoryForTests(
  factory: RipgrepWorkerFactory | undefined,
): () => void {
  throw new Error("not implemented: apps-cli-packages-01");
}

export function setRipgrepTimeoutMsForTests(timeoutMs: number | undefined): () => void {
  throw new Error("not implemented: apps-cli-packages-01");
}

export class NodeFileSystemAdapter {
  constructor(..._args: never[]) {
    throw new Error("not implemented: apps-cli-packages-01");
  }
}

export function createNodeFileSystemAdapter(
  options: NodeFileSystemAdapterOptions = {},
): NodeFileSystemAdapter {
  throw new Error("not implemented: apps-cli-packages-01");
}
