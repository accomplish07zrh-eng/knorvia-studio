# Lane A: Skill execution checkpoint

2026-10-01. Branch: `parallel/cli-tools-fast-20261001`. Base:
`0d80f9ca37b1daef162ecc69bd18f6e8fc30a146`.

Skill's execution boundary is replaced and passes the frozen source and emitted
contracts. ListModels/model-reference remain untouched and await root's next
assignment in this same work lane. This checkpoint makes no whole-product
independence or license claim.

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

The lane reported `bd0bb014c0974334557fa51814709d0b78f35f1d` during its initial
fetch. Root verified that this commit is an ancestor of the exact assigned base,
not a newer head. Integration uses the verified `0d80f9c` ancestry; no rebase or
integration-branch write was performed by the lane.

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
