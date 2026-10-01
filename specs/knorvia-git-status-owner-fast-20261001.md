# Status fanout and directory-collapse owner

Baseline45bdf9e5b67f971fad3999b374e8cd2373d0bec0. Only getStatus and runGitStatus
bodies in gitCliRepo.ts are owned; both match publisher872ad960/import7619e41.
Keep executeGitStatus, helpers/parsers, all other methods, existing maps/set,
reuseInFlightRequest/invalidate, command/security policy and declarations exact.

- Resolve first; unavailable/nonrepo returns the same empty snapshot with fresh
  maps and no status/stat IO. Start status, cached-numstat, unstaged-numstat in
  that order, then await Promise.all. Preserve argv/cwd/15000ms/524288-byte caps,
  run getter/receiver and synchronous/rejected port failure order. Validate
  result records status/cached/unstaged before parsing, retaining exact errors.
- Capture full/collapsed choice once per status invocation, keyed by repoRoot.
  Full outputTruncated alone triggers one normal-mode fallback, even if timedOut;
  cached normal results do not inspect flags here. Add the root, then warn with
  exact existing prose, then start fallback. Never clear this set on invalidation,
  failures or reuse. Warning failure leaves the root marked and starts no fallback.
  Concurrent different keys/root-sharing requests retain their independent
  captured modes, warning/effect counts and existing late completion behavior.
- Preserve original await ownership/path effect boundaries: resolver, one fanout,
  untracked stats; full/fallback are awaited by the same runGitStatus. No extra
  orchestration promise, cancellation, retry, budget or accepted state owner.
  Keep queued/reentrant reuse, rejection cleanup, invalidation and late outcomes.
- After validation parse status, await untracked stats, construct summary, then
  parse staged/unstaged stats in existing order; retain output identity, property
  order, nullable values, watch paths, directory fallback and workspace scope.

Use a direct full-to-normal loop plus ordered stat-read batching/validation,
with compatibility record construction retained. Freeze concise fake-port
contracts and immediate service/RPC consumers before production. No rewrite of
accepted projectors/parsers or tiny availability glue. Disclose copied oracle,
retained prose/expressions and source exposure; root owns rights review, with no
clean-room/whole-file MIT/publication claim. Focused source/strict emitted and
owned services type/lint/format/architecture checks only; no root-wide checks,
full suite/builds, real Git/process/fs/network/providers/user data/security changes.
