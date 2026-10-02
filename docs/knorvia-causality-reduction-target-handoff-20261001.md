# Target traversal checkpoint

Baseline `886523c223ac23a6ccb2bdd22dbdd4c90e5bdc5f`; freeze `bd7baa4cee805dc42f2a2241a186883d60ddb96b`; implementation `64f4b7716b25f60818c76b43351605cd25204653`. Added an optional target to the existing queue traversal. Forward witnesses and carry suffixes stop at an initial seed match or a newly admitted target. Liveness, allowed kinds and direct-pair exclusion precede admission; empty-string targets are distinguished from undefined. Carry prefixes still compute full closure. Identity/liveness, adjacency, greedy order and the self-loop guard remain owned by the accepted implementation.

Four focused additions cover an empty-string forward target, a zero-length suffix at an empty-string target, empty carry seeds, and a self-carry whose witness requires the full prefix. Original oracle and pre-correction owner agree on all four. Previous assertions remain intact. Final source and actual-emitted runs each pass the nine reducer/quotient groups plus three documentary groups: 12/12 per mode, overlapping groups. Scoped owner emission and five core test roots have zero diagnostics; only reducer JS/declaration/map emitted. Configured/owned lint, formatting, architecture and digest/scope checks pass.

The documentary identity comparison now explicitly loads exact archived source/JS from the finished 886523c checkpoint. Its previous syntax assertions remain unchanged. Current runtime tests still exercise actual strict source/emitted imports; current declaration/API and comment inventory stay live. Wrong/missing historical archives fail closed. All source/emitted comments and declaration bytes remain unchanged; original compiled/declaration oracles, baseline digests and old receipts remain intact.

One actual-emitted diagnostic used n=100, the reviewer's exact four recipes, fresh plain records for every call, one warmup and five measured calls per implementation/recipe. Graph construction and assertions were outside timing. All 72 outputs passed deep ordered value comparison and explicit per-element original-reference/input-order checks. Original means the exact inherited oracle; before means 886523c; after means the target correction.

| Recipe                 | Original median ms | Before median ms | After median ms |
| ---------------------- | -----------------: | ---------------: | --------------: |
| Chain                  |           0.096561 |         0.123782 |        0.158386 |
| Chain + skip           |           1.129549 |         1.194150 |        0.772723 |
| Dense DAG              |         104.956787 |       225.296142 |       24.197293 |
| Chain + return carries |           0.231111 |         1.323541 |        0.706779 |

The small chain was slower in this sample. This is an environment-dependent diagnostic with no timing threshold or product benchmark claim. Full prefix work remains necessary; target stopping is an existence-query optimization. Display caps apply after reduction and do not limit reducer workloads. Raw samples, Node/platform and recipe counts are in the [cost record](evidence/knorvia-causality-reduction-target-cost-20261001.json).

No new failing run occurred. Previous type/reconstruction-harness failure records remain bound. Source exposure, fixed interfaces/kind lattice/default and conventional Map/Set/queue glue remain disclosed; no licence header/registry grant or whole-file MIT claim. No graph bounds/fold, runtime/Host, shared licensing, dependencies/CI or other-lane edits. No live workflow/provider/network/user-data effects. Native/Windows/browser and aggregate suite/build acceptance remain root-owned and were not run.

[Receipt](evidence/knorvia-causality-reduction-target-20261001.json) binds final hashes, exact counts and preserved history. `node --import tsx docs/evidence/knorvia-causality-reduction-target-check-20261001.mjs` reproduces the digest/protection proof. This is a branch checkpoint, not publication.
