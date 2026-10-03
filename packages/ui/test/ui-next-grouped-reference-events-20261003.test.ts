// SPDX-License-Identifier: Apache-2.0
// Pending reference/lease contracts; not run or claimed as hook/React acceptance.
import assert from "node:assert/strict";
import { test } from "node:test";
import type { IKnorviaTaskService, KnorviaGroupedTaskView, KnorviaGroupedTaskViewNode } from "@knorvia/services";
import type { KnorviaTaskMeta } from "@knorvia/shared";
import { stabilizeGroupedTaskView } from "../src/workspace-grouped-tasks/groupedViewReferenceProjection.js";
import { subscribeGroupedTaskCreationEvents } from "../src/workspace-grouped-tasks/groupedCreatedTaskEventLease.js";

const task = (taskId: string, workspaceIdentity?: string): KnorviaTaskMeta => ({ taskId, title: taskId,
  traceId: taskId, mode: "build", createdAt: 1, updatedAt: 1, workspacePath: "/fixture", workspaceIdentity });
const root = (task: KnorviaTaskMeta, sortOrder?: number): KnorviaGroupedTaskViewNode => ({ type: "task", task, sortOrder });
const group = (tasks: KnorviaTaskMeta[]): KnorviaGroupedTaskViewNode => ({ type: "group", sortOrder: 1000,
  group: { id: "g", title: "Group", color: "gray", createdAt: 1, updatedAt: 2 }, tasks });

test("empty previous returns the exact next; equivalent ordered nodes return the exact previous", () => {
  const a = task("a"), previous: KnorviaGroupedTaskView = { nodes: [root(a), group([a])] };
  const next: KnorviaGroupedTaskView = { nodes: [root(a), { ...previous.nodes[1]!, group: { updatedAt: 2, createdAt: 1, color: "gray", title: "Group", id: "g" } } as KnorviaGroupedTaskViewNode] };
  assert.equal(stabilizeGroupedTaskView({ nodes: [] }, next), next);
  assert.equal(stabilizeGroupedTaskView(previous, next), previous);
});

test("a changed group member or sortOrder stays new while unaffected references survive reordering", () => {
  const a = task("a"), b = task("b"), first = root(a), grouped = group([b]);
  const previous: KnorviaGroupedTaskView = { nodes: [first, grouped] };
  const changedGroup = group([{ ...b }]), next = { nodes: [changedGroup, root(a)] };
  const result = stabilizeGroupedTaskView(previous, next);
  assert.notEqual(result, previous);
  assert.equal(result.nodes[0], changedGroup);
  assert.equal(result.nodes[1], first);
  const changedOrder = root(a, 100);
  assert.equal(stabilizeGroupedTaskView(previous, { nodes: [changedOrder, group([b])] }).nodes[0], changedOrder);
  assert.equal(stabilizeGroupedTaskView(previous, { nodes: [root(a), group([b])] }), previous);
});

test("last previous identity owns duplicate reuse, including repeated new positions and remote isolation", () => {
  const a = task("a"), duplicate = { ...a }, first = root(a), last = root(duplicate);
  const previous: KnorviaGroupedTaskView = { nodes: [first, last] };
  const requestedFirst = root(a), result = stabilizeGroupedTaskView(previous, { nodes: [requestedFirst, root(duplicate)] });
  assert.equal(result.nodes[0], requestedFirst);
  assert.equal(result.nodes[1], last);
  const repeated = stabilizeGroupedTaskView(previous, { nodes: [root(duplicate), root(duplicate)] });
  assert.equal(repeated.nodes[0], last);
  assert.equal(repeated.nodes[1], last);
  const remote = root(task("a", "remote-fixture"));
  assert.equal(stabilizeGroupedTaskView(previous, { nodes: [remote] }).nodes[0], remote);
});

test("NaN sortOrder never produces a whole-view bailout even for identical node objects", () => {
  const node = root(task("a"), NaN), previous: KnorviaGroupedTaskView = { nodes: [node] };
  const result = stabilizeGroupedTaskView(previous, previous);
  assert.notEqual(result, previous);
  assert.equal(result.nodes[0], node);
});

type Service = Pick<IKnorviaTaskService, "onDynamicWorkspaceEvent">;
type Listener = Parameters<ReturnType<Service["onDynamicWorkspaceEvent"]>>[0];
function subscriptionFixture() {
  const listeners: Listener[] = [], journal: string[] = [];
  let failInstall = -1, failDispose = -1;
  const installationFailure = new Error("subscription failed"), disposalFailure = new Error("disposal failed");
  const service: Service = { onDynamicWorkspaceEvent: (scope) => (listener) => {
    const index = listeners.length;
    journal.push(`install:${scope.workspacePath}`);
    if (index === failInstall) throw installationFailure;
    listeners.push(listener);
    return { dispose: () => { journal.push(`dispose:${index}`); if (index === failDispose) throw disposalFailure; } };
  } };
  return { service, journal, installationFailure, disposalFailure,
    event: (index: number, event: unknown) => listeners[index]!(event as Parameters<Listener>[0]),
    failInstall: (index: number) => { failInstall = index; }, failDispose: (index: number) => { failDispose = index; },
    ports: { invalidate: () => { journal.push("invalidate"); }, refresh: () => { journal.push("refresh"); } },
  };
}
const scopes = [{ workspacePath: "/a" }, { workspacePath: "/b" }, { workspacePath: "/c" }];
const created = { type: "workspace_task_list_changed", reason: "task_created" };

test("task-created invalidates before refreshing; other events do not disturb the original cache", () => {
  const h = subscriptionFixture(), cleanup = subscribeGroupedTaskCreationEvents(h.service, scopes, h.ports);
  assert.deepEqual(h.journal, ["install:/a", "install:/b", "install:/c"]);
  h.event(0, { type: "workspace_task_list_changed", reason: "task_updated" });
  h.event(1, { type: "workspace_title_changed", reason: "task_created" });
  h.event(2, created);
  assert.deepEqual(h.journal.slice(3), ["invalidate", "refresh"]);
  cleanup();
  const count = h.journal.length;
  h.event(0, created);
  cleanup();
  assert.equal(h.journal.length, count);
});

test("partial install tears down every obtained lease and revokes late callbacks despite cleanup errors", () => {
  const h = subscriptionFixture();
  h.failInstall(2);
  h.failDispose(0);
  assert.throws(() => subscribeGroupedTaskCreationEvents(h.service, scopes, h.ports), (error) => error === h.installationFailure);
  assert.deepEqual(h.journal, ["install:/a", "install:/b", "install:/c", "dispose:0", "dispose:1"]);
  const count = h.journal.length;
  h.event(0, created);
  assert.equal(h.journal.length, count);
});

test("cleanup rethrows its first error after releasing remaining leases and does not disturb a newer scope", () => {
  const h = subscriptionFixture(), cleanup = subscribeGroupedTaskCreationEvents(h.service, scopes, h.ports);
  h.failDispose(0);
  assert.throws(cleanup, (error) => error === h.disposalFailure);
  assert.deepEqual(h.journal.slice(-3), ["dispose:0", "dispose:1", "dispose:2"]);
  const newer = subscriptionFixture(), stop = subscribeGroupedTaskCreationEvents(newer.service, scopes.slice(0, 1), newer.ports);
  cleanup();
  h.event(0, created);
  newer.event(0, created);
  assert.deepEqual(newer.journal, ["install:/a", "invalidate", "refresh"]);
  stop();
});
