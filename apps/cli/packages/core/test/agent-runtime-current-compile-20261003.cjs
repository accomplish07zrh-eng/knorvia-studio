const fs = require("node:fs"),
  path = require("node:path"),
  assert = require("node:assert/strict"),
  crypto = require("node:crypto");
const repo = path.resolve(__dirname, "../../../../.."),
  core = path.join(repo, "apps/cli/packages/core"),
  ts = require(path.join(repo, "node_modules/typescript")),
  hash = (b) => crypto.createHash("sha256").update(b).digest("hex");
const b = fs.readFileSync(
  path.join(repo, "docs/evidence/knorvia-agent-runtime-current-20261003.json"),
);
assert.equal(hash(b), "98c565b37e40e409b6ed3e0d67bef6192a5711d3c8cc12604006633d8bd5a9b2");
const manifest = JSON.parse(b);
const oldBytes = fs.readFileSync(path.join(core, "test/agent-runtime-baseline-20261003.json"));
assert.equal(hash(oldBytes), "9f984bbe8006567a20894bfac07830c3cc04481bd6e872c9d6385518ef6e9a66");
const old = JSON.parse(oldBytes);
for (const row of Object.values(old.files))
  for (const k of ["source", "compiled", "declaration"])
    assert.equal(hash(row[k]), row[k + "Sha256"]);
const rows = Object.values(manifest.files);
for (const row of rows)
  assert.equal(hash(fs.readFileSync(path.join(repo, row.source.path))), row.source.sha256);
const cfg = ts.readConfigFile(path.join(core, "tsconfig.json"), ts.sys.readFile),
  options = { ...ts.parseJsonConfigFileContent(cfg.config, ts.sys, core).options, noEmit: false },
  p = ts.createProgram(
    rows.map((r) => path.join(repo, r.source.path)),
    options,
  ),
  d = ts.getPreEmitDiagnostics(p);
assert.equal(
  d.length,
  0,
  d.map((e) => ts.flattenDiagnosticMessageText(e.messageText, "\n")).join("\n"),
);
const c = p.getTypeChecker(),
  sf = p.getSourceFile(path.join(repo, manifest.files["agent-runtime.ts"].source.path)),
  sym = c.getExportsOfModule(c.getSymbolAtLocation(sf)).find((s) => s.name === "AgentRuntime"),
  type = c.getDeclaredTypeOfSymbol(sym),
  api = {
    construct: c
      .getTypeOfSymbolAtLocation(sym, sf)
      .getConstructSignatures()
      .map((s) => c.signatureToString(s, undefined, ts.TypeFormatFlags.NoTruncation)),
    members: c
      .getPropertiesOfType(type)
      .filter(
        (s) =>
          !(s.declarations ?? []).some(
            (d) =>
              (ts.getCombinedModifierFlags(d) &
                (ts.ModifierFlags.Private | ts.ModifierFlags.Protected)) !==
              0,
          ),
      )
      .map((s) => {
        const t = c.getTypeOfSymbolAtLocation(s, s.valueDeclaration ?? sf);
        return [
          s.name,
          c.typeToString(t, undefined, ts.TypeFormatFlags.NoTruncation),
          t
            .getCallSignatures()
            .map((x) => c.signatureToString(x, undefined, ts.TypeFormatFlags.NoTruncation)),
        ];
      })
      .sort(([a], [b]) => a.localeCompare(b)),
  };
assert.deepEqual(api, old.api);
const expected = new Map(
    rows.flatMap((r) => [r.compiled, r.declaration]).map((r) => [path.join(repo, r.path), r]),
  ),
  emitted = new Map();
p.emit(undefined, (file, text) => {
  if (expected.has(file)) emitted.set(file, text);
});
assert.equal(emitted.size, expected.size);
for (const [file, text] of emitted) {
  assert.equal(hash(text), expected.get(file).sha256, file);
  fs.writeFileSync(file, text);
}
console.log(
  JSON.stringify({
    typescript: ts.version,
    diagnostics: 0,
    publicMembers: api.members.length,
    constructorAPIEqual: true,
    actualEmissions: emitted.size,
    unselectedWrites: 0,
  }),
);
