// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Knorvia Studio contributors
import assert from "node:assert/strict";
import test from "node:test";
import {
  api,
  ambient,
  absent,
  bypass,
  captured,
  proxy,
  selected,
  thrown,
  url,
} from "./network-config.fixture.js";

test("five synchronous public exports retain their arities", () => {
  assert.deepEqual(Object.keys(api), [
    "loadTlsCaCertificates",
    "resolveProxyForRequest",
    "resolveProxyUrlForRequest",
    "resolveTlsCaCertFile",
    "resolveWebFetchProxyForRequest",
  ]);
  assert.deepEqual(
    [
      api.resolveProxyUrlForRequest.length,
      api.resolveProxyForRequest.length,
      api.resolveWebFetchProxyForRequest.length,
      api.resolveTlsCaCertFile.length,
      api.loadTlsCaCertificates.length,
    ],
    [2, 2, 2, 1, 1],
  );
});
for (const input of [
  "not a URL",
  "ftp://target.invalid/",
  "file:///owned-fixture",
  new URL("ws://target.invalid/"),
]) {
  test(`invalid or unsupported request skips options: ${String(input)}`, () => {
    const options = new Proxy(
      {},
      {
        get() {
          throw new Error("options must remain unread");
        },
      },
    );
    assert.deepEqual(api.resolveProxyForRequest(input, options), absent);
    assert.deepEqual(api.resolveWebFetchProxyForRequest(input, options), absent);
    assert.equal(api.resolveProxyUrlForRequest(input, options), undefined);
  });
}
test("missing proxy returns a presence-exact fresh result with no ambient environment", (t) => {
  for (const key of [
    "KNORVIA_HTTP_PROXY",
    "HTTP_PROXY",
    "HTTPS_PROXY",
    "ALL_PROXY",
    "KNORVIA_NO_PROXY",
  ])
    ambient(t, key, proxy);
  const first = api.resolveProxyForRequest(url, {}),
    second = api.resolveWebFetchProxyForRequest(url, {});
  assert.deepEqual(first, absent);
  assert.deepEqual(second, absent);
  assert.notEqual(first, second);
});
test("supplied URL is used without stringifying or mutation", () => {
  const value = new URL(url),
    before = value.href;
  Object.defineProperty(value, "toString", {
    value() {
      throw new Error("do not stringify");
    },
  });
  assert.deepEqual(api.resolveProxyForRequest(value, { httpProxy: proxy }), selected());
  assert.equal(value.href, before);
});
test("explicit proxy wins over product env and captured no-proxy", () => {
  const env = {
    KNORVIA_HTTP_PROXY: "product.invalid:81",
    ...captured({ no_proxy: "*", https_proxy: "captured.invalid:82" }),
  };
  assert.deepEqual(api.resolveWebFetchProxyForRequest(url, { httpProxy: proxy, env }), selected());
});
test("product proxy wins over captured no-proxy and proxy", () => {
  const env = {
    KNORVIA_HTTP_PROXY: proxy,
    ...captured({ no_proxy: "*", https_proxy: "captured.invalid:82" }),
  };
  assert.deepEqual(
    api.resolveWebFetchProxyForRequest(url, { env }),
    selected("env:KNORVIA_HTTP_PROXY"),
  );
});
test("matched bypass never consults proxy candidates", () => {
  const options = {
    noProxy: "target.invalid",
    get httpProxy(): string {
      throw new Error("unselected proxy");
    },
  };
  assert.deepEqual(api.resolveProxyForRequest(url, options), bypass);
  assert.deepEqual(api.resolveWebFetchProxyForRequest(url, options), bypass);
});
test("explicit nonmatching bypass list replaces product bypass", () => {
  assert.deepEqual(
    api.resolveProxyForRequest(url, {
      noProxy: "other.invalid",
      httpProxy: proxy,
      env: { KNORVIA_NO_PROXY: "*" },
    }),
    selected(),
  );
});
test("blank explicit bypass falls back to provided product bypass", () => {
  assert.deepEqual(
    api.resolveProxyForRequest(url, {
      noProxy: " \t ",
      httpProxy: proxy,
      env: { KNORVIA_NO_PROXY: " target.invalid " },
    }),
    bypass,
  );
});
test("native options getter error is not hidden by URL normalization", () => {
  const reason = new Error("owned config getter");
  const options = {
    get noProxy(): string {
      throw reason;
    },
  };
  assert.equal(
    thrown(() => api.resolveProxyForRequest(url, options)),
    reason,
  );
});
test("explicit invalid proxy falls through to provided env", () => {
  assert.deepEqual(
    api.resolveProxyForRequest(url, { httpProxy: "http://[", env: { KNORVIA_HTTP_PROXY: proxy } }),
    selected("env:KNORVIA_HTTP_PROXY"),
  );
});
test("ordinary resolver ignores captured proxies entirely", () => {
  assert.deepEqual(
    api.resolveProxyForRequest(url, { env: captured({ https_proxy: proxy, no_proxy: "*" }) }),
    absent,
  );
});
test("URL-only helper projects proxy selection and bypass", () => {
  assert.equal(api.resolveProxyUrlForRequest(url, { httpProxy: proxy }), proxy);
  assert.equal(api.resolveProxyUrlForRequest(url, { httpProxy: proxy, noProxy: "*" }), undefined);
});
test("every call observes current options and environment without caching", () => {
  const env: Record<string, string> = {},
    options = { env, httpProxy: "" };
  assert.deepEqual(api.resolveProxyForRequest(url, options), absent);
  env.KNORVIA_HTTP_PROXY = proxy;
  assert.deepEqual(api.resolveProxyForRequest(url, options), selected("env:KNORVIA_HTTP_PROXY"));
  options.httpProxy = "next.invalid:81";
  assert.deepEqual(
    api.resolveProxyForRequest(url, options),
    selected("network.httpProxy", "http://next.invalid:81/"),
  );
  assert.equal(env.KNORVIA_HTTP_PROXY, proxy);
});
for (const [input, expected] of [
  [" proxy.invalid:8080 ", proxy],
  ["http://proxy.invalid:80", "http://proxy.invalid/"],
  ["HTTPS://Proxy.Invalid:443/path?x=1#part", "https://proxy.invalid/path?x=1#part"],
  ["socks5://proxy.invalid:1080", "socks5://proxy.invalid:1080"],
  ["custom+v1://proxy.invalid:90/path", "custom+v1://proxy.invalid:90/path"],
  [
    "http://fixture:example@proxy.invalid:8080/path",
    "http://fixture:example@proxy.invalid:8080/path",
  ],
  [" \n ", undefined],
  ["http://[", undefined],
  ["proxy.invalid:70000", undefined],
] as const)
  test(`proxy normalization uses native URL: ${JSON.stringify(input)}`, () => {
    assert.deepEqual(
      api.resolveProxyForRequest(url, { httpProxy: input }),
      expected ? selected("network.httpProxy", expected) : absent,
    );
  });
const keys = [
  "https_proxy",
  "HTTPS_PROXY",
  "http_proxy",
  "HTTP_PROXY",
  "all_proxy",
  "ALL_PROXY",
] as const;
for (let index = 0; index < keys.length; index++) {
  const key = keys[index];
  assert.ok(key);
  test(`captured fallback priority ${key} applies to either request protocol`, () => {
    const values: Record<string, string> = {};
    keys.forEach((name, i) => {
      values[name] = i < index ? "http://[" : i === index ? proxy : "later.invalid:90";
    });
    for (const requestUrl of [url, "http://target.invalid/"])
      assert.deepEqual(
        api.resolveWebFetchProxyForRequest(requestUrl, { env: captured(values) }),
        selected(`env:KNORVIA_TOOL_ENV_PASSTHROUGH_JSON.${key}`),
      );
  });
}
test("captured lowercase bypass replaces uppercase while blank falls back", () => {
  assert.deepEqual(
    api.resolveWebFetchProxyForRequest(url, {
      env: captured({ no_proxy: "other.invalid", NO_PROXY: "*", http_proxy: proxy }),
    }),
    selected("env:KNORVIA_TOOL_ENV_PASSTHROUGH_JSON.http_proxy"),
  );
  assert.deepEqual(
    api.resolveWebFetchProxyForRequest(url, {
      env: captured({ no_proxy: "  ", NO_PROXY: "target.invalid", http_proxy: proxy }),
    }),
    bypass,
  );
});
for (const raw of [
  "not-json",
  "null",
  "[]",
  '"text"',
  '{"https_proxy":12,"http_proxy":false,"unknown_proxy":"invalid"}',
])
  test(`captured reader rejects unusable data: ${raw}`, () => {
    assert.deepEqual(
      api.resolveWebFetchProxyForRequest(url, { env: { KNORVIA_TOOL_ENV_PASSTHROUGH_JSON: raw } }),
      absent,
    );
  });
