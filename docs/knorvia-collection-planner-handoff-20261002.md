# Collection planner checkpoint

Implementation: 2dcdb5e, after a22cf34 predecessor freeze and cd8888d mutation
contract/red proof. Only the planner owner, its new synchronous admission helper
and named fixtures/spec/evidence changed. Root independently reviews/integrates.

The sweep now accepts explicit admission decisions. One private async attempt keeps
an original collection reference, immutable run count/start/input/trace facts, the
runner-visible active collection and one child-link snapshot cursor. Synchronous
activation/link/terminal projections have no awaited orchestration promises. The
attempt retains the original activation gates outside recovery, caught-error abort
rethrow and native publication gates. Terminal snapshots do not replace the cursor.
The helper split keeps both source files within the configured line limit; splitting
is not claimed as the implementation contribution.

The first draft incorrectly derived artifact count/label from runner-visible mutable
collection fields. A focused predecessor-first probe preserved the draft failure in
both modes (99 instead of immutable attempt 1), then the candidate retained original
identity/count separately. No existing behavior assertion or historical oracle was
weakened. The frozen partial-node fixture required an explicit type assertion through
unknown; raw runtime input/assertions remain unchanged and emitted test syntax is
identical. Both initial type diagnostics and the stalled initial fixture run are recorded.

Final results: **8/8 source and 8/8 actual compiler-emitted**, six paired behavior
groups, one real scheduler expansion consumer, one selector group. The consumer
reuses the earlier scheduler observation, so it is overlapping evidence. Current
selection has 42 exact source/emitted/declaration/dependency bindings and 14 wrong/
missing controls per mode. Historical compiled/declaration bytes remain immutable;
public planner declaration bytes are exactly unchanged. Scoped compiler: four owned
roots, zero diagnostics. Owned configured lint: four files/94 rules, zero warnings/
errors; additional default owned lint passed. Root configured lint excludes CLI files;
the scoped gate applies its exact rules/overrides with only that exclusion removed
in a temporary check configuration. Formatting and changed architecture passed.

Source exposure includes the local predecessor/callers and source-derived contract.
Fixed runtime prose, ordered protocol fields, conditional/nullish identity projection,
ordinary helper calls and required effect-order expressions remain compatible with
the predecessor. Lower graph/prompt/expansion/event bodies are untouched. These
retained expressions need independent publisher/contribution review; state reorganization,
passing tests and hashes do not grant whole-file originality or MIT eligibility.
The pinned publisher blob is absent locally; only inventory facts were used, with
no invented publisher verification. Parent 48f045d is unavailable here and was not run.

Limits: Node24.19.0 rather than pinned24.14.0; no aggregate build/suite or native platform
acceptance. This checkout's real scheduler consumer was exercised; root's newer integrated
scheduler still needs its affected pass. Earlier scheduler/node/event selector receipts
remain predecessor-bound and untouched; root owns integrated current-artifact migration.
No live IO/providers/user data, runtime/security/settings/licensing changes or publication.

[Exact hashes, results, failure records and limits](evidence/knorvia-collection-planner-owner-20261002.json).
