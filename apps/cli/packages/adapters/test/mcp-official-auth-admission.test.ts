// Copyright (c) 2026 Knorvia Studio contributors
// SPDX-License-Identifier: MIT

import assert from "node:assert/strict";
import { test } from "node:test";
import { bounded, deferred, fixture, rejected } from "./mcp-official-auth.fixture.js";

test("public exports, mutable Error fields and direct shared reexport retain identity", async () => {
  const h = await fixture();
  assert.deepEqual(
    Object.keys(h.api).sort(),
    ["OfficialMcpAuthError", "createOfficialMcpAuthFetch", "findOfficialMcpReservedHeaders"].sort(),
  );
  assert.equal(h.api.OfficialMcpAuthError.length, 2);
  assert.equal(h.api.createOfficialMcpAuthFetch.length, 1);
  assert.equal(h.api.findOfficialMcpReservedHeaders, h.shared.findOfficialMcpReservedHeaders);
  const headers = { owned: "value" };
  assert.equal(h.api.findOfficialMcpReservedHeaders(headers), h.reservedMatches);
  assert.equal(h.event("shared.find")[0], headers);
  const error = new h.api.OfficialMcpAuthError("official_auth_rejected", "owned message");
  assert.ok(error instanceof Error);
  assert.ok(error instanceof h.api.OfficialMcpAuthError);
  assert.deepEqual(Object.keys(error), ["kind", "name"]);
  assert.equal(error.message, "owned message");
  assert.equal(error.name, "OfficialMcpAuthError");
  assert.equal(Object.hasOwn(error, "cause"), false);
  assert.equal(Reflect.set(error, "kind", "official_auth_forbidden"), true);
  assert.equal(error.kind, "official_auth_forbidden");
  const fetch = h.create();
  assert.equal(fetch.length, 2);
  assert.equal(h.count("trust"), 0);
  await fetch.call(undefined, h.input.url);
  assert.equal(h.count("fetch"), 1);
});

test("invalid configuration is deferred to invocation and origin mismatch fails before all ports", async () => {
  for (const [configured, requested] of [
    ["not a url", "https://owned.example/mcp"],
    ["https://owned.example/mcp", "https://other.example/mcp"],
    ["https://user:secret@owned.example/mcp", "https://owned.example/mcp"],
    ["https://owned.example/mcp", "https://user@owned.example/mcp"],
  ]) {
    const h = await fixture();
    h.input.url = configured!;
    const fetch = h.create();
    assert.deepEqual(h.calls, []);
    const error = await rejected(fetch(requested!));
    assert.ok(error instanceof h.api.OfficialMcpAuthError);
    assert.equal(error.kind, "official_mcp_origin_untrusted");
    assert.equal(
      error.message,
      "official MCP request origin does not match the configured endpoint: owned-server",
    );
    assert.deepEqual(h.names(), ["authFailure"]);
  }
});

test("native origin normalization, URL resources and non-HTTPS opaque origins remain registry decisions", async () => {
  for (const [configured, requested, origin] of [
    [
      "https://OWNED.example:443/a",
      new URL("https://owned.example/b?token=hidden#fragment"),
      "https://owned.example",
    ],
    ["http://owned.example/a", "http://owned.example/b", "http://owned.example"],
    ["data:text/plain,configured", "data:text/plain,requested", "null"],
  ] as const) {
    const h = await fixture();
    h.input.url = configured;
    const result = await h.create()(requested);
    assert.equal(result.status, 200);
    assert.deepEqual(h.event("trust")[0], {
      mcpKey: "owned-key",
      origin,
      pluginId: "owned.plugin",
    });
    assert.deepEqual(Object.keys(h.event("trust")[0] as object), ["mcpKey", "origin", "pluginId"]);
    assert.equal(h.sent().resource, requested);
  }
});

test("denied trust keeps nullish detail semantics and callback exceptions own the failure", async () => {
  for (const detail of [undefined, "", "revoked"]) {
    const h = await fixture();
    h.registry.isTrusted = async function () {
      assert.equal(this, h.registry);
      return { trusted: false, detail };
    };
    const error = await rejected(h.create()(h.input.url));
    assert.ok(error instanceof h.api.OfficialMcpAuthError);
    assert.equal(
      error.message,
      "official MCP origin is not trusted (" +
        (detail ?? "unknown") +
        "): owned-server origin=https://owned.example pluginId=owned.plugin",
    );
    assert.equal(h.count("resolve"), 0);
    assert.equal(h.count("fetch"), 0);
    assert.deepEqual(h.event("authFailure"), ["official_mcp_origin_untrusted"]);
  }
  const h = await fixture();
  const marker = { callback: "failed" };
  h.input.onAuthFailure = function () {
    assert.equal(this, h.input);
    throw marker;
  };
  assert.equal(await rejected(h.create()("https://other.example")), marker);
});

test("registry and resource extraction failures propagate unchanged without auth classification", async () => {
  for (const asynchronous of [false, true]) {
    const h = await fixture();
    const marker = new Error("trust transport");
    h.registry.isTrusted = function () {
      assert.equal(this, h.registry);
      if (asynchronous) return Promise.reject(marker);
      throw marker;
    };
    assert.equal(await rejected(h.create()(h.input.url)), marker);
    assert.equal(h.count("authFailure"), 0);
    assert.equal(h.count("resolve"), 0);
  }
  const h = await fixture();
  const marker = new Error("resource url");
  const resource = {
    get url(): string {
      throw marker;
    },
  } as Request;
  assert.equal(await rejected(h.create()(resource)), marker);
  assert.deepEqual(h.calls, []);
});

test("only expected origin is captured while later dependency and provenance changes remain live", async () => {
  const h = await fixture();
  const fetch = h.create();
  h.input.url = "https://other.example/new";
  const gate = deferred<{ trusted: boolean }>();
  const entered = deferred<void>();
  h.registry.isTrusted = function (value) {
    assert.equal(this, h.registry);
    h.record("trust", value);
    entered.resolve();
    return gate.promise;
  };
  const pending = fetch("https://owned.example/path");
  await bounded(entered.promise, "trust entry");
  const changedPort = {
    async resolveHeaders(value: Parameters<typeof h.port.resolveHeaders>[0]) {
      assert.equal(this, changedPort);
      h.record("changed.resolve", value);
      return { ok: true as const, headers: { Authorization: "changed" } };
    },
  };
  h.input.authHeadersPort = changedPort;
  h.input.official = { source: "plugin", pluginId: "changed.plugin", mcpKey: "changed-key" };
  h.input.serverName = "changed-server";
  gate.resolve({ trusted: true });
  await bounded(pending, "trust release");
  assert.equal(h.count("resolve"), 0);
  assert.deepEqual(h.event("changed.resolve")[0], {
    mcpKey: "changed-key",
    pluginId: "changed.plugin",
    targetOrigin: "https://owned.example",
  });
  assert.equal(h.log("Official MCP request sending").mcpServerName, "changed-server");
  assert.equal(new Headers(h.sent().init.headers).get("authorization"), "changed");
});
