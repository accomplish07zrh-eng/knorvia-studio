import type { IStudioRuntimeService, StudioRun } from "@knorvia/services";
import type { AutomationRepo } from "@knorvia/services/node";
import type { KnorviaAutomationRunOutcome, KnorviaAutomationTrigger } from "@knorvia/shared";
import { settleCronRunTerminalOutcome, startManualClaimHeartbeat } from "./cronRunLifecycle.js";

export interface StudioScheduledRun {
  automationRunId: string;
  automationId: string;
  workspaceKey: string;
  scheduledAt: number | null;
  trigger: KnorviaAutomationTrigger;
  studioRunId: string;
  workflowId: string;
}

const terminal = new Set(["succeeded", "failed", "cancelled", "interrupted"]);
function outcome(run: StudioRun): KnorviaAutomationRunOutcome {
  if (run.state === "succeeded") return "succeeded";
  if (run.state === "cancelled") return "stopped";
  if (run.state === "interrupted") return "interrupted";
  return "failed";
}

/** Observes accepted Studio runs, including runs restored after a Host restart. */
export class StudioScheduleOutcomeObserver {
  private readonly subscriptions = new Map<string, { dispose(): void }>();
  private disposed = false;
  private readonly timer: ReturnType<typeof setInterval>;

  constructor(
    private readonly service: Pick<IStudioRuntimeService, "timeline" | "onDidChange">,
    private readonly repo: Pick<AutomationRepo,
      "ensureRunClaimed" | "markRunOutcome" | "touchManualClaim" |
      "releaseManualClaim" | "markRunDispatch" | "listUnsettledStudioWorkflowRuns">,
    private readonly log: (message: string, error: unknown) => void,
  ) {
    this.timer = setInterval(() => void this.recover(), 30_000);
    this.timer.unref?.();
  }

  async recover() {
    if (this.disposed) return;
    try {
      for (const item of await this.repo.listUnsettledStudioWorkflowRuns())
        this.observe(item);
    } catch (error) {
      this.log("Studio 工作流计划结果恢复失败", error);
    }
  }

  observe(item: StudioScheduledRun) {
    const { automationRunId, workflowId, studioRunId } = item;
    if (this.disposed || this.subscriptions.has(automationRunId)) return;
    let checking = false;
    let again = false;
    const check = async () => {
      if (checking) {
        again = true;
        return;
      }
      checking = true;
      try {
        const run = (await this.service.timeline(workflowId)).runs.find(
          (item) => item.id === studioRunId,
        );
        if (this.disposed) return;
        if (run && terminal.has(run.state)) {
          await settleCronRunTerminalOutcome({
            runId: automationRunId,
            automationId: item.automationId,
            workspaceKey: item.workspaceKey,
            scheduledAt: item.scheduledAt,
            trigger: item.trigger,
            outcome: outcome(run) as Exclude<KnorviaAutomationRunOutcome, "running">,
            error: run.error,
            repo: this.repo,
            logWarn: this.log,
          });
          this.subscriptions.get(automationRunId)?.dispose();
          this.subscriptions.delete(automationRunId);
        }
      } catch (error) {
        this.log("Studio 工作流计划结果读取失败", error);
      } finally {
        checking = false;
        if (again && !this.disposed && this.subscriptions.has(automationRunId)) {
          again = false;
          void check();
        }
      }
    };
    const subscription = this.service.onDidChange(() => void check());
    const heartbeat = item.trigger === "manual"
      ? startManualClaimHeartbeat({
          automationId: item.automationId,
          runId: automationRunId,
          workspaceKey: item.workspaceKey,
          repo: this.repo,
          logWarn: this.log,
        })
      : null;
    this.subscriptions.set(automationRunId, {
      dispose() { subscription.dispose(); heartbeat?.dispose(); },
    });
    void check();
  }

  dispose() {
    if (this.disposed) return;
    this.disposed = true;
    clearInterval(this.timer);
    for (const subscription of this.subscriptions.values()) subscription.dispose();
    this.subscriptions.clear();
  }
}
