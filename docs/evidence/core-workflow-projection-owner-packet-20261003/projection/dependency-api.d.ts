// Selected public reference types/ports only; opaque actual schemas and helpers, no standalone semantic closure.
// Original public port/type owner: apps/cli/packages/contracts/src/interfaces/dynamic-workflow-run-roster.port.ts
export interface DynamicWorkflowRunHealth {
    lastProgressAt?: number;
    stalledSince?: number;
    concurrency?: DynamicWorkflowRunConcurrencyHealth;
    consecutiveFailures: number;
    cachedSteps: number;
    leftoverRunning?: number;
    pendingQuestionsKnown: boolean;
}
export interface DynamicWorkflowRunConcurrencyHealth {
    effective: number;
    cap: number;
    reason?: string;
    since?: number;
}
export interface DynamicWorkflowRunPhaseView {
    name: string;
    state: DynamicWorkflowRunPhaseState;
    rounds: number;
    nodesSettled: number;
    nodesRunning: number;
    enteredAt?: number;
    exitedAt?: number;
}
export type DynamicWorkflowRunPhaseState = "done" | "current" | "ahead" | "unfinished";
export interface DynamicWorkflowRunSubagentAsk {
    siteId: string;
    ordinal: number;
    actorSeq?: number;
    instructionsHead?: string;
    startedAt?: number;
    turn?: number;
    toolCalls?: number;
    lastTool?: DynamicWorkflowRunSubagentLastTool;
}
export interface DynamicWorkflowRunSubagentLastTool {
    name: string;
    target?: string;
    at?: number;
}
export interface DynamicWorkflowRunSubagentView {
    siteId: string;
    ordinal: number;
    name?: string;
    state: DynamicWorkflowRunSubagentState;
    phaseName?: string;
    currentAsk?: DynamicWorkflowRunSubagentAsk;
    wait?: DynamicWorkflowRunSubagentWait;
    parkedOn?: string;
    stepsSettled: number;
    stepsFailed: number;
    tokens: number;
    lastProgressAt?: number;
}
export type DynamicWorkflowRunSubagentState = "idle" | "executing" | "waiting" | "parked" | "done" | "failed" | "unfinished";
export interface DynamicWorkflowRunSubagentWait {
    cause: "slot" | "backoff";
    reason?: string;
    retryAfterMs?: number;
    since?: number;
}

// Original public port/type owner: apps/cli/packages/contracts/src/tools/get-workflow-run-roster.ts
import { z } from "zod";
export type GetWorkflowRunHealth = z.infer<typeof GetWorkflowRunHealthSchema>;
export declare const GetWorkflowRunHealthSchema: any;
export type GetWorkflowRunPhase = z.infer<typeof GetWorkflowRunPhaseSchema>;
export declare const GetWorkflowRunPhaseSchema: any;
export type GetWorkflowRunSubagent = z.infer<typeof GetWorkflowRunSubagentSchema>;
export declare const GetWorkflowRunSubagentSchema: any;
export type GetWorkflowRunSubagentAsk = z.infer<typeof GetWorkflowRunSubagentAskSchema>;
export declare const GetWorkflowRunSubagentAskSchema: any;
export declare const GET_WORKFLOW_RUN_ROSTER_LIMITS: {
    readonly maxPhases: 32;
    readonly maxPhaseNameLength: 128;
    readonly maxSubagents: 64;
    readonly maxActorNameLength: 128;
    readonly maxInstructionsHeadLength: 240;
    readonly maxLastToolNameLength: 64;
    readonly maxLastToolTargetLength: 120;
    readonly maxWaitReasonLength: 240;
};

