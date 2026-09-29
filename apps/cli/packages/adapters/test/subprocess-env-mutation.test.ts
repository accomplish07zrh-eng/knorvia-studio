// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Knorvia Studio contributors
import assert from "node:assert/strict";
import test from "node:test";
import { api, captureKey, expectKeys, platforms, proxyOutputs } from "./subprocess-env.fixture.js";

for (const platform of platforms) {
  test(`metadata removal and capture overlay respect platform case: ${platform}`, () => {
    const env: Record<string, string> = {
      [captureKey]: "destination",
      knorvia_tool_env_passthrough_json: "different case",
      HTTP_PROXY: "old",
      Other: "keep",
    };
    const source = { [captureKey]: JSON.stringify({ Http_Proxy: "first", http_proxy: "last" }) };
    api.applyNetworkEgressEnv(env, { platform, sourceEnv: source });
    assert.deepEqual(
      env,
      platform === "win32"
        ? { Other: "keep", http_proxy: "last" }
        : {
            knorvia_tool_env_passthrough_json: "different case",
            HTTP_PROXY: "old",
            Other: "keep",
            Http_Proxy: "first",
            http_proxy: "last",
          },
    );
    assert.equal(typeof source[captureKey], "string");
  });
  test(`aliased source loses capture before shared reader: ${platform}`, () => {
    const env = { [captureKey]: JSON.stringify({ http_proxy: "capture only" }) };
    api.applyNetworkEgressEnv(env, { platform, sourceEnv: env });
    assert.deepEqual(env, {});
  });
  test(`aliased source keeps later explicit policy selection: ${platform}`, () => {
    const env: Record<string, string> = {
      [captureKey]: JSON.stringify({ http_proxy: "capture only" }),
      KNORVIA_HTTP_PROXY: " explicit.invalid ",
    };
    api.applyNetworkEgressEnv(env, { platform, sourceEnv: env });
    assert.equal(env.KNORVIA_HTTP_PROXY, " explicit.invalid ");
    delete env.KNORVIA_HTTP_PROXY;
    expectKeys(env, proxyOutputs(platform), "http://explicit.invalid");
  });
  test(`disabled passthrough still strips metadata and projects product policy: ${platform}`, () => {
    const env: Record<string, string> = { [captureKey]: "target" };
    api.applyNetworkEgressEnv(env, {
      platform,
      toolEnvPassthrough: false,
      sourceEnv: {
        [captureKey]: JSON.stringify({ no_proxy: "capture only" }),
        KNORVIA_HTTP_PROXY: "explicit.invalid",
      },
    });
    expectKeys(env, proxyOutputs(platform), "http://explicit.invalid");
  });
  test(`source inherited exact value follows platform contract: ${platform}`, () => {
    const source = Object.create({ KNORVIA_HTTP_PROXY: "inherited.invalid" }) as Record<
      string,
      string
    >;
    const env = {};
    api.applyNetworkEgressEnv(env, { platform, sourceEnv: source });
    if (platform === "win32") assert.deepEqual(env, {});
    else expectKeys(env, proxyOutputs(platform), "http://inherited.invalid");
  });
  test(`nonenumerable source exact value follows platform contract: ${platform}`, () => {
    const source: Record<string, string> = {};
    Object.defineProperty(source, "KNORVIA_HTTP_PROXY", { value: "hidden.invalid" });
    const env = {};
    api.applyNetworkEgressEnv(env, { platform, sourceEnv: source });
    if (platform === "win32") assert.deepEqual(env, {});
    else expectKeys(env, proxyOutputs(platform), "http://hidden.invalid");
  });
  for (const blank of [undefined, "", " "])
    test(`first case alias prevents Windows fallback: ${platform} ${JSON.stringify(blank)}`, () => {
      const env = {};
      api.applyNetworkEgressEnv(env, {
        platform,
        sourceEnv: { knorvia_http_proxy: blank, KNORVIA_HTTP_PROXY: "later.invalid" },
      });
      if (platform === "win32") assert.deepEqual(env, {});
      else expectKeys(env, proxyOutputs(platform), "http://later.invalid");
    });
}
for (const raw of [
  "invalid JSON",
  "null",
  "[]",
  "42",
  '{"http_proxy":42}',
  '{"Other":"discarded"}',
])
  test(`retained shared reader rejects malformed or unsupported capture: ${raw}`, () => {
    const env = { Other: "keep" };
    api.applyNetworkEgressEnv(env, { sourceEnv: { [captureKey]: raw }, platform: "linux" });
    assert.deepEqual(env, { Other: "keep" });
  });
test("capture metadata lookup remains exact even on Windows", () => {
  const env = {};
  api.applyNetworkEgressEnv(env, {
    platform: "win32",
    sourceEnv: { knorvia_tool_env_passthrough_json: JSON.stringify({ http_proxy: "ignored" }) },
  });
  assert.deepEqual(env, {});
});
test("shared reader input getter error follows initial target removal", () => {
  const reason = new Error("owned reader input"),
    env: Record<string, string> = { [captureKey]: "remove", Other: "keep" };
  const source: Record<string, string> = {};
  Object.defineProperty(source, captureKey, {
    get() {
      throw reason;
    },
  });
  assert.throws(
    () => api.applyNetworkEgressEnv(env, { platform: "linux", sourceEnv: source }),
    (error) => error === reason,
  );
  assert.deepEqual(env, { Other: "keep" });
});
test("policy read error preserves earlier capture overlay without rollback", () => {
  const reason = new Error("owned policy read"),
    env: Record<string, string> = { [captureKey]: "remove" };
  assert.throws(
    () =>
      api.applyNetworkEgressEnv(env, {
        platform: "linux",
        sourceEnv: { [captureKey]: JSON.stringify({ http_proxy: "captured" }) },
        network: {
          get httpProxy(): string {
            throw reason;
          },
        },
      }),
    (error) => error === reason,
  );
  assert.deepEqual(env, { http_proxy: "captured" });
});
test("failed ordered destination delete retains earlier projection", () => {
  const env: Record<string, string> = {};
  Object.defineProperty(env, "HTTPS_PROXY", {
    value: "locked",
    enumerable: true,
    configurable: false,
  });
  assert.throws(
    () =>
      api.applyNetworkEgressEnv(env, {
        platform: "linux",
        network: { httpProxy: "new.invalid", noProxy: "later" },
      }),
    TypeError,
  );
  assert.deepEqual(env, { HTTPS_PROXY: "locked", HTTP_PROXY: "http://new.invalid" });
});
test("destination prototype is not modified by projection", () => {
  const proto = { HTTP_PROXY: "inherited old" },
    env = Object.create(proto) as Record<string, string>;
  api.applyNetworkEgressEnv(env, { platform: "linux", network: { httpProxy: "new.invalid" } });
  assert.deepEqual(proto, { HTTP_PROXY: "inherited old" });
  expectKeys(env, proxyOutputs("linux"), "http://new.invalid");
});
