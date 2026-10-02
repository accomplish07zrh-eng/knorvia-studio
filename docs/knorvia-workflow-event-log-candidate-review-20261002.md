# Event-log candidate: correctness and expression review

Hold correctness acceptance. The candidate's status-record hoist changes the append
recipient's read phase relative to the captured clock. One owned ordinary-record probe
reproduces a target/record-ID mismatch in source and emitted dependency modes, despite
all four existing frozen groups passing in both modes. No production/tests/selectors/
oracles were changed, and no runtime fix is supplied in this review.

## Focused boundary proof

Use the existing empty owned snapshot (runId owned-run). Configure its captured clock
to synchronously set that same plain snapshot's runId to owned-clock-run, then return
Date(0). Capture the appendGraphRecord call and its record. Both ports receive the
EventLog instance; forward the original signal. Call appendGraphStatus once.

| Observation                       | Exact predecessor                     | Candidate       |
| --------------------------------- | ------------------------------------- | --------------- |
| appendGraphRecord first argument  | owned-run                             | owned-clock-run |
| record.runId                      | owned-run                             | owned-run       |
| record keys/clock count/timestamp | frozen seven fields / one / ISO epoch | same            |
| method result                     | undefined                             | undefined       |

The exact archived and actual current predecessors agree. Candidate compatibility fails
ERR_ASSERTION in each mode. The proof catches/preserves that expected failure; its exit
zero is counterexample validation, not compatibility passing. No accessor or timing
grid, live data, provider or user operation is involved. This establishes a supported
observable port-order difference, not a claim of a production incident.

Predecessor evaluates the captured record port and first snapshot.runId argument before
constructing the record/calling timestamp. Candidate constructs operation first, then
reads the append argument after timestamp. Restore that read/effect order before runtime
acceptance; do not assume the injected clock is pure or redesign record ownership.

## Existing gates and temporary routing

The four original test groups/assertions were reused unchanged in temporary copies,
with only import routing changed: **4/4 source and 4/4 emitted**. Temporary combined
source, declaration and source/emitted review modules have exact digest selectors;
the 15 predecessor/graph/consumer bindings and historical oracle remain strict. Capture
order, replacement isolation, EventLog receivers, default own-undefined event fields,
payload/event identity, append/callback gates/errors, absent-callback yield and concurrent
publication order pass those cases. No broader timing/accessor/thenable matrix ran.

The selector group's consumer import remains the installed exact predecessor scheduler.
It is consumer-binding smoke, not evidence that an integrated scheduler used this
candidate. Root's independent integration/current-artifact checks remain necessary.

Strict TS 6.0.2 compile of the virtual single owner has zero diagnostics; parsed public
API shape matches source/declaration. The two collection member spans are byte-identical
and remain in their original relative order. Selected members/state parse identically
before and after temporary assembly with original import bindings. No source adoption.

The transported excerpt saved here is 1,662 bytes, SHA256
`3df381f2a6f4f0eefe608380479be635b1b02c41a09e6313aa2cf9503dd20fce`.
It is **not** root's saved 2,003-byte draft. Root did not supply that draft/hash, so this
review compares the message's parsed selected members after assembly; it does not invent
byte equality or independently verify root's saved/integrated artifact. Root should compare
its selected AST to this reviewed excerpt and retain its own exact original draft.

Two documentary comparator failures (quote style and trailing semicolon) were preserved
before using parsed type-node shape. A temporary .ts review loader was inferred as CJS;
using .mts fixed only loader mode. Candidate code and frozen assertions were unchanged.

## Expression recommendation

Visible implementation deltas are port grouping under publication, explicit receiver
calls, a local Date reference and staging the operation literal. Capture sequence,
record/event projection and awaited publication/callback sequence remain the same
functional combination, with the hoist causing the demonstrated regression. **Do not
credit this representation reshuffling alone as substantive reconstruction of the owner.**
No smaller-code or novel-algorithm requirement is applied: conventional constrained glue
can be genuinely newly authored and may legitimately match. Root's closed-before-body
chronology is evidence for a new authoring attempt, not proof from a renamed field or
changed hash. The independent contribution visible here is a narrow representation
choice; type vocabulary, ordered field literals and native await glue are overwhelmingly
contract-constrained. No copied discretionary commentary appears in the excerpt. Do not
invent copyright from matching idioms, but do not claim the bundle alone replaces
substantive inherited expression or clears the whole file. Untouched collection bodies
remain inherited and outside the selected reconstruction.

Parent reports authoring closed 2026-10-02T11:00:52Z before predecessor body/tests/history,
but also read curator handoff and broader scheduler context. Record that explicit packet
boundary deviation; no strict packet-only or absolute clean-room claim. Reviewer exposure
includes predecessor, packet, fixtures and the acceptance criteria. This is a correctness/
expression recommendation, not a header, global inventory, source-rights or licence grant.
Node 24.19.0 is available here; pinned 24.14.0/native/platform verification remains unrun.

[Exact review hashes, gate results and preserved counterexample](evidence/knorvia-workflow-event-log-candidate-review-20261002.json).
