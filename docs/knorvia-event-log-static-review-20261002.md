# Event-log candidate: static behavior and expression review

The frozen candidate preserves the specified mutable-clock/read ordering on static inspection. It does **not** receive a positive whole-owner independent-expression finding: after formatting and private-storage access aliases are normalized, five of its six callable bodies match the inherited owner exactly; the sixth matches after accounting for one equivalent edge-mapping callback wrapper. Keep the candidate and receipt as evidence, without installing it or changing the inherited source classification.

## Frozen evidence and comparison boundary

- Inherited source at published E `674370592f06ac69996dbac08b3c0f4210983f61`: `apps/cli/packages/core/src/workflow/scheduler/events.ts`, 3,771 bytes, SHA-256 `4acf40908ead0d823de81c910c18928dc11a28cd87ca13da1c106a4e5947812d`.
- [Candidate](evidence/event-log-author-packet-20261002/draft-events.ts.txt): 3,724 bytes, SHA-256 `c5cee5930fac8cf66616fc9e3ba165bb9a8d6ad829c135ae223e1615e00b6174`; output freeze and access attestations precede this review, as recorded in the [handoff](knorvia-event-log-author-handoff-20261002.md).
- [Comparison program](evidence/event-log-static-review-20261002/compare-structure.cjs) and [results](evidence/event-log-static-review-20261002/structure-results.json) perform only TypeScript AST/printer source comparison. Neither owner is executed or installed.

The curator is source-exposed and the author packet itself is source-derived. The new no-inherited-context author reported no input-boundary breach. These facts establish a recorded drafting process, not that the resulting expression is sufficiently independent for the project's release goal. Fixed protocol literals, field order, evaluation/await order and straightforward TypeScript idioms constrain this small owner considerably; similarity is not an assertion of misconduct or a legal conclusion. Cosmetic further renaming would not address the finding.

## Behavior findings

| Boundary | Static result |
| --- | --- |
| Constructor capture | Callback values are captured in appendEvent, appendGraphRecord, now, onWorkflowEvent order. Later deps property replacement is not consulted. |
| Receiver and timestamp | Captured callbacks use the event-log instance receiver; timestamp calls clock once and formats its returned Date. Public timestamp dispatch remains observable. |
| Every graph append | The outer snapshot.runId read precedes record construction. Inner record.runId precedes timestamp. The options wrapper is constructed afterward; the clock is not hoisted. |
| Status and collection | Own-field presence/order and object-reference preservation match the packet. |
| Expansion traversal | Sequential live node traversal, then current edge traversal, then public collection method await, then final operation. Caller snapshot remains authoritative. |
| Expansion final record | Routing runId is read first; collection id, current mapped edge/node ids, payload values and inner runId are captured before the clock. Mutations from earlier publication remain visible. |
| Event publication | Metadata/payload reference precede clock; options.signal is read afterward. The same event is appended, then supplied to the awaited optional observer. |
| Errors and cancellation | No catches, retry, rollback, abort checks, extra clock or cross-call serialization appear. Later publication is gated by earlier success. |

The draft wraps the existing edgeId dependency in a one-argument arrow when mapping edge ids. The pinned dependency reads only edge.from and edge.to, so the extra arguments supplied by Array.map in the inherited form do not change the current result. This review does not claim equivalence for an arbitrarily replaced dependency that inspects argument count or callback identity.

Private storage changes from TypeScript private ordinary properties to ECMAScript private fields. The packet explicitly leaves private layout free. This changes reflection, untyped direct property tampering and private-brand behavior for borrowed methods; those unsupported private-layout observations are not accepted as preserved. Public signatures appear unchanged by inspection, but this is not a project typecheck.

## Expression result and remaining work

Constructor, timestamp, appendGraphStatus, appendCollectionRecord and emitEvent bodies are printer-identical after mapping the four private-storage accesses to their baseline names. appendExpansionRecords differs only at the edgeId arrow wrapper under that comparison. Field declarations also change storage and type spelling. There is no evidenced new substantial decomposition or independently expressed publication mechanism in the resulting owner.

Leave this candidate uninstalled. Root must decide whether the constrained API/behavior and independent-author process provide sufficient evidence, whether another independently designed owner is needed, or whether inherited attribution remains the correct outcome. This lane does not make a global licensing decision and does not erase applicable notices. Do not treat the process receipt, static behavior finding or a later passing test as independent-expression clearance.

No compiler check, runtime probe, full test suite or broad build ran for this review. Runtime acceptance and public declaration verification remain pending. No cross-lane code integration, production source change or retry of the cancelled root upload occurred.
