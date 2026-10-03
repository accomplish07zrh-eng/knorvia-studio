import { execFile as nativeExecFile } from "node:child_process";
import { readdir as nativeReaddir, readFile as nativeReadFile } from "node:fs/promises";
import { basename } from "node:path";
import os from "node:os";
import {
  formatKnorviaAgentProcessName,
  type HostResourceUsageProcess,
  type KnorviaProcessChildProcess,
} from "@knorvia/shared";

type ProcessResourceRow = {
  pid: number;
  ppid: number;
  rssKb: number;
  cpuTimeMs: number;
  command: string;
};
type TableReaderOptions = {
  platform?: NodeJS.Platform;
  execFile?: (
    file: string,
    args: readonly string[],
    options: { timeout: number; maxBuffer: number; windowsHide?: boolean; signal?: AbortSignal },
  ) => Promise<{ error?: unknown; stdout: string }>;
  readdir?: (path: string) => Promise<string[]>;
  readFile?: (path: string) => Promise<string>;
};

export interface ProcessResourceSample {
  pid: number;
  ppid: number;
  rssKb: number;
  cpuPercent: number;
  command: string;
}
export interface ProcessResourceSampler {
  sample(signal?: AbortSignal): Promise<Map<number, ProcessResourceSample> | undefined>;
}
export interface HostResourceUsageAgent {
  pid: number;
  provider: string;
  workspacePath: string;
  children: readonly KnorviaProcessChildProcess[];
}

function nonnegativeInteger(value: number): boolean {
  return Number.isInteger(value) && value >= 0;
}

export function parseLinuxVmRssKb(content: string): number {
  const match = /^VmRSS:\s*(\d+)\s*kB/m.exec(content);
  return match ? Number(match[1]) : 0;
}

function parseLinuxStat(content: string, status: string): ProcessResourceRow | undefined {
  const start = content.indexOf("(");
  const end = content.lastIndexOf(")");
  if (start < 0 || end <= start) return undefined;
  const pid = Number(content.slice(0, start).trim());
  const fields = content
    .slice(end + 1)
    .trim()
    .split(/\s+/);
  const ppid = Number(fields[1]);
  const userTime = Number(fields[11]);
  const systemTime = Number(fields[12]);
  if (pid <= 0 || ![pid, ppid, userTime, systemTime].every(nonnegativeInteger)) {
    return undefined;
  }
  return {
    pid,
    ppid,
    command: content.slice(start + 1, end),
    cpuTimeMs: Math.round(((userTime + systemTime) * 1000) / 100),
    rssKb: parseLinuxVmRssKb(status),
  };
}

function parseWindowsTable(stdout: string): ProcessResourceRow[] {
  const rows: ProcessResourceRow[] = [];
  for (const line of stdout.split(/\r?\n/)) {
    const match = /^\s*(\d+)\s+(\d+)\s+(\d+)\s+(\d+)\s*(.*)$/.exec(line);
    if (!match) continue;
    const pid = Number(match[1]);
    const ppid = Number(match[2]);
    const bytes = Number(match[3]);
    const cpu = Number(match[4]);
    if (pid <= 0 || ![pid, ppid, bytes, cpu].every(nonnegativeInteger)) continue;
    rows.push({
      pid,
      ppid,
      rssKb: Math.round(bytes / 1024),
      cpuTimeMs: cpu / 10000,
      command: (match[5] ?? "").trim(),
    });
  }
  return rows;
}

function parseCpuTime(text: string): number | undefined {
  let clock = text.trim();
  let days = 0;
  const separator = clock.indexOf("-");
  if (separator > 0) {
    days = Number(clock.slice(0, separator));
    if (!nonnegativeInteger(days)) return undefined;
    clock = clock.slice(separator + 1);
  }
  const parts = clock.split(":").map(Number);
  if (parts.length > 3 || !parts.every((value) => Number.isFinite(value) && value >= 0)) {
    return undefined;
  }
  const seconds = parts[parts.length - 1] ?? 0;
  const minutes = parts.length >= 2 ? (parts[parts.length - 2] ?? 0) : 0;
  const hours = parts.length === 3 ? (parts[0] ?? 0) : 0;
  return Math.round((((days * 24 + hours) * 60 + minutes) * 60 + seconds) * 1000);
}

function parsePsTable(stdout: string): ProcessResourceRow[] {
  const rows: ProcessResourceRow[] = [];
  for (const line of stdout.split(/\r?\n/)) {
    const match = /^\s*(\d+)\s+(\d+)\s+(\d+)\s+(\S+)\s+(.*)$/.exec(line);
    if (!match) continue;
    const pid = Number(match[1]);
    const ppid = Number(match[2]);
    const rssKb = Number(match[3]);
    const cpuTimeMs = parseCpuTime(match[4]!);
    if (pid <= 0 || ![pid, ppid, rssKb].every(nonnegativeInteger) || cpuTimeMs === undefined) {
      continue;
    }
    rows.push({ pid, ppid, rssKb, cpuTimeMs, command: (match[5] ?? "").trim() });
  }
  return rows;
}

export function createProcessResourceTableReader(
  options: TableReaderOptions = {},
): (signal?: AbortSignal) => Promise<ProcessResourceRow[] | undefined> {
  const platform = options.platform ?? process.platform;
  const execute: NonNullable<TableReaderOptions["execFile"]> =
    options.execFile ??
    ((file, args, executionOptions) =>
      new Promise((resolve) => {
        nativeExecFile(
          file,
          [...args],
          { ...executionOptions, encoding: "utf8" },
          (error, stdout) => {
            resolve(error ? { error, stdout: "" } : { stdout });
          },
        );
      }));
  const readDirectory = options.readdir ?? nativeReaddir;
  return async (signal) => {
    signal?.throwIfAborted();
    if (platform === "linux") {
      const read =
        options.readFile ?? ((path: string) => nativeReadFile(path, { encoding: "utf8", signal }));
      let entries: string[];
      try {
        entries = await readDirectory("/proc");
      } catch {
        return undefined;
      }
      const rows = await Promise.all(
        entries
          .filter((entry) => /^\d+$/.test(entry))
          .map(async (entry) => {
            try {
              signal?.throwIfAborted();
              const [stat, status] = await Promise.all([
                read(`/proc/${entry}/stat`),
                read(`/proc/${entry}/status`),
              ]);
              return parseLinuxStat(stat, status);
            } catch {
              return undefined;
            }
          }),
      );
      return rows.filter((row): row is ProcessResourceRow => row !== undefined);
    }
    if (platform === "win32") {
      const result = await execute(
        "powershell.exe",
        [
          "-NoLogo",
          "-NoProfile",
          "-NonInteractive",
          "-Command",
          "Get-CimInstance Win32_Process | ForEach-Object { '{0} {1} {2} {3} {4}' -f $_.ProcessId, $_.ParentProcessId, $_.WorkingSetSize, ($_.KernelModeTime + $_.UserModeTime), $_.Name }",
        ],
        { timeout: 5000, maxBuffer: 16777216, windowsHide: true, signal },
      );
      return result.error ? undefined : parseWindowsTable(result.stdout);
    }
    const result = await execute("ps", ["-axo", "pid=,ppid=,rss=,cputime=,comm="], {
      timeout: 3000,
      maxBuffer: 16777216,
      signal,
    });
    return result.error ? undefined : parsePsTable(result.stdout);
  };
}

export function createProcessResourceSampler(options: {
  readTable: (signal?: AbortSignal) => Promise<ProcessResourceRow[] | undefined>;
  now?: () => number;
  logicalCpuCount?: number;
}): ProcessResourceSampler {
  const now = options.now ?? Date.now;
  const cpuCount = Math.max(1, options.logicalCpuCount ?? os.cpus().length);
  const baselines = new Map<number, { at: number; cpuTimeMs: number; command: string }>();
  return {
    async sample(signal) {
      const rows = await options.readTable(signal);
      signal?.throwIfAborted();
      if (!rows) return undefined;
      const at = now();
      const samples = new Map<number, ProcessResourceSample>();
      for (const row of rows) {
        const previous = baselines.get(row.pid);
        let cpuPercent = 0;
        if (
          previous &&
          previous.command === row.command &&
          row.cpuTimeMs >= previous.cpuTimeMs &&
          at > previous.at
        ) {
          const usage =
            (((row.cpuTimeMs - previous.cpuTimeMs) / (at - previous.at)) * 100) / cpuCount;
          if (Number.isFinite(usage))
            cpuPercent = Math.max(0, Math.min(100, Math.round(usage * 10) / 10));
        }
        baselines.set(row.pid, { at, cpuTimeMs: row.cpuTimeMs, command: row.command });
        samples.set(row.pid, {
          pid: row.pid,
          ppid: row.ppid,
          rssKb: row.rssKb,
          cpuPercent,
          command: row.command,
        });
      }
      for (const [pid, baseline] of baselines) {
        if (!samples.has(pid) && at - baseline.at > 60000) baselines.delete(pid);
      }
      return samples;
    },
  };
}

type Owner =
  | { kind: "agent"; agent: HostResourceUsageAgent }
  | { kind: "mcp"; child: KnorviaProcessChildProcess }
  | { kind: "builtin"; pluginName: string };

function processName(command: string): string {
  const trimmed = command.trim();
  return basename(trimmed).replace(/\.exe$/i, "") || trimmed || "process";
}

function attributedRow(
  sample: ProcessResourceSample,
  owner: Owner | undefined,
  registeredRoot: boolean,
  scalars: { pid: number; cpuPercent: number; memoryBytes: number },
): HostResourceUsageProcess {
  const name =
    registeredRoot && owner?.kind === "agent"
      ? formatKnorviaAgentProcessName(owner.agent.provider, owner.agent.workspacePath)
      : registeredRoot && owner?.kind === "mcp"
        ? owner.child.serverName
        : processName(sample.command);
  let category: HostResourceUsageProcess["category"] = "base";
  let groupKey = "host";
  let groupLabel = "host";
  if (owner?.kind === "agent") {
    groupKey = "cli";
    groupLabel = "cli";
  } else if (owner?.kind === "builtin") {
    category = "builtin-plugin";
    groupKey = owner.pluginName;
    groupLabel = owner.pluginName;
  } else if (owner?.kind === "mcp") {
    const child = owner.child;
    category = child.mcpSource === "builtin" ? "builtin-plugin" : "community-plugin";
    groupLabel = child.pluginName ?? child.serverName;
    groupKey = `${child.mcpSource}:${groupLabel}`;
  }
  return {
    pid: scalars.pid,
    name,
    category,
    groupKey,
    groupLabel,
    cpuPercent: scalars.cpuPercent,
    memoryBytes: scalars.memoryBytes,
  };
}

export function attributeHostProcessTree(options: {
  samples: ReadonlyMap<number, ProcessResourceSample>;
  hostPid: number;
  agents: readonly HostResourceUsageAgent[];
  builtinPluginPids?: ReadonlyMap<number, string>;
}): HostResourceUsageProcess[] {
  const children = new Map<number, number[]>();
  for (const sample of options.samples.values()) {
    const siblings = children.get(sample.ppid);
    if (siblings) siblings.push(sample.pid);
    else children.set(sample.ppid, [sample.pid]);
  }
  const owners = new Map<number, Owner>();
  for (const agent of options.agents) {
    owners.set(agent.pid, { kind: "agent", agent });
    for (const child of agent.children) {
      owners.set(child.pid, { kind: "mcp", child });
    }
  }
  for (const [pid, pluginName] of options.builtinPluginPids ?? []) {
    owners.set(pid, { kind: "builtin", pluginName });
  }
  const visited = new Set<number>([options.hostPid]);
  const rows: HostResourceUsageProcess[] = [];
  const walk = (pid: number, inherited?: Owner): void => {
    if (visited.has(pid)) return;
    visited.add(pid);
    const sample = options.samples.get(pid);
    if (!sample) return;
    const cpuPercent = sample.cpuPercent;
    const memoryBytes = sample.rssKb * 1024;
    const samplePid = sample.pid;
    const registered = owners.get(pid);
    const owner = registered ?? inherited;
    rows.push(
      attributedRow(sample, owner, registered !== undefined, {
        pid: samplePid,
        cpuPercent,
        memoryBytes,
      }),
    );
    for (const childPid of children.get(pid) ?? []) walk(childPid, owner);
  };
  for (const pid of children.get(options.hostPid) ?? []) walk(pid);
  for (const pid of owners.keys()) {
    if (!visited.has(pid) && options.samples.has(pid)) walk(pid);
  }
  return rows.sort((left, right) => left.pid - right.pid);
}
