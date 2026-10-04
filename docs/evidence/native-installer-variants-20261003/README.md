# Installer and portable source handoff — unverified

Persistent native branch `rewrite/native-20261003`; no new task/branch and no
main merge. Additive installer source checkpoint:

- `1836f419aa2ac41117e21b1ba01e196d66227a2a`: shortcut options, variant targets,
  original portable launcher data paths, and actual UI PR28 option/copy wiring.
- `b03bb9d25b71ac07b7c8d510c4fc2d34ac966ff7`: ordinary uninstall uses owned
  program files and empty parents; missing manifests preserve data and stop
  ordinary uninstall. Upgrade retains legacy missing-manifest preservation.

[Behavior/ownership contract](../../../specs/knorvia-native-installer-variants-20261003.md)
preceded each implementation. [Source bindings](source-bindings.json) bind the
14 changed source/spec/fixture inputs, seven unchanged shared files and two exact
UI resource blobs. This is source-exposed additive work, without clean-room,
independent-rights or whole-project MIT assertions. Root Apache-2.0, third-party
notices and all existing per-component declarations remain.

Only source reads, the legacy desktop bounded context, diffs, blob/hash metadata
and remote commit confirmation were performed. **No tests, lint, types, builds,
format/architecture checks, Windows execution or full audit ran in this batch.**
Ten new unit scenarios and four Windows cleanup-macro scenarios are authored and
unrun. A metadata-only receipt attempt hit the default Node output buffer while
reading the large notice blob; it was corrected to 32 MiB and completed without
executing product code. This is not a failed application test or package rebuild.

## UI dependency and source ownership

Integrate [UI PR28](https://github.com/accomplish07zrh-eng/knorvia-studio/pull/28)
at `1a0febaf9b362b5bcd578d396ec566bf98a33e51` before real packaging. Its README,
INTEGRATION and copy.json were read from that exact fetched commit. Native has
actually wired `installerHeader`, `installerSidebar`, `uninstallerSidebar` to
`build/installer-branding-20261003/`; native does not copy or rewrite these BMPs
or the UI source record. Existing ICO/ICNS bytes remain unchanged. Adopt its
concise bilingual native copy, adjusting welcome wording for the real scope →
directory → shortcut order. System progress/file details and the stock finish
launch checkbox remain; no fake ETA or design-preview-as-Windows evidence.

Native owns desktop config, local variant/NSIS patch scripts, `build/*.nsh`,
profile bootstrap/selection and these fixtures. No renderer/services/shared
protocol/root config/CI/global provenance changes. Cross-thread messaging is
unavailable here; parent relayed PR28 successfully and should relay this receipt
to the same UI thread `01a10019-de88-7513-8dd6-b2a3981370c7`.

## Integration CI interface

`KNORVIA_PORTABLE_BUILD=0` (or unset) retains installed defaults. Windows builder
keeps `Knorvia Studio-<version>-win-<arch>.exe`, preserving the existing root
PowerShell staging consumer that already publishes `-setup.exe` and a genuinely
marked portable ZIP. Linux defaults remain AppImage/deb/rpm/pacman.

`KNORVIA_PORTABLE_BUILD=1` selects Windows portable EXE + ZIP or Linux portable
AppImage + tar.gz. Names include `-portable`; `resources/knorvia-portable.json`
is physically staged. Marked NSIS portable uses `PORTABLE_EXECUTABLE_DIR/data`;
marked AppImage uses the original `APPIMAGE` file's sibling `data/`; extracted
ZIP/tar uses its executable folder's `data/`. Explicit KNORVIA_PORTABLE_DIR wins.
Installed products retain the current user profile. Native removes a stale
portable marker from its own installed output and rejects mixed installer and
portable target lists. Each variant needs a separate process/fresh output root;
do not bypass the hooks with `--prepackaged`.

In the native runner, integration may use the existing bundle entry with
`--os win --arch x64` or `--os linux --arch x64`, distinct absolute
`KNORVIA_DESKTOP_DIST_DIR` values and the chosen mode. Prepare/build once for a
given exact source/platform/arch; a later same-input variant invocation may use
`--skip-prepare --skip-build`. Keep identity/backend/signing policy owned by the
existing integration configuration. x64 is the current acceptance allocation;
other architectures require their own runtime assets and native evidence.

After Windows packaging makes the pinned NSIS compiler available, set
`KNORVIA_NSIS_COMPILER` to its absolute actual `makensis.exe` path and explicitly
run (not run here):

```text
node --test packages/desktop/test/windows-owned-cleanup.acceptance.mjs
```

It compiles the actual production cleanup macro with an injected update flag,
function prefix and inert elevation predicate, in isolated Unicode/space paths;
checks owned program deletion and exact SHA-256 preservation of synthetic data,
unrelated files and empty data directories; and checks missing-manifest paths.
It refuses non-Windows or a missing compiler. This focused macro check cannot
replace real NSIS wizard/UAC/pinned-shortcut/finish/upgrade/uninstall acceptance.
Run the authored unit cases and real two-launch/move/upgrade data sentinels during
the user's final unified validation, recording actual source and artifact hashes.

## Retained products and blocked PR

The completed maintainer/Linux evidence commit remains
`5c3120f0abfd4031a9c69b5b8a6d2082721ef57d`. Existing four successful physical
products are retained in `/workspace/knorvia-native-linux-email-20261003/desktop-release`.
Their input remains `b5fbc3d89c34c45d6d9f7e16183bbdaec79d75f8`, with exact
hashes, package metadata and actual deb native acceptance in
[the prior packet](../native-linux-maintainer-20261003/README.md). None was rebuilt,
discarded or relabeled as acceptance of these later installer/profile changes.

The email/Linux draft PR creation was rejected by automatic approval review:
it did not accept assistant-delegated authorization as direct trusted end-user
authorization to disclose the specific maintainer address on GitHub. A direct
user approval question remains pending. **No PR was created and no alternative
write was used to bypass that rejection.** Code commits continue on the same
already-published branch; integration may receive the exact email checkpoint
then this source batch sequentially after the required authorization is resolved.
No GitHub Release or main merge was performed. Integration owns native builds,
source registration, final acceptance and actual Release publication.
