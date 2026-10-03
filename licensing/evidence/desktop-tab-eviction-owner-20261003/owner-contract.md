# Complete dynamic tab eviction policy

Public API/type fields are in ports/residency.d.ts; preserve every field/optional/
readonly/union/export and default constant32. Private selection options not exported.
No imports, new public exports, state mutation, clocks, IO or policy changes.

selectBrowserTabLimitVictim(candidates readonly array, options) returns SAME winning
candidate reference or null, never a copied candidate. Capture tabLimit from
options.tabLimit??BROWSER_TAB_LIMIT once before filtering. First filter candidates
by candidate.windowId === options.windowId (options live read per candidate).
If this filtered array length <= tabLimit return null WITHOUT reading protection
flags or sorting. Preserve unusual tabLimit numeric values and sparse Array.filter
semantics; do not clamp/floor/validate.

Only when count exceeds limit, filter out protected candidates. Exact protected
short-circuit predicate order: residency==='live-visible', residency==='restoring',
residency==='suspend-pending', selected, visible, operationActive, captureActive,
audible, mediaActive, loading, downloadActive. Truthy flags protect; no coercion or
new physical guestAttached/preferred/currentTask checks. Suspended shell can be
eligible. Residency is read afresh for each comparison, preserving getter order.

Sort the new eligible array stably (do not mutate caller array) with priority:
first numeric left.lastActivityAt - right.lastActivityAt; if !==0 return delta
including NaN. Next (left.lastSelectedAt??Number.NEGATIVE_INFINITY) minus likewise
right; if !==0 return delta including NaN (two nulls yield NaN, frozen behavior).
Then left.openedAt-right.openedAt; if !==0 return delta including NaN. Finally
left.tabId.localeCompare(right.tabId) bound to original string. No tie policy change,
NaN sanitization, identifier/ordinal substitute, Infinity normalization, winner
cloning or stable-sort removal. Return eligible[0]??null. Preserve synchronous
getter/proxy/localeCompare errors by identity; no catches.

No novelty requirement; normalized same contract expressions/body receive zero
new provenance/MIT credit. Complete owner algorithm, not merely renamed declarations.
