// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Knorvia contributors
import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { once } from "node:events";
import { setImmediate } from "node:timers/promises";
import { test } from "node:test";
import { brokerCall } from "../src/ipc.js";
import { brokerFixture } from "./ipc-test-support.js";

test("a local transaction overrides envelope identity and correlates a split Unicode response", async (t) => {
  const fixture = await brokerFixture(t, (request, socket) => {
    const bytes = Buffer.from(
      JSON.stringify({ id: request.id, ok: true, result: "中文 🌿" }) + "\n",
    );
    for (const byte of bytes) socket.write(Buffer.from([byte]));
  });
  const payload = Object.freeze({ id: "forged", token: "forged", op: "list", input: { value: 7 } });
  const result = await brokerCall(fixture.connection, payload, AbortSignal.timeout(5000));
  assert.equal(fixture.requests.length, 1);
  const request = fixture.requests[0]!;
  assert.match(request.id as string, /^[a-f0-9-]{36}$/);
  assert.notEqual(request.id, "forged");
  assert.equal(request.token, fixture.connection.token);
  assert.deepEqual(request.input, { value: 7 });
  assert.deepEqual(result, { id: request.id, ok: true, result: "中文 🌿" });
  assert.equal(payload.token, "forged");
});

test("invalid, mismatched and rejected responses are distinct terminal failures", async (t) => {
  const cases: [unknown, string][] = [
    [null, "Invalid broker response"],
    [3, "Invalid broker response"],
    [{ id: "wrong", ok: true }, "Broker response id mismatch"],
    [{ ok: false, error: "permission denied by fixture" }, "permission denied by fixture"],
    [{ ok: false, error: 7 }, "Broker rejected request"],
    [{ ok: "true" }, "Broker rejected request"],
  ];
  for (const [frame, message] of cases) {
    await t.test(message, async (child) => {
      const fixture = await brokerFixture(child, (request, socket) => {
        const response = frame && typeof frame === "object" ? { id: request.id, ...frame } : frame;
        socket.end(JSON.stringify(response) + "\n");
      });
      await assert.rejects(brokerCall(fixture.connection, {}, AbortSignal.timeout(5000)), {
        message,
      });
      assert.equal(fixture.requests.length, 1, "rejection must not retry a possible side effect");
    });
  }
});

test("aborted calls never open a connection", async (t) => {
  const fixture = await brokerFixture(t, () => assert.fail("nothing should reach the broker"));
  const reason = new Error("pre-flight cancellation");
  await assert.rejects(
    brokerCall(fixture.connection, {}, AbortSignal.abort(reason)),
    (error) => error === reason,
  );
  await setImmediate();
  assert.equal(fixture.connections(), 0);
});

test("the request is a serialization-time snapshot rather than a live payload reference", async (t) => {
  const fixture = await brokerFixture(t, (request, socket) => {
    socket.end(JSON.stringify({ id: request.id, ok: true, result: request.input }) + "\n");
  });
  const input = { value: "before connect" };
  const pending = brokerCall(fixture.connection, { input }, AbortSignal.timeout(5000));
  input.value = "changed after call";
  assert.deepEqual((await pending).result, { value: "before connect" });
});

test("a serializer that produces no JSON cannot dispatch an empty request", async (t) => {
  const fixture = await brokerFixture(t, () => assert.fail("no JSON cannot be sent"));
  await assert.rejects(brokerCall(fixture.connection, { toJSON() {} }, AbortSignal.timeout(5000)), {
    name: "TypeError",
    message: "Broker request is not JSON serializable",
  });
  await setImmediate();
  assert.equal(fixture.connections(), 0);
});

test("cancellation after dispatch closes the connection and preserves the reason", async (t) => {
  let disconnected: Promise<unknown> | undefined;
  const fixture = await brokerFixture(t, (_, socket) => {
    disconnected = once(socket, "close");
  });
  const controller = new AbortController();
  const pending = brokerCall(fixture.connection, { op: "execute" }, controller.signal);
  const reason = new Error("cancel this action");
  const rejection = assert.rejects(pending, (error) => error === reason);
  await fixture.waitForRequests(1);
  controller.abort(reason);
  await rejection;
  await disconnected;
  assert.equal(fixture.live(), 0);
  assert.equal(fixture.requests.length, 1);
});

test("concurrent transactions isolate ids, payloads and cancellation", async (t) => {
  const fixture = await brokerFixture(t, (request, socket) => {
    if (request.sequence === 0) return;
    socket.end(JSON.stringify({ id: request.id, ok: true, result: request.sequence }) + "\n");
  });
  const controller = new AbortController();
  const cancelled = brokerCall(fixture.connection, { sequence: 0 }, controller.signal);
  const rejection = assert.rejects(cancelled, /fixture cancelled/);
  const rest = Array.from({ length: 8 }, (_, index) =>
    brokerCall(fixture.connection, { sequence: index + 1 }, AbortSignal.timeout(5000)),
  );
  await fixture.waitForRequests(9);
  controller.abort(new Error("fixture cancelled"));
  await rejection;
  assert.deepEqual(
    (await Promise.all(rest)).map((value) => value.result),
    [1, 2, 3, 4, 5, 6, 7, 8],
  );
  assert.equal(new Set(fixture.requests.map((request) => request.id)).size, 9);
});

test("peer disconnection and a refused local endpoint reject instead of hanging", async (t) => {
  const fixture = await brokerFixture(t, (_, socket) => {
    socket.destroy();
  });
  await assert.rejects(
    brokerCall(fixture.connection, {}, AbortSignal.timeout(5000)),
    /closed before returning/,
  );
  await assert.rejects(
    brokerCall(
      { ...fixture.connection, socketPath: fixture.connection.socketPath + "-absent" },
      {},
      AbortSignal.timeout(5000),
    ),
    (error: NodeJS.ErrnoException) => ["ENOENT", "ECONNREFUSED"].includes(error.code ?? ""),
  );
});

test("a response above 32 MiB is rejected without retaining or echoing the body", async (t) => {
  const fixture = await brokerFixture(t, (_, socket) => {
    socket.end(Buffer.alloc(32 * 1024 * 1024 + 1, 120));
  });
  await assert.rejects(brokerCall(fixture.connection, {}, AbortSignal.timeout(15000)), {
    message: "Broker frame exceeded 33554432 bytes",
  });
});

test("serialization failures reject before connect and do not crash the host process", async (t) => {
  const fixture = await brokerFixture(t, () => assert.fail("serialization must precede transport"));
  const source = `
    import assert from 'node:assert/strict';
    import { brokerCall } from ${JSON.stringify(new URL("../src/ipc.ts", import.meta.url).href)};
    const circular = {}; circular.self = circular;
    for (const input of [circular, 1n, { get unsafe() { throw new TypeError('fixture getter'); } }]) {
      await assert.rejects(brokerCall(${JSON.stringify(fixture.connection)}, { input }, AbortSignal.timeout(2000)), TypeError);
    }
    console.log('serialization failures safely rejected');
  `;
  const child = await new Promise<{ error: Error | null; stdout: string; stderr: string }>(
    (resolve) => {
      execFile(
        process.execPath,
        ["--import", "tsx", "--input-type=module", "--eval", source],
        { timeout: 10000 },
        (error, stdout, stderr) => resolve({ error, stdout, stderr }),
      );
    },
  );
  assert.equal(child.error, null, child.stderr);
  assert.match(child.stdout, /serialization failures safely rejected/);
  assert.equal(fixture.connections(), 0);
});

test("cancellation during request serialization is observed before opening the socket", async (t) => {
  const fixture = await brokerFixture(t, () => {});
  const controller = new AbortController();
  const reason = new Error("serialization cancelled");
  const input = {
    toJSON() {
      controller.abort(reason);
      return { value: 42 };
    },
  };
  await assert.rejects(
    brokerCall(fixture.connection, { input }, controller.signal),
    (error) => error === reason,
  );
  await setImmediate();
  assert.equal(fixture.connections(), 0);
});
