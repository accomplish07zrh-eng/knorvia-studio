// SPDX-License-Identifier: Apache-2.0
// services-01 调用面扫描（只读）：三条通道合成 callers.md 的账。
//   A 深层路径导入：非范围文件按路径直接 import 范围文件（含 index.ts/node.ts 桶与本包测试）。
//   B 公开入口符号导入：非范围文件从 @knorvia/services* 入口 import 的符号，按声明模块归属。
//   C 可达性：从 package.json exports 六个公开入口沿静态 import 走图，判断范围模块是否仍在兼容面上。
// 用法：node specs/contracts/services-01/tests/callers-scan.mjs [--json 输出路径]
import { readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";

import { fileURLToPath } from "node:url";

import { scope } from "./scope.mjs";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../../../..");

const srcRoot = join(repoRoot, "packages/services/src");
const servicesPkg = JSON.parse(
  readFileSync(join(repoRoot, "packages/services/package.json"), "utf8"),
);
const scopeTs = scope.filter((row) => row.path.endsWith(".ts"));
const targets = new Map(scopeTs.map((row) => [resolve(repoRoot, row.path), row]));

const SCAN_DIRS = [
  "packages/desktop/src",
  "packages/desktop/scripts",
  "packages/services/src",
  "packages/services/test",
  "packages/shared/src",
  "packages/shared/test",
  "packages/ui/src",
  "packages/ui/test",
  "packages/web",
  "packages/server/src",
  "packages/server-cli/src",
  "packages/client/src",
  "packages/rpc/src",
  "packages/provider/src",
  "packages/provider-node/src",
  "packages/cua",
  "packages/model-option-map/src",
  "apps/cli/packages",
  "scripts",
  "specs/contracts",
];
const EXT = /\.(?:ts|tsx|mts|cts|mjs|cjs|js)$/u;
const SKIP_DIR = /^(?:node_modules|dist|build|coverage|out|\.git)$/u;

function* walk(dir) {
  let entries;
  try {
    entries = readdirSync(dir, { withFileTypes: true });
  } catch {
    return;
  }
  for (const entry of entries) {
    if (entry.isDirectory()) {
      if (SKIP_DIR.test(entry.name)) continue;
      yield* walk(join(dir, entry.name));
    } else if (entry.isFile() && EXT.test(entry.name)) {
      yield join(dir, entry.name);
    }
  }
}

function srcRel(abs) {
  const rel = relative(srcRoot, abs);
  return rel.startsWith("..") ? null : rel;
}
function isFile(abs) {
  try {
    return statSync(abs).isFile();
  } catch {
    return false;
  }
}
/** 说明符 → 本包 src 相对路径（解析不了返回 null）。 */
function resolveSpecifier(spec, fromFile) {
  if (spec.startsWith("#")) {
    const mapped = expandImports(spec);
    return mapped === null ? null : trySource(mapped);
  }
  if (spec === "@knorvia/services") {
    return "index.ts";
  }
  if (spec.startsWith("@knorvia/services/")) {
    const base = join(srcRoot, spec.slice("@knorvia/services/".length));
    return trySource(base) ?? trySource(join(base, "node"));
  }
  if (spec.startsWith(".")) {
    return trySource(resolve(dirname(fromFile), spec));
  }
  return null;
}
function expandImports(spec) {
  for (const [pattern, value] of Object.entries(servicesPkg.imports ?? {})) {
    const star = pattern.indexOf("*");
    if (star < 0) continue;
    const head = pattern.slice(0, star);
    const tail = pattern.slice(star + 1);
    if (!spec.startsWith(head) || !spec.endsWith(tail)) continue;
    const mid = spec.slice(head.length, spec.length - tail.length);
    const target = typeof value === "string" ? value : value.default;
    return resolve(repoRoot, "packages/services", target.replace("*", mid));
  }
  return null;
}
function trySource(absWithoutExt) {
  const base = absWithoutExt.replace(/\.js$/u, "");
  for (const cand of [`${base}.ts`, `${base}.tsx`, join(base, "index.ts"), join(base, "node.ts")]) {
    if (isFile(cand)) return srcRel(cand);
  }
  return srcRel(base);
}

const IMPORT_SPEC = /(?:from|import)\s*\(?\s*["']([^"']+)["']/gu;
const BRACED = /(?:import|export)\s*(?:type\s*)?\{([^}]*)\}\s*(?:from|\))/gu;

function braceNames(line) {
  const match = BRACED.exec(line);
  BRACED.lastIndex = 0;
  if (match === null) return [];
  return match[1]
    .split(",")
    .map((part) =>
      part
        .trim()
        .replace(/^type\s+/u, "")
        .split(/\s+as\s+/u)
        .pop(),
    )
    .filter((name) => name !== undefined && name.length > 0);
}

/** 通道 A：非范围文件按路径 import 范围文件。 */
function deepImports() {
  const refs = new Map();
  const internalEdges = [];
  let scanned = 0;
  for (const top of SCAN_DIRS) {
    for (const file of walk(join(repoRoot, top))) {
      if (targets.has(file)) continue;
      scanned += 1;
      const lines = readFileSync(file, "utf8").split(/\r?\n/u);
      lines.forEach((line, index) => {
        for (const [, spec] of line.matchAll(IMPORT_SPEC)) {
          const row = resolveTargetRow(spec, file);
          if (row === null) continue;
          if (!refs.has(row.modulePath)) refs.set(row.modulePath, []);
          refs.get(row.modulePath).push({
            importer: relative(repoRoot, file).split("\\").join("/"),
            line: index + 1,
            spec,
            names: braceNames(line),
          });
        }
      });
    }
  }
  for (const row of scopeTs) {
    const absolute = resolve(repoRoot, row.path);
    const lines = readFileSync(absolute, "utf8").split(/\r?\n/u);
    lines.forEach((line, index) => {
      for (const [, spec] of line.matchAll(IMPORT_SPEC)) {
        if (
          !spec.startsWith(".") &&
          !spec.startsWith("#") &&
          !spec.startsWith("@knorvia/services")
        ) {
          continue;
        }
        const rel = resolveSpecifier(spec, absolute);
        const hit = scopeTs.find((item) => item.modulePath === rel);
        if (hit !== undefined) {
          internalEdges.push({ from: row.modulePath, to: hit.modulePath, line: index + 1 });
        }
      }
    });
  }
  return { refs, internalEdges, scanned };
}
function resolveTargetRow(spec, fromFile) {
  const rel = resolveSpecifier(spec, fromFile);
  if (rel === null) return null;
  const abs = join(srcRoot, rel);
  return targets.get(abs) ?? null;
}

/** 通道 B：符号 → 声明模块（含具名再导出；`export *` 只登记目标模块自身）。 */
function symbolOwners() {
  const owner = new Map();
  for (const row of scopeTs) {
    const text = readFileSync(resolve(repoRoot, row.path), "utf8");
    for (const match of text.matchAll(
      /^export\s+(?:declare\s+)?(?:abstract\s+)?(?:async\s+)?(?:function|class|interface|type|enum|const|let|var|namespace)\s+([A-Za-z0-9_$]+)/gmu,
    )) {
      pushOwner(owner, match[1], row.modulePath);
    }
    for (const match of text.matchAll(/^export\s+(?:type\s+)?\{([^}]*)\}/gmu)) {
      for (const part of match[1].split(",")) {
        const name = part
          .trim()
          .replace(/^type\s+/u, "")
          .split(/\s+as\s+/u)
          .pop();
        if (name !== undefined && /^[A-Za-z0-9_$]+$/u.test(name))
          pushOwner(owner, name, row.modulePath);
      }
    }
  }
  return owner;
}
function pushOwner(owner, name, modulePath) {
  const list = owner.get(name);
  if (list === undefined) owner.set(name, [modulePath]);
  else if (!list.includes(modulePath)) list.push(modulePath);
}

const BARREL_IMPORT =
  /(?:^|\n)[ \t]*(?:import|export)[ \t]+(?:type[ \t]+)?([\s\S]{0,600}?)[ \t]from[ \t]*["'](@knorvia\/services(?:\/[\w./-]+)?)["']/gmu;

/** 通道 B 主体：非范围文件从公开入口 import 的范围符号。 */
function barrelConsumers() {
  const perModule = new Map();
  const consumers = new Map();
  const owner = symbolOwners();
  let scanned = 0;
  for (const top of SCAN_DIRS) {
    for (const file of walk(join(repoRoot, top))) {
      if (targets.has(file)) continue;
      scanned += 1;
      const text = readFileSync(file, "utf8");
      const relFile = relative(repoRoot, file).split("\\").join("/");
      for (const match of text.matchAll(BARREL_IMPORT)) {
        const entry = match[2];
        if (!entry.startsWith("@knorvia/services")) continue;
        const body = match[1] ?? "";
        const braces = /\{([^}]*)\}/u.exec(body);
        if (braces === null) continue;
        for (const part of braces[1].split(",")) {
          const name = part
            .trim()
            .replace(/^type\s+/u, "")
            .split(/\s+as\s+/u)[0];
          if (!/^[A-Za-z0-9_$]+$/u.test(name)) continue;
          const owners = owner.get(name);
          if (owners === undefined) continue;
          for (const modulePath of owners) {
            const inner = perModule.get(modulePath) ?? new Map();
            perModule.set(modulePath, inner);
            const key = `${relFile} ${entry}`;
            inner.set(key, (inner.get(key) ?? 0) + 1);
            const set = consumers.get(relFile) ?? new Set();
            consumers.set(relFile, set);
            set.add(name);
          }
        }
      }
    }
  }
  return { perModule, consumers, owner, scanned };
}

/** 通道 C：从六个公开入口沿静态 import 走图。 */
function reachableFromPublicEntries() {
  const entries = Object.values(servicesPkg.exports).map((value) =>
    srcRel(resolve(repoRoot, "packages/services", value)),
  );
  const seen = new Set();
  const queue = entries.filter((item) => item !== null);
  while (queue.length > 0) {
    const current = queue.shift();
    if (seen.has(current)) continue;
    seen.add(current);
    const absolute = join(srcRoot, current);
    if (!isFile(absolute)) continue;
    const text = readFileSync(absolute, "utf8");
    for (const [, spec] of text.matchAll(IMPORT_SPEC)) {
      const rel = resolveSpecifier(spec, absolute);
      if (rel !== null && !seen.has(rel)) queue.push(rel);
    }
  }
  return {
    entries,
    visited: seen.size,
    reachable: new Set(
      [...targets.values()].map((row) => row.modulePath).filter((m) => seen.has(m)),
    ),
  };
}

const deep = deepImports();
const barrel = barrelConsumers();
const reach = reachableFromPublicEntries();

const rows = scopeTs.map((row) => {
  const deepList = deep.refs.get(row.modulePath) ?? [];
  const deepConsumerFiles = [...new Set(deepList.map((item) => item.importer))].sort();
  const barrelMap = barrel.perModule.get(row.modulePath) ?? new Map();
  const barrelConsumerFiles = [
    ...new Set([...barrelMap.keys()].map((key) => key.split(" ")[0])),
  ].sort();
  const union = [...new Set([...deepConsumerFiles, ...barrelConsumerFiles])].sort();
  return {
    modulePath: row.modulePath,
    dir: row.dir,
    classification: row.classification,
    deepSites: deepList.length,
    deepConsumers: deepConsumerFiles,
    barrelSites: [...barrelMap.values()].reduce((a, b) => a + b, 0),
    barrelConsumers: barrelConsumerFiles,
    consumerFiles: union,
    reachable: reach.reachable.has(row.modulePath),
    internalOut: deep.internalEdges
      .filter((edge) => edge.from === row.modulePath)
      .map((edge) => edge.to),
    internalIn: deep.internalEdges
      .filter((edge) => edge.to === row.modulePath)
      .map((edge) => edge.from),
  };
});

const totals = {
  scopeFiles: scope.length,
  scopeTs: scopeTs.length,
  documents: scope.length - scopeTs.length,
  deep: {
    scannedFiles: deep.scanned,
    sites: rows.reduce((a, r) => a + r.deepSites, 0),
    consumerFiles: new Set(rows.flatMap((r) => r.deepConsumers)).size,
    internalEdges: deep.internalEdges.length,
  },
  barrel: {
    scannedFiles: barrel.scanned,
    sites: rows.reduce((a, r) => a + r.barrelSites, 0),
    consumerFiles: new Set(rows.flatMap((r) => r.barrelConsumers)).size,
    symbolsMapped: barrel.owner.size,
  },
  unionConsumerFiles: new Set(rows.flatMap((r) => r.consumerFiles)).size,
  reach: {
    entries: reach.entries,
    visited: reach.visited,
    scopeReachable: rows.filter((r) => r.reachable).length,
    unreachable: rows.filter((r) => !r.reachable).map((r) => r.modulePath),
  },
};

const jsonPathIndex = process.argv.indexOf("--json");
const evidencePath =
  jsonPathIndex >= 0
    ? resolve(process.cwd(), process.argv[jsonPathIndex + 1])
    : join(repoRoot, "specs/contracts/services-01/callers-raw.json");
writeFileSync(evidencePath, `${JSON.stringify({ totals, rows }, null, 1)}\n`, "utf8");

const dirAgg = new Map();
for (const row of rows) {
  const agg = dirAgg.get(row.dir) ?? { modules: 0, deep: 0, barrel: 0, consumers: new Set() };
  agg.modules += 1;
  agg.deep += row.deepSites;
  agg.barrel += row.barrelSites;
  for (const file of row.consumerFiles) agg.consumers.add(file);
  dirAgg.set(row.dir, agg);
}
process.stdout.write("### 目录汇总\n\n", "utf8");
process.stdout.write(
  "| 目录 | 模块 | A 深层 import | B 入口符号 | 调用方文件（并集） |\n| --- | ---: | ---: | ---: | ---: |\n",
  "utf8",
);
for (const [dir, agg] of [...dirAgg.entries()].sort((a, b) => a[0].localeCompare(b[0]))) {
  process.stdout.write(
    `| \`${dir}/\` | ${agg.modules} | ${agg.deep} | ${agg.barrel} | ${agg.consumers.size} |\n`,
    "utf8",
  );
}
process.stdout.write("\n### 逐模块账\n\n", "utf8");
process.stdout.write(
  "| modulePath | 分类 | A | B | 并集调用方 | 公开面可达 | 范围内出边 | 范围内入边 |\n| --- | --- | ---: | ---: | ---: | --- | ---: | ---: |\n",
  "utf8",
);
for (const row of [...rows].sort((a, b) => a.modulePath.localeCompare(b.modulePath))) {
  process.stdout.write(
    `| \`${row.modulePath}\` | ${row.classification} | ${row.deepSites} | ${row.barrelSites} | ${row.consumerFiles.length} | ${row.reachable ? "是" : "否"} | ${row.internalOut.length} | ${row.internalIn.length} |\n`,
    "utf8",
  );
}
process.stdout.write(
  `\n合计：范围 ${totals.scopeTs} 个 .ts + ${totals.documents} 份 .md；A ${totals.deep.sites} 处 / ${totals.deep.consumerFiles} 个调用方；B ${totals.barrel.sites} 处 / ${totals.barrel.consumerFiles} 个调用方；并集 ${totals.unionConsumerFiles} 个调用方文件；内部边 ${totals.deep.internalEdges} 条；公开入口可达 ${totals.reach.scopeReachable}/${totals.scopeTs}。证据：\`${evidencePath.replace(repoRoot + "/", "")}\`\n`,
  "utf8",
);
