// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Knorvia Studio contributors

import assert from "node:assert/strict";
import { access, mkdir, readdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import test from "node:test";
import {
  artifact,
  derivedPath,
  exactBytes,
  fixture,
  ready,
  uri,
} from "./artifact-store.fixture.js";

test("prime, image prime and ensure share exact pending URI Promise and ignore losing bytes", async (t) => {
  const { store } = await fixture(t);
  const bytes = new Uint8Array([1, 2, 3]);
  const first = store.primeMediaAttachmentPath({ uri: uri(), mediaType: "image/png", bytes });
  bytes.fill(8);
  const losing = {
    uri: uri(),
    get mediaType(): string {
      throw new Error("losing MIME inspected");
    },
    get bytes(): Uint8Array {
      throw new Error("losing bytes copied");
    },
  };
  assert.equal(store.primeMediaAttachmentPath(losing), first);
  assert.equal(store.primeImageAttachmentPath(losing), first);
  assert.equal(store.ensureMediaAttachmentPath(losing), first);
  await exactBytes(ready(await first), new Uint8Array([1, 2, 3]));
  const later = store.ensureMediaAttachmentPath({ uri: uri(), mediaType: "image/png" });
  assert.notEqual(later, first);
  assert.equal(ready(await later), ready(await first));
});

test("ensure-first flight resolves the instance read method at use time and retains all joiners", async (t) => {
  const { store } = await fixture(t);
  const first = store.ensureMediaAttachmentPath({ uri: uri(), mediaType: "image/png" });
  let calls = 0;
  store.readToolResultArtifact = async ({ uri: value }) => {
    calls++;
    return {
      uri: value,
      content: "data:image/png;base64,AQID",
      contentType: "text/plain",
      bytes: 26,
    };
  };
  assert.equal(
    store.primeMediaAttachmentPath({
      uri: uri(),
      mediaType: "video/mp4",
      bytes: new Uint8Array([9]),
    }),
    first,
  );
  await exactBytes(ready(await first), new Uint8Array([1, 2, 3]));
  assert.equal(calls, 1);
});

test("read rejection is shared by identity, clears flight, and allows retry", async (t) => {
  const { store } = await fixture(t);
  const failure = new Error("owned read failure");
  store.readToolResultArtifact = () => {
    throw failure;
  };
  const first = store.ensureMediaAttachmentPath({ uri: uri(), mediaType: "image/png" });
  assert.equal(store.ensureMediaAttachmentPath({ uri: uri(), mediaType: "image/png" }), first);
  await assert.rejects(first, (error: unknown) => error === failure);
  store.readToolResultArtifact = async ({ uri: value }) => ({
    uri: value,
    content: "data:image/png;base64,AQ==",
    contentType: "text/plain",
    bytes: 26,
  });
  const retried = store.ensureMediaAttachmentPath({ uri: uri(), mediaType: "image/png" });
  assert.notEqual(retried, first);
  await exactBytes(ready(await retried), new Uint8Array([1]));
});

test("new prime invalid bytes throw synchronously while URI failures reject a shareable Promise", async (t) => {
  const { store } = await fixture(t);
  assert.throws(
    () =>
      store.primeMediaAttachmentPath({
        uri: "invalid",
        mediaType: "text/plain",
        bytes: null as unknown as Uint8Array,
      }),
    TypeError,
  );
  let first: ReturnType<typeof store.primeMediaAttachmentPath> | undefined;
  assert.doesNotThrow(() => {
    first = store.primeMediaAttachmentPath({
      uri: "invalid",
      mediaType: "image/png",
      bytes: new Uint8Array(),
    });
  });
  assert.equal(store.ensureMediaAttachmentPath({ uri: "invalid", mediaType: "image/png" }), first);
  await assert.rejects(first!, { message: "Invalid tool artifact URI: invalid" });
  const retry = store.primeMediaAttachmentPath({
    uri: "invalid",
    mediaType: "image/png",
    bytes: new Uint8Array(),
  });
  assert.notEqual(retry, first);
  await assert.rejects(retry);
});

test("different URI and store instances retain independent flights", async (t) => {
  const { store, options } = await fixture(t);
  const other = new artifact.NodeToolArtifactStore(options);
  const first = store.primeMediaAttachmentPath({
    uri: uri(),
    mediaType: "image/png",
    bytes: new Uint8Array([1]),
  });
  const second = store.primeMediaAttachmentPath({
    uri: uri("owned-session", "other"),
    mediaType: "image/png",
    bytes: new Uint8Array([2]),
  });
  const third = other.ensureMediaAttachmentPath({ uri: uri(), mediaType: "text/plain" });
  assert.notEqual(first, second);
  assert.notEqual(first, third);
  assert.notEqual(ready(await first), ready(await second));
  assert.deepEqual(await third, { status: "unsupported" });
});

test("nonregular destination propagates native rename failure and removes its owned temporary file", async (t) => {
  const { store, options } = await fixture(t);
  const path = derivedPath(options, uri(), "image", ".png");
  await mkdir(path, { recursive: true });
  await writeFile(join(path, "sentinel"), "keep");
  await assert.rejects(
    store.primeMediaAttachmentPath({
      uri: uri(),
      mediaType: "image/png",
      bytes: new Uint8Array([1]),
    }),
    (error: unknown) => {
      assert.ok(error instanceof Error && "code" in error);
      assert.ok(["EISDIR", "EPERM", "EACCES", "EEXIST", "ENOTEMPTY"].includes(String(error.code)));
      return true;
    },
  );
  assert.deepEqual(await readdir(dirname(path)), [path.slice(dirname(path).length + 1)]);
  await access(join(path, "sentinel"));
});
