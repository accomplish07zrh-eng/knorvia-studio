# Native lane checkpoint

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
The separately authorized lock/recovery candidates and desktop native owners
remain available for bounded review. Unreviewed origin is a reconciliation need, not
automatic permission to discard a possible earlier implementation or an MIT
decision; this checkpoint does not declare those directories closed.

## Integration coordination

- The existing root test runner does not scan `packages/server-cli/test`. Add the
  two new deferred files `control-transport-contract.test.mjs` and
  `status-persistence-contract.test.mjs` there during final integration; root
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
