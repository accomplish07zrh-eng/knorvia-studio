// SPDX-License-Identifier: Apache-2.0
// macOS 采样：解析 `ps` 输出（整表四列 / 进程组三列），cputime 折算成毫秒。
import {
  isSamplablePid,
  runProbeCommand,
  type ProcessProbeExecFile,
  type ProcessRow,
} from "./process-probe-shared.js";

const PS = "ps";
const TABLE_ARGS = ["-eo", "pid=,ppid=,rss=,cputime="];
const GROUP_PREFIX_ARGS = ["-o", "pid=,rss=,cputime="];
const SECONDS_PER_DAY = 24 * 60 * 60;
const MILLIS_PER_SECOND = 1_000;
/** 从最低位开始的时间分量权重：秒、分、小时。 */
const COMPONENT_WEIGHTS = [1, 60, 60 * 60];

/** `[dd-]hh:mm[:ss]` → 毫秒；段数过多或出现负数/非数字时返回 undefined。 */
function elapsedMs(text: string): number | undefined {
  const segments = text.split("-");
  if (segments.length > 2) return undefined;
  const days = segments.length === 2 ? Number(segments[0]) : 0;
  const clock = (segments[segments.length - 1] ?? "").split(":").map(Number);
  if (clock.length > COMPONENT_WEIGHTS.length) return undefined;
  if (!Number.isFinite(days) || days < 0) return undefined;
  if (clock.some((value) => !Number.isFinite(value) || value < 0)) return undefined;
  let seconds = days * SECONDS_PER_DAY;
  for (let index = 0; index < clock.length; index += 1) {
    seconds += clock[clock.length - 1 - index]! * COMPONENT_WEIGHTS[index]!;
  }
  return Math.round(seconds * MILLIS_PER_SECOND);
}

/** 解析一行；列数不等于期望值时整行丢弃。 */
function rowFromLine(line: string, includeParent: boolean): ProcessRow | undefined {
  const fields = line.trim().split(/\s+/u);
  const expected = includeParent ? 4 : 3;
  if (fields.length !== expected) return undefined;
  const pid = Number(fields[0]);
  const rssKb = Number(fields[includeParent ? 2 : 1]);
  const parentPid = includeParent ? Number(fields[1]) : undefined;
  if (!isSamplablePid(pid) || !Number.isFinite(rssKb) || rssKb < 0) return undefined;
  if (parentPid !== undefined && (!Number.isInteger(parentPid) || parentPid < 0)) return undefined;
  const row = { pid, rssKb } as ProcessRow;
  if (parentPid !== undefined) row.parentPid = parentPid;
  const cpuTimeMs = elapsedMs(fields[expected - 1]!);
  if (cpuTimeMs !== undefined) row.cpuTimeMs = cpuTimeMs;
  return row;
}

function parseRows(source: string, includeParent: boolean): ProcessRow[] {
  const rows: ProcessRow[] = [];
  for (const line of source.split(/\r?\n/u)) {
    const row = rowFromLine(line, includeParent);
    if (row !== undefined) rows.push(row);
  }
  return rows;
}

export async function readDarwinProcessTable(
  execFile: ProcessProbeExecFile,
): Promise<readonly ProcessRow[]> {
  return parseRows(await runProbeCommand(execFile, PS, TABLE_ARGS), true);
}

export async function readDarwinProcessGroup(
  execFile: ProcessProbeExecFile,
  processGroupId: number,
): Promise<readonly ProcessRow[]> {
  const args = [...GROUP_PREFIX_ARGS, "-g", String(processGroupId)];
  return parseRows(await runProbeCommand(execFile, PS, args), false);
}
