# Branch issue parser checkpoint

Baseline `3168a3826201250fa6f43c909c05f0be5f608799`; spec/frozen contracts
`33aa95f0f1a593b28a7ecff0a8853b3db3cc851c`; production
`9d82ab7b3e0db6d8d9571eaf0570683dca64c9cc`. Prior checkpoints remain immutable.
Only three bodies in `packages/services/src/git/repo/gitCliHelpers.ts` changed:
`toNormalizedLines`, `extractIndentedPaths`, `parseGitBranchMutationIssues`.

All three old bodies exactly match ZCode publisher
`872ad960de7ec172591f7e1952f7849229f94521`, tree
`d185a9a893c00d51fc3fe51fe7371b9eea7de143`, import
`7619e41b950bd52073ebf36754146cf25659d9fa` and integrated
`0d80f9ca37b1daef162ecc69bd18f6e8fc30a146`. Publisher bytes were read from the
existing separate temporary bare repository; no ancestry or upstream production
copy changed. Baseline whole helper SHA256 is
`d3718bac3c175be346a44f5939f41e51198ee84511783fd638eea472888cf623`.
The copied three-declaration oracle retains exact baseline offsets/text/digests
and explicitly marks source exposure. Local AST/object audit verified those
spans, all 23 other declarations and exact bytes outside the three bodies, with
no whitespace normalization. Entire repo/service/config/command-provider/shared
Git type files remain byte-identical; emitted public declarations remain exact.

New substantive expression: LF cursor decoding with JS trailing-whitespace
trimming, one header/body traversal per path block, ordered path/message rule
selection and common issue construction. No extra interpretation framework,
effect, await, state/cache owner or permission policy. Retained expression:
stderr-before-stdout trim/null selection, lowercase detail, both header patterns,
indent regex `/^\s+/`, path trim/normalizer call, nonempty-path predicate, issue
codes, exact English messages, public signatures and result field order. Keyword
atoms and operation alternatives remain compatibility content in the rule data.
`toResultMessage` and `ensureGitCommandSucceeded` are wholly retained, along with
all accepted parsers/plans, native policies, mutation and cache/await owners.
Source exposure and fixed prose/API/glue are disclosed; changed hashes and tests
are not originality evidence. Root reviews expression under the MIT acceptance
criteria. Mixed-file applicable notices/NOASSERTION remain; no clean-room,
whole-file MIT grant or publication claim.

Frozen baseline **63/63 source and 63/63 strict emitted**; final same counts,
**two test files per mode**, zero failures/skips/cancellations. These are 49
priority/path/line-ending/Unicode/malformed/getter/reentrant/fresh-result cases
and 14 unchanged repo/service/RPC failure-consumer cases, including two delayed
resolution/rejection cases. Fake switch/create command ports assert exact
argv/cwd/15000ms/524288-byte cap and effect counts; no Git command executes.
The actual UI hook/display/assist callers were traced, without mounted UI tests.
Initial source was **51 pass/12 fail**: new caller assertions mistakenly expected
2097152 bytes rather than the existing 524288 cap. Corrected only those new
expectations before freezing; no budget or production behavior changed. Initial
four quote-escape lint warnings were corrected with rendered strings unchanged.
Original failure logs remain preserved, rather than being described as a defect
in production.

Root types/i18n (5422 keys), configured lint (2952 files), owned lint (four files,
94 rules), six-file format and changed/full architecture checks passed. Exact
scope/oracle/declaration audit passed again after the executor disconnect.
These checks bind to production `9d82ab7`; the receipt adds no production edit.

SHA256, relative to `packages/services`:

| Path                                                   | SHA256                                                           |
| ------------------------------------------------------ | ---------------------------------------------------------------- |
| src/git/repo/gitCliHelpers.ts                          | 2b59b241a717d6d154c0f618b3608cc35b9147e9b3f95849495a5382c9ea1136 |
| dist/git/repo/gitCliHelpers.js                         | 2be5972be6eb0835cdde2f483311c354df55ee2a24430d7ea52b19c7843d12d7 |
| dist/git/repo/gitCliHelpers.d.ts                       | 1854488ccb0b1dd53a446abf3ebbcc35c1eda67193f827fa5e2210b0783df2b2 |
| test/git-branch-issues-contract-fast-20261001.test.ts  | aa1ace39a34cf89456e7bf25e48186996b3343eb31fd5dee405a98d7310f1da7 |
| test/git-branch-issues-consumers-fast-20261001.test.ts | 4ab55c462d7ca85cd7f088b35bf7ce4e4e80dfd044d227e9bc0c6de3e5e65790 |
| test/git-branch-issues-fixture-fast-20261001.ts        | 86258fb3ea4c18cf3fb06ccacb0b9b32d1abc7ad26c55570322dda3addedf375 |
| test/git-branch-issues-legacy-fast-20261001.json       | 9ccbc98d1a6a63c90438e4b16e1c13cc2f9017ae8ffdfdd2d668b134604339ea |

Exact runners, Node24.14.0/pnpm10.33.2, concurrency2:

```sh
export PATH=/tmp/node-v24.14.0-linux-x64/bin:/tmp/knorvia-tool-bin:$PATH COREPACK_HOME=/tmp/knorvia-corepack
TSX_TSCONFIG_PATH=packages/ui/tsconfig.json node --experimental-test-module-mocks --import tsx --test --test-concurrency=2 packages/services/test/git-branch-issues-*.test.ts
KNORVIA_GIT_RESOLUTION_TARGET=dist KNORVIA_GIT_READ_PROJECTION_TARGET=dist TSX_TSCONFIG_PATH=packages/ui/tsconfig.json node --experimental-test-module-mocks --import tsx --import ./packages/services/test/git-read-projection-emitted-register-fast-20261001.mjs --test --test-concurrency=2 packages/services/test/git-branch-issues-*.test.ts
```

Local logs/audit remain in `/tmp/knorvia-git-branch-issues-evidence`. Log SHA256:
initial source `bb239a6420f61577e340287ed3b75e7cc74ba829cbdda4c4a4721f6d3e372a9c`;
freeze source `d3a14538740d94460b8322c74e93bc189fcc7d6b61a4eb97c0290281c6d5851e`;
freeze emitted `7d8ee868c919a0e3382ddcae9c262e6b27eb62a4c9b90e2c8ed1d19eed99abdc`;
final source `ed5cb979505c8bb1fb2beee97b1c0e1daa9761538cd9e7e6169b869dc67383b0`;
final emitted `48161e05282a6018e967056de599fbbb940e335a84e7c40c99326b47a7dfe86a`.

Full regression and CLI/desktop builds were **not run**, per focused cadence;
root owns aggregate gates. Synthetic Linux source/emitted results do not certify
native Git, Windows/macOS, mounted GUI, shipped binaries or remote Host behavior.
All product process/fs/clock ports were fake; no mutation/network/provider/user
data/credential/settings/security actions. CLI/UI/Creation/shared licensing,
inventory/notices/dependencies/CI remain untouched. Older lane27 registers and
root-reported26 material obligations remain separate. The transient unavailable
executor was followed by completed local status/content/object/digest reads;
preserved commits, fixtures and original logs were confirmed. No environment
recreation, settings change or uncertain commit retry; no persistent blocker.
