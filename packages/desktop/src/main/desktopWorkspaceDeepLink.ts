import { app, BrowserWindow, dialog, type WebContents } from "electron";
import { statSync } from "node:fs";
import { isAbsolute, resolve } from "node:path";
import { PlatformChannels, type Locale } from "@knorvia/shared";
import { extractWorkspaceOpenPath, isWorkspaceOpenUrl } from "./desktopDeepLinkUrl.js";
import { desktopProfile } from "./desktopEarlyDataBaseDirBootstrap.js";

export interface ExternalWorkspaceOpenDialogCopy {
  buttons: [string, string];
  title: string;
  message: string;
  detail: (path: string) => string;
}
const rendererReadyWebContentsIds = new Set<number>();
let pendingOpenWorkspaceRequest: { path: string; targetWebContentsId?: number } | null = null;
function focusDeepLinkTargetWindow(win: BrowserWindow): void {
  if (win.isMinimized()) win.restore();
  if (!win.isVisible()) win.show();
  if (process.platform === "darwin") app.show();
  win.focus();
}
export function isValidLocalWorkspaceDirectory(path: string): boolean {
  if (!path || path.includes("\0") || isNetworkWorkspacePath(path) || !isAbsolute(path)) {
    return false;
  }

  try {
    return statSync(path).isDirectory();
  } catch {
    return false;
  }
}

export function isNetworkWorkspacePath(path: string): boolean {
  // 仅当原路径以 // 或 \\ 开头时规范化后才会以 \\ 开头；
  // 单 / 的 Unix 绝对路径不会被误判为 UNC 网络路径。
  const normalized = path.replace(/\//gu, "\\");
  return normalized.startsWith("\\\\") || /^\\\\\?\\UNC\\/iu.test(normalized);
}

export function resolveExternalWorkspaceOpenDialogCopy(
  locale: Locale,
): ExternalWorkspaceOpenDialogCopy {
  // TODO(i18n): 新增 Locale 时把这里收敛成完整 Record<Locale, ...>，
  // 避免未覆盖语言静默回退英文。
  if (locale === "zh-CN") {
    return {
      buttons: ["打开文件夹", "取消"],
      title: "打开外部 Knorvia Studio 链接？",
      message: "是否在 Knorvia Studio 中打开此文件夹？",
      detail: (path) => `${path}\n\n只打开你信任来源的文件夹。项目设置可能影响 agent runtime。`,
    };
  }

  return {
    buttons: ["Open folder", "Cancel"],
    title: "Open external Knorvia Studio link?",
    message: "Open this folder in Knorvia Studio?",
    detail: (path) =>
      `${path}\n\nOnly open folders from sources you trust. Project settings may affect the agent runtime.`,
  };
}

export function confirmExternalWorkspaceOpen(
  path: string,
  logger: { warn: (...args: unknown[]) => void },
  parentWindow: BrowserWindow | null,
  copy: ExternalWorkspaceOpenDialogCopy = resolveExternalWorkspaceOpenDialogCopy("en-US"),
): boolean {
  const options = {
    type: "warning" as const,
    buttons: copy.buttons,
    defaultId: 1,
    cancelId: 1,
    title: copy.title,
    message: copy.message,
    detail: copy.detail(path),
    noLink: true,
  };
  const response = parentWindow
    ? dialog.showMessageBoxSync(parentWindow, options)
    : dialog.showMessageBoxSync(options);
  const confirmed = response === 0;
  if (!confirmed) {
    logger.warn("[deep-link] 用户取消打开外部链接工作区", { path });
  }
  return confirmed;
}

export function handleOpenWorkspacePath(
  path: string,
  logger: { info: (...args: unknown[]) => void; warn: (...args: unknown[]) => void },
  options: {
    allowWithoutReadyWindow?: boolean;
    resolveApplicationWindow?: () => BrowserWindow | null;
  } = {},
): boolean {
  if (!isValidLocalWorkspaceDirectory(path)) {
    logger.warn("[deep-link] 打开工作区路径无效，已忽略", { path });
    return false;
  }

  const targetWindow = options.resolveApplicationWindow
    ? options.resolveApplicationWindow()
    : (BrowserWindow.getFocusedWindow() ?? BrowserWindow.getAllWindows()[0] ?? null);
  if (targetWindow) {
    const targetWebContentsId = targetWindow.webContents.id;
    if (!rendererReadyWebContentsIds.has(targetWebContentsId)) {
      pendingOpenWorkspaceRequest = {
        path,
        targetWebContentsId,
      };
      focusDeepLinkTargetWindow(targetWindow);
      // 冷启动 argv deep link 会在主窗口创建后、renderer 注册
      // onOpenWorkspacePath 之前到达。此时直接 webContents.send 会丢 IPC，
      // 必须等 renderer 主动上报 ready 后再投递目录路径。
      logger.warn("[deep-link] 工作区打开请求命中未就绪窗口，先缓存等待 renderer ready", {
        windowId: targetWebContentsId,
        path,
      });
      return true;
    }

    targetWindow.webContents.send(PlatformChannels.OpenWorkspacePath, path);
    focusDeepLinkTargetWindow(targetWindow);
    logger.info("[deep-link] 工作区打开请求路由成功", {
      windowId: targetWebContentsId,
      path,
    });
    return true;
  }

  if (!options.allowWithoutReadyWindow) {
    logger.warn("[deep-link] 工作区打开请求暂未命中窗口，已忽略", { path });
    return false;
  }

  pendingOpenWorkspaceRequest = { path };
  logger.warn("[deep-link] 工作区打开请求暂未命中窗口，先缓存等待 renderer ready", { path });
  return false;
}

export function handleDeepLink(
  url: string,
  logger: { info: (...args: unknown[]) => void; warn: (...args: unknown[]) => void },
  options: {
    canOpenWorkspace?: (path: string) => boolean;
    onWorkspaceOpenBlocked?: (path: string) => void;
    resolveApplicationWindow?: () => BrowserWindow | null;
    confirmationCopy?: ExternalWorkspaceOpenDialogCopy;
  } = {},
): boolean {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return false;
  }
  if (!isWorkspaceOpenUrl(parsed)) return false;
  const path = extractWorkspaceOpenPath(parsed);
  if (!path || isNetworkWorkspacePath(path)) return false;
  if (options.canOpenWorkspace && !options.canOpenWorkspace(path)) {
    options.onWorkspaceOpenBlocked?.(path);
    return true;
  }
  const win = options.resolveApplicationWindow?.() ?? BrowserWindow.getFocusedWindow();
  if (!confirmExternalWorkspaceOpen(path, logger, win, options.confirmationCopy)) return true;
  return handleOpenWorkspacePath(path, logger, {
    allowWithoutReadyWindow: true,
    resolveApplicationWindow: options.resolveApplicationWindow,
  });
}
export function registerDeepLinkProtocol(
  logger: { info: (...args: unknown[]) => void; warn: (...args: unknown[]) => void },
  _options: { iconPath?: string } = {},
): void {
  if (desktopProfile.portable) return;
  const scheme = "knorvia-studio";
  const ok =
    process.defaultApp && process.argv[1]
      ? app.setAsDefaultProtocolClient(scheme, process.execPath, [resolve(process.argv[1])])
      : app.setAsDefaultProtocolClient(scheme);
  if (!ok) logger.warn("[deep-link] Knorvia protocol registration failed");
}
export function deliverPendingDeepLink(contents: WebContents): void {
  rendererReadyWebContentsIds.add(contents.id);
  if (
    pendingOpenWorkspaceRequest &&
    (pendingOpenWorkspaceRequest.targetWebContentsId == null ||
      pendingOpenWorkspaceRequest.targetWebContentsId === contents.id)
  ) {
    contents.send(PlatformChannels.OpenWorkspacePath, pendingOpenWorkspaceRequest.path);
    pendingOpenWorkspaceRequest = null;
  }
}
export function clearWorkspaceRoutesForWindow(id: number): void {
  rendererReadyWebContentsIds.delete(id);
  if (pendingOpenWorkspaceRequest?.targetWebContentsId === id) pendingOpenWorkspaceRequest = null;
}
