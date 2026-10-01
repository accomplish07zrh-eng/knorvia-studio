# Lazy diff admission checkpoint

Original commits:9b2e53f5b87b785f995099bf359d7a178a01776a freezes the spec and
contracts; b84ba1aa4cb23d879f7f0faff759a35c3b390b1e implements only toDiffResult's
body in gitCliHelpers.ts. This receipt adds no production change. The sibling
digest record binds six changed paths, exact publisher/local lineage and final
emitted artifacts. Earlier porcelain/numstat and other lane receipts stay intact.

The original body SHA256
`87ea7e9ccad5819ad5fad738e044221a4f37c7a654442a8c2777477e56c13b62`
is identical in pinned publisher872ad960/tree d185a9, import7619e41,
integrated0d80f9c and starting78df1ba. The publisher bytes were already available
in separate temporary storage and were read only. The shared ledger still labels
the enclosing file upstream-modified/unreviewed NOASSERTION; this receipt does
not change that classification or assert whole-file originality.

The replacement selects a verdict through ordered lazy stages, then constructs
one public result. It preserves timeout/truncation/exit/empty/binary/patch priority,
repeated getter and thrown-error order, allowed-code includes/NaN semantics,
nullish option defaults, raw patch bytes and fresh object ownership. It adds no
effect, async promise, await, cache, retry or policy. Compatibility predicates,
prose, defaults, stdout expressions, output leaves and public signature are
retained exposed source. All25 other helper declarations, including binary/error
helpers and accepted status/numstat decoders, are byte-identical. Masking only the
owned body leaves the exact whole-file remainder. Entire repo/query/await/cache,
service/projector/provider/config and public types stay exact. The copied
three-declaration oracle is inherited test material; fake RPC and UI AST/VM
fixture patterns reuse exposed lane conventions. Selected verbatim spans are
non-exhaustive and neither tests nor changed digests prove originality. No
clean-room, whole-file MIT, licence or native-acceptance grant.

The pre-code freeze passed **76/76 source and76/76 strict emitted**,2 files each:
59 classifier cases and17 real repo/service/RPC/GitPane consumer cases. Cases
include conflicting flags, malformed/literal stdout, lazy/changing/throwing getters,
reentrant classifier/query calls, fresh outputs, exact staged argv/cwd/limits,
two retained blob reads even after nonpatch outcomes, and UI duplicate/pending/
stale-generation/error cleanup. The UI load callback is extracted from actual
source/emitted AST and run with actual helpers/RPC, not a mounted React test.

Before the final freeze, an initial74-case source run had70pass/4fail because the
fixture requested helpers.ts as .tsx; the corresponding emitted run passed74.
The fixture extension was corrected and two reentrant cases added before the
76-case freeze. Both initial log hashes remain recorded. No product defect fix,
legacy assertion correction, relaxed assertion, timeout or concurrency change.

Final **81/81 source and81/81 strict emitted**,3 files each: the new76 plus five
existing actual service/RPC/UI commit-generation callers, with owned fake models.
Types/i18n5422 keys, configured lint2939 files, owned lint4 files, format6 files,
changed/full architecture and current/historical digest replay passed. Public
gitCliHelpers.d.ts remains SHA256
`1854488ccb0b1dd53a446abf3ebbcc35c1eda67193f827fa5e2210b0783df2b2`.
The prior numstat record replays its original production/artifact scope separately.

Exact final runners, Node24.14.0/pnpm10.33.2:

```sh
export PATH=/tmp/node-v24.14.0-linux-x64/bin:/tmp/knorvia-tool-bin:$PATH COREPACK_HOME=/tmp/knorvia-corepack
TSX_TSCONFIG_PATH=packages/ui/tsconfig.json node --experimental-test-module-mocks --import tsx --test --test-concurrency=2 packages/services/test/git-diff-result-*.test.ts packages/services/test/git-message-generator-callers-fast-20261001.test.ts
KNORVIA_GIT_RESOLUTION_TARGET=dist KNORVIA_GIT_READ_PROJECTION_TARGET=dist TSX_TSCONFIG_PATH=packages/ui/tsconfig.json node --experimental-test-module-mocks --import tsx --import ./packages/services/test/git-read-projection-emitted-register-fast-20261001.mjs --test --test-concurrency=2 packages/services/test/git-diff-result-*.test.ts packages/services/test/git-message-generator-callers-fast-20261001.test.ts
node packages/services/test/git-record-parser-audit-fast-20261001.mjs docs/knorvia-git-diff-result-fast-evidence-20261001.json --current
node packages/services/test/git-record-parser-audit-fast-20261001.mjs docs/knorvia-git-numstat-parser-fast-evidence-20261001.json
```

**Full regression and full CLI/desktop builds were not run**, per grouped user
cadence; root owns aggregate integration/publication gates. Tests used only owned
synthetic ports/strings: no real Git product commands, user repositories/files,
network/provider effects, credentials/settings/security changes. Linux synthetic
source/emitted acceptance does not certify native Git, Windows/macOS, separate/
remote Host, shipped application or mounted GUI. Root owns the older Windows
read-test assertion correction. Shared licensing/notices/inventory/dependencies/
CI/CLI/Creation and older27 registers are unchanged; parent-reported26 is separate.
Payload seal:
`b3f6a71da4666a6d97ee77c243c63900c239ef49a0761de4ce54cad43806f8bd`.
