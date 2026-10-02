import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import { tmpdir } from "node:os";
import { createHash } from "node:crypto";
import { fileURLToPath, pathToFileURL } from "node:url";
const core = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const repo = path.resolve(core, "../../../..");
const hash = (bytes) => createHash("sha256").update(bytes).digest("hex");
const mode = process.argv[2];
assert.ok(["baseline", "current"].includes(mode));
const source = {};
const entries = {};
if (mode === "baseline") {
  const bytes = await fs.readFile(
    path.join(core, "test/runtime-permission-owners-baseline-20261003.json"),
  );
  assert.equal(hash(bytes), "23462209a7052ebdf464c7446c0bbfd69636943771409aade89ee6b49695b7fb");
  for (const [name, row] of Object.entries(JSON.parse(bytes).files)) {
    for (const key of ["source", "compiled", "declaration"])
      assert.equal(hash(row[key]), row[key + "Sha256"]);
    source[name] = row.compiled;
    entries[name] = path.join(core, "src/runtime", name.replace(/\.ts$/u, ".js"));
  }
} else {
  const bytes = await fs.readFile(
    path.join(repo, "docs/evidence/knorvia-runtime-permission-current-20261003.json"),
  );
  assert.equal(hash(bytes), "CURRENT_PERMISSION_PIN");
  for (const [name, row] of Object.entries(JSON.parse(bytes).files)) {
    for (const [key, item] of Object.entries(row)) {
      const bytes = await fs.readFile(path.join(repo, item.path));
      assert.equal(hash(bytes), item.sha256, item.path);
      if (key === "compiled") source[name] = bytes.toString();
    }
    entries[name] = path.join(repo, row.source.path.replace(/\.ts$/u, ".js"));
  }
}
const consumerBytes = await fs.readFile(
  path.join(repo, "docs/evidence/runtime-permission-owner-consumer-20261003.json"),
);
assert.equal(
  hash(consumerBytes),
  "dcef7852b67e6ed46857a2875179a3f59627b6e4e6c855d3ef7634855079dcc7",
);
const consumer = JSON.parse(consumerBytes);
for (const item of Object.values(consumer.files))
  assert.equal(hash(await fs.readFile(path.join(repo, item.path))), item.sha256);
source["session-mode-port.ts"] = (
  await fs.readFile(path.join(repo, consumer.files.compiled.path))
).toString();
entries["session-mode-port.ts"] = path.join(core, "src/runtime/session-mode-port.js");
const dir = await fs.mkdtemp(path.join(tmpdir(), "knorvia-owned-permission-"));
const target = (name) => path.join(dir, name.replaceAll("/", "__").replace(/\.ts$/u, ".mjs"));
for (const [name, text] of Object.entries(source)) {
  await fs.writeFile(
    target(name),
    text.replace(/(from\s+|import\s+)(['"])([^'"]+)\2/gu, (all, prefix, quote, specifier) => {
      let file;
      if (specifier === "@knorvia/contracts") file = path.join(core, "../contracts/dist/index.js");
      else if (specifier === "@knorvia/shared")
        file = path.join(repo, "packages/shared/src/execution-state.ts");
      else if (specifier.startsWith(".")) {
        file = path.resolve(path.dirname(entries[name]), specifier);
        const own = Object.keys(entries).find((key) => entries[key] === file);
        if (own) file = target(own);
      } else return all;
      return prefix + quote + pathToFileURL(file).href + quote;
    }),
  );
}
const { grantPermissionFullAccess: grant } = await import(
  pathToFileURL(target("permission-full-access.ts")).href
);
const E = await import(pathToFileURL(target("execution-state.ts")).href);
const R = await import(pathToFileURL(target("permission-grant-recovery.ts")).href);
const B = await import(pathToFileURL(target("helpers/permission-broker.ts")).href);
const { createRuntimeSessionModePort } = await import(
  pathToFileURL(target("session-mode-port.ts")).href
);
const trace = { traceId: "owned-trace", spanId: "owned-span" };
function fixture() {
  const calls = [],
    receipts = [],
    events = [];
  const selected = [
    { pendingInputId: "owned-a" },
    { pendingInputId: "owned-a" },
    { pendingInputId: "owned-b" },
  ];
  const a = { id: "owned-a", intent: { mode: "build", planEnabled: false, owned: "same" } };
  const b = { id: "owned-b" };
  const c = { id: "owned-later", intent: { mode: "edit" } };
  const runtime = {
    sessionId: "owned-session",
    rootTraceContext: trace,
    config: { mode: "build", planEnabled: false },
    sessionPersisted: true,
    pendingInputReservations: new Map(),
    pendingInputDrains: 0,
    needsPlanModeExitReminder: false,
    activeTurn: { pendingInputs: [a, b, c] },
    async rebuildProjection() {
      assert.equal(this, runtime);
      calls.push("projection");
      return { pendingSteerInputs: selected };
    },
    createEvent(type, payload, context) {
      assert.equal(this, runtime);
      assert.equal(context, trace);
      calls.push("create");
      return {
        id: "owned-event",
        sessionId: runtime.sessionId,
        traceId: trace.traceId,
        type,
        timestamp: new Date(0),
        sequenceNumber: 0,
        payload,
      };
    },
    async appendEvent(event, context) {
      assert.equal(this, runtime);
      assert.equal(context, trace);
      calls.push("append");
      events.push(event);
    },
    async notifyEventSinks(event, context) {
      assert.equal(this, runtime);
      assert.equal(context, trace);
      calls.push("notify");
      runtime.notified = event;
    },
    eventStore: {
      async getEvents(id) {
        assert.equal(this, runtime.eventStore);
        assert.equal(id, runtime.sessionId);
        calls.push("events");
        return events;
      },
    },
    sessionStore: {
      async sessionEntries(input) {
        assert.equal(this, runtime.sessionStore);
        calls.push("entries");
        assert.equal(input.sessionID, runtime.sessionId);
        return receipts;
      },
      async commitPermissionFullAccess(input) {
        assert.equal(this, runtime.sessionStore);
        calls.push("commit");
        runtime.committed = input;
        receipts.push(input.receipt);
      },
      async saveSessionEntry(input) {
        assert.equal(this, runtime.sessionStore);
        calls.push("save");
        runtime.saved = input;
      },
    },
  };
  return { runtime, calls, receipts, events, selected, a, b, c };
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
