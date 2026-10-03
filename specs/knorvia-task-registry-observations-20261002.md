# Runtime task registry: predecessor observation freeze

Scope is test/spec/evidence only for the unchanged registry at
`f17024263f787db1d017ac6d5060a10b9305bec1`. No task execution, policy, production,
author-packet or public-declaration change is authorized. The existing TaskOutput
fixture provides the in-memory consumer pattern; new checks use owned metadata,
native promises and per-instance instrumented AbortSignals only.

Freeze grouped observations for snapshot/message identity and order, immediate
waits, pending subscription setup, terminal/background publication, reentrant
registration/removal, and synchronous cleanup failure. Exact object/error/listener
references and native promise continuation order are assertions. Pending-state
checks use microtasks and explicit owned aborts, without timeouts or real tasks.

Three targeted clarifications are required: abort of a later detached observer
during the first cleanup; every pendingMessages getter read during nonempty drain;
and inline abort during listener installation before admission completes. Record
what the predecessor does without adding a post-install abort check or prescribing
private storage. Clarifications belong outside the four immutable author inputs.

Source and actual emitted runs select the same surface for both registry and the
TaskOutput consumer. Exact source/JS/declaration and local consumer pins are checked
before import, with explicit wrong/missing-artifact controls. Historical observation
pins remain separate from current selection; no code is imported from a historical
oracle and no predecessor body is copied into the handoff or evidence.

Run only this focused suite and scoped fixture compile/lint/format/architecture.
Report individual group counts, existing consumer reuse, strict artifact hashes and
limits. All observations are bounded source-exposed contract evidence; no candidate,
independent implementation, clean-room or licensing conclusion is implied.
