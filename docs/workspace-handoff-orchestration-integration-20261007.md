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
| `test:studio`                                       | Running; launcher discovered 807 offline test files                                                     |

Initial provenance inspection preceded the new prose files. Regeneration and
checking after the two prose additions both returned 0 (16,333 files, zero review
problems). Existing material obligations remain reported rather than being
reclassified or removed. No architecture baseline or frozen evidence was
refreshed. The final report edit is also fingerprinted before its commit.

## Coordination and remaining gates

The parent supplied the three feature lane IDs listed in the spec. No feature
PR was open on initial remote inspection. This lane owns version/changelog,
final provenance reconciliation and release workflow work. Feature-owned code
has not been edited.

Two concrete shared-interface concerns are already recorded for parent
coordination: Studio's contract has 11 methods against the 12-method limit;
conversation creation currently has a workspace path without a separate
identity field. Agree contract ownership, caller identity propagation and
shared-file writers before concurrent feature changes.

Next required input is the three feature PRs and their finalized public
interfaces. All cross-feature tests, integration review, exact-head CI, merged
source/version and new stable publication remain pending. No new release/tag,
mobile change, signing setup or live website deployment has occurred.

No installed human GUI, real model-task, signing or full legacy-user migration
acceptance is claimed by this baseline investigation.
