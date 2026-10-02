# Ready-node ordering behavior contract

Implement only the synchronous exported function `orderedReadyExecutableNodes`.
Use the supplied type/port declarations. Private representation is your choice.
Do not add IO, async boundaries, global mutable state, policy, mutation of inputs,
or extra public exports. Return original node references in a new array.

Call readyExecutableNodes(graph, executableNodeIds) first. That port owns readiness,
executable filtering, graph order and node references. Call graphCollections(graph)
next; it returns normalized records in graph collection order. These ports and
collectionNodeIdsForGraph remain external, unchanged helpers. Propagate their
synchronous errors; do not catch or reinterpret them.

For each normalized collection, participation requires truthy explorable and falsy
exhausted. Its status string is not an eligibility condition. For each participant,
call collectionNodeIdsForGraph(collection, graph) once. Its returned ID list is
membership, not node order: select ready nodes in the ready port's order. A missing
or ineligible collection contributes nothing. A participant with no ready members
does not establish a collection's group position.

Each participating record contributes one occurrence of every matching ready node.
Repeated IDs in the membership list do not multiply occurrences within a record.
Records sharing collectionId contribute to one group, in record order. Overlapping
records/groups can repeat the same node reference. Group order is the order of
first nonempty contribution. Any ready node whose ID appears in a contributed
group is exploratory. All remaining ready nodes come first in their original order.

Then emit exploratory occurrences. Within each group preserve contribution order.
The precise cross-group sequence can be defined by an integer K, initially0:
at each choice, among nonempty groups in their original group order, select rank
K modulo their current count and emit its first remaining occurrence. If that group
still has an occurrence after emission, increase K by1; otherwise leave K unchanged.
This is an observable sequence rule; no specific storage or loop form is required.
Do not substitute a conventional rotating queue that loses K across removals.

Examples (group contents shown after participation selection):
- [A1,A2], [B1,B2], [C1], [D1,D2] -> A1,B1,C1,D1,A2,D2,B2.
- Group X first receives [u,v], Y receives [v,w], X later receives [w]:
  group order X,Y; exploratory output u,v,v,w,w (references repeated).
- No groups: return all ready nodes, in order, in a fresh result array.

All ordinary supported graph records are plain data. No requirement to introduce
new validation or normalize node IDs. Do not deduplicate the final sequence.
The existing scheduler consumes this ordering before its launch cap and started
promise gate; it owns all effects, concurrent state and cancellation. Do not change
that consumer or account for active nodes independently here.
