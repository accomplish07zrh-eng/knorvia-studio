# Planner expansion: exact-source contribution and retention review

**Recommendation:** credit the per-expansion adjacency/index lifetime and integrated ordered admission as a substantive implementation contribution. It is more than an extracted wrapper or renamed locals. Retain the source relationship for the diagnostic, node/collection/snapshot projection and compatibility expressions identified below. This mixed contribution assessment does not establish whole-file independence or make a licence/header/global inventory grant. No concrete correctness blocker was found within the declared plain-record scope by this source review; root owns runtime integration acceptance.

## Exact inputs

Executor readiness was verified by a harmless working-directory/Git read. Review branch remained `parallel/material-closure-fast-20261002` at `fd5e9e2e7f56253cf083aaa66364e3c9838d4dcd`, clean before this evidence addition. Fetched the normal public A branch and extracted the pinned inputs into a separate disposable review directory without changing product files.

Candidate: [8a16740cb7e8b6373c2a910ead6c937359bf6b55](https://github.com/accomplish07zrh-eng/knorvia-studio/commit/8a16740cb7e8b6373c2a910ead6c937359bf6b55), `apps/cli/packages/core/src/workflow/scheduler/planner-expansion.ts`. The complete new owner implementation is in that file: `applyPlannerExpansion`, `admitEdges`, `appendNeighbor` and `reaches`; there is no additional new implementation file to clear.

Publisher: [zai-org/ZCode@872ad960de7ec172591f7e1952f7849229f94521b, apps/zcode-cli/packages/core/src/workflow/scheduler/planner-expansion.ts](https://github.com/zai-org/ZCode/blob/872ad960de7ec172591f7e1952f7849229f94521b/apps/zcode-cli/packages/core/src/workflow/scheduler/planner-expansion.ts). One HTTP 200 retrieval from the exact commit's raw URL; independently verified the inventory-bound Git blob. No failed-source retries. Publisher text stayed outside the working tree.

| Input | Bytes | Git blob | SHA-256 |
| --- | ---: | --- | --- |
| Publisher expansion | 5541 | `7c1ccbcdc7e56b505307de3b21a2eac807568db3` | `97c2c76e47d8ec6b7c2ed976ac23bb8ae4f503f483b3b32319b5bfcc9a65958b` |
| Candidate expansion | 5372 | `6303688f0a2ff55f6e6c2f13737bd85c3c49cc32` | `4c9d75dccdc0fcc72ffde190d70c0f4125a8cf64c2dd087155809925d4fc73dd` |
| Predecessor expansion at `72b400e88bd9449091c48e52d3bf90a48ddc2388` | 5543 | `7547271ee1a146e7ed2c6d8d8fd4840443c85dc4` | `7344f1884044f6ca8a6106bee0db8ee57169826a8c7588d4d28676a1e6272e8c` |

The predecessor is byte-for-byte the publisher after only `@zcode/contracts` → `@knorvia/contracts`. Read both complete implementations plus the candidate's `specs/knorvia-planner-expansion-20261002.md`, freeze receipt and owner receipt. The spec SHA-256 is `853168906b6380715b14fb1f37b778c9963b30d708b9a2b90797c0b353c4c02d`; owner receipt SHA-256 is `bc50bff2a281eb4b0ab6fd0cc4bf6c24130bef61ddb6d7c402995c0b16aafd42`. Its candidate source digest matches the independently extracted bytes. Source exposure is explicit.

## Substantive change and correctness reasoning

Publisher lines 124–177 keep a pending edge array and rebuild its adjacency inside `wouldFormCycle` for every candidate. Candidate lines 98–140 instead own one ordered candidate list, a reservation set, an admitted-key set and a single evolving adjacency index for the expansion. Lines 117–119 seed adjacency once; lines 137–138 extend it only after acceptance. The already-validated node ID set is reused from lines 29–50 rather than reconstructed in edge validation. This changes the lifetime and update path of derived state; it is the concrete contribution, not merely the helper consolidation.

The accepted-prefix boundary is coherent on source inspection:

- Reservation includes original and all explicit edges before inferred dependencies are added (104–115). Reservation does not imply acceptance: adjacency starts with original edges only. Future candidates therefore cannot contaminate an earlier candidate's reachability test.
- Each candidate keeps the self/source/target/duplicate/cycle priority. Testing reachability from its target back to its source against original plus previously accepted edges is the same cycle condition as the predecessor. Only a successful candidate extends both admitted keys and adjacency. Inductively, the next candidate sees exactly the predecessor's pending graph.
- `reaches` (150–162) uses a visited set with a stack rather than the old queue. Both are standard reachability traversals, including termination on existing cyclic components; no algorithmic novelty is required or claimed. The specific index ownership/update integration is what merits contribution credit. No performance benchmark was run or speedup magnitude asserted.
- All derived arrays/indexes remain local until the full transformation returns. Node projection precedes duplicate checks; failure returns no partial graph. Source inspection found no input mutation for the declared bounded plain graph records. Arbitrary getters/proxies and concurrent mutation are outside this review.

Two potential apparent regressions were resolved from the exact checkpoint's local dependencies, without clearing those dependencies: `contracts/src/workflow/index.ts` lines 324–342 supplies the node kind/dependency and result array defaults removed from the old projection helper; `scheduler/graph.ts` lines 168–180 returns a new normalized collection array, so replacing its entries at candidate lines 77–80 does not modify the input collection array. Existing edge-key delimiter collisions are deliberately retained via the same `edgeId`, not silently repaired.

## Retained expression

`C` denotes candidate lines; `U` denotes publisher lines. Bounded equality checks below remove whitespace only after any listed substitutions; they are correspondence evidence, not originality scores.

| Region | Source correspondence and assessment |
| --- | --- |
| C21–27 / U22–28 | Equal public signature. API-constrained vocabulary is not independently disqualifying. |
| C32–42 / U93–103 | Same ordered node projection, collection fallback and pending status; defaults move to the already-first schema boundary. Inlining this projection is not separate reconstruction credit. |
| C44–49 / U34–39 | Whole duplicate-node loop equals after `existingNodeIds` → `nodeIds`; exact diagnostic remains. |
| C104–115 / U111–121 | Explicit-before-inferred traversal and suppression policy remain, with a cached key and inverted membership branch. The new admission owner reuses this source-derived arrangement. |
| C121–129 / U136–144 | The complete self/source/target diagnostic block is equal ignoring whitespace. C130–133 / U145–148 also equals after `id` → `key` and `existingEdgeIds` → `admitted`. Cycle diagnostic and its position remain; its adjacency-backed implementation changes. |
| C52–80 / U44–69, 78–80 | Stable membership/analyzed unions, active/draining/exhausted decisions, normalization fields and replacement semantics remain. Loop-versus-spread and if-versus-ternary changes alone are not new ownership. |
| C81–94 / U71–86 | Ordered result and graph projection remains, apart from the separately built collection array. C89–94 / U81–86 is equal ignoring whitespace, including copied node/edge arrays and timestamp projection. |

The conclusion is not a blanket rejection because the author saw source, and does not demand different standard graph algorithms, diagnostics or protocol fields. It distinguishes an actual change in index ownership from copied/closely corresponding complete blocks and contract-constrained idioms. Recommend retaining those expression relationships while recognizing the accepted-prefix index contribution; do not equate the latter with replacing the entire source file.

## Verification and limits

Verified exact Git/source digests, branding-only predecessor equality, and five bounded region correspondences (signature, duplicate-node loop, first three edge diagnostics, duplicate-edge diagnostic, projection tail). Read the four differential fixture groups for claimed scope; did not rerun runtime suites, compile, launch the product or inspect user data. The receipt's eight checks per mode include three same-current-dependency consumers; they are not eight independent old-expansion comparisons and are not claimed here as independently rerun results.

Schema, graph helpers, type definitions, collection-planner/admission, prompts, events/publication, built output and broader dependency provenance remain outside any clearance. No dependency source changed between the frozen predecessor and candidate for the three narrowly consulted schema/graph/type files. No legal/header/global inventory decision follows from this review. Only this evidence document is committed; `git diff --check` passed.
