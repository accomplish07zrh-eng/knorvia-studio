import { knorviaTaskModeSchema, modelSelectionSchema } from "@knorvia/shared";
import type { KnorviaAutomation, KnorviaAutomationRun, ModelSelection } from "@knorvia/shared";

export type AutomationRow = {
  automation_id: string;
  title: string;
  cron_expr: string;
  prompt: string;
  model: string | null;
  provider: string | null;
  model_selection: string | null;
  mode: string | null;
  thought_level: string | null;
  workspace_key: string;
  workspace_path: string;
  workspace_identity: string | null;
  target_task_id: string | null;
  studio_workflow_id: string | null;
  location_kind: string;
  recurring: number;
  max_runs: number | null;
  end_at: number | null;
  schedule_rule: string | null;
  schedule_edited_by_user: number;
  run_count: number;
  scheduled_run_count: number;
  enabled: number;
  lifecycle_status: KnorviaAutomation["lifecycleStatus"];
  next_run_at: number | null;
  last_run_at: number | null;
  running: number;
  claimed_at: number | null;
  dispatch_status: KnorviaAutomation["dispatchStatus"];
  dispatch_attempts: number;
  retry_at: number | null;
  last_error: string | null;
  created_at: number;
  updated_at: number;
};
export type RunRow = {
  run_id: string;
  automation_id: string;
  workspace_key: string;
  scheduled_at: number | null;
  trigger: KnorviaAutomationRun["trigger"];
  model_selection: string | null;
  dispatch_status: KnorviaAutomationRun["dispatchStatus"];
  outcome: KnorviaAutomationRun["outcome"] | null;
  session_id: string | null;
  error: string | null;
  attempts: number;
  created_at: number;
  updated_at: number;
};
export function readSelection(raw: string | null | undefined): ModelSelection | undefined {
  if (!raw) return undefined;
  try {
    const parsed = modelSelectionSchema.safeParse(JSON.parse(raw));
    return parsed.success ? parsed.data : undefined;
  } catch {
    return undefined;
  }
}
export function writeSelection(selection: ModelSelection | undefined): string | null {
  if (!selection) return null;
  const { providerId, modelId, options } = selection;
  return JSON.stringify(
    modelSelectionSchema.parse({
      providerId,
      modelId,
      ...(options && Object.keys(options).length > 0 ? { options } : {}),
    }),
  );
}
export function validateMode(mode: unknown): void {
  if (mode === undefined || mode === null) return;
  if (!knorviaTaskModeSchema.safeParse(mode).success) {
    throw new Error(`Invalid automation mode: ${String(mode)}`);
  }
}
export function projectAutomation(row: AutomationRow): KnorviaAutomation {
  const modelSelection = readSelection(row.model_selection);
  const mode = knorviaTaskModeSchema.safeParse(row.mode);
  return {
    automationId: row.automation_id,
    title: row.title,
    cronExpr: row.cron_expr,
    prompt: row.prompt,
    ...(modelSelection ? { modelSelection } : {}),
    mode: mode.success ? mode.data : undefined,
    workspaceKey: row.workspace_key,
    workspacePath: row.workspace_path,
    workspaceIdentity: row.workspace_identity ?? undefined,
    targetTaskId: row.target_task_id ?? undefined,
    studioWorkflowId: row.studio_workflow_id ?? undefined,
    locationKind: row.location_kind === "remote" ? "remote" : "local",
    recurring: row.recurring === 1,
    maxRuns: row.max_runs ?? undefined,
    endAt: row.end_at ?? undefined,
    scheduleRule: row.schedule_rule ? JSON.parse(row.schedule_rule) : undefined,
    ...(row.schedule_edited_by_user === 1 ? { scheduleEditedByUser: true } : {}),
    runCount: row.run_count,
    enabled: row.enabled === 1,
    lifecycleStatus: row.lifecycle_status,
    nextRunAt: row.next_run_at ?? undefined,
    lastRunAt: row.last_run_at ?? undefined,
    dispatchStatus: row.dispatch_status,
    dispatchAttempts: row.dispatch_attempts,
    retryAt: row.retry_at ?? undefined,
    lastError: row.last_error ?? undefined,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}
export function projectRun(row: RunRow): KnorviaAutomationRun {
  const modelSelection = readSelection(row.model_selection);
  return {
    runId: row.run_id,
    automationId: row.automation_id,
    workspaceKey: row.workspace_key,
    scheduledAt: row.scheduled_at ?? undefined,
    trigger: row.trigger,
    ...(modelSelection ? { modelSelection } : {}),
    dispatchStatus: row.dispatch_status,
    outcome: row.outcome ?? undefined,
    sessionId: row.session_id ?? undefined,
    error: row.error ?? undefined,
    attempts: row.attempts,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}
