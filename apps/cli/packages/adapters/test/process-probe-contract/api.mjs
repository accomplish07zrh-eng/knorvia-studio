// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Knorvia Studio contributors
import assert from "node:assert/strict";
import { dirname, join, resolve } from "node:path";
import ts from "typescript";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
const names = [
  "process-probe",
  "process-probe-shared",
  "process-probe-linux",
  "process-probe-darwin",
  "process-probe-windows",
];
const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../../../../../..");

/** 比较公开类型的语义投影，不读取旧实现正文、不因声明换行或注释误报。 */
export function describeApi(root, mode) {
  const extension = mode === "source" ? ".ts" : ".d.ts";
  const files = names.map((name) => join(root, name + extension));
  const program = ts.createProgram(files, {
    noEmit: true,
    skipLibCheck: true,
    strict: true,
    target: ts.ScriptTarget.ES2022,
    module: ts.ModuleKind.NodeNext,
    moduleResolution: ts.ModuleResolutionKind.NodeNext,
    types: ["node"],
    typeRoots: [join(repoRoot, "node_modules/@types")],
  });
  const diagnostics = ts.getPreEmitDiagnostics(program);
  assert.deepEqual(
    diagnostics.map((d) => ts.flattenDiagnosticMessageText(d.messageText, " ")),
    [],
  );
  const checker = program.getTypeChecker();
  const output = {};
  for (const [index, file] of files.entries()) {
    const source = program.getSourceFile(file);
    const module = checker.getSymbolAtLocation(source);
    output[names[index]] = Object.fromEntries(
      checker
        .getExportsOfModule(module)
        .map((symbol) => {
          const resolved =
            symbol.flags & ts.SymbolFlags.Alias ? checker.getAliasedSymbol(symbol) : symbol;
          const declaration = resolved.valueDeclaration ?? resolved.declarations[0];
          const typed =
            resolved.flags & (ts.SymbolFlags.Interface | ts.SymbolFlags.TypeAlias)
              ? checker.getDeclaredTypeOfSymbol(resolved)
              : checker.getTypeOfSymbolAtLocation(resolved, declaration);
          const flags = ts.TypeFormatFlags.NoTruncation;
          const projected = { type: checker.typeToString(typed, declaration, flags) };
          if (resolved.flags & ts.SymbolFlags.Interface)
            projected.members = Object.fromEntries(
              checker
                .getPropertiesOfType(typed)
                .map((member) => [
                  member.name,
                  {
                    optional: !!(member.flags & ts.SymbolFlags.Optional),
                    type: checker.typeToString(
                      checker.getTypeOfSymbolAtLocation(
                        member,
                        member.valueDeclaration ?? declaration,
                      ),
                      declaration,
                      flags,
                    ),
                  },
                ])
                .sort(([a], [b]) => a.localeCompare(b)),
            );
          return [symbol.name, projected];
        })
        .sort(([a], [b]) => a.localeCompare(b)),
    );
  }
  return output;
}

export async function checkApi(root, mode) {
  const frozen = JSON.parse(await readFile(new URL("./api-shape.json", import.meta.url), "utf8"));
  assert.deepEqual(
    describeApi(root, mode),
    frozen,
    "Process probe public value/type exports changed",
  );
}
