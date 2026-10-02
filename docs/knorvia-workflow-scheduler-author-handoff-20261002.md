# Workflow scheduler: restricted author handoff

Selected future owner is the complete constructor/run lifecycle in
`apps/cli/packages/core/src/workflow/scheduler.ts` at `e972ca8`: executable scope,
resume admission, pending-node scheduling, outcome accounting, frontier and terminal
decisions. Inventory marks it upstream-modified/unreviewed. Collection planning already
has a callable result boundary, so `collection-planner.ts` and the ten-line runtime
interface remain existing dependency owners. No production, candidate or author-process
change occurs in this checkpoint; no author startup retry.

Give the restricted author **exactly these six files**, with no source/history,
predecessor tests, compiled oracle or curator evidence:

| Input under `knorvia-workflow-scheduler-author-inputs-20261002/` | Purpose                                                                                                              |
| ---------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------- |
| `behavior.md`                                                    | Functional order, identity, concurrency, publication/error/abort rules; no private storage mandate                   |
| `api.d.ts`                                                       | Seventeen scheduler types, constructor/run signatures and public re-exports                                          |
| `workflow-types.d.ts`                                            | Exact structural workflow/graph/event public types                                                                   |
| `supporting-types.d.ts`                                          | Scheduler-state/session/trace/brand types; re-exports workflow types                                                 |
| `dependencies.d.ts`                                              | Existing repair, graph, planner, node-runner and event-log callable surfaces, no bodies/private declarations         |
| `inputs.json`                                                    | Owned base data, production import bindings and representative observed outputs; historical reuse labeled separately |

The declarations form a closed local type input. Nineteen supporting types and seventeen
scheduler types are mutually assignable to their originals; constructor/run public
signatures match. Thirteen local dependency declarations match parsed public originals;
the two additional derive-function declarations are projected from the contracts d.ts.
All four packet declaration files contain zero parsed bodies, initializers and comments.
Expanded inferred workflow records were separated from protocol/scheduler types to honor
the configured 400-line limit, without changing their shapes or relaxing lint.
Type/API expression and fixed vocabulary are retained material, not new runtime credit.

## Frozen observations

New checks have seven groups per source/actual-emitted mode: five runtime groups covering
ten representative scheduling scenarios, one actual scheduled-phase consumer group
(empty success and blocked error), and one strict current/historical selector group.
The selector binds 36 owner/caller/local dependency source/JS/declaration files; wrong
or missing owner/caller artifacts reject before import. Historical JS/declaration bytes
have a separate exact loader; current tests import the selected actual implementation.
The constructor/run production bytes and emitted artifacts remain unchanged.

The existing node-publication checkpoint's scheduler success, error-threshold and queued
node-completion-abort observations are reused, **not rerun**. They are one historical
group per mode, three scenario pairs, not additional new coverage. New scheduling runs
passed 7/7 in both modes. After supplying the caller fixture's required synthetic task
option, only its two consumer/selector groups were rechecked: 2/2 per mode, overlapping
the seven-group runs. The five runtime groups were unchanged; no inflated summed total.

Two ambiguities were resolved against the unchanged predecessor:

- Concurrent runs can append both initial frontier events before either callback.
  Exact observed port order is event one, event two, callback one, callback two;
  callbacks retain the corresponding event object by reference. There is no global
  latest-event/mutex guarantee. The serial fixture's strict assertion is retained;
  concurrent input uses a strict ordinal reference check and exact interleaving trace.
- Abort alone does not interrupt a pending native node race. With a signal-ignoring
  owned port, the run remains pending. Completing that port retains node publication;
  the next opportunity rejects the original abort Error without executor_completed.
  A queued abort during an already accepted executor_completed publication still
  returns completed. This differs from the reused node-completion abort boundary.

Known startup limitation remains explicit: the existing node runner can reject its
outcome while leaving started pending. This checkpoint adds no timeout, cancellation
join, rollback, recovery or speculative repair. Getter/thenable/race rules beyond the
representative cases are labeled source-derived functional requirements.

## Evidence and limits

Initial new fixture run passed 6/7: a global latest-event assertion was invalid for the
new concurrent input. Automatic review rejected a proposed membership-check weakening;
that edit was restored. The accepted correction retains the original serial assertion
and adds exact concurrent ordinal/trace assertions. The next run was interrupted while
an incorrect immediate-abort expectation awaited a still-pending port; its log remains.
A targeted owned-port probe established the pending-race boundary before correcting the
new observation. Scoped compile then found one missing required caller task field;
adding owned task data preserved every output assertion. All failure records are bound
in the receipt. No old frozen assertion, oracle or receipt changed.

Final scoped TS 6.0.2 proof has zero diagnostics and reproduces existing scheduler JS and
declaration bytes exactly without writing production output. Owned lint has zero errors
and one intentional receiver-observation `no-this-alias` warning. Formatting and changed
architecture checks are scoped to this checkpoint. No whole suite/build, full call-runner,
live/provider/native/platform acceptance or arbitrary accessor matrix ran.

Curator source/caller exposure is explicit. Only the named packet excludes old bodies
and discretionary prose; it is not an absolute clean-room or rights claim. Publisher
identity comes from existing inventory (ZCode `872ad960...`, scheduler blob
`0fb8dac4ff4a8ed4f4b8d03a26531906f8a55aa7`); no new publisher-byte acquisition.
Root owns any subsequent authoring/access record, actual current-artifact migration,
independent expression/licence review and integration. No header/registry/MIT grant.

[Exact packet/test digests and preserved evidence](evidence/knorvia-workflow-scheduler-observations-20261002.json).
