// Read-only lane evidence replay, not a product Git port or licence decision.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import ts from "typescript";
const x = JSON.parse(readFileSync(process.argv[2], "utf8"));
const hash = (b) => createHash("sha256").update(b).digest("hex");
const git = (a) => execFileSync("git", a, { maxBuffer: 64 * 1024 * 1024 });
const source = (c, p = x.path) => git(["show", `${c}:${p}`]).toString();
const seal = x.payloadSha256;
delete x.payloadSha256;
assert.equal(hash(JSON.stringify(x)), seal);
assert.equal(x.schemaVersion, 1);
assert.equal(x.path, "packages/services/src/git/repo/gitCliRepo.ts");
assert.equal(x.helper, "packages/services/src/git/repo/gitDiffReadPlan.ts");
assert.equal(x.sourceExposure, true);
assert.equal(x.wholeFileLicenseGrant, false);
assert.equal(x.acceptedReview, false);
assert.equal(
  git(["rev-parse", `${x.freeze}^`])
    .toString()
    .trim(),
  x.before,
);
assert.equal(
  git(["rev-parse", `${x.production}^`])
    .toString()
    .trim(),
  x.freeze,
);
assert.deepEqual(
  x.ownedScope.map((f) => f.path).sort(),
  git(["diff", "--name-only", x.before, x.production]).toString().trim().split("\n").sort(),
);
for (const f of x.ownedScope) {
  assert.equal(f.commit, x.production);
  const bytes = git(["show", `${f.commit}:${f.path}`]);
  assert.equal(hash(bytes), f.sha256);
  assert.equal(bytes.length, f.bytes);
  assert.equal(
    git(["rev-parse", `${f.commit}:${f.path}`])
      .toString()
      .trim(),
    f.blob,
  );
  if (process.argv.includes("--current")) assert.ok(bytes.equals(readFileSync(f.path)));
}
function method(text) {
  const sf = ts.createSourceFile(x.path, text, ts.ScriptTarget.Latest, true);
  let found;
  function visit(n) {
    if (ts.isMethodDeclaration(n) && n.name.getText(sf) === "getDiff") found = n;
    ts.forEachChild(n, visit);
  }
  visit(sf);
  assert.ok(found);
  return { sf, node: found, body: found.body.getText(sf) };
}
const old = source(x.before),
  now = source(x.production);
const bare = "--git-dir=/tmp/knorvia-services-provenance-upstream-872ad960.git";
assert.equal(x.publisher.commit, "872ad960de7ec172591f7e1952f7849229f94521");
const publisher = git([bare, "show", `${x.publisher.commit}:${x.path}`]).toString();
assert.equal(hash(publisher), x.publisher.sha256);
assert.equal(
  git([bare, "rev-parse", `${x.publisher.commit}^{tree}`])
    .toString()
    .trim(),
  x.publisher.tree,
);
assert.equal(
  git([bare, "rev-parse", `${x.publisher.commit}:${x.path}`])
    .toString()
    .trim(),
  x.publisher.blob,
);
assert.equal(git([bare, "ls-tree", x.publisher.commit, x.helper]).toString(), "");
assert.equal(hash(method(old).body), x.baselineBodySha256);
for (const l of x.lineage) {
  const text = l.kind === "publisher" ? publisher : source(l.commit);
  assert.equal(hash(text), l.fileSha256);
  assert.equal(method(text).body, method(old).body);
}
function remainder(text, current) {
  const m = method(text);
  const signature = text.slice(m.node.getStart(m.sf), m.node.body.getStart(m.sf));
  assert.equal(signature, x.publicSignature);
  text =
    text.slice(0, m.node.body.getStart(m.sf)) +
    "{ /* DIFF_READ_SCOPE */ }" +
    text.slice(m.node.body.end);
  if (current) text = text.replace('import { planGitDiffRead } from "./gitDiffReadPlan.js";\n', "");
  else for (const name of x.removedImports) text = text.replace(`  ${name},\n`, "");
  return text;
}
assert.equal(remainder(old, false), remainder(now, true));
assert.equal(hash(remainder(now, true)), x.remainderSha256);
for (const p of x.protectedFiles) {
  assert.equal(source(x.before, p.path), source(x.production, p.path));
  assert.equal(hash(source(x.production, p.path)), p.sha256);
}
const oracle = JSON.parse(source(x.production, x.oracle.path));
assert.equal(oracle.commit, x.before);
assert.equal(oracle.sourceSha256, hash(old));
assert.equal(oracle.spans.length, 10);
for (const s of oracle.spans) {
  assert.equal(old.slice(s.start, s.end), s.text);
  assert.equal(hash(s.text), s.sha256);
}
const helper = source(x.production, x.helper);
for (const s of x.retainedSyntax) {
  for (const [span, text] of [
    [s.baseline, old],
    [s.publisher, publisher],
    [s.current, helper],
  ])
    assert.equal(text.slice(span[0], span[1]), s.syntax);
}
function assertions(text) {
  const sf = ts.createSourceFile("test.ts", text, ts.ScriptTarget.Latest, true),
    calls = [];
  function visit(n) {
    if (ts.isCallExpression(n) && n.expression.getText(sf).startsWith("assert."))
      calls.push(n.getText(sf));
    ts.forEachChild(n, visit);
  }
  visit(sf);
  return calls;
}
for (const path of x.assertionPreservingLintFiles)
  assert.deepEqual(assertions(source(x.freeze, path)), assertions(source(x.production, path)));
if (process.argv.includes("--current"))
  for (const a of x.artifacts) assert.equal(hash(readFileSync(a.path)), a.sha256);
for (const mode of ["source", "strictEmitted"]) {
  assert.equal(x.validation[mode].cases, 178);
  assert.equal(x.validation[mode].pass, 178);
  assert.equal(x.validation[mode].fail, 0);
}
assert.equal(x.validation.fullRegressionRun, false);
assert.equal(x.validation.cliDesktopBuildsRun, false);
console.log({ production: x.production, ownedPaths: x.ownedScope.length, payload: seal });
