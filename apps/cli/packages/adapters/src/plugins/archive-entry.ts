// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Knorvia Studio contributors

import { isAbsolute, relative, resolve } from "node:path";
import type { Entry } from "yauzl";

export class ArchiveGitRequiredError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ArchiveGitRequiredError";
  }
}

export function inspectArchiveEntry(
  root: string,
  entry: Entry,
): {
  path: string;
  segment: string;
  directory: boolean;
} {
  if ((entry.generalPurposeBitFlag & 1) !== 0)
    throw new Error("Encrypted ZIP entries are not supported");
  const fileType = (entry.externalFileAttributes >>> 16) & 0o170000;
  if (fileType === 0o120000)
    throw new ArchiveGitRequiredError("Plugin zip entry symlinks are not supported");
  if (fileType !== 0 && fileType !== 0o100000 && fileType !== 0o040000) {
    throw new ArchiveGitRequiredError("Unsupported plugin zip entry type");
  }
  const original = entry.fileName;
  const name = original.endsWith("/") ? original.slice(0, -1) : original;
  const segments = name.split("/");
  if (
    !name ||
    name.includes("\0") ||
    name.includes("\\") ||
    name.startsWith("/") ||
    /^[A-Za-z]:/u.test(name) ||
    segments.some((segment) => !segment || segment === "." || segment === "..")
  ) {
    throw new Error("ZIP entry contains an unsafe path");
  }
  const target = resolve(root, ...segments);
  const displacement = relative(root, target);
  if (
    !displacement ||
    displacement === ".." ||
    displacement.startsWith("../") ||
    displacement.startsWith("..\\") ||
    isAbsolute(displacement)
  ) {
    throw new Error("ZIP entry escapes the extraction directory");
  }
  return {
    path: target,
    segment: segments[0]!,
    directory: fileType === 0o040000 || original.endsWith("/"),
  };
}
