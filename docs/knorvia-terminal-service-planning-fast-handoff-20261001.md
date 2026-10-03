# Terminal startup planning checkpoint — first fixed-lane boundary

Start `8c463b2ee1361c1ccc68dec005a4b9eccbd1fce4`; same branch
`parallel/file-watcher-fast-20261001`. Scope: terminalService.ts planning decisions,
one narrowly named pure launch planner, two frozen test files,
[spec](../specs/knorvia-terminal-service-planning-fast-20261001.md) and this receipt.
Root alone integrates. Watcher/archive/portable/Mac checkpoints, public terminal.ts and
all profile implementations stay immutable. No new conversation/agent.

Service blob `02d002c74150a94321cd303e92dfac470f6c1945`, SHA-256
`0031c0f468e58c9fd4a67c723bfca146867f7ca8ea69c31d3ebae7d2c930bbdc`, matches
local start and cached recovery `08255eca46ea14de63dcead1a2ca76194187b772`.
Upstream-modified/NOASSERTION/review-null inventory, only imported-snapshot history;
no completed service replacement found in available local history. Upstream blob
`882d78ac39d4033b29c8a6b48a05368ba93bec95`. Public terminal.ts SHA-256 remains
`f840b36586ad17b93dd5fca7f411686d345127340c869e022cf558d05ea7f76c`.
Respect network restriction: no fetch/browse; freshness --no-fetch passed ahead77/behind0
versus cached origin/main. Remote tracking is absent; no new remote-freshness assertion.
The explicitly requested final branch push is the only permitted network operation.

Changed architecture: zero violations/baseline/new. Generated services context remains
legacy/unmanaged, no module/direct contracts. Actual callers: node.ts registration/export,
accessor.ts public service, useTerminalService.ts and TerminalSession.tsx. Windows metadata
is projected into xterm windowsPty. No caller, public terminal.ts or profile code is edited.

Spec precedes source replacement. Before edits, both source and strict emitted baselines
passed the same 76 cases, zero failures/skips: 69 actual service planning/load cases and
seven retained-helper guards. They freeze shell/PATH/cwd and locale/env precedence,
ConPTY options and eligible error fallback, Windows build prefixes, exact failure strings,
observation order, raw profile env, repeated creates, deferred lazy load and failed-load
retry. Fake-helper guards cover archive rewrites, X_OK/0755/recheck, discovery/missing-file
misses, once-only flags including after failure, non-Error wording and non-Darwin gating.
No native permission or process operation occurs. Fixtures preserve only synthetic env
values and Node's IPC marker. Baseline root types also passed with 5,422 matching keys.
Evidence: `/tmp/knorvia-terminal-plan-evidence/baseline-source.log`,
`baseline-emitted.log`, `typecheck-baseline.log`.

The author read inherited source; source exposure and retained declarations/expressions
are explicit. No clean-room, whole-file independence or MIT claim. LICENSE/NOTICE,
preview identity and all 27 material obligations remain. Lifecycle, lazy-loader implementation
and native-helper implementation are retained dependencies outside this first replacement.
Completed implementation and final acceptance receipts follow below.

## Replaced planning decisions and retained scope

`c57e5f9b2d66b15d7004c551323a4215622cde3c` froze spec, source/emitted contracts and
initial receipt before production changes. `ad9a6de28e3c62621a0a75bca0f6956ef2d169bd`
implements the first planning boundary. Frozen test bytes remain unchanged after c57e5f9.

One pure helper emits lazy shell candidate/path groups, ordered cwd groups, projected
child environment, primary/fallback PTY choices and Windows metadata. It reads only
explicit arguments and native path-string utilities; no process.env/platform, filesystem,
OS, settings, PTY, subprocess or network access. The service's single admission interpreter
consumes groups with the existing access/stat ports, preserving misses, order and raw
returned candidates. HOME is captured before eager homedir, as in the original array.
Shell eligibility still uses original PATH, before Darwin child-PATH augmentation.

Environment projection now applies one locale rule table instead of three branches;
Darwin PATH uses an ordered Set projection, and ConPTY options are generated as a primary/
fallback tuple. Native execution still performs at most the existing eligible second
Windows spawn, with the same error grammar and wrapping. This replaces decision structure;
it is not merely a helper move/rename. No cache, new state owner, retry policy, event order,
async admission or privilege/credential/environment policy is introduced. Production still
supplies its existing environment explicitly; tests supply curated synthetic values only.

The service remains partly inherited. Twenty AST-selected declaration/function/method
bodies have exact before/after source-text digest equality: NodePtyModule, PtySpawnOptions,
TerminalInstance, helper/load flags, loadNodePtyModule, getErrorMessage,
resolveNodePtySpawnHelperPath, ensureNodePtySpawnHelperExecutable, terminals, nextId,
memoryDiagnostics, getTerminal, cleanupTerminal, write, resize, dispose, onDynamicData,
onDynamicExit and disposeAll. `retained-before.json` and `retained-after.json` record
these digests. Existing create profile/settings, emitters, spawn wrapping, callbacks,
instance registration and returned fields remain, except planned startup assignments and
Windows metadata call. Lifecycle is retained and not claimed independently replaced.

Source exposure and retained declarations/expressions include:

- The entire lazy module loader/shared promise/rejection-reset and native helper discovery,
  archive rewrites, one-time flag, X_OK/0755 repair/recheck/error behavior; lifecycle
  interfaces, Map/counter, emitters, diagnostics, lookup/disposal and public result shape.
- Shell names/order, original command return semantics, slash/backslash regex, native
  delimiter/join, raw cwd/HOME/home/root order, access/stat admission and failure wording.
- Darwin's eight Homebrew/system path literals, ordered trim/dedup rule; TERM/COLORTERM/CI
  values/conditions; UTF-8 matching regex, locale field order and C/POSIX/fallback literals.
- PTY option names/name/encoding, empty arguments, ConPTY true/DLL true-then-false policy,
  exact DLL-error regex, error coercion/wrapper text, decimal third-component prefix parser
  and conpty metadata shape. Argument/reference precedence is retained for compatibility.
- Public terminal.ts and all earlier profile implementations/types remain unchanged and
  are outside this replacement's claimed contribution scope.

Successful acceptance, removed old names and changed line counts do not resolve copyright
or licensing. Root must review retained expression and remaining inherited implementation;
no whole-file MIT/clean-room conclusion or shared provenance decision follows.

Owned production digest receipt:

| File                           | SHA-256                                                            |
| ------------------------------ | ------------------------------------------------------------------ |
| `terminalService.ts`           | `7ed5ac236c193b71eab2ccb698169c8f502526071bc19c4cf8e743ea9e6e0392` |
| `terminalServiceLaunchPlan.ts` | `5c86f0ea5295a519e808a53734eca2e88999dcc961caf2a8e2fff1811338ba4d` |

The service is 283 lines and planner 113, total 396 versus the initial 446 (-50). Two test
files total 903 lines. Other owned paths are only this receipt and the 123-line frozen
spec. Scope checker confirms exactly six changed paths and unchanged earlier checkpoint
paths, public terminal.ts, profiles, LICENSE/NOTICE, shared provenance/package/lock/CI,
other-lane source and UI callers. Services remains the existing legacy/unmanaged module;
no cross-package implementation edge or new managed module is introduced.

## Validation receipt

Pinned Node 24.14.0/pnpm 10.33.2; standard test-process isolation and unchanged 120,000-ms
per-test timeout. No expectation, approval/security check, timeout or test configuration
was weakened. Logs and machine-readable receipts: `/tmp/knorvia-terminal-plan-evidence`.

| Check                                            | Actual result                                                                                                        | Evidence file                                              |
| ------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------- |
| Inherited source baseline                        | 76 pass, zero failures/skips                                                                                         | `baseline-source.log`                                      |
| Inherited emitted baseline                       | Same 76 pass, zero failures/skips                                                                                    | `baseline-emitted.log`                                     |
| Final source + immutable Mac/portable regression | 240 pass (76 new + 164 existing), zero failures/skips                                                                | `source-final.log`                                         |
| Final emitted modules + real consumer            | Same 240 pass, zero failures/skips                                                                                   | `emitted-final.log`                                        |
| Retained load/permission/lifecycle source nodes  | 20 exact byte digest matches                                                                                         | `retained-before.json`, `retained-after.json`              |
| Root typecheck                                   | Pass; 5,422 matching locale keys                                                                                     | `typecheck-final.log`                                      |
| Root lint + required pre-push                    | Pass, zero warnings/errors                                                                                           | `lint-final.log`, `verify-pre-push.log`                    |
| Changed/full architecture                        | Pass, zero violations/baseline/new                                                                                   | `verify-pre-push.log`, `architecture-full.log`             |
| Root formatting                                  | Pass                                                                                                                 | `format-source.log`, `format-final.log`                    |
| CLI build                                        | 17/17 successful, 16 cached                                                                                          | `build-cli.log`                                            |
| Desktop build:no-runtime-assets                  | Pass, main/host/preload/renderer                                                                                     | `build-desktop.log`                                        |
| Generated actual service consumers               | New plan/helper inputs present, six legacy planning routines absent, retained loader/helper/profile routines present | `service-bundle-meta.json`, `production-host-receipt.json` |
| Full studio regression                           | Pass: 509 files; 6,291 cases, 6,283 pass, zero failures, eight skips                                                 | `test-studio.log`                                          |
| Scope                                            | Exactly six owned paths, frozen tests and protected paths unchanged                                                  | `scope-receipt.json`                                       |
| Read-only material audit                         | Consistent; 27 unresolved obligations remain                                                                         | `material-audit.log`                                       |
| Read-only provenance freshness                   | Fails: stale current-files inventory; root owns regeneration/review                                                  | `provenance-check.log`                                     |

Planning tests run the actual createTerminalService/create consumer with fake settings,
profile result, PTY, filesystem/home/release, CJS module and command adapters. They assert
complete spawned options and env, raw profile env, exact accesses/order/errors and returned
metadata. The 164 immutable profile cases additionally exercise real profile providers and
actual service create. The strict unchanged emitted loader maps services `#src`, shared and
RPC into dist and rejects emitted-services source fallback. Baseline and final emitted
planning tests include an isolated fake resolution failure then successful lazy-load retry.
Native-helper guards isolate module flags by query import, with no production reset API.
Every chmod/access call is fake; no host permissions, native PTY or user profile is touched.

The scoped compiler metafile lists the current service, pure planner, memory diagnostics
and all seven unchanged profile inputs. Production host contains terminalShellPlan,
terminalWorkingDirectoryPlan, terminalEnvironmentPlan, terminalPtyOptionPlan,
terminalWindowsPtyPlan and selectTerminalLaunchCandidate. Distinct legacy
resolveTerminalShell, resolveTerminalCwd, resolveTerminalEnv, resolveTerminalWindowsPtyInfo,
parseWindowsBuildNumber and shouldFallbackFromConptyDll names are absent. Loader/helper,
service and profile factory/resolver names remain. This explicitly preserves retained
implementation in the generated artifact; it is not whole-service/product independence.
Host output SHA-256:
`1836184d53a0fb38dececc97fd7eab0216dd0e400431f31fe1631d2aa533c386`.
Host source maps are disabled by existing production configuration. Named output and the
separate scoped metafile are compilation/graph evidence; the standalone bundle is not a
separate bundled runtime acceptance. CLI's existing dynamic-import warning/Windows CUA
host skip and desktop chunk-size warning remain; no settings were changed to suppress them.

The unchanged full runner completed in 471,179 ms with concurrency two and the existing
120,000-ms per-test timeout. Eight skips are seven existing Windows/PowerShell cases and
one existing Claude leaf old/new receipt. All 76 planning/helper guards and 164 immutable
profile cases have zero skips. No timeout budget, expectation or native check was relaxed.

Focused reproduction with pinned tools, from repository root:

```sh
node --experimental-test-module-mocks --import tsx --test --test-timeout=120000 \
  packages/services/test/terminal-service-planning-*-fast-20261001.test.ts \
  packages/services/test/terminal-profile-macos-*-fast-20261001.test.ts \
  packages/services/test/terminal-profile-portable-*-fast-20261001.test.ts
```

After root typecheck emits modules:

```sh
KNORVIA_TERMINAL_PLAN_TARGET=dist KNORVIA_TERMINAL_MACOS_TARGET=dist \
  KNORVIA_TERMINAL_PROFILE_TARGET=dist \
  node --experimental-test-module-mocks --import tsx \
  --import ./packages/services/test/terminal-profile-portable-emitted-register-fast-20261001.mjs \
  --test --test-timeout=120000 \
  packages/services/test/terminal-service-planning-*-fast-20261001.test.ts \
  packages/services/test/terminal-profile-macos-*-fast-20261001.test.ts \
  packages/services/test/terminal-profile-portable-*-fast-20261001.test.ts
```

Environment syntax above is POSIX; use equivalent Windows assignments there.

## Remaining lifecycle/native scope and stop point

This checkpoint ends at pure shell/cwd/env/PTY planning. Terminal instance Map/ID admission,
load-promise state, native helper ownership, emitter wiring/exit/delete/disposal, diagnostics,
write/resize and final application lifecycle remain inherited and explicitly unclaimed.
Do not extend into them until root supplies the next bounded assignment here.

Linux synthetic acceptance is not native Windows/macOS/PTY acceptance. Real native module
load/retry/packaging, ConPTY DLL/system backend launch, actual shell execution, OS permissions
and helper repair, macOS/Windows path behavior and terminal rendering were not tested.
The fake load and permission guards prove existing decision/error contracts, not native
success or host settings. No terminal/app/process commands, user profile/log/credential/
account data, permission/security/OS changes, external network fetch/browse or production
operation occurred for these tests. Prior profile native gaps remain. Launched Electron
GUI/packaged-runtime acceptance was not run; runtime download was previously blocked by
ECONNREFUSED, and this build deliberately uses the existing no-runtime-assets target.

All earlier watcher/archive/portable/Mac commits and paths are unchanged. LICENSE/NOTICE,
preview identity, 27 material obligations and shared provenance remain. Root alone applies
original commits, reviews retained expression and regenerates shared inventory. No merge,
integration-branch write, production deployment or release. Stop at a clean first planning
checkpoint after the authorized same-branch push; await work in this conversation.

Original new commits, in order:

- `c57e5f9b2d66b15d7004c551323a4215622cde3c` — frozen source/emitted contracts, spec and initial receipt.
- `ad9a6de28e3c62621a0a75bca0f6956ef2d169bd` — pure launch plans and existing service interpreter.
- Final documentation checkpoint at branch tip — completed validation/retained-scope receipt only.
