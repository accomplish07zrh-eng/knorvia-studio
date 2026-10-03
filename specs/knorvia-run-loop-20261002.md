# Expert workflow continuation owner

Scope: complete expert/run-loop.ts; retry-state, runtime admission, individual
phase/critic/scheduled runners, graph/lifecycle/projection helpers stay unchanged.
Actual runtime start/background/resume/retry consumers own preparation and abort
registration. This owner sequences phase results and terminal report/publication,
then reloads durable state for cancellation or pause repair on failure.

One per-call accepted snapshot cursor; no new storage, policy, retry queue or cache.
Completion publication is transactional only in ordering, not atomic: report and
snapshot may be stored before a later event fails. Cursor acceptance follows native
async completion. Repair reloads stored state, with nullish fallback; abort repair
omits signal arguments. Fixed field/clock/effect order, result shapes, identities,
prose and native await gates are the contract, including live reads after awaits.

```text
runtime prepared snapshot -> phase result -> graph projections -> next phase
                         -> report -> completed snapshot -> graph -> event
exception -> storage reload -> cancellation repair OR paused failure publication
```

Fresh author receives only named contract/API files, saves/hash-binds draft before
curator comparison. Curator has source exposure. Preserve exact predecessor source,
JS and declaration; any original-versus-current comparison must route explicitly.
No algorithmic novelty requirement, cosmetic originality credit or licence grant.

Speed-first validation: ordinary suites/builds skipped. A minimal actual-emitted
paired safety pass is justified by completion event failure after persisted data,
nullish storage fallback and cancellation repair arguments. Reuse actual context
and synthetic effect ports; no real tasks/model/IO. Existing artifact/phase fixture
historical callers remain explicit old code; current selectors advance to this
exact candidate without weakening assertions. No cross-lane integration.
