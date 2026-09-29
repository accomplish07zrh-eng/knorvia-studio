// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Knorvia Studio contributors

import { createHash } from "node:crypto";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { assertAtomicNotAborted } from "./atomic-protocol.js";
import { extractArchive } from "./archive-extract.js";
import {
  appendPluginSourceCleanupError,
  cleanupPluginSourceBestEffort,
  directoryExists,
  fileExists,
  isRecord,
  resolveInside,
} from "./helpers.js";
import { downloadSource, PluginZipDownloadError } from "./source-download.js";

export { PluginZipDownloadError } from "./source-download.js";

export interface ResolvedZipPluginSourceRoot {
  cleanup: () => Promise<void>;
  path: string;
}

interface HttpZipSourceInput {
  headers?: Record<string, string>;
  path?: string;
  requireSingleRoot?: boolean;
  sha256?: string;
  signal?: AbortSignal;
  stripRoot?: boolean;
  url: string;
}

const pluginDirectories = [".knorvia-plugin", ".claude-plugin", ".codex-plugin"];

function selectExtractedRoot(
  root: string,
  segments: Set<string>,
  input: HttpZipSourceInput,
): string {
  if (input.requireSingleRoot && segments.size !== 1) {
    throw new Error("Plugin ZIP must contain exactly one top-level path");
  }
  if (input.path !== undefined) {
    const selected = resolveInside(root, input.path);
    if (!selected || !directoryExists(selected))
      throw new Error("Plugin ZIP selected path is not a directory inside the archive");
    return selected;
  }
  if (pluginDirectories.some((directory) => fileExists(join(root, directory, "plugin.json"))))
    return root;
  if (input.stripRoot !== false && segments.size === 1) {
    const segment = segments.values().next().value;
    if (segment !== undefined) {
      const selected = resolveInside(root, segment);
      if (selected && directoryExists(selected)) return selected;
    }
  }
  return root;
}

function requireDigest(value: unknown): asserts value is string {
  if (typeof value !== "string" || !/^[a-f\d]{64}$/iu.test(value)) {
    throw new Error("Plugin ZIP source requires a 64-character SHA-256 digest");
  }
}

export async function resolveHttpZipSource(
  input: HttpZipSourceInput,
): Promise<ResolvedZipPluginSourceRoot> {
  assertAtomicNotAborted(input.signal);
  if (input.sha256 !== undefined) requireDigest(input.sha256);
  const downloaded = await downloadSource({
    url: input.url,
    maxBytes: 200 * 1024 * 1024,
    zip: true,
    ...(input.headers !== undefined ? { headers: input.headers } : {}),
    ...(input.signal !== undefined ? { signal: input.signal } : {}),
  });
  const { response } = downloaded;
  if (response.status < 200 || response.status >= 300) {
    throw new PluginZipDownloadError(
      `Plugin ZIP download failed with HTTP ${response.status}`,
      downloaded.url,
      response.status,
    );
  }
  const digest = createHash("sha256").update(response.body).digest("hex");
  if (input.sha256 !== undefined && digest !== input.sha256.toLowerCase())
    throw new Error("Plugin ZIP SHA-256 mismatch");
  assertAtomicNotAborted(input.signal);
  const scratch = await mkdtemp(join(tmpdir(), "knorvia-plugin-zip-"));
  const cleanup = async () => {
    await rm(scratch, { recursive: true, force: true });
  };
  try {
    const archive = join(scratch, "source.zip");
    const root = join(scratch, "contents");
    await writeFile(archive, response.body);
    await mkdir(root);
    const segments = await extractArchive({
      archive,
      root,
      ...(input.signal ? { signal: input.signal } : {}),
    });
    assertAtomicNotAborted(input.signal);
    return { path: selectExtractedRoot(root, segments, input), cleanup };
  } catch (error) {
    throw appendPluginSourceCleanupError(error, await cleanupPluginSourceBestEffort(cleanup));
  }
}

export async function resolveZipPluginSource(
  input: Omit<HttpZipSourceInput, "requireSingleRoot" | "sha256"> & {
    sha256: string;
  },
): Promise<ResolvedZipPluginSourceRoot> {
  requireDigest(input.sha256);
  return resolveHttpZipSource(input);
}

export function isZipPluginUrlSource(source: unknown): source is {
  source: "url";
  type: "zip";
  sha256: string;
  url: string;
} {
  return (
    isRecord(source) &&
    source.source === "url" &&
    source.type === "zip" &&
    typeof source.url === "string" &&
    typeof source.sha256 === "string"
  );
}

export function readZipPluginSourceSha256(source: unknown): string | undefined {
  return isZipPluginUrlSource(source) ? source.sha256 : undefined;
}
