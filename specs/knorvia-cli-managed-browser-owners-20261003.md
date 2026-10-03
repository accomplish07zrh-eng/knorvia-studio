# CLI managed browser lifecycle, session and command candidates

Continue branch `recovery/server-lifecycle-20261002` and draft PR #9 from `9b6b31a525cae783ffb1a0eb709f23e5ba5a9e57`. This specification was saved before authoring; the verification outcome below was added after scoped checks.

Screen 243 adapter source files outside model by current hashes and existing receipts. Retain 181 exact accepted-review matches, protect 11 other-lane files, retain two constrained browser contracts/adapters, and select only these substantive unreviewed owners:

- `apps/cli/packages/adapters/src/browser/index.ts`
- `apps/cli/packages/adapters/src/browser/session.ts`
- `apps/cli/packages/adapters/src/browser/page-command.ts`

Diagnostic unchanged-file receipts do not establish independent acceptance. Leave the other 46 unreviewed files unresolved pending separate receipt/owner screening. Storage/persistence, mailbox/workflow runtime, core context, services, UI/desktop and accepted model scopes remain excluded.

Browser runtime owns browser identity/generation, concurrent launch, per-session context admission and pending request cancellation. Preserve late launch/context disposal, exact error/privacy boundaries, generation mismatch before dispatch, cancellation uncertainty only after side-effecting dispatch, bounded cleanup and command/meta ordering. Session alone owns page identity while registered, active tab, close/dialog events and tab summaries. Page owner preserves the URL gate, command vocabulary, keyboard/mouse cleanup/error order, ref preference/stale errors, CDP history/detach, public snapshot/Playwright delegation and timeout options. Preserve argument freshness and exact observable getter/port call order. No new policy, permissions, actual browser launch, filesystem/executable probe, auth, environment or network action.

```text
list/execute → browser owner → shared launch → generation/connected browser
execute → pending signal → session admission → tab/dialog/page dispatch → metadata
session events → tab owner → registered identity/active fallback/dialog ownership
page command → URL/ref/coordinate gates → virtual page/keyboard/mouse/CDP ports
turn/session close → matching aborts → bounded context close → owned browser close
late launch/context → stale/disposed admission denial → bounded owned cleanup
```

Use three fresh Sol/high fork-none authors with external behavior/public dependency contracts only. Omit predecessor private helper names/state/decomposition and substantive bodies; authors choose coherent implementations. Public API/protocol values and retained expression facts stay explicit. Freeze/hash whole drafts and corrections before source-exposed review; install whole with formatting only and bind separately formatted frozen bytes. Fresh authors/shared filesystem/curator contracts do not establish independent provenance. No novelty requirement or new licence acceptance.

Minimum synthetic checks cover stale generation/privacy, late context cleanup/cancellation uncertainty, page identity after ownership removal, dialog/active state and rejected-close order, blocked navigation/ref priority/modifier cleanup, CDP detach/state assembly order, viewport routing, fresh context argument objects, dialog reads and connected-cache abort behavior. Ports are virtual, with synthetic data only. Preserve every failed stdout/stderr/exitCode record and rerun only affected owners. Scoped lint/syntax/AST API/static/format/architecture/whitespace checks accompany the candidates; ordinary suites, semantic project types, builds and native/cross-lane integration remain deferred.

Outcome: initial baseline 3/3 and three added baseline cases pass; first candidates 3/6 pass. Whole corrections make tab 2/2 and page 2/2 pass. Runtime correction 1 passes 2/2 but fails an added cached-browser abort case that passes baseline; correction 2 passes all three affected runtime cases. Seven final focused cases pass across these affected-only runs. Public declarations/reexports and structural return DTOs match; final scoped checks pass. CLI is existing unmanaged module, architecture baseline/new 0/0. Exact failure records and access/normalization limits are in `licensing/evidence/cli-managed-browser-owners-20261003/`. All three candidates have zero accepted independence/MIT credit pending parent classification. Same PR/branch; no main/cross-lane integration, global licence/inventory/review/manifest changes, Library alternate access or cancelled upload retry.
