// SPDX-License-Identifier: Apache-2.0
// Pending owner contracts; not executed or presented as React integration acceptance.
import assert from "node:assert/strict";
import { test } from "node:test";
import type { IFileWatcherService } from "@knorvia/services";
import type { FileWatchEvent } from "@knorvia/shared";
import { WorkspaceFileTreeWatcherRegistry } from "../src/workspace-file-tree/watcherRegistry.js";

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((accept, fail) => { resolve = accept; reject = fail; });
  return { promise, resolve, reject };
}

function watcherService() {
  const requests: Array<{ path: string; reply: ReturnType<typeof deferred<{ id: string }>> }> = [];
  const unwatched: string[] = [];
  const disposed: string[] = [];
  const listeners = new Map<string, (event: FileWatchEvent) => unknown>();
  let subscribeFailure: unknown;
  let disposeFailure: unknown;
  let unwatchFailure: unknown;
  const service: IFileWatcherService = {
    watch: ({ path }) => {
      const reply = deferred<{ id: string }>();
      requests.push({ path, reply });
      return reply.promise;
    },
    onDynamicChange: (id) => (listener) => {
      if (subscribeFailure) throw subscribeFailure;
      listeners.set(id, listener);
      return { dispose: () => {
        disposed.push(id);
        listeners.delete(id);
        if (disposeFailure) throw disposeFailure;
      } };
    },
    unwatch: async ({ id }) => {
      unwatched.push(id);
      if (unwatchFailure) throw unwatchFailure;
    },
    disposeAll: () => { throw new Error("Registry must release only its own watcher ids"); },
  };
  return { service, requests, unwatched, disposed, listeners,
    failSubscribe: (error: unknown) => { subscribeFailure = error; },
    failDispose: (error: unknown) => { disposeFailure = error; },
    failUnwatch: (error: unknown) => { unwatchFailure = error; },
  };
}

const settle = async () => { await Promise.resolve(); await Promise.resolve(); };

test("stable wanted paths retain registrations and their originally captured event callback", async () => {
  const host = watcherService();
  const registry = new WorkspaceFileTreeWatcherRegistry(() => {});
  const changes: string[] = [];
  registry.reconcile(host.service, new Set(["/w"]), (path) => changes.push(`first:${path}`));
  registry.reconcile(host.service, new Set(["/w"]), (path) => changes.push(`second:${path}`));
  assert.equal(host.requests.length, 1);
  host.requests[0]!.reply.resolve({ id: "root" });
  await settle();
  registry.reconcile(host.service, new Set(["/w"]), (path) => changes.push(`third:${path}`));
  host.listeners.get("root")!({ dirPath: "/w/changed" });
  assert.deepEqual(changes, ["first:/w/changed"]);
  registry.dispose();
  assert.deepEqual(host.disposed, ["root"]);
  assert.deepEqual(host.unwatched, ["root"]);
});

test("collapse releases registered paths and a late collapsed reservation releases its own id", async () => {
  const host = watcherService();
  const registry = new WorkspaceFileTreeWatcherRegistry(() => {});
  registry.reconcile(host.service, new Set(["/w", "/w/child"]), () => {});
  host.requests[0]!.reply.resolve({ id: "root" });
  await settle();
  registry.reconcile(host.service, new Set(), () => {});
  host.requests[1]!.reply.resolve({ id: "child" });
  await settle();
  assert.deepEqual(host.disposed, ["root"]);
  assert.deepEqual(host.unwatched, ["root", "child"]);
  assert.equal(host.listeners.size, 0);
});

test("collapse then re-expand may adopt the same still-pending request in its original epoch", async () => {
  const host = watcherService();
  const registry = new WorkspaceFileTreeWatcherRegistry(() => {});
  registry.reconcile(host.service, new Set(["/w"]), () => {});
  registry.reconcile(host.service, new Set(), () => {});
  registry.reconcile(host.service, new Set(["/w"]), () => {});
  host.requests[0]!.reply.resolve({ id: "reopened" });
  await settle();
  assert.equal(host.requests.length, 1);
  assert.equal(host.listeners.has("reopened"), true);
  registry.dispose();
});

test("old service replies cannot erase a newer same-path reservation", async () => {
  const first = watcherService(), second = watcherService();
  const registry = new WorkspaceFileTreeWatcherRegistry(() => {});
  registry.reconcile(first.service, new Set(["/w"]), () => {});
  registry.reconcile(second.service, new Set(["/w"]), () => {});
  first.requests[0]!.reply.resolve({ id: "late-old" });
  await settle();
  registry.reconcile(second.service, new Set(["/w"]), () => {});
  assert.equal(second.requests.length, 1);
  assert.deepEqual(first.unwatched, ["late-old"]);
  second.requests[0]!.reply.resolve({ id: "new" });
  await settle();
  assert.equal(second.listeners.has("new"), true);
  registry.dispose();
});

test("cleanup invalidates late results and replay starts a separate owned reservation", async () => {
  const host = watcherService();
  const registry = new WorkspaceFileTreeWatcherRegistry(() => {});
  registry.reconcile(host.service, new Set(["/w"]), () => {});
  registry.dispose();
  registry.reconcile(host.service, new Set(["/w"]), () => {});
  host.requests[0]!.reply.resolve({ id: "before-cleanup" });
  host.requests[1]!.reply.resolve({ id: "replay" });
  await settle();
  assert.deepEqual(host.unwatched, ["before-cleanup"]);
  assert.deepEqual([...host.listeners.keys()], ["replay"]);
  registry.dispose();
});

test("watch/subscribe/unwatch failures are reported, and allocated ids are not leaked", async () => {
  const host = watcherService();
  const failures: Array<[string, string, unknown]> = [];
  const registry = new WorkspaceFileTreeWatcherRegistry((...failure) => failures.push(failure));
  registry.reconcile(host.service, new Set(["/w"]), () => {});
  const rejected = new Error("watch failed");
  host.requests[0]!.reply.reject(rejected);
  await settle();
  assert.deepEqual(failures, [["watch", "/w", rejected]]);
  const subscribeError = new Error("subscription failed"), unwatchError = new Error("release failed");
  host.failSubscribe(subscribeError);
  host.failUnwatch(unwatchError);
  registry.reconcile(host.service, new Set(["/w"]), () => {});
  host.requests[1]!.reply.resolve({ id: "allocated" });
  await settle();
  assert.deepEqual(host.unwatched, ["allocated"]);
  assert.equal(failures.some(([operation, , error]) => operation === "watch" && error === subscribeError), true);
  assert.equal(failures.some(([operation, , error]) => operation === "unwatch" && error === unwatchError), true);
});

test("dispose throws the original synchronous error after releasing every owned id", async () => {
  const host = watcherService();
  const registry = new WorkspaceFileTreeWatcherRegistry(() => {});
  registry.reconcile(host.service, new Set(["/w", "/w/child"]), () => {});
  host.requests[0]!.reply.resolve({ id: "root" });
  host.requests[1]!.reply.resolve({ id: "child" });
  await settle();
  const failure = new Error("dispose failed");
  host.failDispose(failure);
  assert.throws(() => registry.dispose(), (error) => error === failure);
  assert.deepEqual(host.disposed, ["root", "child"]);
  assert.deepEqual(host.unwatched, ["root", "child"]);
  registry.dispose();
});
