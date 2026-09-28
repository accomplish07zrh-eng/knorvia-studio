// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Knorvia Studio contributors

import assert from "node:assert/strict";
import test from "node:test";
import { check, environment, errorOf, fresh, rule } from "./fs-fault-injection.fixture.js";

test("fault module exports only the two environment constants and synchronous check", async (t) => {
  environment(t);
  const port = await fresh();
  assert.deepEqual(Object.keys(port).sort(), [
    "KNORVIA_E2E_FS_FAULTS_ALLOW_ENV",
    "KNORVIA_E2E_FS_FAULTS_ENV",
    "maybeThrowStorageFsFault",
  ]);
  assert.equal(port.KNORVIA_E2E_FS_FAULTS_ENV, "KNORVIA_E2E_FS_FAULTS");
  assert.equal(port.KNORVIA_E2E_FS_FAULTS_ALLOW_ENV, "KNORVIA_E2E_FS_FAULTS_ALLOW");
  assert.equal(check(port), undefined);
});

test("fresh module queries have independent matching counters", async (t) => {
  environment(t, JSON.stringify([rule()]), "test");
  const first = await fresh();
  const second = await fresh();
  assert.notEqual(first, second);
  assert.equal(errorOf(() => check(first)).code, "EACCES");
  assert.equal(check(first), undefined);
  assert.equal(errorOf(() => check(second)).code, "EACCES");
  assert.equal(check(second), undefined);
});

test("import remains lazy and configuration is captured at the first check", async (t) => {
  environment(t, "broken-json", "test");
  const port = await fresh();
  process.env.KNORVIA_E2E_FS_FAULTS = JSON.stringify([rule()]);
  assert.equal(errorOf(() => check(port)).knorviaFsFaultId, "fixture-rule");
});

for (const [name, raw, mode, allow] of [
  ["missing value", undefined, "test", "1"],
  ["blank value", " \n\t ", "test", "1"],
  ["missing flags", "broken-json", undefined, undefined],
  ["production", "broken-json", "production", undefined],
  ["uppercase mode", "broken-json", "TEST", undefined],
  ["padded mode", "broken-json", " test ", undefined],
  ["truthy allow word", "broken-json", "production", "true"],
  ["padded allow", "broken-json", "production", " 1 "],
] as const) {
  test(`fault configuration is disabled for ${name}`, async (t) => {
    environment(t, raw, mode, allow);
    const port = await fresh();
    assert.equal(check(port), undefined);
    process.env.KNORVIA_ENV = "test";
    process.env.KNORVIA_E2E_FS_FAULTS_ALLOW = "1";
    process.env.KNORVIA_E2E_FS_FAULTS = JSON.stringify([rule()]);
    assert.equal(check(port), undefined, "successful empty initialization remains cached");
  });
}

for (const [mode, allow] of [
  ["test", undefined],
  ["production", "1"],
  [undefined, "1"],
] as const) {
  test(`exact activation: mode=${mode}, allow=${allow}`, async (t) => {
    environment(t, ` \n${JSON.stringify([rule()])}\t `, mode, allow);
    const port = await fresh();
    assert.equal(errorOf(() => check(port)).code, "EACCES");
  });
}

test("invalid initialization is retried, while a matching throw still caches valid rules", async (t) => {
  environment(t, "{", "test");
  const port = await fresh();
  assert.match(errorOf(() => check(port)).message, /^Invalid KNORVIA_E2E_FS_FAULTS: /);
  process.env.KNORVIA_E2E_FS_FAULTS = JSON.stringify([rule({ maxMatches: 2 })]);
  const first = errorOf(() => check(port));
  process.env.KNORVIA_E2E_FS_FAULTS = "broken-again";
  process.env.KNORVIA_ENV = "production";
  const second = errorOf(() => check(port));
  assert.equal(second.code, "EACCES");
  assert.notEqual(first, second);
  assert.equal(check(port), undefined);
});

test("a valid empty array is cached and never begins parsing later values", async (t) => {
  environment(t, "[]", "test");
  const port = await fresh();
  assert.equal(check(port), undefined);
  process.env.KNORVIA_E2E_FS_FAULTS = "{";
  assert.equal(check(port), undefined);
});
