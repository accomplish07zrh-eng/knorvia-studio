# Plugin sync lifecycle — bounded evidence

This batch follows `3407331f8f917f40eb1b41d92610fffdebc78cc1` in draft PR 10, branch `independent/settings-lifecycle-20261002`. Integration base remains `f25b931164ee6287167e965e9da7a7586131b264` on `recovery/independent-logging-20260930-0456`. No other lane is incorporated. Behavior contract: [LIFECYCLE-SPEC.md](./LIFECYCLE-SPEC.md).

## Frozen baseline and retained boundaries

The original lifecycle owner at the pre-batch commit has Git blob `666e034f6137224fa006a3866ff0e4ce027e6d99` and raw SHA-256 `dd2d8ce07bb126aa60b84a4726c228a8ba5b933bc204a88a8986a27a1692b94a` (`packages/services/src/plugin-sync/pluginSyncService.ts`).

These security-sensitive dependencies remain byte-for-byte unchanged:

| Retained file        | Raw SHA-256                                                      |
| -------------------- | ---------------------------------------------------------------- |
| pluginSyncArchive.ts | 2ababad98e46fd8c29443aaf53aa9a6e3d94972a2c32eb07ef3f4e1caa85471a |
| pluginSyncPath.ts    | 7a15368e05537d694aab13192ca079cbf41f3a3621d6ced110c998ca93207c17 |

Public `pluginSync.ts` and shared types, the data-root resolver, and `remote-sync/remoteSyncWriteAccess.ts` are also retained. Other plugin runtime modules are untouched. Archive/path/permission-policy independence is not claimed by this owner replacement.

Before launching the fresh author, the original implementation passed the one bounded synthetic write-integrity test:

`node --import tsx --test packages/services/test/plugin-sync-data-integrity-20261002.test.ts`

Result: 1 test, 1 pass, no failures/cancellations/skips/todos. The check exercises discovery and ID-based selection, archive export/import, config-field preservation, enabled overrides, target-vs-ID duplicate precedence, repeat imports, marketplace dependency mirror copying, and extraction-temp cleanup. POSIX checks config mode 0600; Windows skips that permission assertion. The remote URL in a fabricated marketplace declaration is never fetched. No actual user plugin/runtime installation or archive upload occurs.

Original scoped source types passed with `node_modules/.bin/tsc --noEmit --skipLibCheck --target es2024 --module nodenext --moduleResolution nodenext --types node packages/services/src/plugin-sync/pluginSyncService.ts`. Freshness passed (its behind-remote check reported no tracking reference); architecture before source edits: violations 0 / baseline 0 / new 0. Services remains an unmanaged legacy module, with no discovered direct contracts. No existing test or frozen failure evidence was changed.

## Authorship and acceptance boundary

The coordinator read inherited implementation and provided the behavior/API brief. Fresh author `fresh_plugin_sync_author` (Astra high, no inherited conversation) read repository guidance, the spec, the public service interface and shared type-only contract, then its own new code. Its initial file listing also exposed repository instruction/skill path names, not implementation contents. It reports no inherited target/dependency implementation, history, diffs or other-lane reads. Coordinator review supplied behavioral corrections for captured config-path lifetime, property-presence semantics, case-insensitive manifest identity, strict source-kind classification and async forwarding. The author implemented corrections without reading inherited bodies; coordinator formatting followed. This is a complete lifecycle replacement candidate, not a clean-room claim about the coordinator or a claim of full package independence. No MIT statement, root license, dependency manifest, global provenance or security-policy change is included.

The original 1,145-line lifecycle owner is replaced by 813 lines across four freshly authored files (net -332, including blank lines). Helpers were authored from the brief, not extracted from inherited bodies. Their exact submitted raw SHA-256 values are:

| File                            | Raw SHA-256                                                      |
| ------------------------------- | ---------------------------------------------------------------- |
| pluginSyncService.ts            | eb723801fbb8263586c0adae80ec7de186ec12dbb818fc10309fa3a53b72d50d |
| pluginSyncInventory.ts          | ad09f1f6b352bb1c141a626227355704a33c4d05a7fea7b9859f12c610d68c9c |
| pluginSyncMarketplace.ts        | c68b7a31a6a212d08630538454f3c3bcc75fa763b3093f54fb778832d2ea9a1a |
| pluginSyncMarketplaceArchive.ts | 2cbc56805a218d1743ff6ed0d41f80d3d90eff7f9a8b612e3780c49d47376c97 |

## Replacement checks

- The same synthetic integrity test passed once on the replacement: 1 test, 1 pass, no failures/cancellations/skips/todos. No ordinary broad tests or builds ran.
- Scoped types passed: `node_modules/.bin/tsc --noEmit --skipLibCheck --target es2024 --module nodenext --moduleResolution nodenext --types node packages/services/src/plugin-sync/pluginSyncService.ts packages/services/src/plugin-sync/pluginSyncInventory.ts packages/services/src/plugin-sync/pluginSyncMarketplace.ts packages/services/src/plugin-sync/pluginSyncMarketplaceArchive.ts`.
- Scoped oxlint on these four sources and the new integrity test: 0 warnings, 0 errors. All files satisfy the 400-line rule without suppressions. `git diff --check` passed.
- Final architecture: violations 0 / baseline 0 / new 0. Retained archive/path hashes match the frozen table above exactly.
- The author's attempted `pnpm exec prettier --write` failed before formatting when pnpm attempted automatic installation under unavailable `/home/agent/.local/share/pnpm`. The coordinator used the already-established isolated tools and direct `node_modules/.bin/oxfmt` on lane files. No access restriction, dependency manifest, lockfile or CI gate was altered to recover.

Full suites/builds, cross-platform archive/link checks, forced rollback/cleanup-failure injection, adversarial archive/path testing, concurrency stress and final source/dependency licensing review remain unrun in this speed-first batch. Synthetic temporary roots are the only configuration/data locations used.
