import fs from "node:fs";
import path from "node:path";
import ts from "typescript";

const root = "licensing/evidence/desktop-screenshot-owners-20261003";
const baseline = process.argv.includes("--baseline");
const drafts = process.argv.includes("--drafts");
const owners = ["surface", "activity"];
const files = baseline
  ? owners.map((name) => `/tmp/knorvia-screenshot-baseline/${name}.ts`)
  : drafts
    ? owners.map((name) => `${root}/drafts/${name}-initial.ts`)
    : [
        "packages/desktop/src/main/browserView/browserScreenshotSurfaceCoordinator.ts",
        "packages/desktop/src/main/browserView/browserScreenshotActivityController.ts",
      ];
const ports = {
  "@knorvia/shared": "shared",
  "./browserScreenshotSurfaceContracts.js": "contracts",
  "./browserScreenshotTransientRetry.js": "retry",
  "./browserTransparentWindowBootstrap.js": "bootstrap",
};
const options = {
  strict: true,
  noEmit: true,
  skipLibCheck: true,
  target: ts.ScriptTarget.ES2022,
  module: ts.ModuleKind.NodeNext,
  moduleResolution: ts.ModuleResolutionKind.NodeNext,
  types: ["node"],
};
const host = ts.createCompilerHost(options);
host.resolveModuleNames = (names, containingFile) =>
  names.map((name) => {
    if (ports[name])
      return {
        resolvedFileName: path.resolve(`${root}/ports/${ports[name]}.d.ts`),
        extension: ts.Extension.Dts,
      };
    return ts.resolveModuleName(name, containingFile, options, host).resolvedModule;
  });
const program = ts.createProgram(files, options, host);
const checker = program.getTypeChecker();
const errors = ts.getPreEmitDiagnostics(program).map((d) => ({
  file: d.file?.fileName,
  code: d.code,
  message: ts.flattenDiagnosticMessageText(d.messageText, "\n"),
}));
function shape(type, trail = []) {
  const label = checker.typeToString(type);
  if (
    [
      "AbortSignal",
      "void",
      "undefined",
      "null",
      "string",
      "number",
      "boolean",
      "unknown",
      "any",
      "never",
    ].includes(label)
  )
    return label;
  if (type.isUnion())
    return type.types
      .map((t) => shape(t, trail))
      .sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b)));
  if (type.symbol?.name === "Promise")
    return { promise: checker.getTypeArguments(type).map((t) => shape(t, trail)) };
  if (
    type.flags &
    (ts.TypeFlags.StringLiteral | ts.TypeFlags.NumberLiteral | ts.TypeFlags.BooleanLiteral)
  )
    return label;
  if (trail.includes(type)) return "recursive";
  const next = [...trail, type];
  const calls = type.getCallSignatures().map((signature) => ({
    parameters: signature.getParameters().map((symbol) => ({
      optional: Boolean(symbol.flags & ts.SymbolFlags.Optional),
      type: shape(
        checker.getTypeOfSymbolAtLocation(
          symbol,
          symbol.valueDeclaration ?? symbol.declarations[0],
        ),
        next,
      ),
    })),
    returns: shape(checker.getReturnTypeOfSignature(signature), next),
  }));
  const properties = checker
    .getPropertiesOfType(type)
    .map((symbol) => ({
      name: symbol.name,
      optional: Boolean(symbol.flags & ts.SymbolFlags.Optional),
      readonly: Boolean(
        symbol.declarations?.some((d) =>
          d.modifiers?.some((m) => m.kind === ts.SyntaxKind.ReadonlyKeyword),
        ),
      ),
      type: shape(
        checker.getTypeOfSymbolAtLocation(
          symbol,
          symbol.valueDeclaration ?? symbol.declarations[0],
        ),
        next,
      ),
    }))
    .sort((a, b) => a.name.localeCompare(b.name));
  return { calls, properties };
}
const api = {};
for (const [i, file] of files.entries()) {
  const sf = program.getSourceFile(file);
  const cls = sf.statements.find(
    (n) =>
      ts.isClassDeclaration(n) && n.modifiers?.some((m) => m.kind === ts.SyntaxKind.ExportKeyword),
  );
  api[owners[i]] = {
    export: cls.name.text,
    members: cls.members
      .filter(
        (n) =>
          (ts.isConstructorDeclaration(n) || ts.isMethodDeclaration(n)) &&
          !n.modifiers?.some(
            (m) =>
              m.kind === ts.SyntaxKind.PrivateKeyword || m.kind === ts.SyntaxKind.ProtectedKeyword,
          ),
      )
      .map((n) => ({
        name: ts.isConstructorDeclaration(n) ? "constructor" : n.name.getText(sf),
        parameters: n.parameters.map((p) => ({
          optional: Boolean(p.questionToken || p.initializer),
          type: shape(checker.getTypeAtLocation(p)),
        })),
        returns: ts.isConstructorDeclaration(n)
          ? "instance"
          : shape(checker.getReturnTypeOfSignature(checker.getSignatureFromDeclaration(n))),
      }))
      .sort((a, b) => a.name.localeCompare(b.name)),
  };
}
const apiFile = `${root}/${baseline ? "baseline" : drafts ? "initial" : "candidate"}-public-api.json`;
fs.writeFileSync(apiFile, JSON.stringify(api, null, 2) + "\n", { flag: "wx" });
let matchesBaseline;
if (!baseline)
  matchesBaseline =
    JSON.stringify(api) ===
    JSON.stringify(JSON.parse(fs.readFileSync(`${root}/baseline-public-api.json`, "utf8")));
const consumer =
  "packages/desktop/src/main/browserView/browserScreenshotSurfaceCoordinatorWiring.ts";
const syntax = [...files, consumer].flatMap((file) =>
  (
    ts.transpileModule(fs.readFileSync(file, "utf8"), {
      fileName: file,
      reportDiagnostics: true,
      compilerOptions: options,
    }).diagnostics ?? []
  ).map((d) => ({
    file,
    code: d.code,
    message: ts.flattenDiagnosticMessageText(d.messageText, "\n"),
  })),
);
process.stdout.write(
  JSON.stringify(
    {
      baseline,
      restrictedSemanticErrors: errors,
      bodyFreeInjectedPorts: ports,
      actualNodeTypes: true,
      skipLibCheck: true,
      matchesBaseline,
      syntaxFiles: [...files, consumer],
      syntax,
      fullProductTypesOrNativeRuntime: false,
    },
    null,
    2,
  ) + "\n",
);
process.exitCode = errors.length || syntax.length || matchesBaseline === false ? 1 : 0;
