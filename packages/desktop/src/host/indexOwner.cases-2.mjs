import { assert, plain, defer, drain, check, harness } from "./indexOwner.fixture.mjs";

check("task-flow", async () => {
  const h = harness();
  const base = await h.init();
  const session = await h.connect();
  const service = h.remote.get(h.tokens.IKnorviaTaskService);
  const meta = await service.createTask({
    workspacePath: "/remote",
    workspaceIdentity: "remote:identity",
  });
  assert.equal(h.metadata.get(meta.taskId), meta);
  assert.equal(
    h.messages.findLast((message) => message.type === "SessionRouteAnnounce").route.sessionId,
    meta.taskId,
  );
  const prompt = {
    taskId: meta.taskId,
    traceId: "prompt-trace",
    content: "synthetic-prompt",
    attachments: [],
  };
  const submission = service.sendPrompt(prompt);
  h.control.taskMetadataOverride = { ...meta, workspaceIdentity: "remote:mirror-current" };
  await submission;
  h.control.taskMetadataOverride = undefined;
  assert.equal(h.trackerEntries.size, 1);
  assert.equal(h.events.find((event) => Array.isArray(event) && event[0] === "prompt")[1], prompt);
  const mirrored = h.events.find((event) => Array.isArray(event) && event[0] === "mirror");
  assert.equal(mirrored[1].workspaceIdentity, "remote:mirror-current");
  assert.equal(mirrored[1].runId, "prompt-trace");
  assert.equal(mirrored[2].attachments, prompt.attachments);
  assert.equal(mirrored[2].kind, "user_message");
  const streamEvent = { type: "synthetic-stream", data: {} };
  h.control.streamListener(streamEvent);
  const streamMirror = h.events.findLast((event) => Array.isArray(event) && event[0] === "mirror");
  assert.equal(streamMirror[2].kind, "stream_event");
  assert.equal(streamMirror[2].event, streamEvent);
  h.taskReady.get(meta.taskId)();
  assert.equal(h.trackerEntries.size, 0);
  assert.ok(h.events.some((event) => event === "ready-dispose:" + meta.taskId));
  const routed = h.control.exposures[0].overrides.get(h.tokens.IKnorviaTaskService.channelName);
  assert.equal(routed.passthrough(), h.local.get(h.tokens.IKnorviaTaskService));
  const mutation = {
    taskId: "task",
    workspacePath: "/local",
    workspaceIdentity: "local",
    pinned: true,
  };
  const projected = await routed.setTaskPinned(mutation);
  assert.equal(projected.address.input.attachmentScope.kind, "local");
  assert.equal(projected.mutation.kind, "pin");
  assert.equal(projected.mutation.pinned, true);
  const gate = defer();
  h.control.flowGate = gate;
  h.protocols[0].fire("saturated");
  h.protocols[0].fire("drained");
  await drain();
  base.close();
  assert.deepEqual(
    h.events
      .filter((event) => Array.isArray(event) && event[0] === "flow")
      .map((event) => event[2]),
    ["saturated"],
  );
  gate.resolve();
  await drain();
  assert.deepEqual(
    h.events
      .filter((event) => Array.isArray(event) && event[0] === "flow")
      .map((event) => event[2]),
    ["saturated", "drained", "closed"],
  );
  assert.ok(h.events.some((event) => Array.isArray(event) && event[0] === "scope-dispose"));
  assert.equal(session.workspaceIdentity, "remote:identity");
});
check("dispatch-shutdown", async () => {
  const h = harness();
  await h.init();
  await h.send({
    type: "CronRun",
    automationId: "absent",
    runId: "absent:1",
    prompt: "synthetic",
    workspacePath: "/missing",
    workspaceIdentity: "remote:missing",
  });
  await drain();
  assert.match(
    h.messages.findLast((message) => message.type === "CronRunResult").error,
    /Remote Host 当前不可用/,
  );
  assert.equal(h.events.filter((event) => Array.isArray(event) && event[0] === "create").length, 0);
  const automation = {
    automationId: "automation",
    workspaceKey: "local",
    workspacePath: "/local",
    workspaceIdentity: "local",
    prompt: "saved",
    mode: " plan ",
  };
  h.control.automations.set(automation.automationId, automation);
  const run = {
    runId: "automation:1700000000000:manual:request",
    modelSelection: h.control.fixedSelection,
    scheduledAt: 1700000000000,
  };
  const ledgerFailure = new Error("synthetic-ledger");
  h.control.ledgerFailure = ledgerFailure;
  await h.control.localOptions.onAutomationManualRunRequested({ automation, run });
  const sent = h.events.find((event) => Array.isArray(event) && event[0] === "prompt")[1];
  assert.equal(sent.traceId, run.runId);
  assert.equal(sent.content, automation.prompt);
  assert.equal(sent.clientMode, "desktop-continuous");
  const created = h.events.find((event) => Array.isArray(event) && event[0] === "create")[1];
  assert.equal(created.model, "model:synthetic-fixed-model");
  assert.equal(created.thoughtLevel, "low");
  const delivered = {
    messageId: "synthetic-message",
    requestId: "synthetic-request",
    fromSessionId: "synthetic-session",
  };
  await h.send({ type: "SessionMessageDeliver", request: delivered });
  await drain();
  const delivery = h.messages.findLast((message) => message.type === "SessionMessageDeliverResult");
  assert.equal(delivery.result, delivered);
  assert.equal(
    h.events.filter((event) => Array.isArray(event) && event[0] === "manual-failure").length,
    0,
  );
  assert.equal(h.events.filter((event) => event === "heartbeat-dispose").length, 0);
  h.terminal.get("synthetic-task")({ inputId: "other", outcome: "completed" });
  assert.equal(h.events.filter((event) => event === "heartbeat-dispose").length, 0);
  h.terminal.get("synthetic-task")({ inputId: run.runId, outcome: "completed" });
  assert.equal(h.events.filter((event) => event === "heartbeat-dispose").length, 1);
  const shutdown = h.send({ type: "Dispose" });
  await drain();
  assert.deepEqual(plain(h.control.phases.map((phase) => phase.name)), [
    "remote-registry-dispose",
    "service-dispose",
  ]);
  assert.deepEqual(plain(h.control.phases.map((phase) => phase.timeoutMs)), [6000, 20000]);
  assert.equal(h.control.phaseOptions.phaseTimeoutMs, 5000);
  assert.equal(h.events.includes("exit:0"), false);
  assert.ok(h.events.indexOf("attachments-dispose") < h.events.indexOf("phases-start"));
  assert.ok(h.events.indexOf("realtime-dispose") < h.events.indexOf("phases-start"));
  h.control.phaseGate.resolve();
  await shutdown;
  assert.ok(h.events.indexOf("coverage-flush") < h.events.indexOf("exit:0"));
  await h.send({ type: "Dispose" });
  assert.equal(h.events.filter((event) => event === "phases-start").length, 1);
  assert.equal(h.events.filter((event) => event === "coverage-flush").length, 1);
});
