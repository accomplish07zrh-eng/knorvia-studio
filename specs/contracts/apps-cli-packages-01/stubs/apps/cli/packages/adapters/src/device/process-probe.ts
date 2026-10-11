// SPDX-License-Identifier: Apache-2.0
// 桩：只含 interface.md 列出的导出与签名，函数体抛 not implemented。
// 仅用于「桩替换后契约测试全部失败」的验证与替换阶段的起始状态。

export const PROCESS_PROBE_SAMPLE_TIMEOUT_MS: never = undefined as never;

export const ProcessProbeCommandResult: never = undefined as never;

export const ProcessProbeExecFile: never = undefined as never;

export const ProcessProbeSample: never = undefined as never;

export function createProcessProbe(options: CreateProcessProbeOptions = {}): ProcessProbe {
  throw new Error("not implemented: apps-cli-packages-01");
}
