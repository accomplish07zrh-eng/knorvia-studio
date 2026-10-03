import type {
  KnorviaAutomation,
  KnorviaAutomationCreateParams,
  KnorviaAutomationLifecycleStatus,
  ModelSelection,
  KnorviaAutomationRun,
  KnorviaAutomationRunDispatchStatus,
  KnorviaAutomationRunOutcome,
  KnorviaAutomationTrigger,
  KnorviaAutomationUpdateParams,
} from "@knorvia/shared";
import { Connection, readAutomation } from "./automation-repository/connection.js";
import { projectAutomation, projectRun, validateMode } from "./automation-repository/rows.js";
import type { RunRow } from "./automation-repository/rows.js";
import * as definitions from "./automation-repository/definitions.js";
import * as claims from "./automation-repository/claims.js";
import * as dispatch from "./automation-repository/dispatch.js";
import * as runs from "./automation-repository/runs.js";
import { sql } from "./automation-repository/sql.js";

export { CLAIM_STALE_MS } from "./automation-repository/claims.js";
export {
  DISPATCH_RETRY_BASE_MS,
  DISPATCH_RETRY_CAP_MS,
  DISPATCH_MAX_ATTEMPTS,
  computeRetryAt,
} from "./automation-repository/dispatch.js";
export { AutomationCreateLimitError } from "./automation-repository/definitions.js";
export class AutomationRepo {
  private readonly connection: Connection;
  constructor(dbPath?: string, startupBusyTimeoutMs?: number) {
    this.connection = new Connection(dbPath, startupBusyTimeoutMs);
  }
  async ensureReady(): Promise<void> {
    await this.connection.ensureReady();
  }
  close(options?: { throwOnError?: boolean }): void {
    this.connection.close(options);
  }
  async create(
    params: KnorviaAutomationCreateParams,
    options: {
      nextRunAt: number | null;
      lifecycleStatus?: KnorviaAutomationLifecycleStatus;
    },
  ): Promise<KnorviaAutomation> {
    validateMode(params.mode);
    await this.ensureReady();
    return definitions.create(this.connection.database(), params, options);
  }
  async list(scope?: {
    workspacePath?: string;
    workspaceIdentity?: string;
  }): Promise<KnorviaAutomation[]> {
    await this.ensureReady();
    return definitions.list(this.connection.database(), scope);
  }
  async getModelSelectionForDispatch(
    automationId: string,
    workspaceKey: string,
  ): Promise<ModelSelection | undefined> {
    await this.ensureReady();
    return definitions.getModelSelectionForDispatch(
      this.connection.database(),
      automationId,
      workspaceKey,
    );
  }
  async hasTaskBinding(scope: {
    workspacePath: string;
    workspaceIdentity?: string;
    targetTaskId: string;
  }): Promise<boolean> {
    await this.ensureReady();
    return definitions.hasTaskBinding(this.connection.database(), scope);
  }
  async get(automationId: string, workspaceKey?: string): Promise<KnorviaAutomation | null> {
    await this.ensureReady();
    const row = readAutomation(this.connection.database(), automationId, workspaceKey);
    return row ? projectAutomation(row) : null;
  }
  async getScheduledRunCount(automationId: string, workspaceKey?: string): Promise<number | null> {
    await this.ensureReady();
    return (
      readAutomation(this.connection.database(), automationId, workspaceKey)?.scheduled_run_count ??
      null
    );
  }
  async update(
    automationId: string,
    params: KnorviaAutomationUpdateParams,
    options?: {
      nextRunAt?: number | null;
      lifecycleStatus?: KnorviaAutomationLifecycleStatus;
      resetRetry?: boolean;
    },
    workspaceKey?: string,
  ): Promise<KnorviaAutomation | null> {
    validateMode(params.mode);
    await this.ensureReady();
    return definitions.update(
      this.connection.database(),
      automationId,
      params,
      options,
      workspaceKey,
    );
  }
  async delete(automationId: string, workspaceKey?: string): Promise<boolean> {
    await this.ensureReady();
    return (
      this.connection
        .database()
        .prepare(sql.delete)
        .run({ id: automationId, workspace_key: workspaceKey ?? null }).changes > 0
    );
  }
  async setEnabled(automationId: string, enabled: boolean, workspaceKey?: string): Promise<void> {
    await this.ensureReady();
    this.connection
      .database()
      .prepare(sql.enabled)
      .run({
        id: automationId,
        enabled: enabled ? 1 : 0,
        lifecycle_status: enabled ? "active" : "paused",
        now: Date.now(),
        workspace_key: workspaceKey ?? null,
      });
  }
  async restart(
    automationId: string,
    options: { nextRunAt: number | null },
    workspaceKey?: string,
  ): Promise<void> {
    await this.ensureReady();
    this.connection
      .database()
      .prepare(sql.restart)
      .run({
        id: automationId,
        next_run_at: options.nextRunAt,
        now: Date.now(),
        workspace_key: workspaceKey ?? null,
      });
  }
  async runNow(
    automationId: string,
    options: { now: number },
    workspaceKey?: string,
  ): Promise<claims.ClaimedPair | null> {
    await this.ensureReady();
    return claims.runNow(this.connection.database(), automationId, options.now, workspaceKey);
  }
  async claimDue(now: number): Promise<KnorviaAutomation[]> {
    await this.ensureReady();
    return claims.claimDue(this.connection.database(), now);
  }
  async claimManualRuns(now: number): Promise<claims.ClaimedPair[]> {
    await this.ensureReady();
    return claims.claimManualRuns(this.connection.database(), now);
  }
  async markDispatched(
    automationId: string,
    options: { dispatchedAt: number; nextRunAt: number | null },
  ): Promise<void> {
    await this.ensureReady();
    dispatch.markDispatched(this.connection.database(), automationId, options);
  }
  async markDispatchFailed(
    automationId: string,
    options: {
      failedAt: number;
      error: string;
      kind: "transient" | "permanent";
      nextRunAt?: number | null;
    },
  ): Promise<void> {
    await this.ensureReady();
    dispatch.markDispatchFailed(this.connection.database(), automationId, options);
  }
  async releaseClaim(automationId: string): Promise<void> {
    await this.ensureReady();
    this.connection.database().prepare(sql.release).run({ id: automationId, now: Date.now() });
  }
  async releaseManualClaim(automationId: string, workspaceKey: string): Promise<void> {
    await this.ensureReady();
    this.connection
      .database()
      .prepare(sql.releaseManual)
      .run({ id: automationId, workspace_key: workspaceKey, now: Date.now() });
  }
  async touchManualClaim(automationId: string, workspaceKey: string): Promise<void> {
    await this.ensureReady();
    this.connection
      .database()
      .prepare(sql.touchManual)
      .run({ id: automationId, workspace_key: workspaceKey, now: Date.now() });
  }
  async skipAndReschedule(
    params: runs.RunIdentity & { reason: string; nextRunAt: number | null; finalize?: boolean },
  ): Promise<void> {
    await this.ensureReady();
    runs.skipAndReschedule(this.connection.database(), params);
  }
  async ensureRunClaimed(params: runs.RunClaim): Promise<void> {
    await this.ensureReady();
    runs.ensureRunClaimed(this.connection.database(), params);
  }
  async upsertRunClaimed(
    params: runs.RunClaim & { modelSelection?: ModelSelection },
  ): Promise<void> {
    await this.ensureReady();
    runs.upsertRunClaimed(this.connection.database(), params);
  }
  async fixRunModelSelection(runId: string, selection: ModelSelection): Promise<ModelSelection> {
    await this.ensureReady();
    return runs.fixRunModelSelection(this.connection.database(), runId, selection);
  }
  async markRunDispatch(params: {
    runId: string;
    dispatchStatus: KnorviaAutomationRunDispatchStatus;
    sessionId?: string | null;
    error?: string | null;
  }): Promise<void> {
    await this.ensureReady();
    runs.markRunDispatch(this.connection.database(), params);
  }
  async markManualRunDispatched(params: {
    runId: string;
    sessionId?: string | null;
    dispatchedAt: number;
  }): Promise<boolean> {
    await this.ensureReady();
    return runs.markManualRunDispatched(this.connection.database(), params);
  }
  async markRunOutcome(
    runId: string,
    outcome: KnorviaAutomationRunOutcome,
    error?: string,
  ): Promise<void> {
    await this.ensureReady();
    this.connection
      .database()
      .prepare(sql.outcome)
      .run({ run_id: runId, outcome, error: error ?? null, now: Date.now() });
  }
  async listUnsettledStudioWorkflowRuns(): Promise<
    Array<{
      automationRunId: string;
      automationId: string;
      workspaceKey: string;
      scheduledAt: number | null;
      trigger: KnorviaAutomationTrigger;
      studioRunId: string;
      workflowId: string;
    }>
  > {
    await this.ensureReady();
    const rows = this.connection.database().prepare(sql.unsettled).all() as Array<{
      run_id: string;
      automation_id: string;
      workspace_key: string;
      scheduled_at: number | null;
      trigger: KnorviaAutomationTrigger;
      session_id: string;
      studio_workflow_id: string;
    }>;
    return rows.map((row) => ({
      automationRunId: row.run_id,
      automationId: row.automation_id,
      workspaceKey: row.workspace_key,
      scheduledAt: row.scheduled_at,
      trigger: row.trigger,
      studioRunId: row.session_id,
      workflowId: row.studio_workflow_id,
    }));
  }
  async recordSkippedRun(params: runs.RunClaim & { reason: string }): Promise<void> {
    await this.ensureReady();
    const now = Date.now();
    this.connection
      .database()
      .prepare(sql.skipped)
      .run({ ...runs.runBindings(params, now), trigger: params.trigger, reason: params.reason });
  }
  async listRuns(automationId: string, workspaceKey?: string): Promise<KnorviaAutomationRun[]> {
    await this.ensureReady();
    return (
      this.connection
        .database()
        .prepare(sql.runs)
        .all({ id: automationId, workspace_key: workspaceKey ?? null }) as RunRow[]
    ).map(projectRun);
  }
  async getRun(runId: string): Promise<KnorviaAutomationRun | null> {
    await this.ensureReady();
    const row = this.connection.database().prepare(sql.run).get({ run_id: runId }) as
      | RunRow
      | undefined;
    return row === undefined ? null : projectRun(row);
  }
  async deleteRun(runId: string, workspaceKey?: string): Promise<void> {
    await this.ensureReady();
    this.connection
      .database()
      .prepare(sql.deleteRun)
      .run({ run_id: runId, workspace_key: workspaceKey ?? null });
  }
  async pruneRuns(maxAgeMs: number): Promise<number> {
    await this.ensureReady();
    return Number(
      this.connection
        .database()
        .prepare(sql.prune)
        .run(Date.now() - maxAgeMs).changes ?? 0,
    );
  }
}
