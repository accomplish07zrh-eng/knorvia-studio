// SPDX-License-Identifier: MIT
// Knorvia independent replacement; per-file review pending.
export interface AiSdkModelRetryOptions {
  maxAttempts?: number;
  baseDelayMs?: number;
  backoffFactor?: number;
  maxDelayMs?: number;
  jitter?: boolean;
}
export type ResolvedAiSdkModelRetryOptions = Required<AiSdkModelRetryOptions>;
type EnvRecord = Record<string, string | undefined>;
const defaults: ResolvedAiSdkModelRetryOptions = {
  maxAttempts: 11,
  baseDelayMs: 2_000,
  backoffFactor: 2,
  maxDelayMs: 60_000,
  jitter: true,
};
function positiveNumber(value: unknown, fallback: number, integer = false): number {
  const parsed = typeof value === "string" ? Number(value) : value;
  if (typeof parsed !== "number" || !Number.isFinite(parsed) || parsed <= 0) return fallback;
  return integer ? Math.floor(parsed) : parsed;
}
function booleanValue(value: unknown, fallback: boolean): boolean {
  if (value === true || value === "true" || value === "1") return true;
  if (value === false || value === "false" || value === "0") return false;
  return fallback;
}
export function resolveAiSdkModelRetryOptions(
  options: AiSdkModelRetryOptions | undefined,
  env: EnvRecord,
): ResolvedAiSdkModelRetryOptions {
  return {
    maxAttempts: positiveNumber(
      options?.maxAttempts ?? env.KNORVIA_MODEL_MAX_ATTEMPTS,
      defaults.maxAttempts,
      true,
    ),
    baseDelayMs: positiveNumber(
      options?.baseDelayMs ?? env.KNORVIA_MODEL_RETRY_BASE_DELAY_MS,
      defaults.baseDelayMs,
    ),
    backoffFactor: positiveNumber(
      options?.backoffFactor ?? env.KNORVIA_MODEL_RETRY_BACKOFF_FACTOR,
      defaults.backoffFactor,
    ),
    maxDelayMs: positiveNumber(
      options?.maxDelayMs ?? env.KNORVIA_MODEL_RETRY_MAX_DELAY_MS,
      defaults.maxDelayMs,
    ),
    jitter: booleanValue(options?.jitter ?? env.KNORVIA_MODEL_RETRY_JITTER, defaults.jitter),
  };
}
