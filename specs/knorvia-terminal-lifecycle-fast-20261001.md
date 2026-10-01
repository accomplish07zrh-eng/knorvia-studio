# Terminal instance lifecycle — fixed service lane

Start from immutable planning checkpoint 24aea53849c8266115b637c28e1da732ab6ca59b,
branch parallel/file-watcher-fast-20261001. The current service blob is
`e50a68c9856065388e228b6666f43b3b38f2ae6d`; SHA-256
`7ed5ac236c193b71eab2ccb698169c8f502526071bc19c4cf8e743ea9e6e0392`.
Available history shows planning reconstruction plus imported snapshot
7619e41b950bd52073ebf36754146cf25659d9fa, no completed lifecycle replacement.
Inventory remains upstream-modified/NOASSERTION/review null and is stale after planning;
root alone updates provenance. Freshness uses cached refs and --no-fetch. Only the final
explicitly authorized lane-branch push uses network.

The author has read inherited service and RPC source. This is source-exposed reconstruction,
not a clean-room, whole-file independence or MIT assertion. Preserve LICENSE/NOTICE,
preview identity and all 27 material obligations. Retain public terminal.ts, every profile
implementation, terminalServiceLaunchPlan.ts byte-for-byte, and lazy native-module/helper
permission routines and planning interpreters byte-for-byte. Narrow ownership/lifecycle
replacement is the entire boundary; no policy fixes without root approval.

## Ownership and time

One TerminalServiceInstanceOwner owns the per-factory ID sequence, published instance Map,
and instance emitter pairs. A transient reservation contains an ID and the emitter pair;
it is not a second accepted Map or persistent queue. The service keeps launch IO and public
async wrappers. The owner controls native listener attachment/publication, lookup, events,
ordered teardown and publication-order snapshots. A single ordered retirement interpreter
executes caller-kill or native-exit actions; exceptions interrupt subsequent actions.
No new closed flag, retry, timeout, event replay, transport or subscription-disposal policy.
Existing node registration/accessor, UI terminal hook/session and actual RPC channel remain
consumers of the unchanged public surface. Diagnostics read the owner's published size.

```mermaid
sequenceDiagram
    participant Caller
    participant Service as Existing launch adapter
    participant Owner as Instance owner
    participant PTY as Fakeable native PTY
    Caller->>Owner: reserve next ID (before planning)
    Service->>Service: unchanged plan/settings/profile/lazy load/helper
    Service->>Owner: allocate emitter pair
    Service->>PTY: spawn (same wrapping)
    Owner->>PTY: attach data then exit callback
    Note over Owner,PTY: callbacks can run synchronously before publication
    Owner->>Owner: publish instance after both registrations
    Service-->>Caller: unchanged metadata (release observed after publication)
    PTY->>Owner: data callback → live emitter snapshot
    PTY->>Owner: exit callback
    Owner->>Owner: fire exit → dispose data → dispose exit → delete ID
    Caller->>Owner: dispose ID
    Owner->>PTY: kill before emitter disposal or deletion
    Note over Owner,PTY: kill may reenter callbacks/dispose; no early deletion
    Owner->>Owner: dispose data → dispose exit → delete ID
```

## Frozen contracts before replacement

- Public own-key order: create, write, resize, dispose, onDynamicData, onDynamicExit,
  disposeAll. There is no list method; RPC list is Method not found: list. Do not add one.
- IDs are decimal strings, start at zero per service factory, consumed before all planning,
  and retained across failed creates and disposeAll. Concurrent creates publish in completion
  order; disposeAll snapshots that insertion order, not numeric reservation order.
- Diagnostic provider terminal is registered at factory creation, reports published Map size,
  and is unregistered first on disposeAll. Shared registry latest-provider ownership remains.
  Repeated disposeAll is allowed. Creating afterwards remains allowed without re-registration.
- Existing create result includes own undefined optional fields, same field order and profile
  identity. Spawn errors alone get existing startup wrapper; settings fallback/profile/load/
  listener/release errors retain existing boundaries. Emitters allocate only after load/helper,
  before spawn; data emitter before exit emitter. Attach data before exit; publish after both.
- write and resize forward raw values, ignore native return values and resolve undefined.
  Unknown IDs reject exactly Terminal not found: <id>. ID lookup precedes data/cols/rows
  property evaluation; a getter that disposes the instance still uses the previously captured
  native target. Native exceptions propagate unchanged.
  Dynamic subscription lookup throws synchronously for unknown IDs. Emitter Event access
  retains real RPC emitter semantics; subscriptions/unsubscriptions and snapshot dispatch
  propagate listener exceptions and reentrant events in the same order.
- Missing/repeated dispose succeeds undefined; known dispose kills first, disposes data then
  exit, then deletes. Kill errors retain instance and emitters. Synchronous kill exit and
  reentrant dispose follow the same sequence; no early marking/removal or hidden catch.
- Exit fires listeners while instance still registered, then disposes data/exit and deletes.
  Late callbacks after completed disposal deliver no events; native subscription IDisposable
  values remain ignored as before. Callback references are retained by fake PTY only.
- disposeAll unregisters diagnostics before its publication-order ID snapshot and visits that
  snapshot. A kill exception aborts the loop; reentrant create is outside its initial snapshot.
  Native exit never calls kill. No actual process launch/kill is used by validation.

Potential inherited defects must be proved by baseline tests, disclosed, and preserved:
synchronous exit during listener registration can publish an exited instance; exit-listener
exceptions interrupt cleanup; spawn/listener failures do not dispose already allocated
emitters or attached native callbacks/PTY; post-publication release failure rejects create
while leaving the instance registered. Do not silently repair these policies. A separate
root-approved scope would be needed to change failure cleanup or reentrant publication.

## Validation and privacy

Freeze source and emitted actual-service contracts before source replacement. Use curated
synthetic environment values with only NODE_TEST_CONTEXT inherited, owned virtual paths,
fake settings/profile/process/fs/access/chmod/native PTY ports. Test unknown IDs, repeated
cleanup, concurrent admission, reentrant data/exit/kill, listener/spawn failures, late callbacks,
full create failure ordering, diagnostic counts and return values. Actual RPC/service
consumers use real channel serialization and in-memory message emitters only, no sockets.
No real terminals/apps, profiles/preferences/logs, credential/account data, OS settings or
permission changes, network shares or outbound network.

Run source/emitted frozen cases with strict dist resolution, all prior planning/profile
regressions, root typecheck/lint/format, changed/full architecture, CLI/desktop builds and full
final studio regression. Preserve runner isolation, sandbox/security and timeout budgets.
Inspect emitted service/owner and bundled actual host consumer; verify unchanged protected
source bytes. Linux fake-platform acceptance is not native Linux/macOS/Windows PTY/GUI or
helper-permission acceptance. Stop at this lifecycle boundary with a clean original-commit
handoff; loading/helper policies and any root-approved defect repair remain separate.
