// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Knorvia Studio contributors
import { execFile } from "node:child_process";
import type { ChildProcess } from "node:child_process";

export const BASH_SIGTERM_TO_SIGKILL_MS = 1_500;
const GENERIC_SIGTERM_TO_SIGKILL_MS = 750;
const PROCESS_TABLE_TIMEOUT_MS = 500;

function processTable(): Promise<string> {
  return new Promise((resolve) => {
    execFile(
      "ps",
      ["-eo", "pid=,ppid="],
      { encoding: "utf8", timeout: PROCESS_TABLE_TIMEOUT_MS, windowsHide: true },
      (error, stdout) => resolve(error ? "" : stdout),
    );
  });
}

function descendants(table: string, rootPid: number): number[] {
  const children = new Map<number, number[]>();
  for (const line of table.split(/\r?\n/)) {
    const match = /^\s*(\d+)\s+(\d+)\s*$/.exec(line);
    if (!match) continue;
    const pid = Number(match[1]);
    const ppid = Number(match[2]);
    const values = children.get(ppid) ?? [];
    values.push(pid);
    children.set(ppid, values);
  }
  const found: number[] = [];
  const queue = [...(children.get(rootPid) ?? [])];
  while (queue.length > 0) {
    const pid = queue.shift()!;
    found.push(pid);
    queue.push(...(children.get(pid) ?? []));
  }
  return found.reverse();
}

function safeSignal(pid: number, signal: NodeJS.Signals): void {
  try {
    process.kill(pid, signal);
  } catch {
    // Process lookup and signal delivery race with normal exit.
  }
}

export async function signalPosixProcessTree(
  rootPid: number,
  signal: NodeJS.Signals,
): Promise<void> {
  if (!Number.isSafeInteger(rootPid) || rootPid <= 0) return;
  const table = await processTable();
  safeSignal(-rootPid, signal);
  safeSignal(rootPid, signal);
  for (const pid of descendants(table, rootPid)) safeSignal(pid, signal);
}

function groupExists(pid: number): boolean {
  try {
    process.kill(-pid, 0);
    return true;
  } catch (error) {
    return (error as NodeJS.ErrnoException).code === "EPERM";
  }
}

export function terminateGenericPosixProcessGroup(child: ChildProcess): void {
  const pid = child.pid;
  if (!pid) return;
  try {
    process.kill(-pid, "SIGTERM");
  } catch {
    try {
      child.kill("SIGTERM");
    } catch {
      return;
    }
  }
  const timer = setTimeout(() => {
    if (!groupExists(pid)) return;
    try {
      process.kill(-pid, "SIGKILL");
    } catch {
      try {
        child.kill("SIGKILL");
      } catch {
        // The process exited between the existence check and signal.
      }
    }
  }, GENERIC_SIGTERM_TO_SIGKILL_MS);
  timer.unref();
}
