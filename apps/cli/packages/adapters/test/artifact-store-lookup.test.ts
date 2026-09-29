// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Knorvia Studio contributors

import assert from "node:assert/strict";
import { mkdir, readdir, stat } from "node:fs/promises";
import { join } from "node:path";
import test from "node:test";
import { binaryRequest, fixture, seed, textRequest, uri } from "./artifact-store.fixture.js";

for (const [extension, mime, text] of [
  ["txt", "text/plain", true],
  ["md", "text/markdown", true],
  ["json", "application/json", true],
  ["html", "text/html", true],
  ["htm", "text/html", true],
  ["csv", "text/csv", true],
  ["SVG", "image/svg+xml", false],
  ["png", "image/png", false],
  ["jpeg", "image/jpeg", false],
  ["jpg", "image/jpeg", false],
  ["gif", "image/gif", false],
  ["webp", "image/webp", false],
  ["pdf", "application/pdf", false],
  ["bin", "application/octet-stream", false],
  ["docx", "application/octet-stream", false],
  ["odd", "application/octet-stream", false],
] as const) {
  test(`read, binary read and stat infer ${extension} without corrupting bytes`, async (t) => {
    const { store, options } = await fixture(t);
    const bytes = text ? Buffer.from("附件 é") : Buffer.from([0, 255, 128, 44, 10]);
    const path = await seed(options, `call-item.${extension}`, bytes);
    const value = uri();
    const read = await store.readToolResultArtifact({ uri: value });
    assert.deepEqual(read, {
      uri: value,
      path,
      contentType: mime,
      content: bytes.toString(text ? "utf8" : "base64"),
      bytes: bytes.length,
    });
    const binary = await store.readToolResultBinaryArtifact({ uri: value });
    assert.deepEqual(binary, {
      uri: value,
      path,
      contentType: mime,
      bytes: Uint8Array.from(bytes),
    });
    const metadata = await store.statToolResultArtifact({ uri: value });
    const native = await stat(path);
    assert.deepEqual(metadata, {
      uri: value,
      path,
      contentType: mime,
      bytes: native.size,
      mtimeMs: native.mtimeMs,
    });
  });
}

test("lookup keeps first native directory entry containing the requested fragment", async (t) => {
  const { store, options } = await fixture(t);
  await seed(options, "b-prefix-item-tail.txt", "second");
  await seed(options, "a-item-middle.txt", "first");
  const entries = await readdir(join(options.rootDir, "owned-session"));
  const expected = entries.find((entry) => entry.includes("item"));
  const read = await store.readToolResultArtifact({ uri: uri() + "?x=1#fragment" });
  assert.equal(read.path, join(options.rootDir, "owned-session", expected!));
  assert.equal(read.uri, uri() + "?x=1#fragment");
});

for (const [name, mime, content] of [
  [".txt", "text/plain", "fixture"],
  [".json", "application/json", "fixture"],
  [".svg", "image/svg+xml", "Zml4dHVyZQ=="],
] as const) {
  test(`legacy filename ${name} keeps suffix-based content inference`, async (t) => {
    const { store, options } = await fixture(t);
    await seed(options, name, "fixture");
    const result = await store.readToolResultArtifact({ uri: uri("owned-session", name.slice(1)) });
    assert.equal(result.contentType, mime);
    assert.equal(result.content, content);
  });
}

test("lookup decodes artifact IDs, strips leading slashes and preserves session case", async (t) => {
  const { store, options } = await fixture(t);
  await seed(options, "call-an id.txt", "decoded");
  const value = "knorvia-artifact://owned-session////an%20id";
  assert.equal((await store.readToolResultArtifact({ uri: value })).content, "decoded");
  const written = await store.writeToolResultArtifact(textRequest({ sessionId: "SessionABC" }));
  assert.equal(
    (await store.readToolResultArtifact({ uri: written.uri })).content,
    textRequest().content,
  );
});

test("missing artifact distinguishes missing directory from no matching entry", async (t) => {
  const { store, options } = await fixture(t);
  await assert.rejects(store.readToolResultArtifact({ uri: uri() }), { code: "ENOENT" });
  await seed(options, "other.txt", "present");
  await assert.rejects(store.readToolResultArtifact({ uri: uri() }), {
    message: `Tool artifact not found: ${uri()}`,
  });
  await assert.rejects(store.statToolResultArtifact({ uri: uri() }), {
    message: `Tool artifact not found: ${uri()}`,
  });
});

test("stat retains native directory metadata for a matching non-file entry", async (t) => {
  const { store, options } = await fixture(t);
  const path = join(options.rootDir, "owned-session", "item.txt");
  await mkdir(path, { recursive: true });
  const native = await stat(path);
  const result = await store.statToolResultArtifact({ uri: uri() });
  assert.equal(result.path, path);
  assert.equal(result.bytes, native.size);
});

for (const value of [
  "not a URL",
  "https://owned-session/item",
  "knorvia-artifact:///item",
  "knorvia-artifact://owned-session/",
]) {
  test(`URI validation ${JSON.stringify(value)} distinguishes invalid and unsupported`, async (t) => {
    const { store } = await fixture(t);
    const prefix = value.startsWith("https:") ? "Unsupported" : "Invalid";
    await assert.rejects(store.readToolResultArtifact({ uri: value }), (error: unknown) => {
      assert.ok(error instanceof Error);
      assert.equal(error.message, `${prefix} tool artifact URI: ${value}`);
      assert.equal(error.cause instanceof Error, value === "not a URL");
      return true;
    });
  });
}

test("malformed percent decoding remains an unwrapped native URIError", async (t) => {
  const { store } = await fixture(t);
  for (const value of [
    "knorvia-artifact://owned%ZZ/item",
    "knorvia-artifact://owned-session/%ZZ",
  ]) {
    await assert.rejects(store.readToolResultArtifact({ uri: value }), URIError);
  }
});

test("all durable and lookup operations honor preflight Error identity and fallback messages", async (t) => {
  const { store } = await fixture(t);
  const calls = [
    [
      (signal: AbortSignal) => store.writeToolResultArtifact(textRequest(), { signal }),
      "Tool artifact write cancelled",
    ],
    [
      (signal: AbortSignal) => store.writeToolResultBinaryArtifact(binaryRequest(), { signal }),
      "Tool binary artifact write cancelled",
    ],
    [
      (signal: AbortSignal) => store.readToolResultArtifact({ uri: "invalid" }, { signal }),
      "Tool artifact read cancelled",
    ],
    [
      (signal: AbortSignal) => store.readToolResultBinaryArtifact({ uri: "invalid" }, { signal }),
      "Tool artifact read cancelled",
    ],
    [
      (signal: AbortSignal) => store.statToolResultArtifact({ uri: "invalid" }, { signal }),
      "Tool artifact stat cancelled",
    ],
  ] as const;
  for (const [call, message] of calls) {
    const reason = new Error("owned abort reason");
    await assert.rejects(call(AbortSignal.abort(reason)), (error: unknown) => error === reason);
    await assert.rejects(call(AbortSignal.abort("reason")), { message });
  }
});
