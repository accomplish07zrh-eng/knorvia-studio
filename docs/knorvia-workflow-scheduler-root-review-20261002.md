# Supplied scheduler fragment: independent review

Hold runtime acceptance: the supplied fragment changes the first active-snapshot write's
ordering relative to a queued abort. This is a supported synthetic-port counterexample,
not a proposed new cancellation rule. No production, historical artifact, packet,
assertion or selector changed. Only this report and its receipt are lane deliverables.

The extracted fragment is exactly **6,874 bytes**, including final newline, SHA256
`1852279ec92d8b45193bbd297d34901013624eebfed6fdb9e659ec0f1771c5dc`.
Reviewer baseline is clean `af8f2b214eb84d871465108ecb2b5281221b5e2a`.
Root reports authoring closed after the six packet inputs, curator handoff and previous
consumer observations, before reading predecessor implementation/tests/history bodies;
subsequent import/re-export rebinding and formatting preserved complete class semantic
syntax. Root's local `dcdfb21`, compiler, 7/7 source and 7/7 emitted groups, actual
scheduled-phase consumer, lint and architecture results are **parent-reported**. This
review neither fetched nor adopted the root integrated source.

## Reproduced timing blocker

Use the existing owned `node`, `snapshot`, `ports` and native `gate` fixtures. Input is
one pending task `a`, normal scheduler limits, no plannerRunner, original AbortSignal
and a held runner promise. On the first frontier callback, delegate the original
callback and queue abort through three nested microtasks. Observe `settings.signal.aborted`
inside the first active-snapshot write, without rejecting that write or changing policy:

```ts
const p = ports(snapshot([node("a")]));
delete p.deps.plannerRunner;
const reason = new Error("Owned frontier edge abort");
const held = gate<typeof p.result>();
p.hooks.run = () => held.promise;
const callback = p.deps.onWorkflowEvent!;
let first = true;
p.deps.onWorkflowEvent = function (event) {
  const result = callback.call(this, event);
  if (event.type === "frontier_changed" && first) {
    first = false;
    queueMicrotask(() => queueMicrotask(() => queueMicrotask(() => p.controller.abort(reason))));
  }
  return result;
};
```

Wrap the original write with `.call(this, value, settings)` to record signal state,
identity and receiver; run each owner independently with fresh fixtures. Both reject the
exact `reason`. After owner rejection, resolve the held runner and flush its ordinary
native continuations: node completion metadata remains visible, with no
executor_completed event. Ports and all data are synthetic; no storage/model call.

| Observation                                          | Exact predecessor                     | Supplied fragment  |
| ---------------------------------------------------- | ------------------------------------- | ------------------ |
| First active write's original signal is aborted      | true                                  | false              |
| Abort relative to first activity/clock/write effects | before those effects                  | after active write |
| Receiver and signal reference                        | existing runtime / original signal    | same               |
| Owner rejection                                      | exact abort Error                     | same               |
| Completion after releasing held port                 | completed node; no executor_completed | same               |

The exact historical compiled loader and actual current predecessor agree; the supplied
fragment differs in **both source and actual-emitted dependency modes**. The compatibility
assertion fails with ERR_ASSERTION in each mode; the proof catches and records that
expected counterexample, so its exit zero must not be described as compatibility passing.
The original assertions/oracles are untouched.

Cause: predecessor `run` awaits its async frontier decision helper, which itself awaits
changed-frontier publication. The fragment awaits publication directly and loses one
native settlement continuation; it also skips the predecessor's frontier-helper yield
when suppression applies. Root should preserve that settlement boundary, including the
suppressed path, then recheck this counterexample. This review supplies no runtime fix.
Always awaiting an empty threshold drain is another static timing difference; no separate
supported defect is established for that path here.

## Bounded comparison and expression

Independent strict TS 6.0.2 compile has zero diagnostics. Constructor/run public shapes
match packet, predecessor source/declaration and compiled fragment declaration. The raw
fragment exports seven extra packet helper **types**: AppliedPlannerExpansion,
NodeRunOutcome, NodeRunStarted, SchedulerCollection, WorkflowGraphRecordEdge,
WorkflowGraphSchedulerSnapshotAccess and WorkflowSchedulerNodePromise. These disappear
from runtime JS; final production module re-exports must remain the predecessor's API.
Root's production rebinding is reported, not independently inspected here.

Static inspection preserves native lifetime registration before started, serial startup
admission, captured limits, settled-but-unobserved slot ownership, native race order,
returned-id retirement and success-reset/failure increment. Shared event log/captured
ports and per-invocation snapshot/scope/lifetime/error/frontier state remain distinct.
The single per-run snapshot-access projection is compatible with actual node-runner
consumption. Planner-added scope and frontier reset, completion-before-threshold priority,
drain outcome accounting, error propagation and direct/runtime/event-log receivers are
structurally preserved. None of these findings override the reproduced timing blocker.

One focused single-node node-completion abort scenario at eight adjacent queue positions
has identical ordered traces, errors/results and metadata in emitted mode. A first-frontier
scenario at four nearby positions exposed the counterexample at position three and a
relative effect-order difference at four. The selected position-three proof then checked
source and emitted modes; its emitted position overlaps the diagnostic. These are targeted
reviews, not new seven-group suite passes, concurrent-run coverage or broad hostile-input
coverage. No full suite/build or native/platform acceptance ran.

Parsed node boundaries find **zero comments** in the fragment, including boundaries after
templates. There is no copied discretionary explanatory commentary to remove. Exact
retained/constrained expression includes public type/name vocabulary, event/status values,
four scheduler event messages, abort Error prose, constructor capture order and five-field
runtime port projections. Set/Map, Math.max, native Promise race/all and ordered loops are
ordinary contract-constrained idioms. The scheduling decision sequence resembles the
functional contract; resemblance alone neither proves copying nor establishes authorship.
No unexplained discretionary prose was found, and no whole-body/file rights conclusion
is made. Root's restricted-input chronology remains parent evidence; curator source,
caller/helper and historical-artifact exposure is explicit. Applicable attribution and
contributor/notice obligations remain; no header, registry or MIT grant.

Two temporary review-loader failures were preserved: resolving the ESM-only contracts
package through the workspace root (MODULE_NOT_FOUND), then through CJS require at core
(ERR_PACKAGE_PATH_NOT_EXPORTED). The final bridge uses the package's declared existing
ESM dist entry; source/emitted scheduler dependencies remain exact-pinned. No settings,
access or production correction occurred.

[Digest-bound receipt and preserved proof references](evidence/knorvia-workflow-scheduler-root-review-20261002.json).
