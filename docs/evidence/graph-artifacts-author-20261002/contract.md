# Author contract: phase artifacts to graph publication

Author the complete two-entrypoint owner from this contract and `api.d.ts` only.
Do not inspect predecessor source, tests, history, compiled artifacts or repository
files. Save one full replacement `draft.ts` at the instructed temporary path, then
report its SHA256 and byte count before curator comparison. Private representation
is yours; no framework, retry, rollback, new validation or permission policy.
Ordinary idioms need no novelty. These are source-derived functional requirements,
not an absolute clean-room boundary or licence determination.

## Entry admission and dependency roles

Both public functions are native async functions. Their synchronous work starts
before the returned promise is observed. They neither inspect nor throw from
AbortSignal themselves; pass exactly the supplied signal to every effect. Errors
from dependencies, clocks or effects reject unchanged; prior effects remain.

Seed entry: absent/falsy `definition.seedGraphFromArtifact` returns the input
snapshot by identity, with no dependency/effect/clock. Otherwise capture its
targetPhase and call parseWorkflowGraphSeed(response,targetPhase). Null or both
empty nodes and collections return input identity without clock/write, even if
edges exist. If the configured gateAfterPhase is truthy, pass seed through
gateRootSeedNodes(seed,phaseNodeId(gateAfterPhase)). Apply the resulting seed via
applyWorkflowGraphSeed(snapshot,{seed}, options) using the actual signature in
api.d.ts; options field order is phase then timestamp, with one ctx.timestamp()
call. A false changed result returns the original input identity, without writes.
The existing dependencies own parsing, validation, identities and graph policy.

Prompt entry: absent/falsy nodePromptsFromArtifact returns input identity. Capture
targetPhase and call parseWorkflowNodePromptUpdateSet(response). Null or zero
updates return input identity without clock. Apply updateSet.nodes through the
existing prompt dependency with phase then timestamp options (one clock). If
changed is false return input identity, without writes.

## Accepted publication

For either changed result, first invoke ctx.store.writeSnapshot(applied.snapshot,
{signal}) and await it. Return that same applied snapshot after all publication.
Each effect resolves its method at invocation time; ctx methods receive ctx and
store methods receive the current ctx.store as receiver. Do not capture store
methods across waits. Every {signal} object owns the signal key even if undefined.

Seed publication then journals each added node, each added edge and each added
collection in their supplied orders, with each append separately awaited. Members
in records are original references from the dependency result. Next append and
await one graph_seeded operation. Terminal event follows a native asynchronous
journal-drain completion boundary in addition to the individual append awaits.
Do not merge that boundary with the terminal event or add another entry wrapper.
The seed journal's phase value is captured from definition.phase only after the
snapshot write settles, before any journal append. Later definition mutations
must not change that journal phase. The terminal event reads current definition
phase/title after journal completion; targetPhase remains the admission value.

Prompt publication directly awaits one node_prompts_updated operation then directly
awaits its terminal event. It does not have the seed journal-drain boundary.
Each publication payload is projected at its publication time, not prepared before
the snapshot write or an earlier append. Later IDs/runId/definition values may be
changed through plain objects passed to owned ports. Each record obtains its own
clock; no clock is called for the terminal ctx.appendEvent call by this owner.
No catches, rollback or deduplicated publication. Calls have independent locals.

## Ordered record/event fields

appendGraphRecord first argument is current applied snapshot.runId. Then the
record object is evaluated left to right. Last argument is {signal}.

- Member records: own member key (`node`, `edge`, or `collection`), recordType
  (same member name), runId (current snapshot.runId), timestamp (new clock).
- Seed op: edgeIds (addedEdges mapped through edgeId), nodeIds (addedNodes IDs),
  payload {collectionIds (addedCollections IDs), sourcePhase (captured journal
  phase)}, phase (captured journal phase), recordType "op", runId, timestamp,
  type "graph_seeded".
- Prompt op: nodeIds (updatedNodes IDs), payload {sourcePhase (current definition
  phase), targetPhase}, phase (current definition phase), recordType "op", runId,
  timestamp, type "node_prompts_updated".
- Seed event: ctx.appendEvent(current snapshot.runId,"graph_expanded",options).
  options: message `Workflow graph seeded from ${definition.title}.`, payload
  {collectionIds,edgeIds,nodeIds,sourcePhase,targetPhase} projected anew in that
  key order, phase (current definition.phase), signal.
- Prompt event: ctx.appendEvent(current snapshot.runId,"graph_updated",options).
  options: message `Workflow node prompts updated from ${definition.title}.`,
  payload {nodeIds,sourcePhase,targetPhase}, phase, signal; all IDs/phase/title
  read anew when publishing. Both event calls are awaited.

These exact strings, keys and dependency/API declarations are retained compatibility
material. Preserve them without treating verbatim runtime vocabulary as authorship.

## Executed predecessor observations

Owned native-resolved write/append/event ports, one node/edge/collection:
write starts synchronously. With a recurring queueMicrotask beacon scheduled after
attaching the outer completion handler, seed trace is clock+write at tick0,
node append tick0, edge tick1, collection tick2, op tick3, event tick5, outer
resolution tick7. Prompt trace is clock+write tick0, op tick0, event tick1,
outer resolution tick3. Invalid seed and edges-only seed resolve at tick0 without
clock/effects, including an already-aborted signal. Do not infer a new timeout.

A node append port changes its node.id to N-late, snapshot.runId to late-run,
definition.phase to late-phase and title to Late title. Subsequent runIds and
terminal IDs/title use these values; op phase stays plan and event phase becomes
late-phase. Original gate edge remains phase:plan->N. Snapshot and member identities
are shared. Prompt updates retain original edges/collections/unmatched nodes;
repeating the same update returns the already-updated input with no write.

An append throw after a successful write rejects that same error even when the
port aborts the signal. No terminal event follows. Event rejection leaves writes
and journal effects intact. A throwing then getter returned by write rejects
unchanged before any append. Delayed write blocks only its own publication;
another invocation can finish independently.

Actual compiled continueRun caller, with owned phase execution/context ports,
awaits seed then prompt updates. A response carrying newNodes N/collection K plus
nodePrompts for existing A causes two writes, graph_expanded then graph_updated;
returned snapshot is the second written object, and N is shared across writes.
