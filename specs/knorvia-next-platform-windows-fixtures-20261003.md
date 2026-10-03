# Windows path fixture portability

Continue the same native task and `rewrite/native-20261003` branch. Merge exact
integration `73e0687a78cc7354dfad0589a9e2ebedac159013` before this repair. PR17 is
merged/closed; deliver the new head for PR13 without another task/PR or main merge.

## Failure evidence and scope

Windows run37110107123 was triggered by
`7bfb867162cc11adbc237e1c39bf2d61b5c0f81e` but checked out synthetic merge
`d03df27e30768649c77d004092d7508fa8b9afbc`. Its job111166240728 reports four native
fixtures comparing POSIX string literals with native separator/drive-qualified
paths. The four tests and recording loader are unchanged between the trigger head
and integration73e0687a. The already delivered staged-ZIP traversal repair remains
in the current tree and is a separate production fix.

Only these four fixtures belong to this repair:

- `packages/desktop/src/main/browserView/electronBrowserWebmRecorder.test.mjs`
- `packages/desktop/src/main/browserView/recordingOwners.test.mjs`
- `packages/server/test/local-tar-normalized-link-safety.test.mjs`
- `packages/server/test/remote-header-proxy-contract.test.mjs`

The observed four differences are fixture portability defects. Production uses
native `node:path` for physical output/extraction paths and POSIX paths for archive
member/link validation. Do not change production paths to POSIX, normalize actual
results, compare only basenames, remove assertions, skip platforms, or claim all
Windows failures are production defects.

## Owners, ports and invariants

Each existing test owns its isolated fake filesystem/Electron/event state. Supply
one explicit absolute fixture root and public `node:path` API per variant: native
host, POSIX `/synthetic`, and Win32 `C:\synthetic`. Expected full physical paths
come from that chosen input root and fixed filenames, independently of returned
production results. Inject the selected path API through the existing recorder
loader, and through the archive fixtures' virtual dependency port. Archive loaders
use distinct per-import keys so module caching cannot reuse another variant's
state or API. No production owner, public contract, state store or data format is
added.

Retain the original native test names and add POSIX/Win32 variants of the same four
scenes. Preserve all business expectations: recorder authority/security flags,
live post-await destination, FIFO write drain, cancellation/cleanup order, artifact
metadata/dimensions/timing, phase order and error identity; tar bytes/flags/modes,
full filesystem call order, short-header bound, normalized unsafe-link rejection,
no archive publication and no link replacement. Tar member names and unsafe link
`a/../C:escape` stay POSIX compatibility data; physical paths use the selected API.
The transparent-window bootstrap and WSL parsing cases remain untouched.

## Narrow acceptance and qualification

Run only the four failing scene selectors and their path variants under pinned
Node24.14.0 with fake ports and isolated temporary test data. These Linux checks
exercise pure native/POSIX/Win32 path rules; they are not Windows OS, real Electron,
filesystem permission, installer or user-data acceptance. Do not rerun whole suites,
lint, types, builds, full architecture or rights audits. Read actual matching CI
metadata without dispatching or retrying the full workflow.

The known workflow run37111228357 for integration73e0687a is cancelled, which is
not Windows acceptance. Windows acceptance remains pending until a real matching
Windows CI job succeeds. Preserve original CI failures, frozen historical/golden
records, license/attribution and all source-exposed candidate qualifications. This
fixture repair adds zero independent-source, old-accepted or MIT credit. Record
new receipts under a separate lane evidence directory; shared CI/configuration and
global current-input/source reconciliation remain with the integrator.
