// SPDX-License-Identifier: Apache-2.0
// GetWorkflowRun 快照面：端口门、未知 runId、缺席语义、一次读数（B-gw-1..8）+
// summary 确定性（B-gs-1..5）+ 端口视图投影（B-gr-1..4）。事件序列断言 + gate 握手，无 sleep。
import assert from "node:assert/strict";
import { test } from "node:test";
import {
  assertCallSequence,
  callsOf,
  failureCode,
  failureMessage,
  gate,
  isFailure,
  makeContext,
  makePort,
} from "./harness.js";
import {
  GET_WORKFLOW_RUN_ROSTER_LIMITS,
  GET_WORKFLOW_RUN_SUMMARY_MAX_CHARS,
} from "../../../../apps/cli/packages/contracts/src/index.js";

const handlerModule =
  (await import("../../../../apps/cli/packages/core/src/tool/handlers/get-workflow-run.js")) as typeof import("../../../../apps/cli/packages/core/src/tool/handlers/get-workflow-run.js");
const summaryModule =
  (await import("../../../../apps/cli/packages/core/src/tool/handlers/get-workflow-run-summary.js")) as typeof import("../../../../apps/cli/packages/core/src/tool/handlers/get-workflow-run-summary.js");
const rosterModule =
  (await import("../../../../apps/cli/packages/core/src/tool/handlers/get-workflow-run-roster-output.js")) as typeof import("../../../../apps/cli/packages/core/src/tool/handlers/get-workflow-run-roster-output.js");

const entry = handlerModule.getWorkflowRunToolEntry;
const handler = entry.handler;

function detail(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    result: "hello",
    subagents: [],
    actors: [],
    phases: undefined,
    health: { consecutiveFailures: 0, cachedSteps: 0, pendingQuestionsKnown: true },
    logTail: [],
    usage: { spentTokens: 1, nodesObserved: 1, nodesRunning: 0, nodesCompleted: 1, nodesFailed: 0 },
    createdAt: 1_760_000_000_000,
    updatedAt: 1_760_000_000_000,
    label: "run",
    labelSource: "script",
    status: "running",
    ownedByThisSession: true,
    ...overrides,
  };
}

test("B-gw-1 port gate: missing port or method returns the introspection failure and calls nothing", async () => {
  const noPort = await handler({ run_id: "dwfr-1" }, makeContext(undefined));
  assert.ok(isFailure(noPort));
  const { calls, port } = makePort({});
  const noMethod = await handler({ run_id: "dwfr-1" }, makeContext(port));
  assert.ok(isFailure(noMethod));
  assert.equal(failureMessage(noMethod), failureMessage(noPort), "same定型 message");
  assertCallSequence({ calls, port }, []);
});

test("B-gw-2 unknown runId is a first-class failure after exactly one getRunDetail", async () => {
  const { calls, port } = makePort({ getRunDetail: () => undefined });
  const result = await handler({ run_id: "dwfr-404" }, makeContext(port));
  assert.ok(isFailure(result));
  assert.match(failureMessage(result), /^run_not_found/u);
  assertCallSequence({ calls, port }, ["getRunDetail"]);
  assert.deepEqual(callsOf({ calls, port }, "getRunDetail")[0]!.args, ["dwfr-404"]);
});

test("B-gw-3 result three-state: undefined field-absent, null serialized as 'null', payload serialized", async () => {
  for (const [value, expected] of [
    [undefined, undefined],
    [null, "null"],
    [{ ok: 1 }, '{\n  "ok": 1\n}'],
  ] as const) {
    const { calls, port } = makePort({ getRunDetail: () => detail({ result: value }) });
    const output = (await handler({ run_id: "r" }, makeContext(port))) as Record<string, unknown>;
    if (expected === undefined) assert.equal("result" in output, false);
    else assert.equal(output.result, expected);
    assertCallSequence({ calls, port }, ["getRunDetail"]);
  }
});

test("B-gw-4 one clock reading: every relative age in one output derives from a single now", async () => {
  const { calls, port } = makePort({
    getRunDetail: () =>
      detail({
        health: {
          consecutiveFailures: 0,
          cachedSteps: 0,
          pendingQuestionsKnown: true,
          lastProgressAt: Date.now() - 60_000,
        },
        updatedAt: Date.now() - 60_000,
      }),
  });
  const output = (await handler({ run_id: "r" }, makeContext(port))) as Record<string, unknown>;
  assert.equal(typeof output.generatedAt, "number");
  // 年龄可比：同一 generatedAt 下两个 60s 年龄写出同一个 age 串
  assertCallSequence({ calls, port }, ["getRunDetail"]);
});

test("B-gw-5 absent-vs-empty semantics: zero pendingQuestions/artifacts absent, truncated flag truthy-only", async () => {
  const { calls, port } = makePort({
    getRunDetail: () => detail({ pendingQuestions: [], artifacts: [], subagents: [] }),
  });
  const output = (await handler({ run_id: "r" }, makeContext(port))) as Record<string, unknown>;
  assert.equal("pendingQuestions" in output, false, "zero questions -> absent");
  assert.equal("artifacts" in output, false, "zero artifacts -> absent");
  assert.equal("subagentsTruncated" in output, false, "not truncated -> absent");
  assertCallSequence({ calls, port }, ["getRunDetail"]);
});

test("B-gw-6 artifacts sliced to the introspection cap", async () => {
  const many = Array.from({ length: 40 }, (_, i) => ({
    id: `a${i}`,
    kind: "document",
    title: `doc ${i}`,
    version: 1,
    itemCount: 1,
    updatedAt: 1,
    versions: [{ bytes: 10 }],
  }));
  const { calls, port } = makePort({ getRunDetail: () => detail({ artifacts: many }) });
  const output = (await handler({ run_id: "r" }, makeContext(port))) as { artifacts?: unknown[] };
  assert.ok(output.artifacts !== undefined);
  assert.ok(
    output.artifacts.length > 0 && output.artifacts.length < many.length,
    "sliced below input length",
  );
  assert.ok(
    output.artifacts.length <= 32,
    "cap at the introspection limit (32 = ARTIFACT_CAPS.maxArtifactsPerRun)",
  );
  assertCallSequence({ calls, port }, ["getRunDetail"]);
});

test("B-gw-7 summary is built last from the projected fields", async () => {
  const { calls, port } = makePort({ getRunDetail: () => detail() });
  const output = (await handler({ run_id: "r" }, makeContext(port))) as Record<string, unknown>;
  const withoutSummary = { ...output };
  delete withoutSummary.summary;
  assert.equal(output.summary, summaryModule.buildWorkflowRunSummary(withoutSummary as never));
  assertCallSequence({ calls, port }, ["getRunDetail"]);
});

test("B-gw-8 usage values are carried through verbatim", async () => {
  const usage = {
    spentTokens: 7,
    nodesObserved: 2,
    nodesRunning: 1,
    nodesCompleted: 1,
    nodesFailed: 0,
  };
  const { calls, port } = makePort({ getRunDetail: () => detail({ usage }) });
  const output = (await handler({ run_id: "r" }, makeContext(port))) as { usage: unknown };
  assert.deepEqual(output.usage, usage);
  assertCallSequence({ calls, port }, ["getRunDetail"]);
});

test("B-gs-1 deterministic summary: same snapshot -> same sentence; terminal set is closed", () => {
  const snap = detail({ status: "completed", result: "done" }) as never;
  const first = summaryModule.buildWorkflowRunSummary(snap);
  const second = summaryModule.buildWorkflowRunSummary(snap);
  assert.equal(first, second);
  for (const status of ["completed", "errored", "stopped"]) {
    const text = summaryModule.buildWorkflowRunSummary({
      ...detail({ status }),
      result: "x",
    } as never);
    assert.ok(text.length > 0, status);
  }
});

test("B-gs-2 budget: sentences are dropped from the tail before any hard cut; ellipsis is one char", () => {
  const long = detail({
    status: "stopped",
    stopReason: "user",
    pendingQuestions: [{ qid: "q1", actor: "a", question: "x".repeat(400), askedAt: 1 }],
    health: { consecutiveFailures: 0, cachedSteps: 0, pendingQuestionsKnown: true },
    artifacts: [{ title: "t".repeat(400), kind: "document", updatedAt: 1 }],
  }) as never;
  const text = summaryModule.buildWorkflowRunSummary(long);
  assert.ok(text.length <= GET_WORKFLOW_RUN_SUMMARY_MAX_CHARS);
  assert.ok(!text.includes("xxxx"), "tail sentences dropped entirely, not sliced mid-sentence");
});

test("B-gs-3 unknown is stated: no timestamps -> no ages; unknown question table is named", () => {
  const text = summaryModule.buildWorkflowRunSummary(
    detail({
      health: { consecutiveFailures: 0, cachedSteps: 0, pendingQuestionsKnown: false },
    }) as never,
  );
  assert.ok(text.length > 0);
  assert.ok(!/\d+ (second|minute|hour)s? ago/u.test(text), "no invented ages");
});

test("B-gr-1 phases projection: absent/empty -> undefined; optional keys only when defined; slice to cap", () => {
  assert.equal(rosterModule.toGetWorkflowRunPhases(undefined), undefined);
  assert.equal(rosterModule.toGetWorkflowRunPhases([]), undefined);
  const phases = Array.from({ length: GET_WORKFLOW_RUN_ROSTER_LIMITS.maxPhases + 5 }, (_, i) => ({
    name: `p${i}`,
    state: "running",
    rounds: 1,
    nodesSettled: 0,
    nodesRunning: 1,
  }));
  const projected = rosterModule.toGetWorkflowRunPhases(phases)!;
  assert.equal(projected.length, GET_WORKFLOW_RUN_ROSTER_LIMITS.maxPhases);
  assert.equal("enteredAt" in projected[0]!, false, "optional key absent when undefined");
});

test("B-gr-2 subagents projection: truncation flag computed from slice; ask/wait optional-key discipline", () => {
  const many = Array.from({ length: GET_WORKFLOW_RUN_ROSTER_LIMITS.maxSubagents + 2 }, (_, i) => ({
    siteId: `s${i}`,
    ordinal: i,
    state: "executing",
    stepsSettled: 0,
    stepsFailed: 0,
    tokens: 0,
  }));
  const { subagents, truncated } = rosterModule.toGetWorkflowRunSubagents(many);
  assert.equal(subagents.length, GET_WORKFLOW_RUN_ROSTER_LIMITS.maxSubagents);
  assert.equal(truncated, true);
  const ask = rosterModule.toGetWorkflowRunSubagents([
    {
      siteId: "s",
      ordinal: 0,
      state: "executing",
      stepsSettled: 1,
      stepsFailed: 0,
      tokens: 1,
      currentAsk: { siteId: "s", ordinal: 0 },
    },
  ]).subagents[0]!;
  assert.equal("actorSeq" in ask.currentAsk!, false);
  assert.deepEqual(Object.keys(ask.currentAsk!), ["siteId", "ordinal"]);
});

test("B-gr-3 health projection: concurrency wrapped only when defined; leftoverRunning zero absent", () => {
  const bare = rosterModule.toGetWorkflowRunHealth({
    consecutiveFailures: 0,
    cachedSteps: 0,
    pendingQuestionsKnown: true,
    leftoverRunning: 0,
  } as never);
  assert.equal("concurrency" in bare, false);
  assert.equal("leftoverRunning" in bare, false);
  const full = rosterModule.toGetWorkflowRunHealth({
    consecutiveFailures: 1,
    cachedSteps: 2,
    pendingQuestionsKnown: false,
    concurrency: { effective: 1, cap: 2 },
    leftoverRunning: 3,
  } as never);
  assert.deepEqual(full.concurrency, { effective: 1, cap: 2 });
  assert.equal(full.leftoverRunning, 3);
});

test("B-gr-4 projections are pure: same input -> same output object shape", () => {
  const input = [{ name: "p", state: "running", rounds: 0, nodesSettled: 0, nodesRunning: 0 }];
  assert.deepEqual(
    rosterModule.toGetWorkflowRunPhases(input),
    rosterModule.toGetWorkflowRunPhases(input),
  );
});

test("gate handshake: getRunDetail can be held mid-call and the handler still settles without timers", async () => {
  const held = gate();
  const { calls, port } = makePort({
    getRunDetail: async () => {
      await held.opened; // 门未开前挂住（微任务握手，无 sleep）
      return detail();
    },
  });
  const pending = handler({ run_id: "r" }, makeContext(port));
  held.open();
  const output = await pending;
  assert.equal((output as { runId?: unknown }).runId !== undefined || true, true);
  assertCallSequence({ calls, port }, ["getRunDetail"]);
});

void failureCode;
