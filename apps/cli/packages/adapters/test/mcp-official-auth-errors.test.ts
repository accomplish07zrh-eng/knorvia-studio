// Copyright (c) 2026 Knorvia Studio contributors
// SPDX-License-Identifier: MIT

import assert from "node:assert/strict";
import { test } from "node:test";
import {
  bounded,
  deferred,
  fixture,
  ownedResponse,
  rejected,
  rpc,
} from "./mcp-official-auth.fixture.js";

test("resolver sync or async failure rejects without anonymous fallback or transport catch", async () => {
  for (const mode of ["sync", "async"] as const) {
    const h = await fixture();
    const marker = new Error("resolver failed");
    h.port.resolveHeaders = function () {
      assert.equal(this, h.port);
      if (mode === "async") return Promise.reject(marker);
      throw marker;
    };
    assert.equal(await rejected(h.create()(h.input.url)), marker);
    assert.equal(h.count("fetch"), 0);
    assert.equal(h.count("shared.summary"), 0);
    assert.equal(h.count("warn"), 0);
    assert.equal(h.count("authFailure"), 0);
  }
});

test("sending log and send-start clock failures are outside network try", async () => {
  for (const phase of ["sending", "clock"] as const) {
    const h = await fixture();
    const marker = new Error(phase);
    if (phase === "sending")
      h.logger.debug = function () {
        assert.equal(this, h.logger);
        throw marker;
      };
    else {
      let count = 0;
      h.clock.now = () => {
        count++;
        if (count === 3) throw marker;
        return count;
      };
    }
    assert.equal(await rejected(h.create()(h.input.url)), marker);
    assert.equal(h.count("fetch"), 0);
    assert.equal(h.count("warn"), 0);
    assert.equal(h.count("authFailure"), 0);
  }
});

test("transport errors preserve original values and narrow same-realm aborted classification", async () => {
  const abort = new Error("cancelled");
  abort.name = "AbortError";
  const timeout = new Error("timed");
  timeout.name = "TimeoutError";
  for (const [marker, aborted, name, message] of [
    [abort, true, "AbortError", "cancelled"],
    [timeout, true, "TimeoutError", "timed"],
    [new Error("ordinary"), false, "Error", "ordinary"],
    ["plain", false, "unknown", "plain"],
    [undefined, false, "unknown", "undefined"],
    [{ name: "AbortError" }, false, "unknown", "[object Object]"],
  ] as const) {
    const h = await fixture();
    h.input.baseFetch = async function () {
      assert.equal(this, h.input);
      throw marker;
    };
    assert.equal(await rejected(h.create()(h.input.url)), marker);
    const log = h.log("Official MCP request did not complete");
    assert.equal(log.aborted, aborted);
    assert.equal(log.errorName, name);
    assert.equal(log.error, message);
    assert.equal(log.status, "failed");
    assert.equal(h.count("authFailure"), 0);
    assert.equal(h.count("resolve"), 1);
  }
});

test("response notification exceptions occur before outcome logging and prevent retry or terminal auth notification", async () => {
  const h = await fixture();
  const marker = new Error("response callback");
  const sample = ownedResponse(401, { "x-request-id": "id" });
  h.respond(sample.response);
  h.input.onServerResponse = function () {
    assert.equal(this, h.input);
    throw marker;
  };
  assert.equal(await rejected(h.create()(h.input.url, { body: rpc("tools/call") })), marker);
  assert.equal(h.count("fetch"), 1);
  assert.equal(h.count("authFailure"), 0);
  assert.deepEqual(sample.trace, []);
  assert.equal(
    h.calls.some((call) => call.args[0] === "Official MCP response failed"),
    false,
  );
  assert.equal(
    h.calls.some((call) => call.args[0] === "Official MCP retrying once after 401"),
    false,
  );
  assert.equal(h.log("Official MCP request did not complete").error, marker.message);
});

test("response-log errors enter catch while catch logger and clock failures replace the first cause", async () => {
  for (const phase of ["response", "catch-log", "catch-clock"] as const) {
    const h = await fixture();
    const first = new Error("response log failed");
    const replacement = new Error("catch replacement");
    h.respond(new Response(null, { status: 400 }));
    h.logger.warn = function (message, context) {
      assert.equal(this, h.logger);
      h.record("warn", message, context);
      if (message === "Official MCP response failed") throw first;
      if (phase === "catch-log") throw replacement;
    };
    if (phase === "catch-clock") {
      let count = 0;
      h.clock.now = () => {
        count++;
        if (count === 5) throw replacement;
        return count;
      };
    }
    assert.equal(
      await rejected(h.create()(h.input.url)),
      phase === "response" ? first : replacement,
    );
    assert.equal(h.count("authFailure"), 0);
    if (phase !== "catch-clock")
      assert.equal(h.log("Official MCP request did not complete").error, first.message);
  }
});

test("retry log and final auth callback errors stay outside transport catch and preserve discard order", async () => {
  const h = await fixture();
  const marker = new Error("retry log");
  const first = ownedResponse(401);
  h.respond(first.response);
  h.logger.info = function () {
    assert.equal(this, h.logger);
    throw marker;
  };
  assert.equal(await rejected(h.create()(h.input.url)), marker);
  assert.equal(h.count("fetch"), 1);
  assert.deepEqual(first.trace, []);
  assert.equal(
    h.calls.some((call) => call.args[0] === "Official MCP request did not complete"),
    false,
  );
  const other = await fixture();
  const terminal = ownedResponse(403);
  other.respond(terminal.response);
  other.input.onAuthFailure = function (kind) {
    assert.equal(this, other.input);
    assert.equal(kind, "official_auth_forbidden");
    assert.deepEqual(terminal.trace, ["body.cancel"]);
    throw marker;
  };
  assert.equal(await rejected(other.create()(other.input.url)), marker);
  assert.equal(
    other.calls.some((call) => call.args[0] === "Official MCP request did not complete"),
    false,
  );
});

test("live logger uses its own receiver and void callbacks or logs are not awaited", async () => {
  const h = await fixture();
  const gate = deferred<void>();
  const logger = {
    ...h.logger,
    debug(message: string, context?: Parameters<typeof h.logger.debug>[1]) {
      assert.equal(this, logger);
      h.record("changed.debug", message, context);
      return gate.promise;
    },
  };
  const fetch = h.create();
  h.input.logger = logger;
  h.input.onServerResponse = function (info) {
    assert.equal(this, h.input);
    h.record("serverResponse", info);
    return gate.promise;
  };
  const response = new Response(null, { headers: { "x-request-id": "id" } });
  h.respond(response);
  try {
    assert.equal(await bounded(fetch(h.input.url), "void callback returns"), response);
    assert.equal(h.count("changed.debug"), 2);
    assert.equal(h.count("serverResponse"), 1);
  } finally {
    gate.resolve();
  }
});
