// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Knorvia Studio contributors

import assert from "node:assert/strict";
import fs from "node:fs";
import http from "node:http";
import https from "node:https";
import { syncBuiltinESMExports } from "node:module";
import * as path from "node:path";
import test, { type TestContext } from "node:test";
import { moduleUrls, type McpNetworkApi } from "./mcp-network.fixture.js";

let sequence = 0;

async function realDependencies(t: TestContext) {
  const executable = Object.getOwnPropertyDescriptor(process, "execPath");
  assert.ok(executable);
  const access = t.mock.method(fs, "accessSync", () => {
    throw new Error("Native access denied by owned fixture");
  });
  const plainHttp = t.mock.method(http, "request", () => {
    throw new Error("Unowned HTTP denied");
  });
  const tlsHttp = t.mock.method(https, "request", () => {
    throw new Error("Unowned HTTPS denied");
  });
  syncBuiltinESMExports();
  t.after(() => {
    access.mock.restore();
    plainHttp.mock.restore();
    tlsHttp.mock.restore();
    syncBuiltinESMExports();
    Object.defineProperty(process, "execPath", executable);
  });
  let api: McpNetworkApi;
  try {
    Object.defineProperty(process, "execPath", {
      ...executable,
      value: path.join("owned-runtime", process.platform === "win32" ? "node.exe" : "node"),
    });
    api = await import(`${moduleUrls.target}?owned-integration=${++sequence}`);
  } finally {
    Object.defineProperty(process, "execPath", executable);
  }
  return { api, access };
}

test("real dependencies sanitize runtime-only values while keeping the source untouched", async (t) => {
  const { api, access } = await realDependencies(t);
  const source = Object.freeze({
    PATH: "owned-runtime",
    NODE_ENV: "test",
    ELECTRON_RUN_AS_NODE: "1",
    KEEP: "owned",
  });
  const output = api.buildMcpStdioEnv({ env: source });
  assert.deepEqual(output, { PATH: "owned-runtime", KEEP: "owned" });
  assert.equal(source.NODE_ENV, "test");
  assert.equal(source.ELECTRON_RUN_AS_NODE, "1");
  assert.equal(access.mock.callCount(), 0);
});

test("real network projection receives explicit proxy, bypass and CA policy", async (t) => {
  const { api, access } = await realDependencies(t);
  const source = Object.freeze({ PATH: "owned-runtime", KEEP: "owned" });
  const output = api.buildMcpStdioEnv({
    env: source,
    network: {
      httpProxy: " proxy.invalid:99 ",
      noProxy: " bypass.invalid ",
      caCertFile: " owned.pem ",
    },
  });
  assert.equal(output.http_proxy, "http://proxy.invalid:99");
  assert.equal(output.https_proxy, "http://proxy.invalid:99");
  assert.equal(output.no_proxy, "bypass.invalid");
  assert.equal(output.SSL_CERT_FILE, "owned.pem");
  assert.equal(output.NODE_EXTRA_CA_CERTS, "owned.pem");
  assert.equal(output.PATH, "owned-runtime");
  assert.deepEqual(source, { PATH: "owned-runtime", KEEP: "owned" });
  assert.equal(access.mock.callCount(), 0);
});

test("real fetch adapter preserves direct input, init and response identity", async (t) => {
  const { api } = await realDependencies(t);
  const expected = new Response("owned response");
  const calls: [RequestInfo | URL, RequestInit | undefined][] = [];
  const direct: typeof fetch = async (input, init) => {
    calls.push([input, init]);
    return expected;
  };
  t.mock.method(globalThis, "fetch", direct);
  const source = Object.freeze({ KEEP: "owned" });
  const input = new URL("data:text/plain,owned");
  const init = { method: "POST", body: "owned body" };
  const send = api.createMcpTransportFetch({ env: source });
  assert.equal(await send(input, init), expected);
  assert.equal(calls.length, 1);
  assert.equal(calls[0]?.[0], input);
  assert.equal(calls[0]?.[1], init);
  assert.deepEqual(source, { KEEP: "owned" });
});

test("real sanitizer, projection and PATH insertion compose without caller mutation", async (t) => {
  const { api, access } = await realDependencies(t);
  const source = Object.freeze({ KEEP: "owned", NODE_ENV: "test" });
  assert.deepEqual(api.buildMcpStdioEnv({ env: source }), { KEEP: "owned", PATH: "owned-runtime" });
  assert.deepEqual(source, { KEEP: "owned", NODE_ENV: "test" });
  assert.equal(access.mock.callCount(), 0);
});
