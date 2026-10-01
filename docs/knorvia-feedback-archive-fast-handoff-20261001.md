# Feedback archive boundary — fixed service lane

Branch `parallel/file-watcher-fast-20261001`, starting at immutable watcher checkpoint
`2530b5c00b5dbaeaeecba8e31e8b6e7af6dfb487`. Prior watcher commits and files are unchanged.
Root remains the only integration writer. This boundary owns
`packages/services/src/feedback/feedbackLogArchive.ts`, narrowly named feedback archive
helpers, corresponding tests/support, its [spec](../specs/knorvia-feedback-archive-fast-20261001.md)
and this handoff. No new agent/task conversation was created.

## Verified lineage and callers

Fetched recovery head is still `0d80f9ca37b1daef162ecc69bd18f6e8fc30a146`. Archive Git blob
`403f16d380611e032e49379c6c8e771ce4a69381` matches both that head and this lane. Git history
has only its imported snapshot commit; searches found no completed replacement or accepted
review. Inventory: `upstream-modified`, `NOASSERTION`, `review: null`, default Apache-2.0;
current SHA-256 `c181175769c2e809bdb0988a3ce20b745db44af1a417f40089cc67bfc8f808ba`;
upstream blob `1d90a00ab73550b493d041453ae6235e84bb9bf4`.

Static references identify desktop `exportLogs.ts` import and wrapper call plus the
services/node public re-export. The wrapper provides app logs, selected CLI logs and
computer-use exit logs. It does not upload anything at this boundary. Existing manual
export security tests exercise a different collector; no direct archive contracts existed.
Security spec and shared public redactor were read and remain unchanged.

The author read baseline source to extract contracts. This is source-exposed development,
not clean-room evidence or a whole-file MIT decision. Root must assess digest-bound
contributions and retained compatibility expression. LICENSE/NOTICE, preview identity,
shared provenance, credentials/security settings and all 27 material obligations remain.

## Pre-replacement evidence

Local freshness passed; ordinary Git fetch initially failed on the environment proxy.
Approved fetch succeeded for the lane and recovery refs and confirmed the hashes above.
Pre-edit changed architecture check passed with zero violations/baseline/new. Generated
`services` context is legacy/unmanaged with no module contract or direct dependency
contracts; this does not prove the whole services module is migrated.

Pinned Node 24.14.0 and pnpm 10.33.2. Initial restricted child test invocations reported only
file-level passes (including the previously verified watcher and shared tests), so those
outputs were not counted as case acceptance. In-process diagnostic execution confirmed
actual cases; the approved normal child runner then confirmed **25/25** inherited contracts,
zero failures/skips. It preserves standard process isolation and 120,000 ms timeout.

A further synthetic construction-failure contract is red against inherited source:
`zip.addBuffer` failure rejects and removes the operation directory while both already
started streams remain undestroyed. The correction must settle them before cleanup and
retain the original construction error/cleanup-error precedence. No OS permission changes
or real log/credential/account data are used in these tests.
