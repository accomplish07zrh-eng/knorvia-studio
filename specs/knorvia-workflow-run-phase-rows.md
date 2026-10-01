# Workflow phase row decisions

Baseline `6e9edda4fb4436f6c843a0b002546009d7cc2082`. Own only `formatWorkflowRunPhasesBlock` and its three private clause helpers in `get-workflow-run-format-roster.ts`, plus narrowly named phase fixtures/tests/spec/receipt. The historical ledger marks this file upstream-modified/null review; history shows the activity-only replacement, with the phase block still inherited. Actual caller is `get-workflow-run-format.ts` through the GetWorkflowRun registry/full call-runner.

Replace the split clause-return helpers with one direct per-row decision path. It assembles the five row cells in their existing order and uses unchanged shared width/padding/join helpers. The journal and handler remain the state/clock owners; this is synchronous formatting of their supplied snapshot. No generic instruction interpreter, new state/cache/effect/await/deadline or permission owner. Activity, health/log, shared layout, accepted snapshots/summary/output and public declarations/prose stay unchanged.

Preserve the phases missing/empty gate; name map then name width, state map then state width, row map receiver/argument order; 24-character width cap, row numbering, whitespace/escaping and newline assembly. In each row: name/state alignment, rounds guard and plural/coercion rereads, running-versus-settled count guards/rereads, then generatedAt read before enteredAt even when no duration is written. Exited timestamps use exitedAt minus enteredAt; live unexited phases use now minus enteredAt plus fixed prose; terminal unexited phases omit duration. Preserve zero, absent, malformed, changing/throwing getter and native coercion/error behavior. Required strings and compatibility expressions remain source-exposed and attributed.

```text
unchanged journal await/output/schema → unchanged model block order
→ name/state measurements → sequential phase-row decisions → unchanged result/terminal settlement
```

Before implementation, freeze focused current source/actual emitted observations and supported consumers. Reuse the existing exact emitted archive only after verifying its phase/shared-layout regions equal the current baseline; record current whole-source/emitted hashes without copying another full module. Add cases for the phase decisions, callback/getter order, malformed/coercion and clock-before-duration boundaries. Exercise actual registry/full call-runner with valid owned ports and completion-edge external abort controls; reuse unchanged activity/concurrent/stale and display consumers. Fetch/DNS fail closed, data/ports synthetic only.

Run focused source/strict-emitted, immediate consumers, owned type/lint/format/architecture and scoped actual typed emission; no broad/root-wide gates, full suite/builds or native-limit probes. Keep old assertions/receipts/failure evidence immutable. New direct organization is a review candidate with explicitly retained material, not an originality/MIT/publication decision; root owns independent expression/licence and aggregate/native acceptance.
