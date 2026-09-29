// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Knorvia Studio contributors
import assert from "node:assert/strict";
import { test } from "node:test";
import {
  api,
  options,
  url,
  fetchWith,
  timers,
  rejected,
  portError,
  type Request,
} from "./http-transport.fixture.js";

test("public factories retain exact exports and default argument arities", () => {
  assert.deepEqual(Object.keys(api).sort(), [
    "NodeHttpClientAdapter",
    "createNodeHttpClientAdapter",
    "createNodeWebFetchHttpClientAdapter",
  ]);
  assert.equal(api.NodeHttpClientAdapter.length, 0);
  assert.equal(api.createNodeHttpClientAdapter.length, 0);
  assert.equal(api.createNodeWebFetchHttpClientAdapter.length, 0);
  assert.equal(api.NodeHttpClientAdapter.prototype.request.length, 1);
});
for (const bad of ["", "not a URL", "https://", "http://[invalid]"])
  test(`invalid URL rejects before fetch: ${JSON.stringify(bad)}`, async (t) => {
    const fetch = fetchWith(t, async () => {
      throw new Error("unexpected transport");
    });
    const error = portError(
      await rejected(new api.NodeHttpClientAdapter(options).request({ url: bad })),
      "invalid_url",
      bad,
    );
    assert.equal(error.message, `Invalid URL: ${bad}`);
    assert.ok(error.cause instanceof TypeError);
    assert.equal(fetch.mock.callCount(), 0);
    assert.equal(error.status, undefined);
  });
for (const bad of ["file:///fixture", "data:text/plain,fixture", "ftp://fixture.invalid/"])
  test(`unsupported protocol keeps input context: ${bad}`, async (t) => {
    const fetch = fetchWith(t, async () => {
      throw new Error("unexpected transport");
    });
    const error = portError(
      await rejected(new api.NodeHttpClientAdapter(options).request({ url: bad })),
      "unsupported_protocol",
      bad,
    );
    assert.equal(
      error.message,
      `Unsupported URL protocol for HTTP request: ${new URL(bad).protocol}`,
    );
    assert.equal(error.cause, undefined);
    assert.equal(fetch.mock.callCount(), 0);
  });
test("default fetch uses normalized URL, GET, Headers, manual redirect and a request-owned signal", async (t) => {
  const time = timers(t);
  const parent = new AbortController();
  const fetch = fetchWith(t, async (input, init) => {
    assert.equal(input, "https://example.invalid/path#fragment");
    assert.equal(init?.method, "GET");
    assert.equal(init?.redirect, "manual");
    assert.equal(init?.body, undefined);
    assert.ok(init?.headers instanceof Headers);
    assert.ok(init?.signal);
    assert.notEqual(init.signal, parent.signal);
    return new Response("one", { headers: { "X-Custom": "value" } });
  });
  const result = await new api.NodeHttpClientAdapter().request(
    { url: "HTTPS://EXAMPLE.INVALID:443/path#fragment" },
    { signal: parent.signal },
  );
  assert.equal(fetch.mock.callCount(), 1);
  assert.equal(result.url, "https://example.invalid/path#fragment");
  assert.equal(result.status, 200);
  assert.equal(result.body.byteLength, 3);
  assert.equal(result.bytes, 3);
  assert.equal(result.headers["x-custom"], "value");
  assert.ok(result.durationMs >= 0);
  assert.deepEqual(result.egress, {
    customCa: false,
    noProxyMatched: undefined,
    proxied: false,
    proxyHost: undefined,
    proxySource: undefined,
  });
  assert.deepEqual(time.delays, [180000]);
  assert.equal(time.cleared.length, 1);
});
test("POST copies only the provided Uint8Array window into a Buffer", async (t) => {
  const original = new Uint8Array([99, 1, 2, 98]);
  const window = original.subarray(1, 3);
  fetchWith(t, async (_, init) => {
    assert.equal(init?.method, "POST");
    assert.ok(Buffer.isBuffer(init?.body));
    assert.deepEqual([...init.body], [1, 2]);
    original[1] = 77;
    assert.equal(init.body[0], 1);
    return new Response(new Uint8Array([5, 6]));
  });
  const result = await new api.NodeHttpClientAdapter(options).request({
    url,
    method: "POST",
    body: window,
  });
  assert.deepEqual([...result.body], [5, 6]);
  assert.equal(result.bytes, 2);
});
test("empty body array is still passed as an empty Buffer", async (t) => {
  fetchWith(t, async (_, init) => {
    assert.ok(Buffer.isBuffer(init?.body));
    assert.equal(init.body.length, 0);
    return new Response(null);
  });
  assert.equal(
    (
      await new api.NodeHttpClientAdapter(options).request({
        url,
        method: "POST",
        body: new Uint8Array(),
      })
    ).bytes,
    0,
  );
});
for (const [headers, expected] of [
  [undefined, "from-trace"],
  [{ "X-KNORVIA-TRACE-ID": "explicit" }, "explicit"],
  [{ "x-knorvia-trace-id": "" }, ""],
] as const) {
  test(`trace header respects existing native Headers value ${JSON.stringify(expected)}`, async (t) => {
    fetchWith(t, async (_, init) => {
      assert.equal(new Headers(init?.headers).get("x-knorvia-trace-id"), expected);
      return new Response(null);
    });
    await new api.NodeHttpClientAdapter(options).request({
      url,
      headers,
      trace: { traceId: "from-trace" } as Request["trace"],
    });
  });
}
test("native fetch redirect and nonempty response URL remain visible", async (t) => {
  const response = new Response("found", {
    status: 404,
    statusText: "Missing",
    headers: { "x-duplicate": "a, b" },
  });
  Object.defineProperty(response, "url", { value: "https://redirected.invalid/final" });
  fetchWith(t, async (_, init) => {
    assert.equal(init?.redirect, "follow");
    return response;
  });
  const result = await new api.NodeHttpClientAdapter(options).request({ url, redirect: "follow" });
  assert.equal(result.url, response.url);
  assert.equal(result.status, 404);
  assert.equal(result.statusText, "Missing");
  assert.equal(Buffer.from(result.body).toString(), "found");
  assert.equal(result.headers["x-duplicate"], "a, b");
});
for (const limit of [0, 1])
  test(`request response-byte limit ${limit} overrides adapter default`, async (t) => {
    fetchWith(t, async () => new Response("ab"));
    const error = portError(
      await rejected(
        new api.NodeHttpClientAdapter({ ...options, maxResponseBytes: 100 }).request({
          url,
          maxResponseBytes: limit,
        }),
      ),
      "too_large",
    );
    assert.equal(error.status, 200);
  });
test("adapter byte limit applies when request leaves it absent", async (t) => {
  fetchWith(t, async () => new Response("ab"));
  portError(
    await rejected(
      new api.NodeHttpClientAdapter({ ...options, maxResponseBytes: 1 }).request({ url }),
    ),
    "too_large",
  );
});
test("duration includes preparation and clamps clock reversal at zero", async (t) => {
  const values = [100, 95];
  t.mock.method(Date, "now", () => values.shift() ?? 95);
  fetchWith(t, async () => new Response(null));
  assert.equal((await new api.NodeHttpClientAdapter(options).request({ url })).durationMs, 0);
});
test("HTTP error statuses remain successful transport results", async (t) => {
  fetchWith(
    t,
    async () => new Response("failure payload", { status: 503, statusText: "Unavailable" }),
  );
  const result = await api.createNodeHttpClientAdapter(options).request({ url });
  assert.equal(result.status, 503);
  assert.equal(result.statusText, "Unavailable");
  assert.equal(result.bytes, 15);
});
