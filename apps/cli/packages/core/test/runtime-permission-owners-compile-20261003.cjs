const fs = require("node:fs");
const path = require("node:path");
const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const repo = path.resolve(__dirname, "../../../../..");
const core = path.resolve(__dirname, "..");
const ts = require(path.join(repo, "node_modules/typescript"));
const hash = (bytes) => crypto.createHash("sha256").update(bytes).digest("hex");
const manifestBytes = fs.readFileSync(
  path.join(repo, "docs/evidence/knorvia-runtime-permission-current-20261003.json"),
);
assert.equal(
  hash(manifestBytes),
  "03dcdc43775b83950afaadcfbf75776f9e5df6ecb392859f31d9f45bd778c1e8",
);
const manifest = JSON.parse(manifestBytes);
assert.equal(ts.version, manifest.typescript);
const historicalBytes = fs.readFileSync(
  path.join(__dirname, "runtime-permission-owners-baseline-20261003.json"),
);
assert.equal(
  hash(historicalBytes),
  "23462209a7052ebdf464c7446c0bbfd69636943771409aade89ee6b49695b7fb",
);
const historical = JSON.parse(historicalBytes).files;
for (const row of Object.values(historical)) {
  for (const key of ["source", "compiled", "declaration"]) {
    assert.equal(hash(row[key]), row[key + "Sha256"]);
  }
}
const rows = Object.values(manifest.files);
for (const row of rows) {
  assert.equal(hash(fs.readFileSync(path.join(repo, row.source.path))), row.source.sha256);
}
const config = ts.readConfigFile(path.join(core, "tsconfig.json"), ts.sys.readFile);
assert.equal(config.error, undefined);
const parsed = ts.parseJsonConfigFileContent(config.config, ts.sys, core);
assert.equal(parsed.errors.length, 0);
const program = ts.createProgram(
  rows.map((row) => path.join(repo, row.source.path)),
  { ...parsed.options, noEmit: false },
);
const diagnostics = ts.getPreEmitDiagnostics(program);
assert.equal(
  diagnostics.length,
  0,
  ts.formatDiagnosticsWithColorAndContext(diagnostics, {
    getCurrentDirectory: () => repo,
    getCanonicalFileName: (name) => name,
    getNewLine: () => "\n",
  }),
);
const emitted = new Map();
const expected = new Map(
  rows
    .flatMap((row) => [row.compiled, row.declaration])
    .map((row) => [path.join(repo, row.path), row]),
);
const result = program.emit(undefined, (file, text) => {
  if (expected.has(file)) emitted.set(file, text);
});
assert.equal(result.emitSkipped, false);
assert.equal(result.diagnostics.length, 0);
assert.equal(emitted.size, expected.size);
const printer = ts.createPrinter({ removeComments: true });
function api(text) {
  const source = ts.createSourceFile("api.d.ts", text, ts.ScriptTarget.Latest, true);
  return source.statements
    .filter((node) => !ts.isImportDeclaration(node))
    .map((node) => printer.printNode(ts.EmitHint.Unspecified, node, source))
    .sort()
    .join("\n");
}
for (const name of [
  "permission-full-access.ts",
  "permission-grant-recovery.ts",
  "execution-state.ts",
  "helpers/permission-broker.ts",
]) {
  assert.equal(
    api(emitted.get(path.join(repo, manifest.files[name].declaration.path))),
    api(historical[name].declaration),
  );
}
for (const [file, text] of emitted) assert.equal(hash(text), expected.get(file).sha256, file);
for (const [file, text] of emitted) fs.writeFileSync(file, text);
console.log(
  JSON.stringify({
    typescript: ts.version,
    diagnostics: 0,
    publicApiShapes: 4,
    sourceMatches: rows.length,
    exactEmissions: emitted.size,
    dependencyEmissionsWritten: 0,
  }),
);
