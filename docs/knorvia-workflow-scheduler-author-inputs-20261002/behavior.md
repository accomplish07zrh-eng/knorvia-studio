# Workflow scheduler: behavior-only author contract

Implement the `WorkflowGraphScheduler` constructor and `run` declared in `api.d.ts`,
retaining its public exports. Read only this file, `api.d.ts`, `supporting-types.d.ts`,
`workflow-types.d.ts`, `dependencies.d.ts` and `inputs.json`. No predecessor source, tests, history, compiled
artifacts or curator notes are author inputs. Private representation and organization
are open; equal complexity and conventional idioms are acceptable. This is not a
new graph, collection, execution, approval, cancellation or persistence policy.

The owner schedules a run using existing dependency functions/classes. It does not
execute model/provider requests, read files, create OS processes or own durable data.
The collection planner, node runner/publication, graph queries, lifecycle repair and
event log remain separate existing owners. Call their declared interfaces; do not
reimplement them or add a second cache/state/notification/retry layer. The production
import bindings are in `inputs.json`; projected imports may be rebound after authoring.

## Construction and invocation

- Capture the supplied createActivityId function, create one dependency event-log
  instance from the same deps, then capture plannerRunner, runner, writeArtifact and
  writeSnapshot. Captured ports retain identity; later replacement on deps is not
  observed. Event-log construction retains its existing port-read/receiver contract.
  No event, clock, write, run or approval effect occurs merely on construction.
- Each invocation has its own evolving snapshot, executable scope, pending-node
  lifetimes, error accounting and frontier observation history. Concurrent calls on
  one scheduler share captured ports/event log but do not share run-local state.
  Callback continuations can interleave across runs; there is no global publication
  mutex. Same input objects/nested metadata are not normalized or cloned by this owner.
- A supplied executableNodeIds iterable is consumed into a unique ordered scope;
  otherwise take graph node ids. Explicit empty scope stays empty. Unknown ids remain
  in scope but do not create nodes. Added planner ids join scope in returned order.
- Before the first abort check, call resume repair with this scope, resetPhases false
  and one event-log timestamp. Adopt its exact snapshot even when unchanged. If repair
  changed it, await writeSnapshot with the original signal and scheduler as receiver.
  Repair, clock or write errors reject unchanged; no scheduling event follows.
- From the repaired snapshot capture concurrency and consecutive-error limits, each
  with minimum one. They are not recomputed from later snapshot changes. No scheduler
  schema validation, type coercion policy, deadline or implicit stop is added.

## Scheduling opportunities and publication

At each opportunity, check abort first, then await the collection-planner dependency
with current snapshot, the same scope/options and a fresh runtime-port projection.
Adopt its exact returned snapshot, admit its added ids, and reset frontier observation
history when plannersRan is greater than zero. No plannerRunner is required for ordinary
nodes. Collection admission/limits/errors stay in that dependency, including its no-op
path without a planner. This owner does not merge an older snapshot over its result.

Next publish a changed frontier before deciding completion, threshold pause, dispatch
or deadlock. Its ordered payload fields are activeNodeIds, blockedNodes, readyNodeIds.
Ready and blocked arrays come from their declared graph-query dependencies; active
ids follow current graph order and require membership in scope and status active.
First frontier is published even when empty. Equal ordered payload values suppress
subsequent publication, except for the reset after an actual planner pass. There is
no phase or nodeId option on this frontier event. Await the existing event-log call.

Completion has priority over threshold pause: completion requires the graph-query
predicate and no pending-node lifetime. Pass planner presence as waitsForCollections.
Await executor_completed, then return the exact current snapshot. Do not add a final
abort check after an accepted terminal event. The scheduler result has only reason,
snapshot and status, in that field order.

If observed consecutive failures reached the captured limit, first await all remaining
pending outcomes together. Do not update error accounting from these drain outcomes,
roll back their callback effects or recheck graph completion after draining. A rejected
drain rejects unchanged and does not emit executor_paused. Successful drain is followed
by executor_paused and the current snapshot with reason error_threshold/status paused.

Otherwise obtain ordered ready nodes through the dependency and omit ids whose node
lifetime is still pending. Admit in that order up to the captured limit. Each admission
calls runWorkflowNode once with a live snapshot-access port, exact selected node/options,
captured error limit as maxAttempts and a fresh runtime-port projection. The access port
returns current snapshot by identity and adopts/returns each setter input unchanged.
Register the returned lifetime before awaiting its native started gate; adopt started's
exact snapshot before admitting the next node. Startup gates serialize admission while
node execution overlaps. Settled but unobserved lifetimes still occupy slots. Do not
clone nodes, merge returned snapshots, coerce thenables or add async wrapper settlements.

After any admission, perform another scheduling opportunity before observing a pending
outcome. If no admission was possible but lifetimes remain, observe native race semantics
over them in admission order. Retire the returned nodeId; reset consecutive failures
on an ok outcome or increment by one otherwise. Outcome.snapshot is not an alternative
write owner: the live access port/started gate have already established current state.
Errors from the race reject unchanged. With no pending lifetime and no admission,
publish blocked diagnostics from the dependency and return deadlock/status paused.

## Fixed output and dependency effects

| Event                        | Required options and return                                                                                                      |
| ---------------------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| frontier_changed             | message `Workflow scheduler frontier changed.`, ordered frontier payload, original signal; no phase/nodeId option                |
| executor_completed           | message `<phase> scheduler completed.`, phase and original signal; return reason completed/status completed                      |
| executor_paused at threshold | message `<phase> scheduler paused after <count> consecutive node error(s).`, payload `{consecutiveErrors: count}`, phase/signal  |
| executor_paused at deadlock  | message `<phase> scheduler paused because pending nodes are blocked.`, payload `{blockedNodes: dependency result}`, phase/signal |

Fresh node/planner runtime projections carry the captured createActivityId, shared event
log, respective runner and writeArtifact/writeSnapshot references. Existing dependencies
retain their receivers, clocks, awaited effect order, public strings and snapshot writes.
Do not bind these functions to deps or introduce another event log. The scheduler's
direct repair write uses its own receiver; dependency effects use their existing runtime
or event-log receivers. Snapshot writes/journals/event callbacks are awaited where they
already belong; there is no scheduler-owned task termination or output publication.

## Errors, abort and known limits

Abort checks reject the exact reason when it is an Error; otherwise use a new Error with
message `Workflow scheduler aborted`. Signal/options are forwarded unchanged. There is
no abort listener or abort-vs-port race in this owner. An abort during a pending node
race or threshold drain waits for those dependency promises to settle. A port that ignores
the signal can finish and publish node metadata; the next scheduling opportunity then
rejects the abort reason. An already accepted executor_completed event still returns
success if an abort is queued during that publication. Earlier frozen node-completion
abort rejects at the next opportunity, retaining completed node metadata without an
executor_completed event. Do not choose a new settlement/cancellation policy.

The existing node runner's startup failure can leave started pending even though its
outcome rejects. This owner adds no timeout or repair for that dependency limitation.
Rejections can leave other node lifetimes running; do not add cleanup joins, retries,
notification, rollback or cancellation. Port callback/clock/getter errors remain exact
and partial writes/events remain visible. Arbitrary hostile object/getter equivalence
is not established by the bounded ordinary-record observations.

## Evidence boundary

Inputs include executed new scheduling/caller observations and reused historical
success/error-threshold/node-completion-abort facts, labeled separately. Additional
port-read, graph-helper-call and already-settled race rules above are source-derived
functional facts, not a new exhaustive suite. The curator read the predecessor and
callers. Declarations, type vocabularies and fixed runtime prose are retained material;
old explanatory prose and executable bodies are excluded. No absolute clean-room,
contributor-rights, whole-file originality or MIT conclusion is authorized.
