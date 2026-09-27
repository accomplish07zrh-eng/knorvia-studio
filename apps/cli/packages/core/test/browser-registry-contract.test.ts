// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Knorvia Studio contributors
import assert from "node:assert/strict";
import test from "node:test";
import type {
  BrowserBackendDescriptor,
  BrowserCommand,
  BrowserCommandResult,
  BrowserTabSummary,
} from "@knorvia/contracts/browser-control";
import { BrowsersFacade, BrowserTabs, BrowserUser } from "../src/browser-client/facade.js";
const clean = (value: unknown) => JSON.parse(JSON.stringify(value));
const descriptor = (
  id: string,
  type: BrowserBackendDescriptor["type"],
  generation = 3,
): BrowserBackendDescriptor => ({ id, type, generation, name: id, capabilities: {} });
const summary = (tabId: string, active = false): BrowserTabSummary => ({
  tabId,
  url: `https://example.test/${tabId}`,
  title: tabId,
  active,
  viewport: { width: 800, height: 600 },
});
function fixture() {
  const calls: Array<{ id: string; generation: number; command: BrowserCommand }> = [];
  let discoveries = 0;
  const state = {
    infos: [
      descriptor("internal", "iab"),
      descriptor("extension", "extension"),
      descriptor("debug", "cdp"),
    ],
    allowed: true,
    failReuse: false,
    failNavigation: false,
  };
  const result: BrowserCommandResult = {
    ok: true,
    elapsedMs: 0,
    tabs: [summary("one"), summary("two", true)],
    tab: summary("returned"),
    userTabs: [{ id: "user" }],
  };
  const facade = new BrowsersFacade(
    {
      list: async () => {
        discoveries++;
        return state.infos;
      },
      execute: async (id, generation, command) => {
        calls.push({ id, generation, command });
        if (state.failReuse && command.method === "list") throw new Error("list failed");
        if (state.failNavigation && command.method === "navigate")
          throw new Error("navigation failed");
        return result;
      },
    },
    {
      assertAvailable() {
        if (!state.allowed) throw new Error("unavailable");
      },
    },
  );
  return {
    facade,
    calls,
    result,
    state,
    get discoveries() {
      return discoveries;
    },
  };
}

test("retained browser and capability documentation recheck runtime availability", async () => {
  const f = fixture();
  f.state.infos[0]!.capabilities.browser = [{ id: "fixture", description: "Fixture" }];
  const browser = await f.facade.get("internal");
  const capability = await browser.capabilities.get("fixture");
  f.state.allowed = false;
  assert.throws(() => f.facade.documentation(), /unavailable/);
  await assert.rejects(browser.documentation(), /unavailable/);
  await assert.rejects(capability.documentation(), /unavailable/);
});

test("discovery does not expose generations and backend lookup uses exact id or type", async () => {
  const f = fixture();
  const list = await f.facade.list();
  assert.equal(list.length, 3);
  assert.equal("generation" in list[0]!, false);
  assert.equal((await f.facade.get("internal")).browserId, "internal");
  assert.equal((await f.facade.get("extension")).browserId, "extension");
  assert.equal((await f.facade.get("cdp")).browserId, "debug");
  await assert.rejects(f.facade.get("default"), /Browser backend 'default' is unavailable/);
  assert.equal(f.discoveries, 5);
});

test("registry preserves same-generation identity and old bindings keep their original generation", async () => {
  const f = fixture();
  const first = await f.facade.get("internal");
  const tab = await first.tabs.get("one");
  f.state.infos = [{ ...descriptor("internal", "iab"), name: "updated" }];
  assert.equal(await f.facade.get("internal"), first);
  f.state.infos = [descriptor("internal", "iab", 4)];
  assert.notEqual(await f.facade.get("internal"), first);
  await tab.goto("https://example.test/new");
  assert.equal(f.calls.at(-1)!.generation, 3);
  f.state.allowed = false;
  await assert.rejects(tab.goto("x"), /unavailable/);
  await assert.rejects(f.facade.list(), /unavailable/);
});

test("backend refresh updates capability policy without replacing a same-generation object", async () => {
  const f = fixture();
  const browser = await f.facade.get("internal");
  assert.equal(typeof browser.tabs.finalize, "undefined");
  f.state.infos = [
    {
      ...descriptor("internal", "iab"),
      apiSupportOverrides: { "Tabs.finalize": true },
      capabilities: { browser: [{ id: "fixture", description: "Fixture" }] },
    },
  ];
  assert.equal(await f.facade.get("internal"), browser);
  assert.equal(typeof browser.tabs.finalize, "function");
  assert.deepEqual(await browser.capabilities.list(), [{ id: "fixture", description: "Fixture" }]);
});

test("tab collections select active or last and only activate an existing requested tab", async () => {
  const calls: BrowserCommand[] = [];
  const result: BrowserCommandResult = {
    ok: true,
    elapsedMs: 0,
    tabs: [summary("one"), summary("two")],
    tab: summary("returned"),
  };
  const tabs = new BrowserTabs(async (command) => {
    calls.push(command);
    return result;
  });
  assert.equal((await tabs.selected())!.id, "two");
  result.tabs![0]!.active = true;
  assert.equal((await tabs.selected())!.id, "one");
  assert.equal((await tabs.get("one")).id, "returned");
  assert.deepEqual(calls.at(-1), { method: "activateTab", tabId: "one" });
  await assert.rejects(tabs.get("missing"), /Browser tab 'missing' is unavailable/);
  assert.equal(calls.at(-1)!.method, "list");
  const listed = await tabs.list();
  assert.deepEqual(listed[0], {
    id: "one",
    active: true,
    title: "one",
    url: "https://example.test/one",
    viewport: { width: 800, height: 600 },
  });
  assert.equal("active" in listed[1]!, false);
  result.tabs = [];
  assert.equal(await tabs.selected(), undefined);
  assert.equal((await tabs.new()).id, "returned");
});

test("opening defaults to the default browser and reuses only when requested by URL policy", async () => {
  const f = fixture();
  const tab = await f.facade.open("https://example.test/one");
  assert.equal(tab.id, "returned");
  assert.deepEqual(
    f.calls.map((c) => c.command.method),
    ["list", "activateTab", "navigate"],
  );
  assert.ok(f.calls.every((c) => c.id === "internal"));
  f.calls.length = 0;
  await f.facade.open("https://example.test/one", { reuseTab: false });
  assert.deepEqual(
    f.calls.map((c) => c.command.method),
    ["newTab", "navigate"],
  );
  f.calls.length = 0;
  await f.facade.open();
  assert.deepEqual(
    f.calls.map((c) => c.command.method),
    ["newTab"],
  );
});

test("reuse errors can fall back to new tab but navigation errors propagate", async () => {
  const f = fixture();
  f.state.failReuse = true;
  await f.facade.open("https://example.test/one");
  assert.deepEqual(
    f.calls.map((c) => c.command.method),
    ["list", "newTab", "navigate"],
  );
  f.state.failNavigation = true;
  await assert.rejects(f.facade.open("https://example.test/one"), /navigation failed/);
});

test("URL selection reads candidate tabs and default current opens only when empty", async () => {
  const f = fixture();
  assert.equal((await f.facade.getForUrl("https://example.test/one")).browserId, "internal");
  assert.deepEqual(
    f.calls.map((c) => c.id),
    ["internal", "extension", "debug"],
  );
  assert.equal((await f.facade.current()).id, "two");
  f.result.tabs = [];
  assert.equal((await f.facade.current()).id, "returned");
});

test("legacy tab bindings share their initial discovery and listTabs preserves its id-only binding", async () => {
  const f = fixture();
  const tab = f.facade.tab("chosen");
  assert.equal(f.discoveries, 1);
  await tab.goto("https://example.test/");
  assert.equal(f.discoveries, 1);
  assert.deepEqual(f.calls.at(-1)!.command, {
    method: "navigate",
    url: "https://example.test/",
    tabId: "chosen",
  });
  const tabs = await f.facade.listTabs();
  assert.deepEqual(
    tabs.map((t) => t.id),
    ["one", "two"],
  );
  assert.deepEqual(
    tabs.map((t) => t.viewportSize()),
    [null, null],
  );
});

test("user tabs, claiming and finalization preserve host payloads and never fabricate history", async () => {
  const calls: BrowserCommand[] = [];
  const result: BrowserCommandResult = {
    ok: true,
    elapsedMs: 0,
    userTabs: [{ id: "user" }],
    tab: summary("claimed"),
  };
  const run = async (command: BrowserCommand) => {
    calls.push(command);
    return result;
  };
  const user = new BrowserUser(run, (tab) => tab);
  assert.equal(await user.openTabs(), result.userTabs);
  assert.equal((await user.claimTab({ id: "user" })).id, "claimed");
  await assert.rejects(user.history(), /Browser history is unavailable/);
  const tabs = new BrowserTabs(run);
  await tabs.finalize({
    keep: [
      { tab: "one", status: "handoff" },
      { tab: { id: "two" }, status: "deliverable" },
    ],
  });
  assert.deepEqual(clean(calls), [
    { method: "listUserTabs" },
    { method: "claimTab", tabId: "user" },
    {
      method: "finalizeTabs",
      keep: [
        { tabId: "one", status: "handoff" },
        { tabId: "two", status: "deliverable" },
      ],
    },
  ]);
});
