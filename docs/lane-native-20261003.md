# Native lane checkpoint

Current allocation update: the parent has transferred all
`packages/desktop/src/renderer/**` to this fixed lane. Earlier exclusions below
describe earlier checkpoints; they do not limit this explicitly authorized
continuation. packages/ui/web remain excluded. Same branch, task and PR17.

Persistent branch: `rewrite/native-20261003`, created after fetch from exact
integration baseline `3b1ff0f715a43cbc51c576fd524479a08e58e203`. PR base is
`integration/backlog-20261003`; integration PR #13 remains the sole main outlet.
This lane does not merge main or create additional tasks/authors.
Active [draft PR #17](https://github.com/accomplish07zrh-eng/knorvia-studio/pull/17)
continues on this branch. First control-transport commit is
`cdc80cb1e6d3c731c1ea41d2c9663d83b2fd532d`.

## New control transport batch

Reconstructed the three complete server-cli control transport owners:

- `src/ipc/controlClient.ts`: one request exchange for socket/timer/correlation.
- `src/ipc/controlServer.ts`: one decoder/dispatch session per accepted socket and
  one listener resource owner for the memoized bounded shutdown.
- `src/ipc/framing.ts`: batch cursor decoding with committed consumed prefixes.

The [pre-implementation contract](../specs/knorvia-next-platform-control-transport-20261003.md)
freezes protocol/error data, schema gates, concurrency, callback ordering, UTF-8
and frame limitations, deadline behavior and endpoint cleanup. The three exact
baseline blobs match the existing recorded renamed-upstream mapping and had no
matching accepted replacement in the bounded receipt/review search.
[Bindings](evidence/backlog-platform-control-transport-20261003/bindings.json)
record baseline/current bytes and the whole candidate freeze before source diff.
The selected production files were read to curate behavior by the same author;
no isolated author, clean-room or independently audited origin is claimed.
Schemas, fixed literals, the error class, public shapes and ordinary idioms remain
retained compatibility material. Expression/rights acceptance remains pending.

Six focused fake-port regression scenarios were added under
`packages/server-cli/test/control-transport-contract.test.mjs`. They cover
consumed-frame tails and byte boundaries, per-socket schema admission/concurrent
responses, errors, correlation, timeout and bounded once-only shutdown. **None
has been executed.** Their supplied schema/network/filesystem/timer ports cannot
establish real schema, native endpoint or platform compatibility.

Only source reading, source diff review and byte/Git metadata inspection have
been performed. No tests (including synthetic), lint, types, format/architecture
checks, build or full audit. No application, native listener, service registration,
user data, credential or local-computer operation. This is an **unverified source
checkpoint**, not native acceptance or a MIT grant. All licensing and third-party
records are preserved; global inventories are intentionally not refreshed here.

## New persistence and shutdown observation batch

Reconstructed `src/runtime/statusSnapshot.ts` and `shutdownWait.ts` under the
[pre-implementation contract](../specs/knorvia-next-platform-status-persistence-20261003.md).
Reads distinguish IO missing/unreadable from JSON/schema invalid observations
with one explicit phase boundary. A private writer sequence retains ordered,
live-at-execution snapshot publication and the existing JSON/temporary-file/0600
write-then-rename contract, including failure-callback recovery/poisoning. A pure
shutdown evidence predicate preserves terminal status, strict freshness and
released-lock admission; existing clock/deadline/polling/error behavior stays.

[Exact bindings](evidence/backlog-platform-status-persistence-20261003/bindings.json)
freeze the complete two drafts before source diff and bind the retained
DataRootLock, recovery, service-installation, paths/schemas and CLI/Supervisor
callers. Both selected owner baselines match the recorded renamed-upstream
snapshots. Lock/recovery/service-installation have unreviewed origin records;
they remain exact rather than being automatically classified or overwritten.
Six additional fake-port scenarios are authored in
`packages/server-cli/test/status-persistence-contract.test.mjs`, **all unrun**.
No actual file, lock, process, status/data migration or application operation.
This is another source checkpoint; the same source-exposure and pending
expression/rights/native acceptance qualifications apply.

## Desktop storage Worker/IPC batch

The parent corrected native ownership to `packages/desktop/**` excluding every
renderer path. This lane continues on the same task, branch and PR, with no new
author/task. The complete `storageScanWorkerClient.ts`, `storageScanWorker.ts`
and `resourceManagerStorage.ts` candidates now implement per-run Worker lifetime,
worker-entry cancellation/progress transport and singleton storage IPC ownership.
The services scan/service/cleaner and retained Worker protocol remain the owners
of their algorithms/data. No renderer, preload UI, data cleanup, services source
or shared schema has been edited.

[Contract](../specs/knorvia-next-platform-storage-worker-20261003.md) and
[source/freeze/dependency bindings](evidence/backlog-platform-storage-worker-20261003/bindings.json)
preserve signal/listener/terminate ordering, 500ms grace and completion races,
message/error identities, singleton/service/subscriber behavior, and reveal-path
root checks. Same source-exposed author; no independent-origin/MIT acceptance.
Six new scenarios in `packages/desktop/test/native-storage-owner-contract.test.mjs`
are **unrun**. Their fake Worker/Electron/scan ports do not prove real native scan,
actual services or platform compatibility. No runtime/IO/user data was accessed.

## Windows installation locks and Host logs batch

`windowsInstallResourceLocks.ts` now uses a complete cleanup result ledger and
ordered terminate/grace/rescan phase loop, with the same resource-reference/PID
admission, live callback receivers, error ordering and unfiltered rescan results.
Synchronous packaged-resource snapshot/probe APIs and sentinel-only cleanup remain
compatible; no real process termination or filesystem probe was performed.
`hostLogRelay.ts` now has one explicit raw/structured phase owner with live raw
buffer replay, original severities/warning trimming and structured-before-renderer
publication. No Host/session or renderer state was added.

[Contract](../specs/knorvia-next-platform-install-lock-log-20261003.md) and
[bindings](evidence/backlog-platform-install-lock-log-20261003/bindings.json)
pin the whole drafts and original source relationships. The exact PowerShell
program is retained compatibility material, separately bound with only its local
interpolation variable normalized; it receives no independent-expression credit.
Five new scenarios in `packages/desktop/test/native-install-log-owner-contract.test.mjs`
are **unrun**. The same source-exposure, native/platform and pending rights/MIT
qualifications apply. CLI/Core, services, updater callers and all renderer paths
remain unchanged in this continuation.

## Desktop WSL identity cache batch

`desktopWslTargetResolver.ts` now has one complete cache owner for provisional
WSL identity keys and exact cached Promise identity. Deferred backend creation
still receives the original live target; strict TTL expiry, backend disposal
error priority and pointer-safe late-failure retirement remain compatible.
The public RemoteTarget shape, WSLBackend implementation and workspace identities
are retained. No actual WSL discovery, connection, command or user data was used.

[Contract](../specs/knorvia-next-platform-wsl-identity-cache-20261003.md) and
[bindings](evidence/backlog-platform-wsl-identity-cache-20261003/bindings.json)
freeze the whole draft before source diff, recorded baseline and retained public
backend/type dependencies. Three fake-backend/clock scenarios in
`packages/desktop/test/native-wsl-cache-owner-contract.test.mjs` are **unrun**.
Same source-exposed author; expression, rights and native acceptance remain
pending. No MIT decision or global inventory update.

## Desktop daily-log retention batch

`logRetention.ts` now separates the complete local-calendar expiry policy from
ordered filesystem deletion/result ownership. Startup remains synchronous,
regular daily logs alone are admitted, cutoff equality is retained, each file
observes the live caller-held Date, unlink failures continue, and outer traversal
failures preserve the existing empty-result observation. No timer or recursive
cleanup was added; no real file was read or removed.

[Contract](../specs/knorvia-next-platform-log-retention-20261003.md) and
[bindings](evidence/backlog-platform-log-retention-20261003/bindings.json) bind the
unchanged-upstream baseline, whole frozen candidate and retained logger caller.
Four fake-filesystem scenarios in
`packages/desktop/test/native-log-retention-owner-contract.test.mjs` are **unrun**.
The date pattern, calendar formula and ordinary native idioms remain qualified;
this is not an independent-expression/rights/MIT acceptance.

## Native main diagnostic sink batch

`logger.ts` now has one complete prepared-record/main-sink owner. Module startup
still creates the selected directory, performs retention, reports failed
retention and installs shared stdout/stderr error handling in that order. Each
write preserves redaction/serialization, dynamic directory selection, the local
daily file and exact console/file formats; console EPIPE continues to append,
other pre-append errors propagate, and injection/append failures are swallowed.
Production main debug stays skipped while renderer debug retains its prior API.

[Contract](../specs/knorvia-next-platform-main-log-sink-20261003.md) and
[bindings](evidence/backlog-platform-main-log-sink-20261003/bindings.json) bind the
upstream-modified baseline, whole frozen candidate and retained retention/shared
public dependencies. Four scenarios in
`packages/desktop/test/native-main-log-sink-contract.test.mjs` are **unrun**;
the actual retention candidate consumes supplied fs ports in those scenarios.
No real directory/configuration, file, console stream, application or user data
was operated. All source-exposure, expression/rights/native acceptance and MIT
qualifications remain open; no services/shared/global source decision changed.

## Complete native diagnostic export batch

The whole `exportLogs.ts` candidate now uses ordered explicit DFS frames, a
complete encoding-evidence owner, a decoder/pending-line/PEM state owner per
stream, a skipped-file copy ledger, staging ZIP lifetime and one export-result
operation. All three exported APIs, source-root selection, admission/retention,
UTF8/UTF16/BOM thresholds, redaction formats, rotation rechecks, ZIP/directory
fallback and error/reveal ordering are retained. Feedback remains an exact public
call to the installed services archive; its progress callback is forwarded and
its old unused stage option stays unused. No actual logs or user files were read,
modified, exported or revealed.

[Contract](../specs/knorvia-next-platform-export-logs-20261003.md) and
[bindings](evidence/backlog-platform-export-logs-20261003/bindings.json) freeze the
whole candidate before source diff and explicitly qualify retained public types,
fixed path/key/regex/encoding data and original accompanying explanations. Same
source-exposed author; no independent-expression, rights or MIT acceptance.
Two scenarios in `packages/desktop/test/native-export-log-owner-contract.test.mjs`
are **unrun**; supplied fs/ZIP/native ports and in-memory stream primitives do not
establish real native or yazl acceptance. Existing security and services consumers
remain unchanged and unrun here. Current feedback entry/policy still match their
prior handoff digests; the candidates/snapshot helpers have later current digests
bound here, so prior whole-service passes do not validate this combination.

## Data-root lock and exact recovery-origin reconciliation

The whole `runtime/lock.ts` candidate now has one held-file owner, explicit
rename/recheck path claims and the compatible recovery-gate sequence. Public
inspection/liveness, receipt/modes, stale byte and release token predicates,
retry count/delay, gate close/error ordering and live release-field observations
remain contractual. No actual file lock, process probe, timer or user data was used.

[Contract](../specs/knorvia-next-platform-lock-owner-20261003.md),
[whole draft/dependency bindings](evidence/backlog-platform-lock-owner-20261003/bindings.json)
and [exact origin reconciliation](evidence/backlog-platform-lock-owner-20261003/origin-reconciliation.json)
record both formerly unreviewed sources. The existing upstream inventory has
`packages/zcode-server-cli/src/runtime/lock.ts` and `startupRecovery.ts`: reverse
only their three/one product labels and the current baseline reproduces the exact
recorded 7257/739 bytes and SHA256. Local upstream Git blobs are unavailable;
the evidence is the existing source record plus exact reverse-label digest,
not a claim of additional original-author access or legal clearance. No accepted
replacement receipt/history surfaced for either selected source.

`startupRecovery.ts` remains exact SHA256
`17c07009b9876b9cbabce9be46b359e191c273882eb1443be8de8e9c59db2d80`:
a thin uninstall-marker/ReleaseManager delegation/failure-notification facade,
without another recovery algorithm or mutable owner. It is a retained
compatibility surface with **zero new reconstruction/originality credit**.
Integration must record its renamed source and decide expression/rights/licence
disposition. It is not original/MIT merely because current inventory is unreviewed.
The substantive lock algorithm was replaced; repeated rewriting of existing
independent owners or the facade would not add algorithmic progress.

Two scenarios in `packages/server-cli/test/lock-ownership-contract.test.mjs` are
**unrun**. Same source-exposed author; fixed public/wire/native expressions and
all source/rights/native qualifications remain pending.

## Freeze scope and final integration dependencies

The specifically assigned residual queue (whole exporter, substantive lock,
recovery source decision) is handled at this source checkpoint. This fixed lane
can enter the parent-authorized waiting phase on the current branch/PR. This is
no blanket whole-directory origin audit or MIT acceptance; any newly allocated
owner continues in the same task and branch. The bounded data-size queue remains
inherited: scanner/client from `9d92be5f35e89539e0077e79005f786f00778202` match
[root-data-preview review](evidence/root-data-preview-20261003/review.json), and
`dataSizeWorker.ts` is explicitly retained tiny entry glue with no new credit.

- Include the three deferred server-cli case files in the final root runner:
  `control-transport-contract.test.mjs`, `status-persistence-contract.test.mjs`,
  `lock-ownership-contract.test.mjs`. Their fixture/source dependencies stay in
  the same owned package; root/CI config was not edited here.
- Run existing actual security export and services source/emitted/feedback
  consumer cases with the delivered exporter and current bound services owners.
  Later candidates/snapshot helper digests differ from the old service handoff;
  its historical whole-service result is not current combination acceptance.
- Final native checks must combine storage services/Worker/IPC, Host/RPC/renderer,
  named pipes/POSIX control endpoints, Windows installation locks, WSL identity,
  diagnostic streams/yazl and Supervisor/uninstall/release consumers. No shared
  schema, service API, UI or data-format change is requested by this lane.
- Reconcile exact renamed lock/recovery mappings in global provenance, review all
  digest-bound source-exposed candidates and retained compatibility expressions
  (including the fixed PowerShell program and recovery facade), preserve third-
  party obligations and refresh inventories only under integration ownership.
  Historical feedback ReadableStream.destroy/node-forge/RPC/CUA diagnostics remain
  historical until final execution; none were rerun or declared solved here.

## Inherited work and remaining boundaries

The old E ChannelClient packet binds upstream blob
`27675cd7a6a9771926c14d0f0df7a79222854820`; the integration tree instead retains
the existing PR9 owner from `4ff54aec9697fc609a72279c08cdab1848efac42`.
The PR9 [remaining inventory](../licensing/evidence/rpc-routing-remote-owners-20261003/remaining-inventory.json)
already records twelve complete RPC candidates and four retained declaration,
export or thin Relay surfaces, with no uncovered substantive RPC owner in that
bounded queue. The prior persistent-protocol reconciliation also retains its
exact installed SHA256 `409baee902025acbdfc4f5e3059ff57f9e0f64679d73359ecc063d9d9f0540c0`.
These are baseline inheritance, **zero new reconstruction credit** for this lane.
RPC origin/rights and final consumer/platform acceptance remain open; old local
passes/failures are historical and have not been rerun.

Other native scopes retain the existing PR9/12 owners. The two known inherited
status/shutdown owners above now have this lane's contract/candidate records.
Parent now excludes CLI/Core and services ownership from subsequent native work.
The specific exporter/lock/recovery residual queue is now handled as above.
Retained owners and compatibility surfaces are not new reconstruction credit;
source/rights classification remains an integration decision.

## Integration coordination

- The existing root test runner does not scan `packages/server-cli/test`. Add the
  three deferred files `control-transport-contract.test.mjs`,
  `status-persistence-contract.test.mjs` and `lock-ownership-contract.test.mjs`
  there during final integration; root
  scripts/CI are owned by the integrator and were not edited here.
- No shared schema or protocol interface change is needed for this batch. Actual
  Supervisor/CLI consumers and Windows named pipes/POSIX endpoints still need
  final execution together with the RPC/Host/services/UI combination.
- Parent corrected the allocation to `packages/desktop/**` excluding every
  renderer path. The old `apps/desktop` spelling is resolved; no additional path
  approval is required. Subsequent batches do not edit CLI/Core or services.
- Final provenance reconciliation, whole-expression/rights review, third-party
  materials, known historical type diagnostics and MIT release gating remain
  with integration. Neither inherited records nor these new candidates close
  those obligations.

## Renderer handoff and startup batch

Read the UI lane record at exact PR15 head
`662b64276a7271324efcbc6de36497058250d521`. All thirteen specifically assigned
renderer files match that handoff and existing source records; there is no
accepted complete renderer candidate for those files. The bounded
[selection](evidence/backlog-platform-renderer-handoff-20261003/selection.json)
and [pre-implementation contract](../specs/knorvia-next-platform-renderer-handoff-20261003.md)
separate eight substantive entry/lifetime/adapter targets from five retained
compatibility surfaces. Existing UI owners and original features are not repeated.

The complete main/database-admission/resource-manager candidates and one local
appearance policy are now installed. One startup owner holds the initialized
latch, local base, early remote FIFO and timeout; a port slot owns replacement
and consumption, keeping ready/port generation equality and close-error ordering.
Remote service registration still precedes ready acknowledgment, with the exact
existing service selection and MessagePort connection. The shared appearance
policy keeps every theme token, white default, system query and distinct main/
resource-manager empty/dark behavior. Resource manager font persistence and
isolated native snapshot/storage callbacks remain in their existing order.

[Whole-draft/dependency bindings](evidence/backlog-platform-renderer-startup-20261003/bindings.json)
were recorded before source diff. The three JSX shells retain the same component,
child and prop expressions after only whitespace and startup-owner receiver
normalization, recorded in
[retained UI source binding](evidence/backlog-platform-renderer-startup-20261003/retained-ui.json).
This is source inspection, not React/DOM/UI acceptance. No HTML, CSS, asset, UI/web,
preload, protocol, data or shared configuration changed.

performanceTimelineCleanup.ts, remoteWorkspaceSessionServices.ts,
remoteWorkspaceServicePortBridge.ts, cuaPermissionPanelMessages.ts and
appTelemetryBridge.ts remain exact compatibility surfaces with **zero new
reconstruction credit**. Fixed service routing/copy/wire data and thin delegation
are not made original/MIT by retaining them. Their existing source relationship
and full expression/rights decision remain with integration.

Two focused scenarios in `packages/desktop/test/renderer-startup-contract.test.mjs`
and the new supplied-port fixture are authored and **unrun**. No synthetic test,
lint, types, build, format/architecture check, audit or application/native operation.
Same source-exposed author; UI/wire/public expressions remain qualified. Next
code batches handle telemetry lifetime and platform/browser/permission routing,
then freeze this finite assigned renderer queue on the same PR.

## Renderer telemetry batch

The complete user-action trace and local TTFT bootstrap candidates now hold their
existing collector, configuration/event/timer resources in explicit private
lifetimes. TTFT delivery uses a bounded linked FIFO instead of the inherited
array-splice queue: cap128, detach<=32, exact sequence/drop accounting, live
optional send, synchronous callback errors and reentrant admission remain
contractual. Disable/config/late-result behavior, pagehide plus explicit release
and all cleanup/error order remain unchanged; no main entry activation was added.

[Contract](../specs/knorvia-next-platform-renderer-telemetry-20261003.md) and
[bindings](evidence/backlog-platform-renderer-telemetry-20261003/bindings.json)
record the complete drafts, unchanged collector/native dependencies and required
wire/resource expressions. Post-freeze source review also rebound a trace draft
correction preserving live options property observation order around UUID,
publication and config subscription. This is source reasoning, not executed
verification. Bare configuration/send/disposer receivers remain intentional.

Two scenarios in `packages/desktop/test/renderer-telemetry-contract.test.mjs`
are authored and **unrun**, including capacity/drop/failure/missing-live-method
and late configuration/pagehide/release boundaries. Actual UI collectors/schema/
privacy/heap/IPC acceptance remains deferred. Same source-exposed author and
pending full expression/rights/MIT decision; no ui/web/preload/shared/data changes.
Startup batch is pushed at
`0af60602c632b39c75cfc3a56e38a88ca9a163b0`.

## Renderer routing and permission gesture batch

The complete desktop/browser platform candidates now express their fixed routes
through one local stateless preload invocation policy. Native methods and receiver
are read live, original argument positions/arity and native Promise/value identity
remain, optional methods and nullish results use the same fresh fallback, and
conditional capabilities retain their original platform/module snapshot timing.
All selected property slots remain in the same source order (96 platform slots,
including the browser spread, and20 browser slots). These route/property/fallback
tables are retained compatibility data, not new algorithm or rights credit.

The complete CUA panel candidate has one idle/dragging gesture owner and ordered
DOM message projection. It still prewarms helper before subscribing, uses captured
dedicated preload with its receiver, starts native drag synchronously after
preventDefault, and admits dragend/mouseup only after a start. Existing click/
duplicate-end/start-throw behavior, helper display name, bilingual copy and icon
placeholder persistence remain. No actual permission, helper install, native drag,
browser data, system window or user data was operated.

[Routing contract](../specs/knorvia-next-platform-renderer-routing-20261003.md),
[whole-draft/native-dependency binding](evidence/backlog-platform-renderer-routing-20261003/bindings.json)
and [retained route/copy source metadata](evidence/backlog-platform-renderer-routing-20261003/retained-route-data.json)
record the complete three target candidates plus new local call policy. Two
scenarios in `packages/desktop/test/renderer-native-routing-contract.test.mjs`
are authored and **unrun**. UI, native/preload, public protocol, data and packages/
ui/web remain unchanged; no runtime/types/build/other verification was performed.

Source reading found that client globals.d.ts omits previewLocalDiagnostics,
exportLocalDiagnostics and checkReleaseUpdate although unchanged preload and
IPlatformService contain them. All three runtime routes remain. The local call
type projection uses the existing IPlatformService; integration should reconcile
the global declaration and actual consumers during final acceptance. This is an
existing declaration dependency, not a type-check pass or a new shared API request.
Telemetry batch is pushed at
`cd0c79cc1629cb62dfe00a4c406d52f198cb8f7d`.

## Assigned renderer queue freeze

The specifically assigned thirteen entries now have an explicit disposition:

| Selected entry | Source checkpoint disposition |
| --- | --- |
| src/main.tsx | complete startup/remote FIFO candidate; JSX/boot data retained |
| src/databaseStartupAdmission.ts | complete state/resource admission candidate |
| src/performanceTimelineCleanup.ts | exact native maintenance glue; zero new credit |
| src/userActionTraceBootstrap.ts | complete existing trace lifetime candidate |
| src/localTtftBootstrap.ts | complete lifetime/bounded FIFO candidate |
| src/desktopPlatform.ts | complete platform adapter candidate; route data retained |
| src/desktopBrowserPlatformBridge.ts | complete browser adapter candidate; route data retained |
| src/remoteWorkspaceSessionServices.ts | exact remote service selection; zero new credit |
| src/remoteWorkspaceServicePortBridge.ts | exact thin admission/ready serializer; zero new credit |
| src/resource-manager.tsx | complete appearance/mount candidate; JSX/font feature retained |
| cuaPermissionPanel.ts | complete gesture/projection candidate; copy/style data retained |
| cuaPermissionPanelMessages.ts | exact bilingual copy/lookup; zero new credit |
| appTelemetryBridge.ts | exact one-call context delegate; zero new credit |

Two new renderer-local appearance/invocation helpers support these eight existing
target candidates, without another business owner. Six focused scenarios in
three renderer case files and their fixture are all **unrun**. Each of the five
retained surfaces still matches exact handoff bytes. Retention does not make it
original/MIT; no whole-directory completion or fresh/isolated author is claimed.

Freeze this finite queue after source diff, commit/push and remote PR metadata
confirmation on the existing task/branch/draft PR17. No more implementation is
planned without a new allocation. Final integration must combine these candidates
with PR15 UI, actual startup/preload/schema transfers, RPC/Host/remote registration,
resource-window persisted theme/font/storage, browser/capability compatibility,
CUA helper/native gesture and telemetry/config/privacy/heap consumers on all
supported platforms. Global source/rights/license review and inventories remain
integration-owned; no MIT grant, main merge or deployment here.

## Client diagnostic declaration follow-up

The parent confirmed packages/client/** remains this lane's exclusive scope.
After renderer checkpoint `124ed9e32715e6e0fb2caf1b1aa5bd8eac2de83e`,
the declaration omission recorded above is now closed in
`packages/client/src/globals.d.ts`: a three-line addition to the existing
Required<Pick<IPlatformService,...>> includes previewLocalDiagnostics,
exportLocalDiagnostics and checkReleaseUpdate. Existing shared types exactly
match the unconditional preload signatures: LocalDiagnosticRequest ->
Promise<LocalDiagnosticPreview>, string id -> Promise<LocalDiagnosticExportResult>,
and no arguments -> Promise<ReleaseUpdateCheckResult>.

The [authorized spec follow-up](../specs/knorvia-next-platform-renderer-routing-20261003.md#authorized-client-declaration-follow-up)
and [byte/signature dependency binding](evidence/backlog-platform-client-diagnostic-declarations-20261003/bindings.json)
record this declaration-only correction. No runtime/preload/renderer/shared
source, schema, channel, capability or data behavior changed. No new owner or
independent-source/MIT credit; all existing attribution/license facts remain.
No new tests were added and no tests/lint/types/build/other validation was run.
The prior44 scenarios remain unrun. Actual declaration/consumer/type acceptance,
source/rights reconciliation and server-cli runner integration remain deferred.
Continue to freeze on the same branch/draft PR after commit/push/remote metadata.
