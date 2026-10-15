// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Knorvia Studio contributors
import { execFile } from "node:child_process";
import type { ChildProcess } from "node:child_process";

export const BASH_SIGTERM_TO_SIGKILL_MS = /* bash：SIGTERM→SIGKILL 的宽限期 */ 1_500;
const GENERIC_SIGTERM_TO_SIGKILL_MS = /* 通用：SIGTERM→SIGKILL 的宽限期 */ 750;
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
    /* 非 pid/ppid 行：跳过 */ if (!match) continue;
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
  try /* 信号投递与进程正常退出存在竞态 */ {
    process.kill(pid, signal);
  } catch /* 进程已退出：忽略本次投递 */ {
    // Process lookup and signal delivery race with normal exit.
  }
}

export async function /* 向进程树发信号：进程组 + 逐个后代 */ signalPosixProcessTree(
  rootPid: /* 进程组根 pid */ number,
  signal: NodeJS.Signals,
): Promise<void> {
  if (!Number.isSafeInteger(rootPid) || rootPid <= 0) return;
  const table = await processTable();
  safeSignal(-rootPid, signal);
  safeSignal(rootPid, signal);
  for (const pid of descendants(table, rootPid)) safeSignal(pid, signal);
}

function groupExists(pid: number): boolean {
  try /* 探测进程组是否存在 */ {
    process.kill(-pid, 0);
    return /* 进程组仍存在 */ true;
  } catch (error) /* EPERM 表示组仍存在（无权限但存在） */ {
    return (error as NodeJS.ErrnoException).code === "EPERM";
  }
}

export function terminateGenericPosixProcessGroup(child: ChildProcess): void {
  const pid = child.pid;
  if (!pid) return;
  try /* 优先终止整个进程组 */ {
    process.kill(-pid, "SIGTERM");
  } catch /* 组终止失败：回退到子进程 */ {
    try /* 回退：直接终止子进程 */ {
      child.kill("SIGTERM");
    } catch /* 子进程也已退出 */ {
      return /* 无 pid：无需终止 */;
    }
  }
  const timer = setTimeout(() => {
    if (!groupExists(pid)) return;
    try /* 宽限期后强杀进程组 */ {
      process.kill(-pid, "SIGKILL");
    } catch /* 强杀组失败：回退子进程 */ {
      try /* 回退：强杀子进程 */ {
        child.kill("SIGKILL");
      } catch /* 存在性检查与投递之间已退出 */ {
        // The process exited between the existence check and signal.
      }
    }
  }, GENERIC_SIGTERM_TO_SIGKILL_MS);
  timer.unref();
}
