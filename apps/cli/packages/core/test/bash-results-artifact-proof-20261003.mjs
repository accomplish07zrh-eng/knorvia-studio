import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { createHash } from "node:crypto";
const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../../.."),
  ts = createRequire(path.join(repo, "package.json"))("typescript"),
  sha = (b) => createHash("sha256").update(b).digest("hex"),
  pin = "f40288007778ae406e7e1929f311966aa41bf4e9ff6c794dcc8df2cb552c79c0";
function exact(file, digest, read = fs.readFileSync) {
  const b = read(path.join(repo, file));
  assert.equal(sha(b), digest, file);
  return b;
}
const manifest = JSON.parse(exact("docs/evidence/knorvia-bash-results-current-20261003.json", pin));
assert.equal(ts.version, manifest.typescript);
for (const row of Object.values(manifest.files))
  for (const e of Object.values(row)) exact(e.path, e.sha256);
const entry = Object.values(manifest.files)[0].compiled,
  missing = Object.assign(Error("owned missing"), { code: "ENOENT" });
assert.throws(() => exact(entry.path, entry.sha256, () => Buffer.from("wrong artifact")));
assert.throws(
  () =>
    exact(entry.path, entry.sha256, () => {
      throw missing;
    }),
  (e) => e === missing,
);
const freeze = JSON.parse(
    fs.readFileSync(path.join(repo, "docs/evidence/bash-results-checks-20261003/freeze.json")),
  ),
  fixture = "apps/cli/packages/core/test/bash-results-safety-20261003.mjs";
for (const [file, digest] of Object.entries(freeze.bindings)) {
  if (file === fixture)
    assert.equal(
      sha(fs.readFileSync(path.join(repo, file), "utf8").replace(pin, "CURRENT_PIN")),
      digest,
      "only selector pin changed",
    );
  else exact(file, digest);
}
for (const [file, digest] of Object.entries(freeze.protectedReferences)) exact(file, digest);
const prior = JSON.parse(
    fs.readFileSync(path.join(repo, "docs/evidence/turn-machine-checks-20261003/freeze.json")),
  ),
  protectedFiles = { ...prior.protected, [prior.path]: prior.sha256 };
for (const f of [
  "docs/evidence/knorvia-background-tracker-current-20261003.json",
  "docs/evidence/knorvia-turn-control-current-20261003.json",
])
  for (const row of Object.values(JSON.parse(fs.readFileSync(path.join(repo, f))).files))
    protectedFiles[row.source.path] = row.source.sha256;
for (const f of Object.keys(freeze.owners)) delete protectedFiles[f];
for (const [file, digest] of Object.entries(protectedFiles)) exact(file, digest);
assert.equal(Object.keys(protectedFiles).length, freeze.protectedCount);
const old = JSON.parse(
  exact(
    "apps/cli/packages/core/test/bash-results-baseline-20261003.json",
    freeze.bindings["apps/cli/packages/core/test/bash-results-baseline-20261003.json"],
  ),
);
for (const row of Object.values(old.files)) {
  for (const k of ["compiled", "declaration"]) assert.equal(sha(row[k]), row[k + "Sha256"]);
  if (row.source) assert.equal(sha(row.source), row.sourceSha256);
  else exact(row.logicalPath, row.sourceSha256);
}
const core = path.join(repo, "apps/cli/packages/core"),
  cfg = ts.readConfigFile(path.join(core, "tsconfig.json"), ts.sys.readFile),
  options = { ...ts.parseJsonConfigFileContent(cfg.config, ts.sys, core).options, noEmit: false },
  program = ts.createProgram(
    Object.values(old.files).map((r) => path.join(repo, r.logicalPath)),
    options,
  ),
  diagnostics = ts.getPreEmitDiagnostics(program);
assert.equal(
  diagnostics.length,
  0,
  ts.formatDiagnosticsWithColorAndContext(diagnostics, {
    getCurrentDirectory: () => repo,
    getCanonicalFileName: (f) => f,
    getNewLine: () => "\n",
  }),
);
const outputs = new Map();
program.emit(undefined, (f, t) => outputs.set(f, t));
const emitted = (file, ext) =>
  outputs.get(
    path.join(
      core,
      "dist",
      path.relative(path.join(core, "src"), path.join(repo, file)).replace(/\.ts$/u, "") + ext,
    ),
  );
const api = (t) => {
  const ast = ts.createSourceFile("api.d.ts", t, ts.ScriptTarget.Latest, true),
    printer = ts.createPrinter({ removeComments: true });
  return ast.statements
    .filter((n) => n.modifiers?.some((m) => m.kind === ts.SyntaxKind.ExportKeyword))
    .map((n) => printer.printNode(ts.EmitHint.Unspecified, n, ast))
    .sort()
    .join("\n");
};
for (const [logical, row] of Object.entries(manifest.files)) {
  assert.equal(emitted(logical, ".js"), exact(row.compiled.path, row.compiled.sha256).toString());
  assert.equal(
    emitted(logical, ".d.ts"),
    exact(row.declaration.path, row.declaration.sha256).toString(),
  );
  assert.equal(
    api(emitted(logical, ".d.ts")),
    api(Object.values(old.files).find((r) => r.logicalPath === logical).declaration),
  );
}
for (const row of Object.values(old.files))
  if (!manifest.files[row.logicalPath]) {
    assert.equal(emitted(row.logicalPath, ".js"), row.compiled);
    assert.equal(emitted(row.logicalPath, ".d.ts"), row.declaration);
  }
console.log(
  JSON.stringify({
    groups: 1,
    typescript: ts.version,
    diagnostics: 0,
    publicOwnerAPIsEqual: 2,
    strictCurrentPins: 6,
    historicalModules: 5,
    unchangedConsumerDependencyEmissions: 3,
    protectedSources: Object.keys(protectedFiles).length,
    wrongMissingArtifactsFailClosed: true,
    wholeBuild: false,
  }),
);
