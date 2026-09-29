// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Knorvia Studio contributors
import assert from "node:assert/strict";
import http from "node:http";
import { once } from "node:events";
import { setTimeout as wait } from "node:timers/promises";
const target = process.argv[2],
  mode = process.argv[3];
assert.ok(target && mode);
type Module = typeof import("../src/http/index.js");
const { NodeHttpClientAdapter } = (await import(target)) as Module;
const head = mode.startsWith("head"),
  status = head ? 200 : Number(mode);
assert.ok([200, 204, 205, 304, 600].includes(status));
const observed: Array<{ method?: string; url?: string; trace?: string }> = [];
const escaped: Array<{ name: string; message: string }> = [];
const capture = (error: Error) => escaped.push({ name: error.name, message: error.message });
process.on("uncaughtException", capture);
const server = http.createServer((request, response) => {
  observed.push({
    method: request.method,
    url: request.url,
    trace: request.headers["x-knorvia-trace-id"] as string | undefined,
  });
  response.writeHead(status, {
    connection: "close",
    "x-owned": "native",
    ...(head ? { "content-length": "99" } : {}),
  });
  response.end(status === 200 && !head ? "owned native body" : undefined);
});
server.listen(0, "127.0.0.1");
await once(server, "listening");
const address = server.address();
assert.ok(address && typeof address === "object");
const abort = new AbortController();
const adapter = new NodeHttpClientAdapter({
  env: {},
  timeoutMs: 0,
  proxyUrl: `http://127.0.0.1:${address.port}`,
});
let terminal: Record<string, unknown> = { state: "pending" };
const pending = adapter
  .request(
    {
      url: "http://owned-target.invalid/resource?q=one#omitted",
      method: head ? "HEAD" : "GET",
      maxResponseBytes: mode === "head-limit" ? 1 : 1024,
      headers: { "x-knorvia-trace-id": "owned-native-trace" },
    },
    { signal: abort.signal },
  )
  .then(
    (response) => {
      terminal = {
        state: "fulfilled",
        status: response.status,
        bytes: response.bytes,
        body: Buffer.from(response.body).toString(),
        headers: response.headers,
      };
    },
    (error) => {
      terminal = { state: "rejected", code: error?.code, message: error?.message };
    },
  );
// 只观察自己子进程的旧版挂起；时限不参与产品实现或新旧结果选择。
await Promise.race([pending, wait(500)]);
const result = { terminal, escaped: [...escaped], observed: [...observed] };
abort.abort(new Error("owned test cleanup"));
server.closeAllConnections();
await new Promise<void>((resolve) => server.close(() => resolve()));
await wait(10);
process.off("uncaughtException", capture);
process.stdout.write(JSON.stringify(result));
