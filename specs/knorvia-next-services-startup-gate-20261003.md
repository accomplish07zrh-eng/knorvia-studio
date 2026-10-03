# Storage startup gate replacement contract

Continue `lane/services-20261003`, draft PR16 and original branch base
`3b1ff0f715a43cbc51c576fd524479a08e58e203`. Whole gate predecessor:
`packages/services/src/agent/storageStartupGate.ts`, Git blob
`bf0c1cc8f8c8dc758ab783e5e60dc8c539654ba5`, SHA-256
`6a0c7171ba3ba92d7cadf1e0177509f8557ba7ea7ca9a799aa89036d03f2ad16`.
The examined exact inventory marks this gate unreviewed with a prior allocation
and origin restriction. Current user allocation permits its implementation;
source/expression/rights review remains unresolved.

## Exact historical-version boundary

The inspected positive accepted-parent metadata binds different paths:

- tasksDatabase/startup.ts: current `d5cc1b688fa979534a1a4520e5813a98f84ed66ae8f8525c10371a5761c03fde`,
  reported accepted `a45bd7f55dfe610e78b9314ba5807403cd1397c372a8cd2da81c50d8c961c58a`,
  receipt `licensing/evidence/task-storage-preparation-expression-20261002.json`.
- git/commitMessageFileScope.ts: current `f813e660387f81f205ad6adbf925f4ec09f5c2e903aedeae768c1977311a9d2e`,
  reported accepted `ca5bf8cc6396ab43992806626efb6f5700524ec9b0c0b4a36f19090e6c8a6761`,
  candidate Git blob `69e43f4ce19a30ea185ba99ffb284ac0d798c6f8`, receipt
  `licensing/evidence/commit-message-scope-independent-replacement-20261001.json`.

Both receipts are unavailable in this checkout and fetched integration head
`91d5cd9dc70f7e801abe2cdecdb12e73d3491c56`; the named commit-scope blob is
unavailable locally. Those source/installation HOLDS remain unchanged. No new
whole-body candidate is used to bypass known accepted-history evidence. The
earlier batch-3 attribution of an accepted-hash conflict specifically to the gate
was overly broad: examined exact metadata binds task storage preparation, not
this gate. This correction does not prove no unavailable gate acceptance exists.
If contradictory positive exact evidence appears, submit it to the integrator.

## Owner and behavior

Reconstruct the complete gate with one observation record, one lazily created
completion outcome and one first-status deadline. The outcome admits per-caller
promise views and retains its first settlement, replacing the inherited shared
promise/resolve/reject fields. Parsed process control facts are
the only source of database identity/progress. Consumers wait or observe this
owner; no runtime, command, migration or persistence owner is introduced.
Preserve exported class, constructor, onDidChange, isWaiting, snapshot, accept,
wait and dispose. Retain shared schema/type/error-policy and RPC Emitter ports.

```mermaid
stateDiagram-v2
    [*] --> Optional: required=false
    [*] --> Waiting: required=true; first-status deadline
    Optional --> Waiting: accepted progress
    Optional --> Ready: accepted ready
    Waiting --> Waiting: same identity; increasing sequence
    Waiting --> Ready: accepted ready; resolve latch
    Waiting --> Failed: accepted failure / deadline / transport close
    Optional --> Failed: accepted failure
    Ready --> Ready: later frames ignored
    Failed --> Failed: later frames ignored
```

- Required construction creates the pending completion outcome before scheduling the
  first-status deadline (default 30,000 ms), with unref when supported. Optional
  construction creates neither. A valid accepted frame cancels this deadline;
  progress does not start another watchdog.
- Always call the retained schema's safeParse first. Reject invalid input and
  any input after terminal error. After a previous snapshot, accept only the same
  attemptId/databaseId with strictly greater sequence and a nonterminal previous
  phase. Do not constrain databaseKind or other parsed fields beyond existing
  schema/identity rules. Ignore later ready/failed frames rather than renew a
  process lifetime.
- Accept retains the parsed snapshot object reference. Ready settles an existing
  outcome without creating one. Progress lazily creates one; failed records the
  existing SQLite error and fails that outcome if present. Publish accepted facts
  afterward using the same parsed object. Retain the first outcome settlement;
  settle registered views in admission order. No unowned rejected promise is
  created when failure precedes all business waiting.
- isWaiting is true for terminal error, or an existing latch with a snapshot not
  ready. Failed therefore remains waiting for the process-manager reuse gate.
  snapshot exposes the retained current reference; do not clone on read.
- wait first throws the caller's abort reason through throwIfAborted, then the
  stored startup Error. With no latch or ready snapshot, return immediately.
  Otherwise await a promise view of the shared outcome. With an abort signal, race that view
  against only this caller's raw signal.reason and always remove its listener;
  cancellation never rejects the shared latch or another caller.
- Synthetic failure changes a nonfailed current snapshot by spreading all
  existing fields, setting failed/errorCode and increasing sequence. Before any
  fact, create the existing schemaVersion=1/session/sequence=1/elapsedMs=0 shape
  with separately generated opaque attemptId and unresolved databaseId. Publish
  this synthetic snapshot before assigning the terminal Error and rejecting the
  latch, retaining reentrant event/waiter ordering. Already-failed input does not
  generate another snapshot/event inside failure handling. Error text remains
  `SQLite startup failed: <code>` and first wire failure defaults to sql_failed.
- dispose cancels the deadline and fails transport_closed only when an unresolved
  nonready latch exists without terminal error, then disposes the emitter. It does
  not synthesize a failure for a never-waiting optional gate or a ready gate. Do
  not add a new disposed acceptance guard or normalize raw abort reasons.

## Delivery and deferred acceptance

The same one-process control facts drive desktop continuous and mobile replayable
consumers through the existing protocol client/process manager. The gate adds no
session queue, wire cancellation or local database operation. Public fixed data,
schema, timeout, diagnostics and collaborator expression retain lineage.
Single source-exposed author; no clean-room, separate author or accepted whole
expression/rights claim. **UNVERIFIED:** no tests, compiler, lint, architecture or
format checker, build, audit or CI rerun; no added test files in this batch.
Final combined acceptance must cover schema/identity admission, first-frame
timeout, failure event order, abort-isolated waiters, ready/dispose boundaries and
protocol watchdog/process-manager consumers. No shared/root/CI/license edit.
