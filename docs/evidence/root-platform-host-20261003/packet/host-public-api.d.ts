import { BrowserWindow } from "electron";
import type { MessagePortMain, UtilityProcess as ElectronUtilityProcess } from "electron";
import { type HostAgentProcessErrorResponse, type HostAgentProcessExceptionResponse, type HostAgentProcessExitedResponse, type HostAgentProcessReadyResponse, type HostAgentProcessSpawnedResponse, type HostCuaOperationStateResponse, type HostMcpTelemetryResponse, type HostSessionCreateTelemetryResponse, type TaskRealtimeHostDeliveryKind, HostMessageTypes, InternalChannels, type WorkspacePurpose } from "@knorvia/shared";
import { BroadcastHub } from "./broadcastHub.js";
import type { TaskRealtimeBus } from "./taskRealtimeBus.js";
export interface WindowBootstrapOptions {
    restoreSession?: boolean;
    supportsSettings?: boolean;
    initialWorkspacePath?: string;
    initialWorkspacePurpose?: WorkspacePurpose;
    unavailableWorkspacePath?: string;
    windowKind?: "main" | "update-status";
    locale?: string;
}
export interface HostInitMessage {
    type: typeof HostMessageTypes.InitLocal;
    hostId?: string;
    databaseStartupId?: string;
    deliveryKind?: TaskRealtimeHostDeliveryKind;
    deviceMid?: string;
    workspacePath?: string;
    workspaceIdentity?: string;
    agentWarmupTargets?: Array<{
        workspacePath: string;
        workspaceIdentity?: string;
    }>;
    agentSpawnFallbackCwd?: string;
    knorviaBuiltinProviderConfigFilePath: string;
    runtimeProcessEnvPatch?: Record<string, string>;
}
interface SpawnHostProcessOptions {
    internalChannel?: typeof InternalChannels.ServicePort | typeof InternalChannels.ScopedServicePort;
    internalPayload?: unknown;
    registerBroadcast?: boolean;
    taskRealtime?: {
        workspaceKeys: Iterable<string>;
        deliveryKind?: TaskRealtimeHostDeliveryKind;
        onHostId?: (hostId: string) => void;
    };
    onPortReady?: (port: MessagePortMain) => void;
    attachInitialServicePort?: boolean;
}
export declare function listDisposingHostProcesses(): ElectronUtilityProcess[];
export declare function loadWindow(win: BrowserWindow, bootstrap?: WindowBootstrapOptions): Promise<void>;
export declare function spawnHostProcess(win: BrowserWindow, label: string, initMessage: HostInitMessage, dependencies: {
    hostProcessLocalEnv: Record<string, string>;
    desktopContextPromptEnabled?: () => boolean;
    logger: {
        info: (...args: unknown[]) => void;
        warn: (...args: unknown[]) => void;
    };
    broadcastHub: BroadcastHub;
    taskRealtimeBus?: TaskRealtimeBus;
    windowHostProcessMap: Map<number, ElectronUtilityProcess>;
    hostRunningTaskCountMap: Map<ElectronUtilityProcess, number>;
    onWorkspaceRunningTaskCountChanged?: (child: ElectronUtilityProcess, event: {
        workspacePath: string;
        workspaceIdentity?: string;
        runningTaskCount: number;
    }) => void;
    onAgentProcessExited?: (event: HostAgentProcessExitedResponse) => void;
    onAgentProcessError?: (event: HostAgentProcessErrorResponse) => void;
    onAgentProcessException?: (event: HostAgentProcessExceptionResponse) => void;
    onAgentProcessReady?: (event: HostAgentProcessReadyResponse) => void;
    onAgentProcessSpawned?: (event: HostAgentProcessSpawnedResponse) => void;
    onMcpTelemetry?: (event: HostMcpTelemetryResponse) => void;
    onSessionCreateTelemetry?: (event: HostSessionCreateTelemetryResponse) => void;
    onCuaOperationStateChanged?: (source: ElectronUtilityProcess, event: HostCuaOperationStateResponse) => void;
    onCuaOperationStateSourceExited?: (source: ElectronUtilityProcess) => void;
    onCronRunResult?: (result: {
        runId: string;
        ok: boolean;
        taskId?: string;
        sessionId?: string;
        error?: string;
        failureKind?: "transient" | "permanent";
    }) => void;
    onOffPeakRunResult?: (result: {
        offPeakTaskId: string;
        ok: boolean;
        conversationId?: string;
        sessionId?: string;
        error?: string;
        failureKind?: "transient" | "permanent";
    }) => void;
    onCronSchedulerWakeRequested?: (automationId: string) => void;
    onOffPeakSchedulerWakeRequested?: (offPeakTaskId?: string) => void;
    handleBrowserExecuteRequest?: (params: {
        win: BrowserWindow;
        requestId: string;
        browserId?: string;
        browserGeneration?: number;
        sessionId: string;
        turnId?: string;
        workspaceKey?: string;
        workspacePath?: string;
        workspaceIdentity?: string;
        remoteSessionId?: string;
        clientMode?: "desktop-continuous" | "web-remote-replayable";
        sessionContext?: "live" | "cached";
        command: unknown;
    }) => Promise<{
        ok: boolean;
        [k: string]: unknown;
    }>;
    authorizeLocalMediaPreviewPath?: (path: string) => Promise<string>;
}, options?: SpawnHostProcessOptions): ElectronUtilityProcess;
export declare function disposeHostProcess(child: ElectronUtilityProcess, label: string, disposingHostProcessTimers: WeakMap<ElectronUtilityProcess, ReturnType<typeof setTimeout>>, logger: {
    info: (...args: unknown[]) => void;
    warn: (...args: unknown[]) => void;
}, forceKillDelayMs?: number): void;
export declare function disposeHostProcessAndWait(child: ElectronUtilityProcess, label: string, disposingHostProcessTimers: WeakMap<ElectronUtilityProcess, ReturnType<typeof setTimeout>>, logger: {
    info: (...args: unknown[]) => void;
    warn: (...args: unknown[]) => void;
}, options?: {
    forceKillDelayMs?: number;
    waitTimeoutMs?: number;
}): Promise<void>;
export {};
