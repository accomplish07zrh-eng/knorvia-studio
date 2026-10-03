# Protocol wire helper acceptance

The bounded protocol/shared track replaces three pure helpers from draft PR 7
at `8e8f6310d5ca70a57a454054e44f7b61db30b83f`:
`packages/shared/src/protocol-v4/wire-binary.ts`, `wire-codec.ts`, and
`wire-reassembly.ts`. No further production ownership was selected after this
batch's checkpoint. The specification is
[knorvia-protocol-wire-helpers-20260930.md](../specs/knorvia-protocol-wire-helpers-20260930.md).

CRC now uses a 256-entry lookup table, Base64 uses bounded native Node/browser
operations, envelope measurement reuses an immutable fixed relay budget and
models RPC lengths directly, and batch reconstruction has separate staging,
byte reconstruction and payload validation phases. The public schemas, limits,
exports and emitted declarations are unchanged. The integer bisection/probe
order and serialized metadata retain the existing interoperability expression.
This is a compatibility-preserving replacement, not a license clearance claim.

## Frozen and reviewed checks

The fixture checkpoint `0639cf6` precedes implementation. It freezes 136 exact
old-source observations, including negative inputs and fault precedence, plus
nine checks for native binary oracles, reference/key order, repeatability,
real RPC serialization and the unchanged incremental assembler. Old source
and old emitted dist each passed 145/145 before implementation. No negative
fixture or expected observation was relaxed during implementation.

Review found that delivery metadata must be read after the caller's schema
transformation. The staged helper preserves this timing. An additional regression
passes on old emitted dist and final candidate source/dist. Final counts are:

| Target                                | Passed | Failed | Skipped |
| ------------------------------------- | -----: | -----: | ------: |
| Old source, pre-implementation freeze |    145 |      0 |       0 |
| Old emitted dist, reviewed cases      |    146 |      0 |       0 |
| Final source, reviewed cases          |    146 |      0 |       0 |
| Final emitted dist, reviewed cases    |    146 |      0 |       0 |

Checks cover exact fragments and measurement callbacks, all three delivery kinds,
Unicode/lone surrogates, JSON/native errors, fractional/nullish/nonfinite limits,
every encoding and batch fault, metadata mismatch, shuffled and duplicate chunks,
cumulative budgets, missing-index order, CRC, fatal UTF-8, JSON and payload schema.
Native Node CRC/Base64 provide independent binary oracles, including subarray
offsets and 12,288-byte block boundaries. Three emitted `.d.ts` files match the old
files byte-for-byte, including public comments and declaration order.

Nine synthetic old -> new -> old round trips preserve exact frames and payloads:
short, large multilingual and lone-surrogate/newline content, for each delivery
kind. Seven additional nonfinite/edge measurement callback comparisons agree.
A browser-target esbuild bundle passes four byte checks in a VM without Buffer
or process, including a 65,537-byte input and noncanonical padding bits. This is
a simulated browser environment, not a live browser or Electron GUI run.

The reproducible cross-version harness is
`packages/shared/test/protocol-wire-cross-version.mjs`. It accepts old/new emitted
module directories. The old directory must retain its ESM package context and
shared dependency resolution; it contains the old compiled helpers and their
unchanged shared dependencies, not a new installation payload.

The unchanged incremental assembler consumes public encoder output atomically,
releases staging, suppresses duplicates and reports owned corruption metadata.
Real RPC serialization matches NDJSON, socket and conservative mobile budgets.
The bootstrap/gateway dependency build passes 9/9 tasks; no gateway implementation
or transport semantics were changed. Desktop continuous and mobile replayable
owners, sequence, recovery, and raw relay budgets remain in their existing owners.

## Actual commands and quality results

Node `24.14.0` and pnpm `10.33.2` were selected through a temporary tool directory
on PATH. Commands below were run from the repository root:

```sh
pnpm exec tsc -b packages/shared
node --import tsx --test packages/shared/test/protocol-wire-contract.test.ts packages/shared/test/protocol-wire-consumers.test.ts
KNORVIA_WIRE_TEST_TARGET=dist node --import tsx --test packages/shared/test/protocol-wire-contract.test.ts packages/shared/test/protocol-wire-consumers.test.ts
pnpm exec turbo run build --cwd apps/cli --filter=@knorvia/bootstrap...
node --import tsx packages/shared/test/protocol-wire-cross-version.mjs /tmp/knorvia-protocol-baseline/shared-dist/protocol-v4 packages/shared/dist/protocol-v4
pnpm typecheck
pnpm lint
pnpm exec tsc --noEmit --module NodeNext --moduleResolution NodeNext --target es2024 --types node --skipLibCheck packages/shared/test/protocol-wire-contract-cases.ts packages/shared/test/protocol-wire-contract.test.ts packages/shared/test/protocol-wire-consumers.test.ts
pnpm exec oxlint --deny-warnings packages/shared/src/protocol-v4/wire-binary.ts packages/shared/src/protocol-v4/wire-codec.ts packages/shared/src/protocol-v4/wire-reassembly.ts packages/shared/test/protocol-wire-contract-cases.ts packages/shared/test/protocol-wire-contract.test.ts packages/shared/test/protocol-wire-consumers.test.ts
pnpm architecture:check --changed
pnpm verify:pre-push
git diff --check
```

Root typecheck, root lint, scoped test typecheck/lint, formatting, architecture
(zero new/baseline violations), shared emission, bootstrap build and pre-push
checks pass. No duplicate full application suite was run. The tests are permanent
members of the existing shared test directory and are discovered automatically by
`scripts/test-studio.mjs`; its registry was not edited.

Initial dependency installation failed at Electron's download (ECONNREFUSED);
the installed compiler/test dependencies suffice for these checks. The first
consumer harness import depended on another package's alias; switching to the
RPC public entry fixed it. A later external old-dist harness needed the original
ESM package context and the shared package's dependency links; the corrected
harness passes. These environment/harness failures are not hidden as product
passes. Native GUI, installer, Windows/macOS and live browser checks were not run.

## Provenance and integrator work

Old source was read to extract behavior. Existing schema/declaration, fixed field
projection, error strings, mathematical CRC polynomial and bisection expressions
remain compatibility constraints. No clean-room claim, production MIT grant or
accepted independent-replacement review is added. Root Apache-2.0, NOTICE,
third-party notices and the partial VS Code IPC attribution are retained.

`pnpm provenance:check` currently fails with:

```text
Third-party audit inconsistent (1):
Third-party input changed: packages/shared/src/protocol-v4/wire-codec.ts
```

This branch deliberately does not edit shared inventories or review registries.
[protocol-wire-20260930.json](../licensing/evidence/protocol-wire-20260930.json)
supplies exact before/after digests and proposed binding updates. The integrator
must reconcile `third-party/inventory.json`'s current input digest while preserving
historical source fingerprints, roots, attribution and material obligations, then
refresh `licensing/current-files.json` using the existing audit workflow. Tests
alone do not authorize a production MIT review. Notice/license bytes are unchanged.
Applying only the proposed digest binding in memory produces zero audit issues
and retains all 27 material obligations. The actual checked-in gate still fails;
the simulation is evidence for the integrator's proposed update.

No UI, userdata, schemas, stateful assembler, services, CLI source, lockfile,
global configuration, security settings or credentials were changed. Roll back
the implementation commit to restore the three helpers; the fixture checkpoint
may remain as a compatibility gate. Integration/cherry-pick belongs to the parent;
this track creates no PR and performs no merge, release or deployment.
