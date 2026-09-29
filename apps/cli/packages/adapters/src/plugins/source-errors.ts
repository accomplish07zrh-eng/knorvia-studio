// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Knorvia Studio contributors

import type { PluginDiagnosticCode } from "@knorvia/contracts";
import { redactSourceDiagnostic, redactSourceReference } from "./source-redaction.js";

class SourceMaterializationFailure extends Error {
  readonly diagnosticCode: PluginDiagnosticCode;

  constructor(code: PluginDiagnosticCode, message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = "PluginSourceMaterializationError";
    this.diagnosticCode = code;
  }
}

export function createGitUnavailableError(source: string, reason?: string): Error {
  const reference = redactSourceReference(source);
  const explanation = reason ? ` (${redactSourceDiagnostic(reason)})` : "";
  return new SourceMaterializationFailure(
    "plugin_git_unavailable",
    `System Git is required for plugin source ${reference}${explanation}, but git is unavailable on this Agent Host. Install Git on the Agent Host, or use a public GitHub HTTPS or verified ZIP source.`,
  );
}

export function createArchiveFetchError(source: string, cause: unknown): Error {
  const detail = redactSourceDiagnostic(cause instanceof Error ? cause.message : String(cause));
  return new SourceMaterializationFailure(
    "plugin_archive_fetch_failed",
    `Failed to materialize public GitHub plugin source archive ${redactSourceReference(source)}: ${detail}`,
    cause instanceof Error ? { cause: new Error(detail) } : undefined,
  );
}

export function getPluginSourceDiagnosticCode(error: unknown): PluginDiagnosticCode | undefined {
  return error instanceof SourceMaterializationFailure ? error.diagnosticCode : undefined;
}

export function isCommandUnavailableError(error: unknown): boolean {
  return typeof error === "object" && error !== null && "code" in error && error.code === "ENOENT";
}
