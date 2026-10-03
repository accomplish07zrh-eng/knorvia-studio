import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { createHash } from "node:crypto";
const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../../.."),
  ts = createRequire(path.join(repo, "package.json"))("typescript"),
  sha = (b) => createHash("sha256").update(b).digest("hex"),
  pin = "5abaeeb926d865401fc122a4ac86067850faea180afe46a7e7ad2ecb3e8663bc";
function exact(file, digest, read = fs.readFileSync) {
  const b = read(path.join(repo, file));
  assert.equal(sha(b), digest, file);
  return b;
}
const manifest = JSON.parse(
  exact("docs/evidence/knorvia-background-data-current-20261003.json", pin),
);
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
    exact(
      "docs/evidence/background-data-checks-20261003/freeze.json",
      "964ba148550c0a3ae2b14145cc4b08c33dc2b38f133254a6c6a0e75ba0d7ca77",
    ),
  ),
  fixture = "apps/cli/packages/core/test/background-data-safety-20261003.mjs";
for (const [file, digest] of Object.entries(freeze.inputs)) {
  if (file === fixture)
    assert.equal(
      sha(fs.readFileSync(path.join(repo, file), "utf8").replace(pin, "CURRENT_PIN")),
      digest,
      "only selector pin changed",
    );
  else exact(file, digest);
}
for (const [file, digest] of Object.entries(freeze.protectedReferenceDigests)) exact(file, digest);
const protectedFiles = freeze.protected;
for (const [file, digest] of Object.entries(protectedFiles)) exact(file, digest);
assert.equal(Object.keys(protectedFiles).length, 699);
const old = JSON.parse(
  exact(
    "apps/cli/packages/core/test/background-data-baseline-20261003.json",
    freeze.inputs["apps/cli/packages/core/test/background-data-baseline-20261003.json"],
  ),
);
for (const row of Object.values(old.files)) {
  for (const k of ["compiled", "declaration"]) assert.equal(sha(row[k]), row[k + "Sha256"]);
  if (row.source) assert.equal(sha(row.source), row.sourceSha256);
  else exact(row.logicalPath, row.sourceSha256);
}
// Reuse the one final strict compiler capture; this proof does not compile the program a second time.
const capture = JSON.parse(
  exact(
    "docs/evidence/background-data-checks-20261003/final-compile.json",
    "5d03dcd56b44f191f25bffcf14950fec11a799af986781de67fd123d11053c60",
  ),
);
assert.equal(capture.typescript, ts.version);
assert.equal(capture.diagnostics, 0);
assert.equal(capture.capturedModules, 5);
for (const [logical, hashes] of Object.entries(capture.files)) exact(logical, hashes.source);
const emitted = (logical, ext) => {
  const kind = ext === ".js" ? "compiled" : "declaration";
  const row = manifest.files[logical];
  const text = row
    ? exact(row[kind].path, row[kind].sha256).toString()
    : Object.values(old.files).find((r) => r.logicalPath === logical)[kind];
  assert.equal(sha(text), capture.files[logical][kind]);
  return text;
};
const syntax = (text, name) => {
  const ast = ts.createSourceFile(name, text, ts.ScriptTarget.Latest, true);
  const visit = (n) => [
    n.kind,
    ts.isIdentifier(n) || ts.isLiteralExpression(n) ? n.text : undefined,
    n.getChildren(ast).map(visit),
  ];
  return visit(ast);
};
for (const logical of Object.keys(manifest.files)) {
  const sealed =
    "docs/evidence/background-data-draft-20261003/initial/tool/executor/" + path.basename(logical);
  assert.deepEqual(
    syntax(fs.readFileSync(path.join(repo, logical), "utf8"), logical),
    syntax(fs.readFileSync(path.join(repo, sealed), "utf8"), logical),
    "installation only formats sealed source",
  );
}
const historicalLoader = exact(
  "docs/evidence/background-data-checks-20261003/historical-background-tracker-fixture.mjs.txt",
  freeze.inputs[
    "docs/evidence/background-data-checks-20261003/historical-background-tracker-fixture.mjs.txt"
  ],
).toString();
const currentLoader = fs.readFileSync(
  path.join(repo, "apps/cli/packages/core/test/background-tracker-fixture-20261003.mjs"),
  "utf8",
);
assert.equal(
  currentLoader.slice(currentLoader.indexOf("  const trace = [],")),
  historicalLoader.slice(historicalLoader.indexOf("  const trace = [],")),
  "all old fixture assertion/effect bodies unchanged",
);
const oldBackground = JSON.parse(
  exact(
    "apps/cli/packages/core/test/background-tracker-baseline-20261003.json",
    "21ad66af851971aa60edef827577865d37de02ad32b02ec0ebdf5d2873cc8eb3",
  ),
);
for (const row of Object.values(oldBackground.files))
  for (const kind of ["source", "compiled", "declaration"])
    assert.equal(sha(row[kind]), row[kind + "Sha256"]);
const api = (t) => {
  const ast = ts.createSourceFile("api.d.ts", t, ts.ScriptTarget.Latest, true),
    printer = ts.createPrinter({ removeComments: true });
  return ast.statements
    .filter((n) => !ts.isImportDeclaration(n))
    .map((n) => printer.printNode(ts.EmitHint.Unspecified, n, ast))
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
    finalCompilerCaptureReused: true,
    formatOnlySourceASTsEqual: 2,
    historicalBackgroundOraclePreserved: 13,
    oldFixtureBodiesUnchanged: true,
    historicalModules: 5,
    unchangedConsumerDependencyEmissions: 3,
    protectedSources: Object.keys(protectedFiles).length,
    wrongMissingArtifactsFailClosed: true,
    wholeBuild: false,
  }),
);
