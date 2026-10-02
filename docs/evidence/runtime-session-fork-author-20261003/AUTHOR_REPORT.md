# Session fork author draft

The complete owner is `session-fork.ts`, with seven cohesive `session-fork-*` internal modules. Public exports and their declared signatures follow `api.json`. Execution-state, model-selection, notice metadata, branch selection, and message/part clone helpers remain imported dependencies.

Authorship inputs read: `contract.md`, `api.json`, and `dependency-api.json` in this directory. The parent supplied functional/API clarifications for omitted dependency enum/factory names, trace logging, message store and publication ports, notice fallback agent, compaction predicate, goal status literals, and child-input clock order. No predecessor source, repository source, history, tests, oracles, other packets, workspace instructions, or settings were read. `pwd` accessed working-directory metadata. Subsequent file reads were limited to these inputs and the files authored here for line counts, hashing, and immutable draft saving.

No production files, dependency helpers, permissions, or execution-state code were edited. No tests, builds, services, live ports, settings, external apps, or additional agents were run or changed. Static review used the authorized contract; no curator comparison occurred before draft saving and hashing.

`draft-01/` preserves the complete initial implementation before comparison. `DRAFT_SHA256SUMS` records SHA-256 hashes; `DRAFT_MANIFEST.json` records hashes and line counts. Every TypeScript file is below 400 lines. Runtime/type integration remains for the curator because repository inspection and test/build execution are outside this author's authorized scope. This draft makes no clean-room or licensing claim.
