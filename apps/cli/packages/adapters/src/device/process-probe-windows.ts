// SPDX-License-Identifier: Apache-2.0
// Modified by Knorvia Studio: implemented from the frozen process-probe contract, 2026-09-30.
import {
  runProbeCommand,
  type ProcessProbeExecFile,
  type ProcessProbeSample,
} from "./process-probe-shared.js";
const TASKLIST = "tasklist";
const PID_COLUMN = 1;
const MEMORY_COLUMN = 4;

function columns(line: string): string[] | undefined {
  const cells: string[] = [];
  let value = "";
  let quoted = false;
  for (let index = 0; index < line.length; index++) {
    const char = line[index];
    if (char === '"') {
      if (quoted && line[index + 1] === '"') {
        value += '"';
        index++;
      } else quoted = !quoted;
    } else if (char === "," && !quoted) {
      cells.push(value);
      value = "";
    } else value += char;
  }
  if (quoted) return undefined;
  cells.push(value);
  return cells;
}

export async function readWindowsProcessMemory(
  execFile: ProcessProbeExecFile,
  pids: readonly number[],
): Promise<readonly ProcessProbeSample[]> {
  const selected = new Set(pids);
  const text = await runProbeCommand(execFile, TASKLIST, ["/FO", "CSV", "/NH"], {
    windowsHide: true,
  });
  const samples: ProcessProbeSample[] = [];
  for (const line of text.split(/\r?\n/)) {
    const cells = columns(line.trim());
    if (!cells || cells.length <= MEMORY_COLUMN) continue;
    const pid = Number(cells[PID_COLUMN]);
    if (!Number.isFinite(pid) || !selected.has(pid)) continue;
    const digits = cells[MEMORY_COLUMN]!.replace(/[^0-9]/g, "");
    if (!digits) continue;
    const rssKb = Number(digits);
    if (Number.isFinite(rssKb)) samples.push({ pid, rssKb });
  }
  return samples;
}
