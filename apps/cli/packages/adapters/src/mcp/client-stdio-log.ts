// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Knorvia Studio contributors
import type { Logger } from "@knorvia/contracts";
import type { ProtocolTransport } from "./client-state.js";

const STDERR_LIMIT = 4_000;
const HIDDEN = "[Redacted]";
const SECRET_NAME =
  "(?:(?:api|access|private)[_-]?key|secret(?:[_-]?key)?|token|password|passwd|pass|mysql_pass|mysql_password)";

function redact(text: string): string {
  const bearer = text.replace(/(bearer\s+)[^\s'"]+/gi, `$1${HIDDEN}`);
  const authorization = bearer.replace(
    /(\bauthorization\s*[:=]\s*)([^\r\n]+)/gi,
    (_match, prefix: string, value: string) =>
      `${prefix}${/^bearer\s+/i.test(value) ? "Bearer " : ""}${HIDDEN}`,
  );
  const query = authorization.replace(
    new RegExp(`([?&]${SECRET_NAME}=)[^&\\s]+`, "gi"),
    `$1${HIDDEN}`,
  );
  const quoted = query.replace(
    new RegExp(`(["']${SECRET_NAME}["']\\s*:\\s*)(["'])([^\\r\\n]*?)\\2`, "gi"),
    (_match, prefix: string, quote: string) => `${prefix}${quote}${HIDDEN}${quote}`,
  );
  const unquoted = quoted.replace(
    new RegExp(`(\\b${SECRET_NAME}\\s*[:=]\\s*["']?)[^\\s"',;)}]+`, "gi"),
    `$1${HIDDEN}`,
  );
  return unquoted.replace(/([a-z][a-z\d+.-]*:\/\/)[^\s/@:]+:[^\s/@]+@/gi, `$1${HIDDEN}@`);
}

interface StderrSource {
  stderr?: {
    on(event: "data", callback: (chunk: { toString(encoding: string): string }) => void): unknown;
  } | null;
}

export class StderrCapture {
  private tail = "";

  attach(transport: ProtocolTransport, name: string, logger: Logger | undefined): void {
    (transport as ProtocolTransport & StderrSource).stderr?.on("data", (chunk) => {
      const text = chunk.toString("utf8");
      this.tail = (this.tail + text).slice(-STDERR_LIMIT);
      logger?.debug("MCP stdio stderr", {
        event: "mcp.stdio.stderr",
        mcpServerName: name,
        stderr: redact(text).slice(0, STDERR_LIMIT),
      });
    });
  }

  read(): string | undefined {
    return this.tail ? redact(this.tail).slice(-STDERR_LIMIT) : undefined;
  }
}

export function errorText(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export function errorName(error: unknown): string {
  return error instanceof Error ? error.name : "unknown";
}
