import type { BrowserWindow } from "electron";
import { type ExternalWorkspaceOpenDialogCopy } from "./desktopWorkspaceDeepLink.js";
import { type StartupWindowBootstrap } from "./startupWorkspace.js";
export type ExplicitStartupWorkspaceSource = "open-workspace-arg" | "deep-link";
export interface ExplicitStartupWorkspaceRequest {
    path: string;
    source: ExplicitStartupWorkspaceSource;
}
interface StartupDeepLinkConsumptionGate {
    markStartupRequestConsumed: (request: ExplicitStartupWorkspaceRequest) => void;
    shouldHandleReadyProtocolUrl: (protocolUrl: string | null) => boolean;
}
interface ResolveExplicitStartupWorkspaceBootstrapDeps {
    logger: {
        info: (...args: unknown[]) => void;
        warn: (...args: unknown[]) => void;
    };
    confirmationCopy?: ExternalWorkspaceOpenDialogCopy;
    parentWindow?: BrowserWindow | null;
}
export declare function createStartupDeepLinkConsumptionGate(startupProtocolUrl: string | null): StartupDeepLinkConsumptionGate;
export declare function resolveExplicitStartupWorkspaceBootstrap(request: ExplicitStartupWorkspaceRequest, deps: ResolveExplicitStartupWorkspaceBootstrapDeps): StartupWindowBootstrap | null;
export {};
