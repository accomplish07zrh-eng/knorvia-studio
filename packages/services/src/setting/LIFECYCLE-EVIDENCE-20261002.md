# Settings persistence owner — bounded submission evidence

Base: `f25b931164ee6287167e965e9da7a7586131b264` on `recovery/independent-logging-20260930-0456`.
Branch: `independent/settings-lifecycle-20261002`.
Behavior contract: [LIFECYCLE-SPEC.md](./LIFECYCLE-SPEC.md).

## Authorship and scope

The coordinator read inherited settings implementation and extracted the behavior/API brief before authoring. A fresh internal author (`fresh_settings_author`, Astra high, no inherited conversation) replaced four entire files from that brief. It did not read inherited target implementations, their diffs or history. It read repository guidance, this lane's spec and the service interface. A type search also exposed a few shared-schema migration guard/assignment lines and field declarations; this limited dependency-source exposure is explicitly retained in the record.

The coordinator reviewed the new implementation against source-extracted behavior and sent behavioral corrections concerning notification timing, fault hooks, commit entry, property presence, failure identity and narrowing. The fresh author implemented those corrections. Coordinator formatting followed. This is a bounded independent-authoring candidate, not a claim that the source-exposed coordinator or the complete application has clean-room provenance. No MIT claim, root license change, global inventory update or licensing decision is included. Parent review must classify these exact bytes and retained dependencies.

Replaced owners: the per-instance settings admission/commit queues and full read/write/migration lifecycle, complete patch normalization, public deadline helper, and host-local observer wrapper. Schemas, atomic IO/locking, path adapters, service contracts and sync discovery/import remain retained dependencies. No extraction-only claim is made for these untouched components. Source delta for the four replacement files: +224/-422 lines (net -198).

## Exact source evidence

SHA-256 values are raw file bytes. All paths below are relative to `packages/services/src/setting/`.

| File                        | Base SHA-256                                                     | Submitted SHA-256                                                |
| --------------------------- | ---------------------------------------------------------------- | ---------------------------------------------------------------- |
| settingService.ts           | 8a3edb7d945b27dad1d6fd34190cea2092745ad78cf62219ca05f5137944fd04 | 9a6f4ab89ec2fb6c5b262750feef37bba277b479ae7875bb41d3f9846aeddae0 |
| normalizeSettingsPatch.ts   | 6e4bba28ec8bc99697ebc2e6c7d6de8962702c18aa005d2a94156eac1162dd57 | caf64e86b3aef1db3dd9fd21cdd003825175b2db2962776271f4d69a6809cce2 |
| settingsWriteQueue.ts       | 7ba0ee6123e01a04f51369b94f4ac88285c52c52ce6d69464047255c6671fbce | 1ee6d7715e41cbffd998be98e9a4acc22385ef2d505be56ca8d0c730a38b9a9e |
| observableSettingService.ts | 5e1fc15a9d6eb267ae68c64d7f58d55d8104796bf23288b42a1fb80e92fe4efd | 3f1c786612e2126c9cd4cff5fa04bf0d89e3802d05ac6e35b71341a358970569 |

## Validation and environment record

- Workspace freshness passed at the specified base (dedicated branch initially lacked tracking). The initial object was absent locally; ordinary recovery-branch fetch supplied it.
- Initial `pnpm architecture:check --changed` failed before checking because pnpm attempted dependency installation under unavailable `/home/agent/.local/share/pnpm`. Direct architecture invocation then failed with `ERR_MODULE_NOT_FOUND: typescript`. Initial isolated npm setup likewise failed because its default cache directory was unavailable. No approval or access restriction was bypassed: installation subsequently used explicit writable `/tmp` prefix and cache.
- Isolated tools: TypeScript 6.0.2, tsx 4.19.4, zod 4.6.5, yaml 2.9.0, oxlint 1.57.0, oxfmt 0.41.0 and Node types 25.5.0; Node runtime v24.19.0 (repository CLI engine asks for 24.14.0). Workspace package links were local tooling only, with no dependency manifest/lockfile changes.
- Architecture check/context succeeded before source replacement: services is an unmanaged legacy module with no discovered direct contracts. Before and after checks each reported violations 0 / baseline 0 / new 0. Command: `node scripts/architecture/architecture-check.mjs check --changed`.
- Targeted synthetic safety run passed 9/9: `node --import tsx --test packages/services/test/setting-lifecycle-safety-20261002.test.ts packages/services/test/setting-data-location.test.ts packages/services/test/studio-first-run-settings.test.ts packages/services/test/release-update-settings.test.ts`. This was a replacement run, not a frozen original-code baseline run. The existing six tests were not changed.
- Initial scoped type check found five diagnostics on the new mutable-unknown narrowing. These were corrected. After the final narrowing/property-presence/synchronous-throw corrections, the new lifecycle safety file alone was rerun: 3/3 passed. The existing six tests were not unnecessarily rerun after those final bounded changes.
- Final scoped source type check passed: `node_modules/.bin/tsc --noEmit --skipLibCheck --target es2024 --module nodenext --moduleResolution nodenext --types node packages/services/src/setting/settingService.ts packages/services/src/setting/settingsWriteQueue.ts packages/services/src/setting/normalizeSettingsPatch.ts packages/services/src/setting/observableSettingService.ts`.
- Final scoped oxlint on those four sources and the new test: 0 warnings, 0 errors. Oxfmt applied only to lane files; `git diff --check` passed.

All filesystem checks used synthetic temporary roots; observer and timer checks used synthetic callbacks. No real settings, credentials, SSH, production data, deployment or restricted Library data was accessed. Existing frozen failure records and test expectations were left unchanged; no broad baseline pass is asserted.

## Remaining acceptance

Full test/build/type/lint suites, UI checks, cross-platform acceptance, prolonged IO/cancellation stress, complete sync-owner replacement and dependency/license auditing are unrun or outside this coherent batch. Aggregate acceptance and integration remain with the parent after collection of all lanes. No main merge, force push, CI/security weakening or source-bundle upload is part of this submission.
