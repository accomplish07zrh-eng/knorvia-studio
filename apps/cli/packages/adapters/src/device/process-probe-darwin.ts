// SPDX-License-Identifier: Apache-2.0
// Modified by Knorvia Studio: implemented from the frozen process-probe contract, 2026-09-30.
import {
  isSamplablePid,
  runProbeCommand,
  type ProcessProbeExecFile,
  type ProcessRow,
} from "./process-probe-shared.js";
const PS = "ps";
const SECONDS_PER_DAY = 24 * 60 * 60;
const MILLISECONDS_PER_SECOND = 1000;
const COMPONENT_WEIGHTS = [1, 60, 60 * 60];

function elapsed(text: string): number | undefined {
  const segments = text.split("-");
  if (segments.length > 2) return undefined;
  const days = segments.length === 2 ? Number(segments[0]) : 0;
  const clock = (segments.at(-1) ?? "").split(":").map(Number);
  if (
    clock.length > COMPONENT_WEIGHTS.length ||
    !Number.isFinite(days) ||
    days < 0 ||
    clock.some((value) => !Number.isFinite(value) || value < 0)
  )
    return undefined;
  let seconds = days * SECONDS_PER_DAY;
  for (let index = 0; index < clock.length; index++)
    seconds += clock[clock.length - 1 - index]! * COMPONENT_WEIGHTS[index]!;
  return Math.round(seconds * MILLISECONDS_PER_SECOND);
}

function parse(source: string, includeParent: boolean): ProcessRow[] {
  const rows: ProcessRow[] = [];
  const fieldCount = includeParent ? 4 : 3;
  for (const line of source.split(/\r?\n/)) {
    const values = line.trim().split(/\s+/);
    if (values.length !== fieldCount) continue;
    const pid = Number(values[0]);
    const parentPid = includeParent ? Number(values[1]) : undefined;
    const rssKb = Number(values[includeParent ? 2 : 1]);
    if (
      !isSamplablePid(pid) ||
      !Number.isFinite(rssKb) ||
      rssKb < 0 ||
      (parentPid !== undefined && (!Number.isInteger(parentPid) || parentPid < 0))
    )
      continue;
    const row: ProcessRow = { pid, rssKb };
    if (parentPid !== undefined) row.parentPid = parentPid;
    const cpuTimeMs = elapsed(values[fieldCount - 1]!);
    if (cpuTimeMs !== undefined) row.cpuTimeMs = cpuTimeMs;
    rows.push(row);
  }
  return rows;
}

export async function readDarwinProcessTable(
  execFile: ProcessProbeExecFile,
): Promise<readonly ProcessRow[]> {
  return parse(await runProbeCommand(execFile, PS, ["-eo", "pid=,ppid=,rss=,cputime="]), true);
}
export async function readDarwinProcessGroup(
  execFile: ProcessProbeExecFile,
  processGroupId: number,
): Promise<readonly ProcessRow[]> {
  return parse(
    await runProbeCommand(execFile, PS, ["-o", "pid=,rss=,cputime=", "-g", String(processGroupId)]),
    false,
  );
}
