// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Knorvia Studio contributors
import type { BrowserCommand, BrowserCommandResult } from "@knorvia/contracts/browser-control";

export class BrowserCommandError extends Error {
  readonly code: string;
  readonly command: BrowserCommand;
  readonly result: BrowserCommandResult;

  constructor(command: BrowserCommand, result: BrowserCommandResult, fallbackCode: string) {
    const detail = result.error;
    const code = detail?.code ?? fallbackCode;
    super(detail?.message ?? `Browser command failed: ${code}`);
    this.name = "BrowserCommandError";
    this.code = code;
    this.command = command;
    this.result = result;
  }
}

export function base64ToBytes(base64: string): Uint8Array {
  return Uint8Array.from(Buffer.from(base64, "base64"));
}

export function expectOk(
  command: BrowserCommand,
  result: BrowserCommandResult,
): BrowserCommandResult {
  if (result.ok) return result;
  throw new BrowserCommandError(command, result, "browser_command_failed");
}

export function expectPayload<T>(
  command: BrowserCommand,
  result: BrowserCommandResult,
  value: T | undefined,
  payloadName: string,
): T {
  expectOk(command, result);
  if (value !== undefined) return value;
  const missing: BrowserCommandResult = {
    ...result,
    ok: false,
    error: { code: "execution_error", message: `Browser result missing ${payloadName}` },
  };
  throw new BrowserCommandError(command, missing, "execution_error");
}
