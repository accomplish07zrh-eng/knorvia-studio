# Auth first-failure reporting review

This diagnostic-only checkpoint starts at published `20d7040`, separate from
unpublished terminal work. CI218 failed Windows source case A-STO-10 while Linux
and emitted auth passed. The original inner output was not uploaded. Its cause
remains unknown. The failed receipt is retained in
`licensing/evidence/direct-root-ci218.json`.

## Change and privacy boundary

The specification and 13 tests preceded the helper. The initial red run failed
because the new helper did not exist. Only eight lines were added to the existing
runner: retain bounded first-child output and emit a whitelisted structural
summary after all 30 cases and summary persistence, before the unchanged final
assertion. No raw output, paths, messages, secrets, credential files or environment
values are printed. Scan, frames and worker observations are bounded. A diagnostic
writer failure cannot replace the original assertion. Success emits nothing.

Production adapters, shared persistence, CASE-MAP, existing harness files other
than this reporting boundary, outer wrapper, CI configuration and lockfile are
byte-identical to the published base. The evidence JSON lists their hashes. No
assertion, timeout, retry schedule, concurrency, isolation, owned-environment
allowlist or credential persistence behavior changed.

## Verification

- New diagnostic tests: 13/13, including malformed/large inputs, bounded output,
  controlled codes/markers/frames, no secret/path disclosure and writer failure
- Existing source auth: 30/30; emitted auth: 30/30
- CLI build: 17 packages; root and serial CLI type checks passed
- Configured root/CLI lint, explicit owned-file lint, format and architecture passed
- Full suite: 6,594 tests, 6,528 passed, 59 failed, 7 skipped, zero cancelled
- The exact 59 failure-event multiset matches the published base's local socket
  `listen EPERM` failures. This is not a full-green local result

A controlled replay extracted ERR_ASSERTION and the owned-lock-timeout marker
from a reconstructed, already path-redacted transcript of a synthetic held-lock
probe. It was not original Windows output and does not explain CI218. No raw
transcript is committed. The recorded digest binds that controlled input only.

## Provenance and remaining acceptance

The existing MIT test-runner review is rebound only for the eight new reporting
lines, preserving its prior test-infrastructure scope. The new helper/tests are
newly authored expressions for this diagnostic specification. Reviewing existing
harness and failure traces is disclosed source exposure, not a clean-room claim
or a new whole-auth/whole-project MIT grant. Existing notices and 27 unresolved
material obligations remain.

A subsequent green CI run means non-reproduction. If the failure recurs, the new
safe structural line can narrow diagnosis without relaxing the contract. Native
product, user-data and release acceptance remain separate and incomplete.
