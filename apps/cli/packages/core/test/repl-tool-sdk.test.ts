// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Knorvia contributors
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";
import type { BrowserControlExecuteInput } from "@knorvia/contracts/browser-control";
import type { JsOutput } from "@knorvia/contracts";
import type { ToolExecutionContext } from "../src/tool/types.js";
import { jsToolEntry, disposeNodeReplSession } from "../src/tool/handlers/node-repl.js";

test("real browser SDK traverses the core handler with persistent tabs, observations and image output", async (t) => {
  const sessionId = randomUUID() as ToolExecutionContext["sessionId"];
  t.after(() => disposeNodeReplSession(sessionId));
  const requests: BrowserControlExecuteInput[] = [];
  const tab = {
    tabId: "fixture-tab",
    url: "https://example.test/",
    title: "Fixture",
    viewport: { width: 800, height: 600 },
  };
  const meta = {
    browserUse: true as const,
    backendType: "iab" as const,
    browserId: "fixture-browser",
    browserGeneration: 9,
    openTabIds: [tab.tabId],
    tabId: tab.tabId,
    currentUrl: tab.url,
  };
  const context: ToolExecutionContext = {
    sessionId,
    toolCallId: "fixture-call",
    traceId: "fixture-trace" as ToolExecutionContext["traceId"],
    turnId: "first" as ToolExecutionContext["turnId"],
    abortSignal: new AbortController().signal,
    workingDirectory: process.cwd(),
    workspaceRoot: process.cwd(),
    browserControlPort: {
      list: async () => [
        {
          id: "fixture-browser",
          type: "iab",
          generation: 9,
          name: "Fixture",
          capabilities: {},
          apiSupportOverrides: { "Tabs.finalize": true },
        },
      ],
      execute: async (input) => {
        requests.push(input);
        const result = { ok: true, elapsedMs: 0, meta };
        switch (input.command.method) {
          case "list":
            return { ...result, tabs: [tab] };
          case "newTab":
            return { ...result, tab };
          case "playwright":
            return { ...result, value: '- button "Continue"' };
          case "screenshot":
            return { ...result, image: { base64: "AQID", mimeType: "image/png" } };
          default:
            return result;
        }
      },
    },
  };
  const first = (await jsToolEntry.handler(
    {
      title: "观察测试页面",
      code: "const browser = await agent.browsers.getDefault(); const tab = await browser.tabs.new(); await tab.goto('https://example.test/'); await tab.playwright.domSnapshot()",
    },
    context,
  )) as JsOutput;
  assert.equal(first.error, undefined);
  assert.equal(first.result, '- button "Continue"');
  const next = {
    ...context,
    turnId: "second" as ToolExecutionContext["turnId"],
    traceContext: { traceId: context.traceId, spanId: "second-span" },
  };
  const second = (await jsToolEntry.handler(
    {
      title: "获取测试截图",
      code: "nodeRepl.emitImage(await tab.screenshot()); await browser.tabs.finalize({keep:[]}); undefined",
    },
    next,
  )) as JsOutput;
  assert.equal(second.error, undefined);
  assert.deepEqual(second.images, [{ base64: "AQID", mimeType: "image/png" }]);
  assert.deepEqual(second.responseMeta?.["knorvia/toolSurface"], {
    kind: "browserUse",
    backend: "iab",
    browserId: "fixture-browser",
    openTabIds: [tab.tabId],
    sessionEnded: true,
  });
  assert.deepEqual(
    requests.map(({ command }) => command.method),
    ["newTab", "navigate", "playwright", "screenshot", "finalizeTabs"],
  );
  for (const request of requests.slice(3)) {
    assert.equal(request.browserGeneration, 9);
    assert.equal(request.browserId, "fixture-browser");
    assert.equal(request.turnId, next.turnId);
    assert.equal(request.traceContext, next.traceContext);
  }
});

test("real SDK rejects old promise continuations but allows persistent functions called by a new cell", async (t) => {
  const sessionId = randomUUID() as ToolExecutionContext["sessionId"];
  t.after(() => disposeNodeReplSession(sessionId));
  const turns: Array<string | undefined> = [];
  const context: ToolExecutionContext = {
    sessionId,
    toolCallId: "fixture-call",
    traceId: "fixture-trace" as ToolExecutionContext["traceId"],
    turnId: "old" as ToolExecutionContext["turnId"],
    abortSignal: new AbortController().signal,
    workingDirectory: process.cwd(),
    workspaceRoot: process.cwd(),
    browserControlPort: {
      list: async (input) => {
        turns.push(input.turnId);
        return [];
      },
      execute: async () => assert.fail("Only browser discovery is expected"),
    },
  };
  const first = (await jsToolEntry.handler(
    {
      title: "保存测试函数",
      code: "function discover() { return agent.browsers.list(); } globalThis.late = new Promise(resolve => { globalThis.releasePrevious = resolve; }).then(discover).then(() => 'dispatched', error => error.message); undefined",
    },
    context,
  )) as JsOutput;
  assert.equal(first.error, undefined);
  const second = (await jsToolEntry.handler(
    {
      title: "验证调用归属",
      code: "releasePrevious(); const previous = await late; const current = await discover(); ({ previous, current })",
    },
    { ...context, turnId: "new" as ToolExecutionContext["turnId"] },
  )) as JsOutput;
  assert.equal(second.error, undefined);
  assert.deepEqual(JSON.parse(second.result!), {
    previous: "Browser runtime call is no longer active",
    current: [],
  });
  assert.deepEqual(turns, ["new"]);
});
