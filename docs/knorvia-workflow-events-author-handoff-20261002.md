# Event-log primitive owner: restricted-input handoff

Ready for root's authoring step: read the three new files in
`knorvia-workflow-events-author-inputs-20261002/`, plus the four exact existing declaration
references in packet.json. Do not supply predecessor source, history, tests, compiled
oracle or this curator handoff. No declarations were regenerated; the existing class's
six public constructor/method signatures match source, including optional default options.

Selected cohesive owner is capture/clock/status-record/event publication: constructor,
timestamp, appendGraphStatus and emitEvent in workflow/scheduler/events.ts. Inventory
records upstream-modified/unreviewed, source SHA
`4acf40908ead0d823de81c910c18928dc11a28cd87ca13da1c106a4e5947812d`.
The collection-record methods are callable dependency members and remain byte-preserved
in place, using captured appendGraphRecord and timestamp on the same EventLog instance.
Author only the selected members and their capture state; root combines unchanged
collection members after authoring closes. This is a coherent journal/event boundary,
not whole-file replacement, collection policy or a new logging framework.

New freeze: **4 source / 4 actual-emitted groups**, three behavioral groups plus one strict
selector; 15 owner/graph/immediate-consumer artifacts and 10 wrong/missing controls.
Missing callback still awaits undefined: `append, tick1, tick2, done, tick3`. Concurrent
appends both start immediately; completing b first gives callback/done b before a.
Captured ports receive EventLog as this, exact optional field presence/order and signal/
payload/event references remain. Append and callback failures retain exact errors and
partial append effects. Synthetic pre-abort is forwarded without owner admission.
Already frozen scheduler/node-publication effects are reused, not new differential
coverage and not rerun. Collection helpers are protected, not reconstructed or retested.

Scoped TS 6.0.2: seven roots, zero diagnostics, borrowed public API equality and zero
parsed bodies/initializers/comments in the four declaration inputs. Owned lint: two
files, 94 rules, zero warnings/errors. Root ignore patterns excluded explicit CLI files;
scoped temporary lint config retains rules and clears only path ignores. Changed
architecture context is unmanaged cli; scoped format/architecture checks apply here.

Current executor is usable, reporting Node 24.19.0 rather than pinned 24.14.0. No toolchain
installation/settings change was attempted, so pinned-version/native/platform acceptance
is a root gap. Earlier /tmp scoped proof script was unavailable after reconnection;
committed historical archives/evidence remain unchanged and were not recreated.

Preserved failures: initial test launch exited before groups; the supported launch
passed 3/4 because new error inputs omitted the existing fixture's required signal.
Only that owned input was corrected; no old/new output assertion was weakened. Initial
compiler harness incorrectly forced ES2022, then misclassified default options as
required; final harness uses production compiler options and initializer-aware API
optionality. Initial architecture command used a wrong path; configured command passes.
All records and digests are bound in the receipt, with no production/candidate edit.

Curator source/caller exposure is explicit. Publisher origin is inventory metadata only:
ZCode event-log blob e56e3e38a3033430f4869b00d37904a136bd6199, normalized SHA
`a59ce595ca00d57ea421809f872dbe82eb274d36028eeb8b15f81bb7dabb0b4e`.
No publisher bytes were acquired for this packet. Fixed types/protocol/compatibility seam
remain retained material; root owns authoring, subsequent current-selector migration,
expression/rights review and integration. No whole-file MIT or publication claim.
