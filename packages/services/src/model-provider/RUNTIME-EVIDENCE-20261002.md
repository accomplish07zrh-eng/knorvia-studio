# Provider runtime/facades — bounded submission evidence

Same PR10/branch independent/settings-lifecycle-20261002, following remote-sync183afffe1c4092f3341bd9d881e036d3f92f5e33. Four full service-assembly/facade owners reauthored. Persisted files remain owned by retained @knorvia/provider-node, no new write path or data-location change here. Runtime config passes all option fields, personal path default and existing callback identities; registry source remains fail-closed for product accounts.

## Frozen originals and submitted hashes

| Owner                           | Original Git blob                          | Original raw SHA-256                                               | Submitted raw SHA-256                                              | Original → submitted lines |
| ------------------------------- | ------------------------------------------ | ------------------------------------------------------------------ | ------------------------------------------------------------------ | -------------------------- |
| providerConfigRuntime.ts        | `fc23aef5fd84e6736e1ff53853fff5225d7b01a1` | `765f2d194a18b5a8282003281d2895d7bbb857e100396c96fa2cc862a4de434d` | `eee80029f8ed400e4610956ba472afd85a6800febb989bea9dfc33b2da346825` | 72 → 68 (58 nonblank)      |
| providerRuntime.ts              | `9ade4c899021fbbeb3ae4790561f227a2a83d34b` | `f8891cbd51df9ae0ae05e19ceaa427387ad6be2ef2766ed9d3dbef149acccc54` | `e0b5c365f124225cf1cd73a2238a1087bfc3c9932f892559ee5e63d91ca190dd` | 205 → 189 (177 nonblank)   |
| providerFacadeServices.ts       | `95d5632f4335bccdb7250e5f35e0a6e0c542fe1d` | `adc1868e4db35ee516b799b7e012b2ebaa164b14981d7f2f9f83f24cb9df7d47` | `7fcecd2b76fe747414d126992c92d3ca58901a3b988d7faebfda741a41fbb807` | 271 → 264 (252 nonblank)   |
| providerSettingsConnectivity.ts | `81d40d6878a0f1285da1c14de7e8d2258f8b77cb` | `fae2bcf0df6ed8ed0e2698c6917032398ffe8b767f55ecd86e8782e5ae7b7673` | `bb9baf39f478cec32bfda0ccd58c8cfd3831f9a2a62c08ddf4cc8b547b29405e` | 44 → 37 (33 nonblank)      |

## Authorship and exposed expressions

Final implementation authored by distinct GPT-6.1 Sol high fresh_runtime_bodyfree_author with fork_turns:none. Reports only AGENTS, governance skill, verified behavior/API packet, coordinator declaration/behavior clarifications and own new code read. No inherited target/dependency bodies, history/diff/tests/old drafts or other lanes. Coordinator source-exposed extraction/review is separate. Compatibility types, descriptors, import paths and error/wire strings are supplied expression; no blanket independent package or MIT claim.

Important packet incident: first runtime/serialization/HTTP appendices erroneously included bodies due coordinator offset bug. Every affected draft discarded before any provider source commit; distinct agents restarted with AST-verified declaration-only appendices. See PACKET-EXPOSURE-20261002.md for actual exposure and discarded hashes. Initial discarded runtime types/lint success is not counted as final evidence.

Final coordinator review clarified exact providerId/modelId fields and original Undici response identity in separate HTTP batch. Runtime author uses ECMAScript #private state; mutation closures capture config/registry ports while runtime start/dispose retain live public registryService methods. Start remains non-async single-flight with synchronous disposed rejection and retry after failed startup. Settings operations retain readiness/barrier/eligibility precedence and delegated authentication; selection keeps revision ordering, two facade reads and post-dispose notification cancellation.

## Actual scoped validation

Original six-file queue scoped types (remote + five model-provider files): pass, no diagnostics. Final runtime/facade four-source-file tsc: pass, no diagnostics. Final oxlint four files: 0 warnings/errors. Changed architecture: 0 violations / 0 baseline / 0 new. Whitespace check passed; final staged architecture also passed 0/0/0 and staged whitespace check passed. oxfmt applied. Commands: isolated tsc --noEmit --skipLibCheck --target es2024 --module nodenext --moduleResolution nodenext --types node on these four sources; isolated oxlint same files; node scripts/architecture/architecture-check.mjs check --changed; git diff --check. Isolated temporary tools as prior batches; repository manifests/locks unchanged. undici6.23.0 installed only in /tmp tooling for queued HTTP checks. Node24.19.0 differs from repository CLI24.14.0.

Ordinary tests/builds skipped by explicit speed-first direction. No actual persistence/auth/connectivity/runtime calls were executed, so live integration, observer timing/failure injection, platform acceptance and underlying provider/package provenance remain unverified/deferred. No existing tests/baseline failures edited. No actual settings, tokens, user network or restricted Library access. No global license/inventory or cross-lane merge. No blockers after static checks.
