// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Knorvia Studio contributors
import assert from "node:assert/strict";
import { test, type TestContext } from "node:test";
import { mkdtemp, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve, relative, isAbsolute } from "node:path";
import https from "node:https";
import {
  api,
  options,
  url,
  fetchWith,
  timers,
  rejected,
  portError,
  nodeWith,
  type Request,
  turn,
} from "./http-transport.fixture.js";

async function directory(t: TestContext) {
  const base = resolve(tmpdir()),
    path = await mkdtemp(join(base, "knorvia-http-owned-"));
  const inside = relative(base, resolve(path));
  assert.ok(
    inside.startsWith("knorvia-http-owned-") && !isAbsolute(inside) && !inside.includes(".."),
  );
  t.after(() => rm(path, { recursive: true, force: true }));
  return path;
}
test("regular factory retains mutable adapter options for subsequent requests", async (t) => {
  const time = timers(t),
    mutable = { env: {}, timeoutMs: 11 };
  fetchWith(t, async () => new Response(null));
  const adapter = api.createNodeHttpClientAdapter(mutable);
  await adapter.request({ url });
  mutable.timeoutMs = 22;
  await adapter.request({ url });
  assert.deepEqual(time.delays, [11, 22]);
  assert.equal(time.cleared.length, 2);
});
test("WebFetch factory snapshots top-level options once", async (t) => {
  const time = timers(t),
    mutable = { env: {}, timeoutMs: 11 };
  const adapter = api.createNodeWebFetchHttpClientAdapter(mutable);
  mutable.timeoutMs = 22;
  fetchWith(t, async () => new Response(null));
  await adapter.request({ url });
  assert.deepEqual(time.delays, [11]);
});
test("regular factory ignores captured shell proxy by default", async (t) => {
  const fetch = fetchWith(t, async () => new Response(null));
  const result = await api
    .createNodeHttpClientAdapter({
      ...options,
      env: {
        KNORVIA_TOOL_ENV_PASSTHROUGH_JSON: JSON.stringify({
          HTTP_PROXY: "http://proxy.invalid:8080",
        }),
      },
    })
    .request({ url });
  assert.equal(fetch.mock.callCount(), 1);
  assert.equal(result.egress?.proxied, false);
});
test("WebFetch keeps nested env reference and forces captured proxy fallback", async (t) => {
  const env: Record<string, string> = {};
  const adapter = api.createNodeWebFetchHttpClientAdapter({
    ...options,
    env,
    capturedUserProxyEnvFallback: false,
  });
  env.KNORVIA_TOOL_ENV_PASSTHROUGH_JSON = JSON.stringify({
    HTTP_PROXY: "http://proxy.invalid:8080",
  });
  nodeWith(t);
  const result = await adapter.request({ url: "http://target.invalid/" });
  assert.equal(result.egress?.proxied, true);
  assert.equal(result.egress?.proxyHost, "proxy.invalid:8080");
  assert.equal(result.egress?.proxySource, "env:KNORVIA_TOOL_ENV_PASSTHROUGH_JSON.HTTP_PROXY");
});
test("proxy report excludes user info and path, with all five own fields", async (t) => {
  nodeWith(t);
  const result = await new api.NodeHttpClientAdapter({
    ...options,
    proxyUrl: "http://fixture-user:fixture-pass@proxy.invalid:8443/path?q=ignored",
  }).request({ url: "http://target.invalid/" });
  assert.deepEqual(result.egress, {
    customCa: false,
    noProxyMatched: undefined,
    proxied: true,
    proxyHost: "proxy.invalid:8443",
    proxySource: "network.httpProxy",
  });
});
test("noProxy removes selected proxy and reports the match", async (t) => {
  const fetch = fetchWith(t, async () => new Response(null));
  const result = await new api.NodeHttpClientAdapter({
    ...options,
    proxyUrl: "http://proxy.invalid:8080",
    noProxy: "target.invalid",
  }).request({ url });
  assert.equal(fetch.mock.callCount(), 1);
  assert.deepEqual(result.egress, {
    customCa: false,
    noProxyMatched: true,
    proxied: false,
    proxyHost: undefined,
    proxySource: undefined,
  });
});
test("public egress rejects selected proxy before DNS or transport", async (t) => {
  let calls = 0;
  const fetch = fetchWith(t, async () => {
    throw new Error("unexpected fetch");
  });
  const fixture = nodeWith(t);
  const adapter = new api.NodeHttpClientAdapter({
    ...options,
    proxyUrl: "http://proxy.invalid:8080",
    dnsLookup: async () => {
      calls++;
      return [{ address: "8.8.8.8", family: 4 }];
    },
  });
  const error = portError(
    await rejected(adapter.request({ url, egressPolicy: "public" })),
    "egress_blocked",
  );
  assert.equal(
    error.message,
    "HTTP public egress cannot use a proxy because proxy-side DNS resolution cannot be verified",
  );
  assert.equal(calls, 0);
  assert.equal(fetch.mock.callCount(), 0);
  assert.equal(fixture.requests.length, 0);
});
test("CA preparation failure is raw and happens before listener or timer creation", async (t) => {
  const dir = await directory(t),
    caCertFile = join(dir, "absent.pem"),
    time = timers(t),
    parent = new AbortController();
  const fetch = fetchWith(t, async () => new Response(null));
  const error = await rejected(
    new api.NodeHttpClientAdapter({ env: {}, caCertFile }).request(
      { url },
      { signal: parent.signal },
    ),
  );
  assert.ok(error instanceof Error);
  assert.equal((error as NodeJS.ErrnoException).code, "ENOENT");
  assert.notEqual(error.name, "HttpClientPortError");
  assert.deepEqual(time.delays, []);
  assert.deepEqual(time.cleared, []);
  assert.equal(fetch.mock.callCount(), 0);
});
test("failed CA preparation is retried on the next request", async (t) => {
  const dir = await directory(t),
    caCertFile = join(dir, "later.pem"),
    adapter = new api.NodeHttpClientAdapter({ ...options, caCertFile });
  fetchWith(t, async () => new Response(null));
  await rejected(adapter.request({ url: "http://target.invalid/" }));
  await writeFile(caCertFile, "owned public certificate fixture");
  const result = await adapter.request({ url: "http://target.invalid/" });
  assert.equal(result.egress?.customCa, true);
});
test("successful undefined CA is cached even if options later name an absent file", async (t) => {
  const dir = await directory(t),
    mutable: { env: Record<string, string>; timeoutMs: number; caCertFile?: string } = {
      ...options,
    };
  const adapter = new api.NodeHttpClientAdapter(mutable);
  fetchWith(t, async () => new Response(null));
  await adapter.request({ url });
  mutable.caCertFile = join(dir, "absent.pem");
  assert.equal((await adapter.request({ url })).egress?.customCa, false);
});
test("successful CA bytes persist across file changes and force only HTTPS into Node", async (t) => {
  const dir = await directory(t),
    caCertFile = join(dir, "owned.pem");
  await writeFile(caCertFile, "first owned public CA");
  const adapter = new api.NodeHttpClientAdapter({ ...options, caCertFile });
  const fetch = fetchWith(t, async () => new Response(null));
  assert.equal((await adapter.request({ url: "http://target.invalid/" })).egress?.customCa, true);
  await writeFile(caCertFile, "second owned public CA");
  const fixture = nodeWith(t, { protocol: "https" });
  await adapter.request({ url });
  assert.equal(fetch.mock.callCount(), 1);
  const agent = fixture.requests[0]?.agent;
  assert.ok(agent instanceof https.Agent);
  assert.equal((agent.options.ca as Buffer).toString(), "first owned public CA");
});
test("public preflight retains early URL and limits but reads method/body/headers afterward", async (t) => {
  const dns = Promise.withResolvers<Array<{ address: string; family: number }>>();
  const request: Request = {
    url: "http://target.invalid/original",
    egressPolicy: "public",
    maxResponseBytes: 100,
  };
  const fixture = nodeWith(t, { body: "ok" });
  const adapter = new api.NodeHttpClientAdapter({ ...options, dnsLookup: () => dns.promise });
  const pending = adapter.request(request);
  request.url = "http://changed.invalid/new";
  request.maxResponseBytes = 0;
  request.method = "POST";
  request.body = new Uint8Array([1, 2]);
  request.headers = { "x-later": "yes" };
  dns.resolve([{ address: "8.8.8.8", family: 4 }]);
  const result = await pending;
  await turn();
  assert.equal(result.url, "http://target.invalid/original");
  assert.equal(result.bytes, 2);
  assert.equal(fixture.requests[0]?.method, "POST");
  assert.equal(fixture.requests[0]?.hostname, "target.invalid");
  assert.equal(fixture.requests[0]?.path, "/original");
  const sent = fixture.requests[0];
  assert.ok(sent);
  assert.equal((sent.headers as Record<string, string>)["x-later"], "yes");
  assert.deepEqual(fixture.endedBody, Buffer.from([1, 2]));
});
