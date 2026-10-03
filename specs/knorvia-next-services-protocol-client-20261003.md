# Protocol client request-lifecycle replacement contract

Continue `lane/services-20261003` and draft PR16, initially branched from
`3b1ff0f715a43cbc51c576fd524479a08e58e203`. The whole protocolClient predecessor
is Git blob `7fc6740ff5b597ab8ec89232677a88d2131aa0c7`, 13,288 bytes, SHA-256
`1a28886f9568c5ff9d18f461d42ca3b676867cd3319db7129e181d587a0e4660`.
The historical origin screen's 512 nonmatches and missing ancestors do not prove
originality. No installed whole-client reconstruction was identified in the
examined origin/evidence index; source/rights status remains unresolved.

## Ownership and design

Reconstruct the full client and its request lifetime using a private request book.
The book alone owns pending request identity, operation count, timer, abort
listener and response settlement. The class owns transport listeners, public
events, startup gate and disposal. No runtime/session/command admission ownership
is added. Keep the existing transport, RPC emitter, Zod result-schema and startup
gate ports. Shared/public message shapes, diagnostic strings and fixed timeout
policy retain lineage. This source-exposed reconstruction is a candidate, not
clean-room or accepted whole-expression/rights evidence.

At this protocol-client packet/source checkpoint, `storageStartupGate.ts` was
retained unchanged at Git blob
`bf0c1cc8f8c8dc758ab783e5e60dc8c539654ba5`, SHA-256
`6a0c7171ba3ba92d7cadf1e0177509f8557ba7ea7ca9a799aa89036d03f2ad16`.
The later [startup-gate contract](knorvia-next-services-startup-gate-20261003.md)
corrects the earlier broad attribution of an accepted-hash conflict to this gate:
examined positive accepted metadata names tasksDatabase/startup.ts instead. The
gate's origin restriction remains unresolved, and the genuine task-storage and
commit-scope accepted-source HOLDS remain integrator-owned. This packet does not
edit process-manager consumers, transport, shared schemas, root configuration or
licensing records.

## Request, response and event contract

- Keep exported KnorviaProtocolClient and KnorviaProtocolRequestTimeoutError,
  existing constructor/options, storageStartup, transportKind, isDisposed,
  pendingRequestCount, pendingOperationRequestCount and five event entrypoints.
  Preserve notify/respond/respondError/dispose/disposeAndWait and generic request
  signature; support existing method literals plus public V4 methods.
- Request first rejects a disposed client. If startup is waiting, wait with the
  caller's abort signal before allocating any identity or watchdog; then check
  disposal and abort again. Allocate numeric IDs starting at one only after that
  barrier. Timeout is call override, then client override, then 180,000 ms; retain
  nullish selection and ordinary referenced Node timers.
- Register pending state and abort listener before transport send, including a
  final synchronous abort check during registration. A removed request is never
  sent. Send an object with id/method/params and only a truthy trace field. Sending
  fails with the original rejection value after local timer/listener/pending
  cleanup. Preserve the existing separate send-await and response-promise phases;
  do not turn abandoned internal promises into another runtime writer.
- On local abort, remove the timer/listener/request first; reject with the actual
  Error reason or DOMException("Request aborted", "AbortError") otherwise. Cancel
  local waiting only, without manufacturing a protocol cancellation request.
- Expiry removes request resources and emits operation-drained if appropriate
  before constructing the public timeout error. Ordinary operations emit
  onRequestTimeout with method/requestId/timeoutMs before rejection; observations
  still time out but never emit that runtime-health event.
- pendingRequestCount includes observations; operation count excludes them. Only
  removal of the final operation can emit pending-drained, even when observations
  remain. Observation completion never extends runtime idle lifetime. Suppress
  drained during explicit client disposal. Reject-all clears both kinds and emits
  drained once only if it previously held operations and is not disposed.
- Ignore null/non-object input. Result+id takes precedence over error+id, then
  method+id requests, then method-only notifications. Request IDs compare by
  String(id), allowing the current numeric/string response compatibility. Unknown
  and already-settled IDs have no effect. Do not strengthen message validation or
  silently narrow inherited key-presence routing in this batch.
- A result removes pending ownership/resources and publishes drained before
  optional synchronous schema parsing. Preserve parsed value and Error identity;
  non-Error parse failures become the existing method-specific parse error. A
  wire error keeps its name/message/code/data in the client error and follows the
  same pending cleanup order. All notifications and server requests retain their
  supplied object references at the public emitters.
- A startup/storageState notification is passed to the retained gate. Only an
  accepted transition touches current watchdogs: pause all; ready restarts each
  with its full original request duration; failed rejects all with the current
  SQLite startup error. Publish the original notification afterward. Rejected or
  terminally ignored gate transitions do not reset timers. Gate event/waiter
  ownership remains entirely with the existing gate.

## Transport and disposal contract

- notify/respond/respondError check disposal and send their existing wire shapes;
  they do not wait for storage startup or allocate pending requests.
- Transport close disposes the startup gate, rejects all pending with the existing
  transport-closed message and optional truthy reason suffix, then emits onClose.
  This event does not itself mark the client disposed or dispose transport/event
  listeners; process ownership remains with the process manager.
- dispose is idempotent. Mark disposed before local rejection/cleanup, then
  dispose transport once. Dispose local resources in their current order:
  reject pending, dispose transport listeners in registration order, dispose
  startup gate, then notification/request/timeout/drained/close emitters. Preserve
  thrown cleanup failures rather than adding a new swallowing/retry policy.
- disposeAndWait performs local cleanup once and always awaits a supported
  transport disposeAndWait even after prior disposal. For a transport lacking it,
  synchronous dispose runs only on this call's first local disposal. No implicit
  close event is manufactured by local disposal.

## Deferred acceptance

**UNVERIFIED:** no new test execution, compiler, lint, formatting/architecture
checker, build, full audit or CI rerun. This batch concentrates on complete source
implementation and source/difference reading; no additional test files are
planned. Final unified acceptance must cover timeout/abort/response/close races,
operation-versus-observation health/idle boundaries, startup pause/resume and
direct process-manager/service consumers. No actual transport/process/runtime,
provider, database, user data, configuration, credential or native action occurs.
Exact source bindings belong to this lane's evidence; MIT and parent-HOLD/global
source decisions remain with the integrator.
