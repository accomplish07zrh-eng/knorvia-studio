import type { DatabaseSync } from "node:sqlite";
import type {
  KnorviaAutomationRunDispatchStatus,
  KnorviaAutomationTrigger,
  ModelSelection,
} from "@knorvia/shared";
import { transaction } from "./connection.js";
import { readSelection, writeSelection } from "./rows.js";
import { sql } from "./sql.js";

export type RunIdentity = {
  runId: string;
  automationId: string;
  workspaceKey: string;
  scheduledAt: number | null;
};
export type RunClaim = RunIdentity & { trigger: KnorviaAutomationTrigger };
export function runBindings(params: RunIdentity, now: number) {
  return {
    run_id: params.runId,
    automation_id: params.automationId,
    workspace_key: params.workspaceKey,
    scheduled_at: params.scheduledAt,
    now,
  };
}
export function skipAndReschedule(
  db: DatabaseSync,
  params: RunIdentity & {
    reason: string;
    nextRunAt: number | null;
    finalize?: boolean;
  },
): void {
  const now = Date.now();
  transaction(db, () => {
    db.prepare(sql.scheduleSkip).run({ ...runBindings(params, now), reason: params.reason });
    if (params.finalize) db.prepare(sql.finalize).run({ id: params.automationId, now });
    else
      db.prepare(sql.reschedule).run({
        id: params.automationId,
        next_run_at: params.nextRunAt,
        now,
      });
  });
}
export function ensureRunClaimed(db: DatabaseSync, params: RunClaim): void {
  const now = Date.now();
  db.prepare(sql.ensureRun).run({ ...runBindings(params, now), trigger: params.trigger });
}
export function upsertRunClaimed(
  db: DatabaseSync,
  params: RunClaim & { modelSelection?: ModelSelection },
): void {
  const now = Date.now();
  const modelSelection = writeSelection(params.modelSelection);
  db.prepare(sql.upsertRun).run({
    ...runBindings(params, now),
    trigger: params.trigger,
    model_selection: modelSelection,
  });
}
export function fixRunModelSelection(
  db: DatabaseSync,
  runId: string,
  selection: ModelSelection,
): ModelSelection {
  const modelSelection = writeSelection(selection);
  const now = Date.now();
  db.prepare(sql.fixModel).run({ run_id: runId, model_selection: modelSelection, now });
  const row = db.prepare(sql.readModel).get({ run_id: runId }) as
    | { model_selection: string | null }
    | undefined;
  const fixed = readSelection(row?.model_selection);
  if (!fixed) throw new Error(`Automation run 不存在或无法固定模型选择: ${runId}`);
  return fixed;
}
export function markRunDispatch(
  db: DatabaseSync,
  params: {
    runId: string;
    dispatchStatus: KnorviaAutomationRunDispatchStatus;
    sessionId?: string | null;
    error?: string | null;
  },
): void {
  db.prepare(sql.runDispatch).run({
    run_id: params.runId,
    dispatch_status: params.dispatchStatus,
    session_id: params.sessionId ?? null,
    error: params.error ?? null,
    now: Date.now(),
  });
}
export function markManualRunDispatched(
  db: DatabaseSync,
  params: {
    runId: string;
    sessionId?: string | null;
    dispatchedAt: number;
  },
): boolean {
  return transaction(db, () => {
    const row = db.prepare(sql.readManual).get({ run_id: params.runId }) as
      | {
          automation_id: string;
          workspace_key: string;
          dispatch_status: string;
        }
      | undefined;
    if (!row || row.dispatch_status === "dispatched") return false;
    db.prepare(sql.manualDispatched).run({
      run_id: params.runId,
      session_id: params.sessionId ?? null,
      now: params.dispatchedAt,
    });
    const result = db.prepare(sql.manualCount).run({
      automation_id: row.automation_id,
      workspace_key: row.workspace_key,
      dispatched_at: params.dispatchedAt,
      now: params.dispatchedAt,
    });
    return result.changes > 0;
  });
}
