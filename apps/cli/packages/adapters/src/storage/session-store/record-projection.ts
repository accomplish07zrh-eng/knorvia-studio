// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Knorvia Studio contributors

export function isJsonRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

/** Retained keys keep their position; new fields append in the supplied order. */
export function projectRecord(
  source: Record<string, unknown>,
  removed: readonly string[] = [],
  fields: Record<string, unknown> = {},
): Record<string, unknown> {
  return Object.fromEntries([
    ...Object.entries(source).filter(([key]) => !removed.includes(key)),
    ...Object.entries(fields),
  ]);
}
