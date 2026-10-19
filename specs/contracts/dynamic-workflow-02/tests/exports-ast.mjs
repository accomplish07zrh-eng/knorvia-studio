// SPDX-License-Identifier: Apache-2.0
// dynamic-workflow-02 导出签名抽取：从范围文件的 TypeScript AST 里逐条取出**顶层导出**，
// 供 tests/gen-interface.mjs 写 interface.md、stubs/build-stubs.mjs 写最小桩。
// 两个消费方共用同一份抽取结果，所以「interface 面」与「桩面」不可能分叉（第二份真相）。
//
// 只做语法抽取，不起 checker：签名文本逐字取自源码，重写实现要能在同样的模块路径上
// 提供同样的名字与形状，具体行为由 behavior.md 的条目与契约测试判定。
import { readFileSync } from "node:fs";
import { join } from "node:path";
import ts from "typescript";

import { srcPrefix } from "./scope.mjs";

/** 一个顶层导出的抽取结果。 */
const KIND_LABEL = {
  function: "function",
  class: "class",
  const: "const",
  interface: "interface",
  type: "type",
  enum: "enum",
  reexport: "re-export",
  typeReexport: "type-re-export",
};

/** 取声明体（函数体 / 类体）起始位置之前的文本，即签名部分。 */
function signatureText(node, source) {
  const head = node.getText(source);
  if (ts.isFunctionDeclaration(node) && node.body !== undefined) {
    return head.slice(0, node.body.getStart(source) - node.getStart(source)).trimEnd();
  }
  if (ts.isClassDeclaration(node)) {
    const first = node.members[0];
    if (first !== undefined)
      return head.slice(0, first.getStart(source) - node.getStart(source)).trimEnd() + "{ … }";
    return head.replace(/\{[\s\S]*\}$/, "{ … }");
  }
  return head;
}

/** 抽取一个文件的全部顶层导出，按源码顺序。 */
export function extractExports(repoRoot, modulePath) {
  const filePath = join(repoRoot, srcPrefix, modulePath);
  const text = readFileSync(filePath, "utf8");
  const source = ts.createSourceFile(modulePath, text, ts.ScriptTarget.ES2022, true);
  const rows = [];
  for (const statement of source.statements) {
    // `ts.canHaveModifiers` 对 import/export 声明返回 false（它们的 `export` 词不是 Modifier），
    // 所以再导出必须**先**判类型，否则四个入口桶会被抽成 0 项导出。
    if (
      ts.isExportDeclaration(statement) &&
      statement.exportClause !== undefined &&
      ts.isNamedExports(statement.exportClause)
    ) {
      const from = statement.moduleSpecifier?.getText(source) ?? "";
      const typeOnly = statement.isTypeOnly;
      for (const spec of statement.exportClause.elements) {
        const alias =
          spec.propertyName !== undefined &&
          ts.isIdentifier(spec.propertyName) &&
          spec.propertyName.text !== spec.name.text
            ? `${spec.propertyName.text} as ${spec.name.text}`
            : spec.name.text;
        rows.push({
          kind: typeOnly ? KIND_LABEL.typeReexport : KIND_LABEL.reexport,
          name: spec.name.text,
          runtime: !typeOnly,
          source: from.slice(1, -1),
          signature: `export ${typeOnly ? "type " : ""}{ ${alias} } from ${from}`,
        });
      }
      continue;
    }
    const mods = ts.canHaveModifiers(statement) ? (ts.getModifiers(statement) ?? []) : [];
    if (!mods.some((m) => m.kind === ts.SyntaxKind.ExportKeyword)) continue;
    if (ts.isFunctionDeclaration(statement) && statement.name !== undefined) {
      rows.push({
        kind: KIND_LABEL.function,
        name: statement.name.text,
        runtime: true,
        signature: signatureText(statement, source),
      });
    } else if (ts.isClassDeclaration(statement) && statement.name !== undefined) {
      rows.push({
        kind: KIND_LABEL.class,
        name: statement.name.text,
        runtime: true,
        signature: signatureText(statement, source),
      });
    } else if (ts.isInterfaceDeclaration(statement)) {
      rows.push({
        kind: KIND_LABEL.interface,
        name: statement.name.text,
        runtime: false,
        signature: statement.getText(source),
      });
    } else if (ts.isTypeAliasDeclaration(statement)) {
      rows.push({
        kind: KIND_LABEL.type,
        name: statement.name.text,
        runtime: false,
        signature: statement.getText(source),
      });
    } else if (ts.isEnumDeclaration(statement)) {
      rows.push({
        kind: KIND_LABEL.enum,
        name: statement.name.text,
        runtime: true,
        signature: statement.getText(source),
      });
    } else if (ts.isVariableStatement(statement)) {
      for (const decl of statement.declarationList.declarations) {
        if (!ts.isIdentifier(decl.name)) {
          rows.push({
            kind: KIND_LABEL.const,
            name: "(binding pattern)",
            runtime: true,
            signature: statement.getText(source).split("\n")[0],
          });
          continue;
        }
        const init = decl.initializer?.getText(source) ?? "";
        const head = statement.getText(source).split("\n")[0].split("=")[0].trim();
        rows.push({
          kind: KIND_LABEL.const,
          name: decl.name.text,
          runtime: true,
          signature: `${head} = ${init.length > 120 ? "…" : init}`,
        });
      }
    }
  }
  return rows;
}

/** 一个范围文件的运行时导出名（桩与 surface 测试都用它）。 */
export function runtimeExportNames(repoRoot, modulePath) {
  return extractExports(repoRoot, modulePath)
    .filter((row) => row.runtime)
    .map((row) => row.name);
}
