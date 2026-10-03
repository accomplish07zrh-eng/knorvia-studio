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
const ready = new Set<number>();
let pending: { path: string; targetWebContentsId?: number } | null = null;
function focus(window: BrowserWindow): void {
  if (window.isMinimized()) window.restore();
  if (!window.isVisible()) window.show();
  if (process.platform === "darwin") app.show();
  window.focus();
}
export function isNetworkWorkspacePath(path: string): boolean {
  const normalized = path.replace(/\//gu, "\\");
  return normalized.startsWith("\\\\") || /^\\\\\?\\UNC\\/iu.test(normalized);
}
export function isValidLocalWorkspaceDirectory(path: string): boolean {
  if (!path || path.includes("\0") || isNetworkWorkspacePath(path) || !isAbsolute(path))
    return false;
  try {
    return statSync(path).isDirectory();
  } catch {
    return false;
  }
}
export function resolveExternalWorkspaceOpenDialogCopy(
  locale: Locale,
): ExternalWorkspaceOpenDialogCopy {
  return locale === "zh-CN"
    ? {
        buttons: ["打开文件夹", "取消"],
        title: "打开外部 Knorvia Studio 链接？",
        message: "是否在 Knorvia Studio 中打开此文件夹？",
        detail: (path) => `${path}\n\n只打开你信任来源的文件夹。项目设置可能影响 agent runtime。`,
      }
    : {
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
  if (!confirmed) logger.warn("[deep-link] 用户取消打开外部链接工作区", { path });
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
  const target = options.resolveApplicationWindow
    ? options.resolveApplicationWindow()
    : (BrowserWindow.getFocusedWindow() ?? BrowserWindow.getAllWindows()[0] ?? null);
  if (target) {
    const id = target.webContents.id;
    if (!ready.has(id)) {
      pending = { path, targetWebContentsId: id };
      focus(target);
      logger.warn("[deep-link] 工作区打开请求命中未就绪窗口，先缓存等待 renderer ready", {
        windowId: id,
        path,
      });
      return true;
    }
    target.webContents.send(PlatformChannels.OpenWorkspacePath, path);
    focus(target);
    logger.info("[deep-link] 工作区打开请求路由成功", { windowId: id, path });
    return true;
  }
  if (!options.allowWithoutReadyWindow) {
    logger.warn("[deep-link] 工作区打开请求暂未命中窗口，已忽略", { path });
    return false;
  }
  pending = { path };
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
  const window = options.resolveApplicationWindow?.() ?? BrowserWindow.getFocusedWindow();
  if (!confirmExternalWorkspaceOpen(path, logger, window, options.confirmationCopy)) return true;
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
  const registered =
    process.defaultApp && process.argv[1]
      ? app.setAsDefaultProtocolClient("knorvia-studio", process.execPath, [
          resolve(process.argv[1]),
        ])
      : app.setAsDefaultProtocolClient("knorvia-studio");
  if (!registered) logger.warn("[deep-link] Knorvia protocol registration failed");
}
export function deliverPendingDeepLink(contents: WebContents): void {
  ready.add(contents.id);
  if (
    pending &&
    (pending.targetWebContentsId == null || pending.targetWebContentsId === contents.id)
  ) {
    contents.send(PlatformChannels.OpenWorkspacePath, pending.path);
    pending = null;
  }
}
export function clearWorkspaceRoutesForWindow(id: number): void {
  ready.delete(id);
  if (pending?.targetWebContentsId === id) pending = null;
}
