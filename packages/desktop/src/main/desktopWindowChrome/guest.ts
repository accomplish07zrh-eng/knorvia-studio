import {
  app,
  Menu,
  shell,
  type BrowserWindow,
  type ContextMenuParams,
  type Input,
  type MenuItemConstructorOptions,
  type WebContents,
} from "electron";
import {
  DEFAULT_LOCALE,
  desktopMenuMessageIds,
  getDesktopMenuMessage,
  PlatformChannels,
} from "@knorvia/shared";
import type { createBrowserWindow } from "../desktopWindowChrome.js";
type Options = Parameters<typeof createBrowserWindow>[0];
export function bindGuestPopup(options: {
  guestWebContents: WebContents;
  hostWebContents: WebContents;
  resolveBrowserViewOwner?: Options["resolveBrowserViewOwner"];
  logger: Options["logger"];
}): void {
  let modified = false;
  options.guestWebContents.on("before-input-event", (_event, input: Input) => {
    if (input.type === "keyUp") {
      const key = input.key.toLowerCase();
      const code = input.code.toLowerCase();
      if (
        key === "meta" ||
        key === "control" ||
        ["metaleft", "metaright", "controlleft", "controlright"].includes(code)
      ) {
        modified = false;
        return;
      }
    }
    const modifiers = new Set(input.modifiers ?? []);
    modified =
      input.meta === true ||
      input.control === true ||
      modifiers.has("meta") ||
      modifiers.has("command") ||
      modifiers.has("cmd") ||
      modifiers.has("control") ||
      modifiers.has("ctrl");
  });
  options.guestWebContents.setWindowOpenHandler((details) => {
    const { url, disposition } = details;
    let allowed = false;
    try {
      const protocol = new URL(url).protocol;
      allowed = protocol === "http:" || protocol === "https:";
    } catch {
      /* Native URL rejection follows the same deny path. */
    }
    if (!allowed) {
      options.logger.warn(`[browser-pane] blocked unsupported webview popup url: ${url}`);
      return { action: "deny" };
    }
    if (modified || disposition === "background-tab") {
      void shell.openExternal(url).catch((error) =>
        options.logger.warn("[browser-pane] failed to open webview popup externally", {
          error: error instanceof Error ? error.message : String(error),
          url,
        }),
      );
      return { action: "deny" };
    }
    const owner = options.resolveBrowserViewOwner?.(options.guestWebContents.id);
    options.hostWebContents.send(PlatformChannels.OpenBrowserUrl, {
      disposition,
      url,
      ...(owner
        ? {
            workspaceKey: owner.workspaceKey,
            ...(owner.remoteSessionId ? { remoteSessionId: owner.remoteSessionId } : {}),
            sessionId: owner.sessionId,
            browserId: owner.browserId,
            browserGeneration: owner.browserGeneration,
            sourceTabId: owner.tabId,
          }
        : {}),
    });
    return { action: "deny" };
  });
}
export function presentContextMenu(
  win: BrowserWindow,
  params: ContextMenuParams,
  options: Options,
): void {
  const locale = options.currentApplicationLocale?.() ?? DEFAULT_LOCALE;
  const items: MenuItemConstructorOptions[] = params.isEditable
    ? [
        {
          label: getDesktopMenuMessage(locale, desktopMenuMessageIds.editUndo),
          role: "undo",
          enabled: params.editFlags.canUndo,
        },
        {
          label: getDesktopMenuMessage(locale, desktopMenuMessageIds.editRedo),
          role: "redo",
          enabled: params.editFlags.canRedo,
        },
        { type: "separator" },
        {
          label: getDesktopMenuMessage(locale, desktopMenuMessageIds.editCut),
          role: "cut",
          enabled: params.editFlags.canCut,
        },
        {
          label: getDesktopMenuMessage(locale, desktopMenuMessageIds.editCopy),
          role: "copy",
          enabled: params.editFlags.canCopy,
        },
        {
          label: getDesktopMenuMessage(locale, desktopMenuMessageIds.editPaste),
          role: "paste",
          enabled: params.editFlags.canPaste,
        },
        {
          label: getDesktopMenuMessage(locale, desktopMenuMessageIds.editDelete),
          role: "delete",
          enabled: params.editFlags.canDelete,
        },
        { type: "separator" },
        {
          label: getDesktopMenuMessage(locale, desktopMenuMessageIds.editSelectAll),
          role: "selectAll",
          enabled: params.editFlags.canSelectAll,
        },
      ]
    : params.selectionText.trim()
      ? [{ role: "copy", enabled: params.editFlags.canCopy }]
      : [];
  if (!app.isPackaged) {
    if (items.length) items.push({ type: "separator" });
    items.push({
      label: "Inspect Element",
      click: () => win.webContents.inspectElement(params.x, params.y),
    });
  }
  if (!items.length) return;
  Menu.buildFromTemplate(items).popup({ window: win });
}
