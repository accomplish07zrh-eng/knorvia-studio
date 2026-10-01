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
