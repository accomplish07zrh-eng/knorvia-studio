# Complete desktop tab limit decision owner

Batch46 continues PR9 from b6f2526ebac93c7df8284008791b214574733215. Only
browserTabResidencyPolicy.ts product source is selected. It owns the entire dynamic
logical-window tab-capacity and protected-state eviction decision; no coordinator,
guest attachment, restoration, second state/cache or new queue is introduced.

```mermaid
flowchart LR
  C[Existing candidate references] --> W[Same-window candidates]
  W --> L[Capacity exceeded]
  L --> P[Exclude visible or active protected states]
  P --> S[Stable activity / selection / opened / ID order]
  S --> R[Original candidate reference or null]
```

Keep the32 default, exact protected-state short circuit, numeric/nullish/NaN sorting
semantics, stable ties, original candidate identity and caller array nonmutation.
guestAttached/preferred/currentTask do not protect logical shells. Physical guest
and coordinator remain separate existing owners. No alternate recovery path.

Exact inventory/history/receipt and PR8/10/11/12 screen plus bounded fixed publisher
identity checks precede authoring. CLI browser owners have prior complete receipts;
no completed owner test expansion. Root/D/A/B/E boundaries and every HOLD retained,
RecoveryStore remains dormant. No global licensing/inventory/manifests edit.

One fresh nofork GPT-6.1 Sol/high author receives only full behavior/public types,
freezes complete literal/hash/access before curator inspection. Corrections whole
literal from memory/bounded facts, no old draft/source/test reread. Curator source
exposed; install whole copy plus formatter only. Shared fs separation instructional.
Parent directly verified primary G UI at02:39, GPT-6.1 Sol/high, Fast Value1 already
ON. Executor did not see that UI; fresh author Fast service separately unverified.

Minimal synthetic decision data and scoped semantic/public API/syntax/lint/format/
architecture checks only. No browser/Electron/media/userdata/permissions/runtime
network, full types/build/aggregate suite. Preserve failures and normalized matches;
matching material zero new independent-expression/MIT credit, parent classification
pending. At most this one selected owner; no count padding with thin glue/declarations.
