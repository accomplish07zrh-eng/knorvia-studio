# Event-log primitive owner: behavior-only author contract

Author constructor, timestamp, appendGraphStatus and emitEvent for WorkflowSchedulerEventLog.
Public signatures and types are the four exact declaration references in packet.json;
no type-file regeneration is needed. Read only this contract, inputs.json, packet.json
and those four declarations. Implementation/history, compiled oracle, tests and curator
handoff are excluded. Private organization is author choice, subject to the retained
collection integration seam below. Do not implement collection planning or execution.

Constructor captures appendEvent, appendGraphRecord, now and onWorkflowEvent once, in
that observable read order, from the supplied deps. Captured function references are
not rebound to deps; each invocation's receiver is the EventLog instance. Subsequent
dependency replacement is not observed. Constructor calls no clock, append or callback.
A throwing dependency read propagates synchronously without reading later ports.

Timestamp calls the captured clock once with that receiver, then calls the returned
Date's toISOString with the Date as receiver. Return its string synchronously. Propagate
clock/formatting errors unchanged; do not normalize, cache, clone or supply another clock.

AppendGraphStatus and emitEvent obtain time through the public timestamp method;
do not bypass its dispatch with a separate clock path. Every appendGraphStatus
invocation makes a fresh record and a fresh settings object.
Call the captured appendGraphRecord with exactly runId, record, settings, with the
EventLog receiver. Record own fields, in order:

| Field      | Value              |
| ---------- | ------------------ |
| nodeId     | supplied nodeId    |
| phase      | supplied phase     |
| recordType | `op`               |
| runId      | snapshot.runId     |
| status     | supplied status    |
| timestamp  | one timestamp call |
| type       | `update_status`    |

Settings has exactly the own field signal, containing the original signal even when
undefined or already aborted. No owner admission/abort check, listener, retry or deadline.
Construct/clock/append effects occur synchronously before the first await. Await the
append result natively, including an already fulfilled result; method resolves undefined.
Synchronous clock/append throws become exact rejected method promises. Rejection propagates
unchanged, with no callback, rollback or compensating publication.

EmitEvent defaults options only when omitted/undefined. It makes a fresh event with
exact own field order kind, message, nodeId, payload, phase, runId, timestamp, type.
Kind/runId come from snapshot; message/nodeId/payload/phase from options; timestamp is
one clock call; type is supplied. Optional fields remain present with undefined values.
Payload retains identity. Make fresh settings with own signal from options.signal.
Call captured appendEvent(event, settings) with EventLog receiver, then await its result.
Only after that settlement invoke captured callback(event), if present, with the same
receiver and exact event object. Await the callback result **even when the callback is
absent or synchronously returns undefined**. Method returns undefined after this distinct
native boundary; do not collapse the two awaits, return a port promise directly or add
awaited wrappers. Exact append errors skip callback; exact callback errors reject after
the append remains visible. No error wrapping/classification/repair or post-append abort.

Calls are independent, with no shared queue, durable state or cache. Two appends begin
before either pending append settles. Callback/completion order follows each append's
settlement rather than invocation order. Captured ports are shared but events/settings
are fresh per call. Tests use native promises; preserve native await of port results.
No arbitrary hostile accessor/thenable equivalence claim is established by these cases.

AppendCollectionRecord and appendExpansionRecords stay byte-preserved dependency members
in this class, not author work. Root combines them after authoring closes. Their existing
integration uses the captured function under instance property appendGraphRecord and the
public timestamp method, both invoked with EventLog receiver. Preserve this private port
name/reference seam; it is constrained compatibility glue. Their bodies/edge-id helper
are excluded, and their public declarations remain unchanged. Do not change their effects
or transfer them to another owner merely to complete a file metric.

Inputs are synthetic executed observations; older scheduler/node-publication observations
are reused, not rerun. Additional read/error/native-await requirements are source-derived
functional facts. Curator saw source/callers. Fixed APIs, record vocabulary and declaration
expression are retained material; no absolute clean-room or licence grant is authorized.
