# Terminal lifecycle root integration review

Root production base: `20d70402ab7773f78e06c63f07deb2c34f359610`.
Reviewed lane checkpoint: `dc05985d04ddb7c7962b68592c2d9bf7bbbdd3a1`.
All thirteen original commits after terminal planning `24aea53` were imported in
order without editing their content. The original frozen defect checkpoint,
corrective failure-first cases and later admission correction remain in history.

## What changed and what root caught

One private owner tracks pending create reservations, native PTYs, subscriptions,
emitters and diagnostic registration. Corrective transitions prevent publishing
an already-exited instance, cancel older pending creates at bulk disposal,
complete cleanup despite listener failures, avoid reentrant duplicate kills,
retain failed cleanup for explicit retry and preserve bulk error order. The
service's public declarations, native loader/helper behavior and launch/profile
semantics remain existing boundaries.

Root separately reproduced a remaining defect in lane `71647d5`: an existing
exit listener could still write to the PTY after native exit was already recorded.
The owner counted zero live PTYs but lookup still admitted the published entry.
Root withheld integration and returned the proof to the same services lane.
Its appended correction requires open, non-exited, published state at lookup.
Root's same real-Emitter/synthetic-PTY proof now yields zero writes, both native
subscriptions disposed and diagnostic open zero. The expected existing not-found
error is preserved. Previously obtained Event functions retain the disposed
Emitter behavior and snapshot semantics; no arbitrary event wrapper was added.

Native/create/cleanup ordering changes are explicitly specified as corrections,
not disguised as byte-identical behavior. The lane's original and intermediate
red assertions remain visible, including the one legacy test that intentionally
admitted the now-corrected write. No ordinary case was removed or skipped.

## Root verification

- Source focused contracts: 346/346, across 11 files
- Strict emitted focused contracts: 346/346, with all four documented selectors
  and the strict emitted loader; no source fallback
- Composition: 18 admission + 35 corrective + 53 lifecycle/RPC + 76 planning +
  164 portable/macOS profile cases
- Root typecheck and all 17 CLI build tasks passed
- Desktop main/host/preload/renderer build without runtime asset downloads passed
- Configured lint, formatting and full architecture checks passed
- Full regression: 6,687 cases, 6,621 passed, 59 existing listen EPERM
  failures, seven skips and zero cancellations. Exact failure-event multiset
  matches the preceding root material-selection run
- Eleven retained native/planning declaration/function nodes are byte-identical
  to the root base; ten other terminal files, including public contract and
  profiles, are unchanged
- The two production files exactly match the reviewed lane bytes
- Built host SHA256 matches the lane receipt:
  `3b144b1222280606598e9dd7e4aa688d4248e2716a1511f617cf93310cad7741`
  Host inclusion is static evidence, separate from executable synthetic service
  and RPC tests and from unperformed native/packaged acceptance

For strict emitted tests, use all of
KNORVIA_TERMINAL_LIFECYCLE_TARGET=dist, KNORVIA_TERMINAL_PLAN_TARGET=dist,
KNORVIA_TERMINAL_PROFILE_TARGET=dist, KNORVIA_TERMINAL_MACOS_TARGET=dist,
and the import loader documented in the lane admission receipt. Root used the
normal isolated Node test runner with experimental module mocks, tsx and
concurrency two. Full regression uses the unchanged Studio runner.

## Environment limits and source status

Before importing this code, root also retried the preceding material-selection
full suite through the tool-approved permission mode, keeping its normal runner,
isolation, test budgets and synthetic environment. It still reported 6,581 cases,
6,515 passes, the same 59 listen EPERM failures, seven skips and no cancellations.
Exact failure-event multisets matched the default-mode run. Approval did not
establish local socket capability; no further bypass or setting change was made.
The prior CI217 dual-platform success remains independent evidence for its own
exact head. Neither local failed run is described as green.

All target PTY/process/profile/filesystem/permission ports are synthetic. Real
terminal sessions, user data, credentials, network shares and host settings were
not used. Native Linux/macOS/Windows PTY, installer/portable runtime, GUI/font and
user-data-upgrade acceptance remain open. Source exposure, retained native/API
expressions and all 27 material obligations remain disclosed. No whole-service
independence, clean-room or MIT grant follows from this checkpoint. No merge,
release, deployment, dependency/CI/security or license change was performed.
