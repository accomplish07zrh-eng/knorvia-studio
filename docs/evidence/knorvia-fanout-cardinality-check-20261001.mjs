import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../../", import.meta.url));
const read = (p) => readFileSync(path.join(root, p));
const sha = (bytes) => createHash("sha256").update(bytes).digest("hex");
const receipt = JSON.parse(read("docs/evidence/knorvia-fanout-cardinality-20261001.json"));
if (process.argv.includes("--types") || process.argv.includes("--emit")) {
  const ts = createRequire(path.join(root, "package.json"))("typescript");
  const emit = process.argv.includes("--emit");
  const programFor = (pkg, roots, noEmit) => {
    const base = path.join(root, "apps/cli/packages", pkg),
      configPath = path.join(base, "tsconfig.json");
    const config = ts.readConfigFile(configPath, ts.sys.readFile);
    assert.equal(config.error, undefined);
    const parsed = ts.parseJsonConfigFileContent(config.config, ts.sys, base, {}, configPath);
    const program = ts.createProgram({
      rootNames: roots.map((p) => path.join(root, p)),
      options: noEmit ? { ...parsed.options, noEmit: true, rootDir: root } : parsed.options,
    });
    const diagnostics = ts.getPreEmitDiagnostics(program);
    assert.equal(
      diagnostics.length,
      0,
      ts.formatDiagnosticsWithColorAndContext(diagnostics, {
        getCurrentDirectory: () => root,
        getCanonicalFileName: (p) => p,
        getNewLine: () => "\n",
      }),
    );
    console.log(
      JSON.stringify({ pkg, roots: roots.length, diagnostics: 0, typescript: ts.version }),
    );
    return program;
  };
  const program = programFor("dynamic-workflow", [receipt.owner], !emit);
  if (!emit) programFor("core", receipt.testRoots, true);
  else {
    const written = [],
      result = program.emit(
        program.getSourceFile(path.join(root, receipt.owner)),
        (name, text, bom) => {
          const relative = path.relative(
            path.join(root, "apps/cli/packages/dynamic-workflow/dist/analysis"),
            name,
          );
          assert.match(relative, /^fanout-cardinality\.(?:js|d\.ts(?:\.map)?)$/u);
          ts.sys.writeFile(name, text, bom);
          written.push(relative);
        },
      );
    assert.equal(result.emitSkipped, false);
    assert.equal(result.diagnostics.length, 0);
    console.log(JSON.stringify({ written }));
  }
}
for (const entry of [...receipt.files, ...receipt.emitted]) {
  const bytes = read(entry.path);
  assert.equal(bytes.length, entry.bytes, entry.path);
  assert.equal(sha(bytes), entry.sha256, entry.path);
}
const old = execFileSync("git", ["show", `${receipt.baseline}:${receipt.owner}`], {
  cwd: root,
  encoding: "utf8",
});
const archive = JSON.parse(read("apps/cli/packages/core/test/fanout-cardinality-baseline.json"));
assert.equal(sha(old), archive.sourceSha256);
assert.equal(sha(archive.compiled), archive.emittedSha256);
const current = read(receipt.owner).toString("utf8");
assert.equal(
  current.split("export function literalCardinality(")[0],
  old.split("export function literalCardinality(")[0],
);
assert.equal(sha(read(receipt.emitted[1].path)), archive.declarationSha256);
for (const p of receipt.immutableFreeze)
  assert.deepEqual(
    read(p),
    execFileSync("git", ["show", `${receipt.freeze}:${p}`], { cwd: root }),
    p,
  );
const changes = execFileSync("git", ["diff", "--name-only", receipt.baseline], {
  cwd: root,
  encoding: "utf8",
}).trim();
for (const p of changes ? changes.split("\n") : []) assert.ok(receipt.scope.includes(p), p);
if (process.argv.includes("--local-logs"))
  for (const entry of [...receipt.logs, receipt.preservedFailure.log])
    assert.equal(sha(readFileSync(entry.path)), entry.sha256, entry.path);
console.log(
  JSON.stringify({
    digests: receipt.files.length + receipt.emitted.length,
    frozen: receipt.immutableFreeze.length,
    publicProseAndDeclarationUnchanged: true,
    outsideScopeUnchanged: true,
    ok: true,
  }),
);
