// SPDX-License-Identifier: Apache-2.0
// Modified by Knorvia Studio: implemented from the frozen process-probe contract, 2026-09-30.
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
const READ_BATCH_SIZE = 64;
const CLOCK_TICKS_PER_SECOND = 100;
const MILLISECONDS_PER_SECOND = 1000;
const PARENT_FIELD = 1;
const GROUP_FIELD = 2;
const USER_TICKS_FIELD = 11;
const SYSTEM_TICKS_FIELD = 12;

function checkDeadline(readers: LinuxProcReaders): void {
  if (readers.isExpired?.()) throw new ProcessProbeFailure("/proc 扫描超时");
}

function relation(pid: number, source: string): ProcessRelation | undefined {
  const close = source.lastIndexOf(")");
  if (close < 0) return undefined;
  const fields = source
    .slice(close + 1)
    .trim()
    .split(/\s+/);
  const parentPid = Number(fields[PARENT_FIELD]);
  const processGroupId = Number(fields[GROUP_FIELD]);
  const userTicks = Number(fields[USER_TICKS_FIELD]);
  const systemTicks = Number(fields[SYSTEM_TICKS_FIELD]);
  if (
    !Number.isInteger(parentPid) ||
    parentPid < 0 ||
    !Number.isInteger(processGroupId) ||
    !Number.isFinite(userTicks) ||
    !Number.isFinite(systemTicks)
  )
    return undefined;
  return {
    pid,
    parentPid,
    processGroupId,
    // 修复：有限小数 tick 仍按原秒→毫秒运算取整，不能改变历史浮点边界。
    cpuTimeMs: Math.round(
      ((userTicks + systemTicks) / CLOCK_TICKS_PER_SECOND) * MILLISECONDS_PER_SECOND,
    ),
  };
}

/** 每批 I/O 先一次性 admission，await 后检查截止；不伪造取消已进入的读取。 */
async function scan<T>(
  readers: LinuxProcReaders,
  pids: readonly number[],
  read: (pid: number) => Promise<T | undefined>,
): Promise<T[]> {
  const output: T[] = [];
  for (let start = 0; start < pids.length; start += READ_BATCH_SIZE) {
    const batch = await Promise.all(
      pids.slice(start, start + READ_BATCH_SIZE).map(async (pid) => {
        try {
          return await read(pid);
        } catch {
          return undefined;
        }
      }),
    );
    checkDeadline(readers);
    for (const row of batch) if (row !== undefined) output.push(row);
  }
  return output;
}

async function relations(readers: LinuxProcReaders): Promise<ProcessRelation[]> {
  checkDeadline(readers);
  let names: readonly string[];
  try {
    names = await readers.listProcDirectory();
  } catch (error) {
    throw new ProcessProbeFailure(`/proc 不可读: ${String(error)}`);
  }
  const pids = names
    .filter((name) => /^\d+$/.test(name))
    .map(Number)
    .filter(isSamplablePid);
  return scan(readers, pids, async (pid) =>
    relation(pid, await readers.readProcFile(`${PROC_ROOT}/${pid}/stat`)),
  );
}

async function samples(
  readers: LinuxProcReaders,
  rows: readonly ProcessRelation[],
): Promise<ProcessProbeSample[]> {
  checkDeadline(readers);
  const latest = new Map(rows.map((row) => [row.pid, row]));
  return scan(readers, [...latest.keys()], async (pid) => {
    const text = await readers.readProcFile(`${PROC_ROOT}/${pid}/status`);
    // 修复：单位前允许零个空白，保留旧 VmRSS 单行格式接受范围。
    const match = /^VmRSS:\s+(\d+)\s*kB$/mu.exec(text);
    if (!match) return undefined;
    const rssKb = Number(match[1]);
    if (!Number.isFinite(rssKb)) return undefined;
    return toSample({ ...latest.get(pid)!, rssKb });
  });
}

export async function sampleLinuxProcessTrees(
  readers: LinuxProcReaders,
  rootPids: readonly number[],
): Promise<ReadonlyMap<number, readonly ProcessProbeSample[]>> {
  const table = await relations(readers);
  const trees = collectProcessTreePids(table, rootPids);
  const selected = new Set([...trees.values()].flat());
  const byPid = new Map(table.map((row) => [row.pid, row]));
  const observed = new Map(
    (
      await samples(
        readers,
        [...selected].map((pid) => byPid.get(pid)!),
      )
    ).map((row) => [row.pid, row]),
  );
  return new Map(
    [...trees].map(([root, members]) => [
      root,
      members.flatMap((pid) => {
        const row = observed.get(pid);
        return row === undefined ? [] : [row];
      }),
    ]),
  );
}

export async function sampleLinuxProcessGroup(
  readers: LinuxProcReaders,
  processGroupId: number,
): Promise<readonly ProcessProbeSample[]> {
  const table = await relations(readers);
  return samples(
    readers,
    table.filter((row) => row.processGroupId === processGroupId),
  );
}
