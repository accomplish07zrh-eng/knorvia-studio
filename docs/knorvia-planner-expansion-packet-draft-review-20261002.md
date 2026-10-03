# Frozen planner-expansion draft: source and binding review

**Recommendation:** the record supports treating the complete module as a packet-authored owner candidate, not merely an extraction/refactor contribution. However, **do not adopt the saved bytes**: three incorrect collection identity member accesses create a concrete correctness/type blocker. A separately bound descendant with only the corrections below is suitable for root's strict compiler and frozen source/emitted/actual-consumer checks. This is a technical authorship recommendation, not a licence/header/global inventory grant or a claim that validation already passed.

## Frozen inputs and chronology

- Draft: [unmodified 5,219-byte module](evidence/planner-expansion-author-packet-20261002/draft-planner-expansion.ts.txt), SHA-256 `b0ceffd900a1228b57546d06fa8656b6d52a383cb17482a60c7c3a2693b1385d`, committed at `c11ee697418ead34eb1783a754715d88b7de5f74`.
- Author inputs: [behavior/API packet and exact declarations](knorvia-planner-expansion-author-handoff-20261002.md), including behavior contract SHA-256 `11490555e4c19a3f72cb947e7407ae3405bf4d788a23b3792a654f480b6ec358`. The manifest binds all three delivered inputs.
- Publisher comparison: `zai-org/ZCode@872ad960de7ec172591f7e1952f7849229f94521b`, `apps/zcode-cli/packages/core/src/workflow/scheduler/planner-expansion.ts`, blob `7c1ccbcdc7e56b505307de3b21a2eac807568db3`, SHA-256 `97c2c76e47d8ec6b7c2ed976ac23bb8ae4f503f483b3b32319b5bfcc9a65958b`.
- Prior A comparison: `8a16740cb7e8b6373c2a910ead6c937359bf6b55`, `apps/cli/packages/core/src/workflow/scheduler/planner-expansion.ts`, blob `6303688f0a2ff55f6e6c2f13737bd85c3c49cc32`, SHA-256 `4c9d75dccdc0fcc72ffde190d70c0f4125a8cf64c2dd087155809925d4fc73dd`.

Rechecked all three implementation digests using already-retained local bytes; no source retrieval or network retry. The author completed one `fork_turns=none` native attempt and saved/hashed the complete draft before this comparison. No further author turn was requested. The original author receipt, packet, curator manifest and draft remain unchanged; their statements about no comparison describe the initial freeze, not this later curator review.

The instruction allowlist is not filesystem isolation: the fresh author shared this executor's capabilities and reports reading only the three inputs. There is no independently audited access trace. The curator had read publisher, predecessor, A implementation, tests and reviews before distilling the packet. These limits remain material to the full-file recommendation; this is not absolute clean-room evidence.

## Blocking identity binding and exact integration guide

At the pinned checkpoint, `contracts/src/workflow/index.ts` lines 298–315 defines collection identity as **`collectionId: string`**, not `id`; `SchedulerCollection` inherits that shape (`core/src/workflow/scheduler/types.ts` lines 149–157). Draft line 66 instead uses `collection.id` as the new-node fallback. For a parsed node with no collection ID, this yields undefined instead of the required input collection ID.

Draft line 166 compares `entry.id === collection.id`. For ordinary schema-shaped collections, both values are undefined, so **every** existing collection entry matches, including unrelated collections and a list that contains no target collection. This violates selective replacement, no insertion/replacement when absent, and returned identity expectations. Strict TypeScript is expected to reject these three property accesses; compilation was deliberately left to root, not claimed here.

The packet describes the input collection's “ID” but leaves `WorkflowGraphCollection` imported/opaque in its declaration excerpts. Unlike node IDs, it never explicitly supplies the inherited collection identity property's spelling. Record this packet limitation rather than retroactively editing the frozen input or presenting the draft as type-correct. The actual field-name binding is now source-checked; it requires no algorithm change.

For a **separate integration copy only**, replace each of these exact unique lines, preserving every other byte:

| Draft line | Before | After |
| --- | --- | --- |
| 66 | `collectionId: node.collectionId ?? collection.id,` | `collectionId: node.collectionId ?? collection.collectionId,` |
| 166 | `entry.id === collection.id ? nextCollection : entry,` | `entry.collectionId === collection.collectionId ? nextCollection : entry,` |

The two line substitutions correct three member accesses. Calculated in memory only, the resulting file would be **5,249 bytes**, SHA-256 **`fa55221d297c30564d8960ba3e91e50fb6e9de14e7c915025f5dbcc4c736fb73`**. No corrected module was written or substituted. Formatting or other edits would require a different digest and explicit descendant record; do not assign the frozen author's original hash or chronology to a later revision.

No import renaming is needed at the intended `apps/cli/packages/core/src/workflow/scheduler/planner-expansion.ts` location. The existing `@knorvia/contracts`, `./graph.js` and `./types.js` imports are the prescribed bindings. `WorkflowGraphCollectionStatus` is exported by workflow/index.ts line 32 and re-exported by contracts/src/index.ts line 75. The packet's declaration files are documentation inputs, not new runtime dependencies or shims. Root's compiler must confirm the actual integrated dependency set and any additional type diagnostics.

## Complete-owner contribution versus constrained matches

`D` is the frozen draft; `A` is the prior candidate; `U` is the publisher. The packet did not prescribe an adjacency representation or helper decomposition.

| Draft region | Assessment against packet, publisher and A |
| --- | --- |
| D21–53, route ownership/traversal | Draft uses a map of neighbor sets, lazy set creation and a visited-before-enqueue filter with a stack. U157–177 rebuilds array adjacency per edge and uses a queue; A117–119,143–162 owns array adjacency and pushes neighbors without this filter. These are permissible discretionary implementation choices, not a required novel graph algorithm. |
| D85–133, ordered expansion admission | The exported owner itself assembles inferred additions, separately seeds inference keys and accepted routes, then validates/extends them. U splits normalization and validation with per-edge adjacency reconstruction; A delegates the whole step to `admitEdges`. The draft does not merely rename either owner's private helper split. Its per-call index converges with A's standard solution, but the packet only specified accepted-prefix observations, not that strategy. Convergence alone is not evidence of carried source. |
| D55–61, 65–83, 107–130 | Signature and ordered node fields, duplicate/error priority and all six diagnostic texts were furnished by the packet. The duplicate-node loop D78–83 equals A44–49 ignoring whitespace, and standard checks resemble U. A set-membership guard plus a fixed error is a constrained/common idiom; do not credit it as novel or treat it alone as copying evidence. |
| D135–164, membership/status | Stable set unions and positive active-condition branching implement the packet. The draft places analyzed-ID construction before status calculation; U uses nested ternaries, and A starts status at active and handles the negative condition. These are small discretionary choices in a complete implementation, not algorithmic-novelty claims. |
| D157–164 and D169–182, ordered projections | Collection projection equals A69–76 after `changed` → `graphChanged`, `members` → `membership` and whitespace removal; result projection equals A81–94 after `snapshot.graph` → `graph`. These substantial matching layouts were explicitly prescribed by packet observations 6–7, including field order and sharing. Their source-derived API/serialization relationship remains disclosed. It is not unexplained transfer of a discretionary implementation body to this author. |

Read all 183 draft lines against the complete packet and both source files. No distinctive discretionary whole-block carryover beyond the packet-prescribed expression and ordinary graph/TypeScript idioms was identified. The claim is supported by the frozen input-limited chronology and complete draft, not a low similarity score, different names, smaller size, or alleged algorithmic novelty. Fixed diagnostics, imported declarations and ordered protocol projections remain attributed compatibility material even if root later accepts the owner implementation.

## Remaining static assessment and validation boundary

Apart from the identity binding, the plain-record behavior is coherent on inspection: schema parse precedes transformations; projection precedes duplicate checks; every new ID is available for edge endpoints; explicit keys suppress inferred duplicates without silently removing explicit duplicates; only original and accepted edges contribute to cycle detection; visited sets terminate on existing cycles. Neighbor-set deduplication changes neither reachability nor returned edge arrays. The input/helper-defined frontier is a nonnegative count, so the draft's positive comparison matches the packet. Explicit exhaustion, empty explicit membership, analyzed-ID order, no-op fresh graph arrays and original entry references are retained. Local derived structures cannot publish partial output on a throw.

This is static reasoning, not a runtime or compiler pass. Root should first establish the separate field-bound descendant, then use its strict compiler and existing frozen source/emitted/actual-consumer checks, including implicit node collection ID, mixed collection lists, duplicate matching collections, absent target collection, ordered diagnostics/cycles and no-op identity. No new broad test matrix or environment installation is requested. No other concrete blocker was found within the bounded ordinary-record scope; arbitrary getters/proxies remain outside it.

Schema/parser, graph normalization/frontier/key helpers, contract/type declarations, caller/publication owners, third-party libraries and delivered artifacts remain outside this full-owner authorship recommendation. Their bodies and licensing obligations are not replaced or cleared by this module. Only this review/binding guide is committed; no production file, frozen author input/output, assertion, header or global inventory was edited.
