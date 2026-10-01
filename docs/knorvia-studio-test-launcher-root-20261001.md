# Windows offline test invocation repair

CI224 Windows failed at process creation, before any regression case ran:
`spawn ENAMETOOLONG`. The old 552 file arguments required 32,807 characters before
the executable; Windows CreateProcessW permits 32,767 including the null terminator.
Linux passed 7,101 cases with 7,093 passes/eight skips. The exact failure and checked
merge are retained in `licensing/evidence/direct-root-ci224.json`.

Root keeps the original explicit list and directory discovery as the scope owner.
Native Node CLI patterns replace the expanded file list only after async filesystem
glob expansion exactly matches every discovered path. The pattern includes ordinary,
hidden and empty-stem test names; an unmatched glob or case-insensitive extra cannot
silently pass. Missing/extra/duplicate/empty selections fail before temporary data
is created. No shell is used. Current scope is 552 original files plus the new
regression file: 553 files represented by 31 trailing arguments/1,696 characters.

Node flags, module mocks, tsx, concurrency two, timeout 120000/default override
rules, environment filtering, isolated data directory, spawn cwd/stdio, exit/signal
propagation and cleanup are unchanged. No CI workflow, dependency, test budget,
assertion or skip is relaxed. File mutation during collection is unsupported;
preflight and the child scan are not an atomic filesystem snapshot.

Eight focused tests pass on Node 24.14.0. Owned native subprocess fixtures cover
seven actual files, TypeScript and real module mocking, hidden/empty-stem/space/
bracket/brace names, nested exclusion, failure exit status and set drift. A
420-long-filename fixture proves the old length threshold and bounded replacement.
An initial fixture accidentally inherited NODE_TEST_CONTEXT and did not launch an
independent nested CLI; the fixture-only child environment now removes that marker
and credential-like variables, and the corrected tests verify actual counts.
Windows/macOS nocase widening is guarded; native Windows execution awaits new CI.

Independent read-only review found no blocking issue. Separate synthetic probes
also verified five isolated child PIDs, concurrency exactly two, inherited mock/
loader/timeout flags and unchanged failure/skip/timeout exit behavior.

Full root regression: 7,109 cases, 7,043 pass, 59 exact unchanged socket-listen EPERM
failures, seven skips, zero cancellations. This is not a full local pass. Root types,
configured/owned lint, formatting, full architecture and 17 CLI build tasks pass.
Product implementation and desktop artifact sources are unchanged by this repair;
this documentation/test-runner change does not claim fresh native desktop acceptance.

Sources: [Node 24.14 native test patterns](https://nodejs.org/download/release/v24.14.0/docs/api/test.html#running-tests-from-the-command-line),
[Node glob](https://nodejs.org/download/release/v24.14.0/docs/api/fs.html#fsglobsyncpattern-options),
[Windows CreateProcessW](https://learn.microsoft.com/en-us/windows/win32/api/processthreadsapi/nf-processthreadsapi-createprocessw).
