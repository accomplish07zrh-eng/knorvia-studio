# Command-result failure interpretation

Baseline61ee435296989cc4cbf4a2913ec22264af1ece6c. Own only bodies of
ensureGitCommandSucceeded and toResultMessage in gitCliHelpers.ts. Both remain
identical to publisher872ad960/import7619e41/integrated0d80f9c. Keep availability
predicates, accepted parsers/config, public declarations and every other body
exact. No new IO, await, state/cache owner, permission or retry policy.

- Priority: truthy timedOut, then truthy outputTruncated, then allowed exit code,
  then command failure. Return the identical result on success, regardless of
  signal/orphan/stderr. Nullish exit becomes NaN for Array.includes admission;
  retain default [0], explicit empty/custom allowed lists and includes receiver.
- Timeout limit is timeoutMs ?? durationMs, read before elapsed duration.
  Diagnostics stay elapsed, optional killAt, optional cleanup, forceKill, orphaned.
  Optional times use !== undefined (including zero/null) and are read twice when
  present; flags use truthiness and one read. Preserve exact units/punctuation,
  label/value coercion order and Error name/message with no added cause.
- Failure detail selects stderr.trim, then stdout.trim, then exitCode nullish
  fallback. Preserve lazy reads, repeated changing getters, thrown-error identity
  and reentrancy; never inspect signal/args/cwd/binary or mutate results/options.
- Existing resolver checks missing-cwd then non-repository before this checker
  on nonzero exits, retaining fail-open results even with timeout/truncation.
  Zero-exit resolution bypasses checker flags. Real service/RPC callers must
  retain exact command counts/argv/cwd/timeout, rejection cleanup, queued/reentrant
  reuse, invalidation and late completion using owned fake ports only.

Replacement: lazy ordered stream selection, sequential diagnostic token assembly
and one final error construction after ordered verdict branches. No interpreter
framework or generic policy machinery. Freeze concise synthetic contracts first;
preserve exposed oracle, inherited prose/tokens/API and prior evidence. Root owns
contribution/licensing review; no clean-room/whole-file MIT or publication grant.
Focused source/strict emitted, immediate consumers, types/lint/format/architecture;
no full suites/builds. No actual Git/process/config/user files/network/providers/
credentials/settings/security actions; all shared records/other lanes unchanged.
