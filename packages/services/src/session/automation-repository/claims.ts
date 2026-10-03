import { randomUUID } from "node:crypto";
import type { DatabaseSync } from "node:sqlite";
import type { KnorviaAutomation, KnorviaAutomationRun } from "@knorvia/shared";
import { readAutomation, transaction } from "./connection.js";
import { projectAutomation, projectRun } from "./rows.js";
import type { AutomationRow, RunRow } from "./rows.js";
import { sql } from "./sql.js";

export const CLAIM_STALE_MS = 600000;
export type ClaimedPair = { automation: KnorviaAutomation; run: KnorviaAutomationRun };
type JoinedRow = { [K in keyof AutomationRow as `a_${K}`]: AutomationRow[K] } & {
  [K in keyof RunRow as `r_${K}`]: RunRow[K];
};

export function runNow(
  db: DatabaseSync,
  id: string,
  now: number,
  workspaceKey?: string,
): ClaimedPair | null {
  db.exec(sql.begin);
  try {
    db.prepare(sql.stale).run({ stale: now - CLAIM_STALE_MS });
    const automation = readAutomation(db, id, workspaceKey);
    if (!automation) {
      db.exec(sql.commit);
      return null;
    }
    const changed = db
      .prepare(sql.manualClaim)
      .run({ id, now, workspace_key: workspaceKey ?? null });
    if (changed.changes !== 1) {
      db.exec(sql.commit);
      return null;
    }
    const runId = `${id}:manual:${randomUUID()}`;
    db.prepare(sql.manualInsert).run({
      run_id: runId,
      automation_id: id,
      workspace_key: automation.workspace_key,
      scheduled_at: now,
      model_selection: null,
      now,
    });
    db.exec(sql.commit);
    return {
      automation: projectAutomation({
        ...automation,
        running: 1,
        claimed_at: now,
        updated_at: now,
      }),
      run: projectRun({
        run_id: runId,
        automation_id: id,
        workspace_key: automation.workspace_key,
        scheduled_at: now,
        trigger: "manual",
        model_selection: null,
        dispatch_status: "claimed",
        attempts: 1,
        outcome: null,
        session_id: null,
        error: null,
        created_at: now,
        updated_at: now,
      }),
    };
  } catch (error) {
    db.exec(sql.rollback);
    throw error;
  }
}
export function claimDue(db: DatabaseSync, now: number): KnorviaAutomation[] {
  return transaction(db, () => {
    db.prepare(sql.expire).run({ now });
    db.prepare(sql.stale).run({ stale: now - CLAIM_STALE_MS });
    const rows = db.prepare(sql.due).all({ now }) as AutomationRow[];
    const claim = db.prepare(sql.dueClaim);
    const result: KnorviaAutomation[] = [];
    for (const row of rows) {
      if (claim.run({ id: row.automation_id, now }).changes === 1) {
        result.push(
          projectAutomation({ ...row, running: 1, claimed_at: now, dispatch_status: "claimed" }),
        );
      }
    }
    return result;
  });
}
function joinedAutomation(row: JoinedRow, now: number): AutomationRow {
  return {
    automation_id: row.a_automation_id,
    title: row.a_title,
    cron_expr: row.a_cron_expr,
    prompt: row.a_prompt,
    model: row.a_model ?? null,
    provider: row.a_provider ?? null,
    model_selection: row.a_model_selection ?? null,
    mode: row.a_mode ?? null,
    thought_level: row.a_thought_level ?? null,
    workspace_key: row.a_workspace_key,
    workspace_path: row.a_workspace_path,
    workspace_identity: row.a_workspace_identity ?? null,
    target_task_id: row.a_target_task_id ?? null,
    studio_workflow_id: row.a_studio_workflow_id ?? null,
    location_kind: row.a_location_kind,
    recurring: row.a_recurring,
    max_runs: row.a_max_runs ?? null,
    end_at: row.a_end_at ?? null,
    schedule_rule: row.a_schedule_rule ?? null,
    schedule_edited_by_user: row.a_schedule_edited_by_user,
    run_count: row.a_run_count,
    scheduled_run_count: row.a_scheduled_run_count,
    enabled: row.a_enabled,
    lifecycle_status: row.a_lifecycle_status,
    next_run_at: row.a_next_run_at ?? null,
    last_run_at: row.a_last_run_at ?? null,
    running: 1,
    claimed_at: now,
    dispatch_status: row.a_dispatch_status,
    dispatch_attempts: row.a_dispatch_attempts,
    retry_at: row.a_retry_at ?? null,
    last_error: row.a_last_error ?? null,
    created_at: row.a_created_at,
    updated_at: now,
  };
}
function joinedRun(row: JoinedRow, now: number): RunRow {
  return {
    run_id: row.r_run_id,
    automation_id: row.r_automation_id,
    workspace_key: row.r_workspace_key,
    scheduled_at: row.r_scheduled_at ?? null,
    trigger: row.r_trigger,
    model_selection: row.r_model_selection ?? null,
    dispatch_status: row.r_dispatch_status,
    outcome: row.r_outcome ?? null,
    session_id: row.r_session_id ?? null,
    error: row.r_error ?? null,
    attempts: row.r_attempts + 1,
    created_at: row.r_created_at,
    updated_at: now,
  };
}
export function claimManualRuns(db: DatabaseSync, now: number): ClaimedPair[] {
  return transaction(db, () => {
    const stale = now - CLAIM_STALE_MS;
    db.prepare(sql.stale).run({ stale });
    const rows = db.prepare(sql.manualDue).all({ stale }) as JoinedRow[];
    const claim = db.prepare(sql.reclaimedManual);
    const attempt = db.prepare(sql.manualAttempt);
    const result: ClaimedPair[] = [];
    for (const row of rows) {
      if (claim.run({ id: row.a_automation_id, now }).changes !== 1) continue;
      attempt.run({ run_id: row.r_run_id, now });
      result.push({
        automation: projectAutomation(joinedAutomation(row, now)),
        run: projectRun(joinedRun(row, now)),
      });
    }
    return result;
  });
}
