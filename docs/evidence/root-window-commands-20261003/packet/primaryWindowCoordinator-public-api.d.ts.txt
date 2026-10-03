import type { StartupWindowBootstrap } from "./startupWorkspace.js";
interface WindowLike {
    destroy?(): void;
    isDestroyed(): boolean;
    isVisible(): boolean;
    isMinimized?(): boolean;
    isRendererCrashed?(): boolean;
    webContents?: {
        isCrashed?: () => boolean;
    };
    restore?(): void;
    show(): void;
    focus?(): void;
}
interface PrimaryWindowCoordinatorDeps {
    listWindows(): WindowLike[];
    resolveStartupWindowBootstrap(): Promise<StartupWindowBootstrap>;
    createWindow(startupBootstrap: StartupWindowBootstrap): void;
    canCreateWindow?: (reason: string) => boolean;
    logger: {
        info(message: string): void;
    };
}
export declare function createPrimaryWindowCoordinator(deps: PrimaryWindowCoordinatorDeps): {
    ensurePrimaryWindow: (reason: string) => unknown;
};
export {};
