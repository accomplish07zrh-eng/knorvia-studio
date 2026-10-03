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
const receipt = JSON.parse(read("docs/evidence/knorvia-may-set-lane-expansion-20261001.json"));
if (process.argv.includes("--types") || process.argv.includes("--emit")) {
  const ts = createRequire(path.join(root, "package.json"))("typescript");
  const emit = process.argv.includes("--emit");
  const programFor = (pkg, roots, noEmit) => {
    const base = path.join(root, "apps/cli/packages", pkg);
    const configPath = path.join(base, "tsconfig.json");
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
    const written = [];
    const result = program.emit(
      program.getSourceFile(path.join(root, receipt.owner)),
      (name, text, bom) => {
        const relative = path.relative(
          path.join(root, "apps/cli/packages/dynamic-workflow/dist/analysis"),
          name,
        );
        assert.match(relative, /^causality-graph-lanes\.(?:js|d\.ts(?:\.map)?)$/u);
        ts.sys.writeFile(name, text, bom);
        written.push(relative);
      },
    );
    assert.equal(result.emitSkipped, false);
    assert.equal(result.diagnostics.length, 0);
    console.log(JSON.stringify({ written }));
  }
}
for (const item of [...receipt.files, ...receipt.emitted, ...receipt.protected]) {
  assert.equal(sha(read(item.path)), item.sha256, item.path);
  assert.equal(read(item.path).length, item.bytes, item.path);
}
const old = (p) => execFileSync("git", ["show", `${receipt.baseline}:${p}`], { cwd: root });
const archive = JSON.parse(
  read("apps/cli/packages/core/test/may-set-lane-expansion-baseline.json"),
);
const previous = old(receipt.owner).toString("utf8"),
  current = read(receipt.owner).toString("utf8");
assert.equal(sha(previous), archive.sourceSha256);
assert.equal(sha(archive.compiled), archive.emittedSha256);
assert.equal(sha(archive.declaration), archive.declarationSha256);
const signature = "export function expandMaySetLanes(",
  suffix = "/** Collapse facts";
assert.equal(
  current.slice(0, current.indexOf(signature)),
  previous.slice(0, previous.indexOf(signature)),
);
assert.equal(current.slice(current.indexOf(suffix)), previous.slice(previous.indexOf(suffix)));
assert.equal(sha(read(receipt.emitted[1].path)), archive.declarationSha256);
const publisher = execFileSync("git", ["cat-file", "blob", receipt.upstream.blob], {
  cwd: root,
}).toString("utf8");
assert.equal(sha(publisher.replace(/\r\n/gu, "\n")), receipt.upstream.normalizedSha256);
for (const p of receipt.immutableFreeze)
  assert.deepEqual(
    read(p),
    execFileSync("git", ["show", `${receipt.freeze}:${p}`], { cwd: root }),
    p,
  );
for (const p of execFileSync("git", ["diff", "--name-only", receipt.baseline], {
  cwd: root,
  encoding: "utf8",
})
  .trim()
  .split("\n")
  .filter(Boolean))
  assert.ok(receipt.scope.includes(p), p);
if (process.argv.includes("--local-logs"))
  for (const log of receipt.logs) assert.equal(sha(readFileSync(log.path)), log.sha256, log.path);
console.log(
  JSON.stringify({
    ok: true,
    digests: receipt.files.length + receipt.emitted.length,
    protected: receipt.protected.length,
    frozen: receipt.immutableFreeze.length,
    publicProseDeclarationAndFactHelpersUnchanged: true,
  }),
);
