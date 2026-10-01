# Fixed Fast CLI lane: Read orchestration checkpoint

Branch `parallel/cli-tools-fast-20261001`; baseline
`db8968d7a386105b92f3ad2b3e231782ff261cd3`. All earlier production and evidence
commits remain immutable. The supported executor continued working in the same
checkout. A final receipt-update response lost transport; a harmless `pwd` and
status/receipt reads immediately confirmed recovery and preserved state. The update
had completed, so work continued from the inspected result. No environment recreation
or configuration change occurred.

## Commits and owned paths

- `dc41e9438948d84e6240f1b307ef36bedea58052`: spec and unchanged source/actual
  emitted freeze, synthetic ports and supported consumers, before production edits.
- `7125e4e5f9a436ed9fe5471092a9aaab53860e12`: one text completion owner and ordered
  range-request encoding. The spec's range-encoding clarification preceded that
  implementation. No public contract or policy change.
- The appended evidence commit contains this handoff, the digest receipt and its
  read-only checker; no further production or test changes.

Production ownership is exactly `read.ts` and new private
`read-text-orchestration.ts` in `apps/cli/packages/core/src/tool/handlers/`.
Other ownership is the seven `read-orchestration-*` test/capture/case/fixture/golden
files in `apps/cli/packages/core/test/`, `specs/knorvia-read-orchestration.md` and
these three named evidence files. The receipt enumerates all 13 allowed paths.
No lower reader, state owner, permission/path policy, public contracts, previous
handler, root/other-lane work, licensing inventory, dependency, lockfile, CI or
security file changed.

## Selected boundary and existing coverage

The inherited text stat/cache/read/update/completion block was still present.
Local path history consists of snapshot `7619e41` and `d0534df`; the latter replaces
missing-file suggestion and relocates exact presentation code, without claiming a
whole-handler independent rewrite. Existing bounded technical replacements already
cover text budgets, binary/image/video input/projection, PDF admission planning,
suggestions, snapshot lookup and persisted metadata codecs. Their source, tests,
specs and evidence are protected byte-for-byte. The PDF evidence explicitly retains
existing IO/projection boundaries, and `read-model-content.ts` remains an exact
retained relocation. Technical coverage does not establish licensing rights.

This slice replaces duplicated text-result completion with one operation owner.
The entrypoint retains schema parsing, missing-port ordering, path resolution,
media dispatch and outer error conversion. It gives the private owner a captured
frame plus existing state callbacks. That owner performs bound stat, exact-window
lookup, unchanged freshness selection, an ordered range argument codec for the
existing lower reader, existing snapshot update after successful projection and
one metadata completion for hit or miss. There is no await between update and
completion. The supplied map/runtime and existing per-context fallback WeakMap
retain sole state ownership; no additional cache, timestamp owner, persistence,
retry, permission or media processing layer was introduced.

The receipt verifies four exact retained regions in `read.ts`: description/fallback
owner, admission/path/media dispatch, all validation/state/error/metadata/public
functions from `parseReadInput` to EOF, and the outer filesystem error conversion.
The public `read.d.ts` bytes are also identical to the pre-rewrite emitted freeze.

## Supported consumers and important retained behavior

Tests use real built-in registration, registry/model contracts, executor call-runner,
PermissionService/capability, path policy, lower readers, snapshot lookup and metadata
codecs in source and actual emitted mode. Selected dist JS is read before import;
missing files fail without tsx source fallback. Public schema/entry/formatter/export
identity, Read-only/approval requirements, preflight/timeout behavior and model
content remain frozen.

Schema parsing precedes FileSystemPort admission, which precedes cwd/workspace/path
resolution. Existing path policy handles absolute/relative/outside-workspace paths;
no access policy is changed. Media keeps image, video, supported PDF, text order and
bypasses text history. Captured text port versus repeated media-context reads,
method receiver, stat-method-before-signal evaluation, trace getter order and
ignored `traceContext` remain observable and unchanged.

Stat finishes before state lookup. Offset defaults only when undefined, preserving
zero; limit remains part of the exact key. Freshness preserves partial truthiness,
floored mtime/size, nonempty revision IDs and defined size fallback. A cache hit
performs no range read or snapshot set. A miss keeps the existing lower reader's
line/byte/token limits, own undefined fields, ordered signal/window reads and
onRead revision observation. Snapshot update uses the existing revision priority,
partial flag and synthetic readAt ordering. Metadata reads original raw input and
advances completion time without replacing a hit's readAt. If metadata throws after
update, the committed map remains visible; no rollback was added.

Filesystem not_found suggestions remain best effort and retain the original cause;
too_large retains exact context and recoverability. Other native/non-Error failures,
throwing getters, rejected ports and lower-reader conversions preserve their old
boundaries. Valid pages on a non-PDF remain ignored when the resolved model schema
admits them; generic declaration validation can reject them earlier. Direct-handler
late success/state commit when a malformed port ignores cancellation remains
unchanged. The real executor emits one cancellation error/finish and prevents late
success. Concurrent shared-map calls keep completion-order last-completer behavior.
No timeout, approval, read-only or policy guard was weakened.

## Freeze, validation and reproducible digests

Unchanged source and actual emitted captures matched byte-for-byte before production
edits: 122 direct cases, 200 getter probes, 31 executor cases, four registry variants,
eight model contexts and 20 permission decisions. A freshness matrix covers 216
comparisons, SHA256
`6fcd8f47640b765deb35652e7ae246bc8b9f046e928a5f92e35512cd3ee6facd`.
Baseline and final corrected source both pass 31 named tests per mode.

Frozen JSON: 1790403 bytes, SHA256
`7604f019984b2a08c3684857428a50ca9f18a3f21431a6ddc33e8e95b9f25527`.
The receipt binds ten current files to exact production commit `7125e4e`, including
last-change commits, Git blobs, raw and LF-normalized hashes, plus 21 emitted files,
149 unchanged protected inputs and 27 unchanged lint inputs. Source tuple SHA256:
`7e58234174b1daf02f0fa63ba0fde6babc6c8f68676477ce6a35983df1d143f0`.
Receipt/checker/handoff bytes are bound by their evidence commit rather than
self-referential hashes. Run the checker on this lane or its detached checkpoint;
later integration may legitimately change protected scope or emitted files.

All paths, filesystem/media/model/approval/state ports, clocks and payloads are owned
synthetic fixtures. No fixture accesses actual files, user data, accounts, models,
network or processes. Known synthetic path prefixes/slash spelling are normalized
only in portable observations; native request paths have separate assertions.
Generated spans are normalized after propagation checks. Incidental error stacks
are omitted; own undefined fields/reference/getter/receiver identity are separately
asserted. Synthetic clocks are monotonic per invocation. An owned fixture observer
handles rejected promises returned from malformed synchronous callbacks, avoiding
unhandled-rejection pollution without changing what the handler receives. Async
port failures still exercise their real rejection boundaries. Capture requires an
explicit destination; final tests only read committed goldens.

Two assumptions failed on unchanged source before the freeze: JSON omits undefined
timeout fields, and admitted non-PDF pages are ignored. The harness was corrected
before freezing. No product defect or policy was silently repaired.

Using the existing Node 24.14.0 / pnpm 10.33.2 toolchain:

```sh
export PATH=/tmp/knorvia-lane-toolchain/node_modules/.bin:$PATH
pnpm build:cli-packages
pnpm --dir apps/cli typecheck
node --import tsx --test apps/cli/packages/core/test/read-orchestration-*.test.ts
KNORVIA_READ_ORCHESTRATION_TEST_EMITTED=1 node --import tsx --test apps/cli/packages/core/test/read-orchestration-*.test.ts
pnpm typecheck
pnpm lint
pnpm --dir apps/cli lint
pnpm fmt:check
pnpm architecture:check --changed
pnpm architecture:check
pnpm test:studio
node docs/evidence/knorvia-read-orchestration-fast-receipt-check-20261001.mjs --emitted
```

The checker validates evidence shape/counts, commit ancestry, local/publisher manifest
facts, scope, exact retained regions, frozen data, all current/protected hashes and
optional emitted digests. `--logs` additionally checks the bound local log files
while they remain available; log hashes are retained in the committed receipt.

Final source and strict emitted tests: 31/31 each. Existing protected Read-related
tests: 175/175 in a source-only run; this is not an emitted result. CLI build passed
17/17 tasks, ten cached; CLI types passed scope 16/19 and root types passed with
5422 matching i18n keys. Configured root/CLI lint passed. Strict owned lint applied
94 existing rules to eight source/test files with zero warnings/errors, using only
a temporary non-ignoring configuration. Evidence checker syntax/lint also passes.
Broader core lint still reports 24 errors and 11 warnings in 27 unowned files;
each is byte-identical to baseline. No rules, skips or timeout budgets were relaxed.
Full formatting and changed/full architecture checks passed with zero violations.
CLI is unmanaged/unassigned in architecture policy; explicit dependency direction,
retained state ownership and one text operation owner were manually reviewed too.

Final full regression: 522 test files, 6226 tests, 6218 passed, zero failures and
cancellations, eight existing skips, 357164.894942 ms. Seven skips need Windows or
PowerShell; one old/new Claude comparison lacks its old-root input. Build retains
existing Turbo/lock workspace, debug chunk and dynamic import warnings; Windows
CUA staging is skipped on Linux. Final evidence formatting/lint/schema/digest checks
are bound separately in the receipt.

## Exposure, attribution and remaining scope

Inherited Read source was read. Baseline `read.ts` is 13047 bytes, SHA256
`64513faf708de1851e29acdc5a000040cf82a887485347fe1faeca2b1375c656`.
Pinned ZCode manifest facts: commit `872ad960de7ec172591f7e1952f7849229f94521`,
path `apps/zcode-cli/packages/core/src/tool/handlers/read.ts`, blob
`397c1d6fdb8bbf1119fb1debfdafd8d514b1c265`, normalized SHA256
`d3cebd63754aa4753832a1ab78d43ee3c8c00ce452972ebce2e24e1b81fa3712`.
No fresh exact Read publisher-byte verification is claimed. Parent verification of
other handlers is separate and does not prove this path.

New structure includes explicit frame/history interfaces, ordered range encoding
and one joined completion path. Native stat/call expressions, cache constraints,
unchanged output, revision observation and retained state callback implementations
remain after exposure. Entry declarations, validation/error bodies, descriptions
and model-facing prose remain exact. Earlier source-exposed lane codec/fixture/checker
patterns informed this work. A function move, hash change or passing tests does not
establish independent expression. Frozen data includes old prose/output/errors;
test files reference retained interface facts as well as newly written synthetic
assertions. The whole handler has not been independently replaced by this slice.

Each owned file has a conservative unresolved advisory candidate status and explicit
retained/newly structured material in the receipt. These are not reviews.json
decisions or licence grants. Existing attribution must remain. Remaining subset
blockers are exact publisher bytes/notices, retained-expression and author/right-to-
license review, and root's independent decision. Future bounded separation of
declaration/prose assets or remaining inherited handler functions could aid review;
separation itself does not establish authorship. No clean-room or whole-file MIT
claim is made, and shared licensing files were not touched.

Older lane licensing inputs remain at 27 obligations. Parent reports Keyv 4.5.4
publisher material acquisition at abbreviated `d109b32`, closing only that item to
26; this was not imported or locally verified and does not establish project MIT
eligibility. Native Windows/macOS, real filesystem/media processing, packaged
UI/Electron/installer and real account/model acceptance were not run in this
synthetic scope. Root owns native acceptance, integration, publication and licensing.
The lane ends at the appended clean checkpoint and awaits its next assignment here.
