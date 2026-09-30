# Automation service leaves: Fast successor 1240 handoff

2026-09-30. Branch `cloud/services-automation-leaf-20260930-fast-1240`, exact base `8e8f6310d5ca70a57a454054e44f7b61db30b83f`. PR7 and its integration branch were read/fetched and remain at that base at the final pre-push remote check. Prior service branch was fetched and verified at `5a0def9b6e3ccf831fcbe2a47d5cf178806e1a12`, preceded by `8c412427e4f53d335301b326c21e27309b28da76`; its docs were read and none of its production paths was changed or replayed.

## Delivered boundary

Five owned service leaves under `src/session/`: existing `automationCron.ts`, `automationCronValidation.ts`, `automationIntervalCarrier.ts`, `automationValidation.ts`, plus new internal `automationAdmissionConstraints.ts`. Three existing files were changed and one internal executor added. The tiny Croner adapter is retained without byte changes. Support files are this report, [the contract](../specs/automation-leaf-contract-fast-1240.md), three test/harness files, [digest-bound evidence](automation-leaf-evidence-fast-1240.json) and [the complete countable scope map](service-scope-map-fast-1240.json).

Daily calendar search now uses a lower-bound algorithm across the exact existing horizon for ordinary scalar-data rules. The exhausted sample produces the identical null result with 31 Date constructions, versus 73,201 on the base. The permanent regression budget is 40 constructions; it fails the old implementation and passes candidate source/dist. Proxy/accessor/inherited/nonfinite/early-year inputs retain sequential projection. Calendar units share a bounded period cursor and one timestamp projection; weekly candidates remain lazy. Rule and carrier validators use one lazy ordered executor, with a grouped monthly constraint and the original carrier field snapshot.

The existing service remains the clock/admission/lifecycle owner and the repository remains the persistence owner. Existing function signatures, four public declaration ASTs, errors/messages, property access order, JSON field order, carrier precedence, one-shot stale-target windows, nonfinite arithmetic, sparse arrays, local timezone behavior and search horizons remain covered. No timer, accepted state, persistent field, caller, protocol, schema or data migration was added. No source outside `packages/services`, manifest, lockfile, global configuration, credential, server, CreationService or other writer's device/filesystem/protocol paths were edited.

This is bounded implementation work, not whole-file independence. Croner delegation, relative-delay/definition/carrier expressions, standard errors and minute/hour formulas still contain inherited expressions. The algorithm and shared admission mechanism are the concrete changed implementation. The retained tiny adapter and standard errors were not cosmetically rewritten to inflate progress.

## Source review and license limits

The author inspected current and upstream source. No clean-room claim applies. Production keeps root Apache-2.0 and modification notices; LICENSE, NOTICE.md and THIRD-PARTY-NOTICES.md are unchanged. No MIT-ready or application-wide completion claim applies.

The actual upstream objects were fetched into a separate `/tmp` bare Git repository at `zai-org/ZCode@872ad960de7ec172591f7e1952f7849229f94521`. Three existing paths were already reported inherited. `automationValidation.ts` was unmatched/unreviewed in the inventory, but its addition commit `4fd3e373748a08e798beeacc42f91d87bc451378` moved it from `automationService.ts`; the upstream service contains the same validator and error classes. The evidence JSON records those exact four upstream blobs. None of these four paths is classified as newly original merely because of a new path or changed bytes.

The new executor is independently expressed internal infrastructure, but its production review/license proposal stays Apache-2.0 pending separate parent source audit. New fixture/harness expressions carry MIT notices; any original/MIT review for them covers only the test expression and does not license production. The shared provenance ledger/inventory remains untouched.

## Actual verification

| Check                                                             | Result                                                                    |
| ----------------------------------------------------------------- | ------------------------------------------------------------------------- |
| Freshness/ref identity                                            | Pass; base ahead of main 10, behind 0; prior tip exact                    |
| Architecture before implementation                                | Pass, zero baseline/new violations                                        |
| Initial contract against untouched old source/dist                | 93/93 each                                                                |
| Final expanded compatibility against old source/dist              | 107/107 each                                                              |
| Candidate accessor review before correction                       | 95 pass, 6 fail out of 101; corrected                                     |
| Old construction regression                                       | Expected failure: 73,201 constructions, budget 40                         |
| Final candidate source with performance + existing workflow tests | 111/111 = 107 compatibility + 1 cost + 3 existing tests                   |
| Final candidate emitted JS                                        | 108/108 = 107 compatibility + 1 cost                                      |
| Old -> candidate-source differential                              | 3,045 equal observations, 18 serialized round trips                       |
| Old -> candidate-dist differential                                | 3,045 equal observations, 18 serialized round trips                       |
| Timezone comparison                                               | UTC, America/New_York and Pacific/Apia on Linux                           |
| Existing public declaration ASTs                                  | All four unchanged after removing comments                                |
| Services/shared/RPC TypeScript build                              | Pass before implementation; final root build refreshes services dist      |
| Required final root `pnpm typecheck`                              | Pass, including 5,422 matching i18n keys                                  |
| Required root lint / pre-push / changed architecture              | Pass, zero lint warnings/errors and zero architecture violations          |
| Focused formatting and diff whitespace                            | Pass                                                                      |
| Read-only provenance freshness                                    | Fails: shared inventory stale; integrator reconciliation remains required |

The original 93-case expectation draft had two mistaken assumptions, corrected before production changes: an infinite minute interval yields Infinity and a fixed one-shot at the exact target rolls to the next calendar occurrence. Expanded accessor fixtures passed the old implementation and exposed six candidate regressions; exact access order and arithmetic were restored before final runs. Additional fixtures cover Date's year 0..99 normalization, year 100, a valid prefix near Date's maximum, huge finite intervals, nonfinite from values and lazy weekly evaluation.

Five checks call the unchanged real AutomationService with a synthetic repository port; they exercise accepted/rejected create, relative-delay end bounds, atomic recurring/cap updates and null/unchanged-definition semantics. The three existing workflow schedule tests exercise the actual SQLite repository and service using disposable synthetic databases. No user data was read or converted. The 18 round trips per differential run are JSON schedule serialization, not full historical database or app-upgrade proof.

Available Node was 24.19.0; mise pins 24.14.0. Pinned pnpm 10.33.2 was used through Corepack with task-local caches/store and a frozen-lockfile, ignore-scripts install. No dependency/config/lockfile edits were needed. The initial temporary emitted harness could not resolve package-local workspace links; adding absolute dependency links in `/tmp` and mapping its `#src/*` alias to `dist/*` fixed it. The emitted leaf tests then exercised emitted private helpers and the emitted real service. Shared dependencies still use their existing package exports.

Native Windows/macOS, Electron/GUI interaction, model/MCP calls, the full studio suite and full CLI build were not run. The integrator owns those combined gates. No tool-level Fast/service-tier switch was exposed or modified; this branch is the requested successor, with no concurrent duplicate started.

## Review and evidence proposals

All five final production digests, four original base digests, upstream blob bindings, test digests and actual comparison/cost results are in `automation-leaf-evidence-fast-1240.json`. The evidence file and report have no self-referential digest claim. Parent proposals:

- Preserve inherited relationships, source exposure and Apache-2.0 for all four existing paths; do not add independent-replacement/MIT production decisions from this batch. The validator's moved lineage needs explicit reconciliation, even though the current report lacks a same-path match.
- Separately review the newly authored executor and fixture/harness expressions using their exact final digests, specification and recorded results. The source helper retains Apache-2.0; test expression can be reviewed under its explicit MIT notices.
- Regenerate the shared derived report only after combining/reviewing batches. This worker's map/evidence does not change the authoritative ledger.

Supplementary local logs: `/tmp/knorvia-fast-contract-expanded-old-{source,dist}.tap`, `knorvia-fast-focused-final-source.tap`, `knorvia-fast-contract-final-dist.tap`, `knorvia-fast-contract-review-failure.tap`, `knorvia-fast-old-calendar-cost.tap`, `knorvia-fast-calendar-allocation.log`, `knorvia-fast-differential-{source,dist}.log`, `knorvia-fast-declarations.log`, `knorvia-fast-root-typecheck-final.log`, `knorvia-fast-pre-push-final.log` and `knorvia-fast-provenance-check.log` (all under `/tmp`). Durable assertions/digests are committed; local logs are supplementary.

## Remaining map and next slice

The base has exactly 336 tracked services source paths: 151 reported upstream-modified, 34 upstream-unchanged and 151 unreviewed. Unreviewed does not mean original or inherited; history/source review comes first. This branch adds one helper, so its source set has 337 paths. Four existing paths are selected here and three were selected by the previous service batch, leaving 329 outside those two selections. All seven ancestral paths retain unresolved licensing/whole-file replacement work; these selection counts are not completion counts.

The 329 unselected paths partition as 284 other services source paths, 10 deferred Creation, 3 credential, 10 device/filesystem for the other track, 8 task-database and 14 storage paths. The JSON lists each path, its reported classification, whether the inventory digest matches the base and its exact scope bucket. This is a services-source map; it does not count tests/assets or assume other tracks have completed their source review.

Recommended next bounded slice is five Claude-native ingestion leaves: `jsonLineRecord.ts`, `sessionHistoryJsonl.ts`, `importedClaudeTaskFileFilter.ts`, `claudeNativeSessionHeadParser.ts`, `buildImportedClaudeTaskFile.ts`. Freeze malformed JSONL/partial tails, first/last record behavior, imported provenance fields, filters and exact serialization before implementation. Keep importRepo, persistence, migration and shared protocol changes outside that slice. Prior three service paths must not be redone.

## Transfer/checkpoint

Fetch only this branch and review it against the exact base. Cherry-pick contract commit `d216b4667a4859261108e70742f48b617372ea33`, then the implementation/evidence commit supplied in the final response. The batch does not depend on replaying the previous leaf commits. Only the integrator combines branches into PR7. No duplicate PR, merge, force push, deployment or release was performed. Roll back by reverting the implementation commit and then its contract commit if appropriate.

Reproduce source checks from the repo root: `node --import tsx --test packages/services/test/automation-leaf-contract-fast-1240.test.ts packages/services/test/automation-calendar-cost-fast-1240.test.ts packages/services/test/studio-workflow-schedule.test.ts`, `pnpm typecheck`, `pnpm verify:pre-push`, and focused `oxfmt --check` on owned files. To compare old/new emitted targets, extract/build the recorded base in a disposable ESM package, link the installed workspace dependencies and map `#src/*` to `./dist/*`. Use `KNORVIA_AUTOMATION_CONTRACT_ROOT=<package>` and `KNORVIA_AUTOMATION_CONTRACT_TARGET=dist` for the two leaf tests; run the committed differential harness with `<oldPackage> dist <newPackage> dist`. Expected fixtures do not change between targets.
