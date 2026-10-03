import assert from "node:assert/strict";
import { load, fixture, trace } from "./runtime-tooling-fixture-20261003.mjs";
const mode = process.argv[2];
let groups = 0;
async function group(name, run) {
  await run();
  groups++;
  console.log("ok " + name);
}
await group("authority gates and retained allowlist; actual refresh consumer", async () => {
  const f = fixture(),
    api = await load(mode, f.ports);
  f.runtime.config = {
    taskType: "subagent_child",
    dynamicWorkflowEnabled: false,
    runtimeFeatures: { browserUse: true },
    toolAllowlist: ["web_search", "Write"],
    toolset: "explore",
  };
  Object.assign(f.deps, {
    browserControlPort: null,
    workflowSubmitPort: {},
    workflowSubmitSchema: null,
    workflowEscalatePort: {},
    coordinatorResponsePort: {},
    automationPort: {},
    offPeakPort: {},
  });
  const result = api.initializeRuntimeTooling(f.runtime, f.deps, "owned-init-session");
  assert.deepEqual(f.calls, ["register", "session-mode", "executor"]);
  assert.deepEqual(Object.keys(result), ["executor", "hookRunner"]);
  assert.equal(result.executor, f.executor);
  assert.equal(result.hookRunner, undefined);
  const r = f.registration;
  assert.deepEqual(Object.keys(r), [
    "bashTimeoutPolicy",
    "includeSkill",
    "includeAgent",
    "includeSendMessage",
    "includeRespondToCoordinator",
    "includeSubmitResult",
    "submitResultSchema",
    "includeEscalate",
    "includeWorkflow",
    "includeAutomation",
    "includeOffPeak",
    "includeDynamicWorkflow",
    "includeNodeRepl",
    "includeBrowserUse",
    "embeddedSearchEnabled",
    "agentProfiles",
    "allowedTools",
    "disallowedTools",
  ]);
  assert.equal(r.includeSendMessage, true);
  assert.equal(r.includeSubmitResult, true);
  assert.equal(r.submitResultSchema, null);
  assert.equal(r.includeRespondToCoordinator, true);
  assert.equal(r.includeAutomation, false);
  assert.equal(r.includeOffPeak, false);
  assert.equal(r.includeDynamicWorkflow, false);
  assert.equal(r.includeNodeRepl, false);
  assert.equal(r.includeBrowserUse, true);
  assert.deepEqual(r.allowedTools, ["WebSearch", "RespondToCoordinator"]);
  assert.equal(f.executorOptions.browserControlPort, null);
  assert.equal(f.executorOptions.runtimeScope, "subagent");
  assert.equal(f.executorOptions.subagentBackgroundBashMaxMs, 3600000);
  const forbidden = ["Read", "CreateWorkflow", "Read"];
  assert.equal(api.resolveRuntimeDisallowedTools({ toolDisallowlist: forbidden }), forbidden);
  assert.deepEqual(
    api.resolveRuntimeDisallowedTools({ taskType: "workflow_child", toolDisallowlist: forbidden }),
    [
      "Read",
      "CreateWorkflow",
      "AmendWorkflow",
      "SaveWorkflow",
      "ResumeWorkflowRun",
      "ResolveWorkflowQuestion",
    ],
  );
  assert.equal(api.resolveRuntimeDynamicWorkflowToolsIncluded({}), true);
  assert.deepEqual(
    api.resolveBuiltInToolAllowlist({
      taskType: "subagent_child",
      toolset: "explore",
      toolAllowlist: [],
    }),
    ["RespondToCoordinator"],
  );
  assert.equal(api.resolveBuiltInToolAllowlist({}), undefined);
  f.runtime.config = { dynamicWorkflowEnabled: false, toolAllowlist: ["Bash", "web_search"] };
  f.runtime.cachedTools = "owned-stale";
  f.calls.length = 0;
  api.refreshBranchAwareBuiltInTools(f.runtime);
  assert.deepEqual(f.calls, ["unregister:Glob", "unregister:Grep", "register"]);
  assert.equal(f.registration.includeDynamicWorkflow, false);
  assert.deepEqual(f.registration.allowedTools, ["Bash", "WebSearch"]);
  assert.equal(f.runtime.cachedTools, null);
});
await group("mailbox and hook native publication/error paths", async () => {
  const f = fixture(),
    api = await load(mode, f.ports);
  f.deps.sessionMailboxPort = {};
  const result = api.initializeRuntimeTooling(f.runtime, f.deps, "owned-init-session");
  assert.equal(result.hookRunner, f.runner);
  assert.deepEqual(f.calls, [
    "register",
    "memory-hooks",
    "mailbox-hooks",
    "owned-hook-a",
    "owned-hook-b",
    "session-mode",
    "executor",
  ]);
  assert.equal(f.mailboxOptions.sessionId, "owned-init-session");
  const event = { owned: "event" },
    current = { ...trace, spanId: "owned-current" };
  await f.hookOptions.emitEvent({ stale: true });
  assert.deepEqual(f.events, []);
  f.ports.currentTrace = current;
  await f.hookOptions.emitEvent(event);
  assert.deepEqual(f.events, [[event, current]]);
  const input = { owned: "input" };
  await f.mailboxOptions.enqueuePendingInput(input, trace);
  assert.deepEqual(f.warnings, []);
  f.runtime.steerResult = { kind: "rejected", reason: "owned-rejected" };
  await f.mailboxOptions.enqueuePendingInput(input, trace);
  assert.deepEqual(f.runtime.steered, {
    delivery: "guide",
    expectedTurnId: trace.turnId,
    input,
    traceContext: trace,
  });
  assert.deepEqual(f.warnings, [
    [
      "Session mailbox input was not queued",
      {
        traceId: trace.traceId,
        turnId: trace.turnId,
        event: "session.mailbox.queue_rejected",
        module: "core.runtime",
        reason: "owned-rejected",
        status: "completed",
      },
    ],
  ]);
  const abort = Object.assign(Error("owned aborted steer"), { name: "AbortError" });
  f.runtime.steerTurn = async () => {
    throw abort;
  };
  await assert.rejects(
    f.mailboxOptions.enqueuePendingInput(input, trace),
    (error) => error === abort,
  );
  const g = fixture(),
    api2 = await load(mode, g.ports);
  g.runtime.config.hooks = { enabled: true };
  g.deps.executionPort = {};
  g.deps.toolExecutor = g.executor;
  api2.initializeRuntimeTooling(g.runtime, g.deps, "owned-init-session");
  assert.deepEqual(g.calls, ["register", "configured"]);
  await g.hookOptions.emitEvent({ stale: true });
  assert.equal(g.events.length, 1);
  const failure = Error("owned append failure");
  g.runtime.appendEvent = async () => {
    throw failure;
  };
  await assert.rejects(g.hookOptions.emitEvent(event), (error) => error === failure);
});
await group("executor captured receiver and live callback identity", async () => {
  const f = fixture(),
    api = await load(mode, f.ports);
  f.runtime.config = {
    taskType: "subagent_child",
    subagents: { backgroundBashMaxMs: 0.5 },
    shellSelection: "owned-shell",
    workspaceIdentity: {
      toString() {
        assert.equal(this, f.runtime.config.workspaceIdentity);
        return "owned-identity";
      },
    },
  };
  f.deps.pdfDocumentPort = {};
  api.initializeRuntimeTooling(f.runtime, f.deps, "different-session");
  const o = f.executorOptions;
  assert.equal(o.sessionId, f.runtime.sessionId);
  assert.equal(o.readFileState, f.runtime.readFileState);
  assert.equal(o.permissionService, f.runtime.permissionService);
  assert.equal(o.permissionBroker, f.runtime.permissionBroker);
  assert.equal(o.pdfDocumentPort, f.deps.pdfDocumentPort);
  assert.equal(o.subagentPort, f.runtime.subagentPort);
  assert.equal(o.subagentBackgroundBashMaxMs, 0);
  assert.equal(o.workspaceIdentity, "owned-identity");
  f.runtime.stopBackgroundTask = () => {
    throw Error("wrong rebound stop");
  };
  f.runtime.setWorkingDirectory = () => {
    throw Error("wrong rebound directory");
  };
  assert.deepEqual(o.backgroundTaskControlPort.stopBackgroundTask("owned-task"), ["owned-task"]);
  o.setWorkingDirectory("owned-new-cwd");
  assert.equal(o.getWorkingDirectory(), "owned-new-cwd");
  f.runtime.workspaceRoot = "owned-new-root";
  assert.equal(o.getWorkspaceRoot(), "owned-new-root");
  f.runtime.config.mode = "plan";
  assert.equal(o.getMode(), "plan");
  f.runtime.config.shellSelection = "owned-new-shell";
  assert.equal(o.getBashShellSelection(), "owned-new-shell");
  f.deps.memoryRoot = "owned-memory";
  assert.equal(o.getMemoryRoot(), "owned-memory");
  assert.equal(f.calls.includes("memory-policy"), false);
  const n = { owned: "notification" };
  assert.equal(o.enqueueBackgroundTaskNotification(n), undefined);
  assert.equal(f.notifications[0], n);
  const event = { owned: "executor-event" };
  await o.emitEvent(event);
  assert.equal(f.events[0][0], event);
  assert.equal(f.events[0][1], trace);
});
await group(
  "shutdown/sealed admission stays default policy and port errors stop assembly",
  async () => {
    const f = fixture(),
      api = await load(mode, f.ports);
    f.runtime.config.taskType = "subagent_child";
    api.initializeRuntimeTooling(f.runtime, f.deps, "owned-init-session");
    const input = {
      taskId: "owned-task",
      toolName: "Bash",
      status: "completed",
      traceContext: trace,
    };
    f.runtime.shuttingDown = true;
    assert.equal(f.executorOptions.shouldEnqueueBackgroundTaskNotification(input), false);
    assert.equal(
      f.calls.some((c) => c.startsWith("registry:")),
      false,
    );
    assert.equal(
      f.warnings[0][0],
      "Suppressed background task notification during runtime shutdown",
    );
    f.runtime.shuttingDown = false;
    f.runtime.backgroundTaskNotificationsSealed = true;
    assert.equal(f.executorOptions.shouldEnqueueBackgroundTaskNotification(input), false);
    assert.equal(f.warnings[1][0], "Suppressed sealed subagent background Bash notification");
    assert.equal(
      f.executorOptions.shouldEnqueueBackgroundTaskNotification({ ...input, toolName: "Read" }),
      true,
    );
    f.runtime.task = { taskType: "local_bash" };
    assert.equal(
      f.executorOptions.shouldEnqueueBackgroundTaskNotification({ ...input, toolName: "Read" }),
      false,
    );
    f.runtime.config.taskType = "workflow_child";
    assert.equal(f.executorOptions.shouldEnqueueBackgroundTaskNotification(input), true);
    const g = fixture(),
      api2 = await load(mode, g.ports),
      failure = Error("owned registration failure");
    g.ports.registerBuiltInTools = () => {
      throw failure;
    };
    // Modules capture imported function identity, so replace the port before loading a fresh instance.
    const api3 = await load(mode, g.ports);
    assert.throws(
      () => api3.initializeRuntimeTooling(g.runtime, g.deps, "owned-init-session"),
      (error) => error === failure,
    );
    assert.deepEqual(g.calls, []);
    assert.equal(typeof api2.initializeRuntimeTooling, "function");
    const h = fixture(),
      api4 = await load(mode, h.ports);
    const register = h.ports.registerBuiltInTools;
    h.ports.registerBuiltInTools = (...args) => {
      register(...args);
      h.runtime.config = { taskType: "subagent_child", hooks: { enabled: true } };
    };
    h.deps.executionPort = {};
    const api5 = await load(mode, h.ports);
    api5.initializeRuntimeTooling(h.runtime, h.deps, "owned-init-session");
    assert.equal(h.calls.includes("configured"), true);
    assert.equal(h.executorOptions.runtimeScope, "subagent");
    assert.equal(typeof api4.initializeRuntimeTooling, "function");
  },
);
await group(
  "receipt resume clears first, exact latest validation and store rejection",
  async () => {
    const f = fixture(),
      api = await load(mode, f.ports);
    f.runtime.lastPermissionGrantId = "owned-old";
    let settle;
    f.runtime.sessionStore = {
      sessionEntries(input) {
        assert.equal(this, f.runtime.sessionStore);
        assert.deepEqual(input, {
          sessionID: f.runtime.sessionId,
          type: "runtime/permission_full_access",
        });
        return new Promise((resolve) => (settle = resolve));
      },
    };
    const pending = api.restorePermissionGrantMarker(f.runtime, trace);
    assert.equal(f.runtime.lastPermissionGrantId, undefined);
    settle([{ id: "owned-invalid", data: {} }]);
    await pending;
    assert.equal(
      f.warnings[0][0],
      "Ignoring invalid permission grant marker during session resume",
    );
    assert.equal(f.warnings[0][1].reason, "invalid_receipt");
    const data = {
      interactionId: "owned-grant",
      event: {
        id: "owned-event",
        sessionId: f.runtime.sessionId,
        traceId: trace.traceId,
        type: "session_mode_changed",
        timestamp: new Date(0),
        sequenceNumber: 0,
        payload: {
          mode: "yolo",
          planEnabled: false,
          previousMode: "build",
          previousPlanEnabled: false,
          source: "command",
          permissionGrant: { interactionId: "owned-grant", queueItemIds: [] },
        },
      },
    };
    f.runtime.sessionStore.sessionEntries = async () => [{ id: "owned-valid", data }];
    await api.restorePermissionGrantMarker(f.runtime, trace);
    assert.equal(f.runtime.lastPermissionGrantId, "owned-grant");
    data.event.sessionId = "owned-other-session";
    await api.restorePermissionGrantMarker(f.runtime, trace);
    assert.equal(f.runtime.lastPermissionGrantId, undefined);
    assert.equal(f.warnings[1][1].reason, "session_mismatch");
    const failure = Error("owned store failure");
    f.runtime.sessionStore.sessionEntries = async () => {
      throw failure;
    };
    await assert.rejects(
      api.restorePermissionGrantMarker(f.runtime, trace),
      (error) => error === failure,
    );
    assert.equal(f.runtime.lastPermissionGrantId, undefined);
  },
);
console.log(
  JSON.stringify({
    mode,
    actualCompilerEmittedGroups: groups,
    realRefreshConsumerIncludedInFirstGroup: true,
    realOperations: 0,
  }),
);
