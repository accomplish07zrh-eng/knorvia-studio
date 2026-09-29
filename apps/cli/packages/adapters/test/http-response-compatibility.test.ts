// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Knorvia Studio contributors

import assert from "node:assert/strict";
import test from "node:test";
import {
  closed,
  portError,
  readResponseBody,
  rejection,
  response,
  scripted,
  signal,
  url,
} from "./http-response.fixture.js";

for (const limit of [-1, -Infinity]) {
  test(`negative limit ${limit} precedes size header and cancellation`, async () => {
    const abort = new AbortController();
    abort.abort();
    portError(
      await rejection(readResponseBody(response(null, "100"), limit, abort.signal, url)),
      "too_large",
      "HTTP response size limit must not be negative",
    );
  });
}
for (const [length, parsed] of [
  ["3suffix", 3],
  [" +3 suffix ", 3],
  ["3.99", 3],
  ["003", 3],
  ["999", 999],
] as const) {
  test(`declared size rejects numeric prefix ${length}`, async () => {
    const abort = new AbortController();
    abort.abort();
    portError(
      await rejection(readResponseBody(response(null, length), 2, abort.signal, url)),
      "too_large",
      `HTTP response is too large: content-length=${parsed}, max=2`,
    );
  });
}
for (const length of ["", "nope", "Infinity", "-1", "1e9", "0x9999", "1"]) {
  test(`header keeps ordinary parseInt behavior for ${JSON.stringify(length)}`, async () => {
    assert.deepEqual(
      await readResponseBody(response(closed([new Uint8Array([7])]), length), 1, signal(), url),
      new Uint8Array([7]),
    );
  });
}
for (const limit of [NaN, Infinity]) {
  test(`non-finite permitted limit ${limit} keeps byte and declared comparisons`, async () => {
    assert.deepEqual(
      await readResponseBody(
        response(closed([new Uint8Array([1, 2])]), "999"),
        limit,
        signal(),
        url,
      ),
      new Uint8Array([1, 2]),
    );
  });
}
for (const limit of [0, -0]) {
  test(`zero limit ${Object.is(limit, -0) ? "-0" : "0"} accepts an empty body`, async () => {
    assert.deepEqual(
      await readResponseBody(response(closed([new Uint8Array()])), limit, signal(), url),
      new Uint8Array(),
    );
  });
}
test("result preserves subarray byte order and is a new allocation", async () => {
  const bytes = new Uint8Array([9, 0, 127, 255, 8]);
  const first = bytes.subarray(1, 3),
    second = bytes.subarray(3, 4);
  const result = await readResponseBody(
    response(closed([first, new Uint8Array(), second])),
    3,
    signal(),
    url,
  );
  assert.deepEqual(result, new Uint8Array([0, 127, 255]));
  assert.notEqual(result.buffer, bytes.buffer);
});
test("understated content-length cannot bypass actual limit", async () => {
  portError(
    await rejection(
      readResponseBody(
        response(closed([new Uint8Array([1]), new Uint8Array([2])]), "1"),
        1,
        signal(),
        url,
      ),
    ),
    "too_large",
    "HTTP response is too large: bytes>1",
  );
});
test("real null-body response ignores an already cancelled signal", async () => {
  const abort = new AbortController();
  abort.abort("reason");
  assert.deepEqual(await readResponseBody(response(null), 0, abort.signal, url), new Uint8Array());
});
for (const limit of [2, 1, NaN]) {
  test(`null fallback enforces its actual byte length at ${limit}`, async () => {
    const value = response(null);
    Object.defineProperty(value, "arrayBuffer", {
      value: async () => new Uint8Array([4, 5]).buffer,
    });
    const pending = readResponseBody(value, limit, signal(), url);
    if (limit === 1)
      portError(
        await rejection(pending),
        "too_large",
        "HTTP response is too large: bytes=2, max=1",
      );
    else assert.deepEqual(await pending, new Uint8Array([4, 5]));
  });
}
for (const [label, reason] of [
  ["error", new Error("owned fallback failure")],
  ["null", null],
  ["undefined", undefined],
  ["string", "owned rejection"],
] as const) {
  test(`null fallback preserves ${label} rejection identity`, async () => {
    const value = response(null);
    Object.defineProperty(value, "arrayBuffer", { value: () => Promise.reject(reason) });
    assert.equal(await rejection(readResponseBody(value, 1, signal(), url)), reason);
  });
}
test("an external reader keeps its lock and precedes an already aborted signal", async () => {
  const body = closed([new Uint8Array([1])]);
  const value = response(body);
  const reader = body.getReader();
  const abort = new AbortController();
  abort.abort();
  try {
    const error = await rejection(readResponseBody(value, 1, abort.signal, url));
    assert.ok(error instanceof TypeError);
    assert.equal(body.locked, true);
    assert.deepEqual((await reader.read()).value, new Uint8Array([1]));
  } finally {
    reader.releaseLock();
  }
});
test("size precheck does not cancel or steal an externally locked body", async () => {
  const body = closed([new Uint8Array([1])]);
  const value = response(body, "9");
  const reader = body.getReader();
  try {
    portError(
      await rejection(readResponseBody(value, 1, signal(), url)),
      "too_large",
      "HTTP response is too large: content-length=9, max=1",
    );
    assert.equal(body.locked, true);
    assert.deepEqual((await reader.read()).value, new Uint8Array([1]));
  } finally {
    reader.releaseLock();
  }
});
test("structured reader skips absent value and stops at done", async () => {
  const chunks = [
    { done: false, value: undefined },
    { done: false, value: new Uint8Array([6]) },
    { done: true, value: new Uint8Array([9]) },
  ];
  const fixture = scripted({
    read: async () => chunks.shift() as ReadableStreamReadResult<Uint8Array>,
  });
  assert.deepEqual(await readResponseBody(fixture.response, 1, signal(), url), new Uint8Array([6]));
  assert.equal(fixture.state.reads, 3);
});
test("in-flight chunks retain reference semantics until final assembly", async () => {
  const bytes = new Uint8Array([1]);
  let calls = 0;
  const fixture = scripted({
    read: async () => {
      if (calls++ === 0) return { done: false, value: bytes };
      bytes[0] = 7;
      return { done: true, value: undefined };
    },
  });
  assert.deepEqual(await readResponseBody(fixture.response, 1, signal(), url), new Uint8Array([7]));
});
