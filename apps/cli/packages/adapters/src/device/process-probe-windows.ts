// SPDX-License-Identifier: Apache-2.0
// Windows 采样：解析 `tasklist /FO CSV /NH`，只返回请求集合内的 PID。
import { runProbeCommand } from "./probe-command.js";
import type { ProcessProbeExecFile, ProcessProbeSample } from "./probe-types.js";

const TASKLIST = "tasklist";
const TASKLIST_ARGS = ["/FO", "CSV", "/NH"];
/** CSV 列位：0=映像名、1=PID、4=内存（会话列在中间，必须凑满 5 列）。 */
const COLUMN = { memory: 4, pid: 1 } as const;
const COLUMNS_NEEDED = COLUMN.memory + 1;

const QUOTE = '"';
const SEPARATOR = ",";
const NON_DIGITS = /[^0-9]/gu;

/** 一行 CSV 的分列状态：引号内不切分，`""` 表示字面引号。 */
function splitCells(line: string): string[] | undefined {
  const cells: string[] = [];
  let buffer = "";
  let insideQuotes = false;
  let cursor = 0;
  while (cursor < line.length) {
    const character = line.charAt(cursor);
    if (character === QUOTE) {
      const doubled = insideQuotes && line.charAt(cursor + 1) === QUOTE;
      if (doubled) {
        buffer += QUOTE;
        cursor += 2;
        continue;
      }
      insideQuotes = !insideQuotes;
      cursor += 1;
      continue;
    }
    if (character === SEPARATOR && !insideQuotes) {
      cells.push(buffer);
      buffer = "";
      cursor += 1;
      continue;
    }
    buffer += character;
    cursor += 1;
  }
  if (insideQuotes) return undefined;
  cells.push(buffer);
  return cells;
}

/** 内存列（形如 `12,345 K`）→ kB；取不到数字时返回 undefined。 */
function parseMemoryKb(cell: string): number | undefined {
  const digits = cell.replace(NON_DIGITS, "");
  if (digits.length === 0) return undefined;
  const value = Number(digits);
  return Number.isFinite(value) ? value : undefined;
}

function rowSample(line: string, wanted: ReadonlySet<number>): ProcessProbeSample | undefined {
  const cells = splitCells(line.trim());
  if (cells === undefined || cells.length < COLUMNS_NEEDED) return undefined;
  const pid = Number(cells[COLUMN.pid]);
  if (!Number.isFinite(pid) || !wanted.has(pid)) return undefined;
  const rssKb = parseMemoryKb(cells[COLUMN.memory]!);
  return rssKb === undefined ? undefined : { pid, rssKb };
}

export async function readWindowsProcessMemory(
  probe: ProcessProbeExecFile,
  targets: readonly number[],
): Promise<readonly ProcessProbeSample[]> {
  const wanted = new Set(targets);
  const table = await runProbeCommand(probe, TASKLIST, TASKLIST_ARGS, { windowsHide: true });
  const samples: ProcessProbeSample[] = [];
  for (const line of table.split(/\r?\n/u)) {
    const sample = rowSample(line, wanted);
    if (sample !== undefined) samples.push(sample);
  }
  return samples;
}
