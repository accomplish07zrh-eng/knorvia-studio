// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Knorvia Studio contributors

import { createHash } from "node:crypto";
import { lstat, readdir, readFile } from "node:fs/promises";
import { join, relative } from "node:path";

function sha256(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

export function serializeError(error) {
  if (!(error instanceof Error)) return { thrown: error };
  return {
    name: error.name,
    message: error.message,
    code: error.code,
    diagnosticCode: error.diagnosticCode,
    status: error.status,
    url: error.url,
    cause:
      error.cause instanceof Error
        ? { name: error.cause.name, message: error.cause.message }
        : error.cause,
  };
}

export async function filesystemManifest(root) {
  const result = [];
  async function visit(path) {
    const stat = await lstat(path);
    const item = {
      path: relative(root, path).replaceAll("\\", "/") || ".",
      kind: stat.isDirectory() ? "directory" : stat.isFile() ? "file" : "other",
    };
    if (stat.isFile()) {
      const bytes = await readFile(path);
      item.bytes = bytes.byteLength;
      item.sha256 = sha256(bytes);
    }
    result.push(item);
    if (stat.isDirectory()) {
      const children = await readdir(path);
      children.sort();
      for (const child of children) await visit(join(path, child));
    }
  }
  await visit(root);
  return result;
}
