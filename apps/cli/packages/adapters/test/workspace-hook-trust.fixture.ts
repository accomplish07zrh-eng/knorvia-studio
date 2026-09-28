// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Knorvia Studio contributors

import assert from "node:assert/strict";
import { mkdtemp, readFile, readdir, rm } from "node:fs/promises";
import { dirname, join, relative, resolve, isAbsolute } from "node:path";
import { fileURLToPath } from "node:url";
import type { TestContext } from "node:test";
import {
  createFileWorkspaceHookTrustStore,
  type StoreOptions,
  type TrustRecord,
  type StoreFile,
} from "./workspace-hook-trust-test-api.js";

const rootDirectory = dirname(fileURLToPath(import.meta.url));
export async function fixture(t: TestContext, options: Partial<StoreOptions> = {}) {
  const root = await mkdtemp(join(rootDirectory, "case-"));
  const beforeRemoval: Array<() => Promise<void>> = [];
  t.after(async () => {
    for (const cleanup of beforeRemoval.toReversed()) await cleanup();
    const child = relative(resolve(rootDirectory), resolve(root));
    assert.ok(child && !child.startsWith("..") && !isAbsolute(child));
    await rm(root, { recursive: true, force: true });
  });
  const filePath = join(root, "trust.json");
  const lockPath = `${filePath}.lock`;
  const store = createFileWorkspaceHookTrustStore({ ...options, filePath });
  return { root, filePath, lockPath, store, beforeRemoval };
}
export type Fixture = Awaited<ReturnType<typeof fixture>>;
export function record(digit = "a", changes: Partial<TrustRecord> = {}): TrustRecord {
  return {
    workspaceIdentity: "synthetic-workspace",
    hookDeclarationDigest: digit.repeat(64),
    digestAlgorithm: "sha256",
    decision: "trusted",
    grantedAt: "2000-01-01T00:00:00.000Z",
    eventAtGrant: "SessionStart",
    displayCommandAtGrant: "synthetic never executed",
    sourcePathAtGrant: "synthetic/hooks.json",
    ...changes,
  };
}
export async function readRaw(f: Pick<Fixture, "filePath">): Promise<StoreFile> {
  return JSON.parse(await readFile(f.filePath, "utf8")) as StoreFile;
}
export function deferred<T = void>() {
  let resolveValue!: (value: T | PromiseLike<T>) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolveValue = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve: resolveValue, reject };
}
export async function guard<T>(promise: Promise<T>, timeoutMs = 5000): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<never>((_, reject) => {
        timer = setTimeout(
          () => reject(new Error(`test handshake exceeded ${timeoutMs}ms`)),
          timeoutMs,
        );
      }),
    ]);
  } finally {
    clearTimeout(timer);
  }
}
export async function onlyTrustFile(f: Fixture) {
  assert.deepEqual(await readdir(f.root), ["trust.json"]);
}
