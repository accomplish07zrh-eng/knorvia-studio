// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Knorvia Studio contributors

import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import { basename, dirname, extname } from "node:path";
import test from "node:test";
import {
  binaryRequest,
  exactBytes,
  fixture,
  ready,
  textRequest,
  uri,
} from "./artifact-store.fixture.js";

test("historical URI reads the same persisted bytes and metadata as the current scheme", async (t) => {
  const { store } = await fixture(t);
  const written = await store.writeToolResultArtifact(textRequest({ contentType: "text/plain" }));
  const value = written.uri.replace(/^knorvia-artifact:/u, "zcode-artifact:");
  assert.equal((await store.readToolResultArtifact({ uri: value })).content, textRequest().content);
  assert.deepEqual(
    (await store.readToolResultBinaryArtifact({ uri: value })).bytes,
    Uint8Array.from(Buffer.from(textRequest().content)),
  );
  assert.equal((await store.statToolResultArtifact({ uri: value })).path, written.path);
  assert.match(written.uri, /^knorvia-artifact:/u);
});

test("historical URI supports derived priming and reconstruction without changing new URI spelling", async (t) => {
  const { store } = await fixture(t);
  const written = await store.writeToolResultArtifact(
    textRequest({ content: "data:image/png;base64,AQID" }),
  );
  const value = written.uri.replace(/^knorvia-artifact:/u, "zcode-artifact:");
  await exactBytes(
    ready(await store.ensureMediaAttachmentPath({ uri: value, mediaType: "image/png" })),
    new Uint8Array([1, 2, 3]),
  );
  const another = uri("owned-session", "prime").replace(/^knorvia-artifact:/u, "zcode-artifact:");
  await exactBytes(
    ready(
      await store.primeImageAttachmentPath({
        uri: another,
        mediaType: "image/png",
        bytes: new Uint8Array([9]),
      }),
    ),
    new Uint8Array([9]),
  );
});

for (const sessionId of [".", ".."]) {
  for (const method of [
    "text",
    "binary",
    "read",
    "binary-read",
    "stat",
    "prime",
    "ensure",
  ] as const) {
    test(`dot session ${JSON.stringify(sessionId)} is rejected before IO by ${method}`, async (t) => {
      const { store, root } = await fixture(t);
      const value = uri(sessionId);
      const actions = {
        text: () => store.writeToolResultArtifact(textRequest({ sessionId })),
        binary: () => store.writeToolResultBinaryArtifact(binaryRequest({ sessionId })),
        read: () => store.readToolResultArtifact({ uri: value }),
        "binary-read": () => store.readToolResultBinaryArtifact({ uri: value }),
        stat: () => store.statToolResultArtifact({ uri: value }),
        prime: () =>
          store.primeMediaAttachmentPath({
            uri: value,
            mediaType: "text/plain",
            bytes: new Uint8Array([1]),
          }),
        ensure: () => store.ensureMediaAttachmentPath({ uri: value, mediaType: "text/plain" }),
      };
      await assert.rejects(actions[method](), (error: unknown) => {
        assert.ok(error instanceof Error);
        assert.equal(error.constructor, Error);
        assert.equal(error.message, `Invalid tool artifact session path: ${sessionId}`);
        assert.equal(error.cause, undefined);
        return true;
      });
      assert.deepEqual(await readdir(root), []);
    });
  }
}

test("preflight abort wins over a dot-session path error", async (t) => {
  const { store } = await fixture(t);
  const reason = new Error("already stopped");
  await assert.rejects(
    store.writeToolResultArtifact(textRequest({ sessionId: ".." }), {
      signal: AbortSignal.abort(reason),
    }),
    (error: unknown) => error === reason,
  );
});

test("text mutation after call cannot change saved content, byte count, MIME or returned URI", async (t) => {
  const { store } = await fixture(t);
  const request = textRequest({
    sessionId: "before",
    toolCallId: "before-call",
    content: "first 附件",
    contentType: "text/plain",
  });
  const pending = store.writeToolResultArtifact(request);
  Object.assign(request, {
    sessionId: "after",
    toolCallId: "after-call",
    content: "later",
    contentType: "text/markdown",
  });
  const result = await pending;
  assert.equal(basename(dirname(result.path!)), "before");
  assert.ok(basename(result.path!).startsWith("before-call-"));
  assert.equal(extname(result.path!), ".txt");
  assert.equal(await readFile(result.path!, "utf8"), "first 附件");
  assert.equal(result.bytes, Buffer.byteLength("first 附件"));
  assert.equal(result.contentType, "text/plain");
  assert.equal(new URL(result.uri).hostname, "before");
  assert.equal((await store.readToolResultArtifact({ uri: result.uri })).content, "first 附件");
});

test("binary mutation after call cannot disagree with original saved bytes and receipt MIME/URI", async (t) => {
  const { store } = await fixture(t);
  const request = binaryRequest({ sessionId: "before", contentType: "image/png" });
  const original = Uint8Array.from(request.content);
  const pending = store.writeToolResultBinaryArtifact(request);
  request.content.fill(9);
  Object.assign(request, {
    sessionId: "after",
    toolCallId: "after-call",
    contentType: "text/plain",
    extension: ".txt",
  });
  const result = await pending;
  await exactBytes(result.path, original);
  assert.equal(result.contentType, "image/png");
  assert.equal(extname(result.path!), ".png");
  assert.equal(new URL(result.uri).hostname, "before");
  assert.deepEqual((await store.readToolResultBinaryArtifact({ uri: result.uri })).bytes, original);
});

for (const method of [
  "readToolResultArtifact",
  "readToolResultBinaryArtifact",
  "statToolResultArtifact",
] as const) {
  test(`${method} captures the lookup URI so its receipt cannot describe another artifact`, async (t) => {
    const { store } = await fixture(t);
    const first = await store.writeToolResultArtifact(textRequest({ content: "first" }));
    const other = await store.writeToolResultArtifact(textRequest({ content: "other artifact" }));
    const request = { uri: first.uri };
    const pending = store[method](request);
    request.uri = other.uri;
    const result = await pending;
    assert.equal(result.path, first.path);
    assert.equal(result.uri, first.uri);
  });
}

test("ensure captures URI and requested media before awaiting so a shared flight resolves its original request", async (t) => {
  const { store } = await fixture(t);
  const first = await store.writeToolResultArtifact(
    textRequest({ content: "data:image/png;base64,AQID" }),
  );
  const other = await store.writeToolResultArtifact(
    textRequest({ content: "data:video/mp4;base64,BAUG" }),
  );
  const request = { uri: first.uri, mediaType: "image/png" };
  const pending = store.ensureMediaAttachmentPath(request);
  Object.assign(request, { uri: other.uri, mediaType: "video/mp4" });
  const shared = store.ensureMediaAttachmentPath({ uri: first.uri, mediaType: "image/png" });
  assert.equal(shared, pending);
  const path = ready(await shared);
  assert.equal(extname(path), ".png");
  await exactBytes(path, new Uint8Array([1, 2, 3]));
});
