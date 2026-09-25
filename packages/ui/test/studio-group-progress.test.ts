import assert from "node:assert/strict";
import { test } from "node:test";
import type { StudioRun, StudioTimeline } from "@knorvia/services";
import { groupProgress } from "../src/studio/groups/groupProgress.js";

const run: StudioRun = {
  id: "run-1",
  kind: "group",
  targetId: "group",
  state: "running",
  input: "ship",
  createdAt: 1,
  updatedAt: 1,
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
  checkpoint: {
    steps: {},
    values: {},
    completedRounds: 0,
    plan: {
      version: 1,
      round: 0,
      phase: "tasks",
      dispatched: 2,
      tasks: [
        { id: "a", member: "codex", instruction: "Implement", dependsOn: [] },
        { id: "b", member: "claude-code", instruction: "Review", dependsOn: ["a"] },
      ],
    },
  },
};
const timeline = (
  value: StudioRun,
  turns: StudioTimeline["turns"] = [],
  interactions: StudioTimeline["interactions"] = [],
): StudioTimeline => ({
  revision: 1,
  messages: [],
  interactions,
  runs: [value],
  turns,
});

test("task progress follows persisted turns and pending approval, not member prose", () => {
  const snapshot = timeline(run, [
    { id: "turn-a", runId: run.id, stepId: "group:round:0:task:a", state: "running", attempt: 1 },
  ]);
  assert.deepEqual(
    groupProgress(snapshot)?.members.map((member) => member.state),
    ["running", "queued"],
  );
  snapshot.interactions.push({
    id: "approval",
    runId: run.id,
    turnId: "turn-a",
    status: "pending",
    kind: "approval",
    title: "Approve",
    kernel: "codex",
  });
  assert.equal(groupProgress(snapshot)?.members[0]?.state, "waiting");
});

test("replanned tasks ignore old-round results and retain the last review and evidence", () => {
  const stepId = "group:round:1:task:a";
  const revised: StudioRun = {
    ...run,
    checkpoint: {
      ...run.checkpoint,
      steps: {
        "group:round:0:task:a": { status: "succeeded", text: "old", resultKnown: true },
        [stepId]: {
          status: "succeeded",
          text: "done",
          resultKnown: true,
          workspacePath: "C:/isolated",
          changesSummary: "added report.md",
        },
      },
      plan: {
        version: 1,
        round: 1,
        phase: "tasks",
        dispatched: 3,
        tasks: [{ id: "a", member: "codex", instruction: "Revise report", dependsOn: [] }],
        review: { round: 0, status: "revise", summary: "Needs a report." },
      },
    },
  };
  const progress = groupProgress(timeline(revised))!;
  assert.equal(progress.round, 1);
  assert.equal(progress.members[0]?.state, "completed");
  assert.equal(progress.members[0]?.tasks[0]?.evidence?.changesSummary, "added report.md");
  assert.equal(progress.review?.summary, "Needs a report.");
  assert.equal(progress.members[1]?.state, "unassigned");
});

test("interrupted active turn remains unknown after reconnect; a newer manual run hides old task progress", () => {
  const interrupted = { ...run, state: "interrupted" as const, resultKnown: false };
  const snapshot = timeline(interrupted, [
    { id: "turn-a", runId: run.id, stepId: "group:round:0:task:a", state: "running", attempt: 1 },
  ]);
  assert.equal(groupProgress(snapshot)?.members[0]?.state, "unknown");
  snapshot.runs.unshift({ ...run, id: "manual", taskMode: false });
  assert.equal(groupProgress(snapshot), undefined);
});

test("stop request keeps an active member in stopping state until a confirmed outcome", () => {
  const stopping = { ...run, cancelRequested: true };
  const snapshot = timeline(stopping, [
    { id: "turn-a", runId: run.id, stepId: "group:round:0:task:a", state: "running", attempt: 1 },
  ]);
  assert.equal(groupProgress(snapshot)?.members[0]?.state, "stopping");
  snapshot.runs[0] = { ...stopping, state: "interrupted", resultKnown: false };
  assert.equal(groupProgress(snapshot)?.members[0]?.state, "unknown");
});

test("host failure before a plan is saved is visible as failed, not unassigned", () => {
  const failed: StudioRun = {
    ...run,
    state: "failed",
    resultKnown: true,
    checkpoint: { steps: {}, values: {}, completedRounds: 0 },
  };
  const snapshot = timeline(failed, [
    { id: "host", runId: run.id, stepId: "group:plan:0:response:0", state: "failed", attempt: 1 },
  ]);
  assert.equal(groupProgress(snapshot)?.phase, "planning");
  assert.equal(groupProgress(snapshot)?.members[0]?.state, "failed");
});

test("a task behind a failed dependency is not shown as queued for dispatch", () => {
  const blocked: StudioRun = {
    ...run,
    checkpoint: {
      ...run.checkpoint,
      steps: {
        "group:round:0:task:a": { status: "failed", text: "", resultKnown: true },
      },
    },
  };
  assert.deepEqual(
    groupProgress(timeline(blocked))?.members.map((member) => member.state),
    ["failed", "blocked"],
  );
});
