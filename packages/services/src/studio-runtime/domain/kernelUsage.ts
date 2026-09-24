import type { StudioKernelUsage } from "../kernelTypes.js";

/** Partial snapshots replace supplied fields; repeated updates never add billed tokens twice. */
export function mergeKernelUsage(
  previous: StudioKernelUsage | undefined,
  next: StudioKernelUsage,
): StudioKernelUsage {
  const merged: StudioKernelUsage = { ...previous };
  if (next.scope) merged.scope = next.scope;
  // 新的完整计费用量不能继承上一次请求的缓存数据；窗口-only 更新仍保留计费快照。
  if (next.scope && (next.inputTokens !== undefined || next.outputTokens !== undefined)) {
    delete merged.inputTokens;
    delete merged.outputTokens;
    delete merged.cacheReadTokens;
    delete merged.cacheWriteTokens;
    delete merged.modelSteps;
  }
  for (const key of [
    "inputTokens",
    "outputTokens",
    "cacheReadTokens",
    "cacheWriteTokens",
    "contextUsedTokens",
    "contextMaxTokens",
    "modelSteps",
  ] as const) {
    const value = next[key];
    if (typeof value === "number" && Number.isFinite(value) && value >= 0) merged[key] = value;
  }
  return merged;
}

/** Claude reports uncached input separately from cache reads and writes. */
export function claudeInputTokens(usage: Record<string, unknown>): number | undefined {
  const input = usage.input_tokens;
  if (typeof input !== "number" || !Number.isFinite(input) || input < 0) return undefined;
  return (
    input +
    [usage.cache_read_input_tokens, usage.cache_creation_input_tokens].reduce<number>(
      (sum, value) =>
        sum + (typeof value === "number" && Number.isFinite(value) && value >= 0 ? value : 0),
      0,
    )
  );
}
