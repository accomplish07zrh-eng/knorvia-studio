import type { DatabaseSync } from "node:sqlite";
import { readAutomation } from "./connection.js";
import { sql } from "./sql.js";

export const DISPATCH_RETRY_BASE_MS = 30000;
export const DISPATCH_RETRY_CAP_MS = 900000;
export const DISPATCH_MAX_ATTEMPTS = 5;
export function computeRetryAt(now: number, attempts: number): number {
  return (
    now + Math.min(DISPATCH_RETRY_BASE_MS * 2 ** Math.max(0, attempts - 1), DISPATCH_RETRY_CAP_MS)
  );
}
export function markDispatched(
  db: DatabaseSync,
  id: string,
  options: { dispatchedAt: number; nextRunAt: number | null },
): void {
  const row = readAutomation(db, id);
  if (!row) return;
  const scheduledCount = row.scheduled_run_count + 1;
  const maxReached = row.recurring === 0 && scheduledCount >= (row.max_runs ?? 1);
  const endReached = row.end_at !== null && (options.nextRunAt ?? Infinity) > row.end_at;
  const completed = maxReached || endReached;
  db.prepare(sql.dispatched).run({
    id,
    run_count: row.run_count + 1,
    scheduled_run_count: scheduledCount,
    dispatched_at: options.dispatchedAt,
    lifecycle_status: completed ? "completed" : "active",
    enabled: completed ? 0 : 1,
    next_run_at: completed ? null : options.nextRunAt,
    now: options.dispatchedAt,
  });
}
export function markDispatchFailed(
  db: DatabaseSync,
  id: string,
  options: {
    failedAt: number;
    error: string;
    kind: "transient" | "permanent";
    nextRunAt?: number | null;
  },
): void {
  const row = readAutomation(db, id);
  if (!row) return;
  const fields = { id, error: options.error, now: options.failedAt };
  if (options.kind === "permanent") {
    db.prepare(sql.permanentFailure).run(fields);
    return;
  }
  const attempts = row.dispatch_attempts + 1;
  if (attempts >= DISPATCH_MAX_ATTEMPTS) {
    if (row.recurring === 1) {
      db.prepare(sql.recurringFailure).run({ ...fields, next_run_at: options.nextRunAt ?? null });
    } else db.prepare(sql.exhaustedFailure).run(fields);
    return;
  }
  db.prepare(sql.retry).run({
    ...fields,
    attempts,
    retry_at: computeRetryAt(options.failedAt, attempts),
  });
}
