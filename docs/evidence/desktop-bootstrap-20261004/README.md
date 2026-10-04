# Owned Electron bootstrap diagnosis, 2026-10-04

Actual official Electron 41.0.3 Linux x64 runtime ZIP, 117006219 bytes,
SHA256 ca1a4963ef855f67afd34033ccfe4ca4cc986e5b58a77c2d0cf88ff3fc9933ee,
verified against official release SHASUMS256.txt before extraction. Private
Xvfb/xauth/libxfont2/libxshmfence1 came from signed Debian trixie downloads,
extracted into a private sysroot without system installation. Node 24.14.0.
No runtime binaries are redistributed in this packet.

The two raw harness files read the worktree expression at invocation. The
baseline report used the expression at source
54a777da441759f14e2c5c144defa85c885452a9, frozen separately here: 3/3 failed
while Node/Electron bootstrap globals/modules were incomplete. The guarded
report used the corrected front guard plus the harness's additional redundant
appCodeLoaded guard: 3/3 passed. The current harness (one iteration, mode current)
used the exact current expression without insertion: 1/1 passed, real window
ready and normal exit [0,null]. Raw reports and harnesses are copied unchanged;
future reproduction must supply the matching expression, not assume the
baseline mode rewinds source automatically.

Pinned Electron browser/init.ts deletes process.appCodeLoaded after API setup
and immediately before importing application code:
https://github.com/electron/electron/blob/v41.0.3/lib/browser/init.ts
The probe waits for that boundary before calling any Node/Electron loaders.
It retains 90s packaged startup and normal-exit assertions; no exception after
bootstrap is ignored. Cleanup waits for only owned children and removes only
owned synthetic profiles, recording cleanup failures separately.

These are synthetic hidden-window fixture results on official Linux runtime,
not Knorvia package acceptance, Windows results, human GUI acceptance, real
model-task execution or full legacy-user migration. Actual candidate run
37176247969 at source54 passed both reusable quality jobs, native Windows
portable acceptance and Linux installed acceptance; Windows installed and Linux
portable acceptance failed. No preview.4 was published by that run.
