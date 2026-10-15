// SPDX-License-Identifier: Apache-2.0
// 采样形状与基础判定：进程行、样本、失败类型。
export interface ProcessProbeSample {
  pid: number;
  rssKb: number;
  cpuTimeMs?: number;
}

export interface ProcessProbeCommandResult {
  error?: unknown;
  status: number | null;
  stderr: string;
  stdout: string;
}

export type ProcessProbeExecFile = (
  file: string,
  args: readonly string[],
  options: import("node:child_process").ExecFileOptionsWithStringEncoding,
) => Promise<ProcessProbeCommandResult>;

export interface ProcessRelation {
  cpuTimeMs?: number;
  parentPid?: number;
  pid: number;
  processGroupId?: number;
}

export interface ProcessRow extends ProcessRelation {
  rssKb: number;
}

/** 单次采样的绝对截止（毫秒）；三平台共用。 */
export const PROCESS_PROBE_SAMPLE_TIMEOUT_MS = 1_000;

export class ProcessProbeFailure extends Error {}

/** 可采样的 PID：正整数整数。 */
export function isSamplablePid(pid: number): boolean {
  return Number.isInteger(pid) && pid > 0;
}

/** 行 → 采样；`cpuTimeMs` 缺席时不写入该字段。 */
export function toSample(row: ProcessRow): ProcessProbeSample {
  const shaped = { pid: row.pid, rssKb: row.rssKb } as ProcessProbeSample;
  if (row.cpuTimeMs !== undefined) shaped.cpuTimeMs = row.cpuTimeMs;
  return shaped;
}

/** 探测树的可见范围：Windows 只报直接进程，其余平台报整棵树。 */
export type ProcessTreeScope = "direct_process" | "process_tree";

export interface ProcessProbe {
  sampleProcessTrees(
    rootPids: readonly number[],
  ): Promise<ReadonlyMap<number, readonly ProcessProbeSample[]> | undefined>;
  sampleProcessGroup(processGroupId: number): Promise<readonly ProcessProbeSample[] | undefined>;
  reset(): void;
  readonly treeScope: ProcessTreeScope;
}

export interface CreateProcessProbeOptions {
  execFile?: ProcessProbeExecFile;
  listProcDirectory?: () => Promise<readonly string[]>;
  onSampleFailed?: (reason: string) => void;
  platform?: NodeJS.Platform;
  readProcFile?: (path: string) => Promise<string>;
}

/** Linux 采样器需要的最小读取面；由工厂注入，测试可给假实现。 */
export interface LinuxProcReaders {
  listProcDirectory: () => Promise<readonly string[]>;
  readProcFile: (path: string) => Promise<string>;
  isExpired?: () => boolean;
}
