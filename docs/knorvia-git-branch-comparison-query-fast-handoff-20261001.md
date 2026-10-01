# Repository branch comparison query checkpoint

Original commits: `9e04a691a776367e84239c8c74f578f088158efe` freezes the spec,
source/strict-emitted contracts and copied-baseline timing comparisons;
`7dca1242f2a3e2198ceb09ce89100265fb5601ef` implements the bounded query/projection.
This appended receipt is evidence-only. Production ownership is only
getBranchComparison in gitCliRepo.ts and private gitBranchComparisonReadPlan.ts,
with five narrow test/oracle files and the spec. First checkpoint af419c9 and all
prior source, evidence and failure proofs remain immutable.

The selected old body exactly equals publisher872ad960/tree d185a9, local
import7619e41 and integrated0d80f9c: SHA256
`2d9750d612f7ae7c4a13e6fac5c95def6a6a29aa441acf3ef712b68ec1a9512e`.
The sibling observations JSON binds exact full paths, commits, Git blobs, file/body
hashes and selected retained expression spans to the existing separately stored
publisher bytes. No upstream implementation was copied into production.

Actual callers are gitService.getBranchComparison and refresh, in-process RPC and
useGitRepository's private repository dataset/section builders. The new synchronous
status/diff operation program keeps both awaits in the original entrypoint. It
selects admission and the exact query before ordered record projection; no extra
awaited orchestration result, cache, retry or model/process-effect owner. The loop
over the actual unchanged numstat Map preserves duplicate last-value/first-position
semantics. Service workspace clipping and UI's later read-only sorting remain in
their existing owners. No supported product defect or policy correction is claimed.

Retained material includes admission predicates, status getter/receiver order,
exact argv/cwd/timeout/output limits, revision and label templates, error prose,
nullish/truthy defaults, record property order, parser/kind calls and stat expressions.
The shared public types/output declarations and unrelated formatting remain retained.
Selected positive exact syntax observations are deliberately non-exhaustive; hashes,
tests, changed line counts and moved expressions are not originality evidence.
All39 other bodies and5 existing owner declarations remain exact. Whole-file
remainder equality masks only this method body, the new helper import and two
now-unused imports, with no whitespace normalization. The one-method oracle is
copied inherited test material compiled in owned memory; fixture conventions reuse
earlier fake ports. New structures are the typed synchronous decision program and
sequential projection traversal with retained compatibility leaves. The repository
file stays mixed/upstream-modified/unreviewed NOASSERTION, and the helper/tests remain
unreviewed candidates. No clean-room, whole-file MIT, accepted-review or licence grant.

Before implementation: **151/151 source and151/151 strict emitted**,3 test files
each:43 query/record/error/getter cases,97 timing comparisons and11 actual consumer
cases. Timing covers70 queued microtask positions over7 boundaries,7 reentrant,
9 settlement invalidations,7 different workspace keys and4 late status/diff outcomes.
It compares exact baseline through the actual unchanged status/resolution owners,
including command counts, reuse/cleanup and visible resolution/rejection order.
An initial incomplete unchanged-source run reported55 cases,54pass,0fail,1cancelled
and exit1 after unavailable-boundary fixture wiring left its driver pending. That
owned run was stopped and the gate wiring corrected before the complete freeze.
The cancellation/pending-promise log hash is retained; no product, assertion, timeout
or concurrency relaxation occurred.

Final grouped source **487/487**, strict emitted **487/487**,9 files each:
new comparison151, first local-branches138, affected service read126 and repository
settlement72. Consumer coverage uses real service/RPC behavior and actual extracted
source/emitted dataset functions, including refresh status coalescing, opt-out,
workspace/rename filtering, original service order, separate UI order and errors.
Types passed with5422 locale keys; configured lint2929 files and owned lint6 files
have0 warnings/errors; owned format8 files and changed/full architecture passed.
Public repo.d.ts remains SHA256
`a6a19273740e97f89c1b0cdc88b160570d45749e6d70edbb2c39850f3f95870b`.
Receipt formatting and the digest/scope replay below are separately checked.

**CLI/desktop builds and full project regression were not run for this second
slice.** The user's grouped cadence supersedes earlier per-checkpoint requirements;
root owns the aggregate integration/publication regression/build. First receipt
af419c9 retains its historical65e65f9 hashes,913-case runs and builds completed
before the cadence change. Those build artifacts are not certified as current here.
No historical matrix or expensive unaffected suite was regenerated.

All product effects use synthetic owned process/fs/clock/status/diff ports. These
Linux source/emitted tests are not live/native Git, Windows/macOS, mounted React,
separate Host or remote acceptance. Root owns the older Windows read-consumer
expected-key correction80d053a; the original lane test and receipt stay unchanged,
and their Linux portability limit remains explicit. Shared licensing/inventory/
notices/dependencies/CI/settings are unchanged. Older lane27 and parent-reported26
material obligations remain separate; no licence/native acceptance closure.

Exact final runners, Node24.14.0/pnpm10.33.2,9 files and487 individual cases each:

```sh
export PATH=/tmp/node-v24.14.0-linux-x64/bin:/tmp/knorvia-tool-bin:$PATH COREPACK_HOME=/tmp/knorvia-corepack
TSX_TSCONFIG_PATH=packages/ui/tsconfig.json node --experimental-test-module-mocks --import tsx --test --test-concurrency=2 packages/services/test/git-branch-comparison-*.test.ts packages/services/test/git-local-branches-*.test.ts packages/services/test/git-read-projection-*.test.ts packages/services/test/git-repository-settlement-contract-fast-20261001.test.ts
KNORVIA_GIT_RESOLUTION_TARGET=dist KNORVIA_GIT_READ_PROJECTION_TARGET=dist node --experimental-test-module-mocks --import tsx --import ./packages/services/test/git-read-projection-emitted-register-fast-20261001.mjs --test --test-concurrency=2 packages/services/test/git-branch-comparison-*.test.ts packages/services/test/git-local-branches-*.test.ts packages/services/test/git-read-projection-*.test.ts packages/services/test/git-repository-settlement-contract-fast-20261001.test.ts
```

The complete pre-code151-case runs use only the git-branch-comparison glob.
Final emitted execution uses current typecheck output and the existing strict loader,
which rejects production source fallbacks; no test runner or budget was changed.

Payload seal: `76e32a298b05eb1ed43845102a773129072e02154c834a3ebc0c8976e4a4ce65`.
Save the following as an owned temporary .mjs and run from this checkpoint's repo
root with Node24.14. It reads owned files and existing local/publisher Git objects
only. It verifies current snapshot identity, exact eight-path scope, retained/body/
owner facts, copied oracle and current type-emitted artifacts; it grants no licence
and does not edit shared inventories. Later production changes require replaying
this historical snapshot, rather than silently rebinding its hashes.

```js
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { createRequire } from "node:module";
const ts = createRequire(`${process.cwd()}/package.json`)("typescript");
const x = JSON.parse(
  readFileSync("docs/knorvia-git-branch-comparison-query-fast-evidence-20261001.json", "utf8"),
);
const hash = (b) => createHash("sha256").update(b).digest("hex");
const git = (a) => execFileSync("git", a, { maxBuffer: 64 * 1024 * 1024 });
const seal = x.payloadSha256;
delete x.payloadSha256;
assert.equal(hash(JSON.stringify(x)), seal);
assert.equal(seal, "76e32a298b05eb1ed43845102a773129072e02154c834a3ebc0c8976e4a4ce65");
assert.equal(x.before, "af419c933205d68f31c3a56c2d259ebed65dc632");
assert.equal(x.freeze, "9e04a691a776367e84239c8c74f578f088158efe");
assert.equal(x.production, "7dca1242f2a3e2198ceb09ce89100265fb5601ef");
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
assert.equal(x.ownedScope.length, 8);
assert.deepEqual(
  x.ownedScope.map((a) => a.path).sort(),
  git(["diff", "--name-only", x.before, x.production]).toString().trim().split("\n").sort(),
);
for (const a of x.ownedScope) {
  assert.equal(a.commit, x.production);
  const bytes = git(["show", `${a.commit}:${a.path}`]);
  assert.equal(hash(bytes), a.sha256);
  assert.equal(bytes.length, a.bytes);
  assert.ok(bytes.equals(readFileSync(a.path)));
  assert.equal(
    git(["rev-parse", `${a.commit}:${a.path}`])
      .toString()
      .trim(),
    a.blob,
  );
}
const main = "packages/services/src/git/repo/gitCliRepo.ts";
const old = git(["show", `${x.before}:${main}`]).toString();
const now = readFileSync(main, "utf8");
const bare = "--git-dir=/tmp/knorvia-services-provenance-upstream-872ad960.git";
const pub = git([bare, "show", `${x.lineage.publisherCommit}:${main}`]).toString();
assert.equal(hash(pub), x.lineage.publisherSourceSha256);
assert.equal(
  git([bare, "rev-parse", `${x.lineage.publisherCommit}^{tree}`])
    .toString()
    .trim(),
  x.lineage.publisherTree,
);
assert.equal(
  git([bare, "rev-parse", `${x.lineage.publisherCommit}:${main}`])
    .toString()
    .trim(),
  x.lineage.publisherBlob,
);
function parse(text) {
  const sf = ts.createSourceFile(main, text, ts.ScriptTarget.Latest, true),
    bodies = new Map(),
    owners = new Map();
  function visit(n) {
    if ((ts.isFunctionDeclaration(n) || ts.isMethodDeclaration(n)) && n.name && n.body)
      bodies.set(n.name.getText(sf), n.body.getText(sf));
    if (ts.isVariableDeclaration(n) && ts.isIdentifier(n.name))
      owners.set(n.name.text, n.getText(sf));
    ts.forEachChild(n, visit);
  }
  visit(sf);
  return { bodies, owners };
}
const a = parse(old),
  b = parse(now);
function remainder(text, baseline) {
  const sf = ts.createSourceFile(main, text, ts.ScriptTarget.Latest, true),
    edits = [];
  function visit(n) {
    if (ts.isMethodDeclaration(n) && n.name.getText(sf) === "getBranchComparison")
      edits.push([n.body.getStart(sf), n.body.end, "{ /* READ_SLICE */ }"]);
    if (
      !baseline &&
      ts.isImportDeclaration(n) &&
      n.moduleSpecifier.text === x.unchangedRemainder.helperImport
    )
      edits.push([n.getStart(sf), n.end + 1, ""]);
    ts.forEachChild(n, visit);
  }
  visit(sf);
  for (const [start, end, value] of edits.sort((l, r) => r[0] - l[0]))
    text = text.slice(0, start) + value + text.slice(end);
  if (baseline)
    for (const name of x.unchangedRemainder.removedImports) text = text.replace(`  ${name},\n`, "");
  return text;
}
assert.equal(remainder(old, true), remainder(now, false));
assert.equal(hash(remainder(now, false)), x.unchangedRemainder.sha256);
assert.equal(x.protectedBodies.length, 39);
assert.equal(x.owners.length, 5);
for (const [records, key] of [
  [x.protectedBodies, "bodies"],
  [x.owners, "owners"],
])
  for (const item of records) {
    assert.equal(a[key].get(item.name), b[key].get(item.name));
    assert.equal(hash(b[key].get(item.name)), item.sha256);
  }
for (const f of [x.lineage.localImport, x.lineage.integratedBaseline, x.lineage.localBaseline]) {
  const bytes = git(["show", `${f.commit}:${f.path}`]);
  assert.equal(hash(bytes), f.sha256);
  assert.equal(
    hash(parse(bytes.toString()).bodies.get("getBranchComparison")),
    x.lineage.scopedBodies[0].baseline.sha256,
  );
}
assert.equal(
  hash(parse(pub).bodies.get("getBranchComparison")),
  x.lineage.scopedBodies[0].publisher.sha256,
);
for (const item of x.retainedSyntax)
  for (const [span, text] of [
    [item.baseline, old],
    [item.publisher, pub],
    [item.current, readFileSync(item.current.path, "utf8")],
  ]) {
    assert.equal(text.slice(span.start, span.end), item.syntax);
    assert.equal(hash(item.syntax), span.sha256);
  }
for (const item of x.newStructures) {
  const span = item.current,
    text = readFileSync(span.path, "utf8");
  assert.equal(hash(text.slice(span.start, span.end)), span.sha256);
}
const oracle = JSON.parse(readFileSync(x.copiedOracle.path, "utf8"));
assert.equal(oracle.commit, x.before);
assert.equal(hash(old), oracle.sourceSha256);
assert.equal(oracle.spans.length, 1);
for (const span of oracle.spans) {
  assert.equal(old.slice(span.start, span.end), span.text);
  assert.equal(hash(span.text), span.sha256);
}
for (const f of x.artifacts) assert.equal(hash(readFileSync(f.path)), f.sha256);
for (const key of ["finalSource", "finalStrictEmitted"]) {
  assert.equal(x.validation[key].pass, 487);
  assert.equal(x.validation[key].files.length, 9);
}
for (const key of ["cliBuild", "desktopBuild", "fullProjectRegression"])
  assert.equal(x.validation[key].run, false);
console.log({ production: x.production, owned: 8, payload: seal });
```
