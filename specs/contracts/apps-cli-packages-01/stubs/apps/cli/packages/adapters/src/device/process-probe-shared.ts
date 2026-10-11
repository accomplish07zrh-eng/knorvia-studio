// SPDX-License-Identifier: Apache-2.0
// 桩：只含 interface.md 列出的导出与签名，函数体抛 not implemented。
// 仅用于「桩替换后契约测试全部失败」的验证与替换阶段的起始状态。

export const PROCESS_PROBE_SAMPLE_TIMEOUT_MS = 1000;

export class ProcessProbeFailure extends Error {
  constructor(..._args: never[]) {
    super("not implemented: apps-cli-packages-01");
    throw new Error("not implemented: apps-cli-packages-01");
  }
}

export function isSamplablePid(pid: number): boolean {
  throw new Error("not implemented: apps-cli-packages-01");
}

export function toSample(row: ProcessRow): ProcessProbeSample {
  throw new Error("not implemented: apps-cli-packages-01");
}

export function collectProcessTreePids(
  relations: readonly ProcessRelation[],
  rootPids: readonly number[],
): ReadonlyMap<number, readonly number[]> {
  throw new Error("not implemented: apps-cli-packages-01");
}

export function groupProcessTrees(
  rows: readonly ProcessRow[],
  rootPids: readonly number[],
): ReadonlyMap<number, readonly ProcessProbeSample[]> {
  throw new Error("not implemented: apps-cli-packages-01");
}

export async function runProbeCommand(
  execFile: ProcessProbeExecFile,
  file: string,
  args: readonly string[],
  extraOptions?: Partial<ExecFileOptionsWithStringEncoding>,
): Promise<string> {
  throw new Error("not implemented: apps-cli-packages-01");
}

export function defaultProbeExecFile(
  file: string,
  args: readonly string[],
  options: ExecFileOptionsWithStringEncoding,
): Promise<ProcessProbeCommandResult> {
  throw new Error("not implemented: apps-cli-packages-01");
}
