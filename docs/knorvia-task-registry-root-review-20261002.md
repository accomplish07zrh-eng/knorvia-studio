# Task-registry fragment: independent review

Recommend accepting the supplied runtime fragment for root's integration review. No
supported-contract correctness blocker or copied discretionary commentary was found.
This is a bounded runtime-expression recommendation, not a whole-file licence decision.
The supplied 6,097 bytes, including final LF, match SHA256
`3f0420e83be7796d7c767112cc5f10ac3aa66d92e8fd6b91d08847502257eac4`.
Review baseline is lane head `6888c2e40060dd0c6cad32cf97736c3e2e21b933`.
Only this report and its receipt are added to the repository.

The reviewer read the exact local predecessor, four unchanged author inputs and
eight-group frozen assertions. Source exposure is explicit. Root reports that it
authored the fragment from that packet and three observable clarifications before
reading predecessor/tests. That chronology is parent-reported, not independently
audited here. The reviewer did not author the fragment or retry the native author.

## Lifecycle and independent checks

The new owner indexes terminal/background cohorts together per id. Releasing a
channel detaches it before cleanup and removes the id entry only when neither channel
remains. Thus cleanup can install a fresh cohort without appending to the detached
one. Abort looks up current eligibility; it cannot remove a later observer from the
cohort already being iterated. Native rejection wins over a subsequent resolution
attempt. Commit, terminal cleanup and background cleanup retain their original order.
Installation still precedes admission; there is no post-install abort check, deferred
setup, deadline, fencing, retry or recovery of abandoned detached observers.

Four focused paired comparisons ran against exact predecessor emitted JS and a
fresh compilation of the digest-bound fragment, using owned metadata/signals only:

1. First cleanup re-registers the id, installs fresh terminal/background observers
   and aborts later old observers. The later detached terminal listener is still
   cleaned; its rejection wins. The fresh background observer receives undefined
   from the ongoing terminal publication, while the fresh terminal observer remains
   pending until the next terminal publication. References and continuation order match.
2. Cleanup installs fresh observers then throws the exact owned error. Reentrant
   replacement remains stored. Later removal settles the fresh terminal and both
   eligible background observers, but cannot recover the detached terminal observers;
   their explicit owned aborts settle them with the original error.
3. Listener installation removes/re-registers the id and aborts inline. The older
   background observer resolves undefined; inline rejection precedes later removal,
   which cleans the newly admitted listener once. Repeated removal adds no cleanup.
4. Nonempty drain returns the third getter result by identity. Exact trace remains
   `messages:1 → messages:2 → messages:3 → copy:before → messages:4 → copy:after`.

All four comparisons pass; eight invocations are **four paired probes**, not eight
new groups. They overlap historical reentrancy/abort/drain coverage. TypeScript 6.0.2
strict compilation reports zero diagnostics. Parsed public shape agrees with the
exact packet and generated declaration: eleven methods and two exported functions.
Parsed source comment boundaries contain zero comments. Wrong/missing raw fragment
controls reject; predecessor source/JS/declaration and packet hashes are exact.

The first API proof compared optional type-member semicolon tokens and failed before
runtime probes. Its initial script and diagnostic record remain in `/tmp`; the
corrected proof prints parsed type nodes before comparison. Candidate, packet and
historical assertions did not change. Exact traces and proof hashes are in the receipt.

## Expression and retained material

The concrete per-id channel container, shared-entry retirement, captured rejection
closure and switch classifier provide substantively different implementation ownership
from the predecessor's separate waiter indexes and stored resolve/reject records.
The review does not require novel algorithms, fewer lines or different standard idioms.

Close expressions remain in the public operations: shallow stamping/copying, exact
patcher-result storage, message spread/append and four-read drain, immediate native
promise returns, ordered detach/cleanup/resolve, and the `Object.values(...).some(...)`
background scan. Their data/read/effect order is specified in the packet and frozen
observations; Map/Set operations, spreads and short-circuit scans are conventional
glue. These similarities are disclosed rather than counted as newly invented behavior.
Fixed API/type/field names, terminal vocabulary and `Runtime task wait aborted` remain
carried contract material. The supplied fragment contains no predecessor explanatory
comments; the projected public declarations remain source-derived material.

The comparison is to the exact **local modified predecessor**, not a newly verified
publisher blob. Inventory identifies ZCode commit
`872ad960de7ec172591f7e1952f7849229f94521`, path
`apps/zcode-cli/packages/core/src/runtime-task/registry.ts`, blob
`48d9788209c80bdc10dcca8b4e507e2fde33765b`. Publisher bytes were not acquired in
this review. Existing contributor/notice obligations and root's digest-bound rights
review remain necessary; no clean-room, MIT grant or integrated whole-file conclusion.

## Verification limits

Root's integrated runtime AST equality, eight source/eight actual-emitted groups
(including same-surface TaskOutput), scoped compiler and desktop milestone are
parent-reported. They were not rerun or added to this review's counts. The complete
integrated file and its final digest were not supplied; the generated `/tmp` JS and
declaration are review artifacts, not root's emitted artifacts. No full call-runner,
live-task, cross-platform/native or broad product acceptance ran here.

The declared API requires snapshot objects and AbortSignals. Static comparison also
shows an outside-contract boundary: explicit undefined checks and nullish signal
calls differ from predecessor truthiness for null/falsy patcher returns or primitive
signals. No supplied caller or frozen contract requires those values; universal
malformed-input equivalence is not claimed. Throwing owned ports and partial effects
within the packet were inspected, with cleanup/installation boundaries probed above.

Production, public declarations, frozen tests/selectors, packet, historical evidence
and licensing files remain unchanged. No execution blocker remains. Root owns final
artifact selection, aggregate acceptance and any per-file rights determination.

[Digest-bound receipt](evidence/knorvia-task-registry-root-review-20261002.json).
