// SPDX-License-Identifier: Apache-2.0
// Pending source contracts; not executed or presented as integration acceptance.
import assert from "node:assert/strict";
import { test } from "node:test";
import type { KnorviaTaskMeta } from "@knorvia/shared";
import {
  areStabilizedValuesEquivalent, areTaskListItemsEquivalent,
  buildTaskListItemIdentityKey, stabilizeTaskListItems,
} from "../src/v4/taskListItemStabilization.js";
import { attachTaskListRowActivity, mergeTaskListMembershipFields } from "../src/v4/taskListRowActivity.js";

const task = (taskId: string, workspaceIdentity?: string): KnorviaTaskMeta => ({
  taskId, traceId: `trace-${taskId}`, title: taskId, workspacePath: "/w", workspaceIdentity,
  createdAt: 1, updatedAt: 2, mode: "build",
});

test("structural comparison ignores object key order and absent/undefined but detects values", () => {
  assert.equal(areStabilizedValuesEquivalent({ a: 1, b: [2, { c: 3 }], absent: undefined }, { b: [2, { c: 3 }], a: 1 }), true);
  assert.equal(areStabilizedValuesEquivalent({ a: 1 }, { a: 2 }), false);
  assert.equal(areStabilizedValuesEquivalent({ a: 1 }, { b: 1 }), false);
  assert.equal(areStabilizedValuesEquivalent(NaN, NaN), false);
  assert.equal(areStabilizedValuesEquivalent(-0, 0), true);
  assert.equal(areStabilizedValuesEquivalent(null, {}), false);
});

test("array comparison preserves the left sparse-array rule and ignores extra properties", () => {
  const sparse = new Array<unknown>(2);
  assert.equal(areStabilizedValuesEquivalent(sparse, ["left holes", "are skipped"]), true);
  assert.equal(areStabilizedValuesEquivalent([1], []), false);
  assert.equal(areStabilizedValuesEquivalent([1], { 0: 1, length: 1 }), false);
  const left = Object.assign([1], { label: "left" });
  const right = Object.assign([1], { label: "right" });
  assert.equal(areStabilizedValuesEquivalent(left, right), true);
});

test("object comparison preserves enumerable key counts, inherited value reads and symbol exclusion", () => {
  const inherited = Object.assign(Object.create({ a: 1 }) as Record<string, unknown>, { b: 1 });
  assert.equal(areStabilizedValuesEquivalent({ a: 1 }, inherited), true);
  assert.equal(areStabilizedValuesEquivalent({ [Symbol("left")]: 1 }, { [Symbol("right")]: 2 }), true);
  assert.equal(areStabilizedValuesEquivalent({ optional: undefined }, {}), true);
});

test("field getters follow enumeration then depth-first comparison and stop before later fields", () => {
  const reads: string[] = [];
  const left = {
    get first() { reads.push("left:first"); return { value: 1 }; },
    get second() { reads.push("left:second"); return 2; },
  };
  const right = {
    get first() { reads.push("right:first"); return { value: 0 }; },
    get second() { reads.push("right:second"); return 2; },
  };
  assert.equal(areStabilizedValuesEquivalent(left, right), false);
  assert.deepEqual(reads, ["left:first", "left:second", "right:first", "right:second", "left:first", "right:first"]);
});

test("deep acyclic values compare without growing the JavaScript call stack", () => {
  let left: unknown = "leaf", right: unknown = "leaf";
  for (let depth = 0; depth < 12000; depth += 1) {
    left = { child: left };
    right = { child: right };
  }
  assert.equal(areStabilizedValuesEquivalent(left, right), true);
});

test("independent cyclic values still reject while a shared reference compares equal", () => {
  const left: { self?: unknown } = {}, right: { self?: unknown } = {};
  left.self = left;
  right.self = right;
  assert.equal(areStabilizedValuesEquivalent(left, left), true);
  assert.throws(() => areStabilizedValuesEquivalent(left, right), RangeError);
});

test("shared subtrees are compared again after the preceding field completes", () => {
  const leftChild = { value: 1 }, rightChild = { value: 1 };
  assert.equal(areStabilizedValuesEquivalent({ a: leftChild, b: leftChild }, { a: rightChild, b: rightChild }), true);
});

test("the identity key keeps trim identity/path fallback and the existing separator", () => {
  assert.equal(buildTaskListItemIdentityKey(task("a")), "/w::a");
  assert.equal(buildTaskListItemIdentityKey(task("a", "  host-one  ")), "host-one::a");
  assert.equal(buildTaskListItemIdentityKey(task("a", "  ")), "/w::a");
  assert.notEqual(buildTaskListItemIdentityKey(task("a", "host-one")), buildTaskListItemIdentityKey(task("a", "host-two")));
});

test("equivalent ordered metadata reuses the old item and entire array references", () => {
  const a = task("a"), b = task("b");
  const previous = [a, b];
  const next = [{ ...a }, { ...b }];
  assert.equal(areTaskListItemsEquivalent(a, next[0]!), true);
  assert.equal(stabilizeTaskListItems(previous, next), previous);
  assert.deepEqual(next, [{ ...a }, { ...b }]);
});

test("reordering reuses items but returns a new array; changed metadata stays new", () => {
  const a = task("a"), b = task("b");
  const previous = [a, b];
  const reordered = stabilizeTaskListItems(previous, [{ ...b }, { ...a }]);
  assert.notEqual(reordered, previous);
  assert.equal(reordered[0], b);
  assert.equal(reordered[1], a);
  const changed = { ...b, title: "Changed" };
  const updated = stabilizeTaskListItems(previous, [{ ...a }, changed]);
  assert.equal(updated[0], a);
  assert.equal(updated[1], changed);
  assert.deepEqual(previous, [a, b]);
});

test("duplicates use the final previous item and a same-path remote item stays isolated", () => {
  const first = task("a"), last = { ...first }, remote = task("a", "remote-fixture");
  const previous = [first, last, remote];
  const result = stabilizeTaskListItems(previous, [{ ...first }, { ...remote }]);
  assert.equal(result[0], last);
  assert.equal(result[1], remote);
});

test("empty previous returns next and removing all tasks returns a new empty projection", () => {
  const next = [task("a")];
  assert.equal(stabilizeTaskListItems([], next), next);
  const empty: KnorviaTaskMeta[] = [];
  assert.notEqual(stabilizeTaskListItems(next, empty), empty);
  assert.deepEqual(stabilizeTaskListItems(next, empty), []);
});

test("real activity/membership projection retains the original list reference when only membership timestamps differ", () => {
  const meta = task("a");
  const active = attachTaskListRowActivity(meta, { phase: "running", lastActivityAt: meta.updatedAt, hasBackgroundWork: false });
  const previous = [active];
  const merged = mergeTaskListMembershipFields(active, { ...meta, updatedAt: 900, status: "running" });
  assert.equal(stabilizeTaskListItems<KnorviaTaskMeta>(previous, [merged]), previous);
});
