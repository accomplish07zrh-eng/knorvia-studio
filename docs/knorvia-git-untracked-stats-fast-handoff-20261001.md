# Bounded untracked statistics checkpoint

Append-only chain: baseline4959ec0ef6fd2d4b21b41b7728a1b48f8b6857ec →
freeze281da95f49513f7da102edf9470792d7f00311da →
production2490e44e9f5a8a8735458b068c93e906fb52c623 → this receipt.
Production owns only countUntrackedFileLines/buildUntrackedStats bodies in
gitCliHelpers.ts (28 added/28 removed lines). Four new spec/test/oracle files
are bound below; accepted helpers, public declarations, getStatus/cache owners,
other lanes and historical receipts remain exact.

Remaining-byte accounting and zero-copy chunk NUL/LF searches replace the
per-byte scanner. A single filtered-entry iterator replaces the manual index;
an explicit bounded launch loop starts workers. Each worker retains one64KiB
buffer and processes sequentially, writing its results in completion order.
The1MiB cap, extra growth-probe byte, four-worker limit, short-read/trailing-byte
counts, close/error precedence, duplicate overwrites and caller awaits remain.
Retained expression includes stat/isFile/size/open predicates, read signature,
finally-close, filter/map/resolve glue, allocation/constants, zero-fallback record
and Promise.all. Public names/signatures and compatible record fields remain.
The old explanatory comments exist only in the labelled copied test oracle.

Exact declaration equality was checked against publisher872ad960 (full commit,
tree/blob/source hash and local7619e41/0d80f9c facts are recorded in the unchanged
[preceding receipt](knorvia-git-untracked-text-fast-handoff-20261001.md)). This
used existing separate local publisher objects, without fetch/ancestry changes.
Baseline helper SHA256:
5a22bfdb1ea328759fd5df0e2147bee2a17592ce95c357433338a0b9c62b2104.
Source exposure, copied oracle and retained expression are disclosed; hashes
and passing tests are not originality proof. The whole helper remains mixed;
root owns independent expression/rights review under the existing acceptance
criteria. No clean-room, whole-file MIT, licence grant or publication claim.
Shared licensing/notices and older lane27/root26 registers remain untouched.

SHA256 bindings at production2490e44:

| Bytes                                                          | SHA256                                                                                                                              |
| -------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| helper source                                                  | 58cba021663712ec5048553f680dfa9cba12c2fabf5de7cc51cc107c52c6cbdc                                                                    |
| helper emitted JS                                              | 66e7439dda2b093c02dab9735b85256df1bba0a19d16e60b73f6822eb7e3e5ed                                                                    |
| unchanged public d.ts                                          | 1854488ccb0b1dd53a446abf3ebbcc35c1eda67193f827fa5e2210b0783df2b2                                                                    |
| counter body: old → new                                        | fca68273de79e18ffa08b1546dc083a00c7fa6fee8d64f6bbafb7ce1b251e76d → 3cd44a3a86d1baa9560d55a6eddc4dfd517d9fbad28d06a981bcf93796399fe6 |
| builder body: old → new                                        | 7f1cf4677f84b970ab7c52497103de19ee548ad9e32e797b65b7dd75334e760c → 781d6a58f605107e797884ae7d159a7b33f93b17670dcea22856331912d17e8f |
| protected remainder, only two bodies masked with named markers | 661b665fcfe22cb019eef5c2edf48ae7ce488687be948db7990552a97cfcbc8b                                                                    |
| git-untracked-stats-legacy-fast-20261001.json                  | 95361092aedf30e2b4b4a52a5007c91e0eb4f881aaf3c3df2349dff86438d056                                                                    |
| git-untracked-stats-fixture-fast-20261001.ts                   | 273c4e4b62f658fceda2d6792b4e365ee68f6d3b7999c9560bba17494c3d977e                                                                    |
| git-untracked-stats-contract-fast-20261001.test.ts             | a0561ece42404f8a157a308ac7fe5dfaa57cae79887c9d8fa0ec4b5daab9271d                                                                    |
| specs/knorvia-git-untracked-stats-fast-20261001.md             | ff74c87baef36b0f880befac737d345439982b97e5e1ca053e660778bae274f4                                                                    |

Frozen and final source/strict-emitted runs each passed26/26 individual cases
in one test file, zero failures/skips. Counter declarations are evaluated from
actual source/emitted bytes; the exported builder and real repo/service/RPC
modules execute directly. Cases cover bounded reads, stale tails, short reads,
binary/LF/CRLF/Unicode/EOF, thresholds/growth, cleanup/errors, four buffers and
reuse, completion order, duplicates/path outputs, refresh projection, queued and
reentrant status reuse, invalidation and late close. The cap fixture repeats one
64KiB block, never allocating1MiB input; every product IO port is owned/fake.

Exact runners (Node24.14.0, pnpm10.33.2, TypeScript6.0.2):

```sh
export PATH=/tmp/node-v24.14.0-linux-x64/bin:/tmp/knorvia-tool-bin:$PATH COREPACK_HOME=/tmp/knorvia-corepack
TSX_TSCONFIG_PATH=packages/ui/tsconfig.json node --experimental-test-module-mocks --import tsx --test --test-concurrency=2 packages/services/test/git-untracked-stats-contract-fast-20261001.test.ts
KNORVIA_GIT_RESOLUTION_TARGET=dist KNORVIA_GIT_READ_PROJECTION_TARGET=dist TSX_TSCONFIG_PATH=packages/ui/tsconfig.json node --experimental-test-module-mocks --import tsx --import ./packages/services/test/git-read-projection-emitted-register-fast-20261001.mjs --test --test-concurrency=2 packages/services/test/git-untracked-stats-contract-fast-20261001.test.ts
```

Raw logs/audit: /tmp/knorvia-git-untracked-stats-evidence. Frozen source/emitted
SHA256:b296caa9545a96cd14e53d51bb3123bbe00a0977123e12bf1b876e3405298052 /
e724b11eb4b0e9c495b46a23bcc9dfe71b7c69f0f6f2e96460cf3cdeabd822f2.
Final source/emitted SHA256:
e0c871e433839b4fec73a55ef1274d03d705c50c581b910c368f4e19f507ba70 /
e1cac9bf8eaf5a67d74b57212848679f21aa52249c4b27f31cd4239d07610e09.
Services-only tsc -p packages/services/tsconfig.json passed, refreshing dist;
explicit oxlint passed3 scope files/94rules; formatting passed5 scope files;
architecture changed check passed0 violations; offline freshness --no-fetch
passed against cached origin/main. Receipt formatting checked separately.
Root-wide checks, full regression/builds and earlier unchanged suites were not
rerun under the reduced cadence. Actual filesystem/native/Windows/macOS/shipped
UI acceptance was not run; aggregate acceptance remains root-owned. No blocker.
