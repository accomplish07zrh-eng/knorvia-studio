import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  inspectComments,
  syntaxDigest,
} from "../../apps/cli/packages/core/test/causality-reduction-documentation-proof.ts";
import { loadCardinalityDeclarationProof } from "../../apps/cli/packages/core/test/fanout-cardinality-documentation-proof.ts";

const root = fileURLToPath(new URL("../../", import.meta.url));
const read = (p) => readFileSync(path.join(root, p));
const sha = (bytes) => createHash("sha256").update(bytes).digest("hex");
const receipt = JSON.parse(
  read("docs/evidence/knorvia-fanout-cardinality-documentation-20261001.json"),
);
const old = (p) => execFileSync("git", ["show", `${receipt.baseline}:${p}`], { cwd: root });
for (const item of [...receipt.files, ...receipt.emitted]) {
  assert.equal(sha(read(item.path)), item.sha256, item.path);
  assert.equal(read(item.path).length, item.bytes, item.path);
}
for (const p of receipt.unchanged) assert.deepEqual(read(p), old(p), p);
const proof = await loadCardinalityDeclarationProof();
const previous = old(receipt.owner).toString("utf8");
const source = read(receipt.owner).toString("utf8");
assert.equal(sha(previous), proof.sourceSha256);
assert.equal(syntaxDigest(previous), proof.sourceSyntaxSha256);
assert.equal(syntaxDigest(source), proof.sourceSyntaxSha256);
assert.equal(source, previous.replace(inspectComments(previous)[0], inspectComments(source)[0]));
const ts = createRequire(path.join(root, "package.json"))("typescript");
const configPath = path.join(root, "apps/cli/packages/dynamic-workflow/tsconfig.json");
const config = ts.readConfigFile(configPath, ts.sys.readFile);
assert.equal(config.error, undefined);
const parsed = ts.parseJsonConfigFileContent(config.config, ts.sys, path.dirname(configPath));
const owner = path.join(root, receipt.owner),
  host = ts.createCompilerHost(parsed.options);
const getSourceFile = host.getSourceFile.bind(host);
host.getSourceFile = (name, languageVersion, onError, fresh) =>
  path.resolve(name) === owner
    ? ts.createSourceFile(name, previous, languageVersion, true)
    : getSourceFile(name, languageVersion, onError, fresh);
const program = ts.createProgram({ rootNames: [owner], options: parsed.options, host });
const historical = new Map();
const result = program.emit(program.getSourceFile(owner), (name, text) =>
  historical.set(path.basename(name), text),
);
assert.equal(result.emitSkipped, false);
assert.equal(result.diagnostics.length, 0);
assert.equal(sha(historical.get("fanout-cardinality.js")), proof.emittedSha256);
assert.equal(historical.get("fanout-cardinality.d.ts"), proof.declaration);
assert.equal(
  syntaxDigest(read(receipt.emitted[0].path).toString("utf8"), true),
  proof.emittedSyntaxSha256,
);
assert.equal(
  syntaxDigest(read(receipt.emitted[1].path).toString("utf8")),
  proof.declarationSyntaxSha256,
);
for (const [p, javascript, comments] of [
  [receipt.owner, false, receipt.comments.source],
  [receipt.emitted[0].path, true, receipt.comments.emitted],
  [receipt.emitted[1].path, false, receipt.comments.declaration],
])
  assert.deepEqual(inspectComments(read(p).toString("utf8"), javascript), comments);
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
    unchanged: receipt.unchanged.length,
    syntaxTrees: 3,
    commentReplacements: 1,
  }),
);
