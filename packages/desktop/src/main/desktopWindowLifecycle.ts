import { getDatabaseStartupPortPayload } from "./databaseStartupRelay.js";
import { randomUUID } from "node:crypto";
import { app, BrowserWindow, dialog, Menu, MessageChannelMain } from "electron";
import type { UtilityProcess as ElectronUtilityProcess } from "electron";
import { HostMessageTypes, InternalChannels, PlatformChannels, type Locale } from "@knorvia/shared";
import { createBrowserWindow } from "./desktopWindowChrome.js";
import type { HostInitMessage, WindowBootstrapOptions } from "./desktopHostProcess.js";
import type { StartupWorkspaceWarmupTarget } from "./startupWorkspace.js";
import { handleDarwinWindowCloseRequest } from "./desktopDarwinCloseBehavior.js";
import { createUnsavedChangesGuard, unsavedChangesDialogOptions } from "./desktopUnsavedChanges.js";
import {
  parseWindowUnreadCount,
  sumWindowUnreadCounts,
  syncAppUnreadBadge,
} from "./unreadBadge.js";
import { attachDesktopWindowSizePersistence, type DesktopWindowSize } from "./desktopWindowSize.js";
import {
  registerMainApplicationWindow,
  unregisterMainApplicationWindow,
} from "./resourceManagerWindow.js";
export function createWindow(options: {
  iconPath: string;
  preloadPath: string;
  logger: {
    info: (...args: unknown[]) => void;
    warn: (...args: unknown[]) => void;
  };
  forceQuitRef: {
    current: boolean;
  };
  handleBeforeClose?: (win: BrowserWindow, label: string) => boolean;
  onUnloadCancelled?: () => void;
  windowHostProcessMap: Map<number, ElectronUtilityProcess>;
  spawnHostProcess: (
    win: BrowserWindow,
    label: string,
    initMessage: Omit<HostInitMessage, "knorviaBuiltinProviderConfigFilePath">,
  ) => ElectronUtilityProcess;
  disposeHostProcess: (
    child: ElectronUtilityProcess,
    label: string,
    forceKillDelayMs?: number,
  ) => void;
  disposeRemoteWorkspaceSessionsForWindow: (windowId: number, reason: string) => void;
  reattachRemoteWorkspaceSessionsForWindow: (win: BrowserWindow, reason: string) => void;
  bootstrap?: WindowBootstrapOptions;
  agentWarmupTargets?: readonly StartupWorkspaceWarmupTarget[];
  agentSpawnFallbackCwd: string;
  deviceMid: string;
  initialDesktopZoomLevel?: number;
  initialWindowSize?: DesktopWindowSize;
  currentApplicationLocale?: () => Locale;
  persistWindowSize?: (state: DesktopWindowSize) => Promise<void>;
  runtimeProcessEnvPatchPromise?: Promise<Record<string, string>>;
  runtimeProcessEnvFallbackPatch: Record<string, string>;
  runtimeProcessEnvWaitTimeoutMs?: number;
  awaitFirstHostSpawnDecision?: () => Promise<void>;
  onHostProcessReady?: (windowKey: number) => void;
  resolveBrowserViewOwner?: Parameters<typeof createBrowserWindow>[0]["resolveBrowserViewOwner"];
}): BrowserWindow {
  const win = createBrowserWindow({
    iconPath: options.iconPath,
    preloadPath: options.preloadPath,
    bootstrap: {
      restoreSession: options.bootstrap?.restoreSession ?? true,
      supportsSettings: options.bootstrap?.supportsSettings ?? true,
      initialWorkspacePath: options.bootstrap?.initialWorkspacePath,
      initialWorkspacePurpose: options.bootstrap?.initialWorkspacePurpose,
      unavailableWorkspacePath: options.bootstrap?.unavailableWorkspacePath,
    },
    logger: options.logger,
    deviceMid: options.deviceMid,
    initialDesktopZoomLevel: options.initialDesktopZoomLevel,
    initialWindowSize: options.initialWindowSize,
    currentApplicationLocale: options.currentApplicationLocale,
    resolveBrowserViewOwner: options.resolveBrowserViewOwner,
  });
  const label = `local-${win.webContents.id}`;
  win.webContents.on(
    "will-prevent-unload",
    createUnsavedChangesGuard({
      confirm: () => {
        if (win.isMinimized()) win.restore();
        win.show();
        win.focus();
        return (
          dialog.showMessageBoxSync(
            win,
            unsavedChangesDialogOptions(options.currentApplicationLocale?.() ?? "en-US"),
          ) === 1
        );
      },
      stay: () => options.onUnloadCancelled?.(),
      onError: (error) =>
        options.logger.warn("[desktop-window] unsaved draft confirmation failed", error),
    }),
  );
  if (options.persistWindowSize)
    attachDesktopWindowSizePersistence(win, options.persistWindowSize, (error) =>
      options.logger.warn("[desktop-window] failed to persist main window size", error),
    );
  if (process.platform === "darwin")
    win.on("close", (event) => {
      if (
        handleDarwinWindowCloseRequest({
          win,
          forceQuit: options.forceQuitRef.current,
          label,
          logger: options.logger,
        })
      )
        event.preventDefault();
    });
  else if (options.handleBeforeClose)
    win.on("close", (event) => {
      if (options.handleBeforeClose?.(win, label)) event.preventDefault();
    });
  const rendererId = win.webContents.id;
  registerMainApplicationWindow(rendererId);
  let generation = 0;
  let cancelWait: (() => void) | undefined;
  win.webContents.on("dom-ready", async () => {
    cancelWait?.();
    cancelWait = undefined;
    const current = ++generation;
    options.logger.info(`[createWindow] dom-ready fired (${label})`);
    if (process.platform === "win32" && !win.isDestroyed()) {
      win.show();
      win.focus();
    }
    const old = options.windowHostProcessMap.get(rendererId);
    if (old && old.pid !== undefined) {
      try {
        const startup = getDatabaseStartupPortPayload(old);
        if (!startup) throw new Error("Previous Host startup binding is unavailable");
        const { port1, port2 } = new MessageChannelMain();
        old.postMessage(
          {
            type: HostMessageTypes.AttachServicePort,
            requestId: randomUUID(),
            attachmentId: randomUUID(),
            clientMode: "desktop-continuous",
            scope: { kind: "local" },
          },
          [port2],
        );
        win.webContents.postMessage(InternalChannels.ServicePort, startup, [port1]);
        options.logger.info(
          `[createWindow] renderer reloaded, reattached to existing host (${label}), pid=${old.pid}`,
        );
        options.reattachRemoteWorkspaceSessionsForWindow(win, `${label}:renderer-reload`);
        return;
      } catch (error) {
        options.logger.warn(
          `[createWindow] reattach to existing host failed (${label}), falling back to respawn:`,
          error,
        );
      }
    }
    if (old) {
      options.logger.info(
        `[createWindow] killing previous host process for (${label}), pid=${old.pid ?? "unknown"}`,
      );
      options.disposeHostProcess(old, `${label}:reload`, 150);
    }
    if (options.awaitFirstHostSpawnDecision) await options.awaitFirstHostSpawnDecision();
    const spawn = (patch: Record<string, string>) => {
      if (current !== generation || win.isDestroyed()) return;
      const warmup = options.agentWarmupTargets?.[0];
      const child = options.spawnHostProcess(win, label, {
        type: HostMessageTypes.InitLocal,
        deviceMid: options.deviceMid,
        workspacePath: warmup?.workspacePath,
        workspaceIdentity: warmup?.workspaceIdentity,
        ...(options.agentWarmupTargets && options.agentWarmupTargets.length > 0
          ? { agentWarmupTargets: [...options.agentWarmupTargets] }
          : {}),
        runtimeProcessEnvPatch: patch,
        agentSpawnFallbackCwd: options.agentSpawnFallbackCwd,
      });
      options.windowHostProcessMap.set(rendererId, child);
      options.onHostProcessReady?.(rendererId);
      options.reattachRemoteWorkspaceSessionsForWindow(win, `${label}:renderer-ready`);
    };
    if (!options.runtimeProcessEnvPatchPromise) {
      spawn(options.runtimeProcessEnvFallbackPatch);
      return;
    }
    let settled = false;
    const timeoutMs = options.runtimeProcessEnvWaitTimeoutMs ?? 4500;
    let timer: ReturnType<typeof setTimeout> | null = null;
    const cancel = () => {
      if (settled) return;
      settled = true;
      if (timer) clearTimeout(timer);
    };
    const complete = (patch: Record<string, string>) => {
      if (settled) return;
      settled = true;
      if (timer) clearTimeout(timer);
      if (cancelWait === cancel) cancelWait = undefined;
      spawn(patch);
    };
    cancelWait = cancel;
    timer = setTimeout(() => {
      options.logger.warn(
        `[createWindow] runtime env prewarm exceeded ${timeoutMs}ms after dom-ready (${label}), using shell-free fallback`,
      );
      complete(options.runtimeProcessEnvFallbackPatch);
    }, timeoutMs);
    void options.runtimeProcessEnvPatchPromise.then(complete, (error) => {
      options.logger.warn(
        `[createWindow] runtime env prewarm failed (${label}), using shell-free fallback:`,
        error,
      );
      complete(options.runtimeProcessEnvFallbackPatch);
    });
  });
  win.on("closed", () => {
    unregisterMainApplicationWindow(rendererId);
    cancelWait?.();
    cancelWait = undefined;
    options.logger.info(`[createWindow] window closed, killing host process (${label})`);
    const child = options.windowHostProcessMap.get(rendererId);
    if (child) {
      options.disposeHostProcess(child, `${label}:window-closed`);
      options.windowHostProcessMap.delete(rendererId);
    }
    options.disposeRemoteWorkspaceSessionsForWindow(rendererId, `${label}:window-closed`);
  });
  return win;
}
export function showCurrentWindowFromDock(primaryWindowCoordinator: {
  ensurePrimaryWindow(reason: string): Promise<void>;
}): void {
  if (process.platform === "darwin") app.show();
  void primaryWindowCoordinator.ensurePrimaryWindow("dock-show-current-window");
}
export function focusWorkspaceInExistingWindow(
  path: string,
  windowWorkspaceMap: Map<number, Set<string>>,
  options?: {
    skipWindowId?: number;
  },
): {
  activated: boolean;
  winId?: number;
} {
  for (const [windowId, paths] of windowWorkspaceMap) {
    if (windowId === options?.skipWindowId || !paths.has(path)) continue;
    const win = BrowserWindow.fromId(windowId);
    if (!win || win.isDestroyed()) {
      windowWorkspaceMap.delete(windowId);
      continue;
    }
    if (win.isMinimized()) win.restore();
    win.focus();
    win.webContents.send(PlatformChannels.FocusTab, path);
    return { activated: true, winId: windowId };
  }
  return { activated: false };
}
export function syncApplicationUnreadBadge(windowUnreadCountMap: Map<number, number>): void {
  syncAppUnreadBadge({
    platform: process.platform,
    totalUnreadCount: sumWindowUnreadCounts(windowUnreadCountMap),
    setBadgeCount: (count) => {
      app.setBadgeCount(count);
    },
  });
}
export function handleWindowUnreadCountSync(
  win: BrowserWindow | null,
  payload: unknown,
  windowUnreadCountMap: Map<number, number>,
  logger: {
    warn: (...args: unknown[]) => void;
  },
): boolean {
  const count = parseWindowUnreadCount(payload);
  if (count == null) {
    logger.warn("[sync-window-unread-count] invalid payload:", payload);
    return false;
  }
  if (!win) return false;
  if (count === 0) windowUnreadCountMap.delete(win.id);
  else windowUnreadCountMap.set(win.id, count);
  syncApplicationUnreadBadge(windowUnreadCountMap);
  return true;
}
export function configureDockMenu(getLabel: () => string, onShowCurrentWindow: () => void): void {
  if (process.platform !== "darwin" || app.dock == null) return;
  const menu = Menu.buildFromTemplate([{ label: getLabel(), click: onShowCurrentWindow }]);
  app.dock.setMenu(menu);
}
export function handleDesktopWindowCloseRequest(options: {
  platform: NodeJS.Platform;
  forceQuit: boolean;
  explicitQuitRequested?: boolean;
  closeToTrayOnWindows?: boolean;
  isLastWindow: boolean;
  label: string;
  logger: {
    info: (...args: unknown[]) => void;
  };
  shouldConfirmQuit?: boolean;
  confirmQuit: () => boolean;
  requestQuit: () => void;
  hideWindow?: () => void;
}): boolean {
  if (
    options.platform === "win32" &&
    options.closeToTrayOnWindows &&
    !options.forceQuit &&
    !options.explicitQuitRequested
  ) {
    options.logger.info(`[createWindow] window close hidden to tray (${options.label})`);
    options.hideWindow?.();
    return true;
  }
  if (options.platform === "darwin" || options.forceQuit || !options.isLastWindow) return false;
  if (options.shouldConfirmQuit === false) {
    options.logger.info(
      `[createWindow] last window close skipped confirmation, quitting app (${options.label})`,
    );
    options.requestQuit();
    return true;
  }
  if (!options.confirmQuit()) {
    options.logger.info(`[createWindow] last window close canceled by user (${options.label})`);
    return true;
  }
  options.logger.info(
    `[createWindow] last window close confirmed, quitting app (${options.label})`,
  );
  options.requestQuit();
  return true;
}
