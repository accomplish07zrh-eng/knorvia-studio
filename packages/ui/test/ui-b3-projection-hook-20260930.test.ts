// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Knorvia Studio contributors
import assert from "node:assert/strict";
import { after, mock, test } from "node:test";
import type { KnorviaSessionStateSnapshot, KnorviaTaskMeta } from "@knorvia/shared";
import { runtimeValue, snapshot } from "./ui-b3-projection-fixtures-20260930.js";

type Effect = () => void | (() => void);
let state: KnorviaTaskMeta | null = null;
let deps: readonly unknown[] | undefined;
let pendingEffect: Effect | undefined;
let cleanup: void | (() => void);
const requests: Array<{
  request: unknown;
  resolve: (value: KnorviaSessionStateSnapshot) => void;
  reject: (error: Error) => void;
}> = [];
const serviceArguments: unknown[][] = [];
const service = {
  readSession(request: unknown) {
    return new Promise<KnorviaSessionStateSnapshot>((resolve, reject) =>
      requests.push({ request, resolve, reject }),
    );
  },
};

// Run the real hook with controlled effect/state ports; no DOM renderer is claimed.
mock.module("react", {
  namedExports: {
    useState: () => [
      state,
      (
        update:
          | KnorviaTaskMeta
          | null
          | ((previous: KnorviaTaskMeta | null) => KnorviaTaskMeta | null),
      ) => {
        state = typeof update === "function" ? update(state) : update;
      },
    ],
    useEffect: (effect: Effect, nextDeps: readonly unknown[]) => {
      if (deps === undefined || nextDeps.some((value, index) => !Object.is(value, deps![index]))) {
        deps = nextDeps;
        pendingEffect = effect;
      }
    },
  },
});
mock.module(new URL("../src/hooks/useSessionService.ts", import.meta.url).href, {
  namedExports: {
    useSessionService: (...args: unknown[]) => {
      serviceArguments.push(args);
      return service;
    },
  },
});
const { useActiveTaskSnapshotMeta } = await import("../src/hooks/useActiveTaskSnapshotMeta.js");
after(() => {
  cleanup?.();
  mock.reset();
});

function render(
  taskId: string | null,
  listMeta?: KnorviaTaskMeta | null,
  identity = "identity",
  remote = "remote-session",
) {
  useActiveTaskSnapshotMeta("/synthetic/workspace", taskId, remote, identity, listMeta);
  if (pendingEffect) {
    cleanup?.();
    const effect = pendingEffect;
    pendingEffect = undefined;
    cleanup = effect();
  }
}
function reset() {
  cleanup?.();
  cleanup = undefined;
  state = null;
  deps = undefined;
  pendingEffect = undefined;
  requests.length = 0;
  serviceArguments.length = 0;
}
function current(): KnorviaTaskMeta | null {
  return state;
}
function result(id: string) {
  const value = snapshot();
  value.session.sessionId = id;
  value.session.title = `Title:${id}`;
  return value;
}
async function flush() {
  await Promise.resolve();
  await Promise.resolve();
}

test("B3 hook consumer: task switch clears old fallback and ignores stale successful snapshot", async () => {
  reset();
  render("A");
  assert.deepEqual(requests[0]!.request, {
    workspacePath: "/synthetic/workspace",
    workspaceIdentity: "identity",
    sessionId: "A",
    messageLimit: 1,
  });
  assert.deepEqual(serviceArguments[0], ["/synthetic/workspace", "remote-session", "identity"]);
  requests[0]!.resolve(result("A"));
  await flush();
  assert.equal(current()?.taskId, "A");
  render("A", undefined, "identity-2");
  assert.equal(current()?.taskId, "A");
  render("B", undefined, "identity-2");
  assert.equal(state, null);
  requests[1]!.resolve(result("A"));
  await flush();
  assert.equal(state, null);
  requests[2]!.resolve(result("B"));
  await flush();
  assert.equal(current()?.taskId, "B");
  assert.equal(current()?.title, "Title:B");
});

test("B3 hook consumer: list/no-task/unmount gates cancel late failures and reads", async () => {
  reset();
  render(null);
  assert.equal(requests.length, 0);
  render("A");
  render("B", runtimeValue({ taskId: "B" }));
  assert.equal(requests.length, 1);
  requests[0]!.reject(new Error("cancelled read"));
  await flush();
  assert.equal(state, null);
  render("C");
  cleanup?.();
  cleanup = undefined;
  requests[1]!.resolve(result("C"));
  await flush();
  assert.equal(state, null);
});

test("B3 hook consumer: current read/projection failures clear fallback", async () => {
  reset();
  render("A");
  requests[0]!.resolve(result("A"));
  await flush();
  assert.equal(current()?.taskId, "A");
  render("A", undefined, "changed-identity");
  assert.equal(current()?.taskId, "A");
  requests[1]!.reject(new Error("current read failed"));
  await flush();
  assert.equal(state, null);
  render("B");
  requests[2]!.resolve(runtimeValue(null));
  await flush();
  assert.equal(state, null);
});
