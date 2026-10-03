// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Knorvia Studio contributors
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { readRepositoryFile } from "./git.mjs";
import { assertRelativePath } from "./model.mjs";

function scalar(text) {
  const value = text.trim();
  if (value.startsWith('"')) return JSON.parse(value);
  if (value.startsWith("'")) {
    if (!value.endsWith("'")) throw new Error("Invalid quoted patch scalar");
    return value.slice(1, -1).replaceAll("''", "'");
  }
  if (!value || /^[!&*>{[|]/.test(value)) throw new Error("Unsupported patch scalar");
  return value;
}

export function parseLockedPatches(text) {
  const lines = text.replaceAll("\r\n", "\n").split("\n");
  const starts = lines.flatMap((line, index) =>
    /^patchedDependencies\s*:/.test(line) ? [index] : [],
  );
  if (!starts.length) return [];
  if (starts.length !== 1) throw new Error("Duplicate locked patch section");
  const start = starts[0];
  const inline = lines[start].slice(lines[start].indexOf(":") + 1).trim();
  if (inline === "{}") {
    for (const line of lines.slice(start + 1)) {
      if (!line.trim() || /^\s*#/.test(line)) continue;
      if (/^\S/.test(line)) break;
      throw new Error("Unsupported nested content after empty locked patch map");
    }
    return [];
  }
  if (inline) throw new Error("Unsupported locked patch section");
  const records = [];
  let current;
  for (const line of lines.slice(start + 1)) {
    if (!line.trim() || /^\s*#/.test(line)) continue;
    if (/^\S/.test(line)) break;
    const key = /^ {2}([^ ].*):\s*$/.exec(line);
    if (key) {
      current = { package: scalar(key[1]) };
      records.push(current);
      continue;
    }
    const field = /^ {4}(hash|path):\s*(.+)$/.exec(line);
    if (!field || !current || Object.hasOwn(current, field[1]))
      throw new Error(`Unsupported or duplicate locked patch field: ${line.trim()}`);
    current[field[1]] = scalar(field[2]);
  }
  const seen = new Set();
  return records.map(({ package: name, hash, path }) => {
    if (
      typeof name !== "string" ||
      !/^(?:@[^/@\s]+\/)?[^/@\s]+@\d+\.\d+\.\d+(?:[-+][\w.-]+)?$/.test(name)
    )
      throw new Error(`Locked patch requires an exact package version: ${name}`);
    if (seen.has(name)) throw new Error(`Duplicate locked patch: ${name}`);
    seen.add(name);
    if (typeof hash !== "string" || !/^[a-f0-9]{64}$/.test(hash))
      throw new Error(`Invalid locked patch digest: ${name}`);
    return { package: name, file: assertRelativePath(path), sha256: hash };
  });
}

export async function readLockedPatches(root) {
  return parseLockedPatches(await readFile(resolve(root, "pnpm-lock.yaml"), "utf8"));
}

export function retainPatchUnion(locked, historical) {
  const union = new Map();
  for (const item of historical) {
    if (union.has(item.package)) throw new Error(`Duplicate retained patch: ${item.package}`);
    union.set(item.package, item);
  }
  for (const item of locked) union.set(item.package, { ...union.get(item.package), ...item });
  return [...union.values()];
}

export async function auditLockedPatches(root, manifest, issues) {
  // 修复：补丁配置已迁移到 workspace/lock，根 package.json 的旧字段会漏掉全部活动补丁。
  if (!Object.hasOwn(manifest.inputs ?? {}, "pnpm-lock.yaml"))
    issues.push("Locked patch lock input missing: pnpm-lock.yaml");
  let locked;
  try {
    locked = await readLockedPatches(root);
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
    issues.push("Locked patch lock file missing: pnpm-lock.yaml");
    return;
  }
  if (!Array.isArray(manifest.patches)) {
    issues.push("Missing locked patch inventory");
    return;
  }
  const recorded = new Map();
  for (const item of manifest.patches) {
    if (recorded.has(item.package)) issues.push(`Duplicate inventoried patch: ${item.package}`);
    recorded.set(item.package, item);
    const path = assertRelativePath(item.file);
    if (!Object.hasOwn(manifest.inputs ?? {}, path)) issues.push(`Patch input missing: ${path}`);
    try {
      const file = await readRepositoryFile(root, path);
      if (file.kind !== "file" || file.sha256 !== item.sha256)
        issues.push(`Patch content differs: ${path}`);
    } catch (error) {
      if (error.code !== "ENOENT") throw error;
      issues.push(`Patch content missing: ${path}`);
    }
  }
  for (const item of locked) {
    const record = recorded.get(item.package);
    if (record?.file !== item.file || record?.sha256 !== item.sha256)
      issues.push(`Locked patch projection differs: ${item.package}`);
  }
}
