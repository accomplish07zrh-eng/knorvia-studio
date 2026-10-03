import type { EnvInfo, ExecutionShellSelection, TraceContext } from "../deps.js";
import type { AgentRuntimeInternal } from "../internal.js";
import type { AgentRuntimeConfig } from "../types.js";
import { type BashShellSnapshotRestore } from "./bash-shell-snapshot.js";
type SessionShellConfig = Pick<AgentRuntimeConfig, "bashShellSelection">;
export type SessionShellEnvironmentCandidate = ExecutionShellSelection | (() => ExecutionShellSelection);
interface SessionShellEnvironment {
    selection: ExecutionShellSelection;
    promptShell: string;
}
export declare function getSessionShellSelectionFromConfig(config: SessionShellConfig): ExecutionShellSelection | undefined;
export declare function getSessionShellEnvironment(runtime: AgentRuntimeInternal): SessionShellEnvironment | undefined;
export declare function getSessionShellSelection(runtime: AgentRuntimeInternal): ExecutionShellSelection | undefined;
export declare function getContextSourceShellDisplayName(runtime: AgentRuntimeInternal): string | undefined;
export declare function initializeSessionShellEnvironmentIfNeeded(runtime: AgentRuntimeInternal, candidate: SessionShellEnvironmentCandidate): boolean;
export declare function persistSessionShellEnvironmentSnapshot(runtime: AgentRuntimeInternal, traceContext: TraceContext): Promise<void>;
export declare function restoreSessionShellEnvironmentSelectionForResume(runtime: AgentRuntimeInternal, options: {
    currentSelection: ExecutionShellSelection | undefined;
    traceContext: TraceContext;
}): Promise<BashShellSnapshotRestore>;
export declare function announceSessionShellEnvironmentNoticeAfterResume(runtime: AgentRuntimeInternal, options: {
    persistedEnvInfo: EnvInfo | undefined;
    restore: BashShellSnapshotRestore;
}): void;
export {};
