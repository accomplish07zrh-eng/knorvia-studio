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
const receipt = JSON.parse(
  read("docs/evidence/knorvia-causality-order-strands-review-20261002.json"),
);
assert.equal(receipt.formatVersion, 1);
assert.equal(receipt.decision, "Retain inherited/unresolved; no production reconstruction");
assert.equal(receipt.productionChanges, 0);
assert.equal(receipt.sourceExposure, true);
for (const item of receipt.files) assert.equal(sha(read(item.path)), item.sha256, item.path);
const prefix = "apps/cli/packages/dynamic-workflow/";
const pins = JSON.parse(read(receipt.selector));
assert.equal(pins.formatVersion, 1);
for (const [p, digest] of Object.entries(pins.files))
  assert.equal(sha(read(prefix + p)), digest, p);
const source = read(receipt.owner).toString("utf8");
assert.equal(source, git("show", `${receipt.baseline}:${receipt.owner}`));
const publisher = git("cat-file", "blob", receipt.publisher.blob);
assert.equal(source, publisher);
assert.equal(sha(source), receipt.publisher.sha256);
assert.equal(Buffer.byteLength(source), receipt.publisher.bytes);
const inventory = JSON.parse(read("licensing/upstream-baseline.json"));
assert.equal(inventory.commit, receipt.publisher.commit);
const item = inventory.files.find((entry) => entry.path === receipt.publisher.path);
assert.equal(item.blob, receipt.publisher.blob);
assert.equal(item.sha256, receipt.publisher.sha256);
const archive = JSON.parse(read(receipt.archive));
assert.equal(archive.baselineCommit, receipt.baseline);
assert.equal(sha(archive.compiled), archive.emittedSha256);
assert.equal(sha(archive.declaration), archive.declarationSha256);
assert.equal(
  archive.compiled,
  read(prefix + "dist/analysis/causality-order-strands.js").toString("utf8"),
);
assert.equal(
  archive.declaration,
  read(prefix + "dist/analysis/causality-order-strands.d.ts").toString("utf8"),
);
for (const [p, digest] of Object.entries(archive.dependencies))
  assert.equal(pins.files[p], digest, p);
for (const item of receipt.files.filter((item) => receipt.frozenPaths.includes(item.path)))
  assert.equal(sha(git("show", `${receipt.freeze}:${item.path}`)), item.sha256, item.path);

const ts = createRequire(path.join(root, "package.json"))("typescript");
const parsed = ts.createSourceFile("owned.ts", source, ts.ScriptTarget.Latest, true);
assert.equal(parsed.parseDiagnostics.length, 0);
const functions = parsed.statements.filter(ts.isFunctionDeclaration).map((node) => node.name.text);
assert.deepEqual(functions, receipt.retainedFunctions);
const ranges = new Map();
const visit = (node) => {
  for (const range of [
    ...(ts.getLeadingCommentRanges(source, node.pos) ?? []),
    ...(ts.getTrailingCommentRanges(source, node.end) ?? []),
  ])
    ranges.set(range.pos, range);
  for (const child of node.getChildren(parsed)) visit(child);
};
visit(parsed);
assert.ok(ranges.size > 0);
const comments = [...ranges.values()]
  .sort((a, b) => a.pos - b.pos)
  .map((r) => source.slice(r.pos, r.end));
assert.equal(sha(JSON.stringify(comments)), receipt.retainedCommentsSha256);
assert.equal(comments.length, receipt.retainedCommentCount);

const changed = git("diff", "--name-only", receipt.baseline).trim().split("\n").filter(Boolean);
const untracked = git("ls-files", "--others", "--exclude-standard")
  .trim()
  .split("\n")
  .filter(Boolean);
for (const p of [...changed, ...untracked]) assert.ok(receipt.scope.includes(p), p);
assert.equal(receipt.validation.sourceGroups, 6);
assert.equal(receipt.validation.emittedGroups, 6);
assert.equal(receipt.validation.consumerScriptsInsideGroupSix, 3);
assert.equal(receipt.validation.productionEmit, false);
console.log(
  JSON.stringify({
    ok: true,
    selectedArtifacts: Object.keys(pins.files).length,
    frozenFiles: receipt.frozenPaths.length,
    retainedFunctions: functions.length,
    retainedComments: comments.length,
    productionUnchanged: true,
    inheritedUnresolved: true,
  }),
);
