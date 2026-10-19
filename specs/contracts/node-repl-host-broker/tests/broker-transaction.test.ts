// SPDX-License-Identifier: Apache-2.0
import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { randomUUID } from "node:crypto";
import { EventEmitter, once } from "node:events";
import { mkdtemp, rm } from "node:fs/promises";
import { createServer, type Socket } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { setImmediate } from "node:timers/promises";
import { test, type TestContext } from "node:test";
import { brokerCall } from "../../../../apps/cli/packages/node-repl-host/src/ipc.js";
import type { BrokerConnection } from "../../../../apps/cli/packages/node-repl-host/src/broker-transaction.js";

type Request = Record<string, unknown>;

async function brokerFixture(t: TestContext, respond: (request: Request, socket: Socket) => void) {
  const directory = await mkdtemp(join(tmpdir(), "knorvia-broker-contract-"));
  const socketPath =
    process.platform === "win32"
      ? `\\\\.\\pipe\\knorvia-broker-contract-${randomUUID()}`
      : join(directory, "broker.sock");
  const sockets = new Set<Socket>();
  const requests: Request[] = [];
  const received = new EventEmitter();
  let connections = 0;
  const server = createServer((socket) => {
    connections += 1;
    sockets.add(socket);
    socket.on("error", () => {});
    socket.once("close", () => sockets.delete(socket));
    let bytes = Buffer.alloc(0);
    const receive = (chunk: Buffer) => {
      bytes = Buffer.concat([bytes, chunk]);
      const end = bytes.indexOf(10);
      if (end < 0) return;
      socket.off("data", receive);
      const request = JSON.parse(bytes.subarray(0, end).toString("utf8")) as Request;
      requests.push(request);
      respond(request, socket);
      received.emit("request");
    };
    socket.on("data", receive);
  });
  t.after(async () => {
    for (const socket of sockets) socket.destroy();
    await new Promise<void>((resolve, reject) =>
      server.close((error) => (error ? reject(error) : resolve())),
    );
    await rm(directory, { recursive: true, force: true });
  });
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(socketPath, resolve);
  });
  return {
    connection: { socketPath, token: "contract-only-broker-token" } satisfies BrokerConnection,
    requests,
    connections: () => connections,
    live: () => sockets.size,
    async waitForRequests(count: number) {
      while (requests.length < count) await once(received, "request", { signal: t.signal });
    },
  };
}

test("B1 公开入口只暴露 brokerCall / BrokerConnection，一次调用拥有自己的连接", async (t) => {
  const fixture = await brokerFixture(t, (request, socket) => {
    socket.end(JSON.stringify({ id: request.id, ok: true }) + "\n");
  });
  assert.equal(typeof brokerCall, "function");
  const first = await brokerCall(fixture.connection, { op: "first" }, AbortSignal.timeout(5000));
  const second = await brokerCall(fixture.connection, { op: "second" }, AbortSignal.timeout(5000));
  assert.equal(fixture.connections(), 2, "每次调用只建立一条自己的连接");
  assert.equal(fixture.requests.length, 2);
  assert.notEqual(first.id, second.id);
});

test("B2 信封固定覆盖 id/token，序列化先于连接且载荷不被改写", async (t) => {
  const fixture = await brokerFixture(t, (request, socket) => {
    socket.end(JSON.stringify({ id: request.id, ok: true, result: request.input }) + "\n");
  });
  const payload = Object.freeze({ id: "forged", token: "forged", op: "list", input: { value: 7 } });
  const result = await brokerCall(fixture.connection, payload, AbortSignal.timeout(5000));
  assert.equal(fixture.requests.length, 1);
  const request = fixture.requests[0]!;
  assert.match(request.id as string, /^[a-f0-9-]{36}$/u);
  assert.notEqual(request.id, "forged");
  assert.equal(request.token, fixture.connection.token);
  assert.deepEqual(request.input, { value: 7 });
  assert.deepEqual(result, { id: request.id, ok: true, result: { value: 7 } });
  assert.deepEqual(payload, { id: "forged", token: "forged", op: "list", input: { value: 7 } });
});

test("B2 请求是调用时的快照", async (t) => {
  const fixture = await brokerFixture(t, (request, socket) => {
    socket.end(JSON.stringify({ id: request.id, ok: true, result: request.input }) + "\n");
  });
  const input = { value: "before connect" };
  const pending = brokerCall(fixture.connection, { input }, AbortSignal.timeout(5000));
  input.value = "changed after call";
  assert.deepEqual((await pending).result, { value: "before connect" });
});

test("B2 不可序列化的载荷先拒绝且不连接", async (t) => {
  const fixture = await brokerFixture(t, () => assert.fail("serialization must precede transport"));
  await assert.rejects(brokerCall(fixture.connection, { toJSON() {} }, AbortSignal.timeout(5000)), {
    name: "TypeError",
    message: "Broker request is not JSON serializable",
  });
  const circular: Record<string, unknown> = {};
  circular.self = circular;
  await assert.rejects(brokerCall(fixture.connection, { circular }, AbortSignal.timeout(5000)), {
    name: "TypeError",
  });
  await assert.rejects(brokerCall(fixture.connection, { value: 1n }, AbortSignal.timeout(5000)), {
    name: "TypeError",
  });
  await setImmediate();
  assert.equal(fixture.connections(), 0);
});

test("B2 序列化期间的取消先于连接生效", async (t) => {
  const fixture = await brokerFixture(t, () => assert.fail("cancelled before dispatch"));
  const controller = new AbortController();
  const reason = new Error("cancelled while serializing");
  const payload = {
    toJSON() {
      controller.abort(reason);
      return { op: "never-sent" };
    },
  };
  await assert.rejects(brokerCall(fixture.connection, payload, controller.signal), (error) => {
    return error === reason;
  });
  await setImmediate();
  assert.equal(fixture.connections(), 0);
});

test("B3 响应必须是对象且 id 精确匹配，失败错误保持原文或固定文案", async (t) => {
  const cases: [unknown, string][] = [
    [null, "Invalid broker response"],
    [3, "Invalid broker response"],
    [{ id: "wrong", ok: true }, "Broker response id mismatch"],
    [{ ok: false, error: "permission denied by contract" }, "permission denied by contract"],
    [{ ok: false, error: 7 }, "Broker rejected request"],
    [{ ok: false }, "Broker rejected request"],
    [{ ok: "true" }, "Broker rejected request"],
  ];
  for (const [frame, message] of cases) {
    await t.test(message, async (subtest) => {
      const fixture = await brokerFixture(subtest, (request, socket) => {
        const response = frame && typeof frame === "object" ? { id: request.id, ...frame } : frame;
        socket.end(JSON.stringify(response) + "\n");
      });
      await assert.rejects(brokerCall(fixture.connection, {}, AbortSignal.timeout(5000)), {
        message,
      });
      assert.equal(fixture.requests.length, 1, "失败不得重试可能的副作用");
    });
  }
});

test("B3 成功的多字节分片响应按帧关联并原样返回", async (t) => {
  const fixture = await brokerFixture(t, (request, socket) => {
    const bytes = Buffer.from(
      JSON.stringify({ id: request.id, ok: true, result: "中文 🌿" }) + "\n",
    );
    for (const byte of bytes) socket.write(Buffer.from([byte]));
  });
  const result = await brokerCall(fixture.connection, {}, AbortSignal.timeout(5000));
  assert.deepEqual(result, { id: fixture.requests[0]!.id, ok: true, result: "中文 🌿" });
});

test("B4 调度后的取消销毁连接并保留 reason，不重试", async (t) => {
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

test("B4 对端断连与拒绝连接明确失败", async (t) => {
  const fixture = await brokerFixture(t, (_, socket) => {
    socket.destroy();
  });
  await assert.rejects(
    brokerCall(fixture.connection, {}, AbortSignal.timeout(5000)),
    /closed before returning/u,
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

test("B4 序列化异常不会结束宿主进程", async (t) => {
  const fixture = await brokerFixture(t, () => assert.fail("serialization must precede transport"));
  const entry = new URL("../../../../apps/cli/packages/node-repl-host/src/ipc.ts", import.meta.url)
    .href;
  const source = `
    import assert from 'node:assert/strict';
    import { brokerCall } from ${JSON.stringify(entry)};
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
  assert.match(child.stdout, /serialization failures safely rejected/u);
  assert.equal(fixture.connections(), 0);
});

test("B5 超过 32 MiB 的响应有界失败且不回显正文", async (t) => {
  const fixture = await brokerFixture(t, (_, socket) => {
    socket.end(Buffer.alloc(32 * 1024 * 1024 + 1, 120));
  });
  await assert.rejects(brokerCall(fixture.connection, {}, AbortSignal.timeout(15000)), {
    message: "Broker frame exceeded 33554432 bytes",
  });
});

test("B6 并发事务隔离 UUID、载荷与取消状态", async (t) => {
  const fixture = await brokerFixture(t, (request, socket) => {
    if (request.sequence === 0) return;
    socket.end(JSON.stringify({ id: request.id, ok: true, result: request.sequence }) + "\n");
  });
  const controller = new AbortController();
  const cancelled = brokerCall(fixture.connection, { sequence: 0 }, controller.signal);
  const rejection = assert.rejects(cancelled, /fixture cancelled/u);
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
