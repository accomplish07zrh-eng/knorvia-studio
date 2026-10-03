# Git commit-message generator — fixed services lane checkpoint

The existing generator remains the sole model-effect owner. Its invocation now
drives a local select/complete plan, ordered prompt blocks with one lazy excerpt
window, and ordered response decisions. Model policy, prompts, caps, public
declarations, errors and ordinary caller behavior are preserved. Root alone
integrates `parallel/file-watcher-fast-20261001`.

## Original commits and scope

- Spec and legacy source/emitted freeze:
  `4f9b0e6d1521f7301994cb885be3bde5193aafc8`.
- Production implementation:
  `93a236d6f441bd3ef2afb7c0e92a8854204414a2`.
- Test-only host-path expectation clarification:
  `31ed94a4120a4c54595ed12ca84119180b5e5a30`.

Production scope is `packages/services/src/git/gitCommitMessageGenerator.ts` and
the private path-level helpers `gitCommitMessageInvocationPlan.ts`,
`gitCommitMessagePromptPlan.ts` and `gitCommitMessageResponsePlan.ts`. Supporting
scope is `packages/services/test/git-message-generator-*`, the corresponding
spec, this receipt and its digest JSON. No public entrypoint exports were added.

The plan yields select then complete, with the original two await boundaries.
Only retained generator methods execute those effects. Each call has its own
plan; there is no additional model invocation, retry, queue, cache or state owner.
The excerpt interpreter preserves prepare/skip/budget/render/charge order,
including the legacy getter/error evaluation on the first exhausted row. Diff
and conversation supply their distinct charging rules. Response transforms and
rejection rows preserve the accepted grammar and preview policy.

Fourteen protected production files are byte-identical to the freeze: Git
service/projector, public Git declarations, config, CLI repo/types/helpers,
command/environment providers, session filtering, node factory, UI action menu
and its session-file scope. The emitted public generator declaration is also
byte-identical to the old declaration, SHA-256
`f8a49d883a5c0564028f5a5ad7c165de2f7117cf744cc28a3a0ad41c6d0ae272`.
The earlier Git consumer test and file-tree model remain byte-identical to
`46613b7968f291a3597180459ccfce6da513624a` in this lane.

## Callers and acceptance boundary

Actual callers traced are the node factory's current-model view and
generateWorkspaceText adapter, unchanged Git service snapshot/filter/diff flow,
Git descriptor and binary RPC, and the UI generation/button callbacks.
Acceptance exercises the real service, ChannelServer, ChannelClient, ProxyChannel
and in-memory binary transport. A read-only TypeScript AST harness selects the
actual private UI callbacks from source or emitted UI and executes them with
owned closures, including generation failure and pending/error cleanup.
This is private-callback acceptance, not mounted React or desktop GUI acceptance.

All model, text, selection, identity, file, diff, conversation, locale and logger
inputs are owned synthetic fixtures. Malformed, rejected, throwing, delayed,
thenable and concurrent ports freeze effect order, receivers and errors.
No model/billing/network request, user conversation, real repo contents, profile,
credential, account data or native process was used. Repo mutations remain outside
this boundary and their fixture ports reject calls.

## Lineage and retained source

Before editing, the generator was still the imported local implementation at
`7619e41b950bd52073ebf36754146cf25659d9fa`, also at integrated
`0d80f9ca37b1daef162ecc69bd18f6e8fc30a146`: blob
`9ff9abf802d4f582a3f05a9ceb5baabbc5fd7490`, 12,307 bytes, SHA-256
`f14b38f83fa037d5f5c09dcf08e8cbe21c9d694230ba2f1893db78624e59c487`.
No already completed independent generator replacement or focused tests were found.

Pinned [ZCode publisher](https://github.com/zai-org/ZCode) commit
`872ad960de7ec172591f7e1952f7849229f94521`, tree
`d185a9a893c00d51fc3fe51fe7371b9eea7de143`, generator blob
`3cb83eb47f3b0ae7d9589195bfdc70af662d79f3`, 12,293 bytes, SHA-256
`41c715e5b7d9a9e52fa88124abfaca1aaf52ba28a819a579aaf8f593f11402c7`
were verified from the existing separate temporary bare repo. Both publisher and
local implementations were exposed. No clean-room claim applies.

The digest record identifies eight byte-identical retained routine bodies:
`resolveCurrentModel`, `complete`, `normalizeModelText`, error constructor,
`resolveCommitMessageLanguage`, `readRuntimeLocale`,
`normalizeConversationContextText` and `clipText`. It also records 145 exact
literal/template/regex observations with current/local/publisher spans when
matched. This is precise positive retention evidence, not an exhaustive match
catalogue or an originality metric.

Retained content also includes all prompt prose/headings/fallbacks/punctuation;
file/path/stat formatting and sparse behavior; limits and omitted counts;
language and normalization policy; truncation markers and charging expressions;
Conventional Commit, fence and prefix regexes; balanced quotes, trim/slice,
UTF-16/Unicode quirks and previews; logger events/field syntax; request and result
shapes; public types, lookup/request/error bodies and compatibility formatting.
The owned golden retains 51 historical observations bound to `28d5e79` and the
old generator digest. Its bytes are unchanged. Other fixtures contain synthetic
paths/text/options/errors; expected compatibility expressions and reused lane RPC
scaffolding are source-exposed retained material.

The contribution candidates are the local two-effect protocol, lazy row/window
relationship and interpreter, ordered prompt-block assembly and response-decision
structure. They require root review. Tests, changed hashes, line counts, relocated
functions and formatting do not establish originality. The main file remains
upstream-modified/unreviewed; helpers are unreviewed additions containing retained
expressions. All four have conservative NOASSERTION status and no whole-file MIT
grant. A useful future separation is the invocation/window interpreter versus
retained prompt/protocol/request/error/format leaves; a move alone would not make
those leaves original. This is a bounded replacement, not whole-service/project
completion or a licence decision.

## Validation and exact bindings

Pinned Node 24.14.0, pnpm 10.33.2 and TypeScript 6.0.2 were used. Cached-origin
freshness with `--no-fetch` and pre-edit architecture/context checks passed;
services remain unmanaged/unassigned with no discovered architecture contract.
No live remote freshness claim is made.

Before production replacement: **161 source + 161 strict emitted individual
cases / four files each**, zero failures/skips/cancellations. Breakdown: 51 prompt,
55 validation, 50 control and five actual caller cases. The first 159-case source
run passed; two sparse-error cases were added and passed before implementation.
There was no initial red product defect claimed in this contract freeze.

Final focused at production `93a236d` and fixture snapshot `31ed94a`:
**287 source + 287 strict emitted individual cases / six files each**, all passed,
zero skips/cancellations. This includes the 161 generator cases and 126 earlier
Git contracts/consumers. The strict loader maps services/shared/RPC/UI dist and
rejects source fallback. UI callback extraction reads actual emitted JavaScript.

```sh
export PATH=/tmp/node-v24.14.0-linux-x64/bin:/tmp/knorvia-tool-bin:$PATH COREPACK_HOME=/tmp/knorvia-corepack
TSX_TSCONFIG_PATH=packages/ui/tsconfig.json node --experimental-test-module-mocks --import tsx --test --test-concurrency=2 packages/services/test/git-message-generator-*.test.ts packages/services/test/git-read-projection-*.test.ts
KNORVIA_GIT_READ_PROJECTION_TARGET=dist node --experimental-test-module-mocks --import tsx --import ./packages/services/test/git-read-projection-emitted-register-fast-20261001.mjs --test --test-concurrency=2 packages/services/test/git-message-generator-*.test.ts packages/services/test/git-read-projection-*.test.ts
```

Root types passed with 5,422 matching locale keys. Lint had zero warnings/errors;
format and changed/full architecture passed with zero violations. CLI build had
17 successful tasks, 16 cached; Windows CUA staging was skipped on Linux. Desktop
main/host/preload/renderer built with existing chunk-size/plugin-timing warnings.
These builds are static corroboration, not executed native Host acceptance.

Exact full runner **`pnpm test:studio`** at production and test snapshot
`93a236d`: **522 files, 6,706 individual cases, 6,698 pass, eight skip, zero
fail/cancel**, six suites, 492,202.606268 ms. Concurrency 2, timeout 120,000 ms and
isolation were unchanged. Skips are the existing Windows bootstrap case, five
Windows/PowerShell delivery cases, deterministic old/new Claude leaf/declaration
observation and Windows case/slash cache aliases. None is a new generator case.

The later test-only path clarification uses the owned input workspacePath for the
logger expectation instead of the absolute Linux checkout path in the immutable
golden. It does not normalize output or alter other expectations. After that append,
both 287-case focused runs, lint, format and changed architecture passed again.
Unchanged expensive full product suites/types/builds were not repeated solely for
the assertion/evidence append; the full result is bound to `93a236d`, not silently
claimed as a later test-tree execution. Final receipt formatting and architecture
checks also passed.

An initial iterator union type error was fixed by explicit done narrowing before
the final typecheck. Two test-only thenable lint warnings were resolved with owned
Promise proxies retaining the receiver/evaluation assertions, without rule waivers.
Those adapters were corroborated against the byte-verified old generator in one
manual probe (zero runner cases). A first temporary `.ts` import resolved as CJS
and failed to construct the class; temporary ESM transpilation corrected that
probe, without production changes. A read-only large licensing comparison exceeded
Node's default child-output buffer; a sufficient read buffer fixed the audit.
No test timeout/runtime budget, sandbox policy or approval rule was changed.

Production source hashes and all emitted hashes are in
[the digest evidence](./knorvia-git-message-generator-fast-evidence-20261001.json).
The source generator hash is
`ff759b2a18d6ac589348f2a2fec18838796a653de3c5c5b066ec3b5f34b7a04d`.
Generated artifacts are ignored output and not source commits. Temporary logs
are under `/tmp/knorvia-git-message-generator-evidence`.

## Digest replay and protected historical scope

The evidence JSON is an observational lane record, not a shared inventory/review
entry. Its schemaVersion/kind, fixed commits, path set and payload/digest checks
can be replayed after the same builds with the following read-only command. A
separate publisher object store is required; missing publisher bytes fail rather
than being treated as verified. This command checks byte facts, not licence rights.

```sh
KNORVIA_GENERATOR_PUBLISHER_REPO=/tmp/knorvia-services-provenance-upstream-872ad960.git node --input-type=module <<'NODE'
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { assertRelativePath } from './scripts/provenance/model.mjs';
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const git = args => execFileSync('git', args, { maxBuffer: 64 * 1024 * 1024 });
const e = JSON.parse(readFileSync('docs/knorvia-git-message-generator-fast-evidence-20261001.json'));
const { payloadSha256, ...payload } = e;
assert.equal(payloadSha256, '051e10968b2a33666a356d8a54d53d69b194e037a284cbe50712b384e1693dae');
assert.equal(hash(JSON.stringify(payload)), payloadSha256);
assert.equal(e.schemaVersion, 1);
assert.equal(e.kind, 'services-lane-git-message-generator-observations');
assert.equal(e.baseline, '4f9b0e6d1521f7301994cb885be3bde5193aafc8');
assert.equal(e.production, '93a236d6f441bd3ef2afb7c0e92a8854204414a2');
assert.equal(e.fixtureSnapshot, '31ed94a4120a4c54595ed12ca84119180b5e5a30');
assert.equal(e.sourceExposure, true);
for (const key of ['cleanRoom', 'wholeFileLicenseGrant', 'acceptedReview', 'nativeAcceptance']) assert.equal(e[key], false);
assert.equal(e.licenseExpression, 'NOASSERTION');
assert.equal(e.obligations, 27);
const expected = git(['diff', '--name-only', '28d5e79', e.fixtureSnapshot]).toString().trim().split('\n').sort();
assert.deepEqual(e.ownedScope.map(row => row.path).sort(), expected);
assert.equal(expected.length, 13);
const check = (row, commit) => {
  assertRelativePath(row.path);
  assert.match(row.sha256, /^[a-f0-9]{64}$/);
  const bytes = readFileSync(row.path);
  assert.equal(bytes.length, row.bytes);
  assert.equal(hash(bytes), row.sha256, row.path);
  if (commit) assert.equal(hash(git(['show', `${commit}:${row.path}`])), row.sha256, row.path);
};
for (const row of e.ownedScope) {
  assert.equal(row.commit, row.path.startsWith('packages/services/src/') ? e.production : e.fixtureSnapshot);
  check(row, row.commit);
}
for (const row of e.protectedFiles) check(row, e.baseline);
for (const row of [...e.protectedSharedInputs, ...e.protectedHistoricalScope]) check(row, row.commit);
for (const row of e.generatedArtifacts) check(row);
assert.equal(e.protectedFiles.length, 14);
assert.equal(e.protectedSharedInputs.length, 9);
assert.equal(e.protectedHistoricalScope.length, 2);
assert.equal(e.retainedBodies.length, 8);
assert.equal(e.retainedLiteralEvidence.length, 145);
const lineage = e.lineage;
assert.equal(hash(git(['show', `${e.baseline}:${lineage.path}`])), lineage.localSha256);
assert.equal(git(['rev-parse', `${lineage.localImportCommit}:${lineage.path}`]).toString().trim(), lineage.localBlob);
assert.equal(hash(git(['show', `${lineage.integratedBaseline}:${lineage.path}`])), lineage.localSha256);
assert.ok(process.env.KNORVIA_GENERATOR_PUBLISHER_REPO, 'separate publisher store required');
const prefix = ['--git-dir', process.env.KNORVIA_GENERATOR_PUBLISHER_REPO];
assert.equal(git([...prefix, 'rev-parse', `${lineage.publisherCommit}^{tree}`]).toString().trim(), lineage.publisherTree);
assert.equal(git([...prefix, 'rev-parse', `${lineage.publisherCommit}:${lineage.path}`]).toString().trim(), lineage.publisherBlob);
const publisher = git([...prefix, 'show', `${lineage.publisherCommit}:${lineage.path}`]);
assert.equal(hash(publisher), lineage.publisherSha256);
assert.equal(publisher.length, lineage.publisherBytes);
console.log('PASS: fixed scope, payload, owned/protected/generated digests, local/publisher lineage; no rights decision');
NODE
```

The existing services-current checker also passed again with
`--publisher-repo /tmp/knorvia-services-provenance-upstream-872ad960.git
--require-publisher --verify-installed`: historical 50/current 55/appendix two
paths, 30 refs, zero unavailable publisher spans, 19 protected paths/17 methods,
local 27 obligations, accepted/native false. Its schema is scoped to the previous
watcher/archive/terminal candidate; it has not been repurposed to cover this new
generator. Historical matrices and receipts remain immutable.

Root reports CI222 `0dc764e` passed Linux 6914/6906 pass/eight skip; Windows had
6914/6912 pass/one fail/one skip. That earlier Git consumer assertion used a host
backslash expected key while unchanged file-tree model normalizes forward slashes.
Root owns its later assertion correction and literal Windows/POSIX model case,
127 source and 127 strict emitted Git cases. Those parent-reported results are
not this lane's execution; older Linux evidence cannot establish Windows acceptance.
This generator batch does not edit the older test or its checkpoint bindings.

Root also reports exact Keyv publisher material at `d109b32` plus `08614d4`, all
928 old notice blocks preserved, closing only Keyv and root obligations 27→26.
This is parent-reported evidence, not a local licensing change. Nine protected
shared inputs here, including licensing/inventory/package/lock/LICENSE/NOTICE,
remain byte-identical and local material obligations remain **27**. Root regenerates
shared provenance after integration. No whole-project MIT or licence grant follows.

## Gaps and clean checkpoint

Linux synthetic model/service/RPC/private UI callback acceptance does not establish
real provider/network/billing, mounted GUI, remote Host, Windows/macOS or native
Git acceptance. Root's separate Linux source-built PTY acceptance is not duplicated
or counted here. No user-data/security/settings changes or deployment were made.
End at a clean appended checkpoint on the same branch and await root's next scoped
assignment in this conversation.
