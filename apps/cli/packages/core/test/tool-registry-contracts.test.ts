// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Knorvia Studio contributors
import assert from "node:assert/strict";
import test from "node:test";
import { createToolRegistry } from "../src/tool/registry.js";
import { tool } from "./tool-registry-fixture.js";

test("model contracts keep exact field order, reference payloads and conditional strict presence", () => {
  const registry = createToolRegistry(),
    entry = tool("A");
  registry.register(entry);
  const contract = registry.toContracts()[0];
  const fields = [
    "name",
    "description",
    "capability",
    "executionMode",
    "providerNative",
    "inputSchema",
    "outputSchema",
    "readOnly",
    "destructive",
    "concurrentSafe",
    "requiresUserInteraction",
    "maxOutputBytes",
    "timeoutMs",
    "needsApproval",
    "sideEffectScope",
    "permission",
    "resultBudget",
    "execute",
  ];
  assert.deepEqual(Object.keys(contract), fields);
  assert.equal(contract.inputSchema, entry.inputSchema);
  assert.equal(contract.outputSchema, entry.outputSchema);
  assert.equal(contract.permission, entry.permission);
  assert.equal(contract.resultBudget, entry.resultBudget);
  assert.equal(contract.execute, undefined);
  entry.strict = true;
  assert.deepEqual(Object.keys(registry.toContracts()[0]), [
    ...fields.slice(0, 7),
    "strict",
    ...fields.slice(7),
  ]);
  assert.equal(registry.toContracts()[0].strict, true);
});

test("strict reads twice when present while interaction override remains lazy", () => {
  const registry = createToolRegistry(),
    entry = tool("A");
  let strictReads = 0;
  Object.defineProperty(entry, "strict", {
    get() {
      return strictReads++ === 0 ? false : undefined;
    },
  });
  entry.requiresUserInteraction = false;
  Object.defineProperty(entry.metadata, "requiresUserInteraction", {
    get() {
      assert.fail("unexpected metadata fallback");
    },
  });
  registry.register(entry);
  const contract = registry.toContracts()[0];
  assert.equal(strictReads, 2);
  assert.equal(Object.hasOwn(contract, "strict"), true);
  assert.equal(contract.strict, undefined);
  assert.equal(contract.requiresUserInteraction, false);
});

test("only strict false hides a provider contract; hidden tools remain routable", () => {
  const registry = createToolRegistry();
  const hidden = tool("hidden", ["secret-alias"]);
  hidden.metadata.providerVisible = false;
  const visible = tool("visible");
  registry.register(hidden);
  registry.register(visible);
  assert.equal(registry.get("secret-alias"), hidden);
  assert.deepEqual(
    registry.toContracts().map((contract) => contract.name),
    ["visible"],
  );
  hidden.metadata.providerVisible = undefined;
  assert.deepEqual(
    registry.toContracts().map((contract) => contract.name),
    ["hidden", "visible"],
  );
});

test("visibility completes for the captured membership before any contract projection", () => {
  const registry = createToolRegistry(),
    a = tool("A"),
    b = tool("B"),
    c = tool("C");
  const timeline: string[] = [];
  for (const entry of [a, b]) {
    Object.defineProperty(entry.metadata, "providerVisible", {
      get() {
        timeline.push(`visible:${entry.metadata.name}`);
        return true;
      },
    });
    Object.defineProperty(entry.metadata, "description", {
      get() {
        timeline.push(`description:${entry.metadata.name}`);
        return "fixture";
      },
    });
  }
  Object.defineProperty(a, "capability", {
    get() {
      registry.register(c, { silentDuplicateWarning: true });
      return "fixture";
    },
  });
  registry.register(a);
  registry.register(b);
  assert.deepEqual(
    registry.toContracts().map((contract) => contract.name),
    ["A", "B"],
  );
  assert.deepEqual(timeline, ["visible:A", "visible:B", "description:A", "description:B"]);
  assert.deepEqual(
    registry.toContracts().map((contract) => contract.name),
    ["A", "B", "C"],
  );
});

test("provider instructions trim individual lines, skip holes and preserve duplicates and inner newlines", () => {
  const registry = createToolRegistry(),
    entry = tool("A");
  entry.metadata.description = "  title  ";
  const hints: string[] = [];
  hints[1] = " one ";
  hints[2] = "";
  hints[3] = "   ";
  hints[4] = "one";
  hints[5] = " line1\nline2 ";
  entry.metadata.modelInstructions = hints;
  registry.register(entry);
  assert.equal(
    registry.toContracts()[0].description,
    "  title  \n\nUsage:\n- one\n- one\n- line1\nline2",
  );
  entry.metadata.description = "";
  assert.equal(registry.toContracts()[0].description, "Usage:\n- one\n- one\n- line1\nline2");
  entry.metadata.modelInstructions = [" "];
  assert.equal(registry.toContracts()[0].description, "");
  entry.metadata.description = undefined;
  assert.equal(registry.toContracts()[0].description, undefined);
});

test("projection getter errors propagate without mutating registration", () => {
  const registry = createToolRegistry(),
    entry = tool("A"),
    failure = { projection: "fixture" };
  Object.defineProperty(entry.metadata, "description", {
    get() {
      throw failure;
    },
  });
  registry.register(entry);
  assert.throws(
    () => registry.toContracts(),
    (error) => error === failure,
  );
  assert.deepEqual(registry.list(), ["A"]);
  assert.equal(registry.get("A"), entry);
});
