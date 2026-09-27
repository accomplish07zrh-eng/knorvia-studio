// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Knorvia contributors
import assert from "node:assert/strict";
import type { Socket } from "node:net";
import { test } from "node:test";
import type { BrowserCommand, BrowserCommandResult } from "@knorvia/shared/browser-use";
import { commands } from "../../../../../packages/shared/test/browser-wire-fixtures.js";
import { nodeReplBrowserBrokerRequestSchema } from "@knorvia/shared/node-repl-browser-broker";
import { browserEnvironment, bridgeFixture } from "./bridge-test-support.js";

const meta = {
  browserUse: true as const,
  backendType: "iab" as const,
  browserId: "browser",
  browserGeneration: 3,
  openTabIds: ["tab", "second"],
  tabId: "tab",
  currentUrl: "https://fixture.invalid/",
};
const image = { base64: "YWJj", mimeType: "image/png" as const };
const result = (ok = true): BrowserCommandResult => ({ ok, elapsedMs: 1, meta });

test("browser discovery projects only trusted wire fields and retains schema defaults", async (t) => {
  const fixture = await bridgeFixture(t, "browser");
  const bridge = fixture.browser!;
  assert.equal(bridge.documentationRoot, "fixture-docs");
  assert.deepEqual(await bridge.list(), []);
  fixture.reply.value = {
    browsers: [{ id: "browser", type: "iab", name: "Fixture", capabilities: {} }],
  };
  assert.deepEqual(await bridge.list(), [
    { id: "browser", generation: 0, type: "iab", name: "Fixture", capabilities: {} },
  ]);
  for (const raw of fixture.requests) {
    const request = nodeReplBrowserBrokerRequestSchema.parse(raw);
    assert.equal(request.op, "list");
    assert.equal(request.sessionId, "session");
    assert.equal(request.turnId, "turn");
    assert.deepEqual(request.trace, { traceId: "trace" });
    assert.equal("workspacePath" in raw, false);
    assert.equal("workspaceIdentity" in raw, false);
  }
  assert.deepEqual(fixture.observations, []);
});

test("browser availability and request configuration stay separate and are read per call", async (t) => {
  const fixture = await bridgeFixture(t, "browser");
  const bridge = fixture.browser!;
  delete process.env[browserEnvironment[0]];
  bridge.assertAvailable();
  await assert.rejects(bridge.list(), /Browser control is unavailable/);
  process.env[browserEnvironment[0]] = " " + fixture.connection.socketPath + " ";
  process.env[browserEnvironment[1]] = " ";
  await assert.rejects(bridge.list(), /Browser control is unavailable/);
  process.env[browserEnvironment[1]] = " " + fixture.connection.token + " ";
  assert.deepEqual(await bridge.list(), []);
  assert.equal(fixture.requests.length, 1);
  assert.equal(fixture.requests[0]!.token, fixture.connection.token);
});

test("missing sessions, subagents and cancelled bindings never send browser commands", async (t) => {
  const fixture = await bridgeFixture(t, "browser");
  const bridge = fixture.browser!;
  fixture.state.active!.requestMeta = {};
  await assert.rejects(bridge.list(), /missing session_id/);
  fixture.state.active!.requestMeta = { session_id: "session", runtime_scope: "subagent" };
  await assert.rejects(
    bridge.execute("browser", 3, commands.snapshot),
    /not available in subagent/,
  );
  fixture.controller.abort(new Error("cancelled fixture"));
  await assert.rejects(bridge.list(), /cancelled fixture/);
  assert.equal(fixture.requests.length, 0);
});

test("strict broker replies and absent command results fail before observations", async (t) => {
  const fixture = await bridgeFixture(t, "browser");
  for (const reply of [{ unexpected: true }, { result: { ok: true } }]) {
    fixture.reply.value = reply;
    await assert.rejects(fixture.browser!.execute("browser", 3, commands.snapshot), {
      name: "ZodError",
    });
  }
  fixture.reply.value = {};
  await assert.rejects(
    fixture.browser!.execute("browser", 3, commands.snapshot),
    /returned no command result/,
  );
  fixture.reply.value = { ok: false, error: "fixture refused" };
  await assert.rejects(fixture.browser!.list(), /fixture refused/);
  assert.deepEqual(fixture.observations, []);
});

test("responses from a reset generation never update the session", async (t) => {
  let respond!: () => void;
  const fixture = await bridgeFixture(t, "browser", (request, socket: Socket) => {
    respond = () =>
      socket.end(JSON.stringify({ id: request.id, ok: true, result: result() }) + "\n");
  });
  const pending = fixture.browser!.execute("browser", 3, commands.click);
  const rejected = assert.rejects(pending, /stale after kernel reset/);
  await fixture.waitForRequests(1);
  fixture.state.active!.generation += 1;
  respond();
  await rejected;
  assert.deepEqual(fixture.observations, []);
});

test("all browser methods preserve tab, session and screenshot-hint observation rules", async (t) => {
  const fixture = await bridgeFixture(t, "browser");
  const tabs = new Set([
    "navigate",
    "back",
    "forward",
    "reload",
    "click",
    "fill",
    "type",
    "press",
    "scroll",
    "hover",
    "select",
    "check",
    "drag",
    "handleDialog",
    "close",
    "finalizeTabs",
  ]);
  const noHint = new Set([
    "capabilities",
    "list",
    "listUserTabs",
    "browserVisibilityGet",
    "cancelRequest",
    "closeSession",
    "finalizeTabs",
    "nameSession",
    "turnEnded",
  ]);
  for (const command of Object.values(commands)) {
    for (const ok of [false, true]) {
      const response = result(ok);
      fixture.reply.value = { result: response };
      fixture.observations.length = 0;
      assert.deepEqual(await fixture.browser!.execute("browser", 3, command), response);
      const method = command.method;
      assert.deepEqual(
        fixture.observations,
        [
          {
            name: "metadata",
            value: {
              "knorvia/browserUse": true,
              "knorvia/toolSurface": {
                kind: "browserUse",
                backend: "iab",
                browserId: "browser",
                ...(ok && tabs.has(method) ? { openTabIds: ["tab", "second"] } : {}),
                ...(ok && method === "finalizeTabs" ? { sessionEnded: true } : {}),
              },
              browser_use: { url: "https://fixture.invalid/" },
              ...(ok && !noHint.has(method)
                ? {
                    "knorvia/browserTurnScreenshot": {
                      browserGeneration: 3,
                      browserId: "browser",
                      tabId: "tab",
                    },
                  }
                : {}),
            },
          },
        ],
        method + ":" + ok,
      );
    }
  }
});

test("Playwright locator mutations include tab facts while locator reads do not", async (t) => {
  const fixture = await bridgeFixture(t, "browser");
  fixture.reply.value = { result: result() };
  for (const [operation, changesTabs] of [
    ["click", true],
    ["dblclick", true],
    ["downloadMedia", true],
    ["fill", true],
    ["press", true],
    ["selectOption", true],
    ["setChecked", true],
    ["count", false],
    ["innerText", false],
    ["isVisible", false],
    ["waitFor", false],
    ["allTextContents", false],
    ["evaluate", false],
    ["getAttribute", false],
    ["isEnabled", false],
    ["textContent", false],
  ] as const) {
    const command: BrowserCommand = {
      method: "playwright",
      action: { name: "locator", selector: "#fixture", operation },
    };
    fixture.observations.length = 0;
    await fixture.browser!.execute("browser", 3, command);
    const recorded = fixture.observations[0]!.value as Record<string, Record<string, unknown>>;
    assert.equal("openTabIds" in recorded["knorvia/toolSurface"]!, changesTabs, operation);
  }
});

test("only successful screenshot commands record image provenance, including without meta", async (t) => {
  const fixture = await bridgeFixture(t, "browser");
  for (const method of ["screenshot", "snapshot"] as const) {
    for (const ok of [false, true]) {
      fixture.reply.value = { result: { ok, elapsedMs: 1, image } };
      fixture.observations.length = 0;
      await fixture.browser!.execute("browser", 3, { method });
      assert.deepEqual(
        fixture.observations,
        ok && method === "screenshot" ? [{ name: "screenshot", value: image }] : [],
      );
    }
  }
  fixture.reply.value = {
    result: { ...result(), image, meta: { ...meta, tabId: "", currentUrl: "" } },
  };
  fixture.observations.length = 0;
  await fixture.browser!.execute("browser", 3, commands.screenshot);
  assert.deepEqual(
    fixture.observations.map((value) => value.name),
    ["screenshot", "metadata"],
  );
  const recorded = fixture.observations[1]!.value as Record<string, unknown>;
  assert.equal("knorvia/browserTurnScreenshot" in recorded, false);
  assert.deepEqual(recorded.browser_use, {});
});
