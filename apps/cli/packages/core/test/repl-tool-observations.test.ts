// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Knorvia contributors
import assert from "node:assert/strict";
import test from "node:test";
import type { BrowserCommand, BrowserCommandResult } from "@knorvia/contracts/browser-control";
import {
  browserCommandMethodSchema,
  browserPlaywrightLocatorOperationSchema,
} from "@knorvia/shared/browser-use";
import { fixture, invoke, successful } from "./repl-tool-fixture.js";

const meta = {
  browserUse: true as const,
  backendType: "iab" as const,
  browserId: "fixture",
  browserGeneration: 7,
  openTabIds: ["a", "b"],
  tabId: "a",
  currentUrl: "https://example.test/",
};
const changed = new Set([
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
  "evaluate",
  "finalizeTabs",
]);
const noPreview = new Set([
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
const actionOperations = new Set([
  "click",
  "dblclick",
  "downloadMedia",
  "fill",
  "press",
  "selectOption",
  "setChecked",
]);

test("every core browser command retains its success, failure and preview policy", async (t) => {
  let result: BrowserCommandResult = { ok: true, elapsedMs: 0, meta };
  const context = fixture(t, {
    browserControlPort: {
      list: async () => [],
      execute: async () => result,
    },
  });
  const commands = browserCommandMethodSchema.options.map((method) => ({
    method,
    ...(method === "playwright" ? { action: { name: "domSnapshot" } } : {}),
  }));
  // 安装替身直接测试入口的观察策略；命令字段和实际 SDK 在各自的契约测试验收。
  for (const command of commands) {
    for (const ok of [true, false]) {
      result = { ok, elapsedMs: 0, meta };
      const output = successful(
        await invoke(
          `await fixtureBrowser.execute('fixture', 7, ${JSON.stringify(command)}); undefined`,
          context,
        ),
      );
      const surface: Record<string, unknown> = {
        kind: "browserUse",
        backend: "iab",
        browserId: "fixture",
      };
      if (ok && changed.has(command.method)) surface.openTabIds = ["a", "b"];
      if (ok && command.method === "finalizeTabs") surface.sessionEnded = true;
      const expected: Record<string, unknown> = {
        "knorvia/browserUse": true,
        "knorvia/toolSurface": surface,
        browser_use: { url: meta.currentUrl },
      };
      if (ok && !noPreview.has(command.method))
        expected["knorvia/browserTurnScreenshot"] = {
          browserGeneration: 7,
          browserId: "fixture",
          tabId: "a",
        };
      assert.deepEqual(output.responseMeta, expected, `${command.method}/${ok}`);
    }
  }
});

test("core Playwright evaluate updates open tabs but locator evaluate retains its distinct policy", async (t) => {
  const context = fixture(t, {
    browserControlPort: {
      list: async () => [],
      execute: async () => ({ ok: true, elapsedMs: 0, meta }),
    },
  });
  const actions: Array<Extract<BrowserCommand, { method: "playwright" }>["action"]> = [
    { name: "evaluate", expression: "1", expressionKind: "string" },
    ...browserPlaywrightLocatorOperationSchema.options.map((operation) => ({
      name: "locator" as const,
      selector: "button",
      operation,
    })),
  ];
  for (const action of actions) {
    const output = successful(
      await invoke(
        `await fixtureBrowser.execute('fixture', 7, ${JSON.stringify({ method: "playwright", action })}); undefined`,
        context,
      ),
    );
    const surface = output.responseMeta?.["knorvia/toolSurface"] as Record<string, unknown>;
    const altersSurface =
      action.name === "evaluate" ||
      (action.name === "locator" && actionOperations.has(action.operation));
    assert.deepEqual(
      surface.openTabIds,
      altersSurface ? ["a", "b"] : undefined,
      JSON.stringify(action),
    );
    assert.ok(output.responseMeta?.["knorvia/browserTurnScreenshot"]);
  }
});

test("missing metadata, URL and tab id do not fabricate observations", async (t) => {
  let result: BrowserCommandResult = { ok: true, elapsedMs: 0 };
  const context = fixture(t, {
    browserControlPort: { list: async () => [], execute: async () => result },
  });
  const code = "await fixtureBrowser.execute('fixture', 7, {method:'getState'}); undefined";
  assert.equal(successful(await invoke(code, context)).responseMeta, undefined);
  result = { ...result, meta: { ...meta, currentUrl: "", tabId: "" } };
  const output = successful(await invoke(code, context));
  assert.deepEqual(output.responseMeta?.browser_use, {});
  assert.equal(output.responseMeta?.["knorvia/browserTurnScreenshot"], undefined);
});
