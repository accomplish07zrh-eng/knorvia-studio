import assert from "node:assert/strict";
import {
  loadPermissionOwners,
  fixture,
  trace,
} from "./runtime-permission-owners-fixture-20261003.mjs";
const mode = process.argv[2];
const { grant, E, R, B, createRuntimeSessionModePort } = await loadPermissionOwners(mode);
if (process.argv.includes("--recovery-busy-probe")) {
  const f = fixture();
  const failure = new Error("Owned publication rejection");
  f.runtime.eventStore.getEvents = async function () {
    f.calls.push("events-failed");
    throw failure;
  };
  await assert.rejects(grant.call(f.runtime, "owned-request"), (error) => error === failure);
  f.runtime.permissionFullAccessPending = true;
  const before = [...f.calls];
  await assert.rejects(R.recoverPendingPermissionGrant(f.runtime), {
    message: "Queue mutation is busy; retry approval",
  });
  assert.deepEqual(f.calls, before);
  console.log(
    JSON.stringify({
      mode,
      focusedRecoveryBusyProbe: "pass",
      count: 1,
      effects: "owned fake receipt/event ports only",
      liveIO: false,
    }),
  );
  process.exit(0);
}
const groups = [];
{
  const f = fixture(),
    r = f.runtime;
  delete r.sessionStore.commitPermissionFullAccess;
  r.permissionFullAccessPending = true;
  await assert.rejects(grant.call(r, "owned-request"), { message: "Full access is unsupported" });
  assert.deepEqual(f.calls, []);
  for (const busy of ["pending", "reservation", "drain"]) {
    const f = fixture(),
      r = f.runtime;
    if (busy === "pending") r.permissionFullAccessPending = true;
    if (busy === "reservation") r.pendingInputReservations.set("owned", "owned");
    if (busy === "drain") r.pendingInputDrains = 1;
    await assert.rejects(grant.call(r, "owned-request"), {
      message: "Queue mutation is busy; retry approval",
    });
    assert.deepEqual(f.calls, []);
  }
  const aborted = fixture(),
    controller = new AbortController(),
    reason = new Error("Owned cancellation");
  controller.abort(reason);
  await assert.rejects(
    grant.call(aborted.runtime, "owned-request", controller.signal),
    (error) => error === reason,
  );
  assert.equal(aborted.runtime.permissionFullAccessPending, false);
  assert.deepEqual(aborted.calls, []);
  const failed = fixture(),
    error = new Error("Owned commit rejection");
  failed.runtime.sessionStore.commitPermissionFullAccess = async function () {
    failed.calls.push("commit");
    throw error;
  };
  const intent = failed.a.intent;
  await assert.rejects(grant.call(failed.runtime, "owned-request"), (value) => value === error);
  assert.equal(failed.runtime.config.mode, "build");
  assert.equal(failed.a.intent, intent);
  assert.equal(R.unpublishedPermissionGrants.has(failed.runtime), false);
  assert.equal(failed.runtime.permissionFullAccessPending, false);
  groups.push("unsupported/busy/early-cancel/commit failure deny before authority mutation");
}
{
  const f = fixture(),
    r = f.runtime,
    controller = new AbortController(),
    failure = new Error("Owned publication rejection");
  const a = f.a.intent,
    c = f.c.intent;
  const commit = r.sessionStore.commitPermissionFullAccess;
  r.sessionStore.commitPermissionFullAccess = async function (input) {
    await commit.call(this, input);
    controller.abort(new Error("Owned post-commit cancel"));
  };
  r.eventStore.getEvents = async function () {
    f.calls.push("events-failed");
    throw failure;
  };
  await assert.rejects(
    grant.call(r, "owned-request", controller.signal),
    (error) => error === failure,
  );
  assert.deepEqual(f.calls, ["entries", "projection", "create", "commit", "events-failed"]);
  assert.deepEqual(Object.keys(r.committed), [
    "sessionID",
    "queueItemIds",
    "signal",
    "execution",
    "receipt",
  ]);
  assert.deepEqual(r.committed.queueItemIds, ["owned-a", "owned-a", "owned-b"]);
  assert.equal(
    r.committed.receipt.data.event.payload.permissionGrant.queueItemIds,
    r.committed.queueItemIds,
  );
  assert.equal(r.committed.execution.data.mode, "yolo");
  assert.deepEqual(Object.keys(r.committed.execution), [
    "id",
    "sessionID",
    "type",
    "touchSession",
    "time",
    "data",
  ]);
  assert.equal(r.config.mode, "yolo");
  assert.equal(r.config.planEnabled, false);
  assert.notEqual(f.a.intent, a);
  assert.equal(f.a.intent.owned, a.owned);
  assert.equal(f.a.intent.mode, "yolo");
  assert.equal(f.c.intent, c);
  assert.ok(!Object.hasOwn(f.b, "intent"));
  const applied = f.a.intent;
  assert.equal(R.unpublishedPermissionGrants.get(r).interactionId, "owned-request");
  r.config.mode = "edit";
  f.selected.push({ pendingInputId: "owned-later" });
  r.eventStore.getEvents = async function () {
    assert.equal(this, r.eventStore);
    f.calls.push("events");
    return f.events;
  };
  const result = await R.recoverPendingPermissionGrant(r);
  assert.equal(result, undefined);
  assert.equal(f.a.intent, applied);
  assert.equal(f.c.intent, c);
  assert.equal(r.config.mode, "edit");
  assert.equal(f.calls.filter((call) => call === "commit").length, 1);
  assert.equal(f.calls.filter((call) => call === "projection").length, 1);
  assert.equal(f.events[0].id, "owned-event");
  assert.deepEqual(f.events[0].payload.permissionGrant.queueItemIds, [
    "owned-a",
    "owned-a",
    "owned-b",
  ]);
  assert.equal(R.unpublishedPermissionGrants.has(r), false);
  assert.equal(r.permissionFullAccessPending, false);
  groups.push(
    "committed fixed target survives abort/publication failure; retry does not reapply or expand",
  );
}
{
  const f = fixture(),
    r = f.runtime;
  const error = new Error("Owned save rejection");
  r.sessionStore.saveSessionEntry = async function () {
    f.calls.push("save");
    throw error;
  };
  await assert.rejects(
    E.applyRuntimeExecutionState(r, { mode: "edit" }, { source: "command" }),
    (value) => value === error,
  );
  assert.equal(r.config.mode, "build");
  assert.equal(r.needsPlanModeExitReminder, false);
  assert.deepEqual(f.calls, ["save"]);
  f.calls.length = 0;
  r.readSessionTargetForContext = async function (context) {
    assert.equal(this, r);
    assert.equal(context, trace);
    f.calls.push("goal");
    return { status: "active" };
  };
  await assert.rejects(E.applyRuntimeExecutionState(r, { planEnabled: true }, { source: "tool" }), {
    message: "Plan and Goal cannot be active at the same time.",
  });
  assert.deepEqual(f.calls, ["goal"]);
  assert.equal(r.config.planEnabled, false);
  r.permissionFullAccessPending = true;
  f.calls.length = 0;
  await assert.rejects(E.applyRuntimeExecutionState(r, {}, { source: "command" }), {
    message: "Permission update is busy; retry mode change",
  });
  assert.deepEqual(f.calls, []);
  r.permissionFullAccessPending = false;
  await E.applyRuntimeExecutionState(r, {}, { source: "command" });
  assert.deepEqual(f.calls, []);
  const g = fixture(),
    port = createRuntimeSessionModePort(g.runtime);
  assert.equal(port.supportsPermissionFullAccess(), true);
  const enter = await port.enterPlanMode({ traceContext: trace, toolCallId: "owned-tool" });
  assert.deepEqual(g.calls, ["save", "create", "append"]);
  assert.equal(enter.previousMode, "build");
  assert.equal(enter.previousPlanEnabled, false);
  assert.equal(g.runtime.saved.data.planEnabled, true);
  assert.equal(g.runtime.needsPlanModeExitReminder, false);
  assert.deepEqual(Object.keys(g.events[0].payload), [
    "mode",
    "planEnabled",
    "previousMode",
    "previousPlanEnabled",
    "source",
    "toolCallId",
  ]);
  const publicationFailure = new Error("Owned append rejection");
  g.runtime.appendEvent = async function () {
    g.calls.push("append-failed");
    throw publicationFailure;
  };
  await assert.rejects(
    port.exitPlanMode({ traceContext: trace }),
    (value) => value === publicationFailure,
  );
  assert.equal(g.runtime.config.planEnabled, false);
  assert.equal(g.runtime.needsPlanModeExitReminder, true);
  assert.equal(g.runtime.saved.data.planEnabled, false);
  groups.push(
    "execution save/goal/busy gates and actual plan port preserve persisted-memory-publication order",
  );
}
{
  const f = fixture(),
    r = f.runtime;
  await grant.call(r, "owned-request");
  const existing = f.events[0];
  f.calls.length = 0;
  await grant.call(r, "owned-request");
  assert.equal(r.notified, existing);
  assert.deepEqual(f.calls, ["entries", "events", "notify"]);
  const mismatch = fixture();
  mismatch.receipts.push({
    ...f.receipts[0],
    data: {
      ...f.receipts[0].data,
      event: { ...f.receipts[0].data.event, sessionId: "owned-other" },
    },
  });
  await assert.rejects(grant.call(mismatch.runtime, "owned-request"), {
    message: "Permission receipt scope mismatch",
  });
  assert.deepEqual(mismatch.calls, ["entries"]);
  assert.equal(mismatch.runtime.config.mode, "build");
  const corrupt = fixture();
  corrupt.receipts.push({ ...f.receipts[0], data: {} });
  await assert.rejects(grant.call(corrupt.runtime, "owned-request"));
  assert.deepEqual(corrupt.calls, ["entries"]);
  assert.equal(corrupt.runtime.config.mode, "build");
  const order = fixture();
  R.unpublishedPermissionGrants.set(order.runtime, {
    interactionId: "owned-old",
    recover: async () => {
      order.calls.push("recover");
      assert.notEqual(order.runtime.permissionFullAccessPending, true);
    },
  });
  await grant.call(order.runtime, "owned-new");
  assert.equal(order.calls[0], "recover");
  const b = { resolvePermission() {}, listPendingRequests() {} };
  assert.equal(B.isResolvablePermissionBroker(b), true);
  assert.equal(B.isInspectablePermissionBroker(b), true);
  assert.equal(B.isResolvablePermissionBroker({ resolvePermission: true }), false);
  assert.equal(B.isInspectablePermissionBroker({ listPendingRequests: [] }), false);
  groups.push(
    "receipt/schema scope closes denial; existing event and recovery/broker seams retain identity",
  );
}
console.log(
  JSON.stringify({
    mode,
    count: groups.length,
    groups,
    selected:
      "exact emitted owners and pinned emitted SessionModePort; unchanged shared normalizer via source loader",
    effects: "owned in-memory session/config/receipt/event/intent ports only",
    liveIO: false,
  }),
);
