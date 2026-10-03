# Task registry: frozen-observation supplement

This supplement is separate from the four immutable author inputs at `f170242`.
It adds bounded observations of the unchanged source-exposed predecessor, not a
candidate, storage design, absolute clean-room claim or rights determination.
The curator read the predecessor. No native-author retry occurred. Root controls
whether this behavior-only clarification is admitted to its authoring step.

## Three clarified boundaries

1. First terminal observer cleanup aborts the later observer after publication has
   detached their cohort. The later observer still receives listener cleanup during
   that publication. Its earlier rejection retains the exact abort reason; cleanup
   and the later resolution attempt do not replace that settlement. Observed order:
   `first:add → later:add → first:remove → first:abort-later → later:remove → publication:return → later:rejected → first:fulfilled`.
   The first promise receives the exact committed terminal snapshot. A resolution attempt itself is not
   externally instrumented; continued cleanup and preserved rejection are asserted.
2. Nonempty drain reads `pendingMessages` **four times**. With an enumerable getter
   before and after that property, the exact trace is
   `messages:1 → messages:2 → messages:3 → copy:before → messages:4 → copy:after`.
   Each read returns a distinct nonempty array. Drain returns the third array by
   identity; the fourth is evaluated during copy and the stored field becomes a
   fresh empty array. No trace normalization or getter-count inference is used.
3. The owned signal installs a native listener and aborts synchronously inside
   `addEventListener`. The returned native promise rejects with the exact reason.
   A later terminal publication or removal still cleans that listener once;
   repeating removal produces no additional cleanup. For each operation the trace is
   `inline:add → inline:abort → wait:return → inline:rejected → inline:remove → operation:return`.
   This preserves admission after installation returns; it adds
   no post-install abort check or new cancellation policy.

## Grouped freeze and scope

Eight groups cover snapshots/messages (including the getter probe), immediate waits,
pending setup (including inline abort), terminal/background publication (including
the detached-cohort probe), reentrancy, throwing cleanup, the existing synthetic
TaskOutput observation, and strict artifact rejection. Native promise continuation
order, signal receiver/listener/options identity, committed objects, errors and
partial effects are asserted directly. Throwing cleanup leaves the committed state;
later removal releases the separate background observer without recovering detached
terminal observers, which remain pending until their owned signals abort.

The TaskOutput check reuses the existing nonblocking in-memory fixture scenario and
also asserts its full output and notification timing. Both consumer and registry
select source together or actual emitted modules together. This is one consumer
group within each eight-group run, not an additional case count or a full call-runner
test. No outputFile is supplied; no task, model, provider, sink or filesystem-output
port is invoked. Artifact reads are confined to named repository fixtures/builds.

The fixture pins source, JS, declaration and the local TaskOutput import closure.
Wrong or missing bytes for every selected file reject before import. It never
imports old code in place of the selected current implementation. The observation
assertions and predecessor pins form the historical freeze; there is no new dump of
the predecessor body. Exact results and final digests are in the companion receipt.
This is a representative lifecycle freeze, not exhaustive accessors, live-runtime,
platform/native acceptance or independent license verification. Production,
historical oracles, prior receipts and all four author inputs remain unchanged.
