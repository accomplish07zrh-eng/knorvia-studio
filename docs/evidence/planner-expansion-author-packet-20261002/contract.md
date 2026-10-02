# Author contract: complete synchronous planner expansion

Implement a complete TypeScript module satisfying `public-api.d.ts`. The dependency declarations in `dependency-api.d.ts` describe existing imports; they are not an extra implementation to produce. Import the real schema/types from `@knorvia/contracts`, helper functions from `./graph.js`, and scheduler types from `./types.js`. Preserve the export's signature and return type. Internal organization, algorithms and private helpers are your choice; no novelty, size minimization, adjacency strategy or particular decomposition is required. Do not change a dependency.

## Authorship boundary

Only these three packet files are author inputs. Do not read repository source, history, tests, prior drafts, review documents, source maps, external sites or another agent's conversation. Do not run Git, dependency installation, runtime tests or broad searches. Work only in the supplied disposable author directory. Save one complete module as `output/planner-expansion.ts`, then compute its byte length and SHA-256 and save `output/draft-record.json` before any other source/history/test access. Report the record and input files actually read, including any accidental exposure or unresolved question. Stop after saving the draft; do not inspect other implementations or revise after comparison. You may reread this packet while drafting. This is an input-restricted authorship attempt, not a licence decision or an absolute clean-room claim.

## Data and existing dependency contracts

The function is synchronous and has no IO, clock reads, cancellation or event publication. Inputs are bounded ordinary graph records/arrays, not arbitrary proxies/accessors. `timestamp` is supplied by the caller. The snapshot has a `graph` containing `nodes`, `edges` and optional `collections`, plus `updatedAt` and other top-level fields that must survive.

Use the existing `WorkflowGraphPlannerResultSchema.parse(rawResult)` as the first validation boundary; propagate its exception unchanged. Parsed planner results have `nodes` and `edges` arrays (default empty), optional `collectionNodeIds: string[]`, optional `exhausted: boolean`, and optional `reasoning: string`. Parsed nodes have string `id` and `title`, `dependsOn: string[]` (default empty), `kind: "phase" | "task"` (default `"task"`), and optional `collectionId`, `description`, `phase`, `prompt`. Parsed edges are `{ from: string; to: string }`. The existing schema validates and strips unknown fields and supplies its defaults; do not replace it or add another coercion policy. Extra runner result metadata is not used by this transformation. All graph/node/collection/result/snapshot types above are exported by `@knorvia/contracts` under their `WorkflowGraph*`/`WorkflowRunSnapshot` names.

Existing helpers are synchronous and must keep their current semantics:

- `collectionNodeIdsForGraph`: stable unique union of a collection's explicit IDs followed by graph node IDs whose `collectionId` matches.
- `collectionFrontier`: number of those member IDs whose first matching graph node is pending or active.
- `edgeId`: identity string formed by source, literal `->`, then target. Preserve even collisions caused by that delimiter inside IDs.
- `normalizeCollection`: returns a fresh object preserving supplied collection fields and supplying nullish defaults: analyzed/node ID arrays empty, error/run counters zero, exhausted/explorable false, status active.
- `graphCollections`: returns a fresh array of normalized collection objects; absent collections means an empty array. Unchanged nested array references remain shared by normalization.

## Required observations

1. **Nodes.** Project all parsed nodes before checking duplicate IDs. Each new node has these own fields in this order: `collectionId`, `dependsOn`, `description`, `id`, `kind`, `phase`, `prompt`, `status`, `title`. Use the parsed values, with a nullish collection ID falling back to the input collection's ID and status set to `pending`. Optional undefined fields are present. Do not retain raw unknown fields. Reject any new ID already in the original graph or earlier in the added-node order. Original node references survive; new nodes use schema-produced dependency arrays, not raw input arrays.
2. **Edge order and inference.** All explicit parsed edges come first in their supplied order. Then consider each new node in order and each of its dependencies in order; an inferred edge goes from the dependency ID to that node ID. Include an inferred edge only when its key is absent from original edges, all explicit edges, and already included inferred edges. Explicit duplicates are not silently removed; they must reach validation and fail. Preserve the returned explicit-edge objects from schema parsing. Inferred edges have own fields `from`, then `to`.
3. **Ordered edge validation.** Process proposed edges in the order just defined. For each edge, diagnostic precedence is self-loop, unknown source, unknown target, duplicate key, then cycle. Endpoints may refer to any new node, including a later one, or an original node. Duplicate keys are checked against original and earlier accepted edges. Cycle means this next edge closes a directed route back to its source through original and earlier accepted edges. Future proposed edges must not affect the earlier decision. Existing unrelated cyclic components are permitted and traversal must terminate. Never mutate inputs or return a partially accepted graph after an error.
4. **Collection membership and analysis.** Stable unique membership is existing helper-derived membership followed by explicit parsed `collectionNodeIds` if supplied (including an explicit empty array), otherwise all added node IDs. Do not validate these requested membership IDs against the graph or omit external IDs. Analyzed IDs are a stable unique union of the input collection's analyzed IDs and `unseenCompletions`.
5. **Collection transition.** Explicit `exhausted === true` wins. Otherwise, if there are added nodes/edges, a nonzero frontier in the original graph, or unseen completions, status is active. With none of those, input status draining becomes exhausted; every other input status becomes draining, including an exhausted input when the result does not explicitly exhaust. `exhausted` must correspond to final status. Only added nodes/edges advance `lastGraphChangeAt` to the supplied timestamp; otherwise retain its old value.
6. **Collection projection.** Preserve the input collection's fields, replacing/adding `analyzedNodeIds`, `exhausted`, `lastGraphChangeAt`, `nodeIds`, `status` in that order, then use the existing normalizer. Existing own-property positions remain stable when values are replaced. Normalize the graph's collection list; replace every matching ID with the one returned next-collection object. Do not insert it when absent. Other normalized collection objects keep their normalizer-defined sharing behavior.
7. **Result and identity.** Return own fields `addedEdges`, `addedNodes`, `collection`, `snapshot` in that order. Preserve other top-level snapshot fields/references; replace its graph and set `updatedAt` to the supplied timestamp even for a no-op. The new graph has exactly `collections`, `edges`, `nodes` in that order. Its edge/node arrays contain original entries followed by additions, preserving original entry references. Added entries are the same objects returned in the added arrays. Snapshot, graph and graph arrays are fresh even for no-op expansion. No original input object or array is mutated. Raw planner input is unchanged.

## Fixed diagnostics

Throw plain `Error` with the exact text below, substituting the indicated IDs/key without escaping or normalization. A schema error precedes these; node duplicate detection precedes edge errors.

| Condition | Message |
| --- | --- |
| Duplicate node | `Planner returned duplicate workflow node: <nodeId>` |
| Self-loop | `Planner returned a self-loop edge: <from> -> <to>` |
| Unknown source | `Planner returned an edge with unknown source node: <from>` |
| Unknown target | `Planner returned an edge with unknown target node: <to>` |
| Duplicate edge | `Planner returned duplicate workflow edge: <edgeKey>` |
| New cycle | `Planner returned an edge that would create a cycle: <edgeKey>` |

This packet prescribes externally observable results, error priority, object identity and serialization order. It does not prescribe the implementation used to obtain them. Matching fixed API vocabulary, diagnostics or standard language/graph idioms is allowed.
