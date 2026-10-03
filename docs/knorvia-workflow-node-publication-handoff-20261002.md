# Workflow node publication checkpoint

Freeze `c3d4f9a`; runtime candidate `127b9bf`. Owned production paths are
`core/src/workflow/scheduler/node-runner.ts` and its new `node-runner-outcome.ts`.
The existing `WorkflowGraphScheduler` caller, event/graph/prompt helpers, types,
registry and all earlier lane checkpoints remain unchanged.

The terminal publisher now has one inline persist → set → status → event chain.
It consumes a completion or failure record. Only a success-publication exception
can select a failure record; a failure-publication exception escapes. This preserves
the predecessor's asymmetric catch boundary without an extra awaited orchestrator,
rollback or retry policy. Projection functions are synchronous and retain the current
snapshot owner and ordered clock calls. Public declaration bytes remain exact.

Source exposure is explicit. Activation, child linkage, runner request construction,
artifact invocation and public strings remain inherited expression. The private
projector retains compatibility field layouts, truthy optional metadata clauses,
nullish trace fallback, attempts arithmetic and graph/activity/artifact transform
order. Those are precise retained boundaries, not originality credit for extraction.
The substantive new unit is the single terminal publication/selection owner; neither
production file receives a whole-file independent or MIT determination from this
checkpoint. Publisher association comes from the existing inventory; no new exact
publisher-byte verification or source-rights decision was performed. Existing
attribution and contributor/notice obligations remain.

Seven focused groups passed in source and actual-emitted modes against the immutable
compiled predecessor. The actual scheduler group includes completion, error threshold
and terminal queued-abort observations; it is included in the seven, not additive.
Direct node completion still succeeds when its accepted final event queues abort;
the scheduler rejects with the exact reason on its next loop. Startup rejection still
leaves started pending. No timeout or post-completion cancellation check was added.

Initial freeze runs had six passes/one failure per mode because a synthetic caller
node omitted dependsOn. The fixture now supplies dependsOn and typed kind; no assertion
was relaxed. Raw failure logs remain intact with digest references in the freeze
record. Corrected freeze and final candidate each pass seven groups per mode.
Owned snapshots use a partial strategy cast covering the caller's exercised fields;
these observations do not establish full snapshot-schema admission or live workflow
acceptance. All runner/storage/clock/event data and effects are owned synthetic ports.

Scoped compilation checked five roots with zero diagnostics, emitting only the two
owned modules. Owned lint checked five files with zero errors and two intentional
no-thenable warnings from queued/throwing fixture ports. Formatting and changed-scope
architecture passed. No broad build/suite, native/platform acceptance or author-process
retry occurred. Twenty-two strict artifact pins include the new private source/JS/
declaration; wrong/missing artifacts fail before current import. Historical compiled
oracle, declaration and behavioral assertions remain unchanged.

The remaining source-acceptance gap is the retained activation/child/request owner
and compatibility projection expression, subject to root's separate review. This
checkpoint claims neither complete file clearance nor publication. Exact hashes,
individual results and reproduction commands are in the
[receipt](evidence/knorvia-workflow-node-publication-20261002.json).
