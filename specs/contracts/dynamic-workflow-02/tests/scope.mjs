// SPDX-License-Identifier: Apache-2.0
// dynamic-workflow-02 范围清单的唯一真源：从 licensing/current-files.json 读继承分类，
// 取 apps/cli/packages/dynamic-workflow/src/ 下 **analysis/ 与 compiler/ 之外**的全部 .ts
// （那两个目录是 dynamic-workflow-01 的范围）。生成器（gen-interface / build-stubs /
// scan-callers）与契约测试都从这里取文件集，所以「本包管哪些文件」只有一份答案。
import { readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

export const here = dirname(fileURLToPath(import.meta.url));
export const contractDir = resolve(here, "..");
export const repoRoot = resolve(here, "../../../..");
export const packageDir = "apps/cli/packages/dynamic-workflow";
export const srcPrefix = `${packageDir}/src/`;

/** 本包的四个子目录 + 两个入口桶（`""` 表示 src 根）。 */
export const BUCKETS = ["", "engine", "facade", "lowering", "schema"];

/** 属 dynamic-workflow-01 的两个目录（本包不碰）。 */
const OUT_OF_SCOPE_DIRS = ["analysis", "compiler"];

function bucketOf(modulePath) {
  const slash = modulePath.indexOf("/");
  return slash === -1 ? "" : modulePath.slice(0, slash);
}

/**
 * `licensing/current-files.json` 的 `files` 是**数组**（不是对象），逐条 `{path, classification, bytes}`。
 * @returns {{path:string,modulePath:string,bucket:string,classification:string,bytes:number,rewriteTarget:boolean}[]}
 */
export function loadScope() {
  const registry = JSON.parse(readFileSync(join(repoRoot, "licensing/current-files.json"), "utf8"));
  if (!Array.isArray(registry.files))
    throw new Error("licensing/current-files.json: files 不是数组");
  const rows = [];
  for (const entry of registry.files) {
    const path = entry.path;
    if (typeof path !== "string" || !path.startsWith(srcPrefix)) continue;
    const modulePath = path.slice(srcPrefix.length);
    if (OUT_OF_SCOPE_DIRS.includes(bucketOf(modulePath))) continue;
    if (!BUCKETS.includes(bucketOf(modulePath))) continue;
    // 替换阶段登记后，37 个重写目标的 classification 会变成 original，4 个新拆模块
    // （upstream 缺席）也会作为新文件进册。本包的继承范围仍是原 40 个文件：
    // 已登记的目标按 upstream.relation 归位成 upstream-*，新拆模块不进兼容面。
    if (entry.classification === "original" && !entry.upstream) continue;
    const classification =
      entry.classification === "original" && entry.upstream
        ? `upstream-${entry.upstream.relation}`
        : entry.classification;
    rows.push({
      path,
      modulePath,
      bucket: bucketOf(modulePath),
      classification,
      bytes: entry.bytes,
      rewriteTarget: entry.classification !== "unreviewed",
    });
  }
  rows.sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0));
  return rows;
}

export const scope = loadScope();
export const rewriteTargets = scope.filter((row) => row.rewriteTarget);
export const unreviewed = scope.filter((row) => !row.rewriteTarget);

/** 按分类计数，README 与 surface 测试共用。 */
export function classificationCounts(rows = scope) {
  const counts = {};
  for (const row of rows) counts[row.classification] = (counts[row.classification] ?? 0) + 1;
  return counts;
}
