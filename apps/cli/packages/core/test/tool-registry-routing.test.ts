// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Knorvia Studio contributors
import assert from "node:assert/strict";
import test from "node:test";
import { createToolRegistry, ToolRegistryImpl } from "../src/tool/registry.js";
import { tool } from "./tool-registry-fixture.js";

test("replacement retains canonical order, refreshes aliases, and re-registration follows deletion", (t) => {
  t.mock.method(console, "warn", () => {});
  const registry = createToolRegistry();
  const first = tool("A", ["old"]),
    second = tool("B"),
    replacement = tool("A", ["new", "new"]);
  registry.register(first);
  registry.register(second);
  registry.register(replacement);
  assert.deepEqual(registry.list(), ["A", "B"]);
  assert.equal(registry.get("A"), replacement);
  assert.equal(registry.get("old"), undefined);
  assert.equal(registry.get("new"), replacement);
  registry.unregister("A");
  registry.register(first);
  assert.deepEqual(registry.list(), ["B", "A"]);
  assert.equal(registry.get("new"), undefined);
});

test("canonical identity wins ordinary alias collisions and each conflicting alias is skipped", (t) => {
  const warnings: string[] = [];
  t.mock.method(console, "warn", function (this: Console, message: string) {
    assert.equal(this, console);
    warnings.push(message);
  });
  const registry = createToolRegistry();
  const a = tool("A", ["shared"]),
    shared = tool("shared"),
    b = tool("B", ["B", "A", "shared", "fresh", "fresh"]);
  registry.register(a);
  registry.register(shared);
  registry.register(b);
  assert.equal(registry.get("shared"), shared);
  assert.equal(registry.get("A"), a);
  assert.equal(registry.get("fresh"), b);
  assert.deepEqual(warnings, [
    "Tool shared replaces alias previously targeting A",
    "Tool alias B conflicts with an existing tool or alias; skipping",
    "Tool alias A conflicts with an existing tool or alias; skipping",
    "Tool alias shared conflicts with an existing tool or alias; skipping",
  ]);
});

test("another tool's alias is retained, and only literal true silences its warning", (t) => {
  const warnings: unknown[] = [];
  t.mock.method(console, "warn", (message: string) => {
    warnings.push(message);
  });
  for (const silent of [true, false, 1]) {
    const registry = createToolRegistry(),
      a = tool("A", ["shared"]);
    registry.register(a);
    registry.register(tool("B", ["shared"]), { silentDuplicateWarning: silent as boolean });
    assert.equal(registry.get("shared"), a);
  }
  assert.equal(warnings.length, 2);
});

test("deleting aliases or canonical names preserves the caller's aliases array", () => {
  const registry = createToolRegistry(),
    a = tool("A", ["x", "y"]);
  registry.register(a);
  registry.unregister("x");
  assert.equal(registry.get("A"), a);
  assert.equal(registry.get("y"), a);
  assert.equal(registry.has("x"), false);
  registry.unregister("missing");
  registry.unregister("A");
  assert.deepEqual(registry.list(), []);
  assert.equal(registry.has("y"), false);
  assert.deepEqual(a.aliases, ["x", "y"]);
});

test("empty alias targets retain their reachable overlapping canonical state", () => {
  const registry = createToolRegistry(),
    empty = tool("", ["x"]),
    x = tool("x");
  registry.register(empty);
  registry.register(x);
  assert.deepEqual(registry.list(), ["", "x"]);
  assert.equal(registry.get("x"), empty);
  assert.equal(registry.toContracts()[1].name, "x");
  registry.unregister("x");
  assert.deepEqual(registry.list(), [""]);
  assert.equal(registry.get("x"), empty);
  registry.unregister("");
  assert.equal(registry.get("x"), undefined);
});

test("entry mutation changes metadata but never silently rekeys stored names or aliases", () => {
  const aliases = ["x"];
  const registry = createToolRegistry(),
    a = tool("A", aliases);
  registry.register(a);
  a.metadata.name = "changed";
  a.metadata.description = "updated";
  aliases.push("late");
  assert.equal(registry.get("A"), a);
  assert.equal(registry.getMetadata("x"), a.metadata);
  assert.equal(registry.get("late"), undefined);
  assert.equal(registry.get("changed"), undefined);
  assert.equal(registry.toContracts()[0].name, "changed");
  registry.register(a, { silentDuplicateWarning: true });
  assert.deepEqual(registry.list(), ["A", "changed"]);
  assert.deepEqual(
    registry.toContracts().map((contract) => contract.name),
    ["changed", "changed"],
  );
});

test("warning failure preserves each stage's exact partial registration state", (t) => {
  const marker = { warning: "failure" };
  t.mock.method(console, "warn", () => {
    throw marker;
  });
  const displaced = createToolRegistry(),
    a = tool("A", ["x"]);
  displaced.register(a);
  assert.throws(
    () => displaced.register(tool("x")),
    (error) => error === marker,
  );
  assert.equal(displaced.get("x"), undefined);
  assert.deepEqual(displaced.list(), ["A"]);
  const overwritten = createToolRegistry();
  overwritten.register(a);
  assert.throws(
    () => overwritten.register(tool("A", ["new"])),
    (error) => error === marker,
  );
  assert.equal(overwritten.get("A"), a);
  assert.equal(overwritten.get("x"), a);
  const partial = createToolRegistry(),
    b = tool("B", ["first", "A", "last"]);
  partial.register(a);
  assert.throws(
    () => partial.register(b),
    (error) => error === marker,
  );
  assert.equal(partial.get("B"), b);
  assert.equal(partial.get("first"), b);
  assert.equal(partial.get("last"), undefined);
});

test("has and getMetadata honor a public get override", () => {
  const registry = new ToolRegistryImpl(),
    a = tool("A"),
    reads: string[] = [];
  registry.get = (name) => {
    reads.push(name);
    return name === "A" ? a : undefined;
  };
  assert.equal(registry.has("A"), true);
  assert.equal(registry.getMetadata("A"), a.metadata);
  assert.equal(registry.has("B"), false);
  assert.deepEqual(reads, ["A", "A", "B"]);
});

test("warning method is captured before a message getter replaces it", (t) => {
  const observed: string[] = [];
  t.mock.method(console, "warn", function (this: Console) {
    assert.equal(this, console);
    observed.push("before");
  });
  const registry = createToolRegistry();
  registry.register(tool("A"));
  const replacement = tool("A");
  let reads = 0;
  Object.defineProperty(replacement.metadata, "name", {
    get() {
      if (++reads === 3)
        console.warn = function (this: Console) {
          assert.equal(this, console);
          observed.push("after");
        };
      return "A";
    },
  });
  registry.register(replacement);
  assert.deepEqual(observed, ["before"]);
  assert.equal(reads, 4);
});
