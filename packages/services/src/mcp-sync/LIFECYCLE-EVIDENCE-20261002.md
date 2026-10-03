# MCP sync lifecycle — bounded submission evidence

This batch follows `ed7a8c933b754210cfdf1e6e93aac8a12f4085cc` in the same independent branch and draft PR 10. Recovery integration base remains `f25b931164ee6287167e965e9da7a7586131b264`; no cross-lane integration occurs. Behavior packet: [LIFECYCLE-SPEC.md](./LIFECYCLE-SPEC.md).

## Frozen baseline

Original `mcpSyncService.ts` Git blob: `c4542f352510b2c37dd955ea02792e4436495de8`.
Original raw SHA-256: `97254f53577fc326a6a09239eafa763ae578f68552c3606de5ffd176b05a20d6`.

Before the fresh author was spawned, one original-owner synthetic integrity test passed:

`node --import tsx --test packages/services/test/mcp-sync-data-integrity-20261002.test.ts`

Result: 1 test, 1 pass, no failures/cancellations/skips/todos. It covers canonical legacy-enabled migration and override cleanup, whole-map preferred-source behavior, ordered import conflict precedence, Windows-to-POSIX filesystem argument rewriting, unrelated config preservation, repeat-import no-write behavior, malformed-config refusal, and POSIX mode 0600 (permission assertion skipped on Windows). Test paths/config/MCP declarations are fabricated inside a fresh temporary root; no actual server is started or installed and no credentials are read.

Freshness passed, with the script reporting no tracking reference for its behind-remote check. Architecture-before reported violations 0 / baseline 0 / new 0; services context is unmanaged legacy with no discovered direct contracts. Existing baseline failures and expectations remain unchanged.

## Provenance and validation limits

Coordinator inspected inherited owner to extract behavior. A fresh GPT-6.1 Sol high author, `fresh_mcp_sync_author`, received no inherited conversation/body/history and was allowed only repository guidance, the lane packet, the service interface and specified shared type declarations. Retained permission adapter, data-root resolver, public interfaces and shared types require their own classification. No license grant or blanket package independence claim is made.

The author reports reading only the permitted guidance, behavior packet, service interface, shared type declarations and self-authored code. No inherited target/dependency bodies, history/diffs, other-lane context or actual settings were accessed by that author. Coordinator review requested sorted collision winners, reconstructed-map behavior, captured read paths and live post-await workspace metadata. Coordinator then corrected TypeScript indexed-property narrowing and restored missing-file short-circuiting before location construction. These source-exposed review corrections remain explicit in provenance classification.

## Final scoped results

- Original scoped owner type check: exit 0, no diagnostics.
- Replacement synthetic write-integrity check: 1/1 pass initially and after each relevant coordinator correction; final result 1 pass, 0 failures/cancellations/skips/todos.
- Initial replacement type check: exit 2, TS2698 at mcpConfig.ts:168 (indexed-property narrowing). Fixed by capturing and narrowing the legacy override record; final four-source-file check exits 0 with no diagnostics.
- Scoped oxlint on four source files and the one synthetic test: 0 warnings/errors.
- Changed architecture check: violations 0 / baseline 0 / new 0. Final staged check also passed with violations 0 / baseline 0 / new 0. Staged whitespace check passed.
- Formatting performed with isolated oxfmt; no repository dependency or lockfile edits. Tools use the previously disclosed isolated temporary dependency setup; Node 24.19.0 differs from repository CLI engine 24.14.0.
- No pre-existing tests/failure expectations were edited. The original-owner synthetic result and original hashes above remain frozen.

Commands: `node --import tsx --test packages/services/test/mcp-sync-data-integrity-20261002.test.ts`; isolated `tsc --noEmit --skipLibCheck --target es2024 --module nodenext --moduleResolution nodenext --types node` on mcpSyncService.ts, mcpConfig.ts, mcpDirectories.ts, mcpArgumentPaths.ts; isolated `oxlint` on those files plus the synthetic test; `node scripts/architecture/architecture-check.mjs check --changed`; `git diff --check`.

## Submitted owner source hashes

| File                | Raw SHA-256                                                        | Lines / nonblank |
| ------------------- | ------------------------------------------------------------------ | ---------------- |
| mcpSyncService.ts   | `3b0cbb8ac68f39f1c0ada3524ce3a023b825a048f683867207f6957bd74b1355` | 155 / 147        |
| mcpConfig.ts        | `04c304832b3185aac5568ebd3de66704cd443275c37ded242be2718dce94303e` | 207 / 189        |
| mcpDirectories.ts   | `704117806fc10f0f9273b5161b8e67694f5f66f27d7e871ce497356b751be1a0` | 100 / 92         |
| mcpArgumentPaths.ts | `aaff4e0b459d69e8e9f0ab9d71a402346db8f4f19173b58e41d8511413441e94` | 68 / 62          |

The original owner had 830 lines; the new complete owner spans 530 lines across four cohesive files, each below the 400-line lint limit. Public interface, shared types, data-root resolver and permission adapter remain unchanged.

## Remaining acceptance

Broad tests/builds, MCP runtime execution, actual remote permissions, cross-platform acceptance, adversarial/failure-injection/concurrency tests, and aggregate source/dependency licensing review remain unrun in this speed-first batch. Only the current lane's synthetic write-integrity check and necessary scoped checks are authorized here.
