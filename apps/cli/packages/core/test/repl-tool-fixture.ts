// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Knorvia contributors
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { mock, type TestContext } from "node:test";
import type { BrowserControlPort, JsOutput } from "@knorvia/contracts";
// 2026-10-23：`setupBrowserRuntime` / `BrowserRuntimeOptions` 已随 #302 迁到独立包
// `@knorvia/browser-client`，core 内的重复副本（`src/browser-client/`）已删除。
// 所以这里的类型与 mock 目标都改指独立包 —— mock 要拦的是 `session-registry.ts`
// 实际 import 的那个模块，否则拦截不生效。
import type { BrowserRuntimeOptions } from "@knorvia/browser-client";
import type { ToolExecutionContext } from "../src/tool/types.js";

export const installations: BrowserRuntimeOptions[] = [];
mock.module("@knorvia/browser-client", {
  namedExports: {
    setupBrowserRuntime(options: BrowserRuntimeOptions) {
      installations.push(options);
      options.globals.fixtureBrowser = options.transport;
    },
  },
});
export const { jsToolEntry, createJsToolEntry, disposeNodeReplSession } =
  await import("../src/tool/handlers/node-repl.js");

export const emptyPort = (): BrowserControlPort => ({
  list: async () => [],
  execute: async () => ({ ok: true, elapsedMs: 0 }),
});

export function fixture(t: TestContext, overrides: Partial<ToolExecutionContext> = {}) {
  const sessionId = randomUUID() as ToolExecutionContext["sessionId"];
  const context: ToolExecutionContext = {
    sessionId,
    toolCallId: "fixture-call",
    traceId: "fixture-trace" as ToolExecutionContext["traceId"],
    turnId: "fixture-turn" as ToolExecutionContext["turnId"],
    abortSignal: new AbortController().signal,
    workingDirectory: process.cwd(),
    workspaceRoot: process.cwd(),
    ...overrides,
  };
  t.after(() => disposeNodeReplSession(context.sessionId));
  return context;
}

export function turn(context: ToolExecutionContext, name: string): ToolExecutionContext {
  return {
    ...context,
    toolCallId: `call-${name}`,
    turnId: name as ToolExecutionContext["turnId"],
    abortSignal: new AbortController().signal,
  };
}

export async function invoke(
  code: string,
  context: ToolExecutionContext,
  options: { title?: string; timeout_ms?: number } = {},
): Promise<JsOutput> {
  return (await jsToolEntry.handler({ code, title: "离线测试", ...options }, context)) as JsOutput;
}

export function successful(output: JsOutput): JsOutput {
  assert.equal(output.error, undefined, output.error?.message);
  return output;
}

export const gate = <T = void>() => Promise.withResolvers<T>();
