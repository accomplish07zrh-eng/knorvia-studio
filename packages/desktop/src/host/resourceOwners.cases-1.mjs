import {
  assert,
  path,
  plain,
  defer,
  drain,
  load,
  check,
  proxy,
  registryHarness,
} from "./resourceOwners.fixture.mjs";

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
