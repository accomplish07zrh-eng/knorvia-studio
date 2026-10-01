# Raw numstat decoder checkpoint

Original commits:c83cb5516d3d4001daae94bd0612f7a8535bee71 freezes the spec/tests;
5fad890649f8ca722f098c4ee773319f7c622759 implements the parser. This appended
receipt makes no production edits. Scope is only parseNumstat in gitCliHelpers.ts,
four narrow test/oracle files and the spec: six digest-bound changed paths.
First porcelain checkpoint14f7f5a and all earlier evidence/production stay immutable.

Original body SHA256
`7e6e4b5565607db7d843e6ac86320ea9ca9ebece9fbca6ab087f3af923fdd9be`
equals publisher872ad960/tree d185a9, local import7619e41, integrated0d80f9c and
14f7f5a. Full path/commit/blob/file digest facts are in the sibling observations JSON.
Existing separately stored publisher bytes were read, never copied into production.

The new per-call raw-NUL cursor retains positional empty records for rename tails,
then decodes first/second-tab boundaries and admits values to one ordered Map.
It preserves raw path suffixes, malformed/partial numbers, empty/missing rename
tails, normalized duplicate last-value/first-position behavior, property presence
and downstream kind inference. This is a coherent record/field/consumption rewrite,
not a moved formatter or a second stats/query/cache owner. No new effect, async
promise, await, retry or error/permission/environment policy.

The existing numeric helper, normalizer, Map/property/default expressions and
public signature remain retained source. All25 other helper declarations,
including first checkpoint's status/cursor/field decoders, are byte-identical.
Whole-file remainder is exact after masking only parseNumstat's body, without
whitespace normalization. Entire repo/status/await/in-flight/fallback owners,
service/read projector, config/provider and public type files stay exact. The
two-declaration oracle is copied inherited test text; fixtures and the unchanged
read-only audit reuse exposed lane conventions. Selected verbatim fragments are
non-exhaustive and not an originality metric; changed hashes/tests/line counts do
not prove authorship. Whole enclosing file remains mixed upstream-modified/
unreviewed NOASSERTION. No clean-room, whole-file MIT, licence or native grant.

Before implementation: **54/54 source and54/54 strict emitted**,2 files each:
49 grammar/ownership cases and5 actual status/comparison/service/RPC/refresh cases.
One case runs320 deterministic delimiter mutations against exact frozen code;
those comparisons are not320 runner cases. No failing initial numstat run or
intentional legacy behavior correction. Tests use owned typed-string outputs only.

Final grouped **268/268 source and268/268 strict emitted**,7 files each:
new54, prior porcelain88, read consumers18, comparison consumers11 and status-owner
settlement97. Actual stats Maps, ordered comparison/rename selection, refresh status
coalescing and existing queued/reentrant/rejection/invalidation/late behavior pass.
Types5422 locale keys; configured lint2936 files, owned lint4 files, owned format6
files and changed/full architecture passed. Public gitCliHelpers.d.ts was directly
compared against the first checkpoint artifact and remains SHA256
`1854488ccb0b1dd53a446abf3ebbcc35c1eda67193f827fa5e2210b0783df2b2`.
Receipt formatting and current/historical digest-scope replay are separate checks.

First receipt retains its own c563cce JavaScript bytes,214-case results and
87pass/1fail argv-fixture proof. Current268 runs bind5fad890, and do not silently
certify those older JavaScript hashes as current. No historical matrix regenerated.
**Full regression and full CLI/desktop builds were not run for either slice.**
Root owns aggregate integration gates under the user's cadence. All product
process/stat/filesystem ports are synthetic; no actual Git commands/mutations,
repositories/user files, remote/provider, credentials or settings/security changes.
Linux source/emitted consumer acceptance is not native Git, Windows/macOS,
mounted React, separate/remote Host or shipped application acceptance. Root owns
the older80d053a Windows read-assertion correction; original lane evidence remains.
Shared licensing/inventory/notices/deps/CI/CLI and older lane27 registers remain
untouched, with parent-reported26 obligations separate.

Exact final runners, Node24.14.0/pnpm10.33.2,7 files/268 individual cases each:

```sh
export PATH=/tmp/node-v24.14.0-linux-x64/bin:/tmp/knorvia-tool-bin:$PATH COREPACK_HOME=/tmp/knorvia-corepack
TSX_TSCONFIG_PATH=packages/ui/tsconfig.json node --experimental-test-module-mocks --import tsx --test --test-concurrency=2 packages/services/test/git-numstat-parser-*.test.ts packages/services/test/git-status-parser-*.test.ts packages/services/test/git-read-projection-consumers-fast-20261001.test.ts packages/services/test/git-branch-comparison-consumers-fast-20261001.test.ts packages/services/test/git-branch-comparison-settlement-fast-20261001.test.ts
KNORVIA_GIT_RESOLUTION_TARGET=dist KNORVIA_GIT_READ_PROJECTION_TARGET=dist node --experimental-test-module-mocks --import tsx --import ./packages/services/test/git-read-projection-emitted-register-fast-20261001.mjs --test --test-concurrency=2 packages/services/test/git-numstat-parser-*.test.ts packages/services/test/git-status-parser-*.test.ts packages/services/test/git-read-projection-consumers-fast-20261001.test.ts packages/services/test/git-branch-comparison-consumers-fast-20261001.test.ts packages/services/test/git-branch-comparison-settlement-fast-20261001.test.ts
node packages/services/test/git-record-parser-audit-fast-20261001.mjs docs/knorvia-git-numstat-parser-fast-evidence-20261001.json --current
node packages/services/test/git-record-parser-audit-fast-20261001.mjs docs/knorvia-git-status-parser-fast-evidence-20261001.json
```

The54-case freeze uses only the new numstat test glob. Strict emitted uses current
typecheck artifacts and the existing source-fallback-rejecting loader; budgets and
concurrency unchanged. The unchanged read-only audit verifies sealed scope/bytes,
publisher/local body lineage, protected declarations/remainder, selected syntax
and copied oracle. Historical first replay omits --current; that flag correctly
rejects its old source snapshot on the new checkout. Current replay additionally
checks live owned source/emitted bytes. This does not grant licences or regenerate
shared provenance. Payload seal:
`49ffbf4b2401ff73ba657a945d99f37923124f7a185c2092ccf8470d975c536d`.
