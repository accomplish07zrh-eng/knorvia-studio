// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Knorvia Studio contributors
import assert from "node:assert/strict";
import test from "node:test";
import type { BrowserCommand, BrowserCommandResult } from "@knorvia/contracts/browser-control";
import { createPlaywrightAPI } from "../src/browser-client/playwright.js";
import { BrowserCommandError } from "../src/browser-client/result.js";

function fixture(value: unknown = "fixture") {
  const commands: BrowserCommand[] = [];
  const result: BrowserCommandResult = {
    ok: true,
    elapsedMs: 1,
    value,
    image: { base64: "AAEC", mimeType: "image/png" },
  };
  const api = createPlaywrightAPI(async (command) => {
    commands.push(command);
    return result;
  });
  return { api, result, commands, command: () => JSON.parse(JSON.stringify(commands.at(-1))) };
}

test("locator changes preserve operation mapping and every option", async () => {
  const f = fixture(),
    locator = f.api.locator("#fixture");
  const cases: Array<[() => Promise<unknown>, object]> = [
    [
      () => locator.click({ button: "right", force: true, modifiers: ["Shift"], timeoutMs: 37 }),
      { operation: "click", button: "right", force: true, modifiers: ["Shift"], timeoutMs: 37 },
    ],
    [() => locator.dblclick(), { operation: "dblclick" }],
    [
      () => locator.fill("text", { timeoutMs: 37 }),
      { operation: "fill", value: "text", replace: true, timeoutMs: 37 },
    ],
    [() => locator.type("text"), { operation: "fill", value: "text", replace: false }],
    [() => locator.press("Enter"), { operation: "press", value: "Enter" }],
    [
      () => locator.check({ force: false, timeoutMs: 37 }),
      { operation: "setChecked", checked: true, force: false, timeoutMs: 37 },
    ],
    [() => locator.uncheck(), { operation: "setChecked", checked: false }],
    [
      () => locator.setChecked(false, { force: true }),
      { operation: "setChecked", checked: false, force: true },
    ],
    [
      () => locator.waitFor({ state: "visible", timeoutMs: 37 }),
      { operation: "waitFor", state: "visible", timeoutMs: 37 },
    ],
    [() => locator.downloadMedia({ timeoutMs: 37 }), { operation: "downloadMedia", timeoutMs: 37 }],
  ];
  for (const [invoke, expected] of cases) {
    assert.equal(await invoke(), undefined);
    assert.deepEqual(f.command(), {
      method: "playwright",
      action: { name: "locator", selector: "#fixture", ...expected },
    });
  }
});

test("select options convert strings and retain structured selections", async () => {
  const f = fixture();
  await f.api
    .locator("select")
    .selectOption(["first", { label: "Second" }, { index: 2 }], { timeoutMs: 37 });
  assert.deepEqual(f.command(), {
    method: "playwright",
    action: {
      name: "locator",
      selector: "select",
      operation: "selectOption",
      selections: [{ value: "first" }, { label: "Second" }, { index: 2 }],
      timeoutMs: 37,
    },
  });
});

test("read operations pass payloads through without truthiness conversion", async () => {
  const f = fixture(),
    locator = f.api.locator("x");
  for (const value of [undefined, null, false, 0, "", ["a"], { fixture: true }]) {
    f.result.value = value;
    assert.equal(await locator.count(), value);
    assert.equal(await locator.textContent(), value);
    assert.equal(await locator.innerText(), value);
    assert.equal(await locator.isVisible(), value);
    assert.equal(await locator.isEnabled(), value);
    assert.equal(await locator.allTextContents(), value);
    assert.equal(await locator.getAttribute("title", { timeoutMs: 37 }), value);
  }
  assert.deepEqual(f.command(), {
    method: "playwright",
    action: {
      name: "locator",
      selector: "x",
      operation: "getAttribute",
      attribute: "title",
      timeoutMs: 37,
    },
  });
});

test("page and element evaluations preserve expression kind, arguments and timeout", async () => {
  const f = fixture({ answer: 42 });
  const callback = (value: { answer: number }) => value.answer;
  assert.equal(await f.api.evaluate(callback, { answer: 42 }, { timeoutMs: 37 }), f.result.value);
  assert.deepEqual(f.command(), {
    method: "playwright",
    action: {
      name: "evaluate",
      expression: callback.toString(),
      expressionKind: "function",
      arg: { answer: 42 },
      timeoutMs: 37,
    },
  });
  assert.equal(
    await f.api.locator("x").evaluate("element => element.tagName", { fixture: 1 }),
    f.result.value,
  );
  assert.deepEqual(f.command(), {
    method: "playwright",
    action: {
      name: "locator",
      selector: "x",
      operation: "evaluate",
      expression: "element => element.tagName",
      expressionKind: "string",
      arg: { fixture: 1 },
    },
  });
});

test("page observations return values and screenshot bytes", async () => {
  const f = fixture("snapshot");
  assert.equal(await f.api.domSnapshot(), "snapshot");
  assert.deepEqual(f.command(), { method: "playwright", action: { name: "domSnapshot" } });
  await f.api.elementInfo({ x: 1, y: 2, includeNonInteractable: true });
  assert.deepEqual(f.command(), {
    method: "playwright",
    action: { name: "elementInfo", x: 1, y: 2, includeNonInteractable: true },
  });
  const bytes = await f.api.elementScreenshot({ x: 1, y: 2 });
  assert.equal(Object.getPrototypeOf(bytes), Uint8Array.prototype);
  assert.deepEqual([...bytes], [0, 1, 2]);
  delete f.result.image;
  await assert.rejects(f.api.elementScreenshot({ x: 1, y: 2 }), {
    name: "Error",
    message: "Browser result missing image",
  });
});

test("operation failures add context and keep the original command error as cause", async () => {
  const f = fixture();
  f.result.ok = false;
  f.result.error = { code: "execution_error", message: "fixture failed" };
  const locator = f.api.locator("#x");
  const cases: Array<[() => Promise<unknown>, string]> = [
    [() => locator.click(), "waiting on click for selector #x"],
    [() => locator.dblclick(), "waiting on dblclick for selector #x"],
    [() => locator.selectOption("a"), "locator.selectOption failed for selector #x"],
    [() => locator.fill("a"), "locator.fill failed for selector #x"],
    [() => locator.type("a"), "locator.type failed for selector #x"],
    [() => locator.press("Enter"), "locator.press failed for selector #x"],
    [() => locator.check(), "locator.setChecked(true) failed for selector #x"],
    [() => locator.uncheck(), "locator.setChecked(false) failed for selector #x"],
    [
      () => locator.waitFor({ state: "visible" }),
      "locator.waitFor(visible) timed out for selector #x",
    ],
    [() => locator.downloadMedia(), "locator.downloadMedia failed for selector #x"],
  ];
  for (const [invoke, context] of cases) {
    await assert.rejects(invoke, (error) => {
      assert.ok(error instanceof Error);
      assert.equal(error.message, `fixture failed\n${context}`);
      assert.ok(error.cause instanceof BrowserCommandError);
      assert.equal(error.cause.result, f.result);
      return true;
    });
  }
  await assert.rejects(locator.count(), BrowserCommandError);
  await assert.rejects(f.api.evaluate("1"), BrowserCommandError);
});

test("invalid selections and missing values fail without sending commands", async () => {
  const f = fixture(),
    locator = f.api.locator("x");
  await assert.rejects(locator.selectOption([]), /requires at least one value/);
  await assert.rejects(locator.selectOption({}), /requires value, label, or index/);
  await assert.rejects(
    locator.fill(undefined as unknown as string),
    /locator.fill requires a value/,
  );
  assert.throws(
    () => f.api.evaluate(3 as unknown as string),
    /playwright.evaluate requires a string or function/,
  );
  assert.equal(f.commands.length, 0);
});
