# Ordered refresh checkpoint

Append-only chain: baseline8571700ae9a7b8c8a19b5b742a19a6220d0b14ea →
freeze527c7755b2f39ce0ed3b9e5484f7f34012de0703 →
production91ef2d617125576219c5767a030ecf6f4699b416 → this receipt.
Own only createGitService.refresh's body in gitService.ts (24 added/27 removed
lines), plus five new spec/test/oracle files. gitCliHelpers.ts remains stable for
root review; repo/maps, accepted projectors, other methods, declarations, shared
licensing and historical receipts are exact.

The method now collects reads in one ordered tuple, projects comparison first,
then populates one local result frame through an ordered source-list loop. It
publishes only after both projections succeed. One Promise.all await remains in
the entrypoint; targets/flags, disabled null promises, method/parameter reads,
error/projection priority and repo request lifetimes remain. No new cache or
async driver exists. Retained syntax includes repo port calls and flag predicates,
Promise.resolve(null)/Promise.all, accepted projector calls, comparison fields and
public frame property order. These are mixed with new local assembly control;
no moved function or changed hash is offered as originality proof.

The publisher refresh declaration and import/integration declarations match each
other; current baseline differs only in the already accepted branch-projector
expression. Exact publisher872ad960de7ec172591f7e1952f7849229f94521, tree
d185a9a893c00d51fc3fe51fe7371b9eea7de143, service blob
df3426c8a398f797730c90dcfbd85cce3c7a0259, SHA256
08f0e94e23cd3ea75ff9983f82ab140fc3a2d6280b11fe4eb0a0aba724b3e617.
Local import7619e41b950bd52073ebf36754146cf25659d9fa and integration
0d80f9ca37b1daef162ecc69bd18f6e8fc30a146 share blob
373f6569025ff41b7224dcb47b71252dad7c9c84, SHA256
13d01d313a65d8ee3676c6cbbc9cb8e4ccbee9f27e3d2d558321e3c9849a5927.
Read-only existing local objects verified this relationship; no fetch/ancestry
change. Source exposure and copied test-only oracle, including old prose, remain
explicit. Production removed the old explanatory commentary. Whole-file status
remains mixed pending independent expression/rights review under the existing
criteria. No clean-room, whole-file MIT, grant or publication claim; notices and
older lane27/root26 obligation scopes are untouched.

SHA256 bindings at production91ef2d6:

| Bytes                                            | SHA256                                                                                                                              |
| ------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------- |
| baseline service source                          | ccc15ab67ef51e32aa4b772d16ffa39092dc39498083d975ec117ff24466d8ce                                                                    |
| final service source                             | 21e2a60b8787b39f6ba38ca84a3e6064e0b54e4b92efe9916489ed1f16e8863e                                                                    |
| final emitted service JS                         | 213e4d253403b9b830e0b0ea2a587775a9f07ba8ff285688292953d78e115b44                                                                    |
| unchanged emitted public d.ts                    | 62cd8802eba9208a95a960e15b2b6cdb1d6f1e2d5c8a4a8ab286593a3642cdfa                                                                    |
| refresh body: old → new                          | e957d6ca2156e3dfefcdf130404ed1d7ead4a459f310035dd4bd2605be5da55b → 207889b2a8da62682776ce76b4a71c0e7d9955a3e7af8438c14f6e72f6601ca3 |
| protected remainder, only refresh body masked    | 59159223c7278511f5891f8e09da92dbaf451cd54bb9287f86487e57b41e0e7f                                                                    |
| git-refresh-frame-legacy-fast-20261001.json      | ef8d0fce31d78c9963f45401955cdc26e38d6ac933a28da928db57ab2ca2622a                                                                    |
| git-refresh-frame-fixture-fast-20261001.ts       | 2e566530c3cb6c1e1f48f16ee0fde56c740621108f36d9756633a23026aa032d                                                                    |
| git-refresh-frame-contract-fast-20261001.test.ts | 17af3d4c669b1357f0fa0f0edd4a41f328f44e834c6486beec8f72107ccc2098                                                                    |
| git-refresh-frame-owners-fast-20261001.test.ts   | 5ded714f9a6e7a097c42c63964f58f6d789db4fa181fa039147a6b7aef211719                                                                    |
| specs/knorvia-git-refresh-frame-fast-20261001.md | cbc89d5e66b0d34757685b0ce36a77ec99a1e6b29af451ac83db92bd5f446f37                                                                    |

Frozen and final runs each passed31/31 individual cases across three files per
mode, zero failures/skips:13 new contracts/owners plus18 unchanged immediate
service/RPC/UI consumers. New cases exercise thenable/effect ordering, sync and
deferred errors, projection precedence, null/shape handling, queued/reentrant
reuse, failure retirement, invalidation/different keys and late completion. Real
repo/service/RPC and supported pure UI consumers run through fake owned ports;
the strict emitted loader rejects source fallback. No real Git, user-file or
provider effects occurred. The existing consumer file, including its historical
Linux-only path assertion, remains unchanged; root owns its subsequent Windows
portability correction. These results do not supersede that earlier limitation.

Exact runners (Node24.14.0, pnpm10.33.2, TypeScript6.0.2):

```sh
export PATH=/tmp/node-v24.14.0-linux-x64/bin:/tmp/knorvia-tool-bin:$PATH COREPACK_HOME=/tmp/knorvia-corepack
TSX_TSCONFIG_PATH=packages/ui/tsconfig.json node --experimental-test-module-mocks --import tsx --test --test-concurrency=2 packages/services/test/git-refresh-frame-contract-fast-20261001.test.ts packages/services/test/git-refresh-frame-owners-fast-20261001.test.ts packages/services/test/git-read-projection-consumers-fast-20261001.test.ts
KNORVIA_GIT_RESOLUTION_TARGET=dist KNORVIA_GIT_READ_PROJECTION_TARGET=dist TSX_TSCONFIG_PATH=packages/ui/tsconfig.json node --experimental-test-module-mocks --import tsx --import ./packages/services/test/git-read-projection-emitted-register-fast-20261001.mjs --test --test-concurrency=2 packages/services/test/git-refresh-frame-contract-fast-20261001.test.ts packages/services/test/git-refresh-frame-owners-fast-20261001.test.ts packages/services/test/git-read-projection-consumers-fast-20261001.test.ts
```

Raw logs/audit: /tmp/knorvia-git-refresh-frame-evidence. Frozen source/emitted
SHA256:9828320435698e8ff81e173eae3d27f21c32b3f880ebcfba2c2d5a0ccbc5a028 /
b6b675b83f83c2452514c856872b86b1ba6c8e62d92872f3c61daf244158c9db.
Final source/emitted SHA256:
3087340adf91df9c9f2689d1feb99ce1441e329c5e9be39cfcd0e28829819578 /
abb35ea159bc7de4b7d1e861d5bd81acba52603fa274d44c3b24604374b6b072.
Services-only tsc -p packages/services/tsconfig.json passed and refreshed dist;
owned oxlint exited0 with0 errors/1 no-thenable warning for the deliberate fake
then getter (no rule/fixture suppression); formatting passed6 scope files;
architecture changed check passed0 violations; offline freshness --no-fetch
passed against cached origin/main. Receipt formatting checked separately.
Root-wide types/lint, full suites and aggregate CLI/desktop builds were not run.
Rendered GUI, native/shipped, Windows/macOS acceptance was not run. Aggregate
gates and provenance decisions remain root-owned; no blocker.
