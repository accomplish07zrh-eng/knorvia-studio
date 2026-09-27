// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Knorvia Studio contributors
import assert from "node:assert/strict";
import test from "node:test";
import type { BrowserCommand, BrowserCommandResult } from "@knorvia/contracts/browser-control";
import { RawTab, Tab } from "../src/browser-client/facade.js";
import { BrowserCommandError } from "../src/browser-client/result.js";

const clean = (value: unknown) => JSON.parse(JSON.stringify(value));
function fixture() {
  const commands: BrowserCommand[] = [];
  const result: BrowserCommandResult = {
    ok: true,
    elapsedMs: 0,
    state: { url: "https://example.test/", title: "Fixture", canGoBack: false, canGoForward: true },
    snapshot: { url: "https://example.test/", title: "Fixture", elements: [], truncated: false },
    image: { base64: "AAEC", mimeType: "image/png" },
    value: 42,
    dialog: null,
  };
  const run = async (command: BrowserCommand) => {
    commands.push(command);
    return result;
  };
  return {
    commands,
    result,
    raw: new RawTab(run),
    tab: new Tab(run, "fixture", {
      url: "https://example.test/",
      title: "Fixture",
      viewport: { width: 800, height: 600 },
    }),
    run,
  };
}
const actions: Array<[string, (tab: RawTab | Tab) => Promise<unknown>, BrowserCommand]> = [
  [
    "navigate",
    (t) => t.navigate("https://example.test/"),
    { method: "navigate", url: "https://example.test/" },
  ],
  ["back", (t) => t.back(), { method: "back" }],
  ["forward", (t) => t.forward(), { method: "forward" }],
  ["reload", (t) => t.reload(), { method: "reload" }],
  ["state", (t) => t.getState(), { method: "getState" }],
  [
    "snapshot",
    (t) => t.snapshot({ maxElements: 3, includeHidden: true }),
    { method: "snapshot", maxElements: 3, includeHidden: true },
  ],
  ["screenshot", (t) => t.screenshot({ fullPage: true }), { method: "screenshot", fullPage: true }],
  [
    "click ref",
    (t) => t.click("ref", { button: "right", doubleClick: true, modifiers: ["Shift"] }),
    { method: "click", ref: "ref", button: "right", doubleClick: true, modifiers: ["Shift"] },
  ],
  [
    "click point",
    (t) => t.click({ x: 1, y: 2, button: "right", doubleClick: true }, { button: "left" }),
    { method: "click", x: 1, y: 2, button: "left", doubleClick: true },
  ],
  ["type", (t) => t.type("hello", { ref: "ref" }), { method: "type", text: "hello", ref: "ref" }],
  [
    "press",
    (t) => t.press("Enter", { ref: "ref", modifiers: ["Alt"] }),
    { method: "press", key: "Enter", ref: "ref", modifiers: ["Alt"] },
  ],
  [
    "scroll",
    (t) => t.scroll({ ref: "ref", x: 1, y: 2 }),
    { method: "scroll", ref: "ref", x: 1, y: 2 },
  ],
  ["hover ref", (t) => t.hover("ref"), { method: "hover", ref: "ref" }],
  ["hover point", (t) => t.hover({ x: 1, y: 2 }), { method: "hover", x: 1, y: 2 }],
  ["select", (t) => t.select("ref", ["a"]), { method: "select", ref: "ref", values: ["a"] }],
  ["check", (t) => t.check("ref"), { method: "check", ref: "ref", checked: true }],
  [
    "drag refs",
    (t) => t.drag("a", "b", { modifiers: ["Shift"] }),
    { method: "drag", fromRef: "a", toRef: "b", modifiers: ["Shift"] },
  ],
  [
    "drag points",
    (t) => t.drag({ x: 1, y: 2 }, { x: 3, y: 4 }),
    { method: "drag", from: { x: 1, y: 2 }, to: { x: 3, y: 4 } },
  ],
  [
    "drag mixed",
    (t) => t.drag("a", { x: 3, y: 4 }),
    { method: "drag", fromRef: "a", to: { x: 3, y: 4 } },
  ],
  ["close", (t) => t.close(), { method: "close" }],
  ["hit", (t) => t.elementInfo(1, 2), { method: "elementInfo", x: 1, y: 2 }],
  ["evaluate", (t) => t.evaluate("1+2"), { method: "evaluate", expression: "1+2" }],
  ["dialog", (t) => t.getDialog(), { method: "getDialog" }],
  [
    "dialog response",
    (t) => t.handleDialog(true, "answer"),
    { method: "handleDialog", accept: true, promptText: "answer" },
  ],
];

test("raw methods preserve command mapping and return the exact transport result", async () => {
  const f = fixture();
  for (const [name, invoke, command] of actions) {
    assert.equal(await invoke(f.raw), f.result, name);
    assert.deepEqual(clean(f.commands.at(-1)), command, name);
  }
  f.result.ok = false;
  assert.equal(await f.raw.back(), f.result);
});

test("high-level tab methods bind every operation to their tab and reject failed results", async () => {
  const f = fixture();
  for (const [name, invoke, command] of actions) {
    await invoke(f.tab);
    assert.deepEqual(clean(f.commands.at(-1)), { ...command, tabId: "fixture" }, name);
  }
  f.result.ok = false;
  f.result.error = { code: "execution_error", message: "fixture failed" };
  for (const [, invoke] of actions) await assert.rejects(() => invoke(f.tab), BrowserCommandError);
});

test("tab payloads retain null, undefined and observation identity", async () => {
  const f = fixture();
  assert.equal(await f.tab.getState(), f.result.state);
  assert.equal(await f.tab.snapshot(), f.result.snapshot);
  assert.equal(await f.tab.url(), "https://example.test/");
  assert.equal(await f.tab.title(), "Fixture");
  assert.deepEqual([...(await f.tab.screenshot())], [0, 1, 2]);
  for (const value of [undefined, null, false, 0, ""]) {
    f.result.value = value;
    assert.equal(await f.tab.evaluate("1"), value);
  }
  assert.equal(await f.tab.elementInfo(1, 2), undefined);
  delete f.result.dialog;
  assert.equal(await f.tab.getDialog(), null);
  delete f.result.state;
  await assert.rejects(f.tab.getState(), /Browser result missing state/);
  delete f.result.snapshot;
  await assert.rejects(f.tab.snapshot(), /Browser result missing snapshot/);
  delete f.result.image;
  await assert.rejects(f.tab.screenshot(), /Browser result missing image/);
});

test("function evaluation is an immediate no-argument expression", async () => {
  const f = fixture();
  const fn = () => 42;
  await f.raw.evaluate(fn);
  assert.equal((f.commands.at(-1) as { expression: string }).expression, `(${fn.toString()})()`);
  await f.tab.evaluate(fn);
  assert.equal((f.commands.at(-1) as { expression: string }).expression, `(${fn.toString()})()`);
});

test("viewport accepts only bounded integers and changes the cached copy only after success", async () => {
  const f = fixture();
  const observed = f.tab.viewportSize()!;
  observed.width = 1;
  assert.equal(f.tab.viewportSize()!.width, 800);
  for (const value of [
    { width: 319, height: 600 },
    { width: 3841, height: 600 },
    { width: 800, height: 319 },
    { width: 800, height: 2161 },
    { width: 800.5, height: 600 },
    { width: NaN, height: 600 },
  ]) {
    await assert.rejects(f.tab.setViewportSize(value), TypeError);
  }
  assert.equal(f.commands.length, 0);
  await f.tab.setViewportSize({ width: 320, height: 2160 });
  assert.deepEqual(f.tab.viewportSize(), { width: 320, height: 2160 });
  assert.deepEqual(f.commands.at(-1), {
    method: "browserViewportSet",
    width: 320,
    height: 2160,
    tabId: "fixture",
  });
  f.result.ok = false;
  await assert.rejects(f.tab.setViewportSize({ width: 500, height: 500 }), BrowserCommandError);
  assert.deepEqual(f.tab.viewportSize(), { width: 320, height: 2160 });
  assert.equal(new Tab(f.run).viewportSize(), null);
});

test("finalization preserves bound and default-tab command semantics", async () => {
  const f = fixture();
  await f.tab.finalize({ deliverable: true });
  await f.tab.markDeliverable();
  await f.tab.markHandoff();
  const fallback = new Tab(f.run);
  assert.equal(fallback.id, "");
  await fallback.finalize();
  await fallback.markHandoff();
  assert.deepEqual(clean(f.commands), [
    { method: "finalize", deliverable: true, tabId: "fixture" },
    { method: "markDeliverable", tabId: "fixture" },
    { method: "markHandoff", tabId: "fixture" },
    { method: "finalize" },
    { method: "markHandoff", tabId: "" },
  ]);
});

test("CUA preserves mouse numbering, modifiers, key sequences and coordinate commands", async () => {
  const f = fixture();
  const cua = f.tab.cua;
  await cua.click({ x: 1, y: 2, button: 2, keypress: ["Control", "CTRL", "Shift"] });
  await cua.double_click({ x: 3, y: 4, keypress: ["Alt"] });
  await cua.drag({
    path: [
      { x: 1, y: 2 },
      { x: 3, y: 4 },
    ],
    keys: ["Meta"],
  });
  await cua.keypress({ keys: ["CTRL", "A"] });
  await cua.move({ x: 1, y: 2, keys: ["ControlOrMeta"] });
  await cua.scroll({ x: 1, y: 2, scrollX: 3, scrollY: 4, keypress: ["Shift"] });
  await cua.type({ text: "hello" });
  await cua.downloadMedia({ x: 1, y: 2, timeoutMs: 37 });
  assert.deepEqual(clean(f.commands), [
    {
      method: "click",
      x: 1,
      y: 2,
      button: "middle",
      modifiers: ["Control", "Shift"],
      tabId: "fixture",
    },
    { method: "click", x: 3, y: 4, doubleClick: true, modifiers: ["Alt"], tabId: "fixture" },
    {
      method: "cuaDrag",
      path: [
        { x: 1, y: 2 },
        { x: 3, y: 4 },
      ],
      modifiers: ["Meta"],
      tabId: "fixture",
    },
    { method: "cuaKeypress", keys: ["CTRL", "A"], tabId: "fixture" },
    { method: "hover", x: 1, y: 2, modifiers: ["ControlOrMeta"], tabId: "fixture" },
    {
      method: "cuaScroll",
      x: 1,
      y: 2,
      scrollX: 3,
      scrollY: 4,
      modifiers: ["Shift"],
      tabId: "fixture",
    },
    { method: "type", text: "hello", tabId: "fixture" },
    { method: "click", x: 1, y: 2, tabId: "fixture" },
  ]);
  assert.throws(() => cua.click({ x: 1, y: 2, button: 0 }), /Unsupported CUA mouse button/);
});

test("DOM CUA keeps node references and distinct scroll protocol", async () => {
  const f = fixture();
  const dom = f.tab.dom_cua;
  assert.equal(await dom.get_visible_dom(), f.result.snapshot);
  await dom.click({ node_id: "r" });
  await dom.double_click({ node_id: "r" });
  await dom.scroll({ node_id: "r", x: 3, y: 4 });
  await dom.keypress({ keys: ["Enter"] });
  await dom.type({ text: "hello" });
  await dom.downloadMedia({ node_id: "r", timeoutMs: 37 });
  assert.deepEqual(clean(f.commands), [
    { method: "snapshot", tabId: "fixture" },
    { method: "click", ref: "r", tabId: "fixture" },
    { method: "click", ref: "r", doubleClick: true, tabId: "fixture" },
    { method: "domCuaScroll", nodeId: "r", scrollX: 3, scrollY: 4, tabId: "fixture" },
    { method: "cuaKeypress", keys: ["Enter"], tabId: "fixture" },
    { method: "type", text: "hello", tabId: "fixture" },
    { method: "click", ref: "r", tabId: "fixture" },
  ]);
});
