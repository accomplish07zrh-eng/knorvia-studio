// SPDX-License-Identifier: Apache-2.0
// 桌面菜单与托盘文案：主进程不能读 renderer 的 i18n 资源，因此这份表随 Electron 主进程打包。
// 每项按 [消息 id, zh-CN, en-US] 登记，键名供 main 侧引用，id 才是 i18n 通道里的查找键。
import { DEFAULT_LOCALE, type Locale } from "./protocol.js";

const MENU_MESSAGES = {
  file: ["titleBar.menu.file", "文件", "File"],
  edit: ["titleBar.menu.edit", "编辑", "Edit"],
  view: ["titleBar.menu.view", "视图", "View"],
  window: ["titleBar.menu.window", "窗口", "Window"],
  help: ["titleBar.menu.help", "帮助", "Help"],
  fileNewTask: ["titleBar.menu.file.newTask", "新建任务", "New task"],
  fileOpenWorkspace: ["titleBar.menu.file.openWorkspace", "打开工作区", "Open workspace"],
  fileCloseWindow: ["titleBar.menu.file.closeWindow", "关闭窗口", "Close window"],
  editUndo: ["titleBar.menu.edit.undo", "撤销", "Undo"],
  editRedo: ["titleBar.menu.edit.redo", "重做", "Redo"],
  editCut: ["titleBar.menu.edit.cut", "剪切", "Cut"],
  editCopy: ["titleBar.menu.edit.copy", "复制", "Copy"],
  editPaste: ["titleBar.menu.edit.paste", "粘贴", "Paste"],
  editDelete: ["titleBar.menu.edit.delete", "删除", "Delete"],
  editSelectAll: ["titleBar.menu.edit.selectAll", "全选", "Select all"],
  viewToggleFullScreen: ["titleBar.menu.view.toggleFullScreen", "切换全屏", "Toggle full screen"],
  viewActualSize: ["titleBar.menu.view.actualSize", "实际大小", "Actual size"],
  viewZoomIn: ["titleBar.menu.view.zoomIn", "放大", "Zoom in"],
  viewZoomOut: ["titleBar.menu.view.zoomOut", "缩小", "Zoom out"],
  windowMinimize: ["titleBar.menu.window.minimize", "最小化", "Minimize"],
  windowZoom: ["titleBar.menu.window.zoom", "缩放", "Zoom"],
  windowBringAllToFront: [
    "titleBar.menu.window.bringAllToFront",
    "全部置于前台",
    "Bring all to front",
  ],
  appServices: ["titleBar.menu.app.services", "服务", "Services"],
  appHide: ["titleBar.menu.app.hide", "隐藏 {appName}", "Hide {appName}"],
  appHideOthers: ["titleBar.menu.app.hideOthers", "隐藏其他", "Hide others"],
  appShowAll: ["titleBar.menu.app.showAll", "全部显示", "Show all"],
  appQuit: ["titleBar.menu.app.quit", "退出 {appName}", "Quit {appName}"],
  helpAbout: ["titleBar.menu.help.about", "关于 Knorvia Studio", "About Knorvia Studio"],
  helpWhatsNew: ["titleBar.menu.help.whatsNew", "更新日志", "What's new"],
  helpCheckForUpdates: ["titleBar.menu.help.checkForUpdates", "检查更新", "Check for updates"],
  helpToggleDevTools: [
    "titleBar.menu.help.toggleDevTools",
    "切换开发者工具",
    "Toggle developer tools",
  ],
  helpResourceManager: ["titleBar.menu.help.resourceManager", "资源管理器", "Resource manager"],
  helpToggleKnorviaStdioTap: [
    "titleBar.menu.help.toggleKnorviaStdioTap",
    "抓取 Agent stdio 通信",
    "Capture agent stdio traffic",
  ],
  helpKnorviaEndpoint: [
    "titleBar.menu.help.endpoint",
    "Knorvia Studio Endpoint",
    "Knorvia Studio Endpoint",
  ],
  helpKnorviaEndpointProduction: [
    "titleBar.menu.help.endpoint.production",
    "Production（默认）",
    "Production (default)",
  ],
  helpKnorviaEndpointTest: ["titleBar.menu.help.endpoint.test", "Test", "Test"],
  helpKnorviaEndpointCustom: ["titleBar.menu.help.endpoint.custom", "自定义...", "Custom..."],
  helpKnorviaEndpointReset: ["titleBar.menu.help.endpoint.reset", "恢复默认", "Reset to default"],
  helpFeedback: ["titleBar.menu.help.feedback", "问题上报", "Feedback"],
  helpExportLogs: ["titleBar.menu.help.exportLogs", "导出日志", "Export logs"],
  helpClearAllData: ["titleBar.menu.help.clearAllData", "清除所有数据", "Clear all data"],
  helpCheckingForUpdates: [
    "desktopMenu.help.checkingForUpdates",
    "正在检查更新...",
    "Checking for updates...",
  ],
  helpUpdateAvailableVersion: [
    "desktopMenu.help.updateAvailableVersion",
    "发现新版本 {version}",
    "Update available {version}",
  ],
  helpDownloadingUpdateVersion: [
    "desktopMenu.help.downloadingUpdateVersion",
    "正在下载更新 {version}...",
    "Downloading update {version}...",
  ],
  helpDownloadingUpdateProgress: [
    "desktopMenu.help.downloadingUpdateProgress",
    "正在下载更新... {progress}",
    "Downloading update... {progress}",
  ],
  helpRestartToUpdate: [
    "desktopMenu.help.restartToUpdate",
    "重启以更新（{version}）",
    "Restart to update ({version})",
  ],
  dockShowCurrentWindow: ["dock.menu.showCurrentWindow", "显示当前窗口", "Show current window"],
  trayTooltip: ["tray.tooltip", "Knorvia Studio", "Knorvia Studio"],
  trayOpenKnorvia: ["tray.menu.openKnorvia", "打开 Knorvia Studio", "Open Knorvia Studio"],
  trayQuit: ["tray.menu.quit", "退出", "Quit"],
} as const;

type MenuEntry = (typeof MENU_MESSAGES)[keyof typeof MENU_MESSAGES];

type EntryKey = keyof typeof MENU_MESSAGES;

const LOCALE_COLUMN: Record<Locale, 1 | 2> = { "zh-CN": 1, "en-US": 2 };

/** 键名 → 消息 id；main 侧以 `desktopMenuMessageIds.trayQuit` 形式取用。 */
export const desktopMenuMessageIds = Object.fromEntries(
  Object.entries(MENU_MESSAGES).map(([key, entry]) => [key, entry[0]]),
) as { readonly [K in EntryKey]: (typeof MENU_MESSAGES)[K][0] };

export type DesktopMenuMessageId = MenuEntry[0];

type MessageBundle = Record<string, string>;

/** 同一份三元组按 locale 列投影成两张查找表，避免两处手写重复文案。 */
const buildMessages = (column: 1 | 2): MessageBundle =>
  Object.fromEntries(Object.values(MENU_MESSAGES).map((entry) => [entry[0], entry[column]]));

const messagesByLocale: Record<Locale, MessageBundle> = {
  "zh-CN": buildMessages(LOCALE_COLUMN["zh-CN"]),
  "en-US": buildMessages(LOCALE_COLUMN["en-US"]),
};

export const desktopMenuMessages = messagesByLocale as Record<
  Locale,
  Record<DesktopMenuMessageId, string>
>;

const fallbackMessages = (): MessageBundle => buildMessages(LOCALE_COLUMN[DEFAULT_LOCALE]);

/** 未知 locale 回退默认语言；id 由类型保证存在。 */
export function getDesktopMenuMessage(locale: Locale, id: DesktopMenuMessageId): string {
  const bundle = messagesByLocale[locale] ?? fallbackMessages();
  const message = bundle[id];
  return message ?? id;
}

/** `{name}` 占位符按调用方给的 values 逐项替换；未提供 values 时原样返回。 */
export function formatDesktopMenuMessage(
  locale: Locale,
  id: DesktopMenuMessageId,
  values?: Record<string, string | number>,
): string {
  const template = getDesktopMenuMessage(locale, id);
  if (values === undefined) return template;

  let rendered = template;
  for (const [key, value] of Object.entries(values)) {
    rendered = rendered.replaceAll(`{${key}}`, String(value));
  }
  return rendered;
}
