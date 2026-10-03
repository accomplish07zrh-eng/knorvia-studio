# Remote deployment-lock owner — batch 5

Draft PR: https://github.com/accomplish07zrh-eng/knorvia-studio/pull/9
Branch: `recovery/server-lifecycle-20261002`.
Baseline: `de3ff5c2cf6418a35186f3a9e5895984551e0c23`.
Target: `recovery/independent-logging-20260930-0456`.

Exclusive production file: packages/server/src/remote/remoteDeployLock.ts. Its
close observation and best-effort stream helpers are private responsibilities of
this owner; no external helper/caller edit is required. Functional packet:
`specs/knorvia-remote-deploy-lock-20261002.md`.

## Author/access and policy boundary

The source-exposed observer read the baseline owner and directly affected deploy
caller, plus bounded public port/constant declarations. A fresh author
`/root/deploy_lock_author` was launched with `fork_turns: none`, model
`gpt-6.1-sol`, reasoning `high`, following the requested model switch. The author
receives only the functional packet and repository/architecture guidance, and
writes a complete owner into a separate temporary directory. Implementation,
existing tests, patches/history, dependency implementation and prior author
outputs are excluded. Shared filesystem access is not OS isolation.

The packet describes shell semantics/port order; it is observer-derived and not a
claim that the whole project had no source access. Exact source/author/candidate
hashes support parent review, not a licence grant. No MIT/root LICENSE/global
provenance/inventory/dependency edit or cross-lane merge. Root cache/CDN/network
helpers, backend/deploy callers, authentication/credentials/security settings stay
outside this batch.

## Baseline and minimal synthetic safety

Baseline architecture: OK, 0 violations/baseline/new. Existing server context is
unmanaged, without module contract. Freshness: ahead 206 / behind 0 origin/main;
tracking unavailable to helper. Baseline blob and SHA-256 are recorded separately.

One synthetic release-timeout check addresses the owned-resource cleanup boundary:
write literal release token, end stdin, retain release Promise identity, time out,
destroy stdin/stdout/stderr in order even if one destroy throws, remove listeners,
and never dispose shared backend or issue a second command. The timeout diagnostic
must retain its pre-destruction stderr snapshot. All stream/exec ports are fake;
generated shell text is only passed to a fake capture function, never executed.
Baseline result 1 pass / 0 fail is preserved in `baseline-owned-cleanup.txt`.

## Deferred runtime and frozen boundaries

No native shell, SSH/Docker/WSL, deployment or remote connection is executed.
Remote directory locks, contention/queue fairness, stale recovery, heartbeat,
signals, filesystem effects and POSIX portability remain unrun. The current
algorithm has no public AbortSignal or local FIFO; marker acceptance is substring
matching in a 4096-character tail. Tokens remain permissive. Exceptional event
providers/cleanup and reentrant release-before-memoization are not normalized.

Routine transport matrices, full suites/builds and semantic/platform checks are
deferred per latest cadence. Only the above synthetic cleanup check and scoped
static diagnostics are claimed. No sandbox or security-setting change, Library
access or cancelled-upload retry occurred.

## Complete candidate and executed checks

The fresh GPT-6.1 Sol/high author supplied the whole lock owner with private close,
cleanup and shell-transport helpers. Observer review requested inner path derivation
from expanded lock directory, heartbeat/kill output suppression, sequential stream
reads/destruction and preservation of stream-property getter failures. The author
made those corrections from bounded functional clarification, without old source
excerpts. The observer copied the complete output and applied oxfmt only.

Exact author declaration: content reads limited to the specified packet, root
repository AGENTS.md and architecture-governance SKILL.md. Initial filename-only
search under /workspace and /tmp printed unrelated guidance filenames, with none
of their contents read. No existing implementation, tests, dependency source,
history, patches or earlier author outputs were accessed. Revisions modified and
hashed only the authored temporary file. No author tests/builds/remote commands.

Executed:

- Single synthetic cleanup safety check: baseline 1 pass / 0 fail and final candidate
  1 pass / 0 fail, recorded in `baseline-owned-cleanup.txt` and
  `candidate-owned-cleanup.txt`. Fake streams/exec only; no holder command executed.
- Initial scoped owner/test lint: zero warnings/errors (`changed-lint.txt`); final
  owner-only recheck after the last author correction: zero warnings/errors
  (`final-owner-lint.txt`). No lint/security gate suppressed.
- Transpile-only TypeScript syntax: zero diagnostics (`syntax.txt`); semantic
  typechecking and package build were not performed.
- Changed architecture: OK, zero violations/baseline/new (`changed-architecture.txt`).
- `git diff --check`: no whitespace errors.

Production-source diff: 143 insertions / 167 deletions (net -24 lines). Only the
single owner production path changes; private helpers stay with it. Source/author/
candidate hashes are recorded for parent classification. Real filesystem/lock
permissions, remote shell execution, contention, heartbeat, stale recovery, signals,
platform portability and deployment caller integration remain unverified by
execution. No execution blocker was encountered; no aggregate acceptance claim.
