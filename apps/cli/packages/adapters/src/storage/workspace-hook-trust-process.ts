// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Knorvia Studio contributors

import { execFile } from "node:child_process";
import { readFile } from "node:fs/promises";
import { performance } from "node:perf_hooks";
import { promisify } from "node:util";

const runFile = promisify(execFile);
const MILLISECONDS_PER_SECOND = 1000;
const LINUX_TICKS_PER_SECOND = 100;
const START_TICKS_FIELD_AFTER_COMM = 19;

// 系统开机时间不能代表锁持有进程；此身份锚点在本进程生命周期内保持稳定。
export const CURRENT_PROCESS_START_TIME = performance.timeOrigin;

async function linuxStartTime(pid: number): Promise<number | null> {
  const [processStat, systemStat] = await Promise.all([
    readFile(`/proc/${pid}/stat`, "utf8"),
    readFile("/proc/stat", "utf8"),
  ]);
  const commEnd = processStat.lastIndexOf(")");
  if (commEnd === -1) return null;
  const ticks = Number(
    processStat
      .slice(commEnd + 1)
      .trim()
      .split(/\s+/)[START_TICKS_FIELD_AFTER_COMM],
  );
  const bootSeconds = Number(/^btime\s+(\d+)$/m.exec(systemStat)?.[1]);
  const value = (bootSeconds + ticks / LINUX_TICKS_PER_SECOND) * MILLISECONDS_PER_SECOND;
  return Number.isFinite(value) ? value : null;
}

export async function probeProcessStartTime(pid: number): Promise<number | null> {
  if (pid === process.pid) return CURRENT_PROCESS_START_TIME;
  try {
    if (process.platform === "linux") return await linuxStartTime(pid);
    let output: string;
    if (process.platform === "darwin") {
      const result = await runFile("ps", ["-p", String(pid), "-o", "lstart="], {
        encoding: "utf8",
      });
      output = result.stdout;
    } else if (process.platform === "win32") {
      const result = await runFile(
        "powershell.exe",
        [
          "-NoProfile",
          "-NonInteractive",
          "-Command",
          "& { param([int]$targetProcessId) (Get-Process -Id $targetProcessId -ErrorAction Stop).StartTime.ToUniversalTime().ToString('o') }",
          String(pid),
        ],
        { encoding: "utf8", windowsHide: true },
      );
      output = result.stdout;
    } else {
      return null;
    }
    const value = Date.parse(output.trim());
    return Number.isFinite(value) ? value : null;
  } catch {
    return null;
  }
}
