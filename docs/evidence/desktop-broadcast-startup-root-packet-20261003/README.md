# Root-only BroadcastHub / database startup relay packets

**Active HOLD update:** root has located the 2026-10-02 03:06 historical broadcast acceptance. The public packet baseline `a1216b…cf11e` conflicts with accepted source `952483…53d05` (implementation `82adde8`, checkpoint `c6657eaa9897611f1cc8188afc6498d827a09777`, receipt `licensing/evidence/broadcast-claim-expression-20261002.json`). Broadcast is now **EXPLICIT ACCEPTED-SOURCE HASH CONFLICT HOLD / NO REAUTHOR / NO OVERWRITE**. Its new packet cannot authorize reconstruction or replace that historical owner. Root-reported acceptance metadata is authoritative for this reservation; inaccessible accepted bytes/receipt are not independently revalidated and no backup recovery is attempted.

[Active historical owner HOLD addendum](historical-owner-holds-20261003.json) also protects `networkTelemetryAggregator.ts`: bounded accepted SHA `f3baa2a776cbd7976ae1a6a0f4e128b8636500f2adbc6451421e506d1e708b6c`, root receipt `licensing/evidence/network-aggregation-root-review-20261002.json`, whole file mixed / no MIT. Relay remains preparation-only/private-history HOLD. The original reservation and eight author-input artifacts below remain frozen preparation records, superseded by this addendum for broadcast status only.

Two complete public behavior/API/data packets are ready for root's historical review and possible later author selection. **PREPARATION ONLY / PRIVATE HISTORY HOLD** remains. Packet creation does not authorize implementation, disprove old acceptance, clear source lineage or resolve a conflicting final version. taskRealtimeBus remains HOLD and its body was not opened. Completed network/runtimeEnv and G Playwright are excluded.

Both current sources are byte/blob-equal to published PR12 `affea575c98a83e04871bb6b5655cf72cc08be75`:

| Owner | Bytes | SHA256 | Git blob |
| --- | ---: | --- | --- |
| broadcastHub.ts | 6526 | `a1216b85285bd6830b6c5afffe8e94b7e2b623882c127ffceedfd0e3374cf11e` | `ab5d801e76d3e3f2008031d2a4494a62ffcf0e7e` |
| databaseStartupRelay.ts | 4143 | `095ff63dc2363cbba63bd31bb65049ee3ffe0646c82e2e9fbcc8543736a51a55` | `6ea0dde542d70b758b00da53668a5d2866af4d24` |

[Reservation and exact origin/history limits](reservation.json), [published exact-path tree metadata](published-baseline-metadata.json), [input/source/dependency bindings and exposure](curator-manifest.json).

Each owner has exactly five named eventual author inputs:

- Broadcast: [contract](broadcast/contract.md), [public API](broadcast/public-api.d.ts), [retained data](broadcast/retained-data.json), [shared ports](shared-public-ports.d.ts), [shared public data](shared-public-data.md).
- Relay: [contract](relay/contract.md), [public API](relay/public-api.d.ts), [retained data](relay/retained-data.json), the same two shared files.

The eight distinct files are fully digest-bound. Curator manifests, extraction/checker records, source/history/reviews and this README are excluded from those allowlists. No author was created. If a genuine accepted current owner receipt appears, stop that owner and reconcile it before any new draft. Never overwrite a conflicting accepted version during final integration.

Broadcast packet covers all three public methods, module-wide token sequencing, first-wins reservation authority, expiry/capacity/retry numbers, token-matched commit/release, unregister cleanup, current ordered relay registrations, repeated/stale listener behavior, schema parsing, payload/reference identity, warnings and synchronous partial effects. It does not prescribe the predecessor's private helper decomposition.

Relay packet covers **all four public exports**, including configure quit, local ready registration, startup payload and bind; module-lifetime readiness, per-window/child binding identity, default UUID timing, sender/schema control admission, live latest state/sequence guards, telemetry-only suppression, reentrant/throwing callbacks, child-exit failure projection, exact native listener order and interrupted/idempotent disposal. It neither reconstructs migration state nor redesigns startup policy.

[Static packet results](packet-static-results.json) verify two sources, six dependencies, eight input byte/digest bindings, public parameter/explicit-return declarations, target literal sets and declaration body absence. Checks use existing TypeScript6.0.2 AST parsing only. Bind's default startupId has no explicit source annotation: its string type is manually grounded in imported randomUUID/the prior public port; its inferred return is grounded in the original returned receive/startupId observation. No semantic compiler, source emit, consumer/native/runtime check or full schema/type closure is claimed. Canonical schemas and native Electron types remain collaborators, and public schema/data descriptions carry their original limitations. Two checker-only comparison failures (class metadata field insertion, inferred parameter handling) and their original scripts/logs are preserved; no target/input correction was needed.

E curator read both target implementations and bounded public/dependency context. Incidental dependency bodies/search hits and one stopped broad /tmp dependency-location denial are disclosed in the manifest; no permission retry/private-material recovery followed. Authors have received nothing. Existing source-exposed curator, wider exposure/repaired scratch-write breach, shared executor/instruction-only/no OS isolation or independent access audit qualifications persist. Sol/high/Fast state unchanged.

Only evidence was written. No production source/global licensing/inventory/dependency edit, tests/builds/provider/process/IPC/user data, cross-lane source import/merge or release occurred. All21 material obligations remain OPEN; three scheduler version collisions stay reserved for final integration after all implementation completes. Architecture skill explicitly skips documentation-only work; the earlier missing-TypeScript architecture failure is preserved without repetition.
