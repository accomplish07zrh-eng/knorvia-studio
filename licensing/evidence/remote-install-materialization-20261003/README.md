# Remote installer, preflight and bundle-check owners

Draft PR: https://github.com/accomplish07zrh-eng/knorvia-studio/pull/9
Branch recovery/server-lifecycle-20261002; target recovery/independent-logging-20260930-0456.
Captured source baseline 57e5bfe4d833791f233a05fc5af139327860d86d.
The runtime/wrapper batch was committed independently while authoring; these
three baseline owner files remained unchanged.

Scope: remoteAssetInstaller.ts, remoteAssetPreflight.ts, serverBundleDeployCheck.ts.
Packet: specs/knorvia-remote-install-materialization-20261003.md.

## Fresh-author and source-exposed curator limits

Curator read the three complete baseline owner implementations and searched
direct consumers. Public cache/CDN/network/archiver/deployment API declarations
and surrounding implementation context were also read to describe required
ports. Curator is explicitly source-exposed; protected helper reads are not a
no-source-access claim. Those helpers were not edited. Exact generated shell
output templates, command/error strings and ordering contracts were included
in the packet for compatibility; existing TypeScript implementation was not
supplied as author input. Such source-derived packet provenance remains for
parent review, not a licence grant or independent classification here.

Fresh author /root/install_materialization_author: fork_turns none, GPT-6.1 Sol
high, no inherited conversation. Intended inputs only the functional/API
packet, root AGENTS.md and architecture-governance SKILL.md plus bounded port
clarifications. Complete temporary outputs; curator compatibility review then
repository formatting only. Shared filesystem exclusion is declared, not
OS-enforced. No novelty requirement or diff-size provenance inference.

## State/material ownership and frozen boundaries

Local installer owns local path resolution and unique owner staging; remote
installer owns pinned manifest and normal/force component tasks. Module manifest
flight map shares concurrent requests until settlement. Cache/CDN/network and
executable replacement remain delegated existing ports. No dependency/security
policy changes. Abort gates stop late remote staging while shared local work
can finish; aborted paths avoid old-backend cleanup. Existing cache/SHA paths,
24-hour staging janitor, lock heartbeat/stale threshold, material replacement
and required-path/force behavior remain contract requirements. Preflight retains
50ms trailing stdout drain; bundle checker retains exact required marker script
and stderr prefix cap/failure conversion. No new fallback or cleanup policy.

Existing oddities are preserved rather than newly claimed fixed: local archive
creation before cleanup try/finally; required-path assurance rejection may escape
task eviction, existing/forced maps do not become a second material owner;
new-download missing-path checks do not automatically reject; remote file replace
has no added cleanup trap; manifest single-flight key omits network identity;
close collectors retain listeners and one stderr chunk can exceed the prefix cap.

## Validation limits

Latest user cadence skips ordinary runtime tests, semantic typechecks and builds.
No real backend/deployment/network/credentials/process/SSH/Docker/WSL operations
or shell execution. Native checksum/download/tar/lock/progress behavior, manifest
concurrency/cache/force/error matrix, complete permission ordering and aggregate
acceptance are deferred. At most one injected safety check may be justified by
an observed concrete candidate write/permission risk. Exact checks and author
access declaration will be recorded after delivery.

Protected cache/CDN/network, global provenance/inventory/root LICENSE and
dependency manifests remain untouched. No main/cross-lane merge, Library access
or cancelled-upload retry. Baseline freshness ahead208/behind0 origin/main;
helper reports no tracking branch. Architecture unmanaged server owner, no
contract; baseline architecture OK, 0 violations/baseline/new.

## Author access and curator correction record

Author declared exactly the three authorized document reads, creating/writing
only own temporary files and hashing their bytes. No implementation/test/
dependency/history/other-author reads, repository edits, generated-shell execution
or runtime validation. Bounded API clarifications confirmed exported backend
StdioStream/deployment types and full missing-path diagnostics.

Curator static review found requested id instead of selected canonical component
id and non-Unicode path replacement in the initial candidate. This is a concrete
material source-path difference; no initial candidate runtime failure was run.
Author corrected canonical/live material ids and Unicode segments, single-signal
capture, directory required-path argument/iteration ordering, command quoting
phases and Unicode progress matching from bounded descriptions. No inherited
source snippets were supplied. Curator owns safety test/spec/evidence; production
source changes after delivered author output are repository formatting only.

One injected canonical-path safety check passes on the unchanged baseline. The
remote installer is instantiated with a synthetic pinned manifest and fake cached
exists/exec ports; all package imports are virtual and non-cache-hit operations
throw. It checks canonical component directory, Unicode platform normalization
and installation copy source remain paired. JSON text quoting is a fake port,
not native shell quoting validation. Standard crypto supplies harmless staging
UUIDs; no real credentials/data/remote material is used. In-memory esbuild
transformation for the check is not a package build.

A final bounded clarification retains the preflight private async collector
and its outer Promise adoption timing; no broader runtime check was added.

## Focused check results

Baseline and corrected candidate each passed the single synthetic cached-path
safety test (1 passed, 0 failed). Raw baseline/candidate outputs are retained.
Syntax-only TypeScript diagnostics: 0 in each of the three owners; no semantic
check. Architecture: OK, 0 violations/baseline/new. Diff whitespace clear.

Initial scoped lint covered all three owners and the safety test; 0 warnings,
1 error: installer exceeded 400-line limit (742 effective lines). Raw failure is
initial-changed-lint.txt. The baseline already exempts this same complete owner
from max-lines. Author retains a narrowly scoped equivalent file-local comment;
no lint configuration/policy or runtime code changes. Only the installer needs
lint recheck; the other three files had no initial diagnostics. Safety/syntax/
architecture were completed before this comment-only correction and are not
repeated. Full runtime behavior remains deferred.

Final installer-only lint: 0 warnings/errors. All changed files are clear
after the author comment correction. Production diff (added/removed):

```text
467	773	packages/server/src/remote/remoteAssetInstaller.ts
52	90	packages/server/src/remote/remoteAssetPreflight.ts
18	33	packages/server/src/remote/serverBundleDeployCheck.ts
```
