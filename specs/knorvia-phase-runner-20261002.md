# Expert phase execution lifetime

Own `workflow/expert/phase-runner.ts` only. Preserve runPhase's public API and its
actual run-loop and critic-loop callers; context, prompts, graph helpers, parsers,
planner implementations and other lanes remain dependencies. Curator read the
predecessor; a fresh author receives only the functional/API packet and any
explicit recorded clarification, with draft saved/hash-bound before comparison.

```text
activation projections -> write/status/started event (outside recovery)
                       -> runner with one live child-link cursor
                       -> artifact + completed snapshot + publication
                       -> return response/snapshot
failure after activation -> abort passthrough OR failed projection/publication
```

Context remains the snapshot/clock/projection owner. This phase owns only the
per-invocation child-link cursor, not storage, retries, approval or cancellation
policy. Preserve identity, native await boundaries, live reads, field order,
conditional fields, error replacement and partial publication. In particular,
terminal projections do not update the child cursor; late callbacks retain the
predecessor behavior even when that looks surprising.

Latest user cadence: skip ordinary development tests/builds. Preserve exact old
source/emitted/declaration artifacts and read-derived functional contract first.
After candidate integration, use one minimal actual-emitted safety pass for startup
write failure, child-link/late-callback publication, terminal publication recovery
and abort passthrough, with a real consumer and synthetic effect ports. No duplicate
source matrix, full suite or broad build. Compile only the owner as needed for the
strict emitted/API proof. Clearly distinguish skipped checks and authorship limits.

No cross-lane integration, root publication retry, provider/user data/settings
operations, headers/inventory/licence grant or merge/deploy. Append this checkpoint
to the existing branch and draft PR11; do not create another PR.
