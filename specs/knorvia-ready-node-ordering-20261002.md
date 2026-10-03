# Ready-node grouping and launch order

Scope: only `orderedReadyExecutableNodes` in scheduler/graph.ts and its narrowly
named private implementation if required. All other graph helper bytes, planner
files, public declaration shape, runtime consumers and permission/timing owners
remain unchanged. Inventory is upstream-modified/unreviewed; curator has read the
source. A single fresh internal author attempt may use only the bounded behavior
packet after the predecessor freeze. No absolute clean-room or licence claim.

The existing ready helper supplies graph-ordered node references and owns readiness.
Normalized eligible collection records (explorable and not exhausted) contribute
matching ready nodes in ready order. Membership is set membership, not list order.
Repeated collection IDs concatenate contributions. Overlaps preserve occurrences;
first nonempty contribution orders groups. Unassigned ready nodes precede groups.
Group selection uses rank K modulo the live nonempty group count, starting at0;
K advances only when the selected group retains entries. Preserve this behavior
when a group vanishes: it differs from a conventional rotating queue. All emitted
nodes retain their original references; inputs and helper state remain unchanged.
Calls stay synchronous: ready selection, collection normalization, then one
membership read per eligible record. Keep existing thrown errors and default rules.

```text
ready helper + normalized memberships -> contributed occurrences -> ordered list
                                                        -> existing scheduler cap
                                                        -> existing started gate
```

Freeze representative unequal queues, repeated IDs/overlap/default eligibility,
empty/executable/blocked cases and actual scheduler launches with owned promises.
Pin historical graph source/compiled/declaration and exact scheduler compiled
consumer. Rebind only the old graph import for the historical scheduler comparison;
all other dependencies stay on the selected source/emitted surface. Current graph
and current actual scheduler imports remain strict and distinct from those oracles.
Use bounded fake runner gates to observe admission under a concurrent cap, then
resolve them and preserve final output/event/trace observations. Existing planner
consumer checks may be reused with only current dependency pins advanced.

No broad grid, aggregate build/suite, live IO/provider or new timeout policy. Run
focused source/actual strict-emitted and scoped compiler/lint/format/architecture.
Record author input boundaries, any startup limitation, unchanged helper/protected
hashes, retained fixed API/port expressions and the exact saved draft before review.
