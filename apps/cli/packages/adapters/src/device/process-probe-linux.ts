// SPDX-License-Identifier: Apache-2.0
// Linux /proc 采样：stat 关系表 + status 里的 VmRSS，按批读取并在批间检查截止。
import {
  collectProcessTreePids,
  isSamplablePid,
  ProcessProbeFailure,
  toSample,
  type ProcessProbeSample,
  type ProcessRelation,
} from "./process-probe-shared.js";

export interface LinuxProcReaders {
  listProcDirectory: () => Promise<readonly string[]>;
  readProcFile: (path: string) => Promise<string>;
  isExpired?: () => boolean;
}

const PROC_ROOT = "/proc";
const BATCH_SIZE = 64;
const TICKS_PER_SECOND = 100;
const MILLIS_PER_SECOND = 1_000;
const PID_ONLY = /^\d+$/u;
const VM_RSS = /^VmRSS:\s+(\d+)\s*kB$/mu;
const STAT_TAIL = ")";
/** `stat` 在进程名之后依次是 state/ppid/pgrp/…；这里只需要四个下标。 */
const TAIL_FIELD = { parent: 1, group: 2, systemTicks: 12, userTicks: 11 } as const;

function expired(readers: LinuxProcReaders): boolean {
  return readers.isExpired?.() === true;
}

function assertFresh(readers: LinuxProcReaders): void {
  if (expired(readers)) throw new ProcessProbeFailure("/proc 扫描超时");
}

/** 从 `${PROC_ROOT}/<pid>/stat` 的一行里取 ppid/pgrp/utime+stime。 */
function relationFromStat(pid: number, source: string): ProcessRelation | undefined {
  const nameEnd = source.lastIndexOf(STAT_TAIL);
  if (nameEnd < 0) return undefined;
  const fields = source
    .slice(nameEnd + 1)
    .trim()
    .split(/\s+/u);
  const parentPid = Number(fields[TAIL_FIELD.parent]);
  const processGroupId = Number(fields[TAIL_FIELD.group]);
  const userTicks = Number(fields[TAIL_FIELD.userTicks]);
  const systemTicks = Number(fields[TAIL_FIELD.systemTicks]);
  const usable =
    Number.isInteger(parentPid) &&
    parentPid >= 0 &&
    Number.isInteger(processGroupId) &&
    Number.isFinite(userTicks) &&
    Number.isFinite(systemTicks);
  if (!usable) return undefined;
  const relation = { pid, parentPid, processGroupId } as ProcessRelation;
  relation.cpuTimeMs = Math.round(
    ((userTicks + systemTicks) / TICKS_PER_SECOND) * MILLIS_PER_SECOND,
  );
  return relation;
}

/** 分批读取：批内并发、批间检查截止；单个 pid 的失败只跳过自己。 */
async function readInBatches<T>(
  readers: LinuxProcReaders,
  pids: readonly number[],
  readOne: (pid: number) => Promise<T | undefined>,
): Promise<T[]> {
  const collected: T[] = [];
  for (let start = 0; start < pids.length; start += BATCH_SIZE) {
    const slice = pids.slice(start, start + BATCH_SIZE);
    const batch = await Promise.all(
      slice.map(async (pid) => await readOne(pid).catch(() => undefined)),
    );
    assertFresh(readers);
    for (const row of batch) {
      if (row !== undefined) collected.push(row);
    }
  }
  return collected;
}

async function readRelations(readers: LinuxProcReaders): Promise<ProcessRelation[]> {
  assertFresh(readers);
  const names = await readers.listProcDirectory().catch((error: unknown) => {
    throw new ProcessProbeFailure(`/proc 不可读: ${String(error)}`);
  });
  const pids = names
    .filter((name) => PID_ONLY.test(name))
    .map((name) => Number(name))
    .filter(isSamplablePid);
  return await readInBatches(readers, pids, async (pid) =>
    relationFromStat(pid, await readers.readProcFile(`${PROC_ROOT}/${pid}/stat`)),
  );
}

async function sampleRows(
  readers: LinuxProcReaders,
  rows: readonly ProcessRelation[],
): Promise<ProcessProbeSample[]> {
  assertFresh(readers);
  const byPid = new Map(rows.map((row) => [row.pid, row]));
  const pids = [...byPid.keys()];
  return await readInBatches(readers, pids, async (pid) => {
    const status = await readers.readProcFile(`${PROC_ROOT}/${pid}/status`);
    const rss = VM_RSS.exec(status);
    if (rss === null) return undefined;
    const rssKb = Number(rss[1]);
    if (!Number.isFinite(rssKb)) return undefined;
    return toSample({ ...byPid.get(pid)!, rssKb });
  });
}

async function sampleSelected(
  readers: LinuxProcReaders,
  selected: Iterable<number>,
  byPid: ReadonlyMap<number, ProcessRelation>,
): Promise<Map<number, ProcessProbeSample>> {
  const rows = [...selected].map((pid) => byPid.get(pid)!);
  const samples = await sampleRows(readers, rows);
  return new Map(samples.map((row) => [row.pid, row]));
}

export async function sampleLinuxProcessTrees(
  readers: LinuxProcReaders,
  rootPids: readonly number[],
): Promise<ReadonlyMap<number, readonly ProcessProbeSample[]>> {
  const table = await readRelations(readers);
  const trees = collectProcessTreePids(table, rootPids);
  const byPid = new Map(table.map((row) => [row.pid, row]));
  return await buildTreeResult(readers, trees, byPid);
}

async function buildTreeResult(
  readers: LinuxProcReaders,
  trees: ReadonlyMap<number, readonly number[]>,
  byPid: ReadonlyMap<number, ProcessRelation>,
): Promise<ReadonlyMap<number, readonly ProcessProbeSample[]>> {
  const observed = await sampleSelected(readers, [...trees.values()].flat(), byPid);
  const result = new Map<number, readonly ProcessProbeSample[]>();
  for (const [root, members] of trees) {
    const samples: ProcessProbeSample[] = [];
    for (const pid of members) {
      const sample = observed.get(pid);
      if (sample !== undefined) samples.push(sample);
    }
    result.set(root, samples);
  }
  return result;
}

export async function sampleLinuxProcessGroup(
  readers: LinuxProcReaders,
  processGroupId: number,
): Promise<readonly ProcessProbeSample[]> {
  const table = await readRelations(readers);
  return await sampleRows(
    readers,
    table.filter((row) => row.processGroupId === processGroupId),
  );
}
