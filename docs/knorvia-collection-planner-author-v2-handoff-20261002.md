# Collection-planner v2: two concerns resolved in focused owner checks

**Result:** the same original author produced a complete v2 module, and both affected owner-boundary probes now match corrected `39cc7b5`. This resolves the two concrete concerns from the [v1 static review](knorvia-collection-planner-packet-draft-review-20261002.md) within the measured scope. Root still owns strict compilation, emitted/direct-consumer validation and production/licence disposition; this is not full runtime acceptance.

The exact [v2 draft](evidence/collection-planner-author-packet-20261002/v2/draft-collection-planner-v2.ts.txt) is **11,883 bytes**, SHA-256 **`32ffd9142ec2d13db5589fa520222c68dbd15e8da2d248efb3b72377620de3af`**, frozen in commit `e694dba4` before curator comparison or execution. The intended integration path remains `apps/cli/packages/core/src/workflow/scheduler/collection-planner.ts`. No new runtime import or separate admission module is required. Any formatting or integration edit creates a separately bound descendant; do not assign it the frozen draft's hash.

## Counterexamples, clarification and chronology

1. The curator executed exactly two focused probes against SHA-bound corrected planner/admission bytes at `39cc7b5fa60c7337a4b1139e8bab8cc0d6a079ec` and unchanged v1 SHA `23403026dd2dadc7cab3221b90f863e6b3762a628b6920a95caeb065c13d5703`. Their [harness, dependency doubles and v1 results](evidence/collection-planner-counterexamples-20261002/) were frozen at `fc8742f5a2635741c38068d6f174e69b47579702` before the author continuation.
2. The same commit froze a [behavior/API-only clarification](evidence/collection-planner-author-packet-20261002/v2/behavior-clarification.md): 3,158 bytes, SHA `ccf57e8f4a1d483aa472476ddc7d2f91349ca0da7768b5b61e9f6b7054a4e383`. It describes live phase observations and aggregation without a function-argument budget. It contains no predecessor/draft source, test code, patch instructions or review. Original inputs remain unchanged.
3. The existing native author `/root/collection_planner_packet_author` continued under its original input allowlist plus that clarification and its own outputs. No new author or cloud conversation was created. The [exact continuation message](evidence/collection-planner-author-packet-20261002/v2/author-continuation.txt) and [author read/hash receipt](evidence/collection-planner-author-packet-20261002/v2/author-record-v2.json) are preserved. Counterexamples, sources and review were not sent to the author.
4. The author froze v2 at `2026-10-02T13:56:06.711661Z`; the curator archived exact bytes at `2026-10-02T13:56:29.485168+00:00`, then committed them before reading the delta or running the probes. Author receipt: 3,974 bytes, SHA `d412ebd9671dc9bac5ce4d055b55801849e88cfed381e9b5e43c7f7c365ad2ae`.
5. The curator inspected the complete delta and reran only those same two probes using the unchanged harness/doubles, baseline and engine. [V2 observations](evidence/collection-planner-counterexamples-20261002/v2-results.json) and [delta/freeze verification](evidence/collection-planner-author-packet-20261002/v2/curator-delta-and-checks-v2.json) are separate from all earlier freezes.

The author reports no boundary breach or unresolved question. Its separation remains instruction-based in a shared executor, not independently enforced filesystem isolation. The curator remains source-exposed. Original v1, its demonstrated failures, packet ambiguity and the earlier mixed-expression assessment are preserved, not rewritten.

## Exactly two focused observations

| Probe | Corrected `39cc7b5` | Frozen v1 | Frozen v2 |
| --- | --- | --- | --- |
| First snapshot port changes the original options.phase from `phase-a` to `phase-b` before resolving | Started event, runner/prompt, expansion records, completed event, artifact and terminal activity observe `phase-b` | Own phase-bearing outputs remain `phase-a`; expansion-event dependency observes `phase-b` | Recorded outputs equal corrected owner, including write/clock counts |
| Expansion boundary supplies 200,000 accepted IDs | Returns every ID in order; plannersRan = 1 | Rejects with `RangeError: Maximum call stack size exceeded` after completion/expansion publication | Returns every ID in order; recorded outputs equal corrected owner |

The checks ran on **Node v24.19.0 / V8 13.6.233.17-node.51, Linux x64**, using built-in TypeScript type stripping and controlled dependency doubles. Exact original owner bytes and the corrected admission helper are SHA-bound before execution; dependency resolution is recorded. Node reports type stripping as experimental. The aggregate size is a reproduced counterexample, not a measurement of the precise engine limit. The doubles supply an already accepted expansion result and do not validate a 200,000-node graph through the actual parser/expansion dependency.

These are two probes before and after the author revision, not a new broad regression suite. Strict TypeScript, repository-pinned Node 24.14, emitted builds and real scheduler consumers were not executed here. Static inspection covers the other changed phase-read sites, including child-session and failure publication; those flows were not separately rerun in this batch. No failure-publication, graph, reducer, socket or unrelated suite was added or repeated.

## Delta and contribution assessment

The exact byte comparison permits only these differences:

- One aggregation call becomes ordered per-ID appends.
- The attempt-wide phase capture is removed.
- Ten phase shorthand fields and three other phase observations read the shared options property directly.

Every other byte is unchanged, including imports, failure count/exhaustion captures, await gates, projection order, diagnostics and fixed text. Eighteen earlier frozen files were verified against their respective commits, and the author receipt's input/v1/output bindings were verified. The unchanged harness and doubles have identical hashes in both result records.

The [complete-owner contribution recommendation](knorvia-collection-planner-packet-draft-review-20261002.md) therefore carries forward to v2, with the two identified behavior concerns resolved in the bounded checks. The added loop and direct property reads are ordinary compatibility expression, not novel algorithms or independent evidence of copied implementation. The author received required observations only and chose the expression; no curator patch was substituted. Mandatory protocol fields, ordering and fixed text remain acknowledged source-derived contract material. No new unexplained discretionary block was introduced by the delta.

This does not reclassify the corrected `39cc7b5` planner or its old admission helper, alter their retained-source diagnosis, clear lower dependency owners, or assign any licence. The current-artifact selector considerations from the v1 review still apply when root installs a complete owner that no longer imports the old admission helper. Preserve historical freezes and wrong/missing-artifact checks while binding the actual candidate dependency closure.

Only evidence, the two focused diagnostics and versioned author artifacts were committed. Production source, notices, licences and global inventories remain unchanged. No deployment, release, main merge, dependency installation or broad/full test run occurred.
