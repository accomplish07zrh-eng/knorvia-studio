# macOS terminal profile checkpoint — fixed services lane

Start `be96657486da1dd56841ab4b162f3b9146d03286`; branch
`parallel/file-watcher-fast-20261001`. Keep all watcher/archive/portable commits and paths
immutable. Scope: terminalProfileMacOs.ts, narrow macOS helpers/tests,
[spec](../specs/knorvia-terminal-profile-macos-fast-20261001.md) and this receipt.
No new agent/conversation. Root alone integrates and updates shared provenance.

Fetched recovery `08255eca46ea14de63dcead1a2ca76194187b772` and lane start both retain
Mac blob `153a19560f824d032421f60a7a5fe0150471bf6e`, SHA-256
`e25ea5af453dcf05352f19f0e77452e3c02ddde44822a3059badaced50bf5c77`.
Only imported snapshot history, upstream-unchanged/NOASSERTION/review-null inventory;
no completed independent replacement. Public types blob
`c4218bf29ff3415c5e32d8863f1e6bf629fba607` stays immutable. Current portable factory
import and actual service create call were read and remain the existing consumer path.

Freshness: ahead74/behind0 versus origin/main; branch has no tracking setting, so lane
remote equality was verified separately after fetch. Changed architecture: zero
violations/baseline/new. Services context is legacy/unmanaged, with no declared module
contract or discovered dependency contracts. Existing direct Mac tests were absent;
portable tests stub the factory and do not prove its behavior.

Before source changes, 104 inherited Mac cases passed, zero failures/skips. Tests freeze
failure-first plist admission/conversion, precedence, paths, descriptor/archive grammar,
all theme fields/order, component thresholds/aliases, errors, privacy and repeated calls.
Ten cases exercise the real portable caller (five) and real Darwin service create (five)
with the real Mac provider, fake PTY/plutil/filesystem/home and blocked CJS native-helper
ports. Fixtures are owned virtual maps; no real files/preferences/commands are accessed.
Baseline log: `/tmp/knorvia-terminal-macos-evidence/baseline-initial.log`.

The author read inherited source: this is source-exposed reconstruction. Retained values,
regex grammar and declarations need root's expression/rights review. No clean-room or
blanket MIT conclusion. LICENSE/NOTICE, preview identity and all 27 material obligations
remain. Linux fake-platform acceptance is not native macOS acceptance. Native plist
conversion/errors, terminal/PTY launch and actual font/color rendering remain untested.
The completed implementation, emitted/build/regression and digest receipts follow.

## Implemented boundary and retained expression

`47da65e10293dcce9fed5d0cc660b6ad8a2a5cf6` freezes spec, contracts and the initial
receipt before entrypoint changes. `540252de372398796da7c94426ff22cd0089c44a` replaces
the source structure. The frozen tests are byte-for-byte unchanged after the first commit.

The factory now creates both app detectors from one ordered registry. Each invocation
resolves home and delegates platform/existence admission, one plist conversion and object
validation through explicit read-only ports. Existence errors remain outside the silent
conversion catch. No cache or additional IO path. One pure lazy candidate stream ranks
iTerm defaults and Terminal references; one ordered schema projects all theme fields.
RGB conversion uses scale selection; terminal ANSI keys derive from the frozen palette.
Descriptor display normalization uses suffix spans and hyphen token joining. Theme output
is built from selected entries, preserving alias and insertion order. The old duplicated
app detector loops and imperative theme writers are removed, with no old-code fallback.

This is structural and algorithmic reconstruction after reading inherited source. It is
not an assertion that every expression is new. Retained expressions/facts include:

- Private TerminalProfileDetector type shape, public factory name/return shape and darwin
  eligibility; unchanged public terminalProfileTypes declarations are not counted migrated.
- Detector IDs/order, plist filenames, Library/Preferences path segments and the HOME /
  USERPROFILE / homedir precedence expression; literal keys and font/theme result fields.
- `plutil` executable/argument order and UTF-8, windowsHide, 2-second, 2-MiB options;
  JSON.parse object-root checks, strict default-marker true and truthy presence semantics.
- Descriptor unsigned size regex grammar and optional `toString()` coercion, parseFloat,
  inclusive font-size bounds, base64/latin1 and the long archived font-name matching regex
  (Mono, Code, Nerd, Powerline, Console, Menlo, Monaco, Courier, Cascadia, Consolas, Hack,
  Meslo). The archive matching expression is retained exactly for behavioral compatibility.
- Palette/color aliases, defined-component selection, channel scales 1/255/65535, RGB
  rounding, three-decimal alpha and hex padding. Accepted string-color grammar preserves
  legacy permissiveness; schema construction changes the algorithm, not these values.

These are disclosed inputs for root's expression/rights review. Exact-name removal, line
reduction and successful tests do not establish clean-room authorship or copyright/license
clearance. No MIT header or shared review/provenance decision was added. Other inherited
services, platform adapters, libraries and public declarations remain outside this scope.

Owned production files:

| File                            | SHA-256                                                            |
| ------------------------------- | ------------------------------------------------------------------ |
| `terminalProfileMacOs.ts`       | `703f953469e223bd409671d686776518b64fb6e70170918bc1884aeedd13fd52` |
| `terminalProfileMacOsDecode.ts` | `a54ac244a4264bb01ff12a1752139452adc2eda44db9f71a58de249ddd8d685d` |
| `terminalProfileMacOsPlist.ts`  | `c16279d4cd983328c2dc8c7dcce91e07df4741593b01fde68c38b8924c5ed364` |

Three source files total 253 lines versus 367 before replacement (-114). The two narrow
new tests total 765 lines; spec and receipt are scoped to this boundary. No managed module
or new cross-package edge is introduced; services remains the existing legacy module.
Mutable search state belongs only to each invocation; no events, leases or replay state
are introduced. This synchronous consumer path preserves existing call/error ordering.

## Validation receipt

Pinned Node 24.14.0/pnpm 10.33.2. Standard subprocess test isolation and existing
120,000-ms timeout; no timeout budgets, expectations or security checks were relaxed.
Evidence directory: `/tmp/knorvia-terminal-macos-evidence`.

| Check                                                 | Actual result                                                                                                                   | Evidence file                                              |
| ----------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------- |
| Inherited Mac baseline                                | 104 pass, zero failures/skips                                                                                                   | `baseline-initial.log`                                     |
| Final source, including immutable portable regression | 164 pass (104 Mac + 60 portable), zero failures/skips                                                                           | `source-final.log`                                         |
| Final emitted modules and real emitted consumers      | Same 164 pass, zero failures/skips                                                                                              | `emitted-final.log`                                        |
| Real Mac consumer subset                              | Five actual portable, five actual service create cases; fake ports; included above                                              | Focused logs                                               |
| Root typecheck                                        | Pass; 5,422 matching locale keys                                                                                                | `typecheck.log`                                            |
| Root lint                                             | Pass, zero warnings/errors                                                                                                      | `lint.log`                                                 |
| Changed/full architecture                             | Pass, zero violations/baseline/new                                                                                              | `architecture-changed.log`, `architecture-full.log`        |
| Root formatting                                       | Pass                                                                                                                            | `format-source.log`, `format-final.log`                    |
| CLI build                                             | 17/17 successful, 16 cached                                                                                                     | `build-cli.log`                                            |
| Desktop build:no-runtime-assets                       | Pass, main/host/preload and renderer                                                                                            | `build-desktop.log`                                        |
| Bundle inputs/output                                  | All three Mac + four immutable portable inputs; new owner/decoder in production host, seven distinct legacy Mac routines absent | `profile-bundle-meta.json`, `production-host-receipt.json` |
| Full offline studio regression                        | Pass: 507 files; 6,215 cases, 6,207 pass, zero failures, eight skips                                                            | `test-studio.log`                                          |
| Read-only material audit                              | Consistent; all 27 unresolved obligations remain                                                                                | `material-audit.log`                                       |
| Read-only provenance check                            | Fails: stale current-files inventory; root must regenerate/review                                                               | `provenance-check.log`                                     |

Source/emitted cases run the real Mac factory, immutable portable resolver and unchanged
terminalService.create. All preference/config files are owned in-memory fixtures. Native
process/filesystem/home ports are mocked; PTY is fake. The Darwin service's CJS node-pty
helper load and resolution are replaced with an owned fake and missing fake helper; no
native module load, executable access, chmod or real PTY launch. Consumer process.env has
only synthetic values and Node's IPC marker. Private unrelated fixture fields never appear
in result objects; fixture bytes and environment inputs remain unchanged.

The unchanged portable strict emitted loader directs shared/RPC and services `#src`
imports into dist and rejects emitted-services source fallback. The Mac factory itself
is not mocked in Mac consumer tests. No test merely substitutes a prebuilt provider result.
Desktop host output contains readTerminalProfileMacOsPlist, decodeTerminalProfileMacOs,
factory, portable plan and resolver. Distinct legacy readMacOsPlistFile,
readMacOsFontDescriptor, readMacOsArchivedFontName, detectIterm2Profile,
detectMacOsTerminalProfile, readMacOsTerminalTheme and readIterm2Theme names are absent.
Production host SHA-256:
`407a6563ce64e4044ef921ceac5fcdf102a9ebab88e12afedb08a53afb8c9b2e`.
Production host source maps are disabled by existing configuration, so named output plus
the separately generated scoped metafile is the available graph evidence. The standalone
bundle is compilation evidence, not a bundled runtime test or whole-product independence.

The full unchanged runner completed in 449,864 ms. Its eight skips are seven existing
Windows/PowerShell cases and one existing Claude leaf old/new receipt. All 104 Mac and
60 portable cases have zero skips. Required pre-push lint/architecture also passed;
`verify-pre-push.log` records it. `scope-receipt.json` verifies exactly seven owned paths,
unchanged frozen assertions and immutable prior checkpoints.

Existing CLI dynamic-import-options and Windows CUA build-host skip remain; desktop
chunk-size/plugin-timing warnings remain. No build settings were changed to suppress them.

Focused reproduction, from repository root with pinned tools:

```sh
node --experimental-test-module-mocks --import tsx --test --test-timeout=120000 \
  packages/services/test/terminal-profile-macos-*-fast-20261001.test.ts \
  packages/services/test/terminal-profile-portable-*-fast-20261001.test.ts
```

After root typecheck emits modules:

```sh
KNORVIA_TERMINAL_MACOS_TARGET=dist KNORVIA_TERMINAL_PROFILE_TARGET=dist \
  node --experimental-test-module-mocks --import tsx \
  --import ./packages/services/test/terminal-profile-portable-emitted-register-fast-20261001.mjs \
  --test --test-timeout=120000 \
  packages/services/test/terminal-profile-macos-*-fast-20261001.test.ts \
  packages/services/test/terminal-profile-portable-*-fast-20261001.test.ts
```

Environment assignment syntax above is POSIX; use the Windows equivalent there.

## Native gaps and stop point

Linux synthetic acceptance is not native macOS acceptance. Real plutil conversion of
binary/XML/NSKeyedArchiver preferences, permission/OS-specific failures, actual macOS
home/path behavior, terminal/PTY launch and font/color rendering were not run. No real
user preferences, profiles, logs, credentials/account data, shares or settings were read;
no defaults command, application launch, OS/settings/security change occurred.
Windows native acceptance and launched Electron GUI/packaged-runtime acceptance were
not performed. Electron runtime download was previously blocked by ECONNREFUSED;
this build skips runtime-assets preparation and is not distributable native acceptance.

Watcher/archive/portable source, tests/specs/receipts and public types/service remain
byte-for-byte unchanged from be96657. LICENSE/NOTICE, preview identity, shared provenance,
package/lock/CI and other-lane source are unchanged. No integration-branch push, merge,
release or deployment. Root alone reviews/applies original commits and regenerates
shared provenance. This lane stops at the verified Mac boundary and awaits work here.

Original commits, in order:

- `47da65e10293dcce9fed5d0cc660b6ad8a2a5cf6` — frozen spec, contracts and initial receipt.
- `540252de372398796da7c94426ff22cd0089c44a` — reconstructed macOS state/IO and projection boundary.
- Final documentation checkpoint at branch tip — completed acceptance and native-gap receipt only.
