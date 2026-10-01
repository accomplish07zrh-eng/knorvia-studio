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

Pending implementation and final-source gates; subsequent receipt will give original
commits, paths, immutable-byte proofs, build/consumer evidence and full regression totals.

Source exposure is explicit: inherited service/RPC code was read. No clean-room, whole-file
independence or MIT claim. Launch planner, profiles, public declarations and lazy loader/helper
routines remain protected. LICENSE/NOTICE, preview identity and 27 unresolved material
obligations remain unchanged; shared inventory remains stale and root alone regenerates it.
Linux synthetic acceptance cannot establish native Linux/macOS/Windows PTY, GUI, executable
permission repair, terminal application/font rendering or native runtime acceptance. No user
profiles/logs/credentials/account data, actual apps/PTYs, permission/security/settings changes,
network shares or outbound requests were used. Root owns review/integration and any policy
change to the proved legacy defects. Await the next scope in this same conversation.
