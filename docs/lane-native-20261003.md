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

| Selected entry                          | Source checkpoint disposition                                   |
| --------------------------------------- | --------------------------------------------------------------- |
| src/main.tsx                            | complete startup/remote FIFO candidate; JSX/boot data retained  |
| src/databaseStartupAdmission.ts         | complete state/resource admission candidate                     |
| src/performanceTimelineCleanup.ts       | exact native maintenance glue; zero new credit                  |
| src/userActionTraceBootstrap.ts         | complete existing trace lifetime candidate                      |
| src/localTtftBootstrap.ts               | complete lifetime/bounded FIFO candidate                        |
| src/desktopPlatform.ts                  | complete platform adapter candidate; route data retained        |
| src/desktopBrowserPlatformBridge.ts     | complete browser adapter candidate; route data retained         |
| src/remoteWorkspaceSessionServices.ts   | exact remote service selection; zero new credit                 |
| src/remoteWorkspaceServicePortBridge.ts | exact thin admission/ready serializer; zero new credit          |
| src/resource-manager.tsx                | complete appearance/mount candidate; JSX/font feature retained  |
| cuaPermissionPanel.ts                   | complete gesture/projection candidate; copy/style data retained |
| cuaPermissionPanelMessages.ts           | exact bilingual copy/lookup; zero new credit                    |
| appTelemetryBridge.ts                   | exact one-call context delegate; zero new credit                |

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

The parent confirmed packages/client/\*\* remains this lane's exclusive scope.
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

## Final-stage lock fixture repair

Parent has started final concentrated acceptance. Read the current integration
record at `19f6ccf74ba1064ca81d93194b4f25a36030e361`: native-selected ran14
supplied-port scenarios,12 passed and the two lock cases failed at module load
because port was declared twice. The root runner already admits server-cli/test.
Its published failure record/log digest is bound in the
[affected-only result](evidence/backlog-platform-lock-fixture-repair-20261003/result.json);
raw native log contents were not present in the published tree. Lock/test baseline
bytes match this lane's previous `f7ad7efa3e5e1bec72eaba818db6bce43fa33d97`.

The raw esbuild banner declared const port outside the bundler's renaming scope,
colliding with var port emitted for a virtual module. Only that banner binding now
uses lockFixtureContext. The supplied IO/process/UUID/clock ports, both test bodies
and every assertion remain. Production lock.ts is byte-identical; no production,
protocol, root test entry/configuration, UI or data change.

Exactly the two affected tests were executed once after the repair under pinned
Node24.14.0 on Linux x64, esbuild0.27.7 and tsx4.21.0, using temporary minimal test
tools with installation scripts disabled. Result: **2 passed,0 failed,0 skipped**,
exit0. Exact command/tool/source bindings and
[captured test-runner output](evidence/backlog-platform-lock-fixture-repair-20261003/targeted-test.log)
are recorded. No other suites, lint, types, product build, full audit or actual
native/user-data operation. The earlier implementation-phase unrun records remain
historical; these two supplied-port passes are not whole-native/platform/rights/MIT
acceptance and add no independent-source credit.

PR17 is already merged/closed; continue on the same branch without reopening or
creating a PR. Deliver this new complete SHA to the parent for PR13 integration.

## Final-stage native type/lint/format acceptance repair

After the user's explicit additional authorization, fetched and normally merged
exact integration `19f6ccf74ba1064ca81d93194b4f25a36030e361` into this same persistent
branch; merge `7feae5561dc00af9a6f81773e0767bf193d0284f` also retains the separately
pushed lock repair `5c5447e0ddb078fe6b5acd53db33748f2f9c1666`. Source repair checkpoint
is `04d4e167bb8bca3cf8ba726192443be6767f2943`; no new PR/task, no main merge.

The [authorized spec](../specs/knorvia-next-platform-final-types-20261003.md) and
[actual checks and source bindings](evidence/backlog-platform-final-types-20261003/result.json)
close this lane's 18 desktop +4 server type diagnostics. Host now uses the validated
startup `action` discriminator and existing media proxy `tryAcquire` port. Remote
task metadata is its actual minimal identity contract; invocation closure preserves
the original dynamic method/receiver/single-argument shape. Indexed task IDs,
attachments, modifier keys, key-release order, snapshot ancestry, tar flag and WSL
address/capture handling express their real bounds without any/ts-ignore, removed
features, data changes or shared-contract/config edits.

Seven long synthetic mjs test entries retain their paths, all40 scenarios, selection
parameters, registered order and assertions through case/fixture modules. Host
test UUID/reporter mutation remains in the original harness closure. The old empty
export/unused type import and a new unused test import are removed; the listener
event port still snapshots its dispatch set. No lint rule was disabled. Thirty-five
old code format paths are formatted only; the limited AST difference-reading
projection agrees for35/35, including renderer entry/keys. This is neither runtime
nor legal/source-expression acceptance.

Under Node24.14.0/pnpm10.33.2, frozen dependency closure installation with
ignore-scripts completed exit0 without tracked manifest/lock or native hook changes.
Directed server, Host and Main `--noEmit` checks each passed. The selected `tsc -b`
reference graph **still failed exit2**:43 diagnostics across seven services-owned
paths,0 in desktop/server. The owner checks use emitted dependency declarations
from that reference check; root/clean dependency acceptance is not claimed.
Owned seven-package lint reports580 files,0 warnings/0 errors. The77 affected code
paths use the repository formatter; exact receipts and source digests are recorded.

The43 selected synthetic scenes passed with0 skips. Later cleanup reran only six
affected fixture consumers, then four Host scenes after the final Port extraction;
all passed. Together with the separately recorded two lock passes, these receipts
cover47 distinct supplied-port scenes, with repeated executions explicitly separate.
No full native/root suite, build, full architecture/provenance audit, real native
launch/UI/platform/installer/migration or user data operations ran here. Earlier
unrun implementation receipts remain historical; this batch has zero new independent
rewrite or MIT credit, and all source/rights/third-party HOLD and attribution remain.

Parent coordination: integrate this head into PR13 and have services clear the43
recorded diagnostics; reconcile global current-input/source bindings after formatting
and moved test fixtures without overwriting frozen evidence or license decisions.
The new tar/WSL boundary test is explicitly run from server/test here; adding it to
the global runner, if required for final acceptance, belongs to the integrator.
PR17 remains merged/closed, and the root runner/CI/config/global source lists remain
untouched by this lane.

## Final-group staged diagnostic ZIP repair

The execution environment is confirmed usable after the parent's disconnect notice:
fetch, exact integration sync and focused test execution succeeded. Continued the
same task/branch, fast-forwarded to `7bfb867162cc11adbc237e1c39bf2d61b5c0f81e`, and
created production/spec repair `ea5f1bc279b4756dcfcc95a7c8816116210df87c`.

The reported native-export-log-owner-contract.test.mjs:189 failure is a production
traversal error, not a fixture/contract disagreement. Both source roots and original
expectations include CLI and computer-use exit diagnostics. After sanitizing those
members into the stage, ZIP selection rejected the `.knorvia-studio` intermediate
directory before reaching its approved children. The internal staged scan now admits
only real directory ancestors of approved diagnostic roots; leaf/privacy exclusions,
ordinary source scans, helper selection, sanitization, retention, order and stage
cleanup remain. No public export/options/protocol/UI/data change or new owner.

The [new affected-only evidence](evidence/backlog-platform-export-stage-repair-20261003/result.json)
binds the published failure and original production/test/loader bytes. The same
unchanged `complete default exporter` case first reproduced exit1 with missing two
members, then passed **1/1, exit0, 0 skipped** under pinned Node24.14.0. Original
assertions and fixture/loader bytes are unchanged; all five expected archive members
are retained. No other case, full suite, type/lint/build/architecture/rights check or
real native/user-log/data operation ran in this group. Prior golden/source/failure
receipts remain unchanged, and source-exposed candidates remain candidates with
zero independent-source/old-accepted/MIT acceptance credit.

Deliver the same persistent branch head to PR13; PR17 stays merged/closed. Integrator
owns current exporter source-input digest reconciliation and wider acceptance;
global source/license/rights lists and CI remain untouched here. No current execution
blocker and no new cross-module API dependency.

## Windows-only path fixture failure repair

Continued the same task/branch, fetched and normally merged exact integration
`73e0687a78cc7354dfad0589a9e2ebedac159013` in
`5ce3e1e63ac5d0c7039f85bccad6bd883b745cb2`. The previous staged-ZIP repair remains
present. Four fixture/spec repairs are committed as
`de0131baae27cab8c0c642ad2ef5d47741e9f280`; no new task/PR or main merge.

Read the actual [Windows job log](https://github.com/accomplish07zrh-eng/knorvia-studio/actions/runs/37110107123/job/111166240728).
The run's trigger head was `7bfb867162cc11adbc237e1c39bf2d61b5c0f81e`, but checkout
used synthetic merge `d03df27e30768649c77d004092d7508fa8b9afbc`. These four observed
failures compare hardcoded POSIX physical paths with native separator/drive-qualified
results; they are fixture portability errors. This does not classify the other
Windows failures. All four fixture files and the recording loader were unchanged
between the trigger head and integration73e0687a.

The [spec](../specs/knorvia-next-platform-windows-fixtures-20261003.md) requires
explicit absolute input roots and full expected paths for native, POSIX and Win32
rules. The existing fake ports now supply the chosen public path API; tar imports
have unique state keys to prevent module-cache reuse across variants. Production
recording/tar owners and the recording loader remain byte-identical. Archive member
and unsafe-link strings remain POSIX data. Full artifact metadata, security/authority,
live mutation, FIFO/backpressure, error identity, cancellation/cleanup order, tar
flags/content/permissions/call order, short-header bound and unsafe-link/no-publication/
no-replacement assertions remain. No weakened checks, output normalization or skips.
Unselected transparent-window bootstrap and WSL case bodies are byte-identical.

Exactly the four affected scene selectors and their three path variants were run
once under pinned Node24.14.0 on Linux x64: **12 passed,0 failed,0 skipped**, exit0.
The [new own-lane result](evidence/backlog-platform-windows-fixtures-20261003/result.json)
binds original CI excerpts, exact command/output and production/fixture digests.
Win32 API cases exercise pure path rules on Linux, not a Windows operating system.
No other scenes, full suite, types/lint/build/full audit, real Electron/media/native
launch or user-data operations ran. Only affected fixtures/spec used write formatting;
prior frozen/golden/source/failure/rights records are retained unchanged.

The known integration workflow run37111228357 is cancelled, so Windows acceptance
is **pending**. Read-only branch-head PR-run metadata will be checked after push;
no CI workflow is dispatched/retried here. Integrator must integrate into PR13,
reconcile shared inventory/current-input digests and obtain a successful matching
real Windows job. PR17 stays merged/closed. No cross-module API dependency or new
independent-source/old-accepted/rights/MIT credit; candidate and license qualifications
remain in force.

## Source-notice facts preserved; MIT-specific work stopped

Synced this same native branch to exact merged main
`59517d9699519b0a7a44980da27df29d45f0e91e`. The latest user instruction is to keep
the application Apache-2.0 and stop extra MIT-oriented rewrites, contribution-rights
acceptance and material closeout. Root LICENSE/README, existing file/component
licenses, third-party attribution, source-exposed qualifications, UI and all original
ZIP/SVG bytes remain. No whole-project original-authorship or permission conclusion.

Already obtained [bounded source facts](evidence/native-source-notices-20261003/native-input-source-facts.json)
bind both Windows ripgrep14.1.1 ZIPs to the publisher's exact release-asset SHA256,
member hashes, embedded Rust source strings and pinned build source. The Microsoft
release commit is `7ea8b7eb6c0de96fe4275bba5e88cb49297af42e`; Windows uses `ms-1.88`
from its RustTools feed, not a demonstrated official Rust1.88.0 distribution. Both
executables contain `6a6eaca656978778f7c1c750ee0c3db87f8bffb2`. The public source
query returned422, original COPYRIGHT lookup404 and anonymous feed401. The exact
toolchain package/source/standard-library notice remains unrecovered. These are
access/source facts, not proof of infringement or absent permission. No substitute
Rust release notice is used to close that gap.

The pinned Windows patch adds msvc_spectre_libs0.1.3. Its public crate checksum
matches the patch's Cargo.lock value; its original MIT notice exactly matches the
publisher's pinned LICENSE. That complete notice now has a native-search component
record and a digest-named retained file consumed by existing packaging. It covers
the helper only, not Visual Studio libraries, Microsoft Rust or the application.
All prior component records/notices remain. Shared inventory/current-input and any
generated root notice reconciliation remain integrator-owned.

The [SVG recognition table](evidence/native-source-notices-20261003/four-svg-source-facts.json)
records docx/folder/pptx/xlsx, four Desktop paths and four identical Web copies with
fixed GitHub blob links. The user's “我的Claude自绘的” statement is retained but
not matched to these files after their clarification that they cannot identify
which SVGs. No blanket creator/license decision or assumed third-party-authorization
deficit. Original proportional renders are saved as Library
`libfile_077e3f20f0848191a63e8bb15bfd1048`, file
`file_00000000e030820696e38f1a93361646`; no generated substitute or UI change.

Only source/metadata/byte/diff reading, notice retention and the requested preview
were performed. No binaries, tests/lint/types/build/full audit or real user/native
application operation ran. Public Rust manifest inputs already collected as a
possible future candidate remain exploratory; no full rebuild recipe or replacement
was completed. Protect this work by commit/push on the same branch, then stop the
MIT-specific task. No new PR/workflow dispatch, third-party contact or local-user
machine request is needed for this preserved handoff.

## Cloud package and native integration acceptance

The later delegated request authorizes package builds and relevant acceptance
checks from merged main `59517d9699519b0a7a44980da27df29d45f0e91e` on this same
native branch. The actual runtime input is
`ede8382435ed91e9d62300599e925f6fb90532c0`; the new bundler-only retry correction
does not claim a newer payload or independent-rewrite credit for inherited main.
The application remains Apache-2.0. After viewing the original preview, the user's
“这种不是我们的” clarification supersedes the unmatched creator statement for
those four SVGs; source handling stays with the integrator and no image/UI changed.

With pinned Node24.14.0/pnpm10.33.2 on Linux x64, frozen dependency repair, official
runtime preparation and production Desktop build passed. Default dependency
postinstall failed because electron-rebuild cannot create `/home/agent/.electron-gyp`;
the frozen `--ignore-scripts` fallback passed. Existing beforePack restores the
pinned PTY prebuild; the actual packaged native module was subsequently executed.
The complete configured Linux bundle produced its fresh unpacked payload/AppImage
but failed FPM release metadata validation. A separate configured AppImage target
using that payload passed, with `--publish never`. The final188,666,830-byte image
has SHA256 `1b174f98586d09ca09e61ebd63457c38565cdef7606b3af6d09060ac1bb2cd78`.
Both image invocations reused the same payload and have different image bytes;
there is no two-clean-build or whole-release byte reproducibility claim.

Extraction of that real image passed. Its physically separate artifact passed
**six native check groups**: canonical identity using the existing evidence owner;
ASAR/native layout and main/host/scheduler/preload entries; packaged CLI0.16.9 in
Electron41.0.3/Node24.14.0; real PTY output/exit plus SQLite sentinel; two normal
storage-path handshake/preparation runs preserving that synthetic database row;
and packaged rg/ugrep/bfs with Chinese/space-containing paths and retained source
notices. ASAR equals the built ASAR, CLI equals the staged CLI, and PTY equals the
pinned target prebuild by SHA256. Fixtures were removed; no GUI, model, credentials,
user computer or real user data was involved. This is bounded native/extraction
acceptance, not complete legacy migration, GUI first-run or OS install acceptance.

The source fix makes bundle retries require explicit transport-failure signals.
A successful builder download URL or a generic helper/NSIS resource name no longer
replays packaging after deterministic missing-metadata/tool errors. Retry limit,
mirror fallback and target order remain. The four focused regressions reproduced
**2 passed/2 failed** before the change and then **4 passed/0 failed/0 skipped**.
Root typecheck, changed-file architecture checks and direct changed-file oxlint
passed. Root lint failed its frozen-evidence prerequisite for24 prior unregistered
source-notice snapshots; the actual lint stage did not run. New acceptance snapshots
also need the integrator's shared-registry registration; no gate was bypassed.

The [result](evidence/native-packaged-acceptance-20261003/result.json),
[commands](evidence/native-packaged-acceptance-20261003/commands.json),
[artifact bindings](evidence/native-packaged-acceptance-20261003/artifact-bindings.json)
and original logs/probes retain actual passes and failures. The remaining handoff:

- Supply factual Linux homepage/release-maintainer email metadata before accepting
  .deb/.rpm/.pacman; none was invented.
- The CLI-owned SEA collector assumes CUA `dist/index.js` despite its explicit
  package-root JS exports. The independent distribution build fails there after
  CLI/server/Web source stages; no complete archive exists for distribution-smoke.
  Its owner must adapt collection without removing TUI/Web or changing CUA layout.
- Register retained native source/acceptance snapshots in shared
  `licensing/frozen-evidence.json`, then rerun root quality gates.
- Obtain real Windows NSIS/portable/CUA and existing .exe packaged results, with
  GUI flows owned by the UI lane. Linux cannot close those stages; macOS was not run.

The original requested PR base remains `integration/backlog-20261003`; it is166
commits behind merged main at observation time. A draft against that base therefore
contains already merged baseline changes. Review this batch through its own commit
and the exact main595 comparison; those inherited changes are not native lane work.
Retargeting the PR or moving the integration base belongs to the integrator.

## Four bounded Desktop inherited implementation replacements

Packaging fix/evidence was committed and pushed as
`3e8dbeb75baa1d58285ec638e513e40a60c00da0`. Integration subsequently advanced;
this same branch normally merged exact PR19 source-facts head
`1128e11a98a47d16ad19e9b3e60e65fc8b470cd7` in
`3418776c6d90b3a205e312a115948a280e91309d`. Draft
[PR21](https://github.com/accomplish07zrh-eng/knorvia-studio/pull/21) remains based on
`integration/backlog-20261003`, now with the current evidence base rather than the
previously stale166-commit base. No main merge or new task/branch.

The integrator explicitly assigned four exact inherited files, after the bounded
upstream comparison. The [behavior spec](../specs/knorvia-native-four-inherited-modules-20261003.md)
was written before source replacement. Public APIs/consumers remain:

- `chromeInstallationCandidates.ts`: one six-product platform catalog replaces
  separate per-channel switch families. Running matching indexes the first
  slash/case-normalized fallback, then emits explicit directory/password-store
  evidence in command order; child-process exclusion remains conditional on no
  explicit user-data-dir.
- `chromeExecutableDiscovery.ts`: one lazy tier plan retains environment/process,
  registered, PATH and installation priority. A shared directory iterator feeds
  Mac Spotlight and Linux desktop entries while isolating stale/unreadable sources.
- `chromeProfileDiscovery.ts`: ordered installation iteration owns deduplication;
  one read-only inventory emits only importable profile offers, with last_used/
  Default ranking before sole/ambiguity selection. Windows policy reads and staged
  placeholder expansion retain HKCU/HKLM order, failure continuation and unknown
  variables. Empty/malformed-cache behavior is retained rather than silently fixed.
- `crashDumpAnnotations.ts`: bounded declared-length decoding and a single forward
  scan retain known prefix groups, first valid value, absolute alignment and bad
  record skipping. A fixed metric schema and priority rule table feed the existing
  OOM summary, including field order and diagnostic text limits.

This is a source-exposed candidate implementation, not a clean-room claim. Fixed
interfaces, product/system data, command/flag grammar, short IO/admission wrappers
and ordinary conversions remain. Their exact retained bodies are disclosed in
[source bindings](evidence/native-four-inherited-20261003/source-bindings.json),
without independent-authorship credit for those expressions. No new SPDX/MIT
grant or blanket whole-file/project-original conclusion. Original license/NOTICE
and source history remain; global current-source decisions are integrator-owned.

The identical expanded fixture passes **24/24** on the exact four prior Git blobs
loaded only from disposable `/tmp`, and **24/24** on the candidates. Together with
the two unchanged archived-crash redaction/default-capture tests, the final
candidate run is **26 passed,0 failed,0 skipped**. Coverage includes platform
catalog/order/mutable-array isolation, executable tier laziness/permission and
registration failure, running flags/first fallback, profile importability/ambiguity/
policy/empty cache, invalid/truncated/unaligned/limit Crashpad records, Unicode/
controls/first values, all summary fields/order and OOM threshold precedence.

An initial combined run passed20/21; its unchanged default-capture test tried the
unavailable `/home/agent` because the harness had omitted the startup data override
before cached config import. Supplying task-local data/storage paths before import
then passes both unchanged security tests. That failure is retained and classified
as harness isolation, not a production bug or weakened assertion. Synthetic
profiles/startup data were cleaned; no real browser, system commands, models,
credentials, GUI or user data were used.

Final root typecheck, architecture check, direct five-file oxlint and owned-file
format check pass. Root lint still fails before lint because25 new packaging
snapshots are unregistered; the earlier24 source-notice snapshots were already
registered in synced PR19. This source batch adds12 own snapshots, also needing
the integrator's shared frozen-registry/current-input update. Original logs, source/
fixture digests, commands and limitations are in the
[result](evidence/native-four-inherited-20261003/result.json).

The earlier AppImage's runtime input is still `ede8382435ed91e9d62300599e925f6fb90532c0`;
it does not contain these new four-file candidates. No fresh package, full suite,
GUI/model/complete legacy migration or real Windows/macOS Chrome/installer/CUA
acceptance is claimed for this source batch. Linux metadata and CLI-owned SEA
collection requirements remain as previously handed off. The four assigned
substantial units are complete as bounded source candidates; integrator review,
shared evidence/source projection and final platform/package acceptance remain.

## Fresh unified intermediate package and Windows policy fixture repair

This same branch fast-forwarded exact unified input
`ad712690b3eb1501574c1d29361dc801c1414373`; PR21 was confirmed merged into
integration. Official sequential runtime preparation rebuilt CLI/plugins rather
than reusing its bootstrap shortcut, and production Desktop/ASAR/AppImage came
from that exact clean tracked source. The new image SHA256 is
`4df48b20614ad7b77d0e1bece39e80d246ed6da9cd3309d54807a760342a5d43`,
188670928 bytes, with metadata commit ad712690. The extracted artifact passed
all six actual native probe groups again; its executable/ASAR/CLI/PTY bytes equal
the freshly built directory payload. This is new evidence, not the old ede838 pass.

The full CLI/server/Web source archive now builds with the CUA root-JS collector
repair, SHA256 `b822a4bcda4fa72303e571a4b1275180eb06676b931375b6fe3d19042bd680f9`,
89996347 bytes. Its unchanged distribution-smoke **fails at runTui ESM import**:
dynamic require(process) from bundled YAML. TUI render/keyboard and the following
Web block were not reached. A separate actual isolated install/reinstall passed
exact byte/current-link/version/help and synthetic profile retention; the installed
Web launcher passed HTML, server-info/workspace, artifact WebSocket and SIGTERM
launcher exit0. That launcher result does not prove Desktop Host/child-tree disposal.
[Intermediate receipts](evidence/native-packaged-retest-ad712690-20261003/result.json)
retain the complete failure, initial and extended installer checks, digests/commands.

The parent then explicitly superseded final input with
`902e35c6dbcfa4b829270352fecf03ebc07b219f`, including services zombie cleanup,
and requested the two real Windows Chrome policy CI failures first. This branch
fast-forwarded that exact SHA; no package was rebuilt from it before repair.
PR24/old run37123232166 logs show trigger ad712690 but actual synthetic checkout
`7bd43bfd70486ef0e9b90bc3e2174cd81130404d`. All four production files and old
fixture are byte-identical across those three versions, proving applicability.

Under the [pre-edit spec](../specs/knorvia-native-chrome-policy-fixtures-20261003.md),
only the fixture changes: two registry inputs now use native join spelling to
match their unchanged expected values/assertions. Production intentionally retains
expanded raw policy separators; normalizing it would alter its public behavior.
One added control checks complete source fields, raw mixed separators, unknown
variables, separate joined profilePath, ordered HKCU/HKLM reads and unchanged
cookie bytes. All22 unselected scene bodies and all four production owners remain
byte-identical. No new implementation/origin/license credit is claimed.

Linux selected baseline **2/2 pass**, repaired plus new control **3/3 pass**, zero
failures/skips. These do not reproduce Windows failure or replace actual Windows
acceptance. Root typecheck, lint (one existing warning, zero errors), changed
architecture, direct fixture lint and owned-file formatting passed before adding
new evidence snapshots. [CI repair receipts](evidence/native-chrome-policy-ci-20261003/result.json)
bind the real Windows failure and exact source/fixture/check results. Original
system-command mocks and synthetic filesystem isolation remain; fixtures removed.

After new snapshots were added, root lint was rerun and **exits1 before lint** at
the unregistered frozen-evidence prerequisite. The captured failure is retained;
no shared registry or gate was changed/bypassed. Final-tree quality remains pending
integrator registration and the resulting matching CI, despite the earlier source
lint pass.

First hand this repair commit to integration, register its new own evidence and
obtain a matching real Windows job. Then supply the next exact unified SHA and
rebuild final packages; ad712690 passes remain historical intermediate results.
CLI owns the newly exposed TUI ESM import blocker; services/UI own combined Host
shutdown/GUI follow-up. Real Windows installers/GUI/CUA and macOS remain unavailable;
only full Linux targets requiring the factual public maintainer email are held.
No root/CI/shared protocol/global inventory, production UI, licence or real user
data edit, release publication or main merge occurred in this continuation.

## Exact final-input complete archive and Linux native acceptance

The parent supplied exact final product input
`bcb82c184de740c2cd9571c115eafa3bd04480cf`, including merged PR25's Chrome fixture
repair, PR26's actual TUI ESM/startup exit repair and integrated services zombie
cleanup. This same branch fast-forwarded that SHA; 24 recorded source/build/probe
inputs remain unchanged and tracked source is clean through package acceptance.
The later evidence commit is separate from that exact package input.

A complete fresh CLI/TUI/server/Web archive now builds, SHA256
`75a77e374b9c12b40e49a35e8867405a7a3fe96751d0dbf25b5ff0595da06f11`,
90495472 bytes. The unchanged original distribution-smoke retains all nine
assertion call sites and **exits0**, with actual native TUI import, initialized
render, Ctrl-C keyboard exit0, Web HTML/server-info/exact workspace, artifact
WebSocket and launcher SIGTERM exit0. There is no TUI skip, injected import shim,
assertion relaxation or replacement of its Web block with a supplemental probe.
This is new evidence of the CLI owner's deployed repair, not native implementation
credit or a reuse of the intermediate archive's failed smoke.

The actual generated installer also passes two isolated same-version installs,
four owned loopback metadata/archive requests, installed byte/current symlink/
version/help checks and synthetic profile sentinel preservation. Only the prior
probe's inputSha report literal changes; all assertions remain. Generated archive
checksum/latest bindings match externally; installer-side checksum verification
is still not claimed.

Official source runtime preparation and production Desktop build then generate
a fresh linux-unpacked/AppImage with metadata bcb82c18. The image SHA256 is
`f63774b7aeaff27e18df68e7f86e3061f9188214871519829b95ee1c39cb1175`,
188674891 bytes. Actual extracted executable/ASAR/CLI/PTY digests equal the new
directory payload, and CLI equals the newly source-built/staged Desktop bundle.
The unchanged actual native probe passes all **six groups, exit0**, including
Electron41.0.3/Node24.14.0, real PTY, SQLite sentinel retained after two normal
storage handshakes and packaged rg/ugrep/bfs with notices/source files. Canonical
hooks restore pinned PTY and enforce native layout; lifecycle scripts and remote
target preparation remain explicitly skipped as recorded. Synthetic fixtures are
removed; no real user data, model, credentials or user computer was used.

[Final-input packet](evidence/native-final-package-bcb82c18-20261003/README.md)
retains original command/results/logs, exact probe/input/metadata bindings and new
archive/image hashes. The full-archive TUI blocker is closed for this exact input.
Real Windows NSIS/install/GUI/CUA, macOS, complete legacy migration and Electron
GUI/Host-Agent shutdown are not established by this bounded package run; the
separately owned combined acceptance remains applicable. Deb/rpm/pacman are held
for the factual public maintainer email, which was not provided or invented.
AppImage/archive builds do not require it. No old payload/results are substituted.

No additional full source suite, root typecheck/lint/audit or CI dispatch is run in
this batch. The integrator owns run37127601364, registration of this new evidence
packet and final matching-source CI before its PR24/main decision. Global shared
registries/protocol/config, production code/UI and existing source/license/NOTICE
are untouched; no whole-product original/MIT conclusion, release or main merge.

## Authorized public maintainer and complete Linux package targets

The user now explicitly supplies `accomplish07zrh@gmail.com` for this project's
public maintainer metadata, superseding the earlier hold. The same native task
and branch fast-forward latest main
`b3b2fc5f51d2e76ff76c20aff44eb2b1d562c687`. Under the pre-edit
[spec](../specs/knorvia-native-linux-maintainer-20261003.md), the existing Desktop
extraMetadata.author gets that email; its name/homepage remain. Root Apache-2.0
is also carried into previously omitted application package-license metadata.
All existing root/component/source/NOTICE declarations remain; no new rights,
originality or MIT conclusion is made.

Actual format preparation exposes the existing Arch suffix/default mismatch:
builder passes xz beneath .pkg.tar.zst. The first direct zstd property repair at
cd801380 fails builder26.8.1's enum before targets start. The final supported
fpm option override retains its schema/hooks and proves real Zstandard bytes.
This leaves just four added production-config lines, including the explanatory
comment; no root/shared config, protocol, runtime, UI or data-path change.

Exact final product input is
`b5fbc3d89c34c45d6d9f7e16183bbdaec79d75f8`; metadata is b5fbc3d8. Fresh
Desktop and configured AppImage/deb/rpm/pacman packaging pass in one final
invocation, exit0. Sequential CLI/plugin source preparation at df7f5987 is bound
separately: the only subsequent source changes are config/spec, so all runtime
component inputs remain identical. Missing build tools use signed official
Debian downloads and task-local extraction; no global package installation.

Deb/rpm/pacman package heads contain the exact authorized contact and Apache-2.0;
all four physical ASAR manifests do too. Existing dependencies/package versions
are preserved in platform-native spelling. Actual four extracted payloads have
identical executable/ASAR/CLI/PTY and five legal-resource hashes. The unchanged
native probe on actual deb passes six groups, including real PTY, SQLite sentinel
retention after two storage handshakes and native searches with notices. Runtime
fixtures are removed; no user profile/computer, models or global install hooks.

[Linux maintainer packet](evidence/native-linux-maintainer-20261003/README.md)
retains exact input/commands, all four artifact hashes and raw headers/probe
results. The initial schema failure and a corrected harness doc-path assumption
remain recorded; no failed result is replaced with a pass. All successful targets
remain the same artifacts and are not rebuilt. File-only config lint/format and
changed architecture pass; unrelated full suites and manual CI are not repeated.

The public-email packaging blocker is now closed. Full OS/distro/GUI installation
and complete legacy migration remain outside this bounded acceptance. Parent
owns draft-PR integration into main and shared current-source/frozen-evidence
registration; no cross-module interface dependency is introduced. No main merge
or release publication occurred in this task.

## Installer controls, physical portable modes and ordinary uninstall retention

Same fixed native task/branch continues after the retained email/Linux evidence
checkpoint `5c3120f0abfd4031a9c69b5b8a6d2082721ef57d`. Additive source commits
`1836f419aa2ac41117e21b1ba01e196d66227a2a` and
`b03bb9d25b71ac07b7c8d510c4fc2d34ac966ff7` implement real installer shortcut
checkboxes, installed/portable target separation and original-launcher storage
selection. Marker-bearing Windows/Linux packages use a sibling `data/`; normal
packages retain the current profile. Windows NSIS self-extraction no longer
selects its temporary exe directory, and AppImage uses the original file rather
than its mount. Explicit portable overrides and existing path validation remain.

Ordinary NSIS uninstall now shares owned program-file cleanup, prunes only empty
parents, and preserves unrelated/nonempty data even inside the install tree.
Unreadable/missing manifests stop ordinary uninstall before deletion; legacy
upgrade without a manifest still preserves old files. AppData cleanup remains
disabled by default. Existing upgrade diagnostics, pinned-shortcut preservation,
finish launch, native runtime packaging policy and resource hooks remain.

Parent relayed UI [draft PR28](https://github.com/accomplish07zrh-eng/knorvia-studio/pull/28)
at `1a0febaf9b362b5bcd578d396ec566bf98a33e51`; its exact README/INTEGRATION/copy
were read and its bitmap paths actually wired. Native adopts the concise native
copy with welcome wording aligned to scope/directory/shortcut page order, keeps
real system progress/file detail and finish-checkbox behavior, and does not
rewrite UI images. Integration must include PR28 before packaging. The UI design
preview remains a design draft, not Windows execution evidence. No renderer,
services, shared protocol, root/CI/global source record or other-lane edits.

[Source receipt and CI handoff](evidence/native-installer-variants-20261003/README.md)
bind 14 changed inputs, seven unchanged shared files and exact UI blobs under the
pre-edit [contract](../specs/knorvia-native-installer-variants-20261003.md).
Ten new unit cases and four native-Windows cleanup cases are authored, **all
unrun**. This source batch performs no test/lint/type/build/format/architecture
check or full audit. Source/diff/blob metadata and remote confirmation only.
Existing b5fbc3d8 Linux products and six-group deb acceptance remain unchanged;
they do not establish acceptance of later installer/profile source.

The email/Linux **draft PR creation** remains blocked by automatic approval
review, which requires direct trusted end-user authorization for the specific
public maintainer address rather than assistant delegation. The pending direct
approval question is not answered, no PR was created, and no alternative write
bypassed that rejected action. Code continues on the existing published branch.
Parent owns native Windows/Linux builds, final validation, source registration
and GitHub Release publication. No main merge, new task or replacement branch.
