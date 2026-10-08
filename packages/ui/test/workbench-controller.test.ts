import assert from "node:assert/strict";
import { test } from "node:test";
import type { IWindowControllerService, WindowHostControllerFrame } from "@knorvia/services";
import { getWindowControllerTaskListRegistry } from "../src/v4/windowControllerTaskListRegistry.js";

test("shared Controller projection exposes un-tabbed remote workspaces and fences old generations", async () => {
  const callbacks: ((frame: WindowHostControllerFrame) => void)[] = [];
  let subscriptions = 0;
  const controller = {
    onDynamicControllerFrame: () => (callback: (frame: WindowHostControllerFrame) => void) => {
      callbacks.push(callback);
      return { dispose() {} };
    },
    subscribeControllerV4: async ({ topic }: { topic: string }) => {
      subscriptions++;
      return { ack: { subscriptionId: topic } };
    },
    unsubscribeControllerV4: async () => {},
  } as unknown as IWindowControllerService;
  const registry = getWindowControllerTaskListRegistry(controller);
  const unsubscribe = registry.subscribe(() => {});
  assert.equal(subscriptions, 2);
  const frame = (workspaces: object[]) =>
    ({
      topic: "controller/workspaces",
      subscriptionId: "controller/workspaces",
      logEpoch: "a",
      fromSeq: 0,
      toSeq: 0,
      sentAt: 1,
      payload: { kind: "snapshot", snapshot: { protocolVersion: 1, logEpoch: "a", workspaces } },
    }) as WindowHostControllerFrame;
  const scope = {
    workspacePath: "/remote",
    workspaceIdentity: "host-r",
    remoteSessionId: "r",
    sourceAvailability: "online",
    connectionState: "online",
  };
  callbacks[0]!(frame([scope]));
  assert.equal(registry.getWorkspaces().ready, true);
  assert.deepEqual(registry.getWorkspaces().workspaces, [scope]);
  const stopSecond = registry.subscribe(() => {});
  assert.equal(subscriptions, 2, "collection reuses the existing observer");
  unsubscribe();
  stopSecond();
  const stopNew = registry.subscribe(() => {});
  assert.equal(registry.getWorkspaces().ready, false);
  callbacks[0]!(frame([scope]));
  assert.equal(
    registry.getWorkspaces().ready,
    false,
    "old generation cannot populate current collection",
  );
  callbacks[1]!(frame([{ ...scope, remoteSessionId: "new" }]));
  assert.equal(registry.getWorkspaces().workspaces[0]?.remoteSessionId, "new");
  stopNew();
  await Promise.resolve();
});
