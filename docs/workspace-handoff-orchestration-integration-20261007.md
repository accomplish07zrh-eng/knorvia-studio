# Integration and stable release evidence

This report accompanies
`specs/knorvia-workspace-handoff-orchestration-integration-20261007.md`.
It records executed evidence separately from the planned acceptance cases.

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

Remaining dependencies are the corrected workspace PR and the handoff and
orchestration PRs with finalized public interfaces. Cross-feature tests, final
integration review, exact-head CI, merged source/version and new stable
publication remain pending. No new release/tag, mobile change, signing setup or
live website deployment has occurred.

No installed human GUI, real model-task, signing or full legacy-user migration
acceptance is claimed by this baseline investigation.
