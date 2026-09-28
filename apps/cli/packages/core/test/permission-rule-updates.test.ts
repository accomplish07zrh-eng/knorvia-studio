// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Knorvia Studio contributors
import assert from "node:assert/strict";
import test from "node:test";
import type { PermissionRuleset, PermissionUpdate } from "@knorvia/contracts";
import { applyPermissionUpdates } from "../src/tool/executor/permission-rules.js";

test("even empty updates copy the root, preserve extensions and reuse untouched arrays", () => {
  const allow = [{ toolName: "Fixture" }];
  const extension = { fixture: true };
  const current: PermissionRuleset = Object.freeze({ extension, allow, mode: "plan" });
  const result = applyPermissionUpdates(current, []);
  assert.notEqual(result, current);
  assert.equal(result.version, 1);
  assert.equal(result.allow, allow);
  assert.equal(result.extension, extension);
  assert.deepEqual(Object.keys(result), ["extension", "allow", "mode", "version"]);
  assert.equal(Object.hasOwn(current, "version"), false);
});

test("per-category merge keeps the first rule reference and original order without mutating input", () => {
  const existing = Object.freeze({ toolName: "Fixture", ruleContent: "first" });
  const duplicate = Object.freeze({ toolName: "Fixture", ruleContent: "first" });
  const next = Object.freeze({ toolName: "Fixture", ruleContent: "next" });
  const deny = [{ toolName: "Fixture" }];
  const current: PermissionRuleset = {
    version: 1,
    allow: [existing, duplicate],
    deny,
    marker: "retained",
  };
  Object.freeze(current.allow);
  Object.freeze(current);
  const updates: PermissionUpdate[] = [
    { type: "addRules", behavior: "allow", rules: [duplicate, next] },
    { type: "addRules", behavior: "ask", rules: [existing] },
  ];
  Object.freeze(updates[0]!.rules);
  Object.freeze(updates);
  const result = applyPermissionUpdates(current, updates);
  assert.deepEqual(result.allow, [existing, next]);
  assert.equal(result.allow?.[0], existing);
  assert.equal(result.allow?.[1], next);
  assert.equal(result.deny, deny);
  assert.equal(result.ask?.[0], existing);
  assert.deepEqual(current.allow, [existing, duplicate]);
  assert.deepEqual(Object.keys(result), ["version", "allow", "deny", "marker", "ask"]);
});

test("absent and empty content share identity while different behavior categories remain separate", () => {
  const first = { toolName: "Fixture" };
  const empty = { toolName: "Fixture", ruleContent: "" };
  const result = applyPermissionUpdates({ allow: [first] }, [
    { type: "addRules", behavior: "allow", rules: [empty] },
    { type: "addRules", behavior: "deny", rules: [empty] },
  ]);
  assert.deepEqual(result.allow, [first]);
  assert.equal(result.allow?.[0], first);
  assert.deepEqual(result.deny, [empty]);
  assert.equal(result.deny?.[0], empty);
});

test("an empty addRules cleans only its category, and unknown updates are ignored", () => {
  const entry = { toolName: "Fixture" };
  const current = { version: 1 as const, allow: [entry, entry], deny: [entry, entry] };
  const result = applyPermissionUpdates(current, [
    { type: "addRules", behavior: "allow", rules: [] },
    { type: "future" } as unknown as PermissionUpdate,
  ]);
  assert.deepEqual(result.allow, [entry]);
  assert.notEqual(result.allow, current.allow);
  assert.equal(result.deny, current.deny);
  assert.equal(current.allow.length, 2);
  assert.equal(result.deny?.length, 2);
});

test("successive updates in the same category retain first-seen order across the whole call", () => {
  const a = { toolName: "A" },
    b = { toolName: "B" },
    aDuplicate = { toolName: "A" },
    c = { toolName: "C" };
  const result = applyPermissionUpdates({}, [
    { type: "addRules", behavior: "allow", rules: [a, b] },
    { type: "addRules", behavior: "allow", rules: [aDuplicate, c] },
  ]);
  assert.deepEqual(result.allow, [a, b, c]);
  assert.equal(result.allow?.[0], a);
});

test("distinct tool/content tuples containing NUL never collide during permission merge", () => {
  const first = { toolName: "Fixture\u0000part", ruleContent: "value" };
  const second = { toolName: "Fixture", ruleContent: "part\u0000value" };
  const result = applyPermissionUpdates({ allow: [first] }, [
    { type: "addRules", behavior: "allow", rules: [second] },
  ]);
  assert.deepEqual(result.allow, [first, second]);
  assert.equal(result.allow?.[1], second);
});

test("previous entries are captured before reading update rules", () => {
  const first = { toolName: "A" };
  const second = { toolName: "B" };
  const previous = [first];
  const result = applyPermissionUpdates({ allow: previous }, [
    {
      type: "addRules",
      behavior: "allow",
      get rules() {
        previous.length = 0;
        return [second];
      },
    },
  ]);
  assert.deepEqual(result.allow, [first, second]);
});

test("reading a rule identity cannot append entries to the current update snapshot", () => {
  const first = {
    get toolName() {
      additions.push({ toolName: "C" });
      return "A";
    },
  };
  const second = { toolName: "B" };
  const additions = [second];
  const result = applyPermissionUpdates({ allow: [first] }, [
    { type: "addRules", behavior: "allow", rules: additions },
  ]);
  assert.equal(result.allow?.length, 2);
  assert.equal(result.allow?.[0], first);
  assert.equal(result.allow?.[1], second);
});

test("an update rules getter cannot redirect its captured behavior category", () => {
  const first = { toolName: "A" };
  const second = { toolName: "B" };
  const update: PermissionUpdate = {
    type: "addRules",
    behavior: "deny",
    get rules() {
      this.behavior = "allow";
      return [second];
    },
  };
  const result = applyPermissionUpdates({ deny: [first] }, [update]);
  assert.deepEqual(result.deny, [first, second]);
  assert.equal(Object.hasOwn(result, "allow"), false);
});
