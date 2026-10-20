// SPDX-License-Identifier: Apache-2.0
// services-01 范围真源：冻结在 scope-files.json 的 60 个继承文件。
// licensing/current-files.json 仍用于核对合同基线时的继承分类；登记为 original 之后
// 以冻结快照为准（见 known-differences.md K2）。
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

export const repoRoot = fileURLToPath(new URL("../../../../", import.meta.url));
export const contractDir = join(repoRoot, "specs/contracts/services-01");
export const srcPrefix = "packages/services/src/";
export const OWNED_DIRS = [
  "agent",
  "broadcast",
  "commands",
  "conversation-telemetry",
  "credential",
  "cua-permission-broker",
  "file",
];

/** 冻结快照：每条含 path / modulePath / dir / classification / bytes / lines。 */
export const scope = JSON.parse(readFileSync(join(contractDir, "scope-files.json"), "utf8"));

export const FROZEN = {
  count: 60,
  lines: 21682,
  bytes: 829825,
  byDir: {
    agent: 32,
    broadcast: 2,
    commands: 5,
    "conversation-telemetry": 1,
    credential: 3,
    "cua-permission-broker": 9,
    file: 8,
  },
  classification: {
    unreviewed: 36,
    "upstream-unchanged": 1,
    "upstream-modified": 23,
  },
};

export const rewriteTargets = scope.filter((row) =>
  ["upstream-unchanged", "upstream-modified", "unreviewed"].includes(row.classification),
);
export const unreviewed = scope.filter((row) => row.classification === "unreviewed");
export const documents = scope.filter((row) => row.path.endsWith(".md"));
export const typescriptFiles = scope.filter((row) => row.path.endsWith(".ts"));

export function classificationCounts() {
  const counts = {};
  for (const row of scope) counts[row.classification] = (counts[row.classification] ?? 0) + 1;
  return counts;
}

export function dirCounts() {
  const counts = {};
  for (const row of scope) counts[row.dir] = (counts[row.dir] ?? 0) + 1;
  return counts;
}

/** 合同基线时 licensing 仍把这 60 个路径记为继承文件；返回不匹配项。 */
export function licensingDrift() {
  const licensing = JSON.parse(
    readFileSync(join(repoRoot, "licensing/current-files.json"), "utf8"),
  );
  const byPath = new Map(licensing.files.map((row) => [row.path, row]));
  const drift = [];
  for (const row of scope) {
    const current = byPath.get(row.path);
    if (!current) drift.push({ path: row.path, reason: "missing" });
    else if (current.classification === "original")
      drift.push({ path: row.path, reason: "original" });
  }
  return drift;
}
