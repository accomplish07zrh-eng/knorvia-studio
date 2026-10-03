import assert from "node:assert/strict";
import { fixture, load, trace } from "./steering-subagent-fixture-20261003.mjs";
const mode = process.argv[2];
const same = (actual, expected) => assert.deepEqual(structuredClone(actual), expected);
let groups = 0;
async function group(name, run) {
  await run();
  groups++;
  console.log("ok " + name);
}
await group("steering admission and captured active identity", async () => {
  const f = fixture(),
    r = await load(mode, f);
  const active = r.beginActiveTurn("owned-turn", trace, "product", true);
  const intent = { queueItemId: "owned-item", clientId: "owned-client", admittedDelivery: "queue" },
    attachments = [];
  const queued = await r.steerTurn({
    input: "owned-input",
    intent,
    attachments,
    delivery: "guide",
    toolDisallowlist: ["Write"],
  });
  assert.equal(queued.kind, "queued");
  assert.equal(active.pendingInputs[0].id, intent.queueItemId);
  assert.equal(active.pendingInputs[0].attachments, attachments);
  assert.notEqual(active.pendingInputs[0].intent, intent);
  assert.equal(active.pendingInputs[0].intent.queuePosition, 0);
  assert.equal(active.pendingInputs[0].intent.admittedDelivery, "guide");
  assert.equal(f.events[0][1], trace);
  const rejected = await r.steerTurn({ input: " ", expectedTurnId: "wrong" });
  assert.equal(rejected.reason, "empty_input");
  r.appendFailure = Error("owned append failure");
  await assert.rejects(r.steerTurn("owned-later"), (error) => error === r.appendFailure);
  assert.equal(active.pendingInputs.length, 2);
  const newer = { ...active };
  r.activeTurn = newer;
  r.finishActiveTurn(active);
  assert.equal(r.activeTurn, newer);
});
await group("reservation authority recheck, concurrency and rollback", async () => {
  const f = fixture(),
    r = await load(mode, f);
  const active = r.beginActiveTurn("owned-turn", trace, "product", true);
  active.pendingInputs.push({ id: "owned-pending", input: "owned-input", turnId: "owned-turn" });
  const a = { pendingInputId: "owned-pending", reservationId: "owned-a", traceContext: trace };
  r.permissionFullAccessPending = true;
  assert.equal(await r.reservePendingInputById(a), false);
  assert.equal(f.events.length, 0);
  r.permissionFullAccessPending = false;
  const first = r.reservePendingInputById(a),
    second = r.reservePendingInputById({ ...a, reservationId: "owned-b" });
  assert.equal(await first, true);
  assert.equal(await second, false);
  assert.equal(r.pendingInputReservations.get(a.pendingInputId), a.reservationId);
  const abort = Object.assign(Error("owned cancelled publication"), { name: "AbortError" });
  r.appendFailure = abort;
  await assert.rejects(r.releasePendingInputReservation(a), (error) => error === abort);
  assert.equal(r.pendingInputReservations.get(a.pendingInputId), a.reservationId);
  r.pendingInputReservations.clear();
  await assert.rejects(r.reservePendingInputById(a), (error) => error === abort);
  assert.equal(r.pendingInputReservations.has(a.pendingInputId), false);
  r.appendFailure = undefined;
  f.grants.set(r, {});
  r.recover = () => {
    r.permissionFullAccessPending = true;
  };
  assert.equal(await r.reservePendingInputById(a), false);
  assert.equal(f.calls.includes("recover"), true);
});
await group("durable queue writes precede mutations and retain object ownership", async () => {
  const f = fixture(),
    r = await load(mode, f),
    active = r.beginActiveTurn("owned-turn", trace, "product", true);
  const a = { id: "owned-a", input: "owned-a-text", intent: { queuePosition: 0 } },
    b = { id: "owned-b", input: "owned-b-text" };
  active.pendingInputs.push(a, b);
  const array = active.pendingInputs;
  const failure = Error("owned storage failure");
  r.writeFailure = failure;
  await assert.rejects(
    r.editPendingInputById({ pendingInputId: a.id, newText: "owned-edit", traceContext: trace }),
    (error) => error === failure,
  );
  assert.equal(a.input, "owned-a-text");
  await assert.rejects(
    r.removePendingInputById({ pendingInputId: a.id, reason: "user_removed", traceContext: trace }),
    (error) => error === failure,
  );
  assert.equal(array[0], a);
  await assert.rejects(
    r.reorderPendingInput({
      pendingInputId: a.id,
      beforePendingInputId: null,
      traceContext: trace,
    }),
    (error) => error === failure,
  );
  assert.equal(array[0], a);
  r.writeFailure = undefined;
  await r.reorderPendingInput({
    pendingInputId: a.id,
    beforePendingInputId: null,
    traceContext: trace,
  });
  assert.equal(active.pendingInputs, array);
  assert.equal(array[0], b);
  assert.notEqual(array[1], a);
  assert.notEqual(array[1].intent, a.intent);
  assert.equal(array[1].intent.queuePosition, 1);
  await r.removePendingInputById({
    pendingInputId: b.id,
    reason: "user_removed",
    traceContext: trace,
  });
  same(f.stored.at(-1), {
    id: b.id,
    sessionID: r.sessionId,
    status: "cancelled",
    reason: "user_removed",
  });
});
await group("guide drain and fallback partial effects preserve gates", async () => {
  const f = fixture(),
    r = await load(mode, f),
    active = r.beginActiveTurn("owned-turn", trace, "product", true);
  const queue = {
    id: "owned-queue",
    input: "owned-queued",
    delivery: "queue",
    queuedAt: new Date(0),
  };
  const guide = {
    id: "owned-guide",
    input: "owned-guide-text",
    delivery: "guide",
    queryId: "owned-new-query",
    queuedAt: new Date(0),
  };
  active.pendingInputs.push(queue, guide);
  assert.equal(r.hasInlineGuidePendingInput(active), true);
  r.pendingInputReservations.set(guide.id, "owned-reservation");
  assert.equal(
    await r.drainPendingInput({ activeTurn: active, events: [], traceContext: trace }),
    undefined,
  );
  assert.equal(active.pendingInputs[1], guide);
  r.pendingInputReservations.clear();
  const failure = Object.assign(Error("owned cancelled persistence"), { name: "AbortError" });
  r.persistFailure = failure;
  await assert.rejects(
    r.drainPendingInput({ activeTurn: active, events: [], traceContext: trace }),
    (error) => error === failure,
  );
  assert.equal(active.pendingInputs.length, 1);
  assert.equal(active.pendingInputs[0], queue);
  assert.equal(f.history.length, 1);
  assert.equal(r.pendingInputDrains, 0);
  assert.equal(f.events.length, 0);
  active.pendingInputs.push(guide);
  r.appendFailure = failure;
  await assert.rejects(
    r.fallbackPendingGuidesToQueue({
      activeTurn: active,
      reasonCode: "guide.turnInterrupted",
      traceContext: trace,
    }),
    (error) => error === failure,
  );
  assert.equal(guide.delivery, "guide");
  r.appendFailure = undefined;
  assert.equal(
    await r.fallbackPendingGuidesToQueue({
      activeTurn: active,
      reasonCode: "guide.turnInterrupted",
      traceContext: trace,
    }),
    1,
  );
  assert.equal(guide.delivery, "queue");
});
await group("subagent captured parent ports and child publication lifetime", async () => {
  const f = fixture(),
    r = await load(mode, f);
  r.config.subagents.enabled = false;
  assert.equal(r.createDefaultSubagentPort(f.deps), undefined);
  assert.deepEqual(f.calls, []);
  r.config.subagents.enabled = true;
  r.createDefaultSubagentPort(f.deps);
  const options = f.exploreOptions;
  assert.equal(options.runtimeTaskRegistry, r.runtimeTaskRegistry);
  await options.emitParentEvent({ stale: true }, trace);
  assert.equal(f.events.length, 0);
  const notification = {
    originMeta: {},
    taskId: "owned-task",
    text: "owned-notification",
    traceContext: trace,
    ignored: true,
  };
  assert.equal(options.enqueueParentTaskNotification(notification), undefined);
  same(Object.keys(r.notification), ["originMeta", "taskId", "text", "traceContext"]);
  const result = await options.runExploreAgent(f.request);
  assert.equal(result, f.result);
  const child = f.children[0];
  assert.equal(child.config.dynamicWorkflowEnabled, false);
  assert.equal(child.config.taskType, "subagent_child");
  assert.equal(child.config.subagents.enabled, false);
  same(child.config.toolAllowlist, ["Read", "RespondToCoordinator"]);
  assert.equal(child.deps.permissionService, r.permissionService);
  assert.equal(child.deps.permissionBroker, r.permissionBroker);
  assert.equal(child.deps.sessionStore, f.deps.sessionStore);
  assert.equal(child.deps.pdfDocumentPort, f.deps.pdfDocumentPort);
  assert.equal(r.clientIdentity.parentSessionId, r.sessionId);
  assert.equal(r.clientIdentity.childSessionId, f.request.sessionId);
  assert.equal(child.deps.modelFactory({ selection: r.getSessionModelSelection() }), f.model);
  assert.equal(child.boundary.toModel, child.modelEvent.modelSelection);
  assert.equal(child.modelEvent.previousModelSelection, null);
  assert.equal(child.executeInput[2].inputSource, "subagent");
  assert.equal(child.executeInput[2].inputPresentation, "coordinator_input");
  assert.ok(f.calls.indexOf("child-persist") < f.calls.indexOf("ready"));
  assert.ok(f.calls.indexOf("ready") < f.calls.indexOf("model-event"));
  assert.ok(f.calls.indexOf("model-event") < f.calls.indexOf("execute"));
  assert.equal(f.calls.at(-1), "seal:subagent_terminal");
  const raw = { owned: "raw-child-event" },
    mirror = { owned: "mirror-event" };
  r.mirror = mirror;
  const before = f.events.length;
  await child.deps.eventSink.onSessionEvent(raw);
  assert.equal(r.notified[0][0], raw);
  assert.equal(r.notified[1][0], mirror);
  assert.equal(r.notified[0][1].sessionId, f.request.sessionId);
  assert.equal(r.notified[1][1].sessionId, r.sessionId);
  assert.equal(f.events.length, before);
});
await group("child startup failure and execution cancellation boundaries", async () => {
  const f = fixture(),
    r = await load(mode, f),
    failure = Error("owned startup failure");
  r.createDefaultSubagentPort(f.deps);
  r.childPersistFailure = failure;
  await assert.rejects(f.exploreOptions.runExploreAgent(f.request), (error) => error === failure);
  assert.equal(f.calls.includes("ready"), false);
  assert.equal(
    f.calls.some((c) => c.startsWith("seal:")),
    false,
  );
  const g = fixture(),
    r2 = await load(mode, g),
    controller = new AbortController();
  r2.createDefaultSubagentPort(g.deps);
  const cancelled = Object.assign(Error("owned runner abort"), { name: "AbortError" });
  controller.abort();
  r2.executeFailure = cancelled;
  await assert.rejects(
    g.exploreOptions.runExploreAgent(g.request, { signal: controller.signal }),
    (error) => error === cancelled,
  );
  assert.deepEqual(g.calls.slice(-3), ["execute", "seal:subagent_cancelled", "cancel"]);
  assert.equal(g.children[0].executeInput[2].abortSignal, controller.signal);
  const h = fixture(),
    r3 = await load(mode, h);
  r3.createDefaultSubagentPort(h.deps);
  h.request.resumeFromStore = true;
  await h.exploreOptions.runExploreAgent(h.request);
  assert.equal(h.calls.includes("resume"), true);
  assert.equal(h.calls.includes("child-persist"), false);
  assert.equal(h.calls.includes("model-event"), false);
});
await group("MCP and computer-use admission remains deny before child construction", async () => {
  const f = fixture(),
    r = await load(mode, f);
  r.createDefaultSubagentPort(f.deps);
  f.request.profile.mcpServers = ["missing"];
  await assert.rejects(
    f.exploreOptions.runExploreAgent(f.request),
    (error) =>
      error.type === "configuration_error" &&
      error.message ===
        "Subagent MCP is unavailable because the parent startup snapshot is unavailable",
  );
  assert.equal(f.children.length, 0);
  const g = fixture(),
    r2 = await load(mode, g);
  r2.createDefaultSubagentPort(g.deps);
  g.request.allowedTools = ["mcp__official__control"];
  await assert.rejects(
    g.exploreOptions.runExploreAgent(g.request),
    (error) => error.context.code === "owned-cua-unavailable",
  );
  assert.equal(g.children.length, 0);
  const h = fixture(),
    r3 = await load(mode, h);
  r3.mcpPort = {};
  const snapshot = {
    statuses: { owned: { status: "connected" } },
    tools: [{ name: "mcp__owned__read" }],
  };
  r3.mcpStartupPromise = Promise.resolve(snapshot);
  r3.config.toolAllowlist = ["mcp__owned__read"];
  h.request.allowedTools = ["*"];
  r3.createDefaultSubagentPort(h.deps);
  await h.exploreOptions.runExploreAgent(h.request);
  assert.equal(r3.borrowedArgs[0], r3.mcpPort);
  assert.equal(r3.borrowedArgs[1], snapshot);
  same(h.children[0].config.toolAllowlist, ["Read", "mcp__owned__read", "RespondToCoordinator"]);
});
await group("filtered skill identity and official/ambiguous default denial", async () => {
  const f = fixture(),
    r = await load(mode, f),
    skills = [
      { name: "owned", qualifiedName: "plugin:owned" },
      { name: "official", qualifiedName: "official:owned" },
    ];
  const options = { owned: "operation-options" },
    loaded = [];
  r.skillPort = {
    async discoverSkills(request, opts) {
      assert.equal(this, r.skillPort);
      loaded.push([request, opts]);
      return { skills, totalDiscovered: 2, owned: "unchanged" };
    },
    async loadSkill(request, opts) {
      assert.equal(this, r.skillPort);
      loaded.push([request, opts]);
      return request;
    },
  };
  r.createDefaultSubagentPort(f.deps);
  await f.exploreOptions.runExploreAgent(f.request);
  const port = f.children[0].deps.skillPort;
  const outcome = await port.discoverSkills({ workingDirectory: "owned-cwd" }, options);
  assert.equal(outcome.skills[0], skills[0]);
  assert.equal(outcome.totalDiscovered, 1);
  assert.equal(outcome.owned, "unchanged");
  const request = { name: "owned", workingDirectory: "owned-cwd", trace };
  const result = await port.loadSkill(request, options);
  assert.equal(result.name, "plugin:owned");
  assert.notEqual(result, request);
  assert.equal(loaded.at(-1)[1], options);
  await assert.rejects(
    port.loadSkill({ ...request, name: "official:owned" }, options),
    (error) => error.context.code === "owned-cua-unavailable",
  );
  skills.push({ name: "owned", qualifiedName: "other:owned" });
  await assert.rejects(
    port.loadSkill(request, options),
    (error) =>
      error.message === "Skill name is ambiguous for subagent; use the fully qualified skill name",
  );
});
console.log(
  JSON.stringify({
    mode,
    actualCompilerEmittedSafetyGroups: groups,
    publicThisAndChildFactoryConsumersIncluded: true,
    realOperations: 0,
  }),
);
