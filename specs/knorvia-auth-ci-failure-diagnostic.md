# Auth CI first-failure diagnostic

CI218 tested `20d70402ab7773f78e06c63f07deb2c34f359610`. Linux passed;
Windows failed only the source auth contract group, first case A-STO-10. The
emitted group passed. The child failure details stayed in ephemeral runner files,
so the original Windows cause is unknown. No timing, lock or production repair
is inferred from the single group-level assertion.

Add a diagnostic only at the auth group reporting boundary, after all 30 cases
and summary persistence, immediately before the unchanged failure assertion.
Retain the first failed child's already-bounded stdout/stderr in memory until
that point; do not read credential files, environment variables or other paths.
On success, emit nothing. The diagnostic must never alter acceptance, failure
identity, deadlines, polling/retry delays, concurrency, isolation, owned-env
allowlists, cleanup, seams, production authentication or CI configuration.

Output uses an explicit whitelist: source/dist, bounded case ID, safe process
status and parsed TAP counters, known error codes and controlled text markers,
known assertion operator/failure-type names, and approved test-file basename
plus numeric frame coordinates. Never emit raw stdout/stderr, arbitrary error
messages, paths, environment values, credential JSON, token values or API graphs.
Text observations are labelled observations, not a definitive root cause.
Output and scan sizes are bounded. Diagnostic writer failure cannot replace the
existing test assertion. Add positive, malformed, large-input and secret/path
non-disclosure tests. Preserve the original failed CI receipt.

A separate read-only review reproduced an owned seam lock timeout with a
synthetic pre-held lock and found its finite retry schedule sums to 1277 ms.
This is only a candidate explanation; this checkpoint does not change it or
claim it caused the original Windows failure. A later green run would establish
non-reproduction, not retroactively explain or repair that historical failure.
