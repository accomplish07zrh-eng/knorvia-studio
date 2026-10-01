# Terminal lifecycle fixed-lane handoff

Baseline: immutable 24aea53849c8266115b637c28e1da732ab6ca59b, existing lane branch
parallel/file-watcher-fast-20261001. Lifecycle inherited from snapshot 7619e41, not already
independently replaced. Freshness --no-fetch: ahead 80/behind 0 against cached origin/main;
no current remote-head claim. Changed architecture and services context passed before edits;
services remains legacy/unmanaged, no managed module contract changed.

## Frozen evidence before replacement

53 actual-service cases passed against unchanged source and emitted checkpoint: 48 lifecycle
contracts and five actual RPC consumers. Native PTY, process, filesystem/access/chmod,
settings/profile and OS ports are fake. Real Emitter semantics, diagnostics registry,
ProxyChannel and binary ChannelServer/Client in owned in-memory protocols are exercised.
Strict emitted loader rejects services source fallback. Logs:
`/tmp/knorvia-terminal-lifecycle-evidence/baseline-source.log` and `baseline-emitted.log`.
Four supplemental baseline cases freeze ID lookup before payload/dimension getters and
reentrant getter disposal. No test policy, dependency, timeout or security change.

Proved inherited defects/limitations, retained pending root policy approval:

- Synchronous exit during onExit registration disposes the pair before publication, then
  create publishes it anyway; diagnostic open remains one until another exit/dispose.
- Throwing exit listener interrupts emitter disposal and ID removal; instance remains live.
- Spawn/listener-registration failures leave allocated emitter pairs undisposed; listener
  failures leave native callbacks/PTY alive but unpublished. Native IDisposable returns
  remain unused, including ordinary cleanup. Fake callbacks expose this ordering.
- Release failure after publication rejects create but leaves the terminal reachable by ID.
- Kill failure leaves the registered instance/emitters live; disposeAll has already removed
  diagnostics and aborts remaining snapshot entries. Reentrant kill/dispose can kill twice.
- Create after disposeAll remains allowed without diagnostics re-registration.

These are frozen behavior, not newly introduced fixes. No list method exists in the public
contract; actual RPC rejects it with Method not found: list. No expansion beyond lifecycle.

## Ownership implementation and final acceptance

TerminalServiceInstanceOwner is the sole factory-local owner of the ID sequence,
published Map and instance emitter pairs. The service retains launch IO and public async
wrappers. Transient reservation/attachment/publication is distinct from accepted state;
there is no second accepted queue. A reason-indexed ordered retirement interpreter replaces
duplicated caller/exit teardown. Exceptions interrupt actions and reentrant callbacks retain
legacy timing. Lookup precedes parameter access, including getters that dispose the terminal.
Native subscriptions stay ignored under the frozen policy. This is a structural owner and
transition replacement, not a moved/renamed cleanup function. Production net change: +60
lines (service 283 → 244, new owner 99). One state-writing path; no new cross-module edge.

Original commits after immutable 24aea53:

- 18d1877: spec, 49 frozen source/emitted cases and first defect receipt.
- 086becb: four additional frozen parameter-order cases and updated evidence (53 total).
- aaf262ef01896f55d509aa117ff1b0710f7be783: instance owner/retirement replacement.
- Final documentation receipt follows separately; no previous commit is amended.

Owned paths are only terminalService.ts and terminalServiceInstanceOwner.ts under
packages/services/src/terminal; three narrowly named terminal-lifecycle-\*fast-20261001
contract/RPC/fixture test files; this handoff and specs/knorvia-terminal-lifecycle-fast-20261001.md.
No shared inventory, public declaration, profile, planning helper/test, other-lane, dependency,
lockfile, CI or deployment file changed.

| Final-source validation            | Evidence/result                                                                            |
| ---------------------------------- | ------------------------------------------------------------------------------------------ |
| Frozen baseline source and emitted | 53 each, all passed; 48 lifecycle + five actual RPC consumers                              |
| Final source                       | 293 passed, zero failures/skips; 53 lifecycle/RPC + immutable 240 planning/profile cases   |
| Strict emitted consumers           | Same 293 passed, zero failures/skips; all suites use their exact dist target flags         |
| Root typecheck                     | Passed, 5,422 matching locale keys                                                         |
| Lint / verify:pre-push             | Passed, zero errors/warnings; changed architecture zero violations                         |
| Full architecture                  | Passed, baseline 0/new 0/violations 0                                                      |
| Root formatting                    | Passed, including final receipt update                                                     |
| CLI build                          | 17/17 tasks, 16 cached; existing dynamic-import-options warning and Windows CUA host skip  |
| Desktop build:no-runtime-assets    | Main/host/preload/renderer passed; existing large-chunk warning                            |
| Final studio regression            | 511 files; 6,344 tests, 6,336 passed, zero failed/cancelled, eight skipped; 431,784.702 ms |
| Material audit                     | Consistent, issues empty; all 27 unresolved material obligations retained                  |

Actual consumers include node.ts registration/host cleanup, accessor.ts, unchanged
useTerminalService.ts and TerminalSession.tsx. Five new tests exercise the actual public
service through real ProxyChannel; four use binary ChannelServer/Client over owned in-memory
protocols, one direct channel checks synchronous dynamic lookup and unsubscribe ownership.
No transport is replaced in production. Existing profile/planning consumer tests also run
against the actual service. Emitted tests use the immutable strict loader and reject services
source fallback. Exact emitted command selectors:
KNORVIA_TERMINAL_LIFECYCLE_TARGET=dist, KNORVIA_TERMINAL_PLAN_TARGET=dist,
KNORVIA_TERMINAL_PROFILE_TARGET=dist and KNORVIA_TERMINAL_MACOS_TARGET=dist.

Generated consumer inspection: standalone esbuild service metafile has 11 inputs, including
the new owner, launch plan, seven profile implementations and memory diagnostics. Removed
legacy getTerminal/cleanupTerminal/terminal Map blocks are absent from that scoped bundle.
The actual production host contains the named new owner and all retained loader/helper/
planning/profile routines; production host source maps are disabled by existing config.
Host artifact packages/desktop/out/host/index.js SHA-256:
`f1043774f1f84242be815159595c16e5364babda516845b78ef1b0f30eada1de`.
Static bundle evidence is distinct from fake-port executable source/emitted RPC acceptance
and does not establish native packaged runtime acceptance.

Production SHA-256 receipts:

| Path under packages/services/src/terminal | SHA-256                                                          |
| ----------------------------------------- | ---------------------------------------------------------------- |
| terminalService.ts                        | 93cd493f8510a35c789839e40412ebf2f02ed14a0442fb45fd392608f859f2fb |
| terminalServiceInstanceOwner.ts           | 93d0c8f6d32571ae8fb5802afd19aed38342025e4ecf37340004bca6dd609db6 |
| terminalServiceLaunchPlan.ts (unchanged)  | 5c86f0ea5295a519e808a53734eca2e88999dcc961caf2a8e2fff1811338ba4d |
| terminal.ts (unchanged)                   | f840b36586ad17b93dd5fca7f411686d345127340c869e022cf558d05ea7f76c |

AST text hashes verify 21 exact protected nodes: require binding, native module/PTY-option
aliases, two native globals, lazy loader, error formatting, helper discovery/permission
routines, both planning interpreters, and ten create planning/profile/native-call/spawn/result
statements. Every profile/public declaration/planning file remains unchanged by scoped Git
diff. New owner preserves contract-required decimal String/counter, Map operations, Emitter
construction/fire/dispose/Event access, raw PTY write/resize/kill, native callback field
extraction and exact unknown-ID/error literals. These retained expressions and protected
inherited native bodies are explicitly excluded from any whole-service independence claim.
No original implementation is relabeled MIT; root must review provenance and rights.

Full studio uses the unchanged normal isolated runner, concurrency two and per-test timeout
120,000 ms. Eight existing cases are skipped: seven Windows/PowerShell cases and one
optional Claude leaf differential case; none of the 293 focused cases is skipped. No timeout or approval/security policy was weakened.

Local evidence directory: /tmp/knorvia-terminal-lifecycle-evidence. It contains baseline and
final-source/emitted logs, type/lint/format/architecture/freshness/context/build/full-regression
logs, service-before/candidate snapshots, retained-exact.json, scoped service-bundle-meta.json,
production-host-receipt.json, scope-paths.log and material-audit.log. Temporary artifacts are
local review support, not additional tracked deliverables. This document preserves key
results and hashes for reviewers without those local artifacts.

Source exposure is explicit: inherited service/RPC code was read. No clean-room, whole-file
independence or MIT claim. Launch planner, profiles, public declarations and lazy loader/helper
routines remain protected. LICENSE/NOTICE, preview identity and 27 unresolved material
obligations remain unchanged; shared inventory remains stale and root alone regenerates it.
Linux synthetic acceptance cannot establish native Linux/macOS/Windows PTY, GUI, executable
permission repair, terminal application/font rendering or native runtime acceptance. Validation
accessed no user profiles/logs/credentials/account data and used no actual apps/PTYs, permission/
security/settings changes, network shares or outbound requests. The only authorized network
operation is the final lane-branch push. Root owns review/integration and any policy
change to the proved legacy defects. Await the next scope in this same conversation.
