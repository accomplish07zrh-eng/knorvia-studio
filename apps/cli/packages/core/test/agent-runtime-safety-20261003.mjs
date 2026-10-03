import assert from "node:assert/strict";
import { fixture, load, plain } from "./agent-runtime-fixture-20261003.mjs";
const mode = process.argv[2];
let groups = 0;
async function group(name, operation) {
  await operation();
  groups++;
  console.log("ok " + name);
}
await group(
  "constructor native order, supplied authority and session/workspace references",
  async () => {
    const f = fixture(),
      C = await load(mode, f),
      permission = {},
      broker = {},
      scheduler = {};
    Object.assign(f.deps, {
      permissionService: permission,
      permissionBroker: broker,
      toolScheduler: scheduler,
    });
    const r = new C("owned-session", f.config, f.deps);
    assert.deepEqual(f.calls, [
      "memory-policy",
      "state",
      "telemetry",
      "reducer",
      "logger",
      "clone-selection",
      "history",
      "queue",
      "branch:0",
      "tooling",
      "context",
      "startup",
    ]);
    assert.equal(r.sessionId, "owned-session");
    assert.equal(r.permissionService, permission);
    assert.equal(r.permissionBroker, broker);
    assert.equal(r.toolScheduler, scheduler);
    assert.equal(r.eventStore, f.deps.eventStore);
    assert.equal(r.sessionStore, f.deps.sessionStore);
    assert.equal(r.executor, f.executor);
    assert.equal(r.hookRunner, f.hookRunner);
    assert.equal(r.runtimeTaskRegistry, f.deps.runtimeTaskRegistry);
    assert.notEqual(r.config, f.config);
    assert.equal(r.config.memory, f.config.memory);
    assert.equal(f.config.modelContextBudgetStrategy, "legacy");
    assert.equal(r.config.modelContextBudgetStrategy, "preflight-v1");
    assert.notEqual(r.sessionModelSelection, f.config.modelSelection);
    assert.deepEqual(plain(r.sessionModelSelection), f.config.modelSelection);
    assert.equal(r.workspaceRoot, f.config.workingDirectory);
    assert.equal(r.contextInitialized, true);
    assert.equal(r.turnNumber, 0);
    assert.equal(r.queueAutoDrain, true);
    assert.equal(r.shuttingDown, false);
    assert.equal(r.pendingInputReservations.size, 0);
    assert.equal(r.eventSinks.size, 0);
    assert.equal(r.contextBuilder, f.deps.contextBuilder);
    assert.equal(r.isRemoteWorkspace(), false);
    assert.equal(r.now().toISOString(), "1970-01-01T00:00:00.000Z");
  },
);
await group(
  "default deny and live branch callback before subagent/tooling and detached startup",
  async () => {
    const f = fixture();
    delete f.deps.contextBuilder;
    delete f.deps.traceContext;
    delete f.deps.toolRegistry;
    const late = { name: "late-owned-subagent" };
    f.controller.onBranch = () => {
      f.deps.subagentPort = late;
    };
    const C = await load(mode, f);
    const r = new C("owned-session", f.config, f.deps);
    assert.deepEqual(f.calls, [
      "memory-policy",
      "state",
      "telemetry",
      "default-permission",
      "default-deny",
      "default-scheduler",
      "reducer",
      "default-trace",
      "logger",
      "clone-selection",
      "history",
      "queue",
      "branch:0",
      "default-registry",
      "tooling",
      "startup",
    ]);
    assert.equal(r.permissionBroker.name, "deny-broker");
    assert.equal(r.subagentPort, late);
    assert.equal(r.contextInitialized, false);
    assert.equal(r.contextBuilder, null);
    const g = fixture();
    delete g.deps.runtimeTaskRegistry;
    delete g.deps.subagentPort;
    delete g.config.modelSelection;
    g.config.workingDirectory = "";
    const D = await load(mode, g),
      s = new D("owned-session", g.config, g.deps);
    assert.equal(s.workspaceRoot, "");
    assert.equal(s.sessionModelSelection, undefined);
    assert.ok(g.calls.includes("default-task-registry"));
    assert.ok(g.calls.includes("default-branch:0"));
    assert.ok(g.calls.includes("default-subagent"));
  },
);
await group(
  "constructor failures propagate original and preserve earlier partial state",
  async () => {
    const f = fixture(),
      failure = new Error("Owned startup failure");
    f.controller.failAt = "startup";
    f.controller.failure = failure;
    const C = await load(mode, f);
    assert.throws(
      () => new C("owned-session", f.config, f.deps),
      (e) => e === failure,
    );
    const r = f.controller.runtime;
    assert.equal(r.contextInitialized, true);
    assert.equal(r.executor, f.executor);
    assert.equal(r.sessionStore, f.deps.sessionStore);
    assert.equal(r.shuttingDown, false);
    const g = fixture();
    g.controller.failAt = "tooling";
    g.controller.failure = failure;
    const D = await load(mode, g);
    assert.throws(
      () => new D("owned-session", g.config, g.deps),
      (e) => e === failure,
    );
    assert.equal(g.controller.runtime.contextBuilder, null);
    assert.equal(g.controller.runtime.contextInitialized, false);
    assert.ok(!g.calls.includes("context"));
    assert.ok(!g.calls.includes("startup"));
  },
);
await group(
  "shutdown ownership, repeated stop, native optional await and cleanup error boundary",
  async () => {
    const f = fixture(),
      C = await load(mode, f),
      r = new C("owned-session", f.config, f.deps);
    const sequence = [];
    r.memoryExtractionScheduler = {
      shutdown() {
        assert.equal(this, r.memoryExtractionScheduler);
        assert.equal(r.shuttingDown, true);
        sequence.push("memory");
      },
    };
    r.beginShutdown();
    r.beginShutdown();
    assert.deepEqual(sequence, ["memory", "memory"]);
    f.calls.splice(0);
    const pending = r.closeBrowserSession().then(() => sequence.push("closed"));
    Promise.resolve().then(() => sequence.push("queued"));
    await pending;
    assert.deepEqual(f.calls, ["repl"]);
    assert.deepEqual(sequence, ["memory", "memory", "memory", "queued", "closed"]);
    const error = new Error("Owned browser failure");
    r.browserControlPort = {
      async closeSession(input) {
        assert.equal(this, r.browserControlPort);
        assert.deepEqual(plain(input), { sessionId: "owned-session", traceContext: f.trace });
        throw error;
      },
    };
    await r.closeBrowserSession();
    assert.deepEqual(f.warnings, [
      [
        "Browser session cleanup failed",
        { error: error.message, event: "browser.session_cleanup.failed" },
      ],
    ]);
    f.controller.onWarn = () => {
      throw error;
    };
    await assert.rejects(r.closeBrowserSession(), (e) => e === error);
    f.controller.failAt = "repl";
    f.controller.failure = error;
    const count = f.warnings.length;
    await assert.rejects(r.closeBrowserSession(), (e) => e === error);
    assert.equal(f.warnings.length, count);
    r.memoryExtractionScheduler.shutdown = () => {
      throw error;
    };
    f.calls.splice(0);
    await assert.rejects(r.closeBrowserSession(), (e) => e === error);
    assert.deepEqual(f.calls, []);
    assert.equal(r.shuttingDown, true);
  },
);
console.log(JSON.stringify({ mode, groups, realRuntimePorts: 0 }));
