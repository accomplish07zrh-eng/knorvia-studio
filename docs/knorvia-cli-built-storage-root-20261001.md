# Actual built CLI and storage smoke acceptance

Root exercised the built `apps/cli/packages/cli/dist/knorvia.cjs` corresponding
to reviewed production `68feb5a`. Its SHA-256 is
`93e12f28cfb32a96d19d2eaf10f54e1489d121e694a18a0f10625c8a9c0298d1`.
`--version` returned `0.16.9` and `--help` returned the expected Knorvia usage,
both exit zero. No files were created in those owned empty home/data/storage roots.
The bundle also contains the reviewed WebSearch and PlanMode operation modules;
this is not inferred from filesystem modification time.

Then four explicit opt-in storage flows ran through new child Node processes and
the actual built CLI's `app-server --stdio --prepare-storage` entrypoint. No module,
stream, filesystem or database effect in the CLI subprocess was mocked.

1. Fresh preparation announced the exact owned database path before the file
   existed. Only after the synthetic Host observation ACK did native SQLite
   create/migrate it, report ready, close and emit storagePrepared. Exit zero.
2. The emitted public store API seeded one fictional session, todo and entry;
   native SQLite inserted one message and text part with retained unknown/Unicode
   fields. Repeating actual CLI preparation preserved all cells/JSON in all five
   tables. An exclusive transaction succeeded after CLI completion, verifying
   closure. Exit zero.
3. An explicit same-fixture reuse ACK produced only path/prepared frames and left
   the complete database file bytes unchanged. Exit zero.
4. An invalid ACK on a separate new path returned exit one, reported failure,
   created no database and emitted no prepared frame.

The child environment is an explicit allowlist with empty owned HOME, production
runtime dotenv behavior, test data/storage roots and an absolute owned session DB.
The temporary project is also owned. No actual user database, credentials, model,
provider, remote Host or network task is used. The Node experimental SQLite warning
is retained in the logs. The probe requests SIGTERM at 12 seconds, escalates to SIGKILL after another
two seconds if needed, and closes only its owned child pipes. Completion waits
for drained close rather than exit; output is bounded and stream errors follow
the same cleanup path. All four actual CLI flows exited normally without a
terminating signal. An owned test-only child that ignored SIGTERM verified the
negative timeout assertion and removal of its temporary fixture root. An outer
finally closes remaining fixture database handles and removes only the directory
created by this probe. Production handshake,
retry and timeout settings were not changed.

The reproducible script is `scripts/acceptance/cli-storage-bundle.mjs`. Build with
the pinned Node/pnpm toolchain first, then explicitly run it with Node and the
existing tsx loader (UI tsconfig as TSX_TSCONFIG_PATH). It creates fresh temporary
fixtures itself and cannot be aimed at an existing user database. It is Linux-only
and is not discovered by the ordinary offline suite. Seed data are synthetic;
these four subprocess flows are not four additional regular CI cases.

This checks actual bundled startup and current-schema preparation/idempotence,
not every historical schema upgrade, all user-data formats, packaged installers,
SEA, interactive TUI, live model/provider, Electron UI or Windows/macOS acceptance.
Prior offline regression and scoped native PTY receipts remain separate. No
production code, dependencies, settings, CI, licence or notice was changed; the
27 material obligations and whole-project MIT/native release gaps remain open.
