// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Knorvia Studio contributors
import assert from "node:assert/strict";
import http from "node:http";
import type { createNetworkProxyFetch } from "../src/network/proxy-fetch.js";
const [target, mode] = process.argv.slice(2);
assert.ok(target && mode);
const api = (await import(target)) as { createNetworkProxyFetch: typeof createNetworkProxyFetch };
const status = mode === "body-abort" ? 200 : Number(mode);
assert.ok([200, 204, 205, 304].includes(status));
const cancel = new AbortController(),
  reason = new Error("owned native body abort"),
  errors: unknown[] = [];
const onException = (error: Error) => {
  errors.push({ name: error.name, message: error.message });
};
process.on("uncaughtException", onException);
const requests: string[] = [],
  server = http.createServer((request, response) => {
    requests.push(request.url ?? "");
    response.writeHead(status, { "content-type": "text/plain" });
    if (mode === "body-abort") response.write("owned");
    else response.end(status === 200 ? "owned" : undefined);
  });
await new Promise<void>((resolve, reject) => {
  server.once("error", reject);
  server.listen(0, "127.0.0.1", resolve);
});
const address = server.address();
assert.ok(address && typeof address === "object");
let outcome: Record<string, unknown> = { state: "pending" };
const fetch = api.createNetworkProxyFetch({
  env: {},
  httpProxy: `http://127.0.0.1:${address.port}`,
  fetch: async () => {
    throw new Error("unexpected direct path");
  },
});
const settled = fetch("http://target.invalid/native-owned", { signal: cancel.signal })
  .then(
    async (response) => {
      if (mode === "body-abort") {
        const reader = response.body?.getReader();
        assert.ok(reader);
        const first = await reader.read();
        const pending = reader.read();
        // 回归：先强制垃圾回收再取消。修复前代理只持有临时 Request 的弱跟随 signal，
        // 回收后取消传不到响应体，读取永久挂起（全量测试高负载下偶发）。
        for (let round = 0; round < 3; round += 1) {
          (globalThis as { gc?: () => void }).gc?.();
          await new Promise((resolve) => setImmediate(resolve));
        }
        cancel.abort(reason);
        try {
          const value = await pending;
          outcome = { state: "unexpected-read", done: value.done };
        } catch (error) {
          outcome = {
            state: "body-rejected",
            sameReason: error === reason,
            first: new TextDecoder().decode(first.value),
            status: response.status,
          };
        } finally {
          reader.releaseLock();
        }
      } else
        outcome = {
          state: "fulfilled",
          status: response.status,
          nullBody: response.body === null,
          text: await response.text(),
        };
    },
    (error) => {
      outcome = { state: "rejected", name: error?.name, message: error?.message };
    },
  )
  .catch((error) => {
    outcome = { state: "consumer-error", name: error?.name, message: error?.message };
  });
// 先等请求链真正结束再取结果（上限 20s，真卡死仍以 pending 失败），再保留 500ms 观察期
// 捕获迟到的逃逸异常；结果不依赖机器快慢。
let limit: ReturnType<typeof setTimeout> | undefined;
await Promise.race([settled, new Promise((resolve) => (limit = setTimeout(resolve, 20_000)))]);
clearTimeout(limit);
await new Promise((resolve) => setTimeout(resolve, 500));
const snapshot = { outcome, errors: [...errors], requests: [...requests] };
cancel.abort(new Error("owned child cleanup"));
server.closeAllConnections();
await new Promise<void>((resolve) => server.close(() => resolve()));
await new Promise((resolve) => setImmediate(resolve));
process.off("uncaughtException", onException);
console.log(JSON.stringify(snapshot));
