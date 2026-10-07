import { execFile } from "node:child_process";

import type {
  ProcessIdentity,
  ProcessTreeTerminatorOptions,
} from "#src/process/processTreeTypes.js";

type WindowsCimCapability = "cim" | "identity-unavailable";

interface WindowsProcessListFlight {
  promise: Promise<readonly ProcessIdentity[]>;
  startedAtMs: number;
  helperEnvironment?: NodeJS.ProcessEnv;
}

let windowsCimCapability: WindowsCimCapability | undefined;
let windowsProcessListFlight: WindowsProcessListFlight | undefined;

const windowsAllProcessesCommand =
  "Get-CimInstance Win32_Process | ForEach-Object { '{0} {1} {2}' -f $_.ProcessId, $_.ParentProcessId, $_.CreationDate.ToUniversalTime().Ticks }";

function isHardCapabilityError(error: unknown): boolean {
  const code = (error as NodeJS.ErrnoException | undefined)?.code;
  return code === "ENOENT" || code === "EACCES" || code === "EPERM";
}

function parseWindowsProcessIdentities(stdout: string): ProcessIdentity[] {
  const identities: ProcessIdentity[] = [];
  for (const line of stdout.split(/\r?\n/)) {
    const [rawPid, rawParentPid, rawStartTime] = line.trim().split(/\s+/);
    const pid = Number(rawPid);
    const parentPid = Number(rawParentPid);
    if (
      !Number.isInteger(pid) ||
      pid <= 0 ||
      !Number.isInteger(parentPid) ||
      parentPid < 0 ||
      !rawStartTime
    ) {
      continue;
    }
    let unixMicroseconds: bigint;
    try {
      unixMicroseconds = (BigInt(rawStartTime) - 621355968000000000n) / 10n;
    } catch {
      continue;
    }
    identities.push({
      parentPid,
      pid,
      startTime: `windows-utc-us:${unixMicroseconds}`,
    });
  }
  return identities;
}

async function awaitWindowsProcessListWithinDeadline(
  request: Promise<readonly ProcessIdentity[]>,
  options: ProcessTreeTerminatorOptions,
): Promise<readonly ProcessIdentity[]> {
  if (options.windowsCleanupDeadlineAtMs === undefined) {
    return await request;
  }
  const remainingMs = Math.max(options.windowsCleanupDeadlineAtMs - Date.now(), 0);
  if (remainingMs <= 0) {
    return [];
  }
  let deadlineTimer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      request,
      new Promise<readonly ProcessIdentity[]>((resolve) => {
        deadlineTimer = setTimeout(() => resolve([]), remainingMs);
      }),
    ]);
  } finally {
    if (deadlineTimer) {
      clearTimeout(deadlineTimer);
    }
  }
}

export async function verifyWindowsProcessIdentityAsync(
  identity: ProcessIdentity,
  timeoutMs: number,
  options: ProcessTreeTerminatorOptions = {},
): Promise<boolean> {
  if (process.platform !== "win32" || timeoutMs <= 0) {
    return false;
  }
  if (windowsCimCapability === "identity-unavailable") {
    return false;
  }
  return new Promise<boolean>((resolve) => {
    const command = `Get-CimInstance Win32_Process -Filter "ProcessId = ${identity.pid}" | ForEach-Object { '{0} {1} {2}' -f $_.ProcessId, $_.ParentProcessId, $_.CreationDate.ToUniversalTime().Ticks }`;
    execFile(
      "powershell.exe",
      ["-NoLogo", "-NoProfile", "-NonInteractive", "-Command", command],
      {
        encoding: "utf8",
        windowsHide: true,
        timeout: timeoutMs,
        ...(options.helperEnvironment ? { env: options.helperEnvironment } : {}),
      },
      (error, stdout, stderr) => {
        if (error || !stdout) {
          if (isHardCapabilityError(error)) {
            windowsCimCapability = "identity-unavailable";
          }
          options.log?.warn(
            options.traceId,
            `Windows root 身份 PowerShell 复核失败 pid=${identity.pid}:`,
            error ?? stderr,
          );
          resolve(false);
          return;
        }
        const identities = parseWindowsProcessIdentities(stdout);
        const current = identities.find((candidate) => candidate.pid === identity.pid);
        windowsCimCapability = "cim";
        resolve(current?.startTime === identity.startTime);
      },
    );
  });
}

export async function readWindowsProcessListAsync(
  options: ProcessTreeTerminatorOptions,
): Promise<readonly ProcessIdentity[]> {
  if (windowsCimCapability === "identity-unavailable") {
    return [];
  }
  const ownedProcessStartedAtMs = options.ownedProcessStartedAtMs;
  const existingFlight = windowsProcessListFlight;
  if (
    existingFlight &&
    existingFlight.helperEnvironment === options.helperEnvironment &&
    (ownedProcessStartedAtMs === undefined || ownedProcessStartedAtMs < existingFlight.startedAtMs)
  ) {
    return await awaitWindowsProcessListWithinDeadline(existingFlight.promise, options);
  }

  const startedAtMs = Date.now();
  const request: Promise<readonly ProcessIdentity[]> = new Promise<readonly ProcessIdentity[]>(
    (resolve) => {
      const timeoutMs =
        options.windowsCleanupDeadlineAtMs === undefined
          ? 2500
          : Math.min(2500, Math.max(options.windowsCleanupDeadlineAtMs - Date.now(), 0));
      if (timeoutMs <= 0) {
        resolve([]);
        return;
      }
      execFile(
        "powershell.exe",
        ["-NoLogo", "-NoProfile", "-NonInteractive", "-Command", windowsAllProcessesCommand],
        {
          encoding: "utf8",
          windowsHide: true,
          timeout: timeoutMs,
          ...(options.helperEnvironment ? { env: options.helperEnvironment } : {}),
        },
        (error, stdout, stderr) => {
          if (error || !stdout) {
            if (isHardCapabilityError(error)) {
              windowsCimCapability = "identity-unavailable";
            }
            options.log?.warn(
              options.traceId,
              "查询 Windows runtime 进程表失败（异步）:",
              error ?? stderr,
            );
            resolve([]);
            return;
          }
          const identities = parseWindowsProcessIdentities(stdout);
          if (identities.length === 0) {
            options.log?.warn(options.traceId, "PowerShell 未返回可解析的 Windows runtime 进程表");
          } else {
            windowsCimCapability = "cim";
          }
          resolve(identities);
        },
      );
    },
  ).finally(() => {
    if (windowsProcessListFlight?.promise === request) {
      windowsProcessListFlight = undefined;
    }
  });
  windowsProcessListFlight = {
    promise: request,
    startedAtMs,
    helperEnvironment: options.helperEnvironment,
  };
  return await awaitWindowsProcessListWithinDeadline(request, options);
}
