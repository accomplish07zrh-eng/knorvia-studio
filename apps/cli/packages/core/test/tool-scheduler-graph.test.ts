// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Knorvia Studio contributors
import assert from "node:assert/strict";
import test from "node:test";
import { CoreErrorType, type CoreError } from "@knorvia/contracts";
import { ToolScheduler } from "../src/tool/scheduler.js";
import { dependency, id } from "./tool-scheduler-fixture.js";

function schedulingError(action: () => unknown): CoreError {
  try {
    action();
  } catch (error) {
    return error as CoreError;
  }
  assert.fail("expected planning failure");
}

test("ready ordering is FIFO rather than a smallest-original-index priority queue", () => {
  const input = [
    dependency("r0"),
    dependency("r1"),
    dependency("c1", ["r1"]),
    dependency("c0", ["r0"]),
  ];
  const output = new ToolScheduler().schedule(input);
  assert.deepEqual(
    output.items.map((item) => item.toolCallId),
    ["r0", "r1", "c1", "c0"],
  );
  assert.deepEqual(output.parallelGroups, [
    ["r0", "r1"],
    ["c0", "c1"],
  ]);
  assert.deepEqual(output.executionOrder, ["r0", "r1", "c0", "c1"]);
});

test("levels use deepest dependency, while unsafe members split only their own layer", () => {
  const input = [
    dependency("deep", ["child", "root"]),
    dependency("root"),
    dependency("write", [], { toolName: "Write" }),
    dependency("other"),
    dependency("child", ["root"]),
    dependency("side", ["other"]),
  ];
  assert.deepEqual(new ToolScheduler().schedule(input).parallelGroups, [
    ["root"],
    ["write"],
    ["other"],
    ["child", "side"],
    ["deep"],
  ]);
});

test("concurrency numeric boundaries retain scheduler packing rules", () => {
  const input = Array.from({ length: 7 }, (_, i) => dependency(String(i)));
  for (const [width, sizes] of [
    [1, [1, 1, 1, 1, 1, 1, 1]],
    [2, [2, 2, 2, 1]],
    [2.5, [3, 3, 1]],
    [0, [1, 1, 1, 1, 1, 1, 1]],
    [-2, [1, 1, 1, 1, 1, 1, 1]],
    [0.5, [1, 1, 1, 1, 1, 1, 1]],
    [NaN, [7]],
    [Infinity, [7]],
  ] as const) {
    assert.deepEqual(
      new ToolScheduler({ maxConcurrency: width })
        .schedule(input)
        .parallelGroups.map((group) => group.length),
      sizes,
    );
  }
  assert.deepEqual(
    new ToolScheduler()
      .schedule(Array.from({ length: 12 }, (_, i) => dependency(String(i))))
      .parallelGroups.map((group) => group.length),
    [10, 2],
  );
});

test("missing, duplicated and cyclic dependencies preserve remaining-map order and generic error", () => {
  const cases = [
    [dependency("z", ["missing"]), dependency("a")],
    [dependency("z", ["a", "a"]), dependency("a")],
    [dependency("z", ["y"]), dependency("y", ["z"]), dependency("a")],
  ];
  for (const input of cases) {
    const error = schedulingError(() => new ToolScheduler().schedule(input));
    assert.equal(error.type, CoreErrorType.InvalidStateTransition);
    assert.equal(error.message, "Circular dependency detected in tool scheduling");
    assert.equal(error.recoverable, false);
    assert.deepEqual(error.context, { remaining: input.length === 3 ? ["z", "y"] : ["z"] });
  }
});

test("duplicate IDs preserve every public item but execute the last value at the first map position", () => {
  const input = [dependency("a"), dependency("b"), dependency("a", [], { destructive: true })];
  const output = new ToolScheduler().schedule(input);
  assert.equal(output.items.length, 3);
  assert.equal(output.items[0].canRunParallel, true);
  assert.equal(output.items[2].canRunParallel, false);
  assert.deepEqual(output.parallelGroups, [["a"], ["b"]]);
  assert.deepEqual(output.executionOrder, ["a", "b"]);
});

test("duplicate root eligibility retains the existing accepted-cycle boundary", () => {
  const output = new ToolScheduler().schedule([
    dependency("a"),
    dependency("a", ["b"]),
    dependency("b", ["a"]),
  ]);
  assert.deepEqual(output.parallelGroups, [["a"], ["b"]]);
  assert.equal(output.items.length, 3);
});

test("duplicate self dependency reaches the final same-group error with exact context", () => {
  const error = schedulingError(() =>
    new ToolScheduler().schedule([dependency("a"), dependency("a", ["a"])]),
  );
  assert.equal(error.type, CoreErrorType.InvalidStateTransition);
  assert.equal(error.message, "Circular dependency detected: a depends on a in same group");
  assert.equal(error.recoverable, false);
  assert.deepEqual(error.context, { toolId: "a", dependency: "a", group: ["a"] });
  assert.deepEqual(Object.keys(error.context!), ["toolId", "dependency", "group"]);
});

test("cycle failure does not poison a reused scheduler or retain an earlier call's items", () => {
  const scheduler = new ToolScheduler({ maxConcurrency: 2 });
  schedulingError(() => scheduler.schedule([dependency("bad", ["missing"])]));
  const good = scheduler.schedule([dependency("end", ["start"]), dependency("start")]);
  assert.deepEqual(good.executionOrder, ["start", "end"]);
  assert.deepEqual(scheduler.schedule([]), { items: [], parallelGroups: [], executionOrder: [] });
});

test("own dependency element getters are consulted at each completion, not pre-indexed", () => {
  const child = dependency("c", ["a"]);
  const reads: string[] = [];
  Object.defineProperty(child.dependsOn, 0, {
    get() {
      const value = reads.length === 0 ? "a" : "b";
      reads.push(value);
      return id(value);
    },
  });
  const error = schedulingError(() =>
    new ToolScheduler().schedule([dependency("b"), dependency("a"), child]),
  );
  assert.equal(error.type, CoreErrorType.InvalidStateTransition);
  assert.deepEqual(error.context, { remaining: ["c"] });
  assert.deepEqual(reads, ["a", "b"]);
});

test("a graph with no ready nodes never evaluates throwing dependency elements", () => {
  const child = dependency("c", ["missing"]);
  const marker = { unexpected: "eager dependency read" };
  let reads = 0;
  Object.defineProperty(child.dependsOn, 0, {
    get() {
      reads++;
      throw marker;
    },
  });
  const error = schedulingError(() => new ToolScheduler().schedule([child]));
  assert.equal(error.type, CoreErrorType.InvalidStateTransition);
  assert.deepEqual(error.context, { remaining: ["c"] });
  assert.equal(reads, 0);
});
