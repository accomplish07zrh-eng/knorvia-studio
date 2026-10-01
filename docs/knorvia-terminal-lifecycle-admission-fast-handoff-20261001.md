# Retirement admission correction receipt

Root reproduced a write after observed native exit in immutable 71647d5. This checkpoint
appends 5fd53bb0e8fdc148fd418cbfe01cfc21e4f56c6e (spec and 18 frozen cases) and
07709cddb68c1bc504d3c72707048d979a43a7f2 (small lookup correction and one approved defective
edge expectation). All earlier commits, specs, receipts and failing-behavior evidence remain
immutable. Intended contract: specs/knorvia-terminal-lifecycle-admission-fast-20261001.md.

Lookup now requires published, phase open and not exited, before evaluating IO arguments.
The existing native-exit/kill transition already closes phase before calling external code.
Existing exit notification, emitter snapshot, disposal/retry/error and live getter-order
behavior remain active. Previously obtained Event functions retain existing Emitter semantics;
new event lookup is denied during retirement. No public/native/planning/profile changes.

Before production edits, source and strict emitted direct runners each observed 18 cases:
16 failed and two controls passed, zero skips/cancellations. Standard isolated strict emitted
red replay also proved 16 failures/two passes. A two-case runner probe showed this environment's
sandbox suppresses child subtest diagnostics (one file result); an approved tool escalation
restored both cases without changing runner isolation, tests, concurrency or timeout.
Final acceptance used that approved standard isolated runner. No approval/security bypass.

First broad source/emitted run each had 345 passes/one failure: the historical assertion
explicitly admitted a new data lookup and write during exit. Only that defective edge was
updated to require the existing not-found error and no PTY write; notification and cleanup
assertions were retained. No normal case was deleted, weakened or skipped.

| Final check                                  | Result                                                                                     |
| -------------------------------------------- | ------------------------------------------------------------------------------------------ |
| Source lifecycle/RPC/planning/portable/macOS | 346 passed, zero failed/skipped/cancelled                                                  |
| Strict emitted same consumers                | 346 passed, no services source fallback                                                    |
| Root typecheck / lint / formatting           | Passed; 5,422 locale keys, zero lint warnings/errors                                       |
| Changed and full architecture                | Passed, zero violations/baseline/new                                                       |
| CLI build                                    | 17 successful, 16 cached; existing dynamic-import-options warning and Windows CUA skip     |
| Desktop main/host/preload/renderer           | Passed; existing size/plugin-timing warnings                                               |
| Full offline studio                          | 513 files, 6,397 cases: 6,389 passed, zero failed/cancelled, eight skipped; 518,768.165 ms |

Full regression retains concurrency two and 120,000 ms per-test timeout. Skips are the seven
existing Windows/PowerShell cases and optional Claude differential case. Actual direct RPC
service regression uses real ProxyChannel/Emitter; existing binary RPC cases remain active.
All target native PTY/process/filesystem/access/chmod/settings/profile ports are synthetic.
No actual terminals/apps, real profiles/logs/user data/credentials, network shares, settings
or security changes. Native Linux/macOS/Windows PTY and packaged GUI acceptance remain open.

Corrected owner SHA-256: 8041c744742150c5a1d2c34f580452ee0db7775a7f216f34ea257111ce109619.
Service SHA-256 remains 965a6d2c2497f774949d2d8ba907b819de0b9d17cca1e5ff8f39c9725d93ec58;
launch plan remains 5c86f0ea5295a519e808a53734eca2e88999dcc961caf2a8e2fff1811338ba4d;
public terminal.ts remains f840b36586ad17b93dd5fca7f411686d345127340c869e022cf558d05ea7f76c.
Actual emitted owner and generated production host contain the open/non-exited predicate.
Host packages/desktop/out/host/index.js SHA-256:
3b144b1222280606598e9dd7e4aa688d4248e2716a1511f617cf93310cad7741.
Static emitted/host inclusion is separate from executable fake-port acceptance.

Production net change is four added/one removed line in the owner; service, profiles, launch
plan, public declarations and prior watcher/archive implementations are unchanged. Source
exposure and retained compatibility/native expressions remain disclosed; no originality or
MIT conclusion follows from this repair or successful tests. LICENSE/NOTICE/preview identity,
shared licensing records, dependencies/lockfiles, CI, other lanes and all obligations remain.
Root alone reviews/integrates. The following provenance candidate binds corrected production
snapshot 07709cd, rather than superseded owner hashes from 71647d5.

Local support: /tmp/knorvia-terminal-admission-evidence contains before-owner bytes, red
source/emitted logs, runner probe, intermediate/final focused logs, full regression, gates,
build logs and consumer-receipt.json. No previous temporary evidence was overwritten.
