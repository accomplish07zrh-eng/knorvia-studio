# Event-log candidate: static behavior and expression review

The frozen candidate preserves the specified mutable-clock/read ordering on static inspection. The recorded input-limited author process supports a bounded contribution finding for this small port-wrapper owner: this review identifies **no concrete non-mandated copied expression** beyond the retained contract and ordinary TypeScript idioms. The body-match evidence remains accurate, but does not itself establish copying or justify rejecting the draft. This clarifies the earlier overly restrictive disposition; textual novelty or a new decomposition is not required. The candidate remains uninstalled because integration and runtime acceptance are separate pending work.

## Frozen evidence and comparison boundary

- Inherited source at published E `674370592f06ac69996dbac08b3c0f4210983f61`: `apps/cli/packages/core/src/workflow/scheduler/events.ts`, 3,771 bytes, SHA-256 `4acf40908ead0d823de81c910c18928dc11a28cd87ca13da1c106a4e5947812d`.
- [Candidate](evidence/event-log-author-packet-20261002/draft-events.ts.txt): 3,724 bytes, SHA-256 `c5cee5930fac8cf66616fc9e3ba165bb9a8d6ad829c135ae223e1615e00b6174`; output freeze and access attestations precede this review, as recorded in the [handoff](knorvia-event-log-author-handoff-20261002.md).
- [Comparison program](evidence/event-log-static-review-20261002/compare-structure.cjs) and [results](evidence/event-log-static-review-20261002/structure-results.json) perform only TypeScript AST/printer source comparison. Neither owner is executed or installed.

The curator is source-exposed and the author packet itself is source-derived. The new no-inherited-context author reported no input-boundary breach. These facts establish the bounded authoring process, with instruction-based access restrictions in a shared executor rather than OS-enforced isolation. Fixed protocol literals, field order, evaluation/await order and straightforward TypeScript idioms constrain this small owner considerably. Similarity alone does not negate that process, and this review neither requires novel wrappers nor proposes cosmetic renaming. The finding is a contribution/provenance assessment of this frozen candidate, not a legal guarantee or global release decision.

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

## Retained contract, common idioms and discretionary expression

The comparison remains unchanged: constructor, timestamp, appendGraphStatus, appendCollectionRecord and emitEvent bodies are printer-identical after mapping four private-storage accesses to baseline names; appendExpansionRecords also matches after normalizing its edgeId arrow wrapper. That normalization intentionally removes a real private-storage choice made by the author. Counts of equal normalized bodies do not distinguish contract constraints from protectable or discretionary expression.

| Matching expression category | Why it occurs here | Bounded finding |
| --- | --- | --- |
| Public signatures, dependency fields and fixed event/record names/literals | Supplied public API and protocol require these values. | Retained public contract, not evidence of copied discretionary implementation. |
| Capture sequence and callback receiver; outer runId before record; inner runId and metadata before timestamp; signal after timestamp | Supplied contract explicitly specifies these observations, including mutation-capable callbacks. | Functional order is mandatory. Exact syntax has alternatives, but direct property calls and argument/object evaluation are ordinary ways to meet it. |
| Object fields, insertion order, reference sharing and payload projection | Supplied contract lists these exact fields and ordering. | Direct object literals and small member projections are standard implementation idioms for the specified result. |
| Clock call followed by Date formatting | Explicit timestamp contract, including both receivers and one clock call. | Minimal standard wrapper; no additional discretionary algorithm identified. |
| Sequential live nodes/edges, collection delegation, then final operation | Explicit stage order and live array semantics across awaits. | for-of plus await is ordinary syntax; the contract does not compel that exact syntax, but its use alone is not evidence of copying. |
| Array mapping for current ids and awaited optional observer | Fresh ordered arrays and observer settlement are explicit requirements. | map, a one-field arrow projection, optional call and await are ordinary idioms. |
| Private representation and names | Packet leaves storage free. | Author chose ECMAScript private fields and different storage names/types; the comparison aliases these away. These are discretionary choices, not novel algorithms required for acceptance. |
| Helper structure, explanatory prose or other discretionary material | Neither body review nor the retained comparison identified a distinctive discretionary mechanism/commentary reproduced independently of the packet constraints. | No concrete non-mandated copied expression identified in this review. This is bounded to the inspected owner and available provenance. |

The contribution is a complete candidate authored from the frozen public/behavioral inputs under the recorded read restriction. It retains the required protocol and behavior, and uses conventional TypeScript wrappers to realize them. It does not reconstruct the imported graph helper, underlying schemas, persistence adapters or other scheduler owners. The source-derived packet remains disclosed; its fixed contract material is not claimed as newly invented expression.

Do not rewrite the candidate solely to force textual differences, and do not commission another author solely because of these matches. Preserve the exact frozen draft, author receipt and structural evidence. The production owner is still inherited because this lane has not integrated the candidate; any later source classification must follow the actual integrated contribution and applicable notice evidence rather than this document alone. This review makes no global licence decision or legal guarantee.

No compiler check, runtime probe, full test suite or broad build ran for this review or its clarification. Runtime acceptance and public declaration verification remain pending. No cross-lane code integration, production source change or retry of the cancelled root upload occurred.
