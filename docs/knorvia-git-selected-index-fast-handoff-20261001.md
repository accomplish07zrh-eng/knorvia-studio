# Selected staged-index projection checkpoint

Baseline55dd11383bb14e892a2be38993bd26c57249fc51 →
freeze5d88ba5e6791cb719fe182b643c164cf2115ed3f →
production19cc9bdfceb83d6b9f721a9a3737f377c3f9fa5c → this receipt.
Only gitCliRepo.ts's private parseGitIndexEntries body, cleanupRepoPaths
initializer and new collectSelectedCommitPaths helper change production.
New support comprises one spec, three test/fixture files and an explicitly
copied/exposed two-expression legacy oracle. Earlier receipts remain immutable.

The parser now collects records in one ordered pass and acquires only three
header tokens with a regex cursor. The cleanup projection compiles selected
membership once, fixes the selected record list before inspecting originals,
then appends unique rename sources in status order. Reusing that local membership
cannot admit a previously unselected record. This replaces chained header-array
parsing and repeated selected-array searches, without another state/effect owner.
For ordinary private string arrays, membership work is O(P+E) rather than
O(P\*E); no large-input benchmark or broader performance claim is made.

Retained syntax includes the entry/public declarations, NUL split, first-TAB
lookup and path suffix normalization, fixed error prose, property order and
stage-zero guard; ordinary filter/Set/array glue remains. Mode/hash validation,
status parser, path scope, commands, errors and limits are unchanged. The entire
remaining file is byte-exact after masking only the parser body/cleanup
initializer and removing the new helper: protected remainder SHA256
c5ee98cbce1c9574d319d75a82922b421443e0d0b65bfa5035c0ae343abb8930.
This protects every original await, temporary-index lifetime/finally, mutation
command, cache/invalidation owner and accepted read/graph owner. gitService.ts,
gitCliHelpers.ts, accepted path scope/generator/read plans and public declarations
also remain exact. No old explanatory commentary was copied into production.
Test adapters reuse exposed lane AST/compiler/RPC conventions; fixtures are owned
synthetic strings/results. The whole repository file remains mixed-source;
changed hashes/tests are not originality or rights proof.

Exact publisher872ad960de7ec172591f7e1952f7849229f94521 at
https://github.com/zai-org/ZCode, tree d185a9a893c00d51fc3fe51fe7371b9eea7de143:
gitCliRepo.ts blob ffe734dd7fcccc15c1128f7be818ea8b41c4fd90, SHA256
474a377eaf9b4420e671b67ed0d9d509b66fef22151b2085b9f5d8847bec92ba.
Local import7619e41b950bd52073ebf36754146cf25659d9fa has blob
6ce5993b5f036690742b15925d839e57185717ae, SHA256
11b1e8550c8aaca02f5dca0c5f7e0ab55141f308483bfe0db25b0ec6b93ed58c.
Baseline55dd113 file blob4de9f099d92b39994c3f7760172cad6b24ea4d6e.
Read-only existing pinned publisher objects prove the old parser/cleanup spans
match all three versions exactly. Their respective SHA256 values are
33249147ca3b4644967f4735641e246b463eb75bfa589d4f19140a766e8cf544 and
acd14d9f223226fb4ae8dc37001aa1742b9f2d0df7bb46f721b7fa7f247118d7.
No source fetch, ancestry alteration or licence record update occurred.

SHA256 bindings:

| Bytes                             | SHA256                                                                                                                              |
| --------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| baseline source                   | 3d3bacc41502e98c13ec02abcdb0d05429a78cafe51e427a9bbdf6e39503df53                                                                    |
| final source                      | a7bca47a90c958a0af9e30e75484332c50e73ac844f2758cddd07e30be3cf61a                                                                    |
| final emitted JS                  | 5c2f62c2d614809c709cb1e87102a1f3638572f6d2614bd1248ab6c2d703f36a                                                                    |
| unchanged public d.ts             | a6a19273740e97f89c1b0cdc88b160570d45749e6d70edbb2c39850f3f95870b                                                                    |
| two-expression oracle             | 966ba3a8c5ad580d04b8e191731425b43387ad94b4ef715d107c1456867adc53                                                                    |
| initial red source / emitted logs | 7cbe9efc622a09f806b9afeb08afdf3b26a1ee26d4aaf6188a208960fcf6b4ca / 50b6bc6a3dc84ce96bddda49c48ad60770ddfb12759df6cc902bf14b1ee0cc8c |
| final source / emitted logs       | bfebe304f42fc576353fc3b221dc468b21757c1c646d0e97be356be771ed3d5b / 0de0ffe69e92617dac53c85a18576501216603c20083eab9b439143dba565765 |

Frozen and final runs each pass21/21 individual cases across three files per
mode, zero failures/skips:16 parser/projection contracts,4 actual service/RPC
cases and1 unchanged staged-rename consumer. Cases include malformed-record
priority over earlier conflict stages, Unicode whitespace, literal path delimiters,
fixed rename selection, sparse entries, read/throw order, fake unborn temp-index
commands/cleanup, delayed/rejected index results and same-key status sharing.
Strict emitted resolution rejects source fallback; private probes extract actual
source/emitted expressions through the supported isolated compiler adapter.

The initial implementation passed20/21 in each mode. Inlining stdout.split()
in the for-of iterable changed numeric-stdout TypeError wording by adding
"or its return value is not iterable". Separating the split acquisition restored
the frozen wording. Assertions, budgets and all five freeze files remain exact.
The initial red source/emitted hashes are respectively
a8186e6fbf220a8053ba3ec8e09a114699358546b68180a46e44918fcd701108 and
3662c3fcf2ac25033cd13ed3c6df7a5b7fac78e2d87de18790b5b28df9de67d1;
red/final logs and byte audits remain in /tmp/knorvia-selected-index-evidence.

Exact runners (Node24.14.0/pnpm10.33.2/TypeScript6.0.2):

```sh
export PATH=/tmp/node-v24.14.0-linux-x64/bin:/tmp/knorvia-tool-bin:$PATH COREPACK_HOME=/tmp/knorvia-corepack
TSX_TSCONFIG_PATH=packages/ui/tsconfig.json node --experimental-test-module-mocks --import tsx --test --test-concurrency=2 --test-reporter=tap packages/services/test/git-selected-index-contract-fast-20261001.test.ts packages/services/test/git-selected-index-callers-fast-20261001.test.ts packages/services/test/git-staged-rename-consumer-fast-20261001.test.ts
KNORVIA_GIT_RESOLUTION_TARGET=dist KNORVIA_GIT_READ_PROJECTION_TARGET=dist TSX_TSCONFIG_PATH=packages/ui/tsconfig.json node --experimental-test-module-mocks --import tsx --import ./packages/services/test/git-read-projection-emitted-register-fast-20261001.mjs --test --test-concurrency=2 --test-reporter=tap packages/services/test/git-selected-index-contract-fast-20261001.test.ts packages/services/test/git-selected-index-callers-fast-20261001.test.ts packages/services/test/git-staged-rename-consumer-fast-20261001.test.ts
pnpm exec tsc -p /tmp/knorvia-selected-index-evidence/tsconfig.json --pretty false
```

Scoped types pass the16-file services dependency closure reachable from the
repo source, using existing shared/RPC declarations; no referenced project build.
Owned lint passes4 files, zero errors/warnings; formatting passes6 files;
architecture reports zero violations. Offline freshness --no-fetch passed against
cached origin/main, not a fresh remote check. After the disconnect notification,
local status/content/log reads succeeded; no health-driven tests were rerun.

No full suite, root-wide types/lint, CLI/desktop build, native Git/platform,
shipped binary or rendered GUI acceptance was run. Commands/filesystem ports are
fake; no actual Git mutation, user files/data, model/provider/network test effects,
credentials or settings/security changes occurred. Shared inventories, notices
and older lane27/root26 scopes remain exact. Independent provenance/licence and
aggregate/native acceptance stay root-owned; no clean-room, whole-file MIT grant
or publication claim. No remaining blocker.
