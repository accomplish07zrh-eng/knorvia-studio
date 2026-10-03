import type { UtilityProcess as ElectronUtilityProcess } from "electron";
export interface CronRunResultPayload {
    runId: string;
    ok: boolean;
    taskId?: string;
    sessionId?: string;
    error?: string;
    failureKind?: "transient" | "permanent";
}
export interface OffPeakRunResultPayload {
    offPeakTaskId: string;
    ok: boolean;
    conversationId?: string;
    sessionId?: string;
    error?: string;
    failureKind?: "transient" | "permanent";
}
interface CronSchedulerDeps {
    hostProcessLocalEnv: Record<string, string>;
    logger: {
        info: (...args: unknown[]) => void;
        warn: (...args: unknown[]) => void;
        error: (...args: unknown[]) => void;
    };
    resolveDispatchHost: () => ElectronUtilityProcess | null;
    onOffPeakActiveCountChanged?: (count: number) => void;
}
export interface CronSchedulerHandle {
    handleCronRunResult: (result: CronRunResultPayload) => void;
    handleOffPeakRunResult: (result: OffPeakRunResultPayload) => void;
    wake: (automationId: string) => void;
    dispose: () => Promise<void>;
}
export declare function spawnCronScheduler(deps: CronSchedulerDeps): CronSchedulerHandle;
export {};
