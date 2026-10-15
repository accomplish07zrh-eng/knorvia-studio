// SPDX-License-Identifier: Apache-2.0
// Linux /proc 采样：先读 stat 建关系表，再按批读 status 取 VmRSS；批间检查绝对截止。
import { collectProcessTreePids } from "./probe-tree.js";
import {
  isSamplablePid,
  ProcessProbeFailure,
  toSample,
  type LinuxProcReaders,
  type ProcessProbeSample,
  type ProcessRelation,
} from "./probe-types.js";

export type { LinuxProcReaders } from "./probe-types.js";

const PROC_ROOT = "/proc";
const BATCH_SIZE = 64;
const TICKS_PER_SECOND = 100;
const MILLIS_PER_SECOND = 1_000;
const PID_NAME = /^\d+$/u;
const VM_RSS_LINE = /^VmRSS:\s+(\d+)\s*kB$/mu;
const STAT_TAIL_START = ")";
/** 进程名之后的有效字段位：state、ppid、pgrp、…、utime、stime。 */
const FIELD = { group: 2, parent: 1, stime: 12, utime: 11 } as const;

/** `/proc/<pid>/stat` 的某一字段（逗号/括号后的空白分隔段）。 */
function statFields(line: string): string[] | undefined {
  const tail = line.lastIndexOf(STAT_TAIL_START);
  if (tail < 0) return undefined;
  return line
    .slice(tail + 1)
    .trim()
    .split(/\s+/u);
}

function parseTicks(fields: string[]): number | undefined {
  const user = Number(fields[FIELD.utime]);
  const system = Number(fields[FIELD.stime]);
  if (!Number.isFinite(user) || !Number.isFinite(system)) return undefined;
  return Math.round(((user + system) / TICKS_PER_SECOND) * MILLIS_PER_SECOND);
}

/** stat 行 → 关系（含 CPU 毫秒）；字段缺失或越界时返回 undefined。 */
function parseStat(pid: number, line: string): ProcessRelation | undefined {
  const fields = statFields(line);
  if (fields === undefined) return undefined;
  const parentPid = Number(fields[FIELD.parent]);
  const processGroupId = Number(fields[FIELD.group]);
  const cpuTimeMs = parseTicks(fields);
  if (!Number.isInteger(parentPid) || parentPid < 0 || !Number.isInteger(processGroupId))
    return undefined;
  if (cpuTimeMs === undefined) return undefined;
  const relation = { pid, parentPid, processGroupId } as ProcessRelation;
  relation.cpuTimeMs = cpuTimeMs;
  return relation;
}

/** status 行 → VmRSS（kB）；没有该行返回 undefined。 */
function parseVmRss(status: string): number | undefined {
  const matched = VM_RSS_LINE.exec(status);
  if (matched === null) return undefined;
  const rssKb = Number(matched[1]);
  return Number.isFinite(rssKb) ? rssKb : undefined;
}

function assertFresh(io: LinuxProcReaders): void {
  if (io.isExpired?.() === true) throw new ProcessProbeFailure("/proc 扫描超时");
}

/** 分批读取：批内并发、批间检查截止；单个目标的失败只跳过自己。 */
async function readBatched<T>(
  io: LinuxProcReaders,
  targets: readonly number[],
  readOne: (pid: number) => Promise<T | undefined>,
): Promise<T[]> {
  const collected: T[] = [];
  for (let start = 0; start < targets.length; start += BATCH_SIZE) {
    const slice = targets.slice(start, start + BATCH_SIZE);
    const batch = await Promise.all(
      slice.map(async (pid) => await readOne(pid).catch(() => undefined)),
    );
    assertFresh(io);
    for (const row of batch) {
      if (row !== undefined) collected.push(row);
    }
  }
  return collected;
}

function kernelPids(names: readonly string[]): number[] {
  return names
    .filter((name) => PID_NAME.test(name))
    .map((name) => Number(name))
    .filter(isSamplablePid);
}

async function readRelations(io: LinuxProcReaders): Promise<ProcessRelation[]> {
  assertFresh(io);
  const names = await io.listProcDirectory().catch((error: unknown) => {
    throw new ProcessProbeFailure(`/proc 不可读: ${String(error)}`);
  });
  return await readBatched(io, kernelPids(names), async (pid) =>
    parseStat(pid, await io.readProcFile(`${PROC_ROOT}/${pid}/stat`)),
  );
}

async function sampleRelations(
  io: LinuxProcReaders,
  relations: readonly ProcessRelation[],
): Promise<ProcessProbeSample[]> {
  assertFresh(io);
  const byPid = new Map(relations.map((row) => [row.pid, row]));
  return await readBatched(io, [...byPid.keys()], async (pid) => {
    const rssKb = parseVmRss(await io.readProcFile(`${PROC_ROOT}/${pid}/status`));
    if (rssKb === undefined) return undefined;
    return toSample({ ...byPid.get(pid)!, rssKb });
  });
}

async function buildTrees(
  io: LinuxProcReaders,
  trees: ReadonlyMap<number, readonly number[]>,
  relations: readonly ProcessRelation[],
): Promise<ReadonlyMap<number, readonly ProcessProbeSample[]>> {
  const byPid = new Map(relations.map((row) => [row.pid, row]));
  const sampled = await sampleRelations(
    io,
    [...trees.values()].flat().map((pid) => byPid.get(pid)!),
  );
  const observed = new Map(sampled.map((row) => [row.pid, row]));
  const result = new Map<number, readonly ProcessProbeSample[]>();
  for (const [root, members] of trees) {
    const rows: ProcessProbeSample[] = [];
    for (const pid of members) {
      const row = observed.get(pid);
      if (row !== undefined) rows.push(row);
    }
    result.set(root, rows);
  }
  return result;
}

export async function sampleLinuxProcessTrees(
  readers: LinuxProcReaders,
  rootPids: readonly number[],
): Promise<ReadonlyMap<number, readonly ProcessProbeSample[]>> {
  const relations = await readRelations(readers);
  const trees = collectProcessTreePids(relations, rootPids);
  return await buildTrees(readers, trees, relations);
}

export async function sampleLinuxProcessGroup(
  readers: LinuxProcReaders,
  processGroupId: number,
): Promise<readonly ProcessProbeSample[]> {
  const relations = await readRelations(readers);
  return await sampleRelations(
    readers,
    relations.filter((row) => row.processGroupId === processGroupId),
  );
}
