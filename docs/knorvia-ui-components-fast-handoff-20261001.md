# B5 UI components Fast lane handoff

2026-10-01. Branch `parallel/ui-components-fast-20261001` was created directly
from exact integrated head `0d80f9ca37b1daef162ecc69bd18f6e8fc30a146` after
fetching `recovery/independent-logging-20260930-0456` and confirming its fetched
head. Freshness passed (ahead 65 / behind 0 against origin/main); the new lane
initially had no remote tracking branch. B1–B4 were already integrated and were
not reworked. No child tasks or additional conversations were created.

This is a source-exposed candidate checkpoint for all three assigned B5
entrypoints. It is **not an accepted independent-authorship, MIT, full visual or
native acceptance result**. No licensing decisions or shared provenance were
written. Root remains the integration writer and must review/regenerate shared
provenance after integration. LICENSE, NOTICE, preview identity, security
configuration, package/lock/CI files and all 27 unresolved material obligations
remain unchanged. No production deployment, release, merge, secrets, SSH or
user-data access occurred.

## Original commits

Apply in order; the final handoff commit adds this receipt and portable test-path
handling, with no production source changes after `1b6901d`:

- `41c54dcef6ca6cc9e325a50cb2b7066d17d701d5` — test(ui): freeze B5 scroll DOM and consumer contracts
- `05719b10833cd15dd948582e3e12d81278c4e56d` — refactor(ui): replace scroll fade lifecycle with measurement owner
- `180aef03dbfbb8050b71f6cc2c5688381efaeb54` — test(ui): freeze metric preference and toast presentation contracts
- `cd73d17350619621a887658c201e22e9c4c5dada` — refactor(ui): render metric slots from presentation descriptors
- `954df19b33e6f85c28de9831e07f2f2dde2ad47a` — test(ui): freeze toast admission timers actions and anchor lifecycle
- `05288b7c8c27f7c6104a966046bbf49979eae5e6` — test(ui): strengthen B5 legacy edge and actual consumer coverage
- `1b6901dfd3f107b9409deaa16316c1c8879c180f` — refactor(ui): route toast commands through explicit admission and projection
- `54e50f70d89cd59a40148565b83ae08890001522` — test(ui): make B5 emitted-consumer evidence reproducible

The final handoff commit SHA is the branch head; it cannot be written into its own
contents. All production source hashes below are unchanged from production
commit `1b6901dfd3f107b9409deaa16316c1c8879c180f`. Build receipt checks each
source against both current disk and `git show HEAD:<path>`.

## Owned paths and design

Eight production paths, all under `packages/ui/src/components/ui/`:

- `scroll-fade-viewport.tsx`, `scroll-fade-controller.ts`
- `flip-metric-value.tsx`, `flip-metric-preference.ts`
- `toast.tsx`, `toast-admission.ts`, `toast-anchor-position.ts`, `toast-presentation.tsx`

Eight narrowly named test/support paths under `packages/ui/test/`:

- `ui-b5-component-views-20261001.test.ts`
- `ui-b5-view-cases-20261001.ts`, `ui-b5-view-hashes-20261001.json`
- `ui-b5-scroll-contracts-20261001.dom.mjs`
- `ui-b5-metric-contracts-20261001.dom.mjs`
- `ui-b5-toast-contracts-20261001.dom.mjs`
- `ui-b5-dist-guard-20261001.mjs`, `ui-b5-emitted-consumers-20261001.mjs`

Also owned: `specs/knorvia-ui-b5-components-20261001.md` and this handoff.
No other lane's source changed. Net production diff: +559 / -589 lines (-30).
All source files remain below the architecture's 400-line limit.

Scroll fade now has a measurement controller owning listener/observer/frame
lifecycle. It publishes a four-state projection from the same consumer-owned
scroll node and never writes scrollTop. The metric derives positional Unicode
slot descriptors and isolates its per-mount media-query subscription. Motion
still owns prescribed digit entrance/exit. Toast uses a pre-mount command mailbox
and a reducer-driven React projection; anchor geometry and presentation are
separate bounded helpers. No store/service/protocol/platform ownership moved.
Architecture context identifies the existing unmanaged `ui` module, with no
managed contract or declared requirements. No module-policy changes were made.

Smallest boundary was reported after its seven frozen scroll contracts passed,
before expanding to metric and toast. Spec and relevant old-source tests were
committed before each production entrypoint replacement. Additional edge tests
were verified afterward against saved exact-baseline bytes. The original 40
SSR snapshots were never regenerated after candidate code began.

## Source exposure and inherited constraints

The author read all three legacy sources and their consumers to extract behavior.
The integrated inventory reports scroll/metric upstream-unchanged and toast
upstream-modified, with no accepted review. All three trace to repository snapshot
`7619e41`; the inventory relates them to fixed upstream
`zai-org/ZCode@872ad960de7ec172591f7e1952f7849229f94521`. That inventory is lineage
evidence, not an authorship/license determination. No additional upstream source
was restored into the product worktree.

Exact old source SHA-256:

| Entry                    | SHA-256                                                            |
| ------------------------ | ------------------------------------------------------------------ |
| scroll-fade-viewport.tsx | `50e5984232b6a7d59e872aab4ebb36ae837e2865e3a770adbc234b61c2531da1` |
| flip-metric-value.tsx    | `ce2d6cf063003e1023191b0fa4e3eb9b365e04a14eb0d498b897326600bf4071` |
| toast.tsx                | `e60744e13e9e4844679ae9a06a0b5ccf032a58944db3434091d71ed43809fc4b` |

The new structure was implemented from the frozen spec. Required DOM, class
strings, interface shapes and small contract expressions remain inherited
presentation/API constraints. Structural separation and passing tests alone do
not prove independent authorship. Each production file retains Apache-2.0 and
explicit pending-review comments. New tests/docs also receive no blanket MIT
claim here. Shared reports will be stale for these bytes until root regenerates
them; `provenance:check` was not claimed to pass.

Preserved baseline limitations include repeated host creation before React effect
registration, uncancelled entry/exit callbacks, no added toast live-region role,
and inherited `text-sm` in notice content. Changing these would require an
explicit behavioral/visual spec change. No test, security rule or timeout budget
was relaxed to avoid them.

## Validation evidence

Node 24.14.0 and pnpm 10.33.2 were installed inside the writable workspace. Product
dependencies used the frozen lockfile; supplemental jsdom 26.1.0 lives outside
the product dependency graph. Gates on the final production bytes:

| Gate                                                    | Actual result                                                              |
| ------------------------------------------------------- | -------------------------------------------------------------------------- |
| Old source contracts, including strengthened edges      | 64/64, zero skip                                                           |
| Candidate source contracts                              | 64/64, zero skip                                                           |
| Actual UI dist contracts with source fallback rejection | 64/64, zero skip                                                           |
| All existing `packages/ui/test/*.test.ts` plus B5 SSR   | 588/588, zero skip                                                         |
| Root `pnpm typecheck`                                   | pass; 5422 i18n keys; actual UI dist emitted                               |
| Root `pnpm lint`                                        | pass; zero warnings/errors after sparse-fixture construction was corrected |
| Test-specific TypeScript noEmit                         | pass                                                                       |
| Changed/full architecture and verify:pre-push           | pass; total/baseline/new violations zero                                   |
| Web production build                                    | pass; actual maps/consumers/CSS verified                                   |
| Formatting and diff                                     | owned files formatted; final root format/diff checked at checkpoint        |

The 64-contract count comprises 40 exact SSR markup comparisons, one public pure
toast-boundary test, four metric DOM/consumer tests, seven scroll DOM/consumer
tests and twelve toast runtime/anchor tests (including the parent test). It is
not additive with the 588-test suite, which includes the 41 SSR/pure tests.
Frozen snapshot file SHA-256:
`37f1d50d463bb8f93254ba15f2c03c1f358c43a7a5ee262f596f3969d8a7a480`.

DOM tests use real React/ReactDOM in jsdom, with simulated geometry, timers,
animation frames, media queries and ResizeObserver. Mutation delivery uses
jsdom's MutationObserver wrapped in React act. They exercise the actual unchanged
`ExecuteOutput` and `renderDiffCount` consumers. The background Bash side pane is
included in the real Web build and maps, but its service-backed interaction was
not run. SSR/DOM classes and ARIA are supported evidence, not screenshots,
computed browser layout, native keyboard activation or animation proof.

Early environment/harness failures were retained in scratch logs: dependency
installation initially tried an unwritable default cache; architecture initially
lacked TypeScript before dependencies; temporary baseline JSX configuration did
not include the external baseline directory; and the real diff consumer needed
jsdom's customElements API. Correcting those harness/tool locations yielded the
passing gates above without modifying product behavior. Initial anchor tests
reported act warnings on both old/candidate source; wrapping mutation delivery
in act corrected the harness. The CSS receipt initially expected unminified
`to bottom`; inspection confirmed valid optimized gradients and the receipt now
checks all three exact standard/WebKit declarations. Frozen behavioral tests
and the original markup snapshots were not weakened.

Web build warnings remain: chunks over 500kB and ineffective dynamic imports for
PDF/PPTX/Office preview content. No chunk-size limits or build budgets changed.

## Actual emitted consumers

The persistent `ui-b5-emitted-consumers-20261001.mjs` gate checks exact source-map
sourceContent against disk and committed bytes for all eight owned production
files plus `ToolCallBlocks/renderers.tsx`, `ToolCallBlocks/renderers/ExecuteOutput.tsx`
and `app-shell/BackgroundBashOutputSidePane.tsx`. All eleven were present and
matched. It records emitted UI JS digests and confirms compiled 24px standard/
WebKit masks and `bottom:calc(1rem + env(safe-area-inset-bottom))`.

| Owned production filename | Source SHA-256                                                     | UI dist JS SHA-256                                                 |
| ------------------------- | ------------------------------------------------------------------ | ------------------------------------------------------------------ |
| flip-metric-preference.ts | `a1d0f0ce87aa2e75cf3244a82abb01de31504b763294a75c8e354d12d1b538e2` | `4f5a8650619da507ea9ec6b3601108d1fb7d2fb7c4675123f9d128479073e8a5` |
| flip-metric-value.tsx     | `7259c152adcf1329f3cace6c745aad376ad8eee42ea988a7e1184d639cf050a5` | `5b462d4eabc51225d279f1c2fcdafb7cc105007fb311920d7e26b0e06422f728` |
| scroll-fade-controller.ts | `f332201cf254196d435f638088893e0b40d588caf73fbb86361c6325d24e83b5` | `df8014753029ea9a5d1b899536af484edab34d17ea0c4c8371c81b86368400b9` |
| scroll-fade-viewport.tsx  | `9f27251ed4f1541701931849007e24edb35c1fccc689a6c4f437d0fe7a247f38` | `0a6a8dc62e1e34c0bc64d95875e2ae5767573fb84c9c1686de661b657d2f0960` |
| toast-admission.ts        | `c7d9ee1f1d4e5508c7279d12e9d19bc59b832503e78eb85f46f161e238797d04` | `eda3de256fc28bfef2583dec2cf58004c3b7f26dfbd8a558309444148a3f38fd` |
| toast-presentation.tsx    | `6b0419d99af3e23f96c4d0d0796b44b012b5a9e805b72c309520a3399e59bcc4` | `93b775d3d37a5d0fe73d8db2ae439e9c98b03b9a19f97be1d3ae0cc2cb31fc18` |
| toast-anchor-position.ts  | `b82ebdb469d5a430b54ec96d8f1297035348e1f10a1d178258fe36809d018568` | `dca4c002023c19a9d6f08b21e85384ca8ddf6c37c65084750953e1377a12fa2a` |
| toast.tsx                 | `44657f79603c0fa2ebd83256e4d851737971fa78fced4e83506caa42263c889a` | `525fb3c7bd2e89cffa3c8b087f7db1c3c50550febcc5bde945d16d2e321a4963` |

| Web artifact                    | SHA-256                                                            |
| ------------------------------- | ------------------------------------------------------------------ |
| index-C6baA9UJ.js               | `b3f6aa4821497cdf172a25d018453dca0c661f432f5c8748a4dc95158272e86f` |
| index-C6baA9UJ.js.map           | `2b7f72b725af8f26887c4ca0b7cbb4db2197b970e37f4f383f620da33365aea9` |
| toast-C3GZL_ML.js               | `62b1ac34a4b2fbb27d9536eece5fdf789590e7aac818afe2119fe958e9d9e17f` |
| toast-C3GZL_ML.js.map           | `8abb5b048c0c6bf5c2bb38e054fd2341f84b0695acdf8925e5a6baaca4468713` |
| StudioWorkflowPage-oIc25VWw.css | `c5f1e493d670c536fafcaf84b74dca9be8fbc3b8252a0c723becd649f7802d68` |
| index-CQ6sJAfT.css              | `3451589e7bc94abb41abe04a3fe5a0cf3b6883c110dd5dec7017fb068b2c968b` |
| pdf-viewer-Dgb4oCkS.css         | `cec379399077b0d7d3a9edc86507037a309091ef77cddcce6f6f5835fb635e46` |

## Reproduction and remaining gates

From repository root, with the pinned toolchain and existing frozen workspace
dependencies, install the supplemental DOM dependency into your own scratch
folder (no product manifest/lock edits):

```bash
b5_tmp=$(mktemp -d)
npm --cache "$b5_tmp/cache" install --prefix "$b5_tmp/dom" jsdom@26.1.0
KNORVIA_UI_B5_DOM_DEPS="$b5_tmp/dom" TSX_TSCONFIG_PATH=packages/ui/tsconfig.json \
  node --import tsx --test packages/ui/test/ui-b5-component-views-20261001.test.ts \
  packages/ui/test/ui-b5-scroll-contracts-20261001.dom.mjs \
  packages/ui/test/ui-b5-metric-contracts-20261001.dom.mjs \
  packages/ui/test/ui-b5-toast-contracts-20261001.dom.mjs
pnpm typecheck
pnpm --filter @knorvia/web build
node packages/ui/test/ui-b5-emitted-consumers-20261001.mjs
```

For compiled contracts set `KNORVIA_UI_B5_DIR` to the absolute UI dist directory,
`KNORVIA_UI_B5_EXT=js`, and `TSX_TSCONFIG_PATH` to a scratch JSON tsconfig whose
`compilerOptions.paths["@/*"]` points only to that absolute dist `/*` path.
Add `--import ./packages/ui/test/ui-b5-dist-guard-20261001.mjs` after
`--import tsx`. No UI/src fallback is allowed. For baseline contracts materialize
only the three old entrypoints and the unchanged two tested consumer files from
the exact base into an external directory with ESM package.json, matching JSX
configuration and dependency resolution; point the two consumer aliases to the
old metric/scroll entrypoints. The scratch config must include that external
baseline directory. Never regenerate the snapshot JSON from candidate output.

Scratch logs/receipt on this executor are under `/tmp/knorvia-b5-validation`;
those paths are not portable deliverables. Persistent tests, spec, hashes and this
receipt provide the reproducible handoff. Path handling uses fileURLToPath and
normalizes receipt separators; Windows execution itself was not performed.

Native/browser acceptance is blocked, not passed or silently skipped. With
`chromiumSandbox:true`, Chromium aborted at
`setuid_sandbox_host.cc:166`: its SUID helper must be owned by root with mode 4755.
Observed `/usr/lib/chromium/chrome-sandbox` owner is `nobody`, mode 4755. No
sandbox bypass, permission/security adjustment, or inherited browser profile was
used. Electron postinstall separately failed ECONNREFUSED to GitHub
`140.82.114.3:443` and the configured mirror `47.96.233.62:443`; other workspace
JS dependencies and native node-pty/cpu-features installed successfully.

Remaining work for root: per-file independent-authorship/license review and
shared provenance regeneration; real-browser light/dark desktop/mobile geometry,
focus, Tab/Enter, reduced-motion and animation screenshots; native desktop
acceptance; Windows/macOS acceptance and combined integration CI. No full
workspace CLI build/offline suite, real-model, upgrade, release or deployment
acceptance is asserted by this UI-only lane. Stop at this clean checkpoint and
reuse this conversation for the next assignment.
