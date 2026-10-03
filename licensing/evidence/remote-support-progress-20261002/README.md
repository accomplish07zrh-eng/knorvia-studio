# Remote support/progress owners — batch 4

Draft PR: https://github.com/accomplish07zrh-eng/knorvia-studio/pull/9
Branch: `recovery/server-lifecycle-20261002`.
Baseline: `6b21b98ce11d625032179c2817ef4435ce03280c`.
Target: `recovery/independent-logging-20260930-0456`.

Exclusive source: packages/server/src/remote/remotePlatformSupport.ts and
remoteConnectionProgressContext.ts. Functional packet:
`specs/knorvia-remote-support-progress-20261002.md`.

## Source-access boundary

The source-exposed observer read the two baseline owners and searched their direct
importers. A fresh internal author `/root/support_progress_author` with
`fork_turns: none`, `gpt-6-astra`, reasoning `high` receives only the contract and
repository/architecture guidance. Existing owner implementation, tests, old
patches/history, dependency implementations and previous author outputs are
excluded. The author writes complete files into a separate temporary directory.
The observer reviews and integrates them. This is instruction/context separation
on a shared filesystem, not OS-enforced source isolation.

No novelty, MIT or independent-provenance classification is asserted. Very small
functional support rules and fixed public APIs may naturally remain structurally
similar; source separation and exact hashes are offered for parent review, not as
a legal conclusion. No global provenance/inventory, LICENSE or dependency edits.

## Baseline contract and static scope

Baseline freshness: ahead 205 / behind 0 origin/main; tracking unavailable to the
freshness helper. Baseline changed architecture: OK, zero violations/baseline/new.
Server context remains unmanaged with no module contract. Exact baseline blob ids
and hashes are in `source-hashes.json`.

The support gate rejects only literal win32, synchronously, with the unchanged
Chinese error text; it performs no platform probe or alias normalization. Progress
contexts remain per-factory AsyncLocalStorage owners. Each run has an independent
lifetime; late inherited reports are suppressed after its settlement. Nested and
concurrent runs, emit callback receiver, mutable emit lookup, args-array identity,
and rejection/error propagation are explicit compatibility requirements.

Runtime propagation/error/lifetime tests, native/platform probes, semantic types,
full suites and builds are deferred per latest user cadence. No new routine test
or live platform command is planned. No remote connections, credentials, security
settings, root cache/CDN/network helpers or other lanes are touched. No sandbox
change, Library access or cancelled-upload retry.

## Completed owner delivery

The author delivered both complete files. Static review found no required
contract corrections. The observer copied the authored files into their existing
paths and applied oxfmt only; there was no semantic edit after authoring.

Exact author access declaration: read contents only of the supplied spec,
repository AGENTS.md and architecture-governance SKILL.md; used pwd and
filename-only rg enumeration to locate guidance. No existing implementations,
tests, git history, patches, dependency code or previous author output read.
Wrote only the two authorized temporary files and calculated their hashes.
No author runtime tests/builds/platform commands/remote connections/credentials.

Executed after integration:

- Two-file oxlint: 0 warnings/errors (`changed-lint.txt`).
- TypeScript transpile-only syntax: 0 diagnostics across both files (`syntax.txt`).
  This is not semantic typechecking or a package build.
- Changed architecture: OK, 0 violations/baseline/new (`changed-architecture.txt`).
- `git diff --check`: no whitespace errors.

No runtime test ran for this batch. Async propagation, concurrent/nested lifetime,
late reports and error/receiver identity remain unverified by execution; source
review alone is not aggregate acceptance. No execution blocker was encountered.
Production-source diff: 10 insertions / 27 deletions (net -17 lines). Source,
author-output and candidate hashes are bound in the adjacent JSON; classification
remains with the parent.
