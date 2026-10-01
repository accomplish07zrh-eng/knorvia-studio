# Command-result interpretation checkpoint

Baseline `61ee435296989cc4cbf4a2913ec22264af1ece6c`; spec/freeze
`eb6deccd8268936e59929eab9d947b4db5cf12ed`; production
`f1d5652d0d5bbd2f9cc14de124f6b0c6b9a2bbb6`. Own only bodies of
`ensureGitCommandSucceeded` and private `toResultMessage` in gitCliHelpers.ts.

Both old bodies match exact ZCode publisher872ad960de7ec172591f7e1952f7849229f94521
(tree d185a9a893c00d51fc3fe51fe7371b9eea7de143), local import7619e41 and integrated
0d80f9c, verified through existing separate bare/local Git object reads. The
unchanged ledger records helper blob470d91185ac5fc84904ad06185ff1858e753115e,
upstream-modified, review:null, NOASSERTION. Baseline helper SHA256 is
`2b59b241a717d6d154c0f618b3608cc35b9147e9b3f95849495a5382c9ea1136`.
The exposed two-declaration oracle retains exact baseline commit/offsets/text/
digests; AST/object checks verified it and exact bytes outside the owned bodies,
without whitespace normalization. All 24 other declarations, accepted parsers/
config and availability predicates remain exact; no other production file changed.

New expression is lazy ordered stream selection, sequential diagnostic assembly
over the two optional timing fields, ordered verdict branches and a single final
Error construction. No new helper framework, IO, await, state/cache or policy.
Retained compatibility expression includes trim/nullish fallback, timeout limit
precedence, undefined checks/two reads, truthy flags, exact field/token/prose/units,
label/value coercion, allowedExitCodes.includes receiver/NaN expression and public
signatures/defaults. Existing resolver owners and fail-open classification remain
exact. Fixed syntax/prose and source-exposed fixtures are disclosed; changed hashes
or tests do not establish originality. Root reviews actual expression; applicable
notices/mixed-file status remain, with no clean-room/whole-file MIT grant.

Baseline and final: **35/35 source, 35/35 strict emitted**, **two files per mode**,
zero failures/skips/cancellations. These are 21 pure verdict/getter/coercion cases
and 14 immediate-consumer cases: twelve real service/RPC resolver paths, accepted
config/diff entrypoints, and one queued/reentrant rejection-cleanup/invalidation/
late-completion owner case. The latter asserts command counts and visible outcome
order, not just final values. All product ports are fake. No existing assertion,
timeout/concurrency budget or production behavior was relaxed; baseline passed
on its first run. Root types/i18n5422, configured lint2955 files, owned lint4 files,
format6 files and changed architecture passed. Offline freshness --no-fetch used
cached origin/main (142 ahead/0 behind, no tracking); no live freshness claim.

Current SHA256 at f1d5652, paths relative to packages/services:

| Path                                              | SHA256                                                           |
| ------------------------------------------------- | ---------------------------------------------------------------- |
| src/git/repo/gitCliHelpers.ts                     | 0ad0965cfb94af63881d054b55b7dc921fb4451a1c25d374264d9be0f4f52681 |
| dist/git/repo/gitCliHelpers.js                    | 4439f127c808dae89848b05649aeb8e6c8bc1ce5eb516b95be58451f7b7360d8 |
| dist/git/repo/gitCliHelpers.d.ts (unchanged)      | 1854488ccb0b1dd53a446abf3ebbcc35c1eda67193f827fa5e2210b0783df2b2 |
| test/git-command-result-legacy-fast-20261001.json | 4bc09d2975eaa1446b0498f3b7c1dfe9b1e9abaee047223d1cf31c18f55bc9e1 |

Exact final runners, Node24.14.0/pnpm10.33.2:

```sh
export PATH=/tmp/node-v24.14.0-linux-x64/bin:/tmp/knorvia-tool-bin:$PATH COREPACK_HOME=/tmp/knorvia-corepack
TSX_TSCONFIG_PATH=packages/ui/tsconfig.json node --experimental-test-module-mocks --import tsx --test --test-concurrency=2 packages/services/test/git-command-result-*.test.ts
KNORVIA_GIT_RESOLUTION_TARGET=dist KNORVIA_GIT_READ_PROJECTION_TARGET=dist TSX_TSCONFIG_PATH=packages/ui/tsconfig.json node --experimental-test-module-mocks --import tsx --import ./packages/services/test/git-read-projection-emitted-register-fast-20261001.mjs --test --test-concurrency=2 packages/services/test/git-command-result-*.test.ts
```

Logs/audit stay in /tmp/knorvia-git-command-result-evidence. Final log SHA256:
source `10866e240e88387b082b7445c569834ecdd1a90fce310ff7210603c2f740433a`;
emitted `b829932b48d2b6377f3145a99115cb041e473a5f0eb18e0e099fab327762ac80`.
Full suites/builds were **not run**, per focused cadence. Synthetic Linux checks
do not certify native Git, Windows/macOS, mounted UI or remote Host operation.
No Git mutation/config/user files/network/provider/credential/security/settings
actions. Earlier receipts and shared licensing/inventory/notices/dependencies/CI,
CLI/UI/Creation/other lanes remain unchanged; older27/root26 registers remain
separate. No publication claim or persistent executor blocker.
