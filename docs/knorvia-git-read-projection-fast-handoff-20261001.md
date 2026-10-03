# Git read projection — fixed services lane checkpoint

The existing lane branch `parallel/file-watcher-fast-20261001` now has one ordered,
stateless status/branch projector. It replaces the nested status decision structure;
no second selection owner remains for commit-message consumers. No policy change,
Git command, mutation, dependency, shared inventory, CI or production deployment
change is included. Root alone integrates this branch.

## Original commits and separate contribution checkpoint

- Retry-order appendix: `fdbce31586016445bb02f3d7a697cd0a3a103811`.
- Current contribution candidate/checker:
  `9ef73347bd15d999cb02d2b5358556f2ea4c5478`.
- Git spec and legacy contract freeze:
  `46613b7968f291a3597180459ccfce6da513624a`.
- Git production implementation:
  `c1e1cc210baf5b5025b04f1bc56bbe9d71fccb88`.

The contribution checkpoint was completed and pushed before this Git assignment's
files were added. Historical `91d15b8`/`07709cd` evidence remains immutable; current
base scope is `fd71001`/`cf6965c` plus a separately dated retry-order appendix.
It retains the 20-case initial monitor red proof and deliberate legacy cleanup
assertion correction. Retry-order clarification preserves production behavior:
initial acquisition order applies before failed handles are requeued; retries use
retained/requeued order, including exit-before-data and errors `[exit, data]`.
New appendix acceptance was **2 source / 2 strict emitted individual cases** in
one file. Provenance tooling was **170 individual cases / 12 files**. Types, lint,
format and architecture passed for those evidence-only changes; expensive product
suites/builds were not repeated just for that checkpoint. They were subsequently
run for the separate Git production change described here.

## Owned scope and protected consumers

Production scope is only:

- `packages/services/src/git/gitService.ts`
- `packages/services/src/git/gitServiceReadProjection.ts`

Supporting scope is `packages/services/test/git-read-projection-*`, the matching
spec, and this handoff/digest evidence. One frozen sparse-array fixture was changed
from a literal hole to `delete entries[1]` to clear lint, retaining the same hole
and all assertions. The freeze commit is immutable.

The repo remains the snapshot/IO owner. The projector owns ordered selection and
record derivation; it stores no accepted state. Existing service request scheduling,
summary/identity references, optional refresh reads and errors remain unchanged.
The branch projection call is shared by direct comparison and refresh. Existing
generation uses the same imported source projector with byte-identical body,
session filtering, first-eight cap and allSettled handling.

Actual paths traced: node factory and service registration; server and desktop
remote collections; Git pane hook, action menu, workspace-tree refresh and branch
assist source reads. Acceptance uses the real Git descriptor, ChannelServer,
ChannelClient, ProxyChannel, binary transport and exported tree/assist consumers.
Repo, status, branch, identity, diff and generator ports are owned synthetic values.
Default repo construction and any unapproved mutation/process/fs port fail tests.
No native terminal, real Git repository, user profile, credential or account data
was used. No stage/discard/reset/commit/push operation was used as test data.

Read-only AST/byte audit found **17 exact protected bodies** (16 service methods
plus `getCommitMessageDiffQueries`). Only `getBranchComparison` and `refresh` bodies
change, solely at their list-projection expressions. **10 protected files** are
byte-identical: public service/shared declarations, config, CLI repo/types/helpers,
command/environment providers, generation and filtering. Exact hashes are in
[the evidence JSON](./knorvia-git-read-projection-fast-evidence-20261001.json).

## Lineage and source exposure

At the pre-edit head `9ef7334`, service bytes were the imported local baseline:
commit `7619e41b950bd52073ebf36754146cf25659d9fa`, also at integrated
`0d80f9ca37b1daef162ecc69bd18f6e8fc30a146`, blob
`373f6569025ff41b7224dcb47b71252dad7c9c84`, SHA-256
`13d01d313a65d8ee3676c6cbbc9cb8e4ccbee9f27e3d2d558321e3c9849a5927`.
No earlier independent replacement or focused service test was found.

Pinned [ZCode publisher](https://github.com/zai-org/ZCode) commit
`872ad960de7ec172591f7e1952f7849229f94521`, tree
`d185a9a893c00d51fc3fe51fe7371b9eea7de143`, service blob
`df3426c8a398f797730c90dcfbd85cce3c7a0259`, SHA-256
`08f0e94e23cd3ea75ff9983f82ab140fc3a2d6280b11fe4eb0a0aba724b3e617`
were verified from the existing separate temporary bare repo. No production
ancestry change or new upstream fetch was needed. Publisher and local bytes differ.
Both implementations were exposed; no clean-room assertion applies.

The contribution candidate is the `StatusDecision` relationship between match,
section, stat source and visibility, the ordered rule rows, and the first-match
interpreter's acquire/suppress/render path. Visibility cannot fall through to a
later rule; conflict has literal stats and does not acquire a map. A single ordered
traversal supports existing consumers. These structures require independent root
review, and passing tests do not establish originality.

Precise retained compatibility content includes:

- Current-path/rename-path scope OR and short-circuit order; existing config path
  normalization and workspace-relative handling. Status uses summary scope; branch
  uses resolution scope. Path resolution combines the old helper expression with
  the unchanged host `resolve` behavior.
- Staged untracked/conflicted/falsy-dot-x rejection; conflict/untracked/y precedence;
  zero-line slash-directory and positive-line visibility; exact stat map keys and
  nullish `{ added: 0, removed: 0 }` defaults. The y predicate is expressed as the
  equivalent boolean admission condition, not claimed as an original rule.
- Status and branch record property names, insertion order, raw kind/stats, nullish
  own x/y keys, absent branch x/y, section literals and booleans. Most record syntax
  is retained. Branch shape/conversion remains largely retained, centralized under
  the same owner rather than claimed as a separate original algorithm.
- Sparse-array map/filter traversal and truth filtering; unchanged public factory,
  method declarations, mutation and generation bodies, errors and formatting.
- Synthetic expected shapes/status values are compatibility content. Fixture paths,
  refs, identity/error/stat literals are owned synthetic data. RPC scaffolding
  reuses this source-exposed lane's existing in-memory protocol pattern.

Whole-file status remains conservative: `gitService.ts` is upstream-modified and
unreviewed; the helper is an unreviewed addition containing retained expressions.
Neither is a whole-file MIT grant. Smallest useful review/separation is the rule
relationship/interpreter spans versus retained protocol-record/path construction;
merely moving those spans would not create originality. Remaining commands,
parsers, mutation, environment policy and generation implementation are outside
this replacement. No claim of project-wide or whole-service completion is made.
LICENSE, NOTICE, shared provenance/inventory and all **27 material obligations**
remain unchanged. Root regenerates shared records after integration.

## Validation on final production bytes

Node **24.14.0**, pnpm **10.33.2**, TypeScript **6.0.2**. Cached-origin freshness
passed with `--no-fetch` (no live remote freshness claim). Services architecture
context is legacy/unmanaged, unassigned, with no contract discovered.

Legacy freeze: **126 source + 126 strict emitted individual cases / 2 files each**.
Initial source run was 125 pass/1 failed expectation: actual branch assist retains
both the absolute projected stage path and relative issue path. Corrected before
production replacement; no product behavior changed.

Final focused: **494 source + 494 strict emitted individual cases / 16 files each**,
zero failures/skips/cancellations. Git contracts: 108 cases; Git consumers: 18;
prior terminal lifecycle/planning/profile regressions: 368 cases. The strict loader
maps services/shared/RPC/UI emitted paths and rejects emitted source fallback.

```sh
TSX_TSCONFIG_PATH=packages/ui/tsconfig.json node --experimental-test-module-mocks --import tsx --test --test-concurrency=2 packages/services/test/git-read-projection-*.test.ts packages/services/test/terminal-lifecycle-*.test.ts packages/services/test/terminal-service-planning-*.test.ts packages/services/test/terminal-profile-*-fast-20261001.test.ts
KNORVIA_GIT_READ_PROJECTION_TARGET=dist KNORVIA_TERMINAL_LIFECYCLE_TARGET=dist KNORVIA_TERMINAL_PLAN_TARGET=dist KNORVIA_TERMINAL_PROFILE_TARGET=dist KNORVIA_TERMINAL_MACOS_TARGET=dist node --experimental-test-module-mocks --import tsx --import ./packages/services/test/git-read-projection-emitted-register-fast-20261001.mjs --import ./packages/services/test/terminal-profile-portable-emitted-register-fast-20261001.mjs --test --test-concurrency=2 packages/services/test/git-read-projection-*.test.ts packages/services/test/terminal-lifecycle-*.test.ts packages/services/test/terminal-service-planning-*.test.ts packages/services/test/terminal-profile-*-fast-20261001.test.ts
```

Root `pnpm typecheck` passed with 5,422 matching locale keys; `pnpm lint` passed with
zero warnings/errors. `pnpm fmt:check`, changed/full architecture passed (zero
violations). `pnpm build:cli-packages`: 17 successful, 16 cached. Desktop
`build:no-runtime-assets`: main/host/preload/renderer passed with existing chunk-size
and plugin-timing warnings. Windows CUA staging was skipped on this Linux build.
The generated host contains all three decision-stat descriptors; this is static
build corroboration, not executed host/native acceptance.

Full final runner was exactly **`pnpm test:studio`**: **518 files**, **6,545
individual cases**, **6,537 pass**, **8 skip**, **0 fail/cancel**, 6 suites,
537,052.078009 ms. Concurrency 2, timeout 120,000 ms, isolation/budgets unchanged.
Skips: Windows bootstrap environment; five Windows/PowerShell delivery cases;
deterministic old/new Claude leaf/public-declaration observation; Windows case/slash
cache aliases. None is a new Git case.

Production source hashes:

- Service: `ccc15ab67ef51e32aa4b772d16ffa39092dc39498083d975ec117ff24466d8ce`
- Projector: `f692965141f59e0a77fd7cb181ba8b9f001ce17a105e7aa4767013434a6a3930`
- Emitted service: `eda520fed813604d90d50067222e846db374ec620da086478b4ba1f53a658e0e`
- Emitted projector: `318bb163d7aa31fb58d359d3262c0d535a23b253fe8782ef1e034c3d5a206096`

Evidence JSON binds owned paths and protected bytes to freeze/production commits.
Generated artifacts are ignored build output and are not source commits. Temporary
runner/audit logs are under `/tmp/knorvia-git-read-projection-evidence`.

The prior current contribution checker also passed again:

```sh
node scripts/provenance/services-lane-current-fast-20261001.mjs --publisher-repo /tmp/knorvia-services-provenance-upstream-872ad960.git --require-publisher --verify-installed
```

It verifies historical 50/current 55/appendix 2 paths, 30 refs, zero unavailable
publisher spans, 19 protected paths/17 methods and 27 obligations. Installed
node-pty bytes are corroboration only; publisher/native acceptance remains false.
It has not been repurposed to claim coverage of these new Git files.

Operational limitations: a Node child read-only Git audit returned sandbox EPERM
and was rerun through approved read-only execution. An initial audit named a
nonexistent command-provider path; corrected to the actual `providers/` file.
An early discovery chain stopped before the pinned PATH assignment; host pnpm 11
attempted its automatic dependency check and failed ENOENT before store creation.
Tracked files, dependencies and locks were unchanged; the pinned pnpm 10 toolchain
was restored before validation.
No source, test, sandbox policy or budget was weakened. Pinned toolchain commands
were used for all reported final gates. No environment was recreated.

## Native gaps and checkpoint

Linux synthetic service/RPC/UI acceptance is not native Git, Windows/macOS, GUI,
Git pane mounting, remote Host or credential/permission acceptance. Those were
outside scope and not attempted. Parent-reported Linux source-built PTY evidence
belongs to root's separate review and is not duplicated or claimed here.

End at a clean appended checkpoint on the existing branch. No further production
scope is taken until root assigns it in this same conversation.
