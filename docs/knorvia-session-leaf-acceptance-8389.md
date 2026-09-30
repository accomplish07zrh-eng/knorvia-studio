# Session leaf batch 8389: acceptance and transfer

2026-09-30. Dedicated branch: `cloud/services-leaf-compat-20260930-8389`. Exact base: `8e8f6310d5ca70a57a454054e44f7b61db30b83f`, fetched after confirming both PR 7 and `recovery/independent-logging-20260930-0456` pointed to it. The integration worktree and branch were not edited.

## Scope and result

The three production files are `packages/services/src/session/sessionTitle.ts`, `taskChangeSummary.ts` and `mcpWorkspaceScope.ts`. Supporting files are [the frozen specification](../specs/knorvia-session-leaf-contract-8389.md), `packages/services/test/session-leaf-contract-8389.test.ts` and this report. No additional production path is owned by this batch.

The file summary now uses one private, invocation-local accumulator for both task and per-turn projections. MCP expansion uses a lazy copied array and retains unaffected server identities. Title generation retains prompt precedence and UTF-16 truncation. Public signatures, shared dependencies, serialized field order, local scope eligibility and lifecycle ownership remain unchanged. No persistent data, production migration, CreationService, workflow, protocol, UI, Desktop, CLI adapter, package configuration, lockfile or provenance ledger was edited.

All three production files were already identified as `upstream-modified` without an accepted provenance review. They were selected for that concrete evidence, rather than assuming all unreviewed Knorvia code requires replacement. The author inspected their existing source and callers. There was no separate author or source-independent specification. This batch is a source-exposed behavioral reimplementation and does **not** establish clean-room authorship, independent-replacement licensing eligibility, MIT eligibility or application-wide completion. Production files explicitly retain Apache-2.0; original Git objects and the existing licensing baseline remain evidence. The short title routine in particular cannot establish independence through its small textual change.

## Contract-first evidence and review

Commit `8c412427e4f53d335301b326c21e27309b28da76` saved the original specification and nine contract fixtures before any production change. All nine passed against the untouched base. The fixtures contain manually stated expected results rather than reproducing the candidate algorithm.

Self-review of the isolated diff added three negative cases: a sparse attachment list must return the empty title, the first write count must preserve negative zero, and a sparse MCP server list must retain holes. The expanded 12-case suite passed against the exact base extracted into a disposable directory before corrections. The initial candidate then failed those three cases (9 pass / 3 fail): it returned ` +1`, converted `-0` to `+0`, and threw on a missing server slot. Corrections preserve all three base behaviors. The final suite passes against both source and emitted JavaScript.

Review also checked repeated turn IDs, array visitation order versus turn chronology, reverted groups, exact path keys, first-before/last-after endpoints, zero-diff writes, JSON property order, input immutability, MCP field/reference preservation, package substring matching, existence-only file eligibility, trailing separators, idempotence and native TypeError behavior. Only the existing public shared line-diff implementation supplies line statistics; it was not replaced. No new shared state, alternate persistence path, runtime fallback or dependency edge was introduced. Production source is reduced by 85 lines overall; that is a size observation, not a completion measure.

## Executed verification

| Gate                                                    | Actual result                                                   |
| ------------------------------------------------------- | --------------------------------------------------------------- |
| Workspace freshness                                     | Pass; exact PR head used, base ahead of main by 10, behind by 0 |
| Initial frozen contract / original source               | 9/9 pass                                                        |
| Expanded contract / original source                     | 12/12 pass                                                      |
| Expanded contract / initial candidate                   | 9 pass, 3 fail; retained as review evidence above               |
| Final source contract                                   | 12/12 pass                                                      |
| Emitted `packages/services/dist/session/*.js` contract  | 12/12 pass                                                      |
| Contract plus existing shared test files                | 37/37 pass                                                      |
| `tsc -b packages/rpc packages/shared packages/services` | Pass                                                            |
| Required root `pnpm typecheck`                          | Pass, including 5,422 matching i18n keys                        |
| Required root `pnpm lint`                               | Pass, zero warnings/errors                                      |
| Changed architecture, before and after                  | Pass, zero baseline/new violations                              |
| Focused formatting and `git diff --check`               | Pass                                                            |

The first bare pnpm invocation used the environment's pnpm 11 and tried to write an unavailable user data directory. Verification then used pinned pnpm 10.33.2 via Corepack, with task-local cache/store directories under `/tmp` and `install --frozen-lockfile --ignore-scripts`. No manifest or lockfile change was needed. The available Node is 24.19.0; `mise.toml` pins 24.14.0. The initial temporary original-source harness lacked ESM metadata and package-local workspace links and failed to resolve `@knorvia/shared`; copying the base manifests and linking installed dependencies fixed the harness, without editing product source. An intermediate lint run found two sparse-array construction warnings; the fixtures were rewritten to set array length explicitly and final lint is clean.

Native Windows/macOS execution, actual MCP server/model calls, interactive UI checks and full studio/CLI build regression were not run. Windows case folding is a restored platform-property probe on Linux, not a claim of native Windows validation. The parent integrator owns full CI and final compatibility review. Existing shared tests were run as a nearby regression check; no standalone shared line-diff test file existed in this checkout.

Raw synthetic-fixture logs are retained in this execution environment under `/tmp/knorvia-leaf-{base,base-expanded,review-failure-expanded,final-source,final-dist,focused-final}-8389.tap` and `/tmp/knorvia-leaf-{typecheck-final,lint-final}-8389.log`. These local logs are supplementary; the committed fixtures, base SHA, failure observations and digests below provide reproducible transfer evidence.

The read-only `pnpm provenance:check` failed with "Provenance inventory is stale; review changed files and regenerate it". The parent must reconcile the inventory after review; this worker deliberately left the shared ledger unchanged. Its check log is `/tmp/knorvia-leaf-provenance-check-8389.log`.

## Precise proposed inventory actions (not applied)

The production source remains under Apache-2.0. Do not add `independent-replacement` / MIT decisions for these files on the strength of this batch. Regenerate the derived current-file report only after parent review, retaining upstream relations and default licensing; source exposure remains unresolved provenance evidence. The following normalized SHA-256 values bind this report to its production bytes:

| Path under `packages/services/src/session/` | Original digest at base                                            | Final digest                                                       |
| ------------------------------------------- | ------------------------------------------------------------------ | ------------------------------------------------------------------ |
| `sessionTitle.ts`                           | `884bd885b18b1dd035c93d278529078bfd151cd87f1b9c36a42ee462cdbeabf7` | `1e9b9641da8675c9430bb6bc912fc2e78a166ae4f531fabb7c9880587493da4b` |
| `taskChangeSummary.ts`                      | `968bfe5c4a40620e9402bb54ee2e6313ca67e079f1e15d8ce55209bcf91ff9d2` | `55ea43a8b3b3f3ef359291cbf39380e58f7260f1d6d587ed05932e9693a9cdfb` |
| `mcpWorkspaceScope.ts`                      | `f3507b9e66910c5fbdb3e5854334428d40d501941c9dac3e0ce8339a5e5d5fce` | `5858f27ae656f010b6b6df5c9a8e8d5c3d6e3920eaa54b0cefd2599056c7f67a` |

The newly authored test carries its own MIT notice. Proposed review, subject to the parent's source audit: path `packages/services/test/session-leaf-contract-8389.test.ts`, digest `aaa8fa6bdad396aaaff104c9cab16ae7aa9eec5156c8261c375ddd7f4064950e`, decision `original`, license `MIT`, evidence this report plus the specification, basis "new contract-fixture expression authored for this batch; expected results observed from the existing public behavior, prior source exposure disclosed; not a production-code licensing decision". The new specification digest is `dbc87022aeb7ce43626e6309a463450b5f7c6a77bc6aff1c3c9476d35a73b7a5`; it and this report retain the repository default license pending their separate review. No provenance coverage total is claimed.

## Transfer

The parent should fetch only `cloud/services-leaf-compat-20260930-8389`, inspect its diff against the exact base, then cherry-pick the contract commit followed by the branch-tip implementation/acceptance commit. The final response supplies both exact commit SHAs. No duplicate PR was opened; no merge, force push, deployment, credential change or release was requested or performed.

Reproduction in the integration checkout: `node --import tsx --test packages/services/test/session-leaf-contract-8389.test.ts packages/shared/test/*.test.ts`, `pnpm typecheck`, `pnpm lint`, `pnpm architecture:check --changed`, and focused `oxfmt --check` on the six owned files. The emitted-JavaScript run used the same test with only its three source import URLs replaced by the freshly built `packages/services/dist/session/` URLs in a disposable harness; expected fixtures were unchanged.

No supported task-level Fast/service-tier control was exposed by the available tools. Fast was neither verified nor changed, and no global or safety setting was modified. Work was saved on this dedicated branch for the parent to coordinate continuation.
