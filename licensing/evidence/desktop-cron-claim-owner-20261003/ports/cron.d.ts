import type { KnorviaAutomationRunOutcome, KnorviaAutomationTrigger } from "@knorvia/shared";
interface CronRunLifecycleRepo {
    ensureRunClaimed(params: {
        runId: string;
        automationId: string;
        workspaceKey: string;
        scheduledAt: number | null;
        trigger: KnorviaAutomationTrigger;
    }): Promise<void>;
    markRunOutcome(runId: string, outcome: KnorviaAutomationRunOutcome, error?: string): Promise<void>;
    markRunDispatch(params: {
        runId: string;
        dispatchStatus: "failed_to_dispatch";
        error: string;
    }): Promise<void>;
    touchManualClaim(automationId: string, workspaceKey: string): Promise<void>;
    releaseManualClaim(automationId: string, workspaceKey: string): Promise<void>;
}
interface CronRunLifecycleIdentity {
    runId: string;
    automationId: string;
    workspaceKey: string;
    scheduledAt: number | null;
    trigger: KnorviaAutomationTrigger;
}
type LogWarn = (message: string, error: unknown) => void;
export declare function startManualClaimHeartbeat(params: Pick<CronRunLifecycleIdentity, "automationId" | "runId" | "workspaceKey"> & {
    repo: Pick<CronRunLifecycleRepo, "touchManualClaim">;
    logWarn: LogWarn;
    intervalMs?: number;
}): {
    dispose(): void;
};
export declare function recordCronRunOutcomeBestEffort(params: CronRunLifecycleIdentity & {
    repo: CronRunLifecycleRepo;
    outcome: KnorviaAutomationRunOutcome;
    error?: string;
    logWarn: LogWarn;
}): Promise<void>;
/** 派发失败清理永不覆盖调用方持有的原始 dispatch error。 */
export declare function settleManualDispatchFailureBestEffort(params: CronRunLifecycleIdentity & {
    repo: CronRunLifecycleRepo;
    dispatchError: unknown;
    logWarn: LogWarn;
}): Promise<void>;
/** manual claim 覆盖 queue 等待和 turn 执行，只能在真实终态后释放。 */
export declare function settleCronRunTerminalOutcome(params: CronRunLifecycleIdentity & {
    repo: CronRunLifecycleRepo;
    outcome: Exclude<KnorviaAutomationRunOutcome, "running">;
    error?: string;
    logWarn: LogWarn;
}): Promise<void>;
export {};
