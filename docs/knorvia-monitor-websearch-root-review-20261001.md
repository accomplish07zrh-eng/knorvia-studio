# Terminal monitor and WebSearch root integration review

This source-exposed batch preserves the published auth diagnostic commit through
an append-only local integration merge. The derived source inventory was the only
merge conflict and was regenerated from actual files. This is not a PR merge,
release or deployment. Historical CI218 remains failed with unknown auth cause;
the separate diagnostic-only CI must finish before this batch is published.

## Terminal internal monitor

Root imported the monitor proof, fix and receipt from C's `fd71001`, after holding
the preceding lifecycle batch for the independently demonstrated WinPTY lost-exit
problem. Final owner SHA-256 is
`cdbc250649be8a8b91589e0c0d2e0db39f05a171b6da0c37520649a7fc829c96`.
All eleven other tracked terminal implementation/declaration files match the
previous reviewed checkpoint. The production correction only tags native handles
and retains the acquired exit monitor while termination remains unconfirmed.
Public IO admission stays closed, and public resources still retire.

Root ran all 366 lifecycle, planning and profile cases against source and strict
emitted consumers. Both passed with zero skips. The emitted command sets all four
selectors: LIFECYCLE, PLAN, PROFILE and MACOS, plus the committed emitted loader.
Independent original WinPTY probes also passed: five source and four emitted
cases using the actual installed WindowsPtyAgent JavaScript with fake native
ports and the actual service/RPC Emitter. A deferred exit now settles ownership
and diagnostics with one native kill, while public IO is denied before argument
getters and retired public listeners receive no callback. No real terminal,
process, user data, permission or Windows host was used.

### Precise retry-order clarification

The lane monitor specification's unqualified “acquisition order” statement is too
broad across failed-cleanup retries. Initial native handles follow acquisition
order. A failed disposer is requeued at the end of the existing finite snapshot
policy. With a failed kill and failed data disposer, the exit monitor is retained;
on a later accepted-kill retry, it precedes the requeued data disposer. If both
then throw, errors are `[exitError, dataError]`, with exit as primary/cause/message.
The independent source and emitted probes reproduce this exactly. Neither loses
ownership; installed ordinary node-pty disposers do not themselves throw.

This review clarifies the existing retry policy rather than claiming acquisition
order is preserved across retries or changing production error ordering. The
original lane specification and receipts remain historical evidence. The prior
assertion expecting both native handles disposed after failed kill was deliberately
corrected to retain the exit monitor; ordinary success still releases both.
Native packaged Linux/macOS/Windows acceptance remains open.

## WebSearch

Root imported A's five immutable commits through `20dfa27`. Fourteen receipt-bound
files match their recorded SHA-256 and original Git blobs. The new single
invocation owner and shared ordered projection retain eligibility, automatic
provider-native choice, quotas/domain parameters, prompts, receiver and trace
identity, stream/error/partial-result semantics and public output formatting.
No live provider, network search, account or billing call was executed.

All 23 frozen consumer tests passed against source and built emitted code. Each
mode also passed 4,096 stream and 4,096 projection differential comparisons against
external immutable `8813066` reference bodies, for 16,384 comparisons in total.
Only reference import routing and an ESM package marker were supplied externally;
no reference body was copied into production. Both modes yielded observation hash
`ac1501eb25c3859db4d215b8c9042581f31ebf9d27f87a3c1b3169adf3eef0a0`.

Root additionally retrieved the three exact WebSearch publisher blobs through the
pinned upstream tree in separate bare storage. Raw and normalized hashes match
the existing manifest. `websearch-upstream-byte-verification-20261001.json`
records this availability correction to the lane's earlier local-evidence gap.
Publisher bytes do not establish independent authorship or a licence grant.

## Gates and remaining limits

CLI build (17 packages), root and serial CLI types, configured root/CLI lint,
explicit owned-file lint, formatting, full architecture and desktop
`build:no-runtime-assets` passed. Existing broader unowned lint debt and build
warnings remain; no rule, timeout, retry, dependency, approval or CI policy changed.
Full regression completed: 6,743 tests, 6,677 passed,
59 failed, 7 skipped and 0 cancelled. The exact failure-event multiset
matches the published base's 59 local listen EPERM failures. This is not a
full-green local run; exact platform CI remains required.

New expressions, retained declarations/prose/fixtures and exposed source remain
mixed and documented. No whole-file original, clean-room or whole-project MIT
claim is made. Shared notices and 27 material obligations remain. UI B6 onward
is still outside this integration due to its unchanged access boundary. Live
provider, real user-data upgrades and native packaged acceptance remain open.
