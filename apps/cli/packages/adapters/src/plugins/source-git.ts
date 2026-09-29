// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Knorvia Studio contributors

import { execFile } from "node:child_process";
import { mkdir, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { sanitizeKnorviaRuntimeEnv } from "@knorvia/shared";
import { applyNetworkEgressEnv } from "../network/subprocess-env.js";
import { assertAtomicNotAborted } from "./atomic-protocol.js";
import {
  resolveGitHubArchiveSource,
  shouldFallbackGitHubArchiveToGit,
} from "./github-archive-source.js";
import {
  appendPluginSourceCleanupError,
  cleanupPluginSourceBestEffort,
  directoryExists,
  isRecord,
  resolveInside,
} from "./helpers.js";
import {
  createArchiveFetchError,
  createGitUnavailableError,
  isCommandUnavailableError,
} from "./source-errors.js";
import type { ResolvedZipPluginSourceRoot } from "./zip-source.js";

const runFile = promisify(execFile);
const retryFragments = [
  "rpc failed",
  "operation timed out",
  "recv failure",
  "expected flush",
  "early eof",
  "remote end hung up",
  "http/2 stream",
  "connection reset",
  "etimedout",
  "econnreset",
  "network timeout",
];

function retryableCloneFailure(error: unknown): boolean {
  const fields = isRecord(error) ? error : {};
  const details = [
    error instanceof Error ? error.message : String(error),
    fields.stdout,
    fields.stderr,
  ]
    .filter((value): value is string => typeof value === "string")
    .join("\n")
    .toLowerCase();
  return retryFragments.some((fragment) => details.includes(fragment));
}

function delayRetry(milliseconds: number, signal?: AbortSignal): Promise<void> {
  assertAtomicNotAborted(signal);
  return new Promise((resolve, reject) => {
    const complete = () => {
      signal?.removeEventListener("abort", abort);
      resolve();
    };
    const timer = setTimeout(complete, milliseconds);
    const abort = () => {
      clearTimeout(timer);
      signal?.removeEventListener("abort", abort);
      try {
        assertAtomicNotAborted(signal);
      } catch (error) {
        reject(error);
      }
    };
    signal?.addEventListener("abort", abort, { once: true });
    if (signal?.aborted) abort();
  });
}

async function runGit(args: string[], signal?: AbortSignal): Promise<void> {
  assertAtomicNotAborted(signal);
  const sourceEnv = process.env;
  await runFile(sourceEnv.KNORVIA_GIT_BINARY?.trim() || "git", args, {
    env: applyNetworkEgressEnv(sanitizeKnorviaRuntimeEnv(sourceEnv), { sourceEnv }),
    encoding: "utf8",
    windowsHide: true,
    timeout: 90_000,
    killSignal: "SIGTERM",
    maxBuffer: 10 * 1024 * 1024,
    ...(signal ? { signal } : {}),
  });
}

interface RepositorySourceInput {
  url: string;
  path?: string;
  ref?: string;
  sha?: string;
  sparsePaths?: string[];
  signal?: AbortSignal;
}

async function cloneRepository(input: RepositorySourceInput): Promise<ResolvedZipPluginSourceRoot> {
  const scratch = await mkdtemp(join(tmpdir(), "knorvia-plugin-git-"));
  const path = join(scratch, "repository");
  const cleanup = () => rm(scratch, { recursive: true, force: true });
  try {
    const sparse = input.sparsePaths && input.sparsePaths.length > 0;
    const args = [
      "clone",
      ...(!input.sha ? ["--depth", "1"] : []),
      ...(input.ref ? ["--branch", input.ref] : []),
      ...(sparse ? ["--filter=blob:none", "--sparse"] : []),
      input.url,
      path,
    ];
    for (let attempt = 0; ; attempt += 1) {
      try {
        await runGit(args, input.signal);
        break;
      } catch (error) {
        assertAtomicNotAborted(input.signal);
        if (isRecord(error) && error.name === "AbortError") throw error;
        if (isCommandUnavailableError(error))
          throw createGitUnavailableError(
            input.url,
            error instanceof Error ? error.message : undefined,
          );
        if (attempt === 2 || !retryableCloneFailure(error)) throw error;
        await delayRetry((attempt + 1) * 1000, input.signal);
        await rm(path, { recursive: true, force: true });
        await mkdir(path);
      }
    }
    if (input.sha) await runGit(["-C", path, "checkout", input.sha], input.signal);
    if (sparse)
      await runGit(["-C", path, "sparse-checkout", "set", ...input.sparsePaths!], input.signal);
    assertAtomicNotAborted(input.signal);
    const selected = input.path !== undefined ? resolveInside(path, input.path) : path;
    if (!selected || !directoryExists(selected))
      throw new Error("Selected plugin path is not a directory inside the repository");
    return { path: selected, cleanup };
  } catch (error) {
    const failure = isCommandUnavailableError(error)
      ? createGitUnavailableError(input.url, error instanceof Error ? error.message : undefined)
      : error;
    throw appendPluginSourceCleanupError(failure, await cleanupPluginSourceBestEffort(cleanup));
  }
}

export async function materializeRepository(
  input: RepositorySourceInput,
): Promise<ResolvedZipPluginSourceRoot> {
  assertAtomicNotAborted(input.signal);
  if (!input.sparsePaths?.length) {
    const pin = input.sha ?? input.ref;
    try {
      return await resolveGitHubArchiveSource({
        url: input.url,
        ...(pin !== undefined ? { pin } : {}),
        ...(input.path !== undefined ? { path: input.path } : {}),
        ...(input.signal ? { signal: input.signal } : {}),
      });
    } catch (error) {
      assertAtomicNotAborted(input.signal);
      if (isRecord(error) && error.name === "AbortError") throw error;
      if (!shouldFallbackGitHubArchiveToGit(error)) throw createArchiveFetchError(input.url, error);
    }
  }
  return cloneRepository(input);
}
