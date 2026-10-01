# Branch issue interpretation

Baseline3168a3826201250fa6f43c909c05f0be5f608799. Own only the bodies of
parseGitBranchMutationIssues, toNormalizedLines and extractIndentedPaths in
gitCliHelpers.ts. All match pinned publisher872ad960, import7619e41 and
integrated0d80f9c. Keep message/error helpers toResultMessage and
ensureGitCommandSucceeded, public declarations and all other production exact.

Use direct LF cursor decoding, one header/body path traversal and ordered rule
data with common result construction. No parser framework, new IO/state owner,
permission/retry policy, query or async layer. This is pure interpretation of
static fake command results, not authorization to execute Git mutations.

Freeze before implementation:

- stderr.trim wins over stdout.trim; empty detail is null. No flags, exit code,
  signal or timing fields affect issue classification. Preserve lazy getter/
  thrown-error order and detail bytes/case/line endings after this outer trim.
- Normalize CRLF/LF records and remove each line's trailing JS whitespace.
  Find only the first matching header for each tracked/untracked pattern.
  Skip blank records; stop its path block at the first non-indented record.
  Retain path order/duplicates, normalizer semantics, quotation characters,
  Unicode/whitespace/Windows separators, and malformed lines. Never unquote,
  decode Git escapes, inspect paths or restart at a later header.
- Priority is nonempty tracked paths, nonempty untracked paths, already exists,
  invalid reference, other-worktree, conflicts, operation-in-progress, unknown.
  Header without paths does not win. Preserve checkout/switch matching, case
  folding, substring boundaries, operation aliases and exact issue prose.
- Return one fresh issue/list, optional paths only for path issues, explicit
  nullable detail and exact public field order/shapes. Never mutate input.
- Actual unchanged repo/service/RPC failure-return consumers receive static
  fake switch/create failures; every command/fs port is owned and synthetic.
  Preserve returned action/branch/flags/summary, prior checks and command count/
  argv/order, with no success/invalidation effects admitted by these fixtures.
  Test delayed failures and thrown getters without changing error policy.

Source exposure, copied baseline oracle and retained protocol/prose/API syntax
are disclosed. New parser expression needs root's independent contribution
review under the existing MIT criteria; no automatic licence/clean-room grant.
Keep notices, shared licensing and prior evidence/implementations unchanged.
No actual Git mutation, process, network/provider, user files/data, credentials,
settings/security or other-lane work. Focused source/strict emitted, immediate
consumers and relevant types/lint/format/architecture only; full builds/suites
remain root's aggregate responsibility. No native/platform/GUI acceptance claim.
