# Complete databaseStartupRelay public behavior contract

Scope is all four original exports/public signatures, not only bindDatabaseStartupRelay. Existing native Electron, crypto UUID, shared schema/channel/state owner and local telemetry remain imported collaborators. Root-only preparation: no implementation authorization, history/source clearance or removal of private checkpoint/final version HOLD. Curator has read source; author inputs contain observed behavior, public declarations/data only and no private helper names/layout, source/test/history/comparison bodies. Internal organization is the eventual author's choice.

## Shared lifetime and exported API

One module-lifetime local-storage-ready fact starts false and never resets on rebinding, failure, child exit or disposal. One module-lifetime optional quit callback is initially absent; configureDatabaseStartupQuit replaces it with the supplied handler, with no invocation or validation. No existing callback is called during replacement. A module-lifetime ordered collection of ready callbacks deduplicates by function reference while queued. Per-window relay binding and per-child startup-ID association are separate identity-based, weak-lifetime relationships; they are not a second business migration ledger.

onLocalDatabaseStartupReady(listener) is synchronous. If ready is already true, invoke this listener immediately as a plain callback, without registration/deduplication/catch; repeated calls each invoke. Otherwise queue by callback reference in insertion order, with duplicate queued references retaining their position. Callback errors propagate. There is no unsubscribe export, timer, returned promise or extra status policy.

getDatabaseStartupPortPayload(child) returns a fresh object with sole own key databaseStartupId holding the associated ID only when that stored ID is truthy; otherwise undefined. No clock/UUID/native calls or type/schema validation occur. An explicitly supplied empty ID is accepted by bind at runtime but yields undefined payload; do not infer validity from the public string type.

## Bind and ordered registration

bindDatabaseStartupRelay(win,child,startupId) defaults the ID using imported randomUUID only when the argument is omitted/undefined. Default evaluation occurs before invoking the old window binding's disposal. A supplied ID does not call UUID or normalize/validate/clone it. Do not add native child-message listener here: the Host collaborator passes states to returned receive.

Synchronous order:

1. Invoke the prior binding disposal for exactly this window, if present. Its exceptions propagate and stop new setup.
2. Associate the supplied child with this startupId.
3. Prepare this binding's not-disposed, not-exited and absent-latest state, and its callbacks. No initial snapshot/event/ready invocation is produced.
4. Make this binding the window's current disposal association.
5. Call ipcMain.on with DatabaseStartupControl channel and this binding's control callback.
6. Call win.once with closed and its disposal callback.
7. Call child.once with exit and its exit callback.
8. Return a fresh object whose own keys are receive, startupId, in that order; receive is this binding's callback and the ID is its accepted value.

Do not replace on with once, replace once with on, add a teardown handle, guard already-dead native objects at entry or roll back partial setup on registration failure. Rebinding the same child through another window can replace its associated ID; preserve the existing identity semantics without introducing an owner-equality guard in later deletion.

## Receiving and applying state

receive(state) first rejects silently if this binding is disposed, its child-exited fact is true or state.startupId strictly differs from the binding's accepted ID. It does not safeParse, clone, freeze, authorize or validate the supplied DatabaseStartupState again. It reads properties on the original state; accessor errors propagate.

For an admitted state, suppress it only when there is a latest reference, its startupId equals incoming state.startupId and incoming sequence <= latest sequence. Otherwise accept the incoming object itself as latest, then forward, then attempt telemetry, then apply ready policy. The original object remains mutable through ports/callers; later duplicate/phase/snapshot observations read that live reference. Do not introduce an independently cached sequence/phase or discard reference identity.

Forwarding uses ordered guards: not disposed, win.isDestroyed false, current win.webContents.isDestroyed false. If admitted, call current win.webContents.send with its receiver, DatabaseStartupState channel and the identical state reference. No independent child-exited guard is added here. If send/guard throws, latest acceptance remains and telemetry/ready steps do not run.

Invoke imported reportDatabaseStartupState(state) once after forward attempt, even if forwarding was skipped by destroyed/disposed guards. Catch and suppress only this telemetry call's error; add no telemetry failure logs or retry. After telemetry, if the live state.phase is ready and global ready was false, set global ready true before invoking queued callbacks. Invoke queued callbacks in insertion order as plain callbacks; iteration is live. Clear the queue only after all return normally. A throwing callback aborts later callbacks/clear, while accepted latest and global ready remain. A callback registered reentrantly now observes ready true and runs immediately. Subsequent ready states do not re-drain that queued remainder or reset global ready.

## Renderer control admission

For ipcMain's callback, first ignore if binding disposed or event.sender is not strictly identical to current win.webContents. Then call existing databaseStartupControlSchema.safeParse(raw) once with its schema receiver. Unsuccessful parsing returns silently; parse exceptions propagate. Do not add main-frame checks, child liveness checks, request startup-ID/attempt-ID policy, a local retry implementation or new schema.

For parsed action exit, call the current configured quit callback if present as a plain callback and return without child forwarding. This remains allowed after child exit unless disposed; missing quit is a silent no-op and its exceptions propagate.

For action snapshot with a latest state, forward that exact latest reference first using the normal window/disposal guards. Then, for any parsed non-exit action, if child-exited is false, call child.postMessage with its receiver and one fresh object with own keys type, control in that order; type is HostMessageTypes.DatabaseStartupControl and control is the exact result.data reference. This includes snapshot even when latest is absent or forwarding was skipped, and retry without extra policy. Forward exceptions prevent child posting. Once exited, snapshot can replay latest failure but non-exit control is not posted.

## Child exit

The once exit callback first marks this binding exited, then deletes this child’s startup-ID association without checking whether another binding replaced it. No disposal/global-ready reset occurs. There is no new disposed check in this captured exit callback.

If latest is absent, first sample Date.now once, then randomUUID once for attemptId, and create a new starting state with own fields in order: schemaVersion=1, startupId, attemptId, sequence=0, startedAt=sampled now, updatedAt=same sampled now, phase=starting, disk=fresh empty array. This starting object is retained as latest without independently forwarding/reporting it.

If latest live phase is already failed, stop without further Date/UUID/forward/telemetry. Otherwise project a fresh failed state from all latest own fields, then override in order: sequence=latest.sequence+1, updatedAt=another Date.now, failedPhase=latest.phase, phase=failed, errorCode=transport_closed. Existing spread/overridden key position and other nested references follow ordinary object semantics. Pass the resulting object through the same acceptance/forward/telemetry/ready path. Never use an old ready state to prove a newly attached Host alive. Previously global ready remains true. Errors propagate with exited/association/partial state effects retained.

## Disposal and failure semantics

The disposal callback is idempotent only through its binding's disposed fact: if already disposed return. Otherwise mark disposed true first, then call ipcMain.removeListener(DatabaseStartupControl, exact control callback), win.removeListener(closed, exact disposal callback), child.removeListener(exit, exact exit callback), and delete this child’s startup-ID association, in that order. Finally remove the window association only if it still refers to this disposal callback. Do not delete a newer window binding, but do not invent a child-ID equality condition. Preserve native receivers.

An exception interrupts this sequence; do not add try/finally, roll back disposed or complete the remainder on a subsequent call. Latest/global readiness/queued callbacks/quit callback remain. Detached callbacks manually retained by a collaborator preserve these original guards and effects; no new closure invalidation policy.

Only telemetry failure is suppressed. All other UUID/clock/native/schema/ready/quit/accessor effects are synchronous and preserve thrown identity and prior partial effects. There is no await, process invocation, extra listener, retry/rollback policy, environment/credential/user-file access or timer. Wire strings, phase/error labels, own-property presence/order, clock order, references and existing policy are required public behavior/data, not new independent material.

Allowed eventual author inputs: this contract, public-api.d.ts, retained-data.json and the two named shared public port/data files. Root separately determines whether to implement after history/ownership HOLD review. Do not read taskRealtimeBus, root network/runtimeEnv, other lane source or private checkpoints.
