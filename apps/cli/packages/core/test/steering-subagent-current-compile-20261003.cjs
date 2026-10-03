const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const assert = require("node:assert/strict");
const repo = path.resolve(__dirname, "../../../../..");
const core = path.resolve(__dirname, "..");
const ts = require(path.join(repo, "node_modules/typescript"));
const hash = (bytes) => crypto.createHash("sha256").update(bytes).digest("hex");
const bytes = fs.readFileSync(
  path.join(repo, "docs/evidence/knorvia-steering-subagent-current-20261003.json"),
);
assert.equal(hash(bytes), "ee7919ddfb7cc62e7a6c68e0baa55c2c400a1f785d9471e13bd0348b103ba960");
const manifest = JSON.parse(bytes);
assert.equal(ts.version, manifest.typescript);
const oldBytes = fs.readFileSync(path.join(__dirname, "steering-subagent-baseline-20261003.json"));
assert.equal(hash(oldBytes), "ca03acb0d6b1510c32235ddc78921e27ef74bff19dba54e0bd3eab246b131151");
const old = JSON.parse(oldBytes);
for (const row of Object.values(old.files))
  for (const kind of ["source", "compiled", "declaration"])
    assert.equal(hash(row[kind]), row[kind + "Sha256"]);
const rows = Object.values(manifest.files);
for (const row of rows)
  assert.equal(hash(fs.readFileSync(path.join(repo, row.source.path))), row.source.sha256);
const config = ts.readConfigFile(path.join(core, "tsconfig.json"), ts.sys.readFile);
assert.equal(config.error, undefined);
const parsed = ts.parseJsonConfigFileContent(config.config, ts.sys, core);
assert.equal(parsed.errors.length, 0);
const program = ts.createProgram(
  rows.map((row) => path.join(repo, row.source.path)),
  {
    ...parsed.options,
    noEmit: false,
  },
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
const checker = program.getTypeChecker();
const api = {};
for (const name of ["steering.ts", "subagent.ts"]) {
  const source = program.getSourceFile(path.join(repo, manifest.files[name].source.path));
  api[name] = checker
    .getExportsOfModule(checker.getSymbolAtLocation(source))
    .map((symbol) => {
      if (symbol.flags & ts.SymbolFlags.Alias) symbol = checker.getAliasedSymbol(symbol);
      return [
        symbol.name,
        checker
          .getTypeOfSymbolAtLocation(symbol, symbol.valueDeclaration ?? source)
          .getCallSignatures()
          .map((signature) =>
            checker.signatureToString(signature, undefined, ts.TypeFormatFlags.NoTruncation),
          ),
      ];
    })
    .sort(([a], [b]) => a.localeCompare(b));
}
assert.deepEqual(api, old.api);
const expected = new Map(
  rows
    .flatMap((row) => [row.compiled, row.declaration])
    .map((entry) => [path.join(repo, entry.path), entry]),
);
const emitted = new Map();
const result = program.emit(undefined, (file, text) => {
  if (expected.has(file)) emitted.set(file, text);
});
assert.equal(result.emitSkipped, false);
assert.equal(result.diagnostics.length, 0);
assert.equal(emitted.size, expected.size);
for (const [file, text] of emitted) assert.equal(hash(text), expected.get(file).sha256, file);
for (const [file, text] of emitted) fs.writeFileSync(file, text);
console.log(
  JSON.stringify({
    typescript: ts.version,
    diagnostics: 0,
    publicMethods: 28,
    sources: rows.length,
    actualEmissions: emitted.size,
    unselectedWrites: 0,
  }),
);
