// SPDX-License-Identifier: MIT
// Knorvia independent replacement; per-file review pending.
import type { Logger } from "@knorvia/contracts";
interface NormalizeModelToolInputOptions {
  logger?: Logger;
  source: "generateText" | "streamText";
  toolName?: string;
}
export function normalizeModelToolInput(
  input: unknown,
  options: NormalizeModelToolInputOptions,
): unknown {
  if (input === undefined || input === "") return {};
  if (typeof input !== "string") return input ?? {};
  try {
    return JSON.parse(input) ?? {};
  } catch (error) {
    options.logger?.warn("Invalid model tool input; using an empty object", {
      source: options.source,
      toolName: options.toolName,
      error: error instanceof Error ? error.message : String(error),
    });
    return {};
  }
}
