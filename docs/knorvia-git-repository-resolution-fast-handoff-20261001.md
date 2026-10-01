# Repository resolution/worktree info — fixed services lane checkpoint

The existing repo executes one private read-descriptor program for repository
discovery and one for metadata inspection. Each invocation has local decision
state only. The old scoped projector is removed; existing command effects,
in-flight maps, invalidation, status/identity/graph/mutation/checkpoint policy and
public declarations remain retained. Root alone integrates this branch.

## Original commits and owned paths

- Legacy spec/source/strict emitted freeze:
  `d639823cdfe9e8b6523336c6fce47aa3c30b0535`.
- Production and intentional thenable lint comments:
  `a828836c4b078cd58488b63bc699e23e6fe5e976`.

Only `packages/services/src/git/repo/gitCliRepo.ts`'s resolveRepository,
getWorkspaceRepositoryInfo and three private watch helpers changed, plus private
`gitRepositoryReadPlan.ts`. Supporting scope is five
`packages/services/test/git-repository-*-fast-20261001` files, matching spec, this
receipt and its digest JSON. No public entrypoint/declaration, provider/environment,
dependency, runner/CI, shared licensing or other-lane edit is included.

The repo retains commandProvider and executes every yielded discovery/command/stat/
read request with the original receivers, arguments and await behavior. Supplied
failures re-enter the decision program through throw: resolution errors propagate;
only the existing metadata inspection boundary catches and returns main-tree.
Metadata admission/path resolution remains outside that catch. No extra reads,
retry, cache, cancellation, migration policy or canonicalization is introduced.
One local ordered watch accumulator preserves first normalized spelling; lazy
candidate expansion normalizes absolute Git directory before resolving common
directory against original command cwd. It never owns filesystem watchers.

The read-only AST/remainder audit verifies **38 unrelated routine bodies** and
**five owner declarations** byte-identical to frozen source, including
reuseInFlightRequest/invalidate/getStatus/getIdentity/getCommitGraph and all mutation
methods. Surgically excluding the bounded bodies, removed declarations and allowed
imports leaves the rest of the repo text equal; only blank deletion seams are
normalized. Protected whole-file digests include graph helper, generator/four
files, read projector, service/filter/types, providers/config/helpers, checkpoint
implementation and actual UI consumers. Public emitted repo declaration remains
SHA-256 `a6a19273740e97f89c1b0cdc88b160570d45749e6d70edbb2c39850f3f95870b`.

## Lineage and retained expressions

Pre-edit graph checkpoint `13186d472b9d88242e807c3a90db542bab719f84` has repo blob
`580fb10add03a0227006b7eaa9b4d60d997941d1`, SHA-256
`60476c3332af0e79f67fc19862926217152ff18f10a9acb1d8f4e4360d91f42c`.
All five scoped bodies still equal the local import and pinned publisher byte-for-byte;
none was part of the accepted graph replacement. Existing graph/generator/read
boundaries are preserved rather than replaced again.

Pinned [ZCode publisher](https://github.com/zai-org/ZCode) commit
`872ad960de7ec172591f7e1952f7849229f94521`, tree
`d185a9a893c00d51fc3fe51fe7371b9eea7de143`, repo blob
`ffe734dd7fcccc15c1128f7be818ea8b41c4fd90`, 58,787 bytes, SHA-256
`474a377eaf9b4420e671b67ed0d9d509b66fef22151b2085b9f5d8847bec92ba`
were read from the existing separate temporary bare repo. Local import
`7619e41b950bd52073ebf36754146cf25659d9fa`, integrated baseline
`0d80f9ca37b1daef162ecc69bd18f6e8fc30a146`, repo blob
`6ce5993b5f036690742b15925d839e57185717ae`, SHA-256
`11b1e8550c8aaca02f5dca0c5f7e0ab55141f308483bfe0db25b0ec6b93ed58c`
remain historical facts. No production ancestry or publisher fetch changed here.
Both local and publisher implementations were exposed.

Retained compatibility includes exact rev-parse argv/cwd/15000 timeout; ordered
missing-directory/nonrepo predicates; existing checker/error prose and flag bypass;
CRLF/root/prefix parsing; original output keys/defaults; drive-root and trailing
slash regexes; native relative-path semantics; first-line/case-sensitive gitdir:
and /.git/worktrees/ grammar; directory-before-file stat methods, utf-8 read;
metadata fail-open catch and resolution error propagation. Existing declarations,
prose, protocol shapes and compatibility expressions are not new contribution.
The JSON records **47 exact literal/template observations** and **13 exact expression
spans** against local/publisher bytes. These are positive, non-exhaustive retention
facts, not an originality metric. Method/signature and unchanged remainder evidence
also bound retained formatting and declarations.

Candidate new structures are the typed read-descriptor protocol, existing repo
interpreter and local yielded decision/failure relationships, plus ordered lazy
watch selection. They require independent root review. Tests, changed hashes,
moved declarations, formatting and line counts do not establish originality.
Repo whole-file status remains upstream-modified/unreviewed; private helper is an
unreviewed source-exposed addition with retained leaves. Both remain NOASSERTION,
with no whole-file MIT or clean-room claim. Smallest useful further separation is
these control relationships from inherited argv/predicates/checker/path/parser/
shape leaves. Moving those leaves alone would not make them original.

Fixtures are owned synthetic paths, CRLF/NUL/Unicode strings, command result/error
prose and fake discovery/fs ports. RPC/mock scaffolding follows exposed prior lane
test patterns. Tests retain protocol literals deliberately, without real accounts,
repositories, credentials or profiles. No actual Git, native process, filesystem
metadata or clock effect is acquired by scoped production acceptance. Deferred
promises settle deterministically without added sleeps or budgets. The full existing
offline suite is reported separately from these exclusively fake-port contracts.

## Callers and frozen acceptance

Actual traced consumers: node repo/service factory; status and identity, service
summary/info/identity/refresh; public Git descriptor and in-memory binary RPC;
UI useGitRepository refresh and exported buildGitBranchSwitchAssistState. Tests
exercise actual repo/service/ChannelServer/ChannelClient/ProxyChannel/Emitter and
actual UI assist export. This is supported function/service acceptance, not mounted
React, desktop GUI, separate Host or remote transport acceptance.

No active UI or migration filter call to getWorkspaceRepositoryInfo was found by
repository search. The inherited metadata comments describe migration-filter
intent; this receipt does not invent a current consumer. Public service/RPC info
forwarding is tested. Metadata preserves fail-open identification for submodules,
separate Git directories, missing entries, rejected reads and unusual layouts.

Legacy freeze before production: **134/134 individual cases across four test
files**, each source and strict emitted. Initial harness run had 120 individual
cases (119 pass/one wrong stderr/stdout fallback expectation) plus one consumer
file transform failure; next run had 134 cases/133 pass/one unsupported UI issue-code
fixture. Those harness errors were corrected before implementation, with raw logs
retained in owned temporary evidence storage. No pre-existing product defect or
policy change is claimed. Production appended only two scoped lint comments for
intentional owned thenables; frozen assertions and fixture content are unchanged.

Frozen coverage includes command/output/property order and receiver; falsy discovery,
thrown/rejected/thenable effects; classification precedence and flag edges; checker
errors; root/prefix/CRLF/NUL; root/watch/relative/Windows literal paths; .git directory/
file/layout/first-line grammar; getter/method failures/catch scope; concurrent same
and different exact keys; shared resolver/info/status/identity requests; rejection
cleanup, invalidate, late old resolve/reject/metadata fallback and sequential reuse;
actual service/RPC errors and summary/identity/refresh/info plus UI assist.

## Final verification and exact bindings

Pinned Node 24.14.0, pnpm 10.33.2, TypeScript 6.0.2. Cached-origin freshness
`--no-fetch` passed and reported no upstream tracking branch; this is not a live
remote-freshness assertion. Changed/full architecture each zero violations.
Root types passed (5422 matching locale keys), lint zero warnings/errors, formatting
passed. CLI 17 tasks successful/16 cached; Windows CUA staging skipped on Linux.
Desktop main/host/scheduler/preload/renderer build passed with existing chunk-size
and plugin-timing warnings.

Final focused source **568/568 cases** and strict emitted **568/568 cases**,
**13 test files each**, bound to production `a828836`: new resolution/info/concurrency/
consumers 134, prior graph 147, prior generator 161 and prior read projection 126.
Strict emitted loader rejects source fallback; all actual product imports use dist.

```sh
export PATH=/tmp/node-v24.14.0-linux-x64/bin:/tmp/knorvia-tool-bin:$PATH COREPACK_HOME=/tmp/knorvia-corepack
TSX_TSCONFIG_PATH=packages/ui/tsconfig.json node --experimental-test-module-mocks --import tsx --test --test-concurrency=2 packages/services/test/git-repository-*-fast-20261001.test.ts packages/services/test/git-graph-*-fast-20261001.test.ts packages/services/test/git-message-generator-*.test.ts packages/services/test/git-read-projection-*.test.ts
KNORVIA_GIT_RESOLUTION_TARGET=dist KNORVIA_GIT_GRAPH_TARGET=dist KNORVIA_GIT_READ_PROJECTION_TARGET=dist node --experimental-test-module-mocks --import tsx --import ./packages/services/test/git-read-projection-emitted-register-fast-20261001.mjs --test --test-concurrency=2 packages/services/test/git-repository-*-fast-20261001.test.ts packages/services/test/git-graph-*-fast-20261001.test.ts packages/services/test/git-message-generator-*.test.ts packages/services/test/git-read-projection-*.test.ts
pnpm typecheck
pnpm lint
pnpm fmt:check
pnpm architecture:check -- --changed
pnpm architecture:check
pnpm build:cli-packages
pnpm --filter @knorvia/desktop build:no-runtime-assets
pnpm test:studio
```

Full offline suite on `a828836`: **529 files, 6987 individual cases, 6979 passed,
8 skipped, 0 failed/cancelled**, 6 suites, duration625174.664704ms. The eight unchanged
skips are Windows bootstrap1, Windows/PowerShell delivery5, Claude leaf/declaration1
and Windows cache-alias1. The runner remains unchanged: isolated test workers,
concurrency2, timeout120000. Exact final runner command is `pnpm test:studio` under
the pinned environment above. The full result is sealed in the accompanying JSON.
Receipt-only additions do not rerun expensive unchanged product suites/builds;
they rerun format/lint/architecture and commit/span/digest replay.

Production source SHA-256:

| Path                             | SHA-256                                                            |
| -------------------------------- | ------------------------------------------------------------------ |
| gitCliRepo.ts                    | `0d013917e967fab320e88450a7ff1cf1d4c01de016bcd181ec7410984b637a70` |
| gitRepositoryReadPlan.ts         | `6e4cbdb3bbab96d5639133fec4bd02e0dbf95808121751f13fd6caf3cdf4d755` |
| emitted gitCliRepo.js            | `2cb49c639cc3eaa355971b122938adfd77fba006fa8445098e92904933caaaff` |
| emitted gitRepositoryReadPlan.js | `cfd5c6ae069d265f1274bde9f0d16df8e4ee939c15e93817c9be36dc551435c7` |
| desktop host/index.js            | `73e4a3672debdd8d80e234f53e540c22e4249c48be1fd8f8c2ab157b228ec375` |

The digest JSON binds all eight owned files to exact production commit/blob/bytes,
protected whole files/shared inputs, old/new spans, emitted artifacts and test
snapshot. Historical graph repo hash60476c remains valid for its historical commit,
not as a current whole-file digest after this authorised slice. Older provenance
receipts and tests remain unchanged.

Evidence payload SHA-256:
`7130be5bfc8ed91f1e763b902977fdd0233b3f43e4cf451990b75efccda5f516`.

This read-only replay checks the sealed payload, exact commit/file set, source/
protected/generated digests and recorded local/publisher spans. It reads only this
checkout and the existing separate publisher bare repository. A different checkout
can supply its own exact publisher storage path. The observation schema is lane-local,
not an entry in the shared licensing decision schema or an authorising review.

Receipt-only replay passed after full regression. Three separate owned JSON probes
were also rejected: omitted current file, production commit rebound to historical
scope, and tampered current SHA. Each probe recomputed its payload seal so it reached
the binding check. These three receipt probes are not included in the 134/568/6987
product case counts. The first temporary collector invocation had an extra closing
brace; it was corrected before producing this JSON. No production or shared record
was changed to make either audit pass.

```sh
export PATH=/tmp/node-v24.14.0-linux-x64/bin:/tmp/knorvia-tool-bin:$PATH COREPACK_HOME=/tmp/knorvia-corepack
node --input-type=module <<'JS'
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
const git = args => execFileSync('git', args, {maxBuffer: 64*1024*1024});
const hash = value => createHash('sha256').update(value).digest('hex');
const e = JSON.parse(readFileSync('docs/knorvia-git-repository-resolution-fast-evidence-20261001.json'));
const {payloadSha256, ...payload} = e;
assert.equal(hash(JSON.stringify(payload)), payloadSha256);
assert.equal(e.schemaVersion, 1);
assert.equal(e.kind, 'services-lane-git-repository-resolution-observations');
assert.equal(e.before, '13186d472b9d88242e807c3a90db542bab719f84');
assert.equal(e.baseline, 'd639823cdfe9e8b6523336c6fce47aa3c30b0535');
assert.equal(e.production, 'a828836c4b078cd58488b63bc699e23e6fe5e976');
assert.equal(e.sourceExposure, true);
for (const key of ['cleanRoom','wholeFileLicenseGrant','acceptedReview','nativeAcceptance']) assert.equal(e[key], false);
assert.equal(e.licenseExpression, 'NOASSERTION');
assert.equal(e.localObligations, 27);
const expected = git(['diff','--name-only',e.before,e.production]).toString().trim().split('\n').sort();
assert.equal(expected.length, 8);
assert.deepEqual(e.ownedScope.map(x=>x.path).sort(), expected);
assert.equal(e.protectedFiles.length, 33);
assert.equal(e.protectedSharedInputs.length, 12);
for (const x of [...e.ownedScope,...e.protectedFiles,...e.protectedSharedInputs,...e.protectedHistoricalScope]) {
  const stored = git(['show',`${x.commit}:${x.path}`]);
  assert.equal(hash(stored), x.sha256, x.path);
  assert.equal(stored.length, x.bytes, x.path);
  assert.equal(git(['rev-parse',`${x.commit}:${x.path}`]).toString().trim(), x.blob);
  assert.equal(git(['ls-tree',x.commit,'--',x.path]).toString().split(' ')[0], x.mode);
  assert.ok(readFileSync(x.path).equals(stored), `live bytes ${x.path}`);
}
for (const x of e.generatedArtifacts) {
  assert.equal(x.production,e.production);
  const bytes=readFileSync(x.path);
  assert.equal(hash(bytes),x.sha256,x.path);
  assert.equal(bytes.length,x.bytes,x.path);
}
const publisherRepo='/tmp/knorvia-services-provenance-upstream-872ad960.git';
assert.equal(git([`--git-dir=${publisherRepo}`,'rev-parse',`${e.lineage.publisherCommit}^{tree}`]).toString().trim(),e.lineage.publisherTree);
const publisher=git([`--git-dir=${publisherRepo}`,'show',`${e.lineage.publisherCommit}:${e.lineage.path}`]);
assert.equal(hash(publisher),e.lineage.publisherSha256);
assert.equal(publisher.length,e.lineage.publisherBytes);
assert.equal(git([`--git-dir=${publisherRepo}`,'rev-parse',`${e.lineage.publisherCommit}:${e.lineage.path}`]).toString().trim(),e.lineage.publisherBlob);
assert.equal(hash(git(['show',`${e.lineage.integratedBaseline}:${e.lineage.path}`])),e.lineage.localImportSha256);
const span=(x,commit,pub=false)=>{
  const text=(pub?publisher:git(['show',`${commit}:${x.path}`])).toString();
  const value=text.slice(x.start,x.end);
  assert.equal(hash(value),x.sha256,`${x.path}:${x.start}`);
  assert.equal(Buffer.byteLength(value),x.bytes);
};
assert.equal(e.scopedLineage.length,5);
assert.equal(e.protectedBodies.length,38);
assert.equal(e.cacheOwner.length,5);
for(const x of e.scopedLineage){span(x.localBaseline,e.baseline);span(x.publisher,null,true);assert.equal(x.localBaseline.sha256,x.publisher.sha256);}
for(const x of [...e.protectedBodies,...e.cacheOwner]){span(x.current,e.production);span(x.localBaseline,e.baseline);assert.equal(x.current.sha256,x.localBaseline.sha256);}
for(const x of e.newStructureSpans)span(x.current,e.production);
for(const x of [...e.retainedLiteralEvidence,...e.retainedExpressionEvidence]){span(x.current,e.production);span(x.localBaseline,e.baseline);if(x.publisher)span(x.publisher,null,true);}
assert.equal(e.retainedLiteralEvidence.length,47);
assert.equal(e.retainedExpressionEvidence.length,13);
for(const key of ['finalSource','finalStrictEmitted']){
  assert.equal(e.validation[key].production,e.production);
  assert.equal(e.validation[key].files,13);
  assert.equal(e.validation[key].cases,568);
  assert.equal(e.validation[key].pass,568);
  assert.equal(e.validation[key].fail,0);
}
assert.equal(e.validation.full.production,e.production);
assert.equal(e.validation.full.files,529);
assert.equal(e.validation.full.fail,0);
assert.equal(e.validation.full.cancelled,0);
assert.equal(e.validation.full.concurrency,2);
assert.equal(e.validation.full.timeoutMs,120000);
console.log('resolution digest/span replay passed; observations only, no rights/native acceptance');
JS
```

## Limits and independent parent evidence

Linux synthetic acceptance is not native Git, Windows/macOS, mounted GUI or remote
Host acceptance. No new runtime/host/settings/security/credential action was taken.
Root owns integration and subsequent native/platform assessment.

Root's older CI222 expected-key correction80d053a and current CI224 Windows launcher
ENAMETOOLONG/nativeglob repair are parent work, not present or edited here. Earlier
Linux-only read-projection evidence cannot prove Windows portability. Parent reports
full7109/7043pass/59 unchanged local EPERM/7skip and pending Windows CI; these are not
this checkpoint's validation. Parent source-built Linux node-pty acceptance is also
separate, with its documented shipped-binary/GUI/Windows/macOS/remote limitations.

All shared licensing records, inventories, notices and older lane27 obligations
remain byte-identical. Parent material26 after Keyv closure and recovered ancestral
ansi-to-react BSD notice do not close the current6.2.6 gap or authorise local licence
changes. No accepted provenance review or whole-project/whole-file MIT grant is made.

Historical/current services checker replay passes its original watcher/archive/
terminal scope (historical50/current55/appendix2, references30, unavailable publisher
spans0, protected19/method17, local27, accepted=false/native=false). It does not
infer coverage for this Git slice.
