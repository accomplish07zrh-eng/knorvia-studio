import fs from "node:fs";
import ts from "typescript";

const root = "licensing/evidence/desktop-tab-eviction-owner-20261003";
const baseline = process.argv.includes("--baseline");
const drafts = process.argv.includes("--drafts");
const owners = ["residency"];
const files = baseline
  ? owners.map((name) => `/tmp/knorvia-tab-eviction-baseline/${name}.ts`)
  : drafts
    ? owners.map((name) => `${root}/drafts/${name}-initial.ts`)
    : ["packages/desktop/src/main/browserView/browserTabResidencyPolicy.ts"];
const ports = {};
const options = {
  strict: true,
  noEmit: true,
  skipLibCheck: true,
  target: ts.ScriptTarget.ES2022,
  module: ts.ModuleKind.ESNext,
  moduleResolution: ts.ModuleResolutionKind.Bundler,
  types: ["node"],
};
const host = ts.createCompilerHost(options);
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
  if (checker.isArrayType(type))
    return { array: checker.getTypeArguments(type).map((t) => shape(t, trail)) };
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
  api[owners[i]] = checker
    .getExportsOfModule(checker.getSymbolAtLocation(sf))
    .map((symbol) => ({
      export: symbol.name,
      kind:
        symbol.flags & ts.SymbolFlags.TypeAlias
          ? "type"
          : symbol.flags & ts.SymbolFlags.Interface
            ? "interface"
            : "value",
      shape: shape(
        symbol.flags & (ts.SymbolFlags.TypeAlias | ts.SymbolFlags.Interface)
          ? checker.getDeclaredTypeOfSymbol(symbol)
          : checker.getTypeOfSymbolAtLocation(
              symbol,
              symbol.valueDeclaration ?? symbol.declarations[0],
            ),
      ),
    }))
    .sort((a, b) => a.export.localeCompare(b.export));
}
const apiFile = `${root}/${baseline ? "baseline" : drafts ? "initial" : "candidate"}-public-api.json`;
fs.writeFileSync(apiFile, JSON.stringify(api, null, 2) + "\n", { flag: "wx" });
let matchesBaseline;
if (!baseline)
  matchesBaseline =
    JSON.stringify(api) ===
    JSON.stringify(JSON.parse(fs.readFileSync(`${root}/baseline-public-api.json`, "utf8")));
const consumers = ["packages/desktop/src/main/browserView/browserTabResidencyCoordinator.ts"];
const syntax = [...files, ...consumers].flatMap((file) =>
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
      syntaxFiles: [...files, ...consumers],
      syntax,
      fullProductTypesOrNativeRuntime: false,
    },
    null,
    2,
  ) + "\n",
);
process.exitCode = errors.length || syntax.length || matchesBaseline === false ? 1 : 0;
