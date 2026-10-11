// SPDX-License-Identifier: Apache-2.0
// Windows 采样：解析 `tasklist /FO CSV /NH`，只返回请求集合内的 PID。
import {
  runProbeCommand,
  type ProcessProbeExecFile,
  type ProcessProbeSample,
} from "./process-probe-shared.js";

const TASKLIST = "tasklist";
const TASKLIST_ARGS = ["/FO", "CSV", "/NH"];
/** CSV 列位：0=映像名、1=PID、4=内存（会话列在中间，共 5 列）。 */
const PID_COLUMN = 1;
const MEMORY_COLUMN = 4;
const REQUIRED_COLUMNS = MEMORY_COLUMN + 1;

/** 逐字符扫描一行 CSV：引号内的逗号不分列，双写引号表示字面引号；未闭合则整行作废。 */
function splitCsv(line: string): string[] | undefined {
  const cells: string[] = [];
  let current = "";
  let quoted = false;
  for (let index = 0; index < line.length; index += 1) {
    const character = line[index]!;
    if (character === '"') {
      if (quoted && line[index + 1] === '"') {
        current += '"';
        index += 1;
      } else {
        quoted = !quoted;
      }
      continue;
    }
    if (character === "," && !quoted) {
      cells.push(current);
      current = "";
      continue;
    }
    current += character;
  }
  if (quoted) return undefined;
  cells.push(current);
  return cells;
}

function memoryKb(cell: string): number | undefined {
  const digits = cell.replace(/[^0-9]/gu, "");
  if (digits.length === 0) return undefined;
  const value = Number(digits);
  return Number.isFinite(value) ? value : undefined;
}

export async function readWindowsProcessMemory(
  execFile: ProcessProbeExecFile,
  pids: readonly number[],
): Promise<readonly ProcessProbeSample[]> {
  const wanted = new Set(pids);
  const text = await runProbeCommand(execFile, TASKLIST, TASKLIST_ARGS, { windowsHide: true });
  const samples: ProcessProbeSample[] = [];
  for (const rawLine of text.split(/\r?\n/u)) {
    const cells = splitCsv(rawLine.trim());
    if (cells === undefined || cells.length < REQUIRED_COLUMNS) continue;
    const pid = Number(cells[PID_COLUMN]);
    if (!Number.isFinite(pid) || !wanted.has(pid)) continue;
    const rssKb = memoryKb(cells[MEMORY_COLUMN]!);
    if (rssKb === undefined) continue;
    samples.push({ pid, rssKb });
  }
  return samples;
}
