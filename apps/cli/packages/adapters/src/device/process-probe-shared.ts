// SPDX-License-Identifier: Apache-2.0
// Modified by Knorvia Studio: implemented from the frozen process-probe contract, 2026-09-30.
import {
  execFile as nodeExecFile,
  type ExecFileOptionsWithStringEncoding,
} from "node:child_process";

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
  options: ExecFileOptionsWithStringEncoding,
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
export const PROCESS_PROBE_SAMPLE_TIMEOUT_MS = 1000;
const COMMAND_OUTPUT_LIMIT = 8 * 1024 * 1024;
export class ProcessProbeFailure extends Error {}

export function isSamplablePid(pid: number): boolean {
  return Number.isInteger(pid) && pid > 0;
}
export function toSample(row: ProcessRow): ProcessProbeSample {
  const sample: ProcessProbeSample = { pid: row.pid, rssKb: row.rssKb };
  if (row.cpuTimeMs !== undefined) sample.cpuTimeMs = row.cpuTimeMs;
  return sample;
}

/** 关系按输入边建立；同 PID 的最后一行只覆盖样本，不能抹掉此前父子边。 */
export function collectProcessTreePids(
  relations: readonly ProcessRelation[],
  rootPids: readonly number[],
): ReadonlyMap<number, readonly number[]> {
  const known = new Set(relations.map((row) => row.pid));
  const children = new Map<number | undefined, number[]>();
  for (const row of relations) {
    const siblings = children.get(row.parentPid) ?? [];
    siblings.push(row.pid);
    children.set(row.parentPid, siblings);
  }
  const trees = new Map<number, readonly number[]>();
  for (const root of rootPids) {
    if (!known.has(root)) continue;
    const pending = [root];
    const visited = new Set<number>();
    const members: number[] = [];
    while (pending.length) {
      const pid = pending.pop()!;
      if (visited.has(pid)) continue;
      visited.add(pid);
      members.push(pid);
      const next = children.get(pid) ?? [];
      for (let index = next.length - 1; index >= 0; index--) pending.push(next[index]!);
    }
    trees.set(root, members);
  }
  return trees;
}

export function groupProcessTrees(
  rows: readonly ProcessRow[],
  rootPids: readonly number[],
): ReadonlyMap<number, readonly ProcessProbeSample[]> {
  const latest = new Map(rows.map((row) => [row.pid, row]));
  const trees = collectProcessTreePids(rows, rootPids);
  return new Map(
    [...trees].map(([root, members]) => [root, members.map((pid) => toSample(latest.get(pid)!))]),
  );
}

export async function runProbeCommand(
  execFile: ProcessProbeExecFile,
  file: string,
  args: readonly string[],
  extraOptions?: Partial<ExecFileOptionsWithStringEncoding>,
): Promise<string> {
  const response = await execFile(file, args, {
    encoding: "utf8",
    maxBuffer: COMMAND_OUTPUT_LIMIT,
    timeout: PROCESS_PROBE_SAMPLE_TIMEOUT_MS,
    ...extraOptions,
  });
  if (response.status !== 0 || response.error)
    throw new ProcessProbeFailure(
      `${file} 采样失败: ${response.stderr.trim() || String(response.status)}`,
    );
  return response.stdout;
}

export function defaultProbeExecFile(
  file: string,
  args: readonly string[],
  options: ExecFileOptionsWithStringEncoding,
): Promise<ProcessProbeCommandResult> {
  return new Promise((resolve) => {
    nodeExecFile(file, args, options, (error, stdout, stderr) => {
      if (!error) {
        resolve({ status: 0, stderr, stdout });
        return;
      }
      resolve({
        error,
        status: typeof error.code === "number" ? error.code : null,
        stderr,
        stdout,
      });
    });
  });
}
