import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  assertDeclarationShape,
  inspectComments,
  loadDeclarationProof,
  syntaxDigest,
} from "../../apps/cli/packages/core/test/causality-reduction-documentation-proof.ts";

const root = fileURLToPath(new URL("../../", import.meta.url));
const read = (p) => readFileSync(path.join(root, p));
const sha = (bytes) => createHash("sha256").update(bytes).digest("hex");
const receipt = JSON.parse(
  read("docs/evidence/knorvia-causality-reduction-documentation-20261001.json"),
);
const old = (p) => execFileSync("git", ["show", `${receipt.baseline}:${p}`], { cwd: root });
for (const item of [...receipt.files, ...receipt.emitted]) {
  const bytes = read(item.path);
  assert.equal(bytes.length, item.bytes, item.path);
  assert.equal(sha(bytes), item.sha256, item.path);
}
for (const p of receipt.unchanged) assert.deepEqual(read(p), old(p), p);
const proof = await loadDeclarationProof();
const source = read(receipt.owner).toString("utf8");
const previousSource = old(receipt.owner).toString("utf8");
assert.equal(sha(previousSource), proof.sourceSha256);
assert.equal(syntaxDigest(previousSource), proof.sourceSyntaxSha256);
assert.equal(syntaxDigest(source), proof.sourceSyntaxSha256);
const previousComments = inspectComments(previousSource);
const comments = inspectComments(source);
let documentaryReplacement = previousSource;
for (const index of [0, 1, 2, 4])
  documentaryReplacement = documentaryReplacement.replace(previousComments[index], comments[index]);
assert.equal(source, documentaryReplacement, "exactly four comment replacements");
assert.deepEqual(comments, receipt.comments.source);

const ts = createRequire(path.join(root, "package.json"))("typescript");
const configPath = path.join(root, "apps/cli/packages/dynamic-workflow/tsconfig.json");
const config = ts.readConfigFile(configPath, ts.sys.readFile);
assert.equal(config.error, undefined);
const parsed = ts.parseJsonConfigFileContent(config.config, ts.sys, path.dirname(configPath));
const ownerPath = path.join(root, receipt.owner);
const host = ts.createCompilerHost(parsed.options);
const getSourceFile = host.getSourceFile.bind(host);
host.getSourceFile = (name, languageVersion, onError, fresh) =>
  path.resolve(name) === ownerPath
    ? ts.createSourceFile(name, previousSource, languageVersion, true)
    : getSourceFile(name, languageVersion, onError, fresh);
const program = ts.createProgram({ rootNames: [ownerPath], options: parsed.options, host });
const historical = new Map();
const result = program.emit(program.getSourceFile(ownerPath), (name, text) =>
  historical.set(path.basename(name), text),
);
assert.equal(result.emitSkipped, false);
assert.equal(result.diagnostics.length, 0);
const previousJs = historical.get("causality-reduce.js");
assert.equal(sha(previousJs), proof.emittedSha256, "reconstructed exact pre-documentation JS");
assert.equal(historical.get("causality-reduce.d.ts"), proof.declaration);
assert.equal(syntaxDigest(previousJs, true), proof.emittedSyntaxSha256);
const currentJs = read(receipt.emitted[0].path).toString("utf8");
const declaration = read(receipt.emitted[1].path).toString("utf8");
assert.equal(syntaxDigest(currentJs, true), proof.emittedSyntaxSha256);
await assertDeclarationShape(declaration, proof.declarationSha256);
assert.deepEqual(inspectComments(currentJs, true), receipt.comments.emitted);
assert.deepEqual(inspectComments(declaration), receipt.comments.declaration);

const fixture = "apps/cli/packages/core/test/causality-reduction-fixture.ts";
const expectedFixture = old(fixture)
  .toString("utf8")
  .replace(
    'import dns from "node:dns";\n',
    'import dns from "node:dns";\nimport { assertDeclarationShape } from "./causality-reduction-documentation-proof.js";\n',
  )
  .replace(
    "  assert.equal(pins.declarationSha256, archive.declarationSha256);",
    '  await assertDeclarationShape(\n    await readArtifact(new URL("dist/analysis/causality-reduce.d.ts", root)),\n    archive.declarationSha256,\n  );',
  );
assert.equal(read(fixture).toString("utf8"), expectedFixture);
const changes = execFileSync("git", ["diff", "--name-only", receipt.baseline], {
  cwd: root,
  encoding: "utf8",
}).trim();
for (const p of changes ? changes.split("\n") : []) assert.ok(receipt.scope.includes(p), p);
console.log(
  JSON.stringify({
    digests: receipt.files.length + receipt.emitted.length,
    unchanged: receipt.unchanged.length,
    syntaxTrees: 3,
    commentReplacements: 4,
    outsideScopeUnchanged: true,
    ok: true,
  }),
);
