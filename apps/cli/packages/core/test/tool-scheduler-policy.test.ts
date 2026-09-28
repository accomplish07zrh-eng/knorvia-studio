// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Knorvia Studio contributors
import assert from "node:assert/strict";
import test from "node:test";
import {
  READ_ONLY_TOOLS,
  ToolScheduler,
  defaultToolScheduler,
  type ToolDependency,
} from "../src/tool/scheduler.js";
import { scheduleTools } from "../src/runtime/methods/tools.js";
import type { AgentRuntimeInternal } from "../src/runtime/internal.js";
import { dependency, id } from "./tool-scheduler-fixture.js";

test("scheduler keeps public item field order, own undefined values and dependency identity", () => {
  const input = dependency("first");
  const output = new ToolScheduler().schedule([input]);
  assert.deepEqual(Object.keys(output), ["items", "parallelGroups", "executionOrder"]);
  assert.deepEqual(Object.keys(output.items[0]), [
    "toolCallId",
    "toolName",
    "dependencies",
    "canRunParallel",
    "readOnly",
    "destructive",
    "concurrentSafe",
    "sideEffectScope",
  ]);
  assert.notEqual(output.items[0], input);
  assert.equal(output.items[0].dependencies, input.dependsOn);
  assert.equal(output.items[0].canRunParallel, true);
  assert.equal(output.items[0].readOnly, undefined);
  assert.deepEqual(output.parallelGroups, [["first"]]);
  assert.deepEqual(new ToolScheduler().schedule([]), {
    items: [],
    parallelGroups: [],
    executionOrder: [],
  });
});

test("parallel safety honors destructive and explicit concurrency before readonly and scope", () => {
  const cases: [Partial<ToolDependency>, boolean, boolean | undefined][] = [
    [{}, true, undefined],
    [{ toolName: "" }, true, undefined],
    [{ toolName: " " }, false, false],
    [{ toolName: "Read" }, true, true],
    [{ toolName: "Fixture" }, false, false],
    [{ readOnly: false }, false, false],
    [{ sideEffectScope: "none" }, true, undefined],
    [{ toolName: "Read", readOnly: false, sideEffectScope: "none" }, true, false],
    [
      { destructive: true, readOnly: true, concurrentSafe: true, sideEffectScope: "none" },
      false,
      true,
    ],
    [{ readOnly: true, concurrentSafe: false }, false, true],
    [{ concurrentSafe: true, sideEffectScope: "system" }, true, undefined],
    [{ concurrentSafe: false, sideEffectScope: "none" }, false, undefined],
    [{ readOnly: true, sideEffectScope: "workspace" }, true, true],
  ];
  for (const [fields, parallel, readonly] of cases) {
    const item = new ToolScheduler().schedule([dependency("item", [], fields)]).items[0];
    assert.equal(item.canRunParallel, parallel, JSON.stringify(fields));
    assert.equal(item.readOnly, readonly);
  }
});

test("mutable caller Set and default Set references remain effective after construction", () => {
  const custom = new Set<string>();
  const scheduler = new ToolScheduler({ readOnlyTools: custom });
  const input = [dependency("x", [], { toolName: "Fixture" })];
  assert.equal(scheduler.schedule(input).items[0].canRunParallel, false);
  custom.add("Fixture");
  assert.equal(scheduler.schedule(input).items[0].canRunParallel, true);
  custom.delete("Fixture");
  assert.equal(scheduler.schedule(input).items[0].canRunParallel, false);
  const name = "FixtureMutableReadonly";
  const defaultInstance = new ToolScheduler();
  try {
    READ_ONLY_TOOLS.add(name);
    for (const instance of [defaultInstance, defaultToolScheduler]) {
      assert.equal(
        instance.schedule([dependency("x", [], { toolName: name })]).items[0].canRunParallel,
        true,
      );
    }
  } finally {
    READ_ONLY_TOOLS.delete(name);
  }
});

test("Set queries keep their receiver and occur before destructive decision and public projection", () => {
  const set = new Set<string>();
  const queried: string[] = [];
  set.has = function (this: Set<string>, name) {
    assert.equal(this, set);
    queried.push(name);
    return true;
  };
  const output = new ToolScheduler({ readOnlyTools: set }).schedule([
    dependency("x", [], { toolName: "Fixture", destructive: true }),
  ]);
  assert.deepEqual(queried, ["Fixture", "Fixture"]);
  assert.equal(output.items[0].canRunParallel, false);
  assert.equal(output.items[0].readOnly, true);
});

test("readonly getter is separately observed during presence, classification and public projection", () => {
  const values = [false, true, false];
  const input = dependency("x");
  Object.defineProperty(input, "readOnly", { get: () => values.shift() });
  const item = new ToolScheduler().schedule([input]).items[0];
  assert.equal(item.canRunParallel, true);
  assert.equal(item.readOnly, false);
  assert.deepEqual(values, []);
});

test("concurrency getter keeps its two strict comparisons before public metadata is read", () => {
  const values = [undefined, false, true];
  const input = dependency("x", [], { readOnly: true });
  Object.defineProperty(input, "concurrentSafe", { get: () => values.shift() });
  const item = new ToolScheduler().schedule([input]).items[0];
  assert.equal(item.canRunParallel, false);
  assert.equal(item.concurrentSafe, true);
  assert.deepEqual(values, []);
});

test("constructor reads configuration once; getter exceptions remain synchronous and reuse is safe", () => {
  const reads: string[] = [];
  let width = 2;
  const scheduler = new ToolScheduler({
    get maxConcurrency() {
      reads.push("width");
      return width;
    },
    get readOnlyTools() {
      reads.push("set");
      return new Set<string>();
    },
  });
  width = 10;
  assert.deepEqual(reads, ["width", "set"]);
  const failure = { failed: "metadata" };
  const broken = dependency("x");
  Object.defineProperty(broken, "toolName", {
    get() {
      throw failure;
    },
  });
  assert.throws(
    () => scheduler.schedule([broken]),
    (error) => error === failure,
  );
  assert.deepEqual(
    scheduler.schedule([dependency("a"), dependency("b"), dependency("c")]).parallelGroups,
    [["a", "b"], ["c"]],
  );
  assert.deepEqual(reads, ["width", "set"]);
});

test("runtime registry permission scope governs readonly metadata before planning", async () => {
  const entries = new Map([
    [
      "workspace",
      {
        metadata: { readOnly: true, sideEffectScope: "none" },
        permission: { sideEffectScope: "workspace" },
      },
    ],
    [
      "none",
      {
        metadata: { readOnly: true, sideEffectScope: "workspace" },
        permission: { sideEffectScope: "none" },
      },
    ],
    ["fallback", { metadata: { readOnly: true, sideEffectScope: "none" } }],
  ]);
  const runtime = {
    registry: { get: (name: string) => entries.get(name) },
    toolScheduler: new ToolScheduler(),
  } as unknown as AgentRuntimeInternal;
  const plan = await scheduleTools.call(
    runtime,
    [...entries.keys()].map((name) => ({ id: id(name), name, input: {} })),
  );
  assert.deepEqual(
    plan.items.map((item) => [item.readOnly, item.sideEffectScope, item.canRunParallel]),
    [
      [false, "workspace", false],
      [true, "none", true],
      [true, "none", true],
    ],
  );
  assert.deepEqual(plan.parallelGroups, [["workspace"], ["none", "fallback"]]);
});
