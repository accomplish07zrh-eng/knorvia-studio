import { spawnSync, type ChildProcess } from "node:child_process";
import { readFileSync } from "node:fs";

import type {
  ProcessIdentity,
  ProcessTreeSnapshot,
  ProcessTreeTerminatorOptions,
} from "#src/process/processTreeTypes.js";

const CIM_ALL =
  "Get-CimInstance Win32_Process | ForEach-Object { '{0} {1} {2}' -f $_.ProcessId, $_.ParentProcessId, $_.CreationDate.ToUniversalTime().Ticks }";
let cachedWindowsIdentities: ProcessIdentity[] | undefined;

function isPositiveInteger(value: number): boolean {
  return Number.isInteger(value) && value > 0;
}

function isNonnegativeInteger(value: number): boolean {
  return Number.isInteger(value) && value >= 0;
}

function queryPosixIdentities(options: ProcessTreeTerminatorOptions): ProcessIdentity[] {
  const darwin = process.platform === "darwin";
  const result = spawnSync(
    "ps",
    darwin ? ["-axo", "pid=,ppid=,pgid=,lstart=,command="] : ["-eo", "pid=,ppid=,pgid=,lstart="],
    { encoding: "utf8", timeout: 1000 },
  );
  if (result.error) {
    options.log?.warn(options.traceId, "查询 runtime 后代进程失败（进程表查询）:", result.error);
    return [];
  }
  if (result.signal === "SIGTERM" || result.signal === "SIGKILL") {
    options.log?.warn(
      options.traceId,
      `查询 runtime 后代进程失败（进程表超时） signal=${result.signal}`,
    );
    return [];
  }
  if (result.status !== 0 || !result.stdout) {
    options.log?.warn(
      options.traceId,
      `查询 runtime 后代进程失败（进程表查询） status=${result.status ?? "unknown"}`,
    );
    return [];
  }
  const identities: ProcessIdentity[] = [];
  for (const line of result.stdout.split(/\r?\n/)) {
    const fields = line.trim().split(/\s+/);
    const pid = Number(fields[0]);
    const parentPid = Number(fields[1]);
    const processGroupId = Number(fields[2]);
    const lstart = fields.slice(3, 8).join(" ");
    const startTime = darwin ? `${lstart}|command:${fields.slice(8).join(" ")}` : lstart;
    if (
      !isPositiveInteger(pid) ||
      !isNonnegativeInteger(parentPid) ||
      !isPositiveInteger(processGroupId) ||
      !startTime
    ) {
      continue;
    }
    identities.push({
      parentPid,
      pid,
      processGroupId,
      startTime,
    });
  }
  return identities;
}

function queryWindowsIdentities(options: ProcessTreeTerminatorOptions): ProcessIdentity[] {
  if (cachedWindowsIdentities !== undefined) {
    return cachedWindowsIdentities;
  }
  const result = spawnSync(
    "powershell.exe",
    ["-NoLogo", "-NoProfile", "-NonInteractive", "-Command", CIM_ALL],
    { encoding: "utf8", timeout: 1000, windowsHide: true },
  );
  if (result.error || result.status !== 0 || !result.stdout) {
    options.log?.warn(
      options.traceId,
      `查询 Windows runtime 进程表失败 status=${result.status ?? "unknown"}:`,
      result.error ?? result.stderr,
    );
    return [];
  }
  const identities: ProcessIdentity[] = [];
  for (const line of result.stdout.split(/\r?\n/)) {
    const fields = line.trim().split(/\s+/);
    const pid = Number(fields[0]);
    const parentPid = Number(fields[1]);
    const startTime = fields[2];
    if (isPositiveInteger(pid) && isNonnegativeInteger(parentPid) && startTime) {
      identities.push({ parentPid, pid, startTime });
    }
  }
  cachedWindowsIdentities = identities;
  queueMicrotask(() => {
    if (cachedWindowsIdentities === identities) {
      cachedWindowsIdentities = undefined;
    }
  });
  return identities;
}

function queryIdentities(options: ProcessTreeTerminatorOptions): ProcessIdentity[] {
  return process.platform === "win32"
    ? queryWindowsIdentities(options)
    : queryPosixIdentities(options);
}

export function readLinuxProcessIdentity(pid: number): ProcessIdentity | undefined {
  if (process.platform !== "linux" || !isPositiveInteger(pid)) return undefined;
  try {
    const stat = readFileSync(`/proc/${pid}/stat`, "utf8");
    const closeParen = stat.lastIndexOf(")");
    if (closeParen < 0) {
      return undefined;
    }
    const fields = stat
      .slice(closeParen + 2)
      .trim()
      .split(/\s+/);
    const parentPid = Number(fields[1]);
    const processGroupId = Number(fields[2]);
    const ticks = fields[19];
    const linuxState = fields[0];
    if (
      !isNonnegativeInteger(parentPid) ||
      !isPositiveInteger(processGroupId) ||
      !ticks ||
      !/^\d+$/.test(ticks) ||
      linuxState?.length !== 1
    ) {
      return undefined;
    }
    return {
      pid,
      parentPid,
      processGroupId,
      startTime: `linux-ticks:${ticks}`,
      linuxState,
    };
  } catch {
    return undefined;
  }
}

function refineIdentity(identity: ProcessIdentity): ProcessIdentity | undefined {
  if (process.platform !== "linux") return identity;
  const current = readLinuxProcessIdentity(identity.pid);
  if (
    !current ||
    current.parentPid !== identity.parentPid ||
    current.processGroupId !== identity.processGroupId
  ) {
    return undefined;
  }
  return { ...identity, ...current };
}

function refineIdentities(identities: readonly ProcessIdentity[]): ProcessIdentity[] {
  const refined: ProcessIdentity[] = [];
  for (const identity of identities) {
    const current = refineIdentity(identity);
    if (current !== undefined) {
      refined.push(current);
    }
  }
  return refined;
}

function descendantsOf(rootPid: number, identities: readonly ProcessIdentity[]): ProcessIdentity[] {
  const byParent = new Map<number, ProcessIdentity[]>();
  for (const identity of identities) {
    const siblings = byParent.get(identity.parentPid);
    if (siblings) {
      siblings.push(identity);
    } else {
      byParent.set(identity.parentPid, [identity]);
    }
  }
  const seen = new Set<number>([rootPid]);
  const descendants: ProcessIdentity[] = [];
  function visit(parentPid: number): void {
    for (const identity of byParent.get(parentPid) ?? []) {
      if (seen.has(identity.pid)) {
        continue;
      }
      seen.add(identity.pid);
      descendants.push(identity);
      visit(identity.pid);
    }
  }
  visit(rootPid);
  return descendants;
}

export function filterCurrentProcessIdentities(
  identities: readonly ProcessIdentity[],
  options: ProcessTreeTerminatorOptions,
): ProcessIdentity[] {
  if (identities.length === 0) {
    return [];
  }
  const trackedPids = new Set(identities.map((identity) => identity.pid));
  const candidates = queryIdentities(options).filter((identity) => trackedPids.has(identity.pid));
  const currentByPid = new Map(
    refineIdentities(candidates).map((identity) => [identity.pid, identity]),
  );
  return identities.filter((identity) => {
    const current = currentByPid.get(identity.pid);
    return (
      current !== undefined &&
      current.startTime === identity.startTime &&
      (identity.processGroupId === undefined || current.processGroupId === identity.processGroupId)
    );
  });
}

export function captureProcessTreeSnapshot(
  child: ChildProcess,
  options: ProcessTreeTerminatorOptions = {},
): ProcessTreeSnapshot | undefined {
  if (child.pid == null) {
    return undefined;
  }
  const table = queryIdentities(options);
  const root = table.find((identity) => identity.pid === child.pid);
  if (!root) {
    return undefined;
  }
  const candidates = [root, ...descendantsOf(child.pid, table)];
  if (process.platform !== "win32" && root.processGroupId === child.pid) {
    candidates.push(...table.filter((identity) => identity.processGroupId === child.pid));
  }
  const byPid = new Map(candidates.map((identity) => [identity.pid, identity]));
  const identities = refineIdentities([...byPid.values()]);
  if (!identities.some((identity) => identity.pid === child.pid)) {
    return undefined;
  }
  return {
    rootPid: child.pid,
    descendantPids: identities
      .filter((identity) => identity.pid !== child.pid)
      .map((identity) => identity.pid),
    identities,
  };
}

export function captureProcessGroupSnapshot(
  processGroupId: number,
  options: ProcessTreeTerminatorOptions = {},
): ProcessTreeSnapshot | undefined {
  if (process.platform === "win32" || !isPositiveInteger(processGroupId)) {
    return undefined;
  }
  const candidates = queryIdentities(options).filter(
    (identity) => identity.processGroupId === processGroupId,
  );
  const identities = refineIdentities(candidates);
  if (identities.length === 0) {
    return undefined;
  }
  return {
    rootPid: processGroupId,
    descendantPids: identities
      .filter((identity) => identity.pid !== processGroupId)
      .map((identity) => identity.pid),
    identities,
  };
}

function creationTimeMs(startTime: string): number | undefined {
  try {
    const milliseconds = Number((BigInt(startTime) - 621355968000000000n) / 10000n);
    return Number.isSafeInteger(milliseconds) ? milliseconds : undefined;
  } catch {
    return undefined;
  }
}

export function captureExitedRootDescendantsSnapshot(
  rootPid: number,
  options: ProcessTreeTerminatorOptions = {},
): ProcessTreeSnapshot | undefined {
  const startedAtMs = options.ownedProcessStartedAtMs;
  const exitedAtMs = options.ownedProcessExitedAtMs;
  if (
    process.platform !== "win32" ||
    !isPositiveInteger(rootPid) ||
    typeof startedAtMs !== "number" ||
    !Number.isFinite(startedAtMs) ||
    typeof exitedAtMs !== "number" ||
    !Number.isFinite(exitedAtMs)
  ) {
    return undefined;
  }
  const candidates = queryIdentities(options).filter((identity) => {
    const createdAtMs = creationTimeMs(identity.startTime);
    return createdAtMs !== undefined && startedAtMs <= createdAtMs && createdAtMs <= exitedAtMs;
  });
  const identities = descendantsOf(rootPid, candidates);
  if (identities.length === 0) {
    return undefined;
  }
  return {
    rootPid,
    descendantPids: identities.map((identity) => identity.pid),
    identities,
  };
}
