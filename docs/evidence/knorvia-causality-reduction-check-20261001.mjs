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
const receipt = JSON.parse(read("docs/evidence/knorvia-causality-reduction-20261001.json"));
const owner = "apps/cli/packages/dynamic-workflow/src/analysis/causality-reduce.ts";
if (process.argv.includes("--types") || process.argv.includes("--emit")) {
  const ts = createRequire(path.join(root, "package.json"))("typescript");
  const emit = process.argv.includes("--emit");
  const check = (pkg, roots, noEmit) => {
    const base = path.join(root, "apps/cli/packages", pkg),
      configPath = path.join(base, "tsconfig.json");
    const config = ts.readConfigFile(configPath, ts.sys.readFile);
    assert.equal(config.error, undefined);
    const parsed = ts.parseJsonConfigFileContent(config.config, ts.sys, base, {}, configPath);
    const options = noEmit ? { ...parsed.options, noEmit: true, rootDir: root } : parsed.options;
    const program = ts.createProgram({ rootNames: roots.map((p) => path.join(root, p)), options });
    const diagnostics = ts.getPreEmitDiagnostics(program);
    if (diagnostics.length) {
      process.stderr.write(
        ts.formatDiagnosticsWithColorAndContext(diagnostics, {
          getCurrentDirectory: () => root,
          getCanonicalFileName: (p) => p,
          getNewLine: () => "\n",
        }),
      );
      process.exit(1);
    }
    console.log(JSON.stringify({ pkg, typescript: ts.version, roots, diagnostics: 0 }));
    return program;
  };
  const program = check("dynamic-workflow", [owner], !emit);
  if (!emit) check("core", receipt.testRoots, true);
  else {
    const written = [],
      result = program.emit(program.getSourceFile(path.join(root, owner)), (name, text, bom) => {
        const relative = path.relative(
          path.join(root, "apps/cli/packages/dynamic-workflow/dist/analysis"),
          name,
        );
        assert.match(relative, /^causality-reduce\.(?:js|d\.ts(?:\.map)?)$/u);
        ts.sys.writeFile(name, text, bom);
        written.push(path.relative(root, name));
      });
    assert.equal(result.emitSkipped, false);
    assert.equal(result.diagnostics.length, 0);
    console.log(JSON.stringify({ written }));
  }
}
for (const item of [...receipt.files, ...receipt.emitted]) {
  const bytes = read(item.path);
  assert.equal(bytes.length, item.bytes, item.path);
  assert.equal(sha(bytes), item.sha256, item.path);
}
const archive = JSON.parse(read("apps/cli/packages/core/test/causality-reduction-baseline.json"));
assert.equal(sha(archive.compiled), archive.emittedSha256);
const old = execFileSync("git", ["show", `${receipt.baseline}:${owner}`], {
  cwd: root,
  encoding: "utf8",
});
assert.equal(sha(old), archive.sourceSha256);
const current = read(owner).toString("utf8");
assert.equal(
  current.slice(0, current.indexOf("// Witness strength")),
  old.slice(0, old.indexOf("/** Kinds a justifying path")),
);
const publicDoc = (s) =>
  s.slice(
    s.indexOf("/**\n * Drop edges a strong-enough"),
    s.indexOf("export function reduceOrdering"),
  );
assert.equal(publicDoc(current), publicDoc(old));
assert.equal(
  sha(read("apps/cli/packages/dynamic-workflow/dist/analysis/causality-reduce.d.ts")),
  archive.declarationSha256,
);
for (const p of receipt.immutableFreeze)
  assert.equal(
    sha(read(p)),
    sha(execFileSync("git", ["show", `${receipt.freeze}:${p}`], { cwd: root })),
    p,
  );
const changes = execFileSync("git", ["diff", "--name-only", receipt.baseline], {
  cwd: root,
  encoding: "utf8",
}).trim();
for (const p of changes ? changes.split("\n") : []) assert.ok(receipt.scope.includes(p), p);
console.log(
  JSON.stringify({
    digests: receipt.files.length + receipt.emitted.length,
    frozenOracles: receipt.immutableFreeze.length,
    outsideScopeUnchanged: true,
    ok: true,
  }),
);
