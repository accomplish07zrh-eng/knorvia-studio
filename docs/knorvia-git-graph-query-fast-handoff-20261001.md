# Read-only Git graph query — fixed services lane checkpoint

The repo remains the single Git command effect owner. One private graph plan now
compiles the visible-ref query and projects its response through ordered decoration
rules/expansion and typed record-field relationships. The old graph projector is
removed; resolution, caches, security/environment policy, mutations and checkpoint
behavior remain retained. Root alone integrates `parallel/file-watcher-fast-20261001`.

## Original commits and owned scope

- Spec and legacy source/strict emitted freeze:
  `aa748022925d88050d93adcef01c47d21f581c12`.
- Production implementation:
  `7d03ea5ce0c9501fc51f33e254fd770ec42c8559`.

Production scope is only `packages/services/src/git/repo/gitCliRepo.ts`'s graph
slice and `gitCommitGraphPlan.ts`. Supporting scope is five
`packages/services/test/git-graph-*-fast-20261001` files, the matching spec, this
receipt and digest JSON. No public entrypoint export, dependency, CI, licensing or
other-lane changes are included.

Each invocation awaits the existing this.resolveRepository, checks availability,
compiles one page/query, awaits commandProvider.run once with its receiver, then
projects the response. No graph cache, retry, command adapter or environment path
is added. Ref expansion yields HEAD before its pointed ref; first-match rules do
not fall through on empty-prefix suppression. One local accumulator preserves
first kind/name occurrence. Record fields project in original key order after
timestamp precomputation and after the entire record trim/filter phase.

Read-only AST/byte audit verifies **42 unrelated routine bodies** are byte-identical.
The surgically excluded graph slice also leaves all remaining repo text equal,
including existing cache declarations and command-owner setup; only empty seams
left by permitted deletions are normalized for that comparison. Twenty-four
protected production files are byte-identical: service/read projector, generator
and its three helpers, filtering/public types, CLI helpers/types, config/provider
security/environment, paths/node factory and graph/UI consumers. The emitted public
repo declaration is unchanged, SHA-256
`a6a19273740e97f89c1b0cdc88b160570d45749e6d70edbb2c39850f3f95870b`.

## Actual callers and synthetic acceptance

Traced paths are the node repo/service factory, service getCommitGraph forwarding,
Git descriptor/RPC registration, GitBranchSwitcher dialog, initial/refresh/load-more
callbacks and GitGraphPane's layout/display/detail reads. Tests use the actual repo,
service, ChannelServer, ChannelClient, ProxyChannel and in-memory binary transport.
Actual exported graph layout/display functions accept parsed owned records. A
read-only AST harness selects actual private graph dialog callbacks from source or
emitted JavaScript and executes them with owned closures, including request/page,
selection, admission flags and failure cleanup/log fields. This is callback/layout
acceptance, not mounted React/desktop GUI or remote Host acceptance.

Every command and repository-resolution port is fake. One case uses the unchanged
real resolver with an owned fake command provider and exact synthetic rev-parse
output. Native filesystem exports, default command construction and data-root
access fail if acquired. Logger/Intl/time values and output bytes/strings are owned;
the harness only reads source/emitted artifacts in this workspace. No real repo,
Git mutation, remote/provider/network, credential/profile/user data, native process
or host/security/settings change was used as acceptance data.

## Lineage, source exposure and precise retained content

At pre-edit `57bb3dd`, repo bytes were still local import
`7619e41b950bd52073ebf36754146cf25659d9fa`, also at integrated
`0d80f9ca37b1daef162ecc69bd18f6e8fc30a146`: blob
`6ce5993b5f036690742b15925d839e57185717ae`, 59,042 bytes, SHA-256
`11b1e8550c8aaca02f5dca0c5f7e0ab55141f308483bfe0db25b0ec6b93ed58c`.
No already independently replaced graph boundary or focused graph test was found.

Pinned [ZCode publisher](https://github.com/zai-org/ZCode) commit
`872ad960de7ec172591f7e1952f7849229f94521`, tree
`d185a9a893c00d51fc3fe51fe7371b9eea7de143`, repo blob
`ffe734dd7fcccc15c1128f7be818ea8b41c4fd90`, 58,787 bytes, SHA-256
`474a377eaf9b4420e671b67ed0d9d509b66fef22151b2085b9f5d8847bec92ba`
were verified from the existing separate temporary bare repo, without fetching or
altering production ancestry. All six old private graph helper bodies are identical
local/publisher; getCommitGraph differs only its hidden-ref namespace comment.
Other whole-file differences are retained import/brand ordering and private temp
index location, outside this graph slice. Both sources were exposed; no clean-room
assertion applies.

Three moved bodies remain byte-identical and are explicitly retained:
normalizeGitGraphMaxCount, normalizeGitGraphSkip and addGitGraphRef. The JSON records
current/local/publisher spans and hashes for those bodies and the old seven-body
graph scope. It also records **59 exact literal/template syntax observations** for
the new helper/current graph method against local and publisher spans when matched.
These are positive retention facts, not an exhaustive match count or originality
metric. The unchanged 42-body/remainder audit additionally bounds unrelated scope.

Precise retained compatibility includes:

- Finite/nonnumber/floor/clamp/default policies, literal budgets, visible HEAD/ref
  selector order, pagination lookahead, exact format/field/record delimiters and
  existing hidden-ref prose. There is no added --all, user path, -- separator,
  shell/config/env option or changed escaping/security policy.
- Availability short circuit, command/request/result key order and receivers;
  unborn error phrases, checker label, timeout/truncation/message precedence and
  existing success/unborn flag-edge handling. No unrelated error policy correction.
- Record trim/filter phase, first-six-field handling, raw hashes/parents/subjects/
  authors, parseInt/NaN/millisecond conversion, duplicate commits, whitespace,
  Unicode and adversarial NUL/U+001E/comma/newline quirks. Output is not repaired.
- HEAD/pointer/tag/prefix/slash grammar, empty-prefix suppression, first kind/name
  dedup and name/kind record construction. Compatibility expressions and formatting
  remain retained even when represented in rule/field rows.
- Literal expected protocol/error shapes in tests and the source-exposed in-memory
  RPC/AST harness pattern. Paths, refs, text, dates and fake port values are synthetic
  owned content, not real repositories or accounts.

Candidate new structures are the query/response plan relationship, ordered ref
rules and lazy expansion, and typed field projection/interpreter. They require root
review. Passing tests, hashes, line counts, moved functions or formatting do not
establish originality. Whole-file status remains upstream-modified/unreviewed for
the repo and unreviewed-with-retained-content for the helper, NOASSERTION, with no
whole-file MIT grant. Smallest useful future separation is these interpreter/rule
relationships versus retained normalizer/argv/protocol/coercion/ref-record leaves;
moving retained leaves alone would not make them original. The rest of the repo
is retained implementation, not a whole-file/service/project replacement.

## Validation on final committed source

Pinned Node 24.14.0, pnpm 10.33.2 and TypeScript 6.0.2. Cached-origin freshness
`--no-fetch` passed (ahead106/behind0, no remote tracking; no live freshness claim).
Pre-edit architecture passed; the context command initially used a filesystem path
and failed unknown-module, then the correct services ID reported unmanaged/unassigned,
no contract. No code or policy was changed to resolve that command mistake.

Legacy freeze: **147 source + 147 strict emitted individual cases / three files
each**, zero failures/skips/cancellations. First launch had three file setup failures
before individual cases because the fake filesystem exports omitted access/open/
realpath; all were added as forbidden ports. The next run was 135 cases/134 pass/
one expectation failure: result.then is read once, not twice. Corrected to observed
legacy order before production, then six query/six consumer cases added. This is
fixture correction, not a red product defect proof or weakened contract.

Final focused at `7d03ea5`: **434 source + 434 strict emitted individual cases /
nine files each**, all passed, zero skips/cancellations. Breakdown: query76,
records49, graph consumers22, previous generator161 and Git read126. The existing
strict loader maps emitted services/shared/RPC/UI and rejects source fallback;
private UI callbacks are extracted from actual emitted code.

```sh
export PATH=/tmp/node-v24.14.0-linux-x64/bin:/tmp/knorvia-tool-bin:$PATH COREPACK_HOME=/tmp/knorvia-corepack
TSX_TSCONFIG_PATH=packages/ui/tsconfig.json node --experimental-test-module-mocks --import tsx --test --test-concurrency=2 packages/services/test/git-graph-*-fast-20261001.test.ts packages/services/test/git-message-generator-*.test.ts packages/services/test/git-read-projection-*.test.ts
KNORVIA_GIT_GRAPH_TARGET=dist KNORVIA_GIT_READ_PROJECTION_TARGET=dist node --experimental-test-module-mocks --import tsx --import ./packages/services/test/git-read-projection-emitted-register-fast-20261001.mjs --test --test-concurrency=2 packages/services/test/git-graph-*-fast-20261001.test.ts packages/services/test/git-message-generator-*.test.ts packages/services/test/git-read-projection-*.test.ts
```

Types passed with 5,422 matching locale keys. Lint: zero warnings/errors. Format
and changed/full architecture: passed, zero violations. CLI: 17 successful tasks,
16 cached, Windows CUA staging skipped on Linux. Desktop main/host/preload/renderer
built with existing chunk-size/plugin-timing warnings. These are build results,
not native execution/GUI/provider acceptance. No production or test changes were
needed after these final gates.

Exact final full runner **`pnpm test:studio`**, production and test snapshot
`7d03ea5`: **525 files, 6,853 individual cases, 6,845 pass, eight skip, zero
fail/cancel**, six suites, 534,830.830867 ms. Concurrency2, per-test timeout120,000ms
and isolation/budgets unchanged. The eight skips are the existing Windows bootstrap
case, five Windows/PowerShell delivery cases, deterministic old/new Claude leaf/
public declaration observation and Windows case/slash cache aliases. None is a new
graph case. Subsequent additions are only this observational receipt/digest record;
unchanged expensive product suites/builds were not repeated for those additions.

Source hashes:

- Repo: `60476c3332af0e79f67fc19862926217152ff18f10a9acb1d8f4e4360d91f42c`
- Helper: `ce6ed70519437ec60f381f021cff640bb779bf8025708b16593a882e8a862c3d`
- Emitted repo: `b1ba4c9ed4289a22e41bc6591dba5a7eb2611233916df48ce3737c5976fa166f`
- Emitted helper: `47a4c38d66b3b7cc31e90b4b01444754fa4afb343b42b98c2229a4959b44fde9`

Owned/committed/protected/generated byte facts and exact retained spans are in
[the digest evidence](./knorvia-git-graph-query-fast-evidence-20261001.json).
Generated artifacts are ignored build output, not source commits. Temporary logs
and the read-only AST audit are under `/tmp/knorvia-git-graph-evidence`.

## Read-only digest and retained-span replay

This JSON is a lane observation record, not a shared review/inventory entry or
accepted licence decision. Its fixed scope, schema shape, payload, commit/blob,
protected/generated digests and positive retained spans can be replayed in the
original lane snapshot with the same emitted artifacts. Publisher verification
requires the separate exact object store; absent bytes fail, not pass as verified.
Hashes prove those byte facts, not originality or rights. The remaining-text audit
also compared actual AST-excluded source before committing; its digest/description
is recorded separately from positive span matches.

```sh
KNORVIA_GRAPH_PUBLISHER_REPO=/tmp/knorvia-services-provenance-upstream-872ad960.git node --input-type=module <<'NODE'
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { assertRelativePath } from './scripts/provenance/model.mjs';
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const git = args => execFileSync('git', args, { maxBuffer: 64 * 1024 * 1024 });
const e = JSON.parse(readFileSync('docs/knorvia-git-graph-query-fast-evidence-20261001.json'));
const { payloadSha256, ...payload } = e;
assert.equal(payloadSha256, '9998acc51e57897c8ee932b942ff413916712e37da9d3b68786747c54ce5b237');
assert.equal(hash(JSON.stringify(payload)), payloadSha256);
assert.equal(e.schemaVersion, 1);
assert.equal(e.kind, 'services-lane-git-graph-query-observations');
assert.equal(e.baseline, 'aa748022925d88050d93adcef01c47d21f581c12');
assert.equal(e.production, '7d03ea5ce0c9501fc51f33e254fd770ec42c8559');
assert.equal(e.sourceExposure, true);
for (const key of ['cleanRoom', 'wholeFileLicenseGrant', 'acceptedReview', 'nativeAcceptance']) assert.equal(e[key], false);
assert.equal(e.licenseExpression, 'NOASSERTION');
assert.equal(e.localObligations, 27);
assert.deepEqual(e.ownedScope.map(row => row.path).sort(), git(['diff', '--name-only', e.before, e.production]).toString().trim().split('\n').sort());
const check = (row, commit) => {
  assertRelativePath(row.path);
  assert.match(row.sha256, /^[a-f0-9]{64}$/);
  const bytes = readFileSync(row.path);
  assert.equal(bytes.length, row.bytes); assert.equal(hash(bytes), row.sha256, row.path);
  if (commit) {
    assert.equal(hash(git(['show', `${commit}:${row.path}`])), row.sha256, row.path);
    assert.equal(git(['rev-parse', `${commit}:${row.path}`]).toString().trim(), row.blob);
  }
};
for (const row of e.ownedScope) { assert.equal(row.commit, e.production); check(row, row.commit); }
for (const row of [...e.protectedFiles, ...e.protectedSharedInputs, ...e.protectedHistoricalScope]) check(row, row.commit);
for (const row of e.generatedArtifacts) check(row);
assert.equal(e.ownedScope.length, 8); assert.equal(e.protectedFiles.length, 24);
assert.equal(e.protectedSharedInputs.length, 9); assert.equal(e.protectedHistoricalScope.length, 2);
assert.equal(e.protectedBodies.length, 42); assert.equal(e.retainedBodies.length, 3);
assert.equal(e.localGraphScope.length, 7); assert.equal(e.retainedLiteralEvidence.length, 59);
const l = e.lineage, local = git(['show', `${e.baseline}:${l.path}`]).toString();
assert.equal(hash(local), l.localSha256);
assert.equal(git(['rev-parse', `${l.localImportCommit}:${l.path}`]).toString().trim(), l.localBlob);
assert.equal(hash(git(['show', `${l.integratedBaseline}:${l.path}`])), l.localSha256);
assert.ok(process.env.KNORVIA_GRAPH_PUBLISHER_REPO, 'separate publisher store required');
const prefix = ['--git-dir', process.env.KNORVIA_GRAPH_PUBLISHER_REPO];
assert.equal(git([...prefix, 'rev-parse', `${l.publisherCommit}^{tree}`]).toString().trim(), l.publisherTree);
assert.equal(git([...prefix, 'rev-parse', `${l.publisherCommit}:${l.path}`]).toString().trim(), l.publisherBlob);
const publisher = git([...prefix, 'show', `${l.publisherCommit}:${l.path}`]).toString();
assert.equal(hash(publisher), l.publisherSha256); assert.equal(Buffer.byteLength(publisher), l.publisherBytes);
const span = (s, text) => {
  assertRelativePath(s.path); assert.ok(Number.isInteger(s.start) && Number.isInteger(s.end) && s.start >= 0 && s.end <= text.length && s.end > s.start);
  assert.equal(hash(text.slice(s.start, s.end)), s.sha256);
  assert.equal(Buffer.byteLength(text.slice(s.start, s.end)), s.bytes);
  assert.equal(text.slice(0, s.start).split('\n').length, s.startLine);
  assert.equal(text.slice(0, s.end - 1).split('\n').length, s.endLine);
};
for (const row of [...e.protectedBodies, ...e.retainedBodies]) {
  span(row.current, readFileSync(row.current.path, 'utf8')); span(row.localBaseline, local);
  assert.equal(row.current.sha256, row.localBaseline.sha256);
  if (row.pinnedPublisher) span(row.pinnedPublisher, publisher);
}
for (const row of e.localGraphScope) { span(row.localBaseline, local); span(row.pinnedPublisher, publisher); }
for (const row of e.newStructureSpans) span(row.current, readFileSync(row.current.path, 'utf8'));
for (const row of e.retainedLiteralEvidence) {
  span(row.current, readFileSync(row.current.path, 'utf8')); span(row.localBaseline, local);
  assert.equal(row.current.syntax, row.localBaseline.syntax);
  if (row.pinnedPublisher) { span(row.pinnedPublisher, publisher); assert.equal(row.current.syntax, row.pinnedPublisher.syntax); }
}
console.log('PASS: fixed graph scope, payload/blob/digests, positive retained spans and exact lineage; no rights/native decision');
NODE
```

The unchanged services-current schema/digest checker also passed again:
`node scripts/provenance/services-lane-current-fast-20261001.mjs --publisher-repo
/tmp/knorvia-services-provenance-upstream-872ad960.git --require-publisher
--verify-installed`: historical50/current55/appendix2 paths, 30 refs, zero unavailable
publisher spans, 19 protected paths/17 methods, local27 obligations, accepted/native
false. Its installed node-pty byte observation is not publisher/native acceptance.
That checker remains scoped to the earlier watcher/archive/terminal contribution;
it was not expanded or repurposed to cover the new Git graph/generator scope.

## Protected earlier evidence and limits

Earlier `57bb3dd` generator receipt and `46613b7/c1e1cc2/28d5e79` Git read evidence
remain immutable historical checkpoints. The generator receipt's then-protected
whole repo hash is historical after this authorized graph change; it has not been
silently updated or reused as a current passing digest. The current graph evidence
protects the generator/read projector bytes instead. Root owns Windows path assertion
correction `80d053a`; this branch's earlier consumer test/model remain byte-identical
to `46613b7`. Older Linux results do not establish Windows acceptance.

Nine shared licensing/inventory/package/lock/LICENSE/NOTICE inputs remain
byte-identical to the freeze, and the lane's **27** obligations stay untouched.
Root reports published Keyv closure leaves its root count **26**; that parent fact
is not a local inventory change or a licence grant. Root regenerates shared records
after integration. No whole-project MIT assertion is made.

Linux synthetic repo/service/RPC/layout/private callback acceptance is not actual
Git/process, real repository, Windows/macOS, mounted GUI or remote Host acceptance.
Root's separate native Linux PTY evidence is not counted here. No user data,
security/settings or deployment changes. End at a clean appended checkpoint on
the existing branch and await root's next scoped assignment in this conversation.
