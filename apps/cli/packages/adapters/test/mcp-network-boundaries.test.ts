// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Knorvia Studio contributors

import assert from "node:assert/strict";
import test from "node:test";
import { callAt, networkFixture, withOwnedEnvironment } from "./mcp-network.fixture.js";

test("stdio passes a fresh own-string record without changing its source", async (t) => {
  const { api, state } = await networkFixture(t, { executable: "owned-app.exe" });
  const source: NodeJS.ProcessEnv = Object.assign(Object.create({ INHERITED: "ignored" }), {
    KEEP: "value",
    EMPTY: "",
    SPACE: " ",
    MISSING: undefined,
    NUMBER: 12,
  });
  Object.defineProperty(source, "HIDDEN", { value: "hidden" });
  const original = Object.getOwnPropertyDescriptors(source);
  const result = api.buildMcpStdioEnv({ env: source });
  const sanitized = callAt(state, 0);
  assert.equal(sanitized.stage, "sanitize");
  if (sanitized.stage !== "sanitize") throw new Error("Expected sanitizer");
  assert.notEqual(sanitized.env, source);
  assert.equal(Object.getPrototypeOf(sanitized.env), Object.prototype);
  assert.deepEqual(sanitized.env, { KEEP: "value", EMPTY: "", SPACE: " " });
  assert.equal(result, sanitized.env);
  assert.deepEqual(Object.getOwnPropertyDescriptors(source), original);
});

for (const value of ["owned", "", 123]) {
  test(`ordinary record copying does not create own __proto__ from ${JSON.stringify(value)}`, async (t) => {
    const { api, state } = await networkFixture(t, { executable: "owned-app.exe" });
    const source = JSON.parse(
      JSON.stringify({ KEEP: "value" }).replace("{", `{"__proto__":${JSON.stringify(value)},`),
    );
    api.buildMcpStdioEnv({ env: source });
    const call = callAt(state, 0);
    assert.equal(call.stage, "sanitize");
    if (call.stage !== "sanitize") throw new Error("Expected sanitizer");
    assert.deepEqual(Object.keys(call.env), ["KEEP"]);
    assert.equal(Object.getPrototypeOf(call.env), Object.prototype);
    assert.equal(Object.hasOwn(source, "__proto__"), true);
  });
}

test("ordinary string shadow names are retained", async (t) => {
  const { api } = await networkFixture(t, { executable: "owned-app.exe" });
  const source = { constructor: "owned-constructor", toString: "owned-string", KEEP: "value" };
  const output = api.buildMcpStdioEnv({ env: source });
  assert.deepEqual(output, source);
  assert.notEqual(output, source);
});

test("stdio preserves sanitizer/projector ownership, exact option keys and source identity", async (t) => {
  const { api, state } = await networkFixture(t, { executable: "owned-app.exe" });
  const source = { KEEP: "borrowed" },
    sanitized = { FILTERED: "owned" },
    projected = { PROJECTED: "owned" };
  const network = { httpProxy: "owned.invalid:80" };
  state.sanitize = () => sanitized;
  state.project = () => projected;
  assert.equal(api.buildMcpStdioEnv({ env: source, network }), projected);
  assert.deepEqual(
    state.calls.map((call) => call.stage),
    ["sanitize", "project"],
  );
  const call = callAt(state, 1);
  if (call.stage !== "project") throw new Error("Expected projection");
  assert.equal(call.env, sanitized);
  assert.deepEqual(Object.keys(call.options), ["network", "sourceEnv"]);
  assert.equal(call.options.network, network);
  assert.equal(call.options.sourceEnv, source);
});

test("absent stdio policy remains an explicit undefined option", async (t) => {
  const { api, state } = await networkFixture(t, { executable: "owned-app.exe" });
  api.buildMcpStdioEnv({ env: {} });
  const call = callAt(state, 1);
  if (call.stage !== "project") throw new Error("Expected projection");
  assert.deepEqual(Object.keys(call.options), ["network", "sourceEnv"]);
  assert.equal(call.options.network, undefined);
});

test("stdio policy is read after sanitization", async (t) => {
  const { api, state } = await networkFixture(t, { executable: "owned-app.exe" });
  const order: string[] = [];
  state.sanitize = (env) => {
    order.push("sanitize");
    return env;
  };
  api.buildMcpStdioEnv({
    get env() {
      order.push("env");
      return {};
    },
    get network() {
      order.push("network");
      return undefined;
    },
  });
  assert.deepEqual(order, ["env", "sanitize", "network"]);
});

for (const stage of ["sanitize", "project", "fetch"] as const) {
  test(`${stage} failure keeps synchronous error identity`, async (t) => {
    const { api, state } = await networkFixture(t);
    const failure = new Error(`owned ${stage}`);
    state[stage] = () => {
      throw failure;
    };
    assert.throws(
      () =>
        stage === "fetch"
          ? api.createMcpTransportFetch({ env: {} })
          : api.buildMcpStdioEnv({ env: {} }),
      (error) => error === failure,
    );
    assert.equal(state.calls.at(-1)?.stage, stage);
    assert.equal(state.access.length, 0);
  });
}

test("source entry failure occurs before either retained stdio dependency", async (t) => {
  const { api, state } = await networkFixture(t);
  const failure = new Error("owned source getter");
  assert.throws(
    () =>
      api.buildMcpStdioEnv({
        env: {
          get KEEP(): string {
            throw failure;
          },
        },
      }),
    (error) => error === failure,
  );
  assert.equal(state.calls.length, 0);
  assert.equal(state.access.length, 0);
});

test("HTTP forwards exact four keys and returns retained factory identity", async (t) => {
  const { api, state, marker } = await networkFixture(t);
  const env = { KEEP: "borrowed" };
  assert.equal(
    api.createMcpTransportFetch({
      env,
      network: { caCertFile: "owned.pem", httpProxy: "owned.invalid", noProxy: "bypass.invalid" },
    }),
    marker,
  );
  const call = callAt(state, 0);
  if (call.stage !== "fetch") throw new Error("Expected fetch");
  assert.deepEqual(Object.keys(call.options), ["caCertFile", "env", "httpProxy", "noProxy"]);
  assert.deepEqual(call.options, {
    caCertFile: "owned.pem",
    env,
    httpProxy: "owned.invalid",
    noProxy: "bypass.invalid",
  });
  assert.equal(call.options.env, env);
  assert.equal(state.calls.length, 1);
});

test("HTTP keeps absent scalar keys present", async (t) => {
  const { api, state } = await networkFixture(t);
  const env = {};
  api.createMcpTransportFetch({ env });
  const call = callAt(state, 0);
  if (call.stage !== "fetch") throw new Error("Expected fetch");
  assert.deepEqual(call.options, {
    caCertFile: undefined,
    env,
    httpProxy: undefined,
    noProxy: undefined,
  });
});

test("HTTP option evaluation follows CA, environment, proxy then bypass", async (t) => {
  const { api } = await networkFixture(t);
  const order: string[] = [];
  const network = {
    get caCertFile() {
      order.push("CA");
      return "owned.pem";
    },
    get httpProxy() {
      order.push("proxy");
      return "owned.invalid";
    },
    get noProxy() {
      order.push("bypass");
      return "bypass.invalid";
    },
  };
  api.createMcpTransportFetch({
    network,
    get env() {
      order.push("env");
      return {};
    },
  });
  assert.deepEqual(order, ["CA", "env", "proxy", "bypass"]);
});

for (const method of ["buildMcpStdioEnv", "createMcpTransportFetch"] as const) {
  test(`${method} selects current owned process environment per call`, async (t) => {
    const { api, state } = await networkFixture(t, { executable: "owned-app.exe" });
    for (const env of [{ OWNED: "one" }, { OWNED: "two" }]) {
      state.calls.length = 0;
      withOwnedEnvironment(env, () => api[method]({}));
      const call = state.calls.at(-1);
      assert.ok(call && call.stage !== "sanitize");
      if (call.stage === "project") assert.equal(call.options.sourceEnv, env);
      else assert.equal(call.options.env, env);
    }
  });
}
