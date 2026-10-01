# Repository settlement — correction and current candidate appendix

This appendix supersedes the live-code interpretation of the original resolution
receipt. `d639823`, production `a828836` and receipt `996aa34` remain immutable
historical evidence. Their output contracts passed, but independent timing review
proved the extra awaited async helper changed cleanup/admission and visible order.
Historical passing hashes are not current-code certification.

## Original appended commits

- `0fe58689cbcf4945367c2546e709748b5a827ed0`: intended timing spec and failing
  baseline-versus-current regression, copied test-only frozen oracle.
- `fdd4ca3723f792570bf160fdfc1f3132849d6cac`: synchronous driver; original async
  entrypoint factories retain await ownership.

Only gitCliRepo.ts changed in production. gitRepositoryReadPlan.ts remains
byte-identical to `a828836`. The three settlement test/oracle files, timing spec,
this appendix and its current digest JSON are supporting additions. Existing graph,
generator, public declarations, all shared inputs and the original resolution
tests/receipts remain unchanged. Root alone integrates this lane branch.

## Frozen timing proof and correction

The new test compares actual current source/strict emitted repo methods with an
in-memory compiled test-only oracle containing ten exact old source spans from
`d639823`: the two methods, three watch helpers, reuse/invalidate and three map
declarations. Each copied span and whole baseline digest is recorded and checked.
This inherited oracle is explicitly copied/source-exposed material, not a new
production implementation or an originality claim. Dependencies are unchanged
config/checker/path functions plus exclusively fake discovery/command/stat/read
ports. No test Git command, real repo/user file/process/clock/network is acquired.
Strict mode imports actual current product consumers only from dist; the disclosed
frozen source oracle is compiled from the test artifact, not a current-source fallback.

Before correction at `0fe5868`, **72 individual comparisons in one test file**
produced **53 pass / 19 fail**, identically source and strict emitted. Raw initial
red log SHA-256 values are bound in the current evidence. Reproduce that exact
checkpoint with the commands below after building its emitted artifacts.

Concrete failures: run queued-depth2 executed one command in `a828836`, where
frozen baseline executed two because its completed in-flight request was already
retired. At depth3, first resolution/rejection notification moved behind the queued
caller. Discovery unavailable/rejected, run rejected, stat and read completion
also differed; invalidation-during-settlement and different-key order exposed the
same extra orchestration boundary. Six synchronous reentrant and two late-old
completion comparisons already matched, and remain required.

The driver is now a synchronous generator executing the existing port calls and
yielding their promises/values. Each original async in-flight factory awaits each
yielded effect directly: discovery then optional run, or this.resolveRepository
then optional stat/read. Completed programs return directly; synchronous throws
add no await. No awaited orchestration result or Promise assimilation layer remains.
Chinese comments explain the proved admission regression and correction.

The map declarations, reuseInFlightRequest and invalidate bodies, public entrypoint
await, command/query/error/path/fail-open policy remain exact. No new cache, retry,
invalidation, cancellation or shared owner is introduced. All **38 unrelated bodies
and five owner declarations** still match frozen bytes; unrelated remainder audit
also passes. The two factory loops wait for effects; one synchronous driver remains
the command/fs effect dispatcher and one private decision program owns projection.

Comparisons record effect counts and visible first/queued resolution/rejection
order: 48 queued cases at deterministic microtask depths0..7 around six outcomes,
six synchronous reentrant cases, 12 invalidate-during-settlement cases, four
different-key cases and two late-old completion cases. These are **72 cases**, not
144 from counting baseline/current invocations twice. Queued microtasks are owned
test input; no sleeps, budgets or shared in-flight policy were changed.

## Current validation and bindings

On `fdd4ca3`, all **72/72 timing comparisons** pass source and strict emitted.
Original output contracts plus timing pass **206/206 cases across five files** on
source. Broader final source **640/640** and strict emitted **640/640**, **14 files
each**: original resolution134, timing72, graph147, generator161, read projection126.
Actual service/RPC/UI consumers remain included; no native/GUI/remote acceptance
is inferred from these owned-port cases.

Root types (5422 matching locale keys), zero-warning/error lint, formatting, changed
and full architecture passed again on corrected code. CLI17 successful/16 cached
and desktop main/host/scheduler/preload/renderer passed again, retaining existing
CLI/chunk-size/plugin warnings and Linux Windows-CUA-staging gap. Corrected full
offline run on `fdd4ca3`: **530 files, 7059 individual cases, 7051 pass, 8 skip,
0 fail/cancel**, 6 suites, duration711537.351405ms. The unchanged skips are Windows
bootstrap1, Windows/PowerShell delivery5, Claude leaf/declaration1 and Windows
cache-alias1. This is separate from the historical `a828836` run6987/6979pass/8skip.
Exact final runner command is `pnpm test:studio` under the pinned environment below.
Concurrency2, test worker isolation and timeout120000 remain unchanged. Evidence-only
final additions do not repeat the expensive unchanged product suites/builds.

After the executor-disconnection notification, the existing run completed normally.
The subsequent harmless pwd/branch/HEAD/status/log read succeeded: expected lane
branch and `fdd4ca3` remained available, with only the intended new appendix untracked.
No persistent executor blocker, restart, recreation, reset or duplicate test run.

```sh
export PATH=/tmp/node-v24.14.0-linux-x64/bin:/tmp/knorvia-tool-bin:$PATH COREPACK_HOME=/tmp/knorvia-corepack
TSX_TSCONFIG_PATH=packages/ui/tsconfig.json node --experimental-test-module-mocks --import tsx --test --test-concurrency=2 packages/services/test/git-repository-settlement-contract-fast-20261001.test.ts
KNORVIA_GIT_RESOLUTION_TARGET=dist node --experimental-test-module-mocks --import tsx --import ./packages/services/test/git-read-projection-emitted-register-fast-20261001.mjs --test --test-concurrency=2 packages/services/test/git-repository-settlement-contract-fast-20261001.test.ts
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

Current source repo SHA-256
`c28a066566656c3402edbe89f4b40d4090dc0ae9635795a9de5109097c11e189`;
emitted repo JS
`393dbe4699efa3fd0bb1f6d2124c31463718d89d4be0efaa835cc599863cbc80`.
Private read-plan source remains
`6e4cbdb3bbab96d5639133fec4bd02e0dbf95808121751f13fd6caf3cdf4d755`.
Public repo .d.ts remains
`a6a19273740e97f89c1b0cdc88b160570d45749e6d70edbb2c39850f3f95870b`.
Desktop host/index.js SHA-256
`834ebc9ea8540046770ace0844f64a87b3f770b66382d43fa2e40cf099f7b41a`.
The current JSON binds all changed paths through `fdd4ca3`, separately verifies the
two unchanged historical receipt files, records red/current scopes, copied oracle
spans, current protected spans/artifacts and exact test snapshots.

Current candidate payload SHA-256:
`7174d2e4b689ab32b7eb35b62be574a5650d7a6a8b3eacbd6c4891c143accfcb`.

Pinned publisher/local lineage is unchanged from the historical receipt: publisher
872ad960/tree d185a9/blob ffe734dd/sourceSHA474a377e and local import7619e41/
integrated0d80f9c/blob6ce5993/sourceSHA11b1e855; all five original scoped bodies are
exact publisher/local matches. Current syntax retains 47 literal/template facts
and 13 exact expression spans; copied test oracle adds ten disclosed old spans.
Retained query/predicate/checker/path/parser/shape/public declarations/prose and
formatting do not become new contribution. Candidate structures remain the typed
read program and synchronous interpreter/factory relationship, subject to root
review. Whole-file statuses remain unreviewed/NOASSERTION, with no clean-room,
whole-file MIT or rights grant. Shared notices/inventory/older lane27 obligations
are unchanged; parent material26 and CI225 green Linux/Windows7109/zero failures
are parent reports, not independent lane acceptance or licence changes.

The following read-only replay verifies the current candidate and historical
receipt binding separately. It reads only checkout/source artifacts and existing
exact publisher storage, without changing shared licensing records. The schema is
lane-local observational evidence, not an accepted licensing decision.

Post-full-run replay passed. Five separate owned negative JSON probes were rejected:
omitted current file, historical production rebound as current, tampered current
SHA, omitted copied-oracle span and the entire historical candidate supplied as
current. Payload seals were recomputed so probes reached structural/binding checks.
These five receipt probes are separate from the 72/640/7059 product counts.
The unchanged prior watcher/archive/terminal checker was replayed again successfully
within its own historical/current/appendix scope, with local27 and accepted/native=false.

```sh
export PATH=/tmp/node-v24.14.0-linux-x64/bin:/tmp/knorvia-tool-bin:$PATH COREPACK_HOME=/tmp/knorvia-corepack
node --input-type=module <<'JS'
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
const git=args=>execFileSync('git',args,{maxBuffer:64*1024*1024});
const hash=x=>createHash('sha256').update(x).digest('hex');
const e=JSON.parse(readFileSync('docs/knorvia-git-repository-settlement-fast-evidence-20261001.json'));
const {payloadSha256,...payload}=e;
assert.equal(hash(JSON.stringify(payload)),payloadSha256);
assert.equal(e.schemaVersion,1);
assert.equal(e.kind,'services-lane-git-repository-settlement-observations');
assert.equal(e.scope,'current-settlement-candidate');
assert.equal(e.before,'13186d472b9d88242e807c3a90db542bab719f84');
assert.equal(e.baseline,'d639823cdfe9e8b6523336c6fce47aa3c30b0535');
assert.equal(e.production,'fdd4ca3723f792570bf160fdfc1f3132849d6cac');
assert.equal(e.sourceExposure,true);
for(const key of ['cleanRoom','wholeFileLicenseGrant','acceptedReview','nativeAcceptance'])assert.equal(e[key],false);
assert.equal(e.licenseExpression,'NOASSERTION');
assert.equal(e.localObligations,27);
const expected=git(['diff','--name-only',e.before,e.production]).toString().trim().split('\n').sort();
assert.equal(expected.length,14);
assert.deepEqual(e.ownedScope.map(x=>x.path).sort(),expected);
assert.equal(e.protectedFiles.length,33);
assert.equal(e.protectedSharedInputs.length,12);
assert.equal(e.historicalFiles.length,2);
for(const x of [...e.ownedScope,...e.protectedFiles,...e.protectedSharedInputs,...e.protectedHistoricalScope,...e.historicalFiles]){
  const bytes=git(['show',`${x.commit}:${x.path}`]);
  assert.equal(hash(bytes),x.sha256,x.path);
  assert.equal(bytes.length,x.bytes);
  assert.equal(git(['rev-parse',`${x.commit}:${x.path}`]).toString().trim(),x.blob);
  assert.equal(git(['ls-tree',x.commit,'--',x.path]).toString().split(' ')[0],x.mode);
  assert.ok(readFileSync(x.path).equals(bytes),`live bytes ${x.path}`);
}
const old=JSON.parse(readFileSync('docs/knorvia-git-repository-resolution-fast-evidence-20261001.json'));
assert.equal(old.production,e.historicalScope.production);
assert.equal(old.payloadSha256,e.historicalScope.payloadSha256);
assert.notEqual(old.production,e.production);
assert.equal(e.historicalScope.receipt,'996aa34be95e554ae55d816ff459f915f3a86df5');
for(const x of e.generatedArtifacts){assert.equal(x.production,e.production);const bytes=readFileSync(x.path);assert.equal(hash(bytes),x.sha256,x.path);assert.equal(bytes.length,x.bytes);}
const publisherRepo='/tmp/knorvia-services-provenance-upstream-872ad960.git';
assert.equal(git([`--git-dir=${publisherRepo}`,'rev-parse',`${e.lineage.publisherCommit}^{tree}`]).toString().trim(),e.lineage.publisherTree);
const publisher=git([`--git-dir=${publisherRepo}`,'show',`${e.lineage.publisherCommit}:${e.lineage.path}`]);
assert.equal(hash(publisher),e.lineage.publisherSha256);
assert.equal(publisher.length,e.lineage.publisherBytes);
const span=(x,commit,pub=false)=>{const text=(pub?publisher:git(['show',`${commit}:${x.path}`])).toString();const value=text.slice(x.start,x.end);assert.equal(hash(value),x.sha256,`${x.path}:${x.start}`);assert.equal(Buffer.byteLength(value),x.bytes);};
assert.equal(e.scopedLineage.length,5);
assert.equal(e.protectedBodies.length,38);
assert.equal(e.cacheOwner.length,5);
for(const x of e.scopedLineage){span(x.localBaseline,e.baseline);span(x.publisher,null,true);assert.equal(x.localBaseline.sha256,x.publisher.sha256);}
for(const x of [...e.protectedBodies,...e.cacheOwner]){span(x.current,e.production);span(x.localBaseline,e.baseline);assert.equal(x.current.sha256,x.localBaseline.sha256);}
for(const x of e.newStructureSpans)span(x.current,e.production);
for(const x of [...e.retainedLiteralEvidence,...e.retainedExpressionEvidence]){span(x.current,e.production);span(x.localBaseline,e.baseline);if(x.publisher)span(x.publisher,null,true);}
const oracle=JSON.parse(readFileSync(e.copiedBaselineOracle.path));
assert.equal(oracle.commit,e.baseline);
assert.equal(e.copiedBaselineOracle.baseline,e.baseline);
assert.equal(e.copiedBaselineOracle.sourceSha256,oracle.sourceSha256);
assert.deepEqual(e.copiedBaselineOracle.spans,oracle.spans.map(({text,...rest})=>rest));
assert.equal(oracle.copiedOracle,true);
assert.equal(oracle.productionImplementation,false);
assert.equal(oracle.spans.length,10);
const source=git(['show',`${oracle.commit}:${oracle.path}`]).toString();
assert.equal(hash(source),oracle.sourceSha256);
for(const x of oracle.spans){assert.equal(source.slice(x.start,x.end),x.text);assert.equal(hash(x.text),x.sha256);}
for(const mode of ['source','strictEmitted']){assert.equal(e.redProof[mode].cases,72);assert.equal(e.redProof[mode].pass,53);assert.equal(e.redProof[mode].fail,19);}
assert.equal(e.redProof.snapshot,'0fe58689cbcf4945367c2546e709748b5a827ed0');
assert.equal(e.redProof.production,old.production);
for(const key of ['finalSource','finalStrictEmitted']){assert.equal(e.validation[key].production,e.production);assert.equal(e.validation[key].files,14);assert.equal(e.validation[key].cases,640);assert.equal(e.validation[key].pass,640);assert.equal(e.validation[key].fail,0);}
assert.equal(e.validation.full.production,e.production);
assert.equal(e.validation.full.files,530);
assert.equal(e.validation.full.cases,7059);
assert.equal(e.validation.full.pass,7051);
assert.equal(e.validation.full.fail,0);
assert.equal(e.validation.full.skip,8);
assert.equal(e.validation.full.cancelled,0);
assert.equal(e.validation.full.concurrency,2);
assert.equal(e.validation.full.timeoutMs,120000);
console.log('current settlement and historical receipt bindings passed; no rights/native acceptance');
JS
```
