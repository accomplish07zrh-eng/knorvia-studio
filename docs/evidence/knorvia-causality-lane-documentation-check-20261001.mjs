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
import { loadLaneDocumentaryProof } from "../../apps/cli/packages/core/test/causality-lane-documentation-proof.ts";

const root = fileURLToPath(new URL("../../", import.meta.url));
const read = (p) => readFileSync(path.join(root, p));
const sha = (bytes) => createHash("sha256").update(bytes).digest("hex");
const receipt = JSON.parse(
  read("docs/evidence/knorvia-causality-lane-documentation-20261001.json"),
);
const protectedReceipt = read(receipt.protectedReceipt.path);
assert.equal(sha(protectedReceipt), receipt.protectedReceipt.sha256);
const protectedFiles = JSON.parse(protectedReceipt).protected.filter(
  (item) => item.path !== "apps/cli/packages/core/test/may-set-lane-expansion-fixture.ts",
);
for (const item of [...receipt.files, ...receipt.emitted, ...protectedFiles]) {
  assert.equal(sha(read(item.path)), item.sha256, item.path);
  assert.equal(read(item.path).length, item.bytes, item.path);
}
const old = (p) =>
  execFileSync("git", ["show", `${receipt.baseline}:${p}`], { cwd: root }).toString("utf8");
for (const p of receipt.unchanged) assert.equal(read(p).toString("utf8"), old(p), p);
const proof = await loadLaneDocumentaryProof();
const source = read(receipt.owner).toString("utf8"),
  previous = old(receipt.owner);
assert.equal(sha(previous), proof.sourceSha256);
assert.equal(syntaxDigest(previous), proof.sourceSyntaxSha256);
assert.equal(syntaxDigest(source), proof.sourceSyntaxSha256);
const before = inspectComments(previous),
  after = inspectComments(source);
let replacement = previous.replace(before.slice(0, 3).join("\n"), after[0]);
for (const [from, to] of [
  [3, 1],
  [4, 2],
  [5, 3],
  [8, 6],
])
  replacement = replacement.replace(before[from], after[to]);
replacement = replacement.replace(
  "export function weakest(",
  `${after[7]}\nexport function weakest(`,
);
assert.equal(source, replacement, "only five comment replacements and one addition");
assert.deepEqual(after, receipt.comments.source);
const ts = createRequire(path.join(root, "package.json"))("typescript");
const configPath = path.join(root, "apps/cli/packages/dynamic-workflow/tsconfig.json");
const config = ts.readConfigFile(configPath, ts.sys.readFile);
assert.equal(config.error, undefined);
const parsed = ts.parseJsonConfigFileContent(config.config, ts.sys, path.dirname(configPath));
const owner = path.join(root, receipt.owner),
  host = ts.createCompilerHost(parsed.options);
const getSourceFile = host.getSourceFile.bind(host);
host.getSourceFile = (name, version, onError, fresh) =>
  path.resolve(name) === owner
    ? ts.createSourceFile(name, previous, version, true)
    : getSourceFile(name, version, onError, fresh);
const program = ts.createProgram({ rootNames: [owner], options: parsed.options, host }),
  historical = new Map();
const result = program.emit(program.getSourceFile(owner), (name, text) =>
  historical.set(path.basename(name), text),
);
assert.equal(result.emitSkipped, false);
assert.equal(result.diagnostics.length, 0);
assert.equal(sha(historical.get("causality-graph-lanes.js")), proof.emittedSha256);
assert.equal(historical.get("causality-graph-lanes.d.ts"), proof.declaration);
const js = read(receipt.emitted[0].path).toString("utf8"),
  declaration = read(receipt.emitted[1].path).toString("utf8");
assert.equal(syntaxDigest(js, true), proof.emittedSyntaxSha256);
assert.equal(syntaxDigest(declaration), proof.declarationSyntaxSha256);
assert.deepEqual(inspectComments(js, true), receipt.comments.emitted);
assert.deepEqual(inspectComments(declaration), receipt.comments.declaration);
const fixture = "apps/cli/packages/core/test/may-set-lane-expansion-fixture.ts";
const expected = old(fixture)
  .replace(
    'import { dynamic, sha } from "./causality-reduction-fixture.js";',
    'import { dynamic, sha } from "./causality-reduction-fixture.js";\nimport { assertLaneDeclarationShape } from "./causality-lane-documentation-proof.js";',
  )
  .replace(
    "  assert.equal(pins.declarationSha256, archive.declarationSha256);",
    '  await assertLaneDeclarationShape(\n    await readArtifact(new URL("dist/analysis/causality-graph-lanes.d.ts", root)),\n    archive.declarationSha256,\n  );',
  );
assert.equal(
  read(fixture).toString("utf8"),
  expected,
  "only current documentary assumption migrates",
);
const publisher = execFileSync("git", ["cat-file", "blob", receipt.upstream.blob], { cwd: root })
  .toString("utf8")
  .replace(/\r\n/gu, "\n");
assert.equal(sha(publisher), receipt.upstream.normalizedSha256);
const functionText = (text, name) =>
  ts
    .createSourceFile("owned.ts", text, ts.ScriptTarget.Latest, true)
    .statements.find((n) => ts.isFunctionDeclaration(n) && n.name?.text === name)
    ?.getText();
assert.equal(functionText(source, "weakest"), functionText(publisher, "weakest"));
const guard = (text) => {
  const file = ts.createSourceFile("owned.ts", text, ts.ScriptTarget.Latest, true),
    found = [];
  const visit = (node) => {
    if (ts.isIfStatement(node) && node.expression.getText(file).startsWith('edge.kind === "fifo"'))
      found.push(node.getText(file));
    ts.forEachChild(node, visit);
  };
  visit(file);
  assert.equal(found.length, 1);
  return found[0];
};
assert.equal(syntaxDigest(guard(source)), syntaxDigest(guard(publisher)), "fixed FIFO guard");
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
    protected: protectedFiles.length,
    unchanged: receipt.unchanged.length,
    syntaxTrees: 3,
    parsedSourceComments: after.length,
    weakestAndFifoExact: true,
  }),
);
