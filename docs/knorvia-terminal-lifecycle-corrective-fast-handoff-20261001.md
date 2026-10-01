# Corrective terminal lifecycle handoff

Append-only checkpoint after immutable e00c9e70e91d446e780b177c6f403fb27fbddb62 on
parallel/file-watcher-fast-20261001. Root reviewed the prior defects and explicitly authorized
in-scope correction. No new conversation/agent, no root integration-branch write. The original
lifecycle defect spec/handoff and all earlier commits remain unchanged. New intended spec:
specs/knorvia-terminal-lifecycle-corrective-fast-20261001.md. Current live edge assertions will
be updated explicitly for approved corrections; historical failing-behavior evidence remains
available at e00c9e7, without amending it or suppressing final regressions.

Freshness --no-fetch: cached origin/main ahead 84/behind 0; no remote-head freshness claim.
Changed architecture and services context passed before edits; services is legacy/unmanaged.
Source lineage: preceding terminalService blob 694c8b3ac886a69f2cc90791e200d4a9deb69f29,
owner blob 57c16c7e74bd5cdaecf1bcd94f0ea30b281ef094. This is source-exposed work;
no clean-room/whole-service independence/MIT claim. Root alone updates shared provenance.

## Failure-first evidence

Before any production edit, 28 new corrective cases ran against both unchanged source and
strict emitted e00c9e7 consumers: 27 failed, one passed, zero skips/cancellations each, exit
status one as expected. The passing control proves an observed exit followed by a kill error
already avoids a later second kill; other cases expose the specified resource defects.
Two new cases exercise actual binary RPC, one direct real channel exercises pending admission.
All native PTY, filesystem, process, permissions, settings/profile ports are fake. No actual
processes/apps, user data, network shares, host/settings/security changes or outbound network.

Local red evidence: /tmp/knorvia-terminal-lifecycle-corrective-evidence/red-source.log and
red-emitted.log. Source/owner-before snapshots and scoped Git hashes preserve the exact
starting production code. Implementation/final acceptance follows in separate commits.

## Corrected ownership and policy

One owner now holds the ID sequence, pending-create generation, one resource Map, each
emitter/subscription and its diagnostic registration. It adopts a returned PTY before
checking a cancelled lease. Metadata completes before publication. Native exit is recorded
before notifying listeners; cleanup runs even when notification fails. Reentrant cleanup
cannot repeat an active kill. Each disposer is detached before invocation; failed cleanup
remains owned for retry. Bulk disposal attempts every snapshot entry and preserves failures.
Normal publication-order cleanup is retained inside the same Map, without an order cache.

Deliberate edge corrections, explicitly covered by tests and the new spec:

- Synchronous startup exit rejects and never publishes an exited terminal.
- Listener/setup/spawn/metadata failures retire acquired resources; failed kills stay tracked.
- Native IDisposable subscriptions now retire, including handles returned after early exit.
- A failed kill permits explicit dispose/disposeAll retry; create failure does not automatically
  retry a kill already attempted by reentrant bulk cleanup. Retiring IDs reject IO/subscriptions.
- Repeated/reentrant cleanup does not kill again after success or an observed native exit.
- Bulk disposal attempts all entries, keeps diagnostics for unresolved ownership, unregisters
  when idle, and legitimate later/reentrant creates re-register. No permanent closed flag.
- A bulk boundary cancels older pending leases before further IO/publication; a known pending
  ID can be cancelled individually. New-generation creates remain outside the bulk snapshot.
- Diagnostics terminal.open counts all known live PTYs, including unpublished failed setup;
  observed exit becomes zero before its notification. Dead failed-disposal resources stay
  owned with open zero until retry succeeds. The registry's latest-provider semantics remain.

Current 53 original lifecycle/RPC cases remain active, with only approved edge expectations
updated. No case is skipped/removed, no test/security/timeout budget is weakened. The original
assertions are immutable in e00c9e7, and its defect spec/handoff are byte-unchanged. The normal
concurrent-publication, emitter-snapshot, raw write/resize and getter-order contracts remain.

Errors preserve the initiating error first. A lone error retains exact identity/value; multiple
errors use AggregateError.errors/cause with primary wording. Bulk errors retain snapshot
order and do not hide later entries. Additional resource errors follow data emitter, exit
emitter and subscription order. Native RPC serialization remains unchanged and transports
name/message/stack, so nested aggregate details remain a local host error facility. There is
no new logging, catch-and-forget, background retry timer or new public API/list declaration.

## Original appended commits

- 9a6af884f9ab59a48aaad5090916e76c84c8ee3a: intended spec and 28 failure-first cases.
- e42a210f70f51e07f179479f14bd8e793088df9b: listener-setup cancellation and pending disposal;
  intermediate suite proved two cancellation-precedence failures before the fix.
- 05ab9c1e2d8b24161e2757b4a10c188774f2ee67: 35 total corrective cases and cleanup-order/retry
  spec; intermediate suite proved an unwanted automatic second kill before correction.
- 553f8f19383bc6c3f2e953a5f61c9fccc41019d5: corrective owner/admission/error/cleanup behavior,
  authorized live-edge assertion updates and accurate direct-RPC test label.
- Final documentation receipt follows separately. No prior commit was amended/rebased.

Only six paths differ from e00c9e7: terminalService.ts, terminalServiceInstanceOwner.ts and
terminal-lifecycle-contract-fast-20261001.test.ts; new terminal-lifecycle-corrective test,
corrective spec and this corrective handoff. Existing RPC/fixture tests, original spec/handoff,
public terminal.ts, every profile/planning implementation/test, watcher/archive checkpoints,
shared provenance, dependencies/lockfiles, CI and other lanes remain unchanged. Production
net change +185 lines: service 244 → 252, owner 99 → 276. Root alone reviews/integrates.

## Final-source acceptance

| Check                                 | Result                                                                                      |
| ------------------------------------- | ------------------------------------------------------------------------------------------- |
| Initial corrective red source/emitted | 28 each: 27 failed, one passed, zero skips/cancellations, expected exit one                 |
| Final focused source                  | 328 passed, zero failures/skips/cancellations                                               |
| Final focused strict emitted          | Same 328 passed; no services source fallback                                                |
| Focused composition                   | 35 corrective + 53 retained/corrected lifecycle/RPC + 240 immutable planning/profile        |
| Root typecheck                        | Passed; 5,422 matching locale keys                                                          |
| Lint / verify:pre-push                | Passed, zero warnings/errors; changed architecture passed                                   |
| Changed/full architecture             | Passed, violations/baseline/new all zero                                                    |
| Root formatting                       | Passed, including final receipt                                                             |
| CLI build                             | 17/17 successful, 16 cached; existing dynamic-import-options warning, Windows CUA host skip |
| Desktop build:no-runtime-assets       | Main/host/preload/renderer passed; existing chunk-size/plugin-timing warnings               |
| Full final studio                     | 512 files; 6,379 tests, 6,371 passed, zero failed/cancelled, eight skipped; 447,038.679 ms  |
| Third-party material audit            | Issues empty, all 27 unresolved obligations preserved                                       |

The eight full-suite skips are seven existing Windows/PowerShell cases and the optional
Claude leaf differential case. Every focused case ran. Full studio retained normal isolated
runner, concurrency two and per-test timeout 120,000 ms; no isolation/sandbox/approval bypass.

Actual consumer acceptance includes five existing lifecycle RPC cases and three new cases
(two binary ChannelServer/Client over in-memory protocols, one direct ProxyChannel), plus
unchanged actual service profile/planning consumers. Node registration/accessor and UI
useTerminalService/TerminalSession remain source consumers. Strict emitted loader is
unchanged; exact selectors are KNORVIA_TERMINAL_LIFECYCLE_TARGET=dist,
KNORVIA_TERMINAL_PLAN_TARGET=dist, KNORVIA_TERMINAL_PROFILE_TARGET=dist and
KNORVIA_TERMINAL_MACOS_TARGET=dist. Source and emitted tests use identical fake native ports.

Static generated consumer evidence: scoped esbuild metafile has 11 inputs (owner, service,
planner, seven profile implementations, diagnostics). The actual production host contains
the corrective owner, admission errors and aggregate cleanup behavior, with retained native/
planning/profile routines. Emitted service calls reserve/assertCreating/attach/publish/fail;
emitted owner owns generation, subscriptions and aggregated errors. Production host source
maps remain disabled by existing config. packages/desktop/out/host/index.js SHA-256:
`7b19ac99487ddbee6de6694b46467e89c0b67638a99e0d13676f4665c6d94f89`.
This static host evidence is distinct from executable fake-port service/RPC acceptance.

| Production path under packages/services/src/terminal | SHA-256                                                          |
| ---------------------------------------------------- | ---------------------------------------------------------------- |
| terminalService.ts                                   | 965a6d2c2497f774949d2d8ba907b819de0b9d17cca1e5ff8f39c9725d93ec58 |
| terminalServiceInstanceOwner.ts                      | ef6f1eceb40d69b0aba64fc5853618fc1d5e2ff44c10dafe6c6e0204382f4081 |
| terminalServiceLaunchPlan.ts (unchanged)             | 5c86f0ea5295a519e808a53734eca2e88999dcc961caf2a8e2fff1811338ba4d |
| terminal.ts (unchanged)                              | f840b36586ad17b93dd5fca7f411686d345127340c869e022cf558d05ea7f76c |

AST text hashes prove 11 byte-identical native/planning nodes: require, two type aliases,
two native globals, load/error/helper discovery/permission functions and both planning
interpreters. Ten create planning/profile/native-call/spawn/result bodies preserve exact
syntax tokens; indentation/wrapping and result staging changed for lifecycle admission.
Protected launch planner and public/profile files remain byte-identical by scoped Git diff.
Contract-required decimal IDs, native callback values, emitter/Map operations, PTY methods,
raw write/resize evaluation order and exact errors are retained expressions. Source exposure
and inherited native bodies exclude a whole-service independence or MIT claim. LICENSE/
NOTICE and preview identity remain unchanged; root owns stale shared provenance and rights.

## Safe limitations and native gaps

Unabortable settings/native-load promises settle before cancellation reaches the caller;
retired leases hold no PTY and cannot later publish. A native registration throwing before
returning a disposable exposes no unsubscribe handle: the owner kills the acquired PTY,
guards late callbacks and retains any failed kill. After unsubscribing a failed kill, later
native exit may be unobservable until explicit cleanup retry; already delivered callbacks
still prove termination and cannot resurrect state. Successful kill is the existing port's
accepted termination signal, not an OS-liveness proof. A disposer that keeps throwing remains
owned and retryable, with all errors preserved; no silent dropping or forced OS intervention.

Native Linux/macOS/Windows PTY behavior, packaged runtime, permission repair and GUI/font
acceptance remain unverified. All target PTY/process/filesystem/access/chmod/settings/profile
ports are fake or prior supported owned fixtures. Validation accessed no real user profiles,
logs, credentials/account data, terminals/apps, network shares or host settings/security;
only the final authorized lane-branch push uses network. No production deployment/release.

Local review support: /tmp/knorvia-terminal-lifecycle-corrective-evidence contains initial and
supplemental red logs, final source/emitted/full-regression logs, type/lint/format/architecture/
build logs, source snapshots, retained-exact.json, scoped bundle/metafile,
production-host-receipt.json, scope receipts and material-audit.log. This tracked document
preserves key facts/hashes when temporary files are unavailable. Clean checkpoint after push;
continue future scoped work in this same conversation.
