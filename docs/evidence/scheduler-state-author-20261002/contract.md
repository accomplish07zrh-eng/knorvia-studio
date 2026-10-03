# Workflow readiness and collection projection

Implement only `deriveWorkflowSchedulerState(graph: WorkflowGraph): WorkflowSchedulerState`.
Use the accompanying structural types. It is synchronous and pure on ordinary
plain graph records: no IO, mutation, normalization, async boundary, cache, new
policy, additional exported API or input validation. Propagate ordinary errors.
No particular storage/algorithm is prescribed. Return original node and collection
references where specified; all other result records/arrays are per-call values.

Node identity for dependency lookup is by string ID, with the last graph node of
an ID supplying lookup status and intrinsic dependsOn. Preserve every graph node
occurrence in the output, however: its own node reference/status determines its
ready flag and aggregate status count. Intrinsic dependency order for an ID comes
from that last node's dependsOn. Append graph edge sources for edges targeting it,
in edge order; stable-deduplicate the resulting incoming IDs. Outgoing IDs come
only from graph edges originating at that ID, stable-deduplicated in edge order;
do not invent reverse edges from intrinsic dependsOn. Unknown edge endpoints are
not errors, and edges alone do not add node records. A dependency blocks if missing
or its last-record status is not cancelled/completed/failed/skipped. Readiness is
own status pending and zero blockers. No recursive dependency traversal.

For each node ID, collectionIds begins with collection record IDs contributed by
every occurrence of that ID in each record's nodeIds, in collection/list order;
retain repetitions. Next visit graph nodes in order: each truthy node.collectionId
is appended to that node ID's membership only if not already present. Duplicate
node records of an ID share the same collectionIds array when membership exists.
If membership is absent, each derived node gets a separate empty array. Empty
string node.collectionId is ignored in this per-node association step.

Each output node record has keys, in order:
blockedBy, collectionIds, incoming, node, outgoing, ready.
Incoming/outgoing/blockedBy arrays are fresh per node occurrence; node is the exact
input object. Output nodes follow graph order, including duplicate IDs. Top-level
activeNodeIds retains IDs of active node occurrences; readyNodeIds retains IDs of
ready occurrences. blockedNodes contains only pending occurrences with blockers,
in graph order, each with keys blockedBy,nodeId; blockedBy aliases that occurrence's
node-record blockedBy array. Counts count occurrences: active, blocked, completed,
failed, pending, ready,total. Skipped/cancelled count only toward total.

Produce a collection state for every input collection record (absent collections
means empty), preserving record order/reference. Its membership for counting is a
stable union of explicit nodeIds followed by IDs of graph nodes whose collectionId
strictly equals the record's collectionId, including empty-string equality here.
Unknown IDs contribute to no status count. Status lists for active/pending/completed/
failed use last-record lookup status, preserving union order. Ready IDs instead
filter top-level readyNodeIds by membership, preserving ready occurrence order and
repetitions. Frontier is active-list length plus pending-list length.

Collection-state keys, in order:
activeNodeIds, collection, completedNodeIds, errorCount, exhausted, failedNodeIds,
frontier, frontierTarget, pendingNodeIds, plannerRuns, readyNodeIds, status.
Keep frontierTarget present even when undefined. Nullish defaults only:
errorCount/plannerRuns ->0, exhausted ->false, status ->active. Do not derive
exhausted from status or other fields. Preserve explicit values.

Top-level keys, in order:
activeActivities, activeChildSessionIds, activeNodeIds, blockedNodes, counts,
collectionStates, nodes, readyNodeIds. First two are distinct empty arrays. Count
keys are active,blocked,completed,failed,pending,ready,total in that order. No
activity/session-link work belongs to this function. Repeated calls must not share
new result state; original node/collection references are retained across calls.

The real scheduler's ready/blocked helpers consume these fields; keep exact output
and identity rather than redesign fairness or admission. The surrounding schema,
run-state wrapper and session-link helper are outside author scope.
