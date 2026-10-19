// SPDX-License-Identifier: Apache-2.0
// services-01 导出签名抽取：从范围文件 AST 取顶层导出，供 interface.md 生成与 surface 测试共用。
// 只做语法抽取，不起 checker：签名文本逐字取自源码，行为由 behavior.md 与黑盒测试判定。
import { readFileSync } from "node:fs";
import { join } from "node:path";
import ts from "typescript";

import { srcPrefix } from "./scope.mjs";

function signatureText(node, source) {
  const head = node.getText(source);
  if (ts.isFunctionDeclaration(node) && node.body !== undefined) {
    return head.slice(0, node.body.getStart(source) - node.getStart(source)).trimEnd();
  }
  if (ts.isClassDeclaration(node)) {
    const first = node.members[0];
    if (first !== undefined) {
      return `${head.slice(0, first.getStart(source) - node.getStart(source)).trimEnd()}{ … }`;
    }
    return head.replace(/\{[\s\S]*\}$/u, "{ … }");
  }
  return head;
}

function initializerText(decl, source) {
  const init = decl.initializer?.getText(source) ?? "";
  return init.length > 120 ? "…" : init;
}

/** 抽取一个文件的全部顶层导出，按源码顺序。`modulePath` 相对 `packages/services/src`。 */
export function extractExports(repoRoot, modulePath) {
  const filePath = join(repoRoot, srcPrefix, modulePath);
  const text = readFileSync(filePath, "utf8");
  const source = ts.createSourceFile(modulePath, text, ts.ScriptTarget.ES2022, true);
  const rows = [];
  for (const statement of source.statements) {
    if (ts.isExportDeclaration(statement)) {
      const from = statement.moduleSpecifier?.getText(source) ?? "";
      if (statement.exportClause === undefined) {
        rows.push({
          kind: "star-reexport",
          name: "*",
          runtime: !statement.isTypeOnly,
          signature: `export ${statement.isTypeOnly ? "type " : ""}* from ${from}`,
        });
        continue;
      }
      if (ts.isNamespaceExport(statement.exportClause)) {
        rows.push({
          kind: "namespace-reexport",
          name: statement.exportClause.name.text,
          runtime: true,
          signature: statement.getText(source).split("\n")[0],
        });
        continue;
      }
      for (const spec of statement.exportClause.elements) {
        const alias =
          spec.propertyName !== undefined && spec.propertyName.text !== spec.name.text
            ? `${spec.propertyName.text} as ${spec.name.text}`
            : spec.name.text;
        rows.push({
          kind: statement.isTypeOnly || spec.isTypeOnly ? "type-reexport" : "reexport",
          name: spec.name.text,
          runtime: !(statement.isTypeOnly || spec.isTypeOnly),
          signature: `export ${statement.isTypeOnly || spec.isTypeOnly ? "type " : ""}{ ${alias} } from ${from}`,
        });
      }
      continue;
    }
    const mods = ts.canHaveModifiers(statement) ? (ts.getModifiers(statement) ?? []) : [];
    if (!mods.some((modifier) => modifier.kind === ts.SyntaxKind.ExportKeyword)) continue;
    if (ts.isFunctionDeclaration(statement) && statement.name !== undefined) {
      rows.push({
        kind: "function",
        name: statement.name.text,
        runtime: true,
        signature: signatureText(statement, source),
      });
    } else if (ts.isClassDeclaration(statement) && statement.name !== undefined) {
      rows.push({
        kind: "class",
        name: statement.name.text,
        runtime: true,
        signature: signatureText(statement, source),
      });
    } else if (ts.isInterfaceDeclaration(statement)) {
      rows.push({
        kind: "interface",
        name: statement.name.text,
        runtime: false,
        signature: statement.getText(source),
      });
    } else if (ts.isTypeAliasDeclaration(statement)) {
      rows.push({
        kind: "type",
        name: statement.name.text,
        runtime: false,
        signature: statement.getText(source),
      });
    } else if (ts.isEnumDeclaration(statement)) {
      rows.push({
        kind: "enum",
        name: statement.name.text,
        runtime: true,
        signature: statement.getText(source),
      });
    } else if (ts.isVariableStatement(statement)) {
      const head = statement.getText(source).split("\n")[0].split("=")[0].trim();
      for (const decl of statement.declarationList.declarations) {
        if (!ts.isIdentifier(decl.name)) {
          rows.push({
            kind: "const",
            name: "(binding pattern)",
            runtime: true,
            signature: head,
          });
          continue;
        }
        rows.push({
          kind: "const",
          name: decl.name.text,
          runtime: true,
          signature: `${head} = ${initializerText(decl, source)}`,
        });
      }
    }
  }
  return rows;
}

/** interface.md 声明块里出现的导出名（声明 + 具名再导出；`*` 单独判定）。 */
export function declaredNames(blockText) {
  const names = new Set();
  for (const match of blockText.matchAll(
    /^export\s+(?:type\s+)?(?:declare\s+)?(?:abstract\s+)?(?:async\s+)?(?:class|interface|function|const|let|var|type|enum|namespace)\s+([A-Za-z0-9_$]+)/gmu,
  )) {
    names.add(match[1]);
  }
  for (const match of blockText.matchAll(/^export\s+(?:type\s+)?\{([^}]*)\}\s+from/gmu)) {
    if (match[1] === "*") continue;
    for (const spec of match[1].split(",")) {
      const name = spec
        .trim()
        .split(/\s+as\s+/u)
        .pop();
      if (name) names.add(name);
    }
  }
  return names;
}

/** 一个范围文件的运行时导出名（不含星号再导出）。 */
export function runtimeExportNames(repoRoot, modulePath) {
  return extractExports(repoRoot, modulePath)
    .filter((row) => row.runtime)
    .map((row) => row.name);
}
