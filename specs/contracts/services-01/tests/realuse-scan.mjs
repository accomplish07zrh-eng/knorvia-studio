// SPDX-License-Identifier: Apache-2.0
// 只读：A 通道（深层路径导入）与 B 通道（公开入口符号导入）里，被导入的范围符号在非范围文件的
// 导入/再导出语句之外实际出现了几次——callers.md 的「真实调用」口径。
import { readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import ts from "typescript";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../../../..");
const raw = JSON.parse(
  readFileSync(join(repoRoot, "specs/contracts/services-01/callers-raw.json"), "utf8"),
);
const owner = new Map();
for (const row of raw.rows) {
  for (const name of row.names ?? []) {
    if (!owner.has(name)) owner.set(name, row.modulePath);
  }
}
// 重新取每个模块的导出名（从 interface.md 的 AST 口径太慢，这里直接用 raw.json 的 consumerList）
const namesByModule = new Map();
for (const row of raw.rows) namesByModule.set(row.modulePath, new Set());
const srcRoot = join(repoRoot, "packages/services/src");
const declRe =
  /^export\s+(?:declare\s+)?(?:abstract\s+)?(?:async\s+)?(?:function|class|interface|type|enum|const|let|var|namespace)\s+([A-Za-z0-9_$]+)/gmu;
const namedRe = /^export\s+(?:type\s+)?\{([^}]*)\}/gmu;
for (const row of raw.rows) {
  const text = readFileSync(join(repoRoot, "packages/services/src", row.modulePath), "utf8");
  const set = namesByModule.get(row.modulePath);
  for (const m of text.matchAll(declRe)) set.add(m[1]);
  for (const m of text.matchAll(namedRe)) {
    for (const part of m[1].split(",")) {
      const n = part
        .trim()
        .replace(/^type\s+/u, "")
        .split(/\s+as\s+/u)
        .pop();
      if (n && /^[A-Za-z0-9_$]+$/u.test(n)) set.add(n);
    }
  }
}

const BARREL = /^@knorvia\/services(?:\/[\w./-]*)?$/u;
const files = new Map();
for (const row of raw.rows) {
  for (const importer of row.deepConsumers) files.set(importer, (files.get(importer) ?? 0) + 1);
  for (const importer of row.barrelConsumers) files.set(importer, (files.get(importer) ?? 0) + 1);
}

const sourceKinds = new Set([ts.SyntaxKind.ImportDeclaration, ts.SyntaxKind.ExportDeclaration]);
let realRefs = 0;
let realFiles = 0;
const perModule = new Map();
for (const file of files.keys()) {
  const abs = join(repoRoot, file);
  let text;
  try {
    text = readFileSync(abs, "utf8");
  } catch {
    continue;
  }
  const scriptKind = /\.tsx$/u.test(file) ? ts.ScriptKind.TSX : ts.ScriptKind.TS;
  const source = ts.createSourceFile(file, text, ts.ScriptTarget.ES2022, true, scriptKind);
  const imported = new Set();
  for (const statement of source.statements) {
    if (!sourceKinds.has(statement.kind)) continue;
    if (statement.moduleSpecifier === undefined) continue;
    const spec = statement.moduleSpecifier.getText(source).replace(/^["']|["']$/gu, "");
    const isBarrel = BARREL.test(spec);
    const isDeepScope = /(^#src\/|\.js$|@knorvia\/services)/u.test(spec);
    if (!isBarrel && !isDeepScope) continue;
    const bindings = ts.isImportDeclaration(statement)
      ? statement.importClause?.namedBindings
      : statement.exportClause;
    if (bindings === undefined) continue;
    if (!ts.isNamedImports(bindings) && !ts.isNamedExports(bindings)) continue;
    for (const element of bindings.elements) imported.add(element.name.getText(source));
  }
  if (imported.size === 0) continue;
  const counters = [];
  (function visit(node) {
    if (sourceKinds.has(node.kind)) return;
    if (ts.isIdentifier(node) && imported.has(node.text)) counters.push(node.text);
    node.forEachChild(visit);
  })(source);
  if (counters.length === 0) continue;
  const scoped = counters.filter((name) =>
    [...namesByModule.values()].some((set) => set.has(name)),
  );
  if (scoped.length === 0) continue;
  realRefs += scoped.length;
  realFiles += 1;
  for (const name of counters) {
    const mods = [...namesByModule.entries()].filter(([, set]) => set.has(name)).map(([m]) => m);
    if (mods.length === 0) continue;
    for (const mod of mods) perModule.set(mod, (perModule.get(mod) ?? 0) + 1);
  }
}
const lines = [...perModule.entries()].sort((a, b) => b[1] - a[1]);
process.stdout.write(
  `真实引用（导入语句之外使用范围符号）：${realRefs} 处，分布在 ${realFiles} 个调用方文件\n`,
  "utf8",
);
for (const [mod, count] of lines) {
  process.stdout.write(`  ${String(count).padStart(4)}  ${mod}\n`, "utf8");
}
