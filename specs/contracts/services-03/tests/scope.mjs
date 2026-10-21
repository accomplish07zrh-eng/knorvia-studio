// SPDX-License-Identifier: Apache-2.0
// services-03 范围真源：冻结在 scope-files.json 的 studio-runtime/domain 层 31 个文件。
// licensing/current-files.json 仍用于核对合同基线时的继承分类；登记为 original 之后
// 以冻结快照为准（见 known-differences.md）。
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

export const repoRoot = fileURLToPath(new URL("../../../../", import.meta.url));
export const contractDir = join(repoRoot, "specs/contracts/services-03");
export const srcPrefix = "packages/services/src/";
export const SR_DIR = "studio-runtime/";
export const DOMAIN_DIR = `${SR_DIR}domain/`;

/** 冻结快照：每条含 path / modulePath / dir / classification / bytes / lines / exportCount。 */
export const scope = JSON.parse(readFileSync(join(contractDir, "scope-files.json"), "utf8"));

const frozenStats = JSON.parse(readFileSync(join(contractDir, ".frozen.json"), "utf8"));

export const FROZEN = {
  count: frozenStats.count,
  lines: frozenStats.lines,
  bytes: frozenStats.bytes,
  exports: frozenStats.exports,
  runtimeExports: frozenStats.runtimeExports,
  byClassification: frozenStats.byClassification,
};

/**
 * 层内依赖边（实测自源码，2026-10-21）。
 *
 * 方向记法：`from` 依赖 `to`（即 `from` 里 `import ... from "./to.js"`）。
 *
 * 实测 **21 条**，31 个文件里 22 个参与、9 个独立。
 * 冻结在这里，供 dependencies 测试断言「层内依赖不扩大」。
 *
 * ⚠️ 早期侦察稿写的是 10 条且方向相反（把 `validation` 写成被依赖方），
 * 实测后更正：`validation` 依赖 `imageInput` / `kernelIdentity` / `kernelPolicy` /
 * `workspaceReviewPolicy`，而不是反过来。
 */
export const INTERNAL_EDGES = [
  // validation 依赖 4 个（本层被依赖最多的起点之一）
  { from: "validation", to: "imageInput" },
  { from: "validation", to: "kernelIdentity" },
  { from: "validation", to: "kernelPolicy" },
  { from: "validation", to: "workspaceReviewPolicy" },
  // kernelPolicy / kernelPresentation 依赖链
  { from: "kernelPresentation", to: "kernelPolicy" },
  { from: "retiredKernels", to: "kernelPolicy" },
  { from: "workflowParams", to: "kernelPolicy" },
  // kernelIdentity 与身份链
  { from: "kernelIdentity", to: "remoteAgentIdentity" },
  // workflowGraph 是工作流簇的汇聚点
  { from: "workflowGraph", to: "condition" },
  { from: "workflowGraph", to: "kernelIdentity" },
  { from: "workflowGraph", to: "outputRef" },
  { from: "workflowGraph", to: "workflowParams" },
  // output 链
  { from: "outputBuild", to: "outputRef" },
  { from: "reference", to: "outputRef" },
  { from: "reference", to: "referencePath" },
  // image 链
  { from: "imageInput", to: "staticPng" },
  // group 链
  { from: "groupPolicy", to: "kernelIdentity" },
  { from: "groupPrompts", to: "groupPolicy" },
  // capabilityMatrix 是叶子（无层内依赖）；kernelPolicy 依赖它
  { from: "kernelPolicy", to: "capabilityMatrix" },
  // workspace 链
  { from: "workspaceImage", to: "workspaceSecrets" },
  { from: "workspaceReviewPolicy", to: "workspaceSecrets" },
];

/**
 * domain 层**不得** import 的层：`app/` 与 `adapters/`。
 *
 * `contract.ts`（在 `services-02`）用 `export *` 聚合本层的 3 个模块，
 * 那是入口聚合职责，不算本层的依赖边。
 */
export const FORBIDDEN_IMPORT_DIRS = ["app/", "adapters/"];

/** domain 层文件在源码树中的相对路径。 */
export function sourcePathOf(row) {
  return `${DOMAIN_DIR}${row.modulePath.replace(/^domain\//u, "")}.ts`;
}

export function classificationCounts() {
  const counts = {};
  for (const row of scope) counts[row.classification] = (counts[row.classification] ?? 0) + 1;
  return counts;
}

/** 合同基线时 licensing 仍把这 31 个路径记为继承文件；返回不匹配项。 */
export function licensingDrift() {
  const licensing = JSON.parse(readFileSync(join(repoRoot, "licensing/current-files.json"), "utf8"));
  const byPath = new Map(licensing.files.map((row) => [row.path, row]));
  const drift = [];
  for (const row of scope) {
    const current = byPath.get(row.path);
    if (!current) drift.push({ path: row.path, reason: "missing" });
    else if (current.classification === "original") drift.push({ path: row.path, reason: "original" });
  }
  return drift;
}
