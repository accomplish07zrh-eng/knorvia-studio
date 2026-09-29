// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Knorvia Studio contributors
const DEFAULT_BASH_INLINE_LENGTH = 30_000;
const MAX_BASH_INLINE_LENGTH = 150_000;

export function resolveBashMaxOutputLength(
  processEnv: NodeJS.ProcessEnv,
  requestFallback?: number,
): number {
  const fallback =
    Number.isFinite(requestFallback) && requestFallback !== undefined && requestFallback >= 0
      ? Math.min(requestFallback, MAX_BASH_INLINE_LENGTH)
      : DEFAULT_BASH_INLINE_LENGTH;
  const configured = processEnv.BASH_MAX_OUTPUT_LENGTH;
  if (configured === undefined) return fallback;
  if (configured.trim() === "") return DEFAULT_BASH_INLINE_LENGTH;
  const parsed = Number(configured);
  if (!Number.isFinite(parsed) || parsed <= 0) return DEFAULT_BASH_INLINE_LENGTH;
  return Math.min(Math.floor(parsed), MAX_BASH_INLINE_LENGTH);
}
