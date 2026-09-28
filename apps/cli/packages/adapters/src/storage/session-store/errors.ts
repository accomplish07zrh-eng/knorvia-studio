// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Knorvia Studio contributors

import type { DatabaseStartupErrorCode } from "@knorvia/shared";

export type SqliteSessionMigrationErrorKind = DatabaseStartupErrorCode;

export interface SqliteSessionMigrationErrorOptions {
  cause?: unknown;
  dbPath: string;
  kind: SqliteSessionMigrationErrorKind;
  migrationId?: string;
  snapshotPath?: string;
}

export class SqliteSessionMigrationError extends Error {
  readonly dbPath: string;
  readonly kind: SqliteSessionMigrationErrorKind;
  readonly migrationId?: string;
  readonly snapshotPath?: string;

  constructor(message: string, options: SqliteSessionMigrationErrorOptions) {
    super(message, { cause: options.cause });
    this.dbPath = options.dbPath;
    this.kind = options.kind;
    this.migrationId = options.migrationId;
    this.snapshotPath = options.snapshotPath;
    this.name = "SqliteSessionMigrationError";
  }
}
