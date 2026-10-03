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

## Integrator dependencies and remaining acceptance

- Confirm any parent accepted/historical sessionService/taskIndexSyncer binding
  against the exact original blobs above, and decide source-expression/rights
  status separately from implementation allocation.
- Preserve the separate startup/commitMessageFileScope accepted-hash holds;
  this lane does not substitute or reauthor them.
- Final combination must verify Agent/runtime → task-index/session → Host/Main
  and UI, including continuous Desktop and replayable mobile behavior. Shared
  contracts/root configuration/CI/global provenance are integrator-owned.
- No tests, lint, typecheck, formatting/architecture checks, builds, full audit
  or CI rerun run here. Historical missing dependencies and RPC/CUA diagnostics
  are not claimed still present, fixed or passing at this new head.

No UI, user data, credentials, actual application/runtime/provider/DB/network
business effects, local user computer, third-party notices, root LICENSE,
shared protocol, CI, manifests or main merge are part of this lane's changes.
