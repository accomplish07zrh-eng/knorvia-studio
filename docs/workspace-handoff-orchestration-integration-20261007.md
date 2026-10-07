# Integration and stable release evidence

This report accompanies
`specs/knorvia-workspace-handoff-orchestration-integration-20261007.md`.
It records executed evidence separately from the planned acceptance cases.

## Current aggregate result

The first complete candidate run at `22cdb038321c07827a2bfd8a0f95e9906b9ebf1d`
exits 1: 820 files, 8,377 tests, 8,368 passed, one failed, eight skipped, zero
cancelled; 666.6 seconds. Its sole failure is the unpopulated production kernel
catalog in the combined test. This result is diagnostic and does not qualify a
release. Five actual Chromium handoff scenarios on that combined candidate pass
with zero browser errors (`/tmp/knorvia-integrated-browser/results.json`).
Handoff PR44's current head also has successful Linux and Windows CI
[37579368406](https://github.com/accomplish07zrh-eng/knorvia-studio/actions/runs/37579368406).
Orchestration PR43's reviewed `3c17d5bb` has successful platform CI
[37579685243](https://github.com/accomplish07zrh-eng/knorvia-studio/actions/runs/37579685243);
its seeded fixtures did not cover production discovery. A real native Codex
probe remains unavailable because of the pre-existing read-only home/SQLite;
no permissions or credentials were changed.

Workspace's latest `2c0711556791fdb21c102636fd348facada32a97` fixture correction
is integrated. The integration lane owns the remaining helper environment and
production catalog corrections, recorded on
[PR42](https://github.com/accomplish07zrh-eng/knorvia-studio/pull/42#issuecomment-6032297344)
and [PR43](https://github.com/accomplish07zrh-eng/knorvia-studio/pull/43#issuecomment-6032297559).
Specs and the Studio contract were updated first. No architecture baseline or
frozen evidence was refreshed.

Three new regressions first fail before correction (exit 1; three failed):
production inspection without saved local status, actual POSIX helper credential
sentinels, and Windows helper environment/cache selection. After correction,
those tests plus caller/configuration races and the combined production path
exit 0: ten passed, zero failed/cancelled/skipped. The combined path reaches
actual provider/MCP child dispatch, isolated changed-file results, durable ACK,
approved setup/service readiness, owned stop and SQLite reopen. Its fixture was
corrected to recognize Studio's existing `Task:` wrapper; the first post-fix
attempt exposed that fixture mistake (eight passed, one failed), and no product
behavior was changed to accommodate it. Logs: `/tmp/knorvia-correction-before.log`,
`/tmp/knorvia-correction-first.log`, `/tmp/knorvia-correction-second.log`.

Discovery now reuses live inspection and checks caller/configuration snapshots
after awaits, including human approval and workspace preparation. Optional Node
helper environments follow the existing process owners through proof/stop/recovery;
unspecified provider paths retain their defaults. Full regression, all mandatory
gates and final exact-source platform CI remain required before merge/publication.
Root README guidance now reflects both existing desktop platforms and workflows;
the live website is unchanged. Signing remains inactive/unsigned.

The broader corrected focused run exits 0: 79 passed, zero failed/cancelled/skipped,
covering agent ownership/provider/outbox/bridge, all workspace runtime tests and
the existing process proof/termination/default-option fixtures. Root typecheck
(5,537 locale keys), lint, provenance check, formatting, product icon verification
and CLI build each exit 0; lint retains its one existing warning and 17/17 CLI
tasks succeed. Full and changed architecture checks report zero violations.
An extra attempted `test:architecture` alias exits 254 because the repository has
no such script; both real architecture commands are rerun directly and their
actual results are retained. This missing alias is not represented as a passed test.
The new source adds no public browser methods, keeps existing state owners and
preserves unspecified process helper options. The full final offline suite and
exact-head Linux/Windows CI are the next gates.

The original independent command and helper probes are also rerun against the
corrected aggregate source: both exit 0. The workspace child and all six observed
`ps` helper invocations report all four synthetic credential/metadata keys absent.
No real credential values are used or printed. Logs:
`/tmp/knorvia-correction-command-probe.log`,
`/tmp/knorvia-correction-helper-probe.log`.

## Initial baseline (2026-10-07)

| Observation                     | Evidence                                                                                                                                                                   |
| ------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Fresh remote main               | `be610f46a7c34a500ec443cb6e335a531f12937b`; fetched main and tags, initial tree clean, freshness ahead 0 / behind 0                                                        |
| Root version                    | `0.8.8`                                                                                                                                                                    |
| Latest public stable release    | [v0.8.8](https://github.com/accomplish07zrh-eng/knorvia-studio/releases/tag/v0.8.8), published 2026-10-06, not draft or prerelease                                         |
| Peeled release tag target       | `89360e53105ce8c219d7533b08ae4f90813f4a75`                                                                                                                                 |
| Public assets                   | Nine Windows/Linux x64 packages, nine per-package checksum files, `SHA256SUMS`, `release-metadata.json`, installation guidance and three legal attachments: 24 total       |
| Metadata source binding         | Downloaded public metadata records version `0.8.8`, delivered SHA `89360e53105ce8c219d7533b08ae4f90813f4a75` and four passed platform/variant acceptance entries           |
| Public metadata checksum        | Downloaded `release-metadata.json` SHA-256 `c02a7eec8db8f466ef4061cec37b0cab49db4394875e89a04220344fe44c92a9`, matching downloaded public `SHA256SUMS`                     |
| Existing main CI                | [Run 37430642704](https://github.com/accomplish07zrh-eng/knorvia-studio/actions/runs/37430642704): Linux and Windows quality both completed successfully on exact main SHA |
| Provisional next stable version | `0.9.0`; remote tag lookup returned HTTP 404 / no ref on initial inspection. This is not a reservation; recheck before versioning/publication                              |

The initial runtime was Node 24.19.0 / pnpm 11.19.0 with no installed dependencies.
Its first architecture-command attempt did not run successfully: dependency
bootstrap could not create the default pnpm data directory. A direct check also
reported missing TypeScript. The lane installed Node 24.14.0 and pnpm 10.33.2 into
workspace-only tool/cache directories, then installed the frozen lockfile with
scripts disabled, matching the existing Linux PR quality path. No product source
or credentials were changed to resolve the tooling issue.

## Local baseline checks

Checks use the pinned tools and original product source at `be610f46`; the new
integration spec/report do not change runtime behavior. Full formatting also
covers the new prose. Logs are kept under `/tmp/knorvia-baseline-*.log` in this
persistent environment; terminal command results are recorded here when known.

| Check                                               | Exit/result                                                                                             |
| --------------------------------------------------- | ------------------------------------------------------------------------------------------------------- |
| Frozen dependency installation (`--ignore-scripts`) | 0; 34 workspace projects, 1,837 packages                                                                |
| Workspace freshness after fetch                     | 0; ahead 0 / behind 0                                                                                   |
| Initial `provenance:check`                          | 0; 16,331 files, zero review problems, 26 existing unresolved third-party material obligations reported |
| `architecture:check --changed`                      | 0; zero violations, baseline violations or new violations                                               |
| Full `architecture:check`                           | 0; zero violations, baseline violations or new violations                                               |
| `lint`                                              | 0; zero errors, one existing `no-control-regex` warning in `scripts/packaged-runtime-evidence.mjs`      |
| `fmt:check`                                         | 0; all 7,509 matched files formatted                                                                    |
| Product icon check                                  | 0; master and 35 generated assets verified                                                              |
| `build:cli-packages`                                | 0; 17/17 build tasks successful; existing dynamic-import and Turbo output warnings retained             |
| `typecheck` including i18n parity                   | 0; 5,497 matching localization keys verified                                                            |
| `test:studio`                                       | 0; 807 files, 8,315 tests: 8,307 passed, zero failed/cancelled, eight skipped; 566.2 seconds            |

Initial provenance inspection preceded the new prose files. Regeneration and
checking after the two prose additions both returned 0 (16,333 files, zero review
problems). Existing material obligations remain reported rather than being
reclassified or removed. No architecture baseline or frozen evidence was
refreshed. The final report edit is also fingerprinted before its commit.

The eight test skips are explicit baseline conditions: seven require Windows
(including five PowerShell portable-delivery cases, one bootstrap-driver case
and one Windows workspace-path alias case); one optional historical Claude leaf
differential case requires an external old-source root that is not supplied.
These skips are recorded as skips. Windows CI must provide its own real result;
Linux passing does not establish those platform-specific checks.

The initial draft is [PR #41](https://github.com/accomplish07zrh-eng/knorvia-studio/pull/41),
branch `codex/integration-release-20261007`. Its initial documentation commit was
`a0f4cf34bf77f1724c40099d794cf4b203a0fd6e`. Initial
[PR CI run 37577218779](https://github.com/accomplish07zrh-eng/knorvia-studio/actions/runs/37577218779)
reached offline regression on both Linux and Windows; its terminal result was
not yet available when this baseline report was finalized. Later documentation
commits and feature integration require checks on their actual final source;
no pending or cancelled run is represented as passed.

## Coordination and remaining gates

### Release preparation while feature lanes implement

The integration lane also added a pure version-specific release-note renderer
(`scripts/desktop-release-notes.mjs`) and connected it to the existing publisher.
Root `CHANGELOG.md` is optional for legacy checkouts; when present, its exact
version section is required and must be unique/nonempty. The new integrated
stable version will supply that changelog after all three features are reviewed.
The renderer includes a full source-commit link and retains existing package,
checksum, upgrade/data, signing-status and licensing guidance.

The new renderer and publisher tests are explicitly registered in
`scripts/test-studio.mjs`. A targeted run of the new tests plus existing channel,
manifest and immutable-release tests returned 0: 32 passed, zero failed,
cancelled or skipped. The publisher fixture uses real temporary asset hashes
and file reads with mocked Git/GitHub commands; it verifies current changes
reach the stable create command, wrong-version notes/read errors prevent all
create/upload calls, and absent legacy changelog preserves the old route. This
fixture never creates a real release or uploads an asset.

Root typecheck/i18n, lint and full/changed architecture were run after the source
addition and returned 0; the same existing lint warning remains. Final formatting
and regenerated provenance are required before pushing the preparation commit.
The earlier complete 8,315-test result is the original product baseline, not a
claim that the full suite has already run on the new preparation commit. PR CI
must execute the expanded launcher and later final feature integration.

The parent supplied the three feature lane IDs listed in the spec. No feature
PR was open on initial remote inspection. This lane owns version/changelog,
final provenance reconciliation and release workflow work. Feature-owned code
has not been edited.

Two concrete shared-interface concerns are already recorded for parent
coordination: Studio's contract has 11 methods against the 12-method limit;
conversation creation currently has a workspace path without a separate
identity field. Agree contract ownership, caller identity propagation and
shared-file writers before concurrent feature changes.

### Workspace lane review: PR #42

The parent supplied [PR #42](https://github.com/accomplish07zrh-eng/knorvia-studio/pull/42),
head `c6a8165529fa3ead5b559ab3a245cb2554c2a1df`. It was fetched into an isolated
detached review worktree; the integration branch did not absorb its code. Its
public `workspaceRuntime({runId, stepId, control?})` consumes Studio's twelfth
contract method. Further orchestration endpoints require coordinated contract
ownership rather than expanding this contract beyond policy.

Independent focused execution with pinned Node and a deliberately empty parent
environment ran six new/adjacent workspace test files: exit 0, 40 passed, zero
failed/cancelled, one existing Windows condition skipped (41 total). These tests
cover parallel lifecycle/ports, setup failure/cancel, approval/read-only/remote
refusal, readiness/cleanup, crash recovery and snapshot/apply continuity.

**Release blocker confirmed:**
[workspaceRuntimeProcess.ts at lines 53-65](https://github.com/accomplish07zrh-eng/knorvia-studio/blob/c6a8165529fa3ead5b559ab3a245cb2554c2a1df/packages/services/src/studio-runtime/adapters/workspaceRuntimeProcess.ts#L53)
copies all of `process.env` and only removes three Node/Electron keys before
launching workspace commands. This contradicts the accepted no-ambient-credential
contract, even though known credential files are filtered from snapshots.

An independent actual-adapter probe began with `env -i`, added only synthetic
credential/captured-metadata sentinels, and launched an owned Node child that
reported presence booleans to a temporary file. No real credential values were
used or printed. The child received all four sentinel keys (`GH_TOKEN`,
`OPENAI_API_KEY`, `AWS_SECRET_ACCESS_KEY`,
`KNORVIA_TOOL_ENV_PASSTHROUGH_JSON`). The assertion that none should reach the
child failed with exit 1, reproducing the defect; the owned child and temporary
files were cleaned up. Local probe/log: `/tmp/knorvia-runtime-env-review.mjs` and
`/tmp/knorvia-pr42-env-review.log`; focused results:
`/tmp/knorvia-pr42-focused.log`.

The parent must route this correction to the workspace owner: use a bounded
safe child environment, preserve required platform execution variables, exclude
ambient credentials/captured metadata, and add synthetic sentinel coverage with
Windows case variants. Update that lane's spec and rerun its checks. A successful
existing CI run cannot waive this confirmed acceptance failure. Review continues
on the corrected feature head; no merge has been performed.

### Corrected workspace and all-lane integration

Workspace head `c747a6aa188618919fa8334a932f35eed3026adf` replaces ambient
inheritance with a bounded OS environment projection, including Windows casing.
The original independent probe now exits 0: all four synthetic credential and
captured-metadata keys are absent. Four corrected lifecycle/environment test
files exit 0: 17 passed, zero failed/cancelled/skipped. Setup descendants and
service launches are covered. Recovery only inspects and cleans proved process
identities; it does not replay the setup or service command.

The expanded lifecycle audit finds a remaining environment gap in shared helpers:
POSIX `processTreeSnapshot.ts` launches `ps` without an environment; Windows
inspection and taskkill do likewise. A probe from `env -i` installs a temporary
`ps` observer that records only four synthetic presence booleans and then runs
the real `/bin/ps` with unchanged arguments/results. Actual workspace
spawn/proof/stop invokes it six times; all four keys reach each helper. The
assertion exits 1. Owned processes and temporary files are cleaned up. Probe/log:
`/tmp/knorvia-runtime-helper-env-review.mjs` and
`/tmp/knorvia-runtime-helper-env-review.log`. This remaining workspace blocker is
recorded on [PR42](https://github.com/accomplish07zrh-eng/knorvia-studio/pull/42#issuecomment-6032181214).
The selected environment must follow inspection, verification, group snapshots
and termination during normal cleanup and recovery, without global environment
mutation or unrelated provider behavior changes.

[PR #43](https://github.com/accomplish07zrh-eng/knorvia-studio/pull/43), initial
head `01fc62aa54c2cd4636a3eda6d0e1a2d7e4e7aff2`, independently passes its three
agent-focused files (15 tests) and five adjacent provider/native/recovery/shared
capability files (45 tests), all exit 0 with no skips. Its Node bridge explicitly
sets Electron Node mode. Follow-up `3c17d5bb772d971e24f4640b3a456df1698b207d`
adds provider injection coverage and explicit unsupported-provider notices.

[PR #44](https://github.com/accomplish07zrh-eng/knorvia-studio/pull/44), head
`3fa497e939f0752b0a45b8d0be7c30457b974b8d`, independently passes 24 focused
handoff/schema tests and five Chromium scenarios with no browser errors. The
browser checks reload, redaction, cancellation, stale references, repeat confirm,
fixed native/external retry IDs, late results and desktop button reachability.
Fourteen adjacent store/native-source tests also pass; the native V4 transport
test initially fails because the direct command omitted the launcher's required
`TSX_TSCONFIG_PATH`, then exits 0 (one test) with the existing UI alias config.
Evidence is in `/tmp/knorvia-pr44-browser/results.json` and the review logs.

All three feature heads are combined locally on the integration branch, with
additive Studio dependency/constructor/type-export conflict resolution and a
fresh combined provenance inventory. First integrated root typecheck (5,537
matching locale keys) and full/changed architecture checks exit 0. Main remains
unchanged. Feature checks and final source checks are still required.

**Second release blocker confirmed:** Agent kernel discovery reads persisted
`kernel-status` entries in `app/agentDispatch.ts`, but production
`inspectStudioKernels` only persists remote entries. The lane fixtures directly
seed local entries, concealing the empty production catalog. An independent
SQLite/active-caller probe removes the fixture-only row, invokes the actual
service inspection route returning an installed/configured kernel, and receives
an empty agent catalog. Its assertion exits 1. Local probe/log:
`/tmp/knorvia-agent-catalog-review.mjs`, `/tmp/knorvia-pr43-catalog-review.log`.
The parent must route the correction to the orchestration owner and verify
discovery through the existing owner without fixture-only status rows.
The review is also recorded on [PR43](https://github.com/accomplish07zrh-eng/knorvia-studio/pull/43#issuecomment-6032157352).

The new integration scenario enters through `createStudioRuntimeService` and
the actual external handoff create/send route. Its synthetic executable receives
the real Codex thread MCP configuration and uses a real stdio child to call the
Host. Without seeded local status it currently reproduces the same defect:
parent result is failed with “Production discovery did not expose the configured
kernel”; exit 1. It will continue through deduplicated dispatch, real snapshot
output, explicit setup/service approval, safe child environments, loopback
readiness/owned cleanup and a reopened durable ACK after the correction. This
expected current failure is a release blocker, not a waived check. The fixture
does not use real accounts or make model requests.

Final integration review/tests, exact-head CI, merged source/version and stable
publication remain pending. No release/tag, mobile change, signing setup or live
website deployment has occurred.

### Stable-version preparation

Remote tag lookup again finds no `v0.9.0`, and the public latest stable release
remains `v0.8.8`. Root version `0.9.0`, a version-specific `CHANGELOG.md` and
matching installation filenames are prepared for this integrated feature release.
This is still an unpublished candidate and not a tag reservation. Independent
CLI package versions and historical evidence are unchanged.

The version edit makes the third-party audit's package input hash stale. A
reviewed assertion verifies `package.json` differs only in its version, then
rebinds only that input's normalized hash in `third-party/inventory.json`.
Dependency declarations, all notice bytes and the existing material obligations
remain unchanged; provenance is regenerated against the reviewed tree. The
architecture baseline and frozen evidence are not updated.

The combined CLI build exits 0 (17/17 tasks), and all 32 targeted release tests
again pass with zero skips. Full final source checks remain pending on correction
of the production catalog defect and lifecycle helper environment gap. A targeted
upgrade/runtime/profile/recovery run exits 0: 26 passed, zero failed/cancelled,
five Windows-only portable delivery conditions skipped (31 tests total). This
does not replace the final Windows CI or full suite.

No installed human GUI, real model-task, signing or full legacy-user migration
acceptance is claimed by this baseline investigation.
