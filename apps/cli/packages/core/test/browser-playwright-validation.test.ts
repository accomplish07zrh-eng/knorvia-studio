// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Knorvia Studio contributors
import assert from "node:assert/strict";
import test from "node:test";
import type { BrowserCommand } from "@knorvia/contracts/browser-control";
import {
  createPlaywrightAPI,
  configurePlaywrightObjectWrapper,
  type WaitForState,
  type TextMatcher,
} from "../src/browser-client/playwright.js";

function fixture() {
  const commands: BrowserCommand[] = [];
  const api = createPlaywrightAPI(async (command) => {
    commands.push(command);
    return { ok: true, elapsedMs: 0, value: { id: "fixture" } };
  });
  return { api, commands };
}

test("missing wait state rejects asynchronously before dispatch", async () => {
  const { api, commands } = fixture();
  for (const state of [undefined, null, "", false, 0, NaN]) {
    const promise = api.locator("item").waitFor({ state: state as WaitForState });
    assert.ok(promise instanceof Promise);
    await assert.rejects(promise, { message: "locator.waitFor requires a state" });
  }
  for (const options of [undefined, null]) {
    const promise = api.locator("item").waitFor(options as unknown as { state: WaitForState });
    assert.ok(promise instanceof Promise);
    await assert.rejects(promise, { message: "locator.waitFor requires a state" });
  }
  assert.equal(commands.length, 0);
});

test("empty attribute names fail synchronously without a command", () => {
  const { api, commands } = fixture();
  for (const name of [undefined, null, "", false, 0]) {
    assert.throws(() => api.locator("item").getAttribute(name as string), {
      message: "locator.getAttribute requires a name",
    });
  }
  assert.equal(commands.length, 0);
});

test("point observations require finite numeric coordinates on both axes", async () => {
  const { api, commands } = fixture();
  for (const value of [undefined, null, "1", NaN, Infinity, -Infinity]) {
    for (const axis of ["x", "y"] as const) {
      const point = { x: 1, y: 2, [axis]: value } as { x: number; y: number };
      assert.throws(() => api.elementInfo(point), {
        message: "playwright.elementInfo requires numeric x and y coordinates",
      });
      const screenshot = api.elementScreenshot(point);
      assert.ok(screenshot instanceof Promise);
      await assert.rejects(screenshot, {
        message: "playwright.elementScreenshot requires numeric x and y coordinates",
      });
    }
  }
  assert.equal(commands.length, 0);
});

test("filter validates text and boolean visibility without dispatch", () => {
  const { api, commands } = fixture();
  const locator = api.locator("item");
  for (const value of [null, "", 0, "yes", /x/]) {
    assert.throws(() => locator.filter({ visible: value as unknown as boolean }), {
      message: "locator.filter visible must be a boolean",
    });
  }
  for (const value of [null, false, 0]) {
    assert.throws(() => locator.filter({ hasText: value as unknown as TextMatcher }), {
      message: "locator.filter requires a string or RegExp",
    });
    assert.throws(() => locator.filter({ hasNotText: value as unknown as TextMatcher }), {
      message: "locator.filter requires a string or RegExp",
    });
  }
  assert.equal(commands.length, 0);
});

test("event wait options cannot replace the operation or event", async () => {
  const { api, commands } = fixture();
  const options = { timeoutMs: 37, name: "evaluate", event: "filechooser", expression: "1" };
  await api.waitForEvent("download", options);
  assert.deepEqual(commands, [
    { method: "playwright", action: { name: "waitForEvent", event: "download", timeoutMs: 37 } },
  ]);
});

test("nested locator applies object policy before and after its filter step", () => {
  const { api } = fixture();
  const seen: string[] = [];
  const wrapped = configurePlaywrightObjectWrapper(api, (value, name) => {
    seen.push(name);
    return value;
  });
  wrapped.locator("row").locator("item");
  assert.deepEqual(seen, [
    "PlaywrightAPI",
    "PlaywrightLocator",
    "PlaywrightLocator",
    "PlaywrightLocator",
  ]);
});
