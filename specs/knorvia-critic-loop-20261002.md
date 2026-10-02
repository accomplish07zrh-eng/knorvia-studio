# Final critic cycle owner

Own the complete expert/critic-loop.ts cycle: phase verdict admission, proposal
reopening, ordered publication, execution/critic reset and bounded retry settlement.
The runtime's manual retry-state remains separate; no change is necessary there.
Context, parsers, lifecycle, phase and scheduled execution remain existing owners.

```text
critic phase -> verdict -> accepted reopen -> snapshot / graph / event
                      -> rejected reopen event -> next proposal
accepted nodes -> execution reset -> critic reset -> write / statuses -> execution
live iteration bound ends -> failed critic projection / write / status / event
```

One per-call snapshot cursor accepts helper output before publication. Admission
rejection recovery is limited to the async reopen suboperation. Publication errors
escape unchanged. Preserve both existing native async helper settlement gates, live
iteration limits/payload reads, shared proposals and immutable reset identities,
phase metadata dropping, fixed prose, maxReopens=2 and final scheduling semantics.
No policy, cancellation guard, retry queue or product behavior change.

Freeze exact historical source/compiled/declaration and functional/API packet before
implementation. Fresh no-context author saves/hash-binds draft before curator reads.
Curator is source-exposed; retain protocol/helper/expression overlap honestly. No
whole-file independence, header/global inventory or licence grant.

Speed-first: skip ordinary test suites/builds. Only a concrete publication or data
risk justifies one small synthetic compiler-emitted pass. Scoped compilation is
allowed when required to obtain that exact emitted artifact. Keep all prior owner,
root asset cache, other-lane and shared licensing files outside production scope.
Continue same branch and draft PR11, with no cross-lane integration.
