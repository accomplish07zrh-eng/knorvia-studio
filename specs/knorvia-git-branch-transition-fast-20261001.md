# Branch transition admission and completion

Baseline dfac8018752da1c7b7f4d26f1cecb9721c23c58c. Own only switchBranch and
createBranchAndSwitch decision/effect orchestration in gitCliRepo.ts and one
local synchronous generator shared by those two methods. Existing marker/name
checks, result builders, command provider, maps/invalidate, accepted helpers,
read owners, path scope and selected-index work remain byte-exact.

```text
service/RPC → public method (owns awaits) → one request-local branch program
  → status → admission → marker probe → name validation → fake switch effect
  → failure result OR invalidate → refreshed status → success result
```

- Read status through the original receiver before availability and input trim.
  Preserve availability error priority. Empty names return invalid-name issues;
  switch to the exact current branch is a success/no-op even with conflicts.
  Create does not take that shortcut. Next priority is conflicts, operation
  markers, then name validation. Failures preserve the original summary identity,
  action/name/null/created/didChange/issue fields, messages and lazy read order.
- Marker and name-check implementations, concurrent filesystem probes, command
  argv/cwd/timeouts/caps, getter/receiver behavior and error propagation are fixed.
  Trim optional startPoint only after validation. Preserve literal -- separation
  before a nonempty start point and the original no-guess flags.
- The switch result's exitCode alone selects failure interpretation versus
  success; do not silently add timeout/truncation policy here. On failure use the
  accepted issue parser; throws/rejections escape unchanged, with no invalidation
  or refreshed status. On success invalidate once before reading status again;
  return the new summary, action-specific created and didChange=true.
- Preserve original awaited effect count and settlement boundaries. The new
  generator yields existing promises directly; public methods await them and feed
  values/errors back without another async orchestration promise. There is no
  request cache, cancellation, retry, deadline, permission or cleanup policy added.
  Check queued/reentrant status readers, existing map reuse/cleanup, external
  invalidation and late accepted/rejected switch completion against the baseline.

Design: one concrete request-local gate sequence, one command/outcome path and
one success publication boundary replace duplicated branch decision owners.
Keep ordinary compatibility predicates, command/prose/result leaves attributed;
the contribution is shared control/lifetime expression, not invented policy or
an interpreter framework. Freeze actual source/emitted service/RPC effects first.
All command/fs/clock inputs are owned synthetic ports/data; no Git mutation,
user files, provider/network, credentials or settings/security effects. Focused
cases/direct consumers and scoped checks only; root owns aggregate acceptance
and independent whole-file licence review. Preserve mixed-source classification,
applicable notices, shared records and every historical receipt.

## Retired before implementation

Root's subsequent design correction rejected adding an operation generator merely
to reorganize these fixed guards/forwarding effects. The proposal above is kept
as historical design evidence, not implemented or accepted architecture. Only
the exact two-method oracle was captured; no new product tests or failing product
run occurred. Production and existing assertions remain unchanged.

The authorized fallback is a bounded whole-file expression review of gitCliRepo.ts
at dfac801. Record every top-level/private factory owner and public method, exact
publisher/import/integrated matches, uncovered syntax/prose, current source and
emitted bytes, immutable protected Git production and shared records. Use a small
read-only digest checker and synthetic tool cases that reject tampering, omission
and misbinding. Trace the still-live preview ports and another substantive owner
before recommending a next decision; do not equate retained guards, hashes,
source exposure or extraction with a rights conclusion. No product type/build/
test rerun for evidence-only additions; prior product receipts remain historical.
