// Read-only lane source-evidence replay. Not a product Git port or licence review.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import ts from "typescript";

const record = JSON.parse(readFileSync(process.argv[2], "utf8"));
const hash = (b) => createHash("sha256").update(b).digest("hex");
const git = (a) => execFileSync("git", a, { maxBuffer: 64 * 1024 * 1024 });
const seal = record.payloadSha256;
delete record.payloadSha256;
assert.equal(hash(JSON.stringify(record)), seal);
assert.equal(record.schemaVersion, 1);
assert.equal(record.sourceExposure, true);
assert.equal(record.wholeFileLicenseGrant, false);
const main = "packages/services/src/git/repo/gitCliHelpers.ts";
assert.equal(record.path, main);
assert.equal(
  git(["rev-parse", `${record.freeze}^`])
    .toString()
    .trim(),
  record.before,
);
assert.equal(
  git(["rev-parse", `${record.production}^`])
    .toString()
    .trim(),
  record.freeze,
);
const source = (commit, path = main) => git(["show", `${commit}:${path}`]).toString();
const old = source(record.before),
  now = source(record.production);
assert.deepEqual(
  record.ownedScope.map((a) => a.path).sort(),
  git(["diff", "--name-only", record.before, record.production])
    .toString()
    .trim()
    .split("\n")
    .sort(),
);
for (const a of record.ownedScope) {
  assert.equal(a.commit, record.production);
  const bytes = git(["show", `${a.commit}:${a.path}`]);
  assert.equal(hash(bytes), a.sha256);
  assert.equal(bytes.length, a.bytes);
  assert.equal(
    git(["rev-parse", `${a.commit}:${a.path}`])
      .toString()
      .trim(),
    a.blob,
  );
  if (process.argv.includes("--current")) assert.ok(bytes.equals(readFileSync(a.path)));
}
function parse(text) {
  const sf = ts.createSourceFile(main, text, ts.ScriptTarget.Latest, true),
    functions = new Map();
  function visit(n) {
    if (ts.isFunctionDeclaration(n) && n.name) functions.set(n.name.text, n);
    ts.forEachChild(n, visit);
  }
  visit(sf);
  return { sf, functions };
}
const a = parse(old),
  b = parse(now);
const bare = "--git-dir=/tmp/knorvia-services-provenance-upstream-872ad960.git";
assert.equal(record.publisher.commit, "872ad960de7ec172591f7e1952f7849229f94521");
const publisher = git([bare, "show", `${record.publisher.commit}:${main}`]).toString();
assert.equal(hash(publisher), record.publisher.sha256);
assert.equal(
  git([bare, "rev-parse", `${record.publisher.commit}^{tree}`])
    .toString()
    .trim(),
  record.publisher.tree,
);
assert.equal(
  git([bare, "rev-parse", `${record.publisher.commit}:${main}`])
    .toString()
    .trim(),
  record.publisher.blob,
);
for (const f of record.lineage) {
  const text = f.kind === "publisher" ? publisher : source(f.commit);
  assert.equal(hash(text), f.sha256);
  const p = parse(text);
  for (const name of record.scopedFunctions)
    assert.equal(
      p.functions.get(name).body.getText(p.sf),
      a.functions.get(name).body.getText(a.sf),
    );
}
let protectedCount = 0;
for (const [name, n] of a.functions) {
  if (record.scopedFunctions.includes(name)) continue;
  assert.equal(n.getText(a.sf), b.functions.get(name).getText(b.sf), name);
  protectedCount++;
}
assert.equal(protectedCount, record.protectedHelpers);
function remainder(text, ast, current) {
  const edits = [];
  for (const [name, n] of ast.functions) {
    if (record.scopedFunctions.includes(name))
      edits.push([n.body.getStart(ast.sf), n.body.end, "{ /* PARSER_SCOPE */ }"]);
    if (current && record.newPrivateFunctions.includes(name))
      edits.push([n.getStart(ast.sf), n.end + 2, ""]);
  }
  for (const [start, end, value] of edits.sort((l, r) => r[0] - l[0]))
    text = text.slice(0, start) + value + text.slice(end);
  return text;
}
assert.equal(remainder(old, a, false), remainder(now, b, true));
assert.equal(hash(remainder(now, b, true)), record.remainderSha256);
for (const f of record.protectedFiles) {
  assert.equal(source(record.before, f.path), source(record.production, f.path));
  assert.equal(hash(source(record.production, f.path)), f.sha256);
}
for (const s of record.retainedSyntax) {
  for (const [span, text] of [
    [s.baseline, old],
    [s.publisher, publisher],
    [s.current, now],
  ])
    assert.equal(text.slice(span.start, span.end), s.syntax);
}
const oracle = JSON.parse(source(record.production, record.oracle.path));
assert.equal(oracle.commit, record.before);
assert.equal(oracle.sourceSha256, hash(old));
for (const s of oracle.spans) {
  assert.equal(old.slice(s.start, s.end), s.text);
  assert.equal(hash(s.text), s.sha256);
}
if (process.argv.includes("--current"))
  for (const f of record.artifacts) assert.equal(hash(readFileSync(f.path)), f.sha256);
for (const key of ["source", "strictEmitted"]) assert.equal(record.validation[key].fail, 0);
assert.equal(record.validation.fullRegression.run, false);
assert.equal(record.validation.cliDesktopBuilds.run, false);
console.log({
  production: record.production,
  scope: record.scopedFunctions,
  protectedHelpers: protectedCount,
  payload: seal,
});
