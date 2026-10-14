// SPDX-License-Identifier: Apache-2.0
// macOS 采样：解析 `ps` 输出（整表四列 / 进程组三列），cputime 折算成毫秒。
import { runProbeCommand } from "./probe-command.js";
import { isSamplablePid, type ProcessProbeExecFile, type ProcessRow } from "./probe-types.js";

const PS = "ps";
const TABLE_QUERY = ["-eo", "pid=,ppid=,rss=,cputime="];
const GROUP_QUERY = ["-o", "pid=,rss=,cputime="];
const SECONDS_PER_DAY = 24 * 60 * 60;
const MILLIS_PER_SECOND = 1_000;
/** 从最低位开始的时间分量权重：秒、分、小时。 */
const WEIGHT = [1, 60, 60 * 60];
/** ps 的 cputime 列：`[dd-]hh:mm[:ss]`。 */
const ELAPSED_TEXT = /^\d+(?:-\d+)?(?::\d+){1,3}$/u;

/** `[dd-]hh:mm[:ss]` → 毫秒；段数过多或出现负数/非数字时返回 undefined。 */
function clockToMillis(text: string): number | undefined {
  const daySplit = text.split("-");
  if (daySplit.length > 2) return undefined;
  const days = daySplit.length === 2 ? Number(daySplit[0]) : 0;
  if (!Number.isFinite(days) || days < 0) return undefined;
  const units = (daySplit[daySplit.length - 1] ?? "").split(":").map(Number);
  if (units.length > WEIGHT.length) return undefined;
  if (units.some((unit) => !Number.isFinite(unit) || unit < 0)) return undefined;
  let seconds = days * SECONDS_PER_DAY;
  for (let index = 0; index < units.length; index += 1) {
    seconds += units[units.length - 1 - index]! * WEIGHT[index]!;
  }
  return Math.round(seconds * MILLIS_PER_SECOND);
}

/** cputime 列：看起来不像时间就直接给 undefined（该行仍然保留）。 */
function cpuMillis(cell: string | undefined): number | undefined {
  if (cell === undefined || !ELAPSED_TEXT.test(cell)) return undefined;
  return clockToMillis(cell);
}

interface Columns {
  parentIndex?: number;
  pidIndex: number;
  rssIndex: number;
}

/** 一行按空白切分并逐列校验；列数不符或关键列为负时整行丢弃。 */
function rowFromCells(cells: string[], columns: Columns): ProcessRow | undefined {
  const pid = Number(cells[columns.pidIndex]);
  const rssKb = Number(cells[columns.rssIndex]);
  if (!isSamplablePid(pid) || !Number.isFinite(rssKb) || rssKb < 0) return undefined;
  const row = { pid, rssKb } as ProcessRow;
  if (columns.parentIndex !== undefined) {
    const parentPid = Number(cells[columns.parentIndex]);
    if (!Number.isInteger(parentPid) || parentPid < 0) return undefined;
    row.parentPid = parentPid;
  }
  const cpuTimeMs = cpuMillis(cells[cells.length - 1]);
  if (cpuTimeMs !== undefined) row.cpuTimeMs = cpuTimeMs;
  return row;
}

function parseTable(source: string, columns: Columns): ProcessRow[] {
  const expected = columns.parentIndex === undefined ? 3 : 4;
  const rows: ProcessRow[] = [];
  for (const line of source.split(/\r?\n/u)) {
    const cells = line.trim().split(/\s+/u);
    if (cells.length !== expected) continue;
    const row = rowFromCells(cells, columns);
    if (row !== undefined) rows.push(row);
  }
  return rows;
}

export async function readDarwinProcessTable(
  execFile: ProcessProbeExecFile,
): Promise<readonly ProcessRow[]> {
  return parseTable(await runProbeCommand(execFile, PS, TABLE_QUERY), {
    parentIndex: 1,
    pidIndex: 0,
    rssIndex: 2,
  });
}

export async function readDarwinProcessGroup(
  execFile: ProcessProbeExecFile,
  processGroupId: number,
): Promise<readonly ProcessRow[]> {
  const query = [...GROUP_QUERY, "-g", String(processGroupId)];
  return parseTable(await runProbeCommand(execFile, PS, query), { pidIndex: 0, rssIndex: 1 });
}
