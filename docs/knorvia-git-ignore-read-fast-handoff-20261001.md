# Ignored-path read query — services lane checkpoint

The replacement owns ordered candidate/query/response decisions for
`getIgnoredPaths`; the existing repo entrypoint remains the sole effect owner.
Only that method body and one private helper import changed in the existing file.
No extra awaited orchestration result, cache, retry, provider/permission policy,
mutation, public declaration or UI/state-owner change.

Original appended commits:

- `abee1526ef8c3e3ace6741b6a846af6450e33eb7`: scope/spec and unchanged source/strict emitted freeze.
- `675fe7c0bf581f4c8c83b4d5004a71cc1e34e6ea`: synchronous read program, original
  entrypoint await ownership and ordered membership selection.
- This receipt and sibling observations JSON are a separate evidence-only appendix.
  No further production change or amendment of earlier commits.

Owned paths: `packages/services/src/git/repo/gitCliRepo.ts` (only getIgnoredPaths),
`gitIgnoredPathReadPlan.ts`, six `packages/services/test/git-ignore-*` support/case/
oracle files, `specs/knorvia-git-ignore-read-fast-20261001.md`, this receipt and its
sibling JSON. Root alone integrates; push only `parallel/file-watcher-fast-20261001`.

## Lineage, retained implementation and limits

The current ledger marks gitCliRepo.ts upstream-modified/unreviewed, review null,
NOASSERTION. The selected old body remained byte-identical to publisher872ad960,
local import7619e41 and integrated0d80f9c. Exact publisher bytes were verified in the
existing separate bare store: tree d185a9/blob ffe734dd/fileSHA474a377e. Old scoped
body SHA256: `ddc1d42000d368269a17fd3f9897efee8dcc123ef2d554d76b4bc737d40edde5`.
Full commit/blob/hash/byte/UTF16 source-span bindings are in the JSON. No new fetch
or production ancestry change was needed. Accepted graph, generator, read projection,
terminal and repository resolution were inspected and preserved, not replaced again.

New structure: one typed synchronous operation program decides empty/unavailable
admission, concurrent candidate collection, ordered command plan, response
classification and input-order membership selection. The original async entrypoint
interprets those operations and retains its resolver, Promise.all/per-item and
command await boundaries. The program creates no promises, IO, caches or retries.

Retained material includes the per-item async try/return/catch structure and
absolutePath-before-normalization expression; unchanged normalizeInputPath and its
realpath fallback/scope grammar; original argv/defaults/exit1 priority, command
checker/prose and CRLF/LF/Boolean/backslash parser; public shapes and provider/state
declarations. Callback indentation changed inside the interpreter; that formatting
is not claimed as new implementation. The JSON records10 positive exact literal
observations and11 exact retained expressions with local/publisher/current spans.
These are not exhaustive or originality metrics. All40 other method bodies and5
provider/state declarations are exact. The whole-file remainder is byte-identical
after masking only the scoped body and new helper import, without whitespace
normalization. Lower command/environment policy, status, mutations and checkpoint
restore remain exact, including accepted repository settlement and graph bodies.

The oracle copies the exact e9cd7fc method only for frozen test comparison,
compiled in test memory with owned fake ports. It is source-exposed inherited test
material, not a new implementation or production copy. Fixtures reuse earlier lane
harness conventions, synthetic result/deferred helpers and strict dist loader. UI
callbacks are extracted from actual owned source/emitted artifacts; inherited
consumer logic is not counted as lane authorship. New fixture data is literal
synthetic path/delimiter/error input, never repository/user content.

Conservative statuses: the repo is a mixed partial replacement/upstream-modified/
unreviewed file; the helper is an unreviewed decision structure with retained
compatibility syntax; the oracle is copied inherited test material. Review the
program/interpreter separately from retained path/query/parser/error/default/type
leaves and the test oracle. Tests, changed hashes and moved expressions do not prove
originality. No clean-room, whole-file MIT, accepted review or native acceptance.
LICENSE/NOTICE/shared records and older27 lane obligations remain exact; root's
reported material26 is separate and not regenerated here.

## Validation

Before implementation:135/135 source and135/135 strict emitted,3 Node test files
per mode:41 path/error/getter,76 settlement and18 consumer cases. The initial
unchanged-product harness run was133/135:2 UI-rejection checks observed completion
before .catch logging. The fixture now awaits its owned warning port. No product
defect, policy correction or frozen assertion weakening was claimed. Production
stayed unchanged until the complete freeze passed and was committed.

The76 baseline comparisons exercise the actual existing resolver/map/reuse/
invalidate owner:48 queued depths0–7 across6 outcomes,6 synchronous reentrant,
12 settlement invalidation,6 different keys and4 late old completion/rejection.
Effect counts, reuse versus fresh requests and visible outcome order match legacy.
A baseline/current invocation pair counts as one case, not two. No additional
awaited orchestration promise, sleep or budget change was introduced.

Final source775/775 and strict emitted775/775,17 Node test files per mode:
new135 + resolver134 + resolver timing72 + graph147 + generator161 + service read
projection126. Strict mode rejects product source fallback and uses rebuilt
services/UI/RPC/shared emitted dependencies. The copied old oracle compilation is
explicitly test-only. Actual supported consumers include service receiver/getter
forwarding, ChannelServer/ChannelClient/ProxyChannel/Emitter, exported file-tree
ignored-set/lookup and the extracted actual loadDirectory callback. Cases cover
owned entry submission, ordered duplicate results, command failures, live updates,
stale generation/directory/request suppression and original warning fields/prose.
Literal Windows/POSIX model keys are tested independently of host path.resolve.

Full final runner: `pnpm test:studio`, Node24.14.0, isolated workers/concurrency2/
timeout120000 unchanged: **533 files,7194 individual cases,7186 pass,8 skip,
0 fail/cancel,6 suites**,659111.763691ms. Full log SHA256:
`9c4d8eec748f9f53bed3e0cbcb2ce22ce978420c0343aeccb76b42c61410a172`.
The8 skips retain Windows bootstrap1, PowerShell delivery5, Claude leaf/declaration1
and Windows cache-alias1; no test or budget was weakened.

Types passed (5422 locale keys); configured lint and separately owned7-file lint
passed with0 warnings/errors; format and changed/full architecture passed with0
violations. CLI17 tasks/16 cached passed, Windows CUA staging skipped on Linux.
Desktop main/host/scheduler/preload/renderer passed with existing CLI/plugin timing/
chunk warnings. Existing scoped historical/current services provenance checker
replay passed with exact stored publisher bytes; its installed node-pty bytes were
verified, publisher commit not verified. No shared record regeneration follows.

The old a828836 full run (529files6987cases6979pass8skip) and corrected fdd4ca3 run
(530files7059cases7051pass8skip) remain historical bindings. Earlier19-case timing
red proof/spec/oracle/receipts are intact. This appendix binds the new source only.
Root-owned80d053a fixes the earlier Windows expected-path assertion; the lane's old
test/evidence and UI model remain exact. Current Linux passing results do not
validate that old assertion on Windows. Parent reports CI226 Linux7291/8skip;
Windows unchanged CUAHTTP504 before tests and exact-job retry are separate.
Parent Linux PTY acceptance does not certify native Git. No actual Git, native
Windows/macOS, GUI/React mount, remote Host or user-files acceptance was performed.
All new scoped test process/fs/clock/settings ports are fake; only owned artifacts are read.
Root WebFetch publication permission decision was not transferred or rerouted.

One temporary receipt-write command failed before process creation with executor
transport disconnected. Harmless pwd/status/branch/HEAD reads succeeded, clean at
675fe7c; the original full session then returned success. No restart, reset,
recreation, duplicate suite or data loss. Temporary evidence collector escaping and
missing derived oracle byte-count issues were corrected only in new uncommitted
evidence metadata before sealing; production, frozen tests and old receipts stayed
immutable. No persistent local blocker.

## Exact reproduction and bindings

```sh
export PATH=/tmp/node-v24.14.0-linux-x64/bin:/tmp/knorvia-tool-bin:$PATH COREPACK_HOME=/tmp/knorvia-corepack
TSX_TSCONFIG_PATH=packages/ui/tsconfig.json node --experimental-test-module-mocks --import tsx --test --test-concurrency=2 packages/services/test/git-ignore-*.test.ts packages/services/test/git-repository-*-fast-20261001.test.ts packages/services/test/git-graph-*-fast-20261001.test.ts packages/services/test/git-message-generator-*.test.ts packages/services/test/git-read-projection-*.test.ts
KNORVIA_GIT_RESOLUTION_TARGET=dist KNORVIA_GIT_GRAPH_TARGET=dist KNORVIA_GIT_READ_PROJECTION_TARGET=dist node --experimental-test-module-mocks --import tsx --import ./packages/services/test/git-read-projection-emitted-register-fast-20261001.mjs --test --test-concurrency=2 packages/services/test/git-ignore-*.test.ts packages/services/test/git-repository-*-fast-20261001.test.ts packages/services/test/git-graph-*-fast-20261001.test.ts packages/services/test/git-message-generator-*.test.ts packages/services/test/git-read-projection-*.test.ts
pnpm typecheck
pnpm lint
pnpm exec oxlint packages/services/src/git/repo/gitIgnoredPathReadPlan.ts packages/services/src/git/repo/gitCliRepo.ts packages/services/test/git-ignore-*.ts
pnpm fmt:check
pnpm architecture:check -- --changed
pnpm architecture:check
pnpm build:cli-packages
pnpm --filter @knorvia/desktop build:no-runtime-assets
pnpm test:studio
```

Digest bindings (source and installed consumers; public repo declaration unchanged):

| Artifact              | SHA256                                                             |
| --------------------- | ------------------------------------------------------------------ |
| repo source           | `f1db571a98b05aa7458928186b1d93eef4b031cfc6b0c8ca740d3213a389302e` |
| private plan source   | `f1b8d6d280f26a48f07530425df16f02babfb81c94716a9cf1fa89dcf09c1ee3` |
| emitted repo JS       | `fd7ed0c369c6225902a5fd4297403d7dd543209c3edbd7b74281391945d5a06c` |
| repo.d.ts             | `a6a19273740e97f89c1b0cdc88b160570d45749e6d70edbb2c39850f3f95870b` |
| emitted plan JS       | `58a569e4a73fd3926617a2d7412de0bdf3ce51ef4ffd9d544be12c179a1eba3c` |
| desktop host index.js | `a0dbfab55f55e1e4f989b713fab50f6502891f74230ac5743b3cba4b33dd465c` |

Payload seal: `b68600033652011adc0fa9a4cd5a3525766df449b3ee8f526a29fa2f612414af`.
The observational JSON is a lane receipt, not a shared licensing-schema record or
licence decision. It binds9 owned paths,34 protected production files,12 shared
inputs,41 protected historical files,40 methods,5 owner declarations, exact
publisher/local/current spans and copied oracle. Earlier passing hashes are not
silently substituted for current ones.

Read-only replay: save the following code as an owned temporary .mjs, run from the
repo root under Node24.14, and pass the observations JSON followed by the separate
exact publisher bare repository path. It requires matching commit/live/artifact
bytes for this snapshot; later integrated builds must not silently certify it.
Git object reads in this checker are source audits, not product native acceptance.

```js
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
const candidate = process.argv[2] ?? "docs/knorvia-git-ignore-read-fast-evidence-20261001.json",
  publisherRepo = process.argv[3] ?? "/tmp/knorvia-services-provenance-upstream-872ad960.git";
const x = JSON.parse(readFileSync(candidate, "utf8")),
  hash = (s) => createHash("sha256").update(s).digest("hex"),
  git = (args) => execFileSync("git", args, { maxBuffer: 64 * 1024 * 1024 }),
  seal = x.payloadSha256;
delete x.payloadSha256;
assert.equal(hash(JSON.stringify(x)), seal);
assert.equal(x.schemaVersion, 1);
assert.equal(x.kind, "services-lane-git-ignored-path-read-observations");
assert.equal(x.scope, "ignored-path-read-only-candidate");
assert.equal(x.before, "e9cd7fca050a59e484ebe8f7aa9a42cd7e2ed4bf");
assert.equal(x.production, "675fe7c0bf581f4c8c83b4d5004a71cc1e34e6ea");
for (const key of ["cleanRoom", "wholeFileLicenseGrant", "acceptedReview", "nativeAcceptance"])
  assert.equal(x[key], false);
assert.equal(x.sourceExposure, true);
assert.equal(x.licenseExpression, "NOASSERTION");
assert.equal(x.localObligations, 27);
const expected = [
  "packages/services/src/git/repo/gitCliRepo.ts",
  "packages/services/src/git/repo/gitIgnoredPathReadPlan.ts",
  "packages/services/test/git-ignore-consumers-fast-20261001.test.ts",
  "packages/services/test/git-ignore-contract-fast-20261001.test.ts",
  "packages/services/test/git-ignore-fixture-fast-20261001.ts",
  "packages/services/test/git-ignore-legacy-fast-20261001.json",
  "packages/services/test/git-ignore-settlement-fast-20261001.test.ts",
  "packages/services/test/git-ignore-ui-callback-fast-20261001.ts",
  "specs/knorvia-git-ignore-read-fast-20261001.md",
];
assert.deepEqual(x.ownedScope.map((a) => a.path).sort(), expected.toSorted());
assert.deepEqual(
  git(["diff", "--name-only", x.before, x.production]).toString().trim().split("\n").sort(),
  expected.toSorted(),
);
for (const a of x.ownedScope) {
  assert.equal(a.commit, x.production);
  verifyFile(a);
}
for (const [key, count] of [
  ["protectedFiles", 34],
  ["protectedSharedInputs", 12],
  ["protectedHistory", 41],
]) {
  assert.equal(x[key].length, count);
  assert.equal(new Set(x[key].map((a) => a.path)).size, count);
}
for (const list of ["protectedFiles", "protectedSharedInputs", "protectedHistory"])
  for (const a of x[list]) {
    assert.equal(a.commit, x.before);
    verifyFile(a);
  }
function verifyFile(a) {
  const bytes = git(["show", `${a.commit}:${a.path}`]);
  assert.equal(a.mode, "100644");
  assert.equal(git(["ls-tree", a.commit, "--", a.path]).toString().split(" ")[0], a.mode);
  assert.equal(hash(bytes), a.sha256, a.path);
  assert.equal(bytes.length, a.bytes);
  assert.equal(
    git(["rev-parse", `${a.commit}:${a.path}`])
      .toString()
      .trim(),
    a.blob,
  );
  assert.ok(readFileSync(a.path).equals(bytes), a.path);
}
const main = "packages/services/src/git/repo/gitCliRepo.ts",
  helper = "packages/services/src/git/repo/gitIgnoredPathReadPlan.ts",
  before = git(["show", `${x.before}:${main}`]).toString(),
  now = readFileSync(main, "utf8"),
  pub = git([
    "--git-dir=" + publisherRepo,
    "show",
    `${x.lineage.publisherCommit}:${main}`,
  ]).toString();
assert.equal(x.lineage.publisherCommit, "872ad960de7ec172591f7e1952f7849229f94521");
assert.equal(
  git(["--git-dir=" + publisherRepo, "rev-parse", x.lineage.publisherCommit + "^{tree}"])
    .toString()
    .trim(),
  "d185a9a893c00d51fc3fe51fe7371b9eea7de143",
);
assert.equal(hash(pub), "474a377eaf9b4420e671b67ed0d9d509b66fef22151b2085b9f5d8847bec92ba");
assert.equal(x.lineage.publisherBytesVerified, true);
assert.equal(hash(before), x.lineage.preEditRepoSha256);
function span(a, source) {
  assert.equal(hash(source.slice(a.start, a.end)), a.sha256);
  assert.equal(Buffer.byteLength(source.slice(a.start, a.end)), a.bytes);
  return source.slice(a.start, a.end);
}
assert.equal(
  span(x.scopePublisherMatch.baseline, before),
  span(x.scopePublisherMatch.publisher, pub),
);
assert.equal(x.protectedBodies.length, 40);
assert.equal(x.ownerDeclarations.length, 5);
assert.equal(x.retainedLiterals.length, 10);
assert.equal(x.retainedExpressions.length, 11);
for (const a of [...x.protectedBodies, ...x.ownerDeclarations])
  assert.equal(span(a.baseline, before), span(a.current, now));
for (const a of [...x.retainedLiterals, ...x.retainedExpressions]) {
  const current = readFileSync(a.current.path, "utf8");
  assert.equal(span(a.baseline, before), span(a.current, current));
  assert.equal(span(a.baseline, before), span(a.publisher, pub));
  assert.equal(a.syntax, span(a.current, current));
}
for (const a of x.newStructures) span(a.current, readFileSync(a.current.path, "utf8"));
const mask = (text, a) =>
  text.slice(0, a.start) + "{ /* IGNORED_READ_SLICE */ }" + text.slice(a.end);
const oldRest = mask(before, x.scopePublisherMatch.baseline),
  newRest = mask(now, x.currentScopeBody).replace(
    'import { planGitIgnoredPaths } from "./gitIgnoredPathReadPlan.js";\n',
    "",
  );
assert.equal(newRest, oldRest);
assert.equal(hash(oldRest), x.unchangedRemainder.sha256);
assert.equal(Buffer.byteLength(oldRest), x.unchangedRemainder.bytes);
const oracle = JSON.parse(readFileSync(x.copiedOracle.path, "utf8"));
assert.equal(oracle.commit, x.before);
assert.equal(hash(before), oracle.sourceSha256);
assert.equal(before.slice(oracle.method.start, oracle.method.end), oracle.method.text);
assert.equal(hash(oracle.method.text), oracle.method.sha256);
assert.equal(span(x.copiedOracle.method, before), oracle.method.text);
assert.equal(x.copiedOracle.productionImplementation, false);
assert.deepEqual(
  x.generatedArtifacts.map((a) => a.path).sort(),
  [
    "packages/services/dist/git/repo/gitCliRepo.js",
    "packages/services/dist/git/repo/gitCliRepo.d.ts",
    "packages/services/dist/git/repo/gitIgnoredPathReadPlan.js",
    "packages/services/dist/git/repo/gitIgnoredPathReadPlan.d.ts",
    "packages/desktop/out/host/index.js",
  ].sort(),
);
for (const a of x.generatedArtifacts) {
  assert.equal(a.production, x.production);
  const bytes = readFileSync(a.path);
  assert.equal(hash(bytes), a.sha256, a.path);
  assert.equal(bytes.length, a.bytes);
}
for (const mode of ["source", "strictEmitted"]) {
  assert.equal(x.validation[mode].production, x.production);
  assert.equal(x.validation[mode].files, 17);
  assert.equal(x.validation[mode].cases, 775);
  assert.equal(x.validation[mode].pass, 775);
  assert.equal(x.validation[mode].fail, 0);
}
assert.equal(x.validation.full.production, x.production);
assert.equal(x.validation.full.files, 533);
assert.equal(x.validation.full.cases, 7194);
assert.equal(x.validation.full.pass, 7186);
assert.equal(x.validation.full.fail, 0);
assert.equal(x.validation.full.cancelled, 0);
assert.equal(x.validation.full.skip, 8);
assert.equal(x.validation.full.timeoutMs, 120000);
assert.equal(x.validation.full.concurrency, 2);
console.log(
  JSON.stringify({
    scope: x.scope,
    production: x.production,
    owned: x.ownedScope.length,
    protectedBodies: x.protectedBodies.length,
    ownerDeclarations: x.ownerDeclarations.length,
    retainedLiterals: x.retainedLiterals.length,
    retainedExpressions: x.retainedExpressions.length,
    publisherBytesVerified: true,
    payload: seal,
  }),
);
```

Positive replay passed. Six resealed owned negative probes were rejected: omitted owned file, tampered SHA, misbound commit, omitted retained expression, missing copied-oracle byte count and historical candidate presented as current. These six evidence checks are separate from product case counts. The checker accepts JSON whitespace formatting without changing the sealed parsed payload.

Final evidence-only additions rerun digest/schema/negative-probe checks plus lint,
format and changed/full architecture. The already passing product suites, types,
CLI and desktop builds were not repeated after only these receipt additions.
The checkpoint is clean and awaits root's next scoped assignment in this lane.
