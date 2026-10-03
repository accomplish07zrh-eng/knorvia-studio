# Native lane checkpoint

Persistent branch: `rewrite/native-20261003`, created after fetch from exact
integration baseline `3b1ff0f715a43cbc51c576fd524479a08e58e203`. PR base is
`integration/backlog-20261003`; integration PR #13 remains the sole main outlet.
This lane does not merge main or create additional tasks/authors.

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

Other native scopes retain the existing PR9/12 owners. The newly inspected
server-cli status-snapshot and stopped-server admission owners still have only
initial-snapshot history and require a bounded contract before a next batch.
Supervisor/core, service management and release/install runtime require their own
source/receipt review; this checkpoint does not declare those directories closed.

## Integration coordination

- The existing root test runner does not scan `packages/server-cli/test`. Add the
  new deferred test there during final integration; root scripts/CI are owned by
  the integrator and were not edited here.
- No shared schema or protocol interface change is needed for this batch. Actual
  Supervisor/CLI consumers and Windows named pipes/POSIX endpoints still need
  final execution together with the RPC/Host/services/UI combination.
- Delegation lists `apps/desktop/**`, which does not exist at this baseline. The
  integration document assigns `packages/desktop/**` excluding renderer. No
  desktop path has been edited in this checkpoint; coordinate that path spelling
  before the lane's desktop batches.
- Final provenance reconciliation, whole-expression/rights review, third-party
  materials, known historical type diagnostics and MIT release gating remain
  with integration. Neither inherited records nor these new candidates close
  those obligations.
