# Remote transport lifecycle continuation

Draft PR: https://github.com/accomplish07zrh-eng/knorvia-studio/pull/9
Branch: `recovery/server-lifecycle-20261002`.
Baseline: `0ce9d9b13405e17f39fa8c3e73d51b8c0cee4544` (the previous seven-file batch).
Target remains `recovery/independent-logging-20260930-0456`.

Exclusive production owner: `packages/server/src/remote/closeEvent.ts`,
`stdio-socket.ts`, `handshake.ts`. Contract:
`specs/knorvia-remote-transport-lifecycle-20261002.md`.

## Authorship/access boundary

The source-exposed observer read the three baseline files, the public StdioStream
interface and the directly affected connect handoff. A fresh internal author
`/root/remote_transport_author` was launched with `fork_turns: none`, model
`gpt-6-astra`, reasoning `high`. The author was instructed to read only the behavior
contract and repository/architecture guidance, and to write the three complete
implementations into `/tmp/knorvia-remote-transport-authored`. Existing owner files,
tests, patches, history and dependency implementations were excluded from the
author's reading set. This is a shared-filesystem instruction/context boundary,
not an OS-enforced isolation claim.

No source-exposed extraction or refactor alone is offered as independent
provenance. Parent classification remains pending. No MIT claim, LICENSE/global
inventory/review edit, dependency change or cross-lane integration is made.

## Baseline and frozen limitations

Exact baseline blob ids and SHA-256 values are in `source-hashes.json`.
Workspace freshness: ahead 203 / behind 0 origin/main. The freshness tool reported
no tracking branch in this execution; the previous push and PR were verified.
Baseline changed architecture check reported OK, 0 violations / 0 baseline / 0 new.
Server context is unmanaged, owner unassigned, with no module.ts/contracts.

The behavior contract explicitly preserves these source-observed limitations:

- Late close replay is queued and its no-op subscription disposal cannot cancel it.
- The stream adapter can emit end more than once and does not remove its listeners
  or close subscription on disposal; it ends stdin, without destroying stdout.
- Handshake decodes each chunk as UTF-8 independently, including remaining text,
  and does not cap its pending line accumulator.
- Handshake assumes event sources do not synchronously deliver close during
  subscription. The baseline synchronous callback can hit a temporal-initialization
  error. This is an unsupported edge, not an exercised native runtime observation.
- A success cleanup/ack-write exception after settlement is latched can be
  swallowed by the banner parse boundary, leaving the handshake pending.

These are not newly discovered executed test failures, claimed fixes or permission
policy changes. No other lane, remoteAssetCache, SSH/authentication settings,
backend/deployment implementation or real remote endpoint is touched.

## Validation scope

Latest user cadence defers aggregate validation. No new routine test matrix,
full suite, build, semantic typecheck, native listener, real network connection or
platform execution is planned/claimed. Authentication/permission policy remains
unchanged. Work uses source inspection and scoped authored-code diagnostics only.
No sandbox changes, Library access or cancelled-upload retry occurred.

## Completed batch and checks

The fresh author delivered all three complete implementations. Static review
identified a hoisted cleanup callable and overly broad settled guard that changed
a frozen handshake failure path. The observer sent behavior-only clarification;
the fresh author corrected the temporary handshake file. The observer copied all
three authored files into their existing owner paths and ran oxfmt. There were no
source-exposed semantic edits after authoring.

Author declaration: read only the designated contract, root repository AGENTS.md,
and architecture-governance SKILL.md; checked /workspace/AGENTS.md (absent). No
existing implementations, tests, history, patches or dependency implementation
read. The correction used only the observer's bounded behavior clarification.
Author performed no tests/builds. Instruction-based access limits remain as above.

Executed checks:

- Changed-file oxlint: 0 warnings/errors (`changed-lint.txt`).
- TypeScript transpileModule: 0 syntax diagnostics across the three files
  (`syntax.txt`); this is neither semantic typechecking nor a package build.
- Changed architecture: 0 violations, baseline 0, new 0 (`changed-architecture.txt`).
- `git diff --check`: no whitespace errors.

No runtime test was run for this batch, consistent with the latest cadence.
Event timing, diagnostic equality, runtime buffering/handshake, listener cleanup,
backpressure, native/platform operation, semantic types and aggregate integration
remain unverified by execution. No execution blocker was encountered; these checks
are deferred, not green. No authentication/permission setting or policy changed.

Production-source diff: 111 insertions / 185 deletions (net -74 lines). Existing
public APIs and caller ownership remain. Baseline, author and formatted candidate
hashes are recorded in the adjacent JSON for parent provenance classification.
