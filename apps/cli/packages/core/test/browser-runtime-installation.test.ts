// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Knorvia Studio contributors
import assert from "node:assert/strict";
import test from "node:test";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { setupBrowserRuntime } from "../src/browser-client/index.js";
import type { BrowsersFacade, BrowserClientTransport } from "../src/browser-client/facade.js";

interface Agent {
  browsers: BrowsersFacade;
  documentation: { get(name: string): Promise<string> };
}
function fixture(globals: Record<string, unknown> = {}) {
  let available = true,
    discoveries = 0,
    commands = 0;
  const transport: BrowserClientTransport = {
    list: async () => {
      discoveries++;
      return [];
    },
    execute: async () => {
      commands++;
      return { ok: true, elapsedMs: 0 };
    },
  };
  const options = {
    globals,
    transport,
    assertAvailable() {
      if (!available) throw new Error("fixture-unavailable");
    },
  };
  return {
    options,
    globals,
    get agent() {
      return globals.agent as Agent;
    },
    set available(value: boolean) {
      available = value;
    },
    get calls() {
      return { discoveries, commands };
    },
  };
}

test("installation preserves the namespace and siblings without discovering a browser", async () => {
  const sentinel = { fixture: true };
  const original = { sibling: sentinel };
  const f = fixture({ agent: original });
  setupBrowserRuntime(f.options);
  assert.equal(f.globals.agent, original);
  assert.equal(original.sibling, sentinel);
  assert.deepEqual(f.calls, { discoveries: 0, commands: 0 });
  assert.ok(Object.isFrozen(f.agent.documentation));
  assert.equal(typeof f.agent.browsers.list, "function");
  assert.equal(typeof f.agent.browsers.tab, "undefined");
  await f.agent.browsers.list();
  assert.equal(f.calls.discoveries, 1);
});

test("availability is checked before installing anything", () => {
  const f = fixture();
  f.available = false;
  assert.throws(() => setupBrowserRuntime(f.options), /fixture-unavailable/);
  assert.equal("agent" in f.globals, false);
  assert.deepEqual(f.calls, { discoveries: 0, commands: 0 });
});

test("document requests check availability and reject missing names", async () => {
  const f = fixture();
  setupBrowserRuntime(f.options);
  await assert.rejects(f.agent.documentation.get(""), {
    name: "TypeError",
    message: "agent.documentation.get requires a document name",
  });
  f.available = false;
  await assert.rejects(f.agent.documentation.get("computer-use"), /fixture-unavailable/);
  await assert.rejects(f.agent.browsers.list(), /fixture-unavailable/);
});

test("browser documents stay local while Computer Use remains with its original provider", async () => {
  const root = mkdtempSync(join(tmpdir(), "knorvia-browser-install-"));
  try {
    writeFileSync(
      join(root, "documents.json"),
      JSON.stringify({ documents: [{ name: "browser-guide", path: "guide.md" }] }),
    );
    writeFileSync(join(root, "guide.md"), "Fixture browser guide");
    const names: string[] = [];
    const f = fixture({
      agent: {
        documentation: {
          get: async (name: string) => {
            names.push(name);
            return "Fixture computer guide";
          },
        },
      },
    });
    setupBrowserRuntime({ ...f.options, documentationRoot: root });
    assert.equal(await f.agent.documentation.get("browser-guide"), "Fixture browser guide");
    assert.equal(await f.agent.documentation.get("computer-use"), "Fixture computer guide");
    await assert.rejects(f.agent.documentation.get("missing"), /Browser documentation not found/);
    assert.deepEqual(names, ["computer-use"]);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("reinstalling replaces the browser view and preserves the Computer Use provider", async () => {
  let calls = 0;
  const f = fixture({
    agent: {
      documentation: {
        get: async () => {
          calls++;
          return "Fixture";
        },
      },
    },
  });
  setupBrowserRuntime(f.options);
  const old = f.agent.browsers;
  setupBrowserRuntime(f.options);
  assert.notEqual(f.agent.browsers, old);
  assert.equal(await f.agent.documentation.get("computer-use"), "Fixture");
  assert.equal(calls, 1);
});

test("delegation retains the original document provider receiver", async () => {
  const provider = {
    prefix: "Fixture",
    async get(name: string) {
      return `${this.prefix}: ${name}`;
    },
  };
  const f = fixture({ agent: { documentation: provider } });
  setupBrowserRuntime(f.options);
  assert.equal(await f.agent.documentation.get("computer-use"), "Fixture: computer-use");
});
