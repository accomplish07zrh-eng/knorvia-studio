// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Knorvia Studio contributors
import assert from "node:assert/strict";
import test from "node:test";
import { runInNewContext } from "node:vm";
import type { BrowserCommand } from "@knorvia/contracts/browser-control";
import { createPlaywrightAPI, type PlaywrightLocator } from "../src/browser-client/playwright.js";

function fixture() {
  const commands: BrowserCommand[] = [];
  const api = createPlaywrightAPI(async (command) => {
    commands.push(command);
    return { ok: true, elapsedMs: 0, value: 2 };
  });
  const selector = async (locator: PlaywrightLocator) => {
    await locator.count();
    const command = commands.at(-1)!;
    if (command.method !== "playwright" || command.action.name !== "locator")
      throw new Error("Expected a locator command");
    return command.action.selector;
  };
  return { api, commands, selector };
}

test("query builders serialize text, roles and attributes without sending commands", async () => {
  const f = fixture();
  const cases: Array<[PlaywrightLocator, string]> = [
    [f.api.locator("#main"), "#main"],
    [f.api.getByRole("button"), "internal:role=button"],
    [
      f.api.getByRole("button", { name: "Save", exact: true }),
      'internal:role=button[name="Save"s]',
    ],
    [f.api.getByRole("button", { name: /Save/i }), "internal:role=button[name=/Save/i]"],
    [f.api.getByText('Say "hello"', { exact: true }), 'internal:text="Say \\"hello\\""s'],
    [f.api.getByLabel("Username"), 'internal:label="Username"i'],
    [f.api.getByPlaceholder("Name", { exact: true }), 'internal:attr=[placeholder="Name"s]'],
    [f.api.getByTestId("some-id"), 'internal:testid=[data-testid="some-id"s]'],
  ];
  assert.equal(f.commands.length, 0);
  for (const [locator, expected] of cases) assert.equal(await f.selector(locator), expected);
});

test("matchers retain regex flags across VM realms", async () => {
  const f = fixture();
  assert.equal(await f.selector(f.api.getByText(/a\s+b/gi)), "internal:text=/a\\s+b/gi");
  const foreign: RegExp = runInNewContext("/some text/gi");
  assert.equal(await f.selector(f.api.getByText(foreign)), "internal:text=/some text/gi");
});

test("nested locators retain scope and positional selectors", async () => {
  const f = fixture();
  const parent = f.api.locator("#main");
  assert.equal(
    await f.selector(parent.getByRole("button").nth(1)),
    "#main >> internal:role=button >> nth=1",
  );
  assert.equal(await f.selector(parent.first()), "#main >> nth=0");
  assert.equal(await f.selector(parent.last()), "#main >> nth=-1");
  assert.equal(
    await f.selector(parent.locator("p", { hasText: "hello" })),
    '#main >> p >> internal:has-text="hello"i',
  );
  assert.equal(await f.selector(parent), "#main");
});

test("nested frames preserve one frame entry boundary per level", async () => {
  const f = fixture();
  const frame = f.api.frameLocator("#outer").frameLocator("#inner");
  assert.equal(
    await f.selector(frame.getByText("Open")),
    '#outer >> internal:control=enter-frame >> #inner >> internal:control=enter-frame >> internal:text="Open"i',
  );
  assert.equal(
    await f.selector(frame.locator("button")),
    "#outer >> internal:control=enter-frame >> #inner >> internal:control=enter-frame >> button",
  );
});

test("filters combine text, nested conditions and visibility in the established order", async () => {
  const f = fixture();
  const filtered = f.api.locator("div").filter({
    has: f.api.locator("span"),
    hasNot: f.api.locator("em"),
    hasText: "abc",
    hasNotText: /z/,
    visible: false,
  });
  assert.equal(
    await f.selector(filtered),
    'div >> internal:has-text="abc"i >> internal:has-not-text=/z/ >> internal:has="span" >> internal:has-not="em" >> visible=false',
  );
  assert.equal(
    await f.selector(f.api.locator("x").filter({ hasText: "", hasNotText: "" })),
    'x >> internal:has-text=""i >> internal:has-not-text=""i',
  );
  assert.equal(await f.selector(f.api.locator("x").filter()), "x");
});

test("locator unions and intersections keep child selectors quoted", async () => {
  const f = fixture();
  assert.equal(
    await f.selector(f.api.locator("p").or(f.api.locator("q")).and(f.api.locator("main"))),
    'p >> internal:or="q" >> internal:and="main"',
  );
});

test("cross-tab locator combinations fail before any transport operation", () => {
  const first = fixture(),
    second = fixture();
  const a = first.api.locator("x"),
    b = second.api.locator("y");
  for (const combine of [
    () => a.and(b),
    () => a.or(b),
    () => a.filter({ has: b }),
    () => a.filter({ hasNot: b }),
  ])
    assert.throws(combine, /Locators must belong to the same tab/);
  assert.equal(first.commands.length + second.commands.length, 0);
});

test("invalid matcher, locator and combination inputs fail locally", () => {
  const f = fixture();
  assert.throws(
    () => f.api.getByText(undefined as unknown as string),
    /getByText requires a string or RegExp/,
  );
  assert.throws(() => f.api.locator(""), /playwright.locator requires a selector/);
  assert.throws(
    () => f.api.locator("x").and({} as PlaywrightLocator),
    /locator.and requires a PlaywrightLocator/,
  );
  assert.throws(
    () => f.api.locator("x").filter({ has: {} as PlaywrightLocator }),
    /locator.filter has requires a PlaywrightLocator/,
  );
  assert.equal(f.commands.length, 0);
});

test("all locators are scoped positional wrappers with no exposed transport fields", async () => {
  const f = fixture();
  const locators = await f.api.locator("x").all();
  assert.equal(locators.length, 2);
  assert.equal(await f.selector(locators[0]!), "x >> nth=0");
  assert.equal(await f.selector(locators[1]!), "x >> nth=1");
  assert.deepEqual(Reflect.ownKeys(f.api), []);
  assert.deepEqual(Reflect.ownKeys(locators[0]!), []);
  assert.equal("run" in f.api, false);
  assert.equal("run" in locators[0]!, false);
  assert.equal("locator" in f.api, true);
});
