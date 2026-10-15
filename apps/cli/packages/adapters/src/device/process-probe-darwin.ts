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
/**
 * 单个时间分量：历史实现对 `ps` 的 cputime 一直很宽容——容忍前导正负号与空串、
 * 接受小数秒（`1.23456`、`0:0.001`）与科学计数（`1e2`）；只有非数字与负数才拒绝。
 */
function componentSeconds(text: string): number | undefined {
  const normalized = text.replace(/^[+-]/u, "");
  if (normalized === "") return 0;
  const value = Number(normalized);
  return Number.isFinite(value) && value >= 0 ? value : undefined;
}

/** `[dd-]hh:mm[:ss]` → 毫秒；分量过多或出现非法/负数时返回 undefined。 */
function clockToMillis(text: string): number | undefined {
  const daySplit = text.split("-");
  if (daySplit.length > 2) return undefined;
  const days = daySplit.length === 2 ? componentSeconds(daySplit[0]!) : 0;
  if (days === undefined) return undefined;
  const parts = (daySplit[daySplit.length - 1] ?? "").split(":");
  if (parts.length > WEIGHT.length) return undefined;
  let seconds = days * SECONDS_PER_DAY;
  // 末位恒为秒；向左依次是分、时（`1:` 是一分钟，`1::2` 是一时零分两秒）。
  for (let index = 0; index < parts.length; index += 1) {
    const value = componentSeconds(parts[parts.length - 1 - index]!);
    if (value === undefined) return undefined;
    seconds += value * WEIGHT[index]!;
  }
  return Math.round(seconds * MILLIS_PER_SECOND);
}

/** cputime 列：解析不了就按缺列处理（该行仍然保留）。 */
function cpuMillis(cell: string | undefined): number | undefined {
  if (cell === undefined) return undefined;
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
