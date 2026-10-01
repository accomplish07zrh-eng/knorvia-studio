# Local branch query checkpoint

Original commits: `f2dcab8baffc5f23f21f52e3e67a297a6ae16557` freezes scope/spec,
source/emitted and baseline timing; `65e65f95655c715eb9002fc3115ef48e33e6dec8`
implements the query/record boundary. This receipt is evidence-only. Owned paths
are listLocalBranches/parseBranchRefRecords in gitCliRepo.ts, the private
gitLocalBranchReadPlan.ts, five narrowly named test/oracle files and the spec.
No unrelated source, shared records or prior receipt changes.

The two selected bodies equal publisher872ad960/tree d185a9 and local
import7619e41/integrated0d80f9c exactly. Old body digests: parser641734f6,
methodfbeb58f3; exact hashes/spans are in the sibling observations JSON. Actual
callers are gitService.getLocalBranches, real RPC and useGitBranchSwitcher.loadBranches.
The implementation uses typed synchronous status/refs decisions and sequential
record admission, preserving the existing entrypoint's2 awaits and actual status/
resolution in-flight owners. No async orchestration promise, new cache or retry.

Retained numeric/CRLF/LF/NUL/field/default/comparator/query/error/public-shape
expressions are explicitly source-exposed. There are53 distinct positive exact
syntax observations with publisher/local/current spans, not an exhaustive or
originality metric. Comparator compatibility is retained, not claimed as a new
sort policy. All39 other bodies and5 owner declarations are byte-identical; the
whole-file remainder matches after masking only the scoped method, removed private
parser, new helper import and now-unused type import, without whitespace normalization.
The old method/parser JSON is copied test-only inherited material compiled in
memory, never production implementation. Fixtures reuse earlier owned harness
conventions and extract the actual source/emitted UI callback. No clean-room,
whole-file MIT, accepted review or native-acceptance claim. Whole repo remains mixed,
upstream-modified/unreviewed NOASSERTION; helper/oracle remain unreviewed candidates.

Before code: **138/138 source and138/138 strict emitted**,3 test files each:
42 record/query cases,85 timing comparisons and11 service/RPC/UI cases.
Timing covers60 queued microtask positions over6 boundaries,6 reentrant,9 settlement
invalidation,6 different keys and4 late status/refs outcomes through actual owners.
Two initial unchanged-source runs were136pass/2fail due to malformed owned status
header format/separators; the fixture was corrected to actual NUL-separated
porcelain-v2 headers before freeze. Assertions and production were not weakened.

Final source **913/913**, strict emitted **913/913**,20 files each: new138 plus
prior775 Git cases. Actual loadBranches tests preserve delayed loading/result and
warning/toast/finally order. Public repo.d.ts SHA256 remains
`a6a19273740e97f89c1b0cdc88b160570d45749e6d70edbb2c39850f3f95870b`.
Types5422locale keys, configured lint, separately owned6-file lint, format and
changed/full architecture passed with0 warnings/errors/violations. CLI17tasks/
16cached and desktop main/host/scheduler/preload/renderer builds had already passed
before the user changed cadence; Windows CUA staging skipped on Linux and existing
build warning categories retained. **No full project regression was started for
this checkpoint.** Root now owns one aggregate build/regression per integration/
publication batch; the original frozen spec's earlier per-checkpoint gate wording
is superseded by that user instruction, not silently rewritten.

Only owned fake process/fs/settings/clock/status inputs. Source/strict emitted repo,
service/RPC and extracted callback acceptance is not React/native Git, Windows/
macOS or separate remote Host acceptance. Old ignored-path775/full7194 and other
historical counts/hashes/proofs remain intact, not current-certification substitutions.
No repeated historical matrix was regenerated. Shared notices/licensing/deps/CI/
settings remain exact; older lane27 and root's reported26 obligations remain separate.

Exact scoped runners use Node24.14.0 and the existing strict dist loader:

```sh
export PATH=/tmp/node-v24.14.0-linux-x64/bin:/tmp/knorvia-tool-bin:$PATH COREPACK_HOME=/tmp/knorvia-corepack
TSX_TSCONFIG_PATH=packages/ui/tsconfig.json node --experimental-test-module-mocks --import tsx --test --test-concurrency=2 packages/services/test/git-local-branches-*.test.ts
KNORVIA_GIT_RESOLUTION_TARGET=dist node --experimental-test-module-mocks --import tsx --import ./packages/services/test/git-read-projection-emitted-register-fast-20261001.mjs --test --test-concurrency=2 packages/services/test/git-local-branches-*.test.ts
```

The completed913-case runs append unchanged globs git-ignore-_.test.ts,
git-repository-_-fast-20261001.test.ts,git-graph-_-fast-20261001.test.ts,
git-message-generator-_.test.ts,git-read-projection-\*.test.ts to these commands and
enable KNORVIA_GIT_GRAPH_TARGET=dist and KNORVIA_GIT_READ_PROJECTION_TARGET=dist in
emitted mode. No timeout/concurrency/security policy changed. Do not repeat those
broader runs merely to restate evidence under the new cadence.

Lean payload seal: `090e9f1a3b07dfd9a5f0a2bd2d5cb6c207049adbb66638d2fedfc0f3f62305a3`. Save the code below as an owned temporary .mjs and
run from the repo root under Node24.14 to replay the digest/commit scope. It reads
only owned Git objects/files and the existing separately stored publisher bytes,
does not regenerate shared inventory or treat tests as licence proof.

```js
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
const x = JSON.parse(
  readFileSync("docs/knorvia-git-local-branches-fast-evidence-20261001.json", "utf8"),
);
const hash = (b) => createHash("sha256").update(b).digest("hex");
const git = (a) => execFileSync("git", a, { maxBuffer: 64 * 1024 * 1024 });
const seal = x.payloadSha256;
delete x.payloadSha256;
assert.equal(hash(JSON.stringify(x)), seal);
assert.equal(x.production, "65e65f95655c715eb9002fc3115ef48e33e6dec8");
assert.equal(x.before, "9248efe60bd1711a1393806cad81664f5dc53e9e");
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
const pub = git([
  "--git-dir=/tmp/knorvia-services-provenance-upstream-872ad960.git",
  "show",
  `872ad960:${main}`,
]).toString();
assert.equal(hash(pub), x.lineage.publisherSourceSha256);
for (const a of x.retainedSyntax) {
  for (const [s, text] of [
    [a.baseline, old],
    [a.publisher, pub],
    [a.current, readFileSync(a.current.path, "utf8")],
  ])
    assert.equal(hash(text.slice(s.start, s.end)), s.sha256);
}
const oracle = JSON.parse(readFileSync(x.copiedOracle.path, "utf8"));
assert.equal(oracle.commit, x.before);
assert.equal(hash(old), oracle.sourceSha256);
for (const a of oracle.spans) {
  assert.equal(old.slice(a.start, a.end), a.text);
  assert.equal(hash(a.text), a.sha256);
}
for (const a of x.artifacts) assert.equal(hash(readFileSync(a.path)), a.sha256);
assert.equal(x.validation.fullProjectRegression.run, false);
for (const k of ["finalSource", "finalStrictEmitted"]) assert.equal(x.validation[k].pass, 913);
console.log({ production: x.production, owned: 8, payload: seal });
```
