# Settings sync complete-owner replacement — bounded evidence

This batch follows `0574142f420dd446d9e0c8bca89e311f172f2a4d` in draft PR 10 on `independent/settings-lifecycle-20261002`. The integration target remains `recovery/independent-logging-20260930-0456`; no other lane was merged. Behavioral contract: [LIFECYCLE-SPEC.md](./LIFECYCLE-SPEC.md).

## Frozen original evidence

The original `packages/services/src/settings-sync/settingsSyncService.ts` is identical at the requested integration base and the prior settings-lane commit:

- Requested base: `f25b931164ee6287167e965e9da7a7586131b264`.
- Pre-batch commit: `0574142f420dd446d9e0c8bca89e311f172f2a4d`.
- Original Git blob: `36f6d0c90a33f1117b510f5d68307f2a348e59d3`.
- Original raw SHA-256: `21de52af2c5d21a2012884b2969da8986065acd355ec993a8b951ed2a0204b80`.

Before the fresh author was launched, one synthetic write-integrity test ran against that original owner:

`node --import tsx --test packages/services/test/settings-sync-data-integrity-20261002.test.ts`

Result: 1 test, 1 pass, 0 fail/cancelled/skipped/todo. It covers serial mixed-category imports, preserving unrelated plugin/MCP configuration, case-insensitive conflict winner, repeat-import no-overwrite behavior, unchanged sources, exact JSON newline format, and first-run marker observer forwarding. This is a concrete shared-config write check, not a broad equivalence matrix. The fixture uses fresh synthetic HOME/USERPROFILE/data directories only.

Original-owner scoped TypeScript check also passed: `node_modules/.bin/tsc --noEmit --skipLibCheck --target es2024 --module nodenext --moduleResolution nodenext --types node packages/services/src/settings-sync/settingsSyncService.ts`. Architecture precheck reported violations 0 / baseline 0 / new 0. The services context remains unmanaged legacy with no discovered direct contracts. Freshness passed, with the script reporting no remote tracking reference for its behind-remote check. No frozen failure record or existing test expectation was edited.

## Ownership and retained dependencies

The replacement owns source catalog, candidate discovery/parsing, conflict projection, serial import mutation, config merging, results, instruction copy and first-run forwarding. The public service interface/shared types, skill traversal, command parser, logging, settings persistence service and data-root resolver remain retained dependencies and require their own provenance review. Sync has no existing cancellation or cross-call write queue; `onProgress` is currently unused. This batch must not claim those as new capabilities or synthesize observer events outside the injected settings update path.

The coordinator inspected inherited sync implementation and supplied the behavior/API-only brief. Fresh internal author `fresh_sync_author` (Astra high, no inherited conversation) read repository guidance, the lane spec, the unchanged service interface and shared sync type declarations. It reports no inherited target source, history, diffs, dependency implementation or other-lane reads. The coordinator supplied dependency signatures and source-derived behavioral corrections; the author implemented those corrections without reading inherited source. Coordinator formatting followed. No clean-room claim applies to the coordinator, and no MIT or blanket original-source classification is made.

The entire original owner was replaced. The author initially wrote two new implementations, then split its own fresh code into four modules to satisfy the existing lint limit. This split is not an extraction of inherited code. Final source size: 2,403 original lines to 967 lines across four files (net -1,436, including blank lines).

| Submitted path, relative to this directory | Raw SHA-256                                                      |
| ------------------------------------------ | ---------------------------------------------------------------- |
| settingsSyncService.ts                     | e53c89f7aa5fd611e7defab977509c87ccdbbbc2edacf18c4a165e2bb4a39a1d |
| settingsSyncCatalog.ts                     | 58b1c613c49a575163f1318fb52e2af32c6900a2b838ba03932a5fedb64a359c |
| settingsSyncSources.ts                     | 5b95fe026feec2de396f2572c3e56bcc19d8374e8dd3fb0d8482fad8ba9e4802 |
| settingsSyncImport.ts                      | c75a136ff185b31c512cb1ce2273869efbcfc067284fb0ae12e9b448964be873 |

## Replacement checks

- The same bounded integrity check passed on the replacement: 1 test, 1 pass, no failures/cancellations/skips/todos. After internal imports were rewired for the file split, it was rerun once to check the final runtime wiring: again 1/1 passed. No broader equivalence matrix or unrelated tests were run.
- Scoped TypeScript checking passed before and after the split. Final command: `node_modules/.bin/tsc --noEmit --skipLibCheck --target es2024 --module nodenext --moduleResolution nodenext --types node packages/services/src/settings-sync/settingsSyncService.ts packages/services/src/settings-sync/settingsSyncCatalog.ts packages/services/src/settings-sync/settingsSyncSources.ts packages/services/src/settings-sync/settingsSyncImport.ts`.
- Initial replacement lint failed the 400-line limit on two files (505 and 420 counted lines). The author split its fresh code, removing the need for the inherited file's suppression; no lint rule, CI gate or baseline was weakened. Final scoped oxlint over the four files plus the integrity test: 0 warnings and 0 errors.
- Final architecture check: violations 0 / baseline 0 / new 0. `git diff --check` passed. Oxfmt was restricted to this lane's changed source/spec/evidence/test files.
- Review corrections preserved source-root summary paths, separate summary/count collision passes, per-selection cache lifetimes, dot-file exclusions, malformed-manifest precedence, own-map enumeration behavior, settings dependency forwarding and default destination capture timing. These are source-derived review findings, not claims of exhaustive runtime coverage.

## Validation boundary

Tooling reuses the isolated `/tmp` installation recorded by the settings batch, adding smol-toml 1.6.1. No dependency manifests or lockfiles are edited. Full test/build/type/lint suites, cross-platform symlink/hardlink behavior, UI acceptance, prolonged races and final source/dependency licensing audit are deferred to aggregate acceptance. No real user settings, network credentials, production data, restricted Library data or source bundles are used.
