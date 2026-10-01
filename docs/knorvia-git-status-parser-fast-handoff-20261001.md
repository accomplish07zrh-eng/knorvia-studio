# Porcelain decoder checkpoint

Original commits:3705a032cd16f6a433982097854fc1ce1a44c6cf freezes the spec/tests;
c563cce6c141a58e7a3aa5f07927e21ec9885a67 implements the parser and read-only audit.
This receipt adds no production changes. Owned production is only the
parseStatusPorcelain body and two narrow private decoders in gitCliHelpers.ts.
Five spec/test/oracle paths and the audit helper are the seven bound changed paths.
Earlier completed slices, source evidence and failure proofs remain immutable.

The original body SHA256
`0e8597fc7dff3bb58a450e08bd07057fc6aee23073d19c5a27464f5a66f4ba69`
matches publisher872ad960/tree d185a9, import7619e41, integrated0d80f9c and47d2ae1.
Exact file hashes/blobs and local/publisher facts are in the sibling observations
JSON; publisher material was read from the existing separate bare storage.
No publisher implementation was copied into production.

The new grammar boundary streams nonempty NUL records, decodes fixed ASCII-space
fields positionally and admits tracked entries through one ordered path. Valid
renames consume the next nonempty record; invalid renames consume none. Literal
headers, last-wins state, empty/default/Unicode/line-terminator/XY behavior, duplicate
entries and normalization remain compatible. This replaces meaningful record,
field and entry-selection structure; no extra await/promise, cache or effect owner.

Retained source includes public signature/output fields and order, header strings,
kind/counter/path leaves and original JavaScript path-tail grammar. The private
kind/counter functions and all23 other helper declarations are byte-identical.
The entire remainder matches after masking only the selected body and two new
private declarations, with no whitespace normalization. Repo/getStatus, all await/
in-flight/status-fallback owners, service/read projection, provider/environment,
config and public declarations are exact. The copied three-declaration oracle and
reused fixture/RPC conventions remain inherited/source-exposed test material.
Selected syntax observations are non-exhaustive; tests/hash changes/line counts
are not authorship proof. File remains mixed upstream-modified/unreviewed
NOASSERTION. No clean-room, whole-file MIT, licence or native acceptance grant.

Before production: **88/88 source and88/88 strict emitted**,2 files each:
79 grammar/property cases and9 actual fake-port consumer/owner cases. One grammar
case performs320 deterministic fixture comparisons; these are not320 individual
runner cases. Initial unchanged runs were87pass/1fail because my expected argv put
-z before --untracked-files=all. The actual source and emitted command order agreed;
the expected order was corrected before freeze, with failed log hashes retained.
The first code splice clipped the return annotation; formatting rejected it before
tests. The exact frozen signature was restored, then final gates passed.

Final **214/214 source and214/214 strict emitted**,5 files each: new88, existing
read consumers18, comparison consumers11 and actual status-owner timing97.
Actual getStatus/service/RPC/refresh cover header and ordered entries, staged/
unstaged/conflict selection, rename/workspace paths, zero-stat untracked directory,
exact argv/limits, error prose/rejection cleanup, reentrant/queued sharing,
invalidation and late results. Types5422 locale keys; configured lint2932 files,
owned lint4 files, owned format6 files and changed/full architecture passed.
Audit helper formatting/lint and receipt formatting/replay are separate checks.

**Full regression and CLI/desktop builds were not run.** Root owns the aggregate
integration batch under the user's cadence. All product ports are synthetic; no
real command, user files, mutation, remote/provider, credentials or settings access.
This is Linux source/emitted acceptance, not native Git, Windows/macOS, mounted
React or separate/remote Host acceptance. The older Windows read expectation fix
remains root-owned80d053a and its original lane evidence unchanged. Shared
licensing/inventory/notices/deps/CI/CLI/security remain untouched. Older lane27 and
parent-reported26 obligations stay separate.

Exact final runners, Node24.14.0/pnpm10.33.2,5 files/214 individual cases each:

```sh
export PATH=/tmp/node-v24.14.0-linux-x64/bin:/tmp/knorvia-tool-bin:$PATH COREPACK_HOME=/tmp/knorvia-corepack
TSX_TSCONFIG_PATH=packages/ui/tsconfig.json node --experimental-test-module-mocks --import tsx --test --test-concurrency=2 packages/services/test/git-status-parser-*.test.ts packages/services/test/git-read-projection-consumers-fast-20261001.test.ts packages/services/test/git-branch-comparison-consumers-fast-20261001.test.ts packages/services/test/git-branch-comparison-settlement-fast-20261001.test.ts
KNORVIA_GIT_RESOLUTION_TARGET=dist KNORVIA_GIT_READ_PROJECTION_TARGET=dist node --experimental-test-module-mocks --import tsx --import ./packages/services/test/git-read-projection-emitted-register-fast-20261001.mjs --test --test-concurrency=2 packages/services/test/git-status-parser-*.test.ts packages/services/test/git-read-projection-consumers-fast-20261001.test.ts packages/services/test/git-branch-comparison-consumers-fast-20261001.test.ts packages/services/test/git-branch-comparison-settlement-fast-20261001.test.ts
node packages/services/test/git-record-parser-audit-fast-20261001.mjs docs/knorvia-git-status-parser-fast-evidence-20261001.json --current
```

The88-case pre-code runners use only the new status-parser test glob. Strict mode
uses current type-emitted artifacts and rejects product source fallback. The
read-only audit verifies exact commit scope, pinned/local body lineage, untouched
declarations/remainder, retained syntax and copied oracle. --current additionally
requires the live owned files/emitted artifacts to match this historical snapshot;
omit that flag when replaying immutable commit evidence after later replacements.
It does not regenerate shared provenance or treat passing tests as a licence grant.
Payload seal: `1e700d03b63c442b2abce299d6374abf5d35980a20b8138391f7f6626223b1a2`.
