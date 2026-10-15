// SPDX-License-Identifier: Apache-2.0
// GetWorkflowRun 模型面骨架与情势块结构断言（B-gf-1..7、B-gt-1..5、B-ga-1..3）。
// 文案逐字由 fixtures.test.ts 的金样锁定；本文件钉结构（块序、缺席、三态、列宽常量）。
import assert from "node:assert/strict";
import { test } from "node:test";

const formatModule =
  (await import("../../../../apps/cli/packages/core/src/tool/handlers/get-workflow-run-format.js")) as typeof import("../../../../apps/cli/packages/core/src/tool/handlers/get-workflow-run-format.js");
const rosterModule =
  (await import("../../../../apps/cli/packages/core/src/tool/handlers/get-workflow-run-format-roster.js")) as typeof import("../../../../apps/cli/packages/core/src/tool/handlers/get-workflow-run-format-roster.js");
const activityModule =
  (await import("../../../../apps/cli/packages/core/src/tool/handlers/get-workflow-run-activity-program.js")) as typeof import("../../../../apps/cli/packages/core/src/tool/handlers/get-workflow-run-activity-program.js");

const NOW = 1_760_000_000_000;

function output(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    summary: "s",
    runId: "dwfr-1",
    label: "run",
    labelSource: "script",
    status: "running",
    ownedByThisSession: true,
    generatedAt: NOW,
    createdAt: NOW - 60_000,
    updatedAt: NOW - 60_000,
    usage: { spentTokens: 1, nodesObserved: 1, nodesRunning: 0, nodesCompleted: 1, nodesFailed: 0 },
    health: { consecutiveFailures: 0, cachedSteps: 0, pendingQuestionsKnown: true },
    subagents: [],
    actors: [],
    logTail: [],
    ...overrides,
  };
}

test("B-gf-1 invalid output -> the pinned fallback sentence", () => {
  assert.equal(
    formatModule.formatGetWorkflowRunModelContent({}),
    "GetWorkflowRun returned an invalid result.",
  );
});

test("B-gf-2 block order is fixed; optional blocks only when their fields exist", () => {
  const text = String(formatModule.formatGetWorkflowRunModelContent(output()));
  const order = [
    "<summary>",
    "<run_id>",
    "<label",
    "<status>",
    "<owned_by_this_session>",
    "<created_at>",
    "<updated_at>",
    "<health>",
    "<subagents>",
    "<log_tail>",
    "<usage>",
  ];
  let cursor = -1;
  for (const marker of order) {
    const at = text.indexOf(marker);
    assert.ok(at > cursor, `${marker} after previous marker`);
    cursor = at;
  }
  assert.ok(!text.includes("<stop_reason>"), "absent stop_reason absent");
  assert.ok(!text.includes("<result>"), "absent result absent");
  const full = String(
    formatModule.formatGetWorkflowRunModelContent(
      output({
        status: "stopped",
        stopReason: "user",
        result: "null",
        error: { code: "e", message: "m" },
      }),
    ),
  );
  assert.ok(full.includes("<stop_reason>user</stop_reason>"));
  assert.ok(full.includes("<result>\nnull\n</result>"));
  assert.ok(full.includes('<error code="e">m</error>'));
});

test("B-gf-4 pending_questions three states: unknown named, empty absent, non-empty listed", () => {
  const unknown = String(
    formatModule.formatGetWorkflowRunModelContent(
      output({ health: { consecutiveFailures: 0, cachedSteps: 0, pendingQuestionsKnown: false } }),
    ),
  );
  assert.match(
    unknown,
    /<pending_questions>Unknown: pending questions are tracked only by the process/u,
  );
  const empty = String(formatModule.formatGetWorkflowRunModelContent(output()));
  assert.ok(!empty.includes("<pending_questions>"));
  const listed = String(
    formatModule.formatGetWorkflowRunModelContent(
      output({
        pendingQuestions: [{ qid: "dwfq-1", actor: "a", question: "q?", askedAt: NOW - 60_000 }],
      }),
    ),
  );
  assert.match(listed, /\[dwfq-1\] a asked/);
  assert.match(listed, /ResolveWorkflowQuestion using the ID in brackets/);
});

test("B-gf-5 usage line keys are fixed and space-joined", () => {
  const text = String(formatModule.formatGetWorkflowRunModelContent(output()));
  assert.match(
    text,
    /<usage>spent_tokens=1 nodes_observed=1 nodes_running=0 nodes_completed=1 nodes_failed=0<\/usage>/u,
  );
});

test("B-gf-7 routing: superseded wins; stopped gets resumable; every status gets amendable", () => {
  const superseded = String(
    formatModule.formatGetWorkflowRunModelContent(
      output({ status: "stopped", stopReason: "superseded", supersededBy: "dwfr-2" }),
    ),
  );
  assert.ok(superseded.includes("<superseded>"));
  assert.ok(!superseded.includes("<resumable>"), "superseded is not resumable");
  const stopped = String(
    formatModule.formatGetWorkflowRunModelContent(
      output({ status: "stopped", stopReason: "provider" }),
    ),
  );
  assert.match(stopped, /<resumable>/);
  assert.match(stopped, /A provider-side error stopped it/);
  for (const status of ["running", "completed", "errored", "stopped"]) {
    assert.ok(
      String(formatModule.formatGetWorkflowRunModelContent(output({ status }))).includes(
        "<amendable>",
      ),
      status,
    );
  }
});

test("B-gt-1 health line: stalled only for live runs; leftover note only for terminal with leftovers", () => {
  const live = rosterModule.formatWorkflowRunHealthBlock(output() as never, false);
  assert.ok(live.includes("stalled="));
  assert.ok(!live.includes("leftover"));
  const terminal = rosterModule.formatWorkflowRunHealthBlock(
    output({
      health: {
        consecutiveFailures: 0,
        cachedSteps: 0,
        pendingQuestionsKnown: true,
        leftoverRunning: 2,
      },
    }) as never,
    true,
  );
  assert.ok(!terminal.includes("stalled="), "terminal runs do not get stalled");
  assert.match(terminal, /The 2 "running" steps below are leftovers/u);
});

test("B-gt-2 phases table: rows follow declaration order; column width bounded by 24", () => {
  const phases = [
    {
      name: "x".repeat(40),
      state: "running",
      rounds: 1,
      nodesSettled: 1,
      nodesRunning: 0,
      enteredAt: NOW - 1000,
    },
    { name: "b", state: "ahead", rounds: 0, nodesSettled: 0, nodesRunning: 0 },
  ];
  const text = String(
    rosterModule.formatWorkflowRunPhasesBlock(output({ phases }) as never, false),
  );
  const lines = text.split("\n").slice(1, -1);
  assert.equal(lines.length, 2);
  assert.match(lines[0]!, /^1\. /);
  assert.match(lines[1]!, /^2\. /);
  assert.ok(lines[0]!.length < 200, "width bounded");
});

test("B-gt-3 subagents: zero -> fixed sentence; task line indented; truncation note pinned", () => {
  assert.equal(
    rosterModule.formatWorkflowRunSubagentsBlock(output() as never),
    "<subagents>No subagents created yet.</subagents>",
  );
  const text = String(
    rosterModule.formatWorkflowRunSubagentsBlock(
      output({
        subagents: [
          {
            siteId: "s",
            ordinal: 0,
            state: "executing",
            stepsSettled: 1,
            stepsFailed: 0,
            tokens: 5,
            currentAsk: { siteId: "s", ordinal: 0, instructionsHead: "do it" },
          },
        ],
        subagentsTruncated: true,
      }) as never,
    ),
  );
  assert.match(text, /\n {2}task: do it/);
  assert.match(text, /Only the first 1 subagents are listed/u);
});

test("B-gt-4 log_tail: empty -> fixed sentence; rows carry [sequence] and optional age", () => {
  assert.equal(
    rosterModule.formatWorkflowRunLogTailBlock(output() as never),
    "<log_tail>No log() narration recorded yet.</log_tail>",
  );
  const text = String(
    rosterModule.formatWorkflowRunLogTailBlock(
      output({
        logTail: [
          { sequence: 3, message: "hello", at: NOW - 60_000 },
          { sequence: 4, message: "bare" },
        ],
      }) as never,
    ),
  );
  assert.match(text, /\[3\] {2}1m 00s ago {2}hello/u);
  assert.match(text, /\[4\] {2}bare/u);
});

test("B-ga-1..3 activity lines follow the phase branch table", () => {
  const asked = new Map([["dwfq-1", NOW - 60_000]]);
  assert.equal(
    activityModule.renderWorkflowRunActivity(
      {
        siteId: "s",
        ordinal: 0,
        state: "parked",
        stepsSettled: 0,
        stepsFailed: 0,
        tokens: 0,
        parkedOn: "dwfq-1",
      } as never,
      NOW,
      asked,
    ),
    "on question dwfq-1 for 1m 00s",
  );
  assert.equal(
    activityModule.renderWorkflowRunActivity(
      {
        siteId: "s",
        ordinal: 0,
        state: "waiting",
        stepsSettled: 0,
        stepsFailed: 0,
        tokens: 0,
        wait: { cause: "slot", since: NOW - 60_000 },
      } as never,
      NOW,
      asked,
    ),
    "waiting for a slot for 1m 00s",
  );
  assert.match(
    activityModule.renderWorkflowRunActivity(
      {
        siteId: "s",
        ordinal: 0,
        state: "waiting",
        stepsSettled: 0,
        stepsFailed: 0,
        tokens: 0,
        wait: { cause: "backoff", reason: "429", retryAfterMs: 30_000, since: NOW - 60_000 },
      } as never,
      NOW,
      asked,
    ),
    /^backoff after 429 for 1m 00s, retry in 30s$/u,
  );
  assert.match(
    activityModule.renderWorkflowRunActivity(
      {
        siteId: "s",
        ordinal: 0,
        state: "unfinished",
        stepsSettled: 1,
        stepsFailed: 0,
        tokens: 0,
        currentAsk: { siteId: "s", ordinal: 0, actorSeq: 1 },
      } as never,
      NOW,
      asked,
    ),
    /was in flight at the stop$/u,
  );
  assert.equal(
    activityModule.renderWorkflowRunActivity(
      {
        siteId: "s",
        ordinal: 0,
        state: "executing",
        stepsSettled: 0,
        stepsFailed: 0,
        tokens: 0,
      } as never,
      NOW,
      asked,
    ),
    "",
  );
  assert.equal(
    activityModule.renderWorkflowRunActivity(
      {
        siteId: "s",
        ordinal: 0,
        state: "executing",
        stepsSettled: 2,
        stepsFailed: 1,
        tokens: 0,
      } as never,
      NOW,
      asked,
    ),
    "2 steps, 1 failed",
  );
});
