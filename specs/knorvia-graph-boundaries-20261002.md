# Workflow graph module boundaries

This checkpoint fixes the configured 820/400 line violation in contracts workflow
`index.ts` (885 physical lines). Core scheduler `graph.ts` is 253 physical lines;
it is included to separate the reviewed ordering owner from retained helpers.
This is relocation with zero new implementation/originality credit.

Contracts keep the same public workflow and package entrypoints. Internal modules
own definition vocabulary/validation, graph schemas, run/activity/journal schemas,
scheduler state/schema projection, and session-link projection. The public index
retains store ports and reexports. Schemas and retained function bodies move
unchanged; all public types, schema aliases, strings and refinements remain.
The authored state body stays identical to its saved draft. Dependencies point
from projections to schema types; no internal module imports its public barrel.

Core graph remains the caller-facing export surface. `ready-order.ts` owns only
the authored ordering function and imports its existing read-only helper ports
from `graph-helpers.ts`. That file retains all other graph helpers and private
completion vocabulary. It never imports ordering or the graph barrel. Planner
and scheduler production consumers retain their existing imports and bodies.

```text
contracts: definition -> graph/run schemas -> state + session projections
                                            -> workflow public barrel
core: retained graph helpers -> ready ordering -> graph public barrel
```

No algorithm, state lifetime, await, IO, validation rule or permission changes.
Preserve exact function/declaration syntax apart from imports, export routing and
formatting. Inputs/outputs, node/collection references, order and aliases continue
through the same single owners. Schema construction uses one definition per
schema; public barrels reexport the same objects rather than recreate them.

Preserve every historical oracle, test assertion, authored packet/draft and
receipt. Keep exact pre-relocation graph JS separately for the historical state
consumer; never make that consumer use the new graph barrel as its old oracle.
Extend current selectors to bind every moved source/emitted/declaration file.
Only current dependency manifests and their exact loader literals may migrate;
planner production and behavioral tests remain unchanged.

Validation: existing affected state and ordering cases, direct scheduler consumers,
parsed relocation/public API equivalence, strict compiler output and fail-closed
private-artifact checks, owned configured lint/format and architecture. No broad
suite or build. All new production files must meet the unchanged 400-line rule.
The receipt distinguishes inherited relocation from previous authored work;
licensing/header/inventory decisions remain with root.
