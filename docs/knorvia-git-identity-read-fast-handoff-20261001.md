# Identity read checkpoint

Baseline69e4fc140b10d1429f1541b2d1fac8cf6991a124; freeze/spec commit
50ea012e26d67d51613f29a7e0bac00c2386871d; production commit
c3a1d00f7c8a4b14b244d4f2c21df0b259a549f9. Earlier receipts/checkpoints remain
immutable. This receipt adds no production change or shared provenance decision.

Owned production: only gitCliRepo.getIdentity, gitCliHelpers.parseGitConfigValue,
and private gitIdentityRead.ts. Both old bodies exactly match pinned ZCode
872ad960de7ec172591f7e1952f7849229f94521/tree
d185a9a893c00d51fc3fe51fe7371b9eea7de143, import7619e41 and integrated0d80f9c.
Their respective body SHA256 values are
`a2aaa1c9e391e78595290f642cfcbd7a062bcd6778e85713c86ca0c70c10f48d` and
`3c7f0e7bc80baf05724a036031e5388ef1b1c72ca044e18afc81bd264b4fddd2`.
Publisher/blob/local-file facts reuse the preceding read-query receipt/ledger;
separately stored exact publisher bytes were read only. The two copied exposed
declarations in git-identity-read-legacy-fast-20261001.json retain baseline full
file hashes, offsets, exact text and commit, verified against local Git objects.

New expression: first/second-tab boundary decoding with a direct raw value suffix,
synchronous ordered setting-driven request assembly, and fixed binding-driven
identity projection after name/email decoding. The original entrypoint owns both
awaits; no extra async orchestration promise, cache/state owner or retry. Exact
scope/remainder checks preserve every surrounding helper/repo body, accepted
parser/read plan, content reader, cache/map/reuse/invalidation and mutation method.
Only the owned bodies/new helper import/now-unused parse import are masked,
without whitespace normalization. Both public signatures and emitted public
declaration digests remain exact as recorded in the preceding receipts.

Retained compatibility expression includes result.exitCode===1, the existing
ensureGitCommandSucceeded call/label and error routine, /\r?\n$/ removal,
resolution availability predicate, nullish scope precedence, fixed config keys/
argv/timeout and five-field nullable public shape. The oracle and fake-port/RPC
harness reuse are explicitly source-exposed. Changed hashes/tests/file counts
are not originality evidence. Root reviews actual new and retained expression
under the MIT acceptance criteria; source exposure is not a permanent automatic
bar. Existing mixed-file NOASSERTION/applicable licences/notices remain; no
unaudited whole-file MIT, clean-room, licence or publication claim.

Before production: **63/63 source and63/63 strict emitted**,2 files each:53
grammar/error/getter/service/RPC/refresh cases and10 timing cases containing26
baseline trace comparisons per mode. Initial source was61pass/2fail for new
expectations: double-newline CRLF retention and exact exitCode=null prose. Those
were corrected before freezing; the initial log is preserved. No production
defect correction or existing assertion changes. One local no-thenable lint
annotation deliberately permits the owned Promise-like port fixture; no lint
configuration, production policy, assertions, concurrency or budget changed.

Final **90/90 source and90/90 strict emitted**,4 files each: new63 plus27 existing
resolver/service consumers, including the unchanged supported UI callback case.
Tests cover name-before-email command/thenable/parse order, exact argv/cwd/timeouts,
missing/unavailable/null/empty scope, raw tab/Unicode/NUL/newline records, thrown/
rejected/delayed ports, refresh opt-in, reentrant/queued/different keys, rejection
cleanup, invalidation and late resolution through actual owners. No files in UI
were changed. Root types/i18n5422, configured lint2949 files, owned lint6 files,
format8 files and changed/full architecture passed. No final skips or failures.

Current SHA256, paths relative to packages/services, all bound to c3a1d00:

| Path                             | SHA256                                                           |
| -------------------------------- | ---------------------------------------------------------------- |
| src/git/repo/gitCliHelpers.ts    | d3718bac3c175be346a44f5939f41e51198ee84511783fd638eea472888cf623 |
| src/git/repo/gitCliRepo.ts       | 7671431b974df89efe73c7cd3dc0eb9b5b2387e1f92727c982fa527a2999eae2 |
| src/git/repo/gitIdentityRead.ts  | 8a86e08b9a32dc01c5f29d41bf4f7bfef2e0662af54058d683fd7b9589f236cc |
| dist/git/repo/gitCliHelpers.js   | 3793abcedcf6c0de5d482fb3ce00b186c8438aef6838acf29ff634fb25344f82 |
| dist/git/repo/gitCliRepo.js      | 386fb628afd1818963ce948a77c2b832bd9cc26bbda07e7077bcfe488bc0ca25 |
| dist/git/repo/gitIdentityRead.js | e455609fc74abe55e8a13ce2ac166f92254d48981896e6cc59c82d3284b4a208 |

Exact final runners, Node24.14.0/pnpm10.33.2, concurrency2:

```sh
export PATH=/tmp/node-v24.14.0-linux-x64/bin:/tmp/knorvia-tool-bin:$PATH COREPACK_HOME=/tmp/knorvia-corepack
TSX_TSCONFIG_PATH=packages/ui/tsconfig.json node --experimental-test-module-mocks --import tsx --test --test-concurrency=2 packages/services/test/git-identity-read-*.test.ts packages/services/test/git-repository-resolution-consumers-fast-20261001.test.ts packages/services/test/git-repository-resolution-concurrency-fast-20261001.test.ts
KNORVIA_GIT_RESOLUTION_TARGET=dist KNORVIA_GIT_READ_PROJECTION_TARGET=dist TSX_TSCONFIG_PATH=packages/ui/tsconfig.json node --experimental-test-module-mocks --import tsx --import ./packages/services/test/git-read-projection-emitted-register-fast-20261001.mjs --test --test-concurrency=2 packages/services/test/git-identity-read-*.test.ts packages/services/test/git-repository-resolution-consumers-fast-20261001.test.ts packages/services/test/git-repository-resolution-concurrency-fast-20261001.test.ts
```

Local log SHA256: freeze source2bc720e692579e8cdd4815de2fbdd191798475b9f4eba86fd4c787d4b2c51d13;
freeze emitted0683008210a07369e51ce2ef4e7d0ccae80cac9f5ef649eefb61b9ac5161f424;
final source6568919508ea938cfc81726b26def17cd1f23b4cff8c59ef07305ae66b214a9c;
final emitted01c367829ed1d1b1aee4faf0d3ceeed023a5c7e433c554d5da8205f3e640f658;
initial failurec0ddf0ef70f2ac7f3a2cf04215f5ff7214be9f1a2d76b0e16df87af7c15c44d1.
Source/emitted digests and frozen oracle are committed evidence; logs remain local
in /tmp/knorvia-git-identity-read-evidence. Exact AST remainder check passed for
both owned bodies and all8 changed spec/test/production paths.

**Full suites and CLI/desktop builds were not run**, per focused cadence; root
owns aggregate gates. Synthetic Linux source/emitted acceptance does not certify
native Git/config, Windows/macOS, mounted GUI, shipped or remote Host operation.
Every product command/fs/clock port was fake. No real config/identity/user files,
Git mutation, network/providers/credentials/settings/security changes. CLI/UI/
Creation/shared licensing/inventory/notices/dependencies/CI remain untouched.
Older27 registers and root-reported26 obligations remain separate. Executor was
available after the disconnect notification; no continuation blocker remains.
