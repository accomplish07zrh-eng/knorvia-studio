# Legacy model-provider serialization — bounded evidence

Same draft PR10 following runtime089edcadd9389670f9c79321368e152bc1baea93. Complete pure owner legacyModelProviderSerialized.ts reauthored with five cohesive own modules and compatibility export root. It preserves catalog-v1/store-v2/legacy schemas, all exported types/functions/constant, default context/format selection, tombstones, URL normalization, legacy migration and unknown mapping retention. No IO/auth/key/network operation added or executed.

Frozen original blob `c002a3e8c50f8ff8efd915619924da235463ecd7`, raw SHA-256 `47201a82624900b5864357ec8cef0bcfb046c2c091baf905a42abd8cda083d47`, 804 lines. Original module had a max-lines suppression; replacement uses none, all modules below400 nonblank lines.

| Submitted source                 | Raw SHA-256                                                        | Lines / nonblank |
| -------------------------------- | ------------------------------------------------------------------ | ---------------- |
| legacyModelProviderSerialized.ts | `e741de10388a542c99a8aecf79c728a9adf96bf800083603db0873e77badb92f` | 57 / 53          |
| legacyProviderTypes.ts           | `4961e3faf4f3d972f8cbbc14d338834a5cda25fab7e60cf6ea9ff49b2ad9c0d6` | 109 / 100        |
| legacyProviderSchemas.ts         | `4145a1ae02cd5008433e1868a6a71862e1763f5617a1be78ca832d169b448aa7` | 145 / 140        |
| legacyProviderModels.ts          | `4567b4c216a353230e73c112fb39ec89bba2d449485e1d2059d0aa119c949e1b` | 201 / 187        |
| legacyProviderEndpoints.ts       | `2426bef6a24b5a4672b4f8edeb3128cf3be14e20f0a0bb1f9c4f78908c9c0850` | 121 / 111        |
| legacyProviderMigration.ts       | `9a6e8c4ed6b07dba0af9f73c7627fa272ddd31d47efcb712df4d10562982e9af` | 100 / 96         |

## Provenance boundaries

Fresh GPT-6.1 Sol high fresh_serialization_bodyfree_author, fork_turns:none, reports reading only AGENTS, governance skill, verified SERIALIZATION-SPEC packet, coordinator behavior clarifications and own code. No inherited bodies/schema expressions/dependency bodies/history/diffs/tests/old drafts/other lane access. Packet supplied retained type/API syntax and schema/wire constraints; authored implementation and schemas reconstructed from behavior, no novelty criterion. Coordinator source-exposed extraction/review disclosed. Compatibility declarations/constants/enum grammar may share required expression; parent must classify provenance and retained zod/platform dependencies before any MIT claim.

The first serialization author was exposed to inherited bodies through a generator bug and that draft was discarded. New distinct author received AST-verified17 signatures with zero function bodies. See PACKET-EXPOSURE-20261002.md; no affected draft reached commit. New author reported packet hash 625f8cac94dcf45d3babb4af169c1bea3f89c9f41521a8decd753f9cc5479553 before final clarifications/formatting.

## Scoped results and corrections

Original queue scoped types passed before authoring. Initial final-candidate types failed TS2322 twice at legacyProviderModels.ts97/98: string[] defaults inferred wider than ModelProviderModality[]. Fresh author added explicit modality element types, preserving input/output-before-id phase order, and restored original falsy provider guard. Invalid runtime legacy API selection/filtering and endpoint-before-model order clarified from behavior; no policy change.

Final `tsc --noEmit --skipLibCheck --target es2024 --module nodenext --moduleResolution nodenext --types node packages/services/src/model-provider/legacyModelProviderSerialized.ts` (traverses all five own modules): pass, no diagnostics. Scoped oxlint root + five modules: 0 warnings/errors. oxfmt applied. Working diff whitespace passed. Final staged architecture passed 0 violations / 0 baseline / 0 new; staged whitespace check passed. Tools remain isolated /tmp dependencies; no manifest/lock edits, Node24.19.0 vs repo CLI24.14.0.

Ordinary tests/builds skipped per explicit speed-first direction. This pure batch has no concrete write/permission path warranting a new safety test. Schema/migration regression, invalid-value/error acceptance, platform and aggregate provenance remain unrun/deferred; static checks are not runtime acceptance. Existing tests and frozen failure expectations unchanged. No actual settings/tokens/network, no global license/inventory changes, no cross-lane merge. No implementation blocker after scoped static checks.
