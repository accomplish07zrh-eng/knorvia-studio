// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Knorvia Studio contributors
import { randomUUID } from "node:crypto";
import { readFileSync, realpathSync, statSync, unlinkSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import type { ExecutionCommand, ExecutionRequest, ExecutionShellDialect } from "@knorvia/contracts";
import { gitBashPathToWindowsPath } from "@knorvia/contracts";

interface /* cwd 捕获计划：命令 + 结果文件 */ CwdCapturePlan {
  command: ExecutionCommand;
  cwdFilePath?: /* 结果文件路径：仅 shell 模式有 */ string;
}

function posixQuote(value: string): string {
  return `'${value.replace(/'/g, `'"'"'`)}'`;
}

function cmdQuote(value: string): string {
  return `"${value.replace(/"/g, '""')}"`;
}

export function /* 构造捕获计划：按方言包装命令 */ createCwdCapturePlan(
  request: ExecutionRequest,
  options: { dialect: ExecutionShellDialect; platform: NodeJS.Platform },
): /* 捕获计划 */ CwdCapturePlan {
  if (!request.captureCwdAfterSuccess || request.command.mode !== "shell") {
    return { command: request.command };
  }
  const cwdFilePath = path.join(os.tmpdir(), `knorvia-cwd-${randomUUID()}.txt`);
  if (options.dialect === "cmd") {
    const command =
      `setlocal EnableDelayedExpansion & ${request.command.command} & ` +
      `set "__KNORVIA_STATUS=!ERRORLEVEL!" & ` +
      `if !__KNORVIA_STATUS! EQU 0 (cd > ${cmdQuote(cwdFilePath)}) & ` +
      `exit /b !__KNORVIA_STATUS!`;
    return { command: { ...request.command, command }, cwdFilePath };
  }
  const shellPath = options.dialect === "git-bash" ? cwdFilePath.replace(/\\/g, "/") : cwdFilePath;
  const command =
    `{\n${request.command.command}\n}\n__knorvia_status=$?; ` +
    `if [ "$__knorvia_status" -eq 0 ]; then pwd -P > ${posixQuote(shellPath)}; fi; ` +
    `exit "$__knorvia_status"`;
  return { command: { ...request.command, command }, cwdFilePath };
}

export function /* 读取捕获的 cwd：读完即清理结果文件 */ readCapturedCwd(
  cwdFilePath: /* 结果文件路径（可缺省） */ string | undefined,
  options: { dialect: ExecutionShellDialect },
): /* 捕获到的绝对路径 */ string | undefined {
  if (!cwdFilePath) return /* 未捕获：无结果文件 */ undefined;
  try /* 可能失败：失败按降级语义处理 */ {
    let captured = readFileSync(cwdFilePath, "utf8").replace(/(?:\r?\n)$/, "");
    if (options.dialect === "git-bash") captured = gitBashPathToWindowsPath(captured);
    if (!statSync(captured).isDirectory()) return undefined;
    return realpathSync(captured);
  } catch /* 失败按降级语义处理 */ {
    return /* 未捕获到有效目录 */ undefined;
  } finally /* 无论成败都清理结果文件 */ {
    try /* 可能失败：失败按降级语义处理 */ {
      /* 删除临时结果文件 */ unlinkSync(cwdFilePath);
    } catch /* 失败按降级语义处理 */ {
      // Capture cleanup is secondary to the execution result.
    }
  }
}
