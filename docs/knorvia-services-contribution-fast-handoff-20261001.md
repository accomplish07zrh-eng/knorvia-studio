# Fixed services lane contribution evidence

This candidate binds corrected production commit
07709cddb68c1bc504d3c72707048d979a43a7f2 on parallel/file-watcher-fast-20261001.
The retiring-admission code and exact runner receipt were already pushed as clean checkpoint
dc05985 after root's disconnect notification; shell/filesystem reads confirmed availability.
No production changes follow that correction. Root owns independent review and integration.

Deliverables: [candidate matrix](knorvia-services-contribution-fast-candidate-20261001.json),
[reproducible checker](../scripts/provenance/services-lane-fast-20261001.mjs),
[fixed scope helper](../scripts/provenance/services-lane-scope-fast-20261001.mjs),
[checker regression cases](../scripts/provenance/services-lane-fast-20261001.test.mjs), and
[spec](../specs/knorvia-services-contribution-fast-20261001.md). Canonical matrix payload SHA-256:
`f41aed85af717561417aceaa6d8ee9f05084bb1d63bbf6834e423fdef002035e`.
The digest covers human observations as well as file/source/range facts, excluding only its
own payloadSha256 field. Root must review assertions rather than trusting a self-generated seal.

## Exact publisher and local baseline

Publisher source is [zai-org/ZCode at the pinned commit](https://github.com/zai-org/ZCode/commit/872ad960de7ec172591f7e1952f7849229f94521),
commit 872ad960de7ec172591f7e1952f7849229f94521, tree
d185a9a893c00d51fc3fe51fe7371b9eea7de143. A read-only exact-commit HTTPS fetch into the separate
owned bare repository /tmp/knorvia-services-provenance-upstream-872ad960.git reproduced root's
commit/tree facts. All eight relevant original paths were checked for mode, blob ID, raw SHA-256,
CRLF-only normalized SHA-256, encoding and byte length against licensing/upstream-baseline.json.
This verifies those publisher bytes, not every path in the complete upstream inventory.
No source object was imported into production ancestry, no upstream implementation copied into
production, no mutable upstream-head assumption or unavailable-byte verification claim.

The integrated local baseline is 0d80f9ca37b1daef162ecc69bd18f6e8fc30a146; imported local
snapshot is 7619e41b950bd52073ebf36754146cf25659d9fa. These are local provenance facts,
distinct from publisher evidence. Every candidate path has exact current blob/digests,
latest content-changing commit, both local baseline records (or explicit absence), and the
actual executable licensing schema's upstream relationship. Twenty-four reference records
bind eight original paths at each of publisher/integrated/imported commits. No new path,
different hash, moved function or absent baseline is treated as proof of original expression.

## Conservative candidate scope

Fifty paths: 18 production files, two public declarations as retained context, 17 tests,
five loaders/fixtures and eight frozen specs. fileWatcher.ts is included but entirely retained
from the integrated local baseline; public terminal.ts and terminalProfileTypes.ts are also
retained context rather than lane-authored replacements. Every exact path and commit/hash is
in the JSON, alongside per-file structural contribution, retained policy and future separation.

| Boundary / files                                       | Whole-file candidate status          | New structural contribution and retained scope                                                                                                                                  |
| ------------------------------------------------------ | ------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Watcher fileWatcher.ts / fileWatcherService.ts         | Two upstream-modified                | Declaration file wholly retained locally; service adds registration/turn identity ownership while retaining events, debounce, paths, logs/errors and normal lifecycle contracts |
| fileWatcherBatch.ts / fileWatcherRuntime.ts            | Two unreviewed                       | Constant-space verdict and explicit IO/timer port; native calls/path grammar and small adapter expression remain mixed                                                          |
| feedbackLogArchive.ts                                  | Upstream-modified                    | Tagged scan consumer and settled ZIP-writer cleanup; options/results, output/about labels, progress and ZIP API expression remain                                               |
| feedbackArchiveCandidates.ts / Policy.ts / Snapshot.ts | Three unreviewed                     | Frame/cursor iterator, shared policy and handle-owned snapshot; size/time/path/privacy/decoder/flag/redactor expressions remain                                                 |
| terminalProfile.ts                                     | Upstream-modified                    | Ordered group interpreter and family stack; private input/result declarations, re-exports, fallback fonts and precedence remain                                                 |
| terminalProfilePortablePlan.ts / Formats.ts / Read.ts  | Three unreviewed                     | Lazy probe groups, JSONC lexical spans and ranked Windows fonts; compatibility paths/keys/regexes, parser libraries and small IO interpreter remain                             |
| terminalProfileMacOs.ts                                | Upstream-modified                    | Ordered app registry with explicit plist/decode ports; detector declaration, HOME/path expression and plutil options remain                                                     |
| terminalProfileMacOsDecode.ts / Plist.ts               | Two unreviewed                       | Candidate/schema projection and staged admission; plist/color/font grammars, archive regex and tiny object/IO predicates remain                                                 |
| terminalService.ts                                     | Upstream-modified                    | Reservation/adoption/publication connects coherent owner and pure plans; native loader/helper bodies and public/result/planning expression remain                               |
| terminalServiceLaunchPlan.ts / InstanceOwner.ts        | Two unreviewed                       | Pure launch alternatives and resource-generation/retirement protocol; shell/env/ConPTY values, public IO/errors and prior own lifecycle expression remain                       |
| terminal.ts                                            | Upstream-modified, retained context  | Entire integrated declaration/descriptor file retained; local branding and optional result additions differ from publisher                                                      |
| terminalProfileTypes.ts                                | Upstream-unchanged, retained context | Exact publisher/local file including all declarations, field order and formatting                                                                                               |
| 22 tests/support + eight frozen specs                  | Thirty unreviewed                    | New contract/scenario/fake-port organization is a contribution candidate; inherited expected values/grammar and fixture/document expression require separate review             |

Totals are **seven upstream-modified, one upstream-unchanged and 42 unreviewed**. None has an
accepted review or granted license in this candidate. All proposal decisions are null and
license NOASSERTION; existing Apache-2.0/component declarations remain effective. The actual
model permits original, independent-replacement, third-party and reviewed-retained decisions;
reviewed-retained supports only functional-configuration or standard-license-text with
NOASSERTION. It cannot classify mixed source code or clear retained declarations. No source-code
nature workaround, clean-room statement, whole-file MIT claim or blanket independent-file count.

## Retained expression and fixtures

The author read inherited source while writing contracts and implementations; publisher bytes
were additionally exposed during this review. Matrix matches record 232 representative maximal
exact syntax/comment slices, each with current/source UTF-16 offset and line/column coordinates,
slice SHA-256 and exact expression for short fragments. The 4,061 literal/payload observations
bind all collected string/number/regex literals and pure owned object/array fixture payloads,
including escaped/multiline synthetic content. Full source/test blobs bind all remaining content.
Source matching for fragments shorter than five units is deliberately omitted; whole-file
retention and manual notes disclose such shared primitives and formatting. Representative
matching source occurrences may omit equivalent repeated occurrences or identical source files.

Important exact retained examples, with full hashes/source positions in the matrix:

- terminalProfile.ts lines 15–20 and 21–24: complete private input/result interfaces exactly
  match publisher/local expressions. Font strings and other fallback/precedence grammar remain
  even when surrounding declarations or algorithms change.
- terminalProfileMacOs.ts lines 16–20: private detector type exactly matches publisher lines
  7–11. App/plist identifiers, home/path expression and plutil command options remain retained.
- terminalProfileMacOsDecode.ts line 83: long archived-font regex is exact publisher expression,
  slice SHA-256 bad46993b89ec82b0e1a9a9d32f9aa8027e96e4ffc58656cc4cb02c19f1ae046.
  Descriptor regexes at lines 64/72 are also exact matches; newly spelled permissive color
  recognition does not eliminate its source-exposed grammar or numeric conversion values.
- terminalService.ts lines 35–48, 50–52, 54–71 and 73–97: complete loadNodePtyModule,
  getErrorMessage, resolveNodePtySpawnHelperPath and ensureNodePtySpawnHelperExecutable bodies
  exactly match publisher and integrated baseline. require binding, native type aliases,
  native globals and three comments also retain exact expression/formatting.
- Entire fileWatcher.ts, terminal.ts and terminalProfileTypes.ts formatting/content matches
  integrated local bytes. Only terminalProfileTypes.ts also matches complete publisher bytes;
  local package/branding changes in other declarations are not authorship evidence.

Exact matches do not decide copyright, and unmatched syntax does not prove originality.
Restructured/renamed expressions, equivalent grammars, standard idioms, fixture key/value facts
and retained generic object/IO predicates still need human review. Tests, changed digests,
line reductions and removal of old function names are behavior/content evidence only. Normal
project formatting/import conventions are separately disclosed, not counted as new expression.
The checker replays bytes/ranges; it does not rederive the AST collector's selection or the
human contribution judgments. Matrix collection used existing installed TypeScript 6.0.2;
the shipped checker itself requires only Node standard libraries and existing audit APIs.
The first final lint run flagged its formatted 441 non-comment lines against the existing
400-line cap. Immutable scope metadata was separated into the narrow helper; no rule was
relaxed and no production change or authorship credit follows from that extraction.

Retirement admission is checked at the existing lookup point. Previously admitted live IO
keeps its original member/argument getter evaluation order, and previously obtained Event
functions keep the real Emitter semantics. This evidence does not promise new atomic native
liveness guarantees or wrap already obtained event functions.

The smallest useful future implementation separation is terminalService.ts's retained native
load/discovery/permission boundary, after independently freezing lazy retry and permission
contracts. Elsewhere, isolate small compatibility tables/regexes/declarations from the batch,
cursor, lexical-span, projection, plan and ownership structures for expression-specific review.
Moving those retained pieces alone would not constitute an independent replacement. Do not
rewrite a declaration solely because its whole-file classification is upstream-modified.

## Reproduction and acceptance

From the original lane checkout, using a separate owned bare publisher repository:

```sh
git init --bare /tmp/knorvia-services-provenance-upstream-872ad960.git
git -C /tmp/knorvia-services-provenance-upstream-872ad960.git fetch --no-tags --depth=1 https://github.com/zai-org/ZCode 872ad960de7ec172591f7e1952f7849229f94521
node scripts/provenance/services-lane-fast-20261001.mjs --publisher-repo /tmp/knorvia-services-provenance-upstream-872ad960.git --require-publisher
node --test scripts/provenance/services-lane-fast-20261001.test.mjs scripts/provenance/provenance.test.mjs scripts/provenance/retained-review.test.mjs
```

Exact-byte replay passed: 50 files, 24 references, publisherVerification verified-exact-bytes,
zero unavailable publisher matches, 27 unresolved obligations, acceptedReview false. It checks
current normalized bytes, exact snapshot blobs/raw hashes, content commits, local baselines,
schema-derived classifications, every range and schema/shared-input fingerprints. After root
changes source or shared records, its live-worktree check intentionally reports stale evidence;
review this original lane snapshot or prepare a new reviewed candidate rather than loosening it.

Offline `node scripts/provenance/services-lane-fast-20261001.mjs` also passed local replay but
explicitly reported publisherVerification unavailable, 16 local references and 1,029 unavailable
publisher range matches. `--require-publisher` without its repository fails. Inventory alone is
never returned as verified publisher bytes. Production checkout cannot substitute for the
separate bare repo. Negative cases also reject scope traversal/duplicates, malformed/re-sealed
digests, modified snapshot/reference/range/classification facts, invalid source-code nature,
coordinates, license/authorship claims and content changes distinct from allowed CRLF.

Schema/checker acceptance is **three files, 38 individual cases passed**, zero failures/skips:
18 lane cases plus 20 existing provenance/retained-review cases. The new lane checker cases
are run explicitly; no shared test runner/CI/package configuration was edited to add them.
Final root typecheck passed with 5,422 matching locale keys; lint passed with zero warnings/
errors; formatting and changed/full architecture passed, with zero architecture violations.
Shared provenance remains unchanged and stale for
new branch code by design; no pnpm provenance:check success is claimed. Root regenerates it.

Production acceptance remains the corrected checkpoint's exact result: 11 focused files with
346 individual source cases and the same 346 strict emitted cases; full 513 files/6,397 cases,
6,389 passed, zero failed/cancelled, eight existing platform/optional skips; CLI and desktop
builds and root gates passed. See [the exact runner/correction receipt](knorvia-terminal-lifecycle-admission-fast-handoff-20261001.md).
No production change followed that full run. Evidence-only work adds no native acceptance:
Linux/macOS/Windows native PTYs, helper permissions, packaged GUI/font rendering remain open.

LICENSE, NOTICE, preview package identity, licensing/upstream-baseline.json/current-files.json/
reviews.json, third-party inventory, dependencies/lockfiles/CI and other lanes are untouched.
Recomputed material audit has zero issues and preserves all 27 unresolved obligations. No
outreach, deployment, release, merge, user data/profile/log/credential access, real terminal/app
launch, settings/security change or environment recreation. Network was limited to authorized
exact public source fetch and this lane's pushes. Future assignments stay in this conversation.

Local support: /tmp/knorvia-services-contribution-evidence contains the temporary collection
script, generation receipt, publisher/local checker outputs, 38-case log and quality-gate logs.
Temporary publisher storage is not required to trust an unavailable result; root can re-fetch
the same immutable commit into separate storage and run the shipped checker independently.
