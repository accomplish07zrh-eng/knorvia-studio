import assert from "node:assert/strict";
import { test } from "node:test";
import { projectStudioGroupMetrics } from "../src/studio-runtime/app/groupMetricsProjection.js";
import type { StudioKernelUsage } from "../src/studio-runtime/kernelTypes.js";
import type { StudioRun, StudioTurnSnapshot } from "../src/studio-runtime/types.js";

const run: StudioRun = {
  id: "run-1",
  kind: "group",
  targetId: "group",
  state: "running",
  input: "ship",
  createdAt: 1000,
  updatedAt: 2000,
  checkpoint: { steps: {}, values: {}, completedRounds: 0 },
  attempt: 1,
  taskMode: true,
  definition: {
    id: "group",
    name: "Team",
    goal: "ship",
    members: ["codex", "claude-code"],
    host: "codex",
    sharedSummary: "",
    mode: "task",
    workspaceMode: "isolated",
    createdAt: 1,
    updatedAt: 1,
  },
};

test("group statistics add observed turns by member and mark partial reporting", () => {
  const turns: StudioTurnSnapshot[] = [
    {
      id: "a",
      runId: run.id,
      stepId: "a",
      state: "succeeded",
      attempt: 1,
      memberId: "codex",
      startedAt: 1000,
      endedAt: 4000,
    },
    {
      id: "b",
      runId: run.id,
      stepId: "b",
      state: "running",
      attempt: 1,
      memberId: "claude-code",
      startedAt: 1500,
    },
  ];
  const usage = new Map<string, StudioKernelUsage>([
    ["a", { scope: "turn", inputTokens: 10, outputTokens: 5 }],
    ["b", { scope: "request", outputTokens: 2 }],
  ]);
  const metrics = projectStudioGroupMetrics(run, turns, (id) => usage.get(id), 3500, false)!;
  assert.deepEqual(
    metrics.members.map((item) => [item.member, item.tokens, item.durationMs]),
    [
      ["codex", 15, 3000],
      ["claude-code", 2, 2000],
    ],
  );
  assert.equal(metrics.total.tokens, 17);
  assert.equal(metrics.total.durationMs, 5000);
  assert.equal(metrics.total.tokensPartial, true);
  assert.equal(metrics.total.durationPartial, true);
  assert.equal(metrics.members[0]!.tokensPartial, false);
});

test("unknown old turns and interrupted execution do not fabricate time or usage", () => {
  const turns: StudioTurnSnapshot[] = [
    { id: "old", runId: run.id, stepId: "old", state: "succeeded", attempt: 0 },
    {
      id: "unknown",
      runId: run.id,
      stepId: "unknown",
      state: "running",
      attempt: 1,
      memberId: "codex",
      startedAt: 1000,
    },
  ];
  const metrics = projectStudioGroupMetrics(
    { ...run, state: "interrupted", resultKnown: false },
    turns,
    () => undefined,
    9000,
    true,
  )!;
  assert.equal(metrics.total.tokens, undefined);
  assert.equal(metrics.total.durationMs, undefined);
  assert.equal(metrics.total.tokensPartial, true);
  assert.equal(metrics.total.durationPartial, true);
  assert.equal(metrics.truncated, true);
});

test("invalid counters and clocks stay unknown instead of becoming zero", () => {
  const metrics = projectStudioGroupMetrics(
    run,
    [
      {
        id: "bad",
        runId: run.id,
        stepId: "bad",
        state: "succeeded",
        attempt: 1,
        memberId: "codex",
        startedAt: 5000,
        endedAt: 4000,
      },
    ],
    () => ({ inputTokens: -1, outputTokens: Number.NaN }),
    6000,
    false,
  )!;
  assert.equal(metrics.members[0]?.tokens, undefined);
  assert.equal(metrics.members[0]?.durationMs, undefined);
  assert.equal(metrics.total.tokens, undefined);
  assert.equal(metrics.total.durationMs, undefined);
  assert.equal(metrics.total.tokensPartial, true);
  assert.equal(metrics.total.durationPartial, true);
});
