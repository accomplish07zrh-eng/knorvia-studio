# Event-log owner integration

Scope: install E's exact frozen WorkflowSchedulerEventLog author candidate into its existing scheduler/events.ts owner. This is a local E contribution, not a merge of another lane. The behavioral authority is the already frozen [event-log contract](../docs/evidence/event-log-author-packet-20261002/contract.md) and [public API](../docs/evidence/event-log-author-packet-20261002/public-api.d.ts). Preserve those observations and do not add new product behavior.

The event log remains the sole owner of captured publication callbacks and clock formatting. Scheduler callers pass snapshots and shared records; append ports and the optional observer own external publication effects. Existing contract, graph-helper and scheduler-type imports remain unchanged. Architecture policy assigns this file to the legacy `cli` module; no module/dependency/layer change is introduced.

Required ordering: read outer routing runId, construct record with its own runId before the mutation-capable timestamp, then invoke/await the captured append port. Expansion publishes live nodes, live edges, public collection delegation, then current summaries. Event publication constructs metadata before the clock, reads the signal afterward and awaits the same-event observer only after append success. Error identity and partial effects are preserved.

Private storage follows the frozen author's ECMAScript private fields; unsupported reflection, direct private-field tampering and borrowed-method private-brand behavior are not promised compatible. Public API and ordinary typed caller behavior remain required.

Acceptance is staged: bind exact frozen bytes to the integrated descendant and statically compare public declarations/imports. Existing static ordering review applies because integration changes no draft byte. Under the user's speed cadence, do not repeat source/emitted matrices or run full tests, lint, broad typecheck or builds. Final runtime/consumer acceptance is deferred to root's later acceptance branch. Integration does not alter global licensing inventories or claim blanket MIT readiness; retain the clarified bounded contribution assessment.
