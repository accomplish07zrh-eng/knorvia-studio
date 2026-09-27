// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Knorvia Studio contributors
import assert from "node:assert/strict";
import test from "node:test";
import {
  ErrorPayloadRole as Role,
  projectExecutionErrorPayload as project,
  selectExecutionErrorMessage as original,
  withErrorPayloadRole,
} from "../src/errors/error-payload.js";

test("first non-wrapper message wins and underlying uses the deepest non-wrapper", () => {
  const input = {
    message: "outer",
    context: { errorPayloadRole: Role.Wrapper },
    cause: {
      message: " middle\nmessage ",
      cause: { message: "deep", errorPayloadRole: Role.Primary },
    },
  };
  assert.deepEqual(project(input), {
    message: "middle message",
    detail: "outer\ndeep",
    underlyingErrorMessage: "deep",
  });
  assert.equal(original(input), " middle\nmessage ");
  assert.equal(project({ ...input, errorPayloadRole: Role.Primary }).message, "outer");
  assert.equal(
    project({ message: "not an explicit wrapper", cause: input }).message,
    "not an explicit wrapper",
  );
});

test("cause selection does not skip a selected invalid or false value", () => {
  for (const cause of [false, 0, "", "text", [], () => 1])
    assert.deepEqual(project({ message: "root", cause, lastError: { message: "later" } }), {
      message: "root",
      underlyingErrorMessage: "root",
    });
  assert.equal(
    project({ cause: null, lastError: { message: "last" }, error: { message: "error" } }).message,
    "last",
  );
  assert.equal(
    project({ cause: undefined, lastError: null, error: { message: "error" } }).message,
    "error",
  );
});

test("cause collection is capped at twelve identities and terminates cycles", () => {
  const nodes = Array.from(
    { length: 15 },
    (_, index) => ({ message: `m${index}` }) as { message: string; cause?: unknown },
  );
  nodes.forEach((node, index) => {
    node.cause = nodes[index + 1];
  });
  const result = project(nodes[0]);
  assert.equal(result.message, "m0");
  assert.equal(result.underlyingErrorMessage, "m11");
  assert.equal(
    result.detail,
    nodes
      .slice(1, 12)
      .map((node) => node.message)
      .join("\n"),
  );
  nodes[1].cause = nodes[0];
  assert.deepEqual(project(nodes[0]), {
    message: "m0",
    detail: "m1",
    underlyingErrorMessage: "m1",
  });
  nodes[0].cause = nodes[0];
  assert.deepEqual(project(nodes[0]), { message: "m0", underlyingErrorMessage: "m0" });
});

test("a deepest empty non-wrapper is not replaced by an earlier message", () => {
  assert.deepEqual(project({ message: "root", cause: {} }), { message: "root" });
  assert.deepEqual(project({ message: "root", cause: { detail: "leaf" } }), {
    message: "root",
    detail: "leaf",
    underlyingErrorDetail: "leaf",
  });
  assert.deepEqual(
    project({
      message: "root",
      errorPayloadRole: Role.Wrapper,
      cause: { message: "leaf", errorPayloadRole: Role.Wrapper },
    }),
    { message: "root", detail: "leaf", underlyingErrorMessage: "leaf" },
  );
});

test("code selection observes primary role then the three ordered fallback groups", () => {
  const cases = [
    [
      {
        message: "m",
        providerCode: " P ",
        code: "TOP",
        context: { providerCode: "CP", code: "C" },
      },
      "P",
    ],
    [{ message: "m", code: "P", context: { code: "C" }, errorPayloadRole: Role.Wrapper }, "C"],
    [{ message: "m", context: { code: "C" }, cause: { code: "INNER" } }, "C"],
    [{ context: { code: "OUTER" }, cause: { message: "m", code: "INNER" } }, "INNER"],
    [{ message: "m", errorPayloadRole: Role.Wrapper, cause: { code: "INNER" } }, "INNER"],
    [
      { context: { code: "OUTER" }, cause: { code: "WRAP", errorPayloadRole: Role.Wrapper } },
      "OUTER",
    ],
    [{ code: 0, cause: { code: "0" } }, "0"],
    [{ code: Infinity, cause: { code: -2 } }, "-2"],
  ] as const;
  for (const [error, code] of cases) assert.equal(project(error).code, code);
});

test("attribution validation preserves nearest invalid enum and valid deeper numeric policy", () => {
  const result = project({
    message: "m",
    context: {
      source: "unknown",
      errorPhase: "bad",
      exceptionKind: "bad",
      transport: "ftp",
      statusCode: 600,
      status: 200,
      retryable: "true",
      providerId: "",
      provider: " outer ",
    },
    cause: {
      context: {
        source: "provider",
        errorPhase: "response",
        exceptionKind: "api_call",
        transport: "http",
        statusCode: 201,
        retryable: false,
        providerId: "inner",
        model: " model ",
      },
    },
  });
  assert.deepEqual(result.attribution, {
    providerId: "outer",
    modelId: "model",
    statusCode: 201,
    retryable: false,
  });
  assert.deepEqual(Object.keys(result.attribution!), [
    "providerId",
    "modelId",
    "statusCode",
    "retryable",
  ]);
});

test("all attribution fields retain ordered output and text limits", () => {
  const context = {
    reason: " reason ",
    source: "provider",
    errorPhase: "stream",
    exceptionKind: "transport",
    provider: "p",
    model: "m",
    providerKind: "k".repeat(170),
    transport: "sse",
    status: 429,
    providerCode: 42,
    retryable: false,
  };
  assert.deepEqual(project({ message: "m", context }).attribution, {
    source: "provider",
    reason: "reason",
    errorPhase: "stream",
    exceptionKind: "transport",
    providerId: "p",
    modelId: "m",
    providerKind: "k".repeat(160),
    transport: "sse",
    statusCode: 429,
    providerErrorCode: "42",
    retryable: false,
  });
  assert.equal(project({ code: "123" }).attribution?.providerErrorCode, "123");
  assert.equal(project({ code: "1.2" }).attribution, undefined);
  assert.equal(
    project({ retryable: true, errorPayloadRole: Role.Wrapper, cause: { retryable: false } })
      .attribution?.retryable,
    false,
  );
});

test("detail order, deduplication and context aliases retain their distinct text policy", () => {
  const result = project({
    message: " main ",
    detail: " repeated\ntext ",
    context: {
      providerId: "",
      provider: "blocked",
      providerCode: 0,
      model: "m",
      requestId: " req ",
      code: "c",
      reason: " why\nhere ",
      statusCode: 0,
      status: 200,
      retryable: false,
    },
    cause: { message: "repeated text", detail: "main" },
  });
  assert.equal(
    result.detail,
    "repeated text\nprovider_code=0 model=m request=req code=c reason=why\nhere status=0 retryable=false",
  );
  assert.equal(result.attribution?.providerId, "blocked");
  assert.equal(result.attribution?.statusCode, undefined);
});

test("raw selection and compact projection keep fallback and five hundred unit boundaries", () => {
  const text = " \n" + "x".repeat(510) + "\n ";
  assert.equal(original({ message: text }), text);
  assert.equal(project({ message: text }).message, "x".repeat(497) + "...");
  for (const input of [undefined, null, false, [], () => 1]) {
    assert.deepEqual(project(input), { message: "Turn execution failed" });
    assert.equal(original(input, "  raw fallback\n "), "  raw fallback\n ");
    assert.equal(project(input, "  fallback\n ").message, "fallback");
    assert.equal(project(input, " \n ").message, " \n ");
  }
});

test("role annotation makes a shallow copy and preserves enumerable symbol data", () => {
  const symbol = Symbol("fixture");
  const nested = { retained: true };
  const context = { errorPayloadRole: Role.Primary, nested, [symbol]: 7 };
  const result = withErrorPayloadRole(context, Role.Wrapper);
  assert.notEqual(result, context);
  assert.equal(context.errorPayloadRole, Role.Primary);
  assert.equal(result.nested, nested);
  assert.equal(result[symbol as unknown as string], 7);
  assert.deepEqual(Object.keys(result), ["errorPayloadRole", "nested"]);
  assert.deepEqual(withErrorPayloadRole(undefined, Role.Primary), { errorPayloadRole: "primary" });
});

test("a disappearing context retry flag still falls back to the frame policy", () => {
  let reads = 0;
  const result = project({
    message: "failure",
    retryable: true,
    context: {
      get retryable() {
        return ++reads === 3 ? undefined : false;
      },
    },
  });
  assert.equal(reads, 3);
  assert.equal(result.attribution?.retryable, true);
});
