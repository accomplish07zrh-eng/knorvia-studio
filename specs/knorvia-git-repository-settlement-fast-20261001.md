# Repository resolution settlement timing clarification

Root requested an independent-review timing comparison before publication.
`d639823` is the original frozen implementation; `a828836` and receipt `996aa34`
remain immutable historical checkpoints. Unchanged map bodies and passing output
contracts alone do not prove equivalent settlement/cleanup timing.

The existing entrypoint's in-flight factory must own the original awaited effect
boundaries: discovery then run for resolution, this.resolveRepository then stat
and optional readFile for info, each only when admitted. No additional awaited
or assimilated async orchestration result is allowed. The synchronous operation
program may decide/project but its interpreter must run inside that original
async factory. Map/reuse/invalidate policy and public entrypoint await remain exact.

Freeze baseline timing with copied, digest-bound test-only old expressions/methods,
owner declarations/reuse/invalidate; never copy them into production or claim that
test oracle as new implementation. Compile the frozen oracle in memory and supply
only owned fake discovery/command/stat/read ports. The current comparator uses the
actual source or strict emitted repo. Record command/read counts, same-key reuse
versus a new request and visible first/queued resolution/rejection order.

Cover queued callers at deterministic microtask positions around discovery/run/stat/
read completion, reentrant same-key callers from effects and projection methods,
rejection cleanup, invalidation during settlement, different keys and late old
completion. Queued microtasks are test input, not sleeps, timeout/retry budgets or
an altered in-flight owner. Preserve pre-existing synchronous reentrancy semantics,
including calls before the original factory has installed its promise.

Write failing timing comparisons before correction. If an extra await causes a
proved difference, retain red evidence and restore original await ownership with
the smallest coherent synchronous-program interpreter change. No shared cache,
new cancellation/retry policy, effect count, filesystem/security/provider or error
prose change. Run new source/strict emitted comparisons, old focused consumers and
complete final gates on corrected code; append current evidence rather than silently
rebinding the historical `a828836` receipt. Parent CI225 Linux/Windows7109/zero failures
and material26 are parent reports, not this lane's acceptance or licence edit.
