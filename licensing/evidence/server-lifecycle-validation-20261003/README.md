# Focused lifecycle validation supplement

Continues the same draft PR9 and recovery/server-lifecycle-20261002 branch from
d9318cde0eccd553440408ebde42d28118e7ee18. Seven production candidates were already
authored at 0ce9d9b13405e17f39fa8c3e73d51b8c0cee4544; all seven current SHA256
values match their frozen candidate receipt. Their exact requested baseline
f25b931164ee6287167e965e9da7a7586131b264 SHA256 values also match. No production
source was rewritten and no earlier evidence was modified.

The current delegation asks for focused validation. Its new specification preceded
the new fixture. This supplement extends the older deferred validation scope; it
does not rewrite the historical packet or suggest these tests previously ran.

Executed results:

- Exact baseline: six injected compatibility groups passed, zero failed.
- Unchanged candidate: the same six groups and three existing capability tests
  passed, nine total, zero failed.
- Shutdown tests exercise synchronous stop admission, later severity escalation,
  one disposal/exit, original error identity, independent phase budgets, and late
  rejection observation. Stdio tests exercise copied binary bytes, drain waiting,
  repeated close/end delivery, memoized stop and socket cleanup on scope failure.
  HTTP tests exercise both connection modes/roles, byte copying, write gating,
  and the distinct scope-before-channel cleanup order.
- Scoped lint: twelve files, zero warnings/errors. Architecture: zero violations,
  zero baseline/new violations.
- Syntax: seven owner files plus their index reexport consumer, zero diagnostics.
- Restricted semantic types: lifecycle and capability owners, zero diagnostics;
  actual Node declarations, skipLibCheck, shared capability shape injected from its
  existing schema. This is not full product semantic typechecking. The other five
  owners received syntax checking only.

Command JSON files preserve complete stdout/stderr, status, selected baseline
environment and command-file hashes. precheck-bindings.json binds seven baseline
and candidate source hashes, the synthetic fixture and all seven original packet
files. Final bindings confirm those bytes remain unchanged. Direct Node and existing
local tools were used; no package installation, failed pnpm-wrapper retry, permission
change, dependency manifest edit or native build occurred. Node is 24.19.0 rather
than the pinned 24.14.0.

Tests inject dependencies and process streams; their timers and promises are
synthetic. No real stdin/stdout termination, HTTP listener, Hono dispatch, remote
backend, deployment, credential, user data, UI or database was exercised. Framing
remains the retained RPC dependency's responsibility and was not tested here. Entry
boot/handshake and full service composition remain unvalidated. No listener was
attempted, so there is no observed EPERM and no claim of native runtime passing.

Frozen source observations remain in the original packet: synchronous promise-port
throws, handshake UTF-8/binary suffix limitations, repeated socket terminal events,
HTTP remote resource lifetime and raw-cookie comparison semantics. They were not
fixed or reclassified as executed failing tests.

The original fresh-author boundary was instruction/context isolation on a shared
filesystem, not OS enforcement. This source-exposed validation supplement provides
no new authorship credit, uniqueness proof, MIT conclusion or independent-expression
acceptance. Public/local receipts cannot exclude inaccessible private history.
Global provenance, inventory and LICENSE are unchanged; parent classification and
final aggregate compatibility/build/integration remain pending.
