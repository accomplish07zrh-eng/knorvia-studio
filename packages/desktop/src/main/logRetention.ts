import { readdirSync, unlinkSync, type Dirent } from "node:fs";
import { join } from "node:path";

export const LOG_RETENTION_DAYS = 14;

const LOG_FILE_NAME_RE = /^(\d{4})-(\d{2})-(\d{2})\.log$/;

interface LogRetentionCleanupResult {
  deletedFiles: string[];
  failedFiles: string[];
}

class DailyLogExpiryPolicy {
  public constructor(
    private readonly now: Date,
    private readonly retentionDays: number,
  ) {}

  public admits(fileName: string): boolean {
    const match = LOG_FILE_NAME_RE.exec(fileName);
    if (match === null) return false;
    const year = Number(match[1]);
    const monthIndex = Number(match[2]) - 1;
    const day = Number(match[3]);
    const candidate = new Date(year, monthIndex, day);
    if (
      candidate.getFullYear() !== year ||
      candidate.getMonth() !== monthIndex ||
      candidate.getDate() !== day
    )
      return false;

    const boundary = new Date(this.now.getFullYear(), this.now.getMonth(), this.now.getDate());
    boundary.setDate(boundary.getDate() - Math.max(this.retentionDays - 1, 0));
    return candidate < boundary;
  }
}

class LogDeletionLedger {
  private readonly deleted: string[] = [];
  private readonly failed: string[] = [];

  public remove(logDir: string, entry: Dirent): void {
    const filePath = join(logDir, entry.name);
    try {
      unlinkSync(filePath);
      this.deleted.push(entry.name);
    } catch {
      this.failed.push(entry.name);
    }
  }

  public result(): LogRetentionCleanupResult {
    return { deletedFiles: this.deleted, failedFiles: this.failed };
  }
}

export function cleanupExpiredLogFiles(
  logDir: string,
  options?: {
    now?: Date;
    retentionDays?: number;
  },
): LogRetentionCleanupResult {
  const now = options?.now ?? new Date();
  const retentionDays = options?.retentionDays ?? LOG_RETENTION_DAYS;
  const policy = new DailyLogExpiryPolicy(now, retentionDays);
  try {
    const ledger = new LogDeletionLedger();
    for (const entry of readdirSync(logDir, { withFileTypes: true })) {
      if (entry.isFile() && policy.admits(entry.name)) ledger.remove(logDir, entry);
    }
    return ledger.result();
  } catch {
    // 保留调用方的兼容观察：遍历级错误丢弃结果，不能据此宣称更早的删除已回滚。
    return { deletedFiles: [], failedFiles: [] };
  }
}
