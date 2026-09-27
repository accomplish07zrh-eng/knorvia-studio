// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Knorvia contributors
import assert from "node:assert/strict";
import test from "node:test";
import type { BrowserControlListInput } from "@knorvia/contracts/browser-control";
import {
  disposeNodeReplSession,
  emptyPort,
  fixture,
  gate,
  installations,
  invoke,
  jsToolEntry,
  successful,
  turn,
} from "./repl-tool-fixture.js";

test("public handler retains bindings per session and exposes this call's request metadata", async (t) => {
  const context = fixture(t);
  successful(await invoke("const answer = 41", context));
  assert.equal(successful(await invoke("answer + 1", context)).result, "42");
  assert.equal(successful(await invoke("typeof answer", fixture(t))).result, "undefined");
  const next = turn(context, "next");
  assert.deepEqual(JSON.parse(successful(await invoke("nodeRepl.requestMeta", next)).result!), {
    sessionId: next.sessionId,
    title: "离线测试",
    toolCallId: next.toolCallId,
    traceId: next.traceId,
    turnId: next.turnId,
    workingDirectory: next.workingDirectory,
    workspaceRoot: next.workspaceRoot,
  });
  assert.equal(successful(await invoke("typeof setupBrowserRuntime", context)).result, "undefined");
});

test("input rejection precedes session creation and browser capabilities remain pinned", async (t) => {
  const context = fixture(t);
  await assert.rejects(jsToolEntry.handler({ code: "1", title: "" }, context));
  const port = emptyPort();
  let count = 0;
  port.list = async () => {
    count++;
    return [];
  };
  const enabled = {
    ...context,
    browserControlPort: port,
    browserDocumentationRoot: "fixture-docs",
  };
  successful(await invoke("await fixtureBrowser.list()", enabled));
  assert.equal(installations.at(-1)?.documentationRoot, "fixture-docs");
  successful(
    await invoke("await fixtureBrowser.list()", { ...context, browserControlPort: emptyPort() }),
  );
  assert.equal(count, 2);
  assert.equal(successful(await invoke("typeof setupBrowserRuntime", enabled)).result, "function");
  const disabled = fixture(t);
  successful(await invoke("0", disabled));
  assert.equal(
    successful(await invoke("typeof fixtureBrowser", { ...disabled, browserControlPort: port }))
      .result,
    "undefined",
  );
});

test("port requests use the calling turn, original signal and public trace context", async (t) => {
  const requests: BrowserControlListInput[] = [];
  const context = fixture(t, {
    browserControlPort: {
      list: async (input) => {
        requests.push(input);
        return [];
      },
      execute: async (input) => {
        requests.push(input);
        return { ok: true, elapsedMs: 0 };
      },
    },
  });
  successful(await invoke("0", context));
  const next = turn(context, "next");
  next.traceContext = { traceId: next.traceId, turnId: next.turnId, spanId: "fixture-span" };
  successful(
    await invoke(
      "await fixtureBrowser.list(); await fixtureBrowser.execute('fixture', 7, {method:'list'})",
      next,
    ),
  );
  for (const request of requests) {
    assert.equal(request.sessionId, next.sessionId);
    assert.equal(request.turnId, next.turnId);
    assert.equal(request.signal, next.abortSignal);
    assert.equal(request.traceContext, next.traceContext);
  }
});

test("Busy completion cannot replace or erase the active call's context", async (t) => {
  const entered = gate();
  const release = gate();
  t.after(() => release.resolve());
  const turns: string[] = [];
  const context = fixture(t, {
    browserControlPort: {
      ...emptyPort(),
      list: async (input) => {
        turns.push(input.turnId!);
        if (turns.length === 1) {
          entered.resolve();
          await release.promise;
        }
        return [];
      },
    },
  });
  successful(await invoke("0", context));
  const active = invoke(
    "await fixtureBrowser.list(); await fixtureBrowser.list()",
    turn(context, "active"),
  );
  await entered.promise;
  const busy = await invoke("0", turn(context, "overlap"));
  release.resolve();
  assert.equal(busy.error?.name, "BusyError");
  successful(await active);
  assert.deepEqual(turns, ["active", "active"]);
});

test("an ended cell's late response cannot continue under the next cell's identity", async (t) => {
  const oldResponse = gate();
  const newResponse = gate();
  const newEntered = gate();
  t.after(() => {
    oldResponse.resolve();
    newResponse.resolve();
  });
  const turns: string[] = [];
  const context = fixture(t, {
    browserControlPort: {
      ...emptyPort(),
      list: async (input) => {
        turns.push(input.turnId!);
        if (turns.length === 1) await oldResponse.promise;
        if (turns.length === 2) {
          newEntered.resolve();
          await newResponse.promise;
        }
        return [];
      },
    },
  });
  successful(
    await invoke(
      "globalThis.pending = fixtureBrowser.list().then(() => fixtureBrowser.list()).then(() => 'late success', error => error.message); undefined",
      turn(context, "old"),
    ),
  );
  const next = invoke("await fixtureBrowser.list(); await pending", turn(context, "new"));
  await newEntered.promise;
  oldResponse.resolve();
  newResponse.resolve();
  const output = successful(await next);
  assert.match(output.result!, /Browser runtime call is no longer active/);
  assert.deepEqual(turns, ["old", "new"]);
});

test("captured transport has no ambient authority outside a live handler call", async (t) => {
  let dispatched = 0;
  const context = fixture(t, {
    browserControlPort: {
      ...emptyPort(),
      list: async () => {
        dispatched++;
        return [];
      },
    },
  });
  successful(await invoke("0", context));
  await assert.rejects(
    installations.at(-1)!.transport.list(),
    /Browser runtime call is no longer active/,
  );
  assert.equal(dispatched, 0);
});

test("dispose and same-id recreation do not let old cleanup remove new call ownership", async (t) => {
  const oldGate = gate();
  const newGate = gate();
  const firstEntered = gate();
  const secondEntered = gate();
  t.after(() => {
    oldGate.resolve();
    newGate.resolve();
  });
  const turns: string[] = [];
  const context = fixture(t, {
    browserControlPort: {
      ...emptyPort(),
      list: async (input) => {
        turns.push(input.turnId!);
        if (turns.length === 1) {
          firstEntered.resolve();
          await oldGate.promise;
        }
        if (turns.length === 2) {
          secondEntered.resolve();
          await newGate.promise;
        }
        return [];
      },
    },
  });
  const old = invoke("await fixtureBrowser.list()", turn(context, "old"));
  await firstEntered.promise;
  const stale = installations.at(-1)!.transport;
  disposeNodeReplSession(context.sessionId);
  const next = invoke(
    "await fixtureBrowser.list(); await fixtureBrowser.list()",
    turn(context, "new"),
  );
  await secondEntered.promise;
  assert.equal((await old).error?.name, "AbortError");
  oldGate.resolve();
  newGate.resolve();
  successful(await next);
  await assert.rejects(stale.list(), /Browser runtime binding is stale after kernel reset/);
  assert.deepEqual(turns, ["old", "new", "new"]);
});

test("cancellation rebuilds bindings and rejects old browser handles without replay", async (t) => {
  const entered = gate();
  const response = gate();
  t.after(() => response.resolve());
  const controller = new AbortController();
  let count = 0;
  const context = fixture(t, {
    abortSignal: controller.signal,
    browserControlPort: {
      ...emptyPort(),
      list: async () => {
        count++;
        entered.resolve();
        await response.promise;
        return [];
      },
    },
  });
  const pending = invoke(
    "const oldBinding = 1; await fixtureBrowser.list(); await fixtureBrowser.list()",
    context,
  );
  await entered.promise;
  const stale = installations.at(-1)!.transport;
  controller.abort();
  const output = await pending;
  assert.equal(output.error?.name, "AbortError");
  assert.match(output.error?.message ?? "", /kernel reset/);
  response.resolve();
  await assert.rejects(stale.list(), /stale after kernel reset/);
  assert.equal(
    successful(await invoke("typeof oldBinding", turn(context, "next"))).result,
    "undefined",
  );
  assert.equal(count, 1);
});

test("synchronous timeout resets persistent bindings while ordinary errors preserve them", async (t) => {
  const context = fixture(t, { browserControlPort: emptyPort() });
  successful(await invoke("const value = 42", context));
  const stale = installations.at(-1)!.transport;
  assert.equal((await invoke("throw new Error('fixture')", context)).error?.message, "fixture");
  assert.equal(successful(await invoke("value", context)).result, "42");
  const timedOut = await invoke("while (true) {}", context, { timeout_ms: 1 });
  assert.match(timedOut.error?.message ?? "", /kernel reset/);
  await assert.rejects(stale.list(), /stale after kernel reset/);
  assert.equal(successful(await invoke("typeof value", context)).result, "undefined");
});
