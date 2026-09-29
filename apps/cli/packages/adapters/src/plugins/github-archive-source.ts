// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Knorvia Studio contributors

import { readFile, readdir } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { assertAtomicNotAborted } from "./atomic-protocol.js";
import {
  appendPluginSourceCleanupError,
  cleanupPluginSourceBestEffort,
  directoryExists,
  fileExists,
  isNotFoundError,
  resolveInside,
} from "./helpers.js";
import { redactSourceReference } from "./source-redaction.js";
import {
  PluginZipDownloadError,
  resolveHttpZipSource,
  type ResolvedZipPluginSourceRoot,
} from "./zip-source.js";

class GitRequired extends Error {
  constructor(reason: string) {
    super(`GitHub Archive requires system Git fallback: ${reason}`);
    this.name = "GitHubArchiveRequiresGitError";
  }
}

function githubCoordinates(value: string): { owner: string; repository: string } {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new GitRequired(
      `source is not a public GitHub HTTPS repository: ${redactSourceReference(value)}`,
    );
  }
  const coordinates = /^\/([a-zA-Z0-9_.-]+)\/([a-zA-Z0-9_.-]+)\/?$/u.exec(url.pathname);
  const owner = coordinates?.[1];
  const repository = coordinates?.[2]?.replace(/\.git$/u, "");
  if (
    url.protocol !== "https:" ||
    (url.hostname !== "github.com" && url.hostname !== "www.github.com") ||
    url.username ||
    url.password ||
    url.search ||
    url.hash ||
    !owner ||
    !repository ||
    !/^[a-zA-Z0-9_.-]+$/u.test(owner) ||
    !/^[a-zA-Z0-9_.-]+$/u.test(repository)
  ) {
    throw new GitRequired(
      `source is not a public GitHub HTTPS repository: ${redactSourceReference(value)}`,
    );
  }
  return { owner, repository };
}

async function directoryUsesLfs(directory: string, signal?: AbortSignal): Promise<boolean> {
  assertAtomicNotAborted(signal);
  let content: string;
  try {
    content = await readFile(join(directory, ".gitattributes"), "utf8");
  } catch (error) {
    if (isNotFoundError(error)) return false;
    throw error;
  }
  return /(?:^|\s)filter=lfs(?:\s|$)/u.test(content);
}

async function subtreeUsesLfs(root: string, signal?: AbortSignal): Promise<boolean> {
  const pending = [root];
  while (pending.length) {
    const directory = pending.pop()!;
    if (await directoryUsesLfs(directory, signal)) return true;
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      if (entry.isDirectory()) pending.push(join(directory, entry.name));
    }
  }
  return false;
}

async function requireArchiveSemantics(
  repositoryRoot: string,
  selectedRoot: string,
  signal?: AbortSignal,
): Promise<void> {
  assertAtomicNotAborted(signal);
  if (fileExists(join(repositoryRoot, ".gitmodules")))
    throw new GitRequired("repository declares Git submodules");
  if (resolve(selectedRoot) === resolve(repositoryRoot)) {
    if (await subtreeUsesLfs(repositoryRoot, signal))
      throw new GitRequired("repository declares Git LFS filters");
    return;
  }
  if (await directoryUsesLfs(repositoryRoot, signal))
    throw new GitRequired("repository declares Git LFS filters");
  for (
    let parent = dirname(selectedRoot);
    resolve(parent) !== resolve(repositoryRoot);
    parent = dirname(parent)
  ) {
    if (await directoryUsesLfs(parent, signal))
      throw new GitRequired("selected plugin path inherits Git LFS filters");
  }
  if (await subtreeUsesLfs(selectedRoot, signal))
    throw new GitRequired("selected plugin path declares Git LFS filters");
}

export async function resolveGitHubArchiveSource(input: {
  path?: string;
  pin?: string;
  signal?: AbortSignal;
  url: string;
}): Promise<ResolvedZipPluginSourceRoot> {
  assertAtomicNotAborted(input.signal);
  const { owner, repository } = githubCoordinates(input.url);
  const pin = input.pin?.trim() || "HEAD";
  const source = await resolveHttpZipSource({
    url: `https://api.github.com/repos/${owner}/${repository}/zipball/${encodeURIComponent(pin)}`,
    headers: {
      Accept: "application/vnd.github+json",
      "User-Agent": "Knorvia Studio-Plugin-Installer",
    },
    requireSingleRoot: true,
    stripRoot: true,
    ...(input.signal ? { signal: input.signal } : {}),
  });
  try {
    const selected =
      input.path !== undefined ? resolveInside(source.path, input.path) : source.path;
    if (!selected || !directoryExists(selected))
      throw new Error("Selected plugin path is not a directory inside the repository");
    await requireArchiveSemantics(source.path, selected, input.signal);
    assertAtomicNotAborted(input.signal);
    return { path: selected, cleanup: source.cleanup };
  } catch (error) {
    throw appendPluginSourceCleanupError(
      error,
      await cleanupPluginSourceBestEffort(source.cleanup),
    );
  }
}

export function shouldFallbackGitHubArchiveToGit(error: unknown): boolean {
  if (error instanceof GitRequired) return true;
  if (
    error instanceof PluginZipDownloadError &&
    (error.status === 401 || error.status === 403 || error.status === 404)
  )
    return true;
  const message = error instanceof Error ? error.message : String(error);
  return /plugin zip entry symlinks are not supported|unsupported plugin zip entry type/iu.test(
    message,
  );
}
