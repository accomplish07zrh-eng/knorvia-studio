# Services lane — continuing implementation record

Branch: `lane/services-20261003`. Base:
`integration/backlog-20261003` at exact SHA
`3b1ff0f715a43cbc51c576fd524479a08e58e203`. The default remote fetch selected only
main; explicit integration-branch fetch obtained the requested commit before
branch creation. This task retains the same branch and submits incremental
commits to one draft PR with the integration branch as base.
Draft PR: https://github.com/accomplish07zrh-eng/knorvia-studio/pull/16.

Read the repository AGENTS, architecture-governance skill, integration backlog,
services next-owner HOLD, session/protocol leaf receipts and provider complete
owner receipts. No skill validation commands were run: the user's phase-specific
instruction overrides those commands. Existing evidence is historical and is
not a result of this task.

## Actual remaining owners

The two exact historical originals still exist at the fixed integration base:

| Owner | Git blob | SHA-256 | Historical status |
| --- | --- | --- | --- |
| agent-session/sessionService.ts | 61db9dc9481ef85eb32bf05a70a0f9c3505367fc | dbbd02c0aa1d5ceee811e36d32beb40c1a50b31ef75f7db8c1a1f0dfd3d16199 | Unreviewed, upstream null, NOASSERTION; prior allocation/origin hold |
| agent/taskIndexSyncer.ts | 8672ae0027c23e543307b68024828305993589e1 | 529d114c34c331f54d4e744890526d34c83b54e7f48c00a916fab2583bdbec2c | Unreviewed, upstream null, NOASSERTION; prior allocation/origin hold |

The latest user allocation permits this lane to implement replacements from
behavior contracts. It does not resolve origin/rights evidence or declare an
accepted historical version absent. The examined hold records contain inventory,
retention and missing-origin restrictions; their
`byteIdenticalToAcceptedPredecessor` field is a retention statement, not an
accepted independent-expression review. Keep the historical JSON/Markdown and
global licensing records untouched. Any positive contradictory accepted-version
or rights evidence discovered later must be submitted to the integrator.

Existing automation/import repositories, task database migrations, retry tracker,
stdio/coalescer and provider config/registry/map/rules/account/resolver candidates
are retained. They already have installed-candidate receipts, so they are not
selected again solely because licensing classification remains pending.
ProtocolClient origin and creation/studio-runtime ownership evidence remain
unresolved; no independent/MIT completion is inferred from the directory.
The complete protocol-client candidate is recorded separately in batch 3 below;
creation/studio-runtime still require bounded source/owner decisions. Missing
origin records alone do not establish another complete reconstruction boundary.

## Batch 1 — session lifecycle

The [contract](../specs/knorvia-next-services-session-lifecycle-20261003.md) precedes
implementation. Scope is the full fifteen-operation sessionService coordinator
and stateless operation preparation/policy, retaining the existing public factory
and data contracts. Implementation and synthetic cases are **UNVERIFIED**.

Implemented the complete coordinator with one subscription/publication port and
one retry/repair read pipeline, and invocation-only MCP/thought-level preparation.
The existing deferred-draft and retry owners remain unchanged. Authored six
synthetic subcases covering isolated drafts, persistent model publication,
unsupported levels, replayable pre-send resume/model errors, conditional-close
authority and local/remote MCP composition; none was executed. The candidate's
syncer interface and all service methods stay on their existing entrypoints.
Exact original/candidate bindings are in
[source-bindings.json](evidence/backlog-services-session-lifecycle-20261003/source-bindings.json).
No separate author or pre-source-exposure freeze is asserted.

The author is source-exposed: predecessor source and adjacent public behavior
were read to define the contract and review compatibility. No clean-room,
whole-file accepted independence, novelty or MIT assertion. Public/type/grammar,
fixed policy/log labels and imported collaborator expression remain attributable
to existing sources. No automatic replacement of copyright notices or license
records.

## Batch 2 — task-index ingestion

The [contract](../specs/knorvia-next-services-task-index-ingestion-20261003.md)
was committed first as `146c13ab52958846e2e7209d65bfb7fe7269ecbc`.
The complete taskIndexSyncer coordinator is replaced with a workspace owner,
independently instantiated index/config topic owners, a topic-local recovery
controller and summary/snapshot repository projections. This changes the ownership
structure and implementation, rather than renaming the mirrored predecessor
closures. Shared assemblers, runtime facts and repository transactions keep their
existing collaborators and public entrypoints.

The candidate retains bounded pre-ACK staging and stale-ACK identity protection;
same-sub recovery with ACK/frame arrival-order handling; topic-local retry;
dormant runtime authority; stable listeners; generation-aware suspend/restart;
initial silent non-draft seeding; terminal-before-ready events; existing-only
readback and one terminal unread notification. Metadata preserves missing versus
null goal values, latest-message model choice, error attribution and grouped-top
atomic writes. Search consumes visible text lazily, selecting only the final
assistant text part while retaining the historical content/truncation budget.
No persisted schema or migration is changed.

Authored three synthetic contract files (eleven scenarios) for delayed ACK,
sibling recovery isolation, reused subscription IDs, pre-ACK overflow, snapshot
optional-field/search/publication boundaries and runtime/terminal sequencing.
None was executed. **UNVERIFIED:** source and differences were read; no runtime,
type, lint, build, architecture, audit or CI result is claimed. Exact baseline and
candidate bindings are in
[source-bindings.json](evidence/backlog-services-task-index-ingestion-20261003/source-bindings.json).
The source-exposed authoring and unresolved rights/expression restrictions from
batch 1 also apply here; historical HOLD records stay intact. Neither candidate
has whole-file independent-expression or MIT acceptance.

## Batch 3 — protocol client request lifetime

The [contract](../specs/knorvia-next-services-protocol-client-20261003.md)
was committed first as `366227552305c709e1c735b6cbef0546ed9a2c51`.
Reconstructed the complete protocol client with a private request book owning
pending identity, operation count, watchdog, abort listener and settlement. The
facade retains transport listeners, startup gate, public event routing and
disposal. The former per-method pending cleanup and repeated operation scans are
replaced by one resource-release path and an owned operation count; response
parsing is a per-request settlement callback. Public factory/class/error/event,
wire/value/diagnostic and imported port expression retains its lineage.

Request allocation still follows the startup barrier and abort check. Observation
timeouts remain outside runtime-health/idle extension; cleanup/drained precedes
response parsing and timeout events. Accepted startup transitions pause or fully
restart current watchdogs; transport close rejects requests and emits close
without claiming process disposal. Local disposal remains idempotent, and
disposeAndWait retains the transport's supported asynchronous disposal behavior.
No cancellation wire request or alternate runtime owner is introduced.

Historical protocol-client nonmatches do not establish original authorship.
Whole-expression and source/rights review remain pending. At source commit
`ab99bf38803664c9d77b7804e369d2cc65682389`, the startup gate was consumed without
modification and its exact retained binding was recorded in
[source-bindings.json](evidence/backlog-services-protocol-client-20261003/source-bindings.json).
The earlier attribution of an accepted-hash conflict specifically to this gate
was overly broad; batch 4 below corrects the exact path distinction while leaving
historical evidence intact. **UNVERIFIED:** source
and differences were read; no additional test files or executable validation
were added/run in this source-focused batch.

Published source commits are session lifecycle
`4f9107d0a722830c54ac44127d8a3298aa4bd78d`, task-index ingestion
`5b0b53522d235397cf435a627393c0bf5818d28c` and protocol request lifetime
`ab99bf38803664c9d77b7804e369d2cc65682389`.
Both execution reconnections retained the original branch and modifications;
there was no workspace reset, replacement task or source loss.

The examined creation origin investigation explicitly recommends provisional
retention of its seven feature owners; no substantive inherited whole body was
demonstrated by its limited comparison. Keep that decision and its origin/rights
uncertainty, rather than count missing ancestor/review material as proof of a
needed rewrite. The small deferred-draft registry was also explicitly deferred in
the earlier retry screen; it remains a retained identity-key port, not a new
complete-owner result. Studio-runtime feature ownership and any next substantive
source boundary still need reconciliation; this checkpoint is not whole-services
or whole-project independence acceptance.

## Batch 4 — startup gate and exact installation boundaries

The [contract](../specs/knorvia-next-services-startup-gate-20261003.md) was committed
first as `a13c909ebc76f75f6d44f81a8b71cb4c356fe7e1`. Reconstructed the full gate
using one observed fact/error record and a completion-outcome owner with ordered
per-caller promise views, replacing scattered shared-promise resolver fields.
The first settlement remains fixed; caller cancellation does not settle the
shared outcome. The existing schema, process identity/sequence checks, first
status timeout/unref, synthetic failure shape/event order, raw abort reasons,
snapshot references and public class/events stay on their original contracts.
No migration, database, runtime or accepted-command owner is added.

**UNVERIFIED:** no tests or static/runtime validation executed or added in this
batch. Source/difference reading only. The source-exposed candidate is not an
accepted whole-expression or rights result. Exact bindings and held-path metadata
are in [source-bindings.json](evidence/backlog-services-startup-gate-20261003/source-bindings.json).
Batch-3 retained-dependency hashes bind that earlier source checkpoint, not this
new gate candidate. Its old inventory's allocation/origin marker is preserved;
current user implementation allocation does not clear source/rights uncertainty.

Fetched the integration ref to `91d5cd9dc70f7e801abe2cdecdb12e73d3491c56` without
merging/rebasing this lane. Current lane and that integration tree retain the same
three protected sources. Their separate parent-provided positive metadata is:

| Path below packages/services/src | Current SHA-256 | Parent-reported candidate SHA-256 | Missing installation evidence |
| --- | --- | --- | --- |
| session/tasksDatabase/startup.ts | d5cc1b688fa979534a1a4520e5813a98f84ed66ae8f8525c10371a5761c03fde | a45bd7f55dfe610e78b9314ba5807403cd1397c372a8cd2da81c50d8c961c58a | Exact candidate/descendant source and task-storage-preparation-expression-20261002 receipt |
| git/commitMessageFileScope.ts | f813e660387f81f205ad6adbf925f4ec09f5c2e903aedeae768c1977311a9d2e | ca5bf8cc6396ab43992806626efb6f5700524ec9b0c0b4a36f19090e6c8a6761 | Candidate blob 69e43f4ce19a30ea185ba99ffb284ac0d798c6f8 and commit-message-scope-independent-replacement-20261001 receipt |
| creation/creationReference.ts | 05cd4d5650393c7b3bfe605293776069b653603453fa3dd813f15bdc25cdd654 | 5a6716c314f943b7fe90e91e67c4d1a888efa28558849360114848ccd44bfb43 | Exact root containment-fix source/descendant and creation-reference-containment-20261001 receipt |

All three named receipts are absent in the examined local and fetched integration
trees; the named commit-scope candidate blob is unavailable locally. These are
known historical source/installation gaps, not permission to reauthor an accepted
owner. Parent metadata is not substituted for unread source/rights evidence.
Creation's reported containment fix is bounded maintenance, not whole-file
independence acceptance. Preserve each original source unchanged pending canonical
source/receipt selection by the integrator.

The inspected exact accepted metadata binds task storage preparation, not
agent/storageStartupGate.ts. No positive gate accepted-version conflict was found
in these bounded inputs; this is not proof of absence in unavailable history.
Creation's seven feature-owner origin recommendation and the studio-runtime
retention scope in the combined 164-source queue remain retained; missing-origin
classification alone does not justify another rewrite. Four complete candidate
owners are this lane's implementation boundary at this checkpoint, not
whole-services acceptance. Further source work requires an actual unresolved
owner/install boundary; rights and final combined validation remain deferred
rather than repeatedly rewriting intact code.

## Integrator dependencies and remaining acceptance

- Confirm any parent accepted/historical sessionService/taskIndexSyncer binding
  against the exact original blobs above, and decide source-expression/rights
  status separately from implementation allocation.
- Supply/select exact accepted startup/commitMessageFileScope source descendants
  and the recorded creationReference containment fix with their canonical receipts;
  this lane does not substitute or reauthor those three held files.
- Final combination must verify Agent/runtime → task-index/session → Host/Main
  and UI, including continuous Desktop and replayable mobile behavior, plus
  protocol timeout/abort/response/close races and process-manager health/idle
  boundaries. Shared contracts/root configuration/CI/global provenance are
  integrator-owned.
- No tests, lint, typecheck, formatting/architecture checks, builds, full audit
  or CI rerun run here. Historical missing dependencies and RPC/CUA diagnostics
  are not claimed still present, fixed or passing at this new head.

No UI, user data, credentials, actual application/runtime/provider/DB/network
business effects, local user computer, third-party notices, root LICENSE,
shared protocol, CI, manifests or main merge are part of this lane's changes.
