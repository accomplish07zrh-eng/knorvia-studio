// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Knorvia Studio contributors

import assert from "node:assert/strict";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, dirname, join, resolve } from "node:path";
import { createHash } from "node:crypto";
import type { TestContext } from "node:test";

export type ArtifactModule = typeof import("../src/storage/index.js");
export type Store = InstanceType<ArtifactModule["NodeToolArtifactStore"]>;
export type TextRequest = Parameters<Store["writeToolResultArtifact"]>[0];
export type BinaryRequest = Parameters<Store["writeToolResultBinaryArtifact"]>[0];
export type Options = ConstructorParameters<ArtifactModule["NodeToolArtifactStore"]>[0];
export const artifact = await import("../src/storage/index.js");

export async function fixture(t: TestContext, label = "normal") {
  const parent = resolve(tmpdir());
  const root = await mkdtemp(join(parent, "knorvia-artifact-"));
  assert.equal(dirname(resolve(root)), parent);
  assert.ok(basename(root).startsWith("knorvia-artifact-"));
  t.after(async () => {
    assert.equal(dirname(resolve(root)), parent);
    assert.ok(basename(root).startsWith("knorvia-artifact-"));
    await rm(root, { recursive: true, force: true });
  });
  const options: Options = {
    rootDir: join(root, label, "artifacts"),
    imageCacheRootDir: join(root, label, "images"),
    videoCacheRootDir: join(root, label, "videos"),
  };
  return { root, options, store: new artifact.NodeToolArtifactStore(options) };
}

export function textRequest(
  overrides: Partial<Omit<TextRequest, "sessionId">> & { sessionId?: string } = {},
): TextRequest {
  const { sessionId = "owned-session", ...fields } = overrides;
  return {
    sessionId: sessionId as TextRequest["sessionId"],
    toolCallId: "call-1",
    toolName: "fixture",
    content: "附件 café 😀",
    ...fields,
  };
}

export function binaryRequest(
  overrides: Partial<Omit<BinaryRequest, "sessionId">> & { sessionId?: string } = {},
): BinaryRequest {
  const { sessionId = "owned-session", ...fields } = overrides;
  return {
    sessionId: sessionId as BinaryRequest["sessionId"],
    toolCallId: "binary-1",
    toolName: "fixture",
    content: Uint8Array.from([0, 127, 128, 254, 255]),
    contentType: "application/octet-stream",
    ...fields,
  };
}

export function uri(session = "owned-session", id = "item") {
  return `knorvia-artifact://${encodeURIComponent(session)}/${encodeURIComponent(id)}`;
}

export async function seed(options: Options, name: string, content: string | Uint8Array) {
  const directory = join(options.rootDir, "owned-session");
  await mkdir(directory, { recursive: true });
  const path = join(directory, name);
  await writeFile(path, content);
  return path;
}

export function derivedPath(
  options: Options,
  value: string,
  kind: "image" | "video" | "pdf",
  extension: string,
) {
  const roots = {
    image: options.imageCacheRootDir,
    video: options.videoCacheRootDir,
    pdf: options.pdfCacheRootDir ?? join(dirname(options.rootDir), "pdf-cache"),
  };
  return join(
    roots[kind],
    "owned-session",
    `${kind}-${createHash("sha256").update(value).digest("hex").slice(0, 32)}${extension}`,
  );
}

export function ready(result: Awaited<ReturnType<Store["primeMediaAttachmentPath"]>>): string {
  assert.equal(result.status, "ready");
  assert.ok("path" in result);
  return result.path;
}

export function overrideContent(store: Store, content: string) {
  let calls = 0;
  store.readToolResultArtifact = async ({ uri: value }) => {
    calls++;
    return { uri: value, content, contentType: "text/plain", bytes: Buffer.byteLength(content) };
  };
  return () => calls;
}

export async function exactBytes(path: string | undefined, expected: Uint8Array) {
  assert.ok(path);
  assert.deepEqual(await readFile(path), Buffer.from(expected));
}
