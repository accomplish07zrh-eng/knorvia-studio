// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Knorvia Studio contributors
export type ProviderFixtureStage =
  `${"upload" | "submit" | "history" | "download"}:${"start" | "return"}`;
const MAX_TRACE_EVENTS = 16;

/** 只记录自有模拟供应商边界；不把未进入某阶段误称为持久化失败。 */
export function createProviderFixtureTrace(now: () => number = () => performance.now()) {
  const startedAt = now();
  const events: string[] = [];
  const counts = new Map<ProviderFixtureStage, number>();
  return {
    record(stage: ProviderFixtureStage) {
      counts.set(stage, (counts.get(stage) ?? 0) + 1);
      if (events.length < MAX_TRACE_EVENTS)
        events.push(`${stage}@${(now() - startedAt).toFixed(1)}ms`);
    },
    describe() {
      const checkpoint = counts.has("history:start") ? "observed via history entry" : "unobserved";
      return `ComfyUI fixture stages=${JSON.stringify(Object.fromEntries(counts))}; firstEvents=${events.join(" → ") || "none"}; providerTaskId checkpoint=${checkpoint}`;
    },
  };
}
