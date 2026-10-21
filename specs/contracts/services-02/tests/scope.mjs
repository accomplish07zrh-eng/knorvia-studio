// SPDX-License-Identifier: Apache-2.0
// services-02 范围真源：冻结在 scope-files.json 的 17 个文件
// （10 声明 + 4 端口下沉 + 1 示例 + 2 入口）。
// licensing/current-files.json 仍用于核对合同基线时的继承分类；登记为 original 之后
// 以冻结快照为准（见 known-differences.md K2）。
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

export const repoRoot = fileURLToPath(new URL("../../../../", import.meta.url));
export const contractDir = join(repoRoot, "specs/contracts/services-02");
export const srcPrefix = "packages/services/src/";
export const SR_DIR = "studio-runtime/";

/** 冻结快照：每条含 path / modulePath / dir / role / classification / bytes / lines。 */
export const scope = JSON.parse(readFileSync(join(contractDir, "scope-files.json"), "utf8"));

export const FROZEN = {
  count: 17,
  lines: 1590,
  bytes: 55151,
  byRole: { declaration: 10, port: 4, example: 1, entry: 2 },
  byClassification: { unreviewed: 13, original: 4 },
  /** 17 个模块的导出合计：164 项，其中运行时 50 / 纯类型 114（实测）。 */
  exports: { total: 164, runtime: 50, typeOnly: 114 },
};

/** 4 个从 app/ 下沉到契约层的端口文件。 */
export const PORTS = ["imagePort", "ports", "storePort", "workspaceRuntimePort"];

/** 包内其余 6 包拥有的目录：契约层不得 import 它们（下沉后的关键不变量）。 */
export const FORBIDDEN_IMPORT_DIRS = ["app/", "adapters/", "domain/"];

export const declarations = scope.filter((row) => row.role === "declaration");
export const portFiles = scope.filter((row) => row.role === "port");
export const entries = scope.filter((row) => row.role === "entry");
export const examples = scope.filter((row) => row.role === "example");

/** 端口文件在原树中的路径（下沉前的位置）。 */
export function legacyPortPath(name) {
  return `${srcPrefix}${SR_DIR}app/${name}.ts`;
}

/** 端口文件下沉后的目标路径。 */
export function sunkPortPath(name) {
  return `${srcPrefix}${SR_DIR}${name}.ts`;
}

export function roleCounts() {
  const counts = {};
  for (const row of scope) counts[row.role] = (counts[row.role] ?? 0) + 1;
  return counts;
}

export function classificationCounts() {
  const counts = {};
  for (const row of scope) counts[row.classification] = (counts[row.classification] ?? 0) + 1;
  return counts;
}

/** 合同基线时 licensing 仍把这 17 个路径记为继承文件；返回不匹配项。 */
export function licensingDrift() {
  const licensing = JSON.parse(
    readFileSync(join(repoRoot, "licensing/current-files.json"), "utf8"),
  );
  const byPath = new Map(licensing.files.map((row) => [row.path, row]));
  const drift = [];
  for (const row of scope) {
    // 端口文件在基线时位于 app/ 下
    const baselinePath = row.role === "port" ? legacyPortPath(row.modulePath) : row.path;
    const current = byPath.get(baselinePath);
    if (!current) drift.push({ path: baselinePath, reason: "missing" });
    else if (current.classification === "original")
      drift.push({ path: baselinePath, reason: "original" });
  }
  return drift;
}
