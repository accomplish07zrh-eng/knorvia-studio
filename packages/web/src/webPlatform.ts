import type { IPlatformService, RemoteTarget, TaskNotificationPayload } from "@knorvia/shared";
import { playTaskNotificationSound } from "@knorvia/ui";

type Factories = Record<string, () => unknown>;
type PromiseMethods<F extends Factories> = {
  [Key in keyof F]: () => Promise<ReturnType<F[Key]>>;
};

function promiseMethods<F extends Factories>(factories: F): PromiseMethods<F> {
  const entries = Object.entries(factories).map(([name, create]) => [
    name,
    () => Promise.resolve(create()),
  ]);
  return Object.fromEntries(entries) as PromiseMethods<F>;
}

function methods<Keys extends readonly string[], Result>(
  names: Keys,
  invoke: () => Result,
): Record<Keys[number], () => Result> {
  return Object.fromEntries(names.map(name => [name, () => invoke()])) as Record<
    Keys[number],
    () => Result
  >;
}

const subscriptionNames = [
  "onRemoteConnectionLog",
  "onRemoteSessionClosed",
  "onFocusTab",
  "onNewTab",
  "onCloseActiveContextRequest",
  "onOpenBrowserUrl",
  "onNewTask",
  "onOpenWorkspace",
  "onWindowFullscreenChanged",
  "onTaskNotificationClick",
  "onUpdateReady",
  "onUpdateCheckResult",
  "onUpdateStateChanged",
  "onDesktopZoomLevelChanged",
  "onPostUpdateReleaseNotes",
] as const;

const synchronousNames = [
  "notifyRendererReady",
  "syncWindowTabs",
  "syncWindowUnreadCount",
  "syncActiveTaskSession",
] as const;

function unavailable(): { success: false; error: string } {
  return { success: false, error: "Not supported in web mode" };
}

function browserTaskNotification(payload: TaskNotificationPayload): void {
  if (document.hasFocus()) return;
  const NotificationType = window.Notification;
  if (NotificationType === undefined || NotificationType.permission !== "granted") return;
  try {
    new NotificationType(payload.title, { body: payload.body, silent: true });
    void playTaskNotificationSound();
  } catch {
    // 通知失败只影响浏览器提示，不改变已接收任务或打断主流程。
  }
}

function browserDeviceId(): string {
  const nav = globalThis.navigator as Navigator & { platform?: string };
  const platform = nav?.platform ?? "";
  const width = globalThis.screen?.width;
  const height = globalThis.screen?.height;
  const depth = globalThis.screen?.colorDepth;
  return [
    platform,
    width === undefined ? "" : String(width),
    height === undefined ? "" : String(height),
    depth === undefined ? "" : String(depth),
  ].filter(Boolean).join("|");
}

/** Browser capabilities are compiled from factories; each call receives fresh result data. */
export function createWebPlatform(): IPlatformService {
  return {
    canSelectFilePath: false,
    ...methods(subscriptionNames, () => () => {}),
    ...methods(synchronousNames, () => {}),
    ...promiseMethods({
      selectDirectory: () => null,
      selectFile: () => null,
      selectFiles: () => [],
      activateOrSetWorkspace: () => ({ activated: false }),
      isDockerAvailable: () => false,
      listWSLDistros: () => [],
      listDockerContainers: () => [],
      listSSHConfigAliases: () => [],
      loadMcpFromUserDirectory: () => ({ servers: [] }),
      saveMcpToUserDirectory: () => ({
        success: false,
        error: "MCP native directory management requires a desktop attachment",
      }),
      migrateLegacyCommonMcp: () => ({
        servers: {}, totalCount: 0, importedCount: 0, skippedCount: 0,
      }),
      canOpenCommunity: () => false,
      openInFileManager: unavailable,
      openExternalFile: unavailable,
      exportLogs: unavailable,
      captureWindowScreenshot: () => null,
      importChromeBrowserData: () => ({
        success: false,
        cookies: { imported: 0, skipped: 0, failed: 0 },
        localStorage: {
          originsImported: 0, entriesImported: 0, originsSkipped: 0, originsFailed: 0,
        },
        error: "chrome_import_not_supported" as const,
      }),
      clearEmbeddedBrowserData: unavailable,
      getUpdateState: () => ({ kind: "idle", enabled: false } as const),
      getDesktopSessionActivity: () => ({ runningAgentSessionCount: 0 }),
      getDesktopZoomLevel: () => ({ zoomLevel: 0 }),
      getInstalledEditors: () => [],
      openInEditor: unavailable,
    }),
    ...promiseMethods({
      cancelPendingRemoteConnection: () => {},
      disposeRemoteSession: () => {},
      openFeedback: () => {},
      openCommunity: () => {},
      reportTelemetryEvent: () => {},
      reportArmsCustomEvent: () => {},
      downloadUpdate: () => {},
      cancelUpdateDownload: () => {},
      acknowledgePostUpdateReleaseNotes: () => {},
      skipUpdateVersion: () => {},
      quitAndInstallUpdate: () => {},
      executeDesktopCommand: () => {},
      setApplicationLocale: () => {},
      setTitleBarTheme: () => {},
    }),
    getPathForFile: () => null,
    createTempTextAttachment: () =>
      Promise.reject(new Error("Temporary text attachments require a desktop host")),
    connectRemote(options: RemoteTarget) {
      return Promise.resolve({
        success: false,
        error: `Remote connect is not supported in Web mode yet: ${options.kind}`,
      });
    },
    openExternal(url) {
      window.open(url, "_blank", "noopener,noreferrer");
    },
    showTaskNotification: browserTaskNotification,
    getDeviceId: browserDeviceId,
  };
}
