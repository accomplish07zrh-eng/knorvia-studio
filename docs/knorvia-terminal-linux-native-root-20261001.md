# Root Linux native terminal acceptance

The initial installed node-pty 1.1.0 load failed because no Linux pty.node was
present. Root copied the installed pinned package into separate temporary storage
and compiled it using the installed node-gyp 11.5.0, system compiler and official
Node 24.14.0 headers. The package source bytes match the installed package; the
receipt records their hashes and the resulting binary digest. No repository
source, dependency version, lockfile, native loader, helper permissions, security
setting or CI configuration was changed to make the backend available.

A real owned `/bin/sh` PTY capability probe passed with expected marker and exit 7.
Then the actual product terminal service and real RPC ProxyChannel passed three
explicit opt-in cases against source and three against strict emitted code:

- Native writes and output through direct and RPC service consumers
- Native resize verified by actual `stty size`: 33 rows, 91 columns
- Exit code 7 delivered once, post-exit IO rejected and repeat disposal harmless
- Two-terminal bulk disposal, closed admission, subsequent service reuse and
  diagnostic provider retirement

These are real Linux native PTYs, not fake native ports. The settings provider is
owned in-memory data. Every shell uses an empty owned HOME and an `env -i`
allowlist, without ENV, BASH_ENV, login profiles, credentials or user files.
The runner rejects environment names outside the documented allowlist (plus
Node's own NODE_TEST_CONTEXT). ProxyChannel runs directly in process; it does not
exercise binary transport or a live Host. The bulk case verifies accepted
disposal, admission, reuse and normal runner completion, not a separate per-PID
OS termination assertion. The test process exits normally after cleanup. Source and emitted runs each pass
3/3 with zero failed/skipped/cancelled cases. Existing synthetic failure tests
remain necessary for rare failure and reentrant paths.

This narrows one acceptance gap only. It does not validate a shipped native binary,
installer, Electron/xterm UI, fonts, IME, Windows/macOS, live remote Host, SSH or
real user-data upgrade. CI219 is independently green but establishes only
non-reproduction of CI218's unknown auth failure.

## Reproduction

Use the repository's pinned Node/pnpm toolchain and built services/shared/RPC dist.
Create a fresh temporary directory and empty home. Copy the installed node-pty
package there, make its existing node-addon-api dependency available, and run the
installed node-gyp with `rebuild --directory=<copy> --devdir=<temporary-headers>`.
Only use the already pinned package and official Node headers; do not download an
unrecognized prebuilt binary or alter security settings if this fails.

Run `scripts/acceptance/terminal-linux-native.mjs` explicitly with Node's
`--test --test-concurrency=1`, the existing tsx loader and a clean environment:
PATH for the pinned Node/system tools, HOME set to the new empty home, SHELL set
to `/bin/sh`, LANG set to `C.UTF-8`, KNORVIA_NATIVE_PTY_ROOT set to the compiled
copy, KNORVIA_NATIVE_TEST_HOME set to that home, TSX_TSCONFIG_PATH set to the
repository UI tsconfig, and KNORVIA_NATIVE_TEST_TARGET set to source or dist.
For dist, also import the existing
`packages/services/test/terminal-profile-portable-emitted-register-fast-20261001.mjs`.
The runner redirects only node-pty to the byte-verified compiled copy; service,
owner, planning, RPC and shared product code are actual source/emitted consumers.

The probe is not discovered by the offline Studio suite and does not turn native
availability into a new silent CI skip. Missing prerequisites fail explicitly. A negative invocation with one synthetic
unexpected variable and a deliberately absent backend is rejected by the
environment guard before any backend lookup or shell creation.
Full offline acceptance for unchanged production remains the prior 6,743-case
receipt; this new optional native probe adds six explicitly executed observations,
not six new ordinary CI cases. Attribution and all 27 material obligations remain.
