# Studio offline runner: bounded native test selection

CI224 Windows reached all build/type/lint/provenance gates, then failed before any
case ran: spawning Node with 552 individual paths required 32,807 argument
characters before the executable, exceeding the Windows process command-line
limit. This is an invocation defect, not failed product assertions.

Keep the existing test-directory discovery, explicit test list, nonempty checks,
Node executable, module-mock and tsx flags, concurrency two, per-test timeout,
credential filtering, temporary data isolation, exit/signal propagation and cleanup.
No test is removed, skipped, batched or assigned a larger budget. No CI workflow,
package or dependency change. Replace only the expanded path argument list with
native Node 24.14 glob arguments whose expansion is checked against the complete
explicit/discovered set immediately before launching.

Top-level patterns must include ordinary names, dot-prefixed names and `.test.ts`
or `.test.mjs`, and exclude nested poison files. Literal directory names are the
existing fixed repository list. Explicit paths remain explicit. Compare normalized
host path separators, reject any missing/unexpected/duplicate-discovered path,
and reject empty discovery before invoking Node. An unmatched glob alone can exit
successfully in Node, so it cannot be trusted as a coverage check.

Acceptance: reproduce the old length threshold without spawning a failing real
process; prove exact current selection equality and a bounded argv. Owned temporary
fixtures cover hidden, empty-stem, spaces and metacharacter filenames, nested
exclusion, missing/extra selections, real native CLI pass/failure exit codes,
module mocks, TypeScript loading and unchanged concurrency/timeout arguments.
Run the full suite and exact-head Linux/Windows CI. Native Windows success remains
unverified until the repaired CI runs; retain CI224 as failed, with no case count.
