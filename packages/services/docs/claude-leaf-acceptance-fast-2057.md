# Claude-native service leaves: Fast 2057 checkpoint

2026-09-30. Branch `cloud/services-claude-leaf-20260930-fast-2057`. Exact implementation base: `8e8f6310d5ca70a57a454054e44f7b61db30b83f`, verified as PR7 head at batch start. The integrator later advanced to `34fb23e5f5c610bd7379096d3f281f4bff79b71f`; fetching that head and comparing it with the base found no changes under `packages/services/src/session/claude-native`. This batch remains based on its recorded start head. Only the integrator combines branches into PR7.

The previous two service batches and their acceptance reports were read. Their tips remain `5a0def9b6e3ccf831fcbe2a47d5cf178806e1a12` and `98ad2bc5c17f2a6013a3dcb5be089788c72fb7b9`; none of their source paths, commits or helper is replayed here. The user's Fast creation parameters were delegated by the parent; no tier-control search or global setting change was needed.

## Exact five-path ownership and delivery

All paths below are relative to `packages/services/src/session/claude-native/`.

| Owned path                         | Result                                                                                | Remaining inherited expression                                                                                          |
| ---------------------------------- | ------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| `jsonLineRecord.ts`                | Source reviewed; byte-identical tiny guards retained                                  | The complete short guard expressions                                                                                    |
| `sessionHistoryJsonl.ts`           | Whole-file LF cursor and one current-line slice replace full-line split/filter arrays | Native IO/UTF8/JSON delegation, error wrapper and readline head framing/cleanup                                         |
| `importedClaudeTaskFileFilter.ts`  | One selector segment array, recursive index advancement; no per-level rest copies     | Grammar/default paths, clone/delete/array delegation and standard guard                                                 |
| `claudeNativeSessionHeadParser.ts` | Shared fragment projector and indexed, length-captured collection for ordinary arrays | Regexes, timestamp/metadata/visibility rules, extraction frame and native flatMap/filter adapter for extended JS arrays |
| `buildImportedClaudeTaskFile.ts`   | Incremental UTF8 SHA256 feeding without a combined identity string                    | Hash protocol, title/trace factories, ordered metadata projection and cloning/filter stage                              |

Four production files changed, with a net addition of two lines. The tiny guard is not rewritten for a progress count. Spec, three test files, this report, [digest-bound evidence](claude-leaf-evidence-fast-2057.json) and [the complete remaining map](service-scope-map-fast-2057.json) stay inside packages/services. No source outside that package, shared ledger, package/config/lockfile, UI, schema, credential, storage, Creation orchestration, import persistence or other track's files changed. LICENSE, NOTICE.md and THIRD-PARTY-NOTICES.md remain unchanged.

The unchanged import repository owns scan/filter/sort. The full import parser owns transcript grouping; import service owns persistence/events. New state is invocation-local cursors/fragments/segments. There is no accepted queue, input cache, schema/data conversion or new service path.

## What can be independently reviewed

All five have concrete original upstream paths/blobs at `zai-org/ZCode@872ad960de7ec172591f7e1952f7849229f94521`. Four base files are upstream-unchanged; the builder is upstream-modified through existing brand/type changes. They are not newly original Knorvia code merely because they live under a Knorvia package name. Exact original and candidate SHA256s and upstream blob IDs are in the evidence JSON.

The author read current/upstream source and actual consumers to freeze contracts. There is no source-independent author or clean-room process. The new cursor, shared indexed traversal, ordinary-array collection and staged hash feeding can be reviewed as bounded algorithm expressions against the earlier frozen behavior and allocation evidence. That is a narrower proposition than certifying each whole file's independent authorship. Source exposure and surviving expressions remain part of the review.

The retained guard, regex/time/role rules, native array adapter and builder projection are explicitly inherited expressions. They still require separate source/licensing decisions; short functional expressions and protocol literals do not justify cosmetic rewriting or automatic license clearance. Keep existing Apache-2.0 and notices for production and repository default licensing for new support files pending their separate review. No independent-replacement/MIT production decision, MIT-ready statement or whole-application completion is proposed.

## Frozen compatibility and actual checks

[The contract](../specs/claude-leaf-contract-fast-2057.md) records every selected API and the negative cases before implementation. The initial 69-fixture suite passed untouched source and emitted JS before production changes; the final expanded suite also passes those same old targets.

| Check                                       | Actual result                                                                            |
| ------------------------------------------- | ---------------------------------------------------------------------------------------- |
| Initial old source / old emitted JS         | 69/69 each                                                                               |
| Final old source / old emitted JS           | 73/73 each                                                                               |
| Final candidate source / emitted JS         | 76/76 each: 73 compatibility + 2 cost + 1 differential harness                           |
| Old -> candidate source and emitted JS      | 575 equal observations per target, including all five public declaration ASTs            |
| Real consumers                              | Synthetic-root import repository, full file import parser and legacy snapshot codec pass |
| Old allocation regressions                  | Two expected failures: 16,386 line-array slots and 45,451 remainder-token copies         |
| Candidate allocation regressions            | Both pass in source and emitted JS: 0 whole-line-array slots; 0 remainder-token copies   |
| Scoped services/shared/RPC TypeScript build | Pass                                                                                     |
| Required root typecheck                     | Pass, including 5,422 matching i18n keys                                                 |
| Root lint/pre-push/changed architecture     | Pass: zero lint warnings/errors and zero baseline/new violations                         |
| Separate test-file TypeScript check         | Pass                                                                                     |
| Owned formatting / diff whitespace          | Pass                                                                                     |
| Read-only provenance freshness              | Fails with stale shared inventory; no ledger regeneration by this worker                 |

The compatibility fixtures freeze blank/nonblank error numbering, truncated/dirty tails, LF/CRLF/bare CR, BOM, invalid UTF8 replacement, multibyte decoding across a stream chunk, fractions/nonfinite limits, native IO/clone/TypeError/RangeError behavior, sparse/cyclic inputs, unknown fields, default-filter mutation, deletion order, role/model/tag/time boundaries, literal ID vectors, Unicode/lone surrogates, input isolation, trace failure stages, getter order and exact serialization/property order. Extended arrays retain custom flatMap output, species errors, proxy access order and getter-driven deletion/append behavior. Recursion preserves the native RangeError class; exact stack thresholds are not portable promises.

The real scan fixture injects disposable roots before scanning; no real HOME, user history or credentials is read. It verifies mtime/workspace/sidechain filtering, descending mtime sorting, limits and ignored subagent directories. It also freezes the existing first-16-record behavior: later sidechain/dirty tail records do not affect candidate scanning, while the full reader rejects the dirty tail. The full import fixture verifies assistant grouping/file order and that API-error visibility differs from head projection. The resulting snapshot passes the actual legacy codec. These fixtures are not proof of a real historical-data upgrade or GUI interaction.

The first draft's sparse-builder expectation was wrong: without an explicit title, the old Array.find path visits undefined slots and throws TypeError. That expectation was corrected and passed the old code before the contract commit. An additional test-only type check identified sparse-record casts and overloaded instrumentation signatures; those annotations were corrected without production changes. No final compatibility failure remains.

The allocation tests measure auxiliary work, not wall time: 16,384 blank lines plus one visible record previously created 16,386 line-array slots; the new cursor creates none. A depth-300 cyclic selector previously copied 45,451 remainder tokens; indexed traversal copies none. Whole-file read/decode, line strings, parsed results and native structuredClone memory remain. Head fast-path allocation reduction and incremental hash feeding have no separate wall-clock claim.

Available Node was 24.19.0; mise pins 24.14.0. Pinned pnpm 10.33.2 through task-local Corepack was used. Emitted tests use disposable ESM package copies with `#src/*` mapped to their own `dist/*` and installed workspace dependency links; their selected private helpers and real consumers are emitted JS. Shared dependencies retain existing package exports. No dependency installation/config edit was required during this batch.

Supplementary local logs are under `/tmp`: `knorvia-claude-old-{source,dist}-final-2057.tap`, `knorvia-claude-new-{source,dist}-final-2057.tap`, `knorvia-claude-diff-{source,dist}-2057.tap`, `knorvia-claude-old-cost-2057.tap`, `knorvia-claude-scoped-build-2057.log`, `knorvia-claude-typecheck-2057.log`, `knorvia-claude-pre-push-final-2057.log`, `knorvia-claude-test-types-final-2057.log` and `knorvia-claude-provenance-2057.log`. Durable fixtures, digest bindings and results are committed; local logs are supplemental.

## Integrator proposals and remaining scope

The shared ledger is intentionally unchanged. Review exact candidate digests and surviving expressions, preserve upstream relationships/Apache-2.0, and regenerate the derived shared inventory only after combining reviewed batches. The new fixtures/spec can be separately reviewed as support expression under the repository default; that review cannot relicense production. The evidence JSON makes these proposals explicit without writing authoritative decisions.

The recorded base contains 336 tracked services source paths: 151 upstream-modified, 34 upstream-unchanged, 151 unreviewed. This branch adds no source file. Across three service selections, 12 ancestral paths are selected: three previous session leaves, four previous automation leaves and these five. The previous automation executor adds one helper only when combined, giving 337 paths before other tracks' additions. All 12 ancestral selections still have provenance/whole-file review gaps. Selection is not replacement completion.

The 324 baseline paths outside those selections partition as 279 other service source paths, 10 deferred Creation, 3 credential, 10 device/filesystem for the other track, 8 task-database and 14 storage paths. The JSON enumerates every base path/classification/scope and its inventory-to-base digest match. These are fixed-base service counts, not a claim about the moving integrator branch or whole repository.

Recommend a four-path source-review slice under `src/agent/`: `configOptions.ts`, `agentPresentationSurface.ts`, `agentErrors.ts`, `pluginReferenceCatalogRequest.ts`. All are currently unmatched/unreviewed in the shared inventory; none should be assumed inherited. Establish history, upstream moved lineage and original Knorvia expression first. If original, retain it and document evidence; do not manufacture a rewrite. Freeze existing configuration projection, host presentation, stable error and -32601 catalog fallback contracts only where implementation work is justified. This recommendation authorizes no shared/protocol change or real agent request.

Native Windows/macOS, Electron/GUI, full studio/CLI build/test and combined CI were not run; the integrator owns those gates. Remaining blockers are shared inventory reconciliation, native/combined compatibility checks and whole-file licensing review. No duplicate PR, merge, force push, deployment or release was performed. This batch ends at its requested review checkpoint.

## Cherry-pick and reproduction

Cherry-pick in order:

1. `a5815f7656de963f753752a349dcfbaed35b9680` — frozen spec and old-behavior fixtures.
2. `b77fa3f2e60ae67e0456717cf04e845774744dc1` — implementation, expanded compatibility/cost/differential fixtures.
3. The final evidence/checkpoint commit identified in the final handoff response.

This batch has no dependency on replaying either previous service batch. Fetch only its dedicated branch for review; only the integrator updates PR7.

From the repo root, run `node --import tsx --test packages/services/test/claude-leaf-contract-fast-2057.test.ts packages/services/test/claude-leaf-cost-fast-2057.test.ts`, `pnpm typecheck`, `pnpm verify:pre-push` and focused formatting. Build only RPC/shared/services with `pnpm exec tsc -b packages/rpc packages/shared packages/services` for emitted checks. To reproduce old/new targets, extract/build the recorded base in a disposable package, link installed dependencies and map `#src/*` to that package's source or emitted tree as appropriate. Set `KNORVIA_CLAUDE_LEAF_ROOT=<package>` and `KNORVIA_CLAUDE_LEAF_TARGET=src|dist` for fixtures. Set `KNORVIA_CLAUDE_OLD_ROOT=<oldEmittedPackage>` for the differential test; it reports a skip when that optional comparison root is absent. The cost suite intentionally fails on old code; compatibility expectations are identical on both targets. The differential test also compares five freshly built public declaration ASTs after removing comments.
