import assert from "node:assert/strict";
import { test } from "node:test";
import { inputHash } from "../src/engine/hash.js";
import { ImportedActorState } from "../src/engine/imported-cache.js";
import { defer } from "../src/engine/scheduler-types.js";
import type { NodeRecord, SessionRef } from "../src/engine/types.js";
import { REPAIR_ATTEMPTS, WorkflowError } from "../src/engine/types.js";
import { dispatchCheckpoint, schedulerFixture } from "./ask-scheduler-fixture.js";

const instance = (siteId: string) => ({ siteId, ordinal: 0 });
const recorded = (
  siteId: string,
  seq: number,
  status: NodeRecord["status"] = "completed",
): NodeRecord => ({
  runId: "fixture-run",
  siteId,
  ordinal: 0,
  kind: "ask",
  actorSiteId: "actor",
  actorOrdinal: 0,
  actorSeq: seq,
  inputHash: inputHash(siteId),
  status,
  result: siteId + "-cached",
});

test("live asks obey per-actor FIFO and the run-wide cap", async () => {
  const f = schedulerFixture(2);
  f.scheduler.registerActor(instance("a"), "a", undefined, { name: "a-name" });
  f.scheduler.registerActor(instance("b"), "b", undefined, {});
  const first = f.scheduler.admitAsk("first", "a", "first", { typed: false });
  const next = f.scheduler.admitAsk("next", "a", "next", { typed: false });
  const other = f.scheduler.admitAsk("other", "b", "other", { typed: false });
  assert.equal(f.scheduler.liveActorName(instance("first")), "a-name");
  await dispatchCheckpoint();
  assert.deepEqual(
    f.starts.map((s) => s.instance.siteId),
    ["first", "other"],
  );
  f.scheduler.turnEnded(instance("first"), "one");
  await dispatchCheckpoint();
  assert.deepEqual(
    f.starts.map((s) => s.instance.siteId),
    ["first", "other", "next"],
  );
  f.scheduler.turnEnded(instance("next"), "two");
  f.scheduler.turnEnded(instance("other"), "three");
  assert.deepEqual(await Promise.all([first, next, other]), ["one", "two", "three"]);
  assert.equal(f.sessions.length, 2);
  assert.equal(f.replies.length, 0);
});

test("global pumping uses registration order rather than a new global arrival queue", async () => {
  const f = schedulerFixture();
  for (const id of ["a", "b"]) f.scheduler.registerActor(instance(id), id, undefined, {});
  const first = f.scheduler.admitAsk("first", "a", "", { typed: false });
  const older = f.scheduler.admitAsk("older", "b", "", { typed: false });
  const newer = f.scheduler.admitAsk("newer", "a", "", { typed: false });
  await dispatchCheckpoint();
  f.scheduler.turnEnded(instance("first"), "first");
  await dispatchCheckpoint();
  assert.deepEqual(
    f.starts.map((s) => s.instance.siteId),
    ["first", "newer"],
  );
  f.scheduler.turnEnded(instance("newer"), "newer");
  await dispatchCheckpoint();
  f.scheduler.turnEnded(instance("older"), "older");
  await Promise.all([first, older, newer]);
});

test("out-of-order recorded asks hold fresh admission until the recorded prefix drains", async () => {
  const f = schedulerFixture();
  f.journal.putNode(recorded("first", 0));
  f.journal.putNode(recorded("second", 1));
  const actor = f.scheduler.registerActor(instance("actor"), "actor", undefined, {});
  const fresh = f.scheduler.admitAsk("fresh", "actor", "fresh", { typed: false });
  const second = f.scheduler.admitAsk("second", "actor", "second", { typed: false });
  assert.equal(actor.nextAdmitSeq, 0);
  assert.equal(f.sessions.length, 0);
  const first = f.scheduler.admitAsk("first", "actor", "first", { typed: false });
  assert.deepEqual(await Promise.all([first, second]), ["first-cached", "second-cached"]);
  assert.equal(f.journal.getNode("fixture-run", "fresh", 0)?.actorSeq, 2);
  await dispatchCheckpoint();
  assert.deepEqual(
    f.starts.map((s) => s.instance.siteId),
    ["fresh"],
  );
  f.scheduler.turnEnded(instance("fresh"), "fresh-result");
  assert.equal(await fresh, "fresh-result");
});

test("failed replay reproduces the recorded rejection without a new journal write or session", async () => {
  const f = schedulerFixture();
  const error = new WorkflowError("DriverError", "recorded failure");
  f.journal.putNode({ ...recorded("failed", 0, "failed"), error: error.toJSON() });
  f.scheduler.registerActor(instance("actor"), "actor", undefined, {});
  const writes = f.journal.order.filter((step) => step.startsWith("journal:")).length;
  await assert.rejects(f.scheduler.admitAsk("failed", "actor", "failed", { typed: false }), {
    code: "DriverError",
    message: "recorded failure",
  });
  assert.equal(f.sessions.length, 0);
  assert.equal(f.journal.order.filter((step) => step.startsWith("journal:")).length, writes);
  assert.ok(
    f.events.some(
      (event) => event.type === "node-settled" && event.cached && event.outcome === "failed",
    ),
  );
});

test("running replay mounts the driver session and preserves the driver-written model pin", async () => {
  const f = schedulerFixture();
  f.journal.putNode(recorded("resumed", 0, "running"));
  f.journal.putActor({
    runId: "fixture-run",
    siteId: "actor",
    ordinal: 0,
    sessionId: "old-record-only",
    resolvedModel: "old-pin",
  });
  const actor = f.scheduler.registerActor(instance("actor"), "actor", undefined, {});
  assert.equal(actor.sessionPromise, undefined);
  const answer = f.scheduler.admitAsk("resumed", "actor", "resumed", { typed: false });
  await dispatchCheckpoint();
  assert.equal(f.sessions.length, 1);
  assert.equal(
    f.journal.getActor("fixture-run", "actor", 0)?.resolvedModel,
    "fixture-provider/fixture-model",
  );
  f.scheduler.turnEnded(instance("resumed"), "result");
  await answer;
});

test("closed import cache accepts only pure entries and supplies the consumed transcript seed", async () => {
  const f = schedulerFixture();
  f.closeCache();
  const imported = new ImportedActorState({
    persona: { name: "named" },
    transcriptSourceSessionId: "fixture-source-session",
    resolvedModel: "source/model",
    entries: [
      {
        inputHash: inputHash("pure"),
        result: "cached",
        messageBoundary: 4,
        stats: { tokens: 1, toolCalls: 1, turns: 1, worldToolCalls: 0 },
      },
      {
        inputHash: inputHash("world"),
        result: "stale",
        messageBoundary: 8,
        stats: { tokens: 2, toolCalls: 2, turns: 1, worldToolCalls: 1 },
      },
    ],
  });
  f.scheduler.registerActor(instance("actor"), "actor", "named", { name: "named" }, imported);
  assert.equal(await f.scheduler.admitAsk("pure", "actor", "pure", { typed: false }), "cached");
  assert.equal(f.sessions.length, 0);
  assert.equal(f.journal.getNode("fixture-run", "pure", 0)?.messageBoundary, 4);
  const live = f.scheduler.admitAsk("world", "actor", "world", { typed: false });
  await dispatchCheckpoint();
  assert.deepEqual(f.sessions[0]?.seed, {
    sourceSessionId: "fixture-source-session",
    messageCount: 4,
    resolvedModel: "source/model",
  });
  f.scheduler.turnEnded(instance("world"), "new");
  assert.equal(await live, "new");
});

test("replay hash mismatch fails the run before any cache or driver action", async () => {
  const f = schedulerFixture();
  f.journal.putNode(recorded("changed", 0));
  f.scheduler.registerActor(instance("actor"), "actor", undefined, {});
  await assert.rejects(f.scheduler.admitAsk("changed", "actor", "different", { typed: false }), {
    code: "InputHashMismatch",
  });
  assert.equal(f.failures.length, 1);
  assert.equal(f.events.length, 0);
  assert.equal(f.sessions.length, 0);
});

test("typed submission decodes once and reports decoded violations before accepting a later result", async () => {
  const f = schedulerFixture(1, (_schema, value) =>
    value !== null && typeof value === "object" && "answer" in value && value.answer === "ok"
      ? []
      : [{ path: "$.answer", expected: "ok", got: typeof value }],
  );
  f.scheduler.registerActor(instance("actor"), "actor", undefined, {});
  const answer = f.scheduler.admitAsk("typed", "actor", "typed", { typed: true, schema: {} });
  await dispatchCheckpoint();
  f.scheduler.submitAttempted(instance("typed"), "{}");
  const rejected = f.replies[0]?.verdict;
  assert.ok(rejected?.kind === "reject");
  assert.equal(rejected.violations[0]?.got, "object");
  f.scheduler.submitAttempted(instance("typed"), '{"answer":"ok"}');
  assert.deepEqual(await answer, { answer: "ok" });
  assert.equal(f.replies[1]?.verdict.kind, "accept");
});

test("typed nudge and repair exhaustion cancel only their ask", async () => {
  const n = schedulerFixture();
  n.scheduler.registerActor(instance("actor"), "actor", undefined, {});
  const nudged = n.scheduler.admitAsk("nudge", "actor", "", { typed: true });
  const rejectedNudge = assert.rejects(nudged, { code: "ResultNotSubmitted" });
  await dispatchCheckpoint();
  n.scheduler.turnEnded(instance("nudge"), "first");
  n.scheduler.turnEnded(instance("nudge"), "last");
  await rejectedNudge;
  assert.deepEqual(
    n.replies.map((r) => r.verdict.kind),
    ["nudge"],
  );
  assert.equal(n.cancelled.length, 1);
  const r = schedulerFixture(1, () => [{ path: "$", expected: "valid", got: "invalid" }]);
  r.scheduler.registerActor(instance("actor"), "actor", undefined, {});
  const repaired = r.scheduler.admitAsk("repair", "actor", "", { typed: true });
  const rejectedRepair = assert.rejects(repaired, { code: "ValidationFailed" });
  await dispatchCheckpoint();
  for (let attempt = 0; attempt <= REPAIR_ATTEMPTS; attempt += 1)
    r.scheduler.submitAttempted(instance("repair"), {});
  await rejectedRepair;
  assert.equal(r.replies.length, REPAIR_ATTEMPTS);
  assert.equal(r.cancelled.length, 1);
  assert.equal(r.failures.length + n.failures.length, 0);
});

test("journal and event precede promise delivery; late stats preserve transcript fields", async () => {
  const f = schedulerFixture();
  f.scheduler.registerActor(instance("actor"), "actor", undefined, {});
  const answer = f.scheduler.admitAsk("ordered", "actor", "", { typed: false });
  const observed = answer.then(() => {
    f.journal.order.push("answer");
  });
  await dispatchCheckpoint();
  f.scheduler.turnEnded(instance("ordered"), "result");
  assert.equal(f.journal.order.includes("answer"), false);
  await observed;
  assert.ok(
    f.journal.order.indexOf("journal:ordered:completed") <
      f.journal.order.lastIndexOf("event:node-settled"),
  );
  assert.ok(f.journal.order.lastIndexOf("event:node-settled") < f.journal.order.indexOf("answer"));
  const row = f.journal.getNode("fixture-run", "ordered", 0)!;
  f.journal.putNode({ ...row, messageBoundary: 13 });
  const stats = { tokens: 17, toolCalls: 2, turns: 1 };
  f.scheduler.noteStats(instance("ordered"), stats);
  assert.deepEqual(f.journal.getNode("fixture-run", "ordered", 0), {
    ...row,
    messageBoundary: 13,
    stats,
  });
  f.scheduler.failed(instance("ordered"), new WorkflowError("DriverError", "ignored"));
  assert.equal(f.scheduler.isLive(instance("ordered")), false);
});

test("failed lazy session promise is reused and rejects asks without failing the run", async () => {
  const f = schedulerFixture();
  let mounts = 0;
  f.driver.createActorSession = () => {
    mounts += 1;
    return Promise.reject(new Error("fixture mount failure"));
  };
  f.scheduler.registerActor(instance("actor"), "actor", undefined, {});
  const first = f.scheduler.admitAsk("first", "actor", "", { typed: false });
  const next = f.scheduler.admitAsk("next", "actor", "", { typed: false });
  await Promise.all([
    assert.rejects(first, /fixture mount failure/),
    assert.rejects(next, /fixture mount failure/),
  ]);
  assert.equal(mounts, 1);
  assert.equal(f.failures.length, 0);
  assert.equal(f.journal.getNode("fixture-run", "next", 0)?.status, "failed");
});

test("abort before session readiness preserves running journal and suppresses dispatch", async () => {
  const f = schedulerFixture();
  const mounted = defer<SessionRef>();
  f.driver.createActorSession = () => mounted.promise;
  const actor = f.scheduler.registerActor(instance("actor"), "actor", undefined, {});
  const answer = f.scheduler.admitAsk("abort", "actor", "", { typed: false });
  const error = new WorkflowError("DriverError", "fixture abort");
  const rejection = assert.rejects(answer, (cause) => cause === error);
  f.stopRun();
  f.scheduler.abortInFlight(error, true);
  mounted.resolve({ id: "late-mount" });
  await dispatchCheckpoint();
  await rejection;
  assert.equal(f.starts.length, 0);
  assert.equal(f.cancelled.length, 0);
  assert.equal(actor.current?.settled, true);
  assert.equal(f.journal.getNode("fixture-run", "abort", 0)?.status, "running");
  assert.ok(f.events.some((e) => e.type === "node-settled" && e.outcome === "cancelled"));
});

test("abort cancels dispatched asks and rejects queued asks without publishing failed journal", async () => {
  const f = schedulerFixture();
  f.scheduler.registerActor(instance("actor"), "actor", undefined, {});
  const active = f.scheduler.admitAsk("active", "actor", "", { typed: false });
  const queued = f.scheduler.admitAsk("queued", "actor", "", { typed: false });
  const settled = Promise.allSettled([active, queued]);
  await dispatchCheckpoint();
  const error = new WorkflowError("DriverError", "fixture stop");
  f.stopRun();
  f.scheduler.abortInFlight(error, false);
  assert.deepEqual(f.cancelled, [instance("active")]);
  for (const outcome of await settled) {
    assert.equal(outcome.status, "rejected");
    if (outcome.status === "rejected") assert.equal(outcome.reason, error);
  }
  assert.equal(f.journal.getNode("fixture-run", "queued", 0)?.status, "running");
  assert.equal(
    f.events.some((e) => e.type === "node-settled"),
    false,
  );
});

test("completion journal errors retain the prior settled flag and do not deliver an answer", async () => {
  const f = schedulerFixture();
  const actor = f.scheduler.registerActor(instance("actor"), "actor", undefined, {});
  let answered = false;
  void f.scheduler.admitAsk("fault", "actor", "", { typed: false }).then(() => {
    answered = true;
  });
  await dispatchCheckpoint();
  const put = f.journal.putNode.bind(f.journal);
  f.journal.putNode = (row) => {
    if (row.status === "completed") throw new Error("fixture write fault");
    put(row);
  };
  assert.throws(() => f.scheduler.turnEnded(instance("fault"), "result"), /fixture write fault/);
  await dispatchCheckpoint();
  assert.equal(actor.current?.settled, true);
  assert.equal(f.scheduler.isLive(instance("fault")), false);
  assert.equal(answered, false);
  assert.equal(f.journal.getNode("fixture-run", "fault", 0)?.status, "running");
});
