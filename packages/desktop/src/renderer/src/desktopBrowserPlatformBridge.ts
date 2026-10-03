import type { IPlatformService } from "@knorvia/shared";
import { RendererPreloadCalls } from "./rendererPreloadCalls.js";

type DesktopBrowserPlatformBridge = Pick<
  IPlatformService,
  | "onBrowserViewReady"
  | "onBrowserViewOperation"
  | "onBrowserViewViewportChanged"
  | "onBrowserViewVisibility"
  | "onBrowserViewCloseTab"
  | "onBrowserViewSuspend"
  | "onBrowserViewRestore"
  | "browserViewAttachGuest"
  | "browserViewDetachGuest"
  | "browserViewCloseTab"
  | "browserViewReportResidency"
  | "browserViewSuspendReady"
  | "browserViewEnsureResident"
  | "browserViewRestoreTabs"
  | "browserViewUpdateViewport"
  | "importChromeBrowserData"
  | "clearEmbeddedBrowserData"
  | "getPathForFile"
  | "saveFile"
  | "printPageToPdf"
>;

const calls = new RendererPreloadCalls();
const resolveFilePath = calls.optional("getPathForFile", 1, () => null);

// Fixed route/fallback data remains the existing browser compatibility contract.
export const desktopBrowserPlatformBridge = {
  getPathForFile: (file) => (file instanceof File ? resolveFilePath(file) : null),
  saveFile: calls.optional("saveFile", 1, () =>
    Promise.resolve({ success: false, error: "not_supported" }),
  ),
  printPageToPdf: calls.capability("printPageToPdf", calls.required("printPageToPdf", 0)),
  onBrowserViewReady: calls.optional("onBrowserViewReady", 1, () => () => {}),
  onBrowserViewOperation: calls.optional("onBrowserViewOperation", 1, () => () => {}),
  onBrowserViewViewportChanged: calls.optional("onBrowserViewViewportChanged", 1, () => () => {}),
  onBrowserViewVisibility: calls.optional("onBrowserViewVisibility", 1, () => () => {}),
  onBrowserViewCloseTab: calls.optional("onBrowserViewCloseTab", 1, () => () => {}),
  onBrowserViewSuspend: calls.optional("onBrowserViewSuspend", 1, () => () => {}),
  onBrowserViewRestore: calls.optional("onBrowserViewRestore", 1, () => () => {}),
  browserViewAttachGuest: calls.optional("browserViewAttachGuest", 1, () =>
    Promise.resolve({ ok: false, reason: "not-found", recoveryRequested: false }),
  ),
  browserViewDetachGuest: calls.optional("browserViewDetachGuest", 1, () => Promise.resolve(false)),
  browserViewCloseTab: calls.optional("browserViewCloseTab", 1, () => Promise.resolve()),
  browserViewReportResidency: calls.optional("browserViewReportResidency", 1, () =>
    Promise.resolve(),
  ),
  browserViewSuspendReady: calls.optional("browserViewSuspendReady", 1, () => Promise.resolve()),
  browserViewEnsureResident: calls.optional("browserViewEnsureResident", 1, () =>
    Promise.resolve(),
  ),
  browserViewRestoreTabs: calls.optional("browserViewRestoreTabs", 1, () => Promise.resolve([])),
  browserViewUpdateViewport: calls.optional("browserViewUpdateViewport", 1, () =>
    Promise.resolve(),
  ),
  importChromeBrowserData: calls.optional("importChromeBrowserData", 1, () =>
    Promise.resolve({
      success: false,
      cookies: { imported: 0, skipped: 0, failed: 0 },
      localStorage: {
        originsImported: 0,
        entriesImported: 0,
        originsSkipped: 0,
        originsFailed: 0,
      },
      error: "chrome_import_not_supported",
    }),
  ),
  clearEmbeddedBrowserData: calls.optional("clearEmbeddedBrowserData", 1, () =>
    Promise.resolve({ success: false, error: "unsupported" }),
  ),
} satisfies DesktopBrowserPlatformBridge;
