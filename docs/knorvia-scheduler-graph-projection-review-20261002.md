# Scheduler graph projection selection review

Decision at `8a16740cb7e8b6373c2a910ead6c937359bf6b55`: leave production and
fixtures unchanged. The requested snapshot/collection projection slice is active,
but the alternatives identified here are filter/map-to-loop translations or a
shared generic updater. Neither establishes a useful substantive reconstruction.
This is a bounded negative selection finding, not acceptance of inherited source.

The inventory marks `workflow/scheduler/graph.ts` upstream-modified and unreviewed.
Its recorded publisher blob is `477886feafd8b52cd1586a7d8f625d1f9a1684f1`; it is not
in this local Git object store. The local source was read. Missing publisher bytes
are not a permanent rights barrier, and conventional expressions are not an
automatic licence grant. Root owns the separate expression/attribution decision.

## Read-derived behavior boundary

These are source/caller facts, not a new executed contract suite:

| Public helpers                            | Observable transformation to preserve                                                                                                                                                                                                                               |
| ----------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `updateGraphNode`                         | Fresh snapshot/graph/nodes array even without a match. Patch every matching node with a fresh shallow object; preserve unmatched references, collections and edges. Preserve patch overwrite/undefined behavior and top-level fields.                               |
| `updateGraphCollection`                   | Normalize every existing collection; first matching record supplies patch base. Force requested ID after patch, normalize again, replace all matching slots with the same new record, or append when missing. Preserve node/edge arrays and set supplied timestamp. |
| `upsertActivity`                          | Remove every matching activity ID, append the supplied activity by identity, preserve survivor order/identity, derive session links through the contracts owner, and set supplied timestamp. Errors from derivation remain synchronous.                             |
| `addArtifact`                             | Remove every matching path, append supplied artifact by identity, preserve survivor order/identity and set supplied timestamp.                                                                                                                                      |
| `graphCollections`, `normalizeCollection` | Fresh collection records; shallow retained fields and existing array references. Nullish defaults: analyzed IDs/node IDs to fresh arrays, counters to zero, exhausted/explorable to false, status to active. Preserve field presence/order.                         |
| `collectionNodeIdsForGraph`               | Stable union of explicit node IDs and graph node IDs with matching collection ID. Preserve first occurrence and unknown explicit IDs.                                                                                                                               |
| `compactWorkflowPayload`                  | Remove only own enumerable entries whose values are undefined; retain falsy values and entry order through the existing object projection.                                                                                                                          |

These helpers do not own clocks, IO, async settlement, cancellation or storage.
Their callers own timestamps and publication. `deriveWorkflowSessionLinks` and
`deriveWorkflowSchedulerState` remain separate contracts implementations; this
review makes no acceptance claim about those dependencies.

## Actual callers and existing evidence

- Node runner activation/child linking and outcome projection use node/activity/
  artifact helpers. Prior node-publication assertions preserve startup, linkage,
  failure and terminal publication boundaries; not rerun here.
- Collection planner uses normalization, collection/activity updates and artifact
  projection through admission, activation, child linking and terminal outcomes.
  Its exact source and admission helper remain untouched during root integration.
- Collection event exhaustion projects a snapshot before publishing through the
  existing write/EventLog ports. Graph helpers add no publication mechanism.
- Planner expansion uses normalized collection membership and returns shared
  projection references. Its previous receipt records five focused groups and
  three reused consumer groups per final mode; these are historical counts, not
  new results for this review.

The previous tests are useful consumer evidence but do not establish exhaustive
standalone duplicate/default/accessor behavior for every helper above. No new
suite was added merely to document an unselected rewrite. Existing oracles,
strict selectors and failure proofs are unchanged.

## Next meaningful owner

`orderedReadyExecutableNodes` in this same file is a distinct active scheduling
ordering owner, consumed by the scheduler immediately before the concurrency cap
and started-promise gate. It groups ready exploration nodes by collection, keeps
non-exploration work first, and interleaves collection queues. Overlapping
membership and repeated collection IDs can retain duplicate node references;
queue exhaustion changes the live collection count used by the selection cursor.
These combinations are substantive behavior, not a shallow projection.

Before a future implementation, freeze a few meaningful launch-order observations
for unequal collection sizes, overlap/repeated IDs and exhausted/non-explorable
collections through the actual caller. Do not assume a conventional round-robin
replacement is equivalent to the current shrinking-list cursor. No replacement
algorithm or completeness/licence claim is proposed in this checkpoint.

Validation here is documentation formatting, exact source/artifact pin checks and
protected-file identity only. No runtime edits, new tests, compiler replay, broad
suite/build, provider/user IO or environment/settings changes. Native and root
integrated acceptance remain outside this evidence-only checkpoint.
