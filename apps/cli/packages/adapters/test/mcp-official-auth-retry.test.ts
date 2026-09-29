// Copyright (c) 2026 Knorvia Studio contributors
// SPDX-License-Identifier: MIT

import assert from "node:assert/strict";
import { test } from "node:test";
import {
  bounded,
  deferred,
  fixture,
  jsonResponse,
  ownedResponse,
  rejected,
  rpc,
  type ResponseInfo,
} from "./mcp-official-auth.fixture.js";

test("authenticated 401 waits for discard, re-resolves live credentials and sends the same resource with live init", async () => {
  const h = await fixture();
  const first = ownedResponse(401, { "x-request-id": "first" });
  const second = jsonResponse({ code: 3001 }, 200, { "x-request-id": "second" });
  const cancel = deferred<void>();
  const entered = deferred<void>();
  first.body.cancel = function () {
    assert.equal(this, first.body);
    h.record("discard");
    entered.resolve();
    return cancel.promise;
  };
  h.respond(first.response, second);
  const resource = new URL(h.input.url);
  const init: RequestInit = { body: rpc("initialize"), headers: { "x-free": "first" } };
  const pending = h.create()(resource, init);
  await bounded(entered.promise, "retry discard");
  assert.equal(h.count("fetch"), 1);
  assert.equal(h.count("resolve"), 1);
  assert.equal(h.count("trust"), 1);
  assert.ok(
    h.calls.findIndex((call) => call.args[0] === "Official MCP retrying once after 401") <
      h.names().indexOf("discard"),
  );
  init.body = rpc("tools/call");
  init.headers = { "x-free": "second" };
  h.authResult = { ok: true, headers: { Authorization: "renewed" } };
  cancel.resolve();
  assert.equal(await bounded(pending, "retry finish"), second);
  assert.equal(h.count("trust"), 1);
  assert.equal(h.count("resolve"), 2);
  assert.equal(h.count("fetch"), 2);
  assert.equal(h.sent(0).resource, resource);
  assert.equal(h.sent(1).resource, resource);
  assert.notEqual(h.sent(0).init.headers, h.sent(1).init.headers);
  assert.equal(h.sent(1).init.body, init.body);
  assert.equal(new Headers(h.sent(1).init.headers).get("authorization"), "renewed");
  assert.equal(new Headers(h.sent(1).init.headers).get("x-free"), "second");
  assert.deepEqual(
    [0, 1].map((index) => (h.event("serverResponse", index)[0] as ResponseInfo).rpcMethod),
    ["initialize", "initialize"],
  );
  assert.equal((h.event("serverResponse", 1)[0] as ResponseInfo).failureKind, "server_not_found");
  assert.equal(h.count("authFailure"), 0);
});

test("retry eligibility is the auth record's own-key count, including headers removed before send", async () => {
  for (const [headers, attempts] of [
    [{}, 1],
    [{ "x-request-id": "removed" }, 2],
    [{ Authorization: "" }, 2],
  ] as const) {
    const h = await fixture();
    h.authResult = { ok: true, headers };
    const first = ownedResponse(401);
    const second = new Response(null);
    h.respond(first.response, second);
    if (attempts === 1) {
      const error = await rejected(h.create()(h.input.url));
      assert.ok(error instanceof h.api.OfficialMcpAuthError);
      assert.equal(error.kind, "official_auth_rejected");
    } else assert.equal(await h.create()(h.input.url), second);
    assert.equal(h.count("fetch"), attempts);
    assert.equal(new Headers(h.sent().init.headers).has("x-request-id"), false);
  }
});

test("terminal status classifications discard bodies and notify auth failure without transport-catch logging", async () => {
  const cases = [
    [401, "official_auth_rejected", "official MCP rejected the current credential"],
    [403, "official_auth_forbidden", "official MCP denied access for the current plan"],
    [301, "official_auth_redirect_blocked", "official MCP responded with a blocked redirect (301)"],
    [399, "official_auth_redirect_blocked", "official MCP responded with a blocked redirect (399)"],
  ] as const;
  for (const [status, kind, message] of cases) {
    for (const method of ["initialize", "tools/call"]) {
      const h = await fixture();
      h.authResult = { ok: true, headers: {} };
      const sample = ownedResponse(status, { "x-request-id": " server-id " });
      sample.body.cancel = async () => {
        h.record("discard");
      };
      h.respond(sample.response);
      const error = await rejected(h.create()(h.input.url, { body: rpc(method) }));
      assert.ok(error instanceof h.api.OfficialMcpAuthError);
      assert.equal(error.kind, kind);
      assert.equal(error.message, message + (method === "tools/call" ? " - server-id" : ""));
      assert.equal(h.count("fetch"), 1);
      assert.equal(h.count("authFailure"), 1);
      assert.ok(h.names().indexOf("discard") < h.names().indexOf("authFailure"));
      assert.equal(
        h.calls.some((call) => call.args[0] === "Official MCP request did not complete"),
        false,
      );
    }
  }
});

test("two consecutive 401 responses exhaust exactly one retry and cancel each returned body", async () => {
  const h = await fixture();
  const first = ownedResponse(401, { "x-request-id": "one" });
  const second = ownedResponse(401, { "x-request-id": "two" });
  h.respond(first.response, second.response);
  const error = await rejected(h.create()(h.input.url, { body: rpc("tools/call") }));
  assert.ok(error instanceof h.api.OfficialMcpAuthError);
  assert.equal(error.message, "official MCP rejected the current credential - two");
  assert.equal(h.count("fetch"), 2);
  assert.equal(h.count("resolve"), 2);
  assert.equal(h.count("trust"), 1);
  assert.equal(h.count("serverResponse"), 2);
  assert.equal(h.count("authFailure"), 1);
  assert.deepEqual(first.trace, ["body.cancel"]);
  assert.deepEqual(second.trace, ["body.cancel"]);
});

test("discard rejection is swallowed but unresolved discard blocks later exchange and terminal notification", async () => {
  const h = await fixture();
  const first = ownedResponse(401);
  first.body.cancel = async () => {
    throw new Error("discard failure");
  };
  const second = new Response(null);
  h.respond(first.response, second);
  assert.equal(await h.create()(h.input.url), second);
  assert.equal(h.count("fetch"), 2);
  assert.equal(
    h.calls.some((call) => call.args[0] === "Official MCP request did not complete"),
    false,
  );
  const other = await fixture();
  const terminal = ownedResponse(403);
  const entered = deferred<void>();
  const gate = deferred<void>();
  terminal.body.cancel = () => {
    entered.resolve();
    return gate.promise;
  };
  other.respond(terminal.response);
  const pending = other.create()(other.input.url);
  const observed = rejected(pending);
  await bounded(entered.promise, "terminal discard");
  assert.equal(other.count("authFailure"), 0);
  gate.reject(new Error("ignored terminal discard"));
  const error = await bounded(observed, "terminal error");
  assert.ok(error instanceof other.api.OfficialMcpAuthError);
  assert.equal(error.kind, "official_auth_forbidden");
});

test("retry does not clone a body or repair dependency-defined replay failure", async () => {
  const h = await fixture();
  const body = new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(new Uint8Array([1]));
      controller.close();
    },
  });
  const marker = new TypeError("owned transport cannot replay the body");
  const first = ownedResponse(401);
  let sends = 0;
  h.input.baseFetch = async function (resource, init) {
    assert.equal(this, h.input);
    h.record("fetch", resource, init);
    assert.equal(init?.body, body);
    sends++;
    if (sends === 1) return first.response;
    throw marker;
  };
  assert.equal(await rejected(h.create()(h.input.url, { body })), marker);
  assert.equal(sends, 2);
  assert.equal(h.count("resolve"), 2);
  assert.equal(h.count("authFailure"), 0);
  assert.equal(h.log("Official MCP request did not complete").error, marker.message);
});

test("terminal tools/call message rereads the final response ID after response notification", async () => {
  const h = await fixture();
  const sample = ownedResponse(403, { "x-request-id": "initial" });
  h.input.onServerResponse = function (info) {
    assert.equal(this, h.input);
    h.record("serverResponse", info);
    sample.response.headers.set("x-request-id", "changed");
  };
  h.respond(sample.response);
  const error = await rejected(h.create()(h.input.url, { body: rpc("tools/call") }));
  assert.ok(error instanceof h.api.OfficialMcpAuthError);
  assert.equal((h.event("serverResponse")[0] as ResponseInfo).serverRequestId, "initial");
  assert.equal(error.message, "official MCP denied access for the current plan - changed");
});
