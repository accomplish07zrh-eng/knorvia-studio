// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Knorvia Studio contributors
import type { Logger } from "@knorvia/contracts";
import type { ToolEntry } from "./types.js";
import { runtimeParser } from "./runtime-schema.js";

interface NormalizeToolExecutionInputOptions {
  entry: ToolEntry;
  input: unknown;
  logger?: Logger;
  source: "initial" | "hook" | "permission";
}
export type RuntimeInputValidationIssue = Readonly<Record<string, unknown>>;
interface PreparedInitialToolExecutionInput {
  input: unknown;
  runtimeValidationIssues?: readonly RuntimeInputValidationIssue[];
}

type Decoded = { ok: true; value: unknown } | { ok: false };
const WARNING_MESSAGE = "Tool execution input JSON normalization failed";
function decode(text: string): Decoded {
  try {
    return { ok: true, value: JSON.parse(text) };
  } catch {
    return { ok: false };
  }
}

function prepare(options: NormalizeToolExecutionInputOptions): PreparedInitialToolExecutionInput {
  let input = options.input;
  if (typeof input === "string") {
    const decoded = decode(input);
    if (decoded.ok) input = decoded.value;
    else
      options.logger?.warn(WARNING_MESSAGE, {
        event: "tool.input.normalize_failed",
        inputLength: input.length,
        module: "core.tool.input-normalization",
        source: options.source,
        status: "failed",
        toolName: options.entry.metadata.name,
      });
  }
  const parse = runtimeParser(options.entry.runtimeInputSchema);
  if (!parse) return { input };
  const result = parse(input);
  if (result.success) return { input: result.data };
  const error = result.error;
  const candidates =
    error !== null && typeof error === "object"
      ? (error as { issues?: unknown }).issues
      : undefined;
  const issues: RuntimeInputValidationIssue[] = [];
  if (Array.isArray(candidates))
    candidates.forEach((issue) => {
      if (issue !== null && typeof issue === "object" && !Array.isArray(issue)) issues.push(issue);
    });
  return issues.length ? { input, runtimeValidationIssues: issues } : { input };
}

export function prepareInitialToolExecutionInput(
  options: Omit<NormalizeToolExecutionInputOptions, "source">,
): PreparedInitialToolExecutionInput {
  return prepare({ ...options, source: "initial" });
}

export function normalizeToolExecutionInput(options: NormalizeToolExecutionInputOptions): unknown {
  return prepare(options).input;
}
