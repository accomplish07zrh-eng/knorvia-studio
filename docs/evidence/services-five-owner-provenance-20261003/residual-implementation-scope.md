# Services: minimum remaining original-project implementation scope

2026-10-03. Apache-2.0 remains the project licence. The user's latest clarification
continues removal of the original project's inherited implementation so Knorvia
can maintain its own upstream. Only the MIT-specific rights/material closure is
stopped. This report proposes exact implementation units for integration
coordination; it does not modify production code or reopen licence acceptance.

## Executable conclusion

**Some original-project business implementation remains.** Most clearly, the
conditional draft-close routine and four task-index execution routines preserve
upstream function-body structure after explicit local-name/port adaptations and
single-statement brace differences. Task-index's main file delegates those four
routines to new private files; a new filename, shorter entrypoint or dependency
injection does not remove that execution-template inheritance.

Replace those units and the bounded helper/control remnants below. A complete
rewrite of the five owners is not justified by the evidence. Keep the new file
trie, failure ownership, per-topic ownership/recovery architecture, public
interfaces, data schemas, UI and ordinary third-party dependencies.

This is an engineering source-continuity conclusion. It does not equate inherited
code with infringement, or source exposure/missing receipts with residual code.
Shared behavior, interfaces, field names, enum values, SQL settings or logger
strings alone are not the criterion. Positive whole-body/control-template
correspondence is the criterion used for the minimum units selected here.

Reviewed branch: `6a96f808ea3698401b87f3ac386d7e72eb08681f`.
Fetched main source checkpoint: `59517d9699519b0a7a44980da27df29d45f0e91e`.
All five requested source blobs remain identical between them. The current and
upstream complete-file bindings are in [source-facts.json](source-facts.json).
All upstream line references below use pinned ZCode commit
`872ad960de7ec172591f7e1952f7849229f94521`.

## Five-file disposition

| Requested owner | Confirmed remainder and precise current lines | Minimum proposed implementation unit |
| --- | --- | --- |
| `session/tasksDatabase/startup.ts` | The wait-deadline/timeout/first-notification/100-ms wait fragment at **83–92** corresponds to upstream **58–66** after explicit deadline/local/callback binding changes. The entire new storage owner is not an unchanged upstream body. | Reauthor `StorageLockWindow.acquire`, **75–95**, separating one lock attempt from the wait/progress driver. Keep the safe BUSY probe, shared one-hour deadline, each-acquisition notification rule, error identity and migration/snapshot ordering. Do not replace the new `StartupFailure` or the whole startup owner merely because SQLite settings/phase names match. |
| `git/commitMessageFileScope.ts` | `scopeSpelling`, **17–21**, retains upstream `normalizeCommitMessageScopePath`, **5–9**, including its complete body. This is a small helper, not the whole filtering core. | Replace this normalization helper from its spelling contract. Keep `sessionAliases` and the terminal-node trie. Do not replace the trie or deny-path policy merely because accepted aliases/fields match the behavior contract. |
| `creation/creationReference.ts` | **No concrete original-project implementation remainder demonstrated by the examined sources.** Available local feature history starts at `7619e41`; no exact/case-insensitive filename match exists in the saved upstream inventory. Pre-snapshot origin is still undetermined. | **No rewrite assigned by this finding.** Preserve current descriptor/route/inode/hash admission and user-data compatibility. Missing historical evidence and source exposure are insufficient to manufacture a replacement scope. |
| `agent-session/sessionService.ts` | `closeDeferredDraftSession`, **271–293**, corresponds to upstream **434–459** after the draft-registry local binding and diagnostic brand change. Its request/conditional-forget/catch-result execution body remains. Its direct preparation helper also retains the diagnostics body: `sessionPreparation.ts` **65–79** versus upstream **74–90**. | Reauthor the conditional-close effect/result policy and the small diagnostics helper. Keep the existing retry/repair and index ports, all fifteen service operations, deferred membership semantics and temporary MCP preparation. Matching create/resume call order or forwarding signatures alone does not establish that those whole operations need reauthoring. |
| `agent/taskIndexSyncer.ts` | **Substantive remainder is in its actual private execution path:** three routines in `task-index-ingestion/sessionIndexProjection.ts` and one in `snapshotProjection.ts`, detailed below. The upstream monolithic coordinator has been replaced by a per-topic architecture, but these business execution bodies were port-adapted. | Reauthor the projection effects below and their small unread policy helper. Keep `createTopicIngest`, `createTopicRecovery`, workspace reservation/lifecycle ownership and the public syncer facade. Event/subscription object fields, enum values and shared protocol imports alone do not justify replacing the new topic state machine. |

Current paths in the table are relative to `packages/services/src/`.

## Task-index execution: exact minimum units

The upstream source file is
`packages/services/src/zcode-agent/zcodeTaskIndexSyncer.ts`. The two current
private files were added by candidate source commit
`5b0b53522d235397cf435a627393c0bf5818d28c`; this newly-added-file fact does not
establish that every function body was newly authored.

| Current private implementation | Upstream routine/lines | Specific inherited execution template |
| --- | --- | --- |
| `sessionIndexProjection.ts` `readback`, **84–103** | `resyncTaskIndexRowFromAgent`, **501–531** | Existing-only read → snapshot sync with optional unread/grouped-top fields → failure warning. Whole-body correspondence after changing Agent/sync/logger access to ports. |
| `sessionIndexProjection.ts` `complete`, **105–150** | `applyTerminalTransition`, **567–624** | Terminal callback → unread decision → timestamped row patch → optional status event → detached readback with exactly-once unread handoff → patch-failure warning. Whole-body correspondence after port/local binding changes and replacing the optional grouped-top member with a scalar argument. |
| `sessionIndexProjection.ts` `titleChanged`, **152–172** | `applyTitleChange`, **627–659** | Title patch → event for an existing row, otherwise grouped-top readback → failure warning. Whole-body correspondence after port/local binding changes. |
| `snapshotProjection.ts` `model`, **179–197** | `syncTaskModel`, **1724–1743** | Trim/empty early return → model-only state update → warn and null on update failure. Whole-body correspondence after repo/local binding changes. |
| `sessionIndexProjection.ts` `unread`, **43–51** | `resolveTerminalUnreadSignal`, **184–197** | The complete phase/goal predicate body remains after single-statement brace differences. This is a small policy helper; its compatible outcomes must remain, while its current expression can be reauthored with the effect policy. |

The source-correspondence reading is captured in
[body-correspondence.json](body-correspondence.json). It records each current file
SHA-256, upstream SHA-256/URL, exact function lines, explicit adaptations and
canonical body hashes. The [source-only reader](read-residual-bodies.cjs) uses
TypeScript solely to read syntax trees. Its normalization preserves protocol/data
member names and ignores only comments/whitespace, trailing-comma flags and
single-statement if/else block wrappers. It does not execute product code or
perform typechecking. To reproduce, supply the directory with the four pinned
upstream `.ts` inputs using the input names in the reader; the protected prior
archive already contains these bytes. A structure nonmatch is not novelty proof:
for example the visible-content predicate differs in control expression, so it
is not added to this minimum scope merely for matching behavior.

## Coordinated implementation batches

1. **Local helpers and lock driver:** the normalization helper and
   `StorageLockWindow.acquire`. Keep their existing spec contracts, all path
   spellings, deadline/delay/error/progress behavior, SQLite settings and upgrade
   snapshot order. Do not satisfy the rewrite by changing only names, braces or
   relocating the old body; choose new admission/scheduling and spelling
   implementations from those contracts.
2. **Session close and diagnostics:** the conditional close operation and
   `sessionSnapshotDiagnostics`. Use an independently authored effect/result
   policy; preserve conditional persistence, forget only on true, rejection
   warning/false boundary, no unconditional fallback, partial-snapshot guards and
   diagnostic fields. Retain the existing draft registry and Agent authority.
3. **Projection effects:** the four business routines plus `unread` above. Use an
   independently authored projection decision/effect driver; preserve existing
   repository/Agent ports, effect order, detached readback, own-key shape,
   completed versus error `lastError` behavior and one unread signal. Keep the
   already introduced topic subscription/cursor/recovery owners intact.

These are minimum confirmed units, not a blanket finding of originality for
unselected code or a final repository-wide independence certificate. The newly
authored replacement must be reviewed as a complete implementation, rather than
counting changed lines or comparing only its entrypoint. Existing behavior specs
provide the interface/data contract; any new private design must be recorded
before implementation under repository instructions.

## Coordination and validation

All proposed source edits are within this services lane. There is currently **no
public interface, schema or shared-contract change request**. The integrator can
allocate these three batches to the same continuing lane, avoiding parallel
rewrites of the same owners. Ordinary dependencies and applicable notices stay;
global source registers, root declarations and other lanes remain integrator
owned. No licence/NOTICE/HOLD/accepted-history record is changed by this report.

**UNVERIFIED:** this batch performs source/history/structure/diff reading only.
No implementation edit, tests, lint, typecheck, build, full audit or CI rerun.
Future implementation acceptance remains for coordinated validation. There is no
new MIT contribution-rights question or material closure request.
