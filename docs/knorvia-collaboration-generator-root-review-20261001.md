# Collaboration tools and Git message generator: root integration review

Reviewed publication baseline: `80d053af31553c1057d599bdc4ee70f669a5230f`.
CI223 passed Linux and Windows; `licensing/evidence/direct-root-ci223.json`
retains the exact jobs, merge and tree. CI222's prior Windows assertion failure is
not reclassified as a pass. CI218's original authentication cause remains unknown.

## Collaboration tools

Original lane commits `d45bcc1`, `73cfdd5`, `db8968d` were imported as `543d1c3`,
`876d39a`, `a6b89d3`. Root passed 25 source and 25 strict emitted cases after its
17-package CLI build. Root and CLI types and configured CLI lint pass. The
unmodified original receipt checker passed in a detached `db8968d` checkout
without `--emitted`; root separately verified all 14 owned and 21 emitted hashes.
This distinction does not bypass the original checker's whole-worktree assertion.

Six protected-input differences on the integrated root predate this import and
match `80d053a` exactly: THIRD-PARTY-NOTICES, ReadSessionContext, TaskOutput Bash,
TaskOutput projection, current-files inventory and reviews. Historical lane
licensing count 27 is not the current root count 26. Three exact pinned publisher
blobs were independently retrieved and verified for SendMessage,
RespondToCoordinator and submit_result.

Independent review of exact old/new source snapshots passed 25 cases per snapshot
using installed dependencies and existing declarations. It found no supported
behavior regression in distinct gates, second receiver/getter order, signal,
trace/result identity, declaration or accept/reject turn semantics. That review
was not a fresh package build or native communication acceptance.

The standalone root full run before generator integration had 6,940 cases:
6,874 pass, 59 fail, seven skip, zero cancelled. All 59 failure-event tuples exactly
match the preexisting local socket-listen EPERM limitation; this is not a full
local pass.

## Git commit-message generator

Original `4f9b0e6`, `93a236d`, `31ed94a`, `57bb3dd` were imported as `8f13ac4`,
`5806217`, `b2d0168`, `3b015d6`. The producer's later host-path assertion append is
kept separate from its production full-suite receipt. Root source and final
strict emitted runs passed 288 cases each, including root's additional canonical
Windows/POSIX path case. Desktop build passed serially.

Root verified the producer payload digest, 13 owned files, 14 protected production
files, eight exact retained AST regions and exact pinned publisher generator blob.
Five protected shared/history divergences match preintegration `a6b89d3` exactly:
THIRD-PARTY-NOTICES, current-files inventory, reviews, third-party inventory and
the CI222-corrected Git consumer test. The original whole-worktree replay is not
claimed to pass on this legitimately different integrated root.

An early generated-artifact comparison did not match while root typecheck emission
was still running, so the earlier emitted result was not accepted as final proof.
After typecheck completed, all six current generated digests matched, including the
public declaration and desktop Host bundle, and strict emitted 288/288 passed
again. Declaration SHA256 is
`f8a49d883a5c0564028f5a5ad7c165de2f7117cf744cc28a3a0ad41c6d0ae272`;
Host bundle SHA256 is
`2ec3705db6b2b1745b9514e40c6eebed7b5dbefac3baf070bfe813e43c6104bf`.

Independent isolated review passed 21,571 synthetic differential observations:
1,500 prompts, 20,014 responses/grammar edges, 56 control cases and one concurrent
three-invocation case. It independently emitted equal declarations using
TypeScript 6.0.2 and Node 24.19.0; root uses pinned Node 24.14.0. The review found
no supported regression, retained the two await boundaries and single model-effect
owner, and explicitly preserved legacy long-scope and UTF-16 edge behavior. It
made no real provider, billing, mounted UI or native acceptance claim.

## Final integration gate and limits

Root types, configured lint, 22-file owned lint, formatting and full architecture
checks pass. The combined full regression recorded 7,101 cases: 7,035 pass,
59 exact unchanged socket-listen EPERM failures, seven skip and zero cancelled.
The paired machine receipt records these limits; this is not a full local pass. Source-exposed prose, compatibility expressions, original
licences and history remain. Neither implementation is clean-room or a whole-file
MIT grant. Twenty-six material obligations remain; strict complete-material
release checks continue to reject them. UI B6 onward remains unintegrated because
of the existing access boundary. No merge, release, deployment, real messages,
provider calls, user data, credentials or security-policy changes were performed.
