import { execFile } from "node:child_process";
import { existsSync, readdirSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const WINDOWS_PROCESS_QUERY_TIMEOUT_MS = 3_000;
const WINDOWS_PACKAGED_RESOURCE_DIRS = ["knorvia", "tools"];
export const WINDOWS_UPDATE_LOCK_RELEASE_GRACE_MS = 750;

interface WindowsInstallResourceLockProcess {
  pid: number;
  commandLine?: string;
  executablePath?: string;
}

interface WindowsUpdateProcessCleanupResult<TTerminationResult> {
  initialLockProcesses: WindowsInstallResourceLockProcess[];
  terminationPids: number[];
  terminationResults: TTerminationResult[];
  remainingLockProcesses: WindowsInstallResourceLockProcess[];
  errors: string[];
}

interface WindowsUpdateProcessCleanupOptions<TTerminationResult> {
  resourceLockMarkers: readonly string[];
  lockReleaseGraceMs: number;
  scan: (markers: readonly string[]) => Promise<WindowsInstallResourceLockProcess[]>;
  terminate: (pids: number[]) => Promise<TTerminationResult[]>;
  delay: (ms: number) => Promise<void>;
}

function windowsText(value: string): string {
  return value.trim().replaceAll("/", "\\").toLowerCase();
}

function referencesResources(
  row: WindowsInstallResourceLockProcess,
  markers: readonly string[],
): boolean {
  const needles = markers.map(windowsText).filter(Boolean);
  if (needles.length === 0) return false;
  const command = windowsText(`${row.commandLine ?? ""} ${row.executablePath ?? ""}`);
  return needles.some((needle) => command.includes(needle));
}

export async function runWindowsUpdateProcessCleanup<TTerminationResult>(
  options: WindowsUpdateProcessCleanupOptions<TTerminationResult>,
): Promise<WindowsUpdateProcessCleanupResult<TTerminationResult>> {
  const result: WindowsUpdateProcessCleanupResult<TTerminationResult> = {
    initialLockProcesses: [],
    terminationPids: [],
    terminationResults: [],
    remainingLockProcesses: [],
    errors: [],
  };
  try {
    const observed = await options.scan(options.resourceLockMarkers);
    // 历史 PID 不能授权 taskkill；先以当前资源引用筛选，再投影可用 PID。
    result.initialLockProcesses = observed.filter((row) =>
      referencesResources(row, options.resourceLockMarkers),
    );
  } catch (error) {
    result.errors.push(`initial-scan: ${error instanceof Error ? error.message : String(error)}`);
  }
  result.terminationPids = [
    ...new Set(
      result.initialLockProcesses
        .map((row) => row.pid)
        .filter((pid) => Number.isSafeInteger(pid) && pid > 0),
    ),
  ];
  if (result.terminationPids.length === 0) return result;

  // 每个阶段只记录自己的失败，后继交接阶段仍按原顺序执行。
  for (const phase of ["terminate", "release-grace", "rescan"] as const) {
    try {
      switch (phase) {
        case "terminate":
          result.terminationResults = await options.terminate(result.terminationPids);
          break;
        case "release-grace":
          await options.delay(options.lockReleaseGraceMs);
          break;
        case "rescan":
          result.remainingLockProcesses = await options.scan(options.resourceLockMarkers);
          break;
      }
    } catch (error) {
      result.errors.push(`${phase}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
  return result;
}

interface WindowsPackagedResourceSnapshotEntry {
  dir: string;
  path: string;
  exists: boolean;
  entries: string[];
}

interface WindowsPackagedResourceWritableProbe {
  dir: string;
  path: string;
  exists: boolean;
  writable: boolean;
  error?: string;
}

export function resolveWindowsPackagedResourceLockMarkers(resourcesPath: string): string[] {
  return WINDOWS_PACKAGED_RESOURCE_DIRS.map((dir) => join(resourcesPath, dir));
}

function listEntries(path: string): string[] {
  try {
    return readdirSync(path, { withFileTypes: true })
      .slice(0, 20)
      .map((entry) => `${entry.name}${entry.isDirectory() ? "/" : ""}`);
  } catch {
    return [];
  }
}

export function snapshotWindowsPackagedResources(
  resourcesPath: string,
): WindowsPackagedResourceSnapshotEntry[] {
  return WINDOWS_PACKAGED_RESOURCE_DIRS.map((dir) => {
    const path = join(resourcesPath, dir);
    const exists = existsSync(path);
    return { dir, path, exists, entries: exists ? listEntries(path) : [] };
  });
}

function removeSentinel(path: string): void {
  try {
    rmSync(path, { force: true });
  } catch {
    // 诊断探针的清理失败不能替换导致可写性检查失败的原始错误。
  }
}

function probeDirectory(dir: string, path: string): WindowsPackagedResourceWritableProbe {
  const exists = existsSync(path);
  if (!exists) return { dir, path, exists, writable: false };
  const sentinel = join(
    path,
    `.knorvia_resource_probe_${process.pid}_${Date.now()}_${Math.random().toString(16).slice(2)}`,
  );
  const renamed = `${sentinel}.renamed`;
  try {
    for (const phase of ["create", "rename", "restore"] as const) {
      switch (phase) {
        case "create":
          writeFileSync(sentinel, "probe\n", "utf8");
          break;
        case "rename":
          renameSync(sentinel, renamed);
          break;
        case "restore":
          renameSync(renamed, sentinel);
          break;
      }
    }
    removeSentinel(sentinel);
    removeSentinel(renamed);
    return { dir, path, exists, writable: true };
  } catch (error) {
    removeSentinel(sentinel);
    removeSentinel(renamed);
    return {
      dir,
      path,
      exists,
      writable: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

export function probeWindowsPackagedResourceWritable(
  resourcesPath: string,
): WindowsPackagedResourceWritableProbe[] {
  return WINDOWS_PACKAGED_RESOURCE_DIRS.map((dir) => probeDirectory(dir, join(resourcesPath, dir)));
}

interface WindowsProcessRow {
  ProcessId?: number;
  CommandLine?: string | null;
  ExecutablePath?: string | null;
}

// 以下 PowerShell 文本作为现有 native 命令契约保留；不计为独立表达或新的许可授权。
function queryScript(markers: readonly string[]): string {
  const literals = markers.map((value) => `'${value.replaceAll("'", "''")}'`).join(", ");
  return `
$ErrorActionPreference = 'SilentlyContinue'
$markers = @(${literals})
$ownPid = $PID
$rows = Get-CimInstance Win32_Process | Select-Object ProcessId, CommandLine, ExecutablePath
$matches = @()
foreach ($row in $rows) {
  if ($row.ProcessId -eq $ownPid) { continue }
  $haystack = (([string]$row.CommandLine) + ' ' + ([string]$row.ExecutablePath)).Replace('/', '\\').ToLowerInvariant()
  foreach ($marker in $markers) {
    $needle = ([string]$marker).Replace('/', '\\').ToLowerInvariant()
    if ($needle.Length -gt 0 -and $haystack.Contains($needle)) {
      $matches += $row
      break
    }
  }
}
$matches | ConvertTo-Json -Compress
`;
}

export async function findWindowsProcessesReferencingResourceMarkers(
  markers: readonly string[],
  queryTimeoutMs = WINDOWS_PROCESS_QUERY_TIMEOUT_MS,
): Promise<WindowsInstallResourceLockProcess[]> {
  if (markers.length === 0) return [];
  const { stdout } = await execFileAsync(
    "powershell.exe",
    [
      "-NoProfile",
      "-NonInteractive",
      "-ExecutionPolicy",
      "Bypass",
      "-Command",
      queryScript(markers),
    ],
    { encoding: "utf8", windowsHide: true, timeout: queryTimeoutMs, maxBuffer: 2 * 1024 * 1024 },
  );
  const text = stdout.trim();
  if (!text) return [];
  const value = JSON.parse(text) as WindowsProcessRow | WindowsProcessRow[];
  const rows = Array.isArray(value) ? value : [value];
  return rows
    .map((row) => ({
      pid: row.ProcessId ?? 0,
      commandLine: row.CommandLine ?? undefined,
      executablePath: row.ExecutablePath ?? undefined,
    }))
    .filter((row) => Number.isInteger(row.pid) && row.pid > 0);
}
