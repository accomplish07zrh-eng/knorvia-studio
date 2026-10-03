# GetWorkflowRun ordered snapshot fields

Baseline: `e0da79ea15cf72dc2b7783aef83f97ef9290c48e`. Owned production paths: `get-workflow-run.ts` and one private `get-workflow-run-snapshot-fields.ts`. Existing ledger marks the handler upstream-modified with null review; local history is snapshot plus formatting. Lower roster, summary, artifact and formatter helpers are excluded.

The journal port owns the snapshot and state. The existing handler owns admission, its single adapter await, result serialization, one clock read and assembly/summary. A synchronous projection helper owns only the ordered header/usage/actor/log field decision sequence. It has no state, await, IO, cancellation, retry or permission policy.

```text
existing executor/deadline → existing parse/port/getRunDetail await
→ existing serialize/clock/roster/phases
→ ordered synchronous header/usage/actor/log projection
→ existing roster/health/result/error/questions/artifacts/summary
→ existing executor metadata/events/telemetry
```

Preserve schema-before-port validation, captured receiver and method getter order, undefined not-found failure, result serialization before Date.now, exactly one clock read, and lower helper order. Optional header and row fields retain undefined checks and second getter reads when present; false interruption is omitted. scriptPath reads twice and reads workingDirectory only when present. Usage re-reads detail.usage for every counter; actors and logs retain map receiver/callback/sparse order. Required field keys, own undefined values and property insertion order remain unchanged. No sorting, validation repair, new limit, normalization or fallback. All public metadata, schemas, declarations, permissions, 10000ms deadline, cancellation declaration, prose and output/model content remain unchanged.

Freeze exact source and byte-identical project emission before replacement. Concise synthetic cases cover direct and actual registry/full executor/deadline consumers, schema/admission/missing/malformed/throw/reject/thenable responses, getter order and failure, repeat/concurrent/stale completion and queued abort around serialization/header/log and final artifact projection. All ports, clocks and text are owned synthetic; no real workflows/files/providers/network/accounts/credentials/settings. Native acceptance and aggregate full-suite/build gates belong to root.

Run focused source/strict emitted, immediate affected display/registry/deadline consumers, relevant core types/emission/lint, root configured lint, owned lint, format and architecture. No full suite or full CLI/desktop build for this slice. Source exposure and retained expressions/prose/archive are explicit; preserve attribution. No whole-file originality, clean-room or final MIT claim. Existing root runtime command admission/queue and accepted handlers remain byte-identical.
