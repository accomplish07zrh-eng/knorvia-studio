// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Knorvia Studio contributors

import { join } from "node:path";
import { fileURLToPath } from "node:url";
import ts from "typescript";

export function checkLoggingApi(mode, adapterRoot) {
  const target = join(
    adapterRoot,
    mode === "source" ? "src" : "dist",
    "logging",
    mode === "source" ? "index.ts" : "index.d.ts",
  );
  const program = ts.createProgram({
    rootNames: [fileURLToPath(new URL("./api-probe.ts", import.meta.url))],
    options: {
      strict: true,
      noEmit: true,
      skipLibCheck: true,
      target: ts.ScriptTarget.ESNext,
      module: ts.ModuleKind.NodeNext,
      moduleResolution: ts.ModuleResolutionKind.NodeNext,
      types: ["node"],
      paths: { "logging-under-test": [target] },
    },
  });
  const diagnostics = ts.getPreEmitDiagnostics(program);
  if (diagnostics.length)
    throw new Error(
      ts.formatDiagnosticsWithColorAndContext(diagnostics, {
        getCurrentDirectory: () => adapterRoot,
        getCanonicalFileName: (name) => name,
        getNewLine: () => "\n",
      }),
    );
}
