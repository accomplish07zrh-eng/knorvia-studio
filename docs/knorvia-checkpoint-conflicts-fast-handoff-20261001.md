# Checkpoint conflict scanner checkpoint

Baseline9d01b4cfdbdd80daa20e88d61336d5159359a40d →
freeze1a7fcd88cfe7c269776c4eed839cca8db6e4a697 →
productionb1efeab52849e8d260846e95c3b4b07a986a41f1 → this receipt.
Only collectWorkspaceConflicts's body in gitCheckpointRepo.ts changes production.
Support: one spec, three test/fixture files and an exposed test-only oracle.
All earlier checkpoints, assertions, rejected-generator history and reviews remain
immutable; no helper, public declaration, command/provider policy or other owner
changed.

The scanner classifies one reason per path, constructs one common conflict record
and folds it into ordered slots during the read traversal. First conflict fixes
position; subsequent conflicts replace that slot's value, while matching repeats
leave it intact. Every occurrence is still probed. This replaces four duplicated
record constructors and the deferred deduplication pass; there is no generator,
interpreter, async driver, cache, retry or cancellation owner. Standard Map/array
techniques and fixed classification policy are not claimed novel algorithms.

Precise retained expression: private/public types and signatures; empty-path
guard; original ls-tree/hash-object argument arrays, cwd, option absence and
validation labels; tree parser/path helpers; mode120000 predicate and directory/
symlink short-circuit; lstat failure classification; stdout.trim/objectId comparison
inputs; four reason strings and conflict field order/workspace-relative call.
pathExists remains wholly retained, including its catch-all fail-open semantics
and nested await. All four explicit awaits remain in the original scanner; no
extra promise boundary was introduced. Original explanatory comments are retained
in the attributed oracle, not copied into the new body. Fixture scaffolding reuses
lane isolated-compilation/RPC conventions and all fixture data is owned synthetic.
The full checkpoint file remains mixed-source; root independently reviews actual
expression and rights under the existing MIT criteria.

The old declaration matches publisher872ad960de7ec172591f7e1952f7849229f94521,
tree d185a9a893c00d51fc3fe51fe7371b9eea7de143, file blob
4e3a267d0ab031e3bd252a96197ff38bd921c082, file SHA256
f698ee512e6f9406547fd8747465541522898efc38dc0275ffef2c347621250a.
Import7619e41b950bd52073ebf36754146cf25659d9fa and baseline9d01b4c share blob
f8b189e7fd0fee83fecf9c4f7569749be5b0d0db and the baseline source digest below.
Their collector declaration SHA256 is exactly
b77a96410caeb826c05021cd3cbc7f3be7a1caa67d72bffc936b1dab2bae8618.
Existing separate pinned local objects were read without fetch/ancestry changes.

Byte audit masks only this body and proves the entire remaining file exact:
SHA256 c32c5255f44687ac0d14278ea6fbdaf6c1c4deb59ea9a41a94ebab25a9a1af5a.
This preserves all restore/force/verification, creation/diff/delete, cleanup and
availability implementations. The other25 Git production files, five shared
records/notices, all five freeze files and public emitted declaration bytes also
remain exact. The previous whole-file review9d01b4c remains historical and bound
to dfac801; its checker should reject this new worktree's changed protected
checkpoint bytes. It was not silently rebound or treated as current passing proof.

SHA256 bindings:

| Bytes                       | SHA256                                                                                                                              |
| --------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| baseline source             | 46382efb69435d280b14eabeb8e533c64cf1a12b869aae87e3b3452286af25a3                                                                    |
| final source                | 1bad5d046f273d858f9c77cd5e70f4b2933595b55223c2f4b05d46d98f644c38                                                                    |
| final emitted JS            | 0e36d8a9ed4781fed151a77e83d5458b6ca62312d05a379e0c1470f290b9b825                                                                    |
| unchanged public d.ts       | dd9c88be9c969b598998b328c52f3dacf743890028fe66a3f2c2f2dbb4e045ae                                                                    |
| exposed oracle              | a1cee1572a8f402a62178f84d3f56f4bf8565c1bb1aac63c843c04983071bba1                                                                    |
| final source / emitted logs | 6dc4d028f0aac44ecb53cd2f4d740f9ff3d2dcaac85505c895440d8a7fecc5d4 / 70402160e070d7fd7ced6b21f8bc87e0e095f274614abefc854ad098142d57c5 |

Frozen and final each pass16/16 individual cases across two files per mode,
zero failures/skips:8 private scanner contracts and8 actual checkpoint service/
RPC consumers. They cover classification/read order, duplicates, raw Unicode/
Windows/delimiter spellings, malformed trees, error priority/prose/identity,
receiver short-circuits, lazy prefix/current-array reads after a pending tree,
queued/reentrant independent scans and late resolution/rejection. Consumers verify
preflight conflict returns before mutation, force requests and target verification
success/failure. Every restore/process/filesystem/store/resolution port is fake;
no real Git mutation runs. Strict emitted loading rejects source fallback; private
probes extract the actual source/emitted body through the supported isolated
compiler adapter. No test assertions or budgets changed after the freeze.

Exact runners, Node24.14.0/pnpm10.33.2/TypeScript6.0.2:

```sh
export PATH=/tmp/node-v24.14.0-linux-x64/bin:/tmp/knorvia-tool-bin:$PATH COREPACK_HOME=/tmp/knorvia-corepack
TSX_TSCONFIG_PATH=packages/ui/tsconfig.json node --experimental-test-module-mocks --import tsx --test --test-concurrency=2 --test-reporter=tap packages/services/test/checkpoint-conflicts-contract-fast-20261001.test.ts packages/services/test/checkpoint-conflicts-consumers-fast-20261001.test.ts
KNORVIA_GIT_RESOLUTION_TARGET=dist KNORVIA_GIT_READ_PROJECTION_TARGET=dist TSX_TSCONFIG_PATH=packages/ui/tsconfig.json node --experimental-test-module-mocks --import tsx --import ./packages/services/test/git-read-projection-emitted-register-fast-20261001.mjs --test --test-concurrency=2 --test-reporter=tap packages/services/test/checkpoint-conflicts-contract-fast-20261001.test.ts packages/services/test/checkpoint-conflicts-consumers-fast-20261001.test.ts
pnpm exec tsc -p /tmp/knorvia-checkpoint-conflicts-evidence/tsconfig.json --pretty false
```

Scoped types pass the22-file services dependency closure rooted in checkpoint repo/
service, consuming existing shared/RPC declarations without referenced builds.
Owned lint passes4 files, zero errors/warnings; formatting passes6 files plus this
receipt; architecture has zero violations. Offline freshness --no-fetch passed
against cached origin/main. Raw logs/byte audit: /tmp/knorvia-checkpoint-conflicts-evidence.

No full suites, root-wide gates or aggregate CLI/desktop builds ran. Coverage is
synthetic, not native Git/Linux/Windows/macOS or shipped/GUI acceptance. No real
user data/files, providers/network, credentials or settings/security effects
occurred. Notices and older lane27/root26 scopes remain unchanged. Root owns
aggregate/native acceptance and independent licence review; no whole-file MIT,
clean-room or publication claim. No blocker.
