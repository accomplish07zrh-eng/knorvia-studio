// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Knorvia Studio contributors

export function usageCount(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) ? Math.max(0, Math.trunc(value)) : 0;
}
