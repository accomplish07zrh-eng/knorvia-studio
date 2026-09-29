// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Knorvia Studio contributors
import assert from "node:assert/strict";
import test from "node:test";
import https from "node:https";
import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import {
  api,
  directory,
  fulfilled,
  nodeFixture,
  options,
  rejected,
  turns,
  url,
  watch,
} from "./proxy-fetch.fixture.js";

test("single public factory keeps arity and returns direct fetch identity without policy", () => {
  const direct = async () => new Response("owned");
  assert.deepEqual(Object.keys(api), ["createNetworkProxyFetch"]);
  assert.equal(api.createNetworkProxyFetch.length, 1);
  assert.equal(api.createNetworkProxyFetch({ fetch: direct }), direct);
  assert.equal(
    api.createNetworkProxyFetch({ fetch: direct, caCertFile: "", httpProxy: "", noProxy: "" }),
    direct,
  );
  assert.equal(api.createNetworkProxyFetch({ fetch: direct, env: {} }).length, 2);
});
test("factory captures and binds the then-current global fetch", async (t) => {
  const seen: unknown[] = [],
    response = new Response("captured");
  t.mock.method(globalThis, "fetch", async function (this: unknown) {
    seen.push(this);
    return response;
  });
  const fetch = api.createNetworkProxyFetch({});
  t.mock.method(globalThis, "fetch", async () => {
    throw new Error("later global fetch");
  });
  assert.equal(await fetch(url), response);
  assert.deepEqual(seen, [globalThis]);
});
test("unwrapped factory does not acquire later policy changes", async () => {
  const response = new Response("direct"),
    direct: typeof globalThis.fetch = async () => response,
    mutable = { fetch: direct, httpProxy: "" };
  const fetch = api.createNetworkProxyFetch(mutable);
  mutable.httpProxy = options.httpProxy;
  assert.equal(fetch, direct);
  assert.equal(await fetch(url), response);
});
for (const input of ["invalid URL", "ftp://target.invalid/", new URL("https://target.invalid/")])
  test(`no selected policy forwards original input and init: ${String(input)}`, async () => {
    const init: RequestInit = { method: "POST", body: "owned body" },
      calls: unknown[][] = [],
      response = new Response("direct");
    const direct: typeof fetch = async (...args) => {
      calls.push(args);
      return response;
    };
    assert.equal(
      await api.createNetworkProxyFetch({ env: {}, fetch: direct })(input, init),
      response,
    );
    assert.equal(calls[0]?.[0], input);
    assert.equal(calls[0]?.[1], init);
  });
test("input URL access failure is delegated with original arguments", async () => {
  const input = {
    toString() {
      throw new Error("owned coercion");
    },
  } as unknown as URL;
  const seen: unknown[] = [];
  const fetch = api.createNetworkProxyFetch({
    ...options,
    fetch: async (value) => {
      seen.push(value);
      return new Response("direct");
    },
  });
  assert.equal(await (await fetch(input)).text(), "direct");
  assert.equal(seen[0], input);
});
test("valid URL configuration failure rejects instead of falling back", async () => {
  const reason = new Error("owned option getter");
  let calls = 0;
  const fetch = api.createNetworkProxyFetch({
    env: {},
    fetch: async () => {
      calls++;
      return new Response(null);
    },
    get noProxy(): string {
      throw reason;
    },
  });
  const state = watch(fetch(url));
  await turns();
  assert.equal(rejected(state()), reason);
  assert.equal(calls, 0);
});
test("direct fallback rejection preserves original error", async () => {
  const reason = new Error("owned direct failure"),
    state = watch(
      api.createNetworkProxyFetch({
        env: {},
        fetch: async () => {
          throw reason;
        },
      })(url),
    );
  await turns();
  assert.equal(rejected(state()), reason);
});
test("current no-proxy rules may switch a wrapper back to raw direct fetch", async (t) => {
  const response = new Response("direct"),
    mutable = { ...options, noProxy: "*", fetch: async () => response };
  const fetch = api.createNetworkProxyFetch(mutable);
  assert.equal(await fetch(url), response);
  mutable.noProxy = "";
  const fixture = nodeFixture(t);
  assert.equal(await (await fetch(url)).text(), "owned");
  assert.equal(fixture.captured.length, 1);
});
test("captured user proxies alone do not activate this ordinary resolver", async () => {
  const response = new Response("direct"),
    env = { KNORVIA_TOOL_ENV_PASSTHROUGH_JSON: JSON.stringify({ https_proxy: options.httpProxy }) };
  assert.equal(
    await api.createNetworkProxyFetch({ env, fetch: async () => response })(url),
    response,
  );
});
test("native Request validation precedes selected missing CA", async (t) => {
  const dir = await directory(t),
    fixture = nodeFixture(t),
    state = watch(
      api.createNetworkProxyFetch({ ...options, caCertFile: join(dir, "absent.pem") })(url, {
        method: "GET",
        body: "invalid",
      }),
    );
  await turns();
  assert.ok(rejected(state()) instanceof TypeError);
  assert.equal(fixture.captured.length, 0);
});
test("missing CA failure precedes already-aborted transport", async (t) => {
  const dir = await directory(t),
    fixture = nodeFixture(t),
    cancel = new AbortController(),
    reason = new Error("abort after preparation");
  cancel.abort(reason);
  const state = watch(
    api.createNetworkProxyFetch({ ...options, caCertFile: join(dir, "absent.pem") })(url, {
      signal: cancel.signal,
    }),
  );
  await turns();
  const error = rejected(state());
  assert.ok(error instanceof Error);
  assert.equal((error as NodeJS.ErrnoException).code, "ENOENT");
  assert.equal(fixture.captured.length, 0);
});
test("consumed Request body fails before transport or CA read", async (t) => {
  const dir = await directory(t),
    request = new Request(url, { method: "POST", body: "owned" });
  await request.text();
  const fixture = nodeFixture(t),
    state = watch(
      api.createNetworkProxyFetch({ ...options, caCertFile: join(dir, "absent.pem") })(request),
    );
  await turns();
  assert.ok(rejected(state()) instanceof TypeError);
  assert.equal(fixture.captured.length, 0);
});
test("native Request method headers body and URL map to the Node request", async (t) => {
  const fixture = nodeFixture(t),
    input = new Request(url, { method: "POST", headers: { "X-Initial": "old" }, body: "initial" });
  const response = await api.createNetworkProxyFetch(options)(input, {
    method: "PUT",
    headers: { "X-Owned": "value" },
    body: new Uint8Array([0, 128, 255]),
  });
  assert.equal(await response.text(), "owned");
  const sent = fixture.captured[0];
  assert.ok(sent);
  assert.equal(sent.hostname, "target.invalid");
  assert.equal(sent.path, "/resource?owned=1");
  assert.equal(sent.method, "PUT");
  assert.equal(sent.protocol, "http:");
  assert.equal(sent.port, undefined);
  assert.equal((sent.headers as Record<string, string>)["x-owned"], "value");
  assert.equal((sent.headers as Record<string, string>)["x-initial"], undefined);
  assert.deepEqual(fixture.bodies, [Buffer.from([0, 128, 255])]);
});
test("empty POST uses no native request body Buffer", async (t) => {
  const fixture = nodeFixture(t);
  await api.createNetworkProxyFetch(options)(url, { method: "POST", body: "" });
  assert.deepEqual(fixture.bodies, [undefined]);
});
test("Node response keeps manual redirects and byte stream semantics", async (t) => {
  const fixture = nodeFixture(t);
  fixture.incoming.statusCode = 302;
  fixture.incoming.statusMessage = "Owned redirect";
  fixture.incoming.headers = {
    location: "https://redirect.invalid/",
    "set-cookie": ["a=fixture", "b=fixture"],
    "x-skip": undefined,
    "x-count": 12 as unknown as string,
  };
  const response = await api.createNetworkProxyFetch(options)(url);
  assert.equal(response.status, 302);
  assert.equal(response.statusText, "Owned redirect");
  assert.equal(response.url, "");
  assert.equal(response.redirected, false);
  assert.equal(response.headers.get("location"), "https://redirect.invalid/");
  assert.deepEqual(response.headers.getSetCookie(), ["a=fixture", "b=fixture"]);
  assert.equal(response.headers.get("x-count"), "12");
  assert.equal(response.headers.has("x-skip"), false);
  assert.equal(await response.text(), "owned");
});
test("absent native status falls back to 502", async (t) => {
  const fixture = nodeFixture(t);
  Object.defineProperty(fixture.incoming, "statusCode", { value: undefined });
  assert.equal((await api.createNetworkProxyFetch(options)(url)).status, 502);
});
test("CA success persists across file/path changes but absence bypasses the cache", async (t) => {
  const dir = await directory(t),
    first = join(dir, "first.pem"),
    second = join(dir, "second.pem");
  await writeFile(first, "first public fixture");
  await writeFile(second, "second public fixture");
  const direct = new Response("direct"),
    mutable = { env: {}, caCertFile: first, fetch: async () => direct },
    fetch = api.createNetworkProxyFetch(mutable);
  let fixture = nodeFixture(t, { secure: true });
  await fetch("https://target.invalid/");
  let agent = fixture.captured[0]?.agent;
  assert.ok(agent instanceof https.Agent);
  assert.deepEqual(agent.options.ca, Buffer.from("first public fixture"));
  mutable.caCertFile = second;
  fixture = nodeFixture(t, { secure: true });
  await fetch("https://target.invalid/");
  agent = fixture.captured[0]?.agent;
  assert.ok(agent instanceof https.Agent);
  assert.deepEqual(agent.options.ca, Buffer.from("first public fixture"));
  mutable.caCertFile = "";
  assert.equal(await fetch("https://target.invalid/"), direct);
});
test("failed CA load retries when the owned file becomes available", async (t) => {
  const dir = await directory(t),
    file = join(dir, "later.pem"),
    fetch = api.createNetworkProxyFetch({ env: {}, caCertFile: file });
  const first = watch(fetch("https://target.invalid/"));
  await turns();
  const error = rejected(first());
  assert.ok(error instanceof Error);
  assert.equal((error as NodeJS.ErrnoException).code, "ENOENT");
  await writeFile(file, "later public fixture");
  const fixture = nodeFixture(t, { secure: true });
  await fetch("https://target.invalid/");
  const agent = fixture.captured[0]?.agent;
  assert.ok(agent instanceof https.Agent);
  assert.deepEqual(agent.options.ca, Buffer.from("later public fixture"));
});
test("CA loading after pending body reads current options instead of an early path", async (t) => {
  const dir = await directory(t),
    first = join(dir, "first.pem"),
    second = join(dir, "second.pem");
  await writeFile(first, "first public fixture");
  await writeFile(second, "second public fixture");
  const mutable = { env: {}, caCertFile: first },
    fixture = nodeFixture(t, { secure: true });
  let controller: ReadableStreamDefaultController<Uint8Array> | undefined;
  const body = new ReadableStream<Uint8Array>({
      start(value) {
        controller = value;
      },
    }),
    init: RequestInit & { duplex: "half" } = { method: "POST", body, duplex: "half" };
  const state = watch(api.createNetworkProxyFetch(mutable)("https://target.invalid/", init));
  await turns();
  assert.equal(fixture.captured.length, 0);
  mutable.caCertFile = second;
  assert.ok(controller);
  controller.enqueue(new Uint8Array([1, 2]));
  controller.close();
  await turns();
  fulfilled(state());
  const agent = fixture.captured[0]?.agent;
  assert.ok(agent instanceof https.Agent);
  assert.deepEqual(agent.options.ca, Buffer.from("second public fixture"));
  assert.deepEqual(fixture.bodies, [Buffer.from([1, 2])]);
});
