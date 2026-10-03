# Planner failure publication correction

Root reproduced a regression in 02e1751: the real EventLog passes the failed
collection by reference to appendGraphRecord. A synchronous port mutation can
change its errorCount/exhausted fields before planner_failed and the terminal
collection_exhausted gate. The predecessor used captured terminal facts.

Freeze one owned empty-collection case in source and strict actual-emitted modes:
maxConsecutiveErrors=1, runner throws `Owned planner failure`, collection append
changes errorCount to99 and exhausted tofalse. Preserve the mutable passed object,
receiver, signal, append count, completed failure snapshot and all await gates.
The planner_failed payload must still contain errorCount1/exhaustedtrue, followed
by collection_exhausted. Compare complete observations with the immutable predecessor.

Return the calculated errorCount/exhausted separately from the port-visible
collection and capture those primitive values before publication. Keep original
errors, partial effects and publication order; add no freeze, retry or cancellation
policy. Retain all prior tests, archives, receipts and red evidence.

Run the new red proof before production edits, then only affected failure groups,
the actual scheduler consumer and strict selector in both modes, plus owned types,
lint, formatting and architecture. This is a source-exposed post-review correction;
independent runtime acceptance and licence decisions remain with root.
