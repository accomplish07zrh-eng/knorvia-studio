# Internal native exit-monitor correction receipt

This append-only checkpoint follows immutable dc05985 and historical provenance checkpoint
91d15b8108509da59358d8308941c63364cad8eb. Root demonstrated that failed kill cleanup
unsubscribed the sole native exit monitor, losing later termination and leaving diagnostics
open permanently. Frozen policy/proofs are 90ec127428820e58e8e39fb3289a059446d3539d;
the owner correction is cf6965cdd2916ec84c2f6588de20b802ff50c279. Earlier commits, red
evidence and receipts remain intact. Intended policy is
specs/knorvia-terminal-lifecycle-monitor-fast-20261001.md.

The single owner now tags acquired native subscriptions as data or exit. Failed kill still
throws, closes admission, retires public emitters/data and keeps its unconfirmed PTY tracked.
Its internal exit handle stays owned until observed exit or accepted kill. Deferred exit
retires that handle and settles bulk diagnostics without another kill. Failed handle disposal
remains owned for explicit cleanup retry; accepted termination is never inferred from error
wording. Cleanup rechecks exited before each handle because an earlier disposer can reenter
exit. No timers, backend patch, second lifecycle owner or automatic kill retry.

## Failure-first proof and corrected edge

Before production edits, standard isolated source and strict emitted runs each reported
**two files, 20 individual cases: 16 failed, four controls passed, zero skipped/cancelled**.
Starting owner SHA-256:
8041c744742150c5a1d2c34f580452ee0db7775a7f216f34ea257111ce109619.
Delivery uses actual RPC Emitter handles, so unsubscribe actually prevents future callbacks.
Cases cover deferred exit after throw before kill and after native teardown, explicit retries,
permanent kill errors, bulk diagnostics/reuse, monitor disposal before/after unsubscribe,
error precedence, reentrant cleanup, no duplicate kills, late acquired startup handles and
failed create after acquired monitoring. Four controls preserve accepted kill, ordinary live
exit, cleanup reentry and synchronous exit then kill error.

The first broad source run was **365 passed/one failed**. Its only failure was the old edge
assertion requiring both native subscriptions disposed immediately after failed kill. That
assertion now requires one data disposal; monitor retirement waits for termination. Public
retirement, tracking, IO rejection, error identity and accepted retry assertions remain. No
normal case was removed, skipped or weakened. Historical assertions remain in prior commits.

Two new service/RPC cases run actual installed node-pty 1.1.0 WindowsPtyAgent constructor
and kill through a closed fake require adapter. Synthetic release 10.0.17763 selects WinPTY
despite useConpty=true; numeric-zero getProcessList produces TypeError after fake native
teardown, then explicit retry produces the existing already-killed error. Deferred exit
through the retained Emitter handle settles actual terminal.open diagnostics. A third
service case preserves setup-primary/kill-secondary AggregateError ordering and unpublished
ownership until deferred exit. Existing binary RPC lifecycle cases remain active.

Installed JavaScript SHA-256:
8636d16b38266112204061a22b135734177c242837982fd3a4055be726efa64a.
Read-only supporting src/win/winpty.cc SHA-256:
c6a380fe58f2915e737288f2e5ad75c0ddbbb68ad842a2219e899a2fe67becc4.
No dependency source was changed or vendored into production. The only real reads in these
new native probes are installed dependency test-artifact bytes. Native modules, sockets,
filesystem operations, processes, OS release, settings and PTY ports are owned fakes.

## Final validation and exact runners

| Check                                             | Result                                                                                     |
| ------------------------------------------------- | ------------------------------------------------------------------------------------------ |
| Source lifecycle/RPC/planning/portable/macOS      | 13 files, 366 individual cases passed; zero failures/skips/cancellations                   |
| Strict emitted same consumers                     | 13 files, 366 individual cases passed; no services source fallback                         |
| Types / lint / formatting                         | Passed; 5,422 matching locale keys, zero lint warnings/errors                              |
| Changed / full architecture                       | Passed; zero violations/baseline/new                                                       |
| CLI build                                         | 17 successful tasks, 16 cached                                                             |
| Desktop main/host/preload/renderer                | Passed                                                                                     |
| Full offline studio regression                    | 515 files, 6,417 cases: 6,409 passed; zero failed/cancelled; eight skipped; 473,761.735 ms |
| Historical digest / actual licensing-schema tests | Three files, 38 individual cases passed; zero failures/skips/cancellations                 |
| Historical live replay                            | Correctly rejects new owner normalized digest; no matrix alteration                        |

Run from the repository root with Node v24.14.0 and pnpm 10.33.2. Final source command:

```sh
node --experimental-test-module-mocks --import tsx --test --test-concurrency=2 packages/services/test/terminal-lifecycle-*.test.ts packages/services/test/terminal-service-planning-*.test.ts packages/services/test/terminal-profile-*-fast-20261001.test.ts
```

Final strict emitted command, after pnpm typecheck emitted final owner bytes:

```sh
KNORVIA_TERMINAL_LIFECYCLE_TARGET=dist KNORVIA_TERMINAL_PLAN_TARGET=dist KNORVIA_TERMINAL_PROFILE_TARGET=dist KNORVIA_TERMINAL_MACOS_TARGET=dist node --experimental-test-module-mocks --import tsx --import ./packages/services/test/terminal-profile-portable-emitted-register-fast-20261001.mjs --test --test-concurrency=2 packages/services/test/terminal-lifecycle-*.test.ts packages/services/test/terminal-service-planning-*.test.ts packages/services/test/terminal-profile-*-fast-20261001.test.ts
```

Composition is 20 new monitor + 18 admission + 35 corrective + 53 lifecycle/RPC + 76 planning

- 164 profiles. Red commands used the same standard isolated Node flags, selecting
  packages/services/test/terminal-lifecycle-monitor-\*.test.ts only; emitted red additionally
  used KNORVIA_TERMINAL_LIFECYCLE_TARGET=dist and the strict emitted loader. The sandbox
  suppressed child case diagnostics; approved normal runner access restored individual counts.
  No test isolation override, budget change or approval/security bypass.

Full command is pnpm test:studio, the unchanged scripts/test-studio.mjs runner with
--experimental-test-module-mocks --import tsx --test --test-concurrency=2 and
--test-timeout=120000. It discovers 515 files, including the two new monitor suites. CLI
build retains existing global-turbo/workspace-closure/dynamic-import warnings and Windows CUA
driver skip; desktop retains chunk-size/plugin-timing warnings. No warnings were hidden or
dependencies/settings/CI changed to resolve them.

The eight full-run skips are the seven existing Windows/PowerShell cases and the optional
Claude differential case. Focused source/emitted and schema suites have zero skips. No test
budget, runner isolation or concurrency was changed for this checkpoint.

Other final commands: pnpm typecheck; pnpm lint; pnpm fmt:check;
pnpm architecture:check --changed; pnpm architecture:check; pnpm build:cli-packages;
pnpm --filter @knorvia/desktop build:no-runtime-assets. Historical schema command:

```sh
node --test --test-concurrency=2 scripts/provenance/services-lane-fast-20261001.test.mjs scripts/provenance/provenance.test.mjs scripts/provenance/retained-review.test.mjs
```

## Retention, hashes and historical contribution scope

Final owner SHA-256:
cdbc250649be8a8b91589e0c0d2e0db39f05a171b6da0c37520649a7fc829c96.
Service remains 965a6d2c2497f774949d2d8ba907b819de0b9d17cca1e5ff8f39c9725d93ec58;
launch plan remains 5c86f0ea5295a519e808a53734eca2e88999dcc961caf2a8e2fff1811338ba4d;
public terminal.ts remains f840b36586ad17b93dd5fca7f411686d345127340c869e022cf558d05ea7f76c;
terminalProfileTypes.ts remains
2b61bb42156542e062d6e786c580a9747b479e0f6b65d684503e3480e61eca0b.

Static consumer evidence: emitted owner SHA-256
6d9f1d5ab66857286f9df45dd93d14225d4f4ac12bfc7eae881e3db85be5f478;
actual generated packages/desktop/out/host/index.js SHA-256
dd09b62ccec14a367b07bec95b40c22559b7c36434e9146a09fa0c167f76db53.
Both contain the retained admission predicate and new monitor-retention predicate. Generated
host is minified and emits no source map; this is static inclusion, separate from executable
source/emitted fake-port consumer acceptance.

The unchanged owner methods are count, assertCreating, prepare, publish, fail, write, resize,
dataEvent, exitEvent, dispose, disposeAll, lookup, nativeExit, stop, cleanEmitter, settle and
refreshDiagnostics (17 byte-identical method/accessor bodies). throwCollected, imports,
constructor, Phase and existing reservation declarations remain exposed retained source;
subscription storage/type is now tagged. attach adds data/exit tags to unchanged callback
logic; retain stores the tag; clean preserves public-emitter order and finite retry cleanup,
adding termination-aware monitor eligibility. Production net delta is 17 added/seven removed
lines. The existing test has one corrected expectation and one explanatory Chinese comment.
New probe fixtures retain public method/error spellings, synthetic dimensions 81/27 and
fake numeric/Windows release values as explicit contract data; those literals, existing
formatting/declarations and successful tests are not evidence of originality.

Historical candidate docs/knorvia-services-contribution-fast-candidate-20261001.json and
its reproducible checker remain immutable at 91d15b8, bound to production 07709cd and payload
f41aed85af717561417aceaa6d8ee9f05084bb1d63bbf6834e423fdef002035e. Its upstream pin remains
872ad960de7ec172591f7e1952f7849229f94521, tree d185a9a893c00d51fc3fe51fe7371b9eea7de143,
verified previously from separate temporary bare publisher storage. It covers its older 50
paths/retained-expression spans and excludes the new monitor spec/tests/helper plus corrected
owner and legacy-test bytes. It must not be treated as current whole-lane completion. Current
live replay reports expected old owner 8041c744… versus actual cdbc2506… and rejects it.
All 11 fingerprinted shared inputs remain unchanged; all 27 material obligations remain.

This is source-exposed work. New subscription-role structure is a narrow corrective
contribution within mixed retained lifecycle source, not a whole-file original, clean-room
or MIT claim. Public declarations, service/native loading/helper permission routines, launch
planning, profiles, watcher/archive and shared provenance were preserved. Root owns renewed
current provenance and integration; future smallest useful separation remains the explicitly
bounded lifecycle owner versus retained native loader/helper routines. No new production
work follows this checkpoint without the next assignment.

Native Linux/macOS/Windows PTY, helper-permission and packaged GUI acceptance remain open.
Installed Windows JavaScript with fake ports on Linux does not establish native Windows
acceptance. A backend that never delivers exit and never accepts kill stays tracked; absent
acquired monitor or a disposer that unsubscribes then throws cannot guarantee later delivery.
Those limits are explicit; no user data/profiles/logs, real terminals/apps/native processes,
network shares, host/security/settings changes or production deployment were used.

Local supporting evidence: /tmp/knorvia-terminal-monitor-evidence holds starting owner bytes,
red source/emitted logs, first broad failure, final focused runs, gates/builds/full regression,
licensing-schema checks, stale historical rejection and consumer-receipt.json. No previous
evidence was overwritten. Shell/filesystem availability is retained; no environment recreation.
