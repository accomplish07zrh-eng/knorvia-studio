# Lane C file watcher handoff — 2026-10-01

Branch: `parallel/file-watcher-fast-20261001`. Exact starting commit:
`0d80f9ca37b1daef162ecc69bd18f6e8fc30a146`, fetched from
`recovery/independent-logging-20260930-0456`. Root alone owns integration.

## Pre-implementation checkpoint

Freshness passed (`ahead 65 / behind 0` relative to the checkout's fetched `origin/main`;
new branch had no upstream). Changed architecture check passed: 0 violations, 0 baseline,
0 new. Generated `services` context identifies the module as legacy/unmanaged and has no
module contract or direct dependency contracts. Public watcher contract and the shared
`FileWatchEvent` shape, UI workspace-tree and saved-workflow hooks, service registration,
remote host registration and client RPC proxy references were read before replacement.

No existing dedicated watcher tests were found. The newly frozen inherited-contract suite
ran with Node 24.14.0 and passed **13/13**, with zero failures/skips. It freezes registration
IDs/options, admission errors, coalescing and debounce, platform resolution, subscription
ordering/disposal, reentrant events, native error retirement, diagnostics, reuse and
service-instance isolation. It also exercises real `ProxyChannel.fromService/toService`
dynamic subscription consumers. Before implementation the separate five IO-port tests
failed **0/5 passed** because inherited factory ignores the proposed runtime port and
attempts native admission; these are new boundary failures, not inherited regressions.

Baseline source and current inventory were inspected. Both owned files are
`upstream-modified`, `review: null`, `NOASSERTION`, with Apache-2.0 default scope:

| Path                    | Baseline SHA-256                                                   | Fixed upstream blob                        |
| ----------------------- | ------------------------------------------------------------------ | ------------------------------------------ |
| `fileWatcher.ts`        | `54c14389ba3c3a13d5e9e11b5b967cec4d57768adb0e85fe59d63d027ea24bac` | `4f4808dfbac73bfa11e5e4d35c8a2b6e420888f0` |
| `fileWatcherService.ts` | `91d4176925584a123cdd48359cbcc015533dd5a4b0bf11a9e5e7401e2406c97c` | `3a625f1a645a0a93fda2125fef7a9a4a7e046c73` |

The author is source-exposed; this is not clean-room work. The public interface and
descriptor are deliberately retained. A modified/unreviewed classification is not proof
that every declaration requires rewriting. No copied implementation, blanket original
claim, or whole-file MIT conclusion is asserted. Root must review final source and digests
before regenerating shared provenance. LICENSE, NOTICE, preview identity, shared licensing
files and all **27 unresolved material obligations** remain untouched.

Spec: [watcher boundary](../specs/knorvia-file-watcher-fast-20261001.md).

## Implemented boundary and retained scope

Commits in order:

- `2130e74` — specification and frozen contracts, before production edits.
- `5501a6a` — IO seam, registration/turn guards, constant-space batch verdict and native/
  emitted acceptance fixtures.

The service registry is the single owner of admitted registrations. A registration owns
its native disposable, pending turn and immutable batch verdict. The IO helper only opens
native watches and schedules work. Retiring removes admission before closing; already
queued native or scheduled callbacks must match the current registration and turn. A
flush takes and clears the verdict before notifying listeners. This introduces an actual
testable IO boundary and replaces unbounded per-batch path storage; it does not claim a
new native filesystem watching algorithm.

| Production file         | Technical change / retained facts                                                                                                                                                                                                                                              |
| ----------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `fileWatcher.ts`        | **Unchanged**, all 25 lines, including interface comments and channel descriptor. Existing declarations are retained compatibility, not certified new authorship.                                                                                                              |
| `fileWatcherService.ts` | Registration admission/retirement and scheduled-turn identity replace inline native/timer state. Factory name, service-local decimal IDs, channel operations, log/error messages, path policy, diagnostics and lifecycle rules derive from the frozen source-exposed contract. |
| `fileWatcherBatch.ts`   | New three-state constant-space verdict replaces the Set/unknown-flag mechanism. Filename trimming, native `resolve`, exact/ambiguous output policy remain inherited compatibility rules.                                                                                       |
| `fileWatcherRuntime.ts` | New injectable native-watch/clock seam, using standard Node `fs.watch`, error listener, close and timeout APIs. It retains the existing OS behavior and 150 ms delay.                                                                                                          |

Production line total remains 197 across these four files (baseline: 25 + 147 = 172;
net **+25**). Service body is 122 lines; batch 22; adapter 28. The inherited service body
is not kept as a fallback. Searches found no old `pendingChangedPaths`,
`hasUnknownChangedPath` or `resolveFileWatchChangedPath` in owned source, emitted watcher
files or the dedicated bundle. The esbuild metafile names exactly the three changed/new
watcher implementations. Actual desktop Host output `packages/desktop/out/host/index.js`
contains the new verdict, `mergeFileWatcherSignal`, IO port and registration logic. This
is evidence that current build consumers reached this boundary; other RPC/shared/desktop
code remains outside this replacement and retains its own unresolved lineage.

Public symbol tracing found 24 static references and one public re-export, including
client remote access, service registration/accessor, remote desktop service collection,
PPTX preview, saved-workflow and workspace-tree hooks. Additional text tracing/read verified
Git auto-refresh and watched-readdir hooks. No consumer code or public event shape changed.
Actual RPC proxy, binary channel and native fixture behavior were exercised; GUI hook
mounting and whole-application native acceptance were not exercised.

## Validation evidence

Commands below used Node **24.14.0** and pnpm **10.33.2**, matching `mise.toml`. Tool
caches/downloads stayed in `/tmp`; no product filesystem permissions, user data, credential
settings, SSH code, security settings, package/lock/CI files or creation source were modified.

| Check                                                    | Result                                                                                                       |
| -------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| Inherited frozen contracts, before switch                | **13/13**, zero failures/skips                                                                               |
| New IO-port contracts, before switch                     | **0/5**, five missing-port failures; preserved as red evidence                                               |
| Final source watcher contracts + ports + native          | **21/21**, zero failures/skips                                                                               |
| Strict emitted service + RPC/shared dependencies         | **21/21**, zero failures/skips                                                                               |
| Standalone service bundle, native + binary RPC fixtures  | **3/3**, zero failures/skips                                                                                 |
| `pnpm typecheck`                                         | Pass; i18n 5,422 matching keys                                                                               |
| `pnpm lint`                                              | Pass; zero warnings/errors after resolving one snapshot-loop style warning                                   |
| `pnpm fmt:check`                                         | Pass                                                                                                         |
| `pnpm architecture:check --changed` and full check       | Pass; zero violations/baseline/new                                                                           |
| `pnpm build:cli-packages`                                | Pass; 17/17 tasks; existing dynamic-import/no-output warnings disclosed                                      |
| `pnpm --filter @knorvia/web build`                       | Pass; 7,617 modules; existing plugin/chunk warnings disclosed                                                |
| `pnpm --filter @knorvia/desktop build:no-runtime-assets` | Pass, main/host/preload and renderer; 7,631 renderer modules; no native launch                               |
| Native Linux owned fixtures                              | Nonrecursive, recursive nested file, and binary RPC event/subscription acceptance all pass                   |
| Actual third-party audit                                 | Consistent, **27 unresolved material obligations** still present                                             |
| `pnpm provenance:check`                                  | **Fails as expected: stale inventory**; root must review and regenerate shared provenance during integration |

Full `pnpm test:studio` passed: **499 test files**, **6,023 cases**, **6,015 passed**, **0
failed**, **0 cancelled**, **8 skipped**, in 419,159 ms. All new watcher cases ran and passed.
Existing concurrency 2 and 120,000 ms timeout were retained. Seven skips require Windows/
PowerShell (CUA bootstrap, five real delivery-script cases, Windows case/slash aliases);
one optional old/new Claude differential fixture also skipped. No failures were hidden or
tests changed to obtain this result.

The first emitted attempt failed three diagnostics assertions because the repository's
`#src` alias routed emitted service imports to source while the test queried a different
emitted registry. The test-only resolver now selects emitted `#src` siblings and emitted
RPC/shared roots and rejects explicit source fallback from emitted services. Assertions,
timeouts and production package imports were not relaxed. Strict reruns passed.

Reproduction from the repo root after CLI build and typecheck:

```sh
node --experimental-test-module-mocks --import tsx --test --test-timeout=120000 \
  packages/services/test/file-watcher-{contract,ports,native}-fast-20261001.test.ts
KNORVIA_FILE_WATCHER_TARGET=dist node --experimental-test-module-mocks --import tsx \
  --import ./packages/services/test/file-watcher-emitted-register-fast-20261001.mjs \
  --test --test-timeout=120000 \
  packages/services/test/file-watcher-{contract,ports,native}-fast-20261001.test.ts
```

Raw logs/metafile/bundle are in `/tmp/knorvia-lane-c-evidence/` in this execution environment.
They are local supporting evidence, not Git-delivered production artifacts. Stable log
digests:

| Log                     | SHA-256                                                            |
| ----------------------- | ------------------------------------------------------------------ |
| `baseline-contract.log` | `0ee2907b25915a36a8babc554aaee0350f00e54f9a2772aed21ff9879881d369` |
| `ports-before.log`      | `df35672328855f0b18b17186e61dddabb71e886350a790ba62d64927216cb0ef` |
| `source-final.log`      | `ba0a10388c30d51746012dcfb6e9cf6bb051608fb323221365643a16c2464dde` |
| `emitted-final.log`     | `8c53892f287737cb044a4919aa4a9ed52290bf5f07fff6861e74eba6bddae2e5` |
| `bundled-native.log`    | `fa01280e1ddb17304916fd96faa00adb7a61fa0143b63ec454175431428c77b9` |
| `third-party-audit.log` | `7e3fbecb9b31974574e4c5417616bfed8200f0ac4b70cd33111f123bbbea4d93` |

## Digest-bound technical review inputs

Full offline log `studio.log` SHA-256:
`2a25c41acd6a810d939b21fdab507e77de2ca37304c3c1f3dbf124415e9a4419`.
Emitted service JS SHA-256:
`35d8c41f360e0f8f0d6ca60de4343fe2af91c9db0389f29cd7aa2c4e82070edc`.
Desktop Host bundle `out/host/index.js` SHA-256:
`1fc0c88faf77a6091abb3c74e0c1a44ca4a53177fe9723475244e7a18829d0b9`.

These are evidence inputs for root review, not grants or accepted provenance decisions.
All paths in the first table are under `packages/services/src/fileWatcher/`:

| File                        | Final SHA-256                                                      |
| --------------------------- | ------------------------------------------------------------------ |
| `fileWatcher.ts` (retained) | `54c14389ba3c3a13d5e9e11b5b967cec4d57768adb0e85fe59d63d027ea24bac` |
| `fileWatcherService.ts`     | `6a874c651b6d0421206ae34973c09d75eb5d537e51158f1afeccd5e1665ecaf7` |
| `fileWatcherBatch.ts`       | `4e715e853724e7162c3d384bff2f5326095ebf21c3ede1a991a4192260ac10ea` |
| `fileWatcherRuntime.ts`     | `a1ff8ae6056a6890baf033b22c24a04cb6a4a6662a2fc822e4f503cd82b7c37a` |

Corresponding test paths are under `packages/services/test/`:

| File                                              | Final SHA-256                                                      |
| ------------------------------------------------- | ------------------------------------------------------------------ |
| `file-watcher-contract-fast-20261001.test.ts`     | `1866b16a8a8eebea99c8736cffdff176d3a392db5d7911f31db34d85691f0b86` |
| `file-watcher-ports-fast-20261001.test.ts`        | `4269ee2c27ef8cfaa94393c4b9f6b169b5369fa11c7a65d08957c8a47912ae9f` |
| `file-watcher-native-fast-20261001.test.ts`       | `ff6336951e07cc9064e364dc691414cffd9d6bf5ebc7b530ee2de326ea23e2d1` |
| `file-watcher-emitted-register-fast-20261001.mjs` | `defbc59e00b28178cf3b55d860a5a41be5cd381160b031fbd5119a66ba58a48f` |

Spec digest: `7df8a9afb49aa31f3e1218a77fc1f79dc5a5217be771950abd9c78febc1c990a`.
The handoff's own digest is supplied by its final Git blob, avoiding a self-referential hash.

## Remaining scope and blockers

- Full offline acceptance completed with the eight existing optional/platform skips
  detailed above; this lane introduces no skips or timeout changes.
- Native Windows/macOS watch, packaged upgrade/data protection, native GUI launch and
  manual visual acceptance were not run. Synthetic Windows-style filename handling was
  exercised on Linux, which does not constitute Windows-native acceptance.
- Dependency setup first failed at its unwritable default node-gyp cache, then progressed
  with `/tmp` caches and pinned Node. Electron binary download failed with `ECONNREFUSED`.
  Source/CLI/UI builds and scoped native filesystem/RPC tests passed using installed
  dependencies. No download/security checks were bypassed and no production runtime
  assets were prepared.
- Root must review these limited technical contributions and retained expression before
  regenerating `licensing/current-files.json` or updating reviews. The lane leaves shared
  licensing files unchanged; stale provenance is an integration prerequisite, not a claim
  that migration or rights review is complete.
- This is the first verified service/IO boundary. Further watcher or consumer scope needs
  the next assignment in this same thread. No integration/main push, merge, release or
  deployment is authorized or performed by this lane.
