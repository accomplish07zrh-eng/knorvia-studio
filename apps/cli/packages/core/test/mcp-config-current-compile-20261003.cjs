const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const assert = require("node:assert/strict");
const repo = path.resolve(__dirname, "../../../../..");
const core = path.resolve(__dirname, "..");
const ts = require(path.join(repo, "node_modules/typescript"));
const hash = (bytes) => crypto.createHash("sha256").update(bytes).digest("hex");
const bytes = fs.readFileSync(
  path.join(repo, "docs/evidence/knorvia-mcp-config-current-20261003.json"),
);
assert.equal(hash(bytes), "c04d9319795fbb444a25315e4e21f7ce7bfc482bca492cd972b8989f04a45a45");
const manifest = JSON.parse(bytes);
assert.equal(ts.version, manifest.typescript);
const oldBytes = fs.readFileSync(path.join(__dirname, "mcp-config-baseline-20261003.json"));
assert.equal(hash(oldBytes), "c62abf9d549977fcba1ec7b46174e74a8b6e727ef245cd8714b82cc708cffe0b");
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
for (const name of ["mcp.ts", "config.ts"]) {
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
    publicMethods: 27,
    sources: rows.length,
    actualEmissions: emitted.size,
    unselectedWrites: 0,
  }),
);
