// Copyright (c) Knorvia contributors
// SPDX-License-Identifier: MIT

import { execFile, type ExecFileOptionsWithStringEncoding } from "node:child_process";

interface CommandResult {
  error?: unknown;
  status: number | null;
  stderr: string;
  stdout: string;
}

type KillFn = typeof process.kill;
type ExecFileFn = (
  file: string,
  args: readonly string[],
  options: ExecFileOptionsWithStringEncoding,
) => Promise<CommandResult>;

interface McpStdioProcessTreeTerminatorOptions {
  execFile?: ExecFileFn;
  kill?: KillFn;
  now?: () => number;
  platform?: NodeJS.Platform;
  sleep?: (ms: number) => Promise<void>;
}

const ENUMERATION_TIMEOUT_MS = 1000;
const TASKKILL_TIMEOUT_MS = 2000;
const POLL_INTERVAL_MS = 25;
const FINAL_WAIT_MS = 250;
const GRACE_STAGES = [
  ["SIGINT", 250],
  ["SIGTERM", 750],
] as const;

function commandStatus(error: unknown): number | null {
  if (!error || typeof error !== "object" || !("code" in error)) return 0;
  const code = error.code;
  return typeof code === "number" ? code : null;
}

const defaultExecFile: ExecFileFn = (file, args, options) =>
  new Promise((resolve) => {
    execFile(file, [...args], options, (error, stdout, stderr) => {
      resolve({ error, status: commandStatus(error), stderr, stdout });
    });
  });

function defaultSleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function uniquePositive(pids: readonly number[]): number[] {
  return [...new Set(pids)].filter((pid) => pid > 0);
}

export async function terminateMcpStdioProcessTree(
  pid: number,
  options: McpStdioProcessTreeTerminatorOptions = {},
): Promise<void> {
  const platform = options.platform ?? process.platform;

  function alive(target: number): boolean {
    const kill = options.kill ?? process.kill;
    try {
      kill(target, 0);
      return true;
    } catch (error) {
      return (
        error !== null && typeof error === "object" && "code" in error && error.code === "EPERM"
      );
    }
  }

  function signal(target: number, value: NodeJS.Signals): void {
    const kill = options.kill ?? process.kill;
    try {
      kill(target, value);
    } catch {
      // 仅忽略发送调用的错误；依赖选择和后续活性判断仍可失败。
    }
  }

  function command(
    file: string,
    args: readonly string[],
    commandOptions: ExecFileOptionsWithStringEncoding,
  ): Promise<CommandResult> {
    const run = options.execFile ?? defaultExecFile;
    return run(file, args, commandOptions);
  }

  if (!alive(pid)) return;
  if (platform === "win32") {
    const result = await command("taskkill", ["/PID", String(pid), "/T", "/F"], {
      encoding: "utf8",
      timeout: TASKKILL_TIMEOUT_MS,
      windowsHide: true,
    });
    const failed = Boolean(result.error) || (result.status !== null && result.status !== 0);
    if (failed && alive(pid)) {
      throw new Error(
        `taskkill failed for MCP stdio process tree pid=${pid} status=${result.status ?? "unknown"}`,
      );
    }
    return;
  }

  async function children(parent: number): Promise<number[]> {
    const direct = await command("pgrep", ["-P", String(parent)], {
      encoding: "utf8",
      timeout: ENUMERATION_TIMEOUT_MS,
    });
    if (!direct.error && direct.status === 0 && direct.stdout) {
      return direct.stdout
        .split(/\s+/)
        .map(Number)
        .filter((value) => Number.isInteger(value) && value > 0);
    }
    const currentPlatform = options.platform ?? process.platform;
    const listing = await command(
      "ps",
      [currentPlatform === "darwin" ? "-axo" : "-eo", "pid=,ppid="],
      {
        encoding: "utf8",
        timeout: ENUMERATION_TIMEOUT_MS,
      },
    );
    if (listing.error || listing.status !== 0 || !listing.stdout) return [];
    const matches: number[] = [];
    for (const line of listing.stdout.split(/\r?\n/)) {
      const [childText, parentText] = line.trim().split(/\s+/);
      const child = Number(childText);
      if (Number.isInteger(child) && child > 0 && Number(parentText) === parent)
        matches.push(child);
    }
    return matches;
  }

  async function descendants(): Promise<number[]> {
    const visited = new Set<number>();
    const collected: number[] = [];
    async function visit(parent: number): Promise<void> {
      if (visited.has(parent)) return;
      visited.add(parent);
      for (const child of await children(parent)) {
        collected.push(child);
        await visit(child);
      }
    }
    await visit(pid);
    return uniquePositive(collected).reverse();
  }

  async function waitForExit(pids: readonly number[], budgetMs: number): Promise<void> {
    const sleep = options.sleep ?? defaultSleep;
    const now = options.now ?? Date.now;
    const startedAt = now();
    while (now() - startedAt < budgetMs) {
      if (!pids.some(alive)) return;
      await sleep(POLL_INTERVAL_MS);
    }
  }

  const treePids = uniquePositive([...(await descendants()), pid]);
  for (const [graceSignal, budgetMs] of GRACE_STAGES) {
    signal(-pid, graceSignal);
    for (const target of treePids) signal(target, graceSignal);
    await waitForExit(treePids, budgetMs);
    if (!treePids.some(alive)) return;
  }
  const finalPids = uniquePositive([...(await descendants()), ...treePids]);
  for (const target of finalPids) {
    if (alive(target)) signal(target, "SIGKILL");
  }
  signal(-pid, "SIGKILL");
  await waitForExit(finalPids, FINAL_WAIT_MS);
  const remaining = finalPids.filter(alive);
  if (remaining.length > 0) {
    throw new Error(
      `SIGKILL failed for MCP stdio process tree pid=${pid} remaining=${remaining.join(",")}`,
    );
  }
}
