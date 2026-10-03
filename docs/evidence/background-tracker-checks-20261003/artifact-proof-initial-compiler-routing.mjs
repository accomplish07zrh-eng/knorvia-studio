import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";
import ts from "typescript";
const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../../..");
const sha = (b) => createHash("sha256").update(b).digest("hex");
const pin = "e3a8f212f9a30970acdffbefb1f7198c859fb698da87a689ed3fd57f222b1453";
const manifestPath = "docs/evidence/knorvia-background-tracker-current-20261003.json";
function exactRead(file, digest, read = fs.readFileSync) {
  const bytes = read(path.join(repo, file));
  assert.equal(sha(bytes), digest, file);
  return bytes;
}
const manifest = JSON.parse(exactRead(manifestPath, pin));
for (const row of Object.values(manifest.files))
  for (const entry of Object.values(row)) exactRead(entry.path, entry.sha256);
const first = Object.values(manifest.files)[0].compiled;
assert.throws(() => exactRead(first.path, first.sha256, () => Buffer.from("wrong artifact")));
const missing = Object.assign(new Error("owned missing artifact"), { code: "ENOENT" });
assert.throws(
  () =>
    exactRead(first.path, first.sha256, () => {
      throw missing;
    }),
  (e) => e === missing,
);
assert.throws(() => exactRead(manifestPath, pin, () => Buffer.from("{}")));
const freezePath = "docs/evidence/background-tracker-checks-20261003/freeze.json";
const freeze = JSON.parse(fs.readFileSync(path.join(repo, freezePath)));
const fixture = "apps/cli/packages/core/test/background-tracker-fixture-20261003.mjs";
for (const [file, digest] of Object.entries(freeze.freeze)) {
  if (file === fixture) {
    const text = fs.readFileSync(path.join(repo, file), "utf8");
    assert.equal(sha(text.replace(pin, "CURRENT_PIN")), digest, "only exact selector pin changed");
  } else exactRead(file, digest);
}
const protectedPin = freeze.protectedReference;
const previous = JSON.parse(exactRead(protectedPin.path, protectedPin.sha256));
let protectedCount = 0;
for (const [file, digest] of Object.entries(previous.protected)) {
  if (file === protectedPin.explicitlySupersededPath) continue;
  exactRead(file, digest);
  protectedCount++;
}
exactRead(previous.path, previous.sha256);
protectedCount++;
const baseline = JSON.parse(
  exactRead(
    "apps/cli/packages/core/test/background-tracker-baseline-20261003.json",
    "21ad66af851971aa60edef827577865d37de02ad32b02ec0ebdf5d2873cc8eb3",
  ),
);
for (const row of Object.values(baseline.files)) {
  for (const kind of ["source", "compiled", "declaration"])
    assert.equal(sha(row[kind]), row[kind + "Sha256"]);
  if (row.logicalPath !== freeze.allocatedPath) exactRead(row.logicalPath, row.sourceSha256);
}
const core = path.join(repo, "apps/cli/packages/core");
const config = ts.readConfigFile(path.join(core, "tsconfig.json"), ts.sys.readFile);
const options = {
  ...ts.parseJsonConfigFileContent(config.config, ts.sys, core).options,
  noEmit: false,
};
const files = Object.values(manifest.files);
const program = ts.createProgram(
  [
    ...files.map((row) => path.join(repo, row.source.path)),
    path.join(core, "src/tool/executor/impl.ts"),
  ],
  options,
);
const diagnostics = ts.getPreEmitDiagnostics(program);
assert.equal(
  diagnostics.length,
  0,
  ts.formatDiagnosticsWithColorAndContext(diagnostics, {
    getCurrentDirectory: () => repo,
    getCanonicalFileName: (f) => f,
    getNewLine: () => "\n",
  }),
);
const emitted = new Map();
program.emit(undefined, (file, text) => emitted.set(file, text));
function emittedFor(source, extension) {
  const base = path.relative(path.join(core, "src"), path.join(repo, source)).replace(/\.ts$/u, "");
  const file = path.join(core, "dist", base + extension);
  assert.ok(emitted.has(file), file);
  return emitted.get(file);
}
for (const row of files) {
  assert.equal(
    emittedFor(row.source.path, ".js"),
    exactRead(row.compiled.path, row.compiled.sha256).toString(),
  );
  assert.equal(
    emittedFor(row.source.path, ".d.ts"),
    exactRead(row.declaration.path, row.declaration.sha256).toString(),
  );
}
for (const row of Object.values(baseline.files)) {
  if (row.logicalPath === freeze.allocatedPath) continue;
  assert.equal(emittedFor(row.logicalPath, ".js"), row.compiled, row.logicalPath);
  assert.equal(emittedFor(row.logicalPath, ".d.ts"), row.declaration, row.logicalPath);
}
function api(text) {
  const source = ts.createSourceFile(
    "api.d.ts",
    text,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TS,
  );
  const owner = source.statements.find(
    (n) => ts.isClassDeclaration(n) && n.name.text === "BackgroundTaskTracker",
  );
  assert.ok(owner);
  const members = owner.members.filter(
    (n) =>
      !n.modifiers?.some(
        (m) => m.kind === ts.SyntaxKind.PrivateKeyword || m.kind === ts.SyntaxKind.ProtectedKeyword,
      ),
  );
  return ts
    .createPrinter({ removeComments: true })
    .printNode(
      ts.EmitHint.Unspecified,
      ts.factory.updateClassDeclaration(
        owner,
        owner.modifiers,
        owner.name,
        owner.typeParameters,
        owner.heritageClauses,
        members,
      ),
      source,
    );
}
assert.equal(
  api(emittedFor(freeze.allocatedPath, ".d.ts")),
  api(baseline.files["tool/executor/background-tasks"].declaration),
);
console.log(
  JSON.stringify({
    groups: 1,
    typescript: ts.version,
    diagnostics: 0,
    currentModules: files.length,
    immutableBaselineModules: Object.keys(baseline.files).length,
    unchangedProtectedSources: protectedCount,
    publicApiEqual: true,
    exactCompilerArtifacts: true,
    wrongMissingArtifactsFailClosed: true,
    wholeBuild: false,
    liveTasksProcessesProvidersGrants: 0,
  }),
);
