/* eslint-disable max-lines */
import { desktopProfile } from "./desktopEarlyDataBaseDirBootstrap.js";

import "./desktopEarlyChromiumHardwareAccelerationBootstrap.js";
import { powerSaveBlocker } from "electron";
import { crashCapturePaths } from "./appCrashCaptureBootstrap.js";

import {
  onLocalDatabaseStartupReady,
  configureDatabaseStartupQuit,
} from "./databaseStartupRelay.js";

import {
  createDesktopContextPromptRollout,
  createElectronDesktopContextPromptConfigFetcher,
} from "./desktopContextPromptRollout.js";
import { buildBrowserViewCloseTabNotification } from "./browserView/browserCloseTabNotification.js";
import { BrowserGuestManager } from "./browserView/browserGuestManager.js";
import { createElectronBrowserWebmRecorder } from "./browserView/electronBrowserWebmRecorder.js";
import { installBrowserRestoreBootstrapProtocol } from "./browserView/browserRestoreBootstrapProtocol.js";
import {
  createLocalMediaPreviewPathRegistry,
  installLocalMediaPreviewProtocol,
  registerLocalMediaPreviewScheme,
} from "./localMediaPreviewProtocol.js";
import { createDesktopBrowserScreenshotSurfaceCoordinator } from "./browserView/browserScreenshotSurfaceCoordinatorWiring.js";
import { EMBEDDED_BROWSER_PARTITION } from "./browserDataManager.js";
import { EmbeddedBrowserJavaScriptDialogController } from "./embeddedBrowserJavaScriptDialog.js";
import {
  browserOperationResetsResizeBaseline,
  resolveBrowserOperationTabId,
} from "./browserView/browserOperationIndicator.js";
import {
  app,
  BrowserWindow,
  dialog,
  ipcMain,
  nativeImage,
  Notification,
  protocol,
  session,
  webContents,
} from "electron";
import type { UtilityProcess as ElectronUtilityProcess } from "electron";
import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { join } from "node:path";

import {
  createSettingService,
  buildRuntimeProcessEnvPatch,
  captureLoginShellEnvSnapshot,
  getConversationWorkspaceDir,
  normalizeRuntimeProcessEnv,
} from "@knorvia/services/node";
import {
  desktopMenuMessageIds,
  type Locale,
  type AppSettings,
  PlatformChannels,
  KNORVIA_ENV,
  KNORVIA_PRODUCT_FLAVOR,
  DEFAULT_LOCALE,
  KNORVIA_VERSION,
  KNORVIA_AGENT_RUNTIME,
  type TelemetryEventPayload,
  HostMessageTypes,
} from "@knorvia/shared";
import { logger } from "./logger.js";
import { checkReleaseUpdate, scheduleReleaseUpdateChecks } from "./releaseUpdateCheck.js";
import { markMainLaunchAppReady } from "./desktopLaunchMarks.js";
import { createCuaPipFocusRouter, resolveCuaPipWindowKey } from "./cuaPipFocusRouter.js";

import { BroadcastHub } from "./broadcastHub.js";
import { TaskRealtimeBus } from "./taskRealtimeBus.js";

import {
  resolveAppShutdownPolicy,
  selectAppShutdownPolicy,
  type AppShutdownKind,
} from "./appShutdownPolicy.js";
import { createPrimaryWindowCoordinator } from "./primaryWindowCoordinator.js";
import { createDesktopQuitLifecycle } from "./desktopQuitLifecycle.js";

import { flushMainE2ECoverage } from "./e2eCoverage.js";
import { resolveStartupWindowBootstrap, type StartupWindowBootstrap } from "./startupWorkspace.js";
import {
  createStartupDeepLinkConsumptionGate,
  type ExplicitStartupWorkspaceRequest,
  resolveExplicitStartupWorkspaceBootstrap,
} from "./startupWorkspaceDeepLinkGate.js";
import { executeDesktopCommand } from "./desktopCommandHandlers.js";
import { clampDesktopZoomLevel, resolveDesktopZoomLevelFromFactor } from "./desktopZoom.js";
import {
  getDesktopMenuLabel as getDesktopMenuLabelByLocale,
  rebuildApplicationMenu,
  resolveSystemApplicationLocale,
  updateKnorviaStdioTapDevMenuState,
} from "./desktopApplicationMenu.js";
import { applyAppIcon } from "./desktopWindowChrome.js";
import { resolveWindowsAppUserModelIdForFlavor } from "../../scripts/desktop-product-identity.mjs";
import type { DesktopWindowSize } from "./desktopWindowSize.js";
import { maybeWarnArchitectureMismatch } from "./desktopArchitectureGuard.js";

import { createWindowsDesktopTray, updateWindowsDesktopTrayMenu } from "./desktopTray.js";
import { createWindowsCuaOperationIndicator } from "./windowsCuaOperationIndicator.js";
import {
  configureDockMenu,
  createWindow,
  focusWorkspaceInExistingWindow,
  showCurrentWindowFromDock,
  syncApplicationUnreadBadge,
  handleDesktopWindowCloseRequest,
} from "./desktopWindowLifecycle.js";
import { resolveKnorviaBuiltinProviderConfigFilePath } from "./desktopProviderConfig.js";
import {
  getCredentialsDir,
  isDockerDaemonAvailable,
  listSSHConfigAliases,
  listAvailableDockerContainers,
  listAvailableWSLDistros,
  loadHostProcessEnvFromLocalFiles,
  resolveBundledAgentBinaryPath,
  resolveRemoteAssetDirs,
  runtimeApplicationName,
  runtimeSessionDataPath,
  runtimeUserDataPath,
  shouldUseElectronDefaultUserDataPath,
} from "./desktopRuntimeEnv.js";
import {
  disposeHostProcess,
  disposeHostProcessAndWait,
  listDisposingHostProcesses,
  spawnHostProcess,
} from "./desktopHostProcess.js";
import { spawnCronScheduler, type CronSchedulerHandle } from "./desktopCronScheduler.js";
import {
  clearWorkspaceRoutesForWindow,
  handleDeepLink,
  handleOpenWorkspacePath,
  registerDeepLinkProtocol,
  resolveExternalWorkspaceOpenDialogCopy,
} from "./desktopWorkspaceDeepLink.js";
import { handleSecondInstanceWorkspaceRequest } from "./desktopSecondInstanceDeepLink.js";
import { installFinderOpenFolderWorkflow } from "./desktopFinderOpenFolderWorkflow.js";
import { installWindowsOpenFolderContextMenu } from "./desktopWindowsOpenFolderContextMenu.js";
import {
  createDeepLinkSingleInstanceData,
  extractWorkspaceOpenPath,
  extractDeepLinkUrlFromArgs,
  extractOpenWorkspacePathFromArgs,
  isWorkspaceOpenUrl,
} from "./desktopDeepLinkUrl.js";
import { createRemoteWorkspaceSessionManager } from "./desktopRemoteSessions.js";
import {
  reportRemoteConnectionStateChangedToArms,
  reportRemoteDisconnectToArms,
  stopRemoteUsageArmsPeriodicSampling,
} from "./desktopRemoteUsageArmsTelemetry.js";
import { resolveCanonicalWslTarget } from "./desktopWslTargetResolver.js";
import { setBrowserUseGuestWebContentsIdsProvider } from "./resourceManagerWindow.js";
import { createDesktopHelpConfigReader } from "./desktopHelpConfig.js";
import { registerPlatformIpcHandlers } from "./desktopMainIpcPlatform.js";

import { registerRemoteIpcHandlers } from "./desktopMainIpcRemote.js";
import {
  getStabilityLifecycleScene,
  notifyStabilityAppExit,
  reportAgentProcessExitToArms,
  reportAgentProcessReadyToArms,
  reportAgentProcessStartToArms,
  reportAgentProcessSpawnErrorToArms,
  reportAgentProcessExceptionToArms,
  registerDesktopStabilityMonitors,
  registerStabilityMainWindow,
  scheduleReportPerfAppStartAfterMainViewReady,
} from "./desktopStabilityTelemetry.js";
import { stopDesktopResourceTelemetry } from "./desktopResourceTelemetry.js";

import { stopDesktopKnorviaDataSizeTelemetry } from "./desktopDataSizeTelemetry.js";
import { reportMcpTelemetryToArms } from "./desktopMcpTelemetry.js";
import { stopDesktopNetworkTelemetry } from "./desktopNetworkTelemetry.js";
import { applyDesktopChromiumNetworkPolicies } from "./desktopNetworkPolicy.js";

import { snapshotWindowsPackagedResources } from "./windowsInstallResourceLocks.js";
import { mainMemoryDiagnosticsRegistry } from "./mainMemoryDiagnostics.js";

registerLocalMediaPreviewScheme(protocol);
const localMediaPreviewPathRegistry = createLocalMediaPreviewPathRegistry();

// e2e 由 Chromedriver 管理远程调试端口；如果这里继续固定到 9229，
// 会和开发态已打开的 Knorvia Studio Dev 抢端口，导致 WebDriver session 创建前白屏超时。
// 仅本地开发运行默认开启远程调试端口，并允许 e2e 通过环境变量交给 Chromedriver 接管。
if (!app.isPackaged && process.env.KNORVIA_DISABLE_FIXED_REMOTE_DEBUGGING_PORT !== "1") {
  app.commandLine.appendSwitch("remote-debugging-port", "9229");
}

app.setName(runtimeApplicationName);
if (!shouldUseElectronDefaultUserDataPath) {
  if (!runtimeUserDataPath || !runtimeSessionDataPath) {
    throw new Error(
      "Desktop runtime data paths are required when Electron default userData is disabled",
    );
  }
  app.setPath("userData", runtimeUserDataPath);
  app.setPath("sessionData", runtimeSessionDataPath);
}
process.title = runtimeApplicationName;

process.on("unhandledRejection", (reason) => {
  logger.error("unhandledRejection:", reason);
});

const iconPath =
  process.platform === "win32"
    ? app.isPackaged
      ? join(process.resourcesPath, "icon_windows.png")
      : join(import.meta.dirname, "../../build/icon_windows.png")
    : app.isPackaged
      ? join(process.resourcesPath, "icon.png")
      : join(import.meta.dirname, "../../build/icon.png");
const linuxDesktopIntegrationIconPath =
  process.platform === "linux"
    ? app.isPackaged
      ? join(process.resourcesPath, "icon_512x512.png")
      : join(import.meta.dirname, "../../build/icons/512x512.png")
    : iconPath;
let currentApplicationLocale: Locale = DEFAULT_LOCALE;
let closeToTrayOnWindows = true;
// keep-awake：全局开关 keepAwakeWhileRunning。打开后主进程持有
// powerSaveBlocker("prevent-app-suspension")，阻止系统闲置休眠（防不了合盖/手动睡眠）。
// 不再绑定闲时任务活跃计数——设置页「常规」与 Automations 入口镜像同一配置。
let keepAwakeWhileRunning = false;
let powerSaveBlockerId: number | null = null;
function reconcileKeepAwakeBlocker(): void {
  const shouldBlock = keepAwakeWhileRunning;
  if (shouldBlock && powerSaveBlockerId === null) {
    powerSaveBlockerId = powerSaveBlocker.start("prevent-app-suspension");
    logger.info(`[keep-awake] powerSaveBlocker started id=${powerSaveBlockerId}`);
  } else if (!shouldBlock && powerSaveBlockerId !== null) {
    try {
      powerSaveBlocker.stop(powerSaveBlockerId);
    } catch {
      // 忽略：id 可能已失效。
    }
    logger.info(`[keep-awake] powerSaveBlocker stopped id=${powerSaveBlockerId}`);
    powerSaveBlockerId = null;
  }
}

const embeddedBrowserDialogController = new EmbeddedBrowserJavaScriptDialogController({
  iconPath,
  getLocale: () => currentApplicationLocale,
  logger,
});
ipcMain.on(PlatformChannels.EmbeddedBrowserJavaScriptDialog, (event, payload: unknown) => {
  event.returnValue = embeddedBrowserDialogController.handleDialogRequest(
    event.sender.id,
    event.senderFrame?.url ?? "",
    payload,
  );
});
// browser-use CDP-on-guest pivot：main 进程按 key 管理 `<webview>` guest 的
// webContents + CDP，为 executor 提供 ControlledView。所有 execute/attach 出口都走这里。
// BrowserGuestManager 虽是 main singleton，但 tab owner 带 window/workspace/session/generation；
// create/close 只投递到 owner window，禁止旧的全窗口广播造成跨窗口 attach。
const browserScreenshotSurfaceCoordinator = createDesktopBrowserScreenshotSurfaceCoordinator({
  fromId: (windowId) => BrowserWindow.fromId(windowId),
  fromWebContentsId: (webContentsId) => webContents.fromId(webContentsId) ?? null,
  log: (message) => logger.debug(message),
  warn: (message) => logger.warn(message),
});
const browserGuestManager = new BrowserGuestManager(
  (msg) => logger.debug(msg),
  undefined,
  (tabId, owner) => {
    const win = owner ? BrowserWindow.fromId(owner.windowId) : null;
    if (win && !win.isDestroyed()) {
      win.webContents.send(
        PlatformChannels.BrowserViewCloseTab,
        buildBrowserViewCloseTabNotification(tabId, owner),
      );
    }
  },
  (tabId, owner) => {
    const win = BrowserWindow.fromId(owner.windowId);
    if (win && !win.isDestroyed()) {
      win.webContents.send(PlatformChannels.BrowserViewReady, {
        workspaceKey: owner.workspaceKey,
        ...(owner.remoteSessionId ? { remoteSessionId: owner.remoteSessionId } : {}),
        sessionId: owner.sessionId,
        tabId,
        browserId: owner.browserId,
        browserGeneration: owner.browserGeneration,
      });
    }
  },
  (visible, owner, tabId) => {
    const win = BrowserWindow.fromId(owner.windowId);
    if (win && !win.isDestroyed()) {
      win.webContents.send(PlatformChannels.BrowserViewVisibility, {
        visible,
        workspaceKey: owner.workspaceKey,
        remoteSessionId: owner.remoteSessionId,
        sessionId: owner.sessionId,
        ...(tabId ? { tabId } : {}),
        browserId: owner.browserId,
        browserGeneration: owner.browserGeneration,
      });
    }
  },
  (viewport, owner, tabId) => {
    const win = BrowserWindow.fromId(owner.windowId);
    if (win && !win.isDestroyed()) {
      win.webContents.send(PlatformChannels.BrowserViewViewportChanged, {
        workspaceKey: owner.workspaceKey,
        ...(owner.remoteSessionId ? { remoteSessionId: owner.remoteSessionId } : {}),
        sessionId: owner.sessionId,
        tabId,
        browserId: owner.browserId,
        browserGeneration: owner.browserGeneration,
        viewport,
      });
    }
  },
  (base64Png, target) => {
    const source = nativeImage.createFromBuffer(Buffer.from(base64Png, "base64"));
    if (source.isEmpty()) return undefined;
    const resized = source.resize({
      width: target.width,
      height: target.height,
      quality: "best",
    });
    if (resized.isEmpty()) return undefined;
    return resized.toPNG().toString("base64");
  },
  browserScreenshotSurfaceCoordinator,
  {
    // Browser shell/pageState 不跨进程恢复，以保持“完整退出即清空”的语义，
    // 并避免恢复的 shell 与新 webview 重复 attach。因此不注入 recoveryStore；
    // 进程内 residency 事件仍保留给现有 IPC 兼容层。
    onSuspendTabRequested: (payload) => {
      const tabOwner = browserGuestManager.getTabOwner(payload.tabId);
      const win = tabOwner ? BrowserWindow.fromId(tabOwner.windowId) : null;
      if (win && !win.isDestroyed()) {
        win.webContents.send(PlatformChannels.BrowserViewSuspend, payload);
      }
    },
    onRestoreTabRequested: (payload) => {
      const tabOwner = browserGuestManager.getTabOwner(payload.tabId);
      const win = tabOwner ? BrowserWindow.fromId(tabOwner.windowId) : null;
      if (win && !win.isDestroyed()) {
        win.webContents.send(PlatformChannels.BrowserViewRestore, payload);
      }
    },
    onResidencyChanged: (payload) => {
      const tabOwner = browserGuestManager.getTabOwner(payload.tabId);
      const win = tabOwner ? BrowserWindow.fromId(tabOwner.windowId) : null;
      if (win && !win.isDestroyed()) {
        win.webContents.send(PlatformChannels.BrowserViewRestore, payload);
      }
    },
    onRecoveryOrphanCloseRequested: ({ tabId, reason }) => {
      const tabOwner = browserGuestManager.getTabOwner(tabId);
      const win = tabOwner ? BrowserWindow.fromId(tabOwner.windowId) : null;
      if (win && !win.isDestroyed()) {
        win.webContents.send(PlatformChannels.BrowserViewCloseTab, {
          tabId,
          reason,
        });
      }
    },
    warn: (message) => logger.warn(message),
    recording: {
      createRecorder: (input) =>
        createElectronBrowserWebmRecorder(input, (message) => logger.debug(message)),
    },
  },
  // 隐藏窗口截图的透明 presentation：capture 期间 showInactive + opacity 0 主动要帧。
  (windowId) => BrowserWindow.fromId(windowId),
);
setBrowserUseGuestWebContentsIdsProvider(() => browserGuestManager.listGuestWebContentsIds());

// browser-use：带诊断日志地执行 browser 命令（两处 spawnHostProcess wiring 共用）。
// 打入口/出口便于定位卡点（如 navigate loadURL 挂起、CDP 报错等）。
// CDP-on-guest pivot：execute 走 browserGuestManager（不再传 win —— guest 已由 attachGuest 关联）。
async function runBrowserCommandOnView(params: {
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
}): Promise<{ ok: boolean; [k: string]: unknown }> {
  const endDialogAutomation = embeddedBrowserDialogController.beginAutomation(params.win.id);
  const command = params.command as { method?: string; tabId?: unknown } | null;
  const method = command?.method ?? "?";
  const workspaceKey =
    params.workspaceIdentity?.trim() ||
    params.workspaceKey ||
    params.workspacePath ||
    params.sessionId;
  const requestedTabId = resolveBrowserOperationTabId(command);
  const resetsResizeBaseline = browserOperationResetsResizeBaseline(command);
  const sendOperation = (tabId: string) => {
    if (params.win.isDestroyed()) return;
    params.win.webContents.send(PlatformChannels.BrowserViewOperation, {
      workspaceKey,
      ...(params.remoteSessionId ? { remoteSessionId: params.remoteSessionId } : {}),
      sessionId: params.sessionId,
      tabId,
      browserId: params.browserId ?? "legacy-iab",
      browserGeneration: params.browserGeneration ?? 0,
      resetsResizeBaseline,
    });
  };
  // 交互说明：绝大多数 Tab API 都显式携带 tabId，可在命令真正执行前亮起操作图标；
  // newTab / default-tab 兼容调用要等 manager 返回真实 meta.tabId 后再补发，避免猜 tab identity。
  if (requestedTabId) sendOperation(requestedTabId);
  logger.debug(
    `[browser-use] execute start browserId=${params.browserId ?? "legacy-iab"} sessionId=${params.sessionId} method=${method}`,
  );
  try {
    const result = await browserGuestManager.execute(
      {
        requestId: params.requestId,
        browserId: params.browserId ?? "legacy-iab",
        browserGeneration: params.browserGeneration ?? 0,
        windowId: params.win.id,
        workspaceKey,
        sessionId: params.sessionId,
        ...(params.turnId ? { turnId: params.turnId } : {}),
        ...(params.remoteSessionId ? { remoteSessionId: params.remoteSessionId } : {}),
        clientMode: params.clientMode ?? "desktop-continuous",
      },
      params.command as Parameters<typeof browserGuestManager.execute>[1],
    );
    logger.debug(
      `[browser-use] execute done sessionId=${params.sessionId} method=${method} ok=${result.ok} elapsedMs=${(result as { elapsedMs?: number }).elapsedMs ?? "?"}`,
    );
    if (!requestedTabId) {
      const resolvedTabId = resolveBrowserOperationTabId(command, result);
      if (resolvedTabId) sendOperation(resolvedTabId);
    }
    return result;
  } catch (error) {
    logger.error(
      `[browser-use] execute threw sessionId=${params.sessionId} method=${method}:`,
      error,
    );
    throw error;
  } finally {
    endDialogAutomation();
  }
}
let currentDesktopZoomLevel = 0;
let currentDesktopWindowSize: DesktopWindowSize | undefined;
const preloadPath = join(import.meta.dirname, "../preload/index.cjs");
const settingsFile = join(getCredentialsDir(), "setting.json");
let activeAppShutdownPolicy = resolveAppShutdownPolicy("normal", process.platform);
let activeAppShutdownKind: AppShutdownKind | null = null;

const broadcastHub = new BroadcastHub();
const taskRealtimeBus = new TaskRealtimeBus({ logger });
// 内存诊断计数器：desktopResourceTelemetry 每 60s collect
// 一次写主日志。will-download 监听数用于观察关窗后 defaultSession 是否残留监听。
mainMemoryDiagnosticsRegistry.register("taskBus", () => taskRealtimeBus.collectMemoryDiagnostics());
mainMemoryDiagnosticsRegistry.register("broadcast", () => broadcastHub.collectMemoryDiagnostics());
mainMemoryDiagnosticsRegistry.register("guest", () =>
  browserGuestManager.collectMemoryDiagnostics(),
);
mainMemoryDiagnosticsRegistry.register("app", () => ({
  windows: BrowserWindow.getAllWindows().filter((win) => !win.isDestroyed()).length,
  willDownloadListeners: session.defaultSession.listenerCount("will-download"),
}));
const hostProcessLocalEnv = loadHostProcessEnvFromLocalFiles();
interface RuntimeProcessEnvPreparation {
  patchPromise: Promise<Record<string, string>>;
  fallbackPatch: Record<string, string>;
}

let runtimeProcessEnvPrewarmSequence = 0;
function createRuntimeProcessEnvPreparation(): RuntimeProcessEnvPreparation {
  const prewarmId = ++runtimeProcessEnvPrewarmSequence;
  const startedAt = Date.now();
  // Windows process.env 保留 Path 的原始大小写，展开到普通对象后不再大小写不敏感。
  // dotenv 先合并、真实进程环境后合并，再统一成唯一 PATH，保持旧 Host 继承的优先级语义。
  const baseEnv = normalizeRuntimeProcessEnv(
    {
      ...hostProcessLocalEnv,
      ...process.env,
    },
    process.platform,
  );
  const fallbackPatch = buildRuntimeProcessEnvPatch(baseEnv, null, {
    platform: process.platform,
  });
  const patchPromise = captureLoginShellEnvSnapshot({
    baseEnv,
    platform: process.platform,
  }).then(
    (snapshot) => {
      const patch = buildRuntimeProcessEnvPatch(baseEnv, snapshot, {
        platform: process.platform,
      });
      if (process.platform !== "win32" && !snapshot) {
        logger.warn(
          `[startup] login shell env unavailable id=${prewarmId}; using shell-free fallback after ${Date.now() - startedAt}ms`,
        );
        return patch;
      }
      logger.info(
        `[startup] runtime process env prepared asynchronously id=${prewarmId} in ${Date.now() - startedAt}ms`,
      );
      return patch;
    },
    (error) => {
      logger.warn(
        `[startup] runtime process env prewarm failed id=${prewarmId}; using shell-free fallback`,
        error,
      );
      return fallbackPatch;
    },
  );
  return { patchPromise, fallbackPatch };
}

// 首窗在 Main import 时就开始采集；后续窗口各自刷新，避免永久复用进程启动时的 shell snapshot。
let initialRuntimeProcessEnvPreparation: RuntimeProcessEnvPreparation | null =
  createRuntimeProcessEnvPreparation();
function takeRuntimeProcessEnvPreparation(): RuntimeProcessEnvPreparation {
  const initialPreparation = initialRuntimeProcessEnvPreparation;
  if (initialPreparation) {
    initialRuntimeProcessEnvPreparation = null;
    return initialPreparation;
  }
  return createRuntimeProcessEnvPreparation();
}
const forceQuitRef = { current: false };
const explicitQuitRef = { current: false };
const quitLifecycle = createDesktopQuitLifecycle({
  forceQuitRef,
  explicitQuitRef,
  confirmQuit: () => confirmAppQuit(),
  prepare: async () => {
    localMediaPreviewPathRegistry.clear();
    await prepareAppQuit("app-will-quit");
  },
  requestQuit: () => app.quit(),
  relaunch: () => app.relaunch(),
  exit: () => exitPreparedApp("all-windows-closed-after-preparation"),
  onError: (error) => logger.error("[app-quit] preparation failed", error),
});
let appQuitPreparationInFlight: Promise<void> | null = null;
let hasPreparedAppQuit = false;
const windowWorkspaceMap = new Map<number, Set<string>>();
const windowTaskRealtimeHostIdMap = new Map<number, string>();
const windowUnreadCountMap = new Map<number, number>();
const windowHostProcessMap = new Map<number, ElectronUtilityProcess>();
const cuaPipFocusRouter = createCuaPipFocusRouter({
  send: (windowId, event) => {
    windowHostProcessMap.get(windowId)?.postMessage({
      type: HostMessageTypes.CuaPipFocusChanged,
      event,
    });
  },
});
const hostRunningTaskCountMap = new Map<ElectronUtilityProcess, number>();
const windowsCuaOperationIndicator = createWindowsCuaOperationIndicator({
  platform: process.platform,
  getLocale: () => currentApplicationLocale,
  logger,
});

// 常驻 cron scheduler 进程句柄；app ready 后拉起，退出前销毁。
let cronScheduler: CronSchedulerHandle | null = null;
// host → main 的定时任务派发结果，转交给 scheduler 结算。经模块变量转发以避免 spawn 顺序耦合。
function forwardCronRunResult(
  result: Parameters<CronSchedulerHandle["handleCronRunResult"]>[0],
): void {
  cronScheduler?.handleCronRunResult(result);
}
function forwardOffPeakRunResult(
  result: Parameters<CronSchedulerHandle["handleOffPeakRunResult"]>[0],
): void {
  cronScheduler?.handleOffPeakRunResult(result);
}
function wakeCronScheduler(automationId: string): void {
  cronScheduler?.wake(automationId);
}
function wakeOffPeakScheduler(offPeakTaskId?: string): void {
  // 复用同一条 scheduler-wake 通道（tick 同时覆盖 cron 与 off-peak 分支），仅日志标签区分。
  cronScheduler?.wake(`offpeak:${offPeakTaskId ?? "sync"}`);
}
// 选一个本地 host 执行派发：本期本地 workspace 由任一本地窗口 host 的 createTask 按 path 拉起/复用 agent。
function resolveCronDispatchHost(): ElectronUtilityProcess | null {
  const first = windowHostProcessMap.values().next();
  return first.done ? null : first.value;
}
const disposingHostProcessTimers = new WeakMap<
  ElectronUtilityProcess,
  ReturnType<typeof setTimeout>
>();
const mainSettingService = createSettingService();
const checkLocalRelease = () =>
  checkReleaseUpdate({
    getSettings: () => mainSettingService.get(),
    currentVersion: KNORVIA_VERSION,
  });
async function resolveCurrentKnorviaEndpointOrigin() {
  return "";
}

let desktopContextPromptRollout: ReturnType<typeof createDesktopContextPromptRollout> | undefined;
function resolveDesktopContextPromptEnabledForHost(): boolean {
  const rollout = desktopContextPromptRollout;
  if (!rollout) {
    return false;
  }
  // Host 创建时顺便触发过期刷新，但只读取当前快照；网络请求不能阻塞 Local/Remote Host。
  void rollout.refresh();
  return rollout.getSnapshot().enabled;
}

// 首个 Host 创建前的有界灰度裁决门。Host/Agent 的 presentation surface 在进程启动时
// 冻结（services/node.ts 顶层 const + CLI --surface），而灰度请求是旁路、不阻塞 Host。若首个
// Host fork 早于请求 resolve，成功结果（enabled:true）对已冻结的 Host/Agent 无可达生效路径。
// 这里给"成功结果"一条有界的生效路径：首 Host fork 前 await 一次裁决（≤2s），失败/超时仍按当前
// 快照继续（desktopContextPrompt fail-open）。first-only 永久
// latch——后续 Host fork await 已 resolve 的 promise（近乎 0ms），且各 resolve*ForHost()
// 同步读取已被刷新的 live 快照。
const DESKTOP_FIRST_HOST_SPAWN_DECISION_TIMEOUT_MS = 2_000;
let firstHostSpawnDecisionPromise: Promise<void> | null = null;
function awaitFirstHostSpawnDecision(): Promise<void> {
  if (firstHostSpawnDecisionPromise) {
    return firstHostSpawnDecisionPromise;
  }
  firstHostSpawnDecisionPromise = (async () => {
    const rollout = desktopContextPromptRollout;
    if (!rollout) {
      return;
    }
    try {
      const decision = await rollout.awaitFirstDecision(
        DESKTOP_FIRST_HOST_SPAWN_DECISION_TIMEOUT_MS,
      );
      logger.info("[desktop-context-prompt] first host spawn decision resolved", {
        enabled: decision.enabled,
        configVersion: decision.configVersion,
      });
    } catch (error) {
      // awaitFirstDecision 永不 reject（refresh 内部已 catch + timeout 回退快照），此处仅兜底。
      logger.warn("[desktop-context-prompt] first host spawn decision failed, fail-open", {
        error,
      });
    }
  })();
  return firstHostSpawnDecisionPromise;
}
// 保留本地生命周期通知的调用形状，不创建身份、不读凭据、不上报任何网络事件。
const appTelemetryCore = {
  reportEvent: async (_payload: unknown) => {},
  reportAppLaunch: async (_context: unknown) => {},
  reportAppDailyActive: async (_context: unknown) => {},
  flushPendingReports: async (_options: unknown) => {},
};
const appTelemetryRuntime = {
  getRendererContext: (_id: number): import("@knorvia/shared").TelemetryRendererContext | null =>
    null,
  getLatestRendererContext: (): import("@knorvia/shared").TelemetryRendererContext | null => null,
  setInteractive: (_interactive: boolean) => {},
  onRendererReady: (_payload: unknown) => {},
  syncRendererContext: (_payload: unknown) => {},
  dispose: () => {},
};

function reportRemoteUsageEventForRenderer(rendererId: number, event: TelemetryEventPayload): void {
  const context =
    appTelemetryRuntime.getRendererContext(rendererId) ??
    appTelemetryRuntime.getLatestRendererContext();
  if (!context) {
    logger.warn("[remote-usage-telemetry] renderer context unavailable", {
      elementName: event.elementName,
      rendererId,
    });
    return;
  }
  // 最终失败由 TelemetryCore 统一记录一条脱敏告警；这里仅隔离远程连接主链路。
  void appTelemetryCore.reportEvent({ context, ...event }).catch(() => {});
}

function syncAppTelemetryInteractiveState(): void {
  appTelemetryRuntime.setInteractive(
    getApplicationWindowsExcludingCuaIndicator().some(
      (win) => !win.isDestroyed() && win.isVisible() && win.isFocused(),
    ),
  );
  // 登出/切号发生在 host 子进程，主进程无即时信号；窗口聚焦时兜底刷新 ARMS user.name
}

app.on("browser-window-focus", (_event, win) => {
  syncAppTelemetryInteractiveState();
  rebuildMenu();
  // 设置/更新等无 Host 的 Knorvia 窗口也算前台：router 会先把旧 workspace Host 清成 null，
  // 再把无 Host 的新窗口事实静默丢弃，避免旧会话 PiP 继续显示。
  cuaPipFocusRouter.focusWindow(resolveCuaPipWindowKey(win));
});
app.on("browser-window-blur", (_event, win) => {
  syncAppTelemetryInteractiveState();
  cuaPipFocusRouter.blurWindow(resolveCuaPipWindowKey(win));
});
app.on("browser-window-created", (_event, win) => {
  const windowKey = resolveCuaPipWindowKey(win);
  win.once("closed", () => cuaPipFocusRouter.removeWindow(windowKey));
});

const remoteSessionManager = createRemoteWorkspaceSessionManager({
  logger,
  windowHostProcessMap,
  resolveRemoteAssetDirs: () =>
    resolveRemoteAssetDirs({ locale: currentApplicationLocale }, hostProcessLocalEnv),
  resolveWslTarget: resolveCanonicalWslTarget,
  reportRemoteConnectionStateChanged: reportRemoteConnectionStateChangedToArms,
  reportRemoteDisconnect: reportRemoteDisconnectToArms,
});

const deviceMid = "";
// 帮助配置是公开读取，不能复用下面附带账号鉴权的灰度响应缓存。
const readHelpConfig = createDesktopHelpConfigReader({
  appVersion: KNORVIA_VERSION || app.getVersion(),
  deviceMid,
  resolveEndpointOrigin: resolveCurrentKnorviaEndpointOrigin,
});
// 同一个 /api/v1/client/configs fetcher 供两个灰度 rollout 共用（请求参数与鉴权完全一致，
// 各自独立缓存/去重，服务端按 data.configs.<key> 区分功能）。
const electronClientConfigsFetcher = createElectronDesktopContextPromptConfigFetcher({
  appVersion: KNORVIA_VERSION || app.getVersion(),
  deviceMid,
  resolveEndpointOrigin: resolveCurrentKnorviaEndpointOrigin,
});
desktopContextPromptRollout = createDesktopContextPromptRollout({
  fetchConfig: electronClientConfigsFetcher,
  logger,
});
function extractOpenWorkspacePathFromDeepLinkUrl(url: string): string | null {
  try {
    const parsedUrl = new URL(url);
    return isWorkspaceOpenUrl(parsedUrl) ? extractWorkspaceOpenPath(parsedUrl) : null;
  } catch {
    return null;
  }
}

const startupOpenWorkspaceArgPath = extractOpenWorkspacePathFromArgs(process.argv);
const startupProtocolUrl = extractDeepLinkUrlFromArgs(process.argv);
const startupDeepLinkWorkspacePath = startupOpenWorkspaceArgPath
  ? null
  : extractOpenWorkspacePathFromDeepLinkUrl(startupProtocolUrl ?? "");
const startupDeepLinkConsumptionGate = createStartupDeepLinkConsumptionGate(startupProtocolUrl);
let startupOpenWorkspaceRequest: ExplicitStartupWorkspaceRequest | null =
  startupOpenWorkspaceArgPath
    ? { path: startupOpenWorkspaceArgPath, source: "open-workspace-arg" }
    : startupDeepLinkWorkspacePath
      ? { path: startupDeepLinkWorkspacePath, source: "deep-link" }
      : null;

function resolveExternalWorkspaceConfirmationCopy() {
  const effectiveLocale =
    currentApplicationLocale === DEFAULT_LOCALE && app.isReady()
      ? resolveSystemApplicationLocale()
      : currentApplicationLocale;
  return resolveExternalWorkspaceOpenDialogCopy(effectiveLocale);
}

const primaryWindowCoordinator = createPrimaryWindowCoordinator({
  listWindows: getApplicationWindowsExcludingCuaIndicator,
  resolveStartupWindowBootstrap: () => {
    if (startupOpenWorkspaceRequest) {
      const request = startupOpenWorkspaceRequest;
      startupOpenWorkspaceRequest = null;
      startupDeepLinkConsumptionGate.markStartupRequestConsumed(request);
      const explicitBootstrap = resolveExplicitStartupWorkspaceBootstrap(request, {
        confirmationCopy: resolveExternalWorkspaceConfirmationCopy(),
        logger,
      });
      if (explicitBootstrap) {
        return Promise.resolve(explicitBootstrap);
      }
    }

    return resolveStartupWindowBootstrap({
      settingsFile,
      // dataBaseDir 可能在 bootstrap 设置阶段被覆盖，必须在真正解析启动工作区时再取值。
      conversationWorkspaceDir: getConversationWorkspaceDir(),
      logger,
    });
  },
  createWindow: (startupBootstrap) => {
    // 启动配置读取可能晚于退出意图完成，执行创建前再次检查同一 gate。
    if (!forceQuitRef.current) createWindowInstance(startupBootstrap);
  },
  canCreateWindow: () => !forceQuitRef.current,
  logger,
});

function markForceQuit(reason: string) {
  if (forceQuitRef.current) {
    return;
  }

  forceQuitRef.current = true;
  logger.info(`[app-quit] forceQuit enabled (${reason})`);
}

function markExplicitQuit(reason: string) {
  explicitQuitRef.current = true;
  logger.info(`[app-quit] explicit quit requested (${reason})`);
}

function syncCloseToTrayOnWindows(value: unknown) {
  if (typeof value !== "boolean") {
    return;
  }

  closeToTrayOnWindows = value;
  logger.info(`[settings] closeToTrayOnWindows=${value}`);
}

function syncImmediateAppSettings(patch: Partial<AppSettings>) {
  syncCloseToTrayOnWindows(patch.closeToTrayOnWindows);

  if (typeof patch.keepAwakeWhileRunning === "boolean") {
    keepAwakeWhileRunning = patch.keepAwakeWhileRunning;
    reconcileKeepAwakeBlocker();
  }

  if (patch.shortcutBindings !== undefined) {
    // 快捷键改绑：
    // 落盘已完成（useSettings.update 先 await settingService.update 再走本通道），
    // 这里重建应用菜单 accelerator，并通知所有窗口刷新设置快照 —— 其他窗口的
    // useAppKeyboard 生效表与设置页跟随更新。先例：setAutoDownloadAndInstallUpdates 的全窗口广播。
    rebuildMenu();
    for (const win of getApplicationWindowsExcludingCuaIndicator()) {
      if (!win.isDestroyed()) {
        win.webContents.send(PlatformChannels.SettingsChanged);
      }
    }
  }
}

async function prepareAppQuit(reason: string, kind: AppShutdownKind = "normal"): Promise<void> {
  const selection = selectAppShutdownPolicy(activeAppShutdownKind, kind, process.platform);
  activeAppShutdownKind = selection.kind;
  activeAppShutdownPolicy = selection.policy;
  if (selection.upgraded && (hasPreparedAppQuit || appQuitPreparationInFlight)) {
    // 更新请求可能晚于普通退出屏障。已创建的 4s timer 无法靠修改全局策略延长；
    // 明确保留既有预算，并允许更新继续进入 fail-open 资源扫描和安装器。
    logger.warn(
      `[app-quit] update install joined an existing normal shutdown barrier (${reason}); existing timers keep their original budget`,
    );
  }
  if (hasPreparedAppQuit) {
    return;
  }
  if (appQuitPreparationInFlight) {
    await appQuitPreparationInFlight;
    return;
  }

  markForceQuit(reason);
  windowsCuaOperationIndicator.dispose();
  browserScreenshotSurfaceCoordinator.dispose();
  // Bug 根因：资源样本改为 5 分钟窗口后，退出仍直接 stop 会清空未满窗口的数据。
  // 退出时只排空已存在的角色 / Agent 内存窗口，不启动新采样、目录扫描或外部探针。
  stopDesktopResourceTelemetry({ flushPendingWindows: true });
  stopDesktopKnorviaDataSizeTelemetry();
  stopDesktopNetworkTelemetry();
  stopRemoteUsageArmsPeriodicSampling();
  notifyStabilityAppExit(
    getStabilityLifecycleScene() === "update_install" ? "update_install" : "app_quit",
    logger,
    { exitCode: 0, exitKind: "normal" },
  );

  const cronSchedulerToDispose = cronScheduler;
  cronScheduler = null;

  const hostProcesses = [
    ...new Set([...windowHostProcessMap.values(), ...listDisposingHostProcesses()]),
  ];
  logger.info(
    `[app-quit] waiting for host process cleanup (${reason}), kind=${activeAppShutdownKind}, hosts=${hostProcesses.length}, forceKillDelayMs=${activeAppShutdownPolicy.forceKillDelayMs}, waitTimeoutMs=${activeAppShutdownPolicy.waitTimeoutMs}`,
  );

  appQuitPreparationInFlight = Promise.all([
    // 退出屏障结束后再启动窗口尺寸写入，可能在 app.exit 前留下 setting.json.lock。
    // 尺寸已在 resize 防抖或最大化状态变化时保存，退出屏障不再创建新的尺寸写入。
    // 修复原因：Main 过去不会等待仍在发送的 /event/report，正常退出也会直接丢事件。
    // 与其它 owner 并行进入既有屏障，最多等待 2 秒，避免 telemetry 串行放大退出预算。
    appTelemetryCore.flushPendingReports({ timeoutMs: 2_000 }),
    // 旧流程先等待 Cron 的 1.5s deadline，再启动 Host timer，导致声明的
    // 4.5s/9s 退出总预算被串行放大。两类 owner 无关闭依赖，统一并行进入同一屏障。
    (async () => {
      try {
        await cronSchedulerToDispose?.dispose();
      } catch (error) {
        logger.warn(`[app-quit] cron scheduler dispose failed (${reason}):`, error);
      }
    })(),
    // remote session、attachment 和 transport 都由窗口 Host 持有；这里先清理
    // Main 的请求关联，再由下方每窗口唯一 Host 的 shutdown barrier 释放真实连接与 Agent。
    remoteSessionManager.disposeAllAndWaitForAppShutdown(reason),
    ...hostProcesses.map((child, index) =>
      disposeHostProcessAndWait(
        child,
        `${reason}-${index + 1}`,
        disposingHostProcessTimers,
        logger,
        {
          forceKillDelayMs: activeAppShutdownPolicy.forceKillDelayMs,
          waitTimeoutMs: activeAppShutdownPolicy.waitTimeoutMs,
        },
      ),
    ),
  ])
    .then(() => {
      logger.info(`[app-quit] host process cleanup completed (${reason})`);
    })
    .catch((error) => {
      logger.error(`[app-quit] host process cleanup failed (${reason}):`, error);
    })
    .finally(() => {
      // will-quit 是同步事件。只发 Dispose 就继续退出 main 的话，
      // host 还没等到 agent 进程树的 SIGTERM/SIGKILL 兜底完成就被带走，cli 会被 init 接管成残留进程。
      // 所有窗口允许关闭后拦截 will-quit，等待 host 清理完成再退出。
      hasPreparedAppQuit = true;
      appQuitPreparationInFlight = null;
    });

  await appQuitPreparationInFlight;
}

function exitPreparedApp(reason: string): never | void {
  logger.info(`[app-quit] exiting prepared app (${reason})`);
  if (process.env.KNORVIA_E2E_RUN_ID?.trim()) {
    flushMainE2ECoverage((error) => {
      logger.warn("[e2e-coverage] main coverage flush failed", error);
    });
    // ChromeDriver 正在执行 deleteSession 时，Electron app.exit(0)
    // 和进程内的 process.kill 都可能被 Electron 生命周期吞掉。这里只在 E2E
    // run 身份明确、且 prepareAppQuit 已完成 host/agent 回收之后，启动独立系统
    // 命令终止当前 PID；不按名称扫描，也不会影响产品退出或下一轮 session。
    const killer =
      process.platform === "win32"
        ? spawn("taskkill", ["/PID", String(process.pid), "/F"], {
            detached: true,
            stdio: "ignore",
            windowsHide: true,
          })
        : spawn("kill", ["-9", String(process.pid)], {
            detached: true,
            stdio: "ignore",
          });
    killer.unref();
    return;
  }
  app.exit(0);
}

function getRunningAgentSessionCount() {
  return [...hostRunningTaskCountMap.values()].reduce((total, count) => total + count, 0);
}

function logWindowsBundledRuntimeIntegrityDiagnostic() {
  if (process.platform !== "win32" || !app.isPackaged) {
    return;
  }

  // 桌面包可用内置 Electron Node 执行 JS bundle，不要求额外的原生 Agent 可执行文件。
  const nodeBundlePath = join(
    process.resourcesPath,
    KNORVIA_AGENT_RUNTIME.bundledResourceDir,
    ...KNORVIA_AGENT_RUNTIME.resolveNodeBundleSegments(),
  );
  if (existsSync(nodeBundlePath)) return;

  const binaryPaths = {
    knorvia: resolveBundledAgentBinaryPath(),
  };
  const missingProviders = Object.entries(binaryPaths)
    .filter(([, binaryPath]) => !binaryPath)
    .map(([provider]) => provider);
  if (missingProviders.length === 0) {
    return;
  }

  // bundled runtime 缺失不一定影响用户当前 provider，启动阶段只静默落日志。
  // 这样既能在下次用户日志里确认安装资源是否已损坏，也不会因为未使用的 provider 缺失打断启动。
  logger.warn(
    `[startup] Windows bundled runtime missing providers: ${missingProviders.join(", ")} resources=${JSON.stringify(
      snapshotWindowsPackagedResources(process.resourcesPath),
    )}`,
  );
}

function shouldConfirmAppQuit() {
  // 开发环境里的普通会话经常需要重启 Electron，只在 production 下拦截，避免打断调试。
  return KNORVIA_ENV === "production" && getRunningAgentSessionCount() > 0;
}

function confirmAppQuit(originWindow?: BrowserWindow | null) {
  if (!shouldConfirmAppQuit()) {
    logger.info(`[app-quit] quit confirmation skipped in ${KNORVIA_ENV}`);
    return true;
  }

  const isZh = currentApplicationLocale === "zh-CN";
  const runningAgentSessionCount = getRunningAgentSessionCount();
  const detailLines = [
    runningAgentSessionCount > 0
      ? isZh
        ? `正在进行的会话：${runningAgentSessionCount} 个，退出后会被中断。`
        : `In-progress sessions: ${runningAgentSessionCount}. They will be interrupted after quitting.`
      : null,
  ].filter((line): line is string => line !== null);
  const targetWindow =
    originWindow && !originWindow.isDestroyed()
      ? originWindow
      : (BrowserWindow.getFocusedWindow() ??
        getApplicationWindowsExcludingCuaIndicator()[0] ??
        null);
  const dialogOptions = {
    type: "question" as const,
    buttons: isZh ? ["退出", "取消"] : ["Quit", "Cancel"],
    defaultId: 1,
    cancelId: 1,
    title: isZh ? "退出确认" : "Confirm Quit",
    message: isZh ? "确认退出 Knorvia Studio?" : "Quit Knorvia Studio?",
    detail: detailLines.join("\n"),
    icon: nativeImage.createFromPath(iconPath),
  };

  const result = targetWindow
    ? dialog.showMessageBoxSync(targetWindow, dialogOptions)
    : dialog.showMessageBoxSync(dialogOptions);
  return result === 0;
}

async function executeDesktopCommandForApp(
  command: Parameters<typeof executeDesktopCommand>[0]["command"],
  senderWindow?: BrowserWindow | null,
) {
  return executeDesktopCommand({
    fetchHelpConfig: readHelpConfig,
    command,
    senderWindow,
    logger,
    updateKnorviaStdioTapDevMenuState,
    onDesktopZoomChanged: (zoomLevel) => {
      currentDesktopZoomLevel = clampDesktopZoomLevel(zoomLevel);
      rebuildMenu();
    },
    settingService: mainSettingService,
    onRelaunchApp: async () => quitLifecycle.requestRelaunch(),
    credentialsDir: getCredentialsDir(),
    currentApplicationLocale,
  });
}

/** 快捷键设置页录制态（renderer 经 SetShortcutRecordingActive 同步）；true 时菜单摘除可配置 accelerator。 */
let shortcutRecordingActive = false;
/** 发起录制的 webContents id；窗口关闭/崩溃时 renderer 不会发复位 IPC，main 侧据此收口。 */
let shortcutRecordingOwnerWebContentsId: number | null = null;

function setShortcutRecordingActive(active: boolean, ownerWebContentsId: number | null = null) {
  if (active) {
    shortcutRecordingOwnerWebContentsId = ownerWebContentsId;
  }
  if (shortcutRecordingActive === active) {
    return;
  }
  shortcutRecordingActive = active;
  if (!active) {
    shortcutRecordingOwnerWebContentsId = null;
  }
  rebuildMenu();
}

/**
 * 录制态是跨进程的临时全局状态，收口不能依赖 renderer 合作——录制中关窗
 * 或渲染进程崩溃时 React cleanup 与复位 IPC 都不会执行，标志会永久为 true，之后所有
 * rebuildMenu（切语言/zoom/设置同步）都建出无 accelerator 的菜单且波及全部窗口。
 * 在既有窗口销毁清理里按发起 webContents 复位。
 */
function resetShortcutRecordingForWebContents(webContentsId: number) {
  if (!shortcutRecordingActive || shortcutRecordingOwnerWebContentsId !== webContentsId) {
    return;
  }
  shortcutRecordingOwnerWebContentsId = null;
  shortcutRecordingActive = false;
  rebuildMenu();
}

function rebuildMenu() {
  void mainSettingService.get().then((settings) => {
    rebuildApplicationMenu({
      currentApplicationLocale,
      executeDesktopCommand: executeDesktopCommandForApp,
      currentZoomLevel: resolveFocusedDesktopZoomLevel(),
      // 菜单 accelerator 跟随用户快捷键设置（shortcutBindings 用户覆盖）
      shortcutBindings: settings.shortcutBindings,
      // 快捷键录制态：摘掉可配置 accelerator，防止录制 menu 通道命令时按键直接触发原命令
      // （macOS 系统菜单先于 renderer 吃掉按键，renderer 侧 preventDefault 拦不住）。
      disableShortcutAccelerators: shortcutRecordingActive,
    });
  });
  updateWindowsDesktopTrayMenu();
}

function resolveFocusedDesktopZoomLevel(): number {
  const focusedWindow = BrowserWindow.getFocusedWindow();
  if (!focusedWindow || focusedWindow.isDestroyed()) {
    return 0;
  }
  return resolveDesktopZoomLevelFromFactor(focusedWindow.webContents.getZoomFactor());
}

function getApplicationWindowsExcludingCuaIndicator(): BrowserWindow[] {
  return BrowserWindow.getAllWindows().filter(
    (win) => !win.isDestroyed() && !windowsCuaOperationIndicator.ownsWindow(win),
  );
}

function getMainApplicationWindows(): BrowserWindow[] {
  return getApplicationWindowsExcludingCuaIndicator();
}

function createWindowInstance(startupBootstrap: StartupWindowBootstrap = {}) {
  const runtimeProcessEnvPreparation = takeRuntimeProcessEnvPreparation();
  const win = createWindow({
    iconPath,
    preloadPath,
    logger,
    forceQuitRef,
    onUnloadCancelled: quitLifecycle.cancel,
    handleBeforeClose: (win, label) =>
      handleDesktopWindowCloseRequest({
        platform: process.platform,
        forceQuit: forceQuitRef.current,
        explicitQuitRequested: explicitQuitRef.current,
        closeToTrayOnWindows,
        isLastWindow: getMainApplicationWindows().length === 1,
        label,
        logger,
        shouldConfirmQuit: shouldConfirmAppQuit(),
        confirmQuit: () => confirmAppQuit(win),
        requestQuit: () => {
          markForceQuit(`last-window-close:${label}`);
          app.quit();
        },
        hideWindow: () => win.hide(),
      }),
    windowHostProcessMap,
    onHostProcessReady: (windowKey) => cuaPipFocusRouter.refreshWindow(windowKey),
    awaitFirstHostSpawnDecision,
    spawnHostProcess: (win, label, initMessage) =>
      spawnHostProcess(
        win,
        label,
        {
          ...initMessage,
          knorviaBuiltinProviderConfigFilePath: resolveKnorviaBuiltinProviderConfigFilePath({
            env: { ...hostProcessLocalEnv, ...process.env },
          }),
        },
        {
          hostProcessLocalEnv,
          desktopContextPromptEnabled: resolveDesktopContextPromptEnabledForHost,
          logger,
          broadcastHub,
          taskRealtimeBus,
          windowHostProcessMap,
          hostRunningTaskCountMap,
          onCuaOperationStateChanged: (source, event) =>
            windowsCuaOperationIndicator.handleState(source, event),
          onCuaOperationStateSourceExited: (source) =>
            windowsCuaOperationIndicator.clearSource(source),
          onAgentProcessExited: (event) => reportAgentProcessExitToArms(event, logger),
          onAgentProcessError: (event) => reportAgentProcessSpawnErrorToArms(event, logger),
          onAgentProcessException: (event) => reportAgentProcessExceptionToArms(event, logger),
          onAgentProcessReady: (event) => reportAgentProcessReadyToArms(event, logger),
          onAgentProcessSpawned: (event) => reportAgentProcessStartToArms(event, logger),
          onMcpTelemetry: (message) =>
            reportMcpTelemetryToArms(message.event, message.runtimeSurface),
          onSessionCreateTelemetry: (message) => {
            void appTelemetryCore.reportEvent(message.event).catch(() => {});
          },
          onCronRunResult: forwardCronRunResult,
          onOffPeakRunResult: forwardOffPeakRunResult,
          onCronSchedulerWakeRequested: wakeCronScheduler,
          onOffPeakSchedulerWakeRequested: wakeOffPeakScheduler,
          authorizeLocalMediaPreviewPath: localMediaPreviewPathRegistry.authorize,
          // browser-use：main 用 WebContentsView+CDP 执行命令。
          handleBrowserExecuteRequest: ({ win: browserWin, ...request }) =>
            runBrowserCommandOnView({ win: browserWin, ...request }),
        },
        {
          taskRealtime: {
            workspaceKeys: windowWorkspaceMap.get(win.id) ?? [],
            onHostId: (hostId) => {
              windowTaskRealtimeHostIdMap.set(win.id, hostId);
            },
          },
        },
      ),
    disposeHostProcess: (child, label, forceKillDelayMs) =>
      disposeHostProcess(
        child,
        label,
        disposingHostProcessTimers,
        logger,
        label.includes("window-closed")
          ? activeAppShutdownPolicy.forceKillDelayMs
          : forceKillDelayMs,
      ),
    disposeRemoteWorkspaceSessionsForWindow:
      remoteSessionManager.disposeRemoteWorkspaceSessionsForWindow,
    reattachRemoteWorkspaceSessionsForWindow:
      remoteSessionManager.reattachRemoteWorkspaceSessionsForWindow,
    bootstrap: {
      restoreSession: startupBootstrap.restoreSession,
      initialWorkspacePath: startupBootstrap.initialWorkspacePath,
      initialWorkspacePurpose: startupBootstrap.initialWorkspacePurpose,
      unavailableWorkspacePath: startupBootstrap.unavailableWorkspacePath,
    },
    agentWarmupTargets: startupBootstrap.agentWarmupTargets,
    // startupBootstrap 只标记 active workspace 是否不可用，但 local Host 会为所有
    // 已恢复 workspace 建立后台索引。始终注入 canonical fallback，才能覆盖非 active 历史目录已删除的情况。
    agentSpawnFallbackCwd: getConversationWorkspaceDir(),
    deviceMid,
    runtimeProcessEnvPatchPromise: runtimeProcessEnvPreparation.patchPromise,
    runtimeProcessEnvFallbackPatch: runtimeProcessEnvPreparation.fallbackPatch,
    initialDesktopZoomLevel: currentDesktopZoomLevel,
    initialWindowSize: currentDesktopWindowSize,
    currentApplicationLocale: () => currentApplicationLocale,
    resolveBrowserViewOwner: (webContentsId) =>
      browserGuestManager.getTabOwnerByWebContentsId(webContentsId) ?? undefined,
    persistWindowSize: async (state) => {
      currentDesktopWindowSize = state;
      await mainSettingService.update({ desktopWindowSize: state });
    },
  });
  registerStabilityMainWindow(win);
  return win;
}

registerDeepLinkProtocol(logger, { iconPath: linuxDesktopIntegrationIconPath });
app.on("open-url", (event, url) => {
  event.preventDefault();
  const workspacePath = extractOpenWorkspacePathFromDeepLinkUrl(url);

  if (workspacePath && getApplicationWindowsExcludingCuaIndicator().length === 0) {
    // macOS 冷启动 Finder Service 会先触发 open-url，再创建首窗。
    // 把目标目录按 deep link 来源记录，首窗 bootstrap 前仍要走确认 gate。
    startupOpenWorkspaceRequest = { path: workspacePath, source: "deep-link" };
    if (app.isReady()) {
      void primaryWindowCoordinator.ensurePrimaryWindow("open-url-workspace");
    }
    return;
  }
  handleDeepLink(url, logger, {
    confirmationCopy: resolveExternalWorkspaceConfirmationCopy(),
    resolveApplicationWindow: () => getApplicationWindowsExcludingCuaIndicator()[0] ?? null,
  });
});
const gotTheLock = app.requestSingleInstanceLock(createDeepLinkSingleInstanceData(process.argv));
if (!gotTheLock) {
  app.quit();
}
app.on("second-instance", (_event, argv, _workingDirectory, additionalData) => {
  if (
    handleSecondInstanceWorkspaceRequest({
      additionalData,
      argv,
      handleDeepLink: (url, options) => handleDeepLink(url, logger, options),
      handleOpenWorkspacePath: (path, options) =>
        handleOpenWorkspacePath(path, logger, {
          allowWithoutReadyWindow: true,
          ...options,
          resolveApplicationWindow:
            options?.resolveApplicationWindow ??
            (() => getApplicationWindowsExcludingCuaIndicator()[0] ?? null),
        }),
      resolveApplicationWindow: () => getApplicationWindowsExcludingCuaIndicator()[0] ?? null,
      logger,
      workspaceConfirmationCopy: resolveExternalWorkspaceConfirmationCopy(),
    })
  ) {
    return;
  }

  const win = getApplicationWindowsExcludingCuaIndicator()[0];
  if (win) {
    if (win.isMinimized()) {
      win.restore();
    }
    if (!win.isVisible()) {
      win.show();
    }
    win.focus();
  }
});

app.whenReady().then(async () => {
  markMainLaunchAppReady();
  installLocalMediaPreviewProtocol(session.defaultSession.protocol, {
    isPathAuthorized: localMediaPreviewPathRegistry.isAuthorized,
  });
  // Electron 的 net.request 只能在 app ready 后使用；灰度请求仍是旁路预热，不阻塞首个 Host。
  void desktopContextPromptRollout?.refresh();
  installBrowserRestoreBootstrapProtocol(
    session.fromPartition(EMBEDDED_BROWSER_PARTITION).protocol,
  );
  // Bootstrap: 从设置文件读取自定义数据目录，在所有 host 进程启动前生效
  let loadedBootstrapLocale = false;
  let bootstrapSettings: AppSettings | undefined;
  try {
    bootstrapSettings = await mainSettingService.get();
    if (bootstrapSettings.dataBaseDir) {
      // 数据根已在最早 bootstrap 冻结，便携版不能被设置中的旧路径覆盖。
    }
    if (bootstrapSettings.locale) {
      loadedBootstrapLocale = true;
      currentApplicationLocale = bootstrapSettings.locale;
    }
    closeToTrayOnWindows = bootstrapSettings.closeToTrayOnWindows ?? true;
    keepAwakeWhileRunning = bootstrapSettings.keepAwakeWhileRunning ?? false;
    currentDesktopZoomLevel = clampDesktopZoomLevel(bootstrapSettings.desktopZoomLevel ?? 0);
    currentDesktopWindowSize = bootstrapSettings.desktopWindowSize;
    // 全局 keep-awake：启动时若设置已开，立刻持有 powerSaveBlocker，不必等设置变更事件。
    reconcileKeepAwakeBlocker();
  } catch {
    // 读取失败不影响启动，使用默认 homedir
  }

  // 仅查询用户明确配置的发布信息地址；未配置或关闭时连首个请求都不会发送。
  let lastNotifiedRelease: string | undefined;
  const stopReleaseChecks = scheduleReleaseUpdateChecks(checkLocalRelease, (result) => {
    if (result.status !== "available" || lastNotifiedRelease === result.latestVersion) return;
    lastNotifiedRelease = result.latestVersion;
    if (!Notification.isSupported()) return;
    new Notification({
      title:
        currentApplicationLocale === "en-US"
          ? "Knorvia Studio update available"
          : "Knorvia Studio 有新版本",
      body:
        currentApplicationLocale === "en-US"
          ? `Version ${result.latestVersion} is available. Check Settings for details.`
          : `版本 ${result.latestVersion} 已发布，请在设置中查看。`,
    }).show();
  });
  app.once("before-quit", stopReleaseChecks);

  // scheduler 也会打开 tasks-index；等 Host 完成统一准备，避免在启动页出现前抢先迁移。
  configureDatabaseStartupQuit(() => {
    markExplicitQuit("database-startup-exit");
    app.quit();
  });
  onLocalDatabaseStartupReady(() => {
    try {
      cronScheduler = spawnCronScheduler({
        hostProcessLocalEnv,
        logger,
        resolveDispatchHost: resolveCronDispatchHost,
        // keep-awake 已改为纯设置驱动；计数上报保留给后续诊断/配额用途，不再联动 blocker。
        onOffPeakActiveCountChanged: () => {},
      });
    } catch (error) {
      logger.error("[cron-scheduler] failed to spawn scheduler process:", error);
    }
  });

  if (process.platform === "win32") {
    // 打包态必须与 NSIS 快捷方式使用同一 AUMID，否则 Shell 把它们当成不同应用。
    // 使用构建期产品身份，不依赖用户机器环境；开发态继续保持独立身份。
    app.setAppUserModelId(
      resolveWindowsAppUserModelIdForFlavor(KNORVIA_PRODUCT_FLAVOR, { isPackaged: app.isPackaged }),
    );
  }

  applyAppIcon(iconPath);
  if (!loadedBootstrapLocale) {
    currentApplicationLocale = resolveSystemApplicationLocale();
  }
  if (!desktopProfile.portable)
    installFinderOpenFolderWorkflow({
      platform: process.platform,
      locale: currentApplicationLocale,
      homeDir: app.getPath("home"),
      logger,
    });
  if (!desktopProfile.portable)
    await installWindowsOpenFolderContextMenu({
      platform: process.platform,
      executablePath: process.execPath,
      argv: process.argv,
      isDefaultApp: Boolean(process.defaultApp),
      locale: currentApplicationLocale,
      logger,
    });
  try {
    await applyDesktopChromiumNetworkPolicies(session, bootstrapSettings ?? {}, logger);
  } catch (error) {
    logger.warn("[desktop-network] Chromium network policy bootstrap failed:", error);
  }

  logWindowsBundledRuntimeIntegrityDiagnostic();

  // 启动自动更新检查（后台执行，不阻塞主界面）
  // Preview 身份无论连接哪个后端都不自动更新：stable feed 上只分发正式 Knorvia 安装包，
  // 不向 Preview 渠道提供更新。

  if (process.platform === "darwin" || process.platform === "win32") {
    app.clearRecentDocuments();
  }

  rebuildMenu();
  configureDockMenu(
    () =>
      getDesktopMenuLabelByLocale(
        currentApplicationLocale,
        desktopMenuMessageIds.dockShowCurrentWindow,
      ),
    () => showCurrentWindowFromDock(primaryWindowCoordinator),
  );
  createWindowsDesktopTray({
    getLocale: () => currentApplicationLocale,
    showCurrentWindow: () =>
      primaryWindowCoordinator.ensurePrimaryWindow("tray-show-current-window"),
    executeDesktopCommand: executeDesktopCommandForApp,
    quitApp: () => {
      markExplicitQuit("tray-quit");
      app.quit();
    },
    logger,
  });

  registerPlatformIpcHandlers({
    checkReleaseUpdate: checkLocalRelease,
    fetchHelpConfig: readHelpConfig,
    logger,
    // CDP-on-guest pivot：renderer `<webview>` dom-ready 上报 guest webContentsId → attach。
    attachBrowserGuest: (key, webContentsId, options) => {
      const result = browserGuestManager.attachGuest(key, webContentsId, options);
      if (result.ok && options?.windowId !== undefined) {
        embeddedBrowserDialogController.bindGuest(key, webContentsId, options.windowId);
      }
      return result;
    },
    updateBrowserGuestViewport: (tabId, viewport, windowId, desktopZoomFactor) =>
      browserGuestManager.updateViewportFromRenderer(tabId, viewport, windowId, desktopZoomFactor),
    reportBrowserScreenshotSurfaceReady: (windowId, senderWebContentsId, payload) => {
      logger.debug("[browser-screenshot-surface] renderer ready", {
        windowId,
        senderWebContentsId,
        requestId: payload.requestId,
        tabId: payload.tabId,
        webContentsId: payload.webContentsId,
        viewport: payload.viewport,
        surfaceScale: payload.surfaceScale,
      });
      browserScreenshotSurfaceCoordinator.handleReady({
        windowId,
        senderWebContentsId,
        payload,
      });
    },
    browserViewResidencyHandlers: {
      detachBrowserGuest: (key, webContentsId, windowId) =>
        browserGuestManager.detachGuestBeforeReplacement(key, webContentsId, windowId),
      closeBrowserTab: (payload) => browserGuestManager.closeTabFromRenderer(payload),
      reportBrowserTabResidency: (payload) => browserGuestManager.reportResidency(payload),
      acknowledgeBrowserTabSuspend: (payload) => browserGuestManager.acknowledgeSuspend(payload),
      ensureBrowserTabResident: (payload) =>
        browserGuestManager.ensureResidentFromRenderer(payload),
      restoreBrowserTabs: (payload) => browserGuestManager.restoreTabs(payload),
    },
    applyApplicationLocale: async (locale) => {
      currentApplicationLocale = locale;
      windowsCuaOperationIndicator.refreshContent();
      rebuildMenu();
      for (const win of getApplicationWindowsExcludingCuaIndicator()) {
        if (!win.isDestroyed()) {
          win.webContents.send(PlatformChannels.ApplicationLocaleChanged, currentApplicationLocale);
        }
      }
      if (!desktopProfile.portable)
        installFinderOpenFolderWorkflow({
          platform: process.platform,
          locale: currentApplicationLocale,
          homeDir: app.getPath("home"),
          logger,
        });
      // Windows Explorer 右键菜单是注册表持久项，renderer 切换语言不会自动刷新。
      // 这里跟 macOS Finder Service 一样在 locale 变化时重写菜单文案，避免继续显示旧语言。
      if (!desktopProfile.portable)
        await installWindowsOpenFolderContextMenu({
          platform: process.platform,
          executablePath: process.execPath,
          argv: process.argv,
          isDefaultApp: Boolean(process.defaultApp),
          locale: currentApplicationLocale,
          logger,
        });
      configureDockMenu(
        () =>
          getDesktopMenuLabelByLocale(
            currentApplicationLocale,
            desktopMenuMessageIds.dockShowCurrentWindow,
          ),
        () => showCurrentWindowFromDock(primaryWindowCoordinator),
      );
    },
    focusWorkspaceInExistingWindow: (path, extra) =>
      focusWorkspaceInExistingWindow(path, windowWorkspaceMap, extra),
    windowWorkspaceMap,
    windowUnreadCountMap,
    resolveSystemLocale: resolveSystemApplicationLocale,
    currentApplicationLocale: () => currentApplicationLocale,
    executeDesktopCommand: executeDesktopCommandForApp,
    syncActiveTaskSession: (windowId, sessionId) =>
      cuaPipFocusRouter.updateActiveSession(windowId, sessionId),
    syncTaskRealtimeWorkspaceKeys: (windowId, workspaceKeys) => {
      const hostId = windowTaskRealtimeHostIdMap.get(windowId);
      if (hostId) {
        taskRealtimeBus.updateHostWorkspaceKeys(hostId, workspaceKeys);
      }
    },
    getDesktopSessionActivity: () => ({
      runningAgentSessionCount: getRunningAgentSessionCount(),
    }),
    syncAppSettings: syncImmediateAppSettings,
    setShortcutRecordingActive,
    deviceMid,
  });

  registerRemoteIpcHandlers({
    logger,
    reportRemoteUsageEvent: reportRemoteUsageEventForRenderer,
    createRemoteWorkspaceSession: remoteSessionManager.createRemoteWorkspaceSession,
    getRemoteConnectionStats: remoteSessionManager.getRemoteConnectionStats,
    disposeRemoteWorkspaceSession: remoteSessionManager.disposeRemoteWorkspaceSession,
    cancelPendingRemoteWorkspaceSessionsForWindow:
      remoteSessionManager.cancelPendingRemoteWorkspaceSessionsForWindow,
    bindRemoteWorkspaceSessionContext: remoteSessionManager.bindRemoteWorkspaceSessionContext,
    confirmRendererAttachmentReady: remoteSessionManager.confirmRendererAttachmentReady,
    isDockerDaemonAvailable,
    listAvailableWSLDistros,
    listAvailableDockerContainers,
    listSSHConfigAliases,
  });

  // 仅保留本地崩溃/稳定性记录，不启动产品遥测或设备扫描定时器。
  registerDesktopStabilityMonitors(logger, crashCapturePaths);

  logger.info("[startup] 创建主窗口");
  await primaryWindowCoordinator.ensurePrimaryWindow("app-ready");

  const primaryWindow = getApplicationWindowsExcludingCuaIndicator()[0];
  if (primaryWindow) {
    scheduleReportPerfAppStartAfterMainViewReady(primaryWindow.webContents, logger);
  }

  // 启动后检测 CPU 架构是否匹配（如 Apple 芯片误装 x64 版本经 Rosetta 转译运行），
  // 命中后异步弹框提示安装原生架构版本，不阻塞主界面。
  void maybeWarnArchitectureMismatch({
    locale: currentApplicationLocale,
    logger,
    parentWindow: getApplicationWindowsExcludingCuaIndicator()[0] ?? null,
    icon: nativeImage.createFromPath(iconPath),
  }).catch((error) => {
    logger.warn("[architecture] 架构检测弹框失败:", error);
  });

  const protocolUrl = extractDeepLinkUrlFromArgs(process.argv);
  if (protocolUrl && startupDeepLinkConsumptionGate.shouldHandleReadyProtocolUrl(protocolUrl)) {
    handleDeepLink(protocolUrl, logger, {
      confirmationCopy: resolveExternalWorkspaceConfirmationCopy(),
      resolveApplicationWindow: () => getApplicationWindowsExcludingCuaIndicator()[0] ?? null,
    });
  }
});

app.on("browser-window-created", (_, win) => {
  const windowWebContentsId = win.webContents.id;
  win.on("closed", () => {
    browserScreenshotSurfaceCoordinator.handleWindowDestroyed(win.id);
    browserGuestManager.closeWindow(win.id);
    windowWorkspaceMap.delete(win.id);
    windowTaskRealtimeHostIdMap.delete(win.id);
    if (windowUnreadCountMap.delete(win.id)) {
      syncApplicationUnreadBadge(windowUnreadCountMap);
    }
    // Electron 进入 closed 回调时，win.webContents 可能已经被销毁。
    // 之前这里现取 win.webContents.id，会在关窗收尾阶段抛出 "Object has been destroyed"。
    // 改为在窗口创建时缓存 webContents id，确保清理目录路由时不再访问已销毁对象。
    clearWorkspaceRoutesForWindow(windowWebContentsId);
    // 录制中关窗/崩溃时 renderer 不会发复位 IPC，这里按发起 webContents 复位录制态，
    // 防止菜单 accelerator 被永久摘除。
    resetShortcutRecordingForWebContents(windowWebContentsId);
  });
  // 渲染进程崩溃但窗口存活时 closed 不会触发，崩溃路径同样按 owner 复位
  // （owner 不匹配时天然幂等）。
  win.webContents.on("render-process-gone", () => {
    resetShortcutRecordingForWebContents(windowWebContentsId);
  });
});
app.on("window-all-closed", () => {
  if (process.platform === "darwin") {
    // macOS: keep app running when all windows are closed
    return;
  }

  app.quit();
});
// before-quit 只设置关闭意图；renderer 可以取消，不能提前销毁 Host 或调度器。
app.on("before-quit", quitLifecycle.beforeQuit);
// Electron 只有在所有窗口允许卸载后才触发此事件，此时才能进行不可逆清理。
app.on("will-quit", (event) => {
  void quitLifecycle.willQuit(event);
});
app.on("activate", () => {
  void primaryWindowCoordinator.ensurePrimaryWindow("app-activate");
});
