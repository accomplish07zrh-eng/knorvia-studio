# Renderer telemetry lifetime and bounded delivery

Continue after renderer startup commit
0af60602c632b39c75cfc3a56e38a88ca9a163b0 on the same native branch/PR17.
Select the complete userActionTraceBootstrap.ts and localTtftBootstrap.ts.
They match exact UI handoff662b and existing upstream-modified source records,
with no accepted complete replacement. The actual UI trace/TTFT collectors,
schemas and preload IPC stay retained; do not rewrite them or activate these
currently unused renderer exports in main. Fixed resources/batch data are
qualified compatibility expressions, not authorship/rights clearance.

```mermaid
sequenceDiagram
  participant Caller
  participant Lifetime as Renderer lifetime
  participant Observer as Existing collector
  participant Queue as Bounded TTFT delivery owner
  participant Preload
  Caller->>Lifetime: initialize with current platform
  Lifetime->>Observer: construct and publish existing collector
  Lifetime->>Preload: initial config and live config subscription
  Observer->>Queue: finished record
  loop each 1000ms
    Lifetime->>Observer: sampleClock then expire
    Queue->>Preload: FIFO batches <=32, cap128, sequence/dropped
  end
  Caller->>Lifetime: release
  Lifetime->>Observer: interrupt TTFT; flush before detach
  Lifetime->>Preload: dispose config subscription
  Lifetime->>Observer: clear published collector
```

## Trace lifetime

One private lifetime owns the published RendererUserActionTelemetry instance,
pagehide callback and config disposer. Before any UUID/collector creation,
capture platform sendBatch and getConfig in that order. If either is absent,
publish null and return no-op. Preserve captured bare receiver calls for these
two functions, while config subscription retains platform receiver/live lookup.
UUID, disabled initial config, service/version/environment/resource fields and
send wrapper stay exact; publish telemetry before starting config retrieval.
Promise resolution applies config, rejection applies disabled config; synchronous
getter or subscriber errors still propagate without invented cleanup.

Register pagehide once; it invokes shutdown without detaching global telemetry
or config subscription. Explicit release removes pagehide, invokes config
disposer, publishes null then invokes shutdown, in that order. Preserve existing
repeat-release/pagehide-plus-release observations, synchronous throw boundaries
and unawaited shutdown promises. Late config results still reach the captured
instance after release; do not silently add a stale-result policy to the contract.

## Local TTFT

One delivery ledger owns the pending FIFO, queue length, dropped counter and
next sequence. A linked FIFO can express capacity and detached batch ownership
without the inherited array-splice queue. Admission at >=128 drops the new
record and increments dropped; keep raw record references and arrival order.
Dequeue at most32 before each publication. Queue capacity becomes available before
the synchronous callback, so reentrant record offers/flushes observe the same
budget. Preserve reentrant publication/drop-reset and callback-throw semantics.

Every flush first invokes observer.sampleClock then observer.expire; their errors
propagate outside send handling. While records exist, detach a batch, then inside
try perform a live platform.reportLocalTtftBatch optional call with platform
receiver. Packet order/data remain version1, rendererInstanceId, sequence++,
records, dropped. A missing live method does not evaluate packet arguments or
increment sequence, but the detached batch is still discarded and dropped reset
to0. Synchronous send failure adds detached length to live dropped; continue
remaining batches without retries/reordering. Asynchronous send results remain
unobserved. Reset dropped after each successful/absent call, including existing
reentrant callbacks, and never reset sequence during disposal.

Keep initial capability check, UUID then LocalTtftObserver callback/undefined
arguments/foreground predicate. Publish observer before initial config request.
Only strict localTtftEnabled true enables collection; config rejection is ignored.
Both config calls retain live platform receiver. Late config still applies to
the old instance. Install config subscription, initial background check, blur,
focus and visibility listeners, then 1000ms timer in the existing order.
Foreground requires visible document; background has no extra guard. Initial
background reads hasFocus before visibility; record predicate reads visibility
before hasFocus. Existing UI observer remains authority for clock/expiry/input.

Release calls interrupt then flush, clears pending FIFO, clears timer, config
disposer, published observer and blur/focus/visibility listeners in that order.
Do not add idempotent cancellation, catches, pagehide flush, new timers or a
second global collector. No UI/data/native/preload/schema/interface change.

## Deferred evidence

Same source-exposed author and pending full expression/rights/MIT decision.
Freeze complete drafts before source diff. Author two focused supplied-collector,
preload/clock/event scenarios; none or the fixture executes in this phase.
No tests, lint, types, build, format/architecture checks, full audit or native IO.
Final integration owns actual collectors/schema/privacy/heap/config/IPC consumers,
late result and pagehide/release combinations, and source/license reconciliation.
