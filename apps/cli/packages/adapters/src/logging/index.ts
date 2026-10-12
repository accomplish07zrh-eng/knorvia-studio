// SPDX-License-Identifier: Apache-2.0
// Modified by Knorvia Studio contributors, 2026-09-30 (re-export facade).
// Contract-based reimplementation; prior source exposure recorded in licensing/evidence files.
//
// 本文件只做再导出：logger 实现在 file-logger，工厂在 node-logger-factory，
// 形状声明在 logger-factory-types，保留策略在 retention，投影/脱敏在 entry/serialize。

export {
  LOG_CLEANUP_STARTUP_DELAY_MS,
  LOG_RETENTION_DAYS,
  cleanupLogRetention,
  formatLocalLogDate,
  scheduleLogRetentionCleanup,
} from "./retention.js";
export type {
  LogRetentionCleanupOptions,
  LogRetentionCleanupResult,
  LogRetentionScheduleOptions,
  LogRetentionTimer,
} from "./retention.js";
export { DefaultLogRedactor } from "./serialize.js";
export type { SerializableLogEntry, SerializedLogError } from "./serialize.js";
export { NodeFileLogger } from "./file-logger.js";
export type {
  NodeLoggerFactory,
  NodeLoggerFactoryOptions,
  NodeLogRetentionScheduleOptions,
} from "./logger-factory-types.js";
export { createNodeLoggerFactory, getDefaultLogDir } from "./node-logger-factory.js";
