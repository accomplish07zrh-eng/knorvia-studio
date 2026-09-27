// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Knorvia contributors
import { randomUUID } from "node:crypto";
import { EventEmitter, once } from "node:events";
import { mkdtemp, rm } from "node:fs/promises";
import { createServer, type Socket } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { TestContext } from "node:test";

export function observe<T>(promise: Promise<T>) {
  let state:
    | { status: "pending" }
    | { status: "value"; value: T }
    | { status: "error"; error: unknown } = { status: "pending" };
  const settled = promise.then(
    (value) => {
      state = { status: "value", value };
    },
    (error: unknown) => {
      state = { status: "error", error };
    },
  );
  return { current: () => state, settled };
}

export async function brokerFixture(
  t: TestContext,
  respond: (request: Record<string, unknown>, socket: Socket) => void,
) {
  const directory = await mkdtemp(join(tmpdir(), "knorvia-ipc-test-"));
  const socketPath =
    process.platform === "win32"
      ? `\\\\.\\pipe\\knorvia-ipc-test-${randomUUID()}`
      : join(directory, "broker.sock");
  const sockets = new Set<Socket>();
  const requests: Record<string, unknown>[] = [];
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
      const request = JSON.parse(bytes.subarray(0, end).toString("utf8")) as Record<
        string,
        unknown
      >;
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
    connection: { socketPath, token: "test-only-local-broker-token" },
    requests,
    connections: () => connections,
    live: () => sockets.size,
    async waitForRequests(count: number) {
      while (requests.length < count) await once(received, "request", { signal: t.signal });
    },
  };
}
