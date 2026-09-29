// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Knorvia Studio contributors
import assert from "node:assert/strict";
import test from "node:test";
import { errors, oauthUrls, sdk } from "./mcp-oauth-boundaries.fixture.js";

const interactive = Symbol.for("knorvia.mcp.oauth.interactiveAuthorizationRequired");
const temporary = Symbol.for("knorvia.mcp.oauth.temporaryRefreshFailure");
const classify = errors.classifyInteractiveAuthorizationTrigger;
const interactiveError = errors.createInteractiveAuthorizationRequiredError;
const temporaryError = errors.createTemporaryRefreshFailureError;

test("MCP OAuth errors keep their three public unary functions", () => {
  assert.deepEqual(Object.keys(errors), [
    "classifyInteractiveAuthorizationTrigger",
    "createInteractiveAuthorizationRequiredError",
    "createTemporaryRefreshFailureError",
  ]);
  for (const fn of Object.values(errors)) assert.equal(fn.length, 1);
});

for (const reason of [
  "no_credentials",
  "no_refresh_token",
  "invalid_grant",
  "invalid_client",
  "insufficient_scope",
  "unauthorized",
  "legacy_provider_seam",
] as const) {
  test(`MCP interactive error preserves ${reason} and own field order`, () => {
    const input = Object.freeze({
      serverName: " owned server ",
      reason,
      requiredScope: "read write",
      resourceMetadataUrl: " metadata ",
    });
    const result = interactiveError(input);
    assert.equal(Object.getPrototypeOf(result), Error.prototype);
    assert.equal(result.name, "Error");
    assert.equal(
      result.message,
      `MCP server  owned server  requires interactive OAuth authorization (${reason})`,
    );
    assert.equal(typeof result.stack, "string");
    assert.equal(Object.hasOwn(result, "cause"), false);
    assert.deepEqual(Object.keys(result), [
      "code",
      "reason",
      "requiredScope",
      "resourceMetadataUrl",
    ]);
    assert.equal(result.code, "MCP_OAUTH_INTERACTIVE_REQUIRED");
    assert.equal(result.reason, reason);
    assert.equal(result.requiredScope, input.requiredScope);
    assert.equal(result.resourceMetadataUrl, input.resourceMetadataUrl);
    assert.deepEqual(Object.getOwnPropertyDescriptor(result, interactive), {
      value: true,
      writable: false,
      enumerable: false,
      configurable: true,
    });
    assert.deepEqual(classify(result), {
      reason,
      requiredScope: input.requiredScope,
      resourceMetadataUrl: input.resourceMetadataUrl,
    });
  });
}

test("MCP OAuth factories preserve cause identity and omit only undefined", () => {
  for (const cause of [undefined, null, false, 0, "", new Error("owned cause"), { detail: 1 }]) {
    for (const result of [
      interactiveError({ serverName: "s", reason: "unauthorized", cause }),
      temporaryError({ serverName: "s", cause }),
    ]) {
      assert.equal(Object.hasOwn(result, "cause"), cause !== undefined);
      assert.equal(result.cause, cause);
    }
  }
});

test("MCP OAuth factory optional fields remain truthy-only and untrimmed", () => {
  const absent = interactiveError({
    serverName: "",
    reason: "invalid_client",
    requiredScope: "",
    resourceMetadataUrl: "",
  });
  assert.deepEqual(Object.keys(absent), ["code", "reason"]);
  const spaced = interactiveError({
    serverName: "",
    reason: "invalid_client",
    requiredScope: " ",
    resourceMetadataUrl: " ",
  });
  assert.equal(spaced.requiredScope, " ");
  assert.equal(spaced.resourceMetadataUrl, " ");
});

test("MCP temporary error remains ordinary and suppresses nested authorization", () => {
  const result = temporaryError({
    serverName: "owned",
    cause: interactiveError({ serverName: "s", reason: "invalid_grant" }),
  });
  assert.equal(Object.getPrototypeOf(result), Error.prototype);
  assert.equal(result.message, "MCP server owned OAuth token refresh failed temporarily");
  assert.deepEqual(Object.keys(result), ["code"]);
  assert.equal(result.code, "MCP_OAUTH_TEMPORARY_REFRESH_FAILURE");
  assert.deepEqual(Object.getOwnPropertyDescriptor(result, temporary), {
    value: true,
    writable: false,
    enumerable: false,
    configurable: true,
  });
  assert.equal(classify(result), undefined);
});

test("MCP private brands work across a separately loaded helper copy", async () => {
  const copy = (await import(oauthUrls.errors + "?owned-copy")) as typeof errors;
  assert.notEqual(copy.createInteractiveAuthorizationRequiredError, interactiveError);
  assert.deepEqual(
    classify(
      copy.createInteractiveAuthorizationRequiredError({
        serverName: "s",
        reason: "invalid_client",
      }),
    ),
    { reason: "invalid_client" },
  );
  assert.equal(classify(copy.createTemporaryRefreshFailureError({ serverName: "s" })), undefined);
});

test("MCP classifier accepts inherited and function brands, returning fresh records", () => {
  const prototype = {
    [interactive]: true,
    reason: "legacy_provider_seam",
    requiredScope: " ",
    resourceMetadataUrl: "metadata",
  };
  const value = Object.create(prototype) as unknown;
  const first = classify(value);
  assert.deepEqual(first, {
    reason: "legacy_provider_seam",
    requiredScope: " ",
    resourceMetadataUrl: "metadata",
  });
  assert.notEqual(first, classify(value));
  const fn = Object.assign(() => undefined, prototype);
  assert.deepEqual(classify(fn), first);
  assert.equal(Object.getOwnPropertyNames(value as object).length, 0);
});

test("MCP classifier requires strict true brands and ignores lookalike errors", () => {
  for (const value of [1, "true", false, undefined]) {
    assert.equal(classify({ [interactive]: value, reason: "unauthorized" }), undefined);
    assert.deepEqual(classify({ [temporary]: value, cause: new sdk.UnauthorizedError() }), {
      reason: "unauthorized",
    });
  }
  for (const value of [
    new Error("401 unauthorized"),
    { code: "MCP_OAUTH_INTERACTIVE_REQUIRED", reason: "unauthorized" },
    { status: 401 },
    { name: "UnauthorizedError" },
  ])
    assert.equal(classify(value), undefined);
});

test("MCP classifier preserves branded field values without coercion", () => {
  const scope = { toString: () => assert.fail("no stringification") };
  const result = classify({
    [interactive]: true,
    reason: 17,
    requiredScope: scope,
    resourceMetadataUrl: 42,
  });
  assert.deepEqual(result, { reason: 17, requiredScope: scope, resourceMetadataUrl: 42 });
  assert.deepEqual(
    classify({ [interactive]: true, reason: undefined, requiredScope: "", resourceMetadataUrl: 0 }),
    { reason: undefined },
  );
});

test("MCP temporary brand wins before interactive, SDK and cause access", () => {
  const value = Object.assign(new sdk.UnauthorizedError(), {
    [temporary]: true,
    [interactive]: true,
  });
  Object.defineProperty(value, "cause", { get: () => assert.fail("temporary must stop") });
  Object.defineProperty(value, "reason", {
    get: () => assert.fail("temporary must stop before interactive"),
  });
  assert.equal(classify(value), undefined);
});

test("MCP interactive brand wins before SDK and deeper cause", () => {
  const value = Object.assign(new sdk.InsufficientScopeError({ requiredScope: "sdk" }), {
    [interactive]: true,
    reason: "invalid_client",
  });
  Object.defineProperty(value, "cause", { get: () => assert.fail("interactive must stop") });
  assert.deepEqual(classify(value), { reason: "invalid_client", requiredScope: "sdk" });
});

test("MCP classifier consumes the retained SDK scope error and URL", () => {
  const url = new URL("https://owned.example/metadata");
  assert.deepEqual(
    classify(new sdk.InsufficientScopeError({ requiredScope: "read", resourceMetadataUrl: url })),
    { reason: "insufficient_scope", requiredScope: "read", resourceMetadataUrl: url.href },
  );
  assert.deepEqual(classify(new sdk.InsufficientScopeError({ requiredScope: "" })), {
    reason: "insufficient_scope",
  });
  assert.deepEqual(classify(new sdk.UnauthorizedError("owned")), { reason: "unauthorized" });
});

test("MCP authentication code applies to objects and arrays, not functions", () => {
  for (const value of [{}, [], Object.create(null) as Record<string, unknown>]) {
    Object.assign(value, { code: sdk.SdkErrorCode.ClientHttpAuthentication });
    assert.deepEqual(classify(value), { reason: "unauthorized" });
  }
  assert.equal(
    classify(Object.assign(() => undefined, { code: sdk.SdkErrorCode.ClientHttpAuthentication })),
    undefined,
  );
  assert.deepEqual(
    classify(Object.assign(() => undefined, { cause: new sdk.UnauthorizedError() })),
    { reason: "unauthorized" },
  );
});

test("MCP cause traversal keeps first match and temporary suppression", () => {
  const deep = interactiveError({ serverName: "deep", reason: "invalid_grant" });
  assert.deepEqual(classify({ cause: { cause: deep } }), { reason: "invalid_grant" });
  assert.equal(classify({ cause: temporaryError({ serverName: "stop", cause: deep }) }), undefined);
  assert.deepEqual(classify({ code: sdk.SdkErrorCode.ClientHttpAuthentication, cause: deep }), {
    reason: "unauthorized",
  });
});

test("MCP classification propagates ordinary getter failures", () => {
  const failure = new Error("owned getter");
  for (const key of [temporary, interactive, "code", "cause"] as const) {
    const value = Object.defineProperty({}, key, {
      get() {
        throw failure;
      },
    });
    assert.throws(
      () => classify(value),
      (error) => error === failure,
    );
  }
});

test("MCP nullish and ordinary primitives are unclassified", () => {
  for (const value of [null, undefined, false, 0, NaN, "text", 1n, Symbol("owned")])
    assert.equal(classify(value), undefined);
});

test("MCP primitive cause lookup remains ordinary, including repeated primitive values", () => {
  const prior = Object.getOwnPropertyDescriptor(String.prototype, "cause");
  let reads = 0;
  try {
    Object.defineProperty(String.prototype, "cause", {
      configurable: true,
      get() {
        reads++;
        return reads === 1 ? "second" : reads === 2 ? "first" : new sdk.UnauthorizedError();
      },
    });
    assert.deepEqual(classify("first"), { reason: "unauthorized" });
    assert.equal(reads, 3);
  } finally {
    if (prior) Object.defineProperty(String.prototype, "cause", prior);
    else Reflect.deleteProperty(String.prototype, "cause");
  }
  assert.deepEqual(Object.getOwnPropertyDescriptor(String.prototype, "cause"), prior);
});

test("MCP direct self-cause terminates", () => {
  const value: { cause?: unknown } = {};
  value.cause = value;
  assert.equal(classify(value), undefined);
});

test("MCP multi-object cause cycle terminates without stack exhaustion", () => {
  const first: { cause?: unknown } = {};
  const second = { cause: first };
  first.cause = second;
  assert.equal(classify(first), undefined);
});

test("MCP cycle identity is checked before repeated property reads", () => {
  let reads = 0;
  const first = {
    get [interactive]() {
      reads++;
      return reads > 1;
    },
    reason: "unauthorized",
    cause: {} as { cause?: unknown },
  };
  first.cause.cause = first;
  assert.equal(classify(first), undefined);
  assert.equal(reads, 1);
});

test("MCP long acyclic cause chains have no arbitrary depth cutoff", () => {
  let value: unknown = new sdk.UnauthorizedError();
  for (let i = 0; i < 20000; i++) value = { cause: value };
  assert.deepEqual(classify(value), { reason: "unauthorized" });
});

test("MCP cause traversal state belongs to each call", () => {
  const value: { cause?: unknown } = {};
  assert.equal(classify(value), undefined);
  value.cause = new sdk.UnauthorizedError();
  assert.deepEqual(classify(value), { reason: "unauthorized" });
});
