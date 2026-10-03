const fs = require("node:fs");
const path = require("node:path");
const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const repo = path.resolve(__dirname, "../../../../..");
const core = path.resolve(__dirname, "..");
const ts = require(path.join(repo, "node_modules/typescript"));
const hash = (bytes) => crypto.createHash("sha256").update(bytes).digest("hex");
const manifestBytes = fs.readFileSync(
  path.join(repo, "docs/evidence/knorvia-subagent-owners-current-20261003.json"),
);
assert.equal(
  hash(manifestBytes),
  "42ef2a67a991b11b624a0126caa5d5c047b50dcc898c1a0277186ef90170341a",
);
const manifest = JSON.parse(manifestBytes);
assert.equal(ts.version, manifest.typescript);
const historicalBytes = fs.readFileSync(
  path.join(__dirname, "subagent-owners-baseline-20261003.json"),
);
assert.equal(
  hash(historicalBytes),
  "bc847c5c92336930de86749ce0d0e8c72f5a1ea8373b88deb5429ce9bc9db8a9",
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
for (const name of ["profile", "runner"]) {
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
    publicApiShapes: 2,
    sourceMatches: rows.length,
    exactEmissions: emitted.size,
    dependencyEmissionsWritten: 0,
  }),
);
