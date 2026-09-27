// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Knorvia contributors
import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { addAbortListener, once } from "node:events";
import { access } from "node:fs/promises";
import { test } from "node:test";
import { promisify } from "node:util";
import { createNodeReplCuaBroker } from "../src/cua-broker.js";
import { client, context, request, service } from "./cua-broker-test-support.js";

test(
  "CUA broker creates distinct local endpoints and credentials",
  { timeout: 8000 },
  async (t) => {
    const a = await service(t),
      b = await service(t);
    assert.notEqual(a.broker.connection.socketPath, b.broker.connection.socketPath);
    assert.notEqual(a.broker.connection.token, b.broker.connection.token);
    assert.match(a.broker.connection.token, /^[a-f0-9]{64}$/);
    assert.match(
      a.broker.connection.socketPath,
      process.platform === "win32" ? /^\\\\\.\\pipe\\/ : /\.sock$/,
    );
    await a.broker.close();
    if (process.platform !== "win32") await assert.rejects(access(a.broker.connection.socketPath));
    assert.equal((await request(t, b.broker)).ok, true);
  },
);

test("CUA broker carries result, arbitrary method arguments and complete identity", async (t) => {
  const value = {
    content: [{ type: "text", text: "fixture" }],
    _meta: { custom: true },
    responseMeta: { turn: 1 },
  };
  const { broker, requests } = await service(t, async () => value);
  const suppliedContext = {
    ...context,
    sessionId: " session-test ",
    workspaceKey: " explicit ",
    workspacePath: "/fixture/project",
    remoteSessionId: "remote-test",
    turnId: "turn-test",
    clientMode: "web-remote-replayable",
    deliveryKind: "web-remote-replayable",
    trace: { traceId: "trace-test" },
    extension: { accepted: true },
  };
  const response = await request(t, broker, {
    id: "correlated",
    method: "future_method",
    input: { position: [17, 23] },
    context: suppliedContext,
  });
  assert.deepEqual(response, { id: "correlated", ok: true, result: value });
  assert.equal(requests.length, 1);
  assert.equal(requests[0].toolName, "future_method");
  assert.deepEqual(requests[0].arguments, { position: [17, 23] });
  assert.deepEqual(requests[0].context, { ...suppliedContext, workspaceKey: "explicit" });
});

test("CUA broker workspace selection preserves explicit, remote identity and path fallbacks", async (t) => {
  const { broker, requests } = await service(t);
  for (const [fields, expected] of [
    [{ workspaceKey: " key ", workspaceIdentity: "identity", workspacePath: "/path" }, "key"],
    [{ workspaceKey: " ", workspaceIdentity: " identity ", workspacePath: "/path" }, "identity"],
    [{ workspaceKey: 12, workspaceIdentity: " ", workspacePath: " /path " }, "/path"],
  ] as const) {
    assert.equal((await request(t, broker, { context: { ...context, ...fields } })).ok, true);
    assert.equal(requests.at(-1)?.context.workspaceKey, expected);
  }
});

test("CUA broker authenticates before disclosing or echoing request identity", async (t) => {
  const { broker, requests } = await service(t);
  const token = broker.connection.token;
  for (const invalid of [undefined, null, 17, "", "wrong", "x" + token.slice(1)]) {
    const response = await request(t, broker, { token: invalid, id: "private-correlation" });
    assert.deepEqual(response, {
      id: null,
      ok: false,
      error: "Computer Use broker request is not authorized",
    });
    assert.ok(!JSON.stringify(response).includes(token));
  }
  assert.equal(requests.length, 0);
});

test("CUA broker rejects malformed envelopes before runtime dispatch", async (t) => {
  const { broker, requests } = await service(t);
  for (const raw of [null, 1, "value", false]) {
    const connection = await client(t, broker);
    connection.socket.write(JSON.stringify(raw) + "\n");
    assert.equal((await connection.response).error, "Invalid broker request");
  }
  for (const patch of [{ id: 4 }, { id: undefined }, { method: [] }, { method: null }]) {
    assert.equal((await request(t, broker, patch)).error, "Invalid broker request");
  }
  assert.equal(requests.length, 0);
});

test("CUA broker rejects absent identity, subagent scope and absent workspace", async (t) => {
  const { broker, requests } = await service(t);
  for (const invalid of [null, {}, { sessionId: " " }, { sessionId: 3 }]) {
    const response = await request(t, broker, { context: invalid });
    assert.equal(response.id, "request-test");
    assert.equal(response.error, "Computer Use request context is missing sessionId");
  }
  assert.equal(
    (await request(t, broker, { context: { ...context, runtimeScope: "subagent" } })).error,
    "Computer Use is not available in subagent",
  );
  assert.equal(
    (await request(t, broker, { context: { sessionId: "known" } })).error,
    "Computer Use request context is missing workspaceKey",
  );
  assert.equal(requests.length, 0);
});

test("CUA broker decodes split UTF-8 / CRLF and dispatches only the first frame", async (t) => {
  const { broker, requests } = await service(t);
  const connection = await client(t, broker);
  const frame = JSON.stringify({
    token: broker.connection.token,
    id: "utf8",
    method: "type",
    context,
    input: { text: "中文" },
  });
  const bytes = Buffer.from(frame + "\r\n" + frame + "\n");
  const split = bytes.indexOf(Buffer.from("中")) + 1;
  connection.socket.write(bytes.subarray(0, split));
  connection.socket.write(bytes.subarray(split));
  assert.equal((await connection.response).ok, true);
  assert.equal(requests.length, 1);
  assert.deepEqual(requests[0].arguments, { text: "中文" });
});

test("CUA broker bounds incoming bytes and does not expose malformed JSON", async (t) => {
  const { broker, requests } = await service(t);
  const tooLarge = await client(t, broker);
  tooLarge.socket.write(" ".repeat(1024 * 1024) + "\n");
  assert.match(String((await tooLarge.response).error), /exceeded 1048576 bytes/);
  const malformed = await client(t, broker);
  malformed.socket.write('{"private-input":"fixture-secret",bad}\n');
  const response = await malformed.response;
  assert.equal(response.error, "Broker returned invalid JSON");
  assert.ok(!JSON.stringify(response).includes("fixture-secret"));
  assert.equal(requests.length, 0);
});

test("CUA broker reports runtime and serialization failures then remains usable", async (t) => {
  const cyclic: Record<string, unknown> = {};
  cyclic.self = cyclic;
  const { broker } = await service(t, async ({ toolName }) => {
    if (toolName === "throw-error") throw new Error("fixture rejected");
    if (toolName === "throw-string") throw "fixture string";
    if (toolName === "cyclic") return cyclic;
    return undefined;
  });
  assert.equal((await request(t, broker, { method: "throw-error" })).error, "fixture rejected");
  assert.equal((await request(t, broker, { method: "throw-string" })).error, "fixture string");
  assert.equal((await request(t, broker, { method: "cyclic" })).ok, false);
  assert.deepEqual(await request(t, broker), { id: "request-test", ok: true });
});

test(
  "CUA broker independent connections preserve out-of-order response correlations",
  { timeout: 8000 },
  async (t) => {
    const count = 6,
      started = Promise.withResolvers<void>();
    const gates = Array.from({ length: count }, () => Promise.withResolvers<number>());
    let admitted = 0;
    const { broker } = await service(t, async ({ arguments: value }) => {
      const index = value as number;
      if (++admitted === count) started.resolve();
      return gates[index].promise;
    });
    const responses = gates.map((_, index) =>
      request(t, broker, { id: String(index), input: index }),
    );
    await started.promise;
    for (let i = count - 1; i >= 0; i--) gates[i].resolve(i);
    assert.deepEqual(
      await Promise.all(responses),
      gates.map((_, index) => ({ id: String(index), ok: true, result: index })),
    );
  },
);

test(
  "CUA broker disconnect aborts execution and ignores its late reply",
  { timeout: 8000 },
  async (t) => {
    const entered = Promise.withResolvers<AbortSignal>(),
      aborted = Promise.withResolvers<void>();
    const { broker } = await service(t, async ({ signal }) => {
      assert.ok(signal);
      entered.resolve(signal);
      addAbortListener(signal, () => aborted.resolve());
      await aborted.promise;
      return { content: [] };
    });
    const connection = await client(t, broker);
    connection.send();
    const signal = await entered.promise;
    assert.equal(signal.aborted, false);
    connection.socket.destroy();
    await aborted.promise;
    assert.equal(signal.aborted, true);
    await assert.rejects(connection.response);
  },
);

test(
  "CUA broker close is one barrier, aborts active work and releases partial clients",
  { timeout: 8000 },
  async (t) => {
    const entered = Promise.withResolvers<AbortSignal>(),
      released = Promise.withResolvers<void>();
    const { broker } = await service(t, async ({ signal }) => {
      assert.ok(signal);
      entered.resolve(signal);
      await released.promise;
      throw new Error("late failure is contained");
    });
    const running = await client(t, broker),
      partial = await client(t, broker);
    partial.socket.write('{"id":');
    running.send();
    const signal = await entered.promise;
    const finished = [once(running.socket, "close"), once(partial.socket, "close")];
    const closing = broker.close();
    assert.equal(broker.close(), closing);
    await closing;
    await Promise.all(finished);
    assert.equal(signal.aborted, true);
    released.resolve();
    await assert.rejects(client(t, broker));
  },
);

test("CUA broker can close before listening without disposing caller-owned runtime", async () => {
  const broker = createNodeReplCuaBroker({
    runtime: {
      execute: async () => assert.fail("No dispatch"),
      closeSession: async () => assert.fail("No session close"),
      dispose: async () => assert.fail("No runtime disposal"),
    },
  });
  const closing = broker.close();
  assert.equal(broker.close(), closing);
  await closing;
  await broker.ready;
});

test(
  "CUA broker contains unprintable runtime errors without ending its host process",
  { timeout: 12000 },
  async () => {
    const entry = new URL("../src/cua-broker.ts", import.meta.url).href;
    const program = `
    import { createConnection } from 'node:net';
    import { createNodeReplCuaBroker } from ${JSON.stringify(entry)};
    const broker = createNodeReplCuaBroker({runtime: {
      execute: async () => { throw Object.create(null); },
      dispose: async () => {}, closeSession: async () => {}
    }});
    await broker.ready;
    const socket = createConnection(broker.connection.socketPath);
    const reply = new Promise((resolve, reject) => {
      let text = '';
      socket.on('error', reject);
      socket.on('data', chunk => { text += chunk; if(text.includes('\\n')) resolve(JSON.parse(text)); });
      socket.once('connect', () => socket.write(JSON.stringify({id:'unprintable', token:broker.connection.token, method:'observe', context:{sessionId:'fixture', workspaceKey:'fixture'}})+'\\n'));
    });
    const result = await reply;
    socket.destroy();
    await broker.close();
    process.stdout.write(JSON.stringify({result, alive:true}));
  `;
    const { stdout } = await promisify(execFile)(
      process.execPath,
      ["--import", "tsx", "--input-type=module", "-e", program],
      { timeout: 8000 },
    );
    assert.deepEqual(JSON.parse(stdout), {
      result: { id: "unprintable", ok: false, error: "Computer Use broker request failed" },
      alive: true,
    });
  },
);
