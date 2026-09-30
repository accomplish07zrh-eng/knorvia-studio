// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Knorvia Studio contributors
import { readFile, readdir } from "node:fs/promises";
import { resolve } from "node:path";
import { readRepositoryFile } from "./git.mjs";
import { assertRelativePath } from "./model.mjs";
import { auditLockedPatches } from "./patch-inventory.mjs";

export const SOURCE_REGISTERS = {
  copied: "third-party/copied-components.json",
  overrides: "third-party/npm-overrides.json",
  embedded: "third-party/embedded-components.json",
  native: "third-party/native-search/sources.json",
  material: "licensing/evidence/material-icon-theme.json",
};

export async function readSourceRegisters(root) {
  const entries = await Promise.all(
    Object.entries(SOURCE_REGISTERS).map(async ([key, path]) => [
      key,
      JSON.parse(await readFile(resolve(root, path), "utf8")),
    ]),
  );
  return Object.fromEntries(entries);
}

export function deriveMaterialReviews({ copied, overrides, embedded, native, material }) {
  const reviews = [];
  for (const item of copied)
    if (item.reviewRequired) reviews.push({ id: item.id, reason: item.reviewRequired });
  for (const item of overrides) {
    if (item.acceptedMissingNotice || item.evidenceKind)
      reviews.push({
        id: item.package,
        reason:
          "Original version-specific publisher copyright/license material remains incomplete.",
      });
  }
  for (const item of embedded)
    if (item.reviewRequired) reviews.push({ id: item.id, reason: item.reviewRequired });
  for (const item of native.components)
    if (!item.notices?.length)
      reviews.push({
        id: `${item.id}@${item.version}`,
        reason: "No original notice snapshot for this recorded native component.",
      });
  for (const item of material.unresolved)
    reviews.push({
      id: item.path,
      reason: `Material Icon Theme source unresolved: ${item.reason}`,
    });
  const seen = new Set();
  for (const item of reviews) {
    if (
      typeof item.id !== "string" ||
      !item.id ||
      typeof item.reason !== "string" ||
      !item.reason ||
      seen.has(item.id)
    ) {
      throw new Error(`Invalid or duplicate material review: ${item.id}`);
    }
    seen.add(item.id);
  }
  return reviews.sort((a, b) => a.id.localeCompare(b.id, "en"));
}

const canonical = (value) => {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === "object")
    return Object.fromEntries(
      Object.keys(value)
        .sort()
        .map((key) => [key, canonical(value[key])]),
    );
  return value;
};
const same = (left, right) => JSON.stringify(canonical(left)) === JSON.stringify(canonical(right));

function checkProjection(name, declared, projected, issues) {
  // 修复：清单中的复制范围及例外曾随旧快照保留，不能只相信派生的空 reviewRequired。
  if (!Array.isArray(projected) || declared.length !== projected.length) {
    issues.push(`${name} projection differs from its source register`);
    return;
  }
  for (const [index, item] of declared.entries()) {
    const record = projected[index];
    const sourceFields = Object.fromEntries(Object.keys(item).map((key) => [key, record?.[key]]));
    if (!same(item, sourceFields))
      issues.push(`${name} projection differs: ${item.id ?? item.package}`);
  }
}

async function checkAssets(root, registers, issues) {
  const { material } = registers;
  const component = registers.copied.find((item) => item.id === "Material Icon Theme");
  if (!component) {
    if (material.matched.length || material.unresolved.length)
      issues.push("Material Icon Theme source declaration is missing");
    return;
  }
  if (component.referenceRevision !== material.commit)
    issues.push("Material asset reference differs from copied source declaration");
  const byPath = new Map();
  for (const item of [...material.matched, ...material.unresolved]) {
    assertRelativePath(item.path);
    if (byPath.has(item.path)) issues.push(`Duplicate asset evidence: ${item.path}`);
    byPath.set(item.path, item);
    if (!/^[a-f0-9]{64}$/.test(item.sha256 ?? ""))
      issues.push(`Missing asset digest: ${item.path}`);
  }
  const current = new Set();
  async function walk(path) {
    for (const entry of await readdir(resolve(root, path), { withFileTypes: true })) {
      const child = `${path}/${entry.name}`;
      if (entry.isDirectory()) await walk(child);
      else {
        current.add(child);
        const evidence = byPath.get(child);
        if (!evidence) issues.push(`Asset evidence coverage missing: ${child}`);
        else {
          const file = await readRepositoryFile(root, child);
          if (file.kind !== "file" || file.sha256 !== evidence.sha256)
            issues.push(`Asset evidence changed: ${child}`);
        }
      }
    }
  }
  for (const path of component.roots) await walk(assertRelativePath(path));
  for (const path of byPath.keys())
    if (!current.has(path))
      issues.push(`Asset evidence path missing or outside its scope: ${path}`);
  const license = await readRepositoryFile(root, assertRelativePath(component.file));
  if (
    license.kind !== "file" ||
    material.retainedLicense !== component.file ||
    license.sha256 !== component.sha256 ||
    license.sha256 !== material.licenseSha256
  ) {
    issues.push("Material asset license differs from retained source evidence");
  }
}

export async function auditThirdPartyInventory(root, manifest, registers) {
  registers ??= await readSourceRegisters(root);
  const issues = [];
  for (const path of Object.values(SOURCE_REGISTERS)) {
    if (!Object.hasOwn(manifest.inputs ?? {}, path))
      issues.push(`Source register input missing: ${path}`);
  }
  // 修复：仅 UTF-8 可以归一 CRLF；无效 UTF-8/二进制必须按原字节核验，不能用替代字符碰撞摘要。
  async function checkInputs(inputs, label) {
    for (const [path, expected] of Object.entries(inputs ?? {})) {
      try {
        const file = await readRepositoryFile(root, assertRelativePath(path));
        if (file.kind !== "file" || file.normalizedSha256 !== expected)
          issues.push(`${label} input changed: ${path}`);
      } catch (error) {
        if (error.code !== "ENOENT") throw error;
        issues.push(`${label} input missing: ${path}`);
      }
    }
  }
  await checkInputs(manifest.inputs, "Third-party");
  // 修复：原生登记另有版本配置输入，刷新外层 JSON 摘要不能替代它的版本核对。
  await checkInputs(registers.native.inputs, "Native");
  await auditLockedPatches(root, manifest, issues);
  checkProjection("Copied source", registers.copied, manifest.copied, issues);
  checkProjection(
    "Exception",
    registers.overrides.filter((item) => item.acceptedMissingNotice || item.evidenceKind),
    manifest.exceptions,
    issues,
  );
  checkProjection("Embedded source", registers.embedded, manifest.embedded, issues);
  await checkAssets(root, registers, issues);
  const reviews = deriveMaterialReviews(registers);
  if (!Array.isArray(manifest.reviewRequired)) issues.push("Missing material review inventory");
  else {
    const expected = new Map(reviews.map((item) => [item.id, item.reason]));
    const seen = new Set();
    for (const item of manifest.reviewRequired) {
      if (seen.has(item.id)) issues.push(`Duplicate material review: ${item.id}`);
      seen.add(item.id);
      if (expected.get(item.id) !== item.reason)
        issues.push(`Material review projection differs: ${item.id}`);
    }
    for (const item of reviews)
      if (!seen.has(item.id)) issues.push(`Material review missing: ${item.id}`);
  }
  return { issues, reviewRequired: reviews };
}

export function assertAuditConsistent(audit) {
  if (audit.issues.length)
    throw new Error(
      `Third-party audit inconsistent (${audit.issues.length}):\n${audit.issues.join("\n")}`,
    );
}
