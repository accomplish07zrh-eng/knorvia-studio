// SPDX-License-Identifier: Apache-2.0
// 桩：只含 interface.md 列出的导出与签名，函数体抛 not implemented。
// 仅用于「桩替换后契约测试全部失败」的验证与替换阶段的起始状态。

export const LOG_CLEANUP_STARTUP_DELAY_MS: never = undefined as never;

export const LOG_RETENTION_DAYS: never = undefined as never;

export const cleanupLogRetention: never = undefined as never;

export const formatLocalLogDate: never = undefined as never;

export const scheduleLogRetentionCleanup: never = undefined as never;

export const DefaultLogRedactor: never = undefined as never;

export class NodeFileLogger {
  constructor(..._args: never[]) {
    throw new Error("not implemented: apps-cli-packages-01");
  }
}

export function getDefaultLogDir(): string {
  throw new Error("not implemented: apps-cli-packages-01");
}

export function createNodeLoggerFactory(options: NodeLoggerFactoryOptions = {}): NodeLoggerFactory {
  throw new Error("not implemented: apps-cli-packages-01");
}
