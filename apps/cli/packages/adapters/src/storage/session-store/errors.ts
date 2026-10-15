// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Knorvia Studio contributors

import type { DatabaseStartupErrorCode } from "@knorvia/shared";

// 迁移错误的形状与语义（实现即本文件，公开面由 storage/session-store.ts 再导出）：
// 一、SqliteSessionMigrationErrorKind 直接复用共享包的 DatabaseStartupErrorCode，不另立枚举。
// 二、options.dbPath 必填：任何迁移错误都要能指出是哪个库文件出的问题。
// 三、options.kind 决定调用方能否重试（lock_timeout 可重试，其余按业务处理）。
// 四、options.migrationId / options.snapshotPath 只在对应阶段有值，缺失即 undefined。
// 五、cause 原样透传给 Error，保留底层 SQLite 错误链，不做字符串化。
// 六、Error.name 固定为 SqliteSessionMigrationError，便于日志与断言按名识别。
// 七、字段名与 kind 取值是跨模块契约：新增字段前先确认调用方与测试的期望。
// 八、本类不承载迁移状态，只描述失败事实，避免错误对象被当作进度载体。
// 九、构造器参数顺序固定为 (message, options)，不要插入位置参数。

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
