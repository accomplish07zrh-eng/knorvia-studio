// SPDX-License-Identifier: Apache-2.0
// 桩：只含 interface.md 列出的导出与签名，函数体抛 not implemented。
// 仅用于「桩替换后契约测试全部失败」的验证与替换阶段的起始状态。

export async function prefix(path: string, capacity: number): Promise<Buffer> {
  throw new Error("not implemented: apps-cli-packages-01");
}

export async function bounded(
  path: string,
  capacity: number,
  initialSize: number,
): Promise<Buffer> {
  throw new Error("not implemented: apps-cli-packages-01");
}

export async function publish(path: string, bytes: Buffer): Promise<void> {
  throw new Error("not implemented: apps-cli-packages-01");
}
