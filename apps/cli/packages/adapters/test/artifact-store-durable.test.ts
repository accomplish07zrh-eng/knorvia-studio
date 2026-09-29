// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Knorvia Studio contributors

import assert from "node:assert/strict";
import { access, readFile } from "node:fs/promises";
import { basename, dirname, extname, join } from "node:path";
import test from "node:test";
import {
  artifact,
  binaryRequest,
  exactBytes,
  fixture,
  textRequest,
} from "./artifact-store.fixture.js";

test("constructor and factory capture roots without creating directories", async (t) => {
  const { options, store } = await fixture(t);
  const originalRoot = options.rootDir;
  const factory = artifact.createNodeToolArtifactStore(options);
  assert.ok(factory instanceof artifact.NodeToolArtifactStore);
  await assert.rejects(access(originalRoot), { code: "ENOENT" });
  options.rootDir = join(originalRoot, "later-root");
  const result = await store.writeToolResultArtifact(textRequest());
  assert.equal(dirname(result.path!), join(originalRoot, "owned-session"));
  await assert.rejects(access(options.rootDir), { code: "ENOENT" });
});

test("text receipts identify native UTF8 bytes and a newly persisted artifact", async (t) => {
  const { store } = await fixture(t);
  const request = textRequest();
  const before = Date.now();
  const result = await store.writeToolResultArtifact(request);
  assert.match(result.id, /^tool-result-[0-9a-f-]{36}$/u);
  assert.equal(result.uri, `knorvia-artifact://owned-session/${result.id}`);
  assert.equal(result.contentType, "application/json");
  assert.equal(result.bytes, Buffer.byteLength(request.content));
  assert.ok(result.createdAt instanceof Date);
  assert.ok(result.createdAt.getTime() >= before && result.createdAt.getTime() <= Date.now());
  assert.equal(await readFile(result.path!, "utf8"), request.content);
  assert.equal((await store.readToolResultArtifact({ uri: result.uri })).content, request.content);
  const second = await store.writeToolResultArtifact(request);
  assert.notEqual(second.id, result.id);
  assert.notEqual(second.path, result.path);
});

for (const [mime, extension] of [
  ["text/plain", ".txt"],
  ["text/markdown", ".md"],
  ["application/json", ".json"],
  ["image/png", ".png"],
  ["image/jpeg", ".jpg"],
  ["image/jpg", ".jpg"],
  ["image/gif", ".gif"],
  ["image/webp", ".webp"],
  ["application/pdf", ".pdf"],
  [" Text/Plain ; charset=utf-8", ".txt"],
  ["application/x-custom", ".json"],
  ["", ".json"],
  ["constructor", ".json"],
  ["__proto__", ".json"],
] as const) {
  test(`text extension ${JSON.stringify(mime)} preserves original declared MIME`, async (t) => {
    const { store } = await fixture(t);
    const result = await store.writeToolResultArtifact(textRequest({ contentType: mime }));
    assert.equal(extname(result.path!), extension);
    assert.equal(result.contentType, mime);
  });
}

for (const [mime, extension] of [
  ["application/octet-stream", ".bin"],
  ["application/problem+json", ".json"],
  ["application/x-thing; note=JSON", ".json"],
  ["image/png; test=1", ".png"],
  ["Text/Markdown", ".md"],
  ["application/pdf", ".pdf"],
  ["", ".bin"],
  ["constructor", ".bin"],
  ["__proto__", ".bin"],
] as const) {
  test(`binary default extension ${JSON.stringify(mime)} uses raw whole-type json fallback`, async (t) => {
    const { store } = await fixture(t);
    const request = binaryRequest({ contentType: mime });
    const result = await store.writeToolResultBinaryArtifact(request);
    assert.equal(extname(result.path!), extension);
    assert.equal(result.contentType, mime);
    assert.equal(result.bytes, request.content.byteLength);
    await exactBytes(result.path, request.content);
  });
}

for (const [input, expected] of [
  ["DOCX", ".docx"],
  [".SVG", ".svg"],
  [".x-l_sx", ".xlsx"],
  ["../png", ".bin"],
  ["", ".bin"],
  [".", ".bin"],
  [".abcdefghijklmnopqr", ".abcdefghijklmno"],
] as const) {
  test(`binary explicit extension ${JSON.stringify(input)} is one sanitized suffix`, async (t) => {
    const { store } = await fixture(t);
    const result = await store.writeToolResultBinaryArtifact(binaryRequest({ extension: input }));
    assert.equal(extname(result.path!), expected);
  });
}

test("ordinary session and call sanitation keeps Unicode input URI and safe file segments", async (t) => {
  const { store, options } = await fixture(t);
  const sessionId = "会话/A B";
  const result = await store.writeToolResultArtifact(
    textRequest({ sessionId, toolCallId: "../a b/工具" }),
  );
  assert.equal(dirname(result.path!), join(options.rootDir, "___A_B"));
  assert.equal(basename(result.path!), `.._a_b___-${result.id}.json`);
  assert.equal(new URL(result.uri).hostname, encodeURIComponent(sessionId));
  assert.equal(
    (await store.readToolResultArtifact({ uri: result.uri })).content,
    textRequest().content,
  );
});

test("empty and long call names retain unknown fallback and 120-character limit", async (t) => {
  const { store } = await fixture(t);
  const empty = await store.writeToolResultArtifact(textRequest({ sessionId: "", toolCallId: "" }));
  assert.equal(basename(dirname(empty.path!)), "unknown");
  assert.equal(basename(empty.path!), `unknown-${empty.id}.json`);
  const long = await store.writeToolResultArtifact(textRequest({ toolCallId: "a".repeat(130) }));
  assert.equal(basename(long.path!), `${"a".repeat(120)}-${long.id}.json`);
});

test("binary copies caller bytes before its first asynchronous write boundary", async (t) => {
  const { store } = await fixture(t);
  const request = binaryRequest();
  const expected = Uint8Array.from(request.content);
  const pending = store.writeToolResultBinaryArtifact(request);
  request.content.fill(11);
  const result = await pending;
  await exactBytes(result.path, expected);
  const read = await store.readToolResultBinaryArtifact({ uri: result.uri });
  assert.deepEqual(read.bytes, expected);
  read.bytes.fill(0);
  await exactBytes(result.path, expected);
});

test("late cancellation does not roll back an already started durable write", async (t) => {
  const { store } = await fixture(t);
  const controller = new AbortController();
  const pending = store.writeToolResultArtifact(textRequest(), { signal: controller.signal });
  controller.abort(new Error("late fixture cancellation"));
  const result = await pending;
  assert.equal(
    (await store.readToolResultArtifact({ uri: result.uri })).content,
    textRequest().content,
  );
});
