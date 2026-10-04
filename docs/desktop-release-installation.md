# Knorvia Studio desktop installation

Version: **0.8.0**. These instructions accompany the stable release packages
for **Windows x64** and **Linux x64**. The exact checked source commit, package hashes,
signature status and bounded acceptance results are in `release-metadata.json`.
Verify downloads against `SHA256SUMS` or the corresponding `.sha256` attachment.

## Windows x64

Download `Knorvia-Studio-0.8.0-win-x64-setup.exe` and follow the guided
installer. Choose the installation directory and shortcut options. Reinstall or
upgrade using the same product identity. Ordinary uninstall preserves your
application data; remove it manually only when you explicitly want to discard
it. Normal profiles use `%APPDATA%\Knorvia Studio`.

Alternatively, extract
`Knorvia-Studio-0.8.0-win-x64-portable.zip` into a writable directory
and run `Knorvia Studio.exe`. Keep the included portable marker; portable data
is saved beside the executable in `data/`. Back up that directory before
moving or replacing the portable installation. Setup and portable profiles
are distinct by their existing storage rules.

The additional `Knorvia-Studio-0.8.0-win-x64-portable.exe` is a
self-extracting portable launcher. Keep it in a writable folder; its persistent
`data/` is beside the original EXE, outside the temporary application extraction.

No signing credentials were created for this release. Check the recorded
Authenticode status before assuming an installer is signed. Unsigned preview
executables can show Windows trust prompts; obtain them from this repository's
release and verify the hashes.

## Linux x64

Choose one package for your distribution:

| Format   | Installation                                                                              |
| -------- | ----------------------------------------------------------------------------------------- |
| AppImage | Make executable with `chmod +x`, then run it. No system package installation is required. |
| deb      | Install the downloaded `.deb` with `sudo apt install ./<filename>.deb`.                   |
| rpm      | Install the downloaded `.rpm` with `sudo dnf install ./<filename>.rpm`.                   |
| pacman   | Install the downloaded `.pkg.tar.zst` with `sudo pacman -U ./<filename>.pkg.tar.zst`.     |

Use the distribution package manager so runtime dependencies are installed.
The Linux executable is `knorvia-studio`. Normal profiles use
`${XDG_CONFIG_HOME:-~/.config}/Knorvia Studio`. AppImage is a portable deployment
format and uses this normal user-data directory. Replacing the program or
ordinary package removal preserves the existing profile. No package-manager
signature is claimed; `SHA256SUMS` records integrity, not signer identity.

For an adjacent portable profile instead, use
`Knorvia-Studio-0.8.0-linux-x64-portable.AppImage` or extract
`Knorvia-Studio-0.8.0-linux-x64-portable.tar.gz`. These separately marked
products keep `data/` beside the original AppImage or extracted executable.
Keep that directory when upgrading or moving the portable package. The ordinary
AppImage and native deb/rpm/pacman packages retain normal system-user storage.

## Scope and retained notices

The release pipeline checks both platforms, then builds fresh packages from
one exact source commit and runs package acceptance outside the source
checkout. Recorded acceptance distinguishes extracted payload/native runtime
checks from Windows silent installation/reinstallation/uninstallation. It does
not establish human installer GUI, real model-task, full legacy-user migration
or macOS acceptance. Actual per-platform results and limitations travel with
the release metadata.

The application retains Apache-2.0. Included `LICENSE-Apache-2.0.txt`,
`NOTICE.md`, `THIRD-PARTY-NOTICES.md` and bundled per-component notices retain
their applicable obligations. This release does not claim complete independent
authorship or change every component to MIT.
