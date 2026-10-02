# Version 2 functional clarification: phase observations and accepted result size

This supplements the original three frozen behavior/API input files. All other requirements remain unchanged. The public API does not gain a field, dependency, size limit or new error policy.

## Phase is observed from the shared run options

The original run-options object remains mutable. Phase is read from that object at each required phase-bearing observation: child-trace attributes, active/completed/failed activities, runner input, planner prompt, artifact metadata, expansion records and events. It is not an immutable fact captured for the whole attempt.

If an earlier synchronous callback or awaited publication port changes that object's phase, later observations use its current value. For example, when the first snapshot publication changes phase from one valid string to another before resolving, the subsequent started event, runner input and prompt observe the new value. Later changes likewise affect later observations. Earlier emitted or constructed values are not retroactively rewritten. The same options reference continues to be passed to the existing dependency owners.

Keep the separately specified immutable facts intact: start time, the captured next numeric planner-run count, child trace, and the failure count/exhaustion decision captured before failure publication. Clarifying phase lifetime does not authorize changing those facts, gate ordering, property ordering, cancellation or recovery.

## Accepted additions have no function-argument budget

For each attempt that returns accepted node IDs, the sweep includes every returned ID in order, preserving duplicates, before continuing with the next initial collection. The number of accepted IDs must not introduce an additional limit tied to the JavaScript engine's function-call argument capacity. An already successful attempt must not become a sweep rejection solely because its accepted list exceeds that capacity. This requirement neither adds a product node limit nor changes graph validation, admission, publication or counting behavior.

## Versioned author output and boundary

Use only the original three allowed input files, this clarification, and your own previously created outputs. Do not read repository/history/source/tests/reviews, other scratch directories or network resources. No implementation or patch is supplied by this clarification. Choose the internal expression yourself.

Leave all v1 files unchanged. Save the complete revised owner as `output/collection-planner-v2.ts` (and a versioned private module only if required by your design). Immediately freeze it before comparison, compilation or testing. Save `output/author-record-v2.json` with byte counts and SHA-256 of the original inputs, this clarification, the reused v1 draft/receipt and every new draft; actual reads; UTC freeze time; any boundary breach or unresolved question. Do not include the metadata record's own digest inside itself. Report its separate digest after writing, then stop. This continues the same author task rather than creating a new author or accepting source-exposed edits.
