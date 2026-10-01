# Git read projection and Agent/Task root review

This batch follows independently verified CI221 at `68feb5a`: both platforms
completed 6,766 cases with zero failures (Linux eight skips, Windows one). The
historical CI218 auth cause remains unknown; later green runs are non-reproduction.
Root's optional built-CLI/current-schema storage acceptance is a separate receipt.

## Git read projection

Root imported immutable `46613b7`, `c1e1cc2`, `28d5e79`. The single ordered
stateless projector preserves status/branch selection, current/original rename
scope, map acquisition/defaults, conflict precedence, zero-line untracked-directory
fallback, record fields and caller scheduling. Seventeen protected AST bodies and
ten backend/declaration/generation/filter files match the frozen baseline exactly.
All four producer file hashes match. Product mutation methods were not changed.

Root passed all 494 source and 494 strict emitted focused cases: 126 Git cases and
368 earlier terminal cases. Both strict loaders and all platform selectors were
used; no source fallback was accepted. The exact pinned Git-service publisher
blob was independently retrieved and hash-matched in separate bare storage.

### Additional actual Linux Git acceptance

`scripts/acceptance/git-read-native.mjs` explicitly creates a new temporary Git
repository and empty HOME, using an allowlisted process environment and local
main/feature fixture commits. Tracking points to local main; no remote/network or
existing user repository is involved. Only setup mutates those disposable files;
all calls through the actual product Git service are read-only.

Both source and strict emitted runs pass with installed Git 2.47.3. Actual Git
commands verify staged/unstaged/untracked selection, empty-file suppression,
within-workspace renaming, cross-workspace rename-origin inclusion, branch
comparison, native diff and in-process ProxyChannel refresh. Unrelated outside
changes are excluded. HEAD, porcelain status and fixture file bytes are unchanged
after service reads. The self-created directory is removed in finally.

The first new cross-scope assertion incorrectly expected `../outside/...`. The
unchanged config contract deliberately returns repo-relative fallback for an
outside rename destination. That expectation was corrected without product edits;
the same final native probe also passed against an external immutable `46613b7`
service body, with only import routing adjusted. Initial failed logs are retained.
No original implementation was copied into new production.

This is owned Linux Git/in-process RPC acceptance, not native GUI, live remote
Host, Windows/macOS, credential handling or product Git-mutation acceptance. The
opt-in script is not discovered by ordinary offline CI and adds no regular case.

## Agent and Task

Root imported immutable `26555c5`, `5adf964`, `b651aa9`, `8c669eb`. Ordered parent,
location and trace projection retains repeated getters/undefined own fields;
one invocation owns the receiver-bound launch. Result formatting keeps inherited
prose and schema behavior. Alias factories, profile gates, declarations, permission,
approval and child-runtime ownership remain unchanged.

All 22 source and 22 strict emitted cases pass, including 512 projection
comparisons per mode. The original unmodified receipt checker passed without
`--emitted` in detached `8c669eb` (11 owned, 56 protected, 27 lint inputs and 14
allowed paths). Root separately matched all 11 owned and 11 emitted file hashes.
It did not claim the whole-worktree checker passed on root's integrated lineage:
previously reviewed ReadSessionContext/TaskOutput and shared inventory/review
changes are legitimate divergences from the lane baseline, recorded separately.
The Agent publisher blob was independently retrieved and matched to the pin.

The lane's corrected cancellation assertion is retained: actual event enums and
terminal telemetry replace an earlier ineffective nonexistent-event assertion.
Production stayed unchanged through that test correction. All ports/models/outputs
in these Agent tests are synthetic. Actual child-runtime/file/notification and
native packaged acceptance remain open.

## Gates, recovery and scope

The Git-only full run was 6,892 cases, 6,826 passed, 59 exact unchanged local
listen EPERM failures, seven skips and zero cancellation. While that run was in
progress, a desktop renderer build was SIGKILLed. No cause is asserted. The same
command then passed serially without source, budget, dependency or security edits;
both logs remain. Final combined regression: 6,914 tests, 6,848 passed,
59 exact unchanged EPERM failures, seven skips and zero cancellations. Root/CLI
types, 17 CLI builds, configured/owned lint, format, architecture and final serial
desktop build passed. A local EPERM match is not a full-green local run.

Newly structured expressions and retained declarations/prose remain source-exposed
mixed material. No whole-file original/MIT/clean-room claim is made. Shared notices
and 27 material obligations remain, B6 onward UI is still outside integration due
to the unchanged access boundary, and PR7 remains draft with no merge or deployment.
