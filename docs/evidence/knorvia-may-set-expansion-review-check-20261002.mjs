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
const git = (...args) => execFileSync("git", args, { cwd: root, encoding: "utf8" });
const receipt = JSON.parse(read("docs/evidence/knorvia-may-set-expansion-review-20261002.json"));
assert.equal(receipt.formatVersion, 1);
assert.equal(receipt.decision, "Retain mixed expansion; no production change");
for (const item of [...receipt.files, ...receipt.artifacts]) {
  const bytes = read(item.path);
  assert.equal(bytes.length, item.bytes, item.path);
  assert.equal(sha(bytes), item.sha256, item.path);
}
const ts = createRequire(path.join(root, "package.json"))("typescript");
const parsed = (text, js = false) => {
  const file = ts.createSourceFile(
    "lanes",
    text,
    ts.ScriptTarget.Latest,
    true,
    js ? ts.ScriptKind.JS : ts.ScriptKind.TS,
  );
  assert.equal(file.parseDiagnostics.length, 0);
  return file;
};
const named = (file, name) => {
  const found = file.statements.filter(
    (node) => ts.isFunctionDeclaration(node) && node.name?.text === name,
  );
  assert.equal(found.length, 1, name);
  return found[0];
};
const source = parsed(read(receipt.owner).toString("utf8"));
const previous = parsed(git("show", `${receipt.previousExpansion}:${receipt.owner}`));
const body = named(source, "expandMaySetLanes").body.getText(source);
assert.equal(body, named(previous, "expandMaySetLanes").body.getText(previous));
assert.equal(Buffer.byteLength(body), receipt.body.bytes);
assert.equal(sha(body), receipt.body.sha256);
const publisherText = git("cat-file", "blob", receipt.publisher.blob).replace(/\r\n/gu, "\n");
assert.equal(sha(publisherText), receipt.publisher.normalizedSha256);
assert.equal(Buffer.byteLength(publisherText), receipt.publisher.bytes);
const publisher = parsed(publisherText);
assert.equal(
  named(source, "weakest").getText(source),
  named(publisher, "weakest").getText(publisher),
);
const archive = JSON.parse(read(receipt.archive));
assert.equal(sha(archive.compiled), receipt.historical.emittedSha256);
assert.equal(sha(archive.declaration), receipt.historical.declarationSha256);
const oldJs = parsed(archive.compiled, true);
const currentJs = parsed(read(receipt.artifacts[1].path).toString("utf8"), true);
const printer = ts.createPrinter({ removeComments: true });
const select = (file, predicate) => {
  const found = [];
  const visit = (node) => {
    if (predicate(node, file)) found.push(printer.printNode(ts.EmitHint.Unspecified, node, file));
    ts.forEachChild(node, visit);
  };
  visit(named(file, "expandMaySetLanes"));
  assert.equal(found.length, 1);
  return found[0];
};
for (const field of ["source: step.id", "from: tail.id"]) {
  const predicate = (node, file) =>
    ts.isObjectLiteralExpression(node) &&
    node.properties.some((property) => property.getText(file) === field);
  assert.equal(select(currentJs, predicate), select(oldJs, predicate), field);
}
const fifo = (node, file) =>
  ts.isIfStatement(node) &&
  node.expression.getText(file) === 'edge.kind === "fifo" && tail.lane !== head.lane';
assert.equal(select(currentJs, fifo), select(oldJs, fifo));
const changed = git("diff", "--name-only", receipt.baseline).trim().split("\n").filter(Boolean);
const untracked = git("ls-files", "--others", "--exclude-standard")
  .trim()
  .split("\n")
  .filter(Boolean);
for (const p of [...changed, ...untracked]) assert.ok(receipt.scope.includes(p), p);
assert.equal(receipt.coverage.neighboringSmoke.isMaySetDifferential, false);
assert.equal(receipt.coverage.endpointGettersCovered, false);
assert.equal(receipt.coverage.simultaneousCallsProved, false);
console.log(
  JSON.stringify({
    ok: true,
    digests: receipt.files.length + receipt.artifacts.length,
    bodyUnchanged: true,
    retainedCloneAndFifoExpressions: 3,
    behavioralRuns: 0,
    productionChanges: 0,
  }),
);
