# Superseded intermediate exact-source package acceptance

This is a **fresh intermediate build** of exact input
`ad712690b3eb1501574c1d29361dc801c1414373`, tree
`860e3c49276ea4dbd5a18b7d27c441638f368a4c`. It does not reuse the earlier ede838
payload/results. The parent subsequently replaced final input with902e35c6 and
required Chrome fixture repair before the next final refresh. None of these passes
is reassigned to that new source or called final acceptance.

Official sequential runtime preparation, production Desktop build and configured
AppImage-only packaging passed with Node24.14.0/pnpm10.33.2/Electron41.0.3.
The exact metadata commit is ad712690. New linux-unpacked and extracted image
executable/ASAR/CLI/PTY digests match; CLI matches the freshly staged Desktop bundle.
The canonical beforePack/afterPack hooks restored pinned PTY, injected22 missing
runtime modules, removed sourcemaps and checked native layout. Dependency lifecycle
scripts were skipped by the frozen install; actual packaged PTY was executed.
Remote assets and .deb/.rpm/.pacman were not built; public maintainer email remains
pending and no metadata was invented. No release was published.

| Fresh artifact | Bytes | SHA256 |
| --- | ---: | --- |
| Linux AppImage | 188670928 | `4df48b20614ad7b77d0e1bece39e80d246ed6da9cd3309d54807a760342a5d43` |
| CLI/TUI/Web archive | 89996347 | `b822a4bcda4fa72303e571a4b1275180eb06676b931375b6fe3d19042bd680f9` |

The extracted physical Desktop artifact passed all six unchanged native probe
groups: package identity/native policy; required runtime entries; CLI0.16.9 in
Electron Node; real PTY and SQLite sentinel; two normal storage handshakes preserving
that row; rg/ugrep/bfs on Unicode/spaced paths with notices/source records present.
The unchanged probe/child sources remain in `../native-packaged-acceptance-20261003/`
and their hashes are bound in `source-input.json`. This is bounded extraction/native
acceptance, not OS installation, GUI/model or full legacy-data migration.

The full standalone source build now succeeds with the CLI CUA collector repair:
the archive contains the real root JS exports and retains TUI/Web. However, the
**original unchanged distribution-smoke fails, exit1**, while importing runTui:
`Dynamic require of "process" is not supported` in bundled YAML. Real TUI rendering,
keyboard exit and its subsequent Web block were not reached. Failure log and exact
artifact excerpts remain; no import shim or weaker assertion was used. CLI must
repair its ESM build/runtime and the next unified archive must rerun this smoke.

The generated install.sh separately passed actual loopback downloads and isolated
same-version installation twice, exact installed byte checks, current symlink,
executable version/help and synthetic profile sentinel retention. A second extended
probe verified the installed Web launcher: HTML200, server-info/exact workspace,
artifact-resolved WebSocket open/close, SIGTERM launcher exit0 with no forced cleanup.
Initial and extended scripts/results are both preserved. External probe comparisons
match sha256.txt/latest metadata; the existing installer itself does not validate
that checksum. Installed launcher exit0 does not establish Desktop Host/Agent
child-tree graceful disposal. Zombie cleanup requires a new-source combination run.

Fixtures were removed; commands used explicit synthetic data/install paths and
credential-free runtime environments. No real user data, browser GUI, model,
Windows/macOS or user computer was operated. The raw extraction listing is retained
as `appimage-extraction.log`; large build products remain under the task-owned
`/tmp/knorvia-native-retest-ad712690-20261003`. Git retains bindings, logs and
executable probes. Global source/evidence registration and
final-input selection belong to the integrator; Apache application choice and
all existing file/component/source notices remain.
