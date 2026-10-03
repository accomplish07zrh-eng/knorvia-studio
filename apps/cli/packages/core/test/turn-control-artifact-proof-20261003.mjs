import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { createHash } from "node:crypto";
const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../../..");
const ts = createRequire(path.join(repo, "package.json"))("typescript"),
  sha = (b) => createHash("sha256").update(b).digest("hex"),
  pin = "eeaae751dfebb6cd71fef38889589be3a5c9c48cd640ab0740ccf1c0ef2fcefd";
function exact(file, digest, read = fs.readFileSync) {
  const b = read(path.join(repo, file));
  assert.equal(sha(b), digest, file);
  return b;
}
const manifest = JSON.parse(exact("docs/evidence/knorvia-turn-control-current-20261003.json", pin));
assert.equal(ts.version, manifest.typescript);
for (const row of Object.values(manifest.files))
  for (const e of Object.values(row)) exact(e.path, e.sha256);
const first = Object.values(manifest.files)[0].compiled;
assert.throws(() => exact(first.path, first.sha256, () => Buffer.from("wrong artifact")));
const missing = Object.assign(new Error("owned missing"), { code: "ENOENT" });
assert.throws(
  () =>
    exact(first.path, first.sha256, () => {
      throw missing;
    }),
  (e) => e === missing,
);
const freeze = JSON.parse(
    fs.readFileSync(path.join(repo, "docs/evidence/turn-control-checks-20261003/freeze.json")),
  ),
  fixture = "apps/cli/packages/core/test/turn-control-safety-20261003.mjs";
for (const [file, digest] of Object.entries(freeze.bindings)) {
  if (file === fixture) {
    const text = fs.readFileSync(path.join(repo, file), "utf8");
    assert.equal(
      sha(text.replace(pin, "CURRENT_PIN")),
      digest,
      "only current selector pin changes",
    );
  } else exact(file, digest);
}
for (const [file, row] of Object.entries(freeze.receiptReferences)) exact(file, row.sha256);
const reference = freeze.protectedReference,
  previous = JSON.parse(exact(reference.path, reference.sha256)),
  background = JSON.parse(
    exact(reference.backgroundOverrideManifest, reference.backgroundManifestSHA256),
  );
const protectedFiles = { ...previous.protected, [previous.path]: previous.sha256 };
for (const row of Object.values(background.files))
  protectedFiles[row.source.path] = row.source.sha256;
delete protectedFiles[freeze.owner];
for (const [file, digest] of Object.entries(protectedFiles)) exact(file, digest);
const baseline = JSON.parse(
  exact(
    "apps/cli/packages/core/test/turn-control-baseline-20261003.json",
    "c9a7caf599ac40c22bc20e50f8b67fc6af97ae72ff9aae5e5485a3addd530bbd",
  ),
);
for (const row of Object.values(baseline.files)) {
  for (const k of ["source", "compiled", "declaration"])
    assert.equal(sha(row[k]), row[k + "Sha256"]);
  if (row.logicalPath !== freeze.owner) exact(row.logicalPath, row.sourceSha256);
}
const core = path.join(repo, "apps/cli/packages/core"),
  cfg = ts.readConfigFile(path.join(core, "tsconfig.json"), ts.sys.readFile),
  options = { ...ts.parseJsonConfigFileContent(cfg.config, ts.sys, core).options, noEmit: false };
const program = ts.createProgram(
    Object.values(baseline.files).map((r) => path.join(repo, r.logicalPath)),
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
for (const [file, row] of Object.entries(manifest.files)) {
  assert.equal(emitted(file, ".js"), exact(row.compiled.path, row.compiled.sha256).toString());
  assert.equal(
    emitted(file, ".d.ts"),
    exact(row.declaration.path, row.declaration.sha256).toString(),
  );
}
for (const row of Object.values(baseline.files))
  if (row.logicalPath !== freeze.owner) {
    assert.equal(emitted(row.logicalPath, ".js"), row.compiled);
    assert.equal(emitted(row.logicalPath, ".d.ts"), row.declaration);
  }
const api = (t) => {
  const s = ts.createSourceFile("api.d.ts", t, ts.ScriptTarget.Latest, true),
    printer = ts.createPrinter({ removeComments: true });
  return s.statements
    .filter(
      (n) =>
        ts.isFunctionDeclaration(n) &&
        n.modifiers?.some((m) => m.kind === ts.SyntaxKind.ExportKeyword),
    )
    .map((n) => printer.printNode(ts.EmitHint.Unspecified, n, s))
    .sort()
    .join("\n");
};
assert.equal(
  api(emitted(freeze.owner, ".d.ts")),
  api(baseline.files["tool/executor/turn-control"].declaration),
);
console.log(
  JSON.stringify({
    groups: 1,
    typescript: ts.version,
    diagnostics: 0,
    exactCurrentArtifacts: true,
    publicApiEqual: true,
    immutableHistoricalModules: 3,
    unchangedDirectConsumers: 2,
    protectedSources: Object.keys(protectedFiles).length,
    wrongMissingArtifactsFailClosed: true,
    wholeBuild: false,
  }),
);
