import { assert, plain, defer, drain, check, registryHarness } from "./resourceOwners.fixture.mjs";

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
