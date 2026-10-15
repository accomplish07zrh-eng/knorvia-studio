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
const PROC_STAT_ENTRY = (targetPid: number): string => `/proc/${targetPid}/stat`;
const PROC_STAT_SYSTEM = "/proc/stat";
const BOOT_TIME_PATTERN = /^btime\s+(\d+)$/m;
const WINDOWS_START_TIME_SCRIPT =
  "& { param([int]$targetProcessId) (Get-Process -Id $targetProcessId -ErrorAction Stop).StartTime.ToUniversalTime().ToString('o') }";

// 系统开机时间不能代表锁持有进程；此身份锚点在本进程生命周期内保持稳定。
export const CURRENT_PROCESS_START_TIME = performance.timeOrigin;

function finiteOrNull(value: number): number | null {
  return Number.isFinite(value) ? value : null;
}

/** 取 `/proc/<pid>/stat` 与 `/proc/stat`（两个读取互不依赖，可并行）。 */
async function readProcStats(targetPid: number): Promise<[string, string]> {
  return await Promise.all([
    readFile(PROC_STAT_ENTRY(targetPid), "utf8"),
    readFile(PROC_STAT_SYSTEM, "utf8"),
  ]);
}

/**
 * Linux 启动时间：进程名可能含空格与括号，所以从**最后一个** `)` 之后开始取字段；
 * 结果 = (系统启动秒 + 进程 ticks/100) × 1000。
 */
async function linuxStartTime(targetPid: number): Promise<number | null> {
  const [processStat, systemStat] = await readProcStats(targetPid);
  const commEnd = processStat.lastIndexOf(")");
  if (commEnd === -1) return null;
  const fields = processStat
    .slice(commEnd + 1)
    .trim()
    .split(/\s+/);
  const ticks = Number(fields[START_TICKS_FIELD_AFTER_COMM]);
  const bootSeconds = Number(BOOT_TIME_PATTERN.exec(systemStat)?.[1]);
  const value = (bootSeconds + ticks / LINUX_TICKS_PER_SECOND) * MILLISECONDS_PER_SECOND;
  return finiteOrNull(value);
}

async function darwinStartTime(targetPid: number): Promise<string> {
  const result = await runFile("ps", ["-p", String(targetPid), "-o", "lstart="], {
    encoding: "utf8",
  });
  return result.stdout;
}

async function windowsStartTime(targetPid: number): Promise<string> {
  const result = await runFile(
    "powershell.exe",
    ["-NoProfile", "-NonInteractive", "-Command", WINDOWS_START_TIME_SCRIPT, String(targetPid)],
    { encoding: "utf8", windowsHide: true },
  );
  return result.stdout;
}

/** 平台探测：darwin 用 `ps`，win32 用 PowerShell；其它平台没有可用锚点。 */
async function platformStartTime(targetPid: number): Promise<number | null> {
  if (process.platform === "linux") return await linuxStartTime(targetPid);
  let output: string;
  if (process.platform === "darwin") output = await darwinStartTime(targetPid);
  else if (process.platform === "win32") output = await windowsStartTime(targetPid);
  else return null;
  return finiteOrNull(Date.parse(output.trim()));
}

/** 进程启动时间（毫秒）：本进程直接返回内存锚点，其它进程按平台探测，失败返回 null。 */
export async function probeProcessStartTime(pid: number): Promise<number | null> {
  if (pid === process.pid) return CURRENT_PROCESS_START_TIME;
  try {
    return await platformStartTime(pid);
  } catch {
    return null;
  }
}
