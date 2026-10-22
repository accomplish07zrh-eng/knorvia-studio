// SPDX-License-Identifier: Apache-2.0
// services-04 范围真源：计划书 L215 的 7 项（`.`, subagents, system, terminal,
// types, usage-stats, window-controller），排除两个包级聚合桶。
//
// 口径（见 known-differences.md K-x / K-z）：
//   · 纳入：上述目录下的普通 `.ts` 实现文件
//   · 排除：`index.ts` / `node.ts`（包级公开面聚合桶，88 + 56 条纯转发，无实现）
//   · 排除：`.d.ts`（`types/yazl.d.ts` 是第三方类型声明，单独登记，不跑相似度）
//   · 排除：`.test.ts`（本包范围内无）
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

export const repoRoot = fileURLToPath(new URL("../../../../", import.meta.url));
export const contractDir = join(repoRoot, "specs/contracts/services-04");
export const srcPrefix = "packages/services/src/";

/** 计划书 L215 的 7 项归属。`.` 表示 `packages/services/src` 根目录的直接文件。 */
export const PLAN_DIRS = [
  ".",
  "subagents",
  "system",
  "terminal",
  "types",
  "usage-stats",
  "window-controller",
];

/** 包级公开面聚合桶：不属于实现范围（同 services-03 的 contract.ts / K5 先例）。 */
export const BARREL_FILES = ["packages/services/src/index.ts", "packages/services/src/node.ts"];

/**
 * 冻结快照：每条含 path / group / name / lines / bytes / exportCount / runtimeExports / classification。
 *
 * ⚠️ 延迟加载：`gen-scope.mjs` 需要先导入本模块才能生成它，
 * 若在模块顶层直接 readFileSync 会导致「生成器无法启动」的自举死锁。
 */
let _scope;
export function scopeRows() {
  if (_scope === undefined) {
    _scope = JSON.parse(readFileSync(join(contractDir, "scope-files.json"), "utf8"));
  }
  return _scope;
}

let _frozen;
export function frozenStats() {
  if (_frozen === undefined) {
    _frozen = JSON.parse(readFileSync(join(contractDir, ".frozen.json"), "utf8"));
  }
  return _frozen;
}

/**
 * 层内依赖边（`from` 依赖 `to`），实测 69 条。
 *
 * 这是 `services-04` 与 `services-03` 的重要区别：domain 层只有 21 条边、
 * 17 个叶子（松耦合）；app 层有 69 条边、16 个叶子（编排层，耦合更紧）。
 *
 * 冻结在 `.frozen.json` 的 `edgeList`，供 dependencies 测试断言「层内依赖不扩大」。
 * ⚠️ 方向定义：`from` 里 `import ... from "./to.js"`。
 */
export function internalEdges() {
  return frozenStats().edgeList;
}

/** 冻结统计的便捷视图。 */
export function frozen() {
  const stats = frozenStats();
  return {
    count: stats.count,
    lines: stats.lines,
    bytes: stats.bytes,
    exports: stats.exports,
    runtimeExports: stats.runtimeExports,
    byGroup: stats.byGroup,
    byClassification: stats.byClassification,
    internalEdges: stats.internalEdges,
    edgeList: stats.edgeList,
  };
}

/**
 * 层**不得**依赖的更高层：`adapters/` 与 `studio-runtime/{app,adapters}/`。
 *
 * `services-04` 在分层里的位置：它被 `bootstrap` 与 `adapters` 依赖，
 * 自身只向下依赖 `services-01`/`02`/`03`（agent / session 等）与 `services-03` 的 domain。
 */
export const FORBIDDEN_IMPORT_DIRS = ["/adapters/", "studio-runtime/adapters/"];

/** 允许的 node 内置 I/O 模块（编排层可以有 I/O，但必须通过注入，见 behavior B3）。 */
export const NODE_IO_MODULES = [
  "node:fs",
  "node:fs/promises",
  "node:child_process",
  "node:net",
  "node:http",
  "node:https",
  "node:os",
  "node:path",
];

/** 文件的实现路径（仓库相对）。 */
export function sourcePathOf(row) {
  return row.path;
}

export function groupOf(row) {
  return row.group;
}

export function classificationCounts() {
  const counts = {};
  for (const row of scope) counts[row.classification] = (counts[row.classification] ?? 0) + 1;
  return counts;
}

/** 层外引用清单（由 callers.md 生成脚本写入，测试用 B10 断言总数）。 */
export function callersSummary() {
  return JSON.parse(readFileSync(join(contractDir, "callers-summary.json"), "utf8"));
}
