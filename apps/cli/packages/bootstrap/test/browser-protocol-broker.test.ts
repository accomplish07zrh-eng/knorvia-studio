// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Knorvia Studio contributors
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { setImmediate as nextTurn } from "node:timers/promises";
import test from "node:test";
import {
  knorviaBrowserExecuteResultSchema,
  knorviaBrowserListResultSchema,
  knorviaProtocolMethods,
} from "@knorvia/shared";
import type { BrowserCommandResult, TraceId, TurnId } from "@knorvia/contracts";
import { createProtocolBrowserControlBroker } from "../src/protocol/browser-control-broker.js";
import type {
  KnorviaProtocolAgentServerContext,
  KnorviaProtocolClientRequestOptions,
} from "../src/protocol/server-types.js";

type Params = {
  requestId: string;
  sessionId: string;
  browserId?: string;
  browserGeneration?: number;
  command?: { method: string; requestId?: string; turnId?: string };
  [key: string]: unknown;
};
interface Request {
  method: string;
  params: Params;
  schema: unknown;
  options?: KnorviaProtocolClientRequestOptions;
}
const reply: BrowserCommandResult = { ok: true, elapsedMs: 7 };
function fixture() {
  const calls: Request[] = [];
  const records = new Map<string, unknown>([
    ["s", { workspace: { workspacePath: "/fixture" } }],
    ["other", { workspace: { workspacePath: "/fixture" } }],
  ]);
  let respond = (request: Request): Promise<unknown> =>
    Promise.resolve(
      request.method === knorviaProtocolMethods.interactionBrowserList ? { browsers: [] } : reply,
    );
  const context = {
    sessions: records,
    deps: {},
    requestClient(method: string, params: Params, schema: unknown, options?: Request["options"]) {
      const request = { method, params, schema, options };
      calls.push(request);
      return respond(request);
    },
  } as unknown as KnorviaProtocolAgentServerContext;
  return {
    port: createProtocolBrowserControlBroker(context),
    calls,
    records,
    respond(fn: typeof respond) {
      respond = fn;
    },
  };
}
const execute = (browserId = "b", browserGeneration = 1, sessionId = "s") => ({
  sessionId,
  browserId,
  browserGeneration,
  command: { method: "list" as const },
});

test("discovery preserves workspace identity, delivery kind, trace and signal", async () => {
  const f = fixture();
  f.records.set("s", {
    workspace: {
      workspacePath: "/same/path",
      workspaceIdentity: " remote:a ",
      remoteSessionId: " remote-session ",
    },
    deliveryKind: "web-remote-replayable",
  });
  const signal = new AbortController().signal;
  const browsers = [{ id: "fixture" }];
  f.respond(async () => ({ browsers }));
  assert.equal(
    await f.port.list({
      sessionId: "s",
      signal,
      traceContext: {
        traceId: "trace" as TraceId,
        spanId: "span",
        parentSpanId: "parent",
        turnId: "trace-turn" as TurnId,
      },
    }),
    browsers,
  );
  const { requestId, ...params } = f.calls[0].params;
  assert.match(requestId, /^[0-9a-f-]{36}$/u);
  assert.deepEqual(params, {
    sessionId: "s",
    workspaceKey: "remote:a",
    workspacePath: "/same/path",
    workspaceIdentity: "remote:a",
    remoteSessionId: "remote-session",
    turnId: "trace-turn",
    clientMode: "web-remote-replayable",
    sessionContext: "live",
  });
  assert.equal(f.calls[0].schema, knorviaBrowserListResultSchema);
  assert.deepEqual(f.calls[0].options, {
    signal,
    trace: { traceId: "trace", spanId: "span", parentId: "parent" },
  });
});

test("local paths and explicit turns retain precedence without optional identity fields", async () => {
  const f = fixture();
  await f.port.list({
    sessionId: "s",
    turnId: "explicit",
    traceContext: {
      traceId: "t" as TraceId,
      turnId: "trace" as TurnId,
      parentId: "first",
      parentSpanId: "second",
    },
  });
  assert.equal(f.calls[0].params.workspaceKey, "/fixture");
  assert.equal(f.calls[0].params.clientMode, "desktop-continuous");
  assert.equal(f.calls[0].params.turnId, "explicit");
  assert.equal("workspaceIdentity" in f.calls[0].params, false);
  assert.equal("remoteSessionId" in f.calls[0].params, false);
  assert.equal(f.calls[0].options?.trace?.parentId, "first");
  await f.port.list({
    sessionId: "s",
    turnId: "",
    traceContext: { traceId: "t" as TraceId, turnId: "trace" as TurnId },
  });
  assert.equal("turnId" in f.calls[1].params, false);
  await f.port.list({ sessionId: "s" });
  assert.deepEqual(f.calls[2].options, {});
});

test("unknown sessions are rejected before discovery or execution transport", async () => {
  const f = fixture();
  await assert.rejects(f.port.list({ sessionId: "missing" }), /Session is not active/);
  await assert.rejects(f.port.execute(execute("b", 1, "missing")), /Session is not active/);
  assert.equal(f.calls.length, 0);
});

test("execute preserves its command, result, backend generation and schema", async () => {
  const f = fixture();
  const input = execute("specific-backend", 42);
  const signal = new AbortController().signal;
  assert.equal(await f.port.execute({ ...input, signal }), reply);
  assert.equal(f.calls[0].params.command, input.command);
  assert.equal(f.calls[0].params.browserId, "specific-backend");
  assert.equal(f.calls[0].params.browserGeneration, 42);
  assert.equal(f.calls[0].schema, knorviaBrowserExecuteResultSchema);
  assert.equal(f.calls[0].options?.signal, signal);
});

test("abort targets the original request once without using its cancelled signal", async () => {
  const f = fixture();
  let finish!: (result: BrowserCommandResult) => void;
  f.respond(({ params }) =>
    params.command?.method === "cancelRequest"
      ? Promise.resolve(reply)
      : new Promise((resolve) => {
          finish = resolve;
        }),
  );
  const controller = new AbortController();
  const running = f.port.execute({
    ...execute("b", 9),
    turnId: "turn",
    traceContext: { traceId: "trace" as TraceId },
    signal: controller.signal,
  });
  controller.abort();
  controller.abort();
  await nextTurn();
  assert.equal(f.calls.length, 2);
  const original = f.calls[0],
    cancellation = f.calls[1];
  assert.deepEqual(cancellation.params.command, {
    method: "cancelRequest",
    requestId: original.params.requestId,
  });
  assert.notEqual(cancellation.params.requestId, original.params.requestId);
  assert.equal(cancellation.params.browserGeneration, 9);
  assert.equal(cancellation.params.sessionId, "s");
  assert.equal(cancellation.params.turnId, "turn");
  assert.deepEqual(cancellation.options, { trace: { traceId: "trace" } });
  finish(reply);
  assert.equal(await running, reply);
});

test("cancel failure does not replace the active command result; settled commands detach listeners", async () => {
  const f = fixture();
  let finish!: (result: BrowserCommandResult) => void;
  f.respond(({ params }) =>
    params.command?.method === "cancelRequest"
      ? Promise.reject(new Error("cancel failed"))
      : new Promise((resolve) => {
          finish = resolve;
        }),
  );
  const controller = new AbortController();
  const running = f.port.execute({ ...execute(), signal: controller.signal });
  controller.abort();
  finish(reply);
  assert.equal(await running, reply);
  await nextTurn();
  f.respond(async () => reply);
  const later = new AbortController();
  await f.port.execute({ ...execute(), signal: later.signal });
  const count = f.calls.length;
  later.abort();
  await nextTurn();
  assert.equal(f.calls.length, count);
});

test("lifecycle fanout deduplicates exact generations and stays within its session", async () => {
  const f = fixture();
  await f.port.list({ sessionId: "s" });
  await f.port.turnEnded?.({ sessionId: "s" });
  assert.equal(f.calls.length, 1);
  for (const input of [
    execute("b", 1),
    execute("b", 1),
    execute("b", 2),
    execute("c", 1),
    execute("other", 1, "other"),
  ])
    await f.port.execute(input);
  f.calls.length = 0;
  f.respond(async () => {
    throw new Error("closed backend");
  });
  await f.port.turnEnded?.({
    sessionId: "s",
    turnId: "turn",
    traceContext: { traceId: "ignored" as TraceId },
  });
  assert.deepEqual(
    f.calls.map(({ params }) => [params.browserId, params.browserGeneration]),
    [
      ["b", 1],
      ["b", 2],
      ["c", 1],
    ],
  );
  for (const request of f.calls) {
    assert.deepEqual(request.params.command, { method: "turnEnded", turnId: "turn" });
    assert.equal(request.options, undefined);
  }
  assert.equal(new Set(f.calls.map((x) => x.params.requestId)).size, 3);
  f.calls.length = 0;
  await f.port.closeSession?.({ sessionId: "s" });
  assert.equal(f.calls.length, 3);
  f.calls.length = 0;
  await f.port.closeSession?.({ sessionId: "s" });
  assert.equal(f.calls.length, 0);
  await f.port.turnEnded?.({ sessionId: "other" });
  assert.equal(f.calls.length, 1);
});

test("transport errors reach the caller and a subsequent request remains usable", async () => {
  const f = fixture(),
    failure = new Error("fixture transport failure");
  f.respond(async () => {
    throw failure;
  });
  await assert.rejects(f.port.execute(execute()), (error) => error === failure);
  f.respond(async () => reply);
  assert.equal(await f.port.execute(execute()), reply);
});

test("already cancelled requests are rejected without backend traffic", async () => {
  const f = fixture();
  const reason = new Error("cancelled before admission"),
    signal = AbortSignal.abort(reason);
  await assert.rejects(f.port.list({ sessionId: "s", signal }), (error) => error === reason);
  await assert.rejects(f.port.execute({ ...execute(), signal }), (error) => error === reason);
  assert.equal(f.calls.length, 0);
});

test("a closing batch cannot remove connections admitted while it awaits acknowledgements", async () => {
  const f = fixture();
  await f.port.execute(execute("old", 1));
  let finish!: (result: BrowserCommandResult) => void;
  f.respond(({ params }) =>
    params.command?.method === "closeSession"
      ? new Promise((resolve) => {
          finish = resolve;
        })
      : Promise.resolve(reply),
  );
  const closing = f.port.closeSession?.({ sessionId: "s" });
  await nextTurn();
  await f.port.execute(execute("new", 2));
  finish(reply);
  await closing;
  f.calls.length = 0;
  await f.port.turnEnded?.({ sessionId: "s" });
  assert.deepEqual(
    f.calls.map((x) => x.params.browserId),
    ["new"],
  );
});

test("lifecycle synchronous throws are isolated to their own connection", async () => {
  const f = fixture();
  await f.port.execute(execute("a"));
  await f.port.execute(execute("b"));
  f.calls.length = 0;
  f.respond(() => {
    throw new Error("synchronous transport failure");
  });
  await f.port.closeSession?.({ sessionId: "s" });
  assert.equal(f.calls.length, 2);
});

test("cancelling after session removal uses the admitted identity and cannot crash the process", () => {
  const moduleUrl = new URL("../src/protocol/browser-control-broker.ts", import.meta.url).href;
  const code = `
    import assert from 'node:assert/strict';
    import {setImmediate} from 'node:timers/promises';
    import {createProtocolBrowserControlBroker} from ${JSON.stringify(moduleUrl)};
    const calls=[];
    const context={deps:{}, sessions:new Map([['s',{workspace:{workspacePath:'/fixture'}}]]),
      requestClient(method,params){calls.push(params);return new Promise(()=>{});}};
    const port=createProtocolBrowserControlBroker(context), controller=new AbortController();
    void port.execute({sessionId:'s',browserId:'b',browserGeneration:1,command:{method:'list'},signal:controller.signal});
    context.sessions.delete('s');controller.abort();await setImmediate();
    assert.equal(calls.length,2);
    assert.equal(calls[1].workspaceKey,'/fixture');
    assert.equal(calls[1].command.requestId,calls[0].requestId);
  `;
  execFileSync(process.execPath, ["--import", "tsx", "--input-type=module", "-e", code], {
    stdio: "pipe",
    timeout: 15000,
  });
});
