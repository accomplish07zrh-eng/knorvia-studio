# E core history/projection owner integration

Parent allocates compact/manual.ts, agent/message-history.ts, runtime/helpers/context-usage-breakdown.ts and compact-media.ts to E after the core compaction batch. Preserve existing functionality/data/lifecycle/public interfaces; no new behavior or persistence migration. Root exclusively owns the separately handed-off client transport targets. Same draft PR8; no cross-lane integration, main merge, global licensing changes or release.

```text
commands → MessageHistoryImpl (one in-memory entries/cache owner)
                ├─ synchronous read-only borrow / defensive clone → existing provider/persistence callers
                └─ init/replace/reset → same entry/cache contract
manual utilities / context contributors / media retry → request-local projections only
```

Existing canonical persistence, permission/official-CUA handling, model content schemas, tracing and provider projection remain separate owners and unchanged. MessageHistory preserves borrowed-array lifetime, clone depth/presence, metadata prefix classification, tokens/cache stats and query-local continuation scope. Projection owners preserve optional fields/key order/identity, visible-versus-provider reasoning estimate, fallback serialization, CUA collaborator call order and optional logger evaluation. Exact per-operation rules and public/dependency shapes are frozen in the scoped body-free packet `docs/evidence/core-history-projection-author-packet-20261003/`.

Four fresh no-inherited-conversation Sol/high authors each receive only their frozen scoped inputs and scratch output directory. Complete sources/receipts freeze before curator body review; a cohesive private helper is allowed only for message-history's under400-line boundary, with no new public barrel API/state owner/runtime cycle. Existing thin wrappers/projection data need no novelty-driven rewrite. Curator source exposure and instruction-only shared-executor limits are explicit. Matching required declaration/prose/data/clone vocabulary and ordinary idioms do not establish independent rights or whole-file licensing.

Static public declaration/import/output/input/unchanged-boundary binding review is permitted; it is not runtime/project compiler acceptance. Ordinary tests/builds/project typecheck/lint remain deferred. A minimal synthetic check is reserved for a concrete actual-write/permission defect; these owners introduce no disk/network/permission path. Do not invent such checks or repeat known missing-TypeScript architecture failures. Failure/correction history must remain intact. Global/legal and later aggregate acceptance remain with coordinator.
