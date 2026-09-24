# Knorvia Studio desktop identity and isolation

This is the fresh upstream GUI. No discarded collaboration implementation is reused.

## Ownership and startup order

Main is the single owner of application identity and profile selection. A separate launcher dynamically imports the window/services entry only after bootstrap, preserving the ordering even after bundle chunk extraction. Its first bootstrap selects `Knorvia Studio` / `dev.knorvia.studio` before Electron obtains its single-instance lock, initializes crash capture, or starts any Host. Services and the bundled agent receive the same `KNORVIA_DATA_BASE_DIR`; the service root is `<base>/.knorvia-studio` and never reads `.knorvia`. `KNORVIA_HOME` and `KNORVIA_STORAGE_DIR` refer to that application root, not its parent; they are never given a second suffix. Generic `HOME` and `USERPROFILE` remain untouched.

```text
launch → Knorvia profile selection → Electron paths → local crash capture → single-instance lock
       → Host inherits selected base → original GUI → existing configured model/agent
```

Normal packaged builds use a Knorvia-owned base under the platform application-data directory. Portable builds select `<executable-directory>/data` when `resources/knorvia-portable.json` exists; an explicit `KNORVIA_PORTABLE_DIR` selects `<directory>/data`. Electron userData/session/cache/log/crash/temp paths all stay under the selected base. Invalid explicit paths fail visibly rather than falling back to upstream data. Developer overrides use only `KNORVIA_*`. Internal package and TypeScript symbol names can remain compatible.

## Removed upstream product services

Product OAuth state registration, OAuth/payment callback dispatch, product account identifiers, device fingerprint creation, product telemetry delivery, automatic updater downloads, mandatory version gates and upstream remote product configuration are removed. No fabricated Knorvia endpoint replaces them. Existing third-party MCP authorization and user-selected model endpoints are unaffected. Generic browser/external-file opening continues through the existing guarded platform path.

The application protocol is `knorvia-studio`, and local media uses `knorvia-media`. Portable builds do not register OS protocol or Explorer integrations; standalone installs use the distinct Knorvia identity. No ZCode scheme or app identity is registered.

## Branding and packaging

Use the supplied image unchanged as the source for standard PNG and ICO sizes. Product/window/menu/tray/about names are Knorvia Studio, and executable/package names are Knorvia-specific. Copyright and third-party attribution remain intact. Standard `electron-builder --dir` is supported; final portable packaging and launch verification are performed by the root task.

## Verification

Tests cover normal versus portable profile selection, upstream environment variables being ignored, distinct OS identities/protocols, removed product callback handling and the pre-lock initialization order. Run typecheck, lint and architecture checks; report existing or cross-worktree failures separately. Final delivery requires a real clean-profile launch of the built portable app.
