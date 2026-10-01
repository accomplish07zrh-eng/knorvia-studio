# Feedback archive boundary — fixed service lane

Branch `parallel/file-watcher-fast-20261001`, starting at immutable watcher checkpoint
`2530b5c00b5dbaeaeecba8e31e8b6e7af6dfb487`. Prior watcher commits and files are unchanged.
Root remains the only integration writer. This boundary owns
`packages/services/src/feedback/feedbackLogArchive.ts`, narrowly named feedback archive
helpers, corresponding tests/support, its [spec](../specs/knorvia-feedback-archive-fast-20261001.md)
and this handoff. No new agent/task conversation was created.

## Verified lineage and callers

Fetched recovery head is still `0d80f9ca37b1daef162ecc69bd18f6e8fc30a146`. Archive Git blob
`403f16d380611e032e49379c6c8e771ce4a69381` matches both that head and this lane. Git history
has only its imported snapshot commit; searches found no completed replacement or accepted
review. Inventory: `upstream-modified`, `NOASSERTION`, `review: null`, default Apache-2.0;
current SHA-256 `c181175769c2e809bdb0988a3ce20b745db44af1a417f40089cc67bfc8f808ba`;
upstream blob `1d90a00ab73550b493d041453ae6235e84bb9bf4`.

Static references identify desktop `exportLogs.ts` import and wrapper call plus the
services/node public re-export. The wrapper provides app logs, selected CLI logs and
computer-use exit logs. It does not upload anything at this boundary. Existing manual
export security tests exercise a different collector; no direct archive contracts existed.
Security spec and shared public redactor were read and remain unchanged.

The author read baseline source to extract contracts. This is source-exposed development,
not clean-room evidence or a whole-file MIT decision. Root must assess digest-bound
contributions and retained compatibility expression. LICENSE/NOTICE, preview identity,
shared provenance, credentials/security settings and all 27 material obligations remain.

## Pre-replacement evidence

Local freshness passed; ordinary Git fetch initially failed on the environment proxy.
Approved fetch succeeded for the lane and recovery refs and confirmed the hashes above.
Pre-edit changed architecture check passed with zero violations/baseline/new. Generated
`services` context is legacy/unmanaged with no module contract or direct dependency
contracts; this does not prove the whole services module is migrated.

Pinned Node 24.14.0 and pnpm 10.33.2. Initial restricted child test invocations reported only
file-level passes (including the previously verified watcher and shared tests), so those
outputs were not counted as case acceptance. In-process diagnostic execution confirmed
actual cases; the approved normal child runner then confirmed **25/25** inherited contracts,
zero failures/skips. It preserves standard process isolation and 120,000 ms timeout.

A further synthetic construction-failure contract is red against inherited source:
`zip.addBuffer` failure rejects and removes the operation directory while both already
started streams remain undestroyed. The correction must settle them before cleanup and
retain the original construction error/cleanup-error precedence. No OS permission changes
or real log/credential/account data are used in these tests.

## Implemented boundary

The operation now consumes an explicit-frame depth-first candidate iterator, then one
opened-file snapshot result per candidate. Traversal alone owns its global visit count;
the snapshot reader owns and closes its handle; the archive operation owns accepted
entries, accounting, skip counts and its temporary directory. A pure local policy helper
defines calendar/admission/decoding rules. The ZIP writer consumes the completed ordered
projection. Synchronous construction failures destroy and settle both streams before
operation cleanup, preserving the original error and cleanup-error precedence.

This is a structural state/IO reconstruction rather than a rename of the old recursive
implementation. Compatibility expressions remain: the public option/result shape,
allowlist and admission rules, TextDecoder use and the existing C0 rejection loop, native
open flags, skip reason strings, exact about.txt
labels/descriptions, and the existing public shared redactor. Those retained expressions
and source exposure must be considered by root's digest-bound review; no entire-file
independence, MIT eligibility, or legal conclusion is asserted here.

Owned production paths:

- `packages/services/src/feedback/feedbackLogArchive.ts` — operation and ZIP lifecycle.
- `packages/services/src/feedback/feedbackArchiveCandidates.ts` — ordered scan frames.
- `packages/services/src/feedback/feedbackArchiveSnapshot.ts` — bounded opened-file IO.
- `packages/services/src/feedback/feedbackArchivePolicy.ts` — pure compatibility policy.

Corresponding support is confined to `packages/services/test/feedback-archive-*-fast-20261001.*`,
the scoped spec and this document. Frozen native/IO assertions and fixtures from contract
checkpoint `8c4cfb754aff01c109875ff3db5c8680e4c5741d` are unchanged. The additional consumer
test calls actual desktop `exportLogs.ts` with every module-load path isolated before
import, verifies app/CLI/direct-helper selection, redaction, progress and unchanged source
fixtures, and separately verifies actual yazl path rejection/cleanup. The emitted loader
changes only the requested test process: services/node, shared, RPC and services `#src`
resolve to emitted files; source fallback from emitted services is rejected.

## Validation receipt

Pinned Node **24.14.0**, pnpm **10.33.2**. Logs/artifacts are in
`/tmp/knorvia-feedback-archive-evidence` in this execution environment; they are not
uploaded diagnostics or committed user data.

| Check                                        | Observed result                                                         | Evidence                                                  |
| -------------------------------------------- | ----------------------------------------------------------------------- | --------------------------------------------------------- |
| Inherited frozen contracts                   | 26 cases: 25 pass, one stream-settlement regression fails, zero skips   | `baseline-frozen.log`                                     |
| Final source contracts + desktop consumer    | 28 pass, zero failures/skips                                            | `source-final.log`                                        |
| Emitted contracts + emitted desktop consumer | 28 pass, zero failures/skips                                            | `emitted-final.log`                                       |
| Standalone emitted archive bundle            | 12 frozen native cases pass, zero failures/skips                        | `bundle-contract.log`, `archive-bundle-meta.json`         |
| Root `pnpm typecheck`                        | Pass; 5,422 locale keys match                                           | `typecheck.log`                                           |
| Root `pnpm lint`                             | Pass; zero warnings/errors                                              | `lint.log`                                                |
| Changed/full architecture                    | Pass; zero violations/baseline/new                                      | `architecture-changed-final.log`, `architecture-full.log` |
| `pnpm fmt:check`                             | Pass                                                                    | `format.log`                                              |
| CLI packages                                 | 17/17 build tasks successful, 16 cached                                 | `build-cli.log`                                           |
| Desktop `build:no-runtime-assets`            | Pass: main/host/preload and renderer artifacts                          | `build-desktop.log`                                       |
| Offline studio regression                    | Pass: 502 files, 6,051 tests; 6,043 pass, zero fail, eight skips        | `test-studio.log`                                         |
| Read-only provenance freshness               | Fails: current-files inventory is stale, as expected after lane changes | `provenance-check.log`                                    |
| Read-only material audit                     | Consistent; 27 unresolved obligations remain                            | `material-audit.log`                                      |

The bundle metafile lists all four owned production files and no alternate archive
implementation. Shared redaction/build facts and yazl remain external dependencies;
this is not a claim that the entire dependency graph was independently replaced. Actual
desktop production output also contains the new iterator, snapshot and settled-writer
code in its generated main chunk. The initial standalone test could not locate external
yazl from `/tmp`; a test-only resolver to the installed workspace dependency corrected
that harness failure. The final 12-case receipt counts actual cases, not a file-level pass.

CLI retains its dynamic-import-options build warning and skips the Windows CUA driver on
this Linux host. Desktop retains chunk-size and plugin-time warnings. None were suppressed
or converted into claims of native acceptance. No test expectation, timeout, lockfile,
shared package configuration, CI or creation code was changed.

Reproduce the focused source receipt from the repository root with pinned tools:

```sh
node --experimental-test-module-mocks --import tsx --test --test-timeout=120000 \
  packages/services/test/feedback-archive-*-fast-20261001.test.ts
```

After `pnpm typecheck`, reproduce the emitted receipt with the same frozen cases:

```sh
KNORVIA_FEEDBACK_ARCHIVE_TARGET=dist node --experimental-test-module-mocks \
  --import tsx --import ./packages/services/test/feedback-archive-emitted-register-fast-20261001.mjs \
  --test --test-timeout=120000 packages/services/test/feedback-archive-*-fast-20261001.test.ts
```

The environment assignment above uses POSIX shell syntax; set the same test-only variable
through the Windows shell's environment mechanism when validating there.

## Production digest receipt

| File                           | SHA-256                                                            |
| ------------------------------ | ------------------------------------------------------------------ |
| `feedbackLogArchive.ts`        | `a056f81444db856597f7872a01b98014523488c3ac90ec79c984b9fc69a4d34a` |
| `feedbackArchiveCandidates.ts` | `b1b0e4c98eb800e845a0d2fe71d522bf877fa909e1124b23003cf7419c37d39e` |
| `feedbackArchivePolicy.ts`     | `7b8a7a6e0fea314c37a20702d306b416072aaa5d9a28971b7b263b580fa7c509` |
| `feedbackArchiveSnapshot.ts`   | `b9c7ec24e7f02562066fb76a7b47e5cf387cbdc49a579afea966edef7288974c` |

The four production files total 277 lines versus the inherited entrypoint's 187 (+90).
This size change is evidence of scope, not evidence of licensing eligibility.

## Integration and remaining limits

Root must regenerate shared provenance and review contributions after applying original
lane commits. This lane deliberately does not edit licensing/current-files.json or reviews.
LICENSE, NOTICE.md, preview identity and the 27 unresolved material obligations remain.
No archive upload, account access, production action, merge or integration-branch push
occurred. Prior watcher paths are byte-for-byte unchanged from `2530b5c`.

The eight studio skips are seven Windows/PowerShell cases and one existing Claude leaf
old/new receipt. The 28 archive cases have zero skips. The unchanged runner completed in
456,201 ms with its existing 120,000 ms per-test timeout and concurrency of two.

Linux owned-fixture acceptance and synthetic race/error ports are verified. Windows and
macOS native filesystem acceptance and a launched Electron feedback UI were not run on
this Linux host; Electron's binary download was previously blocked by ECONNREFUSED.
The desktop build omits runtime-assets preparation by its existing command, so it is not
a distributable native runtime acceptance receipt. Stop at this boundary and await root's
next scoped assignment in this same fixed service lane.

Original new commits, in order:

- `8c4cfb754aff01c109875ff3db5c8680e4c5741d` — spec, baseline contracts and initial handoff.
- `42d846c1378fb6f4438db92eb6a84b9674a02ab8` — reconstructed archive state/IO boundary and real consumer checks.
- Final documentation checkpoint at branch tip — completed validation receipt only.
