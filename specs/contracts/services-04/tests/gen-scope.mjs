// services-04 scope 采集：生成 scope-files.json + .frozen.json（含 69 条层内依赖边）。
// 用法：node --import tsx specs/contracts/services-04/tests/gen-scope.mjs
import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import { contractDir, BARREL_FILES, PLAN_DIRS, repoRoot, srcPrefix } from "./scope.mjs";
import { extractExports } from "./exports-ast.mjs";

const SRC = "packages/services/src";

function walk(dir, out = []) {
  let entries;
  try {
    entries = readdirSync(join(repoRoot, dir), { withFileTypes: true });
  } catch {
    return out;
  }
  for (const entry of entries) {
    const rel = `${dir}/${entry.name}`;
    if (entry.isDirectory()) walk(rel, out);
    else if (entry.name.endsWith(".ts") && !entry.name.endsWith(".d.ts")) out.push(rel);
  }
  return out;
}

/** 按 PLAN_DIRS 收集文件（`.` 表示根目录直接文件）。 */
function collectFiles() {
  const files = [];
  for (const dir of PLAN_DIRS) {
    if (dir === ".") {
      for (const entry of readdirSync(join(repoRoot, SRC), { withFileTypes: true })) {
        if (entry.isFile() && entry.name.endsWith(".ts") && !entry.name.endsWith(".d.ts")) {
          files.push(`${SRC}/${entry.name}`);
        }
      }
    } else {
      files.push(...walk(`${SRC}/${dir}`));
    }
  }
  return files.filter((path) => !BARREL_FILES.includes(path)).sort();
}

function groupOf(path) {
  const rel = path.replace(`${SRC}/`, "");
  return rel.includes("/") ? rel.split("/")[0] : ".";
}

const licensing = JSON.parse(readFileSync(join(repoRoot, "licensing/current-files.json"), "utf8"));
const byPath = new Map(licensing.files.map((row) => [row.path, row]));

const allFiles = collectFiles();
const rows = [];
let totalLines = 0;
let totalBytes = 0;
let totalExports = 0;
let totalRuntime = 0;

for (const path of allFiles) {
  const source = readFileSync(join(repoRoot, path), "utf8");
  const lines = source.split("\n").length - (source.endsWith("\n") ? 1 : 0);
  const bytes = Buffer.byteLength(source, "utf8");
  const moduleRel = path.replace(`${SRC}/`, "");
  const exports = extractExports(repoRoot, moduleRel);
  const runtime = exports.filter((entry) => entry.runtime).length;
  const lic = byPath.get(path);

  rows.push({
    path,
    group: groupOf(path),
    name: path.replace(`${SRC}/`, ""),
    classification: lic?.classification ?? "MISSING",
    upstream: lic?.upstream ?? null,
    bytes,
    lines,
    exportCount: exports.length,
    runtimeExports: runtime,
  });

  totalLines += lines;
  totalBytes += bytes;
  totalExports += exports.length;
  totalRuntime += runtime;
}

// ── 层内依赖边
const nameSet = new Set(rows.map((row) => row.name.replace(/\.ts$/u, "")));
const edges = [];
for (const row of rows) {
  const from = row.name.replace(/\.ts$/u, "");
  const source = readFileSync(join(repoRoot, row.path), "utf8");
  const fromDir = from.includes("/") ? from.slice(0, from.lastIndexOf("/")) : "";
  for (const m of source.matchAll(/(?:^|\n)\s*(?:import|export)[^;]*?from\s+"([^"]+)"/gu)) {
    const spec = m[1];
    if (!spec.startsWith(".")) continue;
    const parts = `${fromDir === "" ? "" : fromDir + "/"}${spec}`.split("/");
    const stack = [];
    for (const part of parts) {
      if (part === "." || part === "") continue;
      if (part === "..") stack.pop();
      else stack.push(part);
    }
    const target = stack.join("/").replace(/\.js$/u, "");
    if (nameSet.has(target) && target !== from) edges.push(`${from}->${target}`);
  }
}
const edgeList = [...new Set(edges)].sort();

// ── 汇总
const byGroup = {};
for (const row of rows) {
  byGroup[row.group] ??= { files: 0, lines: 0, exports: 0 };
  byGroup[row.group].files += 1;
  byGroup[row.group].lines += row.lines;
  byGroup[row.group].exports += row.exportCount;
}

const byClassification = {};
for (const row of rows) {
  byClassification[row.classification] = (byClassification[row.classification] ?? 0) + 1;
}

writeFileSync(join(contractDir, "scope-files.json"), `${JSON.stringify(rows, null, 2)}\n`, "utf8");

writeFileSync(
  join(contractDir, ".frozen.json"),
  `${JSON.stringify(
    {
      count: rows.length,
      lines: totalLines,
      bytes: totalBytes,
      exports: totalExports,
      runtimeExports: totalRuntime,
      byGroup,
      byClassification,
      internalEdges: edgeList.length,
      edgeList,
    },
    null,
    2,
  )}\n`,
  "utf8",
);

console.log(`=== services-04 scope 采集完成 ===`);
console.log(
  `文件 ${rows.length} / 行 ${totalLines} / 字节 ${totalBytes} / 导出 ${totalExports}（运行时 ${totalRuntime}）`,
);
console.log(`层内依赖边 ${edgeList.length}`);
console.log(`\n按组:`);
for (const [group, stats] of Object.entries(byGroup).sort((a, b) => b[1].lines - a[1].lines)) {
  console.log(
    `  ${group.padEnd(20)} ${String(stats.files).padStart(3)} 文件 ${String(stats.lines).padStart(5)} 行 ${String(stats.exports).padStart(4)} 导出`,
  );
}
console.log(`\n分类: ${JSON.stringify(byClassification)}`);
void srcPrefix;
