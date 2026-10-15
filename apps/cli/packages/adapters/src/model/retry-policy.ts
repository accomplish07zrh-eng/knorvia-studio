// SPDX-License-Identifier: Apache-2.0
// 重试参数解析：显式 options 优先于 KNORVIA_MODEL_* 环境变量，两者缺省回落默认值；
// 非法值（非正数、非有限、无法识别的布尔写法）一律回退默认，不抛错。
// 环境变量键名与默认值是兼容面，逐字保持。

export interface AiSdkModelRetryOptions {
  maxAttempts?: number; // 逻辑请求的物理尝试上限（含首次）
  baseDelayMs?: number; // 退避基数（毫秒）
  backoffFactor?: number; // 退避指数底数
  maxDelayMs?: number; // 退避上限（毫秒）
  jitter?: boolean; // 是否叠加 0.5–1.0 抖动
}
export type ResolvedAiSdkModelRetryOptions = Required<AiSdkModelRetryOptions>;
type EnvRecord = Record<string, string | undefined>;

const DEFAULT_MAX_ATTEMPTS = 11;
const DEFAULT_BASE_DELAY_MS = 2_000;
const DEFAULT_BACKOFF_FACTOR = 2;
const DEFAULT_MAX_DELAY_MS = 60_000;
const DEFAULT_JITTER = true;
const TRUE_TOKENS = new Set<unknown>([true, "true", "1"]);
const FALSE_TOKENS = new Set<unknown>([false, "false", "0"]);

const fallbacks: ResolvedAiSdkModelRetryOptions = {
  maxAttempts: DEFAULT_MAX_ATTEMPTS,
  baseDelayMs: DEFAULT_BASE_DELAY_MS,
  backoffFactor: DEFAULT_BACKOFF_FACTOR,
  maxDelayMs: DEFAULT_MAX_DELAY_MS,
  jitter: DEFAULT_JITTER,
};

function positiveNumber(candidate: unknown, fallback: number, forceInteger = false): number {
  const numeric = typeof candidate === "string" ? Number(candidate) : candidate;
  const usable = typeof numeric === "number" && Number.isFinite(numeric) && numeric > 0;
  if (!usable) return fallback;
  return forceInteger ? Math.floor(numeric as number) : (numeric as number);
}

function booleanValue(candidate: unknown, fallback: boolean): boolean {
  if (TRUE_TOKENS.has(candidate)) return true;
  if (FALSE_TOKENS.has(candidate)) return false;
  return fallback;
}

export function resolveAiSdkModelRetryOptions(
  explicit: AiSdkModelRetryOptions | undefined,
  environment: EnvRecord,
): ResolvedAiSdkModelRetryOptions {
  const maxAttemptsRaw = explicit?.maxAttempts ?? environment.KNORVIA_MODEL_MAX_ATTEMPTS;
  const baseDelayRaw = explicit?.baseDelayMs ?? environment.KNORVIA_MODEL_RETRY_BASE_DELAY_MS;
  const backoffRaw = explicit?.backoffFactor ?? environment.KNORVIA_MODEL_RETRY_BACKOFF_FACTOR;
  const maxDelayRaw = explicit?.maxDelayMs ?? environment.KNORVIA_MODEL_RETRY_MAX_DELAY_MS;
  const jitterRaw = explicit?.jitter ?? environment.KNORVIA_MODEL_RETRY_JITTER;
  return {
    maxAttempts: positiveNumber(maxAttemptsRaw, fallbacks.maxAttempts, true),
    baseDelayMs: positiveNumber(baseDelayRaw, fallbacks.baseDelayMs),
    backoffFactor: positiveNumber(backoffRaw, fallbacks.backoffFactor),
    maxDelayMs: positiveNumber(maxDelayRaw, fallbacks.maxDelayMs),
    jitter: booleanValue(jitterRaw, fallbacks.jitter),
  };
}
