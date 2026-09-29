// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Knorvia Studio contributors

import assert from "node:assert/strict";
import { access, mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import test from "node:test";
import {
  artifact,
  derivedPath,
  exactBytes,
  fixture,
  overrideContent,
  ready,
  textRequest,
  uri,
} from "./artifact-store.fixture.js";

for (const [mime, kind, extension] of [
  ["image/png", "image", ".png"],
  ["image/jpeg", "image", ".jpg"],
  ["image/jpg", "image", ".jpg"],
  ["image/gif", "image", ".gif"],
  [" IMAGE/WEBP ; sample=1", "image", ".webp"],
  ["video/mp4", "video", ".mp4"],
  ["video/quicktime", "video", ".mov"],
  ["video/webm", "video", ".webm"],
  ["video/x-matroska", "video", ".mkv"],
  ["video/x-m4v", "video", ".m4v"],
  ["video/x-msvideo", "video", ".avi"],
  ["application/pdf", "pdf", ".pdf"],
] as const) {
  test(`prime ${mime} publishes bytes at the exact URI-derived ${kind} path`, async (t) => {
    const { store, options } = await fixture(t);
    const value = uri() + "?query=one#fragment";
    const bytes = Uint8Array.from([0, 1, 128, 255]);
    const result = await store.primeMediaAttachmentPath({ uri: value, mediaType: mime, bytes });
    const path = ready(result);
    assert.equal(path, derivedPath(options, value, kind, extension));
    await exactBytes(path, bytes);
    assert.deepEqual(await readdir(dirname(path)), [path.slice(dirname(path).length + 1)]);
  });
}

test("image prime is a media prime delegate and accepts empty raw bytes without signature validation", async (t) => {
  const { store } = await fixture(t);
  const result = await store.primeImageAttachmentPath({
    uri: uri(),
    mediaType: "image/png",
    bytes: new Uint8Array(),
  });
  await exactBytes(ready(result), new Uint8Array());
});

test("custom PDF root is captured independently of later constructor option mutation", async (t) => {
  const { options, root } = await fixture(t);
  const original = join(root, "pdf-custom");
  options.pdfCacheRootDir = original;
  const store = new artifact.NodeToolArtifactStore(options);
  options.pdfCacheRootDir = join(root, "later");
  const result = await store.primeMediaAttachmentPath({
    uri: uri(),
    mediaType: "application/pdf",
    bytes: new Uint8Array([1]),
  });
  assert.equal(dirname(dirname(ready(result))), original);
});

test("cache key includes URI spelling, query and fragment", async (t) => {
  const { store } = await fixture(t);
  const paths = [];
  for (const value of [uri(), uri() + "?a=1", uri() + "#b"]) {
    paths.push(
      ready(
        await store.primeMediaAttachmentPath({
          uri: value,
          mediaType: "image/png",
          bytes: new Uint8Array([1]),
        }),
      ),
    );
  }
  assert.equal(new Set(paths).size, 3);
});

for (const mediaType of [
  "text/plain",
  "image/svg+xml",
  "video/unknown",
  "",
  "application/octet-stream",
]) {
  test(`unsupported media ${JSON.stringify(mediaType)} skips IO and backing reads`, async (t) => {
    const { store, root } = await fixture(t);
    const calls = overrideContent(store, "not needed");
    assert.deepEqual(await store.ensureMediaAttachmentPath({ uri: uri(), mediaType }), {
      status: "unsupported",
    });
    assert.deepEqual(
      await store.primeMediaAttachmentPath({ uri: uri(), mediaType, bytes: new Uint8Array([1]) }),
      { status: "unsupported" },
    );
    assert.equal(calls(), 0);
    assert.deepEqual(await readdir(root), []);
  });
}

test("invalid URI wins over unsupported MIME in prime and ensure", async (t) => {
  const { store } = await fixture(t);
  await assert.rejects(
    store.primeMediaAttachmentPath({
      uri: "invalid",
      mediaType: "text/plain",
      bytes: new Uint8Array(),
    }),
    { message: "Invalid tool artifact URI: invalid" },
  );
  await assert.rejects(
    store.ensureMediaAttachmentPath({ uri: "invalid", mediaType: "text/plain" }),
    { message: "Invalid tool artifact URI: invalid" },
  );
});

test("ensure reconstructs an actual stored data URL at decoded MIME path", async (t) => {
  const { store, options } = await fixture(t);
  const bytes = Buffer.from([0, 11, 255, 129]);
  const written = await store.writeToolResultArtifact(
    textRequest({
      content: `DaTa: IMAGE/JPEG ; charset=x ; BASE64 ,${bytes.toString("base64")}`,
      contentType: "text/plain",
    }),
  );
  const result = await store.ensureMediaAttachmentPath({
    uri: written.uri,
    mediaType: "image/png",
  });
  assert.equal(ready(result), derivedPath(options, written.uri, "image", ".jpg"));
  await exactBytes(ready(result), bytes);
  await assert.rejects(access(derivedPath(options, written.uri, "image", ".png")), {
    code: "ENOENT",
  });
});

test("existing requested regular file bypasses validation and is not rewritten", async (t) => {
  const { store, options } = await fixture(t);
  const path = derivedPath(options, uri(), "pdf", ".pdf");
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, "not a PDF, already cached");
  const calls = overrideContent(store, "invalid backing data");
  assert.equal(
    ready(await store.ensureMediaAttachmentPath({ uri: uri(), mediaType: "application/pdf" })),
    path,
  );
  assert.equal(
    ready(
      await store.primeMediaAttachmentPath({
        uri: uri(),
        mediaType: "application/pdf",
        bytes: Buffer.from("replacement"),
      }),
    ),
    path,
  );
  assert.equal(calls(), 0);
  assert.equal(await readFile(path, "utf8"), "not a PDF, already cached");
});

for (const [content, kind, message] of [
  ["plain", "image", "not a base64 image data URL"],
  ["data:image/png;base64", "image", "not a base64 image data URL"],
  ["data:image/png;utf8,hi", "image", "not a base64 image data URL"],
  ["data:image/png;base64;later,AA==", "image", "not a base64 image data URL"],
  ["data:video/mp4;base64,AA==", "image", "not a base64 image data URL"],
  ["data:image/png;base64,", "image", "empty"],
  ["data:image/png;base64,!", "image", "empty"],
  ["data:image/unknown;base64,", "image", "empty"],
  ["data:application/pdf;base64,AAE=", "pdf", "not a PDF"],
  ["data:application/pdf;base64,", "pdf", "empty"],
] as const) {
  test(`ensure validates ${JSON.stringify(content)} before publishing`, async (t) => {
    const { store, options } = await fixture(t);
    overrideContent(store, content);
    const mediaType = kind === "pdf" ? "application/pdf" : "image/png";
    await assert.rejects(store.ensureMediaAttachmentPath({ uri: uri(), mediaType }), {
      message: `Media attachment artifact is ${message}: ${uri()}`,
    });
    await assert.rejects(access(options.imageCacheRootDir), { code: "ENOENT" });
  });
}

test("nonempty unsupported decoded subtype returns unsupported after backing decode", async (t) => {
  const { store } = await fixture(t);
  const calls = overrideContent(store, "data:image/unknown;base64,AA==");
  assert.deepEqual(await store.ensureMediaAttachmentPath({ uri: uri(), mediaType: "image/png" }), {
    status: "unsupported",
  });
  assert.equal(calls(), 1);
});

test("existing decoded path does not bypass the preceding payload validation", async (t) => {
  const { store, options } = await fixture(t);
  const decodedPath = derivedPath(options, uri(), "image", ".jpg");
  await mkdir(dirname(decodedPath), { recursive: true });
  await writeFile(decodedPath, "existing JPEG");
  overrideContent(store, "data:image/jpeg;base64,");
  await assert.rejects(store.ensureMediaAttachmentPath({ uri: uri(), mediaType: "image/png" }), {
    message: `Media attachment artifact is empty: ${uri()}`,
  });
  assert.equal(await readFile(decodedPath, "utf8"), "existing JPEG");
});

test("PDF ensure validates the signature and base64 uses Node's lenient decoder", async (t) => {
  const { store } = await fixture(t);
  const bytes = Buffer.from("%PDF-1.7\nfixture");
  overrideContent(
    store,
    `data:application/pdf;base64,${bytes.toString("base64").replace(/=/gu, "")} \n!`,
  );
  const result = await store.ensureMediaAttachmentPath({
    uri: uri(),
    mediaType: "application/pdf",
  });
  await exactBytes(ready(result), bytes);
});
