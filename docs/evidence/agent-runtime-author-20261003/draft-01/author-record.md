# Initial author seal

Author closure time (UTC): 2026-10-03T02:20:51.863294+00:00
Candidate SHA256: 113830b866f526d93a0faf911fbb1377f98ab398a6cb3b24d87ef5710b7fa6f2
Candidate: candidate.ts
Exact accessed packet digests: accessed-inputs.sha256

## Design

The file defines exactly the three complete selected owner functions. The initializer assigns construction state in the packet's observable order, keeps config/dependency reads live, preserves shallow config references, and uses nullish defaults with the denial broker. Calls retain their receivers and exceptions propagate without rollback. Existing field initializers and delegated owners remain the curator's retained code.

Shutdown writes the flag before calling the scheduler, including on repeated calls. Browser shutdown remains native async, keeps beginShutdown and Node REPL disposal outside the recoverable try, and always reaches a native await for the optional browser close. Only browser-close/await errors are caught; optional warning arguments are lazy and warning errors propagate.

## Ambiguities

No unresolved behavioral ambiguity in the supplied contract. The packet provides dependency signatures rather than dependency bodies; those dependencies are retained imports. No compilation or runtime validation has been attempted. Curator installation must transplant these function bodies into the native constructor/methods without an extra call or async wrapper.

## Access and limits

Repository reads were limited to these six exact packet files: api.d.ts, imports.txt, dependencies.txt, state-types.txt, ports.txt, contract.md. Each was read for authoring and then read again only to calculate its seal digest. No other repository source, history, tests, oracle, receipts, or dependency body was read. Only the temporary initial candidate and seal artifacts were written. No production edits, live dependency calls, compilation, runtime checks, child agents, or model/access/environment/settings changes were performed.

The shared filesystem restrictions are instruction-only. This record makes no clean-room or MIT claim. This is the immutable initial draft; no self revisions or other complete drafts were produced before sealing. Await curator review after this closure.
