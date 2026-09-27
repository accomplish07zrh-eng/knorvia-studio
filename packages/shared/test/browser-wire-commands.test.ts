// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Knorvia contributors
import assert from "node:assert/strict";
import test from "node:test";
import { z } from "zod";
import * as wire from "../src/browser-use/index.js";
import { commands, playwrightActions, recordingActions } from "./browser-wire-fixtures.js";

for (const [label, schema, fixtures] of [
  ["commands", wire.browserCommandSchema, commands],
  ["Playwright actions", wire.browserPlaywrightActionSchema, playwrightActions],
  ["recording actions", wire.browserRecordingActionSchema, recordingActions],
] as const) {
  test(`${label} accept every minimal public message and reject missing or unknown fields`, () => {
    for (const input of Object.values(fixtures)) {
      assert.deepEqual(schema.parse(input), input);
      assert.equal(schema.safeParse({ ...input, unexpected: 1 }).success, false);
      for (const key of Object.keys(input)) {
        const missing = { ...input } as Record<string, unknown>;
        delete missing[key];
        assert.equal(schema.safeParse(missing).success, false, `${label}: missing ${key}`);
      }
    }
    for (const input of [null, [], "navigate", {}, { method: "constructor" }]) {
      assert.equal(schema.safeParse(input).success, false);
    }
  });
}

test("command enumeration remains ordered and covers the composable runtime union", () => {
  assert.deepEqual(wire.browserCommandMethodSchema.options, Object.keys(commands));
  assert.deepEqual(
    wire.browserCommandSchema.options.map((schema) => schema.shape.method.value).sort(),
    Object.keys(commands).sort(),
  );
  const fill = wire.browserCommandSchema.options.find(
    (item) => item.shape.method.value === "fill",
  )!;
  assert.equal(
    fill.extend({ correlation: z.string() }).safeParse({ ...commands.fill, correlation: "c" })
      .success,
    true,
  );
});

test("ordinary optional tab IDs preserve empty strings but explicit tab actions require IDs", () => {
  for (const method of ["back", "fill", "finalize", "recordingStatus", "close"] as const) {
    assert.equal(
      wire.browserCommandSchema.safeParse({ ...commands[method], tabId: "" }).success,
      true,
    );
  }
  for (const method of ["activateTab", "claimTab", "markHandoff", "markDeliverable"] as const) {
    assert.equal(wire.browserCommandSchema.safeParse({ method, tabId: "" }).success, false);
  }
  assert.deepEqual(wire.browserCommandSchema.parse({ method: "nameSession", name: "  中文  " }), {
    method: "nameSession",
    name: "中文",
  });
  assert.deepEqual(wire.browserCommandSchema.parse({ method: "fill", ref: "  ", value: "  " }), {
    method: "fill",
    ref: "  ",
    value: "  ",
  });
});

test("coordinates are finite, nested fields strict, and host-level target policy is not a parser rule", () => {
  for (const number of [NaN, Infinity, -Infinity]) {
    assert.equal(
      wire.browserCommandSchema.safeParse({ method: "click", x: number }).success,
      false,
    );
  }
  assert.equal(
    wire.browserCommandSchema.safeParse({ method: "click", ref: "e1", x: -1, y: 2.5 }).success,
    true,
  );
  assert.equal(
    wire.browserCommandSchema.safeParse({ method: "drag", from: { x: 0, y: 0, extra: true } })
      .success,
    false,
  );
  for (const path of [[], [{ x: 0 }]]) {
    assert.equal(wire.browserCommandSchema.safeParse({ method: "cuaDrag", path }).success, false);
  }
  assert.equal(
    wire.browserCommandSchema.safeParse({
      method: "screenshot",
      clip: { x: 0, y: 0, width: 0, height: 1 },
    }).success,
    false,
  );
  assert.equal(
    wire.browserCommandSchema.safeParse({
      method: "screenshot",
      fullPage: true,
      clip: { x: 0, y: 0, width: 0.5, height: 1 },
    }).success,
    true,
  );
});

test("Playwright supports every locator operation and keeps strict select option constraints", () => {
  for (const operation of wire.browserPlaywrightLocatorOperationSchema.options) {
    assert.equal(
      wire.browserPlaywrightActionSchema.safeParse({ ...playwrightActions.locator, operation })
        .success,
      true,
    );
  }
  for (const selections of [[{ value: "" }], [{ label: "" }], [{ index: 0 }]]) {
    assert.equal(
      wire.browserPlaywrightActionSchema.safeParse({ ...playwrightActions.locator, selections })
        .success,
      true,
    );
  }
  for (const selections of [[], [{}], [{ index: -1 }], [{ value: "a", extra: true }]]) {
    assert.equal(
      wire.browserPlaywrightActionSchema.safeParse({ ...playwrightActions.locator, selections })
        .success,
      false,
    );
  }
  const result = wire.browserPlaywrightActionSchema.safeParse({
    ...playwrightActions.locator,
    selections: [{}],
  });
  assert.equal(result.success, false);
  if (!result.success)
    assert.deepEqual(
      result.error.issues.map(({ path, message }) => ({ path, message })),
      [{ path: ["selections", 0], message: "Select option requires value, label, or index" }],
    );
});

test("timeout, event and navigation policies distinguish waits from fixed delays", () => {
  assert.equal(
    wire.browserCommandSchema.safeParse({ method: "playwrightWaitForTimeout", timeoutMs: 0 })
      .success,
    true,
  );
  for (const timeoutMs of [0, -1, 1.5]) {
    assert.equal(
      wire.browserPlaywrightActionSchema.safeParse({ ...playwrightActions.waitForEvent, timeoutMs })
        .success,
      false,
    );
  }
  for (const state of ["load", "domcontentloaded", "networkidle"]) {
    assert.equal(
      wire.browserPlaywrightActionSchema.safeParse({ name: "waitForLoadState", state }).success,
      true,
    );
  }
  assert.equal(
    wire.browserPlaywrightActionSchema.safeParse({ name: "waitForLoadState", state: "commit" })
      .success,
    false,
  );
  assert.equal(
    wire.browserPlaywrightActionSchema.safeParse({
      name: "waitForURL",
      url: "*",
      waitUntil: "commit",
    }).success,
    true,
  );
  assert.equal(
    wire.browserPlaywrightActionSchema.safeParse({ name: "waitForEvent", event: "filechooser" })
      .success,
    true,
  );
  assert.equal(
    wire.browserPlaywrightActionSchema.safeParse({ name: "waitForEvent", event: "load" }).success,
    false,
  );
});

test("recording enforces duration, selector, path and payload bounds", () => {
  for (const durationMs of [0, 90_000])
    assert.equal(
      wire.browserRecordingActionSchema.safeParse({ type: "wait", durationMs }).success,
      true,
    );
  for (const durationMs of [-1, 90_001, 0.5])
    assert.equal(
      wire.browserRecordingActionSchema.safeParse({ type: "wait", durationMs }).success,
      false,
    );
  const typed = { type: "type", selector: "  input  ", text: "x".repeat(100_000) };
  assert.deepEqual(wire.browserRecordingActionSchema.parse(typed), { ...typed, selector: "input" });
  assert.equal(
    wire.browserRecordingActionSchema.safeParse({ ...typed, text: typed.text + "x" }).success,
    false,
  );
  for (const selector of [" ", "x".repeat(2001)])
    assert.equal(
      wire.browserRecordingActionSchema.safeParse({ ...typed, selector }).success,
      false,
    );
  for (const length of [1, 2, 200, 201])
    assert.equal(
      wire.browserRecordingActionSchema.safeParse({
        type: "drag",
        path: Array.from({ length }, () => ({ x: 0, y: 0 })),
      }).success,
      length >= 2 && length <= 200,
    );
  for (const times of [0, 1, 100, 101])
    assert.equal(
      wire.browserRecordingActionSchema.safeParse({ type: "wheel", deltaY: 0, times }).success,
      times >= 1 && times <= 100,
    );
  for (const timeoutMs of [0, 1, 30_000, 30_001])
    assert.equal(
      wire.browserRecordingActionSchema.safeParse({ type: "waitFor", selector: "input", timeoutMs })
        .success,
      timeoutMs >= 1 && timeoutMs <= 30_000,
    );
});

test("recording options preserve boundaries and strict nested viewports", () => {
  for (const [key, min, max] of [
    ["fps", 1, 60],
    ["jpegQuality", 1, 100],
    ["maxDurationMs", 1000, 90_000],
    ["settleMs", 0, 90_000],
  ] as const) {
    for (const value of [min - 1, min, max, max + 1, min + 0.5]) {
      assert.equal(
        wire.browserRecordingOptionsSchema.safeParse({ [key]: value }).success,
        Number.isInteger(value) && value >= min && value <= max,
      );
    }
  }
  assert.equal(
    wire.browserRecordingOptionsSchema.safeParse({
      actions: Array(500).fill(recordingActions.click),
    }).success,
    true,
  );
  assert.equal(
    wire.browserRecordingOptionsSchema.safeParse({
      actions: Array(501).fill(recordingActions.click),
    }).success,
    false,
  );
  assert.equal(
    wire.browserRecordingOptionsSchema.safeParse({
      viewport: { width: 320, height: 320, extra: 1 },
    }).success,
    false,
  );
});

test("recording output paths normalize names, reject escapes and preserve diagnostics", () => {
  const parse = (outputPath: string) =>
    wire.browserCommandSchema.safeParse({ ...commands.recordingStatus, outputPath });
  for (const value of [
    "a.webm",
    "folder/clip.WEBM",
    "folder\\clip.webm",
    "folder//clip.webm",
    "C:clip.webm",
    "K:/clip.webm",
    "ſ:/clip.webm",
  ])
    assert.equal(parse(value).success, true, value);
  for (const value of [
    "",
    "/clip.webm",
    "C:\\clip.webm",
    "../clip.webm",
    "a/./clip.webm",
    "a.webm/",
    "clip.mp4",
  ])
    assert.equal(parse(value).success, false, value);
  const trimmed = parse("  clip.webm  ");
  assert.equal(
    trimmed.success && "outputPath" in trimmed.data && trimmed.data.outputPath,
    "clip.webm",
  );
  const invalid = parse("/../clip.mp4");
  assert.equal(invalid.success, false);
  if (!invalid.success)
    assert.deepEqual(
      invalid.error.issues.map(({ message, path }) => ({ message, path })),
      [
        { message: "recording outputPath must be relative to the workspace", path: ["outputPath"] },
        { message: "recording outputPath cannot escape the workspace", path: ["outputPath"] },
        { message: "recording outputPath must end with .webm", path: ["outputPath"] },
      ],
    );
});
