# Lane A: Skill and model catalog checkpoints

2026-10-01. Branch: `parallel/cli-tools-fast-20261001`. Base:
`0d80f9ca37b1daef162ecc69bd18f6e8fc30a146`.

Skill's immutable checkpoint was received and locally reviewed by root. The
continuation below replaces ListModels/model-reference on the same branch, with
separate commits and frozen source/emitted contracts. The Skill sections record
that earlier checkpoint; their validation counts and remaining scope are
historical. This lane makes no whole-product independence or license claim.

## Integration commits and owned paths

Apply these original commits in order:

1. `0a8b4d3` — freeze Skill admission/execution specification and compatibility tests.
2. `cbd6835` — replace execution with a per-call effect transaction and span renderer.
3. The following documentation commit contains this evidence only.

Production paths, all inside Lane A's boundary:

- `apps/cli/packages/core/src/tool/handlers/skill.ts`
- `apps/cli/packages/core/src/tool/handlers/skill-execution.ts`
- `apps/cli/packages/core/src/tool/handlers/skill-instructions.ts`

Supporting paths:

- `apps/cli/packages/core/test/skill-tool-contract.json`
- `apps/cli/packages/core/test/skill-tool-contract.test.ts`
- `apps/cli/packages/core/test/skill-tool-executor.test.ts`
- `apps/cli/packages/core/test/skill-tool-fixture.ts`
- `specs/knorvia-skill-tool-execution.md`
- This document.

No TaskStop, TaskOutput, file-window helper, ListModels/model-reference, package,
lockfile, CI, shared provenance, license/notice, preview identity, credentials or
user data file was changed. Only this named branch is eligible for pushing; root
remains the integration-branch writer.

## Baseline, lineage and retained material

The workspace already had this branch at the exact assigned base and five
untracked Skill spec/test drafts. Those drafts were inspected, retained and
corrected. Root/CLI AGENTS.md and architecture-governance SKILL.md were read.
Freshness passed: ahead 65 / behind 0 relative to origin/main, with no lane tracking
branch at start. Architecture check reported zero violations before edits; the
CLI context is currently unmanaged with no declared requirements and identifies
the existing tool contract as its contract surface.

The initial recovery-branch fetch returned `bd0bb014c0974334557fa51814709d0b78f35f1d`.
The original handoff incorrectly described that object as a newer recovery head.
Actual ancestry establishes the opposite: `git merge-base bd0bb014 0d80f9c`
returns `bd0bb014`; `git merge-base --is-ancestor bd0bb014 0d80f9c` exits 0,
and the reverse exits 1. `git rev-list --left-right --count bd0bb014...0d80f9c`
returns `0 65`. It is an ancestor 65 commits behind the assigned integrated base.
The exact assigned base was fetched by hash and verified; no rebase or
integration-branch write was performed. This correction is a subsequent commit;
the three original Skill checkpoint commits remain immutable.

The current audit was inspected without regeneration or edits:

| File               | Classification/review     | Fixed upstream blob                        |
| ------------------ | ------------------------- | ------------------------------------------ |
| Skill handler      | upstream-modified / null  | `41ff843cd8d071ee3af073de499c816d4e0ef26b` |
| ListModels handler | upstream-modified / null  | `89c47e1dd00749cf78df1375dc3ff3376a463bb7` |
| model-reference    | upstream-modified / null  | `e36fb4d796e030887c3895bff2ccc837c9df69a8` |
| Skill schema       | upstream-unchanged / null | `0511a59aa8430787fba24b570417999581310b7a` |

The implementer read the inherited source and consumers and used the exact old
handler as a temporary differential reference. This is exposed-source work.
The declaration, model-facing prompt, error wording, instruction wrapper,
permission values and schema references are deliberately retained compatibility
material. The new transaction and renderer do not preserve the old
regex/filter handler algorithm or a runtime fallback. The full Skill file still
contains retained declaration/prompt material; it must not receive a blanket
original/clean-room/MIT classification from this checkpoint. The Skill schema,
adapter and executor were not replaced here. LICENSE/NOTICE and all 27 unresolved
material obligations remain in force; root must regenerate and review shared
provenance during integration.

## Behavior and owners

The existing executor remains the owner of admission, hooks, permissions, fixed
30000ms deadlines, cancellation, serialization and lifecycle events. SkillPort
remains the owner of discovery, resolution, filesystem access and size limits.
The new transaction retains no state across calls. It emits a lazy load request,
receives one result, emits lazy telemetry, then renders instructions. The
interpreter alone awaits the existing SkillPort; no direct filesystem, network or
process access was added.

Frozen behavior includes current/legacy input precedence and ignored args, schema
identity and declaration ordering, parse-before-port failure, exact missing-port
CoreError fields, one load with receiver/cwd/explicit trace keys/100000-byte limit,
child-signal identity, optional telemetry before projection, original errors,
whitespace/truncation, both directory markers and JavaScript dollar-substitution
quirks. Lazy reads preserve the missing-port and absent-observer boundaries.
Interleaved calls preserve separate content and resolved metadata.

The actual permission service's matrix was compared with the old handler over 12
cases: build/plan allow Skill unless hard/project rules deny; auto returns
`Auto mode is reserved but not implemented yet`; yolo preserves its existing
pass-through behavior, including hard/project rules. No policy implementation or
security configuration was changed.

## Executed validation

Used the locally available pinned Node **24.14.0** and pnpm **10.33.2**. The initial
default pnpm 11.19.0 invocation failed while trying to create its home store; it
was replaced with the pinned local toolchain without dependency or lock edits.

| Check                                                                                              | Result                                                                                               |
| -------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------- |
| Initial frozen contracts, inherited source and emitted JS                                          | 11/14 each; three local fixture errors corrected before production edits, then 14/14 each            |
| Complete contract-only commit in isolated detached worktree, inherited source                      | 17/17; temporary worktree removed afterward                                                          |
| Final source Skill + existing executor admission/authority/execution + permission capability tests | **49/49**                                                                                            |
| Final Skill contracts through emitted handler, registry, executor and permission service           | **17/17**                                                                                            |
| Generated old/new output comparison, source and emitted                                            | **30556/30556 in each mode**                                                                         |
| `pnpm build:cli-packages`                                                                          | **17/17 tasks passed**; final build 10 cached, fresh core/CLI consumers                              |
| `pnpm typecheck`                                                                                   | Passed, including 5422 matching i18n keys                                                            |
| `pnpm --dir apps/cli typecheck`                                                                    | Passed, all 16 selected workspace projects                                                           |
| `pnpm lint`                                                                                        | Passed, 0 warnings/errors under root configuration                                                   |
| `pnpm --dir apps/cli lint`                                                                         | Passed under CLI configuration                                                                       |
| Explicit `oxlint --no-ignore` on all six changed source/test TS files from core cwd                | Passed                                                                                               |
| `pnpm --dir apps/cli/packages/core lint`                                                           | Failed: 24 errors and 11 warnings in 27 files outside this lane, all byte-identical to assigned base |
| `pnpm fmt:check`                                                                                   | Passed                                                                                               |
| `pnpm architecture:check --changed`                                                                | Passed, 0 violations/baseline/new                                                                    |
| `git diff --check`                                                                                 | Passed                                                                                               |

The source/executor command used Node's repository-standard
`--experimental-test-module-mocks --import tsx --test` flags on:
`skill-tool-contract.test.ts`, `skill-tool-executor.test.ts`,
`tool-invocation-admission.test.ts`, `tool-invocation-authority.test.ts`,
`tool-invocation-execution.test.ts` and `permission-policy-capability.test.ts`.
An initial broader run without the module-mocking flag failed at that existing
test's startup; rerunning with the required flag passed. Emitted mode sets the
test-only `KNORVIA_SKILL_TEST_EMITTED=1` and runs the two Skill files.

An added mode-matrix test initially assumed auto admission and yolo denials.
Investigation and the old/new 12-case comparison established the actual retained
rules above; the assertion/spec were corrected. Existing tracked tests,
permission behavior and deadline budgets were never relaxed or changed.

The core lint failures are max-lines and unrelated unused/spread findings. Every
affected file was compared byte-for-byte with `git show <assigned-base>:<path>`.
Configured root/CLI lint does not establish that this broader legacy core gate
passes. No failed file was edited to quiet the additional gate.

The build retained existing `unsupported-dynamic-import` warnings in REPL
`runtime-values.js`; Windows CUA driver staging was skipped on Linux. Inspecting
both `apps/cli/packages/cli/dist/knorvia.cjs` and
`apps/cli/packages/tui/dist/index.js` found the newly emitted
`skill-execution.js`/`skill-instructions.js` modules and their transaction/span
renderer. The frozen tests also exercise the real built-in export and registry,
including `includeSkill` registration behavior.

## Differential evidence and source digests

The temporary reference was generated from `git show` at the exact assigned
Skill source, using TypeScript `transpileModule` with ESNext module/target. It
exists only outside tracked product source and is never a runtime fallback.
The finite comparison used 21 directory fragments in ordered pairs, ten content
cases, three resolved names, both truncation values (26460 cases), plus 4096
seeded combinations (`0x534b494c`). Cases cover dollar replacements, unknown and
malformed markers, inserted markers, nested spans, Unicode/lone surrogates,
Windows-style directories and whitespace. Every full instruction string matched.

- Expected-case/output sequence SHA-256: `3bc91f2ab11fe8d55d13c0267262c018bb43093685ba1ca01ce5d708432109f2`
- Temporary baseline module SHA-256: `9db927be7f9bb00074664784b7b093e099cd1e291b9e722335ac86fe5c84811e`
- Frozen JSON fixture SHA-256: `f84940a79d037decca6ceb3a63b761c35592fe734acb4e32691ae85564a37620`

| Production file       | Lines | SHA-256                                                            |
| --------------------- | ----- | ------------------------------------------------------------------ |
| skill.ts              | 85    | `b79515bbb85f914821ed0391a225f48d82bbd92f132f63ffa23200cc061193c1` |
| skill-execution.ts    | 86    | `001f4fc0189ac5357759d23f6454c72734e709fce7f3c410bda20dca852faaf3` |
| skill-instructions.ts | 98    | `4c5883ab5f269462db1eae086f2374523a1d35854bc105234223b49d8c711999` |

Net production line change is +119 (150 inherited handler lines become 269 lines
across the declaration and two cohesive local helpers). No new package export,
module dependency or state owner was introduced.

## Remaining acceptance and scope

No live model/provider, actual user skill filesystem, Windows/macOS/native CUA,
desktop/Web interaction or visual acceptance was exercised. The full
`pnpm test:studio` suite and desktop/Web builds were not run for this isolated
CLI tool boundary; the related executor and CLI build checks above were run.
Synthetic ports and project records were used, with no real user data access.

Core's broader legacy lint gate remains failing outside Lane A. ListModels and
model-reference still require their own specification, baseline contracts and
implementation work. Shared provenance/reviews and material-obligation closure
remain with root. No production deployment, release, merge or integration/main
push was performed. Stop at this Skill checkpoint and await the next assignment
in this conversation.

## ListModels/model-reference continuation

The exact assigned integrated base remains `0d80f9c`. Initial continuation
freshness passed with the lane synchronized to its upstream and ahead 68 / behind
0 relative to origin/main. Architecture check/context ran before code changes;
the CLI context is unmanaged, with the existing tool contract as its surface.
The recovery-object ancestry correction above is based on Git evidence, not
commit dates or branch names. No Skill commit was amended or rebased; Skill's
three production files remain byte-identical to checkpoint `e7c1cd9`.

Apply the original continuation commits in this order:

1. `ac37f13` — correct the unsupported newer-recovery-head description.
2. `7dc53fd` — specify the model catalog boundary and freeze inherited contracts.
3. `85e9527` — replace model-reference resolution with per-call catalog decisions.
4. `41c6e61` — freeze ListModels optional-accessor and sparse-array behavior.
5. `ba78f5e` — replace ListModels projection/text and add finite comparison driver.
6. `3291352` — retain the iterable-only levels-copy error boundary.
7. `da0fa64` — retain array-slot reasoning-level choice without invoking its iterator.
8. The subsequent documentation commit records this continuation's final evidence.

New or changed production paths:

- `apps/cli/packages/core/src/tool/handlers/list-models.ts`
- `apps/cli/packages/core/src/tool/handlers/list-models-projection.ts`
- `apps/cli/packages/core/src/tool/handlers/model-reference.ts`
- `apps/cli/packages/core/src/tool/handlers/model-reference-policy.ts`
- `apps/cli/packages/core/src/tool/handlers/model-reference-diagnostics.ts`

Supporting paths:

- `specs/knorvia-cli-model-catalog-tools.md`
- `apps/cli/packages/core/test/model-catalog-contract.json`
- `apps/cli/packages/core/test/model-catalog-fixture.ts`
- `apps/cli/packages/core/test/list-models-contract.test.ts`
- `apps/cli/packages/core/test/model-reference-contract.test.ts`
- `apps/cli/packages/core/test/model-catalog-consumers.test.ts`
- `apps/cli/packages/core/test/model-catalog-differential.mts`
- This lane evidence document.

### Lineage and replacement boundary

The inherited ListModels file SHA-256 was
`db86bff7aabdcae009e984b9f61bf587ab0c4834902b93501bc9a0edeb1b4f75`;
model-reference was
`37529f73d2be588773ef03e4a2ad0261e92e1e007d5965845c27dac8c22a267e`.
The existing audit still records both as upstream-modified with null review and
the fixed upstream blobs in the earlier lineage table. The unchanged ListModels
schema is upstream-unchanged/null, blob
`29fa41178da95a725d3026e4bdc1849a640b03c2`; ModelCatalogPort is
upstream-unchanged/null, blob `bce118003750d59e53c6a0b78d58c002779638e1`.

The implementer read inherited sources, schemas and actual consumers. Frozen
compatibility values include full declarations, prompts, schemas, all output
fields/property order and exact diagnostic/model text. Handler parsing continues
to use the existing shared model-selection codec and its error/cause boundary.
These retained materials and unreplaced contracts prohibit a blanket original,
MIT or clean-room classification. No new license header or provenance review was
added. LICENSE/NOTICE, preview identity and all 27 material obligations remain;
root regenerates shared provenance during integration.

The resolver now scans delimiters into a query, builds a query-scoped name index,
and produces an explicit choice/refusal outcome. Candidate objects stay the
original catalog entries; the index is discarded each call. Diagnostics are
rendered from the outcome with the existing bounded preview and exact wording.
This replaces the inherited filter/match/options implementation, while the
public four exports remain unchanged. Qualified lookups do not touch other
providers' model-name getters. Provider labels never become matching aliases.

ListModels now projects through an ordered field policy into a fresh snapshot and
writes model text after full strict-schema admission. It preserves fresh,
receiver-bound, synchronous, zero-argument port reads; current-before-projection;
optional undefined omission; raw values; copied level arrays; duplicate/catalog
order; defined-value second accessor reads; and sparse-array behavior. Its public
declaration, permission, 10000ms deadline, 24000-byte budget and trace contract are
retained. There is no cache, direct I/O, fallback or new port argument.

Final review caught that the initial `Array.from` copy accepted array-like,
non-iterable values the inherited spread rejects. Before correcting it, five
malformed/custom-iterator cases passed against the temporary exact-base module,
and the new local regression failed against the replacement. The spec/test were
written first, then iterator copying restored rejection and original iterator
failures. The reference probe requires the same tsx loader as the other probes;
its first loader-free attempt failed at dependency resolution, before assertions.

A final exact-base probe also confirmed that explicit level selection reads
array slots, even when the levels array supplies a throwing custom iterator.
That regression passed against the old module and failed against the initial
replacement. The spec/test preceded a captured-length slot scan in `da0fa64`;
source/emitted consumer contracts and the generated comparison were rerun for
the final code.

### Frozen and consumer validation

The spec and fixed JSON fixture were committed before replacing either
entrypoint. The fixture contains seven catalog/output/text snapshots, 41
resolution outcomes with entry/candidate indexes, ten codec/error cases, complete
entry declarations and the missing-catalog failure. Initial source/emitted
baselines passed 18/20 each: two new assertions incorrectly assumed raw Result
output and unwrapped business-error text. Observed inherited executor behavior
uses serialization/display under Result and `<tool_use_error>` wrapping. Those
local assertions were corrected, then 20/20 passed in both modes before code
replacement. No tracked executor test or behavior was relaxed. Two further
ListModels tests passed 10/10 in source/emitted against the still-inherited
ListModels before its replacement, freezing accessor and sparse behavior.

The actual registry tests preserve entry/schema identity and dynamic-workflow
registration gating. Executor tests cover output, model content, UI display,
lifecycle/trace, zero-argument reads, strict admission, policy/user/hook refusal
and missing-port business code 31. Actual permission modes remain build/plan/yolo
allow and reserved auto deny. Source and emitted CreateWorkflow/AmendWorkflow
resolvers retain canonicalization, pre-file-access rejection, catalog-missing
errors, string/null/omitted choices and inherited re-resolution. Synthetic ports
and fictional records were used; no real user catalog, provider or workflow run
was accessed.

| Check                                                                                                | Result                                                                                         |
| ---------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------- |
| Final source model catalog contracts + Skill regression + existing executor/permission/display tests | **77/77**                                                                                      |
| Emitted model catalog contracts                                                                      | **24/24**                                                                                      |
| Emitted immutable Skill contracts/executor regression                                                | **17/17** (10 contract + 7 executor)                                                           |
| Generated exact-base comparison, source and emitted                                                  | **33171 resolution cases + 512 snapshots/texts in each mode**, all matched                     |
| `pnpm build:cli-packages`                                                                            | **17/17 tasks passed**, 10 cached; fresh core/CLI/TUI consumers                                |
| `pnpm typecheck`                                                                                     | Passed, including 5422 matching i18n keys                                                      |
| `pnpm --dir apps/cli typecheck`                                                                      | Passed, all 16 selected workspace projects                                                     |
| `pnpm lint` / `pnpm --dir apps/cli lint`                                                             | Passed under configured scopes, 0 warnings/errors                                              |
| Explicit core-cwd `oxlint --no-ignore` on five production and five supporting TS/MTS files           | Passed with no output/warnings                                                                 |
| Broader `pnpm --dir apps/cli/packages/core lint`                                                     | Failed: **24 errors/11 warnings in 27 files**, all byte-identical to assigned base             |
| `pnpm architecture:check --changed` / full `pnpm architecture:check`                                 | Passed, 0 violations/baseline/new                                                              |
| `pnpm fmt:check` / `git diff --check`                                                                | Passed before final evidence update; rechecked at checkpoint                                   |
| `pnpm test:studio`                                                                                   | 6034 passed / 8 skipped / 0 failed across 6042 tests and 501 files; unchanged 120000ms timeout |

The source command uses repository-standard module-mocking/tsx/test flags on the
three model-catalog `.test.ts` files, both Skill files, executor
admission/authority/execution, permission-policy-capability and
workflow-catalog-display. Emitted mode uses the test-only
`KNORVIA_MODEL_CATALOG_TEST_EMITTED=1` and existing
`KNORVIA_SKILL_TEST_EMITTED=1`; production configuration is unchanged.

Both `apps/cli/packages/cli/dist/knorvia.cjs` and
`apps/cli/packages/tui/dist/index.js` contain `decideCatalogModel`,
`explainCatalogRefusal`, `projectCatalog`, `ROW_FIELDS` and `renderListModels`.
This supplements direct emitted registry/executor/workflow consumer contracts.
The CLI build retains the existing unsupported-dynamic-import warning from
unchanged REPL runtime-values; Windows driver staging is skipped on Linux.

The full offline suite completed before the final array-slot correction. It
included the new ListModels iterable regression, with 6034 passes and no failure.
Seven skips require Windows/PowerShell, and one is the optional old/new Claude
leaf-observation comparison. Final focused source/emitted tests, generated
comparison and CLI build cover `da0fa64`; the full suite was not repeated after
that local correction. No timeout budget or skipped-test condition was changed.

### Finite comparison and digests

The manual `model-catalog-differential.mts` driver is tracked; inherited reference
modules remain outside the repository. They were produced with `git show` at the
exact assigned base and TypeScript `transpileModule` using ESNext module/target.
The temporary ListModels module's relative model-reference import was pointed
at the temporary reference module. No inherited implementation is shipped as a
runtime fallback. Reproduce with `node --import tsx <driver> <reference.mjs>
<list-models.mjs>` and repeat with the emitted-mode test flag after the CLI build.

Seed `0x4b4e4f52` (1263423314) generates 512 catalogs, including 76-row catalogs
that cross the 40-line diagnostic preview, mixed current/disabled/default flags,
duplicate names, empty/whitespace tokens, raw labels/reasons, zero context,
Unicode, slashes and dollars. Full JSON property order and model-facing strings
match, entry/candidate identities are retained, arrays are copied and catalogs
are unmodified. A new driver import initially named an absent fixture export;
it was corrected before comparison ran. No product contract was changed for it.

- Matched output sequence SHA-256 in both modes: `ae2ba79dedd7b4c953bbc636933d369d996e36d3bc25a3d6331e0d2c990d7537`
- Temporary model-reference module: `e8f25b2a3d83e9bfa7aaad05f2d351b1ec33f7bc5161381e0e04e9fa2555d08e`
- Temporary ListModels module: `dcc60d10b2e3f1b6f9f74aa990ea1520137d210ee01ecd92d88b1c944b0ddc72`
- Frozen fixture: `e0be626cabdc7b74f257f6d022d1cb89e84e8f4487cae5df03e18c403c2fcb01`

| Production file                | Lines | SHA-256                                                            |
| ------------------------------ | ----- | ------------------------------------------------------------------ |
| list-models.ts                 | 85    | `57b78a7fa81faaa7bdc137d262f979df20f0bd7fe28cbb73b4648940a825a787` |
| list-models-projection.ts      | 94    | `92f2d8bdfd3a42dabfb33251e0eb451097fe3ee38f6ef6fd1c9e40cd92815bb9` |
| model-reference.ts             | 55    | `20109a528b6170169f3451ce4c4a78b118202995680fa53ee1bef79b55c636ba` |
| model-reference-policy.ts      | 113   | `066bc48046693179fdcafcae4e5980164e7abd4204fcd35b854d0c1bff5785f4` |
| model-reference-diagnostics.ts | 67    | `4a26491042186f6de7d4d4547d0f1b6adcaa4edf0ac612a7a45510a38aacb1a4` |

### Remaining acceptance and clean checkpoint

Linux synthetic source/emitted evidence does not establish live provider/model,
native Windows/macOS/CUA, actual user filesystem, desktop/Web visual or packaged
application acceptance. Those were not exercised here. Existing broader core
lint failures remain outside Lane A. Retained contracts/material, shared
provenance regeneration and all 27 obligation reviews remain with root.

Only owned paths were changed. TaskOutput/TaskStop, common package/lock/CI,
licensing indexes/reviews, license notices, credentials/security and user data
remain unchanged. No release, deployment, merge or integration/main push occurs
in this lane. Root receives original commits from the named branch; this lane
stops at a clean checkpoint and awaits the next assignment in this same thread.

## AskUserQuestion continuation

This assignment starts at immutable checkpoint
`803062001bf433d967d84f716d520cdf34d6b943`. Skill, ListModels/model-reference and
their prior supporting sources/tests/specs remain byte-identical to that commit.
The earlier ancestry correction for `bd0bb014` remains applicable. This lane did
not amend, rebase or replace any prior commit. Before edits, freshness passed
with ahead 76 / behind 0 relative to origin/main; the CLI architecture context
remained unmanaged/unassigned and both initial architecture checks passed.

### Original commits and paths

1. `cde9b0c` — write the AskUserQuestion spec and freeze 19 source/emitted contracts
   against the inherited implementation before changing production code.
2. `7d3066f` — replace collected-answer admission/projection and narration control
   flow; add the finite comparison driver.

Production ownership is limited to `ask-user-question.ts`,
`ask-user-question-result.ts` and `ask-user-question-narration.ts` in the core
handler directory. Supporting ownership is limited to the four
`ask-user-question-*` TS/MTS test/support files, the corresponding JSON fixture,
`specs/knorvia-ask-user-question-result.md` and this lane evidence document.
No Todo, TaskOutput/TaskStop, another lane, public contract, shared provenance,
package/lock/CI/security or user-data file is changed.

### Lineage, retained contracts and owners

The current audit marks the inherited handler upstream-modified/null review,
with fixed upstream blob `e51ac0d494b741693daee2d1f2757a0c0f460018` and original
SHA-256 `990090a2d9dcb27863a7ab270f8d4f8ed1d41bf63cf754ce0c2c0eeb6cf451f5`.
Its handler history contains `7619e41` (publish latest preview). The unchanged
public schema remains upstream-unchanged/null review, fixed blob
`3949c85e62c5ddec2d0509819ef8f904bd23f371`. The implementer inspected those sources
and actual consumers; this is exposed-source replacement work. Public
declarations, schemas, prompt/output prose, CoreError material and the small
sparse-slot/inherited-key membership primitive remain retained compatibility
material. There is no clean-room, MIT, whole-file originality or whole-product
independence claim. LICENSE/NOTICE, preview identity and all 27 unresolved
material obligations remain unchanged; root regenerates shared provenance.

The existing broker is the sole owner of question publication and answers. The
executor owns admission, hooks, permission, cancellation, deadlines and events;
clients own display IDs. The replaced handler consumes already-collected answers
and never creates an interaction. A local return/refusal decision now projects
ordered accepted fields or raises the existing error at the async boundary.
Narration now folds text per call and selects explicit none/partial/complete
outcomes. The inherited mapped-parts pipeline is removed. No cache, fallback,
timer, response owner, external action or public package export is introduced.

### Frozen and final consumer evidence

The fixture records 41 input cases (11 accepted, 30 rejected), 13 raw formatter
cases, all 14 public entry keys and complete declaration/schema/text contracts.
Both 19-test source and emitted baselines passed before production edits. They
preserve strict admission, answer/question/option order, generated display IDs,
unknown answer keys, empty/partial answers, metadata omission, annotations,
ordered issue paths, exact errors/text, accessor multiplicity/throw identity,
early empty-answer behavior and sparse/prototype membership.

Actual registry/executor/permission consumers run with synthetic prepared
responses only: modify/allow/deny, malformed original/modified input, policy/hook
refusal, trace/request IDs and event order, pre/pending cancellation, permission
timeout propagation and a 40000ms simulated permission wait outside the unchanged
30000ms handler deadline. AskUserQuestion still asks in build/plan/auto/yolo and
hard disallowed-tool denial remains effective. Actual protocol mapping/reply
normalization and UI pure projection preserve labels, previews, question IDs and
answer keys. Emitted mode selects core/bootstrap dist modules; UI pure projection
is source-only. The new tests do not connect a real question port.

Both final CLI and TUI bundles contain `answerDecision`,
`executeAnsweredQuestion`, `narrationOf` and `renderAnsweredQuestion`. Direct
emitted registry/executor/protocol tests supplement that bundle inspection.

Validation uses pinned Node 24.14.0 and pnpm 10.33.2. No production correction
follows `7d3066f`; the complete offline run tests that committed source.

| Check                                                                           | Result                                                                      |
| ------------------------------------------------------------------------------- | --------------------------------------------------------------------------- |
| Final source frozen contracts/actual synthetic consumers                        | **19/19 passed**                                                            |
| Final emitted frozen contracts/actual synthetic consumers after fresh CLI build | **19/19 passed**                                                            |
| Finite comparison, source and emitted                                           | **4096 admission + 6247 narration cases per mode**, all matched             |
| `pnpm build:cli-packages`                                                       | **17/17 tasks passed**, 10 cached; fresh core/bootstrap/CLI/TUI consumers   |
| Root and CLI typechecks                                                         | Passed; 5422 matching i18n keys and all 16 selected CLI workspace projects  |
| Root/CLI configured lint                                                        | Passed with no warnings/errors                                              |
| Core-cwd `oxlint --no-ignore` on all seven owned TS/MTS production/test files   | Passed with no output                                                       |
| Changed and full architecture checks                                            | Passed, zero violations/baseline/new                                        |
| Broader core lint                                                               | Failed: 24 errors/11 warnings in 27 unchanged, out-of-scope baseline files  |
| Final `pnpm test:studio`                                                        | **6054 passed / 8 skipped / 0 failed**, 6062 tests across 503 offline files |

CLI builds retain existing debug chunk-size and unchanged REPL dynamic-import
warnings. Windows CUA driver staging is skipped on Linux.

The full regression ran after the final production commit, with its unchanged
120000ms per-test timeout and concurrency of two; all 19 new named tests executed
and passed in that run. Seven skips require Windows/PowerShell; the eighth is the
optional old/new Claude leaf-observation comparison. No skip condition or test
timeout was changed. Root formatting and diff checks were rechecked after this
evidence update. Full/changed architecture checks passed on the final checkpoint.

### Finite comparison and digests

The tracked manual driver takes the exact-checkpoint inherited module outside
the repository. Generate the temporary reference with `git show 8030620:<handler
path>` and TypeScript `transpileModule` using ESNext module/target, retaining its
applicable source material. The temporary directory's `node_modules` resolves
to the core package's dependencies; no inherited runtime fallback is installed. Run
`node --import tsx apps/cli/packages/core/test/ask-user-question-differential.mts
<temporary-reference.mjs>` and repeat with
`KNORVIA_ASK_QUESTION_TEST_EMITTED=1` after building CLI packages.

Seed `0x41534b51` (1095977809) compares **4096 admission cases and 6247 narration
cases in each mode**. It covers defaults, multiSelect, reversed/partial/unknown
answer keys, blanks, quotes/newlines/Unicode, annotations, malformed shapes and
raw inherited-key membership. Full JSON order/errors/text match without input
mutation. Both output sequences have SHA-256
`d70e6c5f9ac014a68dce1e9051416e50675dddfb6547785c25a6b0be7dae71ce`.

- Temporary reference module: `8fdeaa291602e487aa2a03231a050f06f6877af7dff537b96d199e3c6cd082da`
- Frozen fixture: `60df0e3b528fc7f247d96e0dc44a6ee6bc3b8bc790df482707f5bb767c5af862`

| Production file                | Lines | SHA-256                                                            |
| ------------------------------ | ----- | ------------------------------------------------------------------ |
| ask-user-question.ts           | 99    | `b4c9f1988d183fa7161e7253af80ec87871266c7cbf6274e9570e5a537bdf48c` |
| ask-user-question-result.ts    | 50    | `ee633585e392e9429ee7a5fd87ee0ae648005eca1b55669a7da0385d8aeafa2c` |
| ask-user-question-narration.ts | 44    | `9537d2eeca7ba4e2266fe0ba3f377dd49fa8587d81142ce7dd203e5edb687d2b` |

### Execution caveats and remaining acceptance

The first new baseline wait assertion used `perf` instead of the executor's
existing `performance` field (17/18 passed). Correcting that test wiring retained
the simulated wait and fixed-budget assertions; no existing test was relaxed.
A temporary-reference generation attempt was blocked by child-process EPERM;
the dependent driver consequently failed to load its absent reference. A checked
shell `git show` plus read/transpile construction succeeded before comparison.

The initial restricted isolated Node runner reported passing files without
executing named tests, confirmed with a minimal probe. Those results are
discarded. Standard isolated source/emitted/full runs with approved additional
execution/network capabilities register named tests. No repository sandbox,
security, runner or timeout configuration is changed.

Linux synthetic evidence leaves actual user interaction, full live protocol
readiness, native Windows/macOS/CUA, desktop/Web visuals, packaged distribution
and real-user/provider/data acceptance unverified. The existing full broker
regression supplies separate offline readiness coverage. Broader core lint still
has 24 errors/11 warnings in 27 files verified byte-identical to the original
assigned `0d80f9c` base. Retained-material reviews and all 27 material obligations
remain with root. No deployment, release, merge or integration/main push occurs.

Only the existing `parallel/cli-tools-fast-20261001` branch is pushed. The lane
ends at a clean checkpoint and awaits root's next assignment in this same thread.

## OffPeak continuation

This bounded assignment starts at immutable AskUserQuestion checkpoint
`7b37339`. All prior Skill/ListModels/model-reference/AskUserQuestion production,
tests and specs remain byte-identical to that checkpoint. Initial freshness
passed with the named lane synchronized upstream, ahead 79 / behind 0 relative
to origin/main. Initial changed architecture/context checks passed; CLI remains
unmanaged/unassigned with no discovered direct dependency requirements.

### Original commits and owned paths

1. `b0f193b` — write the OffPeak spec and freeze inherited source/emitted
   admission, output/error and supported-consumer contracts before production
   edits; both modes passed 23/23.
2. `f837f41` — replace call planning/effect interpretation and creation-result
   decisions; add the exact-checkpoint finite comparison driver.

Only `off-peak.ts`, `off-peak-execution.ts` and `off-peak-result.ts` are owned
production files. Supporting ownership covers the five narrowly named OffPeak
TS/MTS tests/support files, the JSON fixture, `specs/knorvia-off-peak-execution.md`
and this lane handoff. Cron, Todo, TaskOutput/TaskStop, other lanes, shared
provenance, public contracts, packages/lock/CI/security and user data are unchanged.

### Lineage, retained material and replacement

The handler audit is upstream-modified/null review, fixed upstream blob
`14c52162582cd9a67855b290e5213fbdacceac98`; inherited source SHA-256 is
`dd5f7ca9437ef534f83a4f09bfd4d3996730525306d2ed7a0466539b34389ae3`.
Its history contains `7619e41` (publish latest preview). Unchanged schema/port
contracts remain upstream-modified/null and upstream-unchanged/null respectively,
blobs `d5f96e8f60e383fcac213685cf7c0131256d509b` and
`c86b5160fa27c219d02a5115fe05ae0d41c2b7e9`. The implementer inspected those bodies
and actual consumers: this is exposed-source work. Descriptions, model
instructions, error/output prose, public schemas/declarations, the exported guard
body and the raw success-projection access sequence remain retained material.
No clean-room, whole-file originality, MIT or whole-product independence claim
is made. LICENSE/NOTICE, preview identity and all 27 unresolved material
obligations remain unchanged. Root owns provenance regeneration and integration.
The three public declaration statements (`assertNotOffPeakTurn` and both entry
objects) were also compared through TypeScript source ranges and are byte-identical
to the exact checkpoint, including the retained guard body and all entry prose.

The two old imperative handlers now admit a discriminated create/list call, then
plan either one selected effect or an unavailable-port refusal. A single
interpreter owns the existing port call, terminal result and CoreError effects.
Creation outcomes become explicit created/refused decisions; category lookup
and ordered validation-code policy replace the nested refusal switch. The
unchanged public idle-turn guard is injected without a circular import. The
host remains the sole task/ticket/eligibility/quota/persistence owner, and the
protocol port remains the binding/transport owner. There is no duplicate queue,
state cache, retry, timer, runtime fallback or product gate/permission change.

### Frozen behavior and supported consumers

The fixture contains **31 admission cases, 42 category/code/stage combinations,
13 malformed/raw outcome cases and 8 executor output/event-order snapshots**.
The raw outcomes are indexed against the fixture's source values so NaN and
undefined are tested directly, without JSON turning those inputs into null.
All 23 named tests passed against inherited source and emitted modules before
replacement, and against final source/emitted modules afterward.

Create retains idle-turn denial before schema/port/session reads and never
checks automationTurn; ordinary automation turns remain allowed. List ignores
both turn flags and preserves its distinct read-only declaration. Both retain
strict schema ordering before missing-port errors, method receivers, separate
port-check/invocation reads, one call, exact argument counts and session binding.
Success retains task/array identity, order/duplicates, field order and exact
messages. Failures retain classification/code/stage, full CoreError context and
recoverable/retryable flags, including quota and eligibility distinctions.
Raw malformed outcomes/accessor errors are preserved without adding validation.

Real registry/executor/permission consumers run with synthetic ports and
responses. Tests retain opt-in registration, actual flattened permission
capabilities and build/plan/auto/yolo/hard/project policy behavior, hook/user
refusal, handler-owned idle denial, request/session/trace facts, events,
model-facing output, cancellation and no retries. Direct handler denial precedes
its schema; the existing executor's earlier admission still precedes handler
execution. Existing executor error presentation projects type/message/code;
category/stage/code and recovery flags are verified on the actual handler error.
No existing error projection is expanded or silently treated as preserving
fields it does not carry.

The actual SendMessage consumer retains its schema-first guard use and
recoverable foreground-Agent hint, with no send port connected. Core/service
turn-policy consumers preserve explicit idle-task IDs, resume-prefix and denylist
signals separately from ordinary automation restrictions. The existing protocol
port is exercised with a synthetic requestClient: active idle-run denial,
pending same-session refusal, terminal-status allowance, lookup failure closed,
own/explicit/fallback session precedence, omitted runtime defaults and preserved
discriminated responses. Its list projection preserves order and duplicates.
The workspace policy update mutates only an in-memory synthetic preference.
The actual UI pure reader consumes object/JSON task snapshots; it is source-only.
No automation/idle-time task, billing/account connection, prompt or external
service is created or contacted by these tests.

Fresh core/CLI/TUI artifacts contain `handlerFor`, `createOffPeakCreateHandler`,
`decideOffPeakCreation` and `VALIDATION_MESSAGES`. Direct emitted tests select
core/bootstrap dist modules, including registry, executor, permission resolver,
SendMessage and protocol consumers; service/UI pure projections stay source-only.

### Final validation and finite comparison

Validation uses pinned Node 24.14.0 and pnpm 10.33.2. The full offline regression
is run on the final committed `f837f41` production source; no production
correction follows that commit.

| Check                                                     | Result                                                                  |
| --------------------------------------------------------- | ----------------------------------------------------------------------- |
| Final source/emitted frozen and actual consumer contracts | **23/23 in each mode**, zero skips/failures                             |
| Exact-checkpoint finite comparison                        | **8192 handler comparisons in each mode**, all matched                  |
| `pnpm build:cli-packages`                                 | **17/17 tasks passed**, 10 cached; fresh core/bootstrap/CLI/TUI outputs |
| Root/CLI types                                            | Passed; 5422 matching i18n keys, all 16 selected CLI projects           |
| Configured root/CLI lint                                  | Passed, zero warnings/errors                                            |
| Core-cwd explicit owned-file lint                         | Passed on all eight owned TS/MTS production/support files               |
| Changed/full architecture checks                          | Passed, zero violations/baseline/new                                    |
| Broader core lint                                         | Failed: 24 errors/11 warnings in 27 unchanged baseline files            |

The final full offline regression passed **6077 tests, with 8 skipped and zero
failures**: 6085 tests across 506 files. It ran after `f837f41` with the unchanged
120000ms per-test timeout and concurrency of two. All 23 new named OffPeak tests
executed and passed. Seven skips require Windows/PowerShell; the eighth is the
optional old/new Claude leaf-observation comparison. No timeout or skip condition
changed. Formatting, diff and both architecture checks are rechecked after this
evidence update; the final production source remains the source tested by that run.

The manual driver compares 4096 Create and 4096 List invocations per mode against
the exact `7b37339` inherited module outside Git, using fictional records and
synthetic ports. Seed `0x4f46504b` (1330008139) covers strict/malformed inputs,
flags, missing ports, session IDs, throws, defaults, all failure categories and
special codes, prototype-like unknown categories, queue-position types, raw
outcomes and list ordering. Full output/error/call JSON matches without input
mutation. Both output sequences have SHA-256
`aed9b761d28843ed3991ed369440085c96268fcc7ffb957e4456fa6cbdb695f5`.

Reproduce the temporary module with `git show 7b37339:<handler-path>` and TypeScript
`transpileModule` using ESNext module/target, retaining applicable source
material. Resolve its temporary `node_modules` to core package dependencies.
Run `node --import tsx apps/cli/packages/core/test/off-peak-differential.mts
<reference.mjs>`; repeat with `KNORVIA_OFF_PEAK_TEST_EMITTED=1` after the CLI build.
The test selector has no production effect. No inherited fallback is shipped.

- Temporary reference: `096c3f253cc2d96b820707fca9f1330a8417230bf89f919d49378c0a02ced8f5`
- Frozen fixture: `bde91975ab7867794f902d9b9ddce32645778de5075c47e37ea4e0f1b8c1280d`

| Production file       | Lines | SHA-256                                                            |
| --------------------- | ----- | ------------------------------------------------------------------ |
| off-peak.ts           | 187   | `d3cb1918be8f37028c2f74f2cf154884689c8f7ace5759e167f11094eae9481c` |
| off-peak-execution.ts | 82    | `0416949a03109a94be07df648096e3325169fd8ac7bdc1a7a2288c1c939d4018` |
| off-peak-result.ts    | 64    | `b39819d67c3be60f45b2f2ab8d6c6dd57d639cd158e63b381b053336926782e8` |

### First failures, executor availability and remaining gaps

The spec records the initial inherited run's four new fixture failures (19/23):
wrong nested permission capability, an assumption that executor presentation
carried handler context/recovery flags, missing Proxy Promise-assimilation read,
and missing workspaceKey. Correcting those fixture facts preserved all product
guards; a misplaced accessor assertion then produced 21/23 in both modes before
its correction. No inherited test was weakened. A root-cwd explicit lint attempt
matched no files; the core-cwd owned check passed. An initial unused type-import
warning was removed before the baseline commit. The manual driver's
generic-arrow spelling was rejected by .mts formatting, then corrected to a
function declaration; source/emitted comparison and final formatting passed.

The execution transport disconnected during baseline startup. A fresh read in
the same executor confirmed all uncommitted files intact and subsequent shell,
lint and named test execution succeeded. Root's availability inquiry received
that concrete read/test evidence. No checkout reset, alternate environment,
credential/proxy/network/security configuration change or timeout change was
used. The existing approved capabilities permit standard isolated child tests;
repository sandbox/security/runner configuration remains unchanged.

Configured builds retain existing debug chunk-size/REPL dynamic-import warnings;
Windows CUA driver staging is skipped on Linux. Broader core lint's 27 files were
verified byte-identical to assigned base `0d80f9c`. Full runtime/server startup,
live host ticket/quota/eligibility/account/persistence, actual task scheduling,
native Windows/macOS/CUA, desktop/Web visuals and packaged acceptance remain
unverified. Full-suite synthetic coverage does not establish those acceptances.
All retained-material reviews and 27 unresolved material obligations remain
with root. No deployment, release, merge or integration/main push occurs.

The named lane alone is pushed. End at a clean checkpoint and await root's next
assignment in this same conversation.

## Cron continuation from immutable bf0cc48

### Scope, lineage and retained material

Root assigned Cron only after receiving OffPeak `bf0cc48`. This continuation stays
on `parallel/cli-tools-fast-20261001`; no new task conversation or agent exists.
Freshness began synchronized with its remote, ahead 82/behind 0 `origin/main`.
Changed architecture and CLI context passed before edits. The prior Skill,
ListModels/model-reference, AskUserQuestion and OffPeak checkpoints remain
immutable. No integration/main branch, shared provenance, other lane, package,
lockfile, CI, security or user-data file is changed.

`cron.ts` follows only snapshot commit `7619e41` in the available lineage. The
current audit still classifies it upstream-modified and unreviewed. Its inherited
SHA-256 is `e75564081cb218b7b0df1a2d5451aaa505be76c37cff4332664da64c04bdbfa2`,
upstream blob `2ccaa68c7f50ad0dfebd694b07d6131b1378dbe4`, normalized upstream
SHA-256 `e956d93c6ae176e204e6cc4865fd391c49cfe6ebf108d42177767736f640cf11`.
The contracts automation declaration is also upstream-modified/unreviewed; its
port declaration is upstream-unchanged/unreviewed. The actual bootstrap protocol
adapter is unreviewed with no recorded upstream correspondence. None was
silently classified as reviewed or independently licensed here.

Source exposure is explicit. This replaces the bounded private admission/effect
and model projection implementation; the inherited guard bodies, public schema
identities, declarations, permissions, prose/comments and licences remain.
No clean-room, whole-file independence or MIT relicensing claim is made.
LICENSE/NOTICE, preview identity and all 27 material obligations remain unchanged.
Root alone updates shared provenance and reviews retained source material.

### Checkpoints and owned paths

- `7d5a80e`: spec first; frozen inherited source/emitted contracts and actual
  executor/protocol/policy consumer tests, before any production edit.
- `1d519f8`: new operation admission compiler, typed deferred effect, single
  await/completion path, ordered whitelist projection and manual differential
  driver. This is the final corrected production checkpoint for full regression.
- Evidence/fixture formatting checkpoint: the following documentation commit.

Owned paths:

- `apps/cli/packages/core/src/tool/handlers/cron.ts`
- `apps/cli/packages/core/src/tool/handlers/cron-execution.ts`
- `apps/cli/packages/core/test/cron-contract.test.ts`
- `apps/cli/packages/core/test/cron-consumers.test.ts`
- `apps/cli/packages/core/test/cron-protocol.test.ts`
- `apps/cli/packages/core/test/cron-fixture.ts`
- `apps/cli/packages/core/test/cron-protocol-fixture.ts`
- `apps/cli/packages/core/test/cron-contract.json`
- `apps/cli/packages/core/test/cron-differential.mts`
- `specs/knorvia-cron-execution.md`
- This handoff document.

The handler has 312 lines and helper 136; every owned TS/MTS file stays below the
400-line limit. Helpers import contracts/types and never import `cron.ts`.
The existing host/port remains the single task-state owner; the executor owns
permission/trace/cancellation. There is no redundant task state, retry, queue,
cache, circular dependency, new scheduling path or alternate fallback.

### Preserved boundaries and consumer evidence

Mutation handlers reject automation turns before direct schema/port access.
CronList parses first and remains allowed in both automation and off-peak turns.
All four ignore offPeakTurn. The actual executor independently validates schema
before entering the handler, preserving its different guard ordering. Cron and
OffPeak guards remain distinct. Frozen cases cover all flag/missing-port/malformed
combinations, strict trim/optional/null/refinement behavior, session/model inputs,
full direct error metadata, output/projection order and opt-in registry identity.

One port method executes with its original receiver and argument count. Create
retains the own sessionId property even when undefined and only runtime model
identity; update/delete read no model/session, list has no arguments. Getter
ordering and model's three reads are frozen. Output preserves ordered optional
own keys, scheduleRule, list duplicates and the exact confirmations/not-found
text; runtime model/mode/host-only fields remain excluded. Direct throws keep
identity. Actual executor tests cover hook/policy/approval refusal and synthetic
approval, malformed output rejection, events/model content/trace, every operation's
pre/pending cancellation and unchanged 30000ms timeout with override disabled.
A mocked clock exercises the real executor; no timeout budget is changed.

Actual source/emitted bootstrap protocol tests use only synthetic requestClient,
sessions/runtime selections and title setters. Their 24 scenarios cover active
scheduled-run refusal, binding lookup, fail-closed unknown ownership, exclusive
-32601 legacy-list fallback, legacy binding and transport/schema errors, runtime
model/mode precedence, session binding/title freeze, calendar/null delay/relative/
finite/carrier parameters, update carrier clearing and delete/list behavior.
Create-limit errors retain their domain mapping and only CronCreate stops current
turn/replaces recovery text. Real core/service policy readers preserve distinct
Cron and OffPeak denylist sets. No actual host, tasks, accounts, notifications,
permission prompt or external service is used by the new tests.

TypeScript statement-text comparisons against the exact bf0cc48 source prove
both guard bodies, cronPermission, cronResultBudget, cronTimeout and all four
exported entries byte-identical. Other prior handlers/tests/specs and all out-of-
scope tracked paths are checked unchanged at the final checkpoint.

### Validation and reproducibility

Pinned Node 24.14.0 / pnpm 10.33.2 from
`/tmp/knorvia-lane-toolchain/node_modules/.bin` were used in the same executor.
No credential, network/proxy/security configuration, runner or timeout change
occurred. Standard approved execution capabilities allowed named isolated tests.

| Check                                        | Result                                                       |
| -------------------------------------------- | ------------------------------------------------------------ |
| Before replacement: named source contracts   | 19/19 pass                                                   |
| Before replacement: actual emitted contracts | 19/19 pass; generated observations byte-identical            |
| Final named source contracts                 | 19/19 pass                                                   |
| Final actual emitted contracts               | 19/19 pass                                                   |
| Seeded inherited comparison                  | 16384 calls per mode, all equal                              |
| Final CLI build                              | 17/17 tasks pass                                             |
| Core, CLI and root types                     | pass; 5422 matching translation keys                         |
| Root configured lint                         | 0 errors/warnings, 2839 files                                |
| CLI configured lint                          | 0 errors/warnings, 97 files                                  |
| Strict owned lint                            | all eight TS/MTS files, 0 errors/warnings                    |
| Root/owned formatting                        | pass after observation-preserving JSON whitespace formatting |
| Changed and full architecture                | pass, 0 violations                                           |
| Broader core lint                            | unchanged 24 errors/11 warnings in 27 out-of-scope files     |
| Full final offline regression                | 6096 pass / 8 skipped / 0 fail; 6104 tests, 509 files, 346s  |

Run the three `cron-*.test.ts` files with
`node --experimental-test-module-mocks --import tsx --test` from the repo root;
repeat with `KNORVIA_CRON_TEST_EMITTED=1` after `pnpm build:cli-packages`.
The selector affects test imports only. Baseline captures include 520 direct,
16 executor and 24 protocol observations. Frozen observations were generated
before production replacement and never rebaselined afterward.

Create the temporary inherited module outside Git with
`git show bf0cc48:apps/cli/packages/core/src/tool/handlers/cron.ts`, then
TypeScript transpileModule using ESNext target/module, resolving its temporary
node_modules to core dependencies. Run
`node --import tsx apps/cli/packages/core/test/cron-differential.mts <reference.mjs>`
in both modes. Seed `0x43524f4e` (1129467726) compares 4096 calls per operation
with malformed inputs/responses, optional/missing contexts, flags, port failures,
projection fields/list order and delete truthiness. Both sequences SHA-256:
`f6d1c12b5cdf97ebdc24a7bd058a8cc917bdee3ffe4126243fae46dca672f291`.
The temporary reference's hash matches actual inherited dist exactly:
`114b6df4ee71016874b35be4db82507e2700ee86b9fb45f665cb41a5bb809c48`.
No old fallback ships.

| Artifact                        | SHA-256                                                            |
| ------------------------------- | ------------------------------------------------------------------ |
| cron.ts                         | `0ee5b80b04cf89f820bf48c50c35e569407836891137f43dae3e8239b82c2bb6` |
| cron-execution.ts               | `4cfdea8c41acc3dab3843f75a4fabbb4ec9d53660371704eb518b2b13ea9f49d` |
| final emitted cron.js           | `b08b6994f249093a89b9aaca881396e35976ef9ffc321440c5434128f283d7ac` |
| final emitted cron-execution.js | `e89dec8dbd10ce635c9201f6507186215c5c25f77da1aa1478b3560af91a0e71` |
| unchanged protocol adapter dist | `a0749b0d1a33bead5ff82f01385a1118b0990bbf379ce696543b6ce4489416ca` |
| formatted frozen contract       | `0680fd33e641f28fa597c78303483335e0ee254db7d66835fe4872318ea62a56` |

### First failures and remaining scope

The first inherited test run was 17/18: a new test incorrectly assumed one Cron
mutation denylist item marks an automation turn. The actual reader requires all
three; the fixture now covers the partial set as false and full set as true.
The protocol fixture exceeded 400 lines after formatting and was split before
baseline commit. Strict lint caught duplicated imports introduced during that
split, then passed after correcting only new test wiring. The first replacement
core typecheck rejected the Object.fromEntries projection assertion; corrected
its internal typing, preserving identical runtime behavior. Configured format
caught only frozen JSON whitespace. Parsed JSON deep equality against the
committed baseline passed after formatting. No inherited test was weakened.

Broader core lint's 27 files are byte-identical to original assigned 0d80f9c.
Existing build warnings include debug chunk size and REPL dynamic imports; Linux
skips Windows CUA driver staging. Native Windows/macOS, packaged/TUI/desktop/Web
visual acceptance, live host persistence/clock/timezone/account and actual
scheduling/notifications remain unverified. Synthetic protocol parameters prove
preservation at that boundary and do not establish live native acceptance.
All retained material and 27 licensing obligations still require root review.
No deployment, release, merge or integration/main push occurs.

The final full regression completed successfully on corrected production commit
`1d519f8`: 6104 tests in 509 offline files, 6096 pass, 8 skipped, 0 failed,
345688.8ms. The runner retained per-test timeout 120000ms and concurrency 2.
Seven skips are Windows/PowerShell-only: CUA archive staging, five real delivery
script fixtures and Windows snapshot path aliases. The eighth is the optional
old/new Claude leaf comparison. No new Cron test was skipped. Source/emitted
contracts were rerun after JSON formatting and still passed 19/19 each. Full
production paths were checked byte-identical to 1d519f8 after regression;
subsequent changes contain only evidence prose and fixture whitespace. The
ownership check found exactly the eleven owned paths and no out-of-scope edits.
`verify:pre-push` also passed. Baseline, production and original checkpoints stay
in ancestry without amendments or resets.

Only the named lane branch is pushed. Finish at a clean branch checkpoint and
await root's next assignment here.
