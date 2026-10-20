// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Knorvia Studio contributors
//
// 执行结束后回捕工作目录。做法是把用户命令包进一层包装：命令本体跑完后，
// 由包装段把 `pwd -P` 写进一个临时文件，宿主进程再从该文件读出解析后的路径。
// 这样每次执行仍是独立 shell，环境变量、别名与函数都不会跨命令泄漏。
//
// 两种方言各有一套包装语法：POSIX 系（bash / sh / git-bash）用 `$?` 暂存退出码；
// cmd 用 setlocal + 延迟展开，避免 `%ERRORLEVEL%` 在解析期就被展开成旧值。

import { randomUUID } from "node:crypto";
import { readFileSync, realpathSync, statSync, unlinkSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import type { ExecutionCommand, ExecutionRequest, ExecutionShellDialect } from "@knorvia/contracts";
import { gitBashPathToWindowsPath } from "@knorvia/contracts";

/** 包装结果：替换后的命令，以及需要回读（随后删除）的临时文件路径。 */
export type CwdCapturePlan = {
  command: ExecutionCommand;
  cwdRecordPath?: string;
};

/** 回读参数：临时文件与方言。 */
export type CwdReadAsk = {
  recordPath: string | undefined;
  dialect: ExecutionShellDialect;
};

/** 构造捕获计划的入参。 */
export type CwdPlanAsk = {
  request: ExecutionRequest;
  dialect: ExecutionShellDialect;
  platform: NodeJS.Platform;
};

/** POSIX 单引号字面量：内部单引号拆出拼接，其余原样。 */
function quoteForPosix(value: string): string {
  return `'${value.replace(/'/g, `'"'"'`)}'`;
}

/** cmd 双引号字面量：内部双引号成对转义。 */
function quoteForCmd(value: string): string {
  return `"${value.replace(/"/g, '""')}"`;
}

/** git-bash 需要 POSIX 形式的路径，其余方言直接用宿主路径。 */
function recordPathForDialect(recordPath: string, dialect: ExecutionShellDialect): string {
  if (dialect === "git-bash") return recordPath.replace(/\\/g, "/");
  return recordPath;
}

/** POSIX 包装：先执行原命令，成功后写回 `pwd -P`，再原样透传退出码。 */
function wrapForPosix(body: string, recordPath: string): string {
  return [
    "{",
    body,
    "}",
    `__knorvia_status=$?`,
    `if [ "$__knorvia_status" -eq 0 ]; then pwd -P > ${quoteForPosix(recordPath)}; fi`,
    `exit "$__knorvia_status"`,
  ].join("\n");
}

/** cmd 包装：延迟展开保证读到的是命令执行后的 ERRORLEVEL。 */
function wrapForCmd(body: string, recordPath: string): string {
  const status = { check: "!__KNORVIA_STATUS!", assign: "!ERRORLEVEL!" };
  return [
    "setlocal EnableDelayedExpansion",
    body,
    `set "__KNORVIA_STATUS=${status.assign}"`,
    `if ${status.check} EQU 0 (cd > ${quoteForCmd(recordPath)})`,
    `exit /b ${status.check}`,
  ].join(" & ");
}

/**
 * 构造捕获计划。只有显式要求回捕且命令是 shell 模式时才包装；
 * 其余情况原样返回入参命令，调用方不需要判断。
 */
export function createCwdCapturePlan(ask: CwdPlanAsk): CwdCapturePlan {
  const command = ask.request.command;
  if (!ask.request.captureCwdAfterSuccess || command.mode !== "shell") return { command };
  const recordPath = path.join(os.tmpdir(), `knorvia-cwd-${randomUUID()}.txt`);
  const dialectPath = recordPathForDialect(recordPath, ask.dialect);
  const wrapped =
    ask.dialect === "cmd"
      ? wrapForCmd(command.command, recordPath)
      : wrapForPosix(command.command, dialectPath);
  return { command: { ...command, command: wrapped }, cwdRecordPath: recordPath };
}

/**
 * 读回临时文件里的目录并物理化（`realpath`）。
 * 无论成败都删除临时文件；任何一步失败都按「没捕到」处理，不影响命令结果。
 */
export function readCapturedCwd(ask: CwdReadAsk): string | undefined {
  const recordPath = ask.recordPath;
  if (recordPath === undefined) return undefined;
  try {
    const written = readFileSync(recordPath, "utf8").replace(/(?:\r?\n)$/, "");
    const hostPath = ask.dialect === "git-bash" ? gitBashPathToWindowsPath(written) : written;
    const isDirectory = statSync(hostPath).isDirectory();
    return isDirectory ? realpathSync(hostPath) : undefined;
  } catch {
    return undefined;
  } finally {
    unlinkRecordQuietly(recordPath);
  }
}

/** 清理临时文件；失败不影响命令结果，属次要动作。 */
function unlinkRecordQuietly(recordPath: string): void {
  try {
    unlinkSync(recordPath);
  } catch {
    // 回捕清理失败不改变执行结果的任何字段。
  }
}
