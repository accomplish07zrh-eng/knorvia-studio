# Complete workflow scheduler event-log owner: behavioral contract

Implement the complete exported `WorkflowSchedulerEventLog` class at the public surface in `public-api.d.ts`. The class owns clock formatting and serial event/graph-record publication through supplied ports. It does not own graph mutation, schema validation, scheduling, tracing, artifact writing or persistence adapters. Use the existing `edgeId` dependency for graph edge identifiers. Internal storage, private names and decomposition are your choices; do not add public APIs or license labels. This is a compatibility task, not an algorithm-novelty exercise.

The public declaration and data shapes are reference inputs, not runtime shim modules to implement. Fixed record/event fields, own-property presence/order, literals, reference sharing, clock/read order, await boundaries and error identities below are functional requirements. Normal TypeScript idioms and those protocol constraints need not be made artificially different. Default module guideline is below 400 lines without compressing readability.

## Author input boundary and frozen output

Read only the three supplied files `inputs/contract.md`, `inputs/public-api.d.ts`, `inputs/public-data-shapes.md`, and your own output in the supplied working directory. Do not inspect any repository, AGENTS/history, implementation, test, review, other scratch directory, network resource or other author's output. The curator has handled repository instructions. This is an uninstalled evidence draft. The shared executor is not a filesystem-isolated sandbox; disclose any accidental read or unresolved question.

Write a complete `output/events.ts`. Immediately write `output/author-record.json` binding every input and draft by SHA-256/byte count, with actual reads, UTC freeze time, boundary breaches and unresolved questions. Exclude the metadata record from its embedded self-hash and report its separate hash afterward. Freeze before compilation, tests or comparison, then stop. Do not modify production files or contact other authors.

## Construction, receivers and clock

Construction captures the dependency callback values once, in this observation order: appendEvent, appendGraphRecord, now, onWorkflowEvent. It does not invoke them or read unrelated dependency members. Later replacement of properties on the original dependency object does not replace captured callbacks. Do not retain only a live dependency-object reference for later callback lookup.

When those captured callbacks are invoked, their receiver is this event-log instance, not the original dependency object and not undefined or a separate storage object. Preserve the actual callback identities and input references. The same applies to the optional observer.

`timestamp()` is synchronous. On each invocation it calls the captured clock exactly once, with the event-log receiver, then invokes `toISOString()` on that returned Date with the Date as receiver, returning that result. Do not replace it with wall-clock time, clone the Date, cache timestamps or normalize errors. Clock and formatting errors escape synchronously and unchanged from `timestamp()`.

Other public methods invoke the instance's current public `timestamp()` at the specified observation points. Preserve that public-method dispatch, including an overridden method. `appendExpansionRecords` also invokes and awaits the instance's current public `appendCollectionRecord` method for its collection step; do not bypass that observable delegation. Private member names/layout are not prescribed public API.

## Common record-publication observations

The append port signature has **three arguments**: an outer runId routing string, a graph record object, and an options object with own key `signal` (present even when undefined). The record's runId and the outer routing runId are separate observations of the same snapshot. They are not references to a subsequently mutable snapshot field.

For every graph append below, observe in order:

1. The outer runId argument is read from snapshot.runId **before constructing the record**, including before any clock call for that record.
2. Construct the record's fields in the listed order, reading each field's source at its listed position. Its own runId is read again at its listed position, which is also **before** the timestamp/clock.
3. Obtain the timestamp at its listed field position. A clock may synchronously mutate the snapshot or other shared records.
4. Complete any later literal fields, construct the signal options wrapper and invoke the append port with the already observed outer runId and record. Await that append before any following publication.

Thus, on ordinary mutable objects, if snapshot.runId is `run-before` and the clock changes it to `run-after`, that append's outer routing argument and record.runId remain `run-before`. The append sees the post-clock snapshot if it independently closes over it. A later append observes the then-current snapshot.runId anew; never freeze a runId for the entire multi-record expansion. Do not hoist the clock before the outer runId read or collect a timestamp in a helper before constructing fields that precede it.

All graph record/options objects are fresh for their publication. Where a field below holds a node, edge, collection or payload reference, preserve that same object rather than cloning, normalizing, serializing or freezing it. Primitive field values already observed before clock/port mutation remain those observed values. Shared referenced objects can still reflect later mutation.

This contract targets ordinary schema-shaped mutable records and arrays and explicitly mutation-capable clocks and ports. No new support policy for arbitrary proxies or malformed inputs is requested; do not add validation or extra reads to manufacture such a policy.

## appendGraphStatus

It publishes exactly one graph record, then resolves without a result value. Outer routing runId is read first as above. Record own fields and observation order:

| Field | Value |
| --- | --- |
| nodeId | nodeId parameter |
| phase | phase parameter |
| recordType | fixed `op` |
| runId | current snapshot.runId, before the clock |
| status | status parameter |
| timestamp | next public timestamp() result |
| type | fixed `update_status` |

The signal wrapper carries the same signal parameter. One timestamp and one awaited graph append occur. No event observer or event append runs.

## appendCollectionRecord

It publishes exactly one graph record, then resolves without a result value. Outer routing runId is read first. Record own fields, in order: collection = the exact collection argument; recordType = `collection`; runId = current snapshot.runId before the clock; timestamp = next public timestamp() result. Then the wrapper with the same signal parameter and one awaited graph append. No event append/observer occurs.

## appendExpansionRecords

Use the caller's snapshot argument for routing; do not substitute expansion.snapshot. The expansion snapshot property is not consulted by this method.

Publication stages are strictly ordered and sequential:

| Stage | Observation |
| --- | --- |
| Nodes | Visit expansion.addedNodes in its array iteration order, including repeated entries; append/await one node record for each. |
| Edges | Only after the node stage completes, visit the then-current expansion.addedEdges in array iteration order; append/await one edge record for each, including repeats. |
| Collection | Only after all edges complete, call/await the public appendCollectionRecord with the same snapshot, the then-current expansion.collection reference and the same signal. |
| Expansion operation | Only after collection publication resolves, construct and append/await the final operation record described below. |

Array traversal observes ordinary live array-iterator behavior across awaits; do not pre-copy entries, freeze a length or start the edge stage early. A valid node appended to the iterated array during a port await is visible to continued traversal. Replacing the expansion's node-array property after that traversal starts does not replace the already selected iterator; the edge-array property is selected when its own stage starts. No sorting or deduplication is performed by this owner.

Each node record has own fields in order: node = current exact node reference; recordType = `node`; runId = snapshot.runId before the clock; timestamp = next public timestamp() result. Each edge record has own fields in order: edge = current exact edge reference; recordType = `edge`; runId = snapshot.runId before the clock; timestamp = next public timestamp() result. For each, the separate outer routing runId is observed before those fields, and the signal wrapper follows the record.

After the collection await, the final operation's outer routing runId is read before all record fields. Its own fields and evaluation order are:

| Field | Value at this point |
| --- | --- |
| collectionId | expansion.collection.collectionId |
| edgeIds | a fresh array mapping the then-current expansion.addedEdges through the existing edgeId dependency, in order, with repeats |
| nodeIds | a fresh array of id values from the then-current expansion.addedNodes, in order, with repeats |
| payload | a fresh object whose own fields are exhausted, plannerRuns, status, each read in that order from the then-current expansion.collection |
| phase | original phase parameter |
| recordType | fixed `op` |
| runId | current snapshot.runId, still before the clock |
| timestamp | next public timestamp() result |
| type | fixed `graph_expanded` |

These summaries reflect mutations made during earlier publication, not a cached pre-publication expansion view. The final clock comes after IDs, payload and runId have been observed; it does not retroactively replace their primitive values or arrays. Use `edgeId` as a dependency rather than reconstructing its body. The phase and signal are method parameters, not properties to read from snapshot or expansion.

With no mutation and ordinary default methods, N nodes and M edges cause N+M+2 timestamps and awaited graph appends: nodes, edges, collection, operation. An empty expansion still publishes the collection and operation. No event or observer call belongs to this method. Return no result after successful completion.

## emitEvent

The optional options argument defaults to a new empty object when omitted/undefined; do not change the public field types or add null-handling/validation. Construct one fresh event with these own fields, in this exact evaluation/insertion order, including all optional-valued keys even when undefined:

| Field | Observed value |
| --- | --- |
| kind | snapshot.kind |
| message | options.message |
| nodeId | options.nodeId |
| payload | options.payload by reference |
| phase | options.phase |
| runId | snapshot.runId |
| timestamp | next public timestamp() result |
| type | type parameter |

Kind, message, nodeId, phase and runId are observed before the mutation-capable clock. The payload reference is also observed before it; mutations to the referenced object remain visible. Do not construct the event from a post-clock snapshot or options copy. If the clock changes snapshot.runId, this event retains the previously read runId.

After event construction, invoke the captured appendEvent with that exact event and a fresh options wrapper whose sole own key is signal = **options.signal read after the clock**. Thus clock mutation of the shared options.signal affects this append even though earlier event fields have already been observed. An aborted signal is forwarded unchanged; this owner adds no cancellation check.

Await event append settlement. Only on success, invoke the optional captured onWorkflowEvent observer with the **same event object** and event-log receiver, then await its result. Mutations to the event or payload by the append port are visible to the observer; do not create a second event or restore earlier values. If the observer is absent, do not invoke anything, while retaining the awaited optional-observer settlement step. The method finally resolves without a result value. Replacing deps.onWorkflowEvent after construction does not replace the captured observer.

## Errors, sequencing and state boundary

All publication methods return Promises. Synchronous failures during their construction/clock work become rejections; append/observer rejections propagate the identical thrown/rejected value. Do not wrap/stringify errors, catch-and-continue, publish failure events, retry, roll back or advance later stages after rejection. A failed event append prevents observer invocation; a failed observer rejects after the already successful append. A failed node/edge/collection record prevents subsequent expansion stages. Earlier side effects are retained.

There is no abort inspection anywhere in this owner. Signal wrappers forward references and preserve own-key presence; no signal is synthesized or substituted. There is no batching, Promise.all, queued scheduling, extra clock, implicit snapshot update or cross-call cache. Concurrent invocations may interleave at native await boundaries; do not impose a new global serialization mechanism. Within one invocation, every required publication is awaited in order.

The class itself does not mutate snapshots, expansion arrays, node/edge/collection/payload objects or caller options. Clocks and supplied ports may do so as described. Preserve the existing public method dispatch and callback receivers without exposing private storage as a new API.
