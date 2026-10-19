// SPDX-License-Identifier: Apache-2.0
// 从继承源码的导出声明生成最小桩（stubs/modules/）。
//
// 桩只保留 interface.md 列出的导出名：函数/构造器一律抛
// Error("not implemented: apps-cli-packages-02")，常量给 never 占位，类型声明保留同名。
// 重新生成：node specs/contracts/apps-cli-packages-02/stubs/build-stubs.mjs
import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import ts from "typescript";

const here = dirname(fileURLToPath(import.meta.url));
const contractDir = resolve(here, "..");
const repoRoot = resolve(contractDir, "../../..");
const NOT_IMPLEMENTED = "not implemented: apps-cli-packages-02";

const MODULES = [
  "shared-types/src/index.ts",
  "i18n/src/index.ts",
  "i18n/src/locale.ts",
  "i18n/src/types.ts",
  "i18n/src/locales/en-US.ts",
  "i18n/src/locales/zh-CN.ts",
  "dynamic-workflow-runtime/src/index.ts",
  "dynamic-workflow-runtime/src/protocol.ts",
  "dynamic-workflow-runtime/src/child-entry-file.ts",
  "dynamic-workflow-runtime/src/child-source.ts",
  "dynamic-workflow-runtime/src/harness.ts",
  "telemetry/src/index.ts",
  "telemetry/src/agent-metrics.ts",
  "telemetry/src/agent-trace-runtime.ts",
  "telemetry/src/agent-trace-support.ts",
  "telemetry/src/bootstrap.ts",
  "telemetry/src/compatibility-adapters.ts",
  "telemetry/src/error-sanitizer.ts",
  "telemetry/src/model-api-recorder.ts",
  "telemetry/src/otlp-exporter.ts",
  "telemetry/src/provider-endpoint.ts",
  "node-repl-host/src/tool-contract.ts",
];

const MODULE_ROOT = join(here, "modules");
rmSync(MODULE_ROOT, { recursive: true, force: true });

function exported(node) {
  const modifiers = ts.canHaveModifiers(node) ? (ts.getModifiers(node) ?? []) : [];
  return modifiers.some((modifier) => modifier.kind === ts.SyntaxKind.ExportKeyword);
}

function isAsync(node) {
  const modifiers = ts.canHaveModifiers(node) ? (ts.getModifiers(node) ?? []) : [];
  return modifiers.some((modifier) => modifier.kind === ts.SyntaxKind.AsyncKeyword);
}

function throwLine(indent) {
  return `${indent}throw new Error(${JSON.stringify(NOT_IMPLEMENTED)});`;
}

function stubFor(modulePath) {
  const source = readFileSync(join(repoRoot, "apps/cli/packages", modulePath), "utf8");
  const file = ts.createSourceFile(modulePath, source, ts.ScriptTarget.Latest, true);
  const lines = [
    "// SPDX-License-Identifier: Apache-2.0",
    `// 桩：apps-cli-packages-02（生成器 build-stubs.mjs，导出面取自 interface.md）`,
  ];
  const importedFrom = new Map();
  for (const statement of file.statements) {
    if (!ts.isImportDeclaration(statement)) continue;
    const from = statement.moduleSpecifier.getText(file);
    const bindings = statement.importClause?.namedBindings;
    if (bindings && ts.isNamedImports(bindings)) {
      for (const element of bindings.elements) importedFrom.set(element.name.text, from);
    }
  }
  for (const statement of file.statements) {
    if (ts.isImportDeclaration(statement)) continue;
    if (ts.isExportDeclaration(statement)) {
      if (statement.moduleSpecifier) {
        lines.push(statement.getText(file));
        continue;
      }
      const elements =
        statement.exportClause && ts.isNamedExports(statement.exportClause)
          ? statement.exportClause.elements
          : [];
      const sources = new Set(elements.map((element) => importedFrom.get(element.name.text)));
      if (sources.size === 1 && !sources.has(undefined)) {
        lines.push(`export * from ${[...sources][0]};`);
      } else {
        for (const element of elements) {
          if (element.isTypeOnly) continue;
          lines.push(`export const ${element.name.text}: never = undefined as never;`);
        }
      }
      continue;
    }
    if (!exported(statement)) continue;
    if (ts.isFunctionDeclaration(statement) && statement.name) {
      const prefix = isAsync(statement) ? "export async function" : "export function";
      lines.push(`${prefix} ${statement.name.text}(..._args: unknown[]) {`);
      lines.push(throwLine("  "));
      lines.push("}");
      continue;
    }
    if (ts.isClassDeclaration(statement) && statement.name) {
      lines.push(`export class ${statement.name.text} {`);
      lines.push("  constructor(..._args: unknown[]) {");
      lines.push(throwLine("    "));
      lines.push("  }");
      lines.push("}");
      continue;
    }
    if (ts.isVariableStatement(statement)) {
      const keyword =
        (statement.declarationList.flags & ts.NodeFlags.Const) !== 0 ? "const" : "let";
      for (const declaration of statement.declarationList.declarations) {
        lines.push(
          `export ${keyword} ${declaration.name.getText(file)}: never = undefined as never;`,
        );
      }
      continue;
    }
    if (ts.isInterfaceDeclaration(statement) && statement.name) {
      lines.push(`export type ${statement.name.text} = never;`);
      continue;
    }
    if (ts.isTypeAliasDeclaration(statement) && statement.name) {
      lines.push(`export type ${statement.name.text} = never;`);
      continue;
    }
    if (ts.isEnumDeclaration(statement) && statement.name) {
      lines.push(`export const ${statement.name.text}: never = undefined as never;`);
      lines.push(`export type ${statement.name.text} = never;`);
    }
  }
  return `${lines.join("\n")}\n`;
}

let count = 0;
for (const modulePath of MODULES) {
  const target = join(MODULE_ROOT, modulePath);
  mkdirSync(dirname(target), { recursive: true });
  writeFileSync(target, stubFor(modulePath), "utf8");
  count += 1;
}
process.stdout.write(`build-stubs: ${count} 个桩已写入 ${relative(repoRoot, MODULE_ROOT)}\n`);
