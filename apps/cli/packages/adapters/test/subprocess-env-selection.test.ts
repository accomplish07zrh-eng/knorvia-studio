// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Knorvia Studio contributors
import assert from "node:assert/strict";
import test from "node:test";
import {
  api,
  caKeys,
  captureKey,
  expectKeys,
  platforms,
  proxyOutputs,
} from "./subprocess-env.fixture.js";

test("one synchronous public mutator preserves export arity and target identity", () => {
  assert.deepEqual(Object.keys(api), ["applyNetworkEgressEnv"]);
  assert.equal(api.applyNetworkEgressEnv.length, 2);
  const env = { Other: "owned" };
  assert.equal(api.applyNetworkEgressEnv(env, {}), env);
  assert.deepEqual(env, { Other: "owned" });
});
for (const platform of platforms) {
  test(`explicit proxy overrides product and capture: ${platform}`, () => {
    const source = {
      KNORVIA_HTTP_PROXY: "product.invalid",
      [captureKey]: JSON.stringify({ http_proxy: "captured.invalid" }),
    };
    const env = {};
    api.applyNetworkEgressEnv(env, {
      platform,
      sourceEnv: source,
      network: { httpProxy: " explicit.invalid:8443 " },
    });
    expectKeys(env, proxyOutputs(platform), "http://explicit.invalid:8443");
    assert.equal(source.KNORVIA_HTTP_PROXY, "product.invalid");
  });
  test(`blank explicit proxy uses trimmed product source: ${platform}`, () => {
    const env = {};
    api.applyNetworkEgressEnv(env, {
      platform,
      sourceEnv: { KNORVIA_HTTP_PROXY: " product.invalid:3128 " },
      network: { httpProxy: " \t " },
    });
    expectKeys(env, proxyOutputs(platform), "http://product.invalid:3128");
  });
  test(`absent policy leaves destination values and ignores generic source: ${platform}`, () => {
    const env = {
      HTTP_PROXY: "target",
      no_proxy: "target rule",
      SSL_CERT_FILE: "target.pem",
      Other: "keep",
    };
    api.applyNetworkEgressEnv(env, {
      platform,
      sourceEnv: {
        HTTP_PROXY: "source",
        HTTPS_PROXY: "source",
        NO_PROXY: "source rule",
        SSL_CERT_FILE: "source.pem",
        Other: "source",
      },
    });
    assert.deepEqual(env, {
      HTTP_PROXY: "target",
      no_proxy: "target rule",
      SSL_CERT_FILE: "target.pem",
      Other: "keep",
    });
  });
  for (const field of ["noProxy", "caCertFile"] as const) {
    const sourceKey = field === "noProxy" ? "KNORVIA_NO_PROXY" : "KNORVIA_AGENT_CA_CERT";
    const keys =
      field === "noProxy"
        ? platform === "win32"
          ? ["no_proxy"]
          : ["NO_PROXY", "no_proxy"]
        : caKeys;
    test(`${field} keeps source whitespace: ${platform}`, () => {
      const env = {};
      api.applyNetworkEgressEnv(env, {
        platform,
        sourceEnv: { [sourceKey]: " raw owned value " },
        network: { [field]: " " },
      });
      expectKeys(env, keys, " raw owned value ");
    });
    test(`${field} trims explicit value: ${platform}`, () => {
      const env = {};
      api.applyNetworkEgressEnv(env, {
        platform,
        sourceEnv: { [sourceKey]: "source" },
        network: { [field]: " explicit owned value " },
      });
      expectKeys(env, keys, "explicit owned value");
    });
  }
}
for (const [input, expected] of [
  [" SOCKS5://host.invalid:99 ", "SOCKS5://host.invalid:99"],
  [" CUSTOM+proto.-9://not a validated url ", "CUSTOM+proto.-9://not a validated url"],
  ["host.invalid:80", "http://host.invalid:80"],
  ["https:host.invalid", "http://https:host.invalid"],
  ["1x://host.invalid", "http://1x://host.invalid"],
  ["//host.invalid", "http:////host.invalid"],
  ["custom_thing://host.invalid", "http://custom_thing://host.invalid"],
] as const)
  test(`proxy prefix preserves existing string semantics: ${input}`, () => {
    const env = {};
    api.applyNetworkEgressEnv(env, { platform: "linux", network: { httpProxy: input } });
    expectKeys(env, proxyOutputs("linux"), expected);
  });
test("omitted source does not read ambient product policy", () => {
  const key = "KNORVIA_HTTP_PROXY",
    previous = process.env[key];
  process.env[key] = "ambient.invalid";
  try {
    const env = {};
    api.applyNetworkEgressEnv(env, { platform: "linux" });
    assert.deepEqual(env, {});
  } finally {
    if (previous === undefined) delete process.env[key];
    else process.env[key] = previous;
  }
});
for (const platform of platforms)
  test(`combined ordered projection retains canonical key order: ${platform}`, () => {
    const env: Record<string, string> = {};
    api.applyNetworkEgressEnv(env, {
      platform,
      network: { httpProxy: "p.invalid", noProxy: "n.invalid", caCertFile: "owned.pem" },
    });
    assert.deepEqual(Object.keys(env), [
      ...proxyOutputs(platform),
      ...(platform === "win32" ? ["no_proxy"] : ["NO_PROXY", "no_proxy"]),
      ...caKeys,
    ]);
    for (const key of proxyOutputs(platform)) assert.equal(env[key], "http://p.invalid");
    for (const key of caKeys) assert.equal(env[key], "owned.pem");
  });
