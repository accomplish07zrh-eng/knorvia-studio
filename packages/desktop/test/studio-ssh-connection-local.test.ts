import assert from "node:assert/strict";
import { test } from "node:test";
import { createWindowRemoteConnectionRegistry } from "../src/host/windowRemoteConnectionRegistry.js";

test("local SSH connector keeps workspace identity across disconnect and reconnect", async () => {
  let nextSession = 0;
  let nextConnection = 0;
  const closeListeners = new Map<
    number,
    (event: { exitCode: number | null; signal: string | null }) => void
  >();
  const seenTargets: string[] = [];
  const registry = createWindowRemoteConnectionRegistry({
    createId: () => `session-${++nextSession}`,
    async connect({ target }) {
      assert.equal(target.kind, "ssh");
      seenTargets.push(target.host);
      const connection = ++nextConnection;
      return {
        services: { connection },
        dispose() {},
        onDidClose(listener) {
          closeListeners.set(connection, listener);
          return { dispose: () => closeListeners.delete(connection) };
        },
      };
    },
  });
  const path = "/srv/shared";
  const firstIdentity = "fixture-host-a:project";
  const firstTarget = { kind: "ssh" as const, host: "fixture-a.invalid", username: "fixture" };
  const secondTarget = { kind: "ssh" as const, host: "fixture-b.invalid", username: "fixture" };
  const attach = (remoteSessionId: string, workspaceIdentity: string) => ({
    kind: "remote" as const,
    remoteSessionId,
    workspacePath: path,
    workspaceIdentity,
  });
  try {
    const first = await registry.connect({
      requestId: "connect-a-1",
      target: firstTarget,
      remoteAssets: {},
      workspacePath: path,
      workspaceIdentity: firstIdentity,
    });
    assert.equal(
      registry.resolveScopedServices(attach(first.remoteSessionId, firstIdentity)).connection,
      1,
    );
    assert.equal(registry.getSession(first.remoteSessionId)?.state, "online");
    assert.throws(() =>
      registry.resolveScopedServices(attach(first.remoteSessionId, "other-identity")),
    );

    closeListeners.get(1)?.({ exitCode: null, signal: null });
    assert.equal(registry.getSession(first.remoteSessionId)?.state, "disconnected");
    assert.equal(registry.getSession(first.remoteSessionId)?.sourceAvailability, "offline");
    assert.throws(() =>
      registry.resolveScopedServices(attach(first.remoteSessionId, firstIdentity)),
    );

    const reconnected = await registry.connect({
      requestId: "connect-a-2",
      target: firstTarget,
      remoteAssets: {},
      workspacePath: path,
      workspaceIdentity: firstIdentity,
    });
    assert.equal(
      registry.resolveScopedServices(attach(reconnected.remoteSessionId, firstIdentity)).connection,
      2,
    );
    assert.equal(
      registry.findSessionForWorkspace({ workspacePath: path, workspaceIdentity: firstIdentity })
        ?.remoteSessionId,
      reconnected.remoteSessionId,
    );
    assert.throws(() =>
      registry.resolveScopedServices(attach(first.remoteSessionId, firstIdentity)),
    );

    const other = await registry.connect({
      requestId: "connect-b",
      target: secondTarget,
      remoteAssets: {},
      workspacePath: path,
      workspaceIdentity: "fixture-host-b:project",
    });
    assert.equal(
      registry.resolveScopedServices(attach(other.remoteSessionId, "fixture-host-b:project"))
        .connection,
      3,
    );
    assert.deepEqual(seenTargets, ["fixture-a.invalid", "fixture-a.invalid", "fixture-b.invalid"]);
  } finally {
    await registry.dispose();
  }
});
