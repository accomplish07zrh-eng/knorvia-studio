# Status owner checkpoint

Baseline `45bdf9e5b67f971fad3999b374e8cd2373d0bec0`; spec/freeze
`9753e0571ad7ee777815d4595ac80ad278242677`; production
`216bc93f875b9540bd8b9b0582f531290142dc9e`. Only `getStatus` and `runGitStatus`
bodies in gitCliRepo.ts changed. The file remains mixed; the ledger says upstream-modified,
review:null, NOASSERTION, publisher blobffe734dd7fcccc15c1128f7be818ea8b41c4fd90.
Both old bodies match exact publisher872ad960de7ec172591f7e1952f7849229f94521/tree
d185a9a893c00d51fc3fe51fe7371b9eea7de143, import7619e41 and integrated0d80f9c.
Existing separate bare/local objects were read only. Exposed two-declaration oracle
offsets/text/hash/commit and exact bytes outside both bodies passed AST/object audit;
all earlier methods, helpers, declarations, maps/set and invalidation remain exact.

New expression: captured full/normal mode and bounded fallback loop; one synchronous
numstat request assembler with explicit ordered fanout slots; ordered validation
traversal. Existing command effect and persistent state owners stay in the factory.
No new helper framework, cache, async driver, cancellation, policy or retry budget.
getStatus retains four awaits; runGitStatus still awaits one or two effects on the
same paths, using one loop await rather than two syntactic sites. The frozen normal
result probe retains both async-adoption then reads before validation. Tests preserve
queued/reentrant reuse, invalidation, rejection cleanup, independent root-sharing
requests and late fallback after an already-rejected sibling.

Retained expression includes has/add root ownership, normal/full predicate atoms,
exact warning/error prose, argv/cwd/timeouts/caps, Promise.all, availability/empty
snapshot, public record construction and parse/untracked-stat order. Accepted
parsers/projectors and command/environment/security policy stay unchanged.
These retained expressions and copied fixture/oracle exposure are attributed;
changed hashes/tests are not originality evidence. Root reviews contribution and
rights. No clean-room/whole-file MIT grant or publication claim; shared licensing,
inventory/notices/dependencies/CI/A/B/CLI/UI/Creation remain unchanged.

Baseline and final **26/26 source and 26/26 strict emitted**, **two files per mode**:
17 new owner cases and nine unchanged immediate status/service/RPC consumer cases;
zero final failures/skips/cancellations. Initial freeze was22pass/4fail in each mode:
three log-array assertions exposed the new fixture's enumerable push restoration,
and one new trace omitted two existing then reads. Fixed fixture cleanup and froze
the complete observed trace before production, retaining all assertions and initial
logs. No production behavior correction, timeout or permission relaxation.

Services-only types (`pnpm exec tsc -p packages/services/tsconfig.json --pretty false`),
owned lint (three files/94 rules), format and changed architecture passed. Offline
freshness --no-fetch used cached origin/main145ahead/0behind, no tracking; no live
freshness claim. No root-wide types/configured lint, full suites or aggregate builds
ran. All product command/fs/clock/logger ports were synthetic; no live Git/user data,
network/providers/credentials/settings/security actions or native acceptance.

SHA256 at216bc93, paths relative to packages/services:

| Path                                            | SHA256                                                           |
| ----------------------------------------------- | ---------------------------------------------------------------- |
| src/git/repo/gitCliRepo.ts                      | 3d3bacc41502e98c13ec02abcdb0d05429a78cafe51e427a9bbdf6e39503df53 |
| dist/git/repo/gitCliRepo.js                     | f885c120c486bbe209750b33eeb71eb475eb7a82c81e4ead2aa68d69006c5e0c |
| dist/git/repo/gitCliRepo.d.ts (unchanged)       | a6a19273740e97f89c1b0cdc88b160570d45749e6d70edbb2c39850f3f95870b |
| src/git/repo/gitCliHelpers.ts (unchanged)       | 0ad0965cfb94af63881d054b55b7dc921fb4451a1c25d374264d9be0f4f52681 |
| test/git-status-owner-legacy-fast-20261001.json | 948cb383f30b3129565671aebcf1df923cf9003018096263a9db59e7ef87ce4c |

Exact runners, Node24.14.0/pnpm10.33.2:

```sh
export PATH=/tmp/node-v24.14.0-linux-x64/bin:/tmp/knorvia-tool-bin:$PATH COREPACK_HOME=/tmp/knorvia-corepack
TSX_TSCONFIG_PATH=packages/ui/tsconfig.json node --experimental-test-module-mocks --import tsx --test --test-concurrency=2 packages/services/test/git-status-owner-contract-fast-20261001.test.ts packages/services/test/git-status-parser-consumers-fast-20261001.test.ts
KNORVIA_GIT_RESOLUTION_TARGET=dist KNORVIA_GIT_READ_PROJECTION_TARGET=dist TSX_TSCONFIG_PATH=packages/ui/tsconfig.json node --experimental-test-module-mocks --import tsx --import ./packages/services/test/git-read-projection-emitted-register-fast-20261001.mjs --test --test-concurrency=2 packages/services/test/git-status-owner-contract-fast-20261001.test.ts packages/services/test/git-status-parser-consumers-fast-20261001.test.ts
```

Local logs/audit: /tmp/knorvia-git-status-owner-evidence. Final source log SHA256
`af99b33a7225aba832b29027c516f40ddace9c4c07efa031e968d38d8b8b2efd`, emitted
`bd34a5f42156c33c1c67e2ca60ac1665cf9b98d72a6eeeddecde3efabf424750`.
Earlier evidence and older27/root26 obligation registers remain unchanged. Linux
synthetic results do not certify native Git, Windows/macOS, mounted GUI, shipped
binaries or remote Host behavior. No persistent executor blocker.
