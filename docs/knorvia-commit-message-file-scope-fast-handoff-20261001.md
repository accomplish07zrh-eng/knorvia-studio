# Session path-scope checkpoint

Baseline9cacedbe01156417db17ca2925f0a5c705dde4d9 →
freezeea82ebf5665ea92e0232ce8385f2dd047017cc31 →
production8c1e3f68ebb3acdc5ceb4f67beb310810cc0e497 → this receipt.
Only commitMessageFileScope.ts production changes (42 added/62 removed lines).
New support: one spec, three test/fixture files, one exposed legacy oracle and
this receipt. Protected production, shared records/notices and earlier receipts
are exact. gitService.ts remains mixed-source; refresh ownership is not reopened.

The implementation scans key bounds, compiles raw/relative/prefixed aliases into
a sorted/deduplicated vector, and uses lower-bound binary membership while the
public array filter retains file order/references. This replaces regex/Set key
construction and lookup control without another owner, IO, await or cache. The
vector remains local; sorting affects private key order only. Cost is O(A log A)
construction/O(log A) membership for A aliases, rather than Set lookup. No new
path/file/diff limit is introduced and no large-input performance claim is made.

Exact inherited compatibility expression remains: imports/public signature and
parameter types; normalizeGitPath(path.trim()); source map(trim)/nonblank filter;
the four-field scope input record/getter order; normalization helper calls;
absolute/relative classification, workspace-prefix guard and path field tuple;
ordinary array-filter traversal and fixed path tokens. New expression is the
character-bound scanner, alias vector acquisition/deduplication and binary index
control, plus ordered file matching. These are source-exposed contribution
candidates under independent root review, not proof from changed hashes/counts.
No old explanatory commentary was copied into production. The full old source
is explicitly copied test-only oracle material; synthetic fixture paths/results
are owned, and RPC/isolated compilation scaffolding reuses lane test conventions.

Publisher872ad960de7ec172591f7e1952f7849229f94521, tree
d185a9a893c00d51fc3fe51fe7371b9eea7de143, file blob
d26afda1f8efc46552b798c985aff050182ccbcd, SHA256
f6dfbd37de47cbdceb46aa42d8cb718983e42b365aa83dfcc39aaff8b1b9f00e.
Read-only existing local publisher objects verify all six original declarations
against9cacedb, whose file blob isec59eed8eb288dc3ed5ac0a870c08702d2400a3d.
The prior whole-file review remains historical and unchanged; its checker should
reject this newer worktree's protected scope-file bytes rather than silently
rebinding the old candidate. Shared provenance/rights decisions remain root-owned.

SHA256 bindings:

| Bytes                       | SHA256                                                                                                                              |
| --------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| baseline source             | f813e660387f81f205ad6adbf925f4ec09f5c2e903aedeae768c1977311a9d2e                                                                    |
| final source                | b25ad115fa9776dec306bad84d071daa0bb84d855019951d6e0f4a3d47ad5f5c                                                                    |
| final emitted JS            | 7c29cc31980fbe70a539ead64ce5d55b623a335b3e8fff9df1b808e1344c137b                                                                    |
| unchanged public d.ts       | 472fb7109c3af7800d59ac2374d35f988238f9792b7097874e45a11b8ef87c09                                                                    |
| legacy oracle               | 30564f790209f0821e44fe166da75083a02073243350fdc3b0064526e5d37a1d                                                                    |
| final source / emitted logs | 373864a91b8c5077543b91cd580512e150f34710cc68e3acc3b03483f2bbb844 / e6e7f429446bac3af12b253b965193c18cdab67f7a2bc0aa972ed4fa9b1bf2b4 |

Frozen and final runs each pass24/24 individual cases across three files per mode,
zero failures/skips:16 pure contracts,3 new actual service/RPC cases and5 unchanged
generator/RPC/UI callback cases. They cover POSIX/Windows lexical adapters,
case/Unicode/slash/dot spellings, aliases/containment, null/empty fail-open,
malformed errors, sparse arrays, duplicate identities and eager-field/lazy-match
order. Actual callers preserve filtered source order before the eight-diff window,
reverse/rejected settlements, one generator handoff and empty-selection errors.
Strict emitted resolution rejects source fallback. Pure dialect probes use the
actual source/emitted file in the supported isolated compiler adapter; this is
synthetic cross-platform coverage, not native Windows/macOS or rendered GUI proof.

Exact runners (Node24.14.0/pnpm10.33.2/TypeScript6.0.2):

```sh
export PATH=/tmp/node-v24.14.0-linux-x64/bin:/tmp/knorvia-tool-bin:$PATH COREPACK_HOME=/tmp/knorvia-corepack
TSX_TSCONFIG_PATH=packages/ui/tsconfig.json node --experimental-test-module-mocks --import tsx --test --test-concurrency=2 --test-reporter=tap packages/services/test/commit-message-file-scope-contract-fast-20261001.test.ts packages/services/test/commit-message-file-scope-callers-fast-20261001.test.ts packages/services/test/git-message-generator-callers-fast-20261001.test.ts
KNORVIA_GIT_RESOLUTION_TARGET=dist KNORVIA_GIT_READ_PROJECTION_TARGET=dist TSX_TSCONFIG_PATH=packages/ui/tsconfig.json node --experimental-test-module-mocks --import tsx --import ./packages/services/test/git-read-projection-emitted-register-fast-20261001.mjs --test --test-concurrency=2 --test-reporter=tap packages/services/test/commit-message-file-scope-contract-fast-20261001.test.ts packages/services/test/commit-message-file-scope-callers-fast-20261001.test.ts packages/services/test/git-message-generator-callers-fast-20261001.test.ts
pnpm exec tsc -p /tmp/knorvia-commit-scope-evidence/tsconfig.json --pretty false
```

Scoped type project extends services' config but lists only the scope source and
imported config.ts, uses existing shared/RPC declaration references and emits to
services/dist; build info remains in /tmp. Initial TS6307 omitted config.ts from
that explicit file list; including it passed. Product assertions/budgets were not
changed. Owned lint passes4 files with0 errors/warnings, formatting passes6 files,
architecture passes0 violations, offline freshness --no-fetch passed. Read-only
audit verifies the public signature/d.ts, immutable freeze and protected bytes;
its initial large Git-show capture hit ENOBUFS, resolved via raw blob hashing
without increasing buffers/timeouts. Logs/audit: /tmp/knorvia-commit-scope-evidence.

No root-wide types/lint, full suites, CLI/desktop builds or native/shipped/platform
acceptance were run. No real user files, Git/model/provider/network test effects,
credentials or security/settings changes occurred. Notices and older lane27/
root26 scopes remain exact. No clean-room, whole-file MIT grant or publication
claim; independent provenance and aggregate acceptance stay with root. No blocker.
