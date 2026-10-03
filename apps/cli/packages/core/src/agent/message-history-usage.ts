import type { TokenUsageInfo } from "@knorvia/contracts";

export interface PersistedTokenUsageBaseline {
  cacheReadTokens: number;
  cacheWriteTokens: number;
  contextUsageTokens?: number;
  inputTokens: number;
  outputTokens: number;
}

function normalizeInteger(value: number | undefined): number | undefined {
  if (value === undefined || !Number.isFinite(value)) {
    return undefined;
  }

  return Math.floor(value);
}

function normalizePositive(value: number | undefined): number | undefined {
  const integer = normalizeInteger(value);
  return integer !== undefined && integer > 0 ? integer : undefined;
}

function normalizeNonnegative(value: number | undefined): number | undefined {
  const integer = normalizeInteger(value);
  return integer !== undefined && integer >= 0 ? integer : undefined;
}

function determineInputTokens(tokens: TokenUsageInfo): number | undefined {
  const inputTokens = normalizePositive(tokens.input);
  if (inputTokens !== undefined) {
    return inputTokens;
  }

  const totalTokens = normalizePositive(tokens.total);
  if (totalTokens !== undefined) {
    return Math.max(0, totalTokens - (normalizeNonnegative(tokens.output) ?? 0));
  }

  const cacheTokens =
    (normalizeNonnegative(tokens.cache.read) ?? 0) +
    (normalizeNonnegative(tokens.cache.write) ?? 0);
  return cacheTokens > 0 ? cacheTokens : undefined;
}

export function persistedTokenUsageBaseline(
  tokens: TokenUsageInfo | undefined,
): PersistedTokenUsageBaseline | undefined {
  if (!tokens) {
    return undefined;
  }

  const inputTokens = determineInputTokens(tokens);
  if (inputTokens === undefined || inputTokens <= 0) {
    return undefined;
  }

  const outputTokens = normalizePositive(tokens.output) ?? 0;
  const cacheReadTokens = normalizeNonnegative(tokens.cache.read) ?? 0;
  const cacheWriteTokens = normalizeNonnegative(tokens.cache.write) ?? 0;
  const totalTokens = normalizePositive(tokens.total);
  const contextUsageTokens =
    outputTokens > 0
      ? inputTokens + outputTokens
      : totalTokens !== undefined && totalTokens >= inputTokens
        ? totalTokens
        : undefined;

  return {
    cacheReadTokens,
    cacheWriteTokens,
    contextUsageTokens,
    inputTokens,
    outputTokens,
  };
}
