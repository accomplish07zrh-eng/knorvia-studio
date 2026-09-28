// SPDX-FileCopyrightText: 2026 Knorvia contributors
// SPDX-License-Identifier: MIT

// Remap only these imports for a later compiled-public-entry acceptance run.
export {
  SqliteSessionStore,
  SqliteSessionMigrationError,
  openStartupSqliteSessionStore,
  getDefaultSessionDbPath,
} from "../src/storage/session-store.js";
export {
  runSqliteSessionMigrations,
  runSqliteSessionMigrationsAsync,
  type SqliteMigrationProgress,
  type AsyncSqliteMigrationOptions,
} from "../src/storage/session-store/migration-runner.js";
export { createSessionMigrationSnapshot } from "../src/storage/session-store/migration-snapshot.js";
export { ensureParentDir } from "../src/storage/session-store/paths.js";
export { SQLITE_MIGRATIONS } from "../src/storage/session-store/migrations.js";
