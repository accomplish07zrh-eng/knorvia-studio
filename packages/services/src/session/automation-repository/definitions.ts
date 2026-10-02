import { randomUUID } from "node:crypto";
import type { DatabaseSync } from "node:sqlite";
import {
  AUTOMATION_CREATE_LIMIT,
  AUTOMATION_CREATE_LIMIT_ERROR_CODE,
  resolveWorkspaceKey,
} from "@knorvia/shared";
import type {
  KnorviaAutomation,
  KnorviaAutomationCreateParams,
  KnorviaAutomationLifecycleStatus,
  KnorviaAutomationUpdateParams,
  ModelSelection,
} from "@knorvia/shared";
import { readAutomation, transaction } from "./connection.js";
import { projectAutomation, readSelection, writeSelection } from "./rows.js";
import type { AutomationRow } from "./rows.js";
import { sql } from "./sql.js";

export class AutomationCreateLimitError extends Error {
  readonly code = AUTOMATION_CREATE_LIMIT_ERROR_CODE;
  constructor() {
    super(
      `[${AUTOMATION_CREATE_LIMIT_ERROR_CODE}] At most ${AUTOMATION_CREATE_LIMIT} automations may be retained. Delete an existing automation before creating another.`,
    );
    this.name = "AutomationCreateLimitError";
  }
}
export type CreateOptions = {
  nextRunAt: number | null;
  lifecycleStatus?: KnorviaAutomationLifecycleStatus;
};
export type UpdateOptions = {
  nextRunAt?: number | null;
  lifecycleStatus?: KnorviaAutomationLifecycleStatus;
  resetRetry?: boolean;
};
export function create(
  db: DatabaseSync,
  params: KnorviaAutomationCreateParams,
  options: CreateOptions,
): KnorviaAutomation {
  const now = Date.now();
  const id = `automation-${randomUUID()}`;
  const workspaceKey = resolveWorkspaceKey({
    workspacePath: params.workspacePath,
    workspaceIdentity: params.workspaceIdentity,
  });
  transaction(db, () => {
    const row = db.prepare(sql.count).get() as { count: number | bigint };
    if (Number(row.count) >= AUTOMATION_CREATE_LIMIT) throw new AutomationCreateLimitError();
    db.prepare(sql.create).run({
      automation_id: id,
      title: params.title,
      cron_expr: params.cronExpr,
      prompt: params.prompt,
      model: null,
      provider: null,
      model_selection: writeSelection(params.modelSelection) ?? "null",
      workspace_key: workspaceKey,
      workspace_path: params.workspacePath,
      workspace_identity: params.workspaceIdentity ?? null,
      target_task_id: params.targetTaskId ?? null,
      studio_workflow_id: params.studioWorkflowId ?? null,
      recurring: params.recurring ? 1 : 0,
      max_runs: params.maxRuns ?? null,
      end_at: params.endAt ?? null,
      schedule_rule: params.scheduleRule ? JSON.stringify(params.scheduleRule) : null,
      enabled: options.lifecycleStatus === "completed" ? 0 : 1,
      lifecycle_status: options.lifecycleStatus ?? "active",
      next_run_at: options.nextRunAt,
      mode: params.mode ?? null,
      thought_level: null,
      created_at: now,
      updated_at: now,
    });
  });
  return projectAutomation(readAutomation(db, id)!);
}
export function list(
  db: DatabaseSync,
  scope?: { workspacePath?: string; workspaceIdentity?: string },
): KnorviaAutomation[] {
  const workspaceKey = scope?.workspacePath
    ? resolveWorkspaceKey({
        workspacePath: scope.workspacePath,
        workspaceIdentity: scope.workspaceIdentity,
      })
    : null;
  return (db.prepare(sql.list).all({ workspace_key: workspaceKey }) as AutomationRow[]).map(
    projectAutomation,
  );
}
export function getModelSelectionForDispatch(
  db: DatabaseSync,
  automationId: string,
  workspaceKey: string,
): ModelSelection | undefined {
  const row = readAutomation(db, automationId, workspaceKey);
  if (!row) throw new Error("Automation 不存在或不属于当前工作区");
  const selection = readSelection(row.model_selection);
  if (selection) return selection;
  if (row.model_selection === "null") return undefined;
  throw new Error("Automation 模型选择不可用，请重新选择模型与思考档位");
}
export function hasTaskBinding(
  db: DatabaseSync,
  scope: { workspacePath: string; workspaceIdentity?: string; targetTaskId: string },
): boolean {
  const workspaceKey = resolveWorkspaceKey({
    workspacePath: scope.workspacePath,
    workspaceIdentity: scope.workspaceIdentity,
  });
  return (
    db
      .prepare(sql.binding)
      .get({ workspace_key: workspaceKey, target_task_id: scope.targetTaskId }) !== undefined
  );
}
export function update(
  db: DatabaseSync,
  automationId: string,
  params: KnorviaAutomationUpdateParams,
  options?: UpdateOptions,
  workspaceKey?: string,
): KnorviaAutomation | null {
  const row = readAutomation(db, automationId, workspaceKey);
  if (!row) return null;
  const now = Date.now();
  const next: AutomationRow = {
    ...row,
    title: params.title ?? row.title,
    cron_expr: params.cronExpr ?? row.cron_expr,
    prompt: params.prompt ?? row.prompt,
    model_selection:
      params.modelSelection === undefined
        ? row.model_selection
        : (writeSelection(params.modelSelection ?? undefined) ?? "null"),
    mode: params.mode === undefined ? row.mode : params.mode,
    recurring: params.recurring === undefined ? row.recurring : params.recurring ? 1 : 0,
    max_runs: params.maxRuns === undefined ? row.max_runs : params.maxRuns,
    end_at: params.endAt === undefined ? row.end_at : params.endAt,
    schedule_rule:
      params.scheduleRule === undefined
        ? row.schedule_rule
        : params.scheduleRule
          ? JSON.stringify(params.scheduleRule)
          : null,
    schedule_edited_by_user:
      params.scheduleEditedByUser === undefined
        ? row.schedule_edited_by_user
        : params.scheduleEditedByUser
          ? 1
          : 0,
    next_run_at: options?.nextRunAt === undefined ? row.next_run_at : options.nextRunAt,
    lifecycle_status: options?.lifecycleStatus ?? row.lifecycle_status,
    dispatch_attempts: options?.resetRetry ? 0 : row.dispatch_attempts,
    retry_at: options?.resetRetry ? null : row.retry_at,
    dispatch_status: options?.resetRetry ? "idle" : row.dispatch_status,
    enabled: options?.lifecycleStatus
      ? options.lifecycleStatus === "active"
        ? 1
        : 0
      : row.enabled,
    updated_at: now,
  };
  db.prepare(sql.update).run({
    automation_id: next.automation_id,
    title: next.title,
    cron_expr: next.cron_expr,
    prompt: next.prompt,
    model: next.model,
    provider: next.provider,
    model_selection: next.model_selection,
    mode: next.mode,
    thought_level: next.thought_level,
    recurring: next.recurring,
    max_runs: next.max_runs,
    end_at: next.end_at,
    schedule_rule: next.schedule_rule,
    schedule_edited_by_user: next.schedule_edited_by_user,
    next_run_at: next.next_run_at,
    lifecycle_status: next.lifecycle_status,
    dispatch_attempts: next.dispatch_attempts,
    retry_at: next.retry_at,
    dispatch_status: next.dispatch_status,
    enabled: next.enabled,
    updated_at: next.updated_at,
  });
  return projectAutomation(next);
}
