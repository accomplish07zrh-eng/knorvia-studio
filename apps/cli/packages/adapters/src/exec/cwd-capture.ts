// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Knorvia Studio contributors
import { randomUUID } from "node:crypto";
import { readFileSync, realpathSync, statSync, unlinkSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import type { ExecutionCommand, ExecutionRequest, ExecutionShellDialect } from "@knorvia/contracts";
import { gitBashPathToWindowsPath } from "@knorvia/contracts";

interface CwdCapturePlan {
  command: ExecutionCommand;
  cwdFilePath?: string;
}

function posixQuote(value: string): string {
  return `'${value.replace(/'/g, `'"'"'`)}'`;
}

function cmdQuote(value: string): string {
  return `"${value.replace(/"/g, '""')}"`;
}

export function createCwdCapturePlan(
  request: ExecutionRequest,
  options: { dialect: ExecutionShellDialect; platform: NodeJS.Platform },
): CwdCapturePlan {
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

export function readCapturedCwd(
  cwdFilePath: string | undefined,
  options: { dialect: ExecutionShellDialect },
): string | undefined {
  if (!cwdFilePath) return undefined;
  try {
    let captured = readFileSync(cwdFilePath, "utf8").replace(/(?:\r?\n)$/, "");
    if (options.dialect === "git-bash") captured = gitBashPathToWindowsPath(captured);
    if (!statSync(captured).isDirectory()) return undefined;
    return realpathSync(captured);
  } catch {
    return undefined;
  } finally {
    try {
      unlinkSync(cwdFilePath);
    } catch {
      // Capture cleanup is secondary to the execution result.
    }
  }
}
