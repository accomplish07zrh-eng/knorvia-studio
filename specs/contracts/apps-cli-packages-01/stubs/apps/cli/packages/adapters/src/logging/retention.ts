// SPDX-License-Identifier: Apache-2.0
// 桩：只含 interface.md 列出的导出与签名，函数体抛 not implemented。
// 仅用于「桩替换后契约测试全部失败」的验证与替换阶段的起始状态。

export const LOG_RETENTION_DAYS = 7;

export const LOG_CLEANUP_STARTUP_DELAY_MS = 60_000;

export function formatLocalLogDate(date: Date): string {
  throw new Error("not implemented: apps-cli-packages-01");
}

export async function cleanupLogRetention(
  options: LogRetentionCleanupOptions,
): Promise<LogRetentionCleanupResult> {
  throw new Error("not implemented: apps-cli-packages-01");
}

export function scheduleLogRetentionCleanup(
  options: LogRetentionScheduleOptions,
): LogRetentionTimer {
  throw new Error("not implemented: apps-cli-packages-01");
}
