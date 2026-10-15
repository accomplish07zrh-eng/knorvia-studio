// SPDX-License-Identifier: Apache-2.0
// Modified by Knorvia Studio contributors, 2026-09-30 (re-export facade).
// Contract-based reimplementation; prior source exposure recorded in licensing/evidence files.
//
// 本文件是 logging 的公开入口，只做再导出，便于宿主按能力分区替换实现。
//
// 模块地图：
// - retention.ts           保留天数、清理与排程（含事件载荷与失败语义）
// - entry.ts               投影 LogEntry：字段表、可选字段与错误挂载
// - serialize.ts           契约表、条目序列化、控制台行与状态判定
// - log-redactor.ts        脱敏器：工作栈遍历、深度/环/隐藏键打码
// - log-error-node.ts      cause 链序列化与两种终态节点
// - file-sink.ts           JSONL 落盘（失败按 void 合同吞掉）
// - file-logger.ts         NodeFileLogger：级别门控、上下文合并、写入编排
// - node-logger-factory.ts 工厂：环境解析、覆盖项、单次清理放行
// - logger-factory-types.ts 工厂与排程的形状声明
//
// 依赖方向：本文件 → 上述模块，反向依赖一律禁止。

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
