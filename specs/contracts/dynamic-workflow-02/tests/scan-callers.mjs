// SPDX-License-Identifier: Apache-2.0
// dynamic-workflow-02 调用方扫描：纯语法扫描（不起 LanguageService、不做类型解析），遍历全仓
// 源文件的 import / re-export / 动态 import 说明符，聚合三段：
//   1) 包外调用方：`@knorvia/dynamic-workflow` 与 `.../projections` 桶的具名导入；
//   2) 包内非范围调用方：src/analysis/**、src/compiler/**、src/projections.ts 之外…（dynamic-workflow-01
//      已替换的目录）按相对路径落入本包范围（engine/facade/lowering/schema/两个入口桶）的导入；
//   3) 深层模块路径消费者：任何按相对路径或字符串路径指进范围文件的调用方（含 test/）。
// 与 dep:refs 的符号级 findReferences 互补（后者在 537 项导出的规模下内存溢出，见 acceptance.md）。
// 用法（仓库根目录）：node --import tsx specs/contracts/dynamic-workflow-02/tests/scan-callers.mjs
import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import ts from "typescript";

import { srcPrefix, scope } from "./scope.mjs";

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
    else if (/\.(ts|tsx|mts|cts|mjs|cjs|json)$/.test(entry.name)) acc.push(full);
  }
  return acc;
}

/** 从一个文件的源码里提取 (specifier, importedNames[])。 */
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

const scopePaths = new Set(scope.map((row) => row.path));
/** 说明符解析后的相对文件路径是否落在本包范围（把 `.js` 说明符折回 `.ts`）。 */
function resolvesIntoScope(callerRel, specifier) {
  if (!specifier.startsWith(".")) return false;
  const joined = join(callerRel, "..", specifier).split("\\").join("/");
  const asTs = joined.replace(/\.js$/, ".ts");
  return scopePaths.has(asTs) || scopePaths.has(joined);
}

const packageSpecifier = "@knorvia/dynamic-workflow";
const bucketExternal = new Map();
const bucketInPackage = new Map();
const bucketDeep = new Map();

function record(bucket, rel, specifier, names) {
  if (!bucket.has(rel)) bucket.set(rel, new Map());
  const perFile = bucket.get(rel);
  perFile.set(specifier, [...new Set([...(perFile.get(specifier) ?? []), ...names])].sort());
}

for (const file of walk(repoRoot, [])) {
  const rel = relative(repoRoot, file).split("\\").join("/");
  if (scopePaths.has(rel)) continue; // 范围文件之间的互 import 是实现细节，不是调用方
  let text;
  try {
    text = readFileSync(file, "utf8");
  } catch {
    continue;
  }
  const inThisPackage = rel.startsWith(srcPrefix.replace(/src\/$/, ""));
  for (const [specifier, names] of importSpecifiers(text, rel)) {
    if (specifier === packageSpecifier || specifier.startsWith(`${packageSpecifier}/`)) {
      record(inThisPackage ? bucketDeep : bucketExternal, rel, specifier, names);
      continue;
    }
    if (resolvesIntoScope(rel, specifier)) {
      record(inThisPackage ? bucketDeep : bucketExternal, rel, specifier, names);
    }
  }
}

/** 第 2 段：dynamic-workflow-01 已替换目录（analysis/、compiler/）与 projections 桶指进本包的边。 */
for (const [rel, specifiers] of Array.from(bucketDeep)) {
  if (rel.startsWith(srcPrefix)) bucketInPackage.set(rel, specifiers);
}
for (const key of Array.from(bucketDeep.keys())) {
  if (bucketInPackage.has(key)) bucketDeep.delete(key);
}

function render(bucket, title) {
  const lines = [`## ${title}：${bucket.size} 个文件`, ""];
  for (const [file, specifiers] of [...bucket].sort()) {
    lines.push(`- \`${file}\``);
    for (const [specifier, names] of [...specifiers].sort()) {
      lines.push(`  - \`${specifier}\`: ${names.join(", ")}`);
    }
  }
  return lines;
}

const header = [
  "# dynamic-workflow-02 调用方原始清单（scan-callers.mjs 输出，机器生成）",
  "",
  `扫描口径：全仓源文件（跳过 ${[...SKIP].join("/")}）的 import / re-export / 动态 import 说明符，纯语法扫描；`,
  "范围文件 = `licensing/current-files.json` 里 `apps/cli/packages/dynamic-workflow/src/` 下 analysis/ 与",
  "compiler/ 之外的 40 个文件（见 `tests/scope.mjs`）。与 dep:refs 的符号级 findReferences 互补",
  "（后者在本包 537 项导出的规模下内存溢出，见 `acceptance.md`）。",
  "",
];

const body = [
  ...render(bucketExternal, "包外调用方（`@knorvia/dynamic-workflow` 与 `.../projections` 桶）"),
  "",
  ...render(bucketInPackage, "同包非范围调用方（src/analysis、src/compiler 指进本包范围）"),
  "",
  ...render(bucketDeep, "深层模块路径消费者（本包 test/ 与其它包的相对/字符串路径）"),
];

writeFileSync(join(contractDir, "callers-raw.txt"), `${[...header, ...body].join("\n")}\n`, "utf8");
console.log(
  `scan-callers: external ${bucketExternal.size} / in-package ${bucketInPackage.size} / deep ${bucketDeep.size} -> callers-raw.txt`,
);
