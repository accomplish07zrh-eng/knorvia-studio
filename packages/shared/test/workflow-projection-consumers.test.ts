// Actual unchanged CLI/public consumers; all events are synthetic and no IO is invoked.
import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { build } from "esbuild";
import type { WorkflowRunState } from "../src/protocol-v4/workflow-runs.js";
import { workflowModuleRoot } from "./workflow-projection-cases.js";

const root = fileURLToPath(new URL("../../../", import.meta.url));
const source = (process.env.KNORVIA_WORKFLOW_TEST_TARGET ?? "src") === "src";
const bundled = await build({
  stdin: {
    contents: `
    export {reduceWorkflowRunsState,workflowRunsStateSchema,applyConversationDelta} from '@knorvia/shared/protocol-v4';
    export {EMPTY_TUI_WORKFLOW_MIRROR,applyWorkflowProgressToMirror} from './apps/cli/packages/tui/src/app-workflow-mirror.ts';
    export {buildWorkflowRunByToolCallId} from './packages/ui/src/v4/workflowRunCardJoin.ts';
  `,
    resolveDir: root,
    loader: "ts",
  },
  bundle: true,
  platform: "node",
  format: "esm",
  write: false,
  plugins: [
    {
      name: "selected-shared-protocol-entry",
      setup(builder) {
        builder.onResolve({ filter: /^@knorvia\/shared\/protocol-v4$/ }, () => ({
          path: fileURLToPath(new URL(`index.${source ? "ts" : "js"}`, workflowModuleRoot)),
        }));
      },
    },
  ],
});
type Consumers = {
  reduceWorkflowRunsState: typeof import("../src/protocol-v4/workflow-runs-reducer.js").reduceWorkflowRunsState;
  workflowRunsStateSchema: typeof import("../src/protocol-v4/workflow-runs.js").workflowRunsStateSchema;
  applyConversationDelta: typeof import("../src/protocol-v4/apply.js").applyConversationDelta;
  EMPTY_TUI_WORKFLOW_MIRROR: typeof import("../../../apps/cli/packages/tui/src/app-workflow-mirror.js").EMPTY_TUI_WORKFLOW_MIRROR;
  applyWorkflowProgressToMirror: typeof import("../../../apps/cli/packages/tui/src/app-workflow-mirror.js").applyWorkflowProgressToMirror;
  // Only the dynamic bundle's exercised fields are typed here; root tsc checks the real UI implementation.
  buildWorkflowRunByToolCallId: (
    runs: readonly WorkflowRunState[],
  ) => ReadonlyMap<string, Record<string, unknown>>;
};
const api = (await import(
  `data:text/javascript;base64,${Buffer.from(bundled.outputFiles[0]!.text).toString("base64")}`
)) as Consumers;
const instance = { siteId: "fixture-site", ordinal: 1 };
const events = [
  {
    type: "run-launched",
    inputId: "fixture-input",
    phaseNames: ["first", "second"],
    phaseAlongside: [[1], [0]],
  },
  { type: "run-started", caps: { maxConcurrency: 3 } },
  { type: "phase-entered", name: "first", ordinal: 2 },
  {
    type: "concurrency-changed",
    key: "fixture/key",
    previous: 16,
    next: 4,
    reason: "rate-limit",
    cooldownMs: 500,
  },
  { type: "node-queued", instance, kind: "ask", instructionsHead: "synthetic task" },
  { type: "node-executing", instance },
  {
    type: "node-progress",
    instance,
    turn: 3,
    toolCalls: 2,
    lastTool: { name: "FixtureTool", target: "synthetic-target" },
  },
  { type: "node-waiting", instance },
  { type: "run-settled", status: "completed" },
];
// Synthetic accepted envelopes, not a claim to exercise the journal/launch IO entry.
const live = events.map(({ type, ...payload }, index) => ({
  runId: "fixture-run",
  sequence: index + 1,
  toolCallId: "fixture-tool-call",
  eventType: type,
  payload: { ...payload, ...(type === "run-started" ? { concurrencyCeiling: 16 } : {}) },
}));
function fold(envelopes: readonly Parameters<Consumers["reduceWorkflowRunsState"]>[1][]) {
  let state: Parameters<Consumers["reduceWorkflowRunsState"]>[0];
  for (const event of envelopes) state = api.reduceWorkflowRunsState(state, event) ?? state;
  return state!;
}
test("actual public reducer folds phase, progress and cooldown terminal rules", () => {
  const state = fold(live);
  api.workflowRunsStateSchema.parse(state);
  const run = state.runs[0]!;
  assert.deepEqual(run.phases, [{ name: "first", rounds: 2 }]);
  assert.deepEqual(run.phaseAlongside, [[1], [0]]);
  assert.deepEqual(run.concurrency, { key: "fixture/key", cap: 4, ceiling: 16, limit: 3 });
  assert.equal(run.nodes[0]!.phase, "waiting");
  assert.equal(run.nodes[0]!.turn, 3);
  assert.equal(run.nodes[0]!.toolCalls, 2);
  assert.equal(run.status, "completed");
  assert.equal(api.reduceWorkflowRunsState(state, live.at(-1)!), null);
});
test("actual TUI mirror agrees with repeated accepted-event replay", () => {
  const replay = JSON.parse(JSON.stringify(live)) as typeof live;
  let mirror = api.EMPTY_TUI_WORKFLOW_MIRROR;
  for (const event of replay) mirror = api.applyWorkflowProgressToMirror(mirror, event);
  assert.deepEqual(mirror.state, fold(live));
  assert.equal(api.applyWorkflowProgressToMirror(mirror, replay.at(-1)!), mirror);
});
test("actual UI tool-card join reads the same authoritative run and counts", () => {
  const state = fold(live);
  const card = api.buildWorkflowRunByToolCallId(state.runs).get("fixture-tool-call")!;
  assert.equal(card.run, state.runs[0]);
  assert.equal(card.status, "completed");
  assert.equal(card.nodesTotal, 1);
  assert.equal(card.nodesSettled, 0);
});
test("public projection follows resume/new-ask counts and retains learned shared cap", () => {
  const state = fold(live);
  const resumed = api.reduceWorkflowRunsState(state, {
    runId: "fixture-run",
    sequence: 10,
    eventType: "run-started",
    payload: { caps: { maxConcurrency: 2 }, concurrencyCeiling: 16 },
  })!;
  assert.equal(resumed.runs[0]!.status, "running");
  assert.equal(resumed.runs[0]!.concurrency!.cap, 4);
  assert.equal(resumed.runs[0]!.concurrency!.limit, 2);
  const requeued = api.reduceWorkflowRunsState(resumed, {
    runId: "fixture-run",
    sequence: 11,
    eventType: "node-queued",
    payload: { instance },
  })!;
  assert.equal(requeued.runs[0]!.nodes[0]!.turn, undefined);
  assert.equal(requeued.runs[0]!.nodes[0]!.instructionsHead, undefined);
});
test("continuous and replayable state.updated consumers end at the same workflow state", () => {
  const initial = {
    rows: { window: [], totalCount: 0, firstRowId: null },
  } as unknown as Parameters<Consumers["applyConversationDelta"]>[0];
  let state: Parameters<Consumers["reduceWorkflowRunsState"]>[0];
  let continuous = initial;
  const accepted: NonNullable<typeof state>[] = [];
  for (const event of live) {
    const next = api.reduceWorkflowRunsState(state, event);
    if (next !== null) {
      state = next;
      accepted.push(next);
      continuous = api.applyConversationDelta(continuous, {
        op: "state.updated",
        patch: { workflowRuns: next },
      });
    }
  }
  const replayable = api.applyConversationDelta(initial, {
    op: "state.updated",
    patch: { workflowRuns: accepted.at(-1)! },
  });
  assert.equal(JSON.stringify(continuous.workflowRuns), JSON.stringify(replayable.workflowRuns));
});
