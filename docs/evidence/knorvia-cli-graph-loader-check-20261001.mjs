import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
const root = fileURLToPath(new URL("../../", import.meta.url));
const read = (path) => readFileSync(new URL(path, new URL("../../", import.meta.url)));
const sha = (bytes) => createHash("sha256").update(bytes).digest("hex");
const git = (...args) => execFileSync("git", args, { cwd: root });
const receipt = JSON.parse(read("docs/evidence/knorvia-cli-graph-loader-20261001.json"));
const check = (record, bytes = read(record.path)) => {
  assert.equal(bytes.length, record.bytes, record.path);
  assert.equal(sha(bytes), record.sha256, record.path);
};
assert.equal(receipt.formatVersion, 1);
assert.equal(receipt.productionChange, false);
assert.equal(receipt.sourceExposure, true);
assert.equal(receipt.wholeFileRightsDecision, null);
for (const file of [...receipt.files, receipt.checker, ...receipt.protectedEvidence]) check(file);
for (const file of receipt.files) check(file, git("show", `${receipt.migration}:${file.path}`));
for (const path of receipt.unchanged)
  assert.deepEqual(read(path), git("show", `${receipt.baseline}:${path}`));
const fixturePath = "apps/cli/packages/core/test/create-workflow-graph-fold-fixture.ts";
const oldFixture = git("show", `${receipt.baseline}:${fixturePath}`).toString(),
  fixture = read(fixturePath).toString();
assert.equal(
  fixture.slice(fixture.indexOf("const edge =")),
  oldFixture.slice(oldFixture.indexOf("const edge =")),
);
const ts = createRequire(import.meta.url)("typescript");
const assertionCalls = (text) => {
  const file = ts.createSourceFile("fixture.ts", text, ts.ScriptTarget.Latest, true),
    calls = [];
  const visit = (node) => {
    if (ts.isCallExpression(node) && node.expression.getText(file).startsWith("assert."))
      calls.push(node.getText(file));
    ts.forEachChild(node, visit);
  };
  visit(file);
  return calls;
};
assert.deepEqual(assertionCalls(fixture), assertionCalls(oldFixture));
const contract = JSON.parse(
  read("apps/cli/packages/core/test/create-workflow-graph-loader-contract.json"),
);
const oldBounds = JSON.parse(
  read("apps/cli/packages/core/test/create-workflow-graph-bounds-implementation-baseline.json"),
);
const oldFold = JSON.parse(
  read("apps/cli/packages/core/test/create-workflow-graph-fold-baseline.json"),
);
assert.equal(
  sha(contract.historical.boundsHeader + oldBounds.owner + contract.historical.boundsTail),
  oldFold.boundsSha256,
);
assert.equal(sha(contract.historical.analysis), oldFold.analysisSha256);
for (const expected of Object.values(contract.current)) {
  for (const [directory, extension, pin] of [
    ["src", ".ts", expected.sourceSha256],
    ["dist", ".js", expected.emittedSha256],
    ["dist", ".d.ts", expected.declarationSha256],
  ]) {
    const path = `apps/cli/packages/core/${directory}/tool/handlers/${expected.module}${extension}`;
    if (directory === "src" || process.argv.includes("--emitted"))
      assert.equal(sha(read(path)), pin, path);
    if (directory === "src")
      assert.deepEqual(read(path), git("show", `${receipt.baseline}:${path}`));
  }
}
const fold = receipt.expression.fold;
const initialFold = git("show", `${receipt.expression.initial}:${fold.path}`).toString();
const reference = initialFold
  .replaceAll("@knorvia/contracts", "@zcode/contracts")
  .replaceAll("@knorvia/dynamic-workflow", "@zcode/dynamic-workflow");
assert.equal(sha(reference), fold.referenceSha256);
assert.equal(
  createHash("sha1")
    .update(
      Buffer.concat([
        Buffer.from(`blob ${Buffer.byteLength(reference)}\0`),
        Buffer.from(reference),
      ]),
    )
    .digest("hex"),
  fold.referenceBlob,
);
const functionText = (source, name) => {
  const file = ts.createSourceFile("owner.ts", source, ts.ScriptTarget.Latest, true);
  const node = file.statements.find(
    (node) => ts.isFunctionDeclaration(node) && node.name?.text === name,
  );
  assert.ok(node, name);
  return node.getText(file);
};
assert.equal(
  functionText(reference, "foldPairs"),
  functionText(read(fold.path).toString(), "foldPairs"),
);
assert.equal(sha(functionText(reference, "foldPairs")), fold.retainedPairTextSha256);
const bounds = receipt.expression.bounds;
const initialBounds = git("show", `${receipt.expression.initial}:${bounds.path}`).toString();
assert.equal(
  sha(functionText(read(bounds.path).toString(), "boundGraphText")),
  sha(functionText(initialBounds, "boundGraphText")),
);
if (process.argv.includes("--logs")) {
  for (const record of receipt.logs) check(record, readFileSync(record.path));
  const prior = JSON.parse(
    read("docs/evidence/knorvia-create-workflow-graph-components-receipt-20261001.json"),
  );
  for (const entry of prior.checks.filter(
    (entry) => entry.stage === "appended regression against initial implementation",
  ))
    check(entry.log, readFileSync(entry.log.path));
}
if (process.argv.includes("--scope"))
  assert.deepEqual(
    git("diff", "--name-only", receipt.baseline)
      .toString()
      .trim()
      .split("\n")
      .filter(Boolean)
      .sort(),
    [...receipt.scope].sort(),
  );
console.log(
  JSON.stringify({
    currentModules: 3,
    preservedAssertions: assertionCalls(fixture).length,
    exactHistoricalBounds: true,
    pinnedFoldContent: true,
    publisherTreeAcquisitionVerified: false,
    sourceTests: 26,
    emittedTests: 21,
    overlappingGroups: 21,
    newGroups: 3,
    productionChange: false,
    wholeFileRightsDecision: null,
  }),
);
