# Allocated services Windows fixture repairs

Source commit: `80b5308132b9802555114269920fa6bb5bf81bcb` on the original
`lane/services-20261003`. Ordinary merge `fba71c5486ce80b783bb54b7927eda20fc2a151d`
retains both the prior delivered `f71dae4693f7886ef1fdddef7a0e94e5c8d1f532` and
parent-selected `73e0687a78cc7354dfad0589a9e2ebedac159013`.

The [historical Windows job](https://github.com/accomplish07zrh-eng/knorvia-studio/actions/runs/37110107123/job/111166240728)
checked synthetic `d03df27e30768649c77d004092d7508fa8b9afbc` from head
`7bfb867162cc11adbc237e1c39bf2d61b5c0f81e`. Read-only GitHub job/step snapshots still
report its offline regression failure; earlier quality steps passed on that old
checkout. They do not validate this new source. The 12 predecessor fixtures match
the historical trigger head byte-for-byte. The prior delivered Claude fixture,
Claude production repository, Git helper and frozen graph oracle retain their exact
bytes. See [source-bindings.json](source-bindings.json).

## Allocated diagnoses and changes

All entries below name `packages/services/test/` fixtures. `fakeFsPath` gives fake
ports the same fully qualified native path at seeds, inputs, keys and assertions;
on Windows its fake drive is explicitly C rather than the runner's current D.
It does not open real files. Git-relative and archive protocol names remain POSIX.

| Fixture | Observed Windows failure and repair | Preserved behavior |
| --- | --- | --- |
| atomic-write-fake-safety | Native cleanup transaction did not equal the slash-literal expected transaction. Use native target and cleanup keys. | Stale selection, retry count, injected refusal identity, original bytes and release. |
| feedback-traversal-fake-authority | Native child paths missed slash-keyed fake tree authority. Seed the tree and expected calls with native paths; retain separator boundaries. | DFS order, depth and 2,000-entry budget, no link/forbidden-child reads, archive names. |
| file-service-fake-write-safety | Created workspace path used native separators. Align data-root port, inputs and expected filesystem paths. | Invalid-name and oversize rejection, buffer copy, close count, 15-file cap. |
| git-checkpoint-helpers-fake-safety | `resolve` added the runner drive while the root-relative expected path omitted it. Use a fully qualified fake repository root. | Quoted/renamed paths, numstat, affected Git-relative paths and deletion refusal identity. |
| git-checkpoint-repo-fake-safety | Copied index paths were drive qualified but fake roots were not. Qualify repository and temporary roots. | Private index, command order, copy fallback, conflict admission, cleanup and permission failures. |
| git-cli-helpers-fake-safety | CI reported 0 added lines instead of 2. Call-chain review found native `resolve` output absent from the slash-keyed buffer map; fake open throws and the existing counter returns zero on denied reads. Align file authority with the native repository root. | The **2-line** assertion remains, as do binary/denied/close/empty counts, five unique closes, worker jobs, patches and outside-scope rejection. |
| git-cli-repo-fake-safety | Native `GIT_INDEX_FILE` differed from the slash fake temporary root. Qualify data-root and `mkdtemp` ports and expected transactions. | Exact Git argv, selected-path index isolation, denial/cleanup behavior, remote precedence and limits. |
| plugin-archive-fake-containment | Native descendants failed the slash-only lstat guard. Use native source/target authority and suffix checks; compare the unsupported-source error with its exact native path. | Header bytes, mode values, getter order, extraction order, unsafe archive strings, limits and error identity. |
| runtime-tool-fake-permission | CI reported an empty env patch. Source candidate resolution returned a native path that fake exists/access did not admit. Align both candidate and override authority. | Denied override, exactly two executable probes, bundled binary/PATH patch and unchanged input env. |
| skills-write-permission-safety | CI reported an absent disabled-map entry. Discovery/write use canonical skill paths; the fixture seeded an unresolved temporary-path spelling. Canonicalize the created root before seeding all paths. An owned Linux alias reproduces the same missing-key failure. | Existing `{ enable: false }` assertion, serialized config writes, unknown keys, collisions, link-only deletion and plugin denial. |
| ssh-alias-fake-authority | Native config paths failed slash-only authority. Use native root/includes/glob/PATH, and `ssh.exe` when actually on Windows. Keep `%d` expansion's text suffix unnormalized. | Includes/cycles, explicit Windows key bytes, query options, three workers, cloned cache, timer/kill count and native failures. |
| storage-cleaner-fake-safety | Native removal/pruning transactions differed from slash literals. Use native storage roots and expected absolute transactions. | Logical relative keys, one deletion/nine freed bytes, EOUTSIDE/EACCES and category retention. |

The exact canonical spelling used by the historical Windows skills test was not
logged. A Windows short-name/alias cause remains a source-supported inference;
the owned alias diagnostic confirms the identity mismatch without weakening the
disabled-map assertion or changing production/user configuration semantics.

## Bounded observed checks

Node 24.14.0, tsx 4.21.0, Linux x64. Only the allocated cases ran:

| Check | Before | After |
| --- | --- | --- |
| Native Linux, all 12 fixtures | Historical Windows failures retained separately | 12 passed, exit 0 |
| Injected Node win32 path APIs, 11 fake-IO fixtures | 9 failed / 2 passed, exit 1 | 11 passed, exit 0 |
| Skills with owned temporary-root alias | Missing disabled key, 1 failed, exit 1 | 1 passed, exit 0 |
| Lint of the 12 fixtures and helper | — | 0 warnings/errors, exit 0 |
| Changed-only architecture | — | 0 violations/baseline/new, exit 0 |

All after test runs had zero skips and cancellations. The two checkpoint cases
passed even in the before Linux path injection: that host does not reproduce a
Windows current drive. The before Git CLI injection stopped at scope rejection
before reaching line-count assertions. These differences are retained in raw logs.
No process.platform override was used. The injection does not execute Windows
binary selection, filesystem/junctions, drive cwd, case handling or permissions.
**UNVERIFIED: actual Windows execution and acceptance of the new source.**

[validation.json](validation.json) records exact commands, observed exits, source
bindings and limits. Original decoded CI log SHA-256 and exact timestamped failure/
checkout byte selections are in [historical-log-selection.json](historical-log-selection.json).
Raw targeted logs, runner and preloader are retained here. No full regression,
typecheck, build, audit, workflow rerun, UI or production source change occurred.

These are source-exposed fixture compatibility repairs with new source bindings.
Old golden/accepted/emitted-target evidence, third-party notices, licenses and
session/task-index rights HOLDs remain unchanged. Nothing here is an MIT clearance.
The integrator must inventory the new test helper, reconcile the 12 fixture bindings
and obtain a real Windows result bound to the new checked SHA. No shared interface
change, new task/PR or main merge is requested.
