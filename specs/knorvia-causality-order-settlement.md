# Ordered witness classification and settlement

Baseline `9b1f253ecd9caf9ee8c427e8df729cd73843d238`. Own only `claimAt` and `barrier` in `analysis/causality-order-settle.ts`, their discretionary implementation commentary and narrowly named fixtures/evidence. The current file matches recorded publisher blob `c6fa31b8dc5f148de80f1d3dc6caad21b342e7bf`. Source exposure is explicit. Preserve public signatures, OracleClaim/NO_CLAIM, admission/ancestry helpers, imports, binding/control helpers, strand/state/walk owners and all graph/reducer modules. Public JSDoc/declaration bytes remain unchanged in this runtime step; inherited prose is separately disclosed.

Supported inputs are compiler-produced AST nodes, occurrence records, Maps/Sets and TraceState. The real walk calls settlement after evaluating an await operand; loops use it for for-await elements; deferred calls use a receiver prologue. Guard scanning shares claim classification without temporal admission. Do not execute synthetic workflow scripts; only analyze them.

Witness rules:

- Read the position once; filter every occurrence by real-step membership before any admission call. Admission preserves issued-first lookup, missing-call rejection and cached shared lexical-iteration recognition. A future witness outside a shared iteration is rejected.
- Admit each surviving occurrence before grouping. Preserve first admitted site order and first admission eligibility; OR exactness across admitted duplicates. A singleton is certain only when exact and first admitted as issued. Repetition is always maybe. Rejected/non-step occurrences do not affect singleton judgment.
- Empty results use the same shared NO_CLAIM object within one module. Nonempty results use fresh arrays; do not mutate occurrences/oracle maps or leak generated claim state across calls. Errors escape unchanged.

Barrier rules:

- Call the existing joinStrands once with original certain/maybe/awaited arguments. Keep its state ownership, joined order and side effects. Read joined certain summaries before joined maybe summaries; each region uses the first matching strand record.
- Concatenate explicit claims before summaries. Check visibility against every frame, dedupe in encounter order, and commit certain steps to the current frame before checking maybe steps. Commit both sides before emitting events. This ordering gives certainty precedence and preserves partial state on exceptions.
- A nonempty resolved claim that is already settled does not widen. Widen only when both original-plus-summary lists are empty, using issued insertion order and current visible-frame filtering. Widened fresh steps are maybe.
- Emit certain then maybe, retaining exact object field order, chain reference, step order and first-event-only joins. A join with no fresh steps emits one empty certain settle event. With neither fresh steps nor joins emit nothing. Repeated joins/settles stay owned by existing state; no new cache, async work, retry or deadline/cancellation owner.

Design: an ordered admission-eligibility index and exact-witness set replace per-site mutable claim records. Barrier resolves two ordered claim batches, commits them in certainty order, selects empty-evidence widening if needed, and projects events through one terminal path. This is local derived data, not a second accepted state owner or a generic operation framework. Conventional filtering, Map/Set identity, lexical admission policy and fixed event fields are compatibility expression; no whole-file independent/MIT conclusion follows.

Before production, freeze representative admission/alias/cache cases, frame/strand/widening decisions, meaningful thrown-state operations and real analyzer/walk/loop/deferred-call consumers. Archive exact old JS/declaration bytes and pin consumer artifacts. Current selectors must hash actual current source/emitted/declaration artifacts and fail closed on wrong/missing input; old comparison imports stay separate. Run affected source/actual-emitted groups plus scoped compiler/lint/format/architecture once on the final coherent candidate. No broad suite/build, exotic getter matrix, live providers/user data or licence/header/registry changes.
