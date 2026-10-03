import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { test } from "node:test";
import ts from "typescript";

// File reads are limited to these three selected modules. All product ports are synthetic.
const baseline = process.argv.includes("--baseline");
const selected = process.argv.find((arg) => arg.startsWith("--owner="))?.slice(8);
const owners = {
  recording: "browserRecordingArtifactMaterializer.ts",
  proxy: "hostRemoteWorkspaceProxyState.ts",
  registry: "windowRemoteConnectionRegistry.ts",
};
const plain = (value) => JSON.parse(JSON.stringify(value));
const defer = () => {
  let resolve, reject;
  const promise = new Promise((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
};
const drain = async () => {
  for (let i = 0; i < 12; i++) await Promise.resolve();
};
function load(owner, ports, globals = {}) {
  const file = baseline
    ? path.join("/tmp/knorvia-host-resource-baseline", owners[owner])
    : path.join(process.cwd(), "packages/desktop/src/host", owners[owner]);
  const result = ts.transpileModule(fs.readFileSync(file, "utf8"), {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS },
    fileName: file,
    reportDiagnostics: true,
  });
  assert.equal(
    result.diagnostics?.filter((d) => d.category === ts.DiagnosticCategory.Error).length,
    0,
  );
  const exports = {};
  vm.runInNewContext(
    result.outputText,
    {
      exports,
      module: { exports },
      require(id) {
        assert.ok(Object.hasOwn(ports, id), "uninjected product import " + id);
        return ports[id];
      },
      Error,
      Promise,
      Map,
      Set,
      Object,
      Array,
      Number,
      String,
      Math,
      ...globals,
    },
    { filename: file },
  );
  return exports;
}
function check(owner, name, run) {
  if (!selected || selected === owner) test(owner + ": " + name, run);
}
const workspaceKey = (context) => context.workspaceIdentity?.trim() || context.workspacePath;
check("recording", "local staging order, live artifact and original failure identity", async () => {
  const events = [],
    gate = defer(),
    artifact = { path: "old", nested: {} };
  const output = path.resolve("/synthetic-workspace", "recordings/a.WEBM");
  const stage = output + ".knorvia-studio-recording-fixed.tmp";
  const ports = {
    "node:path": path,
    "node:crypto": {
      randomUUID() {
        events.push(["uuid"]);
        return "fixed";
      },
    },
    "node:fs/promises": {
      async mkdir(...args) {
        events.push(["mkdir", ...args]);
      },
      async copyFile(...args) {
        events.push(["copy", ...args]);
        await gate.promise;
      },
      async rm(...args) {
        events.push(["rm", ...args]);
      },
      async rename(...args) {
        events.push(["rename", ...args]);
      },
    },
  };
  const { materializeBrowserRecordingArtifact: materialize } = load("recording", ports);
  const pending = materialize({
    artifact,
    localPath: "synthetic-source",
    workspacePath: "/synthetic-workspace",
    outputPath: "recordings/a.WEBM",
  });
  await drain();
  assert.deepEqual(plain(events), [
    ["mkdir", path.dirname(output), { recursive: true }],
    ["uuid"],
    ["copy", "synthetic-source", stage],
  ]);
  artifact.changed = "during-copy";
  gate.resolve();
  const result = await pending;
  assert.notEqual(result, artifact);
  assert.equal(result.nested, artifact.nested);
  assert.equal(result.changed, "during-copy");
  assert.equal(result.path, output);
  assert.deepEqual(plain(events.slice(3)), [
    ["rm", output, { force: true }],
    ["rename", stage, output],
    ["rm", stage, { force: true }],
  ]);
  const failure = new Error("synthetic-copy"),
    cleanup = new Error("synthetic-cleanup");
  ports["node:fs/promises"].copyFile = async () => {
    throw failure;
  };
  ports["node:fs/promises"].rm = async () => {
    throw cleanup;
  };
  const failed = load("recording", ports).materializeBrowserRecordingArtifact;
  await assert.rejects(
    failed({
      artifact,
      localPath: "source",
      workspacePath: "/synthetic-workspace",
      outputPath: "a.webm",
    }),
    (error) => error === failure,
  );
});
check("recording", "remote upload authority, bounded paths and live result identity", async () => {
  const gate = defer(),
    artifact = { path: "old", nested: {} },
    calls = [];
  const backend = {
    async upload(...args) {
      assert.equal(this, backend);
      calls.push(args);
      await gate.promise;
    },
  };
  const ports = {
    "node:path": path,
    "node:crypto": {
      randomUUID() {
        assert.fail("local UUID");
      },
    },
    "node:fs/promises": Object.fromEntries(
      ["copyFile", "mkdir", "rename", "rm"].map((key) => [
        key,
        () => assert.fail("local filesystem port"),
      ]),
    ),
  };
  const materialize = load("recording", ports).materializeBrowserRecordingArtifact;
  const input = {
    artifact,
    localPath: "source",
    outputPath: "out\\a.WEBM",
    workspacePath: "/workspace\\root",
    remoteSessionId: "synthetic-session",
    remoteBackend: backend,
  };
  const pending = materialize(input);
  assert.deepEqual(calls, [["source", "/workspace/root/out/a.WEBM"]]);
  input.artifact = { path: "replacement", nested: artifact.nested, late: true };
  gate.resolve();
  const result = await pending;
  assert.equal(result.nested, artifact.nested);
  assert.equal(result.late, true);
  assert.equal(result.path, "/workspace/root/out/a.WEBM");
  for (const outputPath of ["../a.webm", "./a.webm", "/a.webm", "a/", "a.txt"]) {
    await assert.rejects(materialize({ ...input, outputPath }), /recording outputPath must/);
  }
  await assert.rejects(
    materialize({ ...input, outputPath: "../bad", remoteBackend: undefined }),
    /materialization is unavailable/,
  );
  assert.equal(calls.length, 1);
});
const proxy = () =>
  load("proxy", {
    "@knorvia/shared": { resolveWorkspaceKey: workspaceKey },
  }).createHostRemoteWorkspaceProxyState();
check("proxy", "identity, duplicate subscription and synchronous/stale ready callbacks", () => {
  const state = proxy(),
    context = { workspacePath: "/a", workspaceIdentity: " identity " },
    events = [];
  const meta = { ...context, taskId: "task", traceId: "trace" };
  state.rememberTaskMeta(meta);
  assert.equal(state.getTaskMeta("task"), meta);
  assert.equal(
    state.ensureWorkspaceSubscription(context, () => ({
      dispose() {
        events.push("workspace");
      },
    })),
    true,
  );
  assert.equal(
    state.ensureWorkspaceSubscription(
      { workspacePath: "/elsewhere", workspaceIdentity: "identity" },
      () => assert.fail("duplicate"),
    ),
    false,
  );
  let stale;
  state.trackTaskReady(
    "task",
    context,
    (listener) => {
      stale = listener;
      return {
        dispose() {
          events.push("old");
        },
      };
    },
    () => events.push("old-ready"),
  );
  state.trackTaskReady(
    "task",
    context,
    (listener) => {
      listener();
      return {
        dispose() {
          events.push("sync");
        },
      };
    },
    () => events.push("sync-ready"),
  );
  assert.deepEqual(events, ["old", "sync-ready", "sync"]);
  state.trackTaskReady(
    "task",
    context,
    () => ({
      dispose() {
        events.push("new");
      },
    }),
    () => {},
  );
  stale();
  stale();
  assert.deepEqual(events.slice(3), ["new", "old-ready", "old-ready"]);
  state.disposeTaskReadySubscription("task");
  assert.equal(events.length, 6);
});
check("proxy", "workspace disposal errors preserve state; metadata identity stays live", () => {
  const state = proxy(),
    context = { workspacePath: "/a" },
    other = { workspacePath: "/b" };
  const failure = new Error("workspace-disposal"),
    events = [];
  let throws = true;
  state.ensureWorkspaceSubscription(context, () => ({
    dispose() {
      events.push("workspace");
      if (throws) throw failure;
    },
  }));
  const moved = { ...context, taskId: "moved", traceId: "trace" },
    matching = { ...context, taskId: "matching", traceId: "trace" };
  state.rememberTaskMeta(moved);
  state.rememberTaskMeta(matching);
  moved.workspacePath = "/b";
  state.trackTaskReady(
    "matching",
    context,
    () => ({
      dispose() {
        events.push("task");
      },
    }),
    () => {},
  );
  assert.throws(
    () => state.clearWorkspace(context),
    (error) => error === failure,
  );
  assert.equal(state.getTaskMeta("matching"), matching);
  throws = false;
  state.clearWorkspace(context);
  assert.deepEqual(events, ["workspace", "workspace", "task"]);
  assert.equal(state.getTaskMeta("matching"), undefined);
  assert.equal(state.getTaskMeta("moved"), moved);
  state.clearWorkspace(other);
  assert.equal(state.getTaskMeta("moved"), undefined);
  const taskFailure = new Error("task-disposal");
  state.trackTaskReady(
    "throwing",
    context,
    () => ({
      dispose() {
        events.push("throwing");
        throw taskFailure;
      },
    }),
    () => {},
  );
  assert.throws(
    () => state.disposeTaskReadySubscription("throwing"),
    (error) => error === taskFailure,
  );
  state.disposeTaskReadySubscription("throwing");
  assert.equal(events.filter((value) => value === "throwing").length, 1);
});
function registryHarness(overrides = {}) {
  const connects = [],
    timers = new Map(),
    events = [];
  let id = 0,
    timerId = 0;
  class FakeAbortController {
    signal = { aborted: false };
    abort() {
      this.signal.aborted = true;
      events.push("abort");
    }
  }
  const options = {
    createId: () => "session-" + ++id,
    connect(request) {
      const ready = defer();
      connects.push({ request, ready });
      return ready.promise;
    },
    wslIdleTtlMs: 17,
    ...overrides,
  };
  const shared = {
    buildSshRemoteHostKey: (target) => target.syntheticIdentity,
    stripRemoteTargetSecrets(target) {
      const result = { ...target };
      delete result.syntheticSecret;
      return result;
    },
  };
  const registry = load(
    "registry",
    { "@knorvia/shared": shared },
    {
      AbortController: FakeAbortController,
      setTimeout(callback, delay) {
        const token = ++timerId;
        timers.set(token, { callback, delay });
        return token;
      },
      clearTimeout(token) {
        timers.delete(token);
      },
    },
  ).createWindowRemoteConnectionRegistry(options);
  const handle = (name) => {
    const listeners = new Set();
    return {
      services: { name },
      capabilities: { name },
      disposed: 0,
      dispose() {
        this.disposed++;
        events.push("dispose:" + name);
      },
      onDidClose(listener) {
        listeners.add(listener);
        return {
          dispose() {
            events.push("unsubscribe:" + name);
            listeners.delete(listener);
          },
        };
      },
      close(event) {
        for (const listener of listeners) listener(event);
      },
    };
  };
  const connect = (requestId, target, workspacePath = "/a", workspaceIdentity) =>
    registry.connect({
      requestId,
      target,
      remoteAssets: { mockCdnDir: "synthetic-assets" },
      workspacePath,
      workspaceIdentity,
    });
  const scope = (descriptor) => ({
    kind: "remote",
    remoteSessionId: descriptor.remoteSessionId,
    workspacePath: descriptor.workspacePath,
    workspaceIdentity: descriptor.workspaceIdentity,
    generation: -999,
  });
  return { registry, connects, timers, events, options, handle, connect, scope };
}
check(
  "registry",
  "SSH pending cancellation retires reuse slot; scope and event identities",
  async () => {
    const closed = [],
      h = registryHarness({
        onSessionClosed(event) {
          closed.push(event);
        },
      });
    const target = { kind: "ssh", syntheticIdentity: "host", syntheticSecret: "synthetic-secret" };
    const first = h.connect("first", target);
    const cancelled = assert.rejects(
      first,
      (error) =>
        error.name === "WindowRemoteConnectCancelledError" &&
        error.constructor.name === error.name &&
        error.message === "远程连接已取消",
    );
    await assert.rejects(h.connect("first", target), /requestId 重复/);
    h.registry.cancelConnect("first");
    assert.equal(h.connects[0].request.signal.aborted, true);
    const second = h.connect("second", target, "/a", " identity ");
    assert.equal(h.connects.length, 2);
    const old = h.handle("old"),
      current = h.handle("current");
    h.connects[0].ready.resolve(old);
    h.connects[1].ready.resolve(current);
    await cancelled;
    const descriptor = await second;
    await drain();
    assert.equal(old.disposed, 1);
    assert.equal(current.disposed, 0);
    assert.equal(h.connects[1].request.target, target);
    assert.equal(descriptor.target.syntheticSecret, undefined);
    assert.equal(h.registry.resolveScopedServices(h.scope(descriptor)), current.services);
    assert.equal(h.registry.resolveScopedCapabilities(h.scope(descriptor)), current.capabilities);
    assert.throws(
      () =>
        h.registry.resolveScopedServices({ ...h.scope(descriptor), workspaceIdentity: "identity" }),
      /scope 与 logical session 不匹配/,
    );
    assert.throws(() => h.registry.resolveScopedServices({ kind: "local" }), /不能解析 local/);
    const closeError = { exitCode: 7, signal: null, error: "synthetic-close" };
    current.close(closeError);
    assert.equal(closed[0].remoteSessionId, descriptor.remoteSessionId);
    assert.equal(closed[0].error, closeError.error);
    assert.equal(h.registry.getSession(descriptor.remoteSessionId).state, "disconnected");
    assert.throws(
      () => h.registry.resolveScopedServices(h.scope(descriptor)),
      (error) =>
        error.name === "WindowRemoteConnectionUnavailableError" &&
        error.constructor.name === error.name,
    );
    assert.deepEqual(plain(h.registry.getStats()), { connectionCount: 0, logicalSessionCount: 1 });
    await h.registry.disposeSession(descriptor.remoteSessionId);
    await h.registry.dispose();
  },
);
check(
  "registry",
  "WSL ownership generations, task deferral, release barrier and idle clock",
  async () => {
    const releases = [],
      releaseGate = defer();
    const h = registryHarness({
      releaseWorkspace(services, context) {
        assert.equal(this, h.options);
        releases.push({ services, context });
        return releaseGate.promise;
      },
    });
    const target = { kind: "wsl", distro: " synthetic ", user: " tester " };
    const first = h.connect("first", target, "/a", " identity ");
    const second = h.connect(
      "second",
      { kind: "wsl", distro: "synthetic", user: "tester" },
      "/a",
      " identity ",
    );
    assert.equal(h.connects.length, 1);
    const handle = h.handle("wsl");
    h.connects[0].ready.resolve(handle);
    const a = await first,
      b = await second;
    await h.registry.disposeSession(a.remoteSessionId);
    assert.equal(releases.length, 0);
    h.registry.setWorkspaceRunningTaskCount({
      workspacePath: "/a",
      workspaceIdentity: "identity",
      runningTaskCount: 2,
    });
    await h.registry.disposeSession(b.remoteSessionId);
    assert.equal(releases.length, 0);
    assert.equal(h.timers.size, 0);
    h.registry.setWorkspaceRunningTaskCount({
      workspacePath: "/a",
      workspaceIdentity: "identity",
      runningTaskCount: 0,
    });
    assert.equal(releases.length, 0); // Concurrent first owners shared generation zero.
    assert.equal(h.timers.size, 1);
    const c = await h.connect("third", target, "/a", " identity ");
    h.registry.setWorkspaceRunningTaskCount({
      workspacePath: "/a",
      workspaceIdentity: "identity",
      runningTaskCount: 2,
    });
    await h.registry.disposeSession(c.remoteSessionId);
    assert.equal(releases.length, 0);
    assert.equal(h.timers.size, 0);
    const replacement = await h.connect("replacement", target, "/a", " identity ");
    h.registry.setWorkspaceRunningTaskCount({
      workspacePath: "/a",
      workspaceIdentity: "identity",
      runningTaskCount: 0,
    });
    assert.equal(releases.length, 0);
    const removing = h.registry.disposeSession(replacement.remoteSessionId);
    assert.equal(releases.length, 1);
    assert.equal(releases[0].services, handle.services);
    assert.equal(releases[0].context.workspaceIdentity, " identity ");
    let acquired = false;
    const fourth = h.connect("fourth", target, "/a", " identity ").then((value) => {
      acquired = true;
      return value;
    });
    await drain();
    assert.equal(acquired, false);
    assert.equal(h.timers.size, 0);
    releaseGate.resolve();
    await removing;
    const d = await fourth;
    assert.equal(await h.registry.waitForScopedServices(h.scope(d)), handle.services);
    const binding = h.registry.bindWorkspaceContext({
      remoteSessionId: d.remoteSessionId,
      workspacePath: "/b",
      workspaceIdentity: " next ",
    });
    const rapidBinding = h.registry.bindWorkspaceContext({
      remoteSessionId: d.remoteSessionId,
      workspacePath: "/b",
      workspaceIdentity: " next ",
    });
    assert.equal(h.registry.getSession(d.remoteSessionId).generation, 3);
    assert.throws(
      () => h.registry.resolveScopedServices(h.scope(d)),
      /scope 与 logical session 不匹配/,
    );
    await Promise.all([binding, rapidBinding]);
    const rebound = h.registry.getSession(d.remoteSessionId);
    assert.equal(rebound.workspacePath, "/b");
    assert.equal(rebound.workspaceIdentity, " next ");
    assert.equal(h.registry.resolveScopedServices(h.scope(rebound)), handle.services);
    await h.registry.bindWorkspaceContext({
      remoteSessionId: d.remoteSessionId,
      workspacePath: "",
      workspaceIdentity: " next ",
    });
    assert.equal(h.registry.getSession(d.remoteSessionId).generation, 4);
    assert.equal(Object.hasOwn(h.registry.getSession(d.remoteSessionId), "workspacePath"), false);
    assert.equal(
      h.registry.resolveScopedServices({ ...h.scope(rebound), workspacePath: "" }),
      handle.services,
    );
    await h.registry.disposeSession(d.remoteSessionId);
    assert.equal(releases.length, 3);
    assert.equal(releases[2].context.workspacePath, "/b");
    assert.equal(h.timers.size, 1);
    const [token, timer] = [...h.timers][0];
    assert.equal(timer.delay, 17);
    h.timers.delete(token);
    timer.callback();
    await drain();
    assert.equal(handle.disposed, 1);
    await h.registry.dispose();
    assert.equal(handle.disposed, 1);
  },
);
check("registry", "dedicated Docker handles, registry shutdown and error identity", async () => {
  const h = registryHarness(),
    target = { kind: "docker" };
  const p = h.connect("first", target),
    q = h.connect("second", target);
  assert.equal(h.connects.length, 2);
  const first = h.handle("first"),
    second = h.handle("second");
  h.connects[0].ready.resolve(first);
  h.connects[1].ready.resolve(second);
  const a = await p,
    b = await q;
  assert.notEqual(a.remoteSessionId, b.remoteSessionId);
  assert.throws(() => h.registry.findSessionForWorkspace({ workspacePath: "/a" }), /匹配到多个/);
  await h.registry.dispose();
  await h.registry.dispose();
  assert.equal(first.disposed, 1);
  assert.equal(second.disposed, 1);
  assert.deepEqual(h.events, [
    "abort",
    "unsubscribe:first",
    "dispose:first",
    "abort",
    "unsubscribe:second",
    "dispose:second",
  ]);
  assert.deepEqual(plain(h.registry.getStats()), { connectionCount: 0, logicalSessionCount: 0 });
  await assert.rejects(h.connect("later", target), /registry 已释放/);
  const failure = new Error("synthetic-transport");
  const failed = registryHarness();
  const pending = failed.connect("failed", target);
  failed.connects[0].ready.reject(failure);
  await assert.rejects(pending, (error) => error === failure);
  assert.deepEqual(plain(failed.registry.getStats()), {
    connectionCount: 0,
    logicalSessionCount: 0,
  });
  await failed.registry.dispose();
});
