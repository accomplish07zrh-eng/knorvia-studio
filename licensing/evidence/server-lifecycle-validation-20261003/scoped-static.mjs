import fs from "node:fs";
import path from "node:path";
import ts from "typescript";

const files = JSON.parse(
  fs.readFileSync("licensing/evidence/server-lifecycle-20261002/source-hashes.json", "utf8"),
).files.map(({ path }) => path);
const syntax = [...files, "packages/server/src/index.ts"].flatMap((file) => {
  const result = ts.transpileModule(fs.readFileSync(file, "utf8"), {
    fileName: file,
    reportDiagnostics: true,
    compilerOptions: { module: ts.ModuleKind.NodeNext, target: ts.ScriptTarget.ES2022 },
  });
  return (result.diagnostics ?? []).map((d) => ({
    file,
    code: d.code,
    message: ts.flattenDiagnosticMessageText(d.messageText, "\n"),
  }));
});

// Shared schema inference is replaced only at this type boundary; schema behavior
// and the full product dependency closure are outside this restricted check.
const contractPath = path.resolve("/tmp/knorvia-lifecycle-shared-contract.d.ts");
const contract =
  "export interface ServerRemoteHostCapability { capability: string; expiresAt: number; }\n";
const options = {
  noEmit: true,
  strict: true,
  skipLibCheck: true,
  types: ["node"],
  target: ts.ScriptTarget.ES2022,
  module: ts.ModuleKind.NodeNext,
  moduleResolution: ts.ModuleResolutionKind.NodeNext,
};
const host = ts.createCompilerHost(options);
const originalRead = host.readFile.bind(host);
const originalExists = host.fileExists.bind(host);
host.readFile = (file) => (file === contractPath ? contract : originalRead(file));
host.fileExists = (file) => file === contractPath || originalExists(file);
host.resolveModuleNames = (names, containingFile) =>
  names.map((name) => {
    if (name === "@knorvia/shared")
      return { resolvedFileName: contractPath, extension: ts.Extension.Dts };
    return ts.resolveModuleName(name, containingFile, options, host).resolvedModule;
  });
const program = ts.createProgram(
  ["packages/server/src/stdio-lifecycle.ts", "packages/server/src/hostCapability.ts"],
  options,
  host,
);
const semantic = ts.getPreEmitDiagnostics(program).map((d) => ({
  file: d.file?.fileName,
  code: d.code,
  message: ts.flattenDiagnosticMessageText(d.messageText, "\n"),
}));
process.stdout.write(
  JSON.stringify(
    {
      syntaxFiles: [...files, "packages/server/src/index.ts"],
      syntax,
      restrictedSemanticOwners: ["stdio-lifecycle.ts", "hostCapability.ts"],
      injectedTypeContract: contract,
      actualNodeTypes: true,
      skipLibCheck: true,
      semantic,
      fullProductSemanticCheck: false,
    },
    null,
    2,
  ) + "\n",
);
process.exitCode = syntax.length || semantic.length ? 1 : 0;
