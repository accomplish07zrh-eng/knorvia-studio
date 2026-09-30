// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Knorvia Studio contributors
import assert from "node:assert/strict";
import { join } from "node:path";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import ts from "typescript";
const actualRoot = fileURLToPath(new URL("../../src/", import.meta.url));
const names = ["device/cli-device-mid", "fs/index"];
export function describeRemainingApi(root, mode) {
  const files = names.map((name) => join(root, name + (mode === "source" ? ".ts" : ".d.ts")));
  const options = {
    noEmit: true,
    strict: true,
    skipLibCheck: true,
    target: ts.ScriptTarget.ES2023,
    module: ts.ModuleKind.NodeNext,
    moduleResolution: ts.ModuleResolutionKind.NodeNext,
  };
  const host = ts.createCompilerHost(options);
  host.resolveModuleNames = (imports, containing) =>
    imports.map(
      (name) =>
        ts.resolveModuleName(name, containing, options, host).resolvedModule ??
        ts.resolveModuleName(name, join(actualRoot, "fs/index.ts"), options, host).resolvedModule,
    );
  const program = ts.createProgram(files, options, host);
  assert.deepEqual(
    ts
      .getPreEmitDiagnostics(program)
      .map((d) => ts.flattenDiagnosticMessageText(d.messageText, " ")),
    [],
  );
  const checker = program.getTypeChecker(),
    flags = ts.TypeFormatFlags.NoTruncation;
  function describe(type, location) {
    return Object.fromEntries(
      checker
        .getPropertiesOfType(type)
        .filter(
          (s) =>
            !s.declarations?.some((d) => ts.getCombinedModifierFlags(d) & ts.ModifierFlags.Private),
        )
        .map((s) => [
          s.name,
          {
            optional: !!(s.flags & ts.SymbolFlags.Optional),
            type: checker.typeToString(
              checker.getTypeOfSymbolAtLocation(s, s.valueDeclaration ?? location),
              location,
              flags,
            ),
          },
        ])
        .sort(([a], [b]) => a.localeCompare(b)),
    );
  }
  return Object.fromEntries(
    files.map((file, i) => {
      const source = program.getSourceFile(file),
        symbols = checker.getExportsOfModule(checker.getSymbolAtLocation(source));
      return [
        names[i],
        Object.fromEntries(
          symbols
            .map((s) => {
              const d = s.valueDeclaration ?? s.declarations[0];
              const type =
                s.flags & ts.SymbolFlags.Interface
                  ? checker.getDeclaredTypeOfSymbol(s)
                  : checker.getTypeOfSymbolAtLocation(s, d);
              const value = {
                type: checker.typeToString(type, d, flags),
                calls: type
                  .getCallSignatures()
                  .map((sig) => checker.signatureToString(sig, d, flags)),
              };
              if (s.flags & ts.SymbolFlags.Class) {
                value.constructs = type
                  .getConstructSignatures()
                  .map((sig) => checker.signatureToString(sig, d, flags));
                value.members = describe(checker.getDeclaredTypeOfSymbol(s), d);
              }
              if (s.flags & ts.SymbolFlags.Interface) value.members = describe(type, d);
              return [s.name, value];
            })
            .sort(([a], [b]) => a.localeCompare(b)),
        ),
      ];
    }),
  );
}
export async function checkRemainingApi(root, mode) {
  assert.deepEqual(
    describeRemainingApi(root, mode),
    JSON.parse(await readFile(new URL("./api-remaining-shape.json", import.meta.url), "utf8")),
  );
}
