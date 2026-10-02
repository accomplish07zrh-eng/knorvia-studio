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
export function createPrimaryWindowCoordinator(deps: PrimaryWindowCoordinatorDeps): {
  ensurePrimaryWindow: (reason: string) => Promise<void>;
} {
  let pendingEnsurePromise: Promise<void> | null = null;
  const reveal = (): boolean => {
    for (const window of deps.listWindows()) {
      if (window.isDestroyed()) continue;
      const crashed = Boolean(window.isRendererCrashed?.() || window.webContents?.isCrashed?.());
      if (crashed) {
        window.destroy?.();
        deps.logger.info("[primary-window] discarded crashed renderer window");
        continue;
      }
      if (window.isMinimized?.()) window.restore?.();
      if (!window.isVisible()) window.show();
      window.focus?.();
      return true;
    }
    return false;
  };
  return {
    async ensurePrimaryWindow(reason: string): Promise<void> {
      if (deps.canCreateWindow && !deps.canCreateWindow(reason)) {
        deps.logger.info(`[primary-window] window creation blocked (${reason})`);
        return;
      }
      if (reveal()) {
        deps.logger.info(`[primary-window] reused existing window (${reason})`);
        return;
      }
      if (pendingEnsurePromise) {
        deps.logger.info(`[primary-window] window creation already pending (${reason})`);
        return pendingEnsurePromise;
      }
      deps.logger.info(`[primary-window] creating main window (${reason})`);
      pendingEnsurePromise = deps
        .resolveStartupWindowBootstrap()
        .then((startupBootstrap) => {
          if (reveal()) {
            deps.logger.info(`[primary-window] window became available before create (${reason})`);
            return;
          }
          deps.createWindow(startupBootstrap);
        })
        .finally(() => {
          pendingEnsurePromise = null;
        });
      return pendingEnsurePromise;
    },
  };
}
