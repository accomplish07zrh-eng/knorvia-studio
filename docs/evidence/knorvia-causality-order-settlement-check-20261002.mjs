import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../../", import.meta.url));
const read = (p) => readFileSync(path.join(root, p));
const sha = (bytes) => createHash("sha256").update(bytes).digest("hex");
const owner = "apps/cli/packages/dynamic-workflow/src/analysis/causality-order-settle.ts";
const ts = createRequire(path.join(root, "package.json"))("typescript");
if (process.argv.includes("--types") || process.argv.includes("--emit")) {
  const emit = process.argv.includes("--emit");
  const compile = (pkg, roots, write) => {
    const base = path.join(root, "apps/cli/packages", pkg);
    const configPath = path.join(base, "tsconfig.json");
    const config = ts.readConfigFile(configPath, ts.sys.readFile);
    assert.equal(config.error, undefined);
    const parsed = ts.parseJsonConfigFileContent(config.config, ts.sys, base, {}, configPath);
    const program = ts.createProgram({
      rootNames: roots.map((p) => path.join(root, p)),
      options: write ? parsed.options : { ...parsed.options, noEmit: true, rootDir: root },
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
    const written = [];
    if (write) {
      const result = program.emit(
        program.getSourceFile(path.join(root, owner)),
        (name, text, bom) => {
          assert.match(
            path.relative(path.join(base, "dist/analysis"), name),
            /^causality-order-settle\.(?:js|d\.ts(?:\.map)?)$/u,
          );
          ts.sys.writeFile(name, text, bom);
          written.push(path.basename(name));
        },
      );
      assert.equal(result.emitSkipped, false);
      assert.equal(result.diagnostics.length, 0);
    }
    console.log(
      JSON.stringify({ pkg, roots: roots.length, typescript: ts.version, diagnostics: 0, written }),
    );
  };
  compile("dynamic-workflow", [owner], emit);
  compile(
    "core",
    [
      "apps/cli/packages/core/test/causality-order-settlement-cases.ts",
      "apps/cli/packages/core/test/causality-order-settlement-fixture.ts",
      "apps/cli/packages/core/test/causality-order-settlement.test.ts",
    ],
    false,
  );
} else {
  const receipt = JSON.parse(
    read("docs/evidence/knorvia-causality-order-settlement-20261002.json"),
  );
  assert.equal(receipt.formatVersion, 1);
  for (const record of [...receipt.files, ...receipt.emitted]) {
    const bytes = read(record.path);
    assert.equal(sha(bytes), record.sha256, record.path);
    assert.equal(bytes.length, record.bytes, record.path);
  }
  const old = (p, commit = receipt.baseline) =>
    execFileSync("git", ["show", `${commit}:${p}`], { cwd: root, encoding: "utf8" });
  for (const p of receipt.immutableFreeze)
    assert.equal(read(p).toString("utf8"), old(p, receipt.freeze), p);
  const before = old(owner),
    current = read(owner).toString("utf8");
  const parse = (text) => {
    const file = ts.createSourceFile("owned.ts", text, ts.ScriptTarget.Latest, true);
    assert.equal(file.parseDiagnostics.length, 0);
    return file;
  };
  const fn = (file, name) =>
    file.statements.find((node) => ts.isFunctionDeclaration(node) && node.name?.text === name);
  const original = parse(before),
    candidate = parse(current);
  let bodyOnly = before;
  for (const name of ["claimAt", "barrier"]) {
    const previousBody = fn(original, name).body.getText(original);
    const newBody = fn(candidate, name).body.getText(candidate);
    assert.notEqual(previousBody, newBody, name);
    bodyOnly = bodyOnly.replace(previousBody, newBody);
  }
  assert.equal(current, bodyOnly, "only two owned function bodies changed");
  const archive = JSON.parse(
    read("apps/cli/packages/core/test/causality-order-settlement-baseline.json"),
  );
  assert.equal(sha(before), archive.sourceSha256);
  assert.equal(sha(archive.compiled), archive.emittedSha256);
  assert.equal(sha(archive.declaration), archive.declarationSha256);
  assert.equal(read(receipt.emitted[1].path).toString("utf8"), archive.declaration);
  const publisher = execFileSync("git", ["cat-file", "blob", archive.publisherBlob], {
    cwd: root,
    encoding: "utf8",
  }).replace(/\r\n/gu, "\n");
  assert.equal(publisher, before);
  for (const name of Object.keys(archive.consumers))
    assert.equal(
      sha(read(`apps/cli/packages/dynamic-workflow/dist/analysis/${name}.js`)),
      archive.consumers[name],
      name,
    );
  const changed = execFileSync("git", ["diff", "--name-only", receipt.baseline], {
    cwd: root,
    encoding: "utf8",
  })
    .trim()
    .split("\n")
    .filter(Boolean);
  const untracked = execFileSync("git", ["ls-files", "--others", "--exclude-standard"], {
    cwd: root,
    encoding: "utf8",
  })
    .trim()
    .split("\n")
    .filter(Boolean);
  for (const p of [...changed, ...untracked]) assert.ok(receipt.scope.includes(p), p);
  if (process.argv.includes("--local-logs"))
    for (const record of receipt.logs)
      assert.equal(sha(readFileSync(record.path)), record.sha256, record.path);
  console.log(
    JSON.stringify({
      ok: true,
      digests: receipt.files.length + receipt.emitted.length,
      frozen: receipt.immutableFreeze.length,
      unchangedConsumerArtifacts: Object.keys(archive.consumers).length,
      publicDeclarationExact: true,
      ownedBodies: 2,
      outsideScopeUnchanged: true,
    }),
  );
}
