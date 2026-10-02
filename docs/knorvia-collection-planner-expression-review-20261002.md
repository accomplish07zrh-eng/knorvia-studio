# Collection planner: exact-source contribution and retention review

**Recommendation:** accept the two-file change as a source-exposed reorganization with bounded new decision/result expression, while retaining its publisher-derived expression. Do not classify either complete file as an independently replaced owner on this evidence. This is a contribution/retention recommendation, not a licence, header, inventory, or runtime-acceptance decision.

## Exact inputs and method

Reviewed candidate: [Knorvia commit 39cc7b5fa60c7337a4b1139e8bab8cc0d6a079ec](https://github.com/accomplish07zrh-eng/knorvia-studio/commit/39cc7b5fa60c7337a4b1139e8bab8cc0d6a079ec), fetched from `parallel/cli-tools-fast-20261001`. Files were extracted with `git show` to a separate disposable review directory; the materials branch's product files were not checked out or changed.

Publisher: [zai-org/ZCode@872ad960de7ec172591f7e1952f7849229f94521b, apps/zcode-cli/packages/core/src/workflow/scheduler/collection-planner.ts](https://github.com/zai-org/ZCode/blob/872ad960de7ec172591f7e1952f7849229f94521b/apps/zcode-cli/packages/core/src/workflow/scheduler/collection-planner.ts). One successful HTTP 200 retrieval from that exact commit's `raw.githubusercontent.com` URL; no retries. Independently verified the supplied byte count, SHA-256 and Git blob hash. Publisher source stayed outside the working tree and is not reproduced in this evidence.

| Input | Bytes | Git blob | SHA-256 |
| --- | ---: | --- | --- |
| Publisher planner | 13367 | `bdcd8ba5e2abdc95cbe52c5a9280ec51079ab7f0` | `3ccdf67a46bd88524debc3094d3a8455a74c8c16d64d5c787a043c0460594b24` |
| Candidate `collection-planner.ts` | 12942 | `3d32f332462b3aac0a3037161c19340e2b6928fd` | `2556b0d2495c08b82f22b8396abb87a0faea907611a45eab8d89bfd5a7e2d79b` |
| Candidate `collection-planner-admission.ts` | 3196 | `b07568195bc3300c59e1843c5a95bedd5451e372` | `aade31d58a478a21f9655c6f526ac40198cf962764c5084068ec0b70bf5edae9` |
| Local predecessor planner at `129f47d6b2afe569538d0c76d9fe0840b061a7c7` | 13369 | `6edf29007ce2fd738365e7ba7ca80809d3c8f9b9` | `328f5fa6b3136e9c77589a638a91fc6e212fa443318b6e59e4010af2d697e797` |

Both candidate paths are under `apps/cli/packages/core/src/workflow/scheduler/`. The local predecessor is **byte-for-byte equal** to the publisher after the sole replacement `@zcode/contracts` → `@knorvia/contracts`; no whitespace, comment or syntax normalization was necessary for that comparison. Source exposure is therefore explicit, not inferred only from inventory labels.

Read both complete candidate files, the complete publisher file, and A's owner/failure-publication specs and receipts at the candidate commit. Compared state lifetimes, branch structure, helper inputs/results, ordered projections, port awaits and runtime text. The five bounded textual checks below ignore whitespace only after the explicitly listed substitutions; they are reproducible correspondence checks, not an AST similarity score or an authorship threshold. No broad runtime suites, compilation, product launch, or user-data access was performed. Root owns current source/emitted integration acceptance.

## What is new, and what ownership already existed

1. **Admission decision representation and sweep dispatch:** admission lines 13–17 and 84–88 encode `skip`/`exhaust`/`attempt` with the accepted snapshot, reason or unseen completions. Planner lines 56–74 centrally accept the decision and route exhausted/attempted work. This is a useful new internal interface and control representation. The policy predicates, their priority, graph helper calls and timestamp order are inherited; moving them into another file, converting filters to loops, and renaming locals are not separate replacement achievements.
2. **Explicit attempt record and projection results:** planner lines 29–38, 123–132, 195–198 and 239–245 package the original collection reference, run count, input paths, activation facts, cursor and terminal results. The record makes reference/captured-value relationships inspectable across synchronous helpers. Credit the concrete record/result and routing expression, not a new state-ownership architecture: publisher lines 140–198 already capture the same attempt facts, and its `plannerSnapshot` is already advanced only by the child-link callback. Candidate `origin` remains a reference, not a frozen copy.
3. **Recovery arrangement and corrected publication facts:** candidate lines 341–347 place failure projection/publication after the catch and capture primitive `errorCount`/`exhausted` before mutable ports. This correctly preserves the source contract; publisher lines 322–327 and 365–385 already calculate and retain those primitives across publication. The correction restores behavior lost in the earlier refactor. It does not create a new exhaustion policy or establish whole-owner independence.

In particular, the claimed child-only cursor, terminal projections that do not close it, activation gates outside recovery, and failed-publication fallback to that cursor all already occur in publisher lines 161–223 and 253–386. Their preservation is necessary behavior evidence, not new ownership. The candidate's imperative linked-activity assignments (135–150) are a small alternative expression of publisher 208–222, not a separately novel algorithm.

## Retained expression map

Line numbers refer only to the exact hashed inputs above. `P` is the candidate planner; `A` is its admission helper; `U` is the publisher planner.

| Candidate region | Publisher region | Finding |
| --- | --- | --- |
| A42–49, completion timestamp update | U57–64 | Equal after `nextSnapshot` → `snapshot` and whitespace removal. The two timestamp calls and object/call arrangement remain. |
| A51–54, latest-collection lookup | U67–70 | Equal after `latestCollection` → `latest`, `nextSnapshot` → `snapshot`, and whitespace removal. |
| A56–60, initial-frontier predicate | U75–79 | Equal after `shouldDeferInitialExpansion` → `initialFrontier`, `latestCollection` → `latest`, `unseenCompletions` → `unseen`, and whitespace removal. |
| A26–88, complete admission sequence | U40–114 | Phase/membership/frontier/completion checks, stamping, exhausted check, both deferrals and threshold priority correspond in order. Decision envelopes replace the old inline `continue`/await results; the broader source-derived sequence remains. |
| P89–100, child-trace construction | U144–155 | Equal after replacing only the declaration `const traceContext =` with `const trace =`, plus whitespace removal; property names and values are unchanged. |
| P101–105, active collection normalization | U156–160 | Equal after removal of the local `: SchedulerCollection` annotation, plus whitespace removal. |
| P112–122, 168–194, 211–238 | U168–178, 261–287, 328–356 | Active/completed/failed activity and collection projections retain the ordered fields, literals, conditional model/session/turn fields and nullish trace choices. Local bindings now come from the attempt record and nested helper calls are separated; these are substantial carried projections, not merely coincident single API names. |
| P259–271, 274–310, 313–370 | U181–197, 201–252, 290–386 | Activation, runner/callback, artifact and terminal publication chains remain closely corresponding, including event payload layout and runtime prose. Failure publication is moved outside the catch after capturing its error; the port sequence and recovery boundary are retained. |

Runtime text remains attributable: start/completion/session-link/exhaustion messages, the artifact directory/name template, artifact label/content type, event kinds and reason strings remain the same apart from local reference substitutions. These are compatibility facts, not reasons to demand different user-visible text.

No individual `await`, `if`, loop, spread, optional/nullish access, declared protocol field, or standard type/API name is treated as disqualifying. No algorithmic novelty is required. The retention conclusion rests on explicit source exposure and the combined carried admission sequence, projection blocks, values, ordering and publication expression. A new path or helper split does not erase those relationships, while their presence does not erase the bounded contribution identified above.

## Recommendation boundary

- **Planner:** retain a mixed/source-derived attribution assessment, with bounded contribution credit for the explicit attempt/terminal records, decision dispatch and recovery arrangement. Do not use the restored failure-publication behavior as whole-file clearance.
- **Admission helper:** retain its relationship to the publisher's admission block, with bounded credit for the synchronous decision interface/result routing. Its new filename does not justify an original-file or independent-replacement recommendation.
- **Lower dependencies:** `graph.ts`, `prompts.ts`, `planner-expansion.ts`, `collection-events.ts`, `collection-runtime.ts`, `types.ts` and contract implementations remain outside this review's clearance. A bounded Git comparison found no changes in those six scheduler files between the named local predecessor and candidate, but unchanged dependency bytes are not clearance of their provenance or behavior.
- **Acceptance:** no additional runtime blocking finding is asserted by this source review. The concrete blocker is to treating these complete files as independently replaced expression. Root may adopt the refactor while retaining the source relationship; licence/header/global inventory decisions and integrated runtime acceptance remain separate.

Review evidence only. Existing attribution and all unresolved material obligations remain untouched. Digest checks, bounded correspondence assertions and `git diff --check` passed; no dependency-backed runtime check is claimed for this review.
