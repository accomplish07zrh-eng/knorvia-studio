// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Knorvia Studio contributors
//
// 进程树终止：POSIX 上先按进程组下手，组不可用时退回逐个后代。
// 所有投递都是「尽力而为」——目标随时可能自行退出，因此每次 kill 都吞掉异常。
// 宽限期到了先探一次组是否存在，避免对已经消失的组做无意义强杀。

import { execFile } from "node:child_process";
import type { ChildProcess } from "node:child_process";

// bash 任务给足宽限期（内置脚本可能有收尾动作），其它执行面用较短宽限。
export const BASH_SIGTERM_TO_SIGKILL_MS = 1_500;
const GENERIC_SIGTERM_TO_SIGKILL_MS = 750;
const PID_TABLE_TIMEOUT_MS = 500;

/** 问一次「这个目标还在吗」。返回 false 表示 ESRCH，true 表示存在或无权但存在。 */
function targetStillThere(pid: number): boolean {
  let answer: boolean;
  try {
    process.kill(pid, 0);
    answer = true;
  } catch (probe) {
    answer = (probe as NodeJS.ErrnoException).code === "EPERM";
  }
  return answer;
}

/** 信号投递：拿到的结局只有「投出去了」与「目标已不在」两种，后者按成功处理。 */
function deliver(pid: number, signal: NodeJS.Signals): boolean {
  try {
    process.kill(pid, signal);
    return true;
  } catch {
    // 存活检查与投递之间目标可能已经退出；不再区分原因。
    return false;
  }
}

/** 拉一份 pid/ppid 快照；失败或超时都按空表处理（不影响主终止动作）。 */
function readPidTable(): Promise<string> {
  return new Promise((settle) => {
    execFile(
      "ps",
      ["-eo", "pid=,ppid="],
      { encoding: "utf8", timeout: PID_TABLE_TIMEOUT_MS, windowsHide: true },
      (failure, text) => settle(failure ? "" : text),
    );
  });
}

/** 把 pid/ppid 快照折成父子索引；无法解析的行直接跳过。 */
function indexChildren(table: string): Map<number, number[]> {
  const index = new Map<number, number[]>();
  const row = /^\s*(\d+)\s+(\d+)\s*$/;
  for (const line of table.split(/\r?\n/)) {
    const parsed = row.exec(line);
    if (parsed === null) continue;
    const parent = Number(parsed[2]);
    const existing = index.get(parent);
    if (existing === undefined) index.set(parent, [Number(parsed[1])]);
    else existing.push(Number(parsed[1]));
  }
  return index;
}

/** 广度优先收齐后代，返回顺序是「远的在前」，便于先杀叶子再杀根。 */
function descendants(table: string, rootPid: number): number[] {
  const index = indexChildren(table);
  const collected: number[] = [];
  const pending = [...(index.get(rootPid) ?? [])];
  while (pending.length > 0) {
    const current = pending.shift() as number;
    collected.push(current);
    pending.push(...(index.get(current) ?? []));
  }
  return collected.reverse();
}

/** 进程组是否还在：ESRCH 表示已消失，EPERM 表示存在但无权发信号。 */
function groupAlive(groupLeaderPid: number): boolean {
  return targetStillThere(-groupLeaderPid);
}

/** 进程树信号的入参：根 pid 与要投递的信号。 */
export type TreeSignalAsk = { rootPid: number; signal: NodeJS.Signals };

/**
 * POSIX 进程树信号：先按进程组投，再投根进程本身，最后逐个后代。
 * 三路互不依赖，任一路失败都不影响其余投递。
 */
export async function signalPosixProcessTree(ask: TreeSignalAsk): Promise<void> {
  const { rootPid, signal } = ask;
  if (!Number.isSafeInteger(rootPid) || rootPid <= 0) return;
  const order = descendants(await readPidTable(), rootPid);
  const targets = [-rootPid, rootPid, ...order];
  for (const target of targets) deliver(target, signal);
}

/**
 * 通用 POSIX 执行面的收尾：先 SIGTERM，宽限期后再 SIGKILL。
 * 组级投递失败时退化为单进程投递，保证总有一个通道生效。
 */
export function terminateGenericPosixProcessGroup(child: ChildProcess): void {
  const leader = child.pid;
  if (!leader) return;
  if (!signalGroupOrChild(child, leader, "SIGTERM")) return;
  const escalation = setTimeout(() => {
    if (groupAlive(leader)) signalGroupOrChild(child, leader, "SIGKILL");
  }, GENERIC_SIGTERM_TO_SIGKILL_MS);
  escalation.unref();
}

/** 先试进程组，再退单进程；两条路都失败说明已经无关可杀。 */
function signalGroupOrChild(child: ChildProcess, leader: number, signal: NodeJS.Signals): boolean {
  if (deliver(-leader, signal)) return true;
  try {
    child.kill(signal);
    return true;
  } catch {
    return false;
  }
}
