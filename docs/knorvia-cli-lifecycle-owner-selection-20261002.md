# Lifecycle owner selection: bounded negative finding

Baseline: `ee8710e7b0a9b039eb12729d22823dbe3749b8ae`. This checkpoint adds
only this selection note and its digest receipt. No production, fixture, oracle,
selector, assertion or licence inventory changes. Strands stays inherited/unresolved;
may-set and settlement stay mixed/unresolved. No new freeze suite or behavioral run.

The selection order was callers/origin → paper design → decision. Accepted REPL,
browser, hook and executor slices, graph/settlement/strands, Host, runtime command
admission, storage and other lanes were excluded. This is not an exhaustive ledger audit.

**Runtime task registry** (`core/src/runtime-task/registry.ts`, 287 lines): active
callers are AgentRuntime, the subagent runner and tool contexts; its public surface owns
snapshots, message queues and terminal/background subscriptions. Existing
`task-output-retrieval.test.ts` exercises the real registry in a synthetic nonblocking
retrieval; that is not comprehensive subscription-lifecycle coverage. History contains
the initial snapshot and formatting; the historical inventory is upstream-modified,
unreviewed. Its pinned publisher blob is not in this local object store; no new remote
verification was attempted or inferred.

Paper candidate: replace the task map and two observer maps with one per-id entry
containing the snapshot and both observer groups. Re-registration must retain observers;
remove must detach terminal observers before background observers; publication must
detach a group before listener cleanup can reenter. `all()` must retain task insertion
order independently of subscriptions. In particular, a signal getter/listener can
remove or re-register an id while subscription admission is in progress. A single
snapshot-bearing entry alone loses the existing id-indexed observer behavior there.
Preserving that behavior needs detached entry handling or separate ordering/indexing,
undercutting the supposed simplification. Merely wrapping the three maps relocates the
same owner. **Reject this candidate; no substantive simpler design is demonstrated.**

**Workflow node publication** (`core/src/workflow/scheduler/node-runner.ts`, 259 lines):
`WorkflowGraphScheduler.run` dispatches it and awaits its attached `started` promise.
It commits activation before publishing started, links child sessions using the latest
snapshot, then publishes either an artifact/completed activity or an attempts/error
activity. Startup errors lie outside the execution catch; aborted execution errors
escape; failures during success publication can enter that catch. The inspected CLI
test paths did not provide a dedicated node-runner fixture. The historical inventory is
upstream-modified/unreviewed; the pinned publisher blob is locally unavailable.

Paper candidate: one invocation record and shared snapshot/publication operations for
activation, child linkage and terminal outcome. The common fields are already fixed
compatibility data. Factoring them retains the existing decision combinations; awaited
publication helpers risk adding settlement boundaries. A generator/operation framework
would add machinery to preserve an already direct await sequence. **Reject this candidate
without a freeze: no simpler substantive state/dataflow replacement is demonstrated.**

The larger `dynamic-workflow/src/engine/scheduler.ts` was also inspected as a follow-on
screen. Its active Engine caller depends on actor-sequence holds, replay/import cache,
lazy driver sessions, concurrency and journal-before-result settlement. No supported
fixture-backed simpler reconstruction was identified in this pass. Its pinned publisher
blob is locally readable; the receipt records hashes only, not a whole-file expression
or authorship determination. No scheduler implementation or policy change is proposed.

Current sources and discretionary prose were read, so source exposure is explicit.
These owners remain unreviewed; conventional Map/Promise operations do not establish
independence of their retained combinations. Missing local publisher objects are an
evidence limit, not a permanent rights barrier. Existing attribution/obligations remain.
The next concrete decision needs a justified lifecycle design or a fixture-supported
owner with substantive resource/cleanup/publication duplication; different bytes alone
are insufficient. This pass establishes neither a defect nor whole-file completion.

Verification is limited to exact current-source/baseline digest checks, bounded scope
and owned evidence formatting. Freshness and architecture context/check succeeded before
selection. No new tests, behavior/type/lint runs, build, broad suite, native acceptance,
real workflows/providers/data or runtime effects were exercised. Normal branch push is
not publication. [Digest receipt](evidence/knorvia-cli-lifecycle-owner-selection-20261002.json).
