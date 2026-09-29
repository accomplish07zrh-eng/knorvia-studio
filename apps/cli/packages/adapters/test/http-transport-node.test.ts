// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Knorvia Studio contributors
import assert from "node:assert/strict";
import { test } from "node:test";
import {
  api,
  options,
  nodeWith,
  nativeProbe,
  portError,
  rejected,
  turn,
  completedBeforeCleanup,
  type Request,
} from "./http-transport.fixture.js";
const targetUrl = "http://target.invalid:8123/path?q=one#fragment";
const publicDns = async () => [{ address: "8.8.8.8", family: 4 }];

test("public direct Node request retains options, lookup and normalized result metadata", async (t) => {
  let calls = 0;
  const fixture = nodeWith(t, {
    status: 202,
    statusText: "Accepted",
    headers: { "x-values": ["one", "two"], "x-number": 12, "x-absent": undefined },
    body: "abc",
  });
  const result = await new api.NodeHttpClientAdapter({
    ...options,
    dnsLookup: async (host, flags) => {
      calls++;
      assert.equal(host, calls === 1 ? "target.invalid" : "other.invalid");
      assert.deepEqual(flags, { all: true, verbatim: true });
      return publicDns();
    },
  }).request({ url: targetUrl, egressPolicy: "public" });
  assert.equal(calls, 1);
  assert.equal(result.url, targetUrl);
  assert.equal(result.status, 202);
  assert.equal(result.statusText, "Accepted");
  assert.equal(result.bytes, 3);
  assert.equal(result.headers["x-values"], "one, two");
  assert.equal(result.headers["x-number"], "12");
  assert.equal(result.headers["x-absent"], undefined);
  const sent = fixture.requests[0];
  assert.ok(sent);
  assert.equal(sent.hostname, "target.invalid");
  assert.equal(sent.port, "8123");
  assert.equal(sent.path, "/path?q=one");
  assert.equal(sent.protocol, "http:");
  assert.equal(sent.agent, undefined);
  assert.equal(sent.auth, undefined);
  assert.ok(sent.lookup);
  await new Promise<void>((resolve, reject) =>
    sent.lookup!("Other.INVALID", {}, (error, address, family) => {
      if (error) {
        reject(error);
        return;
      }
      assert.equal(address, "8.8.8.8");
      assert.equal(family, 4);
      resolve();
    }),
  );
  assert.equal(calls, 2);
});
test("Node transport does not follow a redirect or forward URL userinfo", async (t) => {
  const fixture = nodeWith(t, {
    status: 302,
    statusText: "Found",
    headers: { location: "https://other.invalid/" },
    body: "redirect",
  });
  const result = await new api.NodeHttpClientAdapter({ ...options, dnsLookup: publicDns }).request({
    url: "http://owned-user:owned-pass@target.invalid/path",
    egressPolicy: "public",
    redirect: "follow",
  });
  assert.equal(result.status, 302);
  assert.equal(fixture.requests.length, 1);
  assert.equal(fixture.requests[0]?.auth, undefined);
});
test("proxy path leaves connection lookup to ProxyAgent and classifies request errors", async (t) => {
  const cause = new Error("owned proxy failure"),
    fixture = nodeWith(t, { hasRequestError: true, requestError: cause });
  const error = portError(
    await rejected(
      new api.NodeHttpClientAdapter({ ...options, proxyUrl: "http://proxy.invalid:8080" }).request({
        url: targetUrl,
      }),
    ),
    "proxy_error",
    targetUrl,
  );
  assert.equal(error.cause, cause);
  assert.equal(error.message, cause.message);
  assert.equal(fixture.requests[0]?.lookup, undefined);
});
test("plain Node transport request error keeps original cause", async (t) => {
  const cause = new Error("owned connection"),
    fixture = nodeWith(t, { hasRequestError: true, requestError: cause });
  const error = portError(
    await rejected(
      new api.NodeHttpClientAdapter({ ...options, dnsLookup: publicDns }).request({
        url: targetUrl,
        egressPolicy: "public",
      }),
    ),
    "network_error",
    targetUrl,
  );
  assert.equal(error.cause, cause);
  assert.equal(fixture.escaped.length, 0);
});
for (const status of [204, 205, 304])
  test(`Node status ${status} releases a stalled no-body message and returns zero bytes`, async (t) => {
    const fixture = nodeWith(t, { status, stall: true });
    const result = await new api.NodeHttpClientAdapter({
      ...options,
      dnsLookup: publicDns,
    }).request({ url: targetUrl, egressPolicy: "public" });
    assert.equal(result.status, status);
    assert.equal(result.bytes, 0);
    assert.deepEqual([...result.body], []);
    assert.equal(fixture.reads, 0);
    assert.ok(fixture.message.destroyed);
    assert.ok(fixture.destroyCount > 0);
    assert.deepEqual(fixture.escaped, []);
  });
test("HEAD uses sent method even if caller changes it before response", async (t) => {
  const request: Request = { url: targetUrl, method: "HEAD", egressPolicy: "public" };
  const fixture = nodeWith(t, {
    stall: true,
    beforeResponse: () => {
      request.method = "GET";
    },
  });
  const result = await completedBeforeCleanup((signal) =>
    new api.NodeHttpClientAdapter({ ...options, dnsLookup: publicDns }).request(request, {
      signal,
    }),
  );
  assert.equal(result.bytes, 0);
  assert.equal(fixture.reads, 0);
  assert.equal(fixture.requests[0]?.method, "HEAD");
  assert.ok(fixture.message.destroyed);
});
test("sent GET is not turned into HEAD by a later caller mutation", async (t) => {
  const request: Request = { url: targetUrl, method: "GET", egressPolicy: "public" };
  nodeWith(t, {
    body: "get body",
    beforeResponse: () => {
      request.method = "HEAD";
    },
  });
  const result = await new api.NodeHttpClientAdapter({ ...options, dnsLookup: publicDns }).request(
    request,
  );
  assert.equal(result.bytes, 8);
});
test("no-body status still checks declared Content-Length against max bytes", async (t) => {
  const fixture = nodeWith(t, { status: 204, headers: { "content-length": "100" }, stall: true });
  const error = portError(
    await rejected(
      new api.NodeHttpClientAdapter({ ...options, dnsLookup: publicDns }).request({
        url: targetUrl,
        egressPolicy: "public",
        maxResponseBytes: 1,
      }),
    ),
    "too_large",
    targetUrl,
  );
  assert.equal(error.status, 204);
  assert.ok(fixture.message.destroyed);
  assert.deepEqual(fixture.escaped, []);
});
for (const cause of [new Error("owned conversion"), undefined, "owned primitive"])
  test(`async metadata failure ${String(cause)} rejects without escaping or replacing cause`, async (t) => {
    const fixture = nodeWith(t, {
      stall: true,
      alterMessage: (message) => {
        Object.defineProperty(message, "statusCode", {
          get() {
            throw cause;
          },
        });
      },
    });
    const error = portError(
      await rejected(
        new api.NodeHttpClientAdapter({ ...options, dnsLookup: publicDns }).request({
          url: targetUrl,
          egressPolicy: "public",
        }),
      ),
      "network_error",
      targetUrl,
    );
    assert.equal(error.cause, cause);
    assert.ok(fixture.message.destroyed);
    assert.deepEqual(fixture.escaped, []);
  });
test("invalid native Response status is rejected and its message is released", async (t) => {
  const fixture = nodeWith(t, { status: 600, stall: true });
  const error = portError(
    await rejected(
      new api.NodeHttpClientAdapter({ ...options, dnsLookup: publicDns }).request({
        url: targetUrl,
        egressPolicy: "public",
      }),
    ),
    "network_error",
    targetUrl,
  );
  assert.ok(error.cause instanceof RangeError);
  assert.ok(fixture.message.destroyed);
  assert.deepEqual(fixture.escaped, []);
});
test("late message error after no-body release stays owned", async (t) => {
  const fixture = nodeWith(t, { status: 205, stall: true });
  assert.equal(
    (
      await new api.NodeHttpClientAdapter({ ...options, dnsLookup: publicDns }).request({
        url: targetUrl,
        egressPolicy: "public",
      })
    ).bytes,
    0,
  );
  assert.doesNotThrow(() => fixture.message.emit("error", new Error("owned late release event")));
  await turn();
});
for (const status of [200, 204, 205, 304])
  test(`native owned loopback proxy returns status ${status} without escaped exception`, async () => {
    const result = await nativeProbe(String(status));
    assert.equal(result.terminal.state, "fulfilled");
    assert.equal(result.terminal.status, status);
    assert.equal(result.terminal.bytes, status === 200 ? 17 : 0);
    assert.deepEqual(result.escaped, []);
    assert.equal(result.observed.length, 1);
    assert.equal(result.observed[0]?.trace, "owned-native-trace");
    assert.equal(result.observed[0]?.url, "http://owned-target.invalid/resource?q=one");
  });
test("native owned proxy invalid status becomes request rejection", async () => {
  const result = await nativeProbe("600");
  assert.equal(result.terminal.state, "rejected");
  assert.equal(result.terminal.code, "proxy_error");
  assert.deepEqual(result.escaped, []);
});
test("native HEAD retains Content-Length limit behavior", async () => {
  const result = await nativeProbe("head-limit");
  assert.equal(result.terminal.state, "rejected");
  assert.equal(result.terminal.code, "too_large");
  assert.deepEqual(result.escaped, []);
});
