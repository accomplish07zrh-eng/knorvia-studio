// SPDX-License-Identifier: Apache-2.0
import type { ProcessTreeTerminatorOptions } from "#src/process/processTreeTypes.js";

/** One codec/ownership path; workspace inspection avoids CimCmdlets module discovery. */
export function windowsProcessQueryCommand(
  options: ProcessTreeTerminatorOptions,
  pid?: number,
): string {
  if (options.windowsProcessQuery !== "wmi") {
    const filter = pid === undefined ? "" : ` -Filter "ProcessId = ${pid}"`;
    return `Get-CimInstance Win32_Process${filter} | ForEach-Object { '{0} {1} {2}' -f $_.ProcessId, $_.ParentProcessId, $_.CreationDate.ToUniversalTime().Ticks }`;
  }
  const filter = pid === undefined ? "" : ` WHERE ProcessId = ${pid}`;
  // 修复依据：实测模块发现超过 10 秒；系统 WMI 可读取相同字段，出生时间仍转换为 UTC ticks。
  return [
    "[void][System.Reflection.Assembly]::LoadWithPartialName('System.Management')",
    `$searcher=[System.Management.ManagementObjectSearcher]::new('SELECT ProcessId, ParentProcessId, CreationDate FROM Win32_Process${filter}')`,
    "try { $records=$searcher.Get(); try { foreach ($item in $records) { if ($item.CreationDate) { '{0} {1} {2}' -f $item.ProcessId, $item.ParentProcessId, ([System.Management.ManagementDateTimeConverter]::ToDateTime($item.CreationDate).ToUniversalTime().Ticks) } } } finally { $records.Dispose() } } finally { $searcher.Dispose() }",
  ].join("; ");
}
