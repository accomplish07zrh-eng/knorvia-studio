# Planner graph expansion

Scope: `workflow/scheduler/planner-expansion.ts`, its named fixtures and the
existing collection-planner current dependency selector. Collection-planner,
admission, graph helpers, schemas, prompts and publication owners stay unchanged.
The inventory records upstream-modified/unreviewed source; this author read it.
The pinned publisher blob is not available in this checkout. No licence grant.

`applyPlannerExpansion` is synchronous and owns only a prospective expansion:

```text
schema parse -> projected nodes -> unique IDs -> explicit/inferred edges
             -> ordered edge admission -> collection transition -> snapshot
```

The schema remains the first boundary, preserving defaults, stripping and errors.
All nodes are projected before duplicate checks. Existing node references survive;
new nodes/edges are schema-derived copies shared with the returned graph. Retain
node field order and optional undefined fields. Explicit edges precede inferred
node dependencies; an explicit or existing edge suppresses its inferred equivalent.
Explicit duplicates remain errors. Inferred edges follow node/dependency order.
For each edge, check self-loop, unknown source, unknown target, duplicate key, then
cycle against existing and earlier admitted edges. Keep exact diagnostics and the
existing `edgeId` encoding, including its delimiter collisions. Existing cyclic
components terminate traversal; unrelated additions remain allowed. Inputs are not
mutated, and no partially admitted graph escapes on an error.

Collection membership is a stable union of existing explicit/inferred membership
and explicit result membership (including empty) or new node IDs. Analyzed IDs
union unseen completions in order. Explicit exhaustion wins; otherwise a graph
change, nonempty frontier or unseen completion means active. With none of these,
draining becomes exhausted and any other status becomes draining. Only graph
changes advance lastGraphChangeAt. Graph collections use the existing normalizer;
every matching collection becomes the same returned collection object, missing
collections are not inserted. Existing nodes/edges retain identity, graph arrays
and graph/snapshot objects are new even for no-op expansion, and unrelated top-level
snapshot fields remain shared. Graph shape remains collections/edges/nodes.

Implementation design: keep one per-call candidate edge sequence and one evolving
adjacency/edge-key index. Seed the index once from the existing graph; each accepted
edge extends it, so reachability observes precisely the accepted prefix. This
replaces repeated adjacency reconstruction while leaving greedy admission order
and the graph helpers as the sole collection-normalization owners. Ordinary
Map/Set/loop operations and fixed output-field/protocol expressions are retained
compatibility material, not a claim of novelty or whole-file independence.

Freeze compact projection/identity, ordered diagnostic and collection-transition
cases against exact predecessor source/compiled/declaration artifacts before code.
Reuse the existing planner success/terminal-publication and actual scheduler
expansion cases; they are same-current-dependency consumer checks, not additional
old-expansion differential coverage. Preserve historical archives and assertions;
only exact current dependency hashes may advance. Test strict wrong/missing
selection. No new environment switches: reuse the existing fixture mode switch.
Run affected source/actual compiler-emitted groups, scoped compiler/lint/format and
architecture only. Synthetic plain graph records and owned ports; no external IO,
clock/abort policy changes, broad matrix or aggregate build. Accessor-rich invalid
graphs and root integrated/native acceptance are not established by these cases.
