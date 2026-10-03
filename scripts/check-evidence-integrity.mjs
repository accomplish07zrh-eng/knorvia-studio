// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Knorvia Studio contributors
import { createHash } from "node:crypto";
import { lstat, readFile, readdir } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const roots = ["docs/evidence", "licensing/evidence"];
const manifestPath = "licensing/frozen-evidence.json";
const repoRoot = fileURLToPath(new URL("../", import.meta.url));

function assertEvidencePath(path) {
  if (
    typeof path !== "string" ||
    path.includes("\\") ||
    path.includes("\0") ||
    path.split("/").some((part) => !part || part === "." || part === "..") ||
    !roots.some((root) => path.startsWith(`${root}/`))
  ) {
    throw new Error(`Invalid frozen evidence path: ${JSON.stringify(path)}`);
  }
}

export async function checkEvidenceIntegrity(root) {
  const manifest = JSON.parse(await readFile(resolve(root, manifestPath), "utf8"));
  if (
    manifest.schemaVersion !== 1 ||
    !/^[a-f0-9]{40}$/.test(manifest.baselineCommit ?? "") ||
    JSON.stringify(manifest.roots) !== JSON.stringify(roots) ||
    !Array.isArray(manifest.files) ||
    !manifest.files.length
  ) {
    throw new Error("Invalid frozen evidence manifest");
  }
  const registered = new Map();
  for (const item of manifest.files) {
    assertEvidencePath(item.path);
    if (
      registered.has(item.path) ||
      !/^[a-f0-9]{64}$/.test(item.sha256 ?? "") ||
      !Number.isSafeInteger(item.bytes) ||
      item.bytes < 0 ||
      (item.sourceCommit !== undefined && !/^[a-f0-9]{40}$/.test(item.sourceCommit))
    ) {
      throw new Error(`Invalid or duplicate frozen evidence record: ${item.path}`);
    }
    registered.set(item.path, item);
  }

  const actual = [];
  const issues = [];
  async function walk(path) {
    for (const entry of await readdir(resolve(root, path), { withFileTypes: true })) {
      const child = `${path}/${entry.name}`;
      if (entry.isDirectory()) await walk(child);
      else if (entry.isFile()) actual.push(child);
      else issues.push(`Frozen evidence must be a regular file: ${child}`);
    }
  }
  for (const path of roots) {
    // 修复：来源快照是原始数据；先拒绝链接目录，不能借路径跳到登记范围之外。
    if (!(await lstat(resolve(root, path))).isDirectory())
      throw new Error(`Frozen evidence root must be a directory: ${path}`);
    await walk(path);
  }
  const present = new Set(actual);
  for (const path of registered.keys()) {
    if (!present.has(path)) issues.push(`Frozen evidence missing: ${path}`);
  }
  let bytes = 0;
  // 修复：按原字节校验完整集合，不让格式工具改写原始证据，也不自动接受新增快照。
  for (let offset = 0; offset < actual.length; offset += 32) {
    await Promise.all(
      actual.slice(offset, offset + 32).map(async (path) => {
        const expected = registered.get(path);
        if (!expected) {
          issues.push(`Unregistered frozen evidence: ${path}`);
          return;
        }
        const content = await readFile(resolve(root, path));
        bytes += content.length;
        if (
          content.length !== expected.bytes ||
          createHash("sha256").update(content).digest("hex") !== expected.sha256
        ) {
          issues.push(`Frozen evidence changed: ${path}`);
        }
      }),
    );
  }
  if (issues.length)
    throw new Error(
      `Frozen evidence inconsistent (${issues.length}):\n${issues.sort().join("\n")}`,
    );
  return { files: actual.length, bytes, baselineCommit: manifest.baselineCommit };
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const result = await checkEvidenceIntegrity(repoRoot);
  console.log(
    `Frozen evidence: ${result.files} files, ${result.bytes} bytes; baseline ${result.baselineCommit}`,
  );
}
