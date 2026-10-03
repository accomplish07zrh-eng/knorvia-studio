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

| Owner                           | Git blob                                 | SHA-256                                                          | Historical status                                                    |
| ------------------------------- | ---------------------------------------- | ---------------------------------------------------------------- | -------------------------------------------------------------------- |
| agent-session/sessionService.ts | 61db9dc9481ef85eb32bf05a70a0f9c3505367fc | dbbd02c0aa1d5ceee811e36d32beb40c1a50b31ef75f7db8c1a1f0dfd3d16199 | Unreviewed, upstream null, NOASSERTION; prior allocation/origin hold |
| agent/taskIndexSyncer.ts        | 8672ae0027c23e543307b68024828305993589e1 | 529d114c34c331f54d4e744890526d34c83b54e7f48c00a916fab2583bdbec2c | Unreviewed, upstream null, NOASSERTION; prior allocation/origin hold |

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

| Path below packages/services/src | Current SHA-256                                                  | Parent-reported candidate SHA-256                                | Missing installation evidence                                                                                             |
| -------------------------------- | ---------------------------------------------------------------- | ---------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| session/tasksDatabase/startup.ts | d5cc1b688fa979534a1a4520e5813a98f84ed66ae8f8525c10371a5761c03fde | a45bd7f55dfe610e78b9314ba5807403cd1397c372a8cd2da81c50d8c961c58a | Exact candidate/descendant source and task-storage-preparation-expression-20261002 receipt                                |
| git/commitMessageFileScope.ts    | f813e660387f81f205ad6adbf925f4ec09f5c2e903aedeae768c1977311a9d2e | ca5bf8cc6396ab43992806626efb6f5700524ec9b0c0b4a36f19090e6c8a6761 | Candidate blob 69e43f4ce19a30ea185ba99ffb284ac0d798c6f8 and commit-message-scope-independent-replacement-20261001 receipt |
| creation/creationReference.ts    | 05cd4d5650393c7b3bfe605293776069b653603453fa3dd813f15bdc25cdd654 | 5a6716c314f943b7fe90e91e67c4d1a888efa28558849360114848ccd44bfb43 | Exact root containment-fix source/descendant and creation-reference-containment-20261001 receipt                          |

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

## Batch-4 integrator dependencies and remaining acceptance (historical checkpoint)

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

## Batch 5 — newly authorized complete candidates for historical gaps

The parent subsequently authorized new complete behavior-contract implementations
of task-storage startup, commit-message file scope and creation-reference reads,
after the integrator's bounded historical locating. Read the fetched integration
contract at `f969c9a7869ba33257968bcf0d15c1ffb63094bb` without merging or rebasing
this lane. Continue the same original branch and draft PR16 from checkpoint
`549b8dbc76a6e359d4b7f9da5db65a367abe4f3e`.

This explicit new route supersedes batch 4's runtime decision to leave these
three files untouched until an old canonical version appears. The historical
positive bindings, missing original receipts and source/rights uncertainty remain
as recorded above; no old accepted bytes are claimed recovered, no unavailable
private artifacts are restored and no historical evidence is rewritten. The
integrator's GitHub 404 for the exact commit-scope blob is reported locating,
not a new rights finding by this lane.

The [three-owner contract](../specs/knorvia-next-services-historical-gap-20261003.md)
precedes implementation. It keeps data schemas/migration SQL, public interfaces,
caller and UI behavior, then reconstructs the full owners with a shared lock
window/first-failure register, exact alias trie and admitted file-handle byte
reader. The creation contract follows the existing workflow requirement that
stored, referenced and read-back hashes agree, while ordinary legacy references
remain available; path containment checks complete components and captured file
identity. No cross-lane public contract changes are required.

Source-exposed authoring and whole-expression/rights acceptance are separate.
**UNVERIFIED:** all executable validation is deferred; this batch adds no tests
and runs no tests, lint, compiler, build, checker, full audit or CI rerun.

The contract was committed first as
`83ceeef11c4d4f281f28c7e26b0b1ea5b988a8ef`; the three full production owners were
then committed as `2b2e264022c7a3fa7bd8bdeda2ec8bded75c8ee2`. Their actual source
digests, Git blobs, byte sizes, historical bindings and retained collaborators are
in [source-bindings.json](evidence/backlog-services-historical-gap-20261003/source-bindings.json).
That new authoring record does not substitute any of the missing old receipts.

| Complete owner delivered in batch 5 | Implementation and compatibility boundary                                                                                                                                                                                                                      |
| ----------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Task-storage preparation            | One shared one-hour busy-only lock window; first-failure entries preserve falsy values through DB and both Repo closes. Existing SQL, migrations, snapshots, committed facts and marker ordering retained.                                                     |
| Commit-message file selection       | Pre-trimmed alias stream and exact terminal-node trie retain root/workspace/absolute aliases, three-path matching, order/duplicates/object references and empty effective alias unboundedness.                                                                 |
| Creation-reference admission/read   | Both public reads enter one captured file-handle reader with bounded chunks, canonical containment and before/after route/object observations. Stored/reference/read-back hashes must agree for workflow handoff; ordinary legacy references remain available. |

The complete-component '..' rule allows real project files beginning with '..'
while rejecting actual escapes. Initial file/size admission remains before open,
then the handle is rechecked and always released before a result. POSIX leaf
opens use O_NOFOLLOW; Windows uses the recorded realpath and device/inode
observations. This is not an atomic openat guarantee against adversarial ancestor
changes between observations. The existing job ledger continues to own recorded
output paths. No new persistence/root/public-contract authority is fabricated.

This stable source boundary adds three complete candidates to the previous four
session/task-index/protocol/startup-gate owners: seven owner candidates in this
lane, not whole-services/provider completion or expression/rights acceptance.
Creation's other retained feature owners and studio-runtime are not rewritten
again merely because their historical origin classifications are unresolved.

Current coordination needs are the integrator's exact source/expression and
rights decision for these new candidates and preserved historical bindings,
followed by the final combined consumer/platform/data-compatibility validation.
The unavailable old source/receipts remain historical evidence gaps, rather than
blocking the newly authorized runtime implementations. No new cross-module
signature/schema change is requested. **UNVERIFIED:** no executable validation or
test files were added/run; the existing final-stage suites and specified changed
file/symlink/missing-hash cases still need unified acceptance.

## Batch 6 — explicitly transferred Studio groups slice

The parent subsequently transferred only five UI files to this fixed task:
packages/ui/src/studio/groups/{useStudioGroups.ts,groupModel.ts,
groupDefinitions.ts,groupSubmission.ts} and
packages/ui/src/store/studioGroupStore.ts. The UI lane relinquished them; all
other UI sources and its lane records stay exclusive to that lane. Continue
the same branch/PR16 from `90e7d290c2deae3e0a75a73f34710d23a6daefa4`.

Fetched UI PR15 frozen head `662b64276a7271324efcbc6de36497058250d521` and read its
lane record and actual callers. All five files and the runtime-client callers
match this lane's source; no whole UI merge/rebase or ownership expansion.
The exact saved inventory rows are unreviewed/NOASSERTION with upstream=null;
there is no exact-path match/review in the read saved upstream/reviews files.
The definition-ownership spec/source commit
`530a64700d61d80715e4a120682a3942075395bc` records real new Knorvia features.
Neither missing origin evidence nor snapshot ancestry makes all five inherited
or already rights-cleared.

The [slice contract](../specs/knorvia-next-services-studio-groups-20261003.md)
precedes source. Retain groupModel, groupDefinitions and groupSubmission as
existing feature candidates: they express existing configuration/mentions,
revision-authoritative projection and stop-aware submission rules. Two actual
pending owners continue: hook reply/import acceptance across connection/unmount
boundaries, and draft-ledger/write-before-remove migration including failed
finalization retry. These are complete runtime candidates with preserved public
interfaces/codecs; retained declarations/fixed rules are not claimed newly authored.

**UNVERIFIED:** source-focused implementation only; no test/checker/build/audit/CI
rerun and no extra UI/test files. Shared/runtime/JSX changes outside the five
files, if needed, must be requested from the parent rather than made here.

The first contract commit is `23c032680125af79f428a99475a00c5858bb38b1`; preferred
source is `b72410df0826bce93945940385213ef0bab98979`, already pushed on the same
branch. Before that preferred implementation, the contract also clarified that
an explicit Host save ACK may confirm the final legacy id and finish the same
migration. Exact new/retained five-source bindings are in
[source-bindings.json](evidence/backlog-services-studio-groups-20261003/source-bindings.json).

The hook now binds a view lease to connectionKey and uses unique import flights.
Local ACK/error writes require the same current owner and open lease; effect
cleanup/replay cannot let an old finally clear a newer flight. Host command
admission/deduplication/Promise results remain with the unchanged runtime client.
The draft store now derives text projections and draft-only envelopes from one
Map ledger. Retry resumes write-before-remove finalization after either storage
failure, retaining the original legacy copy until every required confirmation and
the latest draft write succeed. Prototype-named ids remain text data. Initial
legacy draft precedence, corruption protection, revisions/overlays, selectors,
keys/envelopes and compare-before-clear behavior are kept on their contracts.

Only useStudioGroups.ts and studioGroupStore.ts production sources changed;
groupModel/groupDefinitions/groupSubmission keep their exact prior bytes as
existing feature candidates. This is two completed runtime-owner candidates,
not five new implementations or whole UI/rights acceptance. No other UI source,
JSX/CSS, service public contract, root config/CI/global licensing or UI-lane record
changed. No actual user localStorage/app/provider/DB operation was performed.

No new cross-file signature is needed. Final-stage coordination should add the
specified hook lease/late-ACK and failed-write/remove/prototype-id cases to the
UI-owned existing group-store/second-pass acceptance coverage, and check the
unchanged page/composer/runtime consumers on desktop/Web. This lane's current
allocation does not permit those extra UI test/runtime/JSX files. Source/author/
whole-expression/rights decisions for new and retained feature candidates still
belong to the integrator. **UNVERIFIED:** no executable validation ran.

## Batch 7 — final-stage services type and compatibility repair

The parent now explicitly authorizes necessary targeted type/lint/offline tests.
Fetched both original lane and integration refs, then fast-forwarded this same
branch from `dac1483b661064ba64003a1137713646d2ebbc8c` to the combined checkpoint
`19f6ccf74ba1064ca81d93194b4f25a36030e361`. The original PR16 is already merged/
closed; this batch delivers another pushed SHA without creating a new PR/task.
Earlier batches' unverified status describes their original source checkpoints.

The [bounded repair contract](../specs/knorvia-next-services-final-type-repair-20261003.md)
was written before source edits. The integrator's first-pass receipt assigned 43
distinct diagnostics across seven service files: commandFileParser (5),
gitCliHelpers (7), gitCliParsing (27), gitRepoPush (1), legacyProviderEndpoints (1),
nodeApiNetwork (1), and skillSyncDiscovery (1). They concern absent indexed values,
not a newly requested public API or data migration.

Source commit: `c448bfcb18dbe3107b97ace675701eba704c4a86`. Required metadata and
regex captures are admitted explicitly; ordered Git record iterators own rename
continuations; the untracked-file iterator admits each worker job before awaits;
byte iteration covers only the actual read slice. Existing push precedence,
endpoint URL/query data, proxy rules and skill YAML fallbacks are preserved.
No `any`, ignore directive, non-null assertion or compiler-setting relaxation was
added. These seven existing sources received compatibility repairs, not new
whole-owner authorship or rights clearance.

**Targeted verification passed:** final execution used the repository's Node
24.14.0 with TypeScript 6.0.2, oxlint 1.60.0 and tsx 4.21.0 from the frozen lockfile.
Services `tsc --noEmit --project packages/services/tsconfig.json --pretty false`
exited 0 with no diagnostics; the assigned 43 are resolved. Scoped oxlint exited 0
with 0 errors/0 warnings across the seven sources and three changed test files.
Six selected offline test files passed all 13 tests, including five new parsing
contracts, more queued files than Git workers, sole/missing/ambiguous remotes,
command write safety, provider-config compatibility and skill archive integrity.
Changed-file architecture inspection reported 0 violations/0 baseline/0 new;
services remains a legacy unmanaged module. Source diff inspection also passed.

The fresh environment lacked dependencies. Installed them with pinned pnpm
10.33.2, frozen lockfile and disabled lifecycle scripts. An initial targeted
declaration-only compiler pass prepared shared/RPC reference declarations and
checked services successfully on the environment's Node 24.19.0. The final
services noEmit/lint/tests above were then repeated on verified official Node
24.14.0 in /tmp; neither global runtime nor repository configuration changed.
Initial pnpm architecture commands stopped before their checkers at dependency
setup; the equivalent direct scoped checker/context commands subsequently ran.

Exact predecessor/new source bindings, commands, observed exits, environment,
test scope and retained logs are in
[validation.json](evidence/backlog-services-final-type-repair-20261003/validation.json).
Test files used synthetic ports or isolated temporary directories; no real Git
business command, model request, user configuration/storage or local user computer
was operated. No additional UI, shared-contract, root-config, CI, global-provenance
or license file was edited. Existing source records, notices and HOLDs remain.

No new cross-module interface dependency or local repair blocker remains for the
43 assigned errors. **UNVERIFIED:** full combined root checks, desktop/Web/mobile,
Windows and other earlier implementation acceptance have not been rerun by this
batch. The integrator must merge the pushed descendant, complete unified checks
and retain separate historical/source-expression/rights decisions before an MIT
release. Main readiness and rights acceptance are not asserted here.

## Batch 8 — two final combined-regression failures

Continue this original task/branch after fetching both refs and fast-forwarding
`33072cae538f02b739406279733127c90ec96c50` to the parent-selected combined checkpoint
`7bfb867162cc11adbc237e1c39bf2d61b5c0f81e`. Read the parent's final combined and
bootstrap receipts, both retained focused error logs and the two frozen contracts.
The [bounded fix contract](../specs/knorvia-next-services-final-failure-repair-20261003.md)
was written before source edits; no new task or PR is created.

Source/fixture commit: `0e73eb3cd6159e91be41e20d40cded0fc493ec03`.

- Claude scan failure is a stale fixture binding: assigning the retired private
  instance `getNativeProjectsRoots` cannot influence current module-local root
  discovery. The fixture now binds OS/environment home and the public data-base
  setter to its temporary root, creates the supported `.claude/projects` path,
  restores the home/environment ports and resets the temporary data-base override.
  The real scanner and all result/sort/limit/mtime/subagents/sidechain/dirty-tail
  assertions remain unchanged. No production Claude implementation was edited.
- Git timeout failure is a production compatibility deviation: detail getters
  were read before `timeoutMs ?? durationMs`. Resolve that expression first, then
  build the same details/error. Preserve separate duration reads, fallback, error
  precedence and the graph caller's unborn-stderr-before-timeout/never-stdout rule.
  The entire frozen graph contract test remains byte-for-byte unchanged.

**Targeted verification passed:** the exact two failing named source cases were
reproduced on this base (2 failed, exit 1), then the same command on the repaired
worktree passed both (2 passed, exit 0; no skips/cancellations). Node 24.14.0, tsx
4.21.0. Only these two test cases were run; no full file/suite/root regression or
types/build/audit/CI rerun. Scoped lint of the one production and one fixture file
reported 0 errors/0 warnings, and changed architecture reported 0 baseline/new
violations. Formatting touched only those two files and this batch's new spec.

The Claude assertion suffix SHA-256 remains
`ff52aad253803f8c298074525fd65c843e9eb1151e36cfbf0c043bd1524a27ef`;
the complete Git trace oracle and production native-import repository also retain
their exact combined-baseline bytes. Before/after logs, commands, source/fixture
bindings and retained-oracle digests are in
[validation.json](evidence/backlog-services-final-failures-20261003/validation.json).
The expected malformed synthetic transcript warnings are retained in the passing
log; no real user session/root/data, Git business command or model request ran.

No API/schema/UI/shared-contract/root-config/license/global-provenance change is
needed. The integrator must reconcile changed-current-source/fixture bindings and
perform the next unified regression when all lanes are received. **UNVERIFIED:**
other tests, strict historical emitted targets, Windows/native/GUI and whole-product
acceptance are not established by this two-case run. Existing golden/history/
accepted receipts, source-exposure disclosures and HOLDs remain; the new repair
is not substituted for an old accepted source. No MIT/main-readiness claim.

## Batch 9 — allocated Windows safety-fixture portability

Continue the same task and `lane/services-20261003`; fetch both refs and ordinarily
merge only the parent-selected `73e0687a78cc7354dfad0589a9e2ebedac159013`, retaining
the prior delivered `f71dae4693f7886ef1fdddef7a0e94e5c8d1f532`. Merge checkpoint:
`fba71c5486ce80b783bb54b7927eda20fc2a151d`. The original PR16 remains merged/closed;
this batch delivers its descendant SHA without creating another PR/task.

Source/fixture commit: `80b5308132b9802555114269920fa6bb5bf81bcb`.
The [bounded fixture contract](../specs/knorvia-next-services-windows-fixtures-20261003.md)
was written before edits. Read-only GitHub logs and job/step summaries confirm the
[historical Windows failure](https://github.com/accomplish07zrh-eng/knorvia-studio/actions/runs/37110107123/job/111166240728)
checked synthetic `d03df27e30768649c77d004092d7508fa8b9afbc` from trigger head
`7bfb867162cc11adbc237e1c39bf2d61b5c0f81e`; it did not contain this new batch or
the previous Claude/Git getter fixes. Those delivered files remain byte-identical.

Repair only the 12 allocated fixtures. One test-only native fake-path helper makes
seeds, ports and assertions fully qualified, including a fixed fake Windows drive.
Git's zero-line count came from a native resolved path missing the fake buffer map;
the two-line assertion remains. Runtime's empty patch came from native candidate
paths missing fake executable authority; denial and both probes remain. Skills uses
canonical discovery identity; canonicalize the temporary root before fixture seeds.
An owned alias reproduces the missing disabled key before and passes after. The
historical Windows alias spelling was not logged, so its short-name cause remains
an inference requiring true Windows confirmation. SSH retains native executable
suffixes and the existing literal `%d` text-expansion quirk. No production source,
public API, schema, user-data semantics or UI change was needed.

**Targeted checks passed on Linux/Node 24.14.0:** all 12 native cases; 11 fully
fake-IO cases with injected Node win32 path APIs; and the isolated skills alias
diagnostic. Before injection recorded 9 failures/2 passes; before alias recorded
the same missing disabled-map assertion. After runs had zero failures/skips/
cancellations. Scoped lint of 13 fixture/helper files reported 0 warnings/errors;
changed-only architecture reported 0 violations/baseline/new. All byte/count/mode/
order/scope/permission contracts remain; no new platform skip was introduced.

Exact per-file diagnoses, commands, before/after logs, timestamped raw CI failure
selections, predecessor/new file hashes and actual old CI state are in the
[batch receipt](evidence/backlog-services-windows-fixtures-20261003/README.md) and
[validation.json](evidence/backlog-services-windows-fixtures-20261003/validation.json).
No full regression, typecheck, build, audit or CI rerun occurred.

**UNVERIFIED:** actual Windows execution/acceptance of the new source and whole
product/unified acceptance. Win32 path injection leaves process.platform as Linux
and cannot verify native Windows drive cwd, executable selection, filesystem,
junction/case/permission behavior. The old Windows job still reports offline
regression failure; its passed earlier quality steps apply only to the old SHA.

No shared interface request is needed. The integrator must add the new test helper
to global provenance, reconcile changed current fixture bindings and bind a new
actual Windows checked SHA/result. Other lanes' failures remain outside this
allocation. Existing accepted/golden/history evidence, licenses, source-exposure
disclosures and session/task-index HOLD decisions remain unchanged. No MIT/main
readiness or historical emitted-target acceptance is asserted by these repairs.

## Batch 10 — stop MIT-specific work; retain confirmed Apache source facts

The same branch was fast-forwarded to main checkpoint
`59517d9699519b0a7a44980da27df29d45f0e91e`. Before the user's new instruction, the
five current owners and their available Git/spec/source history were read.
Pinned public source retrieval matched the existing saved upstream SHA-256/blob
bindings, including the renamed ZCode session/task-index paths. The retained
[bounded source facts](evidence/services-five-owner-provenance-20261003/README.md)
provide the exact paths and licence attribution; no origin/ownership acceptance
is inferred from source exposure, changed hashes or earlier CI results.

The user now explicitly keeps Apache-2.0. Stop additional MIT rewrites,
contribution-rights questions and material closure. Protect the uncommitted
reading materials and unused reader draft in the local archive named in the
receipt. No product source, root LICENSE/README/NOTICE, third-party notices,
global source register or historical HOLD/accepted record was changed.

**UNVERIFIED in this phase:** no tests, lint, typecheck, build, full audit or CI
rerun. The integrator owns the repository-wide Apache declaration and must retain
applicable third-party obligations. This MIT-specific lane work is stopped; no
new task or PR is created for the paused review.

## Batch 11 — Apache retained; bounded inherited-implementation remainder

The user clarified that continuing Apache-2.0 does not cancel removal of the
original project's inherited core implementation. Continue this original task
and branch; stop only the MIT rights/material closure. Read the five requested
current owners and the direct private preparation/ingestion/projection execution
path. Fetched main remains `59517d9699519b0a7a44980da27df29d45f0e91e`, with all
five requested source blobs identical to the reviewed branch checkpoint
`6a96f808ea3698401b87f3ac386d7e72eb08681f`.

The [minimum implementation scope](evidence/services-five-owner-provenance-20261003/residual-implementation-scope.md)
identifies actual function-body/control-template correspondence, including
conditional draft close and four task-index effect routines delegated to private
helpers. It distinguishes small retained helper expression from an inherited
whole owner and does not count matching interfaces/behavior/source exposure or
missing receipts as proof of residual code. Creation-reference receives no
manufactured rewrite assignment from the bounded origin gap.

Propose three coordinated batches: local normalization/lock driver; conditional
close/diagnostics; task-index projection effects/unread helper. Retain the new
trie, failure ownership and per-topic architecture. No public/shared API change
is requested. The report and exact correspondence bindings are the deliverable;
no production implementation is changed before integration coordinates execution.

**UNVERIFIED:** no tests, lint, typecheck, build, full audit or CI rerun. Source and
diff reading only; no root licence/global source register/third-party notice or
historical HOLD/accepted-record mutation. No new task, PR or rights-material ask.

## Batch 12 — bounded residual effects replaced; short expression retained

Continue the same task and `lane/services-20261003` under the user's new minimum
allocation and targeted-test authorization. Spec commit
`b3420a87bee9415c3b0f26aa8cfe58e0edf78de4` precedes frozen-oracle commit
`67e4ffa8fe0cc249d21c4e761e79af9455c557dd`, which precedes every production edit.

Three source commits rebuild conditional close admission/acknowledgement policy,
the four task-index projection effects and timer-driven lock acquisition:
`903d2018a479a344e231ea3cefb7a245c7a548b7`,
`53a98585d86740c375fc70c32cbb6f76ae0f3d06`, and
`c0a7d1ba24c8973fa65c95c7e03d9beb8e12123d`. Transient mutation descriptions and
pure consequence selection replace the terminal/title chains. Synchronous Repo
submission stays outside async consumption. Readback/model completion and lock
attempt scheduling follow the new behavior design. Existing topic/recovery,
trie, failure owner, UI, public contracts and persisted data schema remain.

Necessary targeted runtime comparison is now authorized: identical eight frozen
files pass before and after, 60/60 on Node v24.14.0 Linux; focused source batches
pass 20/20, 26/26 and 14/14. The earlier 59-case authoring probe is separately
retained. Full SHA/blob/hash bindings, raw logs, actual commands, source-exposure
disclosure and remaining boundaries are in the
[batch receipt](evidence/services-residual-effects-20261003/README.md).

Per the user's short-expression exception, the five-line scope normalizer,
six-field diagnostics adapter and small phase/goal unread predicate stay
byte-identical and receive no replacement credit. Do not manufacture complexity
for similarity. Creation-reference remains unchanged with no newly demonstrated
remainder. This is a bounded engineering replacement, not a legal-originality or
repository-wide independence assertion. Apache, third-party notices, historical
HOLD and earlier evidence remain; the integrator owns current source bindings
and source-evidence decisions. No shared interface request is needed.

Fetched main `0d77ee312520a7806085d448acee63f08728c214` has the same four
predecessor source blobs. Review uses a new draft PR on the continuing branch;
no merge into main. **UNVERIFIED:** typecheck, lint, root formatter check, build,
architecture checker, full regression/audit, native Windows/macOS and complete
product/source-rights acceptance. No CI rerun is requested as part of this batch.

## Batch 13 — actual Linux zombie cleanup failure

The original task/branch/PR20 continues for the UI lane's actual Host exit1.
Read PR22 `e229f601267a5a41b37d0e25391a186215cf2c46`: remaining esbuild PID17570
was state Z, PPid1; this cannot be attributed only to missing Agent artifacts.
Merge integration `e23ea3328716cbb3e5109e3f2d0082aca46de200` as baseline through
`a42727feb6cb41205eb49dd88dc20de4c86593c8`, without merging into main.

Spec/initial oracles precede production changes. Repair commit
`21bbcf1ea6fb807197914089494d366ba6c338ab` changes only snapshot, waiter and
service-local identity types: retain Linux stat state, observe it afresh, verify
ticks/PGID, complete current Z and conservatively retain inconclusive Linux
probes except ESRCH. Reparented S stays active; reused PID/changed PGID remains
outside old authority. Non-Linux probes, ownership/force scheduling and stdio's
remaining-PID exception stay unchanged. The existing waiter fixture additionally
closes proc reads for synthetic PID503 in
`8a617e31126c1292adcc15f5566eb085d7119cc4`.

The same final seven fixtures genuinely reproduce the defect before the fix
(Node-reported 20 pass/13 fail, exit1) and pass afterward (33/33, exit0), on
Node v24.14.0 Linux. Real test-owned unreaped and sleeping children distinguish
zombie-only completion from a live remaining PID; the supervisor reaps both.
PPid1/reuse/permission/platform boundaries are synthetic. Exact source/oracle
bindings, protected history, original UI input and all raw logs are in the
[cleanup receipt](evidence/services-linux-zombie-cleanup-20261003/README.md).

**UNVERIFIED:** typecheck, lint, build/root format/architecture checks, full
regression/audit, native Windows/macOS and actual full GUI/Host shutdown. No
manual CI rerun or native error downgrade. Integrator owns current source
registration and real GUI disposal reacceptance; Agent artifacts are a separate
blocker. No shared interface request, UI/data mutation or historical licence/HOLD
release; Apache and applicable third-party obligations remain.
