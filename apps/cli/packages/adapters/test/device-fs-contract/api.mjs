// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Knorvia Studio contributors
import assert from "node:assert/strict";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { readFile } from "node:fs/promises";
import ts from "typescript";

const fsRoot = fileURLToPath(new URL("../../src/fs/", import.meta.url));
const names = ["text-metadata", "text-range-reader"];
export function describeTextApi(root, mode) {
  const files = names.map((name) => join(root, "fs", name + (mode === "source" ? ".ts" : ".d.ts")));
  const options = {
    noEmit: true,
    skipLibCheck: true,
    strict: true,
    target: ts.ScriptTarget.ES2023,
    module: ts.ModuleKind.NodeNext,
    moduleResolution: ts.ModuleResolutionKind.NodeNext,
  };
  const host = ts.createCompilerHost(options);
  host.resolveModuleNames = (imports, containing) =>
    imports.map(
      (name) =>
        ts.resolveModuleName(name, containing, options, host).resolvedModule ??
        ts.resolveModuleName(name, join(fsRoot, "text-metadata.ts"), options, host).resolvedModule,
    );
  const program = ts.createProgram(files, options, host);
  assert.deepEqual(
    ts
      .getPreEmitDiagnostics(program)
      .map((d) => ts.flattenDiagnosticMessageText(d.messageText, " ")),
    [],
  );
  const checker = program.getTypeChecker();
  const flags = ts.TypeFormatFlags.NoTruncation;
  return Object.fromEntries(
    files.map((file, index) => {
      const source = program.getSourceFile(file);
      const symbols = checker.getExportsOfModule(checker.getSymbolAtLocation(source));
      return [
        names[index],
        Object.fromEntries(
          symbols
            .map((symbol) => {
              const declaration = symbol.valueDeclaration;
              const typed = checker.getTypeOfSymbolAtLocation(symbol, declaration);
              const signatures = typed.getCallSignatures().map((signature) => {
                const returned = signature.getReturnType();
                return {
                  signature: checker.signatureToString(signature, declaration, flags),
                  returns: Object.fromEntries(
                    (["DecodedTextBuffer", "StreamingTextDecoder"].includes(returned.symbol?.name)
                      ? checker.getPropertiesOfType(returned)
                      : []
                    )
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
                  ),
                };
              });
              return [symbol.name, signatures];
            })
            .sort(([a], [b]) => a.localeCompare(b)),
        ),
      ];
    }),
  );
}
export async function checkTextApi(root, mode) {
  assert.deepEqual(
    describeTextApi(root, mode),
    JSON.parse(await readFile(new URL("./api-text-shape.json", import.meta.url), "utf8")),
  );
}
