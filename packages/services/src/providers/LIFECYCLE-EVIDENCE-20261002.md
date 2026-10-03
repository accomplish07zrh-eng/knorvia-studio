# Provider HTTP/transport — bounded submission evidence

Same draft PR10/branch following serialization dce099ae2dee4583ef13378b27586ed2515f5ff0. Complete six provider API implementation owners reauthored; barrel export declarations retained/recreated with unchanged surface. Queued remote-sync, model-provider and providers directories are now covered by scoped batches. Imported shared ApiError/createUuid and Undici/Node networking implementations remain dependencies requiring separate provenance/acceptance.

## Frozen originals and submitted sources

| Source                        | Original Git blob                          | Original raw SHA-256                                               | Submitted raw SHA-256                                              | Original → submitted lines |
| ----------------------------- | ------------------------------------------ | ------------------------------------------------------------------ | ------------------------------------------------------------------ | -------------------------- |
| api/apiJson.ts                | `4a31147f928290feffd9b3fc62c297ff6de66f6e` | `6e7d98dbff63c327e2de57993d3d7061d03978b0d9c8073f9378dc9df39bd8b4` | `8817908dde43a434a9b69a825555d185803982b9ceb545653649a02b9f5be46b` | 92 → 61 (58 nonblank)      |
| api/apiKeyHeaders.ts          | `f07da4526f76bd2fcd37e47bdcdfa33cb7b87442` | `a91b5d78c6e535e817720f2695af96e54127e0ddc3eb7cf5224e5741ae5bca7a` | `ebddee791e684867a08c35a7b4e637eeaaa885671a1b3aa834f24a6d4be8fdda` | 22 → 9 (9 nonblank)        |
| api/index.ts                  | `186aca6527fc01752a1ad2e428759b3b2a844b1c` | `4183f440f5cc07d420ba656423e78b60141897e9e005c3ad5a562471e30aea94` | `c75cd335bef1a43847613d8c4d09617cf93460fe33e7f48d0023ff4cbe5c8252` | 9 → 12 (9 nonblank)        |
| api/networkErrorClassifier.ts | `b82f68c8a656ca561855bf9b5a734d2d75b352ed` | `28f38f5e98a27ab80d008ffbdb6557d752fb7fc5dfc63c8e4c160bfc66687208` | `e0c5500ea57359c2efaf48d0fd60f2695864503a3862a0426d18a759feb5659c` | 88 → 63 (58 nonblank)      |
| api/nodeApiClient.ts          | `0204873f0547ce14aec62db4e74724b61dddd05e` | `1580dd3c42c38d03b75d4c4904d6a5c720a8a30589b2bda71e26267afb9b917b` | `ae87c77735014a39526c433fe59bf471a83a6d79bc10646c86abca113473d866` | 58 → 58 (53 nonblank)      |
| api/nodeApiNetwork.ts         | `6b8a9c63e3121dc4c4f6fa63bf1feabb663fbd9f` | `1492c5cbcb1eb44ba01c676a33626490dc05839b4a9c7cf5ce23fc7fd1ff6813` | `a34c633fbe53362f8039e7c0af0beeb5fd31365b3b95929388ccab1f5fcbc132` | 252 → 207 (192 nonblank)   |
| api/requestIdHeaders.ts       | `458ce6875180626b773eb0bae22a21eb45f6ebe4` | `1a036770052b0c454dc09a645c021b4af6c33cba96949d110e497f2928aa5fcf` | `3b4f26686328985308f9085c8f531ff532810251312f1b19ef91c684c60f9b90` | 36 → 28 (25 nonblank)      |

## Authorship and exact access limits

Final author GPT-6.1 Sol high fresh_http_bodyfree_author with fork_turns:none reports instructions, current verified behavior/API packet, filename discovery and own authored code only. No inherited target/dependency bodies/history/diffs/tests/old packets/drafts, actual settings/key/token/CA reads or product-network/runtime actions. Coordinator inspected originals for behavior extraction and final review. Import/type/barrel declarations, regex wire grammar, diagnostic/error strings and dependency contracts supplied compatibility expression; conventional owner expression may coincide. No novelty required; no blanket independence/MIT claim.

Initial HTTP author received an exposed faulty API appendix and was interrupted before writing target source. All affected provider drafts from other first runs discarded, three distinct new authors spawned with verified declaration-only appendices. See ../model-provider/PACKET-EXPOSURE-20261002.md. Corrected HTTP appendix verified10 exported signatures, zero function bodies. Coordinator explicitly clarified that default Undici result is only type-asserted to Promise<Response>: preserve original response/input identity, no adaptation. Final author implemented that behavior.

## Preserved responsibility boundaries

NodeApiClient owns only per-request timer/controller and explicitly supplied requests, no account/auth/URL injection. Headers normalize existing key/request-id behavior. JSON parser preserves request rejection identity, HTTP error-message priority and diagnostics. Error classifier traverses cause/errors cycle-safe and permits retries only with existing establishment evidence.

Host transport owns deferred single-flight options, per-route dispatcher cache, generation/dispose state and creation teardown. Proxy/noProxy grammar and custom CA merging retain default root trust. Failed options/dispatcher reads propagate without direct fallback and clear failed cache entries for later retry. First dispose mode wins; pending creations drain, responses keep identity. No global transport rewriting, new auth/permission/TLS/security policy or feature introduced.

## Actual scoped checks

Original providers scoped tsc passed before authoring. Final scope tsc on index.ts, networkErrorClassifier.ts, requestIdHeaders.ts, nodeApiNetwork.ts traverses all six implementations: pass/no diagnostics. Command flags --noEmit --skipLibCheck --target es2024 --module nodenext --moduleResolution nodenext --types node. Final oxlint providers/api:0 warnings/errors on7 files. oxfmt applied. Final staged architecture passed 0 violations /0 baseline /0 new; staged whitespace check passed.

Tools isolated in /tmp/knorvia-settings-tools and temporary npm cache, including undici6.23.0 matching manifest; workspace symlinks restored after npm pruned them. No repo dependency manifests/locks changed. Node24.19.0 differs from repository CLI24.14.0. No environment/action failure was bypassed.

Ordinary tests/builds explicitly skipped. This batch adds no persisted write path or permission probe requiring a new safety test. No live HTTP/proxy/CA/credential tests or requests were executed; fake-transport timeout/cancellation/teardown/diagnostic/classifier regressions, platform, stress and aggregate licensing remain unrun/deferred. Static checks and source review do not establish runtime parity. Existing tests/frozen expectations unchanged. No restricted Library/actual user data/global license/inventory/main or cross-lane merge. No remaining scoped implementation blocker.
