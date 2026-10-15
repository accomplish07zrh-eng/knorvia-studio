// SPDX-License-Identifier: Apache-2.0
// dynamic-workflow-01 调用方扫描：纯 AST 语法扫描（不起 LanguageService、不做类型解析），
// 遍历全仓源文件的 import / 动态 import / require 说明符，聚合出：
//   1) 包外调用方（import "@knorvia/dynamic-workflow" 与 ".../projections"）→ 记录具名导入；
//   2) 包内跨模块调用方（相对路径落入 analysis/ 或 compiler/）→ 记录具名导入；
// 与 dep:refs 的符号级结果互补（dep:refs 逐符号 findReferences 在本包 283 导出 × 全仓规模下
// 内存溢出，见 acceptance.md；本扫描保证 callers.md 覆盖全部 import 面）。
// 用法（仓库根目录）：node --import tsx specs/contracts/dynamic-workflow-01/tests/scan-callers.mjs
import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import ts from "typescript";

const here = dirname(fileURLToPath(import.meta.url));
const contractDir = resolve(here, "..");
const repoRoot = resolve(here, "../../../..");

const SKIP = new Set(["node_modules", "dist", "build", "coverage", "out", ".git", "third-party"]);

function walk(dir, acc) {
  let entries;
  try {
    entries = readdirSync(dir, { withFileTypes: true });
  } catch {
    return acc;
  }
  for (const entry of entries) {
    if (SKIP.has(entry.name)) continue;
    const full = join(dir, entry.name);
    if (entry.isDirectory()) walk(full, acc);
    else if (/\.(ts|tsx|mts|cts|mjs|cjs)$/.test(entry.name)) acc.push(full);
  }
  return acc;
}

/** 从一个文件的源码里提取 (specifier, importedNames[]) 列表。 */
function importSpecifiers(text, fileName) {
  const source = ts.createSourceFile(fileName, text, ts.ScriptTarget.ES2022, true);
  const found = [];
  const clause = (spec) => {
    if (!spec) return [];
    if (ts.isNamedImports(spec))
      return spec.elements.map((element) => (element.propertyName ?? element.name).text);
    if (ts.isNamespaceImport(spec)) return ["*"];
    return ["default"];
  };
  const visit = (node) => {
    if (ts.isImportDeclaration(node) && ts.isStringLiteral(node.moduleSpecifier)) {
      found.push([node.moduleSpecifier.text, clause(node.importClause?.namedBindings)]);
    } else if (
      ts.isExportDeclaration(node) &&
      node.moduleSpecifier &&
      node.exportClause &&
      ts.isNamedExports(node.exportClause)
    ) {
      found.push([node.moduleSpecifier.text, node.exportClause.elements.map((e) => e.name.text)]);
    } else if (
      ts.isCallExpression(node) &&
      node.expression.kind === ts.SyntaxKind.ImportKeyword &&
      node.arguments[0] &&
      ts.isStringLiteralLike(node.arguments[0])
    ) {
      found.push([node.arguments[0].text, ["(dynamic)"]]);
    }
    ts.forEachChild(node, visit);
  };
  visit(source);
  return found;
}

const files = walk(repoRoot, []);
const packagePrefix = "@knorvia/dynamic-workflow";
const isScopeRelative = (resolved) =>
  /(^|\/)apps\/cli\/packages\/dynamic-workflow\/src\/(analysis|compiler)\//.test(resolved);

const external = new Map(); // file -> Map(specifier -> names)
const internal = new Map();
for (const file of files) {
  const rel = relative(repoRoot, file).split("\\").join("/");
  // 范围文件自身之间的自/互 import 是实现细节，不算调用方；
  // 包内其他目录（index/projections/engine/facade/schema/lowering）的 import 才是兼容面。
  if (/^apps\/cli\/packages\/dynamic-workflow\/src\/(analysis|compiler)\//.test(rel)) continue;
  let text;
  try {
    text = readFileSync(file, "utf8");
  } catch {
    continue;
  }
  for (const [specifier, names] of importSpecifiers(text, rel)) {
    const entry =
      specifier === packagePrefix || specifier.startsWith(`${packagePrefix}/`) ? external : null;
    let bucket = entry;
    if (bucket === null && specifier.startsWith(".")) {
      // 相对说明符：把调用方目录拼上去，判断是否落入范围目录。
      const resolved = join(rel, "..", specifier).split("\\").join("/");
      if (isScopeRelative(resolved)) bucket = internal;
    }
    if (bucket === null) continue;
    if (!bucket.has(rel)) bucket.set(rel, new Map());
    const perFile = bucket.get(rel);
    perFile.set(specifier, [...new Set([...(perFile.get(specifier) ?? []), ...names])].sort());
  }
}

const lines = [];
lines.push(
  "# dynamic-workflow-01 调用方原始清单（scan-callers.mjs 输出，机器生成）",
  "",
  `扫描口径：全仓源文件（跳过 ${[...SKIP].join("/")}）的 import / re-export / 动态 import 说明符，`,
  "纯语法扫描。与 dep:refs 的符号级 findReferences 结果互为补充（后者在本包 283 个导出的",
  "规模下内存溢出，见 acceptance.md）。",
  "",
  `## 包外调用方（import "@knorvia/dynamic-workflow" 或 ".../projections"）：${external.size} 个文件`,
  "",
);
for (const [file, specifiers] of [...external].sort()) {
  lines.push(`- \`${file}\``);
  for (const [specifier, names] of [...specifiers].sort()) {
    lines.push(`  - \`${specifier}\`: ${names.join(", ")}`);
  }
}
lines.push(
  "",
  `## 包内跨目录调用方（相对路径落入 analysis/ 或 compiler/）：${internal.size} 个文件`,
  "",
);
for (const [file, specifiers] of [...internal].sort()) {
  lines.push(`- \`${file}\``);
  for (const [specifier, names] of [...specifiers].sort()) {
    lines.push(`  - \`${specifier}\`: ${names.join(", ")}`);
  }
}
writeFileSync(join(contractDir, "callers-raw.txt"), `${lines.join("\n")}\n`, "utf8");
console.log(
  `scan-callers: ${files.length} files scanned / external ${external.size} / internal ${internal.size} -> callers-raw.txt`,
);
