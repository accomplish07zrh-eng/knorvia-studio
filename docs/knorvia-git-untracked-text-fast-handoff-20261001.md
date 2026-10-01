# Untracked text preview checkpoint

Append-only chain on parallel/file-watcher-fast-20261001:
baseline73321fd442d9474685cde06afd1af6d11201872b →
freeze/spec c1385e71239848dc2446d259e01f37e2e33aef06 →
production787a1e569498446eb07ece8b37b3f24bd9357942 → this receipt.
Only splitUntrackedText/buildUntrackedTextDiffResult bodies in
packages/services/src/git/repo/gitCliHelpers.ts changed in production (26 added,
32 removed lines). Four new spec/test/oracle files are bound below. No prior
receipt, accepted implementation, shared licensing record or notice changed.

The new line cursor recognizes LF boundaries, removes only a preceding CR and
does not allocate a normalized copy or trim a final split item. Classification
now selects one non-text result shape; an explicit loop constructs addition
lines. Binary priority, raw afterContent, two decoding calls, one builder await,
errors and public output property order remain. A synthetic 300000-LF input
proves the existing spread-insertion failure returns null; it is intentionally
retained, without a new line limit or policy correction.

Source exposure is explicit. The two old declarations match exact publisher
872ad960de7ec172591f7e1952f7849229f94521, tree
d185a9a893c00d51fc3fe51fe7371b9eea7de143, helper blob
470d91185ac5fc84904ad06185ff1858e753115e, SHA256
92a319350711c297c162cbc5d516823ba6db6b935d7136a12e1622c8e380b6ad.
Read-only objects came from the existing separate temporary publisher bare repo;
no fetch or ancestry change. Local import7619e41b950bd52073ebf36754146cf25659d9fa
and integrated0d80f9ca37b1daef162ecc69bd18f6e8fc30a146 share helper blob
89296a0a08f477a323aaa2b718fe3faf9465a21c, SHA256
082700e9066a1f72defab28d0f635e081fd5b4609c56c1b31742aa55aa17b592.
Baseline helper SHA256 is
0ad0965cfb94af63881d054b55b7dc921fb4451a1c25d374264d9be0f4f52681.
The immutable copied oracle includes old prose and is explicitly test-only;
production removed the old explanatory commentary.

Retained expressions include public names/signatures and record fields,
readFile/catch-null, includes(0)/byteLength comparison, normalizeGitPath and
splitUntrackedText(content.toString("utf-8")) order, header/hunk/summary prose,
the nonempty/no-newline branches, spread insertion, join-plus-final-LF and text
return record. These compatible expressions remain mixed with new control;
changed hashes/tests are not originality proof. Root independently reviews
expression and rights under the existing acceptance criteria. No clean-room,
whole-file MIT, licence grant or publication claim. Older lane27 and root26
obligation scopes, notices and shared inventories remain untouched.

SHA256 bindings at production787a1e5:

| Bytes                                                              | SHA256                                                                                                                              |
| ------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------- |
| helper source                                                      | 5a22bfdb1ea328759fd5df0e2147bee2a17592ce95c357433338a0b9c62b2104                                                                    |
| helper emitted JS                                                  | c68731210bde08c295a8332a9822bdf0332272e924f76a8bc6cac3249133b909                                                                    |
| unchanged emitted public d.ts                                      | 1854488ccb0b1dd53a446abf3ebbcc35c1eda67193f827fa5e2210b0783df2b2                                                                    |
| split body: old → new                                              | 0e48fa40e9483b1f47a494bb679b5de56a89147d6e8a446a815f2d66fdf01872 → 53038024e37b122f68df472472c21cedea32a85da9f891cd173fcc8a8dc3c535 |
| builder body: old → new                                            | dbde6f4e8a4d170b2ba7f327871becea0072e1b8b1fbf37dda5862d433e7db3b → 41b49b80db08415a7b905902f2d6e870f1048209b7582df13206d318592aa3a2 |
| protected remainder (replace only those bodies with named markers) | e90775ab0c03be0439fe3cc8ac24aa09ce02aa08775f1618914e90101a707945                                                                    |
| git-untracked-text-legacy-fast-20261001.json                       | b44525dda93274746eef22630f4221da086bb6463ae62739c688fa8d04156a77                                                                    |
| git-untracked-text-fixture-fast-20261001.ts                        | 1591edf65e5913b3f478e24eaa85eb70411349e1eba9e6433b544298f302b9a9                                                                    |
| git-untracked-text-contract-fast-20261001.test.ts                  | 2d629ee17f60beb37388c976299f18ce4851eed6f544c2d68a0a0f1467b62caa                                                                    |
| specs/knorvia-git-untracked-text-fast-20261001.md                  | cc4bc16d3c6041ca6c14f166bc36cd0c78a03307da37471512a20448fa60a993                                                                    |

Frozen and final runs each passed37/37 individual cases in one test file per
mode, with zero failures/skips. Initial36-case baselines also passed; the last
case froze the discovered insertion limit before production. Cases cover golden
CRLF/bare-CR/empty/Unicode/invalid UTF-8/literal header outputs, byte priorities,
getter/receiver/error order, deferred success/rejection and real service/RPC
consumers, including reentrant reads and late completion after invalidation.
Private splitter declarations are evaluated from actual source/emitted bytes;
the exported builder and repo/service/RPC execute their actual modules.
Traced UI consumers are GitPane/getDiff and GitPaneChangeCard's content pair;
rendered GUI acceptance was not run. All product IO used owned fake ports.

Exact final runners (Node24.14.0; pnpm10.33.2; TypeScript6.0.2):

```sh
export PATH=/tmp/node-v24.14.0-linux-x64/bin:/tmp/knorvia-tool-bin:$PATH COREPACK_HOME=/tmp/knorvia-corepack
TSX_TSCONFIG_PATH=packages/ui/tsconfig.json node --experimental-test-module-mocks --import tsx --test --test-concurrency=2 packages/services/test/git-untracked-text-contract-fast-20261001.test.ts
KNORVIA_GIT_RESOLUTION_TARGET=dist KNORVIA_GIT_READ_PROJECTION_TARGET=dist TSX_TSCONFIG_PATH=packages/ui/tsconfig.json node --experimental-test-module-mocks --import tsx --import ./packages/services/test/git-read-projection-emitted-register-fast-20261001.mjs --test --test-concurrency=2 packages/services/test/git-untracked-text-contract-fast-20261001.test.ts
```

Raw logs are in /tmp/knorvia-git-untracked-text-evidence. Frozen source/emitted
SHA256:4ae82f1bae7ffcf18aeec06aa81191a988106b4b16f91541e5f0295319ba6457 /
3eaa98aa22da84e5fcdb4b3c6fd3bbffac5fccd72b1c9132e829d076baadd953.
Final source/emitted SHA256:
bf6302422856430e1a4d1d141ac1925c2c382094eee3ab262c7759b0c260de07 /
b80609262eb22bd5349d29f5d63ef201eb2aacbc423c486510233072f2cb4a3f.
Services-only tsc -p packages/services/tsconfig.json passed and refreshed dist;
explicit oxlint passed3 owned files/94rules; oxfmt check passed5 scope files;
architecture changed check passed with0 violations; offline freshness --no-fetch
passed against cached origin/main. Final receipt formatting is checked separately.
The formatter corrected one owned ternary layout before final gates. Successful
post-disconnect status/content/log reads confirmed preserved freeze/implementation;
no health-only test rerun, environment recreation or uncertain mutation retry.
Root-wide types/lint, full regression and CLI/desktop builds were deliberately
not run under the reduced cadence. No native OS, actual filesystem/Git fallback
or shipped/UI acceptance claim; aggregate gates remain root-owned. No blocker.
