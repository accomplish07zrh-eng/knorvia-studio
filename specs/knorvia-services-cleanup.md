# Knorvia service boundary cleanup

This change starts from the fresh upstream checkout and removes upstream product accounts from the existing service architecture. It does not restore any discarded collaboration implementation.

## Behavior and ownership

- Host retains the existing local settings, generic credential store, personal provider configuration, task/session runtime and third-party MCP authorization.
- Product OAuth, account token exchange/refresh/restoration, automatic account API-key resolution, subscriptions/payments, remote product configuration and account feedback services are deleted, including descriptors, registrations and public exports.
- API requests preserve the explicitly requested URL and caller headers. No product endpoint rewriting, product identity headers or automatic account logout observer remains in the generic HTTP client.
- Model configuration reads bundled local definitions and the Knorvia-owned personal configuration. It does not import old ZCode account/provider files or refresh definitions from the upstream product service.
- App usage remains a local agent-statistics read. Cloud plan usage, plan reset and subscription quotas are removed.
- Cloud product-only features that require the deleted identity (off-peak admission, cloud publishing and official account MCP credentials) are not registered. General remote workspaces, local file transfer, third-party MCP and explicit API model access remain.

## State and event order

```text
original GUI -> Host service contract -> local configuration owner
                                      -> personal provider file -> provider registry event
                                      -> agent session/runtime
```

No fake signed-in state, account stub or silent API-key provisioning is introduced. A missing manual API credential remains an actionable provider configuration error. API errors remain provider errors and cannot trigger product login or token mutation.

Desktop and remote Host share the same account-free registrations. Remote transport permission boundaries remain; removing product account synchronization does not disable SSH authentication or MCP OAuth.

## Validation

- Typecheck the affected packages and run root typecheck/lint/architecture checks; report cross-worktree integration errors separately.
- Test generic HTTP request preservation, no product authorization side effects and local usage forwarding.
- Source audit ensures no registered OAuth/subscription/feedback/config/account-provisioning implementation remains.
- Root agent validates final integrated original GUI, independent profile and portable artifact.

### Verified in the isolated service worktree

- Services project TypeScript build passes.
- All 16 service tests pass, including real service construction with account channels absent, manual provider creation, zero upstream fetches during provider startup/refresh, request/header preservation and portable settings isolation.
- Architecture check reports zero violations. Root lint has zero errors; remaining warnings predate this scope.
- Full-root typecheck needs the separate client, UI and desktop changes to remove consumers of the deleted service descriptors. Those integration dependencies are reported to the root agent; the deleted services are not replaced by authentication stubs to make old consumers compile.

## Original automation UI cleanup

- Retain the existing automation page, local scheduled-task list, manual/chat creation, editor, history, status filters, enable/pause/restart/delete commands and original design tokens.
- Remove the account-dependent off-peak cloud task UI, polling, eligibility state, purchasing prompts and upstream Client Scenes recommendation/template loaders. Do not provide an empty mock service or fake queue.
- `automationManagementStore` remains the single owner of accepted local automation state. Page state remains only the existing local editor/navigation/filter state. No new service or workflow surface is introduced.
- Navigation to unavailable old cloud records resolves through the existing missing-target state; it cannot poll or create a cloud task. Scheduled-task initialization, refresh and mutation still use the existing `agentService`.

```text
automation page -> existing management store -> existing agent service -> local task runtime
               -> local draft / existing editor
```

- Validate parsing/types and lint in the bounded files; root integration validates original GUI rendering and the remaining App/draft-suggestion imports after other agents merge. No GUI process is started from this isolated worktree.

Validation: the remaining automation page has no TypeScript diagnostics and targeted lint has zero warnings/errors. Root lint completes with 62 existing warnings and zero errors; architecture and `git diff --check` pass. Whole-UI typecheck remains blocked by the separately owned account/feedback/share consumers, plus the announced App and draft-suggestion imports. GUI E2E is deferred to the integrated root checkout.

## Product storage isolation

- Service-owned skills, commands, hooks, agents, plugins, model traces, logs, bundled-runtime lookup, scratch workspaces and import/Git temporary directories use the selected Knorvia data root. No implicit read or import of the old product's home directory is allowed.
- Project-private configuration uses `.knorvia-studio`, matching the bundled agent. Explicit generic home paths and `.agents`, `.claude` and `.ssh` compatibility retain their original meaning.
- `paths.ts` remains the desktop owner's single authority for selected service data paths. The shared Node-only resolver is used where a caller explicitly passes an environment. No service mutates OS HOME/USERPROFILE.
- Portable mode retains private storage within its selected data directory even if an old persisted storage override exists. The storage-management scanner inspects only the selected profile rather than also scanning an unrelated home profile.
- Validate sources for legacy home fallbacks, run the services TypeScript build and the relevant service/isolation checks. Desktop-owned `paths.ts` and shared resolver changes are integrated by the root agent.

Verified: services TypeScript build and all 19 service tests pass; the three new storage checks cover selected-profile scans, real filesystem CUA configuration isolation and ignored legacy subagent storage overrides. Architecture reports zero violations. Source scanning found no executable `.knorvia` home fallback outside the separately owned `paths.ts`; remaining comments and product filename renaming are integrated by the root agent.
