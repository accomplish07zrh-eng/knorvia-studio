// SPDX-License-Identifier: Apache-2.0
// Additional pending behavior-contract coverage; no execution result is claimed.
import assert from "node:assert/strict";
import { test } from "node:test";
import type { StudioRun, StudioTimeline } from "@knorvia/services";
import { groupProgress } from "../src/studio/groups/groupProgress.js";

function run(): StudioRun {
  return {
    id: "current",
    kind: "group",
    targetId: "group",
    state: "running",
    input: "fixture",
    createdAt: 1,
    updatedAt: 1,
    attempt: 2,
    taskMode: true,
    definition: {
      id: "group",
      name: "Team",
      goal: "fixture",
      members: ["codex", "claude-code"],
      host: "codex",
      sharedSummary: "",
      mode: "task",
      workspaceMode: "isolated",
      createdAt: 1,
      updatedAt: 1,
    },
    checkpoint: {
      steps: {},
      values: {},
      completedRounds: 0,
      plan: {
        version: 1,
        round: 1,
        phase: "tasks",
        dispatched: 0,
        tasks: [
          { id: "a", member: "codex", instruction: "Implement", dependsOn: [] },
          { id: "b", member: "claude-code", instruction: "Review", dependsOn: ["a"] },
        ],
      },
    },
  };
}
function timeline(
  value: StudioRun,
  turns: NonNullable<StudioTimeline["turns"]> = [],
  interactions: StudioTimeline["interactions"] = [],
): StudioTimeline {
  return { revision: 1, messages: [], runs: [value], turns, interactions };
}
const step = (id: string) => `group:round:1:task:${id}`;
const states = (value: StudioTimeline) =>
  groupProgress(value)?.members.map((member) => member.state);

test("current attempt and first matching turn isolate late/duplicate and other-run observations", () => {
  const value = run();
  const snapshot = timeline(value, [
    { id: "old", runId: value.id, stepId: step("a"), state: "failed", attempt: 1 },
    { id: "other", runId: "other", stepId: step("a"), state: "failed", attempt: 2 },
    { id: "first", runId: value.id, stepId: step("a"), state: "succeeded", attempt: 2 },
    { id: "late", runId: value.id, stepId: step("a"), state: "failed", attempt: 2 },
  ]);
  assert.deepEqual(states(snapshot), ["completed", "queued"]);
  assert.deepEqual(value.checkpoint.steps, {});
});

test("pending interaction must match current run and selected turn; cancellation wins over waiting", () => {
  const value = run();
  const snapshot = timeline(
    value,
    [{ id: "turn", runId: value.id, stepId: step("a"), state: "running", attempt: 2 }],
    [
      {
        id: "other",
        runId: "other",
        turnId: "turn",
        status: "pending",
        kind: "approval",
        title: "Other",
        kernel: "codex",
      },
    ],
  );
  assert.equal(states(snapshot)?.[0], "running");
  snapshot.interactions.push({
    id: "waiting",
    runId: value.id,
    turnId: "turn",
    status: "pending",
    kind: "approval",
    title: "Approve",
    kernel: "codex",
  });
  assert.equal(states(snapshot)?.[0], "waiting");
  value.cancelRequested = true;
  assert.equal(states(snapshot)?.[0], "stopping");
});

test("checkpoint and turn disagreement follows the preserved result priority", () => {
  const value = run();
  value.state = "succeeded";
  value.checkpoint.steps[step("a")] = { status: "succeeded", text: "done", resultKnown: true };
  const snapshot = timeline(value, [
    { id: "turn", runId: value.id, stepId: step("a"), state: "failed", attempt: 2 },
  ]);
  assert.equal(states(snapshot)?.[0], "completed");
  value.checkpoint.steps[step("a")]!.resultKnown = false;
  assert.equal(states(snapshot)?.[0], "unknown");
});

test("current-round dependency failures block, missing dependencies preserve queued", () => {
  const value = run();
  value.checkpoint.steps["group:round:0:task:a"] = {
    status: "failed",
    text: "old",
    resultKnown: true,
  };
  assert.equal(states(timeline(value))?.[1], "queued");
  value.checkpoint.steps[step("a")] = { status: "failed", text: "new", resultKnown: true };
  assert.equal(states(timeline(value))?.[1], "blocked");
  value.checkpoint.steps[step("a")] = { status: "succeeded", text: "done", resultKnown: true };
  assert.equal(states(timeline(value))?.[1], "queued");
});

test("host review phase and member priority come from the first matching host fact", () => {
  const value = run();
  const snapshot = timeline(value, [
    { id: "old-host", runId: value.id, stepId: "group:plan:1", state: "failed", attempt: 1 },
    { id: "review", runId: value.id, stepId: "group:review:1", state: "running", attempt: 2 },
    { id: "plan", runId: value.id, stepId: "group:plan:1", state: "failed", attempt: 2 },
  ]);
  assert.equal(groupProgress(snapshot)?.phase, "reviewing");
  assert.equal(states(snapshot)?.[0], "running");
  value.resultKnown = false;
  assert.equal(states(snapshot)?.[0], "unknown");
  value.cancelRequested = true;
  assert.equal(states(snapshot)?.[0], "stopping");
});

test("invalid plans fall back to planning and an early host failure is visible", () => {
  const value = run();
  value.state = "failed";
  value.checkpoint.plan = { version: 1, round: -1, phase: "tasks", tasks: [] };
  assert.equal(groupProgress(timeline(value))?.phase, "planning");
  assert.deepEqual(states(timeline(value)), ["failed", "unassigned"]);
});

test("valid plan retains review identity, permits historical negative review round and filters invalid tasks", () => {
  const value = run();
  const review = { round: -1, status: "revise", summary: "Historical review" };
  value.checkpoint.plan = {
    version: 1,
    round: 1,
    phase: "tasks",
    review,
    tasks: [
      null,
      { id: 1, member: "codex", instruction: "Invalid id" },
      { id: "outside", member: "unknown-kernel", instruction: "Not a member" },
      { id: "valid", member: "codex", instruction: "Valid" },
    ],
  };
  const progress = groupProgress(timeline(value))!;
  assert.equal(progress.review, review);
  assert.deepEqual(
    progress.members[0]?.tasks.map((task) => task.id),
    ["valid"],
  );
  assert.equal(progress.members[1]?.state, "unassigned");
});

test("checkpoint evidence is projected only when at least one field is present", () => {
  const value = run();
  value.checkpoint.steps[step("a")] = {
    status: "succeeded",
    text: "done",
    resultKnown: true,
    workspacePath: "/isolated",
    changesSummary: "",
  };
  value.checkpoint.steps[step("b")] = {
    status: "succeeded",
    text: "done",
    resultKnown: true,
    workspacePath: "",
    changesSummary: "",
  };
  const progress = groupProgress(timeline(value))!;
  assert.deepEqual(progress.members[0]?.tasks[0]?.evidence, {
    workspacePath: "/isolated",
    changesSummary: "",
  });
  assert.equal("evidence" in progress.members[1]!.tasks[0]!, false);
});

test("a queued complete plan is steering; only the latest run is eligible for task progress", () => {
  const value = run();
  value.state = "queued";
  value.checkpoint.plan = { version: 1, round: 1, phase: "complete", tasks: [] };
  const snapshot = timeline(value);
  assert.equal(groupProgress(snapshot)?.phase, "steering");
  snapshot.runs.unshift({ ...value, id: "manual", taskMode: false });
  assert.equal(groupProgress(snapshot), undefined);
  assert.equal(groupProgress(undefined), undefined);
});
