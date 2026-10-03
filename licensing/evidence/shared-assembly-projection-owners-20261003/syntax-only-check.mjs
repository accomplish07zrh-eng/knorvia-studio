import { readFileSync } from "node:fs";
import ts from "/workspace/knorvia-studio/node_modules/typescript/lib/typescript.js";
let errors = 0;
for (const file of process.argv.slice(2)) {
  const result = ts.transpileModule(readFileSync(file, "utf8"), {
    fileName: file,
    reportDiagnostics: true,
    compilerOptions: { target: ts.ScriptTarget.ES2024, module: ts.ModuleKind.NodeNext },
  });
  const diagnostics = result.diagnostics ?? [];
  console.log(`${file}: ${diagnostics.length} syntax-only diagnostics`);
  for (const diagnostic of diagnostics) {
    console.log(ts.flattenDiagnosticMessageText(diagnostic.messageText, "\n"));
    errors++;
  }
}
process.exitCode = errors ? 1 : 0;
