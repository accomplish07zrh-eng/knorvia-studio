# Exact final-input Linux package acceptance

The complete standalone archive and configured Desktop AppImage were freshly built
from exact input `bcb82c184de740c2cd9571c115eafa3bd04480cf`, tree
`3c10f3a238fd6f7b82e3e139cb81a1c648f90b7d`, on the existing native branch. This
input includes PR25's Chrome fixture repair, PR26's actual TUI ESM/startup exit
repair and the integrated services zombie cleanup. The 24 recorded inputs stayed
unchanged and tracked source stayed clean through package acceptance. The later
evidence commit does not replace the package input SHA.

| Fresh artifact | Bytes | SHA256 |
| --- | ---: | --- |
| Complete CLI/TUI/server/Web archive | 90495472 | `75a77e374b9c12b40e49a35e8867405a7a3fe96751d0dbf25b5ff0595da06f11` |
| Linux x64 AppImage | 188674891 | `f63774b7aeaff27e18df68e7f86e3061f9188214871519829b95ee1c39cb1175` |

The **unchanged original `scripts/distribution-smoke.mjs` exits0** against this new
archive. Its nine assertion call sites remain (one argument guard and eight
product assertions), with their exact lines and source digest in
`source-preservation.json`. Help/version execution, actual TUI native import,
initialized render and Ctrl-C keyboard exit0 all complete. The real Web launcher
then passes server-info/exact workspace, HTML200/content, artifact-resolved
WebSocket open/close and SIGTERM launcher exit0. No TUI skip, injected import shim,
assertion relaxation or supplemental Web result substitutes for this original
smoke. The deployed TUI context header and fresh CLI/TUI-to-archive comparisons
are bound in `distribution-artifact-bindings.json`.

The generated installer separately passes two actual loopback downloads and
isolated installs of this archive: installed bytes, current symlink, executable
launcher, version/help and the same synthetic profile sentinel all match. The
previous probe is reused with only its report.inputSha literal changed; the exact
before/after digests and byte-equivalence check are recorded. Its assertions and
installation commands remain intact. External comparisons verify both generated
checksum and latest metadata; the existing installer itself does not check
sha256.txt. This does not claim full legacy-data migration coverage.

Official sequential Desktop runtime preparation source-builds the agent with
`KNORVIA_BOOTSTRAP_WITH_REMOTE=0` and retains nine official plugin packages.
Production Desktop/ASAR and configured AppImage are freshly built, without an old
prepackaged payload. Metadata identifies bcb82c18, Electron41.0.3 and builder26.8.1.
Canonical hooks restore pinned node-pty, inject22 missing runtime modules, strip
sourcemaps and enforce the existing native resource layout. Search preparation
retains its existing pinned repository-archive assets. Remote-target preparation
is explicitly skipped. Frozen install skips lifecycle scripts; the packaged PTY
restoration and actual module execution below provide the bounded native check.

The actual AppImage extracts successfully. Executable, ASAR, CLI and PTY digests
equal the freshly built linux-unpacked payload; its CLI also equals the freshly
source-built/staged Desktop bundle. The unchanged canonical probe and child in
`../native-packaged-acceptance-20261003/` pass **six groups, exit0**: outside-repo
package identity; ASAR/native policy and required runtime entries; CLI0.16.9 in
the artifact's Electron Node24.14.0; actual PTY marker/exit and SQLite sentinel;
two normal storage handshakes preserving that row; and packaged rg/ugrep/bfs on
Unicode/spaced synthetic paths with source/notices present. Exact probe/helper
source digests, package identities and raw startup frames remain in this packet.

Build/probe commands and all actual exit codes are in `commands.json`; original
logs, generated installer/metadata, result JSON and artifact/input bindings are
retained beside it. Large products remain under the task-owned
`/workspace/knorvia-native-final-bcb82c18-20261003`. Older ede838/ad712690 receipts
and their failures remain unchanged, with no result reassigned to this input.
Runtime environments contain synthetic data paths and no inherited credentials;
runtime fixtures were removed. No model, real profile or user computer was used.

This closes the full-archive TUI smoke blocker for the supplied bcb82c18 input and
refreshes bounded Linux native/data-retention acceptance. It does not establish
Electron GUI or Desktop Host/Agent process-tree graceful shutdown from the Web
launcher's exit; the separately owned combined acceptance and final CI remain
the integrator's responsibility. Real Windows NSIS/install/GUI/CUA and macOS
acceptance remain unavailable here. Deb/rpm/pacman still require the factual
public maintainer email, which was not provided or invented; AppImage and archive
builds do not depend on it. No fresh SSH/WSL acceptance, whole-product independence,
license authority or two-clean-build reproducibility claim is made.

No new full source suite, root typecheck/lint/audit, release publication or main
merge was performed. The integrator follows run37127601364, registers this new
evidence packet in shared frozen/current-source records and decides the PR24
handoff. Production/UI/shared protocol/root/CI/license/global provenance files
were not edited in this batch. Apache/application and individual component
license/NOTICE/source obligations remain unchanged.
