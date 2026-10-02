import { type WorkspacePurpose } from "@knorvia/shared";
interface StartupWorkspaceLogger {
    info?: (...args: unknown[]) => void;
    warn?: (...args: unknown[]) => void;
}
export interface StartupWorkspaceWarmupTarget {
    workspacePath: string;
    workspaceIdentity?: string;
}
export interface StartupWindowBootstrap {
    restoreSession?: boolean;
    initialWorkspacePath?: string;
    initialWorkspacePurpose?: WorkspacePurpose;
    unavailableWorkspacePath?: string;
    agentWarmupTargets?: StartupWorkspaceWarmupTarget[];
}
export declare function createOpenWorkspaceStartupBootstrap(workspacePath: string): StartupWindowBootstrap;
export declare function resolveStartupWindowBootstrap({ settingsFile, conversationWorkspaceDir, logger, }: {
    settingsFile: string;
    conversationWorkspaceDir: string;
    logger?: StartupWorkspaceLogger;
}): Promise<StartupWindowBootstrap>;
export {};
