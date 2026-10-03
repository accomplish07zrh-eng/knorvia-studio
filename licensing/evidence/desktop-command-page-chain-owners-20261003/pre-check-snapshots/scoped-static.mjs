import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import ts from "typescript";

const root = "licensing/evidence/desktop-command-page-chain-owners-20261003";
const baseline = process.argv.includes("--baseline");
const drafts = process.argv.includes("--drafts");
const owners = ["navigation", "retry", "scripts", "paste"];
const files = baseline
  ? owners.map((name) => `/tmp/knorvia-command-chain47-baseline/${name}.ts`)
  : drafts
    ? owners.map((name) => `${root}/drafts/${name}-initial.ts`)
    : [
        "packages/desktop/src/main/browserView/browserCommandState.ts",
        "packages/desktop/src/main/browserView/browserScreenshotTransientRetry.ts",
        "packages/desktop/src/main/browserView/browserCommandScripts.ts",
        "packages/desktop/src/main/browserView/browserVirtualClipboardPageScript.ts",
      ];
const ports = {
  "@knorvia/shared": "shared",
  "./browserCommandTypes.js": "view",
};
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
  if (checker.isArrayType(type))
    return { array: checker.getTypeArguments(type).map((t) => shape(t, trail)) };
  if (type.isUnion())
    return type.types
      .map((t) => shape(t, trail))
      .sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b)));
  if (type.symbol?.name === "Promise")
    return { promise: checker.getTypeArguments(type).map((t) => shape(t, trail)) };
  if (type.flags & ts.TypeFlags.StringLiteral && type.value.length > 512) return { stringLiteralSha256: crypto.createHash("sha256").update(type.value).digest("hex"), bytes: Buffer.byteLength(type.value) };
  if (
    type.flags &
    (ts.TypeFlags.StringLiteral | ts.TypeFlags.NumberLiteral | ts.TypeFlags.BooleanLiteral)
  )
    return label;
  if (trail.includes(type)) return "recursive";
  const next = [...trail, type];
  const constructs = type.getConstructSignatures().map((signature) => ({
    parameters: signature.getParameters().map((symbol) => ({ optional: Boolean(symbol.flags & ts.SymbolFlags.Optional) || Boolean(symbol.valueDeclaration?.questionToken || symbol.valueDeclaration?.initializer), type: shape(checker.getTypeOfSymbolAtLocation(symbol, symbol.valueDeclaration ?? symbol.declarations[0]), next) })),
    returns: shape(checker.getReturnTypeOfSignature(signature), next),
  }));
  const calls = type.getCallSignatures().map((signature) => ({
    parameters: signature.getParameters().map((symbol) => ({
      optional: Boolean(symbol.flags & ts.SymbolFlags.Optional) || Boolean(symbol.valueDeclaration?.questionToken || symbol.valueDeclaration?.initializer),
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
    .filter((symbol) => !symbol.declarations?.some((d) => d.modifiers?.some((m) => m.kind === ts.SyntaxKind.PrivateKeyword || m.kind === ts.SyntaxKind.ProtectedKeyword)))
    .map((symbol) => ({
      name: symbol.name,
      optional: Boolean(symbol.flags & ts.SymbolFlags.Optional) || Boolean(symbol.valueDeclaration?.questionToken || symbol.valueDeclaration?.initializer),
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
  return { calls, constructs, properties };
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
const compilerRawApi = structuredClone(api);
for (const owner of owners) for (const row of api[owner]) {
  if (row.export === "VIRTUAL_PASTE_PAGE_FUNCTION" || row.export === "VIEWPORT_SCRIPT") row.shape = "string";
}
const apiFile = `${root}/${baseline ? "baseline" : drafts ? "initial" : "candidate"}-public-api.json`;
fs.writeFileSync(apiFile, JSON.stringify({ compilerRaw: compilerRawApi, consumerStringContract: api }, null, 2) + "\n", { flag: "wx" });
let matchesBaseline, compilerRawMatchesBaseline;
if (!baseline) {
  const previous = JSON.parse(fs.readFileSync(`${root}/baseline-public-api.json`, "utf8"));
  matchesBaseline = JSON.stringify(api) === JSON.stringify(previous.consumerStringContract);
  compilerRawMatchesBaseline = JSON.stringify(compilerRawApi) === JSON.stringify(previous.compilerRaw);
}
const consumers = [
 "packages/desktop/src/main/browserView/browserCommandPageHandlers.ts",
 "packages/desktop/src/main/browserView/browserCommandInput.ts",
 "packages/desktop/src/main/browserView/browserCommandInteractionHandlers.ts",
 "packages/desktop/src/main/browserView/browserVirtualClipboard.ts",
 "packages/desktop/src/main/browserView/browserScreenshotActivityController.ts",
];
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
      compilerRawMatchesBaseline,
      sourceLiteralProjection: "Only opaque generated source-string exports project to consumer string contract; raw comparison retained. Fixed VIEWPORT value separately checked.",
      syntaxFiles: [...files, ...consumers],
      syntax,
      fullProductTypesOrNativeRuntime: false,
    },
    null,
    2,
  ) + "\n",
);
process.exitCode = errors.length || syntax.length || matchesBaseline === false ? 1 : 0;
