# Two frozen collection-owner counterexamples

Scope: exactly the phase-mutation and accepted-ID aggregation concerns from the static review. `check.mjs` SHA-binds the exact corrected planner/admission at `39cc7b5fa60c7337a4b1139e8bab8cc0d6a079ec` and the author draft, then executes their bytes with Node's built-in TypeScript type stripping. Runtime imports resolve to controlled diagnostic doubles except the corrected admission helper, whose exact bytes are loaded. No production source is patched or installed.

The doubles isolate the collection-owner boundary. They are not a claim that all graph/schema/event dependencies or the real scheduler have been tested. The accepted-ID case supplies an expansion result with 200,000 unique IDs; it checks all returned IDs and order when the owner succeeds. The first snapshot write in the phase case changes the original options record before resolving. Both use plain objects and the same runtime doubles for each subject.

`v1-results.json` freezes the actual observations, source and harness hashes, resolved imports, Node/V8 versions, and limitations. On Node 24.19.0, corrected `39cc7b5` observes `phase-b` in later publications, while v1's own events/runner/prompt remain at `phase-a`; its expansion-event dependency still observes `phase-b`. Corrected aggregation returns all 200,000 IDs; v1 rejects with RangeError after planner completion publication. This is a measured counterexample, not a measured exact engine threshold. The repository's pinned Node 24.14 environment is root's responsibility.

Reproduction requires extracting the exact corrected planner and admission files with `git show` into a disposable directory, then invoking:

```text
node docs/evidence/collection-planner-counterexamples-20261002/check.mjs <corrected.ts> <collection-planner-admission.ts> <candidate-file> <candidate-sha256> <counterexamples|equivalent> <output-json>
```

`counterexamples` requires the two recorded v1 differences. `equivalent` repeats only those same two probes and requires the candidate's observed results to equal the corrected owner's. Hash mismatches reject before loading subjects. Output paths for subsequent runs must not overwrite frozen evidence. No strict compiler, emitted build, real-consumer check or broad suite is included.

This harness, its observations and the review are curator-only evidence. They are not author inputs. A separate versioned behavior/API clarification supplies only the required observations to the same original author.
