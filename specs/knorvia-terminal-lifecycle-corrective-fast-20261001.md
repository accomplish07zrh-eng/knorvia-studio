# Corrective terminal lifecycle checkpoint

Append to immutable e00c9e70e91d446e780b177c6f403fb27fbddb62 on the same fixed lane,
parallel/file-watcher-fast-20261001. Root reviewed the proved defects and explicitly
requested correction; the user's full-project authorization permits these fixes without
another confirmation. Preserve the original commit, defect spec/handoff and baseline logs.
Live regression assertions for those approved edge corrections will be updated explicitly;
no test is skipped/removed or weakened to preserve a defect. New failing regression cases
are committed before implementation. No other conversation/agent or integration writer.

Source-exposed work: inherited service/RPC source and the preceding owner were read. No
clean-room, whole-file independence, license relabeling or MIT assertion. LICENSE/NOTICE,
preview identity and 27 material obligations remain. Root alone updates shared provenance.
Public terminal.ts, launch planner, profiles, both planning interpreters and lazy native-load/
helper permission functions stay unchanged. New lifecycle admission guards can stop a
cancelled create before those IO boundaries; their implementations are not rewritten.
Freshness uses --no-fetch/cached refs; only the authorized lane-branch push uses network.

## Single owner and timing

TerminalServiceInstanceOwner owns one Map of reservations/resources, a monotonically
increasing ID sequence, a create generation and its diagnostics registration. No second
accepted queue/Map. Each reservation owns any allocated emitters, returned PTY and returned
native IDisposable subscriptions until teardown succeeds. Public lookup admits only
published entries; unpublished retryable PTYs remain owned for disposeAll and diagnostics.
Diagnostics terminal.open counts all known live PTYs, including failed setup/kill entries.
Factory registration remains immediate. Bulk disposal unregisters only after all owned
resources are gone; failed cleanup keeps registration. A later create re-registers diagnostics
and remains legitimate service reuse. Registry latest-provider semantics are unchanged.

```mermaid
sequenceDiagram
    participant Caller
    participant Owner
    participant Launch as Unchanged launch/profile/native adapters
    participant PTY as Fakeable PTY
    Caller->>Owner: reserve ID and current generation
    Owner->>Launch: existing planning/settings/lazy loading
    Note over Owner,Launch: bulk disposal advances generation; pending create checks after awaits
    Launch->>Owner: allocate emitters then adopt returned PTY
    Owner->>PTY: attach data then exit; retain each returned subscription
    PTY-->>Owner: possible synchronous exit
    Owner->>Owner: mark exit before notifying, retire all resources in finally
    Note over Owner: exited/cancelled reservation cannot publish
    Launch->>Owner: metadata ready, publish if still current and live
    Caller->>Owner: dispose / disposeAll
    Owner->>Owner: mark kill in progress before calling native port
    Owner->>PTY: kill at most once per successful retirement
    Note over Owner,PTY: reentrant dispose is inert; a thrown kill stays tracked for retry
    Owner->>Owner: attempt every emitter/subscription cleanup and every snapshot entry
```

## Deliberate corrections and preserved contracts

- Creation consumes decimal IDs before planning as before. Its lease exists before awaits;
  failed planning/profile/loading releases that lease. Settings fallback, shell/cwd/env,
  profile/theme identity, dimensions, normal return shape and error wording stay unchanged.
- Metadata is completed before publication. Synchronous native exit rejects create with
  Terminal exited during startup: <id>, retires resources, never publishes, and never kills
  an already exited PTY. Metadata failure kills/retires the unpublished PTY instead of
  rejecting while leaving an unreachable published instance.
- disposeAll advances the create generation before external cleanup. Older pending creates
  reject Terminal creation cancelled: <id> when control returns, before profile/load/helper/
  spawn wherever an intervening guard can prevent IO. An unabortable pending settings/module
  promise is not forcibly terminated; no native PTY is spawned after the next guard. If a
  fakeable spawn already returns after reentrant bulk disposal, the owner adopts and retires
  it, preserving a failed kill as unpublished retryable ownership. No callback can republish.
- New creates admitted after the bulk boundary remain allowed and outside that snapshot,
  including reentrant/asynchronous legitimate reuse. No permanent closed-service flag.
- Native exit marks termination before event dispatch, suppresses duplicate/reentrant exit
  notifications, and completes resource cleanup even if a listener throws. Ordinary emitter
  listener order, snapshot mutation semantics and exception propagation remain unchanged.
  During ordinary exit notification, existing published lookup still admits the terminal;
  cleanup removes admission afterwards. Data after termination/retirement is ignored.
- Caller dispose marks kill in progress before native kill; reentrant/repeated calls cannot
  kill twice. A successful kill or observed exit ends PTY ownership; late callbacks are inert.
  A known pending ID can be disposed to cancel that lease alone, without closing the service.
  Native kill success is treated as accepted termination, as with the existing port contract;
  this does not prove OS process termination/native acceptance. A thrown kill without an
  observed exit leaves the PTY tracked and retryable. Emitters/subscriptions still retire;
  retiring IDs reject write/resize/new subscriptions but accept dispose retries. If exit was
  observed even though kill throws, preserve the error and retire without another kill.
- Spawn/emitter/listener setup failures release every acquired resource. Returned subscriptions
  are disposed, including one returned after a synchronous exit. A registration that throws
  before returning a handle provides no unsubscribe port; successful kill plus guarded late
  callbacks is the safe boundary. Failed kill remains owned until dispose/disposeAll retry.
- Resource cleanup detaches ownership before calling disposers to prevent reentrant duplicate
  disposal. Every disposer is attempted. A throwing disposer is retained for retry; no failed
  subscription or emitter is silently dropped. Dead resources with failed cleanup remain
  owned (terminal.open may be zero), keeping diagnostics registered until retry succeeds.
- disposeAll snapshots all owned entries, attempts all, and preserves errors in iteration
  order. It never stops at the first failure. Reentrant calls cannot duplicate an active kill.
- Unknown IDs and repeated completed disposal remain no-op; unknown write/resize reject exact
  Terminal not found: <id>, subscription lookup throws synchronously. Preserve ID lookup
  before payload/dimension getters and existing real Emitter snapshot behavior. No list API.

## Error precedence

An operation/setup/listener error precedes cleanup errors. On admission guards, an advanced
create generation takes cancellation precedence over an exit observed during bulk cleanup;
a synchronous natural exit in the same generation retains the startup-exit error. If only one error occurs, throw
that exact value/object. Multiple errors produce AggregateError with errors ordered primary
first, then data emitter, exit emitter, returned subscriptions. The aggregate message keeps
primary wording and cause identifies the primary error. Bulk aggregates use Failed to dispose
all terminals and retain each per-entry error in snapshot order; a single failure remains
its original value. No hidden catch/log-and-forget and no new retry timers/timeouts. Native
exit cleanup runs even if listener notification fails; nested completed cleanup does not
repeat disposers. RPC's unchanged error serializer exposes name/message/stack, not nested
AggregateError.errors; all details remain available locally to host callers. Do not alter RPC
or public declarations to broaden this checkpoint.

## Acceptance and boundaries

Add intended-behavior tests first, run against unchanged e00c9e7 source/emitted and record
expected failures. Then implement and update only old assertions whose behavior is explicitly
corrected above; historical e00c9e7 evidence and old spec/handoff remain immutable. Exercise
source/emitted actual service and binary in-memory RPC consumers, resource counts, disposal
handles, simultaneous and nested errors, pending create/bulk races, retry, reuse and diagnostics.
Run immutable planning/profile regressions, root types/lint/format, changed/full architecture,
CLI/desktop builds and full final studio regression with unchanged isolation/timeouts/security.

All PTY/process/fs/access/chmod/settings/profile ports are fake; only curated synthetic env
and owned fixture paths, with NODE_TEST_CONTEXT as the sole inherited env marker. No actual
apps/processes/PTYs, user profiles/logs/credentials/account data, OS permissions/settings/security
changes, network shares or outbound requests during validation. Native Linux/macOS/Windows,
packaged runtime, permission repair and GUI/font acceptance remain unverified. Push only the
existing lane branch, retain previous commits, report appended commits and stop clean here.
