// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Knorvia Studio contributors
import assert from "node:assert/strict";
import test from "node:test";
import { createProviderFixtureTrace } from "./creation-provider-fixture-trace.js";

test("provider fixture trace distinguishes a pending upload from a returned submission", () => {
  let clock = 10;
  const trace = createProviderFixtureTrace(() => clock);
  trace.record("upload:start");
  clock = 15;
  trace.record("upload:return");
  trace.record("upload:start");
  assert.match(trace.describe(), /"upload:start":2,"upload:return":1/);
  assert.match(trace.describe(), /upload:start@0\.0ms → upload:return@5\.0ms/);
  assert.match(trace.describe(), /checkpoint=unobserved/);
  trace.record("submit:start");
  trace.record("submit:return");
  assert.match(trace.describe(), /checkpoint=unobserved/);
  trace.record("history:start");
  assert.match(trace.describe(), /checkpoint=observed via history entry/);
});

test("diagnostics cap event history while retaining all stage counts", () => {
  const trace = createProviderFixtureTrace(() => 0);
  for (let i = 0; i < 50; i++) trace.record("history:start");
  trace.record("download:return");
  const text = trace.describe();
  assert.match(text, /"history:start":50,"download:return":1/);
  assert.equal(text.match(/history:start@/g)?.length, 16);
  assert.doesNotMatch(text, /download:return@/);
});

test("an empty trace states only that no provider boundary has been observed", () => {
  const text = createProviderFixtureTrace(() => 0).describe();
  assert.match(text, /stages=\{\}/);
  assert.match(text, /firstEvents=none/);
  assert.match(text, /checkpoint=unobserved/);
  assert.doesNotMatch(text, /not persisted|failed|URL|bytes|credential/);
});
