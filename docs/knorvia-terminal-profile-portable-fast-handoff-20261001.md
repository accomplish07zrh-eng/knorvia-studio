# Portable terminal profile checkpoint — fixed services lane

Start `79e5eab90e5b94937abdc42d7f13ec0c5869b54c`; branch
`parallel/file-watcher-fast-20261001`. Watcher/archive commits and paths stay immutable.
Root alone integrates. This stage owns portable `terminalProfile.ts`, narrowly named
helpers/tests, its [spec](../specs/knorvia-terminal-profile-portable-fast-20261001.md), and
this receipt. macOS implementation and public terminalProfileTypes declarations remain
unchanged. No additional agent/conversation was created.

## Lineage and pre-code evidence

Fetched recovery remains `0d80f9ca37b1daef162ecc69bd18f6e8fc30a146`; fetched lane matches
79e5eab. Portable blob `9fbcc28f7759cd7a924eb5592491fedde004a5bc` matches both; only imported
snapshot history, upstream-modified/NOASSERTION/review-null inventory and no completed
independent replacement were found. Portable SHA-256 before replacement:
`87de0917ecfc67196966e121a6556ce503897c8bc5a27b68b3a0c759c7738761`;
upstream blob `156cfdc19749563b5d8380933e5687853c4afc64`.

Mac blob `153a19560f824d032421f60a7a5fe0150471bf6e`, SHA-256
`e25ea5af453dcf05352f19f0e77452e3c02ddde44822a3059badaced50bf5c77`, is upstream-unchanged.
Public types SHA-256 `2b61bb42156542e062d6e786c580a9747b479e0f6b65d684503e3480e61eca0b`
is also upstream-unchanged. Neither is counted as independently replaced at this stage.

Freshness passed (ahead71/behind0 versus origin/main); branch lacked a tracking setting,
so remote equality was separately confirmed by fetch. Changed architecture passed with
zero violations/baseline/new. Generated services context remains legacy/unmanaged;
no module contract/direct dependency contracts exist. Static refs confirm resolver import
and real call in terminalService.create; terminal.ts uses its type re-exports. No preexisting
direct resolver contract tests were found.

Spec precedes code. Inherited resolver is frozen with 60 cases: synthetic filesystem,
home/platform and macOS-provider ports; two native owned config cases; three actual
terminalService create cases with fake PTY/command/filesystem adapters. Custom fonts,
detector paths/precedence, JSONC corpus, TOML/YAML/Kitty grammar, error identity, public
result shape, repeated calls and theme identity are covered. No real profiles/credentials,
terminal/app launches or permission repairs occur.

An initial expectation missed comma-separated font display normalization; it was corrected
to the observed old contract before freezing. Consumer environment isolation initially
dropped Node's test IPC marker and yielded a file-level aggregate plus three inner cases;
preserving only NODE_TEST_CONTEXT corrected the harness. Those earlier aggregates are
not counted as final acceptance. Pinned Node24.14.0/pnpm10.33.2, standard subprocess
isolation, unchanged 120,000ms per-test timeout. Logs are in
`/tmp/knorvia-terminal-profile-evidence`.

The author read portable source and limited Mac factory/IO context. Source exposure,
retained compatibility declarations/values/grammar and unchanged inherited Mac code
require root's contribution review; there is no clean-room or blanket MIT claim.
LICENSE/NOTICE, preview identity, shared provenance and all 27 obligations remain.

## Implemented portable boundary

The resolver now consumes lazy ordered detector groups. Candidate planning preserves
eligibility, repeated roots, per-detector home handling and path order. One read boundary
tries each group's files, returning its first profile even if its family is empty; the
coordinator separately checks profile presence and chooses the next detector when needed.
This preserves Kitty's quoted-empty behavior without probing its later config. All mutable
search/selection state belongs to the invocation; settings, environment, provider data and
files are read-only. There is no persistent cache or old portable fallback.

JSONC reconstruction uses quoted/ordinary/whitespace spans and a pending comma slot.
Comment removal and closing-delimiter comma handling share one lexical traversal rather
than two reconstructed character streams. Windows font selection ranks matching-GUID,
defaults and list tiers; pure format interpretation retains existing TOML/YAML libraries
and Kitty grammar. Public resolution stays synchronous for terminalService compatibility.

This is source-exposed structural/algorithm work. Retained expressions include private
input/result shape and public type re-exports, fallback font literals, detector platforms,
path segments, strict GUID comparison, Kitty's matching/quote-stripping regex grammar,
UTF-8 reads, string trimming, and truthy profile-presence semantics. These are disclosed
for root's expression/rights review; no whole-file MIT or clean-room conclusion follows.
The entire Mac provider remains an inherited dependency, unchanged and uncounted here.

Owned production files and digest receipt:

| File                                | SHA-256                                                            |
| ----------------------------------- | ------------------------------------------------------------------ |
| `terminalProfile.ts`                | `477f44cd9d1e27cbaa10fb939e047f53c6256bd6b6a9092229c45ae1c79d41f1` |
| `terminalProfilePortablePlan.ts`    | `8ca6cd2923494f543769f583aded227c46ee9988fb092a35ab7c7f65c43c02c4` |
| `terminalProfilePortableFormats.ts` | `e507c2aaf2107fa7a84fd9859a3c68a168df64206c2db2e196c4a2dda98a7e71` |
| `terminalProfilePortableRead.ts`    | `bdbcca134ffb604a2cb55a16a4f3cbddce0e6e2da576aa05fc7ab0f52a0a7570` |

The four files total 301 lines versus the inherited portable entrypoint's 415 (-114).
Line counts are scope evidence, not license evidence. Corresponding tests/support are
only `packages/services/test/terminal-profile-portable-*-fast-20261001.*`, this spec and
handoff. Frozen assertions from `77aff53` are unchanged after entrypoint replacement.

## Validation receipt

| Check                                              | Actual result                                                                                                                          | Evidence under `/tmp/knorvia-terminal-profile-evidence`     |
| -------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------- |
| Inherited baseline                                 | 60 cases pass, zero failures/skips                                                                                                     | `baseline-final.log`                                        |
| Replacement source                                 | Same 60 cases pass, zero failures/skips                                                                                                | `source-final.log`                                          |
| Emitted resolver + actual emitted service consumer | Same 60 cases pass, zero failures/skips                                                                                                | `emitted-final.log`                                         |
| Actual consumer/native subsets                     | Three real service cases with fake PTY/commands, two fenced native config cases; included above                                        | Focused logs                                                |
| Root typecheck                                     | Pass, 5,422 matching locale keys                                                                                                       | `typecheck.log`                                             |
| Root lint                                          | Pass, zero warnings/errors                                                                                                             | `lint.log`                                                  |
| Changed/full architecture                          | Pass, zero violations/baseline/new                                                                                                     | `architecture-changed-final.log`, `architecture-full.log`   |
| Root formatting                                    | Pass                                                                                                                                   | `format.log`                                                |
| CLI build                                          | 17/17 tasks successful, 16 cached                                                                                                      | `build-cli.log`                                             |
| Desktop build:no-runtime-assets                    | Pass, main/host/preload and renderer output                                                                                            | `build-desktop.log`                                         |
| Production input/output                            | Four reconstructed portable inputs plus unchanged Mac dependency; new routines present and old portable routines absent in host output | `portable-bundle-meta.json`, `production-host-receipt.json` |
| Full studio regression                             | Pass: 505 files, 6,111 cases; 6,103 pass, zero failures, eight skips                                                                   | `test-studio.log`                                           |
| Read-only material audit                           | Consistent, 27 unresolved obligations remain                                                                                           | `material-audit.log`                                        |
| Read-only provenance freshness                     | Fails with stale current-files inventory; root must regenerate/review                                                                  | `provenance-check.log`                                      |

The strict emitted loader maps shared/RPC and services `#src` imports to emitted files
and rejects source fallback from emitted services. Both source/emitted runs execute the
unchanged real terminalService create path; every PTY/command/permission port is fake,
and the consumer environment contains only synthetic values and the test IPC marker.
No installed terminal is invoked. Native fixture reads are fenced under newly owned temp
roots and verify unchanged private config bytes and no private-field disclosure in output.

The standalone metafile confirms the new portable graph and explicitly retains the Mac
input; its bundle is compilation evidence, not a separate runtime acceptance run.
Production desktop main/host config intentionally disables source maps, so source-map
inspection was unavailable. Host `out/host/index.js` instead shows all five new routine
names and none of the five old portable detector/normalizer names, while retaining the
Mac factory. This is scoped generated-output evidence, not whole-product independence.
Host artifact SHA-256: `52a615b5397d933cb764adc963a2d7569beb1e8f456acf3e4fa0778a5fba4ac2`.

CLI retains its dynamic-import-options warning and Windows CUA-driver build skip;
desktop retains chunk-size/plugin-timing warnings. No warnings, expectations, security
checks or timeout budgets were suppressed. Root type/lint/architecture/build commands
and test-runner configuration remain unchanged.

Reproduce focused source acceptance with pinned tools from repository root:

```sh
node --experimental-test-module-mocks --import tsx --test --test-timeout=120000 \
  packages/services/test/terminal-profile-portable-*-fast-20261001.test.ts
```

After `pnpm typecheck`, reproduce emitted acceptance:

```sh
KNORVIA_TERMINAL_PROFILE_TARGET=dist node --experimental-test-module-mocks --import tsx \
  --import ./packages/services/test/terminal-profile-portable-emitted-register-fast-20261001.mjs \
  --test --test-timeout=120000 packages/services/test/terminal-profile-portable-*-fast-20261001.test.ts
```

The variable assignment above is POSIX-shell syntax; use the Windows environment-variable
mechanism for the equivalent run there.

## Stop point and remaining work

Root alone applies original commits and regenerates shared provenance/reviews. This lane
does not alter shared licensing/package/lock/CI/creation or other-lane source. Prior
watcher/archive paths, terminalService, Mac detector and public type declarations remain
byte-for-byte unchanged from 79e5eab. LICENSE/NOTICE and preview identity remain intact.

The unchanged full runner completed in 474,659 ms with its existing 120,000 ms per-test
timeout and concurrency of two. Its eight skips are seven Windows/PowerShell cases and
one existing Claude leaf old/new receipt; all 60 portable-profile cases have zero skips.

macOS algorithm/plist IO replacement is deliberately deferred until root reviews this
first portable boundary. Platform eligibility and Mac handoff are verified through fake
providers; macOS plist conversion/native error acceptance is not claimed. Windows/macOS
native profile detection, actual terminal/app launch and launched Electron GUI acceptance
were not run. Electron binary download was previously blocked by ECONNREFUSED; the
desktop build omits runtime-assets preparation and is not native distributable acceptance.
No user profile, credentials/account data, OS/settings/security change, deployment,
release, merge or integration-branch push occurred. Await the next scope here.

Original new commits, in order:

- `77aff5329140f0000fd3b60957031b15f7079521` — spec, frozen baseline and initial receipt.
- `4881535fae6d8bb10439ceb954356d2ca7a353dc` — reconstructed portable resolver and emitted test resolution.
- Final documentation checkpoint at branch tip — completed verification receipt only.
